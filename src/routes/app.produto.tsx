import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Warehouse,
  XCircle,
} from "lucide-react";

import { AcompanhamentoInteligencia } from "@/components/inteligencia/AcompanhamentoInteligencia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/common/Combobox";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDB } from "@/db/db";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { montarEstoque } from "@/services/estoque";
import {
  calcularAnaliseReposicao,
  calcularDesviosConsumoProdutos,
  calcularProdutoEstatistica,
  criarPeriodoPadrao,
  type DesvioConsumoProduto,
  type ProdutoEstatistica,
} from "@/services/estatisticas-materiais";
import type { Documento, DocumentoItem, Equipe, Inventario, InventarioItem, Movimentacao, Produto } from "@/types";
import { formatarData, num } from "@/utils/format";

export const Route = createFileRoute("/app/produto")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ProdutoBusca => ({
    produto: typeof search["produto"] === "string" ? search["produto"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Perfil do Produto — Almoxarifado" },
      {
        name: "description",
        content: "Visão integrada do estoque, consumo, movimentações, documentos, inventários e inteligência do produto.",
      },
    ],
  }),
  component: PerfilProdutoPage,
});

type ProdutoBusca = {
  produto: string | undefined;
};

type Sinal = {
  id: string;
  titulo: string;
  detalhe: string;
  nivel: "alta" | "media" | "info";
  cta: string;
  destino: "estoque" | "estatisticas" | "inventario" | "lancar" | "documentos";
};

const PERIODO_DIAS = 30;

function toneClasses(nivel: Sinal["nivel"]) {
  if (nivel === "alta") return "border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20";
  if (nivel === "media") return "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20";
  return "border-blue-200 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/20";
}

function toneBadge(nivel: Sinal["nivel"]) {
  if (nivel === "alta") return <Badge className="bg-red-600 text-white hover:bg-red-600">Atenção</Badge>;
  if (nivel === "media") return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Acompanhar</Badge>;
  return <Badge variant="secondary">Informativo</Badge>;
}

function tipoMovimento(m: Movimentacao) {
  if (m.tipo === "ENTRADA" || m.tipo === "DEVOLUCAO") return "text-emerald-600";
  if (m.tipo === "SAIDA") return "text-red-600";
  if (m.tipo === "AJUSTE") return "text-amber-600";
  return "text-blue-600";
}

function efeitoMovimento(m: Movimentacao) {
  if (m.tipo === "SAIDA") return -m.quantidade;
  if (m.tipo === "AJUSTE" || m.tipo === "TRANSFERENCIA") return (m.sinal ?? 1) * m.quantidade;
  return m.quantidade;
}

function CTA({ sinal, produtoId }: { sinal: Sinal; produtoId: string }) {
  if (sinal.destino === "estoque") {
    return <Button asChild size="sm" variant="outline"><Link to="/app/estoque" search={{ produto: produtoId }}>{sinal.cta}<ArrowRight className="ml-2 size-3.5" /></Link></Button>;
  }
  if (sinal.destino === "lancar") {
    return <Button asChild size="sm" variant="outline"><Link to="/app/lancar" search={{ produto: produtoId }}>{sinal.cta}<ArrowRight className="ml-2 size-3.5" /></Link></Button>;
  }
  if (sinal.destino === "estatisticas") {
    return <Button asChild size="sm" variant="outline"><Link to="/app/estatisticas">{sinal.cta}<ArrowRight className="ml-2 size-3.5" /></Link></Button>;
  }
  if (sinal.destino === "inventario") {
    return <Button asChild size="sm" variant="outline"><Link to="/app/inventario">{sinal.cta}<ArrowRight className="ml-2 size-3.5" /></Link></Button>;
  }
  return <Button asChild size="sm" variant="outline"><Link to="/app/documentos">{sinal.cta}<ArrowRight className="ml-2 size-3.5" /></Link></Button>;
}

