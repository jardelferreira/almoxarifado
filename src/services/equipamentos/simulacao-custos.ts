import { getDB } from "@/db/db";
import { regrasConsumoEquipamentosRepo } from "@/services/equipamentos/regras-consumo-repo";
import type {
  Equipamento,
  EquipamentoPeriodicidadeCusto,
  RegraConsumoEquipamento,
  SimulacaoCustoEquipamentoEntrada,
  SimulacaoCustoEquipamentoResultado,
  SimulacaoCustoEquipamentoResumo,
  SimulacaoCustoProdutoLinha,
  SimulacaoPeriodicidadeRecorrencia,
} from "@/types";

export interface SimulacaoCustoEquipamentoInput {
  inicio: string;
  fim: string;
  equipamentos: SimulacaoCustoEquipamentoEntrada[];
  precosManuais?: Record<string, number | null>;
}

function validarPeriodo(inicio: string, fim: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    throw new Error("O período da simulação deve utilizar o formato AAAA-MM-DD.");
  }
  if (inicio > fim) throw new Error("A data final não pode ser anterior à data inicial.");
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(6));
}

function inteiroPositivo(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

function numeroNaoNegativo(valor: number | null | undefined): number | null {
  if (valor == null || !Number.isFinite(valor) || valor < 0) return null;
  return valor;
}

function diaUtc(dataIso: string): number {
  const [ano = 0, mes = 1, diaNumero = 1] = dataIso.split("-").map(Number);
  return Date.UTC(ano, mes - 1, diaNumero);
}

function diasInclusivos(inicio: string, fim: string): number {
  return Math.max(1, (diaUtc(fim) - diaUtc(inicio)) / 86_400_000 + 1);
}

function unidadesRecorrencia(
  inicio: string,
  fim: string,
  periodicidade: EquipamentoPeriodicidadeCusto,
): number {
  const dias = diasInclusivos(inicio, fim);
  if (periodicidade === "HORA") return dias * 24;
  if (periodicidade === "DIA") return dias;
  if (periodicidade === "SEMANA") return dias / 7;

  let cursor = inicio;
  const fimExclusivo = new Date(diaUtc(fim) + 86_400_000).toISOString().slice(0, 10);
  let total = 0;

  while (cursor < fimExclusivo) {
    const data = new Date(diaUtc(cursor));
    const ano = data.getUTCFullYear();
    const mes = data.getUTCMonth();
    const proximaVirada = periodicidade === "MES"
      ? new Date(Date.UTC(ano, mes + 1, 1))
      : new Date(Date.UTC(ano + 1, 0, 1));
    const proximaData = proximaVirada.toISOString().slice(0, 10);
    const trechoFim = proximaData < fimExclusivo ? proximaData : fimExclusivo;
    const diasTrecho = (diaUtc(trechoFim) - diaUtc(cursor)) / 86_400_000;
    const inicioBase = periodicidade === "MES"
      ? new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10)
      : new Date(Date.UTC(ano, 0, 1)).toISOString().slice(0, 10);
    const diasBase = (diaUtc(proximaData) - diaUtc(inicioBase)) / 86_400_000;
    total += diasTrecho / diasBase;
    cursor = trechoFim;
  }

  return total;
}

function resolverPeriodicidade(
  equipamento: Equipamento,
  item: SimulacaoCustoEquipamentoEntrada,
): SimulacaoPeriodicidadeRecorrencia {
  return item.periodicidade_recorrente_override ?? equipamento.periodicidade_custo ?? null;
}

function resolverCustoRecorrenteUnitario(
  equipamento: Equipamento,
  item: SimulacaoCustoEquipamentoEntrada,
): number | null {
  return numeroNaoNegativo(
    item.custo_recorrente_unitario_override ?? equipamento.custo_recorrente,
  );
}

async function carregarCustosHistoricosProdutos(
  projetoId: string,
  produtoIds: string[],
): Promise<Map<string, number | null>> {
  if (!produtoIds.length) return new Map();

  const db = getDB();
  const [movimentacoes, itens] = await Promise.all([
    db.movimentacoes.where("projeto_id").equals(projetoId).toArray(),
    db.documento_itens.toArray(),
  ]);

  const produtoSet = new Set(produtoIds);
  const itensPorId = new Map(
    itens
      .filter(
        (item) =>
          item.produto_id &&
          produtoSet.has(item.produto_id) &&
          item.valor_unitario != null &&
          Number.isFinite(item.valor_unitario) &&
          item.valor_unitario >= 0,
      )
      .map((item) => [item.id, item]),
  );

  const melhor = new Map<string, { data: string; valor: number }>();

  for (const movimentacao of movimentacoes) {
    if (movimentacao.tipo !== "ENTRADA" || !movimentacao.documento_item_id) continue;
    const item = itensPorId.get(movimentacao.documento_item_id);
    if (!item?.produto_id || item.valor_unitario == null) continue;

    const atual = melhor.get(item.produto_id);
    const candidato = {
      data: movimentacao.data,
      valor: item.valor_unitario,
    };
    if (!atual || candidato.data > atual.data) melhor.set(item.produto_id, candidato);
  }

  return new Map(
    produtoIds.map((produtoId) => [produtoId, melhor.get(produtoId)?.valor ?? null]),
  );
}

