import { getDB } from "@/db/db";
import { estatisticasEquipamentosRepo } from "@/services/equipamentos/estatisticas-equipamentos";
import type {
  ComparacaoProduto,
  DesvioCausa,
  DesvioCausaDetalhe,
  PrevistoRealEquipamento,
  PrevistoRealResumo,
  SimulacaoCustoEquipamentoResultado,
  SimulacaoCustoEquipamentoResumo,
} from "@/types";

export interface CompararPrevistoRealInput {
  inicio: string;
  fim: string;
  simulacao: SimulacaoCustoEquipamentoResumo;
  perfilId: string;
  perfilNome: string;
  perfilVersao: number;
}

function validarPeriodo(inicio: string, fim: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    throw new Error("O período da comparação deve utilizar o formato AAAA-MM-DD.");
  }
  if (inicio > fim) throw new Error("A data final não pode ser anterior à data inicial.");
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(6));
}

function compararValor(previsto: number, real: number): {
  previsto: number;
  real: number;
  diferenca: number;
  percentual: number | null;
} {
  const diferenca = arredondar(real - previsto);
  return {
    previsto: arredondar(previsto),
    real: arredondar(real),
    diferenca,
    percentual: previsto > 0 ? arredondar(diferenca / previsto) : null,
  };
}

function intensidade(valor: number, escala = 1): number {
  return Math.max(0, Math.min(1, Math.abs(valor) / Math.max(escala, 0.000001)));
}

function direcionadorInfo(direcionador: SimulacaoCustoEquipamentoResultado["direcionador"]): {
  unidade: string;
  comparavel: boolean;
  observacao: string | null;
} {
  switch (direcionador) {
    case "DIA":
      return { unidade: "dias-equivalentes", comparavel: true, observacao: null };
    case "PERIODO":
      return {
        unidade: "período",
        comparavel: false,
        observacao: "O histórico operacional ainda não registra um direcionador equivalente a este parâmetro.",
      };
    case "HORA":
      return {
        unidade: "h",
        comparavel: false,
        observacao: "Horas efetivas não são registradas no histórico atual; a utilização não pode ser comparada diretamente.",
      };
    case "CICLO":
      return {
        unidade: "ciclos",
        comparavel: false,
        observacao: "Ciclos efetivos não são registrados no histórico atual; a utilização não pode ser comparada diretamente.",
      };
    case "KM":
      return {
        unidade: "km",
        comparavel: false,
        observacao: "Quilometragem efetiva não é registrada no histórico atual; a utilização não pode ser comparada diretamente.",
      };
    case "PRODUCAO":
      return {
        unidade: "un.",
        comparavel: false,
        observacao: "Produção efetiva não é registrada no histórico atual; a utilização não pode ser comparada diretamente.",
      };
    default:
      return {
        unidade: "base",
        comparavel: false,
        observacao: "O uso manual informado no cenário não possui uma contraparte automática no histórico.",
      };
  }
}

