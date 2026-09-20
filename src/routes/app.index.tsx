import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpCircle,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  Package,
  Plus,
  Settings2,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDados, useOnline, useProjetoAtivoId } from "@/hooks/useAppData";
import { getDB } from "@/db/db";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { efeito, consumoPor, agruparPorPeriodo } from "@/services/estoque";
import { formatarData, num } from "@/utils/format";
import type { Configuracao, Movimentacao } from "@/types";

export const Route = createFileRoute("/app/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — Almoxarifado" },
      {
        name: "description",
        content:
          "Visão geral do projeto, operação, estoque, equipamentos, documentos e inteligência do Almoxarifado Local-First.",
      },
      { property: "og:title", content: "Dashboard — Almoxarifado" },
      {
        property: "og:description",
        content: "Visão geral da operação e acesso rápido aos módulos do projeto.",
      },
    ],
  }),
  component: Dashboard,
});

type DashboardAnalise = {
  posicoes: number;
  comEstoque: number;
  criticos: Array<{
    id: string;
    produtoId: string;
    produto: string;
    equipe: string;
    unidade: string;
    estoque: number;
    minimo: number;
  }>;
  periodoMovimentacoes: number;
  entradas: number;
  saidas: number;
  devolucoes: number;
  saldoLiquido: number;
  topProdutos: Array<{ id: string; nome: string; total: number }>;
  serie: Array<{ periodo: string; entradas: number; saidas: number }>;
  recentes: Movimentacao[];
  ultimaMovimentacao: string | null;
};

type ModulosResumo = {
  configuracao: Configuracao | undefined;
  equipamentos: number;
  unidadesEquipamento: number;
  equipamentosEncerrados: number;
  documentosPendentes: number;
  documentosTotal: number;
  inventariosAbertos: number;
  acoesEmAndamento: number;
  acoesAltaPrioridade: number;
};