function regraSeAplicaAoDirecionador(
  regra: RegraConsumoEquipamento,
  item: SimulacaoCustoEquipamentoEntrada,
): boolean {
  return regra.ativo && regra.direcionador === item.direcionador;
}

async function obterRegrasCatalogo(
  projetoId: string,
  equipamentoId: string,
  dataReferencia: string,
): Promise<RegraConsumoEquipamento[]> {
  const regras = await regrasConsumoEquipamentosRepo.listarPorEquipamento(
    projetoId,
    equipamentoId,
  );

  const efetivas = new Map<string, RegraConsumoEquipamento>();

  for (const regra of regras) {
    if (!regra.ativo || regra.estoque_equipamento_id !== null) continue;
    if (regra.vigencia_inicio && dataReferencia < regra.vigencia_inicio) continue;
    if (regra.vigencia_fim && dataReferencia > regra.vigencia_fim) continue;
    efetivas.set(
      `${regra.produto_id}|${regra.direcionador}|${regra.periodicidade ?? ""}`,
      regra,
    );
  }

  return [...efetivas.values()];
}

export async function calcularSimulacaoCustos(
  projetoId: string,
  input: SimulacaoCustoEquipamentoInput,
): Promise<SimulacaoCustoEquipamentoResumo> {
  validarPeriodo(input.inicio, input.fim);
  if (!input.equipamentos.length) {
    throw new Error("Adicione pelo menos um equipamento à simulação.");
  }

  const db = getDB();
  const equipamentos = await db.equipamentos.where("projeto_id").equals(projetoId).toArray();
  const equipamentosPorId = new Map(equipamentos.map((equipamento) => [equipamento.id, equipamento]));

  const entradasValidas = input.equipamentos.filter((item) => equipamentosPorId.has(item.equipamento_id));
  if (entradasValidas.length !== input.equipamentos.length) {
    throw new Error("Um ou mais equipamentos selecionados não pertencem ao projeto ativo.");
  }

  const regraPorEquipamento = new Map<string, RegraConsumoEquipamento[]>();
  const produtoIds = new Set<string>();

  for (const item of entradasValidas) {
    const regras = await obterRegrasCatalogo(projetoId, item.equipamento_id, input.inicio);
    regraPorEquipamento.set(item.equipamento_id, regras);
    for (const regra of regras) {
      if (regraSeAplicaAoDirecionador(regra, item)) produtoIds.add(regra.produto_id);
    }
  }

  const [produtos, unidades] = await Promise.all([
    db.produtos.where("projeto_id").equals(projetoId).toArray(),
    db.unidades.toArray(),
  ]);
  const produtoPorId = new Map(produtos.map((produto) => [produto.id, produto]));
  const unidadePorId = new Map(unidades.map((unidade) => [unidade.id, unidade]));
  const custosHistoricos = await carregarCustosHistoricosProdutos(projetoId, [...produtoIds]);
  const precosManuais = input.precosManuais ?? {};

  const resultados: SimulacaoCustoEquipamentoResultado[] = [];

  for (const item of entradasValidas) {
    const equipamento = equipamentosPorId.get(item.equipamento_id)!;
    const regras = regraPorEquipamento.get(item.equipamento_id) ?? [];
    const aderentes = regras.filter((regra) => regraSeAplicaAoDirecionador(regra, item));
    const quantidade = inteiroPositivo(item.quantidade);
    const usoPrevisto = inteiroPositivo(item.uso_previsto);

    const produtosResultado: SimulacaoCustoProdutoLinha[] = [];

    for (const regra of aderentes) {
      const produto = produtoPorId.get(regra.produto_id);
      if (!produto) continue;

      const unidadeBase = unidadePorId.get(regra.unidade_base_id);
      const unidadeConsumo = unidadePorId.get(regra.unidade_consumo_id);
      const quantidadePrevista = arredondar(regra.fator * usoPrevisto * quantidade);
      const precoManual = numeroNaoNegativo(precosManuais[regra.produto_id]);
      const precoHistorico = custosHistoricos.get(regra.produto_id) ?? null;
      const custoAplicado = precoManual ?? precoHistorico;
      const fonte = precoManual != null
        ? "MANUAL"
        : precoHistorico != null
          ? "HISTORICO"
          : "SEM_CUSTO";

      produtosResultado.push({
        produto_id: produto.id,
        nome: produto.nome,
        unidade_consumo_sigla: unidadeConsumo?.sigla ?? "un.",
        unidade_base_sigla: unidadeBase?.sigla ?? "un.",
        fator: regra.fator,
        direcionador: regra.direcionador,
        periodicidade_regra: regra.periodicidade,
        quantidade_prevista: quantidadePrevista,
        custo_unitario_sugerido: precoHistorico,
        custo_unitario_aplicado: custoAplicado,
        custo_total: custoAplicado == null ? 0 : arredondar(quantidadePrevista * custoAplicado),
        fonte_custo: fonte,
      });
    }

    const custoOperacional = arredondar(
      produtosResultado.reduce((total, produto) => total + produto.custo_total, 0),
    );
    const manutencaoOcorrencias = inteiroPositivo(item.manutencao_ocorrencias_por_unidade);
    const manutencaoValor = numeroNaoNegativo(item.manutencao_valor_por_ocorrencia) ?? 0;
    const custoManutencao = arredondar(manutencaoOcorrencias * quantidade * manutencaoValor);

    const periodicidadeRecorrente = resolverPeriodicidade(equipamento, item);
    const custoRecorrenteUnitario = resolverCustoRecorrenteUnitario(equipamento, item);
    const custoRecorrente = periodicidadeRecorrente && custoRecorrenteUnitario != null
      ? arredondar(
        custoRecorrenteUnitario * quantidade * unidadesRecorrencia(
          input.inicio,
          input.fim,
          periodicidadeRecorrente,
        ),
      )
      : 0;

    const regrasIgnoradas = regras.filter((regra) => !regraSeAplicaAoDirecionador(regra, item)).length;
    const produtosSemCusto = produtosResultado.filter((produto) => produto.custo_unitario_aplicado == null).length;

    resultados.push({
      equipamento_id: equipamento.id,
      nome: equipamento.nome,
      modelo: equipamento.modelo ?? null,
      tipo_controle: equipamento.tipo_controle,
      quantidade,
      uso_previsto: usoPrevisto,
      direcionador: item.direcionador,
      custo_operacional: custoOperacional,
      custo_manutencao: custoManutencao,
      manutencao_ocorrencias_previstas: arredondar(manutencaoOcorrencias * quantidade),
      custo_recorrente: custoRecorrente,
      custo_total: arredondar(custoOperacional + custoManutencao + custoRecorrente),
      periodicidade_recorrente: periodicidadeRecorrente,
      custo_recorrente_unitario: custoRecorrenteUnitario,
      regras_aplicadas: aderentes.length,
      regras_ignoradas: regrasIgnoradas,
      produtos_sem_custo: produtosSemCusto,
      produtos: produtosResultado,
    });
  }

  const resumo = {
    projeto_id: projetoId,
    periodo: { inicio: input.inicio, fim: input.fim },
    equipamentos: resultados,
    custo_operacional: arredondar(resultados.reduce((total, item) => total + item.custo_operacional, 0)),
    custo_manutencao: arredondar(resultados.reduce((total, item) => total + item.custo_manutencao, 0)),
    manutencao_ocorrencias_previstas: arredondar(
      resultados.reduce((total, item) => total + item.manutencao_ocorrencias_previstas, 0),
    ),
    custo_recorrente: arredondar(resultados.reduce((total, item) => total + item.custo_recorrente, 0)),
    custo_total: arredondar(resultados.reduce((total, item) => total + item.custo_total, 0)),
    produtos_sem_custo: resultados.reduce((total, item) => total + item.produtos_sem_custo, 0),
    regras_sem_aderencia: resultados.reduce((total, item) => total + item.regras_ignoradas, 0),
    dados_base_historicos: [...custosHistoricos.values()].some((valor) => valor != null),
  } satisfies SimulacaoCustoEquipamentoResumo;

  return resumo;
}

