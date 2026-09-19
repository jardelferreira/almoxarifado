import type { DocumentoItem, Equipe, Inventario, InventarioItem, Movimentacao, Produto } from "@/types";
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
  periodoEfetivoConsumo: PeriodoEstatisticas | null;
  intervaloMedioSaidasDias: number | null;
  abaixoDoMinimo: boolean;
  semConsumo: boolean;
};

export type RankingConsumoProduto = {
  produtoId: string;
  produto: Produto;
  saidas: number;
  diasComSaida: number;
  frequenciaDiaria: number;
  participacaoPercentual: number | null;
};

export type ParetoConsumoProduto = {
  produtoId: string;
  produto: Produto;
  saidas: number;
  participacaoPercentual: number;
  acumuladoPercentual: number;
};

export type FaixaRiscoCobertura = "critico" | "atencao" | "adequado";

/** Número mínimo de registros de saída no período para um produto entrar no mapa de risco. */
export const MIN_SAIDAS_MAPA_RISCO = 3;

export type ItemRiscoCobertura = {
  produtoId: string;
  produto: Produto;
  coberturaDias: number | null;
  estoqueAtual: number;
  consumoMedioDiario: number;
  saidasPeriodo: number;
  faixa: FaixaRiscoCobertura;
};

export type MapaRiscoCobertura = {
  totalProdutos: number;
  ruptura: number;
  critico: number;
  atencao: number;
  adequado: number;
  semConsumo: number;
  excluidosSemEstoque: number;
  excluidosBaixaAtividade: number;
  minSaidas: number;
  itensPrioritarios: ItemRiscoCobertura[];
};

export type PrioridadeReposicao = "imediata" | "prioritaria";

export type ItemReposicao = {
  produtoId: string;
  produto: Produto;
  estoqueAtual: number;
  estoqueMinimo: number;
  saidasPeriodo: number;
  consumoMedioDiario: number;
  coberturaDias: number | null;
  estoqueAlvo: number;
  quantidadeSugerida: number;
  prioridade: PrioridadeReposicao;
};

export type AnaliseReposicao = {
  diasAlvo: number;
  minSaidas: number;
  totalItens: number;
  reposicaoImediata: number;
  reposicaoPrioritaria: number;
  excluidosBaixaAtividade: number;
  excluidosPorConfiguracao: number;
  itens: ItemReposicao[];
};

export type DirecaoDesvioConsumo = "aumento" | "queda";

export type DesvioConsumoProduto = {
  produtoId: string;
  produto: Produto;
  saidasAtual: number;
  saidasAnterior: number;
  variacaoPercentual: number | null;
  direcao: DirecaoDesvioConsumo;
  desvioAbsolutoPercentual: number;
};

export type DesvioConsumoEquipe = {
  equipeId: string | null;
  equipe: Equipe | null;
  saidasAtual: number;
  saidasAnterior: number;
  variacaoPercentual: number | null;
  direcao: DirecaoDesvioConsumo;
  desvioAbsolutoPercentual: number;
};

/** Mínimo de registros de saída em pelo menos uma das janelas para análise de desvio. */
export const MIN_SAIDAS_DESVIO_CONSUMO = 3;

export type VigiaPrioridade = "alta" | "media" | "info";

export type VigiaTipoAlerta =
  | "REPOSICAO"
  | "RISCO_COBERTURA"
  | "DESVIO_PRODUTO"
  | "DESVIO_EQUIPE"
  | "QUALIDADE";

export type VigiaAcao =
  | "REPOSICAO"
  | "PARAMETROS_PRODUTO"
  | "RISCO_PRODUTO"
  | "DESVIO_PRODUTO"
  | "DESVIO_EQUIPE"
  | "QUALIDADE";

export type VigiaAlerta = {
  id: string;
  tipo: VigiaTipoAlerta;
  prioridade: VigiaPrioridade;
  titulo: string;
  descricao: string;
  indicador?: string | null;
  regra?: string | null;
  produtoId?: string | null;
  equipeId?: string | null;
  movimentacaoId?: string | null;
  data?: string | null;
  acaoPrincipal?: VigiaAcao;
  acaoSecundaria?: VigiaAcao | null;
};

export type ResumoVigiaOperacional = {
  periodo: PeriodoEstatisticas;
  criticos: number;
  atencao: number;
  reposicoes: number;
  reposicoesImediatas: number;
  reposicoesExcluidasConfiguracao: number;
  desvios: number;
  alertasQualidade: number;
  alertasQualidadeAltos: number;
  alertas: VigiaAlerta[];
};


/** Variação absoluta mínima para que um desvio de consumo seja considerado relevante. */
export const LIMIAR_DESVIO_CONSUMO_PERCENTUAL = 50;

