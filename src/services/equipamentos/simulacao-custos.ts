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
  RegraConsumoEquipamentoPeriodicidade,
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

function arredondarQuantidade(valor: number): number {
  return Number(valor.toFixed(6));
}

function arredondarMoeda(valor: number): number {
  return Number(valor.toFixed(2));
}

function numeroPositivo(valor: number): number {
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
  usoPrevisto: number,
): number {
  const dias = diasInclusivos(inicio, fim);
  if (periodicidade === "HORA") return numeroPositivo(usoPrevisto);
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

function mesesProporcionalmenteNoPeriodo(inicio: string, fim: string): number {
  return unidadesRecorrencia(inicio, fim, "MES", 0);
}

function intersecaoVigencia(
  inicio: string,
  fim: string,
  regra: RegraConsumoEquipamento,
): { inicio: string; fim: string; dias: number } | null {
  const inicioAtivo = regra.vigencia_inicio && regra.vigencia_inicio > inicio
    ? regra.vigencia_inicio
    : inicio;
  const fimAtivo = regra.vigencia_fim && regra.vigencia_fim < fim
    ? regra.vigencia_fim
    : fim;

  if (inicioAtivo > fimAtivo) return null;
  return { inicio: inicioAtivo, fim: fimAtivo, dias: diasInclusivos(inicioAtivo, fimAtivo) };
}

function unidadesPeriodicidadeRegra(
  inicio: string,
  fim: string,
  periodicidade: RegraConsumoEquipamentoPeriodicidade,
): number {
  return unidadesRecorrencia(inicio, fim, periodicidade, 0);
}

function fracaoVigencia(diasAtivos: number, diasSimulacao: number): number {
  return Math.min(1, Math.max(0, diasAtivos / Math.max(1, diasSimulacao)));
}

function formatarNumeroInterno(valor: number): string {
  return Number(valor.toFixed(4)).toString();
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

type CustoHistoricoProduto = {
  valor: number;
  documento_id: string;
  documento_numero: string;
  documento_tipo: string;
  data: string | null;
};

async function carregarCustosHistoricosProdutos(
  projetoId: string,
  produtoIds: string[],
): Promise<Map<string, CustoHistoricoProduto>> {
  if (!produtoIds.length) return new Map();

  const db = getDB();
  const [movimentacoes, itens, documentos] = await Promise.all([
    db.movimentacoes.where("projeto_id").equals(projetoId).toArray(),
    db.documento_itens.toArray(),
    db.documentos.where("projeto_id").equals(projetoId).toArray(),
  ]);

  const produtoSet = new Set(produtoIds);
  const documentoPorId = new Map(documentos.map((documento) => [documento.id, documento]));
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

  const melhor = new Map<string, CustoHistoricoProduto & { dataComparacao: string }>();

  for (const movimentacao of movimentacoes) {
    if (movimentacao.tipo !== "ENTRADA" || !movimentacao.documento_item_id) continue;
    const item = itensPorId.get(movimentacao.documento_item_id);
    const documento = item ? documentoPorId.get(item.documento_id) : undefined;
    if (!item?.produto_id || item.valor_unitario == null || !documento) continue;

    const dataComparacao = movimentacao.data || documento.data_entrada || documento.data_emissao || "";
    const atual = melhor.get(item.produto_id);
    if (!atual || dataComparacao > atual.dataComparacao) {
      melhor.set(item.produto_id, {
        valor: item.valor_unitario,
        documento_id: documento.id,
        documento_numero: documento.numero,
        documento_tipo: documento.tipo,
        data: documento.data_entrada ?? documento.data_emissao ?? movimentacao.data ?? null,
        dataComparacao,
      });
    }
  }

  return new Map(
    [...melhor.entries()].map(([produtoId, historico]) => {
      const { dataComparacao: _dataComparacao, ...valor } = historico;
      return [produtoId, valor];
    }),
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
  inicio: string,
  fim: string,
): Promise<RegraConsumoEquipamento[]> {
  const regras = await regrasConsumoEquipamentosRepo.listarPorEquipamento(
    projetoId,
    equipamentoId,
  );

  const efetivas = new Map<string, RegraConsumoEquipamento>();

  for (const regra of regras) {
    if (!regra.ativo || regra.estoque_equipamento_id !== null) continue;
    if (!intersecaoVigencia(inicio, fim, regra)) continue;
    efetivas.set(
      `${regra.produto_id}|${regra.direcionador}`,
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
    const regras = await obterRegrasCatalogo(projetoId, item.equipamento_id, input.inicio, input.fim);
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
  const diasSimulacao = diasInclusivos(input.inicio, input.fim);

  for (const item of entradasValidas) {
    const equipamento = equipamentosPorId.get(item.equipamento_id)!;
    const regras = regraPorEquipamento.get(item.equipamento_id) ?? [];
    const aderentes = regras.filter((regra) => regraSeAplicaAoDirecionador(regra, item));
    const quantidade = numeroPositivo(item.quantidade);
    const usoPrevisto = numeroPositivo(item.uso_previsto);

    const produtosResultado: SimulacaoCustoProdutoLinha[] = [];

    for (const regra of aderentes) {
      const produto = produtoPorId.get(regra.produto_id);
      if (!produto) continue;

      const unidadeBase = unidadePorId.get(regra.unidade_base_id);
      const unidadeConsumo = unidadePorId.get(regra.unidade_consumo_id);
      const vigencia = intersecaoVigencia(input.inicio, input.fim, regra);
      if (!vigencia) continue;
      const fracaoAtiva = fracaoVigencia(vigencia.dias, diasSimulacao);
      const multiplicadorPeriodicidade = regra.direcionador === "PERIODO" && regra.periodicidade
        ? unidadesPeriodicidadeRegra(vigencia.inicio, vigencia.fim, regra.periodicidade)
        : null;
      const usoAplicado = multiplicadorPeriodicidade != null
        ? multiplicadorPeriodicidade
        : usoPrevisto * fracaoAtiva;
      const quantidadePrevista = arredondarQuantidade(regra.fator * usoAplicado * quantidade);
      const historico = custosHistoricos.get(regra.produto_id) ?? null;
      const precoManual = numeroNaoNegativo(precosManuais[regra.produto_id]);
      const precoHistorico = historico?.valor ?? null;
      const custoAplicado = precoManual ?? precoHistorico;
      const fonte = precoManual != null
        ? "MANUAL"
        : precoHistorico != null
          ? "HISTORICO"
          : "SEM_CUSTO";
      const formulaMemoria = multiplicadorPeriodicidade != null
        ? `${regra.fator} × ${formatarNumeroInterno(multiplicadorPeriodicidade)} períodos × ${quantidade}`
        : `${regra.fator} × ${formatarNumeroInterno(usoPrevisto)} uso × ${quantidade} × ${formatarNumeroInterno(fracaoAtiva)} vigência`;

      const linha: SimulacaoCustoProdutoLinha = {
        produto_id: produto.id,
        nome: produto.nome,
        unidade_consumo_sigla: unidadeConsumo?.sigla ?? "un.",
        unidade_base_sigla: unidadeBase?.sigla ?? "un.",
        fator: regra.fator,
        direcionador: regra.direcionador,
        periodicidade_regra: regra.periodicidade,
        dias_ativos: vigencia.dias,
        multiplicador_periodicidade: multiplicadorPeriodicidade,
        formula_memoria: formulaMemoria,
        quantidade_prevista: quantidadePrevista,
        custo_unitario_sugerido: precoHistorico,
        custo_unitario_aplicado: custoAplicado,
        custo_total: custoAplicado == null ? 0 : arredondarMoeda(quantidadePrevista * custoAplicado),
        fonte_custo: fonte,
      };
      if (historico) {
        linha.fonte_historico = {
          documento_id: historico.documento_id,
          documento_numero: historico.documento_numero,
          documento_tipo: historico.documento_tipo,
          data: historico.data,
          valor_unitario: historico.valor,
        };
      }
      produtosResultado.push(linha);
    }

    const custoOperacional = arredondarMoeda(
      produtosResultado.reduce((total, produto) => total + produto.custo_total, 0),
    );
    const manutencaoOcorrencias = numeroPositivo(item.manutencao_ocorrencias_por_unidade);
    const manutencaoValor = numeroNaoNegativo(item.manutencao_valor_por_ocorrencia) ?? 0;
    const custoManutencao = arredondarMoeda(manutencaoOcorrencias * quantidade * manutencaoValor);

    const periodicidadeRecorrente = resolverPeriodicidade(equipamento, item);
    const custoRecorrenteUnitario = resolverCustoRecorrenteUnitario(equipamento, item);
    const unidadesRecorrenciaCalculadas = periodicidadeRecorrente
      ? unidadesRecorrencia(input.inicio, input.fim, periodicidadeRecorrente, usoPrevisto)
      : 0;
    const custoRecorrente = periodicidadeRecorrente && custoRecorrenteUnitario != null
      ? arredondarMoeda(custoRecorrenteUnitario * quantidade * unidadesRecorrenciaCalculadas)
      : 0;

    const valorReferenciaUnitario = numeroNaoNegativo(equipamento.valor_referencia);
    const vidaUtilMeses = equipamento.metodo_depreciacao === "LINEAR"
      ? numeroNaoNegativo(equipamento.vida_util_meses)
      : null;
    const mesesDepreciacaoCalculados = mesesProporcionalmenteNoPeriodo(input.inicio, input.fim);
    const depreciacaoProjetada = valorReferenciaUnitario != null && vidaUtilMeses != null
      ? arredondarMoeda((valorReferenciaUnitario * quantidade * mesesDepreciacaoCalculados) / vidaUtilMeses)
      : 0;
    const investimentoAquisicao = equipamento.situacao === "PLANEJADO" && valorReferenciaUnitario != null
      ? arredondarMoeda(valorReferenciaUnitario * quantidade)
      : 0;
    const formulaDepreciacao = valorReferenciaUnitario != null && vidaUtilMeses != null
      ? `${formatarNumeroInterno(valorReferenciaUnitario)} × ${quantidade} ÷ ${formatarNumeroInterno(vidaUtilMeses)} meses × ${formatarNumeroInterno(mesesDepreciacaoCalculados)} meses`
      : null;

    const regrasIgnoradasDetalhes = regras
      .filter((regra) => !regraSeAplicaAoDirecionador(regra, item))
      .map((regra) => ({
        produto_id: regra.produto_id,
        produto_nome: produtoPorId.get(regra.produto_id)?.nome ?? "Produto não encontrado",
        direcionador: regra.direcionador,
      }));
    const regrasIgnoradas = regrasIgnoradasDetalhes.length;
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
      manutencao_ocorrencias_previstas: arredondarQuantidade(manutencaoOcorrencias * quantidade),
      custo_recorrente: custoRecorrente,
      investimento_aquisicao: investimentoAquisicao,
      depreciacao_projetada: depreciacaoProjetada,
      dias_periodo: diasInclusivos(input.inicio, input.fim),
      unidades_recorrencia_calculadas: arredondarQuantidade(unidadesRecorrenciaCalculadas),
      valor_referencia_unitario: valorReferenciaUnitario,
      vida_util_meses: vidaUtilMeses,
      meses_depreciacao_calculados: mesesDepreciacaoCalculados,
      formula_depreciacao: formulaDepreciacao,
      custo_total: arredondarMoeda(custoOperacional + custoManutencao + custoRecorrente + depreciacaoProjetada),
      periodicidade_recorrente: periodicidadeRecorrente,
      custo_recorrente_unitario: custoRecorrenteUnitario,
      regras_aplicadas: aderentes.length,
      regras_ignoradas: regrasIgnoradas,
      regras_ignoradas_detalhes: regrasIgnoradasDetalhes,
      produtos_sem_custo: produtosSemCusto,
      produtos: produtosResultado,
    });
  }

  const resumo = {
    projeto_id: projetoId,
    periodo: { inicio: input.inicio, fim: input.fim },
    dias_periodo: diasInclusivos(input.inicio, input.fim),
    equipamentos: resultados,
    custo_operacional: arredondarMoeda(resultados.reduce((total, item) => total + item.custo_operacional, 0)),
    custo_manutencao: arredondarMoeda(resultados.reduce((total, item) => total + item.custo_manutencao, 0)),
    manutencao_ocorrencias_previstas: arredondarQuantidade(
      resultados.reduce((total, item) => total + item.manutencao_ocorrencias_previstas, 0),
    ),
    custo_recorrente: arredondarMoeda(resultados.reduce((total, item) => total + item.custo_recorrente, 0)),
    investimento_aquisicao: arredondarMoeda(resultados.reduce((total, item) => total + item.investimento_aquisicao, 0)),
    depreciacao_projetada: arredondarMoeda(resultados.reduce((total, item) => total + item.depreciacao_projetada, 0)),
    custo_total: arredondarMoeda(resultados.reduce((total, item) => total + item.custo_total, 0)),
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
        custo_total: arredondarMoeda(produto.quantidade_prevista * preco),
        fonte_custo: "MANUAL" as const,
      };
    });

    const custoOperacional = arredondarMoeda(produtos.reduce((total, produto) => total + produto.custo_total, 0));
    const custoTotal = arredondarMoeda(
      custoOperacional +
        equipamento.custo_manutencao +
        equipamento.custo_recorrente +
        equipamento.depreciacao_projetada,
    );

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
    custo_operacional: arredondarMoeda(equipamentos.reduce((total, item) => total + item.custo_operacional, 0)),
    custo_manutencao: arredondarMoeda(equipamentos.reduce((total, item) => total + item.custo_manutencao, 0)),
    custo_recorrente: arredondarMoeda(equipamentos.reduce((total, item) => total + item.custo_recorrente, 0)),
    custo_total: arredondarMoeda(equipamentos.reduce((total, item) => total + item.custo_total, 0)),
    produtos_sem_custo: equipamentos.reduce((total, item) => total + item.produtos_sem_custo, 0),
  };
}
