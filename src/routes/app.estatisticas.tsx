import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  CalendarClock,
  ChartNoAxesCombined,
  Check,
  ClipboardCheck,
  Download,
  FileText,
  Filter,
  GitCompareArrows,
  Inbox,
  LayoutDashboard,
  Loader2,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/common/Combobox";
import { getDB } from "@/db/db";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import {
  calcularEstadoEstoque,
  calcularCustosDocumentados,
  calcularResumoFinanceiro,
  calcularFluxoFinanceiroPorGrupo,
  calcularQualidadeEstoque,
  calcularFluxoPeriodo,
  analisarConsumo,
  calcularProdutoEstatistica,
  calcularProdutosEstatisticas,
  calcularEstatisticasEquipes,
  calcularProdutoPorEquipe,
  criarPeriodoPadrao,
  filtrarMovimentacoesPeriodo,
  agruparFluxoPorEquipe,
  calcularAcuracidadeInventarios,
  agruparFluxoPorPeriodo,
  agruparMovimentacoesPorDiaSemana,
  calcularComparacaoPeriodos,
  calcularComparacaoPorEquipe,
  calcularComparacaoPorProduto,
  calcularComparacaoPorResponsavel,
  calcularRankingFrequenciaConsumo,
  calcularParetoConsumo,
  calcularRegularidadeConsumo,
  calcularDesviosConsumoProdutos,
  calcularDesviosConsumoEquipes,
  calcularMapaRiscoCobertura,
  calcularAnaliseReposicao,
  MIN_SAIDAS_MAPA_RISCO,
  MIN_SAIDAS_DESVIO_CONSUMO,
  LIMIAR_DESVIO_CONSUMO_PERCENTUAL,
  SEM_EQUIPE_ID,
  SEM_RESPONSAVEL_ID,
} from "@/services/estatisticas-materiais";
import { num } from "@/utils/format";
import { PrintReport } from "@/components/estatisticas/PrintReport";
import {
  ChartCard,
  ChartTooltip,
  COR_ANTERIOR,
  COR_ATUAL,
  COR_EIXO,
  COR_ENTRADA,
  COR_GRID,
  COR_SAIDA,
  EmptyState,
  Metric,
  NavPills,
  Panel,
  SectionHeader,
  SkeletonBlock,
  StatTile,
  TableShell,
  TBODY_CLASS,
  TD_CLASS,
  TD_NUM_CLASS,
  TH_CLASS,
  TH_NUM_CLASS,
  THEAD_CLASS,
  ToneBadge,
  ToneStat,
  TR_CLASS,
  toneTextClass,
  type NavPillItem,
  type Tone,
} from "@/components/estatisticas/ui-estatisticas";

export const Route = createFileRoute("/app/estatisticas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Estatísticas de Materiais — Almoxarifado" },
      {
        name: "description",
        content:
          "Observabilidade de materiais, consumo, cobertura e risco de estoque do projeto ativo.",
      },
    ],
  }),
  component: EstatisticasMateriaisPage,
});

type AbaEstatistica =
  | "executivo"
  | "movimentacoes"
  | "consumo"
  | "equipes"
  | "financeiro"
  | "inventario"
  | "qualidade"
  | "comparativo";

type VisaoEstatisticasSalva = {
  id: string;
  nome: string;
  de: string;
  ate: string;
  produtoId: string | null;
  equipeId: string | null;
  estatisticaAtiva: AbaEstatistica;
};

type Aviso = {
  id: number;
  tipo: "sucesso" | "erro" | "info";
  texto: string;
  /* `| undefined` explícito por causa de exactOptionalPropertyTypes. */
  acao?: { label: string; onClick: () => void } | undefined;
};

const MAX_VISOES = 12;
const PERIODOS_RAPIDOS = [7, 30, 90] as const;

/* Definição estática das abas: fora do componente para não recriar a cada render. */
const ABAS_BASE: ReadonlyArray<{ id: AbaEstatistica; label: string; short: string; icon: NavPillItem<AbaEstatistica>["icon"] }> = [
  { id: "executivo", label: "Painel executivo", short: "Executivo", icon: LayoutDashboard },
  { id: "movimentacoes", label: "Movimentações", short: "Movim.", icon: BarChart3 },
  { id: "consumo", label: "Consumo e cobertura", short: "Consumo", icon: CalendarClock },
  { id: "equipes", label: "Equipes", short: "Equipes", icon: PackageCheck },
  { id: "financeiro", label: "Financeiro", short: "Financeiro", icon: ChartNoAxesCombined },
  { id: "inventario", label: "Inventário", short: "Inventário", icon: ClipboardCheck },
  { id: "qualidade", label: "Qualidade e alertas", short: "Qualidade", icon: ShieldAlert },
  { id: "comparativo", label: "Comparativo e relatório", short: "Comparativo", icon: GitCompareArrows },
];

