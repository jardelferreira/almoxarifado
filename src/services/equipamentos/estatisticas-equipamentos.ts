import { getDB } from "@/db/db";
import { custosEfetivosEquipamentosRepo } from "@/services/equipamentos/custos-efetivos";
import { estadoEquipamentosRepo } from "@/services/equipamentos/estado-repo";
import type {
  Equipamento,
  EquipamentoVinculo,
  EstoqueEquipamento,
  EstatisticaEquipamentoLinha,
  EstatisticasEquipamentosResumo,
  MovimentacaoEquipamento,
  MovimentacaoEquipamentoTipo,
  PeriodoEstatisticasEquipamentos,
} from "@/types";

const TIPOS_MOVIMENTACAO: readonly MovimentacaoEquipamentoTipo[] = [
  "ENTRADA",
  "SAIDA",
  "DEVOLUCAO",
  "TRANSFERENCIA",
  "SINALIZAR_MANUTENCAO",
  "ENVIO",
  "RETORNO_MANUTENCAO",
  "DEVOLUCAO_FORNECEDOR",
  "BAIXA",
  "REENTRADA",
  "MANUTENCAO",
  "RETIRADA_MANUTENCAO",
];

const VINCULOS: readonly EquipamentoVinculo[] = ["PROPRIO", "ALUGADO", "EMPRESTIMO"];

function validarPeriodo(periodo: PeriodoEstatisticasEquipamentos): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodo.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(periodo.fim)) {
    throw new Error("O período deve utilizar o formato AAAA-MM-DD.");
  }
  if (periodo.inicio > periodo.fim) {
    throw new Error("A data final não pode ser anterior à data inicial.");
  }
}

function normalizarDia(valor: string): string {
  return valor.slice(0, 10);
}

function diaUtc(dia: string): number {
  const [ano = 0, mes = 1, diaNumero = 1] = dia.split("-").map(Number);
  return Date.UTC(ano, mes - 1, diaNumero);
}

function diferencaDias(inicio: string, fimExclusivo: string): number {
  return Math.max(0, (diaUtc(fimExclusivo) - diaUtc(inicio)) / 86_400_000);
}

function adicionarDias(dia: string, quantidade: number): string {
  return new Date(diaUtc(dia) + quantidade * 86_400_000).toISOString().slice(0, 10);
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(6));
}

function vazioMovimentacoes(): Record<MovimentacaoEquipamentoTipo, number> {
  return Object.fromEntries(TIPOS_MOVIMENTACAO.map((tipo) => [tipo, 0])) as Record<MovimentacaoEquipamentoTipo, number>;
}

function vazioVinculos(): Record<EquipamentoVinculo, number> {
  return Object.fromEntries(VINCULOS.map((vinculo) => [vinculo, 0])) as Record<EquipamentoVinculo, number>;
}

