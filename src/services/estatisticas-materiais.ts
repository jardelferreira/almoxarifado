import type { DocumentoItem, Equipe, Movimentacao, Produto } from "@/types";
import { montarEstoque } from "@/services/estoque";

export type PeriodoEstatisticas = {
  de: string;
  ate: string;
};

export type FluxoPeriodo = {
  movimentacoes: number;
  entradasMovimentacoes: number;
  saidasMovimentacoes: number;
  devolucoesMovimentacoes: number;
  ajustesMovimentacoes: number;
  transferenciasMovimentacoes: number;
  entradasQuantidade: number;
  saidasQuantidade: number;
  devolucoesQuantidade: number;
  ajustesQuantidade: number;
  transferenciasQuantidade: number;
  produtosMovimentados: number;
};

export type ProdutoEstatistica = {
  produtoId: string;
  produto: Produto;
  estoqueAtual: number;
  estoqueMinimo: number;
  consumoPeriodo: number;
  consumoMedioDiario: number;
  consumoMedioSemanal: number;
  consumoMedioMensal: number;
  coberturaDias: number | null;
  diasAteMinimo: number | null;
  dataEstimadaRuptura: string | null;
  dataEstimadaMinimo: string | null;
  abaixoDoMinimo: boolean;
  semConsumo: boolean;
};

export type ConsumoJanela = {
  dias: number;
  inicio: string;
  ate: string;
  saidas: number;
  mediaDiaria: number;
  mediaSemanal: number;
  mediaMensal: number;
};

export type TendenciaConsumo = {
  media7Dias: number | null;
  media30Dias: number | null;
  media90Dias: number | null;
  variacao7Sobre30: number | null;
  variacao30Sobre90: number | null;
  direcao: "acelerando" | "reduzindo" | "estavel" | "indeterminada";
  baseConservadora: number | null;
};

export type AnaliseConsumo = {
  janelas: ConsumoJanela[];
  tendencia: TendenciaConsumo;
  coberturaConservadoraDias: number | null;
};


export type EstatisticaEquipe = {
  equipeId: string;
  equipe: Equipe;
  posicoesEstoque: number;
  produtosComEstoque: number;
  posicoesAbaixoDoMinimo: number;
  saidasNoPeriodo: number;
  produtosConsumidos: number;
  mediaSaidasPorDia: number;
  produtosEmRisco: number;
  menorCoberturaDias: number | null;
  valorEstoqueDocumentado: number | null;
  valorConsumoDocumentado: number | null;
};

export type ProdutoEquipeEstatistica = {
  equipeId: string;
  equipe: Equipe;
  estoqueAtual: number;
  estoqueMinimo: number;
  consumoPeriodo: number;
  consumoMedioDiario: number;
  coberturaDias: number | null;
  diasAteMinimo: number | null;
  abaixoDoMinimo: boolean;
};

export type EstatisticasEstado = {
  posicoesEstoque: number;
  produtosComEstoque: number;
  produtosZerados: number;
  posicoesAbaixoDoMinimo: number;
  produtosAbaixoDoMinimo: number;
  produtosEmRisco: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function parseData(data: string): Date {
  const [ano, mes, dia] = data.slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return new Date(NaN);
  return new Date(ano, mes - 1, dia);
}

export function criarPeriodoPadrao(dias = 30): PeriodoEstatisticas {
  const hoje = inicioDoDia(new Date());
  const quantidadeDias = Math.max(1, Math.floor(dias));
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - (quantidadeDias - 1));

  return {
    de: formatarDataISO(inicio),
    ate: formatarDataISO(hoje),
  };
}

export function diferencaDiasPeriodo(periodo: PeriodoEstatisticas): number {
  const de = parseData(periodo.de);
  const ate = parseData(periodo.ate);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return 1;
  return Math.max(1, Math.floor((ate.getTime() - de.getTime()) / DAY_MS) + 1);
}

function calcularSaidasPeriodo(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
): number {
  return filtrarMovimentacoesPeriodo(movimentacoes, periodo)
    .filter((movimentacao) => movimentacao.tipo === "SAIDA")
    .reduce((total, movimentacao) => total + movimentacao.quantidade, 0);
}