function EstatisticasMateriaisPage() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const periodoPadrao = useMemo(() => criarPeriodoPadrao(30), []);
  const [de, setDe] = useState(periodoPadrao.de);
  const [ate, setAte] = useState(periodoPadrao.ate);
  const [deAplicado, setDeAplicado] = useState(periodoPadrao.de);
  const [ateAplicado, setAteAplicado] = useState(periodoPadrao.ate);
  const [isPending, startTransition] = useTransition();
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [estatisticaAtiva, setEstatisticaAtiva] = useState<AbaEstatistica>("movimentacoes");
  const [visoesSalvas, setVisoesSalvas] = useState<VisaoEstatisticasSalva[]>([]);
  const [visoesCarregadas, setVisoesCarregadas] = useState(false);
  const [nomeNovaVisao, setNomeNovaVisao] = useState("");
  const [formVisaoAberto, setFormVisaoAberto] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const campoNomeVisaoRef = useRef<HTMLInputElement | null>(null);

  /* ---------------------------------------------------------------- */
  /* Feedback ao usuário                                               */
  /* ---------------------------------------------------------------- */

  const avisar = useCallback((tipo: Aviso["tipo"], texto: string, acao?: Aviso["acao"]) => {
    const id = Date.now() + Math.random();
    setAvisos((atual) => [...atual.slice(-2), { id, tipo, texto, acao }]);
    window.setTimeout(() => {
      setAvisos((atual) => atual.filter((item) => item.id !== id));
    }, acao ? 8000 : 4000);
  }, []);

  const descartarAviso = useCallback((id: number) => {
    setAvisos((atual) => atual.filter((item) => item.id !== id));
  }, []);

  /* ---------------------------------------------------------------- */
  /* Visões salvas                                                     */
  /* ---------------------------------------------------------------- */

  const chaveVisoes = useMemo(
    () => (projetoId ? `almoxarifado:estatisticas:visoes:${projetoId}` : "almoxarifado:estatisticas:visoes"),
    [projetoId],
  );

  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(chaveVisoes);
      if (!bruto) {
        setVisoesSalvas([]);
        setVisoesCarregadas(true);
        return;
      }
      const parsed: unknown = JSON.parse(bruto);
      if (!Array.isArray(parsed)) {
        setVisoesSalvas([]);
        return;
      }
      setVisoesSalvas(
        parsed.filter((item): item is VisaoEstatisticasSalva =>
          !!item &&
          typeof item === "object" &&
          typeof (item as VisaoEstatisticasSalva).id === "string" &&
          typeof (item as VisaoEstatisticasSalva).nome === "string" &&
          typeof (item as VisaoEstatisticasSalva).de === "string" &&
          typeof (item as VisaoEstatisticasSalva).ate === "string" &&
          typeof (item as VisaoEstatisticasSalva).estatisticaAtiva === "string",
        ),
      );
      setVisoesCarregadas(true);
    } catch {
      setVisoesSalvas([]);
      setVisoesCarregadas(true);
    }
  }, [chaveVisoes]);

  useEffect(() => {
    if (!visoesCarregadas) return;
    try {
      window.localStorage.setItem(chaveVisoes, JSON.stringify(visoesSalvas));
    } catch {
      // Preferimos manter a tela funcional mesmo quando o armazenamento local estiver indisponível.
    }
  }, [chaveVisoes, visoesSalvas, visoesCarregadas]);

  /* ---------------------------------------------------------------- */
  /* Período com debounce                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (de === deAplicado && ate === ateAplicado) return;
    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        setDeAplicado(de);
        setAteAplicado(ate);
      });
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [de, ate, deAplicado, ateAplicado, startTransition]);

  useEffect(() => {
    // Ao trocar de projeto, nunca carregamos filtros que pertençam ao contexto anterior.
    setDe(periodoPadrao.de);
    setAte(periodoPadrao.ate);
    setDeAplicado(periodoPadrao.de);
    setAteAplicado(periodoPadrao.ate);
    setProdutoId(null);
    setEquipeId(null);
    setEstatisticaAtiva("movimentacoes");
    setFormVisaoAberto(false);
  }, [projetoId, periodoPadrao.de, periodoPadrao.ate]);

  const produtos = dados?.produtos;
  const equipes = dados?.equipes;
  const movimentacoes = dados?.movimentacoes;
  const funcionarios = dados?.funcionarios;
  const unidades = dados?.unidades;
  const categorias = dados?.categorias;

  useEffect(() => {
    if (!produtos || !equipes) return;
    if (produtoId && !produtos.some((produto) => produto.id === produtoId)) setProdutoId(null);
    if (equipeId && !equipes.some((equipe) => equipe.id === equipeId)) setEquipeId(null);
  }, [produtos, equipes, produtoId, equipeId]);

  /* ---------------------------------------------------------------- */
  /* Fontes auxiliares (Dexie)                                         */
  /* ---------------------------------------------------------------- */

  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );
  const documentos = useLiveQuery(
    async () => (projetoId ? getDB().documentos.where("projeto_id").equals(projetoId).toArray() : []),
    [projetoId],
  );
  const documentosIdsKey = useMemo(
    () => (documentos ?? []).map((documento) => documento.id).sort().join("|"),
    [documentos],
  );
  const documentoItens = useLiveQuery(
    async () => {
      const ids = documentosIdsKey ? documentosIdsKey.split("|").filter(Boolean) : [];
      if (!ids.length) return [];
      return getDB().documento_itens.where("documento_id").anyOf(ids).toArray();
    },
    [documentosIdsKey],
  );
  const inventarios = useLiveQuery(
    async () => (projetoId ? getDB().inventarios.where("projeto_id").equals(projetoId).toArray() : []),
    [projetoId],
  );
  const inventarioIdsKey = useMemo(
    () => (inventarios ?? []).map((inventario) => inventario.id).sort().join("|"),
    [inventarios],
  );
  const inventarioItens = useLiveQuery(
    async () => {
      const ids = inventarioIdsKey ? inventarioIdsKey.split("|").filter(Boolean) : [];
      if (!ids.length) return [];
      return getDB().inventario_itens.where("inventario_id").anyOf(ids).toArray();
    },
    [inventarioIdsKey],
  );

  /* ---------------------------------------------------------------- */
  /* Índices de busca — substituem os .find() dentro dos loops         */
  /* ---------------------------------------------------------------- */

  const produtosPorId = useMemo(() => new Map((produtos ?? []).map((p) => [p.id, p])), [produtos]);
  const equipesPorId = useMemo(() => new Map((equipes ?? []).map((e) => [e.id, e])), [equipes]);
  const funcionariosPorId = useMemo(() => new Map((funcionarios ?? []).map((f) => [f.id, f])), [funcionarios]);
  const nomesEquipes = useMemo(() => new Map((equipes ?? []).map((e) => [e.id, e.nome])), [equipes]);
  const nomesFuncionarios = useMemo(() => new Map((funcionarios ?? []).map((f) => [f.id, f.nome])), [funcionarios]);

  const opcoesProdutos = useMemo(
    () => (produtos ?? []).map((produto) => ({ value: produto.id, label: produto.nome })),
    [produtos],
  );
  const opcoesEquipes = useMemo(
    () => (equipes ?? []).map((equipe) => ({ value: equipe.id, label: equipe.nome })),
    [equipes],
  );

  /* ---------------------------------------------------------------- */
  /* Cálculos                                                          */
  /* ---------------------------------------------------------------- */

  const periodo = useMemo(() => ({ de: deAplicado, ate: ateAplicado }), [deAplicado, ateAplicado]);

  const movimentacoesContexto = useMemo(
    () =>
      (movimentacoes ?? []).filter((mov) => {
        if (produtoId && mov.produto_id !== produtoId) return false;
        if (equipeId && mov.equipe_id !== equipeId) return false;
        return true;
      }),
    [movimentacoes, produtoId, equipeId],
  );

  const movimentacoesFiltradas = useMemo(
    () => filtrarMovimentacoesPeriodo(movimentacoesContexto, periodo),
    [movimentacoesContexto, periodo],
  );

  /* Recortes reutilizados por vários cálculos — memoizados uma única vez. */
  const movsPorEquipe = useMemo(
    () => (equipeId ? (movimentacoes ?? []).filter((mov) => mov.equipe_id === equipeId) : movimentacoes ?? []),
    [movimentacoes, equipeId],
  );
  const movsPorProduto = useMemo(
    () => (produtoId ? (movimentacoes ?? []).filter((mov) => mov.produto_id === produtoId) : movimentacoes ?? []),
    [movimentacoes, produtoId],
  );

  const comparacaoPeriodos = useMemo(
    () => calcularComparacaoPeriodos(movimentacoesContexto, periodo),
    [movimentacoesContexto, periodo],
  );

  const comparacaoPorEquipe = useMemo(
    () => calcularComparacaoPorEquipe(movimentacoesContexto, periodo),
    [movimentacoesContexto, periodo],
  );

  const comparacaoPorProduto = useMemo(
    () => calcularComparacaoPorProduto(movimentacoesContexto, periodo, 10),
    [movimentacoesContexto, periodo],
  );

  const serieComparacao = useMemo(
    () => [
      { indicador: "Movimentações", anterior: comparacaoPeriodos.anterior.movimentacoes, atual: comparacaoPeriodos.atual.movimentacoes },
      { indicador: "Entradas", anterior: comparacaoPeriodos.anterior.entradasMovimentacoes, atual: comparacaoPeriodos.atual.entradasMovimentacoes },
      { indicador: "Saídas", anterior: comparacaoPeriodos.anterior.saidasMovimentacoes, atual: comparacaoPeriodos.atual.saidasMovimentacoes },
      { indicador: "Produtos", anterior: comparacaoPeriodos.anterior.produtosMovimentados, atual: comparacaoPeriodos.atual.produtosMovimentados },
    ],
    [comparacaoPeriodos],
  );

  const comparacaoPorResponsavel = useMemo(
    () => (movimentacoes ? calcularComparacaoPorResponsavel(movsPorEquipe, periodo, 8) : []),
    [movimentacoes, movsPorEquipe, periodo],
  );

  const estado = useMemo(
    () =>
      produtos && unidades && categorias && equipes
        ? calcularEstadoEstoque(
            produtoId ? produtos.filter((produto) => produto.id === produtoId) : produtos,
            movimentacoesContexto,
            unidades,
            categorias,
            equipes,
          )
        : null,
    [produtos, unidades, categorias, equipes, produtoId, movimentacoesContexto],
  );

  const fluxo = useMemo(
    () => (movimentacoes ? calcularFluxoPeriodo(movimentacoesFiltradas, periodo) : null),
    [movimentacoes, movimentacoesFiltradas, periodo],
  );

  const produtoSelecionado = useMemo(
    () => (produtoId ? produtosPorId.get(produtoId) ?? null : null),
    [produtosPorId, produtoId],
  );

  const produtoAnalise = useMemo(
    () => (produtoSelecionado ? calcularProdutoEstatistica(produtoSelecionado, movsPorEquipe, periodo) : null),
    [produtoSelecionado, movsPorEquipe, periodo],
  );

  const analiseConsumoProduto = useMemo(
    () =>
      produtoSelecionado
        ? analisarConsumo(
            movsPorEquipe.filter((mov) => mov.produto_id === produtoSelecionado.id),
            periodo,
            produtoAnalise?.estoqueAtual ?? null,
          )
        : null,
    [produtoSelecionado, movsPorEquipe, periodo, produtoAnalise?.estoqueAtual],
  );

  const rankingConsumoProdutos = useMemo(
    () => (produtos ? calcularRankingFrequenciaConsumo(produtos, movimentacoesFiltradas, periodo, 10) : []),
    [produtos, movimentacoesFiltradas, periodo],
  );

  const paretoConsumoProdutos = useMemo(
    () => (produtos ? calcularParetoConsumo(produtos, movimentacoesFiltradas, periodo, 15) : []),
    [produtos, movimentacoesFiltradas, periodo],
  );

  const regularidadeConsumoProduto = useMemo(
    () => (produtoSelecionado ? calcularRegularidadeConsumo(produtoSelecionado.id, movsPorEquipe, periodo) : null),
    [produtoSelecionado, movsPorEquipe, periodo],
  );

  const desviosConsumoProdutos = useMemo(
    () =>
      produtos
        ? calcularDesviosConsumoProdutos(
            produtos,
            movimentacoesContexto,
            periodo,
            8,
            MIN_SAIDAS_DESVIO_CONSUMO,
            LIMIAR_DESVIO_CONSUMO_PERCENTUAL,
          )
        : [],
    [produtos, movimentacoesContexto, periodo],
  );

  const desviosConsumoEquipes = useMemo(
    () =>
      equipes
        ? calcularDesviosConsumoEquipes(
            movimentacoesContexto,
            equipes,
            periodo,
            8,
            MIN_SAIDAS_DESVIO_CONSUMO,
            LIMIAR_DESVIO_CONSUMO_PERCENTUAL,
          )
        : [],
    [equipes, movimentacoesContexto, periodo],
  );

  // O gráfico sempre exibe um par de barras (entradas/saídas) por estoque de
  // equipe, considerando as movimentações já filtradas por período, produto e
  // equipe. Estoques não vinculados a uma equipe são agrupados sob "Sem equipe".
  const serieGrafico = useMemo(() => {
    if (!equipes) return [];
    return agruparFluxoPorEquipe(movimentacoesFiltradas)
      .map((item) => ({
        equipeId: item.equipeId,
        nome: item.equipeId === SEM_EQUIPE_ID ? "Sem equipe" : nomesEquipes.get(item.equipeId) ?? "Sem equipe",
        entradas: item.entradas,
        saidas: item.saidas,
      }))
      .sort((a, b) => {
        if (a.equipeId === SEM_EQUIPE_ID) return 1;
        if (b.equipeId === SEM_EQUIPE_ID) return -1;
        return a.nome.localeCompare(b.nome);
      });
  }, [equipes, nomesEquipes, movimentacoesFiltradas]);

  const serieTemporal = useMemo(() => {
    if (!movimentacoes) return [];
    const inicio = new Date(`${periodo.de}T00:00:00`);
    const fim = new Date(`${periodo.ate}T00:00:00`);
    const dias =
      Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())
        ? 30
        : Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1);
    const grupo: "dia" | "semana" | "mes" = dias <= 14 ? "dia" : dias <= 90 ? "semana" : "mes";
    return agruparFluxoPorPeriodo(movimentacoesFiltradas, grupo);
  }, [movimentacoes, movimentacoesFiltradas, periodo]);

  const distribuicaoDiaSemana = useMemo(
    () => agruparMovimentacoesPorDiaSemana(movimentacoesFiltradas),
    [movimentacoesFiltradas],
  );

  const estatisticasEquipes = useMemo(
    () =>
      produtos && unidades && categorias && equipes
        ? calcularEstatisticasEquipes(
            produtos,
            movsPorProduto,
            unidades,
            categorias,
            equipeId ? equipes.filter((equipe) => equipe.id === equipeId) : equipes,
            periodo,
            undefined,
            false,
          )
        : [],
    [produtos, unidades, categorias, equipes, movsPorProduto, equipeId, periodo],
  );

  const produtoPorEquipe = useMemo(
    () =>
      produtoSelecionado && equipes
        ? calcularProdutoPorEquipe(produtoSelecionado, movsPorEquipe, equipes, periodo)
        : [],
    [produtoSelecionado, equipes, movsPorEquipe, periodo],
  );

  const documentosAtivos = configuracao?.modulos.documentos === true;

  const custos = useMemo(() => {
    if (!documentosAtivos || !produtos || !movimentacoes || !documentoItens || !documentos) return new Map();
    const documentosValidos = new Set(
      documentos.filter((documento) => documento.status !== "CANCELADO").map((documento) => documento.id),
    );
    return calcularCustosDocumentados(
      produtos.map((produto) => produto.id),
      documentoItens.filter((item) => documentosValidos.has(item.documento_id)),
      movimentacoes,
      true,
    );
  }, [produtos, movimentacoes, documentoItens, documentos, documentosAtivos]);

  const resumoFinanceiro = useMemo(
    () =>
      produtos && unidades && categorias && equipes
        ? calcularResumoFinanceiro(produtos, movsPorEquipe, unidades, categorias, equipes, custos, periodo, documentosAtivos)
        : null,
    [produtos, unidades, categorias, equipes, movsPorEquipe, custos, periodo, documentosAtivos],
  );

  const financeiroPorEquipe = useMemo(
    () =>
      movimentacoes && documentosAtivos
        ? calcularFluxoFinanceiroPorGrupo(movsPorEquipe, periodo, custos, (mov) => mov.equipe_id, 8)
        : [],
    [movimentacoes, movsPorEquipe, documentosAtivos, custos, periodo],
  );

  const financeiroPorResponsavel = useMemo(
    () =>
      movimentacoes && documentosAtivos
        ? calcularFluxoFinanceiroPorGrupo(
            movsPorEquipe,
            periodo,
            custos,
            (mov) => mov.encarregado_id ?? mov.funcionario_id,
            8,
          )
        : [],
    [movimentacoes, movsPorEquipe, documentosAtivos, custos, periodo],
  );

  const exigirDocumentoEntrada = configuracao?.documentos.exigir_na_entrada === true;
  const exigirJustificativaAjuste = configuracao?.estoque.exigir_justificativa_ajuste === true;

  const qualidade = useMemo(
    () =>
      produtos && movimentacoes && equipes
        ? calcularQualidadeEstoque(produtos, movimentacoes, equipes, periodo, {
            exigirDocumentoEntrada,
            exigirJustificativaAjuste,
          })
        : null,
    [produtos, movimentacoes, equipes, periodo, exigirDocumentoEntrada, exigirJustificativaAjuste],
  );

  const acuracidadeInventario = useMemo(
    () => calcularAcuracidadeInventarios(inventarios ?? [], inventarioItens ?? [], 10),
    [inventarios, inventarioItens],
  );

  const estatisticasProdutosContexto = useMemo(
    () => (produtos ? calcularProdutosEstatisticas(produtos, movimentacoesContexto, periodo) : []),
    [produtos, movimentacoesContexto, periodo],
  );

  const produtosEmRisco = useMemo(
    () =>
      estatisticasProdutosContexto
        .filter((item) => item.coberturaDias !== null && item.estoqueAtual > 0 && item.coberturaDias <= 30)
        .sort((a, b) => (a.coberturaDias ?? Infinity) - (b.coberturaDias ?? Infinity))
        .slice(0, 8),
    [estatisticasProdutosContexto],
  );

  const produtosContexto = useMemo(
    () => (produtos ? (produtoId ? produtos.filter((produto) => produto.id === produtoId) : produtos) : null),
    [produtos, produtoId],
  );

  const mapaRiscoCobertura = useMemo(
    () =>
      produtosContexto
        ? calcularMapaRiscoCobertura(
            produtosContexto,
            movimentacoesContexto,
            periodo,
            10,
            MIN_SAIDAS_MAPA_RISCO,
            estatisticasProdutosContexto,
          )
        : null,
    [produtosContexto, movimentacoesContexto, periodo, estatisticasProdutosContexto],
  );

  const analiseReposicao = useMemo(
    () =>
      produtosContexto
        ? calcularAnaliseReposicao(
            produtosContexto,
            movimentacoesContexto,
            periodo,
            30,
            12,
            MIN_SAIDAS_MAPA_RISCO,
            estatisticasProdutosContexto,
          )
        : null,
    [produtosContexto, movimentacoesContexto, periodo, estatisticasProdutosContexto],
  );

  /* ---------------------------------------------------------------- */
  /* Ações                                                             */
  /* ---------------------------------------------------------------- */

  const processando = isPending || de !== deAplicado || ate !== ateAplicado;

  const irPara = useCallback((aba: AbaEstatistica) => setEstatisticaAtiva(aba), []);

  const abrirProduto = useCallback((id: string) => {
    setEquipeId(null);
    setProdutoId(id);
  }, []);

  const abrirProdutoEmConsumo = useCallback((id: string) => {
    setEquipeId(null);
    setProdutoId(id);
    setEstatisticaAtiva("consumo");
  }, []);

  const abrirEquipe = useCallback((id: string) => {
    setProdutoId(null);
    setEquipeId(id);
    setEstatisticaAtiva("equipes");
  }, []);

  const aplicarPeriodoRapido = useCallback((dias: number) => {
    const novo = criarPeriodoPadrao(dias);
    setDe(novo.de);
    setAte(novo.ate);
  }, []);

  const limparFiltros = useCallback(() => {
    const novo = criarPeriodoPadrao(30);
    setDe(novo.de);
    setAte(novo.ate);
    setProdutoId(null);
    setEquipeId(null);
    avisar("info", "Filtros restaurados para os últimos 30 dias.");
  }, [avisar]);

  const exportarCsv = useCallback(() => {
    if (!dados) return;
    try {
      exportarEstatisticasCsv({ dados, periodo, produtoId, equipeId, comparacao: comparacaoPeriodos });
      avisar("sucesso", "CSV exportado com os filtros atuais.");
    } catch {
      avisar("erro", "Não foi possível gerar o CSV. Verifique as permissões de download do navegador.");
    }
  }, [dados, periodo, produtoId, equipeId, comparacaoPeriodos, avisar]);

  const imprimir = useCallback(() => {
    avisar("info", "Abrindo a caixa de impressão com o relatório completo do período.");
    // Damos um quadro para o aviso aparecer antes de o navegador bloquear a thread.
    window.setTimeout(() => window.print(), 80);
  }, [avisar]);

  const salvarVisao = useCallback(() => {
    const nome = nomeNovaVisao.trim();
    if (!nome) {
      campoNomeVisaoRef.current?.focus();
      avisar("erro", "Dê um nome à visão antes de salvar.");
      return;
    }
    const nova: VisaoEstatisticasSalva = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nome,
      de,
      ate,
      produtoId,
      equipeId,
      estatisticaAtiva,
    };
    setVisoesSalvas((atual) => [nova, ...atual].slice(0, MAX_VISOES));
    setNomeNovaVisao("");
    setFormVisaoAberto(false);
    avisar("sucesso", `Visão "${nome}" salva.`);
  }, [nomeNovaVisao, de, ate, produtoId, equipeId, estatisticaAtiva, avisar]);

  const aplicarVisao = useCallback(
    (visao: VisaoEstatisticasSalva) => {
      setDe(visao.de);
      setAte(visao.ate);
      setProdutoId(visao.produtoId);
      setEquipeId(visao.equipeId);
      setEstatisticaAtiva(visao.estatisticaAtiva);
      avisar("info", `Visão "${visao.nome}" aplicada.`);
    },
    [avisar],
  );

  const excluirVisao = useCallback(
    (visao: VisaoEstatisticasSalva) => {
      setVisoesSalvas((atual) => atual.filter((item) => item.id !== visao.id));
      avisar("info", `Visão "${visao.nome}" excluída.`, {
        label: "Desfazer",
        onClick: () => setVisoesSalvas((atual) => [visao, ...atual].slice(0, MAX_VISOES)),
      });
    },
    [avisar],
  );

  /* Contagens de exceção exibidas direto nas abas. */
  const abas = useMemo<ReadonlyArray<NavPillItem<AbaEstatistica>>>(() => {
    const risco = (mapaRiscoCobertura?.critico ?? 0) + (mapaRiscoCobertura?.atencao ?? 0);
    const alertas = qualidade?.total ?? 0;
    return ABAS_BASE.map((aba) => {
      if (aba.id === "consumo") {
        return { ...aba, badge: risco, badgeTone: (mapaRiscoCobertura?.critico ?? 0) > 0 ? "danger" : "warning" };
      }
      if (aba.id === "qualidade") {
        return { ...aba, badge: alertas, badgeTone: (qualidade?.altas ?? 0) > 0 ? "danger" : "warning" };
      }
      return aba;
    });
  }, [mapaRiscoCobertura?.critico, mapaRiscoCobertura?.atencao, qualidade?.total, qualidade?.altas]);

  /* ---------------------------------------------------------------- */
  /* Estados de carregamento                                           */
  /* ---------------------------------------------------------------- */

  if (!projetoId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="w-full max-w-xl">
          <CardContent className="space-y-3 p-8 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LayoutDashboard className="size-6" />
            </span>
            <h2 className="font-display text-lg font-semibold uppercase">Selecione um projeto</h2>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
              As estatísticas de materiais são calculadas sobre o projeto ativo. Escolha um projeto para ver estoque,
              consumo e alertas.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="space-y-5 p-1">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Preparando as estatísticas</p>
            <p className="text-sm text-muted-foreground">
              Carregando movimentos e indicadores do projeto. Isso pode levar alguns instantes.
            </p>
          </div>
        </div>
        <SkeletonBlock className="h-36" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => (
            <SkeletonBlock key={item} className="h-28" />
          ))}
        </div>
        <SkeletonBlock className="h-14" />
        <SkeletonBlock className="h-80" />
      </div>
    );
  }

  const temFiltros = Boolean(produtoId || equipeId);
  const nomeProdutoFiltro = produtoId ? produtosPorId.get(produtoId)?.nome ?? "não localizado" : null;
  const nomeEquipeFiltro = equipeId ? nomesEquipes.get(equipeId) ?? "não localizada" : null;

  return (
    <div className="relative space-y-6">
      {/* Avisos: uma única região viva, anunciada por leitores de tela. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end"
        role="status"
        aria-live="polite"
      >
        {avisos.map((aviso) => (
          <div
            key={aviso.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg backdrop-blur ${
              aviso.tipo === "sucesso"
                ? "border-success/30 bg-success/10 text-foreground"
                : aviso.tipo === "erro"
                  ? "border-destructive/30 bg-destructive/10 text-foreground"
                  : "border-border bg-card/95 text-foreground"
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {aviso.tipo === "sucesso" ? (
                <Check className="size-4 text-success" />
              ) : aviso.tipo === "erro" ? (
                <AlertTriangle className="size-4 text-destructive" />
              ) : (
                <Inbox className="size-4 text-muted-foreground" />
              )}
            </span>
            <p className="min-w-0 flex-1 leading-snug">{aviso.texto}</p>
            {aviso.acao ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-my-1 h-7 shrink-0 px-2"
                onClick={() => {
                  aviso.acao?.onClick();
                  descartarAviso(aviso.id);
                }}
              >
                {aviso.acao.label}
              </Button>
            ) : null}
            <button
              type="button"
              aria-label="Fechar aviso"
              className="-my-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => descartarAviso(aviso.id)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      {processando ? (
        <div className="sticky top-0 z-30 flex items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 text-sm shadow-sm backdrop-blur">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Recalculando com os novos filtros</p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
          </div>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            {de} → {ate}
          </span>
        </div>
      ) : null}

      <div className={processando ? "space-y-6 opacity-60 transition-opacity duration-200" : "space-y-6 transition-opacity duration-200"}>
        {/* ---------------- Cabeçalho ---------------- */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold uppercase leading-none">Estatísticas de materiais</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              O estoque atual é calculado com todo o histórico. O período abaixo controla fluxos, consumo e comparações.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => aplicarPeriodoRapido(30)}>
              <RotateCcw className="size-4" />
              Últimos 30 dias
            </Button>
            <Button variant="outline" size="sm" disabled={processando} onClick={exportarCsv}>
              <Download className="size-4" />
              Exportar CSV
            </Button>
            <Button size="sm" disabled={processando} onClick={imprimir}>
              <FileText className="size-4" />
              Imprimir relatório
            </Button>
          </div>
        </div>

        {/* ---------------- Filtros ---------------- */}
        <Card className="overflow-hidden border-l-4 border-l-primary/40">
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="filtro-de">De</Label>
                <Input id="filtro-de" type="date" value={de} max={ate} onChange={(event) => setDe(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="filtro-ate">Até</Label>
                <Input id="filtro-ate" type="date" value={ate} min={de} onChange={(event) => setAte(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Produto</Label>
                <Combobox placeholder="Todos os produtos" value={produtoId} onChange={setProdutoId} opcoes={opcoesProdutos} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Equipe</Label>
                <Combobox placeholder="Todas as equipes" value={equipeId} onChange={setEquipeId} opcoes={opcoesEquipes} />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Período rápido</span>
                  {PERIODOS_RAPIDOS.map((dias) => {
                    const alvo = criarPeriodoPadrao(dias);
                    const ativo = de === alvo.de && ate === alvo.ate;
                    return (
                      <Button
                        key={dias}
                        type="button"
                        variant={ativo ? "default" : "outline"}
                        size="sm"
                        aria-pressed={ativo}
                        onClick={() => aplicarPeriodoRapido(dias)}
                      >
                        {dias} dias
                      </Button>
                    );
                  })}
                </div>
                <Button type="button" variant="ghost" size="sm" className="self-start sm:self-auto" onClick={limparFiltros}>
                  <RotateCcw className="size-4" />
                  Limpar filtros
                </Button>
              </div>

              {/* ---------------- Visões salvas ---------------- */}
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Bookmark className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Visões salvas</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Guarde uma combinação de período, produto, equipe e aba para voltar a ela depois.
                        {visoesSalvas.length >= MAX_VISOES
                          ? " O limite é 12: a visão mais antiga sai quando você salva outra."
                          : ""}
                      </p>
                    </div>
                  </div>
                  {!formVisaoAberto ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setFormVisaoAberto(true);
                        window.setTimeout(() => campoNomeVisaoRef.current?.focus(), 0);
                      }}
                    >
                      <Save className="size-4" />
                      Salvar visão atual
                    </Button>
                  ) : null}
                </div>

                {formVisaoAberto ? (
                  <div className="flex flex-col gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label className="text-xs" htmlFor="nome-visao">Nome da visão</Label>
                      <Input
                        id="nome-visao"
                        ref={campoNomeVisaoRef}
                        value={nomeNovaVisao}
                        maxLength={48}
                        placeholder="Ex.: Consumo crítico da equipe A"
                        onChange={(event) => setNomeNovaVisao(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") salvarVisao();
                          if (event.key === "Escape") {
                            setFormVisaoAberto(false);
                            setNomeNovaVisao("");
                          }
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Serão guardados: {de} → {ate} · {nomeProdutoFiltro ?? "Todos os produtos"} ·{" "}
                        {nomeEquipeFiltro ?? "Todas as equipes"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" size="sm" onClick={salvarVisao}>
                        <Check className="size-4" />
                        Salvar visão
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setFormVisaoAberto(false);
                          setNomeNovaVisao("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}

                {visoesSalvas.length ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {visoesSalvas.map((visao) => {
                      const produtoNome = visao.produtoId
                        ? produtosPorId.get(visao.produtoId)?.nome ?? "Produto não localizado"
                        : "Todos os produtos";
                      const equipeNome = visao.equipeId
                        ? nomesEquipes.get(visao.equipeId) ?? "Equipe não localizada"
                        : "Todas as equipes";
                      return (
                        <div
                          key={visao.id}
                          className="flex items-center justify-between gap-2 rounded-lg border bg-background p-2.5 transition-shadow hover:shadow-sm"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => aplicarVisao(visao)}
                          >
                            <p className="truncate text-sm font-medium">{visao.nome}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {visao.de} → {visao.ate} · {produtoNome} · {equipeNome}
                            </p>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Excluir visão ${visao.nome}`}
                            onClick={() => excluirVisao(visao)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhuma visão salva neste projeto ainda.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---------------- Estado do estoque ---------------- */}
        <section aria-labelledby="estado-estoque" className="space-y-3">
          <SectionHeader
            id="estado-estoque"
            icon={PackageOpen}
            title="Estado do estoque"
            description="Fotografia atual, calculada com todo o histórico do projeto. Quantidades de unidades diferentes nunca são somadas em um número único."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Posições de estoque" valor={num(estado?.posicoesEstoque ?? 0)} icon={PackageOpen} />
            <StatTile label="Produtos com estoque" valor={num(estado?.produtosComEstoque ?? 0)} icon={PackageCheck} tone="success" />
            <StatTile
              label="Produtos zerados"
              valor={num(estado?.produtosZerados ?? 0)}
              icon={ShieldAlert}
              tone={(estado?.produtosZerados ?? 0) > 0 ? "warning" : "neutral"}
            />
            <StatTile
              label="Posições abaixo do mínimo"
              valor={num(estado?.posicoesAbaixoDoMinimo ?? 0)}
              icon={AlertTriangle}
              tone={(estado?.posicoesAbaixoDoMinimo ?? 0) > 0 ? "warning" : "success"}
            />
            <StatTile
              label="Produtos abaixo do mínimo"
              valor={num(estado?.produtosAbaixoDoMinimo ?? 0)}
              icon={AlertTriangle}
              tone={(estado?.produtosAbaixoDoMinimo ?? 0) > 0 ? "warning" : "success"}
            />
          </div>
        </section>

        {/* ---------------- Navegação ---------------- */}
        <div className="sticky top-0 z-20 -mx-1 bg-background/85 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <NavPills items={abas} value={estatisticaAtiva} onChange={irPara} ariaLabel="Categorias de estatísticas" />

          {temFiltros ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                <Filter className="size-3.5" />
                Filtros ativos
              </span>
              {nomeProdutoFiltro ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-medium text-primary transition-colors hover:bg-primary/20"
                  onClick={() => setProdutoId(null)}
                >
                  Produto: {nomeProdutoFiltro}
                  <X className="size-3" />
                </button>
              ) : null}
              {nomeEquipeFiltro ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-medium text-primary transition-colors hover:bg-primary/20"
                  onClick={() => setEquipeId(null)}
                >
                  Equipe: {nomeEquipeFiltro}
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* ---------------- Painel ativo ---------------- */}
        <div id={`painel-${estatisticaAtiva}`} role="tabpanel" aria-labelledby={`aba-${estatisticaAtiva}`} tabIndex={-1}>
          {estatisticaAtiva === "executivo" ? (
            <PainelExecutivo
              fluxo={fluxo}
              estado={estado}
              mapaRisco={mapaRiscoCobertura}
              reposicao={analiseReposicao}
              qualidade={qualidade}
              acuracidade={acuracidadeInventario}
              desviosProdutos={desviosConsumoProdutos.length}
              desviosEquipes={desviosConsumoEquipes.length}
              irPara={irPara}
            />
          ) : estatisticaAtiva === "movimentacoes" ? (
            <AbaMovimentacoes
              fluxo={fluxo}
              serieGrafico={serieGrafico}
              serieTemporal={serieTemporal}
              distribuicaoDiaSemana={distribuicaoDiaSemana}
            />
          ) : estatisticaAtiva === "consumo" ? (
            <AbaConsumo
              produtosEmRisco={produtosEmRisco}
              produtoAnalise={produtoAnalise}
              analiseConsumoProduto={analiseConsumoProduto}
              mapaRisco={mapaRiscoCobertura}
              reposicao={analiseReposicao}
              ranking={rankingConsumoProdutos}
              pareto={paretoConsumoProdutos}
              regularidade={regularidadeConsumoProduto}
              produtoSelecionado={produtoSelecionado}
              desviosProdutos={desviosConsumoProdutos}
              desviosEquipes={desviosConsumoEquipes}
              abrirProduto={abrirProduto}
              abrirEquipe={abrirEquipe}
            />
          ) : estatisticaAtiva === "equipes" ? (
            <AbaEquipes
              produtoSelecionado={produtoSelecionado}
              produtoPorEquipe={produtoPorEquipe}
              estatisticasEquipes={estatisticasEquipes}
            />
          ) : estatisticaAtiva === "financeiro" ? (
            <AbaFinanceiro
              documentosAtivos={!!documentosAtivos}
              resumo={resumoFinanceiro}
              porEquipe={financeiroPorEquipe}
              porResponsavel={financeiroPorResponsavel}
              nomesEquipes={nomesEquipes}
              nomesFuncionarios={nomesFuncionarios}
            />
          ) : estatisticaAtiva === "inventario" ? (
            <AbaInventario
              acuracidade={acuracidadeInventario}
              produtosPorId={produtosPorId}
              equipesPorId={equipesPorId}
            />
          ) : estatisticaAtiva === "qualidade" ? (
            <AbaQualidade
              qualidade={qualidade}
              produtosPorId={produtosPorId}
              equipesPorId={equipesPorId}
              funcionariosPorId={funcionariosPorId}
            />
          ) : (
            <AbaComparativo
              comparacao={comparacaoPeriodos}
              serieComparacao={serieComparacao}
              porEquipe={comparacaoPorEquipe}
              porProduto={comparacaoPorProduto}
              porResponsavel={comparacaoPorResponsavel}
              nomesEquipes={nomesEquipes}
              produtosPorId={produtosPorId}
              nomesFuncionarios={nomesFuncionarios}
              produtoId={produtoId}
              abrirEquipe={abrirEquipe}
              abrirProdutoEmConsumo={abrirProdutoEmConsumo}
              exportarCsv={exportarCsv}
              imprimir={imprimir}
            />
          )}
        </div>
      </div>

      {/* ---------------- Impressão ---------------- */}
      <style>{`
        .relatorio-impressao { display: none; }
        @media print {
          @page { size: A4; margin: 12mm 12mm 14mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .relatorio-impressao, .relatorio-impressao * { visibility: visible !important; }
          .relatorio-impressao {
            display: block !important;
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            color: #111827 !important;
            background: #fff !important;
            font-family: Arial, Helvetica, sans-serif !important;
            font-size: 10pt !important;
          }
          .relatorio-impressao .print-page {
            break-before: page;
            page-break-before: always;
            min-height: 250mm;
          }
          .relatorio-impressao .print-page:first-child {
            break-before: auto;
            page-break-before: auto;
          }
          .relatorio-impressao table { width: 100%; border-collapse: collapse; }
          .relatorio-impressao thead { display: table-header-group; }
          .relatorio-impressao tr { break-inside: avoid; page-break-inside: avoid; }
          .relatorio-impressao .print-section { break-inside: avoid; page-break-inside: avoid; }
          .relatorio-impressao .print-muted { color: #6b7280; }
          .relatorio-impressao .print-rule { border-top: 1px solid #d1d5db; margin: 8mm 0; }
        }
      `}</style>

      <PrintReport
        periodo={periodo}
        produtoId={produtoId}
        equipeId={equipeId}
        fluxo={fluxo}
        estado={estado}
        comparacao={comparacaoPeriodos}
        comparacaoPorProduto={comparacaoPorProduto}
        produtoSelecionado={produtoSelecionado ?? null}
        produtoAnalise={produtoAnalise}
        analiseConsumoProduto={analiseConsumoProduto}
        rankingConsumoProdutos={rankingConsumoProdutos}
        paretoConsumoProdutos={paretoConsumoProdutos}
        regularidadeConsumoProduto={regularidadeConsumoProduto}
        desviosConsumoProdutos={desviosConsumoProdutos}
        desviosConsumoEquipes={desviosConsumoEquipes}
        mapaRiscoCobertura={mapaRiscoCobertura}
        analiseReposicao={analiseReposicao}
        produtosEmRisco={produtosEmRisco}
        estatisticasEquipes={estatisticasEquipes}
        produtoPorEquipe={produtoPorEquipe}
        resumoFinanceiro={resumoFinanceiro}
        financeiroPorEquipe={financeiroPorEquipe}
        financeiroPorResponsavel={financeiroPorResponsavel}
        acuracidadeInventario={acuracidadeInventario}
        produtosPorId={produtosPorId}
        equipesPorId={equipesPorId}
        funcionariosPorId={funcionariosPorId}
        distribuicaoDiaSemana={distribuicaoDiaSemana}
        qualidade={
          qualidade ??
          calcularQualidadeEstoque(dados.produtos, dados.movimentacoes, dados.equipes, periodo, {
            exigirDocumentoEntrada,
            exigirJustificativaAjuste,
          })
        }
      />
    </div>
  );
}

/* ========================================================================== */
/* Painel executivo                                                            */
/* ========================================================================== */

const PainelExecutivo = memo(function PainelExecutivo({
  fluxo,
  estado,
  mapaRisco,
  reposicao,
  qualidade,
  acuracidade,
  desviosProdutos,
  desviosEquipes,
  irPara,
}: {
  fluxo: ReturnType<typeof calcularFluxoPeriodo> | null;
  estado: ReturnType<typeof calcularEstadoEstoque> | null;
  mapaRisco: ReturnType<typeof calcularMapaRiscoCobertura> | null;
  reposicao: ReturnType<typeof calcularAnaliseReposicao> | null;
  qualidade: ReturnType<typeof calcularQualidadeEstoque> | null;
  acuracidade: ReturnType<typeof calcularAcuracidadeInventarios>;
  desviosProdutos: number;
  desviosEquipes: number;
  irPara: (aba: AbaEstatistica) => void;
}) {
  const risco = (mapaRisco?.critico ?? 0) + (mapaRisco?.atencao ?? 0);
  const pontos: Array<{
    titulo: string;
    descricao: string;
    valor: number;
    tone: Tone;
    aba: AbaEstatistica;
  }> = [
    {
      titulo: "Cobertura em risco",
      descricao: "Produtos ativos cujo estoque cobre até 30 dias de consumo.",
      valor: risco,
      tone: (mapaRisco?.critico ?? 0) > 0 ? "danger" : risco > 0 ? "warning" : "success",
      aba: "consumo",
    },
    {
      titulo: "Reposição necessária",
      descricao: "Materiais abaixo do alvo de 30 dias ou do mínimo cadastrado.",
      valor: reposicao?.totalItens ?? 0,
      tone: (reposicao?.reposicaoImediata ?? 0) > 0 ? "danger" : (reposicao?.totalItens ?? 0) > 0 ? "warning" : "success",
      aba: "consumo",
    },
    {
      titulo: "Desvios de consumo",
      descricao: "Mudanças relevantes frente ao período anterior.",
      valor: desviosProdutos + desviosEquipes,
      tone: desviosProdutos + desviosEquipes > 0 ? "primary" : "neutral",
      aba: "consumo",
    },
    {
      titulo: "Alertas de qualidade",
      descricao: "Exceções de integridade e conformidade no período.",
      valor: qualidade?.total ?? 0,
      tone: (qualidade?.altas ?? 0) > 0 ? "danger" : (qualidade?.total ?? 0) > 0 ? "warning" : "success",
      aba: "qualidade",
    },
  ];

  return (
    <section aria-labelledby="painel-executivo" className="space-y-4">
      <SectionHeader
        id="painel-executivo"
        icon={LayoutDashboard}
        title="Painel executivo"
        description="Resumo gerencial do contexto atual, com foco em estoque, consumo, reposição e exceções."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Movimentações no período"
          valor={num(fluxo?.movimentacoes ?? 0)}
          icon={BarChart3}
          tone="primary"
          sub={`${num(fluxo?.entradasMovimentacoes ?? 0)} entradas · ${num(fluxo?.saidasMovimentacoes ?? 0)} saídas`}
        />
        <StatTile
          label="Produtos com estoque"
          valor={num(estado?.produtosComEstoque ?? 0)}
          icon={PackageCheck}
          tone="success"
          sub={`${num(estado?.produtosZerados ?? 0)} zerados`}
        />
        <StatTile
          label="Risco de cobertura"
          valor={num(risco)}
          icon={AlertTriangle}
          tone={(mapaRisco?.critico ?? 0) > 0 ? "danger" : risco > 0 ? "warning" : "success"}
          sub={`${num(mapaRisco?.critico ?? 0)} críticos · ${num(mapaRisco?.atencao ?? 0)} em atenção`}
          onClick={() => irPara("consumo")}
        />
        <StatTile
          label="Reposições indicadas"
          valor={num(reposicao?.totalItens ?? 0)}
          icon={PackageOpen}
          tone={(reposicao?.reposicaoImediata ?? 0) > 0 ? "danger" : (reposicao?.totalItens ?? 0) > 0 ? "warning" : "success"}
          sub={`${num(reposicao?.reposicaoImediata ?? 0)} imediatas · ${num(reposicao?.reposicaoPrioritaria ?? 0)} prioritárias`}
          onClick={() => irPara("consumo")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Principais pontos de atenção</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Itens que pedem uma ação ou investigação na janela atual.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => irPara("consumo")}>
                Ver consumo
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {pontos.map((ponto) => (
              <button
                key={ponto.titulo}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => irPara(ponto.aba)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{ponto.titulo}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{ponto.descricao}</p>
                </div>
                <ToneBadge tone={ponto.tone}>{num(ponto.valor)}</ToneBadge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Indicadores complementares</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5 sm:grid-cols-2">
            <Metric label="Posições abaixo do mínimo" value={num(estado?.posicoesAbaixoDoMinimo ?? 0)} />
            <Metric label="Produtos abaixo do mínimo" value={num(estado?.produtosAbaixoDoMinimo ?? 0)} />
            <Metric label="Desvios de produtos" value={num(desviosProdutos)} />
            <Metric label="Desvios de equipes" value={num(desviosEquipes)} />
            <Metric label="Inventários concluídos" value={num(acuracidade.inventariosConcluidos)} />
            <Metric
              label="Acuracidade por posições"
              value={`${num(acuracidade.acuracidadePorPosicoes)}%`}
              tone={acuracidade.acuracidadePorPosicoes >= 95 ? "success" : "warning"}
            />
            <Metric
              label="Alertas altos"
              value={num(qualidade?.altas ?? 0)}
              tone={(qualidade?.altas ?? 0) > 0 ? "danger" : "success"}
            />
            <Metric label="Saídas sem responsável" value={num(qualidade?.saidasSemResponsavel ?? 0)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Leitura rápida</CardTitle>
          <p className="text-xs text-muted-foreground">Vá direto às áreas que sustentam os indicadores acima.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ABAS_BASE.filter((aba) => aba.id !== "executivo" && aba.id !== "movimentacoes").map((aba) => (
            <Button key={aba.id} type="button" variant="outline" size="sm" onClick={() => irPara(aba.id)}>
              <aba.icon className="size-4" />
              {aba.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </section>
  );
});

/* ========================================================================== */
/* Movimentações                                                               */
/* ========================================================================== */

const eixoProps = { tickLine: false, axisLine: false, fontSize: 11, stroke: COR_EIXO } as const;

const AbaMovimentacoes = memo(function AbaMovimentacoes({
  fluxo,
  serieGrafico,
  serieTemporal,
  distribuicaoDiaSemana,
}: {
  fluxo: ReturnType<typeof calcularFluxoPeriodo> | null;
  serieGrafico: Array<{ equipeId: string; nome: string; entradas: number; saidas: number }>;
  serieTemporal: ReturnType<typeof agruparFluxoPorPeriodo>;
  distribuicaoDiaSemana: ReturnType<typeof agruparMovimentacoesPorDiaSemana>;
}) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="fluxo" className="space-y-3">
        <SectionHeader
          id="fluxo"
          icon={BarChart3}
          title="Entradas × saídas"
          description="Fluxo do período, por estoque de equipe. Estoques sem equipe vinculada aparecem como “Sem equipe”."
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Movimentações" valor={num(fluxo?.movimentacoes ?? 0)} icon={BarChart3} tone="primary" />
          <StatTile
            label="Entradas"
            valor={num(fluxo?.entradasMovimentacoes ?? 0)}
            icon={PackageCheck}
            tone="success"
            sub={`${num(fluxo?.entradasQuantidade ?? 0)} em quantidade lançada`}
          />
          <StatTile
            label="Saídas"
            valor={num(fluxo?.saidasMovimentacoes ?? 0)}
            icon={PackageOpen}
            tone="danger"
            sub={`${num(fluxo?.saidasQuantidade ?? 0)} em quantidade lançada`}
          />
        </div>

        <ChartCard
          title="Entradas × saídas por equipe"
          height={340}
          isEmpty={!serieGrafico.length}
          footnote="Cada par de barras representa um estoque de equipe, considerando os filtros de data, produto e equipe."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serieGrafico} margin={{ left: 0, right: 8, top: 24, bottom: 0 }} barGap={4} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={COR_GRID} />
              <XAxis
                dataKey="nome"
                {...eixoProps}
                interval={0}
                angle={serieGrafico.length > 6 ? -20 : 0}
                textAnchor={serieGrafico.length > 6 ? "end" : "middle"}
                height={serieGrafico.length > 6 ? 50 : 30}
              />
              <YAxis {...eixoProps} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                content={<ChartTooltip labelPrefix="Equipe:" format={(valor) => num(valor)} />}
              />
              <Bar dataKey="entradas" name="Entradas" fill={COR_ENTRADA} minPointSize={3} isAnimationActive={false} radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill={COR_SAIDA} minPointSize={3} isAnimationActive={false} radius={[4, 4, 0, 0]} />
              <Legend verticalAlign="bottom" height={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section aria-labelledby="tendencia-temporal" className="space-y-3">
        <SectionHeader
          id="tendencia-temporal"
          icon={ChartNoAxesCombined}
          title="Tendência temporal"
          description="A granularidade acompanha o intervalo: diária para períodos curtos, semanal para intermediários e mensal para longos."
        />
        <ChartCard title="Entradas × saídas ao longo do período" isEmpty={!serieTemporal.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serieTemporal} margin={{ left: 0, right: 8, top: 20, bottom: 0 }} barGap={4} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke={COR_GRID} />
              <XAxis dataKey="periodo" {...eixoProps} />
              <YAxis {...eixoProps} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.35 }} content={<ChartTooltip format={(valor) => num(valor)} />} />
              <Bar dataKey="entradas" name="Entradas" fill={COR_ENTRADA} minPointSize={3} isAnimationActive={false} radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill={COR_SAIDA} minPointSize={3} isAnimationActive={false} radius={[4, 4, 0, 0]} />
              <Legend verticalAlign="bottom" height={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section aria-labelledby="distribuicao-semana" className="space-y-3">
        <SectionHeader
          id="distribuicao-semana"
          icon={CalendarClock}
          title="Distribuição semanal"
          description="Contagem de registros por dia da semana. As barras não representam quantidades físicas."
        />
        <ChartCard title="Movimentações por dia da semana" isEmpty={!distribuicaoDiaSemana.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribuicaoDiaSemana} margin={{ left: 0, right: 8, top: 20, bottom: 0 }} barGap={4} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke={COR_GRID} />
              <XAxis dataKey="dia" {...eixoProps} />
              <YAxis allowDecimals={false} {...eixoProps} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.35 }} content={<ChartTooltip format={(valor) => num(valor)} />} />
              <Bar dataKey="entradas" name="Entradas" fill={COR_ENTRADA} minPointSize={3} isAnimationActive={false} radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill={COR_SAIDA} minPointSize={3} isAnimationActive={false} radius={[4, 4, 0, 0]} />
              <Legend verticalAlign="bottom" height={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>
    </div>
  );
});

/* ========================================================================== */
/* Consumo e cobertura                                                         */
/* ========================================================================== */

const AbaConsumo = memo(function AbaConsumo({
  produtosEmRisco,
  produtoAnalise,
  analiseConsumoProduto,
  mapaRisco,
  reposicao,
  ranking,
  pareto,
  regularidade,
  produtoSelecionado,
  desviosProdutos,
  desviosEquipes,
  abrirProduto,
  abrirEquipe,
}: {
  produtosEmRisco: ReturnType<typeof calcularProdutosEstatisticas>;
  produtoAnalise: ReturnType<typeof calcularProdutoEstatistica> | null;
  analiseConsumoProduto: ReturnType<typeof analisarConsumo> | null;
  mapaRisco: ReturnType<typeof calcularMapaRiscoCobertura> | null;
  reposicao: ReturnType<typeof calcularAnaliseReposicao> | null;
  ranking: ReturnType<typeof calcularRankingFrequenciaConsumo>;
  pareto: ReturnType<typeof calcularParetoConsumo>;
  regularidade: ReturnType<typeof calcularRegularidadeConsumo> | null;
  produtoSelecionado: { id: string; nome: string } | null;
  desviosProdutos: ReturnType<typeof calcularDesviosConsumoProdutos>;
  desviosEquipes: ReturnType<typeof calcularDesviosConsumoEquipes>;
  abrirProduto: (id: string) => void;
  abrirEquipe: (id: string) => void;
}) {
  const tendencia = analiseConsumoProduto?.tendencia.direcao;
  const tomTendencia: Tone =
    tendencia === "acelerando" ? "danger" : tendencia === "reduzindo" ? "success" : tendencia === "estavel" ? "warning" : "neutral";
  const textoTendencia =
    tendencia === "acelerando"
      ? "Consumo em aceleração"
      : tendencia === "reduzindo"
        ? "Consumo em redução"
        : tendencia === "estavel"
          ? "Consumo estável"
          : "Tendência indeterminada";

  return (
    <section aria-labelledby="riscos" className="space-y-4">
      <SectionHeader
        id="riscos"
        icon={CalendarClock}
        title="Cobertura e risco de ruptura"
        description="Quanto tempo o estoque atual sustenta o consumo observado. Quantidades de unidades diferentes não são somadas."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cobertura de até 30 dias</CardTitle>
            <p className="text-xs text-muted-foreground">Clique em um produto para abrir a análise detalhada ao lado.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {produtosEmRisco.length ? (
              produtosEmRisco.map((item) => {
                const critico = (item.coberturaDias ?? 99) <= 7;
                return (
                  <button
                    key={item.produtoId}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => abrirProduto(item.produtoId)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.produto.nome}</span>
                      <span className="text-xs text-muted-foreground">Consumo médio: {num(item.consumoMedioDiario)}/dia</span>
                    </span>
                    <ToneBadge tone={critico ? "danger" : "warning"}>{item.coberturaDias} dias</ToneBadge>
                  </button>
                );
              })
            ) : (
              <EmptyState
                icon={PackageCheck}
                compact
                title="Nenhum produto em risco de ruptura"
                description="Não há consumo suficiente no período para estimar ruptura em até 30 dias."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Análise do produto selecionado</CardTitle>
          </CardHeader>
          <CardContent>
            {produtoAnalise ? (
              <div className="space-y-5">
                <div>
                  <p className="font-display text-lg font-semibold">{produtoAnalise.produto.nome}</p>
                  <p className="text-xs text-muted-foreground">{produtoAnalise.produto.codigo ?? "Sem código"}</p>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Estoque atual" value={num(produtoAnalise.estoqueAtual)} />
                  <Metric label="Estoque mínimo" value={num(produtoAnalise.estoqueMinimo)} />
                  <Metric label="Consumo / dia" value={num(produtoAnalise.consumoMedioDiario)} />
                  <Metric
                    label="Cobertura"
                    value={produtoAnalise.coberturaDias == null ? "—" : `${produtoAnalise.coberturaDias} dias`}
                    tone={
                      produtoAnalise.coberturaDias == null
                        ? "neutral"
                        : produtoAnalise.coberturaDias <= 7
                          ? "danger"
                          : produtoAnalise.coberturaDias <= 30
                            ? "warning"
                            : "success"
                    }
                  />
                  <Metric label="Consumo / semana" value={num(produtoAnalise.consumoMedioSemanal)} />
                  <Metric label="Consumo / mês" value={num(produtoAnalise.consumoMedioMensal)} />
                  <Metric
                    label="Até estoque mínimo"
                    value={produtoAnalise.diasAteMinimo == null ? "—" : `${produtoAnalise.diasAteMinimo} dias`}
                  />
                  <Metric label="Ruptura estimada" value={produtoAnalise.dataEstimadaRuptura ?? "—"} />
                </div>

                {analiseConsumoProduto ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Consumo por janela</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Médias calculadas só com as saídas do produto nos últimos N dias, ancoradas na data final.
                        </p>
                      </div>
                      <ToneBadge tone={tomTendencia}>{textoTendencia}</ToneBadge>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {analiseConsumoProduto.janelas.map((janela) => (
                        <div key={janela.dias} className="rounded-lg border bg-background p-3">
                          <p className="text-[11px] text-muted-foreground">Últimos {janela.dias} dias</p>
                          <p className="mt-1 font-display text-lg font-semibold tabular-nums">{num(janela.saidas)} saídas</p>
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            {num(janela.mediaDiaria)}/dia · {num(janela.mediaSemanal)}/sem · {num(janela.mediaMensal)}/mês
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      <Metric
                        label="Variação 7d × 30d"
                        value={
                          analiseConsumoProduto.tendencia.variacao7Sobre30 == null
                            ? "—"
                            : `${analiseConsumoProduto.tendencia.variacao7Sobre30 > 0 ? "+" : ""}${num(analiseConsumoProduto.tendencia.variacao7Sobre30)}%`
                        }
                      />
                      <Metric
                        label="Variação 30d × 90d"
                        value={
                          analiseConsumoProduto.tendencia.variacao30Sobre90 == null
                            ? "—"
                            : `${analiseConsumoProduto.tendencia.variacao30Sobre90 > 0 ? "+" : ""}${num(analiseConsumoProduto.tendencia.variacao30Sobre90)}%`
                        }
                      />
                      <Metric
                        label="Base conservadora"
                        value={
                          analiseConsumoProduto.tendencia.baseConservadora == null
                            ? "—"
                            : `${num(analiseConsumoProduto.tendencia.baseConservadora)}/dia`
                        }
                      />
                      <Metric
                        label="Cobertura conservadora"
                        value={
                          analiseConsumoProduto.coberturaConservadoraDias == null
                            ? "—"
                            : `${num(analiseConsumoProduto.coberturaConservadoraDias)} dias`
                        }
                      />
                    </div>
                  </div>
                ) : null}

                <p className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                  A estimativa usa somente saídas do período e o estoque físico atual. Sem consumo suficiente, tendência e
                  cobertura permanecem indeterminadas.
                </p>
              </div>
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="Selecione um produto"
                description="Escolha um produto no filtro acima — ou clique em um item da lista ao lado — para calcular duração, consumo médio e risco de ruptura."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* --------- Mapa de risco --------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mapa de risco de cobertura</CardTitle>
          <p className="text-xs text-muted-foreground">
            Classificação por cobertura estimada, considerando estoque e consumo médio no contexto atual.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {mapaRisco ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ToneStat label="Crítico · até 7 dias" value={num(mapaRisco.critico)} tone="danger" />
                <ToneStat label="Atenção · até 30 dias" value={num(mapaRisco.atencao)} tone="warning" />
                <ToneStat label="Adequado · acima de 30 dias" value={num(mapaRisco.adequado)} tone="success" />
              </div>

              <p className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                Entram no mapa apenas produtos com estoque positivo e ao menos {MIN_SAIDAS_MAPA_RISCO} saídas no período.
                Fora da classificação: {num(mapaRisco.excluidosSemEstoque)} sem estoque e{" "}
                {num(mapaRisco.excluidosBaixaAtividade)} com baixa atividade.
              </p>

              {mapaRisco.itensPrioritarios.length ? (
                <TableShell minWidth={720}>
                  <thead className={THEAD_CLASS}>
                    <tr>
                      <th className={TH_CLASS}>Produto</th>
                      <th className={TH_NUM_CLASS}>Estoque</th>
                      <th className={TH_NUM_CLASS}>Saídas</th>
                      <th className={TH_NUM_CLASS}>Consumo/dia</th>
                      <th className={TH_NUM_CLASS}>Cobertura</th>
                      <th className={TH_NUM_CLASS}>Classificação</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY_CLASS}>
                    {mapaRisco.itensPrioritarios.map((item) => {
                      const tone: Tone = item.faixa === "critico" ? "danger" : item.faixa === "atencao" ? "warning" : "success";
                      const faixaLabel = item.faixa === "critico" ? "Crítico" : item.faixa === "atencao" ? "Atenção" : "Adequado";
                      return (
                        <tr key={item.produtoId} className={TR_CLASS}>
                          <td className={TD_CLASS}>
                            <button
                              type="button"
                              className="text-left font-medium hover:underline"
                              onClick={() => abrirProduto(item.produtoId)}
                            >
                              {item.produto.nome}
                            </button>
                          </td>
                          <td className={TD_NUM_CLASS}>{num(item.estoqueAtual)}</td>
                          <td className={TD_NUM_CLASS}>{num(item.saidasPeriodo)}</td>
                          <td className={TD_NUM_CLASS}>{num(item.consumoMedioDiario)}</td>
                          <td className={TD_NUM_CLASS}>{item.coberturaDias == null ? "—" : `${num(item.coberturaDias)} dias`}</td>
                          <td className={`${TD_NUM_CLASS} font-semibold ${toneTextClass(tone)}`}>{faixaLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableShell>
              ) : (
                <EmptyState compact title="Nenhum produto elegível para o mapa de risco no contexto atual." />
              )}
            </>
          ) : (
            <EmptyState compact title="Nenhum projeto selecionado." />
          )}
        </CardContent>
      </Card>

      {/* --------- Plano de reposição --------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Plano de reposição</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sugestão por produto para recompor até a cobertura-alvo, sem somar quantidades de unidades diferentes.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {reposicao ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ToneStat label="Reposição imediata" value={num(reposicao.reposicaoImediata)} tone="danger" />
                <ToneStat label="Reposição prioritária" value={num(reposicao.reposicaoPrioritaria)} tone="warning" />
                <ToneStat label="Itens com indicação" value={num(reposicao.totalItens)} tone="primary" />
                <ToneStat label="Cobertura-alvo" value={`${num(reposicao.diasAlvo)} dias`} tone="neutral" />
              </div>

              {reposicao.itens.length ? (
                <TableShell minWidth={900}>
                  <thead className={THEAD_CLASS}>
                    <tr>
                      <th className={TH_CLASS}>Produto</th>
                      <th className={TH_NUM_CLASS}>Estoque</th>
                      <th className={TH_NUM_CLASS}>Saídas</th>
                      <th className={TH_NUM_CLASS}>Consumo/dia</th>
                      <th className={TH_NUM_CLASS}>Estoque-alvo</th>
                      <th className={TH_NUM_CLASS}>Reposição sugerida</th>
                      <th className={TH_NUM_CLASS}>Prioridade</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY_CLASS}>
                    {reposicao.itens.map((item) => {
                      const imediata = item.prioridade === "imediata";
                      return (
                        <tr key={item.produtoId} className={TR_CLASS}>
                          <td className={TD_CLASS}>
                            <button
                              type="button"
                              className="text-left font-medium hover:underline"
                              onClick={() => abrirProduto(item.produtoId)}
                            >
                              {item.produto.nome}
                            </button>
                          </td>
                          <td className={TD_NUM_CLASS}>{num(item.estoqueAtual)}</td>
                          <td className={TD_NUM_CLASS}>{num(item.saidasPeriodo)}</td>
                          <td className={TD_NUM_CLASS}>{num(item.consumoMedioDiario)}</td>
                          <td className={TD_NUM_CLASS}>{num(item.estoqueAlvo)}</td>
                          <td className={`${TD_NUM_CLASS} font-semibold`}>{num(item.quantidadeSugerida)}</td>
                          <td className={`${TD_NUM_CLASS} font-semibold ${toneTextClass(imediata ? "danger" : "warning")}`}>
                            {imediata ? "Imediata" : "Prioritária"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableShell>
              ) : (
                <EmptyState
                  compact
                  icon={PackageCheck}
                  title="Nenhuma reposição indicada"
                  description="Nenhum produto apresenta indicação de reposição no contexto atual."
                />
              )}

              <p className="text-xs leading-relaxed text-muted-foreground">
                A indicação exige ao menos {MIN_SAIDAS_MAPA_RISCO} saídas no período. O estoque-alvo é o maior valor entre o
                mínimo cadastrado e {reposicao.diasAlvo} dias de consumo médio.
              </p>
            </>
          ) : (
            <EmptyState compact title="Nenhum projeto selecionado." />
          )}
        </CardContent>
      </Card>

      {/* --------- Frequência, Pareto, regularidade e desvios --------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Produtos com maior frequência de consumo</CardTitle>
          <p className="text-xs text-muted-foreground">
            O ranking usa a frequência de registros de saída, não a quantidade física. Clique em um produto para abrir sua análise.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {ranking.length ? (
            <TableShell minWidth={720}>
              <thead className={THEAD_CLASS}>
                <tr>
                  <th className={TH_CLASS}>Produto</th>
                  <th className={TH_NUM_CLASS}>Saídas</th>
                  <th className={TH_NUM_CLASS}>Dias com saída</th>
                  <th className={TH_NUM_CLASS}>Frequência/dia</th>
                  <th className={TH_NUM_CLASS}>Participação</th>
                </tr>
              </thead>
              <tbody className={TBODY_CLASS}>
                {ranking.map((item) => (
                  <tr key={item.produtoId} className={TR_CLASS}>
                    <td className={TD_CLASS}>
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => abrirProduto(item.produtoId)}>
                        {item.produto.nome}
                      </button>
                    </td>
                    <td className={`${TD_NUM_CLASS} font-semibold text-destructive`}>{num(item.saidas)}</td>
                    <td className={TD_NUM_CLASS}>{num(item.diasComSaida)}</td>
                    <td className={TD_NUM_CLASS}>{num(item.frequenciaDiaria)}</td>
                    <td className={TD_NUM_CLASS}>
                      {item.participacaoPercentual == null ? "—" : `${num(item.participacaoPercentual)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          ) : (
            <EmptyState compact title="Nenhuma saída registrada no período selecionado." />
          )}

          <Panel
            title="Concentração das saídas"
            description="Quanto das saídas do período está concentrado nos produtos mais frequentes, sem somar quantidades físicas."
          >
            {pareto.length ? (
              <div className="space-y-2.5">
                {pareto.map((item) => (
                  <button
                    key={item.produtoId}
                    type="button"
                    className="block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => abrirProduto(item.produtoId)}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-medium hover:underline">{item.produto.nome}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {num(item.acumuladoPercentual)}% acumulado
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-destructive transition-[width] duration-300"
                        style={{ width: `${Math.min(100, item.acumuladoPercentual)}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState compact title="Nenhuma saída registrada no período selecionado." />
            )}
          </Panel>

          <Panel
            title="Regularidade do consumo"
            description="Frequência temporal das saídas do produto selecionado, sem somar quantidades físicas."
          >
            {regularidade && produtoSelecionado ? (
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Dias com saída" value={num(regularidade.diasComSaida)} />
                <Metric
                  label="Intervalo médio"
                  value={regularidade.intervaloMedioDias == null ? "—" : `${num(regularidade.intervaloMedioDias)} dias`}
                />
                <Metric
                  label="Menor intervalo"
                  value={regularidade.menorIntervaloDias == null ? "—" : `${num(regularidade.menorIntervaloDias)} dias`}
                />
                <Metric
                  label="Maior intervalo"
                  value={regularidade.maiorIntervaloDias == null ? "—" : `${num(regularidade.maiorIntervaloDias)} dias`}
                />
                <div className="rounded-lg border bg-background p-3 sm:col-span-2 lg:col-span-4">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">Dias do período com pelo menos uma saída</span>
                    <span className="font-semibold tabular-nums">{num(regularidade.percentualDiasComSaida)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-destructive transition-[width] duration-300"
                      style={{ width: `${Math.min(100, regularidade.percentualDiasComSaida)}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState compact title="Selecione um produto para analisar a regularidade das saídas." />
            )}
          </Panel>

          <Panel
            title="Desvios relevantes de consumo"
            description={`Compara as saídas do período atual com o anterior de mesma duração. Entram produtos e equipes com ao menos ${MIN_SAIDAS_DESVIO_CONSUMO} saídas em uma das janelas e variação de no mínimo ${LIMIAR_DESVIO_CONSUMO_PERCENTUAL}%.`}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border bg-background p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold">Produtos</h4>
                  <span className="text-xs tabular-nums text-muted-foreground">{num(desviosProdutos.length)} relevantes</span>
                </div>
                {desviosProdutos.length ? (
                  <TableShell minWidth={520}>
                    <thead className={THEAD_CLASS}>
                      <tr>
                        <th className={TH_CLASS}>Produto</th>
                        <th className={TH_NUM_CLASS}>Atual</th>
                        <th className={TH_NUM_CLASS}>Anterior</th>
                        <th className={TH_NUM_CLASS}>Variação</th>
                        <th className={TH_NUM_CLASS}>Ação</th>
                      </tr>
                    </thead>
                    <tbody className={TBODY_CLASS}>
                      {desviosProdutos.map((item) => (
                        <tr key={item.produtoId} className={TR_CLASS}>
                          <td className={`${TD_CLASS} font-medium`}>
                            <button type="button" className="text-left hover:underline" onClick={() => abrirProduto(item.produtoId)}>
                              {item.produto.nome}
                            </button>
                          </td>
                          <td className={TD_NUM_CLASS}>{num(item.saidasAtual)}</td>
                          <td className={TD_NUM_CLASS}>{num(item.saidasAnterior)}</td>
                          <td className={`${TD_NUM_CLASS} font-medium ${toneTextClass(item.direcao === "aumento" ? "danger" : "success")}`}>
                            {item.variacaoPercentual == null
                              ? item.direcao === "aumento"
                                ? "Novo"
                                : "—"
                              : formatarVariacao(item.variacaoPercentual)}
                          </td>
                          <td className={TD_NUM_CLASS}>
                            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => abrirProduto(item.produtoId)}>
                              Analisar
                              <ArrowUpRight className="size-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                ) : (
                  <EmptyState compact title="Nenhum produto atingiu os critérios de desvio neste período." />
                )}
              </div>

              <div className="rounded-lg border bg-background p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold">Equipes</h4>
                  <span className="text-xs tabular-nums text-muted-foreground">{num(desviosEquipes.length)} relevantes</span>
                </div>
                {desviosEquipes.length ? (
                  <TableShell minWidth={520}>
                    <thead className={THEAD_CLASS}>
                      <tr>
                        <th className={TH_CLASS}>Equipe</th>
                        <th className={TH_NUM_CLASS}>Atual</th>
                        <th className={TH_NUM_CLASS}>Anterior</th>
                        <th className={TH_NUM_CLASS}>Variação</th>
                        <th className={TH_NUM_CLASS}>Ação</th>
                      </tr>
                    </thead>
                    <tbody className={TBODY_CLASS}>
                      {desviosEquipes.map((item) => (
                        <tr key={item.equipeId ?? "__sem_equipe__"} className={TR_CLASS}>
                          <td className={`${TD_CLASS} font-medium`}>{item.equipe?.nome ?? "Sem equipe"}</td>
                          <td className={TD_NUM_CLASS}>{num(item.saidasAtual)}</td>
                          <td className={TD_NUM_CLASS}>{num(item.saidasAnterior)}</td>
                          <td className={`${TD_NUM_CLASS} font-medium ${toneTextClass(item.direcao === "aumento" ? "danger" : "success")}`}>
                            {item.variacaoPercentual == null
                              ? item.direcao === "aumento"
                                ? "Novo"
                                : "—"
                              : formatarVariacao(item.variacaoPercentual)}
                          </td>
                          <td className={TD_NUM_CLASS}>
                            {item.equipeId ? (
                              <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => abrirEquipe(item.equipeId!)}>
                                Analisar
                                <ArrowUpRight className="size-4" />
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                ) : (
                  <EmptyState compact title="Nenhuma equipe atingiu os critérios de desvio neste período." />
                )}
              </div>
            </div>
          </Panel>
        </CardContent>
      </Card>
    </section>
  );
});

/* ========================================================================== */
/* Equipes                                                                     */
/* ========================================================================== */

const AbaEquipes = memo(function AbaEquipes({
  produtoSelecionado,
  produtoPorEquipe,
  estatisticasEquipes,
}: {
  produtoSelecionado: { id: string; nome: string } | null;
  produtoPorEquipe: ReturnType<typeof calcularProdutoPorEquipe>;
  estatisticasEquipes: ReturnType<typeof calcularEstatisticasEquipes>;
}) {
  return (
    <section aria-labelledby="equipes" className="space-y-3">
      <SectionHeader
        id="equipes"
        icon={PackageCheck}
        title="Análise por equipe"
        description="A comparação usa posições, produtos, frequência de saídas e cobertura por material — nunca a soma de quantidades entre unidades diferentes."
      />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {produtoSelecionado ? `Distribuição de ${produtoSelecionado.nome} por equipe` : "Visão operacional por equipe"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {produtoSelecionado ? (
            produtoPorEquipe.length ? (
              <TableShell minWidth={760}>
                <thead className={THEAD_CLASS}>
                  <tr>
                    <th className={TH_CLASS}>Equipe</th>
                    <th className={TH_NUM_CLASS}>Estoque</th>
                    <th className={TH_NUM_CLASS}>Mínimo</th>
                    <th className={TH_NUM_CLASS}>Consumo/dia</th>
                    <th className={TH_NUM_CLASS}>Cobertura</th>
                    <th className={TH_NUM_CLASS}>Até mínimo</th>
                  </tr>
                </thead>
                <tbody className={TBODY_CLASS}>
                  {produtoPorEquipe.map((item) => {
                    const critico = item.coberturaDias != null && item.coberturaDias <= 30;
                    return (
                      <tr key={item.equipeId} className={TR_CLASS}>
                        <td className={`${TD_CLASS} font-medium`}>{item.equipe.nome}</td>
                        <td className={TD_NUM_CLASS}>{num(item.estoqueAtual)}</td>
                        <td className={TD_NUM_CLASS}>{num(item.estoqueMinimo)}</td>
                        <td className={TD_NUM_CLASS}>{num(item.consumoMedioDiario)}</td>
                        <td className={`${TD_NUM_CLASS} font-semibold ${critico ? "text-destructive" : ""}`}>
                          {item.coberturaDias == null ? "—" : `${num(item.coberturaDias)} d`}
                        </td>
                        <td className={TD_NUM_CLASS}>{item.diasAteMinimo == null ? "—" : `${num(item.diasAteMinimo)} d`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            ) : (
              <EmptyState
                compact
                title="Sem vínculo com equipes"
                description="O produto selecionado não possui estoque ou movimentações vinculadas às equipes."
              />
            )
          ) : estatisticasEquipes.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {estatisticasEquipes.map((item) => (
                <div key={item.equipeId} className="rounded-xl border bg-background p-4 transition-shadow hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-semibold">{item.equipe.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {num(item.saidasNoPeriodo)} saídas no período · {num(item.produtosConsumidos)} produtos consumidos
                      </p>
                    </div>
                    {item.produtosEmRisco > 0 ? (
                      <ToneBadge tone="danger">{num(item.produtosEmRisco)} em risco</ToneBadge>
                    ) : (
                      <ToneBadge tone="success">Sem risco</ToneBadge>
                    )}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <Metric label="Posições" value={num(item.posicoesEstoque)} />
                    <Metric label="Produtos" value={num(item.produtosComEstoque)} />
                    <Metric
                      label="Abaixo mínimo"
                      value={num(item.posicoesAbaixoDoMinimo)}
                      tone={item.posicoesAbaixoDoMinimo > 0 ? "warning" : "neutral"}
                    />
                    <Metric label="Saídas/dia" value={num(item.mediaSaidasPorDia)} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Menor cobertura estimada:{" "}
                    {item.menorCoberturaDias == null ? "não determinada" : `${num(item.menorCoberturaDias)} dias`}.
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={PackageCheck}
              title="Nenhuma equipe com atividade"
              description="Nenhuma equipe possui estoque ou movimentação relevante no período selecionado."
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
});

/* ========================================================================== */
/* Financeiro                                                                  */
/* ========================================================================== */

const AbaFinanceiro = memo(function AbaFinanceiro({
  documentosAtivos,
  resumo,
  porEquipe,
  porResponsavel,
  nomesEquipes,
  nomesFuncionarios,
}: {
  documentosAtivos: boolean;
  resumo: ReturnType<typeof calcularResumoFinanceiro> | null;
  porEquipe: ReturnType<typeof calcularFluxoFinanceiroPorGrupo>;
  porResponsavel: ReturnType<typeof calcularFluxoFinanceiroPorGrupo>;
  nomesEquipes: Map<string, string>;
  nomesFuncionarios: Map<string, string>;
}) {
  return (
    <section aria-labelledby="financeiro" className="space-y-3">
      <SectionHeader
        id="financeiro"
        icon={ChartNoAxesCombined}
        title="Observabilidade financeira"
        description="Valores analíticos com base no custo médio documentado por produto."
      />

      {!documentosAtivos ? (
        <EmptyState
          icon={ChartNoAxesCombined}
          title="Valoração financeira indisponível"
          description="Ative o módulo de Documentos para relacionar materiais a custos declarados e ver valor do estoque, consumo financeiro, equipes e responsáveis."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Valor do estoque documentado" valor={formatarMoeda(resumo?.valorEstoqueDocumentado)} icon={ChartNoAxesCombined} tone="primary" />
            <StatTile label="Entradas documentadas" valor={formatarMoeda(resumo?.valorEntradasDocumentado)} icon={PackageCheck} tone="success" />
            <StatTile label="Consumo financeiro" valor={formatarMoeda(resumo?.valorSaidasDocumentado)} icon={PackageOpen} tone="danger" />
            <StatTile
              label="Cobertura de valoração"
              valor={`${resumo?.coberturaPorPosicoes ?? 0}%`}
              icon={PackageCheck}
              tone={resumo && resumo.coberturaPorPosicoes >= 95 ? "success" : "warning"}
            />
            <StatTile
              label="Movimentações sem custo"
              valor={num((resumo?.saidasSemCusto ?? 0) + (resumo?.entradasSemCusto ?? 0))}
              icon={AlertTriangle}
              tone={resumo && (resumo.saidasSemCusto || resumo.entradasSemCusto) ? "warning" : "success"}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <FinancialTable title="Fluxo financeiro por equipe" rows={porEquipe} labels={nomesEquipes} />
            <FinancialTable title="Fluxo financeiro por responsável" rows={porResponsavel} labels={nomesFuncionarios} />
          </div>

          <p className="rounded-xl border border-dashed bg-muted/20 p-4 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Transparência financeira:</strong> entradas refletem ENTRADA no período e
            devoluções não são tratadas como nova compra. Posições, entradas e saídas sem custo declarado permanecem
            sinalizadas. A análise por responsável representa as movimentações atribuídas a ele, não a propriedade do estoque.
          </p>
        </>
      )}
    </section>
  );
});

/* ========================================================================== */
/* Inventário                                                                  */
/* ========================================================================== */

const AbaInventario = memo(function AbaInventario({
  acuracidade,
  produtosPorId,
  equipesPorId,
}: {
  acuracidade: ReturnType<typeof calcularAcuracidadeInventarios>;
  produtosPorId: Map<string, { nome: string }>;
  equipesPorId: Map<string, { nome: string }>;
}) {
  return (
    <section aria-labelledby="inventario-acuracidade" className="space-y-3">
      <SectionHeader
        id="inventario-acuracidade"
        icon={ClipboardCheck}
        title="Acuracidade do inventário"
        description="Acuracidade por posições compara contagens exatas; por quantidade, mede a divergência física absoluta sobre o total registrado."
      />

      {acuracidade.inventariosConcluidos === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nenhum inventário concluído"
          description="Inventários abertos não entram no indicador até que suas contagens sejam encerradas."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile
              label="Acuracidade por posições"
              valor={`${num(acuracidade.acuracidadePorPosicoes)}%`}
              icon={ClipboardCheck}
              tone={acuracidade.acuracidadePorPosicoes >= 95 ? "success" : "warning"}
            />
            <StatTile
              label="Acuracidade por quantidade"
              valor={`${num(acuracidade.acuracidadePorQuantidade)}%`}
              icon={PackageCheck}
              tone={acuracidade.acuracidadePorQuantidade >= 95 ? "success" : "warning"}
            />
            <StatTile
              label="Itens divergentes"
              valor={num(acuracidade.itensDivergentes)}
              icon={AlertTriangle}
              tone={acuracidade.itensDivergentes ? "warning" : "success"}
            />
            <StatTile label="Cobertura de contagem" valor={`${num(acuracidade.coberturaContagem)}%`} icon={PackageOpen} />
            <StatTile label="Inventários concluídos" valor={num(acuracidade.inventariosConcluidos)} icon={ClipboardCheck} tone="primary" />
          </div>

          {acuracidade.ultimoInventario ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Último inventário concluído</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Data" value={acuracidade.ultimoInventario.data.slice(0, 10)} />
                <Metric label="Itens contados" value={num(acuracidade.ultimoInventario.itensContados)} />
                <Metric
                  label="Divergências"
                  value={num(acuracidade.ultimoInventario.itensDivergentes)}
                  tone={acuracidade.ultimoInventario.itensDivergentes > 0 ? "warning" : "success"}
                />
                <Metric label="Divergência absoluta" value={num(acuracidade.ultimoInventario.divergenciaAbsoluta)} />
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Maiores divergências encontradas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {acuracidade.maioresDivergencias.length ? (
                  acuracidade.maioresDivergencias.map((item) => (
                    <div
                      key={`${item.inventarioId}:${item.produtoId}:${item.equipeId}`}
                      className="rounded-xl border bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {produtosPorId.get(item.produtoId)?.nome ?? "Produto não localizado"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {equipesPorId.get(item.equipeId)?.nome ?? "Equipe não localizada"} · inventário{" "}
                            {item.data.slice(0, 10)}
                          </p>
                        </div>
                        <ToneBadge tone={item.diferenca < 0 ? "danger" : "warning"}>
                          {item.diferenca > 0 ? "+" : ""}
                          {num(item.diferenca)}
                        </ToneBadge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Metric label="Sistema" value={num(item.quantidadeSistema)} />
                        <Metric label="Contado" value={num(item.quantidadeContada)} />
                        <Metric label="Acuracidade" value={`${num(item.acuracidadePercentual)}%`} />
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState compact icon={Check} title="Nenhuma divergência nos inventários concluídos." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Histórico de acuracidade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {acuracidade.historico.map((item) => (
                  <div key={item.inventarioId} className="rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{item.data.slice(0, 10)}</p>
                        <p className="text-xs text-muted-foreground">
                          {num(item.itensContados)} contados · {num(item.itensDivergentes)} divergentes
                        </p>
                      </div>
                      <span
                        className={`font-display text-lg font-bold tabular-nums ${toneTextClass(
                          item.acuracidadePorPosicoes >= 95 ? "success" : "warning",
                        )}`}
                      >
                        {num(item.acuracidadePorPosicoes)}%
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>Por posições</span>
                      <span className="tabular-nums">{num(item.acuracidadePorQuantidade)}% por quantidade</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  );
});

/* ========================================================================== */
/* Qualidade e alertas                                                         */
/* ========================================================================== */

const AbaQualidade = memo(function AbaQualidade({
  qualidade,
  produtosPorId,
  equipesPorId,
  funcionariosPorId,
}: {
  qualidade: ReturnType<typeof calcularQualidadeEstoque> | null;
  produtosPorId: Map<string, { nome: string }>;
  equipesPorId: Map<string, { nome: string }>;
  funcionariosPorId: Map<string, { nome: string }>;
}) {
  return (
    <section aria-labelledby="qualidade" className="space-y-3">
      <SectionHeader
        id="qualidade"
        icon={ShieldAlert}
        title="Qualidade e alertas"
        description="Indicadores objetivos de integridade do histórico e das referências cadastrais. Eles não alteram movimentos nem o saldo do estoque."
      />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Integridade das movimentações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Alertas" valor={num(qualidade?.total ?? 0)} icon={ShieldAlert} tone={(qualidade?.total ?? 0) > 0 ? "warning" : "success"} />
            <StatTile label="Alta prioridade" valor={num(qualidade?.altas ?? 0)} icon={AlertTriangle} tone={(qualidade?.altas ?? 0) > 0 ? "danger" : "success"} />
            <StatTile label="Saídas sem responsável" valor={num(qualidade?.saidasSemResponsavel ?? 0)} icon={AlertTriangle} tone={(qualidade?.saidasSemResponsavel ?? 0) > 0 ? "warning" : "success"} />
            <StatTile label="Entradas sem documento" valor={num(qualidade?.entradasSemDocumento ?? 0)} icon={PackageCheck} tone={(qualidade?.entradasSemDocumento ?? 0) > 0 ? "warning" : "success"} />
            <StatTile label="Ajustes sem justificativa" valor={num(qualidade?.ajustesSemJustificativa ?? 0)} icon={AlertTriangle} tone={(qualidade?.ajustesSemJustificativa ?? 0) > 0 ? "warning" : "success"} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Panel
              title="Integridade histórica"
              description={`${num(qualidade?.movimentacoesAnalisadas ?? 0)} movimentações analisadas no período selecionado.`}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Metric
                  label="Posições com saldo negativo"
                  value={num(qualidade?.posicoesComSaldoNegativo ?? 0)}
                  tone={(qualidade?.posicoesComSaldoNegativo ?? 0) > 0 ? "danger" : "success"}
                />
                <Metric
                  label="Quantidades inválidas"
                  value={num(qualidade?.quantidadesInvalidas ?? 0)}
                  tone={(qualidade?.quantidadesInvalidas ?? 0) > 0 ? "danger" : "success"}
                />
              </div>
            </Panel>
            <Panel
              title="Referências cadastrais"
              description="Alertas encontrados quando uma movimentação aponta para cadastros inexistentes."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Metric
                  label="Produtos inexistentes"
                  value={num(qualidade?.produtosInexistentes ?? 0)}
                  tone={(qualidade?.produtosInexistentes ?? 0) > 0 ? "danger" : "success"}
                />
                <Metric
                  label="Equipes inexistentes"
                  value={num(qualidade?.equipesInexistentes ?? 0)}
                  tone={(qualidade?.equipesInexistentes ?? 0) > 0 ? "danger" : "success"}
                />
              </div>
            </Panel>
          </div>

          {qualidade?.alertas.length ? (
            <div className="space-y-2">
              {qualidade.alertas.map((alerta) => {
                const produto = alerta.produtoId ? produtosPorId.get(alerta.produtoId) : undefined;
                const equipe = alerta.equipeId ? equipesPorId.get(alerta.equipeId) : undefined;
                const funcionario = alerta.funcionarioId ? funcionariosPorId.get(alerta.funcionarioId) : undefined;
                const encarregado = alerta.encarregadoId ? funcionariosPorId.get(alerta.encarregadoId) : undefined;
                const quantidade = Number.isFinite(alerta.quantidade) ? num(alerta.quantidade) : "Inválida";
                const responsavel = funcionario?.nome ?? encarregado?.nome ?? "Não informado";
                const tipoMovimentacao = alerta.tipoMovimentacao.replaceAll("_", " ");
                const tone: Tone = alerta.severidade === "alta" ? "danger" : alerta.severidade === "media" ? "warning" : "neutral";
                return (
                  <details key={alerta.id} className="group overflow-hidden rounded-xl border bg-card">
                    <summary className="cursor-pointer list-none px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <ToneBadge tone={tone}>
                              {alerta.severidade === "alta" ? "Alta" : alerta.severidade === "media" ? "Média" : "Baixa"}
                            </ToneBadge>
                            <span className="text-xs font-medium text-muted-foreground">{alerta.data.slice(0, 10)}</span>
                            <span className="font-mono text-xs text-muted-foreground">Mov. {alerta.movimentacaoId}</span>
                          </div>
                          <p className="mt-1.5 truncate text-sm font-semibold">{alerta.mensagem}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {tipoMovimentacao} · {produto?.nome ?? "Produto não localizado"} · {num(alerta.quantidade)} quantidade
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-primary">
                          <span className="group-open:hidden">Ver detalhes e correção</span>
                          <span className="hidden group-open:inline">Ocultar detalhes</span>
                        </span>
                      </div>
                    </summary>

                    <div className="border-t bg-muted/20 p-4">
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg border bg-background p-3">
                          <p className="text-[11px] text-muted-foreground">Movimentação</p>
                          <p className="mt-1 text-sm font-semibold">{alerta.movimentacaoId}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{alerta.data.slice(0, 10)} · {tipoMovimentacao}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                          <p className="text-[11px] text-muted-foreground">Produto</p>
                          <p className="mt-1 text-sm font-semibold">{produto?.nome ?? "Não encontrado"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">ID: {alerta.produtoId ?? "não informado"}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                          <p className="text-[11px] text-muted-foreground">Equipe</p>
                          <p className="mt-1 text-sm font-semibold">{equipe?.nome ?? (alerta.equipeId ? "Não encontrada" : "Sem equipe")}</p>
                          <p className="mt-1 text-xs text-muted-foreground">ID: {alerta.equipeId ?? "não informado"}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                          <p className="text-[11px] text-muted-foreground">Quantidade</p>
                          <p className="mt-1 text-sm font-semibold">{quantidade}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Responsável: {responsavel}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border bg-background p-4">
                          <p className="text-xs font-semibold text-muted-foreground">O que foi encontrado</p>
                          <p className="mt-2 text-sm">{alerta.mensagem}</p>
                          <dl className="mt-3 space-y-2 text-xs">
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">Documento</dt>
                              <dd className="font-medium">{alerta.documentoId ?? "Não informado"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">Justificativa / observação</dt>
                              <dd className="max-w-[70%] text-right font-medium">{alerta.observacao?.trim() || "Não informada"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">Saldo anterior</dt>
                              <dd className="font-medium tabular-nums">{alerta.saldoAnterior == null ? "—" : num(alerta.saldoAnterior)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">Saldo após a movimentação</dt>
                              <dd className={`font-medium tabular-nums ${alerta.saldoPosterior != null && alerta.saldoPosterior < 0 ? "text-destructive" : ""}`}>
                                {alerta.saldoPosterior == null ? "—" : num(alerta.saldoPosterior)}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                          <p className="text-xs font-semibold text-primary">Como corrigir</p>
                          <p className="mt-2 text-sm leading-6">{alerta.comoCorrigir}</p>
                        </div>
                      </div>

                      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                        O alerta está vinculado à movimentação <span className="font-mono">{alerta.movimentacaoId}</span>. A
                        análise não altera o histórico: faça a correção no módulo de Movimentações e volte aqui para confirmar
                        que o apontamento desapareceu.
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Check}
              title="Nenhum alerta de qualidade"
              description="Nenhuma exceção de integridade foi identificada no período selecionado."
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
});

/* ========================================================================== */
/* Comparativo e relatório                                                     */
/* ========================================================================== */

const AbaComparativo = memo(function AbaComparativo({
  comparacao,
  serieComparacao,
  porEquipe,
  porProduto,
  porResponsavel,
  nomesEquipes,
  produtosPorId,
  nomesFuncionarios,
  produtoId,
  abrirEquipe,
  abrirProdutoEmConsumo,
  exportarCsv,
  imprimir,
}: {
  comparacao: ReturnType<typeof calcularComparacaoPeriodos>;
  serieComparacao: Array<{ indicador: string; anterior: number; atual: number }>;
  porEquipe: ReturnType<typeof calcularComparacaoPorEquipe>;
  porProduto: ReturnType<typeof calcularComparacaoPorProduto>;
  porResponsavel: ReturnType<typeof calcularComparacaoPorResponsavel>;
  nomesEquipes: Map<string, string>;
  produtosPorId: Map<string, { nome: string }>;
  nomesFuncionarios: Map<string, string>;
  produtoId: string | null;
  abrirEquipe: (id: string) => void;
  abrirProdutoEmConsumo: (id: string) => void;
  exportarCsv: () => void;
  imprimir: () => void;
}) {
  return (
    <section aria-labelledby="comparativo-periodos" className="space-y-4">
      <SectionHeader
        id="comparativo-periodos"
        icon={GitCompareArrows}
        title="Comparação entre períodos"
        description="A janela anterior tem a mesma duração e fica imediatamente atrás da atual. Os filtros de produto e equipe continuam valendo."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-3.5">
          <p className="text-xs font-medium text-muted-foreground">Período atual</p>
          <p className="mt-1 font-medium">
            {comparacao.periodoAtual.de} → {comparacao.periodoAtual.ate}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">{num(comparacao.dias)} dias</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3.5">
          <p className="text-xs font-medium text-muted-foreground">Período anterior</p>
          <p className="mt-1 font-medium">
            {comparacao.periodoAnterior.de} → {comparacao.periodoAnterior.ate}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">{num(comparacao.dias)} dias</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ComparisonMetric label="Movimentações" atual={comparacao.atual.movimentacoes} anterior={comparacao.anterior.movimentacoes} variacao={comparacao.variacoes.movimentacoes} />
        <ComparisonMetric label="Entradas" atual={comparacao.atual.entradasMovimentacoes} anterior={comparacao.anterior.entradasMovimentacoes} variacao={comparacao.variacoes.entradasMovimentacoes} />
        <ComparisonMetric label="Saídas" atual={comparacao.atual.saidasMovimentacoes} anterior={comparacao.anterior.saidasMovimentacoes} variacao={comparacao.variacoes.saidasMovimentacoes} />
        <ComparisonMetric label="Produtos movimentados" atual={comparacao.atual.produtosMovimentados} anterior={comparacao.anterior.produtosMovimentados} variacao={comparacao.variacoes.produtosMovimentados} />
      </div>

      <ChartCard
        title="Comparação visual"
        height={288}
        isEmpty={false}
        footnote="O gráfico compara contagens de movimentações e produtos entre as duas janelas. Quantidades físicas continuam analisadas por produto."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={serieComparacao} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COR_GRID} vertical={false} />
            <XAxis dataKey="indicador" {...eixoProps} />
            <YAxis allowDecimals={false} {...eixoProps} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.35 }} content={<ChartTooltip format={(valor) => num(valor)} />} />
            <Legend verticalAlign="bottom" height={36} />
            <Bar dataKey="anterior" name="Período anterior" fill={COR_ANTERIOR} isAnimationActive={false} radius={[4, 4, 0, 0]} />
            <Bar dataKey="atual" name="Período atual" fill={COR_ATUAL} isAnimationActive={false} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comparação por equipe</CardTitle>
          <p className="text-xs text-muted-foreground">
            Contagens de movimentações, saídas e produtos. “Analisar” abre a visão de equipes com o filtro aplicado.
          </p>
        </CardHeader>
        <CardContent>
          {porEquipe.length ? (
            <TableShell minWidth={780}>
              <thead className={THEAD_CLASS}>
                <tr>
                  <th className={TH_CLASS}>Equipe</th>
                  <th className={TH_NUM_CLASS}>Mov. atual</th>
                  <th className={TH_NUM_CLASS}>Mov. anterior</th>
                  <th className={TH_NUM_CLASS}>Variação</th>
                  <th className={TH_NUM_CLASS}>Saídas atuais</th>
                  <th className={TH_NUM_CLASS}>Produtos</th>
                  <th className={TH_NUM_CLASS}>Ação</th>
                </tr>
              </thead>
              <tbody className={TBODY_CLASS}>
                {porEquipe.map((item) => (
                  <tr key={item.equipeId} className={TR_CLASS}>
                    <td className={`${TD_CLASS} font-medium`}>
                      {item.equipeId === SEM_EQUIPE_ID ? "Sem equipe" : nomesEquipes.get(item.equipeId) ?? "Equipe não localizada"}
                    </td>
                    <td className={TD_NUM_CLASS}>{num(item.atual.movimentacoes)}</td>
                    <td className={TD_NUM_CLASS}>{num(item.anterior.movimentacoes)}</td>
                    <td className={`${TD_NUM_CLASS} ${classeVariacao(item.variacoes.movimentacoes)}`}>
                      {formatarVariacao(item.variacoes.movimentacoes)}
                    </td>
                    <td className={TD_NUM_CLASS}>{num(item.atual.saidas)}</td>
                    <td className={TD_NUM_CLASS}>{num(item.atual.produtos)}</td>
                    <td className={TD_NUM_CLASS}>
                      {item.equipeId !== SEM_EQUIPE_ID ? (
                        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => abrirEquipe(item.equipeId)}>
                          Analisar
                          <ArrowUpRight className="size-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          ) : (
            <EmptyState compact title="Nenhuma movimentação encontrada para os períodos comparados." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comparação por produto</CardTitle>
          <p className="text-xs text-muted-foreground">
            Até 10 produtos com maior volume no período atual. “Analisar” abre o consumo com o produto selecionado.
          </p>
        </CardHeader>
        <CardContent>
          {porProduto.length ? (
            <TableShell minWidth={720}>
              <thead className={THEAD_CLASS}>
                <tr>
                  <th className={TH_CLASS}>Produto</th>
                  <th className={TH_NUM_CLASS}>Mov. atual</th>
                  <th className={TH_NUM_CLASS}>Mov. anterior</th>
                  <th className={TH_NUM_CLASS}>Variação</th>
                  <th className={TH_NUM_CLASS}>Saídas atuais</th>
                  <th className={TH_NUM_CLASS}>Ação</th>
                </tr>
              </thead>
              <tbody className={TBODY_CLASS}>
                {porProduto.map((item) => (
                  <tr key={item.produtoId} className={TR_CLASS}>
                    <td className={`${TD_CLASS} font-medium`}>
                      {produtosPorId.get(item.produtoId)?.nome ?? "Produto não localizado"}
                    </td>
                    <td className={TD_NUM_CLASS}>{num(item.atual.movimentacoes)}</td>
                    <td className={TD_NUM_CLASS}>{num(item.anterior.movimentacoes)}</td>
                    <td className={`${TD_NUM_CLASS} ${classeVariacao(item.variacoes.movimentacoes)}`}>
                      {formatarVariacao(item.variacoes.movimentacoes)}
                    </td>
                    <td className={TD_NUM_CLASS}>{num(item.atual.saidas)}</td>
                    <td className={TD_NUM_CLASS}>
                      <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => abrirProdutoEmConsumo(item.produtoId)}>
                        Analisar
                        <ArrowUpRight className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          ) : (
            <EmptyState compact title="Nenhuma movimentação encontrada para os produtos nos períodos comparados." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comparação por responsável</CardTitle>
          <p className="text-xs text-muted-foreground">
            Usa o responsável registrado na movimentação, priorizando encarregado e depois funcionário.
          </p>
        </CardHeader>
        <CardContent>
          {porResponsavel.length ? (
            <TableShell minWidth={640}>
              <thead className={THEAD_CLASS}>
                <tr>
                  <th className={TH_CLASS}>Responsável</th>
                  <th className={TH_NUM_CLASS}>Mov. atual</th>
                  <th className={TH_NUM_CLASS}>Mov. anterior</th>
                  <th className={TH_NUM_CLASS}>Variação</th>
                  <th className={TH_NUM_CLASS}>Saídas atuais</th>
                </tr>
              </thead>
              <tbody className={TBODY_CLASS}>
                {porResponsavel.map((item) => (
                  <tr key={item.responsavelId} className={TR_CLASS}>
                    <td className={`${TD_CLASS} font-medium`}>
                      {item.responsavelId === SEM_RESPONSAVEL_ID
                        ? "Sem responsável"
                        : nomesFuncionarios.get(item.responsavelId) ?? "Responsável não localizado"}
                    </td>
                    <td className={TD_NUM_CLASS}>{num(item.atual.movimentacoes)}</td>
                    <td className={TD_NUM_CLASS}>{num(item.anterior.movimentacoes)}</td>
                    <td className={`${TD_NUM_CLASS} ${classeVariacao(item.variacoes.movimentacoes)}`}>
                      {formatarVariacao(item.variacoes.movimentacoes)}
                    </td>
                    <td className={TD_NUM_CLASS}>{num(item.atual.saidas)}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          ) : (
            <EmptyState compact title="Nenhuma movimentação atribuída a responsáveis nos períodos comparados." />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel title="Devoluções">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Atual" value={num(comparacao.atual.devolucoesMovimentacoes)} />
            <Metric label="Anterior" value={num(comparacao.anterior.devolucoesMovimentacoes)} />
          </div>
        </Panel>
        <Panel title="Quantidade física">
          {produtoId ? (
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Entradas" value={num(comparacao.atual.entradasQuantidade)} />
              <Metric label="Saídas" value={num(comparacao.atual.saidasQuantidade)} />
              <Metric label="Variação entradas" value={formatarVariacao(comparacao.variacoes.entradasQuantidade)} />
              <Metric label="Variação saídas" value={formatarVariacao(comparacao.variacoes.saidasQuantidade)} />
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              A quantidade não é agregada entre produtos de unidades diferentes. Selecione um produto para comparar quantidades físicas.
            </p>
          )}
        </Panel>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Relatório</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            O CSV reúne os filtros atuais, as datas das duas janelas e os principais indicadores. Para PDF, use a impressão
            dedicada: ela esconde menus e controles e imprime uma composição própria, organizada em páginas.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={exportarCsv}>
            <Download className="size-4" />
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={imprimir}>
            <FileText className="size-4" />
            Imprimir relatório / PDF
          </Button>
        </CardContent>
      </Card>
    </section>
  );
});

/* ========================================================================== */
/* Utilitários e componentes de apoio                                          */
/* ========================================================================== */

function formatarMoeda(valor: number | undefined): string {
  return `R$ ${(valor ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function formatarVariacao(valor: number | null): string {
  if (valor == null) return "—";
  return `${valor > 0 ? "+" : ""}${num(valor)}%`;
}

/*
 * A variação de contagens indica direção, não qualidade: mais saídas não é
 * "ruim" nem mais entradas é "bom". Por isso usamos ênfase tipográfica em vez
 * de um semáforo verde/vermelho, que induziria a leitura errada.
 */
function classeVariacao(valor: number | null): string {
  if (valor == null || valor === 0) return "text-muted-foreground";
  return valor > 0 ? "font-semibold text-foreground" : "text-muted-foreground";
}

const ComparisonMetric = memo(function ComparisonMetric({
  label,
  atual,
  anterior,
  variacao,
}: {
  label: string;
  atual: number;
  anterior: number;
  variacao: number | null;
}) {
  const tone: Tone = variacao == null || variacao === 0 ? "neutral" : variacao > 0 ? "primary" : "neutral";
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-bold tabular-nums">{num(atual)}</p>
          <p className="text-xs tabular-nums text-muted-foreground">anterior: {num(anterior)}</p>
        </div>
        <ToneBadge tone={tone}>{formatarVariacao(variacao)}</ToneBadge>
      </div>
    </div>
  );
});

const FinancialTable = memo(function FinancialTable({
  title,
  rows,
  labels,
}: {
  title: string;
  rows: Array<{
    id: string;
    quantidadeEntrada: number;
    entradas: number;
    valorEntradasDocumentado: number;
    entradasSemCusto: number;
    quantidadeSaida: number;
    saidas: number;
    valorSaidasDocumentado: number;
    saidasSemCusto: number;
  }>;
  labels: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="rounded-xl border bg-background p-3 transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.id === "__sem__" ? "Não informado" : labels.get(row.id) ?? "Não encontrado"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {num(row.entradas)} entradas · {num(row.saidas)} saídas
                  </p>
                </div>
                <p className="shrink-0 font-display text-sm font-bold tabular-nums">
                  {formatarMoeda(row.valorEntradasDocumentado + row.valorSaidasDocumentado)}
                </p>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-success/25 bg-success/10 p-2">
                  <span className="text-muted-foreground">Entradas</span>
                  <p className="font-semibold tabular-nums">{formatarMoeda(row.valorEntradasDocumentado)}</p>
                </div>
                <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-2">
                  <span className="text-muted-foreground">Saídas</span>
                  <p className="font-semibold tabular-nums">{formatarMoeda(row.valorSaidasDocumentado)}</p>
                </div>
              </div>
              {row.entradasSemCusto || row.saidasSemCusto ? (
                <p className="mt-2 text-xs text-warning">
                  Sem custo: {num(row.entradasSemCusto)} entrada(s) · {num(row.saidasSemCusto)} saída(s)
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState compact title="Sem movimentações com custo no período selecionado." />
        )}
      </CardContent>
    </Card>
  );
});

function exportarEstatisticasCsv({
  dados,
  periodo,
  produtoId,
  equipeId,
  comparacao,
}: {
  dados: NonNullable<ReturnType<typeof useDados>>;
  periodo: { de: string; ate: string };
  produtoId: string | null;
  equipeId: string | null;
  comparacao: ReturnType<typeof calcularComparacaoPeriodos>;
}) {
  const produto = produtoId ? dados.produtos.find((item) => item.id === produtoId)?.nome ?? "não localizado" : "Todos";
  const equipe = equipeId ? dados.equipes.find((item) => item.id === equipeId)?.nome ?? "não localizada" : "Todas";
  const linhas = [
    ["Relatório", "Estatísticas de materiais"],
    ["Produto", produto],
    ["Equipe", equipe],
    ["Período atual", `${comparacao.periodoAtual.de} → ${comparacao.periodoAtual.ate}`],
    ["Período anterior", `${comparacao.periodoAnterior.de} → ${comparacao.periodoAnterior.ate}`],
    ["Período selecionado", `${periodo.de} → ${periodo.ate}`],
    ["Indicador", "Atual", "Anterior", "Variação %"],
    ["Movimentações", comparacao.atual.movimentacoes, comparacao.anterior.movimentacoes, comparacao.variacoes.movimentacoes ?? ""],
    ["Entradas", comparacao.atual.entradasMovimentacoes, comparacao.anterior.entradasMovimentacoes, comparacao.variacoes.entradasMovimentacoes ?? ""],
    ["Saídas", comparacao.atual.saidasMovimentacoes, comparacao.anterior.saidasMovimentacoes, comparacao.variacoes.saidasMovimentacoes ?? ""],
    ["Devoluções", comparacao.atual.devolucoesMovimentacoes, comparacao.anterior.devolucoesMovimentacoes, comparacao.variacoes.devolucoesMovimentacoes ?? ""],
    ["Produtos movimentados", comparacao.atual.produtosMovimentados, comparacao.anterior.produtosMovimentados, comparacao.variacoes.produtosMovimentados ?? ""],
    ...(produtoId
      ? [
          ["Entradas (quantidade)", comparacao.atual.entradasQuantidade, comparacao.anterior.entradasQuantidade, comparacao.variacoes.entradasQuantidade ?? ""],
          ["Saídas (quantidade)", comparacao.atual.saidasQuantidade, comparacao.anterior.saidasQuantidade, comparacao.variacoes.saidasQuantidade ?? ""],
        ]
      : []),
  ];
  const csv = linhas
    .map((linha) => linha.map((valor) => `"${String(valor ?? "").split('"').join('""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `estatisticas-materiais-${periodo.ate}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}