export type RegularidadeConsumo = {
  produtoId: string;
  diasComSaida: number;
  intervaloMedioDias: number | null;
  menorIntervaloDias: number | null;
  maiorIntervaloDias: number | null;
  percentualDiasComSaida: number;
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

export type QualidadeSeveridade = "alta" | "media" | "baixa";

export type QualidadeAlerta = {
  id: string;
  tipo:
    | "ESTOQUE_NEGATIVO_HISTORICO"
    | "SAIDA_SEM_RESPONSAVEL"
    | "ENTRADA_SEM_DOCUMENTO"
    | "AJUSTE_SEM_JUSTIFICATIVA"
    | "QUANTIDADE_INVALIDA"
    | "PRODUTO_INEXISTENTE"
    | "EQUIPE_INEXISTENTE";
  severidade: QualidadeSeveridade;
  data: string;
  movimentacaoId: string;
  produtoId: string | null;
  equipeId: string | null;
  tipoMovimentacao: Movimentacao["tipo"];
  quantidade: number;
  funcionarioId: string | null;
  encarregadoId: string | null;
  documentoId: string | null;
  observacao: string | null;
  saldoAnterior: number | null;
  saldoPosterior: number | null;
  mensagem: string;
  comoCorrigir: string;
};

export type ResumoQualidadeEstoque = {
  alertas: QualidadeAlerta[];
  total: number;
  altas: number;
  medias: number;
  baixas: number;
  movimentacoesAnalisadas: number;
  posicoesComSaldoNegativo: number;
  saidasSemResponsavel: number;
  entradasSemDocumento: number;
  ajustesSemJustificativa: number;
  quantidadesInvalidas: number;
  produtosInexistentes: number;
  equipesInexistentes: number;
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

export type ComparacaoPeriodo = {
  atual: FluxoPeriodo;
  anterior: FluxoPeriodo;
  periodoAtual: PeriodoEstatisticas;
  periodoAnterior: PeriodoEstatisticas;
  dias: number;
  variacoes: {
    movimentacoes: number | null;
    entradasMovimentacoes: number | null;
    saidasMovimentacoes: number | null;
    devolucoesMovimentacoes: number | null;
    produtosMovimentados: number | null;
    saidasQuantidade: number | null;
    entradasQuantidade: number | null;
  };
};

export function criarPeriodoAnterior(periodo: PeriodoEstatisticas): PeriodoEstatisticas {
  const dias = diferencaDiasPeriodo(periodo);
  const ateAnterior = parseData(periodo.de);
  if (Number.isNaN(ateAnterior.getTime())) return periodo;
  ateAnterior.setDate(ateAnterior.getDate() - 1);
  const deAnterior = new Date(ateAnterior);
  deAnterior.setDate(deAnterior.getDate() - (dias - 1));
  return {
    de: formatarDataISO(deAnterior),
    ate: formatarDataISO(ateAnterior),
  };
}

function calcularVariacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return arredondar(((atual - anterior) / Math.abs(anterior)) * 100, 1);
}

export function calcularComparacaoPeriodos(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
): ComparacaoPeriodo {
  const periodoAnterior = criarPeriodoAnterior(periodo);
  const atual = calcularFluxoPeriodo(movimentacoes, periodo);
  const anterior = calcularFluxoPeriodo(movimentacoes, periodoAnterior);
  return {
    atual,
    anterior,
    periodoAtual: periodo,
    periodoAnterior,
    dias: diferencaDiasPeriodo(periodo),
    variacoes: {
      movimentacoes: calcularVariacaoPercentual(atual.movimentacoes, anterior.movimentacoes),
      entradasMovimentacoes: calcularVariacaoPercentual(atual.entradasMovimentacoes, anterior.entradasMovimentacoes),
      saidasMovimentacoes: calcularVariacaoPercentual(atual.saidasMovimentacoes, anterior.saidasMovimentacoes),
      devolucoesMovimentacoes: calcularVariacaoPercentual(atual.devolucoesMovimentacoes, anterior.devolucoesMovimentacoes),
      produtosMovimentados: calcularVariacaoPercentual(atual.produtosMovimentados, anterior.produtosMovimentados),
      saidasQuantidade: calcularVariacaoPercentual(atual.saidasQuantidade, anterior.saidasQuantidade),
      entradasQuantidade: calcularVariacaoPercentual(atual.entradasQuantidade, anterior.entradasQuantidade),
    },
  };
}


export type ComparacaoEquipe = {
  equipeId: string;
  atual: {
    movimentacoes: number;
    entradas: number;
    saidas: number;
    produtos: number;
  };
  anterior: {
    movimentacoes: number;
    entradas: number;
    saidas: number;
    produtos: number;
  };
  variacoes: {
    movimentacoes: number | null;
    entradas: number | null;
    saidas: number | null;
    produtos: number | null;
  };
};

/** Compara o volume operacional entre o período atual e o anterior por equipe. */
export function calcularComparacaoPorEquipe(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
): ComparacaoEquipe[] {
  const periodoAnterior = criarPeriodoAnterior(periodo);
  const atual = filtrarMovimentacoesPeriodo(movimentacoes, periodo);
  const anterior = filtrarMovimentacoesPeriodo(movimentacoes, periodoAnterior);
  const equipes = new Set<string>([
    ...atual.map((m) => m.equipe_id ?? SEM_EQUIPE_ID),
    ...anterior.map((m) => m.equipe_id ?? SEM_EQUIPE_ID),
  ]);

  const calcular = (movs: Movimentacao[]) => {
    const porEquipe = new Map<string, { movimentacoes: number; entradas: number; saidas: number; produtos: Set<string> }>();
    for (const mov of movs) {
      const equipeId = mov.equipe_id ?? SEM_EQUIPE_ID;
      const item = porEquipe.get(equipeId) ?? { movimentacoes: 0, entradas: 0, saidas: 0, produtos: new Set<string>() };
      item.movimentacoes += 1;
      item.produtos.add(mov.produto_id);
      if (mov.tipo === "ENTRADA" || mov.tipo === "DEVOLUCAO") item.entradas += 1;
      if (mov.tipo === "SAIDA") item.saidas += 1;
      porEquipe.set(equipeId, item);
    }
    return porEquipe;
  };

  const porEquipeAtual = calcular(atual);
  const porEquipeAnterior = calcular(anterior);

  return [...equipes]
    .map((equipeId) => {
      const atualEquipe = porEquipeAtual.get(equipeId);
      const anteriorEquipe = porEquipeAnterior.get(equipeId);
      const atualResumo = {
        movimentacoes: atualEquipe?.movimentacoes ?? 0,
        entradas: atualEquipe?.entradas ?? 0,
        saidas: atualEquipe?.saidas ?? 0,
        produtos: atualEquipe?.produtos.size ?? 0,
      };
      const anteriorResumo = {
        movimentacoes: anteriorEquipe?.movimentacoes ?? 0,
        entradas: anteriorEquipe?.entradas ?? 0,
        saidas: anteriorEquipe?.saidas ?? 0,
        produtos: anteriorEquipe?.produtos.size ?? 0,
      };
      return {
        equipeId,
        atual: atualResumo,
        anterior: anteriorResumo,
        variacoes: {
          movimentacoes: calcularVariacaoPercentual(atualResumo.movimentacoes, anteriorResumo.movimentacoes),
          entradas: calcularVariacaoPercentual(atualResumo.entradas, anteriorResumo.entradas),
          saidas: calcularVariacaoPercentual(atualResumo.saidas, anteriorResumo.saidas),
          produtos: calcularVariacaoPercentual(atualResumo.produtos, anteriorResumo.produtos),
        },
      };
    })
    .filter((item) => item.atual.movimentacoes > 0 || item.anterior.movimentacoes > 0)
    .sort((a, b) => {
      if (b.atual.movimentacoes !== a.atual.movimentacoes) {
        return b.atual.movimentacoes - a.atual.movimentacoes;
      }
      return b.anterior.movimentacoes - a.anterior.movimentacoes;
    });
}


export type ComparacaoProduto = {
  produtoId: string;
  atual: {
    movimentacoes: number;
    entradas: number;
    saidas: number;
  };
  anterior: {
    movimentacoes: number;
    entradas: number;
    saidas: number;
  };
  variacoes: {
    movimentacoes: number | null;
    entradas: number | null;
    saidas: number | null;
  };
};

/** Compara o volume operacional entre o período atual e o anterior por produto. */
export function calcularComparacaoPorProduto(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  limite = 10,
): ComparacaoProduto[] {
  const periodoAnterior = criarPeriodoAnterior(periodo);
  const atual = filtrarMovimentacoesPeriodo(movimentacoes, periodo);
  const anterior = filtrarMovimentacoesPeriodo(movimentacoes, periodoAnterior);
  const produtos = new Set<string>([
    ...atual.map((mov) => mov.produto_id),
    ...anterior.map((mov) => mov.produto_id),
  ]);

  const calcular = (movs: Movimentacao[]) => {
    const porProduto = new Map<string, { movimentacoes: number; entradas: number; saidas: number }>();
    for (const mov of movs) {
      const item = porProduto.get(mov.produto_id) ?? { movimentacoes: 0, entradas: 0, saidas: 0 };
      item.movimentacoes += 1;
      if (mov.tipo === "ENTRADA" || mov.tipo === "DEVOLUCAO") item.entradas += 1;
      if (mov.tipo === "SAIDA") item.saidas += 1;
      porProduto.set(mov.produto_id, item);
    }
    return porProduto;
  };

  const porProdutoAtual = calcular(atual);
  const porProdutoAnterior = calcular(anterior);

  return [...produtos]
    .map((produtoId) => {
      const atualProduto = porProdutoAtual.get(produtoId);
      const anteriorProduto = porProdutoAnterior.get(produtoId);
      const atualResumo = {
        movimentacoes: atualProduto?.movimentacoes ?? 0,
        entradas: atualProduto?.entradas ?? 0,
        saidas: atualProduto?.saidas ?? 0,
      };
      const anteriorResumo = {
        movimentacoes: anteriorProduto?.movimentacoes ?? 0,
        entradas: anteriorProduto?.entradas ?? 0,
        saidas: anteriorProduto?.saidas ?? 0,
      };
      return {
        produtoId,
        atual: atualResumo,
        anterior: anteriorResumo,
        variacoes: {
          movimentacoes: calcularVariacaoPercentual(atualResumo.movimentacoes, anteriorResumo.movimentacoes),
          entradas: calcularVariacaoPercentual(atualResumo.entradas, anteriorResumo.entradas),
          saidas: calcularVariacaoPercentual(atualResumo.saidas, anteriorResumo.saidas),
        },
      };
    })
    .filter((item) => item.atual.movimentacoes > 0 || item.anterior.movimentacoes > 0)
    .sort((a, b) => {
      if (b.atual.movimentacoes !== a.atual.movimentacoes) {
        return b.atual.movimentacoes - a.atual.movimentacoes;
      }
      return b.anterior.movimentacoes - a.anterior.movimentacoes;
    })
    .slice(0, Math.max(1, limite));
}

export const SEM_RESPONSAVEL_ID = "__SEM_RESPONSAVEL__";

export type ComparacaoResponsavel = {
  responsavelId: string;
  atual: {
    movimentacoes: number;
    entradas: number;
    saidas: number;
  };
  anterior: {
    movimentacoes: number;
    entradas: number;
    saidas: number;
  };
  variacoes: {
    movimentacoes: number | null;
    entradas: number | null;
    saidas: number | null;
  };
};

/** Compara o volume operacional entre o período atual e o anterior por responsável. */
export function calcularComparacaoPorResponsavel(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  limite = 8,
): ComparacaoResponsavel[] {
  const periodoAnterior = criarPeriodoAnterior(periodo);
  const atual = filtrarMovimentacoesPeriodo(movimentacoes, periodo);
  const anterior = filtrarMovimentacoesPeriodo(movimentacoes, periodoAnterior);
  const responsaveis = new Set<string>([
    ...atual.map((mov) => mov.encarregado_id ?? mov.funcionario_id ?? SEM_RESPONSAVEL_ID),
    ...anterior.map((mov) => mov.encarregado_id ?? mov.funcionario_id ?? SEM_RESPONSAVEL_ID),
  ]);

  const calcular = (movs: Movimentacao[]) => {
    const mapa = new Map<string, { movimentacoes: number; entradas: number; saidas: number }>();
    for (const mov of movs) {
      const responsavelId = mov.encarregado_id ?? mov.funcionario_id ?? SEM_RESPONSAVEL_ID;
      const item = mapa.get(responsavelId) ?? { movimentacoes: 0, entradas: 0, saidas: 0 };
      item.movimentacoes += 1;
      if (mov.tipo === "ENTRADA" || mov.tipo === "DEVOLUCAO") item.entradas += 1;
      if (mov.tipo === "SAIDA") item.saidas += 1;
      mapa.set(responsavelId, item);
    }
    return mapa;
  };

  const porResponsavelAtual = calcular(atual);
  const porResponsavelAnterior = calcular(anterior);

  return [...responsaveis]
    .map((responsavelId) => {
      const atualResumo = porResponsavelAtual.get(responsavelId) ?? { movimentacoes: 0, entradas: 0, saidas: 0 };
      const anteriorResumo = porResponsavelAnterior.get(responsavelId) ?? { movimentacoes: 0, entradas: 0, saidas: 0 };
      return {
        responsavelId,
        atual: atualResumo,
        anterior: anteriorResumo,
        variacoes: {
          movimentacoes: calcularVariacaoPercentual(atualResumo.movimentacoes, anteriorResumo.movimentacoes),
          entradas: calcularVariacaoPercentual(atualResumo.entradas, anteriorResumo.entradas),
          saidas: calcularVariacaoPercentual(atualResumo.saidas, anteriorResumo.saidas),
        },
      };
    })
    .filter((item) => item.atual.movimentacoes > 0 || item.anterior.movimentacoes > 0)
    .sort((a, b) => {
      if (b.atual.movimentacoes !== a.atual.movimentacoes) {
        return b.atual.movimentacoes - a.atual.movimentacoes;
      }
      return b.anterior.movimentacoes - a.anterior.movimentacoes;
    })
    .slice(0, Math.max(1, limite));
}

export type PeriodoEfetivoConsumo = PeriodoEstatisticas & {
  intervaloMedioSaidasDias: number | null;
};

function calcularPeriodoEfetivoConsumoDatas(
  datasSaida: Iterable<string>,
  periodo: PeriodoEstatisticas,
): PeriodoEfetivoConsumo | null {
  const diasSaida = [...new Set(datasSaida)].sort();
  if (!diasSaida.length) return null;

  let intervaloMedioSaidasDias: number | null = null;
  let ate = periodo.ate;

  if (diasSaida.length >= 2) {
    const intervalos = diasSaida
      .slice(1)
      .map((data, index) => {
        const dataAnterior = diasSaida[index];
        if (!dataAnterior) return null;

        const inicio = parseData(dataAnterior);
        const fim = parseData(data);
        if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;
        return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / DAY_MS));
      })
      .filter((valor): valor is number => valor !== null);

    if (intervalos.length) {
      const mediaBruta = intervalos.reduce((total, valor) => total + valor, 0) / intervalos.length;
      intervaloMedioSaidasDias = Math.max(1, Math.round(mediaBruta));
      const ultimaDataSaida = diasSaida[diasSaida.length - 1];
      if (ultimaDataSaida) {
        const fimProjetado = adicionarDias(ultimaDataSaida, intervaloMedioSaidasDias);
        if (fimProjetado && fimProjetado < ate) ate = fimProjetado;
      }
    }
  }

  const primeiraDataSaida = diasSaida[0];
  if (!primeiraDataSaida) return null;

  return {
    de: primeiraDataSaida,
    ate,
    intervaloMedioSaidasDias,
  };
}