export function aplicarPrecosManuaisNaSimulacao(
  resumo: SimulacaoCustoEquipamentoResumo,
  precosManuais: Record<string, number | null>,
): SimulacaoCustoEquipamentoResumo {
  const equipamentos = resumo.equipamentos.map((equipamento) => {
    const produtos = equipamento.produtos.map((produto) => {
      const preco = numeroNaoNegativo(precosManuais[produto.produto_id]);
      if (preco == null) return produto;
      return {
        ...produto,
        custo_unitario_aplicado: preco,
        custo_total: arredondar(produto.quantidade_prevista * preco),
        fonte_custo: "MANUAL" as const,
      };
    });

    const custoOperacional = arredondar(produtos.reduce((total, produto) => total + produto.custo_total, 0));
    const custoTotal = arredondar(custoOperacional + equipamento.custo_manutencao + equipamento.custo_recorrente);

    return {
      ...equipamento,
      custo_operacional: custoOperacional,
      custo_total: custoTotal,
      produtos_sem_custo: produtos.filter((produto) => produto.custo_unitario_aplicado == null).length,
      produtos,
    };
  });

  return {
    ...resumo,
    equipamentos,
    custo_operacional: arredondar(equipamentos.reduce((total, item) => total + item.custo_operacional, 0)),
    custo_manutencao: arredondar(equipamentos.reduce((total, item) => total + item.custo_manutencao, 0)),
    custo_recorrente: arredondar(equipamentos.reduce((total, item) => total + item.custo_recorrente, 0)),
    custo_total: arredondar(equipamentos.reduce((total, item) => total + item.custo_total, 0)),
    produtos_sem_custo: equipamentos.reduce((total, item) => total + item.produtos_sem_custo, 0),
  };
}