function criarJanelaConsumo(periodo: PeriodoEstatisticas, dias: number): PeriodoEstatisticas {
  const ate = periodo.ate;
  const fim = parseData(ate);
  if (Number.isNaN(fim.getTime())) return periodo;
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - (Math.max(1, dias) - 1));
  return { de: formatarDataISO(inicio), ate };
}

function arredondar(valor: number, casas = 4): number {
  return Number(valor.toFixed(casas));
}

export function formatarDataISO(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function analisarConsumo(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  estoqueAtual: number | null = null,
): AnaliseConsumo {
  const janelas = [7, 30, 60, 90, 180, 365].map((dias) => {
    const janela = criarJanelaConsumo(periodo, dias);
    const diasEfetivos = diferencaDiasPeriodo(janela);
    const saidas = calcularSaidasPeriodo(movimentacoes, janela);
    const mediaDiaria = saidas / diasEfetivos;
    return {
      dias,
      inicio: janela.de,
      ate: janela.ate,
      saidas: arredondar(saidas),
      mediaDiaria: arredondar(mediaDiaria),
      mediaSemanal: arredondar(mediaDiaria * 7),
      mediaMensal: arredondar(mediaDiaria * 30.4375),
    };
  });

  const porDias = new Map(janelas.map((janela) => [janela.dias, janela]));
  const media7 = porDias.get(7)?.mediaDiaria ?? null;
  const media30 = porDias.get(30)?.mediaDiaria ?? null;
  const media90 = porDias.get(90)?.mediaDiaria ?? null;

  const variacao = (atual: number | null, anterior: number | null) => {
    if (atual == null || anterior == null || anterior <= 0) return null;
    return arredondar(((atual - anterior) / anterior) * 100, 1);
  };

  const variacao7Sobre30 = variacao(media7, media30);
  const variacao30Sobre90 = variacao(media30, media90);
  let direcao: TendenciaConsumo["direcao"] = "indeterminada";
  const variacaoRecente = variacao7Sobre30 ?? variacao30Sobre90;
  if (variacaoRecente != null) {
    if (variacaoRecente >= 10) direcao = "acelerando";
    else if (variacaoRecente <= -10) direcao = "reduzindo";
    else direcao = "estavel";
  }

  const bases = [media7, media30, media90].filter((valor): valor is number => valor != null && valor > 0);
  const baseConservadora = bases.length ? Math.max(...bases) : null;

  return {
    janelas,
    tendencia: {
      media7Dias: media7,
      media30Dias: media30,
      media90Dias: media90,
      variacao7Sobre30,
      variacao30Sobre90,
      direcao,
      baseConservadora: baseConservadora == null ? null : arredondar(baseConservadora),
    },
    coberturaConservadoraDias:
      baseConservadora == null || estoqueAtual == null
        ? null
        : arredondar(Math.max(0, estoqueAtual) / baseConservadora, 1),
  };
}

export function adicionarDias(dataISO: string, dias: number): string {
  const data = parseData(dataISO);
  if (Number.isNaN(data.getTime())) return "";
  data.setDate(data.getDate() + Math.max(0, Math.ceil(dias)));
  return formatarDataISO(data);
}

export function filtrarMovimentacoesPeriodo(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
): Movimentacao[] {
  return movimentacoes.filter((movimentacao) => {
    const data = movimentacao.data.slice(0, 10);
    return data >= periodo.de && data <= periodo.ate;
  });
}

export function calcularFluxoPeriodo(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
): FluxoPeriodo {
  const filtradas = filtrarMovimentacoesPeriodo(movimentacoes, periodo);
  const produtos = new Set<string>();
  let entradasQuantidade = 0;
  let saidasQuantidade = 0;
  let devolucoesQuantidade = 0;
  let ajustesQuantidade = 0;
  let transferenciasQuantidade = 0;

  for (const movimentacao of filtradas) {
    produtos.add(movimentacao.produto_id);
    switch (movimentacao.tipo) {
      case "ENTRADA":
        entradasQuantidade += movimentacao.quantidade;
        break;
      case "SAIDA":
        saidasQuantidade += movimentacao.quantidade;
        break;
      case "DEVOLUCAO":
        devolucoesQuantidade += movimentacao.quantidade;
        break;
      case "AJUSTE":
        ajustesQuantidade += movimentacao.quantidade;
        break;
      case "TRANSFERENCIA":
        transferenciasQuantidade += movimentacao.quantidade;
        break;
    }
  }

  return {
    movimentacoes: filtradas.length,
    entradasMovimentacoes: filtradas.filter((m) => m.tipo === "ENTRADA").length,
    saidasMovimentacoes: filtradas.filter((m) => m.tipo === "SAIDA").length,
    devolucoesMovimentacoes: filtradas.filter((m) => m.tipo === "DEVOLUCAO").length,
    ajustesMovimentacoes: filtradas.filter((m) => m.tipo === "AJUSTE").length,
    transferenciasMovimentacoes: filtradas.filter((m) => m.tipo === "TRANSFERENCIA").length,
    entradasQuantidade: Number(entradasQuantidade.toFixed(4)),
    saidasQuantidade: Number(saidasQuantidade.toFixed(4)),
    devolucoesQuantidade: Number(devolucoesQuantidade.toFixed(4)),
    ajustesQuantidade: Number(ajustesQuantidade.toFixed(4)),
    transferenciasQuantidade: Number(transferenciasQuantidade.toFixed(4)),
    produtosMovimentados: produtos.size,
  };
}

export function calcularEstadoEstoque(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  unidades: Parameters<typeof montarEstoque>[2],
  categorias: Parameters<typeof montarEstoque>[3],
  equipes: Equipe[],
): EstatisticasEstado {
  const estoque = montarEstoque(produtos, movimentacoes, unidades, categorias, equipes);
  const porProduto = new Map<string, { produto: Produto; estoque: number; abaixo: boolean }>();

  for (const produto of produtos) {
    porProduto.set(produto.id, { produto, estoque: 0, abaixo: false });
  }

  for (const item of estoque) {
    const atual = porProduto.get(item.produto.id);
    if (!atual) continue;
    atual.estoque += item.estoque;
    atual.abaixo = atual.estoque < atual.produto.estoque_minimo;
  }

  const produtosComEstoque = [...porProduto.values()].filter((item) => item.estoque > 0).length;
  const produtosZerados = [...porProduto.values()].filter((item) => item.estoque <= 0).length;

  return {
    posicoesEstoque: estoque.length,
    produtosComEstoque,
    produtosZerados,
    posicoesAbaixoDoMinimo: estoque.filter((item) => item.baixo).length,
    produtosAbaixoDoMinimo: [...porProduto.values()].filter((item) => item.abaixo).length,
    produtosEmRisco: 0,
  };
}

export function calcularProdutoEstatistica(
  produto: Produto,
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
): ProdutoEstatistica {
  const movsProduto = movimentacoes.filter((m) => m.produto_id === produto.id);
  const estoqueAtual = movsProduto.reduce((saldo, movimentacao) => {
    switch (movimentacao.tipo) {
      case "ENTRADA":
      case "DEVOLUCAO":
        return saldo + movimentacao.quantidade;
      case "SAIDA":
        return saldo - movimentacao.quantidade;
      case "AJUSTE":
      case "TRANSFERENCIA":
        return saldo + (movimentacao.sinal ?? 1) * movimentacao.quantidade;
      default:
        return saldo;
    }
  }, 0);

  const movsPeriodo = filtrarMovimentacoesPeriodo(movsProduto, periodo);
  const consumoPeriodo = movsPeriodo
    .filter((m) => m.tipo === "SAIDA")
    .reduce((total, movimentacao) => total + movimentacao.quantidade, 0);
  const diasPeriodo = diferencaDiasPeriodo(periodo);
  const consumoMedioDiario = consumoPeriodo / diasPeriodo;
  const consumoMedioSemanal = consumoMedioDiario * 7;
  const consumoMedioMensal = consumoMedioDiario * 30.4375;
  const estoqueMinimo = Math.max(0, produto.estoque_minimo ?? 0);

  const coberturaDias = consumoMedioDiario > 0 ? Math.max(0, estoqueAtual) / consumoMedioDiario : null;
  const saldoAcimaDoMinimo = Math.max(0, estoqueAtual - estoqueMinimo);
  const diasAteMinimo = consumoMedioDiario > 0 ? saldoAcimaDoMinimo / consumoMedioDiario : null;

  const baseData = parseData(periodo.ate);
  const dataEstimadaRuptura = coberturaDias === null ? null : adicionarDias(periodo.ate, coberturaDias);
  const dataEstimadaMinimo = diasAteMinimo === null ? null : adicionarDias(periodo.ate, diasAteMinimo);

  return {
    produtoId: produto.id,
    produto,
    estoqueAtual: Number(estoqueAtual.toFixed(4)),
    estoqueMinimo,
    consumoPeriodo: Number(consumoPeriodo.toFixed(4)),
    consumoMedioDiario: Number(consumoMedioDiario.toFixed(4)),
    consumoMedioSemanal: Number(consumoMedioSemanal.toFixed(4)),
    consumoMedioMensal: Number(consumoMedioMensal.toFixed(4)),
    coberturaDias: coberturaDias === null ? null : Number(coberturaDias.toFixed(1)),
    diasAteMinimo: diasAteMinimo === null ? null : Number(diasAteMinimo.toFixed(1)),
    dataEstimadaRuptura:
      baseData && coberturaDias !== null && estoqueAtual > 0 ? dataEstimadaRuptura : null,
    dataEstimadaMinimo:
      baseData && diasAteMinimo !== null && estoqueAtual > estoqueMinimo
        ? dataEstimadaMinimo
        : null,
    abaixoDoMinimo: estoqueAtual < estoqueMinimo,
    semConsumo: consumoPeriodo <= 0,
  };
}

export function calcularProdutoPorEquipe(
  produto: Produto,
  movimentacoes: Movimentacao[],
  equipes: Equipe[],
  periodo: PeriodoEstatisticas,
): ProdutoEquipeEstatistica[] {
  return equipes
    .map((equipe) => {
      const analise = calcularProdutoEstatistica(
        produto,
        movimentacoes.filter((movimentacao) => movimentacao.equipe_id === equipe.id),
        periodo,
      );
      return {
        equipeId: equipe.id,
        equipe,
        estoqueAtual: analise.estoqueAtual,
        estoqueMinimo: analise.estoqueMinimo,
        consumoPeriodo: analise.consumoPeriodo,
        consumoMedioDiario: analise.consumoMedioDiario,
        coberturaDias: analise.coberturaDias,
        diasAteMinimo: analise.diasAteMinimo,
        abaixoDoMinimo: analise.abaixoDoMinimo,
      };
    })
    .filter((item) => item.estoqueAtual > 0 || item.consumoPeriodo > 0)
    .sort((a, b) => b.estoqueAtual - a.estoqueAtual || a.equipe.nome.localeCompare(b.equipe.nome));
}

export function calcularEstatisticasEquipes(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  unidades: Parameters<typeof montarEstoque>[2],
  categorias: Parameters<typeof montarEstoque>[3],
  equipes: Equipe[],
  periodo: PeriodoEstatisticas,
  custos?: Map<string, CustoProdutoDocumentado>,
  documentosAtivos = false,
): EstatisticaEquipe[] {
  const estoque = montarEstoque(produtos, movimentacoes, unidades, categorias, equipes);
  const movsPeriodo = filtrarMovimentacoesPeriodo(movimentacoes, periodo);
  const diasPeriodo = diferencaDiasPeriodo(periodo);
  const custoMap = custos ?? new Map<string, CustoProdutoDocumentado>();

  return equipes
    .map((equipe) => {
      const estoqueEquipe = estoque.filter((item) => item.equipe.id === equipe.id);
      const produtosComEstoque = new Set(
        estoqueEquipe.filter((item) => item.estoque > 0).map((item) => item.produto.id),
      );
      const abaixo = estoqueEquipe.filter((item) => item.baixo).length;
      const movsSaida = movsPeriodo.filter(
        (movimentacao) => movimentacao.equipe_id === equipe.id && movimentacao.tipo === "SAIDA",
      );
      const produtosConsumidos = new Set(movsSaida.map((movimentacao) => movimentacao.produto_id)).size;

      const analises = produtos
        .map((produto) =>
          calcularProdutoEstatistica(
            produto,
            movimentacoes.filter((movimentacao) => movimentacao.equipe_id === equipe.id),
            periodo,
          ),
        )
        .filter((item) => item.estoqueAtual > 0 || item.consumoPeriodo > 0);

      const coberturas = analises
        .map((item) => item.coberturaDias)
        .filter((valor): valor is number => valor != null && valor >= 0);

      let valorEstoqueDocumentado: number | null = null;
      let valorConsumoDocumentado: number | null = null;
      if (documentosAtivos) {
        valorEstoqueDocumentado = 0;
        valorConsumoDocumentado = 0;
        for (const item of estoqueEquipe) {
          if (item.estoque <= 0) continue;
          const custo = custoMap.get(item.produto.id)?.custoMedioUnitario;
          if (custo != null) valorEstoqueDocumentado += item.estoque * custo;
        }
        for (const movimentacao of movsSaida) {
          const custo = custoMap.get(movimentacao.produto_id)?.custoMedioUnitario;
          if (custo != null) valorConsumoDocumentado += movimentacao.quantidade * custo;
        }
        valorEstoqueDocumentado = arredondar(valorEstoqueDocumentado, 2);
        valorConsumoDocumentado = arredondar(valorConsumoDocumentado, 2);
      }

      return {
        equipeId: equipe.id,
        equipe,
        posicoesEstoque: estoqueEquipe.filter((item) => item.estoque > 0).length,
        produtosComEstoque: produtosComEstoque.size,
        posicoesAbaixoDoMinimo: abaixo,
        saidasNoPeriodo: movsSaida.length,
        produtosConsumidos,
        mediaSaidasPorDia: arredondar(movsSaida.length / diasPeriodo, 2),
        produtosEmRisco: analises.filter(
          (item) => item.estoqueAtual > 0 && item.coberturaDias != null && item.coberturaDias <= 30,
        ).length,
        menorCoberturaDias: coberturas.length ? arredondar(Math.min(...coberturas), 1) : null,
        valorEstoqueDocumentado,
        valorConsumoDocumentado,
      };
    })
    .filter((item) =>
      item.posicoesEstoque > 0 || item.saidasNoPeriodo > 0 || item.produtosEmRisco > 0,
    )
    .sort((a, b) => b.saidasNoPeriodo - a.saidasNoPeriodo || b.posicoesEstoque - a.posicoesEstoque);
}

export type CustoProdutoDocumentado = {
  produtoId: string;
  quantidadeDocumentada: number;
  custoMedioUnitario: number | null;
  coberturaDocumental: number;
};

/**
 * Calcula custo médio documentado somente a partir de itens de documentos que
 * efetivamente originaram entradas de estoque por meio de `documento_item_id`.
 * Isso evita atribuir preço a um produto apenas porque existe um documento
 * cadastrado sem que ele tenha sido lançado no estoque.
 */
export function calcularCustosDocumentados(
  produtoIds: string[],
  documentoItens: DocumentoItem[],
  movimentacoes: Movimentacao[],
  documentosAtivos = true,
): Map<string, CustoProdutoDocumentado> {
  const resultado = new Map<string, CustoProdutoDocumentado>();
  if (!documentosAtivos) return resultado;

  const itensPorId = new Map(
    documentoItens.filter(
      (item) => item.produto_id && item.valor_unitario != null && item.valor_unitario >= 0,
    ).map((item) => [item.id, item]),
  );
  const porProduto = new Map<string, { quantidade: number; valor: number }>();

  for (const movimentacao of movimentacoes) {
    if (movimentacao.tipo !== "ENTRADA" || !movimentacao.documento_item_id) continue;
    const item = itensPorId.get(movimentacao.documento_item_id);
    if (!item?.produto_id || item.valor_unitario == null) continue;

    const atual = porProduto.get(item.produto_id) ?? { quantidade: 0, valor: 0 };
    atual.quantidade += movimentacao.quantidade;
    atual.valor += movimentacao.quantidade * item.valor_unitario;
    porProduto.set(item.produto_id, atual);
  }

  for (const produtoId of produtoIds) {
    const atual = porProduto.get(produtoId);
    if (!atual || atual.quantidade <= 0) {
      resultado.set(produtoId, {
        produtoId,
        quantidadeDocumentada: 0,
        custoMedioUnitario: null,
        coberturaDocumental: 0,
      });
      continue;
    }

    resultado.set(produtoId, {
      produtoId,
      quantidadeDocumentada: Number(atual.quantidade.toFixed(4)),
      custoMedioUnitario: Number((atual.valor / atual.quantidade).toFixed(4)),
      coberturaDocumental: 0,
    });
  }

  return resultado;
}

export type ResumoFinanceiro = {
  valorEstoqueDocumentado: number;
  posicoesComCusto: number;
  posicoesSemCusto: number;
  coberturaPorPosicoes: number;
  valorSaidasDocumentado: number;
  saidasSemCusto: number;
};

export type ValorAgrupado = {
  id: string;
  quantidadeSaida: number;
  saidas: number;
  valorDocumentado: number;
  semCusto: number;
};

export function calcularResumoFinanceiro(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  unidades: Parameters<typeof montarEstoque>[2],
  categorias: Parameters<typeof montarEstoque>[3],
  equipes: Equipe[],
  custos: Map<string, CustoProdutoDocumentado>,
  periodo: PeriodoEstatisticas,
  documentosAtivos: boolean,
): ResumoFinanceiro | null {
  if (!documentosAtivos) return null;

  const estoque = montarEstoque(produtos, movimentacoes, unidades, categorias, equipes).filter(
    (item) => item.estoque > 0,
  );

  let valorEstoqueDocumentado = 0;
  let posicoesComCusto = 0;

  for (const item of estoque) {
    const custo = custos.get(item.produto.id)?.custoMedioUnitario;
    if (custo == null) continue;
    valorEstoqueDocumentado += item.estoque * custo;
    posicoesComCusto += 1;
  }

  const movsPeriodo = filtrarMovimentacoesPeriodo(movimentacoes, periodo).filter(
    (movimentacao) => movimentacao.tipo === "SAIDA",
  );
  let valorSaidasDocumentado = 0;
  let saidasSemCusto = 0;

  for (const movimentacao of movsPeriodo) {
    const custo = custos.get(movimentacao.produto_id)?.custoMedioUnitario;
    if (custo == null) {
      saidasSemCusto += 1;
      continue;
    }
    valorSaidasDocumentado += movimentacao.quantidade * custo;
  }

  return {
    valorEstoqueDocumentado: Number(valorEstoqueDocumentado.toFixed(2)),
    posicoesComCusto,
    posicoesSemCusto: Math.max(0, estoque.length - posicoesComCusto),
    coberturaPorPosicoes: estoque.length ? Number(((posicoesComCusto / estoque.length) * 100).toFixed(1)) : 100,
    valorSaidasDocumentado: Number(valorSaidasDocumentado.toFixed(2)),
    saidasSemCusto,
  };
}

export function calcularValorPorGrupo(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  custos: Map<string, CustoProdutoDocumentado>,
  key: (movimentacao: Movimentacao) => string | null | undefined,
  limite = 8,
): ValorAgrupado[] {
  const map = new Map<string, ValorAgrupado>();

  for (const movimentacao of filtrarMovimentacoesPeriodo(movimentacoes, periodo)) {
    if (movimentacao.tipo !== "SAIDA") continue;
    const id = key(movimentacao) ?? "__sem__";
    const atual = map.get(id) ?? {
      id,
      quantidadeSaida: 0,
      saidas: 0,
      valorDocumentado: 0,
      semCusto: 0,
    };
    atual.quantidadeSaida += movimentacao.quantidade;
    atual.saidas += 1;
    const custo = custos.get(movimentacao.produto_id)?.custoMedioUnitario;
    if (custo == null) {
      atual.semCusto += 1;
    } else {
      atual.valorDocumentado += movimentacao.quantidade * custo;
    }
    map.set(id, atual);
  }

  return [...map.values()]
    .map((item) => ({
      ...item,
      quantidadeSaida: Number(item.quantidadeSaida.toFixed(4)),
      valorDocumentado: Number(item.valorDocumentado.toFixed(2)),
    }))
    .sort((a, b) => b.valorDocumentado - a.valorDocumentado || b.saidas - a.saidas)
    .slice(0, limite);
}


export type FluxoGraficoEquipe = {
  entradas: number;
  saidas: number;
};

export type FluxoGraficoPeriodo = {
  periodo: string;
  entradas: number;
  saidas: number;
  porEquipe: Record<string, FluxoGraficoEquipe>;
};

/** Agrupa o fluxo global por período, somando todas as movimentações elegíveis. */
export function agruparFluxoPorPeriodo(
  movs: Movimentacao[],
  grupo: "dia" | "semana" | "mes",
): Array<Pick<FluxoGraficoPeriodo, "periodo" | "entradas" | "saidas">> {
  const agrupado = agruparFluxoPorPeriodoEEquipe(movs, grupo);

  return agrupado.map(({ periodo, entradas, saidas }) => ({
    periodo,
    entradas,
    saidas,
  }));
}

/** Agrupa Entradas e Saídas por período e, quando necessário, por equipe. */
export function agruparFluxoPorPeriodoEEquipe(
  movs: Movimentacao[],
  grupo: "dia" | "semana" | "mes",
): FluxoGraficoPeriodo[] {
  const chave = (data: string) => {
    const d = new Date(`${data}T00:00:00`);
    if (Number.isNaN(d.getTime())) return data;
    if (grupo === "mes") return data.slice(0, 7);
    if (grupo === "semana") {
      const dia = d.getDay();
      const ini = new Date(d);
      ini.setDate(d.getDate() - dia);
      return ini.toISOString().slice(0, 10);
    }
    return data;
  };

  const map = new Map<string, FluxoGraficoPeriodo>();

  for (const m of movs) {
    const periodo = chave(m.data);
    const atual = map.get(periodo) ?? { periodo, entradas: 0, saidas: 0, porEquipe: {} };
    const equipeId = m.equipe_id ?? "__sem_equipe__";
    const porEquipe = atual.porEquipe[equipeId] ?? { entradas: 0, saidas: 0 };

    if (m.tipo === "SAIDA") {
      atual.saidas += m.quantidade;
      porEquipe.saidas += m.quantidade;
    } else if (m.tipo === "ENTRADA" || m.tipo === "DEVOLUCAO") {
      atual.entradas += m.quantidade;
      porEquipe.entradas += m.quantidade;
    }

    atual.porEquipe[equipeId] = porEquipe;
    map.set(periodo, atual);
  }

  return [...map.values()]
    .map((item) => ({
      ...item,
      entradas: Number(item.entradas.toFixed(4)),
      saidas: Number(item.saidas.toFixed(4)),
      porEquipe: Object.fromEntries(
        Object.entries(item.porEquipe).map(([equipeId, fluxo]) => [
          equipeId,
          {
            entradas: Number(fluxo.entradas.toFixed(4)),
            saidas: Number(fluxo.saidas.toFixed(4)),
          },
        ]),
      ),
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/** Identificador usado para agrupar movimentações de estoques sem equipe vinculada. */
export const SEM_EQUIPE_ID = "__sem_equipe__";

export type FluxoPorEquipe = {
  /** id real da equipe, ou SEM_EQUIPE_ID para estoques não vinculados a uma equipe. */
  equipeId: string;
  entradas: number;
  saidas: number;
};

/**
 * Agrupa as movimentações (já filtradas por período/produto/equipe conforme os
 * filtros ativos na tela) somando entradas e saídas por estoque de equipe.
 * Cada equipe gera um par de barras (entradas/saídas); estoques sem equipe
 * vinculada são agrupados sob SEM_EQUIPE_ID.
 */
export function agruparFluxoPorEquipe(movs: Movimentacao[]): FluxoPorEquipe[] {
  const map = new Map<string, FluxoPorEquipe>();

  for (const m of movs) {
    const equipeId = m.equipe_id ?? SEM_EQUIPE_ID;
    const atual = map.get(equipeId) ?? { equipeId, entradas: 0, saidas: 0 };

    if (m.tipo === "SAIDA") {
      atual.saidas += m.quantidade;
    } else if (m.tipo === "ENTRADA" || m.tipo === "DEVOLUCAO") {
      atual.entradas += m.quantidade;
    }

    map.set(equipeId, atual);
  }

  return [...map.values()].map((item) => ({
    ...item,
    entradas: Number(item.entradas.toFixed(4)),
    saidas: Number(item.saidas.toFixed(4)),
  }));
}