function dataLocalISO(offsetDias = 0) {
  const agora = new Date();
  const data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - offsetDias);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function agendarOcioso(callback: () => void) {
  const janela = window as typeof window & {
    requestIdleCallback?: (fn: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (janela.requestIdleCallback) {
    const id = janela.requestIdleCallback(callback, { timeout: 700 });
    return () => janela.cancelIdleCallback?.(id);
  }

  const id = window.setTimeout(callback, 40);
  return () => window.clearTimeout(id);
}

function calcularAnalise(
  dados: NonNullable<ReturnType<typeof useDados>>,
  periodoDias: number,
): DashboardAnalise {
  const produtoMap = new Map(dados.produtos.map((produto) => [produto.id, produto]));
  const equipeMap = new Map(dados.equipes.map((equipe) => [equipe.id, equipe]));
  const unidadeMap = new Map(dados.unidades.map((unidade) => [unidade.id, unidade.sigla]));
  const saldos = new Map<string, { produtoId: string; equipeId: string; estoque: number }>();

  // Reconstrução em uma única passagem. A implementação anterior baseada em
  // montarEstoque fazia filtros repetidos por posição e podia crescer de forma
  // custosa com históricos grandes. Aqui mantemos a mesma regra produto+equipe
  // com custo linear sobre as movimentações.
  for (const movimentacao of dados.movimentacoes) {
    if (!movimentacao.equipe_id) continue;
    const chave = `${movimentacao.produto_id}:${movimentacao.equipe_id}`;
    const atual = saldos.get(chave) ?? {
      produtoId: movimentacao.produto_id,
      equipeId: movimentacao.equipe_id,
      estoque: 0,
    };
    atual.estoque += efeito(movimentacao);
    saldos.set(chave, atual);
  }

  const estoque = [...saldos.values()]
    .map((saldo) => {
      const produto = produtoMap.get(saldo.produtoId);
      const equipe = equipeMap.get(saldo.equipeId);
      if (!produto || !equipe) return null;
      return {
        id: `${saldo.produtoId}:${saldo.equipeId}`,
        produto,
        equipe,
        unidade: produto.unidade_id ? unidadeMap.get(produto.unidade_id) : undefined,
        estoque: saldo.estoque,
        minimo: produto.estoque_minimo ?? 0,
        baixo: (produto.estoque_minimo ?? 0) > 0 && saldo.estoque < (produto.estoque_minimo ?? 0),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const inicio = dataLocalISO(periodoDias - 1);
  const fim = dataLocalISO(0);
  const movimentacoesPeriodo = dados.movimentacoes.filter(
    (movimentacao) => movimentacao.data >= inicio && movimentacao.data <= fim,
  );

  const produtoNome = new Map(dados.produtos.map((produto) => [produto.id, produto.nome]));
  const equipeNome = new Map(dados.equipes.map((equipe) => [equipe.id, equipe.nome]));
  const unidadeNome = new Map(dados.unidades.map((unidade) => [unidade.id, unidade.sigla]));

  const criticos = estoque
    .filter((item) => item.baixo)
    .sort((a, b) => a.estoque - a.minimo - (b.estoque - b.minimo))
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      produtoId: item.produto.id,
      produto: item.produto.nome,
      equipe: item.equipe.nome,
      unidade: item.unidade ?? "—",
      estoque: item.estoque,
      minimo: item.minimo,
    }));

  const entradas = movimentacoesPeriodo
    .filter((movimentacao) => movimentacao.tipo === "ENTRADA")
    .reduce((total, movimentacao) => total + movimentacao.quantidade, 0);
  const devolucoes = movimentacoesPeriodo
    .filter((movimentacao) => movimentacao.tipo === "DEVOLUCAO")
    .reduce((total, movimentacao) => total + movimentacao.quantidade, 0);
  const saidas = movimentacoesPeriodo
    .filter((movimentacao) => movimentacao.tipo === "SAIDA")
    .reduce((total, movimentacao) => total + movimentacao.quantidade, 0);

  const serieCompleta = agruparPorPeriodo(movimentacoesPeriodo, "dia");
  const serie = serieCompleta.slice(-14);

  const topProdutos = consumoPor(
    movimentacoesPeriodo,
    (movimentacao) => movimentacao.produto_id,
    (id) => produtoNome.get(id) ?? "Produto não localizado",
    6,
  );

  const recentes = [...dados.movimentacoes].sort((a, b) => {
    const data = b.data.localeCompare(a.data);
    return data !== 0 ? data : b.id.localeCompare(a.id);
  }).slice(0, 6);

  return {
    posicoes: estoque.length,
    comEstoque: estoque.filter((item) => item.estoque > 0).length,
    criticos,
    periodoMovimentacoes: movimentacoesPeriodo.length,
    entradas,
    saidas,
    devolucoes,
    saldoLiquido: entradas + devolucoes - saidas,
    topProdutos,
    serie,
    recentes,
    ultimaMovimentacao: dados.movimentacoes[0]?.data ?? null,
  };
}

function Dashboard() {
  const online = useOnline();
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [periodoDias, setPeriodoDias] = useState(30);
  const [analise, setAnalise] = useState<DashboardAnalise | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [, startTransition] = useTransition();

  const resumoModulos = useLiveQuery<ModulosResumo | undefined>(
    async () => {
      if (!projetoId) return undefined;

      const db = getDB();
      const [configuracao, equipamentos, unidadesEquipamento, documentos, inventarios, acoes] =
        await Promise.all([
          configuracoesRepo.obter(projetoId),
          db.equipamentos.where("projeto_id").equals(projetoId).count(),
          db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
          db.documentos.where("projeto_id").equals(projetoId).toArray(),
          db.inventarios.where("projeto_id").equals(projetoId).toArray(),
          db.inteligencia_acoes.where("projeto_id").equals(projetoId).toArray(),
        ]);

      return {
        configuracao,
        equipamentos,
        unidadesEquipamento: unidadesEquipamento.filter((item) => item.status === "ATIVO").length,
        equipamentosEncerrados: unidadesEquipamento.filter((item) => item.status === "ENCERRADO").length,
        documentosPendentes: documentos.filter((documento) => documento.status === "PENDENTE" || documento.status === "PARCIAL").length,
        documentosTotal: documentos.length,
        inventariosAbertos: inventarios.filter((inventario) => inventario.status === "ABERTO").length,
        acoesEmAndamento: acoes.filter((acao) => acao.status === "EM_ANDAMENTO").length,
        acoesAltaPrioridade: acoes.filter((acao) => acao.status === "EM_ANDAMENTO" && acao.prioridade === "alta").length,
      };
    },
    [projetoId],
  );

  useEffect(() => {
    if (!dados) return;

    let cancelado = false;
    setAnalisando(true);

    const cancelar = agendarOcioso(() => {
      if (cancelado) return;
      const resultado = calcularAnalise(dados, periodoDias);
      if (!cancelado) {
        setAnalise(resultado);
        setAnalisando(false);
      }
    });

    return () => {
      cancelado = true;
      cancelar();
    };
  }, [dados, periodoDias]);

  const moduloAtivo = useMemo(() => {
    const modulos = resumoModulos?.configuracao?.modulos;
    return {
      materiais: modulos?.materiais !== false,
      equipamentos: modulos?.equipamentos !== false,
      documentos: modulos?.documentos === true,
    };
  }, [resumoModulos?.configuracao]);

  if (!dados) {
    return (
      <div className="space-y-5">
        <div className="h-10 w-72 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl border bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  const periodoStatus = analise
    ? analise.saldoLiquido > 0
      ? "Entrando mais do que saindo"
      : analise.saldoLiquido < 0
        ? "Consumo acima das entradas"
        : "Fluxo equilibrado"
    : "Calculando visão operacional";

  return (
    <div className="scroll-smooth space-y-6 pb-8">
      <section id="visao" className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-card via-card to-muted/50 p-5 shadow-sm md:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-chart-3/10 blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
                <Boxes className="size-3.5" />
                Visão geral do projeto
              </Badge>
              <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1">
                <span className={`size-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
                {online ? "Online" : "Modo offline"}
              </Badge>
            </div>

            <div>
              <h1 className="font-display text-3xl font-bold uppercase tracking-tight md:text-4xl">
                Operação sob controle
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Um ponto de entrada para entender o projeto, agir rapidamente e acompanhar o que merece atenção no almoxarifado.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {dados.projetos.find((projeto) => projeto.id === projetoId)?.nome ?? "Projeto ativo"}
              </span>
              <span>•</span>
              <span>{num(dados.produtos.length)} produtos</span>
              <span>•</span>
              <span>{num(dados.equipes.length)} equipes</span>
              <span>•</span>
              <span>{num(dados.funcionarios.length)} funcionários</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link to="/app/lancar" search={{ produto: undefined }}>
                <Plus />
                Lançar material
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/app/vigia">
                <ShieldAlert />
                Abrir Vigia
              </Link>
            </Button>
          </div>
        </div>

        <nav className="relative mt-6 flex gap-2 overflow-x-auto border-t pt-4" aria-label="Atalhos da dashboard">
          {[
            ["#modulos", "Módulos"],
            ["#atencao", "Atenção agora"],
            ["#atividade", "Atividade"],
            ["#ritmo", "Ritmo"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
      </section>

      <section id="modulos" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Ecossistema</p>
            <h2 className="mt-1 font-display text-xl font-semibold uppercase">Módulos do aplicativo</h2>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/configuracoes">
              Configurar módulos
              <ChevronRight />
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 xl:grid-cols-4">
          <ModuleCard
            icon={Boxes}
            titulo="Materiais"
            descricao="Estoque, lançamentos, movimentações, inventário e perfil do produto."
            ativo={moduloAtivo.materiais}
            href="/app/estoque"
            destaque
            metricas={[
              { label: "Produtos", valor: num(dados.produtos.length) },
              { label: "Posições", valor: analise ? num(analise.posicoes) : "…" },
              { label: "Críticos", valor: analise ? num(analise.criticos.length) : "…" },
            ]}
          />
          <ModuleCard
            icon={Wrench}
            titulo="Equipamentos"
            descricao="Controle patrimonial, apropriações, movimentações e relatórios."
            ativo={moduloAtivo.equipamentos}
            href="/app/equipamentos"
            metricas={[
              { label: "Cadastros", valor: resumoModulos ? num(resumoModulos.equipamentos) : "…" },
              { label: "Unidades ativas", valor: resumoModulos ? num(resumoModulos.unidadesEquipamento) : "…" },
              { label: "Encerrados", valor: resumoModulos ? num(resumoModulos.equipamentosEncerrados) : "…" },
            ]}
          />
          <ModuleCard
            icon={FileText}
            titulo="Documentos"
            descricao="Notas, recebimentos e origem documental dos custos de estoque."
            ativo={moduloAtivo.documentos}
            href="/app/documentos"
            metricas={[
              { label: "Documentos", valor: resumoModulos ? num(resumoModulos.documentosTotal) : "…" },
              { label: "Pendentes", valor: resumoModulos ? num(resumoModulos.documentosPendentes) : "…" },
              { label: "Estado", valor: moduloAtivo.documentos ? "Ativo" : "Desativado" },
            ]}
          />
          <ModuleCard
            icon={Sparkles}
            titulo="Inteligência"
            descricao="Vigia Operacional, Estatísticas e acompanhamento das ações recomendadas."
            ativo={moduloAtivo.materiais}
            href="/app/vigia"
            accent="inteligencia"
            metricas={[
              { label: "Em acompanhamento", valor: resumoModulos ? num(resumoModulos.acoesEmAndamento) : "…" },
              { label: "Alta prioridade", valor: resumoModulos ? num(resumoModulos.acoesAltaPrioridade) : "…" },
              { label: "Estatísticas", valor: "24/7 local" },
            ]}
          />
        </div>
      </section>

      <section id="atencao" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Centro operacional</p>
            <h2 className="mt-1 font-display text-xl font-semibold uppercase">O que merece atenção agora</h2>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/app/vigia">
              Ver painel completo
              <ArrowRight />
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.45fr_.9fr]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldAlert className="size-4 text-primary" />
                    Sinais operacionais
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Itens que pedem ação ou acompanhamento humano.
                  </p>
                </div>
                <Badge variant={analise?.criticos.length ? "destructive" : "secondary"}>
                  {analise ? `${analise.criticos.length} críticos` : "…"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {analise?.criticos.length ? (
                analise.criticos.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    to="/app/produto"
                    search={{ produto: item.produtoId }}
                    className="group flex items-center gap-3 p-4 transition-colors hover:bg-muted/30"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      <AlertTriangle className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.produto}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {item.equipe} · atual {num(item.estoque)} {item.unidade} · mínimo {num(item.minimo)}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))
              ) : (
                <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  {analisando ? "Analisando o estado atual do estoque…" : "Nenhuma posição crítica identificada."}
                </div>
              )}

              {resumoModulos?.inventariosAbertos ? (
                <Link
                  to="/app/inventario"
                  className="group flex items-center gap-3 p-4 transition-colors hover:bg-muted/30"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ClipboardCheck className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Inventário em andamento</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {num(resumoModulos.inventariosAbertos)} inventário(s) aberto(s) neste projeto.
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <QuickHealthCard
              titulo="Documentação"
              valor={moduloAtivo.documentos ? num(resumoModulos?.documentosPendentes ?? 0) : "—"}
              detalhe={moduloAtivo.documentos ? "documentos pendentes/parciais" : "módulo desativado"}
              icon={FileText}
              href={moduloAtivo.documentos ? "/app/documentos" : "/app/configuracoes"}
              tone={moduloAtivo.documentos && (resumoModulos?.documentosPendentes ?? 0) > 0 ? "warning" : "neutral"}
            />
            <QuickHealthCard
              titulo="Inteligência"
              valor={num(resumoModulos?.acoesEmAndamento ?? 0)}
              detalhe={`${num(resumoModulos?.acoesAltaPrioridade ?? 0)} de alta prioridade`}
              icon={Sparkles}
              href="/app/vigia"
              tone={(resumoModulos?.acoesAltaPrioridade ?? 0) > 0 ? "danger" : "neutral"}
            />
          </div>
        </div>
      </section>

      <section id="atividade" className="grid gap-3 xl:grid-cols-[1.25fr_.75fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-primary" />
                Atividade recente
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Últimos registros movimentados no projeto.</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/movimentacoes" search={{ produto: undefined }}>
                Abrir histórico
                <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {analise?.recentes.length ? (
              analise.recentes.map((movimentacao) => (
                <RecentMovement key={movimentacao.id} movimentacao={movimentacao} dados={dados} />
              ))
            ) : (
              <div className="p-5 text-sm text-muted-foreground">Nenhuma movimentação registrada.</div>
            )}
          </CardContent>
        </Card>

        <Card id="ritmo" className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="size-4 text-primary" />
                  Ritmo da operação
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Entradas e saídas no período selecionado.
                </p>
              </div>
              <div className="flex rounded-lg border bg-muted/30 p-1">
                {[7, 30, 90].map((dias) => {
                  const ativo = periodoDias === dias;
                  return (
                    <button
                      key={dias}
                      type="button"
                      onClick={() => startTransition(() => setPeriodoDias(dias))}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        ativo ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {dias}d
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {analise ? (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  <MiniMetric label="Movimentações" valor={num(analise.periodoMovimentacoes)} />
                  <MiniMetric label="Entradas" valor={`+${num(analise.entradas)}`} tone="positive" />
                  <MiniMetric label="Saídas" valor={`-${num(analise.saidas)}`} tone="negative" />
                </div>

                <div className="mt-5 space-y-2">
                  {analise.serie.map((item, index) => {
                    const maximo = Math.max(...analise.serie.map((linha) => Math.max(linha.entradas, linha.saidas)), 1);
                    const entradaPct = Math.max(2, (item.entradas / maximo) * 100);
                    const saidaPct = Math.max(2, (item.saidas / maximo) * 100);
                    return (
                      <div key={`${item.periodo}:${index}`} className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{formatarData(item.periodo)}</span>
                          <span>{num(item.entradas)} in · {num(item.saidas)} out</span>
                        </div>
                        <div className="grid gap-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-chart-3 transition-all duration-300" style={{ width: `${entradaPct}%` }} />
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-chart-5 transition-all duration-300" style={{ width: `${saidaPct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    {analise.saldoLiquido < 0 ? <TrendingDown className="size-4 text-destructive" /> : <TrendingUp className="size-4 text-emerald-600" />}
                    <span className="truncate text-muted-foreground">{periodoStatus}</span>
                  </div>
                  <span className="num shrink-0 font-semibold">{analise.saldoLiquido > 0 ? "+" : ""}{num(analise.saldoLiquido)}</span>
                </div>
              </>
            ) : (
              <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
                Preparando a análise…
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-4 text-primary" />
              Materiais mais consumidos
            </CardTitle>
            <p className="text-xs text-muted-foreground">Saídas no período selecionado.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {analise?.topProdutos.length ? (
              analise.topProdutos.map((produto, index) => {
                const maior = analise.topProdutos[0]?.total ?? 1;
                const pct = Math.max(4, (produto.total / maior) * 100);
                return (
                  <Link
                    key={produto.id}
                    to="/app/produto"
                    search={{ produto: produto.id }}
                    className="group block rounded-xl border p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{index + 1}. {produto.nome}</span>
                      <span className="num shrink-0 text-sm font-semibold">{num(produto.total)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-chart-1 transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma saída encontrada no período selecionado.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="size-4 text-primary" />
              Atalhos operacionais
            </CardTitle>
            <p className="text-xs text-muted-foreground">Ações de uso recorrente sem percorrer o menu lateral.</p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <QuickAction href="/app/lancar" icon={ArrowLeftRight} titulo="Lançar movimentação" detalhe="Entrada, saída, devolução ou ajuste" />
            <QuickAction href="/app/estoque" icon={Boxes} titulo="Consultar estoque" detalhe="Saldo atual e histórico por produto" />
            <QuickAction href="/app/cadastros" icon={Package} titulo="Produtos" detalhe="Cadastro e dados de referência" />
            <QuickAction href="/app/inventario" icon={ClipboardCheck} titulo="Inventário" detalhe="Contagem e posições críticas" />
            {moduloAtivo.equipamentos ? (
              <QuickAction href="/app/equipamentos" icon={Wrench} titulo="Equipamentos" detalhe="Controle físico e apropriações" />
            ) : (
              <QuickAction href="/app/configuracoes" icon={Settings2} titulo="Ativar equipamentos" detalhe="O módulo está desativado" />
            )}
            {moduloAtivo.documentos ? (
              <QuickAction href="/app/documentos" icon={FileText} titulo="Documentos" detalhe="Notas, recebimentos e custos" />
            ) : (
              <QuickAction href="/app/configuracoes" icon={Settings2} titulo="Ativar documentos" detalhe="Habilite o módulo nas configurações" />
            )}
            <QuickAction href="/app/estatisticas" icon={BarChart3} titulo="Estatísticas" detalhe="Consumo, cobertura e tendências" />
            <QuickAction href="/app/dados" icon={Boxes} titulo="Dados e backup" detalhe="Backup e restauração do projeto" />
          </CardContent>
        </Card>
      </section>

      <footer className="flex flex-col gap-2 border-t pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-foreground">{periodoStatus}</span>
          <span>•</span>
          <span>{analise?.ultimaMovimentacao ? `Última movimentação em ${formatarData(analise.ultimaMovimentacao)}` : "Sem movimentações"}</span>
        </div>
        <span>Processamento local-first · interface pronta para trabalhar offline</span>
      </footer>
    </div>
  );
}

function ModuleCard({
  icon: Icon,
  titulo,
  descricao,
  href,
  ativo,
  metricas,
  destaque = false,
  accent = "padrao",
}: {
  icon: typeof Boxes;
  titulo: string;
  descricao: string;
  href: "/app/estoque" | "/app/equipamentos" | "/app/documentos" | "/app/vigia";
  ativo: boolean;
  metricas: Array<{ label: string; valor: string }>;
  destaque?: boolean;
  accent?: "padrao" | "inteligencia";
}) {
  return (
    <Card className={`group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
      destaque ? "border-primary/30" : ""
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
            accent === "inteligencia" ? "bg-primary/10 text-primary" : "bg-muted text-foreground"
          }`}>
            <Icon className="size-5" />
          </div>
          <Badge variant={ativo ? "secondary" : "outline"} className="gap-1.5">
            <span className={`size-1.5 rounded-full ${ativo ? "bg-emerald-500" : "bg-muted-foreground"}`} />
            {ativo ? "Ativo" : "Desativado"}
          </Badge>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold uppercase">{titulo}</h3>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{descricao}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {metricas.map((metrica) => (
            <div key={metrica.label} className="rounded-xl bg-muted/40 px-2.5 py-2">
              <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{metrica.label}</p>
              <p className="mt-1 truncate text-sm font-semibold">{metrica.valor}</p>
            </div>
          ))}
        </div>

        <Button asChild variant={ativo ? "outline" : "ghost"} className="mt-4 w-full justify-between">
          <Link to={ativo ? href : "/app/configuracoes"}>
            {ativo ? `Abrir ${titulo}` : "Configurar módulo"}
            <ChevronRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function QuickHealthCard({
  titulo,
  valor,
  detalhe,
  icon: Icon,
  href,
  tone,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  icon: typeof FileText;
  href: "/app/documentos" | "/app/configuracoes" | "/app/vigia";
  tone: "warning" | "danger" | "neutral";
}) {
  const toneClasses = {
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    danger: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
    neutral: "bg-muted text-foreground",
  };

  return (
    <Link to={href} className="group rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{detalhe}</p>
        </div>
        <span className="text-xl font-semibold">{valor}</span>
      </div>
    </Link>
  );
}

function RecentMovement({
  movimentacao,
  dados,
}: {
  movimentacao: Movimentacao;
  dados: NonNullable<ReturnType<typeof useDados>>;
}) {
  const produto = dados.produtos.find((item) => item.id === movimentacao.produto_id);
  const equipe = dados.equipes.find((item) => item.id === movimentacao.equipe_id);
  const sinal = efeito(movimentacao);
  const positivo = sinal > 0;
  const nomeTipo = {
    ENTRADA: "Entrada",
    SAIDA: "Saída",
    DEVOLUCAO: "Devolução",
    AJUSTE: "Ajuste",
    TRANSFERENCIA: "Transferência",
  }[movimentacao.tipo] ?? movimentacao.tipo;

  return (
    <Link
      to="/app/movimentacoes"
      search={{ produto: undefined }}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
    >
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
        positivo ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
      }`}>
        {positivo ? <ArrowDownCircle className="size-4" /> : <ArrowUpCircle className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{produto?.nome ?? "Produto não localizado"}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {nomeTipo} · {equipe?.nome ?? "Sem equipe"} · {formatarData(movimentacao.data)}
        </span>
      </span>
      <span className={`num shrink-0 text-sm font-semibold ${sinal < 0 ? "text-destructive" : "text-emerald-600"}`}>
        {sinal > 0 ? "+" : ""}{num(sinal)}
      </span>
    </Link>
  );
}

function MiniMetric({
  label,
  valor,
  tone = "neutral",
}: {
  label: string;
  valor: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueClass = tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${valueClass}`}>{valor}</p>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  titulo,
  detalhe,
}: {
  href:
    | "/app/lancar"
    | "/app/estoque"
    | "/app/cadastros"
    | "/app/inventario"
    | "/app/equipamentos"
    | "/app/configuracoes"
    | "/app/documentos"
    | "/app/estatisticas"
    | "/app/dados";
  icon: typeof ArrowLeftRight;
  titulo: string;
  detalhe: string;
}) {
  return (
    <Link
      to={href}
      className="group flex items-center gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:bg-muted/30 hover:shadow-sm"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{titulo}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detalhe}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
