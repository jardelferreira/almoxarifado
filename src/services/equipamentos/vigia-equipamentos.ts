import { getDB } from "@/db/db";
import { estatisticasEquipamentosRepo } from "@/services/equipamentos/estatisticas-equipamentos";
import { carregarPerfilParaSimulacao } from "@/services/equipamentos/perfis-parametros-custos-repo";
import { compararPrevistoReal } from "@/services/equipamentos/previsto-real-equipamentos";
import { calcularSimulacaoCustos } from "@/services/equipamentos/simulacao-custos";
import type {
  EstatisticaEquipamentoLinha,
  EstatisticasEquipamentosResumo,
  PeriodoEstatisticasEquipamentos,
  PrevistoRealResumo,
  VigiaEquipamentoAlerta,
  VigiaEquipamentoGrupo,
  VigiaEquipamentoPerfilBase,
  VigiaEquipamentoPrioridade,
  VigiaEquipamentosResumo,
} from "@/types";

export const LIMIAR_BAIXA_UTILIZACAO = 0.15;
export const LIMIAR_DESVIO_CUSTO = 0.2;
export const LIMIAR_DESVIO_CONSUMO = 0.2;
export const LIMIAR_AUMENTO_CUSTO = 0.2;
export const MIN_DIAS_MANUTENCAO_PROLONGADA = 7;
export const MIN_MANUTENCOES_RECORRENTES = 2;
export const MAX_ALERTAS_EQUIPAMENTOS = 32;

type OpcoesVigiaEquipamentos = {
  financeiroAtivo?: boolean;
  perfilId?: string;
};

function validarPeriodo(periodo: PeriodoEstatisticasEquipamentos) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodo.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(periodo.fim)) {
    throw new Error("O período do Vigia deve utilizar o formato AAAA-MM-DD.");
  }
  if (periodo.inicio > periodo.fim) throw new Error("A data final não pode ser anterior à data inicial.");
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(6));
}