function PerfilProdutoPage() {
  const { produto: produtoParam } = Route.useSearch();
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );

  const [produtoId, setProdutoId] = useState<string | null>(produtoParam ?? null);
  const [salvandoInteligencia, setSalvandoInteligencia] = useState(false);

  useEffect(() => {
    setProdutoId(produtoParam ?? null);
  }, [produtoParam]);

  const produto = useMemo(
    () => dados?.produtos.find((item) => item.id === produtoId),
    [dados?.produtos, produtoId],
  );

  const periodo = useMemo(() => criarPeriodoPadrao(PERIODO_DIAS), []);

  const inventarioDados = useLiveQuery(async () => {
    if (!projetoId || !produtoId) return { inventarios: [] as Inventario[], itens: [] as InventarioItem[] };
    const db = getDB();
    const inventarios = await db.inventarios.where("projeto_id").equals(projetoId).toArray();
    const ids = inventarios.map((item) => item.id);
    if (!ids.length) return { inventarios, itens: [] as InventarioItem[] };
    const itens = await db.inventario_itens.where("inventario_id").anyOf(ids).toArray();
    return {
      inventarios,
      itens: itens.filter((item) => item.produto_id === produtoId),
    };
  }, [projetoId, produtoId]);

  const documentoDados = useLiveQuery(async () => {
    if (!projetoId || !produtoId || !configuracao?.modulos.documentos || !configuracao.documentos.habilitado) {
      return { documentos: [] as Documento[], itens: [] as DocumentoItem[] };
    }
    const db = getDB();
    const itens = await db.documento_itens.where("produto_id").equals(produtoId).toArray();
    const ids = [...new Set(itens.map((item) => item.documento_id))];
    const documentos = ids.length ? (await db.documentos.bulkGet(ids)).filter((item): item is Documento => Boolean(item)) : [];
    return { documentos, itens };
  }, [projetoId, produtoId, configuracao?.modulos.documentos, configuracao?.documentos.habilitado]);

  const estoquePorEquipe = useMemo(() => {
    if (!dados || !produto) return [];
    return montarEstoque(
      dados.produtos,
      dados.movimentacoes,
      dados.unidades,
      dados.categorias,
      dados.equipes,
    ).filter((item) => item.produto.id === produto.id).sort((a, b) => b.estoque - a.estoque || a.equipe.nome.localeCompare(b.equipe.nome));
  }, [dados, produto]);

  const estatistica = useMemo<ProdutoEstatistica | null>(
    () => (dados && produto ? calcularProdutoEstatistica(produto, dados.movimentacoes, periodo) : null),
    [dados, produto, periodo],
  );

  const reposicao = useMemo(
    () => (dados && produto ? calcularAnaliseReposicao([produto], dados.movimentacoes, periodo, 30, 1) : null),
    [dados, produto, periodo],
  );

  const desvios = useMemo<DesvioConsumoProduto[]>(
    () => (dados && produto ? calcularDesviosConsumoProdutos([produto], dados.movimentacoes, periodo, 1) : []),
    [dados, produto, periodo],
  );

  const movimentosProduto = useMemo(
    () => (dados && produto ? dados.movimentacoes.filter((item) => item.produto_id === produto.id).sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)) : []),
    [dados, produto],
  );

  const inventarioMap = useMemo(
    () => new Map((inventarioDados?.inventarios ?? []).map((item) => [item.id, item])),
    [inventarioDados?.inventarios],
  );

  const inventariosProduto = useMemo(
    () => (inventarioDados?.itens ?? [])
      .map((item) => ({ item, inventario: inventarioMap.get(item.inventario_id) }))
      .filter((item): item is { item: InventarioItem; inventario: Inventario } => Boolean(item.inventario))
      .sort((a, b) => b.inventario.data_abertura.localeCompare(a.inventario.data_abertura)),
    [inventarioDados?.itens, inventarioMap],
  );

  const ultimoInventarioConcluido = inventariosProduto.find((item) => item.inventario.status === "CONCLUIDO");
  const inventarioAberto = inventariosProduto.find((item) => item.inventario.status === "ABERTO");
  const ultimoInventarioData = ultimoInventarioConcluido?.inventario.data_encerramento ?? ultimoInventarioConcluido?.inventario.data_abertura;

  const sinais = useMemo<Sinal[]>(() => {
    if (!produto || !estatistica) return [];
    const resultado: Sinal[] = [];

    if (estatistica.estoqueAtual <= 0 && !estatistica.semConsumo) {
      resultado.push({ id: "estoque-zero", titulo: "Produto sem saldo e com consumo recente", detalhe: "O estoque agregado está zerado enquanto existem saídas no período analisado.", nivel: "alta", cta: "Ver estoque por equipe", destino: "estoque" });
    } else if (estatistica.abaixoDoMinimo) {
      resultado.push({ id: "abaixo-minimo", titulo: "Estoque abaixo do mínimo", detalhe: `Saldo atual de ${num(estatistica.estoqueAtual)} contra mínimo de ${num(estatistica.estoqueMinimo)}.`, nivel: "alta", cta: "Avaliar reposição", destino: "lancar" });
    } else if (estatistica.coberturaDias != null && estatistica.coberturaDias <= 7) {
      resultado.push({ id: "cobertura-critica", titulo: "Cobertura curta", detalhe: `A projeção atual indica aproximadamente ${num(estatistica.coberturaDias)} dias de cobertura.`, nivel: "alta", cta: "Avaliar estoque", destino: "estoque" });
    } else if (estatistica.coberturaDias != null && estatistica.coberturaDias <= 30) {
      resultado.push({ id: "cobertura-atencao", titulo: "Cobertura merece acompanhamento", detalhe: `A projeção atual indica aproximadamente ${num(estatistica.coberturaDias)} dias de cobertura.`, nivel: "media", cta: "Ver estatísticas", destino: "estatisticas" });
    }

    if (reposicao?.itens.length) {
      const item = reposicao.itens[0]!;
      if (item.quantidadeSugerida > 0) {
        resultado.push({ id: "reposicao", titulo: "Há uma sugestão de reposição", detalhe: `${num(item.quantidadeSugerida)} ${dados?.unidades.find((u) => u.id === produto.unidade_id)?.sigla ?? "un."} para atingir o estoque-alvo estimado.`, nivel: item.prioridade === "imediata" ? "alta" : "media", cta: "Abrir lançamento", destino: "lancar" });
      }
    }

    const desvio = desvios[0];
    if (desvio) {
      const variacao = desvio.variacaoPercentual == null ? "mudança relevante" : `${Math.abs(desvio.variacaoPercentual)}%`;
      resultado.push({ id: "desvio", titulo: `Consumo em ${desvio.direcao}`, detalhe: `As saídas variaram ${variacao} em comparação com a janela anterior.`, nivel: "media", cta: "Ver estatísticas", destino: "estatisticas" });
    }

    if (!ultimoInventarioConcluido) {
      resultado.push({ id: "inventario-ausente", titulo: "Produto ainda não foi conferido em inventário concluído", detalhe: "Não existe uma conferência física concluída para este produto no histórico disponível.", nivel: "media", cta: "Abrir inventário", destino: "inventario" });
    } else if (ultimoInventarioData) {
      const diasDesdeInventario = Math.max(0, Math.floor((Date.now() - new Date(ultimoInventarioData).getTime()) / 86400000));
      if (diasDesdeInventario > 90) {
        resultado.push({ id: "inventario-antigo", titulo: "Conferência física está antiga", detalhe: `O último inventário concluído deste produto tem ${diasDesdeInventario} dias. O parâmetro de acompanhamento usado pelo perfil é 90 dias.`, nivel: "media", cta: "Abrir inventário", destino: "inventario" });
      }
    }

    if (configuracao?.modulos.documentos && configuracao.documentos.habilitado && movimentosProduto.some((item) => item.tipo === "ENTRADA") && !documentoDados?.itens.length) {
      resultado.push({ id: "documentacao", titulo: "Entradas sem vínculo documental neste produto", detalhe: "O módulo documental está ativo, mas nenhuma entrada deste produto está vinculada a item de documento.", nivel: "info", cta: "Ver documentos", destino: "documentos" });
    }

    return resultado;
  }, [configuracao?.documentos.habilitado, configuracao?.modulos.documentos, dados, documentoDados?.itens.length, desvios, estatistica, inventarioDados?.inventarios, movimentosProduto, produto, reposicao, ultimoInventarioConcluido]);

  const ultimaMovimentacao = movimentosProduto[0];
  const unidade = produto?.unidade_id ? dados?.unidades.find((item) => item.id === produto.unidade_id) : undefined;
  const categoria = produto?.categoria_id ? dados?.categorias.find((item) => item.id === produto.categoria_id) : undefined;

  const alternarInteligencia = async (habilitada: boolean) => {
    if (!projetoId || !produto) return;
    setSalvandoInteligencia(true);
    try {
      await getDB().produtos.update(produto.id, { inteligencia_reposicao: habilitada });
    } finally {
      setSalvandoInteligencia(false);
    }
  };

  if (!projetoId) return <p className="text-sm text-muted-foreground">Selecione um projeto ativo.</p>;
  if (!dados) return <p className="text-sm text-muted-foreground">Carregando perfil do produto…</p>;

  const opcoesProdutos = dados.produtos.filter((item) => item.ativo).sort((a, b) => a.nome.localeCompare(b.nome)).map((item) => ({ value: item.id, label: item.codigo ? `${item.codigo} · ${item.nome}` : item.nome }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sidebar-primary">
            <PackageSearch className="size-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">Materiais · consulta integrada</span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Perfil do produto</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Uma visão integrada para entender o estado do material, o que está acontecendo e qual ação merece atenção.</p>
        </div>
        <div className="w-full lg:w-[470px]">
          <div className="rounded-2xl border-2 border-sidebar-primary/20 bg-sidebar-primary/[0.035] p-3 shadow-sm shadow-sidebar-primary/5 sm:p-3.5">
            <div className="mb-2.5 flex items-center gap-2.5 px-1">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/10 text-sidebar-primary">
                <PackageSearch className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-primary">Produto em foco</p>
                <p className="truncate text-xs text-muted-foreground">Selecione o material que esta tela deve acompanhar.</p>
              </div>
            </div>
            <Combobox
              value={produtoId}
              onChange={setProdutoId}
              placeholder="Selecione um produto"
              opcoes={opcoesProdutos}
              className="h-14 rounded-xl border-2 border-sidebar-primary/25 bg-background px-4 text-sm font-semibold shadow-sm transition-[border-color,box-shadow] hover:border-sidebar-primary/45 focus-visible:border-sidebar-primary focus-visible:ring-2 focus-visible:ring-sidebar-primary/20 sm:text-base"
            />
            {produto ? (
              <div className="mt-2.5 flex flex-wrap gap-2 px-1 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-background px-2.5 py-1 font-medium shadow-sm ring-1 ring-border">
                  {produto.codigo ? `Código ${produto.codigo}` : "Sem código"}
                </span>
                <span className="rounded-full bg-background px-2.5 py-1 font-medium shadow-sm ring-1 ring-border">
                  {unidade?.sigla ?? "unidade não informada"}
                </span>
                {categoria?.nome && (
                  <span className="max-w-full truncate rounded-full bg-background px-2.5 py-1 font-medium shadow-sm ring-1 ring-border">
                    {categoria.nome}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-2 px-1 text-[11px] text-muted-foreground">O produto selecionado passa a orientar todas as informações exibidas abaixo.</p>
            )}
          </div>
        </div>
      </header>

      {!produto ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-64 items-center justify-center p-8 text-center">
            <div className="max-w-lg">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-muted/30"><Boxes className="size-7 text-muted-foreground" /></div>
              <h2 className="mt-4 font-semibold text-lg">Escolha um produto para abrir o perfil</h2>
              <p className="mt-2 text-sm text-muted-foreground">Depois da seleção, esta tela reúne estoque por equipe, consumo, sinais de atenção, movimentações, documentos e histórico de inventário.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="bg-gradient-to-r from-sidebar-primary/15 via-background to-sidebar/10 px-5 py-5 sm:px-7">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-2xl font-bold">{produto.nome}</h2>
                    {produto.ativo ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                    {produto.inteligencia_reposicao === false && <Badge variant="outline" className="border-slate-300">Reposição inteligente desativada</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Código: <strong className="text-foreground">{produto.codigo ?? "—"}</strong></span>
                    <span>Unidade: <strong className="text-foreground">{unidade?.sigla ?? "—"}</strong></span>
                    <span>Categoria: <strong className="text-foreground">{categoria?.nome ?? "—"}</strong></span>
                    {produto.marca && <span>Marca: <strong className="text-foreground">{produto.marca}</strong></span>}
                    {produto.modelo && <span>Modelo: <strong className="text-foreground">{produto.modelo}</strong></span>}
                  </div>
                  {produto.descricao && <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{produto.descricao}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline"><Link to="/app/estoque" search={{ produto: produto.id }}><Warehouse className="mr-2 size-4" />Ver estoque</Link></Button>
                  <Button asChild><Link to="/app/lancar" search={{ produto: produto.id }}><ArrowRight className="mr-2 size-4" />Abrir lançamento</Link></Button>
                </div>
              </div>
            </div>
            <Separator />
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-card p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estoque atual</p><p className="num mt-1 text-2xl font-bold">{num(estatistica?.estoqueAtual ?? 0)} {unidade?.sigla ?? ""}</p><p className="mt-1 text-xs text-muted-foreground">Somado entre as equipes.</p></div>
              <div className="bg-card p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estoque mínimo</p><p className="num mt-1 text-2xl font-bold">{num(estatistica?.estoqueMinimo ?? produto.estoque_minimo)} {unidade?.sigla ?? ""}</p><p className="mt-1 text-xs text-muted-foreground">Parâmetro cadastrado.</p></div>
              <div className="bg-card p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cobertura</p><p className="num mt-1 text-2xl font-bold">{estatistica?.coberturaDias == null ? "—" : `${num(estatistica.coberturaDias)} d`}</p><p className="mt-1 text-xs text-muted-foreground">Janela efetiva de {PERIODO_DIAS} dias.</p></div>
              <div className="bg-card p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Última movimentação</p><p className="mt-1 text-2xl font-bold">{ultimaMovimentacao ? formatarData(ultimaMovimentacao.data) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">{ultimaMovimentacao?.tipo ?? "Nenhuma movimentação"}</p></div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
            <Card className="border-sidebar-primary/30 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div><CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-sidebar-primary" />O que merece atenção</CardTitle><p className="mt-1 text-sm text-muted-foreground">O perfil transforma os dados do produto em sinais concretos e direciona cada sinal para uma ação.</p></div>
                  <Badge variant="outline">{sinais.length} sinal(is)</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {sinais.length ? sinais.map((sinal) => <div key={sinal.id} className={`rounded-xl border p-4 ${toneClasses(sinal.nivel)}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{toneBadge(sinal.nivel)}<p className="font-semibold">{sinal.titulo}</p></div><p className="mt-2 text-sm text-muted-foreground">{sinal.detalhe}</p></div><CTA sinal={sinal} produtoId={produto.id} /></div></div>) : <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/20"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /><div><p className="font-semibold">Nenhum sinal de atenção identificado</p><p className="mt-1 text-sm text-muted-foreground">No período e nos dados disponíveis, o produto não apresentou uma condição que gere uma ação prioritária.</p></div></div></div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="size-5" />Inteligência de reposição</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4"><div><p className="font-medium">Participar das sugestões</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Controla somente as sugestões de reposição. Não remove o produto das análises de estoque, consumo, inventário ou qualidade.</p></div><Switch checked={produto.inteligencia_reposicao !== false} disabled={salvandoInteligencia} onCheckedChange={(checked) => void alternarInteligencia(checked)} aria-label="Ativar inteligência de reposição" /></div>
                <Separator />
                <div className="space-y-2 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">Janela analisada</span><strong>{PERIODO_DIAS} dias</strong></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Saídas no período</span><strong>{num(movimentosProduto.filter((item) => item.tipo === "SAIDA").length)}</strong></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Regra mínima de atividade</span><strong>{reposicao?.minSaidas ?? 3} saídas</strong></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Estoque-alvo</span><strong>{produto.inteligencia_reposicao === false ? "Não analisado" : reposicao?.itens[0] ? `${num(reposicao.itens[0].estoqueAlvo)} ${unidade?.sigla ?? ""}` : "Sem sugestão"}</strong></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Resultado</span><strong>{produto.inteligencia_reposicao === false ? "Desativada pelo produto" : reposicao?.itens[0] ? `${num(reposicao.itens[0].quantidadeSugerida)} ${unidade?.sigla ?? ""} sugeridos` : reposicao && reposicao.excluidosBaixaAtividade > 0 ? "Atividade insuficiente" : "Nenhuma reposição necessária"}</strong></div></div>
              </CardContent>
            </Card>
          </section>

          <section>
            <AcompanhamentoInteligencia projetoId={projetoId} produtoId={produto.id} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Warehouse className="size-5 text-sidebar-primary" />Estoque por equipe</CardTitle><p className="text-sm text-muted-foreground">A segregação por equipe permanece visível para evitar que o saldo agregado esconda uma posição crítica.</p></CardHeader>
              <CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Equipe</TableHead><TableHead>Categoria</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead className="text-right">Mínimo</TableHead><TableHead>Status</TableHead><TableHead className="w-[1%]" /></TableRow></TableHeader><TableBody>{estoquePorEquipe.length ? estoquePorEquipe.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.equipe.nome}</TableCell><TableCell>{item.categoria?.nome ?? "—"}</TableCell><TableCell className="num text-right font-semibold">{num(item.estoque)} {unidade?.sigla ?? ""}</TableCell><TableCell className="num text-right">{num(item.minimo)}</TableCell><TableCell>{item.baixo ? <Badge className="bg-red-600 text-white hover:bg-red-600">Abaixo do mínimo</Badge> : <Badge variant="secondary">OK</Badge>}</TableCell><TableCell><Button asChild size="sm" variant="ghost"><Link to="/app/estoque" search={{ produto: produto.id }}><ArrowRight className="size-4" /></Link></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhuma posição de estoque encontrada para este produto.</TableCell></TableRow>}</TableBody></Table></div></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="size-5" />Consumo e cobertura</CardTitle><p className="text-sm text-muted-foreground">O cálculo usa a lógica efetiva de consumo já adotada nas estatísticas.</p></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Consumo / dia</p><p className="num mt-1 font-semibold">{num(estatistica?.consumoMedioDiario ?? 0)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Consumo / mês</p><p className="num mt-1 font-semibold">{num(estatistica?.consumoMedioMensal ?? 0)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Dias até mínimo</p><p className="num mt-1 font-semibold">{estatistica?.diasAteMinimo == null ? "—" : num(estatistica.diasAteMinimo)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Ruptura estimada</p><p className="mt-1 font-semibold">{estatistica?.dataEstimadaRuptura ? formatarData(estatistica.dataEstimadaRuptura) : "—"}</p></div></div>
                <Button asChild variant="outline" className="w-full"><Link to="/app/estatisticas"><BarChart3 className="mr-2 size-4" />Abrir análise completa</Link></Button>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><History className="size-5" />Movimentações recentes</CardTitle><p className="text-sm text-muted-foreground">Últimos lançamentos que alteraram o histórico deste produto.</p></div><Badge variant="outline">{movimentosProduto.length}</Badge></div></CardHeader>
              <CardContent className="space-y-2">{movimentosProduto.slice(0, 8).map((movimento) => <div key={movimento.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={tipoMovimento(movimento)}>{movimento.tipo}</Badge><span className="text-xs text-muted-foreground">{formatarData(movimento.data)}</span><span className="text-xs text-muted-foreground">Equipe: {dados.equipes.find((item) => item.id === movimento.equipe_id)?.nome ?? "—"}</span></div><p className="mt-1 truncate text-sm">{movimento.observacao?.trim() || "Sem observação"}</p></div><p className={`num shrink-0 text-sm font-bold ${tipoMovimento(movimento)}`}>{efeitoMovimento(movimento) > 0 ? "+" : ""}{num(efeitoMovimento(movimento))} {unidade?.sigla ?? ""}</p></div>)}{!movimentosProduto.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada para este produto.</p>}<Button asChild variant="outline" className="w-full"><Link to="/app/movimentacoes" search={{ produto: produto.id }}><History className="mr-2 size-4" />Abrir histórico completo</Link></Button></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-5" />Inventários</CardTitle><p className="text-sm text-muted-foreground">Conferências físicas relacionadas diretamente a este produto.</p></CardHeader>
              <CardContent className="space-y-3">{inventarioAberto && <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"><div className="flex items-start gap-3"><PackageOpen className="mt-0.5 size-5 text-amber-600" /><div><p className="font-semibold">Há uma conferência em andamento</p><p className="mt-1 text-sm text-muted-foreground">Equipe: {dados.equipes.find((item) => item.id === inventarioAberto.item.equipe_id)?.nome ?? "—"} · Sistema: {num(inventarioAberto.item.quantidade_sistema)} · Contagem: {inventarioAberto.item.quantidade_contada == null ? "pendente" : num(inventarioAberto.item.quantidade_contada)}</p></div></div><Button asChild variant="outline" className="mt-3 w-full"><Link to="/app/inventario">Continuar inventário<ArrowRight className="ml-2 size-3.5" /></Link></Button></div>}{inventariosProduto.length ? <div className="space-y-2">{inventariosProduto.slice(0, 6).map(({ item, inventario }) => { const equipe = dados.equipes.find((entry) => entry.id === item.equipe_id); const diferenca = item.quantidade_contada == null ? null : item.quantidade_contada - item.quantidade_sistema; return <div key={`${inventario.id}:${item.id}`} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2">{inventario.status === "CONCLUIDO" ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 size-3" />Concluído</Badge> : inventario.status === "ABERTO" ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Aberto</Badge> : <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700"><XCircle className="mr-1 size-3" />Cancelado</Badge>}<span className="text-xs text-muted-foreground">{equipe?.nome ?? "—"}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatarData(inventario.data_encerramento ?? inventario.data_abertura)}</p></div><div className="text-right text-xs"><p className="text-muted-foreground">Sistema</p><p className="num font-semibold">{num(item.quantidade_sistema)}</p></div></div><div className="mt-2 flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">Contagem: {item.quantidade_contada == null ? "pendente" : num(item.quantidade_contada)}</span><span className={diferenca == null ? "text-muted-foreground" : Math.abs(diferenca) > Number.EPSILON ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>{diferenca == null ? "Sem diferença calculada" : `Diferença ${diferenca > 0 ? "+" : ""}${num(diferenca)}`}</span></div></div>; })}</div> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhum registro de inventário para este produto.</div>}{inventariosProduto.length > 6 && <p className="text-xs text-muted-foreground">Exibindo os 6 inventários mais recentes relacionados ao produto.</p>}<Button asChild variant="outline" className="w-full"><Link to="/app/inventario">Abrir inventário</Link></Button></CardContent>
            </Card>
          </section>

          {configuracao?.modulos.documentos && configuracao.documentos.habilitado && <section><Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><FileText className="size-5" />Documentos relacionados</CardTitle><p className="text-sm text-muted-foreground">Metadados dos documentos que possuem itens deste produto.</p></div><Badge variant="outline">{documentoDados?.documentos.length ?? 0}</Badge></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Documento</TableHead><TableHead>Status</TableHead><TableHead>Data</TableHead><TableHead>Qtd.</TableHead><TableHead className="text-right">Vlr. unitário</TableHead><TableHead>Empresa</TableHead></TableRow></TableHeader><TableBody>{documentoDados?.documentos.length ? documentoDados.documentos.slice(0, 10).map((doc) => { const item = documentoDados.itens.find((entry) => entry.documento_id === doc.id); const empresa = dados.empresas.find((entry) => entry.id === doc.empresa_id); return <TableRow key={doc.id}><TableCell className="font-medium">{doc.tipo} {doc.numero}{doc.serie ? ` / ${doc.serie}` : ""}</TableCell><TableCell><Badge variant="outline">{doc.status}</Badge></TableCell><TableCell>{doc.data_entrada ?? doc.data_emissao ?? "—"}</TableCell><TableCell className="num">{item ? num(item.quantidade) : "—"}</TableCell><TableCell className="num text-right">{item?.valor_unitario == null ? "—" : `R$ ${item.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</TableCell><TableCell>{empresa?.nome ?? "—"}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhum documento relacionado foi encontrado.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></section>}

          <section className="rounded-2xl border bg-muted/20 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 text-sidebar-primary" /><div><p className="font-semibold">Como este perfil decide o que mostrar</p><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Os sinais usam o mesmo núcleo de consumo, estoque e inteligência do restante do sistema. A tela não inventa um novo critério para cada bloco: ela consolida evidências existentes e indica o próximo caminho operacional.</p></div></div><Button asChild variant="ghost"><Link to="/app/vigia">Abrir Vigia<ArrowRight className="ml-2 size-4" /></Link></Button></div>
          </section>
        </>
      )}
    </div>
  );
}