function causasEquipamento(
  item: PrevistoRealEquipamento,
): DesvioCausaDetalhe[] {
  const causas: DesvioCausaDetalhe[] = [];
  const totalBase = Math.max(Math.abs(item.total.previsto), Math.abs(item.total.real), 1);

  if (!item.uso.comparavel) {
    if (Math.abs(item.total.diferenca) > 0.01) {
      causas.push({
        causa: "DADOS_AUSENTES",
        intensidade: Math.min(1, Math.abs(item.total.diferenca) / totalBase),
        descricao: item.uso.observacao ?? "Parte do desvio não pode ser explicada pelo direcionador de uso disponível.",
      });
    }
  } else if (item.uso.real != null && item.uso.previsto > 0) {
    const usoDelta = item.uso.real - item.uso.previsto;
    const usoPct = usoDelta / item.uso.previsto;
    if (Math.abs(usoPct) >= 0.1) {
      causas.push({
        causa: "UTILIZACAO",
        intensidade: Math.min(1, Math.abs(usoPct)),
        descricao: usoDelta > 0
          ? "A utilização observada ficou acima da utilização prevista no cenário."
          : "A utilização observada ficou abaixo da utilização prevista no cenário.",
      });
    }
  }

  if (item.consumo.previsto > 0 && item.consumo.real > 0) {
    const consumoPct = item.consumo.diferenca / item.consumo.previsto;
    if (Math.abs(consumoPct) >= 0.1) {
      causas.push({
        causa: "CONSUMO",
        intensidade: Math.min(1, Math.abs(consumoPct)),
        descricao: consumoPct > 0
          ? "A quantidade consumida ficou acima do consumo previsto."
          : "A quantidade consumida ficou abaixo do consumo previsto.",
      });
    }
  } else if (item.consumo.real > 0 && item.consumo.previsto === 0) {
    causas.push({
      causa: "CONSUMO",
      intensidade: 1,
      descricao: "Houve consumo real sem quantidade operacional prevista para o equipamento.",
    });
  }

  if (item.operacional.previsto > 0 && item.operacional.real > 0 && item.consumo.previsto > 0 && item.consumo.real > 0) {
    const custoUnitPrevisto = item.operacional.previsto / item.consumo.previsto;
    const custoUnitReal = item.operacional.real / item.consumo.real;
    if (custoUnitPrevisto > 0) {
      const precoPct = (custoUnitReal - custoUnitPrevisto) / custoUnitPrevisto;
      if (Math.abs(precoPct) >= 0.1 && Math.abs(item.consumo.diferenca) / item.consumo.previsto < 0.1) {
        causas.push({
          causa: "PRECO",
          intensidade: Math.min(1, Math.abs(precoPct)),
          descricao: precoPct > 0
            ? "O custo médio efetivo por unidade consumida ficou acima da referência prevista."
            : "O custo médio efetivo por unidade consumida ficou abaixo da referência prevista.",
        });
      }
    }
  }

  if (item.manutencao.previsto > 0 || item.manutencao.real > 0) {
    const pct = item.manutencao.previsto > 0 ? Math.abs(item.manutencao.diferenca / item.manutencao.previsto) : 1;
    if (Math.abs(item.manutencao.diferenca) > 0.01) {
      causas.push({
        causa: "MANUTENCAO",
        intensidade: Math.min(1, pct),
        descricao: item.manutencao.real > item.manutencao.previsto
          ? "O custo de manutenção realizado ficou acima da previsão."
          : "O custo de manutenção realizado ficou abaixo da previsão.",
      });
    }
  }

  if (item.recorrencia.previsto > 0 || item.recorrencia.real > 0) {
    const pct = item.recorrencia.previsto > 0 ? Math.abs(item.recorrencia.diferenca / item.recorrencia.previsto) : 1;
    if (Math.abs(item.recorrencia.diferenca) > 0.01) {
      causas.push({
        causa: "RECORRENCIA",
        intensidade: Math.min(1, pct),
        descricao: item.recorrencia.real > item.recorrencia.previsto
          ? "O custo recorrente efetivo ficou acima da previsão."
          : "O custo recorrente efetivo ficou abaixo da previsão.",
      });
    }
  }

  if (!causas.length && Math.abs(item.total.diferenca) > 0.01) {
    causas.push({
      causa: "DADOS_AUSENTES",
      intensidade: intensidade(item.total.diferenca, totalBase),
      descricao: "Existe diferença entre previsto e realizado, mas os dados disponíveis não sustentam uma atribuição específica de causa.",
    });
  }

  return causas.sort((a, b) => b.intensidade - a.intensidade);
}

async function carregarConsumoReal(
  projetoId: string,
  periodo: { inicio: string; fim: string },
  equipamentoIds: string[],
): Promise<Map<string, Map<string, { quantidade: number; custo: number }>>> {
  const db = getDB();
  const ids = new Set(equipamentoIds);
  const consumos = await db.consumos_equipamentos.where("projeto_id").equals(projetoId).toArray();
  const filtrados = consumos.filter((consumo) => {
    const dia = consumo.data_apropriacao.slice(0, 10);
    return ids.has(consumo.equipamento_id) && dia >= periodo.inicio && dia <= periodo.fim;
  });
  if (!filtrados.length) return new Map();

  const movimentacoes = await db.movimentacoes.toArray();
  const movimentoPorId = new Map(movimentacoes.map((movimento) => [movimento.id, movimento]));
  const produtos = await db.produtos.toArray();
  const produtoPorId = new Map(produtos.map((produto) => [produto.id, produto]));
  const out = new Map<string, Map<string, { quantidade: number; custo: number }>>();

  for (const consumo of filtrados) {
    const movimento = movimentoPorId.get(consumo.movimentacao_id);
    const produtoId = movimento?.produto_id;
    if (!produtoId) continue;
    const atual = out.get(consumo.equipamento_id) ?? new Map<string, { quantidade: number; custo: number }>();
    const anterior = atual.get(produtoId) ?? { quantidade: 0, custo: 0 };
    atual.set(produtoId, {
      quantidade: anterior.quantidade + consumo.quantidade,
      custo: anterior.custo + (consumo.custo_total ?? (consumo.custo_unitario != null ? consumo.custo_unitario * consumo.quantidade : 0)),
    });
    out.set(consumo.equipamento_id, atual);
  }

  for (const [equipamentoId, produtosMap] of out) {
    const saneado = new Map<string, { quantidade: number; custo: number }>();
    for (const [produtoId, valor] of produtosMap) {
      if (!produtoPorId.has(produtoId)) continue;
      saneado.set(produtoId, { quantidade: arredondar(valor.quantidade), custo: arredondar(valor.custo) });
    }
    out.set(equipamentoId, saneado);
  }

  return out;
}