function diaUtc(data: string): number {
  const [ano = 0, mes = 1, dia = 1] = data.split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function adicionarDias(data: string, quantidade: number): string {
  return new Date(diaUtc(data) + quantidade * 86_400_000).toISOString().slice(0, 10);
}

function diasPeriodo(periodo: PeriodoEstatisticasEquipamentos): number {
  return Math.max(1, Math.round((diaUtc(adicionarDias(periodo.fim, 1)) - diaUtc(periodo.inicio)) / 86_400_000));
}

function periodoAnterior(periodo: PeriodoEstatisticasEquipamentos): PeriodoEstatisticasEquipamentos {
  const dias = diasPeriodo(periodo);
  const fim = adicionarDias(periodo.inicio, -1);
  const inicio = adicionarDias(fim, -(dias - 1));
  return { inicio, fim };
}

function totalMovimentos(item: EstatisticaEquipamentoLinha): number {
  return item.entradas + item.saidas + item.devolucoes + item.transferencias + item.envios_manutencao + item.retornos_manutencao + item.baixas + item.reentradas;
}

function quantil75(valores: number[]): number {
  const positivos = valores.filter((valor) => Number.isFinite(valor) && valor > 0).sort((a, b) => a - b);
  if (!positivos.length) return 0;
  const indice = Math.min(positivos.length - 1, Math.ceil((positivos.length - 1) * 0.75));
  return positivos[indice] ?? 0;
}

function criarAlerta(
  grupo: VigiaEquipamentoGrupo,
  prioridade: VigiaEquipamentoPrioridade,
  titulo: string,
  descricao: string,
  regra: string,
  equipamento?: Pick<EstatisticaEquipamentoLinha, "equipamento_id" | "nome">,
  indicador?: string,
  acaoPrincipal: VigiaEquipamentoAlerta["acao_principal"] = "ESTATISTICAS",
  acaoSecundaria?: VigiaEquipamentoAlerta["acao_secundaria"],
): VigiaEquipamentoAlerta {
  const suffix = equipamento?.equipamento_id ?? "geral";
  const id = `EQUIPAMENTO:${grupo}:${acaoPrincipal}:${suffix}:${titulo}`;
  return {
    id,
    tipo: "EQUIPAMENTO",
    grupo,
    prioridade,
    titulo,
    descricao,
    regra,
    ...(indicador ? { indicador } : {}),
    ...(equipamento ? { equipamento_id: equipamento.equipamento_id, equipamento_nome: equipamento.nome, referencia_id: equipamento.equipamento_id } : {}),
    acao_principal: acaoPrincipal,
    ...(acaoSecundaria ? { acao_secundaria: acaoSecundaria } : {}),
  };
}

function alertasOperacao(
  atual: EstatisticasEquipamentosResumo,
  periodo: PeriodoEstatisticasEquipamentos,
): VigiaEquipamentoAlerta[] {
  const alertas: VigiaEquipamentoAlerta[] = [];
  const dias = diasPeriodo(periodo);
  const limiteUsoProlongado = Math.max(14, dias * 0.75);

  for (const item of atual.por_equipamento) {
    if (item.quantidade_ativa <= 0) continue;
    const movimentos = totalMovimentos(item);

    if (movimentos === 0) {
      alertas.push(criarAlerta(
        "OPERACAO",
        "media",
        "Equipamento sem movimentação",
        `${item.nome} não registrou movimentações na janela de ${dias} dias e permanece com ${item.quantidade_saldo.toLocaleString("pt-BR")} unidade(s) em saldo.`,
        `Nenhuma movimentação registrada entre ${periodo.inicio} e ${periodo.fim}.`,
        item,
        "sem movimentação",
        "ESTATISTICAS",
        "EQUIPAMENTOS",
      ));
    }

    if (item.taxa_utilizacao != null && item.taxa_utilizacao <= LIMIAR_BAIXA_UTILIZACAO && item.quantidade_saldo > 0) {
      alertas.push(criarAlerta(
        "OPERACAO",
        item.taxa_utilizacao === 0 ? "alta" : "media",
        "Baixa utilização do equipamento",
        `${item.nome} apresentou taxa de utilização de ${(item.taxa_utilizacao * 100).toFixed(1).replace(".", ",")}%, com saldo disponível no período.`,
        `Baixa utilização definida como taxa igual ou inferior a ${(LIMIAR_BAIXA_UTILIZACAO * 100).toFixed(0)}%.`,
        item,
        `${(item.taxa_utilizacao * 100).toFixed(1).replace(".", ",")}% de uso`,
        "ESTATISTICAS",
        "EQUIPAMENTOS",
      ));
    }

    if (item.em_uso > 0 && item.dias_com_uso >= limiteUsoProlongado) {
      alertas.push(criarAlerta(
        "OPERACAO",
        item.dias_com_uso >= dias ? "alta" : "media",
        "Apropriação prolongada",
        `${item.nome} permaneceu em uso por ${item.dias_com_uso.toFixed(1).replace(".", ",")} dias-equivalentes na janela e ainda possui unidade(s) em uso.`,
        `Apropriação prolongada considera uso em pelo menos ${limiteUsoProlongado.toFixed(0)} dias-equivalentes na janela atual.`,
        item,
        `${item.dias_com_uso.toFixed(1).replace(".", ",")} d em uso`,
        "ESTATISTICAS",
        "EQUIPAMENTOS",
      ));
    }
  }

  return alertas;
}

function alertasManutencao(atual: EstatisticasEquipamentosResumo): VigiaEquipamentoAlerta[] {
  const alertas: VigiaEquipamentoAlerta[] = [];
  for (const item of atual.por_equipamento) {
    if (item.manutencoes_abertas > 0) {
      alertas.push(criarAlerta(
        "MANUTENCAO",
        item.manutencoes_abertas > 1 ? "alta" : "media",
        "Manutenção ainda aberta",
        `${item.nome} possui ${item.manutencoes_abertas} ocorrência(s) de manutenção aberta(s) no histórico analisado.`,
        "Uma ocorrência aberta exige acompanhamento até o registro do retorno do equipamento.",
        item,
        `${item.manutencoes_abertas} aberta(s)`,
        "ESTATISTICAS",
        "EQUIPAMENTOS",
      ));
    }

    if (item.manutencoes >= MIN_MANUTENCOES_RECORRENTES) {
      alertas.push(criarAlerta(
        "MANUTENCAO",
        item.manutencoes >= 3 ? "alta" : "media",
        "Manutenção recorrente",
        `${item.nome} registrou ${item.manutencoes} ocorrência(s) de manutenção na janela analisada.`,
        `Manutenção recorrente definida como ${MIN_MANUTENCOES_RECORRENTES} ou mais ocorrências no período.`,
        item,
        `${item.manutencoes} ocorrência(s)`,
        "ESTATISTICAS",
      ));
    }

    if (item.dias_em_manutencao >= MIN_DIAS_MANUTENCAO_PROLONGADA) {
      alertas.push(criarAlerta(
        "MANUTENCAO",
        item.dias_em_manutencao >= MIN_DIAS_MANUTENCAO_PROLONGADA * 2 ? "alta" : "media",
        "Manutenção prolongada",
        `${item.nome} acumulou ${item.dias_em_manutencao.toFixed(1).replace(".", ",")} dias-equivalentes em manutenção.`,
        `Manutenção prolongada definida a partir de ${MIN_DIAS_MANUTENCAO_PROLONGADA} dias-equivalentes no período.`,
        item,
        `${item.dias_em_manutencao.toFixed(1).replace(".", ",")} d`,
        "ESTATISTICAS",
      ));
    }
  }
  return alertas;
}

function alertasFinanceiros(
  atual: EstatisticasEquipamentosResumo,
  anterior: EstatisticasEquipamentosResumo,
): VigiaEquipamentoAlerta[] {
  const alertas: VigiaEquipamentoAlerta[] = [];
  const valores = atual.por_equipamento.map((item) => item.valor_referencia);
  const custos = atual.por_equipamento.map((item) => item.custo_total);
  const manutencoes = atual.por_equipamento.map((item) => item.custo_manutencao);
  const recorrencias = atual.por_equipamento.map((item) => item.custo_recorrente);
  const limiteValor = quantil75(valores);
  const limiteCusto = quantil75(custos);
  const limiteManutencao = quantil75(manutencoes);
  const limiteRecorrencia = quantil75(recorrencias);
  const valorTotal = valores.reduce((total, valor) => total + valor, 0);
  const anteriorPorId = new Map(anterior.por_equipamento.map((item) => [item.equipamento_id, item]));

  for (const item of atual.por_equipamento) {
    const anteriorItem = anteriorPorId.get(item.equipamento_id);

    if (anteriorItem && anteriorItem.custo_total > 0 && item.custo_total > anteriorItem.custo_total) {
      const aumento = (item.custo_total - anteriorItem.custo_total) / anteriorItem.custo_total;
      if (aumento >= LIMIAR_AUMENTO_CUSTO) {
        alertas.push(criarAlerta(
          "FINANCEIRO",
          aumento >= 0.5 ? "alta" : "media",
          "Aumento relevante de custo",
          `${item.nome} passou de R$ ${anteriorItem.custo_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} para R$ ${item.custo_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, considerando duas janelas de mesma duração.`,
          `Aumento relevante definido como crescimento igual ou superior a ${(LIMIAR_AUMENTO_CUSTO * 100).toFixed(0)}% em relação à janela anterior.`,
          item,
          `+${(aumento * 100).toFixed(1).replace(".", ",")}%`,
          "ESTATISTICAS",
        ));
      }
    }

    if (limiteValor > 0 && item.valor_referencia >= limiteValor && item.quantidade_saldo > 0 && (item.taxa_utilizacao ?? 0) <= LIMIAR_BAIXA_UTILIZACAO) {
      alertas.push(criarAlerta(
        "FINANCEIRO",
        item.taxa_utilizacao === 0 ? "alta" : "media",
        "Alto valor com baixa utilização",
        `${item.nome} está entre os valores de referência mais altos do parque e apresentou taxa de utilização de ${(item.taxa_utilizacao == null ? 0 : item.taxa_utilizacao * 100).toFixed(1).replace(".", ",")}%.`,
        "Alto valor é identificado a partir do quartil superior dos valores de referência não nulos; baixa utilização é taxa igual ou inferior a 15%.",
        item,
        `R$ ${item.valor_referencia.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "ESTATISTICAS",
      ));
    }

    if (limiteCusto > 0 && item.custo_total >= limiteCusto && item.custo_total > 0) {
      alertas.push(criarAlerta(
        "FINANCEIRO",
        item.custo_total > limiteCusto * 1.5 ? "alta" : "media",
        "Custo efetivo elevado",
        `${item.nome} ficou entre os maiores custos efetivos do parque, com R$ ${item.custo_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} no período.`,
        "Custo elevado é identificado pelo quartil superior dos custos efetivos positivos observados na janela.",
        item,
        `R$ ${item.custo_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "ESTATISTICAS",
      ));
    }

    if (limiteManutencao > 0 && item.custo_manutencao >= limiteManutencao && item.custo_manutencao > 0) {
      alertas.push(criarAlerta(
        "FINANCEIRO",
        item.custo_manutencao > limiteManutencao * 1.5 ? "alta" : "media",
        "Custo de manutenção elevado",
        `${item.nome} concentrou R$ ${item.custo_manutencao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em custos de manutenção no período.`,
        "Custo de manutenção elevado é identificado pelo quartil superior dos custos de manutenção positivos observados na janela.",
        item,
        `R$ ${item.custo_manutencao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "ESTATISTICAS",
      ));
    }

    if (limiteRecorrencia > 0 && item.custo_recorrente >= limiteRecorrencia && item.custo_recorrente > 0) {
      alertas.push(criarAlerta(
        "FINANCEIRO",
        item.custo_recorrente > limiteRecorrencia * 1.5 ? "alta" : "media",
        "Custo recorrente elevado",
        `${item.nome} acumulou R$ ${item.custo_recorrente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em custos recorrentes na janela.`,
        "Custo recorrente elevado é identificado pelo quartil superior dos custos recorrentes positivos observados na janela.",
        item,
        `R$ ${item.custo_recorrente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        "ESTATISTICAS",
      ));
    }

    if (valorTotal > 0 && item.valor_referencia / valorTotal >= 0.25) {
      alertas.push(criarAlerta(
        "FINANCEIRO",
        item.valor_referencia / valorTotal >= 0.5 ? "alta" : "media",
        "Concentração relevante de valor",
        `${item.nome} representa ${(item.valor_referencia / valorTotal * 100).toFixed(1).replace(".", ",")}% do valor de referência do parque analisado.`,
        "Concentração relevante definida como participação igual ou superior a 25% do valor de referência ativo do parque.",
        item,
        `${(item.valor_referencia / valorTotal * 100).toFixed(1).replace(".", ",")}% do parque`,
        "ESTATISTICAS",
      ));
    }
  }

  return alertas;
}

function alertasConsumo(atual: EstatisticasEquipamentosResumo): VigiaEquipamentoAlerta[] {
  const alertas: VigiaEquipamentoAlerta[] = [];
  for (const item of atual.por_equipamento) {
    if (item.consumos_sem_custo > 0) {
      alertas.push(criarAlerta(
        "CONSUMO",
        item.consumos_sem_custo >= 2 ? "alta" : "media",
        "Consumo sem custo registrado",
        `${item.nome} possui ${item.consumos_sem_custo} consumo(s) apropriado(s) sem custo monetário de origem.`,
        "Um consumo sem custo não pode sustentar uma comparação financeira completa.",
        item,
        `${item.consumos_sem_custo} sem custo`,
        "ESTATISTICAS",
      ));
    }

    if (item.quantidade_consumida > 0 && item.cadastros_fisicos > 0 && item.manutencoes === 0 && item.em_uso === 0) {
      alertas.push(criarAlerta(
        "CONSUMO",
        "info",
        "Consumo sem uso atual registrado",
        `${item.nome} teve ${item.quantidade_consumida.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} unidade(s) consumida(s) no período, mas não possui unidade atualmente em uso.`,
        "Sinal descritivo: consumo apropriado no período combinado com estado atual sem unidade em uso.",
        item,
        `${item.quantidade_consumida.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} consumida(s)`,
        "ESTATISTICAS",
      ));
    }
  }
  return alertas;
}

function alertasQualidade(
  atual: EstatisticasEquipamentosResumo,
  avisosPerfil: string[],
  regrasSemAderencia: number,
  apropriacoesSemManutencao: number,
): VigiaEquipamentoAlerta[] {
  const alertas: VigiaEquipamentoAlerta[] = [];

  if (atual.equipamentos_sem_valor > 0) {
    alertas.push(criarAlerta(
      "QUALIDADE",
      "media",
      "Equipamentos sem valor de referência",
      `${atual.equipamentos_sem_valor} equipamento(s) ativo(s) não possuem valor de referência suficiente para análises financeiras completas.`,
      "Valor de referência ausente na origem financeira do equipamento/estoque.",
      undefined,
      `${atual.equipamentos_sem_valor} sem valor`,
      "ESTATISTICAS",
    ));
  }

  if (atual.consumos_sem_custo > 0) {
    alertas.push(criarAlerta(
      "QUALIDADE",
      atual.consumos_sem_custo >= 2 ? "alta" : "media",
      "Dados financeiros incompletos em consumos",
      `${atual.consumos_sem_custo} consumo(s) de equipamento não possuem custo monetário disponível para a leitura financeira.`,
      "Consumos sem custo permanecem válidos operacionalmente, mas não sustentam uma apropriação financeira completa.",
      undefined,
      `${atual.consumos_sem_custo} sem custo`,
      "ESTATISTICAS",
    ));
  }

  if (apropriacoesSemManutencao > 0) {
    alertas.push(criarAlerta(
      "QUALIDADE",
      "info",
      "Apropriações financeiras sem manutenção vinculada",
      `${apropriacoesSemManutencao} apropriação(ões) financeira(s) do período não possuem uma ocorrência de manutenção associada.`,
      "O vínculo de manutenção é opcional no modelo; o Vigia sinaliza apenas para conferência de rastreabilidade.",
      undefined,
      `${apropriacoesSemManutencao} ocorrência(s)`,
      "ESTATISTICAS",
    ));
  }

  if (regrasSemAderencia > 0) {
    alertas.push(criarAlerta(
      "QUALIDADE",
      "media",
      "Regras de consumo sem aderência ao cenário",
      `${regrasSemAderencia} regra(s) de consumo do perfil selecionado não puderam ser aplicadas ao direcionador da simulação.`,
      "A regra é ignorada quando o direcionador configurado não coincide com o direcionador do cenário.",
      undefined,
      `${regrasSemAderencia} regra(s)`,
      "PERFIS",
    ));
  }

  if (avisosPerfil.length) {
    alertas.push(criarAlerta(
      "QUALIDADE",
      "media",
      "Perfil com correspondências incompletas",
      avisosPerfil.slice(0, 2).join(" "),
      "O perfil de parâmetros precisa encontrar correspondência única para equipamentos e produtos no projeto atual.",
      undefined,
      `${avisosPerfil.length} aviso(s)`,
      "PERFIS",
    ));
  }

  return alertas;
}

function alertasDaComparacao(comparacao: PrevistoRealResumo): VigiaEquipamentoAlerta[] {
  const alertas: VigiaEquipamentoAlerta[] = [];
  for (const item of comparacao.equipamentos) {
    const equipamento = { equipamento_id: item.equipamento_id, nome: item.nome } as const;

    if (item.total.previsto > 0 && item.total.diferenca / item.total.previsto >= LIMIAR_DESVIO_CUSTO) {
      alertas.push(criarAlerta(
        "FINANCEIRO",
        item.total.diferenca / item.total.previsto >= 0.5 ? "alta" : "media",
        "Custo acima do parâmetro",
        `${item.nome} realizou R$ ${item.total.real.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, contra R$ ${item.total.previsto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} previstos pelo perfil ${comparacao.perfil_nome}.`,
        `Desvio financeiro relevante definido como resultado igual ou superior a ${(LIMIAR_DESVIO_CUSTO * 100).toFixed(0)}% acima do previsto.`,
        equipamento,
        `+${((item.total.diferenca / item.total.previsto) * 100).toFixed(1).replace(".", ",")}%`,
        "PREVISTO_REAL",
        "ESTATISTICAS",
      ));
    }

    if (item.consumo.previsto > 0 && item.consumo.diferenca / item.consumo.previsto >= LIMIAR_DESVIO_CONSUMO) {
      alertas.push(criarAlerta(
        "CONSUMO",
        item.consumo.diferenca / item.consumo.previsto >= 0.5 ? "alta" : "media",
        "Consumo acima do parâmetro",
        `${item.nome} consumiu ${item.consumo.real.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}, contra ${item.consumo.previsto.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} previstos pelo perfil ${comparacao.perfil_nome}.`,
        `Desvio de consumo relevante definido como resultado igual ou superior a ${(LIMIAR_DESVIO_CONSUMO * 100).toFixed(0)}% acima do previsto.`,
        equipamento,
        `+${((item.consumo.diferenca / item.consumo.previsto) * 100).toFixed(1).replace(".", ",")}%`,
        "PREVISTO_REAL",
        "ESTATISTICAS",
      ));
    }

    if (item.manutencao.previsto > 0 && item.manutencao.diferenca / item.manutencao.previsto >= LIMIAR_DESVIO_CUSTO) {
      alertas.push(criarAlerta(
        "MANUTENCAO",
        item.manutencao.diferenca / item.manutencao.previsto >= 0.5 ? "alta" : "media",
        "Manutenção acima do parâmetro",
        `${item.nome} realizou R$ ${item.manutencao.real.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, contra R$ ${item.manutencao.previsto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} previstos.`,
        `Desvio de manutenção relevante definido como resultado igual ou superior a ${(LIMIAR_DESVIO_CUSTO * 100).toFixed(0)}% acima do previsto.`,
        equipamento,
        `+${((item.manutencao.diferenca / item.manutencao.previsto) * 100).toFixed(1).replace(".", ",")}%`,
        "PREVISTO_REAL",
      ));
    }
  }

  return alertas;
}

async function quantidadeApropriacoesSemManutencao(
  projetoId: string,
  periodo: PeriodoEstatisticasEquipamentos,
): Promise<number> {
  const rows = await getDB().apropriacoes_financeiras_equipamentos
    .where("projeto_id")
    .equals(projetoId)
    .toArray();
  return rows.filter((row) => {
    const data = row.criado_em.slice(0, 10);
    return data >= periodo.inicio && data <= periodo.fim && !row.manutencao_id;
  }).length;
}

function ordenarAlertas(alertas: VigiaEquipamentoAlerta[]): VigiaEquipamentoAlerta[] {
  const peso = { alta: 3, media: 2, info: 1 } as const;
  return [...alertas]
    .sort((a, b) => peso[b.prioridade] - peso[a.prioridade] || a.grupo.localeCompare(b.grupo) || a.titulo.localeCompare(b.titulo, "pt-BR"))
    .slice(0, MAX_ALERTAS_EQUIPAMENTOS);
}

function agrupar(alertas: VigiaEquipamentoAlerta[]): Record<VigiaEquipamentoGrupo, number> {
  return alertas.reduce<Record<VigiaEquipamentoGrupo, number>>((acc, alerta) => {
    acc[alerta.grupo] = (acc[alerta.grupo] ?? 0) + 1;
    return acc;
  }, { OPERACAO: 0, MANUTENCAO: 0, FINANCEIRO: 0, CONSUMO: 0, QUALIDADE: 0 });
}

export async function calcularVigiaEquipamentos(
  projetoId: string,
  periodo: PeriodoEstatisticasEquipamentos,
  opcoes: OpcoesVigiaEquipamentos = {},
): Promise<VigiaEquipamentosResumo> {
  validarPeriodo(periodo);

  const financeiroAtivo = opcoes.financeiroAtivo === true;
  const periodoAnteriorCalculado = periodoAnterior(periodo);
  const [atual, anterior, apropriacoesSemManutencao] = await Promise.all([
    estatisticasEquipamentosRepo.calcular(projetoId, periodo),
    estatisticasEquipamentosRepo.calcular(projetoId, periodoAnteriorCalculado),
    financeiroAtivo ? quantidadeApropriacoesSemManutencao(projetoId, periodo) : Promise.resolve(0),
  ]);

  const alertas = [
    ...alertasOperacao(atual, periodo),
    ...alertasManutencao(atual),
    ...(financeiroAtivo ? alertasFinanceiros(atual, anterior) : []),
    ...alertasConsumo(atual),
  ];

  let perfilBase: VigiaEquipamentoPerfilBase | undefined;
  let avisosPerfil: string[] = [];
  let regrasSemAderencia = 0;

  if (financeiroAtivo && opcoes.perfilId) {
    const carregado = await carregarPerfilParaSimulacao(projetoId, opcoes.perfilId);
    perfilBase = {
      id: carregado.perfil.id,
      nome: carregado.perfil.nome,
      versao: carregado.perfil.versao,
    };
    avisosPerfil = carregado.avisos;

    const simulacao = await calcularSimulacaoCustos(projetoId, {
      inicio: periodo.inicio,
      fim: periodo.fim,
      equipamentos: carregado.equipamentos,
      precosManuais: carregado.precosManuais,
    });
    regrasSemAderencia = simulacao.regras_sem_aderencia;

    const comparacao = await compararPrevistoReal(projetoId, {
      inicio: periodo.inicio,
      fim: periodo.fim,
      simulacao,
      perfilId: carregado.perfil.id,
      perfilNome: carregado.perfil.nome,
      perfilVersao: carregado.perfil.versao,
    });

    alertas.push(...alertasDaComparacao(comparacao));
  }

  alertas.push(...alertasQualidade(atual, avisosPerfil, regrasSemAderencia, apropriacoesSemManutencao));

  const ordenados = ordenarAlertas(alertas);
  const alertasPorGrupo = agrupar(ordenados);

  return {
    projeto_id: projetoId,
    periodo,
    alertas: ordenados,
    alertasPorGrupo,
    altas: ordenados.filter((item) => item.prioridade === "alta").length,
    medias: ordenados.filter((item) => item.prioridade === "media").length,
    informativas: ordenados.filter((item) => item.prioridade === "info").length,
    ...(perfilBase ? { perfil_base: perfilBase } : {}),
    qualidade: [
      ...avisosPerfil,
      ...(atual.equipamentos_sem_valor > 0 ? [`${atual.equipamentos_sem_valor} equipamento(s) sem valor de referência.`] : []),
      ...(atual.consumos_sem_custo > 0 ? [`${atual.consumos_sem_custo} consumo(s) sem custo.`] : []),
    ],
  };
}