function deltaEstado(
  movimentacao: MovimentacaoEquipamento,
  almoxarifadoId: string,
  manutencaoId: string,
): {
  almoxarifado: number;
  uso: number;
  manutencao: number;
  foraEmpresa: number;
} {
  const quantidade = movimentacao.quantidade;

  switch (movimentacao.tipo) {
    case "ENTRADA":
    case "REENTRADA":
      return { almoxarifado: quantidade, uso: 0, manutencao: 0, foraEmpresa: 0 };

    case "SAIDA":
      return { almoxarifado: -quantidade, uso: quantidade, manutencao: 0, foraEmpresa: 0 };

    case "DEVOLUCAO":
      return { almoxarifado: quantidade, uso: -quantidade, manutencao: 0, foraEmpresa: 0 };

    case "TRANSFERENCIA":
      return { almoxarifado: 0, uso: 0, manutencao: 0, foraEmpresa: 0 };

    case "SINALIZAR_MANUTENCAO":
    case "MANUTENCAO":
      if (movimentacao.tipo_origem === "FUNCIONARIO") {
        return { almoxarifado: 0, uso: -quantidade, manutencao: quantidade, foraEmpresa: 0 };
      }
      if (movimentacao.tipo_origem === "EQUIPE" && movimentacao.origem_id === almoxarifadoId) {
        return { almoxarifado: -quantidade, uso: 0, manutencao: quantidade, foraEmpresa: 0 };
      }
      return { almoxarifado: 0, uso: 0, manutencao: 0, foraEmpresa: 0 };

    case "ENVIO":
      if (movimentacao.tipo_origem === "FUNCIONARIO") {
        return {
          almoxarifado: 0,
          uso: -quantidade,
          manutencao: quantidade,
          foraEmpresa: movimentacao.tipo_destino === "EMPRESA" ? quantidade : 0,
        };
      }
      if (movimentacao.tipo_origem === "EQUIPE" && movimentacao.origem_id === almoxarifadoId) {
        return {
          almoxarifado: -quantidade,
          uso: 0,
          manutencao: quantidade,
          foraEmpresa: movimentacao.tipo_destino === "EMPRESA" ? quantidade : 0,
        };
      }
      if (movimentacao.tipo_origem === "EQUIPE" && movimentacao.origem_id === manutencaoId) {
        return {
          almoxarifado: 0,
          uso: 0,
          manutencao: 0,
          foraEmpresa: movimentacao.tipo_destino === "EMPRESA" ? quantidade : 0,
        };
      }
      return { almoxarifado: 0, uso: 0, manutencao: 0, foraEmpresa: 0 };

    case "RETIRADA_MANUTENCAO":
      if (movimentacao.tipo_origem === "EQUIPE" && movimentacao.origem_id === manutencaoId) {
        return {
          almoxarifado: 0,
          uso: 0,
          manutencao: 0,
          foraEmpresa: quantidade,
        };
      }
      if (movimentacao.tipo_origem === "EQUIPE" && movimentacao.origem_id === almoxarifadoId) {
        return {
          almoxarifado: -quantidade,
          uso: 0,
          manutencao: quantidade,
          foraEmpresa: quantidade,
        };
      }
      return { almoxarifado: 0, uso: 0, manutencao: 0, foraEmpresa: 0 };

    case "RETORNO_MANUTENCAO":
      if (movimentacao.tipo_origem === "EMPRESA") {
        return { almoxarifado: quantidade, uso: 0, manutencao: -quantidade, foraEmpresa: -quantidade };
      }
      return { almoxarifado: quantidade, uso: 0, manutencao: -quantidade, foraEmpresa: 0 };

    case "DEVOLUCAO_FORNECEDOR":
    case "BAIXA":
      if (movimentacao.tipo_origem === "FUNCIONARIO") {
        return { almoxarifado: 0, uso: -quantidade, manutencao: 0, foraEmpresa: quantidade };
      }
      if (movimentacao.tipo_origem === "EQUIPE" && movimentacao.origem_id === manutencaoId) {
        return { almoxarifado: 0, uso: 0, manutencao: -quantidade, foraEmpresa: quantidade };
      }
      if (movimentacao.tipo_origem === "EQUIPE" && movimentacao.origem_id === almoxarifadoId) {
        return { almoxarifado: -quantidade, uso: 0, manutencao: 0, foraEmpresa: quantidade };
      }
      return { almoxarifado: 0, uso: 0, manutencao: 0, foraEmpresa: quantidade };

    default:
      return { almoxarifado: 0, uso: 0, manutencao: 0, foraEmpresa: 0 };
  }
}