function compararProdutos(
  previsto: SimulacaoCustoEquipamentoResultado,
  reais: Map<string, { quantidade: number; custo: number }>,
): ComparacaoProduto[] {
  const ids = new Set([...previsto.produtos.map((item) => item.produto_id), ...reais.keys()]);
  const linhas: ComparacaoProduto[] = [];
  for (const produtoId of ids) {
    const linha = previsto.produtos.find((item) => item.produto_id === produtoId);
    const real = reais.get(produtoId) ?? { quantidade: 0, custo: 0 };
    const quantidadePrevista = linha?.quantidade_prevista ?? 0;
    const custoPrevisto = linha?.custo_total ?? 0;
    linhas.push({
      produto_id: produtoId,
      nome: linha?.nome ?? `Produto ${produtoId.slice(0, 8)}`,
      quantidade_prevista: arredondar(quantidadePrevista),
      quantidade_real: arredondar(real.quantidade),
      quantidade_diferenca: arredondar(real.quantidade - quantidadePrevista),
      custo_previsto: arredondar(custoPrevisto),
      custo_real: arredondar(real.custo),
      custo_diferenca: arredondar(real.custo - custoPrevisto),
      custo_percentual: custoPrevisto > 0 ? arredondar((real.custo - custoPrevisto) / custoPrevisto) : null,
    });
  }
  return linhas.sort((a, b) => Math.abs(b.custo_diferenca) - Math.abs(a.custo_diferenca));
}

function causasResumo(equipamentos: PrevistoRealEquipamento[]): DesvioCausaDetalhe[] {
  const grupos = new Map<DesvioCausa, { intensidade: number; contagem: number; exemplos: string[] }>();
  for (const equipamento of equipamentos) {
    for (const causa of equipamento.causas) {
      const grupo = grupos.get(causa.causa) ?? { intensidade: 0, contagem: 0, exemplos: [] };
      grupo.intensidade += causa.intensidade;
      grupo.contagem += 1;
      if (grupo.exemplos.length < 2) grupo.exemplos.push(`${equipamento.nome}: ${causa.descricao}`);
      grupos.set(causa.causa, grupo);
    }
  }

  const labels: Record<DesvioCausa, string> = {
    UTILIZACAO: "Uso observado divergente do cenário",
    CONSUMO: "Consumo divergente do previsto",
    PRECO: "Preço/custo unitário divergente",
    MANUTENCAO: "Manutenção divergente da previsão",
    RECORRENCIA: "Recorrência divergente da previsão",
    DADOS_AUSENTES: "Dados insuficientes para atribuição completa",
  };

  return [...grupos.entries()]
    .map(([causa, grupo]) => ({
      causa,
      intensidade: Math.min(1, grupo.intensidade / Math.max(1, grupo.contagem)),
      descricao: `${labels[causa]}${grupo.exemplos.length ? ` · ${grupo.exemplos.join(" | ")}` : ""}`,
    }))
    .sort((a, b) => b.intensidade - a.intensidade);
}