function calcularPeriodoEfetivoConsumo(
  movimentacoesProduto: Movimentacao[],
  periodo: PeriodoEstatisticas,
): PeriodoEfetivoConsumo | null {
  return calcularPeriodoEfetivoConsumoDatas(
    filtrarMovimentacoesPeriodo(movimentacoesProduto, periodo)
      .filter((movimentacao) => movimentacao.tipo === "SAIDA")
      .map((movimentacao) => movimentacao.data.slice(0, 10)),
    periodo,
  );
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

export function calcularProdutosEstatisticas(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
): ProdutoEstatistica[] {
  const porProduto = new Map<string, { estoqueAtual: number; consumoPeriodo: number; diasSaida: Set<string> }>();
  for (const produto of produtos) {
    porProduto.set(produto.id, { estoqueAtual: 0, consumoPeriodo: 0, diasSaida: new Set<string>() });
  }

  for (const movimentacao of movimentacoes) {
    const atual = porProduto.get(movimentacao.produto_id);
    if (!atual) continue;

    switch (movimentacao.tipo) {
      case "ENTRADA":
      case "DEVOLUCAO":
        atual.estoqueAtual += movimentacao.quantidade;
        break;
      case "SAIDA": {
        atual.estoqueAtual -= movimentacao.quantidade;
        const data = movimentacao.data.slice(0, 10);
        if (data >= periodo.de && data <= periodo.ate) {
          atual.consumoPeriodo += movimentacao.quantidade;
          atual.diasSaida.add(data);
        }
        break;
      }
      case "AJUSTE":
      case "TRANSFERENCIA":
        atual.estoqueAtual += (movimentacao.sinal ?? 1) * movimentacao.quantidade;
        break;
    }
  }

  return produtos.map((produto) => {
    const atual = porProduto.get(produto.id) ?? { estoqueAtual: 0, consumoPeriodo: 0, diasSaida: new Set<string>() };
    const periodoEfetivo = calcularPeriodoEfetivoConsumoDatas(atual.diasSaida, periodo);
    const periodoCalculo = periodoEfetivo ?? periodo;
    const diasPeriodo = diferencaDiasPeriodo(periodoCalculo);
    const consumoMedioDiario = atual.consumoPeriodo / diasPeriodo;
    const consumoMedioSemanal = consumoMedioDiario * 7;
    const consumoMedioMensal = consumoMedioDiario * 30.4375;
    const estoqueMinimo = Math.max(0, produto.estoque_minimo ?? 0);
    const coberturaDias = consumoMedioDiario > 0 ? Math.max(0, atual.estoqueAtual) / consumoMedioDiario : null;
    const saldoAcimaDoMinimo = Math.max(0, atual.estoqueAtual - estoqueMinimo);
    const diasAteMinimo = consumoMedioDiario > 0 ? saldoAcimaDoMinimo / consumoMedioDiario : null;
    const baseData = periodoCalculo.ate;
    const dataEstimadaRuptura = coberturaDias === null ? null : adicionarDias(baseData, coberturaDias);
    const dataEstimadaMinimo = diasAteMinimo === null ? null : adicionarDias(baseData, diasAteMinimo);

    return {
      produtoId: produto.id,
      produto,
      estoqueAtual: Number(atual.estoqueAtual.toFixed(4)),
      estoqueMinimo,
      consumoPeriodo: Number(atual.consumoPeriodo.toFixed(4)),
      consumoMedioDiario: Number(consumoMedioDiario.toFixed(4)),
      consumoMedioSemanal: Number(consumoMedioSemanal.toFixed(4)),
      consumoMedioMensal: Number(consumoMedioMensal.toFixed(4)),
      coberturaDias: coberturaDias === null ? null : Number(coberturaDias.toFixed(1)),
      diasAteMinimo: diasAteMinimo === null ? null : Number(diasAteMinimo.toFixed(1)),
      dataEstimadaRuptura:
        coberturaDias !== null && atual.estoqueAtual > 0 ? dataEstimadaRuptura : null,
      dataEstimadaMinimo:
        diasAteMinimo !== null && atual.estoqueAtual > estoqueMinimo ? dataEstimadaMinimo : null,
      periodoEfetivoConsumo: periodoEfetivo ? { de: periodoEfetivo.de, ate: periodoEfetivo.ate } : null,
      intervaloMedioSaidasDias: periodoEfetivo?.intervaloMedioSaidasDias ?? null,
      abaixoDoMinimo: atual.estoqueAtual < estoqueMinimo,
      semConsumo: atual.consumoPeriodo <= 0,
    };
  });
}

export function calcularRankingFrequenciaConsumo(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  limite = 10,
): RankingConsumoProduto[] {
  const saidas = filtrarMovimentacoesPeriodo(movimentacoes, periodo).filter((movimentacao) => movimentacao.tipo === "SAIDA");
  const diasPeriodo = Math.max(1, diferencaDiasPeriodo(periodo));
  const totalSaidas = saidas.length;
  const porProduto = new Map<string, { saidas: number; dias: Set<string> }>();

  for (const movimentacao of saidas) {
    const atual = porProduto.get(movimentacao.produto_id) ?? { saidas: 0, dias: new Set<string>() };
    atual.saidas += 1;
    atual.dias.add(movimentacao.data.slice(0, 10));
    porProduto.set(movimentacao.produto_id, atual);
  }

  return [...porProduto.entries()]
    .map(([produtoId, valores]) => {
      const produto = produtos.find((item) => item.id === produtoId);
      if (!produto) return null;
      return {
        produtoId,
        produto,
        saidas: valores.saidas,
        diasComSaida: valores.dias.size,
        frequenciaDiaria: Number((valores.saidas / diasPeriodo).toFixed(2)),
        participacaoPercentual: totalSaidas > 0 ? Number(((valores.saidas / totalSaidas) * 100).toFixed(1)) : null,
      };
    })
    .filter((item): item is RankingConsumoProduto => item !== null)
    .sort((a, b) => b.saidas - a.saidas || b.diasComSaida - a.diasComSaida || a.produto.nome.localeCompare(b.produto.nome))
    .slice(0, Math.max(1, limite));
}

export function calcularParetoConsumo(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  limite = 15,
): ParetoConsumoProduto[] {
  const saidas = filtrarMovimentacoesPeriodo(movimentacoes, periodo).filter(
    (movimentacao) => movimentacao.tipo === "SAIDA",
  );
  const porProduto = new Map<string, number>();

  for (const movimentacao of saidas) {
    porProduto.set(movimentacao.produto_id, (porProduto.get(movimentacao.produto_id) ?? 0) + 1);
  }

  const totalSaidas = saidas.length;
  if (totalSaidas === 0) return [];

  let acumulado = 0;

  return [...porProduto.entries()]
    .map(([produtoId, quantidade]) => {
      const produto = produtos.find((item) => item.id === produtoId);
      if (!produto) return null;
      return { produtoId, produto, saidas: quantidade };
    })
    .filter((item): item is { produtoId: string; produto: Produto; saidas: number } => item !== null)
    .sort((a, b) => b.saidas - a.saidas || a.produto.nome.localeCompare(b.produto.nome))
    .slice(0, Math.max(1, limite))
    .map((item) => {
      const participacaoPercentual = Number(((item.saidas / totalSaidas) * 100).toFixed(1));
      acumulado = Math.min(100, Number((acumulado + participacaoPercentual).toFixed(1)));
      return {
        ...item,
        participacaoPercentual,
        acumuladoPercentual: acumulado,
      };
    });
}

export function calcularMapaRiscoCobertura(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  limite = 10,
  minSaidas = MIN_SAIDAS_MAPA_RISCO,
  analisesFornecidas?: ProdutoEstatistica[],
): MapaRiscoCobertura {
  const analises = analisesFornecidas ?? calcularProdutosEstatisticas(produtos, movimentacoes, periodo);
  const movsPeriodo = filtrarMovimentacoesPeriodo(movimentacoes, periodo);
  const saidasPorProduto = new Map<string, number>();

  for (const movimentacao of movsPeriodo) {
    if (movimentacao.tipo !== "SAIDA") continue;
    saidasPorProduto.set(
      movimentacao.produto_id,
      (saidasPorProduto.get(movimentacao.produto_id) ?? 0) + 1,
    );
  }

  const minimoSaidas = Math.max(1, Math.trunc(minSaidas));
  const excluidosSemEstoque = analises.filter((item) => item.estoqueAtual <= 0).length;
  const excluidosBaixaAtividade = analises.filter(
    (item) => item.estoqueAtual > 0 && (saidasPorProduto.get(item.produtoId) ?? 0) < minimoSaidas,
  ).length;

  const itens = analises
    .filter(
      (item) =>
        item.estoqueAtual > 0 &&
        (saidasPorProduto.get(item.produtoId) ?? 0) >= minimoSaidas &&
        item.coberturaDias != null &&
        item.consumoMedioDiario > 0,
    )
    .map<ItemRiscoCobertura>((item) => {
      const coberturaDias = item.coberturaDias as number;
      const faixa: FaixaRiscoCobertura = coberturaDias <= 7 ? "critico" : coberturaDias <= 30 ? "atencao" : "adequado";

      return {
        produtoId: item.produtoId,
        produto: item.produto,
        coberturaDias,
        estoqueAtual: item.estoqueAtual,
        consumoMedioDiario: item.consumoMedioDiario,
        saidasPeriodo: saidasPorProduto.get(item.produtoId) ?? 0,
        faixa,
      };
    });

  const prioritarios = itens
    .filter((item) => item.faixa === "critico" || item.faixa === "atencao")
    .sort((a, b) => {
      const coberturaA = a.coberturaDias ?? Infinity;
      const coberturaB = b.coberturaDias ?? Infinity;
      if (coberturaA !== coberturaB) return coberturaA - coberturaB;
      return a.produto.nome.localeCompare(b.produto.nome);
    })
    .slice(0, Math.max(1, limite));

  return {
    totalProdutos: itens.length,
    ruptura: 0,
    critico: itens.filter((item) => item.faixa === "critico").length,
    atencao: itens.filter((item) => item.faixa === "atencao").length,
    adequado: itens.filter((item) => item.faixa === "adequado").length,
    semConsumo: 0,
    excluidosSemEstoque,
    excluidosBaixaAtividade,
    minSaidas: minimoSaidas,
    itensPrioritarios: prioritarios,
  };
}

/**
 * Produtos legados sem a propriedade permanecem participantes da inteligência.
 * Somente o valor explícito `false` desativa as sugestões de reposição.
 */
export function participaInteligenciaReposicao(produto: Produto): boolean {
  return produto.inteligencia_reposicao !== false;
}

export function calcularAnaliseReposicao(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  diasAlvo = 30,
  limite = 12,
  minSaidas = MIN_SAIDAS_MAPA_RISCO,
  analisesFornecidas?: ProdutoEstatistica[],
): AnaliseReposicao {
  const alvoDias = Math.max(1, Math.trunc(diasAlvo));
  const minimoSaidas = Math.max(1, Math.trunc(minSaidas));
  const analises = analisesFornecidas ?? calcularProdutosEstatisticas(produtos, movimentacoes, periodo);
  const analisesElegiveis = analises.filter((item) => participaInteligenciaReposicao(item.produto));
  const analisesExcluidasPorConfiguracao = analises.filter(
    (item) => !participaInteligenciaReposicao(item.produto),
  );
  const movsPeriodo = filtrarMovimentacoesPeriodo(movimentacoes, periodo);
  const saidasPorProduto = new Map<string, number>();

  for (const movimentacao of movsPeriodo) {
    if (movimentacao.tipo !== "SAIDA") continue;
    saidasPorProduto.set(
      movimentacao.produto_id,
      (saidasPorProduto.get(movimentacao.produto_id) ?? 0) + 1,
    );
  }

  const itens = analisesElegiveis
    .filter((item) => (saidasPorProduto.get(item.produtoId) ?? 0) >= minimoSaidas)
    .map<ItemReposicao>((item) => {
      const consumoAlvo = item.consumoMedioDiario * alvoDias;
      const estoqueAlvo = Math.max(item.estoqueMinimo, consumoAlvo);
      const quantidadeSugerida = Math.max(0, estoqueAlvo - Math.max(0, item.estoqueAtual));
      const prioridade: PrioridadeReposicao = item.estoqueAtual <= 0 ? "imediata" : "prioritaria";

      return {
        produtoId: item.produtoId,
        produto: item.produto,
        estoqueAtual: item.estoqueAtual,
        estoqueMinimo: item.estoqueMinimo,
        saidasPeriodo: saidasPorProduto.get(item.produtoId) ?? 0,
        consumoMedioDiario: item.consumoMedioDiario,
        coberturaDias: item.coberturaDias,
        estoqueAlvo,
        quantidadeSugerida,
        prioridade,
      };
    })
    .filter((item) => item.quantidadeSugerida > 0)
    .sort((a, b) => {
      if (a.prioridade !== b.prioridade) return a.prioridade === "imediata" ? -1 : 1;
      const coberturaA = a.coberturaDias ?? 0;
      const coberturaB = b.coberturaDias ?? 0;
      if (coberturaA !== coberturaB) return coberturaA - coberturaB;
      return b.quantidadeSugerida - a.quantidadeSugerida || a.produto.nome.localeCompare(b.produto.nome);
    });

  return {
    diasAlvo: alvoDias,
    minSaidas: minimoSaidas,
    totalItens: itens.length,
    reposicaoImediata: itens.filter((item) => item.prioridade === "imediata").length,
    reposicaoPrioritaria: itens.filter((item) => item.prioridade === "prioritaria").length,
    excluidosBaixaAtividade: analisesElegiveis.filter(
      (item) => (saidasPorProduto.get(item.produtoId) ?? 0) < minimoSaidas,
    ).length,
    excluidosPorConfiguracao: analisesExcluidasPorConfiguracao.length,
    itens: itens.slice(0, Math.max(1, limite)),
  };
}

export function calcularDesviosConsumoProdutos(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  limite = 8,
  minSaidas = MIN_SAIDAS_DESVIO_CONSUMO,
  limiarPercentual = LIMIAR_DESVIO_CONSUMO_PERCENTUAL,
): DesvioConsumoProduto[] {
  const periodoAnterior = criarPeriodoAnterior(periodo);
  const contarSaidas = (janela: PeriodoEstatisticas) => {
    const resultado = new Map<string, number>();
    for (const movimentacao of filtrarMovimentacoesPeriodo(movimentacoes, janela)) {
      if (movimentacao.tipo !== "SAIDA") continue;
      resultado.set(movimentacao.produto_id, (resultado.get(movimentacao.produto_id) ?? 0) + 1);
    }
    return resultado;
  };

  const atual = contarSaidas(periodo);
  const anterior = contarSaidas(periodoAnterior);
  const minimo = Math.max(1, Math.trunc(minSaidas));
  const limiar = Math.max(0, limiarPercentual);
  const ids = new Set([...atual.keys(), ...anterior.keys()]);

  return [...ids]
    .map((produtoId) => {
      const produto = produtos.find((item) => item.id === produtoId);
      if (!produto) return null;
      const saidasAtual = atual.get(produtoId) ?? 0;
      const saidasAnterior = anterior.get(produtoId) ?? 0;
      if (Math.max(saidasAtual, saidasAnterior) < minimo || saidasAnterior === 0 && saidasAtual === 0) return null;

      let variacaoPercentual: number | null = null;
      if (saidasAnterior > 0) {
        variacaoPercentual = Number((((saidasAtual - saidasAnterior) / saidasAnterior) * 100).toFixed(1));
      }

      const direcao: DirecaoDesvioConsumo = saidasAtual >= saidasAnterior ? "aumento" : "queda";
      const desvioAbsolutoPercentual = variacaoPercentual == null ? 100 : Math.abs(variacaoPercentual);
      const relevante = desvioAbsolutoPercentual >= limiar && (saidasAtual >= minimo || saidasAnterior >= minimo);
      if (!relevante) return null;

      return {
        produtoId,
        produto,
        saidasAtual,
        saidasAnterior,
        variacaoPercentual,
        direcao,
        desvioAbsolutoPercentual,
      };
    })
    .filter((item): item is DesvioConsumoProduto => item !== null)
    .sort((a, b) => b.desvioAbsolutoPercentual - a.desvioAbsolutoPercentual || b.saidasAtual - a.saidasAtual || a.produto.nome.localeCompare(b.produto.nome))
    .slice(0, Math.max(1, limite));
}

export function calcularDesviosConsumoEquipes(
  movimentacoes: Movimentacao[],
  equipes: Equipe[],
  periodo: PeriodoEstatisticas,
  limite = 8,
  minSaidas = MIN_SAIDAS_DESVIO_CONSUMO,
  limiarPercentual = LIMIAR_DESVIO_CONSUMO_PERCENTUAL,
): DesvioConsumoEquipe[] {
  const periodoAnterior = criarPeriodoAnterior(periodo);
  const contarSaidas = (janela: PeriodoEstatisticas) => {
    const resultado = new Map<string, number>();
    for (const movimentacao of filtrarMovimentacoesPeriodo(movimentacoes, janela)) {
      if (movimentacao.tipo !== "SAIDA") continue;
      const equipeId = movimentacao.equipe_id ?? "__sem_equipe__";
      resultado.set(equipeId, (resultado.get(equipeId) ?? 0) + 1);
    }
    return resultado;
  };

  const atual = contarSaidas(periodo);
  const anterior = contarSaidas(periodoAnterior);
  const minimo = Math.max(1, Math.trunc(minSaidas));
  const limiar = Math.max(0, limiarPercentual);
  const ids = new Set([...atual.keys(), ...anterior.keys()]);

  return [...ids]
    .map((equipeId) => {
      const saidasAtual = atual.get(equipeId) ?? 0;
      const saidasAnterior = anterior.get(equipeId) ?? 0;
      if (Math.max(saidasAtual, saidasAnterior) < minimo || saidasAtual === 0 && saidasAnterior === 0) return null;
      const variacaoPercentual = saidasAnterior > 0
        ? Number((((saidasAtual - saidasAnterior) / saidasAnterior) * 100).toFixed(1))
        : null;
      const direcao: DirecaoDesvioConsumo = saidasAtual >= saidasAnterior ? "aumento" : "queda";
      const desvioAbsolutoPercentual = variacaoPercentual == null ? 100 : Math.abs(variacaoPercentual);
      if (desvioAbsolutoPercentual < limiar) return null;
      const equipe = equipeId === "__sem_equipe__" ? null : equipes.find((item) => item.id === equipeId) ?? null;
      return {
        equipeId: equipeId === "__sem_equipe__" ? null : equipeId,
        equipe,
        saidasAtual,
        saidasAnterior,
        variacaoPercentual,
        direcao,
        desvioAbsolutoPercentual,
      };
    })
    .filter((item): item is DesvioConsumoEquipe => item !== null)
    .sort((a, b) => b.desvioAbsolutoPercentual - a.desvioAbsolutoPercentual || b.saidasAtual - a.saidasAtual || (a.equipe?.nome ?? "Sem equipe").localeCompare(b.equipe?.nome ?? "Sem equipe"))
    .slice(0, Math.max(1, limite));
}

export function calcularRegularidadeConsumo(
  produtoId: string,
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
): RegularidadeConsumo {
  const saidas = filtrarMovimentacoesPeriodo(movimentacoes, periodo)
    .filter((movimentacao) => movimentacao.produto_id === produtoId && movimentacao.tipo === "SAIDA")
    .map((movimentacao) => movimentacao.data.slice(0, 10));

  const diasComSaida = [...new Set(saidas)].sort();
  const intervalos = diasComSaida.slice(1).map((data, index) => {
    const inicio = new Date(`${diasComSaida[index]}T00:00:00`);
    const fim = new Date(`${data}T00:00:00`);
    return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 86400000));
  });

  const diasPeriodo = Math.max(1, diferencaDiasPeriodo(periodo));
  const intervaloMedioDias = intervalos.length
    ? Number((intervalos.reduce((total, valor) => total + valor, 0) / intervalos.length).toFixed(1))
    : null;

  return {
    produtoId,
    diasComSaida: diasComSaida.length,
    intervaloMedioDias,
    menorIntervaloDias: intervalos.length ? Math.min(...intervalos) : null,
    maiorIntervaloDias: intervalos.length ? Math.max(...intervalos) : null,
    percentualDiasComSaida: Number(((diasComSaida.length / diasPeriodo) * 100).toFixed(1)),
  };
}