function usoPorPeriodo(
  estoque: EstoqueEquipamento,
  movimentacoes: MovimentacaoEquipamento[],
  periodo: PeriodoEstatisticasEquipamentos,
  almoxarifadoId: string,
  manutencaoId: string,
): {
  diasComUso: number;
  diasEmManutencao: number;
  diasDisponivel: number;
  taxa: number | null;
} {
  const inicio = periodo.inicio;
  const fimExclusivo = adicionarDias(periodo.fim, 1);
  const dataEntrada = normalizarDia(estoque.data_entrada);
  let cursor = dataEntrada > inicio ? dataEntrada : inicio;

  if (cursor >= fimExclusivo) {
    return { diasComUso: 0, diasEmManutencao: 0, diasDisponivel: 0, taxa: null };
  }

  const relevantes = [...movimentacoes]
    .filter((movimento) => normalizarDia(movimento.data) <= periodo.fim)
    .sort((a, b) => `${normalizarDia(a.data)}|${a.criado_em}|${a.id}`.localeCompare(`${normalizarDia(b.data)}|${b.criado_em}|${b.id}`));

  const possuiEntradaNaDataEntrada = relevantes.some(
    (movimento) => normalizarDia(movimento.data) === dataEntrada && movementIsEntry(movimento),
  );

  let almoxarifado = possuiEntradaNaDataEntrada ? 0 : Math.max(0, estoque.quantidade);
  let uso = 0;
  let manutencao = 0;

  for (const movimento of relevantes) {
    const data = normalizarDia(movimento.data);
    if (data < dataEntrada) continue;
    if (data >= inicio) break;

    const delta = deltaEstado(movimento, almoxarifadoId, manutencaoId);
    almoxarifado = Math.max(0, almoxarifado + delta.almoxarifado);
    uso = Math.max(0, uso + delta.uso);
    manutencao = Math.max(0, manutencao + delta.manutencao);
  }

  let usoUnitDays = 0;
  let manutencaoUnitDays = 0;
  let disponivelUnitDays = 0;

  for (const movimento of relevantes) {
    const data = normalizarDia(movimento.data);
    if (data < cursor) continue;
    if (data >= fimExclusivo) break;

    if (data > cursor) {
      const dias = diferencaDias(cursor, data);
      usoUnitDays += uso * dias;
      manutencaoUnitDays += manutencao * dias;
      disponivelUnitDays += almoxarifado * dias;
    }

    const delta = deltaEstado(movimento, almoxarifadoId, manutencaoId);
    almoxarifado = Math.max(0, almoxarifado + delta.almoxarifado);
    uso = Math.max(0, uso + delta.uso);
    manutencao = Math.max(0, manutencao + delta.manutencao);
    cursor = data;
  }

  if (cursor < fimExclusivo) {
    const dias = diferencaDias(cursor, fimExclusivo);
    usoUnitDays += uso * dias;
    manutencaoUnitDays += manutencao * dias;
    disponivelUnitDays += almoxarifado * dias;
  }

  const totalUnitDays = usoUnitDays + manutencaoUnitDays + disponivelUnitDays;

  return {
    diasComUso: arredondar(usoUnitDays),
    diasEmManutencao: arredondar(manutencaoUnitDays),
    diasDisponivel: arredondar(disponivelUnitDays),
    taxa: totalUnitDays > 0 ? arredondar(usoUnitDays / totalUnitDays) : null,
  };
}

function movementIsEntry(movimentacao: MovimentacaoEquipamento): boolean {
  return movimentacao.tipo === "ENTRADA" || movimentacao.tipo === "REENTRADA";
}

function agruparMovimentacoes(movimentacoes: MovimentacaoEquipamento[], periodo: PeriodoEstatisticasEquipamentos) {
  const mapa = vazioMovimentacoes();
  for (const movimento of movimentacoes) {
    const data = normalizarDia(movimento.data);
    if (data < periodo.inicio || data > periodo.fim) continue;
    mapa[movimento.tipo] += 1;
  }
  return mapa;
}

function contarConcluidasManutencoes(manutencoes: Array<{ status_operacional?: string }>): number {
  return manutencoes.filter((item) => item.status_operacional === "CONCLUIDA").length;
}

function manutencaoAtingePeriodo(
  item: { data_abertura?: string | null; data_retorno?: string | null; data_conclusao?: string | null },
  periodo: PeriodoEstatisticasEquipamentos,
): boolean {
  const abertura = item.data_abertura ? normalizarDia(item.data_abertura) : null;
  const encerramento = item.data_conclusao ?? item.data_retorno;
  const fim = encerramento ? normalizarDia(encerramento) : periodo.fim;
  if (!abertura) return false;
  return abertura <= periodo.fim && fim >= periodo.inicio;
}

function calcularDuracaoMediaManutencoes(
  manutencoes: Array<{ data_envio?: string | null; data_retorno?: string | null }>,
): number | null {
  const duracoes = manutencoes
    .filter((item) => item.data_envio && item.data_retorno)
    .map((item) => diferencaDias(normalizarDia(item.data_envio!), adicionarDias(normalizarDia(item.data_retorno!), 1)))
    .filter((dias) => dias >= 0);
  if (!duracoes.length) return null;
  return arredondar(duracoes.reduce((total, dias) => total + dias, 0) / duracoes.length);
}

async function obterEstadoAtual(
  projetoId: string,
  estoque: EstoqueEquipamento,
): Promise<Awaited<ReturnType<typeof estadoEquipamentosRepo.calcular>>> {
  return estadoEquipamentosRepo.calcular(projetoId, estoque.id);
}