export async function compararPrevistoReal(
  projetoId: string,
  input: CompararPrevistoRealInput,
): Promise<PrevistoRealResumo> {
  validarPeriodo(input.inicio, input.fim);
  const periodo = { inicio: input.inicio, fim: input.fim };
  const atual = await estatisticasEquipamentosRepo.calcular(projetoId, periodo);
  const consumoReal = await carregarConsumoReal(projetoId, periodo, input.simulacao.equipamentos.map((item) => item.equipamento_id));
  const atualPorEquipamento = new Map(atual.por_equipamento.map((item) => [item.equipamento_id, item]));

  const equipamentos = input.simulacao.equipamentos.map((previsto) => {
    const linhaReal = atualPorEquipamento.get(previsto.equipamento_id);
    const infoUso = direcionadorInfo(previsto.direcionador);
    const usoPrevisto = previsto.uso_previsto * previsto.quantidade;
    const usoReal = infoUso.comparavel ? (linhaReal?.dias_com_uso ?? 0) : null;
    const reaisProdutos = consumoReal.get(previsto.equipamento_id) ?? new Map<string, { quantidade: number; custo: number }>();
    const produtos = compararProdutos(previsto, reaisProdutos);
    const quantidadePrevista = produtos.reduce((total, item) => total + item.quantidade_prevista, 0);
    const quantidadeReal = linhaReal?.quantidade_consumida ?? produtos.reduce((total, item) => total + item.quantidade_real, 0);

    const equipamento: PrevistoRealEquipamento = {
      equipamento_id: previsto.equipamento_id,
      nome: previsto.nome,
      modelo: previsto.modelo,
      quantidade: previsto.quantidade,
      uso: {
        direcionador: previsto.direcionador,
        previsto: arredondar(usoPrevisto),
        real: usoReal,
        unidade: infoUso.unidade,
        comparavel: infoUso.comparavel,
        observacao: infoUso.observacao,
      },
      consumo: compararValor(quantidadePrevista, quantidadeReal),
      manutencao: compararValor(previsto.custo_manutencao, linhaReal?.custo_manutencao ?? 0),
      recorrencia: compararValor(previsto.custo_recorrente, linhaReal?.custo_recorrente ?? 0),
      operacional: compararValor(previsto.custo_operacional, linhaReal?.custo_operacional ?? 0),
      total: compararValor(previsto.custo_total, linhaReal?.custo_total ?? 0),
      produtos,
      manutencoes_previstas: previsto.manutencao_ocorrencias_previstas,
      manutencoes_reais: linhaReal?.manutencoes ?? 0,
      causas: [],
      qualidade: [
        ...(linhaReal ? [] : ["Nenhum histórico operacional foi localizado para este equipamento no período."]),
        ...(previsto.produtos_sem_custo > 0 ? [`${previsto.produtos_sem_custo} insumo(s) previsto(s) sem custo.`] : []),
        ...((linhaReal?.consumos_sem_custo ?? 0) > 0 ? [`${linhaReal?.consumos_sem_custo ?? 0} consumo(s) real(is) sem custo.`] : []),
        ...(infoUso.comparavel ? [] : [infoUso.observacao ?? "O direcionador não possui observação histórica compatível."]),
      ],
    };
    equipamento.causas = causasEquipamento(equipamento);
    return equipamento;
  });

  const previsto = {
    operacao: arredondar(input.simulacao.custo_operacional),
    manutencao: arredondar(input.simulacao.custo_manutencao),
    recorrencia: arredondar(input.simulacao.custo_recorrente),
    total: arredondar(input.simulacao.custo_total),
  };
  const real = {
    operacao: arredondar(equipamentos.reduce((total, item) => total + item.operacional.real, 0)),
    manutencao: arredondar(equipamentos.reduce((total, item) => total + item.manutencao.real, 0)),
    recorrencia: arredondar(equipamentos.reduce((total, item) => total + item.recorrencia.real, 0)),
    total: arredondar(equipamentos.reduce((total, item) => total + item.total.real, 0)),
  };

  return {
    projeto_id: projetoId,
    periodo,
    perfil_id: input.perfilId,
    perfil_nome: input.perfilNome,
    perfil_versao: input.perfilVersao,
    previsto,
    real,
    total: compararValor(previsto.total, real.total),
    equipamentos,
    causas: causasResumo(equipamentos),
    qualidade: [
      ...(atual.consumos_sem_custo > 0 ? [`O histórico contém ${atual.consumos_sem_custo} consumo(s) sem custo.`] : []),
      ...(atual.equipamentos_sem_valor > 0 ? [`${atual.equipamentos_sem_valor} equipamento(s) ativo(s) sem valor de referência.`] : []),
      ...(equipamentos.some((item) => !item.uso.comparavel) ? ["A comparação de utilização é parcial: alguns direcionadores não possuem medição equivalente no histórico atual."] : []),
    ],
    simulacao: input.simulacao,
  };
}