export function calcularProdutoEstatistica(
  produto: Produto,
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
): ProdutoEstatistica {
  const movsProduto = movimentacoes.filter((movimentacao) => movimentacao.produto_id === produto.id);
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

  const periodoEfetivo = calcularPeriodoEfetivoConsumo(movsProduto, periodo);
  const periodoCalculo = periodoEfetivo ?? periodo;
  const movsPeriodo = filtrarMovimentacoesPeriodo(movsProduto, periodo);
  const consumoPeriodo = movsPeriodo
    .filter((movimentacao) => movimentacao.tipo === "SAIDA")
    .reduce((total, movimentacao) => total + movimentacao.quantidade, 0);
  const diasPeriodo = diferencaDiasPeriodo(periodoCalculo);
  const consumoMedioDiario = consumoPeriodo / diasPeriodo;
  const consumoMedioSemanal = consumoMedioDiario * 7;
  const consumoMedioMensal = consumoMedioDiario * 30.4375;
  const estoqueMinimo = Math.max(0, produto.estoque_minimo ?? 0);

  const coberturaDias = consumoMedioDiario > 0 ? Math.max(0, estoqueAtual) / consumoMedioDiario : null;
  const saldoAcimaDoMinimo = Math.max(0, estoqueAtual - estoqueMinimo);
  const diasAteMinimo = consumoMedioDiario > 0 ? saldoAcimaDoMinimo / consumoMedioDiario : null;

  const dataEstimadaRuptura = coberturaDias === null ? null : adicionarDias(periodoCalculo.ate, coberturaDias);
  const dataEstimadaMinimo = diasAteMinimo === null ? null : adicionarDias(periodoCalculo.ate, diasAteMinimo);

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
      coberturaDias !== null && estoqueAtual > 0 ? dataEstimadaRuptura : null,
    dataEstimadaMinimo:
      diasAteMinimo !== null && estoqueAtual > estoqueMinimo ? dataEstimadaMinimo : null,
    periodoEfetivoConsumo: periodoEfetivo ? { de: periodoEfetivo.de, ate: periodoEfetivo.ate } : null,
    intervaloMedioSaidasDias: periodoEfetivo?.intervaloMedioSaidasDias ?? null,
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

function sugestaoCorrecao(tipo: QualidadeAlerta["tipo"]): string {
  switch (tipo) {
    case "ESTOQUE_NEGATIVO_HISTORICO":
      return "Revise a sequência das movimentações desta posição. Confira entradas, saídas, devoluções, ajustes e transferências anteriores e corrija a origem do saldo negativo antes de fazer um novo ajuste.";
    case "SAIDA_SEM_RESPONSAVEL":
      return "Edite a movimentação e informe o funcionário ou encarregado responsável pela retirada, para manter a rastreabilidade da saída.";
    case "ENTRADA_SEM_DOCUMENTO":
      return "Vincule o documento correspondente à entrada ou corrija a configuração do projeto caso esta entrada esteja legitimamente dispensada de documento.";
    case "AJUSTE_SEM_JUSTIFICATIVA":
      return "Edite o ajuste e registre uma justificativa objetiva, explicando a causa da correção e o motivo da quantidade lançada.";
    case "QUANTIDADE_INVALIDA":
      return "Revise a quantidade informada. A movimentação deve possuir uma quantidade numérica válida e maior que zero.";
    case "PRODUTO_INEXISTENTE":
      return "Confira o cadastro do produto e a referência usada pela movimentação. Vincule a movimentação ao produto correto antes de continuar a análise.";
    case "EQUIPE_INEXISTENTE":
      return "Confira o cadastro da equipe e a referência usada pela movimentação. Vincule a movimentação à equipe correta ou deixe a equipe vazia quando permitido pelo fluxo.";
  }
}

export function calcularQualidadeEstoque(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  equipes: Equipe[],
  periodo: PeriodoEstatisticas,
  opcoes: {
    exigirDocumentoEntrada?: boolean;
    exigirJustificativaAjuste?: boolean;
  } = {},
): ResumoQualidadeEstoque {
  const produtoIds = new Set(produtos.map((produto) => produto.id));
  const equipeIds = new Set(equipes.map((equipe) => equipe.id));
  const movimentoPeriodoIds = new Set(
    filtrarMovimentacoesPeriodo(movimentacoes, periodo).map((movimentacao) => movimentacao.id),
  );

  const saldoPorPosicao = new Map<string, number>();
  const negativosDetectados = new Set<string>();
  const alertas: QualidadeAlerta[] = [];

  const adicionarAlerta = (
    movimentacao: Movimentacao,
    tipo: QualidadeAlerta["tipo"],
    severidade: QualidadeSeveridade,
    mensagem: string,
    contexto?: { saldoAnterior?: number | null; saldoPosterior?: number | null },
  ) => {
    if (!movimentoPeriodoIds.has(movimentacao.id)) return;
    const saldoAnterior = contexto?.saldoAnterior ?? null;
    const saldoPosterior = contexto?.saldoPosterior ?? null;
    alertas.push({
      id: `${movimentacao.id}:${tipo}:${alertas.length}`,
      tipo,
      severidade,
      data: movimentacao.data,
      movimentacaoId: movimentacao.id,
      produtoId: movimentacao.produto_id ?? null,
      equipeId: movimentacao.equipe_id ?? null,
      tipoMovimentacao: movimentacao.tipo,
      quantidade: movimentacao.quantidade,
      funcionarioId: movimentacao.funcionario_id ?? null,
      encarregadoId: movimentacao.encarregado_id ?? null,
      documentoId: movimentacao.documento_id ?? null,
      observacao: movimentacao.observacao ?? null,
      saldoAnterior,
      saldoPosterior,
      mensagem,
      comoCorrigir: sugestaoCorrecao(tipo),
    });
  };

  const ordenadas = [...movimentacoes].sort((a, b) => {
    const data = a.data.localeCompare(b.data);
    return data !== 0 ? data : a.id.localeCompare(b.id);
  });

  for (const movimentacao of ordenadas) {
    const chave = `${movimentacao.produto_id}:${movimentacao.equipe_id}`;
    const saldoAnterior = saldoPorPosicao.get(chave) ?? 0;

    if (movimentacao.quantidade <= 0 || !Number.isFinite(movimentacao.quantidade)) {
      adicionarAlerta(
        movimentacao,
        "QUANTIDADE_INVALIDA",
        "alta",
        "Movimentação com quantidade igual ou inferior a zero ou com valor inválido.",
      );
    }

    if (!movimentacao.produto_id || !produtoIds.has(movimentacao.produto_id)) {
      adicionarAlerta(
        movimentacao,
        "PRODUTO_INEXISTENTE",
        "alta",
        "A movimentação referencia um produto que não existe no cadastro atual.",
      );
    }

    if (movimentacao.equipe_id && !equipeIds.has(movimentacao.equipe_id)) {
      adicionarAlerta(
        movimentacao,
        "EQUIPE_INEXISTENTE",
        "alta",
        "A movimentação referencia uma equipe que não existe no cadastro atual.",
      );
    }

    if (movimentacao.tipo === "SAIDA" && !movimentacao.funcionario_id && !movimentacao.encarregado_id) {
      adicionarAlerta(
        movimentacao,
        "SAIDA_SEM_RESPONSAVEL",
        "media",
        "Saída registrada sem funcionário ou encarregado responsável informado.",
      );
    }

    if (
      movimentacao.tipo === "ENTRADA" &&
      opcoes.exigirDocumentoEntrada === true &&
      !movimentacao.documento_id
    ) {
      adicionarAlerta(
        movimentacao,
        "ENTRADA_SEM_DOCUMENTO",
        "alta",
        "Entrada registrada sem documento, embora a configuração do projeto exija documento na entrada.",
      );
    }

    if (
      movimentacao.tipo === "AJUSTE" &&
      opcoes.exigirJustificativaAjuste === true &&
      !movimentacao.observacao?.trim()
    ) {
      adicionarAlerta(
        movimentacao,
        "AJUSTE_SEM_JUSTIFICATIVA",
        "media",
        "Ajuste registrado sem justificativa, embora a configuração do projeto exija justificativa.",
      );
    }

    let efeito = 0;
    switch (movimentacao.tipo) {
      case "ENTRADA":
      case "DEVOLUCAO":
        efeito = movimentacao.quantidade;
        break;
      case "SAIDA":
        efeito = -movimentacao.quantidade;
        break;
      case "AJUSTE":
      case "TRANSFERENCIA":
        efeito = (movimentacao.sinal ?? 1) * movimentacao.quantidade;
        break;
    }

    const saldoPosterior = saldoAnterior + efeito;
    saldoPorPosicao.set(chave, saldoPosterior);

    if (saldoPosterior < 0) {
      const chaveNegativo = `${chave}:${movimentacao.id}`;
      if (!negativosDetectados.has(chaveNegativo)) {
        negativosDetectados.add(chaveNegativo);
          adicionarAlerta(
          movimentacao,
          "ESTOQUE_NEGATIVO_HISTORICO",
          "alta",
          `A movimentação fez o saldo histórico da posição ficar negativo (${saldoPosterior.toFixed(4)}).`,
          { saldoAnterior, saldoPosterior },
        );
      }
    }
  }

  const severidadePeso: Record<QualidadeSeveridade, number> = { alta: 0, media: 1, baixa: 2 };
  alertas.sort((a, b) => {
    const severidade = severidadePeso[a.severidade] - severidadePeso[b.severidade];
    if (severidade !== 0) return severidade;
    return b.data.localeCompare(a.data);
  });

  const contar = (tipo: QualidadeAlerta["tipo"]) => alertas.filter((alerta) => alerta.tipo === tipo).length;

  return {
    alertas: alertas.slice(0, 50),
    total: alertas.length,
    altas: alertas.filter((alerta) => alerta.severidade === "alta").length,
    medias: alertas.filter((alerta) => alerta.severidade === "media").length,
    baixas: alertas.filter((alerta) => alerta.severidade === "baixa").length,
    movimentacoesAnalisadas: movimentacoes.length,
    posicoesComSaldoNegativo: new Set(
      alertas
        .filter((alerta) => alerta.tipo === "ESTOQUE_NEGATIVO_HISTORICO")
        .map((alerta) => `${alerta.produtoId}:${alerta.equipeId}`),
    ).size,
    saidasSemResponsavel: contar("SAIDA_SEM_RESPONSAVEL"),
    entradasSemDocumento: contar("ENTRADA_SEM_DOCUMENTO"),
    ajustesSemJustificativa: contar("AJUSTE_SEM_JUSTIFICATIVA"),
    quantidadesInvalidas: contar("QUANTIDADE_INVALIDA"),
    produtosInexistentes: contar("PRODUTO_INEXISTENTE"),
    equipesInexistentes: contar("EQUIPE_INEXISTENTE"),
  };
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
  valorEntradasDocumentado: number;
  entradasSemCusto: number;
  valorSaidasDocumentado: number;
  saidasSemCusto: number;
};

export type ValorAgrupado = {
  id: string;
  quantidadeEntrada: number;
  entradas: number;
  valorEntradasDocumentado: number;
  entradasSemCusto: number;
  quantidadeSaida: number;
  saidas: number;
  valorSaidasDocumentado: number;
  saidasSemCusto: number;
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

  const movsPeriodo = filtrarMovimentacoesPeriodo(movimentacoes, periodo);
  let valorEntradasDocumentado = 0;
  let entradasSemCusto = 0;
  let valorSaidasDocumentado = 0;
  let saidasSemCusto = 0;

  for (const movimentacao of movsPeriodo) {
    const custo = custos.get(movimentacao.produto_id)?.custoMedioUnitario;
    if (movimentacao.tipo === "ENTRADA") {
      if (custo == null) {
        entradasSemCusto += 1;
        continue;
      }
      valorEntradasDocumentado += movimentacao.quantidade * custo;
      continue;
    }
    if (movimentacao.tipo === "SAIDA") {
      if (custo == null) {
        saidasSemCusto += 1;
        continue;
      }
      valorSaidasDocumentado += movimentacao.quantidade * custo;
    }
  }

  return {
    valorEstoqueDocumentado: Number(valorEstoqueDocumentado.toFixed(2)),
    posicoesComCusto,
    posicoesSemCusto: Math.max(0, estoque.length - posicoesComCusto),
    coberturaPorPosicoes: estoque.length ? Number(((posicoesComCusto / estoque.length) * 100).toFixed(1)) : 100,
    valorEntradasDocumentado: Number(valorEntradasDocumentado.toFixed(2)),
    entradasSemCusto,
    valorSaidasDocumentado: Number(valorSaidasDocumentado.toFixed(2)),
    saidasSemCusto,
  };
}

/**
 * Consolida o valor financeiro de entradas e saídas por um agrupador (equipe,
 * responsável ou outro contexto). Devoluções não são tratadas como nova compra.
 */
export function calcularFluxoFinanceiroPorGrupo(
  movimentacoes: Movimentacao[],
  periodo: PeriodoEstatisticas,
  custos: Map<string, CustoProdutoDocumentado>,
  key: (movimentacao: Movimentacao) => string | null | undefined,
  limite = 8,
): ValorAgrupado[] {
  const map = new Map<string, ValorAgrupado>();
  for (const movimentacao of filtrarMovimentacoesPeriodo(movimentacoes, periodo)) {
    if (movimentacao.tipo !== "ENTRADA" && movimentacao.tipo !== "SAIDA") continue;
    const id = key(movimentacao) ?? "__sem__";
    const atual = map.get(id) ?? {
      id, quantidadeEntrada: 0, entradas: 0, valorEntradasDocumentado: 0, entradasSemCusto: 0,
      quantidadeSaida: 0, saidas: 0, valorSaidasDocumentado: 0, saidasSemCusto: 0,
    };
    const custo = custos.get(movimentacao.produto_id)?.custoMedioUnitario;
    if (movimentacao.tipo === "ENTRADA") {
      atual.quantidadeEntrada += movimentacao.quantidade;
      atual.entradas += 1;
      if (custo == null) atual.entradasSemCusto += 1;
      else atual.valorEntradasDocumentado += movimentacao.quantidade * custo;
    } else {
      atual.quantidadeSaida += movimentacao.quantidade;
      atual.saidas += 1;
      if (custo == null) atual.saidasSemCusto += 1;
      else atual.valorSaidasDocumentado += movimentacao.quantidade * custo;
    }
    map.set(id, atual);
  }
  return [...map.values()]
    .map((item) => ({
      ...item,
      quantidadeEntrada: Number(item.quantidadeEntrada.toFixed(4)),
      valorEntradasDocumentado: Number(item.valorEntradasDocumentado.toFixed(2)),
      quantidadeSaida: Number(item.quantidadeSaida.toFixed(4)),
      valorSaidasDocumentado: Number(item.valorSaidasDocumentado.toFixed(2)),
    }))
    .sort((a, b) =>
      b.valorSaidasDocumentado + b.valorEntradasDocumentado -
      (a.valorSaidasDocumentado + a.valorEntradasDocumentado) || b.saidas - a.saidas,
    )
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
export type DistribuicaoDiaSemana = {
  chave: number;
  dia: string;
  movimentacoes: number;
  entradas: number;
  saidas: number;
  devolucoes: number;
  ajustes: number;
  transferencias: number;
};

/**
 * Conta a frequência de movimentações por dia da semana. As métricas são
 * contagens de registros, não quantidades físicas, para evitar a mistura de
 * unidades de medida diferentes.
 */
export function agruparMovimentacoesPorDiaSemana(movs: Movimentacao[]): DistribuicaoDiaSemana[] {
  const dias = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];

  const mapa = new Map<number, DistribuicaoDiaSemana>();

  for (const movimentacao of movs) {
    const data = new Date(`${movimentacao.data.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(data.getTime())) continue;

    const chave = data.getDay();
    const atual =
      mapa.get(chave) ??
      {
        chave,
        dia: dias[chave] ?? "",
        movimentacoes: 0,
        entradas: 0,
        saidas: 0,
        devolucoes: 0,
        ajustes: 0,
        transferencias: 0,
      };

    atual.movimentacoes += 1;
    if (movimentacao.tipo === "ENTRADA") atual.entradas += 1;
    else if (movimentacao.tipo === "SAIDA") atual.saidas += 1;
    else if (movimentacao.tipo === "DEVOLUCAO") atual.devolucoes += 1;
    else if (movimentacao.tipo === "AJUSTE") atual.ajustes += 1;
    else if (movimentacao.tipo === "TRANSFERENCIA") atual.transferencias += 1;

    mapa.set(chave, atual);
  }

  return [1, 2, 3, 4, 5, 6, 0]
    .map((chave) => mapa.get(chave))
    .filter((item): item is DistribuicaoDiaSemana => Boolean(item));
}

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

export type AcuracidadeInventarioItem = {
  inventarioId: string;
  data: string;
  produtoId: string;
  equipeId: string;
  quantidadeSistema: number;
  quantidadeContada: number;
  diferenca: number;
  divergenciaAbsoluta: number;
  acuracidadePercentual: number;
};

export type HistoricoAcuracidadeInventario = {
  inventarioId: string;
  data: string;
  itensContados: number;
  itensDivergentes: number;
  coberturaContagem: number;
  acuracidadePorPosicoes: number;
  acuracidadePorQuantidade: number;
  divergenciaAbsoluta: number;
};

export type ResumoAcuracidadeInventario = {
  inventariosConcluidos: number;
  itensAnalisados: number;
  itensContados: number;
  itensDivergentes: number;
  coberturaContagem: number;
  acuracidadePorPosicoes: number;
  acuracidadePorQuantidade: number;
  quantidadeSistema: number;
  quantidadeContada: number;
  divergenciaAbsoluta: number;
  ultimoInventario: HistoricoAcuracidadeInventario | null;
  maioresDivergencias: AcuracidadeInventarioItem[];
  historico: HistoricoAcuracidadeInventario[];
};

/**
 * Calcula a acuracidade física dos inventários concluídos.
 * Acuracidade por posições mede quantas posições contadas bateram exatamente.
 * Acuracidade por quantidade mede a proporção física preservada após descontar a
 * divergência absoluta em relação ao saldo de sistema.
 */
export function calcularAcuracidadeInventarios(
  inventarios: Inventario[],
  itens: InventarioItem[],
  limiteDivergencias = 10,
): ResumoAcuracidadeInventario {
  const concluidos = inventarios
    .filter((inventario) => inventario.status === "CONCLUIDO")
    .sort((a, b) => {
      const dataA = a.data_encerramento ?? a.data_abertura;
      const dataB = b.data_encerramento ?? b.data_abertura;
      return dataB.localeCompare(dataA);
    });

  const historico: HistoricoAcuracidadeInventario[] = [];
  const divergencias: AcuracidadeInventarioItem[] = [];
  let itensAnalisados = 0;
  let itensContados = 0;
  let itensDivergentes = 0;
  let quantidadeSistema = 0;
  let quantidadeContada = 0;
  let divergenciaAbsoluta = 0;

  for (const inventario of concluidos) {
    const itensInventario = itens.filter((item) => item.inventario_id === inventario.id);
    const contados = itensInventario.filter((item) => item.quantidade_contada != null);
    const sistemaContado = contados.reduce((total, item) => total + Math.max(0, item.quantidade_sistema), 0);
    const quantidadeContadaInventario = contados.reduce((total, item) => total + Math.max(0, item.quantidade_contada ?? 0), 0);
    const divergenciaInventario = contados.reduce(
      (total, item) => total + Math.abs((item.quantidade_contada ?? 0) - item.quantidade_sistema),
      0,
    );
    const divergentesInventario = contados.filter(
      (item) => Math.abs((item.quantidade_contada ?? 0) - item.quantidade_sistema) > Number.EPSILON,
    );
    const acuracidadePosicoes = contados.length
      ? ((contados.length - divergentesInventario.length) / contados.length) * 100
      : 100;
    const acuracidadeQuantidade = sistemaContado > 0
      ? Math.max(0, 1 - divergenciaInventario / sistemaContado) * 100
      : quantidadeContadaInventario === 0
        ? 100
        : 0;

    const data = inventario.data_encerramento ?? inventario.data_abertura;
    historico.push({
      inventarioId: inventario.id,
      data,
      itensContados: contados.length,
      itensDivergentes: divergentesInventario.length,
      coberturaContagem: itensInventario.length ? (contados.length / itensInventario.length) * 100 : 100,
      acuracidadePorPosicoes: Number(acuracidadePosicoes.toFixed(1)),
      acuracidadePorQuantidade: Number(acuracidadeQuantidade.toFixed(1)),
      divergenciaAbsoluta: Number(divergenciaInventario.toFixed(4)),
    });

    itensAnalisados += itensInventario.length;
    itensContados += contados.length;
    itensDivergentes += divergentesInventario.length;
    quantidadeSistema += sistemaContado;
    quantidadeContada += quantidadeContadaInventario;
    divergenciaAbsoluta += divergenciaInventario;

    for (const item of divergentesInventario) {
      const quantidadeSistemaItem = Math.max(0, item.quantidade_sistema);
      const quantidadeContadaItem = Math.max(0, item.quantidade_contada ?? 0);
      const diferenca = quantidadeContadaItem - quantidadeSistemaItem;
      divergencias.push({
        inventarioId: inventario.id,
        data,
        produtoId: item.produto_id,
        equipeId: item.equipe_id,
        quantidadeSistema: Number(quantidadeSistemaItem.toFixed(4)),
        quantidadeContada: Number(quantidadeContadaItem.toFixed(4)),
        diferenca: Number(diferenca.toFixed(4)),
        divergenciaAbsoluta: Number(Math.abs(diferenca).toFixed(4)),
        acuracidadePercentual: quantidadeSistemaItem > 0
          ? Number((Math.max(0, 1 - Math.abs(diferenca) / quantidadeSistemaItem) * 100).toFixed(1))
          : quantidadeContadaItem === 0
            ? 100
            : 0,
      });
    }
  }

  const ultimoInventario = historico[0] ?? null;
  const coberturaContagem = itensAnalisados > 0 ? (itensContados / itensAnalisados) * 100 : 100;
  const acuracidadePorPosicoes = itensContados > 0
    ? ((itensContados - itensDivergentes) / itensContados) * 100
    : 100;
  const acuracidadePorQuantidade = quantidadeSistema > 0
    ? Math.max(0, 1 - divergenciaAbsoluta / quantidadeSistema) * 100
    : quantidadeContada === 0
      ? 100
      : 0;

  divergencias.sort((a, b) =>
    b.divergenciaAbsoluta - a.divergenciaAbsoluta ||
    a.data.localeCompare(b.data),
  );

  return {
    inventariosConcluidos: concluidos.length,
    itensAnalisados,
    itensContados,
    itensDivergentes,
    coberturaContagem: Number(coberturaContagem.toFixed(1)),
    acuracidadePorPosicoes: Number(acuracidadePorPosicoes.toFixed(1)),
    acuracidadePorQuantidade: Number(acuracidadePorQuantidade.toFixed(1)),
    quantidadeSistema: Number(quantidadeSistema.toFixed(4)),
    quantidadeContada: Number(quantidadeContada.toFixed(4)),
    divergenciaAbsoluta: Number(divergenciaAbsoluta.toFixed(4)),
    ultimoInventario,
    maioresDivergencias: divergencias.slice(0, limiteDivergencias),
    historico: historico.slice(0, 8),
  };
}

export type PlanoInventarioMotivo = {
  codigo:
    | "SALDO_RISCO"
    | "ABAIXO_MINIMO"
    | "COBERTURA_7"
    | "COBERTURA_15"
    | "SAIDAS_FREQUENTES"
    | "NUNCA_INVENTARIADO"
    | "INVENTARIO_ANTIGO";
  label: string;
  pontos: number;
};

export type PlanoInventarioItem = {
  produtoId: string;
  equipeId: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  coberturaDias: number | null;
  saidas30Dias: number;
  quantidadeSaida30Dias: number;
  ultimoInventario: string | null;
  diasDesdeInventario: number | null;
  pontos: number;
  prioridade: "alta" | "media" | "acompanhar";
  motivos: PlanoInventarioMotivo[];
};

export type PlanoInventarioInteligente = {
  periodo: PeriodoEstatisticas;
  posicoesAnalisadas: number;
  posicoesComInventarioAberto: number;
  equipesEnvolvidas: number;
  altas: number;
  medias: number;
  acompanhar: number;
  itens: PlanoInventarioItem[];
  criterios: Array<{ label: string; pontos: string; condicao: string }>;
};

function calcularEfeitoMovimentoLocal(movimentacao: Movimentacao): number {
  if (movimentacao.tipo === "ENTRADA" || movimentacao.tipo === "DEVOLUCAO") return movimentacao.quantidade;
  if (movimentacao.tipo === "SAIDA") return -movimentacao.quantidade;
  return (movimentacao.sinal ?? 1) * movimentacao.quantidade;
}

function diferencaDiasLocal(inicio: string | null, fim = new Date()): number | null {
  if (!inicio) return null;
  const data = parseData(inicio);
  if (Number.isNaN(data.getTime())) return null;
  const hoje = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  const base = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  return Math.max(0, Math.floor((hoje.getTime() - base.getTime()) / DAY_MS));
}

/** Motor único do plano de conferência física do inventário. */
export function calcularPlanoInventarioInteligente(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  equipes: Equipe[],
  inventarios: Inventario[],
  inventarioItens: InventarioItem[],
  periodo: PeriodoEstatisticas = criarPeriodoPadrao(30),
): PlanoInventarioInteligente {
  const produtosAtivos = produtos.filter((produto) => produto.ativo);
  const equipesAtivas = equipes.filter((equipe) => equipe.ativo);
  const produtoMap = new Map(produtosAtivos.map((produto) => [produto.id, produto]));
  const equipeMap = new Map(equipesAtivas.map((equipe) => [equipe.id, equipe]));
  const concluidos = inventarios.filter((inventario) => inventario.status === "CONCLUIDO");
  const abertos = new Set(inventarios.filter((inventario) => inventario.status === "ABERTO").map((inventario) => inventario.id));

  const saldoPorPosicao = new Map<string, number>();
  const saidasPorPosicao = new Map<string, { quantidade: number; registros: number }>();
  const posicoes = new Set<string>();

  for (const movimento of movimentacoes) {
    if (!produtoMap.has(movimento.produto_id) || !equipeMap.has(movimento.equipe_id)) continue;
    const chave = `${movimento.produto_id}:${movimento.equipe_id}`;
    saldoPorPosicao.set(chave, (saldoPorPosicao.get(chave) ?? 0) + calcularEfeitoMovimentoLocal(movimento));
    posicoes.add(chave);

    if (movimento.tipo === "SAIDA" && movimento.data.slice(0, 10) >= periodo.de && movimento.data.slice(0, 10) <= periodo.ate) {
      const atual = saidasPorPosicao.get(chave) ?? { quantidade: 0, registros: 0 };
      atual.quantidade += movimento.quantidade;
      atual.registros += 1;
      saidasPorPosicao.set(chave, atual);
    }
  }

  const ultimaPorPosicao = new Map<string, string>();
  for (const item of inventarioItens) {
    if (!abertos.has(item.inventario_id)) {
      const inventario = concluidos.find((registro) => registro.id === item.inventario_id);
      if (!inventario) continue;
      const data = inventario.data_encerramento ?? inventario.data_abertura;
      const chave = `${item.produto_id}:${item.equipe_id}`;
      const anterior = ultimaPorPosicao.get(chave);
      if (!anterior || data > anterior) ultimaPorPosicao.set(chave, data);
      posicoes.add(chave);
    }
  }

  const inventariadasAbertas = new Set<string>();
  for (const inventario of inventarios) {
    if (inventario.status !== "ABERTO") continue;
    for (const item of inventarioItens) {
      if (item.inventario_id === inventario.id) inventariadasAbertas.add(`${item.produto_id}:${item.equipe_id}`);
    }
  }

  const itens = [...posicoes]
    .map((chave) => {
      const [produtoId = "", equipeId = ""] = chave.split(":");
      const produto = produtoMap.get(produtoId);
      const equipe = equipeMap.get(equipeId);
      if (!produto || !equipe) return null;

      const estoqueAtual = saldoPorPosicao.get(chave) ?? 0;
      const estoqueMinimo = produto.estoque_minimo;
      const saidas = saidasPorPosicao.get(chave) ?? { quantidade: 0, registros: 0 };
      const coberturaDias = saidas.quantidade > 0 ? Math.max(0, estoqueAtual) / (saidas.quantidade / diferencaDiasPeriodo(periodo)) : null;
      const ultimoInventario = ultimaPorPosicao.get(chave) ?? null;
      const diasDesdeInventario = diferencaDiasLocal(ultimoInventario);
      const motivos: PlanoInventarioMotivo[] = [];

      if (estoqueAtual <= 0 && saidas.registros >= 3) motivos.push({ codigo: "SALDO_RISCO", label: "Saldo zerado/negativo com ≥ 3 saídas", pontos: 4 });
      if (estoqueAtual < estoqueMinimo) motivos.push({ codigo: "ABAIXO_MINIMO", label: "Saldo abaixo do estoque mínimo", pontos: 3 });
      if (coberturaDias != null && coberturaDias <= 7) motivos.push({ codigo: "COBERTURA_7", label: "Cobertura estimada até 7 dias", pontos: 3 });
      else if (coberturaDias != null && coberturaDias <= 15) motivos.push({ codigo: "COBERTURA_15", label: "Cobertura estimada entre 8 e 15 dias", pontos: 2 });
      if (saidas.registros >= 3) motivos.push({ codigo: "SAIDAS_FREQUENTES", label: "≥ 3 saídas no período", pontos: 2 });
      if (!ultimoInventario) motivos.push({ codigo: "NUNCA_INVENTARIADO", label: "Posição nunca inventariada", pontos: 2 });
      else if ((diasDesdeInventario ?? 0) >= 90) motivos.push({ codigo: "INVENTARIO_ANTIGO", label: "Último inventário há ≥ 90 dias", pontos: 2 });

      const pontos = motivos.reduce((total, motivo) => total + motivo.pontos, 0);
      const prioridade = pontos >= 6 ? "alta" : pontos >= 3 ? "media" : pontos >= 1 ? "acompanhar" : "acompanhar";
      return {
        produtoId,
        equipeId,
        estoqueAtual: Number(estoqueAtual.toFixed(4)),
        estoqueMinimo: Number(estoqueMinimo.toFixed(4)),
        coberturaDias: coberturaDias == null ? null : Number(coberturaDias.toFixed(1)),
        saidas30Dias: saidas.registros,
        quantidadeSaida30Dias: Number(saidas.quantidade.toFixed(4)),
        ultimoInventario,
        diasDesdeInventario,
        pontos,
        prioridade: prioridade as "alta" | "media" | "acompanhar",
        motivos,
      };
    })
    .filter((item): item is PlanoInventarioItem => item !== null)
    .filter((item) => !inventariadasAbertas.has(`${item.produtoId}:${item.equipeId}`))
    .filter((item) => item.pontos >= 1)
    .sort((a, b) => b.pontos - a.pontos || (a.coberturaDias ?? Infinity) - (b.coberturaDias ?? Infinity));

  return {
    periodo,
    posicoesAnalisadas: posicoes.size,
    posicoesComInventarioAberto: inventariadasAbertas.size,
    equipesEnvolvidas: new Set(itens.map((item) => item.equipeId)).size,
    altas: itens.filter((item) => item.prioridade === "alta").length,
    medias: itens.filter((item) => item.prioridade === "media").length,
    acompanhar: itens.filter((item) => item.prioridade === "acompanhar").length,
    itens,
    criterios: [
      { label: "Saldo em risco", pontos: "+4", condicao: "saldo ≤ 0 e pelo menos 3 saídas no período" },
      { label: "Estoque mínimo", pontos: "+3", condicao: "saldo abaixo do estoque mínimo cadastrado" },
      { label: "Cobertura crítica", pontos: "+3", condicao: "cobertura estimada ≤ 7 dias" },
      { label: "Cobertura curta", pontos: "+2", condicao: "cobertura estimada entre 8 e 15 dias" },
      { label: "Atividade", pontos: "+2", condicao: "pelo menos 3 saídas no período analisado" },
      { label: "Sem inventário", pontos: "+2", condicao: "posição nunca inventariada" },
      { label: "Inventário antigo", pontos: "+2", condicao: "último inventário concluído há 90 dias ou mais" },
    ],
  };
}

export function calcularVigiaOperacional(
  produtos: Produto[],
  movimentacoes: Movimentacao[],
  equipes: Equipe[],
  periodo: PeriodoEstatisticas,
  opcoes: {
    exigirDocumentoEntrada?: boolean;
    documentosAtivos?: boolean;
    exigirJustificativaAjuste?: boolean;
    limiteAlertas?: number;
  } = {},
): ResumoVigiaOperacional {
  const limite = Math.max(1, Math.trunc(opcoes.limiteAlertas ?? 16));
  const analisesProdutos = calcularProdutosEstatisticas(produtos, movimentacoes, periodo);
  const mapaRisco = calcularMapaRiscoCobertura(produtos, movimentacoes, periodo, 10, MIN_SAIDAS_MAPA_RISCO, analisesProdutos);
  const reposicao = calcularAnaliseReposicao(produtos, movimentacoes, periodo, 30, 12, MIN_SAIDAS_MAPA_RISCO, analisesProdutos);
  const desviosProdutos = calcularDesviosConsumoProdutos(produtos, movimentacoes, periodo, 8);
  const desviosEquipes = calcularDesviosConsumoEquipes(movimentacoes, equipes, periodo, 8);
  const documentosAtivos = opcoes.documentosAtivos === true;
  const qualidade = calcularQualidadeEstoque(produtos, movimentacoes, equipes, periodo, {
    exigirDocumentoEntrada: documentosAtivos && opcoes.exigirDocumentoEntrada === true,
    exigirJustificativaAjuste: opcoes.exigirJustificativaAjuste === true,
  });

  const alertas: VigiaAlerta[] = [];
  const idsComReposicao = new Set(reposicao.itens.map((item) => item.produtoId));

  for (const item of reposicao.itens) {
    alertas.push({
      id: `reposicao:${item.produtoId}`,
      tipo: "REPOSICAO",
      prioridade: item.prioridade === "imediata" ? "alta" : "media",
      titulo: item.prioridade === "imediata" ? `Reposição imediata: ${item.produto.nome}` : `Reposição prioritária: ${item.produto.nome}`,
      descricao: `Estoque ${numVigia(item.estoqueAtual)} · consumo ${numVigia(item.consumoMedioDiario)}/dia · sugestão ${numVigia(item.quantidadeSugerida)}.`,
      indicador: `Sugestão ${numVigia(item.quantidadeSugerida)} · cobertura ${item.coberturaDias == null ? "—" : `${numVigia(item.coberturaDias)} dias`}`,
      regra: `Produto participante da inteligência · ≥ ${reposicao.minSaidas} saídas no período · alvo de ${reposicao.diasAlvo} dias.`,
      produtoId: item.produtoId,
      acaoPrincipal: "REPOSICAO",
      acaoSecundaria: "PARAMETROS_PRODUTO",
    });
  }

  for (const item of mapaRisco.itensPrioritarios) {
    if (idsComReposicao.has(item.produtoId)) continue;
    alertas.push({
      id: `risco:${item.produtoId}`,
      tipo: "RISCO_COBERTURA",
      prioridade: item.faixa === "critico" ? "alta" : "media",
      titulo: `${item.faixa === "critico" ? "Cobertura crítica" : "Cobertura em atenção"}: ${item.produto.nome}`,
      descricao: `${numVigia(item.coberturaDias)} dias de cobertura · ${numVigia(item.estoqueAtual)} em estoque · ${numVigia(item.consumoMedioDiario)}/dia.`,
      indicador: `${numVigia(item.coberturaDias)} dias de cobertura`,
      regra: `Mapa de risco com mínimo de ${mapaRisco.minSaidas} saídas no período efetivo.`,
      produtoId: item.produtoId,
      acaoPrincipal: "RISCO_PRODUTO",
      acaoSecundaria: "REPOSICAO",
    });
  }

  for (const item of desviosProdutos) {
    const variacao = item.variacaoPercentual == null ? "novo consumo" : `${item.variacaoPercentual > 0 ? "+" : ""}${numVigia(item.variacaoPercentual)}%`;
    alertas.push({
      id: `desvio-produto:${item.produtoId}`,
      tipo: "DESVIO_PRODUTO",
      prioridade: "media",
      titulo: `Desvio de consumo: ${item.produto.nome}`,
      descricao: `${variacao} nas saídas · atual ${item.saidasAtual} · anterior ${item.saidasAnterior}.`,
      indicador: `${variacao} nas saídas`,
      regra: `Desvio absoluto mínimo de ${LIMIAR_DESVIO_CONSUMO_PERCENTUAL}% entre as janelas comparadas.`,
      produtoId: item.produtoId,
      acaoPrincipal: "DESVIO_PRODUTO",
    });
  }

  for (const item of desviosEquipes) {
    const variacao = item.variacaoPercentual == null ? "novo consumo" : `${item.variacaoPercentual > 0 ? "+" : ""}${numVigia(item.variacaoPercentual)}%`;
    alertas.push({
      id: `desvio-equipe:${item.equipeId ?? "sem-equipe"}`,
      tipo: "DESVIO_EQUIPE",
      prioridade: "media",
      titulo: `Desvio de consumo: ${item.equipe?.nome ?? "Sem equipe"}`,
      descricao: `${variacao} nas saídas · atual ${item.saidasAtual} · anterior ${item.saidasAnterior}.`,
      indicador: `${variacao} nas saídas`,
      regra: `Desvio absoluto mínimo de ${LIMIAR_DESVIO_CONSUMO_PERCENTUAL}% entre as janelas comparadas.`,
      equipeId: item.equipeId,
      acaoPrincipal: "DESVIO_EQUIPE",
    });
  }

  for (const alerta of qualidade.alertas) {
    alertas.push({
      id: `qualidade:${alerta.id}`,
      tipo: "QUALIDADE",
      prioridade: alerta.severidade === "alta" ? "alta" : alerta.severidade === "media" ? "media" : "info",
      titulo: alerta.mensagem,
      descricao: `${alerta.tipoMovimentacao.replaceAll("_", " ")} · movimentação ${alerta.movimentacaoId}`,
      indicador: `Severidade ${alerta.severidade}`,
      regra: alerta.comoCorrigir,
      produtoId: alerta.produtoId,
      equipeId: alerta.equipeId,
      movimentacaoId: alerta.movimentacaoId,
      data: alerta.data,
      acaoPrincipal: "QUALIDADE",
    });
  }

  const peso: Record<VigiaPrioridade, number> = { alta: 0, media: 1, info: 2 };
  alertas.sort((a, b) => {
    const prioridade = peso[a.prioridade] - peso[b.prioridade];
    if (prioridade !== 0) return prioridade;
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });

  return {
    periodo,
    criticos: mapaRisco.critico,
    atencao: mapaRisco.atencao,
    reposicoes: reposicao.totalItens,
    reposicoesImediatas: reposicao.reposicaoImediata,
    reposicoesExcluidasConfiguracao: reposicao.excluidosPorConfiguracao,
    desvios: desviosProdutos.length + desviosEquipes.length,
    alertasQualidade: qualidade.total,
    alertasQualidadeAltos: qualidade.altas,
    alertas: selecionarAlertasVigia(alertas, limite),
  };
}

/**
 * Mantém a fila limitada sem deixar uma única categoria ocupar todos os
 * espaços disponíveis. Primeiro garante uma representação das categorias
 * existentes e, depois, completa a fila pela prioridade já calculada.
 */
function selecionarAlertasVigia(alertas: VigiaAlerta[], limite: number): VigiaAlerta[] {
  if (alertas.length <= limite) return alertas;

  const tiposPreferenciais: VigiaTipoAlerta[] = [
    "REPOSICAO",
    "RISCO_COBERTURA",
    "DESVIO_PRODUTO",
    "DESVIO_EQUIPE",
    "QUALIDADE",
  ];

  const selecionados: VigiaAlerta[] = [];
  const idsSelecionados = new Set<string>();

  for (const tipo of tiposPreferenciais) {
    if (selecionados.length >= limite) break;
    const alerta = alertas.find((item) => item.tipo === tipo);
    if (!alerta) continue;
    selecionados.push(alerta);
    idsSelecionados.add(alerta.id);
  }

  for (const alerta of alertas) {
    if (selecionados.length >= limite) break;
    if (idsSelecionados.has(alerta.id)) continue;
    selecionados.push(alerta);
    idsSelecionados.add(alerta.id);
  }

  return selecionados;
}

function numVigia(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(valor);
}