export const estatisticasEquipamentosRepo = {
  async calcular(
    projetoId: string,
    periodo: PeriodoEstatisticasEquipamentos,
  ): Promise<EstatisticasEquipamentosResumo> {
    validarPeriodo(periodo);
    const db = getDB();

    const [equipamentos, estoques, movimentacoes, manutencoes, custos, equipes] = await Promise.all([
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.movimentacoes_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.manutencoes_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      custosEfetivosEquipamentosRepo.calcularPorProjeto(projetoId, periodo),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
    ]);

    const custosPorEquipamento = new Map(custos.map((item) => [item.equipamento_id, item]));
    const almoxarifado = equipes.find((item) => item.nome.trim().toLowerCase() === "almoxarifado");
    const manutencao = equipes.find((item) => item.nome.trim().toLowerCase() === "manutenção" || item.nome.trim().toLowerCase() === "manutencao");
    if (!almoxarifado || !manutencao) {
      throw new Error("As equipes Almoxarifado e Manutenção são necessárias para calcular as estatísticas de equipamentos.");
    }
    const estoquesPorEquipamento = new Map<string, EstoqueEquipamento[]>();
    for (const estoque of estoques) {
      const lista = estoquesPorEquipamento.get(estoque.equipamento_id) ?? [];
      lista.push(estoque);
      estoquesPorEquipamento.set(estoque.equipamento_id, lista);
    }

    const linhas: EstatisticaEquipamentoLinha[] = [];
    const porMovimentacao = agruparMovimentacoes(movimentacoes, periodo);

    for (const equipamento of equipamentos) {
      const registros = estoquesPorEquipamento.get(equipamento.id) ?? [];
      if (!registros.length) continue;

      let quantidadeAtiva = 0;
      let quantidadeSaldo = 0;
      let disponivel = 0;
      let emUso = 0;
      let emManutencao = 0;
      let foraEmpresa = 0;
      let encerrados = 0;
      let diasComUso = 0;
      let diasEmManutencao = 0;
      let diasDisponivel = 0;
      let totalUnitDays = 0;
      const vinculos = vazioVinculos();

      for (const estoque of registros) {
        const estado = await obterEstadoAtual(projetoId, estoque);
        const qtdAtiva = Math.max(0, estoque.quantidade - (estado.devolvido ?? 0));
        if (estoque.ativo !== false && estado.saldo > 0) quantidadeAtiva += qtdAtiva;
        quantidadeSaldo += Math.max(0, estado.saldo);
        disponivel += Math.max(0, estado.disponivel);
        emUso += Math.max(0, estado.apropriado);
        emManutencao += Math.max(0, estado.manutencao);
        foraEmpresa += Math.max(0, estado.empresa);
        if (estado.encerrado) encerrados += 1;

        const movimentosEstoque = movimentacoes.filter((movimento) => movimento.estoque_equipamento_id === estoque.id);
        const uso = usoPorPeriodo(estoque, movimentosEstoque, periodo, almoxarifado.id, manutencao.id);
        diasComUso += uso.diasComUso;
        diasEmManutencao += uso.diasEmManutencao;
        diasDisponivel += uso.diasDisponivel;
        if (uso.taxa != null) totalUnitDays += uso.diasComUso + uso.diasEmManutencao + uso.diasDisponivel;
        vinculos[estoque.vinculo] += Math.max(0, estado.saldo);
      }

      const custo = custosPorEquipamento.get(equipamento.id);
      const equipamentoMovimentacoes = movimentacoes.filter((movimento) => movimento.estoque_equipamento_id && registros.some((estoque) => estoque.id === movimento.estoque_equipamento_id));
      const movimentacoesPeriodo = equipamentoMovimentacoes.filter((movimento) => {
        const data = normalizarDia(movimento.data);
        return data >= periodo.inicio && data <= periodo.fim;
      });
      const manutencoesEquipamento = manutencoes
        .filter((item) => item.equipamento_id === equipamento.id)
        .filter((item) => manutencaoAtingePeriodo(item, periodo));

      const valorAtivo = registros.reduce((total, estoque) => {
        if (estoque.ativo === false || estoque.status !== "ATIVO") return total;
        const custoLinha = custosPorEquipamento.get(equipamento.id);
        void custoLinha;
        const valorUnitario = estoque.valor_unitario ?? equipamento.valor_referencia ?? 0;
        return total + Math.max(0, estoque.quantidade - (estoque.devolvido ?? 0) - (estoque.baixado ?? 0)) * valorUnitario;
      }, 0);
      const valorProprio = registros.filter((e) => e.vinculo === "PROPRIO").reduce((total, estoque) => total + Math.max(0, estoque.quantidade - (estoque.devolvido ?? 0) - (estoque.baixado ?? 0)) * (estoque.valor_unitario ?? equipamento.valor_referencia ?? 0), 0);
      const valorAlugado = registros.filter((e) => e.vinculo === "ALUGADO").reduce((total, estoque) => total + Math.max(0, estoque.quantidade - (estoque.devolvido ?? 0) - (estoque.baixado ?? 0)) * (estoque.valor_unitario ?? equipamento.valor_referencia ?? 0), 0);
      const valorEmprestado = registros.filter((e) => e.vinculo === "EMPRESTIMO").reduce((total, estoque) => total + Math.max(0, estoque.quantidade - (estoque.devolvido ?? 0) - (estoque.baixado ?? 0)) * (estoque.valor_unitario ?? equipamento.valor_referencia ?? 0), 0);

      linhas.push({
        equipamento_id: equipamento.id,
        nome: equipamento.nome,
        modelo: equipamento.modelo ?? null,
        tipo_controle: equipamento.tipo_controle,
        cadastros_fisicos: registros.length,
        quantidade_ativa: quantidadeAtiva,
        quantidade_saldo: quantidadeSaldo,
        disponivel,
        em_uso: emUso,
        em_manutencao: emManutencao,
        fora_empresa: foraEmpresa,
        encerrados,
        dias_com_uso: arredondar(diasComUso),
        dias_em_manutencao: arredondar(diasEmManutencao),
        dias_disponivel: arredondar(diasDisponivel),
        taxa_utilizacao: totalUnitDays > 0 ? arredondar(diasComUso / totalUnitDays) : null,
        entradas: movimentacoesPeriodo.filter((m) => m.tipo === "ENTRADA").length,
        saidas: movimentacoesPeriodo.filter((m) => m.tipo === "SAIDA").length,
        devolucoes: movimentacoesPeriodo.filter((m) => m.tipo === "DEVOLUCAO").length,
        transferencias: movimentacoesPeriodo.filter((m) => m.tipo === "TRANSFERENCIA").length,
        sinalizacoes_manutencao: movimentacoesPeriodo.filter((m) => m.tipo === "SINALIZAR_MANUTENCAO").length,
        envios_manutencao: movimentacoesPeriodo.filter((m) => m.tipo === "ENVIO" || m.tipo === "MANUTENCAO" || m.tipo === "RETIRADA_MANUTENCAO").length,
        retornos_manutencao: movimentacoesPeriodo.filter((m) => m.tipo === "RETORNO_MANUTENCAO").length,
        baixas: movimentacoesPeriodo.filter((m) => m.tipo === "BAIXA").length,
        reentradas: movimentacoesPeriodo.filter((m) => m.tipo === "REENTRADA").length,
        custo_operacional: custo?.custo_operacional ?? 0,
        custo_manutencao: custo?.custo_manutencao ?? 0,
        custo_recorrente: custo?.custo_recorrente ?? 0,
        custo_total: custo?.custo_total ?? 0,
        quantidade_consumida: custo?.quantidade_consumida ?? 0,
        consumos_sem_custo: custo?.consumos_sem_custo ?? 0,
        manutencoes: manutencoesEquipamento.length,
        manutencoes_abertas: manutencoesEquipamento.filter((item) => item.status_operacional !== "CONCLUIDA" && item.status_operacional !== "CANCELADA").length,
        manutencoes_concluidas: contarConcluidasManutencoes(manutencoesEquipamento),
        duracao_media_manutencao_dias: calcularDuracaoMediaManutencoes(manutencoesEquipamento),
        valor_referencia: arredondar(valorAtivo),
        valor_proprio: arredondar(valorProprio),
        valor_alugado: arredondar(valorAlugado),
        valor_emprestado: arredondar(valorEmprestado),
        sem_valor: quantidadeSaldo > 0 && valorAtivo <= 0,
        vinculos,
        status: quantidadeSaldo > 0 ? "ATIVO" : "ENCERRADO",
      });
    }

    const soma = <K extends keyof EstatisticaEquipamentoLinha>(campo: K) =>
      arredondar(linhas.reduce((total, item) => total + (typeof item[campo] === "number" ? Number(item[campo]) : 0), 0));

    const disponivel = soma("disponivel");
    const emUso = soma("em_uso");
    const emManutencao = soma("em_manutencao");
    const foraEmpresa = soma("fora_empresa");
    const diasComUso = soma("dias_com_uso");
    const diasEmManutencao = soma("dias_em_manutencao");
    const diasDisponivel = soma("dias_disponivel");
    const totalUnitDays = diasComUso + diasEmManutencao + diasDisponivel;

    return {
      projeto_id: projetoId,
      periodo: { ...periodo },
      parque_total: linhas.length,
      registros_fisicos: linhas.reduce((total, item) => total + item.cadastros_fisicos, 0),
      quantidade_ativa: soma("quantidade_ativa"),
      quantidade_saldo: soma("quantidade_saldo"),
      disponivel,
      em_uso: emUso,
      em_manutencao: emManutencao,
      fora_empresa: foraEmpresa,
      encerrados: linhas.reduce((total, item) => total + item.encerrados, 0),
      individual: linhas.filter((item) => item.tipo_controle === "INDIVIDUAL").length,
      quantitativo: linhas.filter((item) => item.tipo_controle === "QUANTITATIVO").length,
      proprio: linhas.reduce((total, item) => total + item.vinculos.PROPRIO, 0),
      alugado: linhas.reduce((total, item) => total + item.vinculos.ALUGADO, 0),
      emprestimo: linhas.reduce((total, item) => total + item.vinculos.EMPRESTIMO, 0),
      equipamentos_sem_valor: linhas.filter((item) => item.sem_valor).length,
      dias_com_uso: diasComUso,
      dias_em_manutencao: diasEmManutencao,
      dias_disponivel: diasDisponivel,
      taxa_utilizacao: totalUnitDays > 0 ? arredondar(diasComUso / totalUnitDays) : null,
      entradas: porMovimentacao.ENTRADA,
      saidas: porMovimentacao.SAIDA,
      devolucoes: porMovimentacao.DEVOLUCAO,
      transferencias: porMovimentacao.TRANSFERENCIA,
      sinalizacoes_manutencao: porMovimentacao.SINALIZAR_MANUTENCAO,
      envios_manutencao: porMovimentacao.ENVIO + porMovimentacao.MANUTENCAO + porMovimentacao.RETIRADA_MANUTENCAO,
      retornos_manutencao: porMovimentacao.RETORNO_MANUTENCAO,
      baixas: porMovimentacao.BAIXA,
      reentradas: porMovimentacao.REENTRADA,
      manutencoes: linhas.reduce((total, item) => total + item.manutencoes, 0),
      manutencoes_abertas: linhas.reduce((total, item) => total + item.manutencoes_abertas, 0),
      manutencoes_concluidas: linhas.reduce((total, item) => total + item.manutencoes_concluidas, 0),
      duracao_media_manutencao_dias: (() => {
        const duracoes = linhas.map((item) => item.duracao_media_manutencao_dias).filter((valor): valor is number => valor != null);
        return duracoes.length ? arredondar(duracoes.reduce((total, valor) => total + valor, 0) / duracoes.length) : null;
      })(),
      quantidade_consumida: soma("quantidade_consumida"),
      consumos_com_custo: custos.reduce((total, item) => total + item.consumos_com_custo, 0),
      consumos_sem_custo: soma("consumos_sem_custo"),
      custo_operacional: soma("custo_operacional"),
      custo_manutencao: soma("custo_manutencao"),
      custo_recorrente: soma("custo_recorrente"),
      custo_total: soma("custo_total"),
      valor_referencia: soma("valor_referencia"),
      valor_proprio: soma("valor_proprio"),
      valor_alugado: soma("valor_alugado"),
      valor_emprestado: soma("valor_emprestado"),
      movimentacoes: Object.values(porMovimentacao).reduce((total, valor) => total + valor, 0),
      por_equipamento: linhas.sort((a, b) => b.custo_total - a.custo_total || b.quantidade_saldo - a.quantidade_saldo),
      por_tipo_movimentacao: porMovimentacao,
    };
  },
};

