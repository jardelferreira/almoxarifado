import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  History,
  Plus,
  Printer,
  Search,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/common/Combobox";
import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { inventarioRepo } from "@/services/inventario-repo";
import { inventarioService, type InferenciaInventario } from "@/services/inventario-service";
import type { Inventario, InventarioItem } from "@/types";

export const Route = createFileRoute("/app/inventario")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inventário — Almoxarifado" },
      { name: "description", content: "Contagem física e ajuste auditável do estoque." },
    ],
  }),
  component: InventarioPage,
});

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(n);
const dataFmt = (v?: string | null) => (v ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");

function imprimirInventario(
  inventario: Inventario,
  itens: InventarioItem[],
  produtoMap: ReadonlyMap<string, { nome: string; codigo?: string | null | undefined; unidade_id?: string | null | undefined }>,
  equipeMap: ReadonlyMap<string, string>,
  unidadeMap: ReadonlyMap<string, { sigla?: string | null | undefined }>,
  modo: "ABERTO" | "CONCLUIDO",
) {
  const janela = window.open("", "_blank", "width=1100,height=800");
  if (!janela) return;

  const escopo = inventario.equipe_id ? (equipeMap.get(inventario.equipe_id) ?? "Equipe") : "Projeto completo";
  const linhas = itens.map((item) => {
    const produto = produtoMap.get(item.produto_id);
    const unidade = produto?.unidade_id ? (unidadeMap.get(produto.unidade_id)?.sigla ?? "") : "";
    const contado = item.quantidade_contada == null ? "" : fmt(item.quantidade_contada);
    const sistema = fmt(item.quantidade_sistema);
    const diferenca = modo === "CONCLUIDO" && item.quantidade_contada != null ? fmt(item.quantidade_contada - item.quantidade_sistema) : "";
    return `<tr><td>${produto?.codigo ?? ""}</td><td>${produto?.nome ?? "Produto"}</td><td>${equipeMap.get(item.equipe_id) ?? "—"}</td><td>${unidade}</td><td class="num">${sistema}</td><td class="num">${contado}</td><td class="num">${diferenca}</td><td></td></tr>`;
  }).join("");

  janela.document.write(`<!doctype html><html><head><title>Inventário</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#111}h1{font-size:22px;margin:0 0 6px}p{margin:4px 0;color:#444}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.box{border:1px solid #ddd;border-radius:8px;padding:10px}.label{font-size:11px;color:#666}.value{font-weight:600;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:11px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f3f3f3}.num{text-align:right}.assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:55px}.assinatura{border-top:1px solid #111;padding-top:6px;text-align:center;font-size:11px}@media print{body{margin:12mm}.no-print{display:none}}</style></head><body><h1>Inventário de Estoque</h1><p><strong>${escopo}</strong> · ${inventario.status === "CONCLUIDO" ? "Concluído" : "Aberto — formulário para conferência física"}</p><div class="meta"><div class="box"><div class="label">Abertura</div><div class="value">${dataFmt(inventario.data_abertura)}</div></div><div class="box"><div class="label">Encerramento</div><div class="value">${dataFmt(inventario.data_encerramento)}</div></div><div class="box"><div class="label">Responsável</div><div class="value">${escopo}</div></div><div class="box"><div class="label">Observação</div><div class="value">${inventario.observacao ?? "—"}</div></div></div><table><thead><tr><th>Código</th><th>Produto</th><th>Equipe</th><th>Un.</th><th>Sistema</th><th>Contagem</th><th>Diferença</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table><div class="assinaturas"><div class="assinatura">Responsável pela conferência</div><div class="assinatura">Responsável pelo almoxarifado</div></div></body></html>`);
  janela.document.close();
  janela.focus();
  janela.print();
}

function statusBadge(status: Inventario["status"]) {
  if (status === "ABERTO") return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Aberto</Badge>;
  if (status === "CONCLUIDO") return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 size-3.5" />Concluído</Badge>;
  return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700"><XCircle className="mr-1 size-3.5" />Cancelado</Badge>;
}

export function InventarioPage() {
  const [projetoId] = useProjetoAtivoId();
  const db = getDB();
  const dados = useLiveQuery(async () => {
    if (!projetoId) return null;
    const [inventarios, equipes, funcionarios, produtos, unidades, movimentacoes] = await Promise.all([
      inventarioRepo.listar(projetoId),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
      db.produtos.where("projeto_id").equals(projetoId).toArray(),
      db.unidades.toArray(),
      db.movimentacoes.where("projeto_id").equals(projetoId).toArray(),
    ]);
    return { inventarios, equipes, funcionarios, produtos, unidades, movimentacoes };
  }, [projetoId]);
  const config = useLiveQuery(() => (projetoId ? configuracoesRepo.obter(projetoId) : undefined), [projetoId]);

  const [busca, setBusca] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [responsavelId, setResponsavelId] = useState<string | null>(null);
  const [estoqueIds, setEstoqueIds] = useState<string[]>([]);
  const [produtoBusca, setProdutoBusca] = useState("");
  const [observacao, setObservacao] = useState("");
  const [selecionado, setSelecionado] = useState<Inventario | null>(null);
  const [itens, setItens] = useState<InventarioItem[]>([]);
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [revisaoAberta, setRevisaoAberta] = useState(false);
  const [inferenciaAberta, setInferenciaAberta] = useState(false);
  const [inferencia, setInferencia] = useState<InferenciaInventario[]>([]);
  const [carregandoInferencia, setCarregandoInferencia] = useState(false);

  const equipeMap = useMemo(() => new Map((dados?.equipes ?? []).map((e) => [e.id, e.nome])), [dados?.equipes]);
  const funcionarioMap = useMemo(() => new Map((dados?.funcionarios ?? []).map((f) => [f.id, f.nome])), [dados?.funcionarios]);
  const produtoMap = useMemo(() => new Map((dados?.produtos ?? []).map((p) => [p.id, p])), [dados?.produtos]);
  const unidadeMap = useMemo(() => new Map((dados?.unidades ?? []).map((u) => [u.id, u])), [dados?.unidades]);

  const estoquesDisponiveis = useMemo(() => {
    if (!dados) return [];
    const mapa = new Map<string, { produtoId: string; equipeId: string; saldo: number }>();
    for (const movimento of dados.movimentacoes) {
      const chave = `${movimento.produto_id}:${movimento.equipe_id}`;
      const atual = mapa.get(chave);
      const efeito = movimento.tipo === "ENTRADA" || movimento.tipo === "DEVOLUCAO"
        ? movimento.quantidade
        : movimento.tipo === "SAIDA"
          ? -movimento.quantidade
          : (movimento.sinal ?? 1) * movimento.quantidade;
      mapa.set(chave, {
        produtoId: movimento.produto_id,
        equipeId: movimento.equipe_id,
        saldo: (atual?.saldo ?? 0) + efeito,
      });
    }
    return [...mapa.values()]
      .filter((item) => dados.produtos.some((p) => p.id === item.produtoId && p.ativo))
      .filter((item) => dados.equipes.some((e) => e.id === item.equipeId && e.ativo))
      .filter((item) => !equipeId || item.equipeId === equipeId)
      .sort((a, b) => {
        const pa = dados.produtos.find((p) => p.id === a.produtoId)?.nome ?? "";
        const pb = dados.produtos.find((p) => p.id === b.produtoId)?.nome ?? "";
        return pa.localeCompare(pb) || (equipeMap.get(a.equipeId) ?? "").localeCompare(equipeMap.get(b.equipeId) ?? "");
      });
  }, [dados, equipeId, equipeMap]);

  const estoquesFiltradosNovo = useMemo(() => {
    const termo = produtoBusca.trim().toLowerCase();
    if (!termo) return estoquesDisponiveis;
    return estoquesDisponiveis.filter((item) => {
      const produto = produtoMap.get(item.produtoId);
      const equipe = equipeMap.get(item.equipeId) ?? "";
      return `${produto?.nome ?? ""} ${produto?.codigo ?? ""} ${equipe}`.toLowerCase().includes(termo);
    });
  }, [produtoBusca, estoquesDisponiveis, produtoMap, equipeMap]);

  const abrirNovo = () => {
    setEquipeId(null);
    setResponsavelId(null);
    setProdutoBusca("");
    setObservacao("");
    if (dados) {
      const ids = dados.movimentacoes
        .map((m) => `${m.produto_id}:${m.equipe_id}`)
        .filter((key, index, arr) => arr.indexOf(key) === index)
        .filter((key) => {
          const [produtoId, equipeIdDoEstoque] = key.split(":");
          return dados.produtos.some((p) => p.id === produtoId && p.ativo)
            && dados.equipes.some((e) => e.id === equipeIdDoEstoque && e.ativo);
        });
      setEstoqueIds(ids);
    } else {
      setEstoqueIds([]);
    }
    setNovoAberto(true);
  };

  const trocarEquipeInventario = (novaEquipeId: string | null) => {
    setEquipeId(novaEquipeId);
    setProdutoBusca("");
    if (!dados) {
      setEstoqueIds([]);
      return;
    }
    const ids = dados.movimentacoes
      .map((m) => `${m.produto_id}:${m.equipe_id}`)
      .filter((key, index, arr) => arr.indexOf(key) === index)
      .filter((key) => {
        const [produtoId, equipeIdDoEstoque] = key.split(":");
        if (!produtoId || !equipeIdDoEstoque) return false;
        return dados.produtos.some((p) => p.id === produtoId && p.ativo)
          && dados.equipes.some((e) => e.id === equipeIdDoEstoque && e.ativo)
          && (!novaEquipeId || equipeIdDoEstoque === novaEquipeId);
      });
    setEstoqueIds(ids);
  };

  const carregarDetalhe = async (inventario: Inventario) => {
    setSelecionado(inventario);
    const registros = await inventarioRepo.itens(inventario.id);
    setItens(registros);
    setContagens(Object.fromEntries(registros.filter((i) => i.quantidade_contada != null).map((i) => [i.id, String(i.quantidade_contada)])));
  };

  const criar = async (): Promise<void> => {
    if (!projetoId) return;
    if (!estoqueIds.length) {
      toast.error("Selecione pelo menos um item de estoque.");
      return;
    }
    try {
      setSalvando(true);
      const inventario = await inventarioRepo.abrir({
        projetoId,
        equipeId,
        estoques: estoqueIds.flatMap((key) => {
          const [produtoId, equipeIdDoEstoque] = key.split(":");
          if (!produtoId || !equipeIdDoEstoque) return [];
          return [{ produtoId, equipeId: equipeIdDoEstoque }];
        }),
        responsavelId,
        observacao,
      });
      setNovoAberto(false);
      toast.success("Inventário aberto.");
      await carregarDetalhe(inventario);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o inventário.");
    } finally { setSalvando(false); }
  };

  const salvarContagem = async (item: InventarioItem): Promise<void> => {
    const valor = Number((contagens[item.id] ?? "").replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error("Informe uma contagem válida.");
      return;
    }
    try {
      await inventarioRepo.registrarContagem(item.inventario_id, item.id, valor);
      setItens((atual) => atual.map((i) => i.id === item.id ? { ...i, quantidade_contada: valor } : i));
      toast.success("Contagem registrada.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar a contagem."); }
  };

  const solicitarEncerramento = () => {
    if (!selecionado || selecionado.status !== "ABERTO") return;
    setRevisaoAberta(true);
  };

  const encerrar = async () => {
    if (!selecionado) return;
    try {
      setSalvando(true);
      const resultado = await inventarioService.encerrar(selecionado.id);
      setRevisaoAberta(false);
      setSelecionado(null);
      setItens([]);
      setContagens({});
      toast.success(resultado.ajustesGerados ? `${resultado.ajustesGerados} ajuste(s) gerado(s). Inventário encerrado.` : "Inventário encerrado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível encerrar o inventário.");
    } finally {
      setSalvando(false);
    }
  };

  const abrirInferencia = async () => {
    if (!selecionado || selecionado.status !== "CONCLUIDO") return;
    try {
      setCarregandoInferencia(true);
      const resultado = await inventarioService.obterInferencia(selecionado.id);
      setInferencia(resultado.itens);
      setInferenciaAberta(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível calcular a inferência do estoque.");
    } finally {
      setCarregandoInferencia(false);
    }
  };

  const aplicarInferencia = async () => {
    if (!selecionado) return;
    try {
      setSalvando(true);
      const resultado = await inventarioService.aplicarAjustes(selecionado.id);
      setInferenciaAberta(false);
      if (resultado.jaAplicado) {
        toast.info("Este inventário já foi aplicado ao estoque.");
      } else {
        toast.success(resultado.ajustesGerados ? `${resultado.ajustesGerados} ajuste(s) de estoque realizado(s).` : "O estoque já estava de acordo com a contagem.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível aplicar a inferência ao estoque.");
    } finally {
      setSalvando(false);
    }
  };

  const cancelar = async () => {
    if (!selecionado || !confirm("Cancelar este inventário? Nenhum ajuste será gerado.")) return;
    try {
      await inventarioRepo.cancelar(selecionado.id);
      const atualizado = await inventarioRepo.obter(selecionado.id);
      if (atualizado) await carregarDetalhe(atualizado);
      toast.success("Inventário cancelado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível cancelar o inventário."); }
  };

  const movimentosAjusteInventario = useMemo(() => {
    if (!selecionado || !dados) return [];
    const marcador = `Ajuste gerado pelo inventário ${selecionado.id}.`;
    return dados.movimentacoes
      .filter((movimento) => movimento.tipo === "AJUSTE" && movimento.observacao === marcador)
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [dados, selecionado]);

  if (!projetoId) return <p className="text-sm text-muted-foreground">Selecione um projeto para utilizar o inventário.</p>;
  if (!config || !dados) return <p className="text-sm text-muted-foreground">Carregando inventário…</p>;
  if (!config.inventario.habilitado) return <Card><CardContent className="p-8 text-center"><ClipboardList className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-medium">Inventário desabilitado</p><p className="mt-1 text-sm text-muted-foreground">Habilite o inventário nas Configurações do projeto.</p></CardContent></Card>;

  const filtrados = dados.inventarios.filter((i) => {
    const alvo = `${equipeMap.get(i.equipe_id ?? "") ?? ""} ${funcionarioMap.get(i.responsavel_id ?? "") ?? ""} ${i.observacao ?? ""}`.toLowerCase();
    return alvo.includes(busca.toLowerCase());
  });
  const contados = itens.filter((i) => i.quantidade_contada != null).length;
  const diferencas = itens.filter((i) => i.quantidade_contada != null && Math.abs((i.quantidade_contada ?? 0) - i.quantidade_sistema) > Number.EPSILON).length;
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2"><ClipboardCheck className="size-7 text-primary" /><h1 className="font-display text-3xl font-bold uppercase">Inventário</h1></div><p className="mt-1 text-sm text-muted-foreground">Contagem física do estoque com ajuste auditável.</p></div>
        <Button onClick={abrirNovo}><Plus className="mr-2 size-4" />Novo inventário</Button>
      </header>

      <Card className="rounded-2xl"><CardHeader><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Equipe, responsável ou observação…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></CardHeader></Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtrados.map((inventario) => <Card key={inventario.id} className="cursor-pointer rounded-2xl transition hover:border-primary/40" onClick={() => void carregarDetalhe(inventario)}><CardContent className="space-y-4 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{equipeMap.get(inventario.equipe_id ?? "") ?? "Inventário geral"}</p><p className="text-xs text-muted-foreground">Aberto em {dataFmt(inventario.data_abertura)}</p></div>{statusBadge(inventario.status)}</div><div className="text-sm"><p className="text-muted-foreground">Responsável</p><p>{funcionarioMap.get(inventario.responsavel_id ?? "") ?? "Não informado"}</p></div>{inventario.observacao ? <p className="line-clamp-2 text-sm text-muted-foreground">{inventario.observacao}</p> : null}</CardContent></Card>)}
      </div>
      {filtrados.length === 0 && <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Nenhum inventário encontrado.</CardContent></Card>}

      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-6">
            <DialogTitle>Abrir inventário</DialogTitle>
            <p className="text-sm text-muted-foreground">A equipe é opcional. Sem equipe, o inventário considera o estoque completo do projeto; com equipe, considera somente o estoque daquela equipe.</p>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Equipe do estoque <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Combobox
                  value={equipeId}
                  onChange={trocarEquipeInventario}
                  placeholder="Todas as equipes — inventário geral"
                  opcoes={dados.equipes.filter((e) => e.ativo).map((e) => ({ value: e.id, label: e.nome }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável{config.inventario.exigir_responsavel ? " *" : ""}</Label>
                <Combobox
                  value={responsavelId}
                  onChange={setResponsavelId}
                  placeholder="Opcional"
                  opcoes={dados.funcionarios.filter((f) => f.status === "ATIVO").map((f) => ({ value: f.id, label: f.nome }))}
                />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Label>Produtos a contar</Label>
                  <p className="text-xs text-muted-foreground">
                    O saldo será congelado no momento da abertura. {!equipeId ? "Sem equipe, todos os produtos com estoque no projeto são incluídos no inventário geral." : config.inventario.permitir_inventario_parcial ? "Você pode selecionar apenas os produtos que serão contados." : "A configuração exige a contagem de todos os produtos da equipe."}
                  </p>
                </div>
                <div className="w-full sm:w-72">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Pesquisar produto…" value={produtoBusca} onChange={(e) => setProdutoBusca(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2 text-xs">
                <span>{estoquesFiltradosNovo.length} produto(s) exibido(s)</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEstoqueIds((ids) => [...new Set([...ids, ...estoquesFiltradosNovo.map((item) => `${item.produtoId}:${item.equipeId}`)])])}
                    disabled={!estoquesFiltradosNovo.length || !config.inventario.permitir_inventario_parcial}
                  >
                    Selecionar exibidos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEstoqueIds([])}
                    disabled={!estoqueIds.length || !config.inventario.permitir_inventario_parcial || !equipeId}
                  >
                    Limpar
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border">
                <div className="max-h-[46vh] overflow-y-auto">
                  {estoquesFiltradosNovo.map((item) => {
                    const produto = produtoMap.get(item.produtoId);
                    if (!produto) return null;
                    const chave = `${item.produtoId}:${item.equipeId}`;
                    const marcado = estoqueIds.includes(chave);
                    const unidade = produto.unidade_id ? unidadeMap.get(produto.unidade_id) : undefined;
                    return (
                      <label key={chave} className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-0 hover:bg-muted/30">
                        <Checkbox
                          checked={marcado}
                          disabled={!config.inventario.permitir_inventario_parcial || !equipeId}
                          onCheckedChange={(checked) => setEstoqueIds((ids) => checked ? [...new Set([...ids, chave])] : ids.filter((id) => id !== chave))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{produto.nome}</span>
                          <span className="text-xs text-muted-foreground">{produto.codigo ?? "Sem código"} · {equipeMap.get(item.equipeId) ?? "Equipe"}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="num block text-sm font-medium">{fmt(item.saldo)} {unidade?.sigla ?? ""}</span>
                          <span className="text-[11px] text-muted-foreground">estoque atual</span>
                        </span>
                      </label>
                    );
                  })}
                  {!estoquesFiltradosNovo.length && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {equipeId ? "Nenhum estoque encontrado para esta equipe." : "Nenhum estoque encontrado no projeto."}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-1.5">
              <Label>Observação</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observações do inventário…" />
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-5 py-3 backdrop-blur sm:px-6">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
                  {estoqueIds.length} item(ns) selecionado(s)
                </div>
                {(!config.inventario.permitir_inventario_parcial || !equipeId) && estoquesDisponiveis.length > 0 ? (
                  <span className="hidden text-xs text-muted-foreground sm:inline">Inventário completo do projeto</span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setNovoAberto(false)}>Cancelar</Button>
                <Button onClick={() => void criar()} disabled={salvando || !estoqueIds.length}>
                  {salvando ? "Abrindo…" : "Abrir inventário"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selecionado} onOpenChange={(open) => !open && setSelecionado(null)}>
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-6">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Inventário · {equipeMap.get(selecionado?.equipe_id ?? "") ?? "Inventário geral"}
              {selecionado ? statusBadge(selecionado.status) : null}
            </DialogTitle>
          </DialogHeader>

          {selecionado && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="space-y-5">
                  <div className="grid gap-3 rounded-2xl border bg-muted/10 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Abertura</p><p className="mt-1 text-sm font-medium">{dataFmt(selecionado.data_abertura)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Encerramento</p><p className="mt-1 text-sm font-medium">{dataFmt(selecionado.data_encerramento)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Responsável</p><p className="mt-1 text-sm font-medium">{funcionarioMap.get(selecionado.responsavel_id ?? "") ?? "Não informado"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Escopo</p><p className="mt-1 text-sm font-medium">{selecionado.equipe_id ? (equipeMap.get(selecionado.equipe_id) ?? "Equipe") : "Projeto completo"}</p></div>
                    {selecionado.observacao ? <div className="sm:col-span-2 lg:col-span-4"><p className="text-xs text-muted-foreground">Observação</p><p className="mt-1 whitespace-pre-wrap text-sm">{selecionado.observacao}</p></div> : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Posições</p><p className="mt-1 text-2xl font-bold">{itens.length}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Contadas</p><p className="mt-1 text-2xl font-bold">{contados}</p><p className="mt-1 text-xs text-muted-foreground">{itens.length ? Math.round((contados / itens.length) * 100) : 0}% concluído</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sem diferença</p><p className="mt-1 text-2xl font-bold">{Math.max(0, contados - diferencas)}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Com diferença</p><p className="mt-1 text-2xl font-bold">{diferencas}</p></CardContent></Card>
                  </div>

                  <div className="overflow-hidden rounded-xl border">
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr className="border-b">
                            <th className="px-4 py-3 text-left">Produto</th>
                            <th className="px-4 py-3 text-left">Equipe</th>
                            <th className="px-4 py-3 text-right">Sistema</th>
                            <th className="px-4 py-3 text-left">Un.</th>
                            <th className="px-4 py-3 text-right">Contagem</th>
                            <th className="px-4 py-3 text-right">Diferença</th>
                            <th className="px-4 py-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map((item) => {
                            const produto = produtoMap.get(item.produto_id);
                            const diff = item.quantidade_contada == null ? null : item.quantidade_contada - item.quantidade_sistema;
                            return (
                              <tr key={item.id} className="border-b last:border-0">
                                <td className="px-4 py-3"><p className="font-medium">{produto?.nome ?? "Produto"}</p><p className="text-xs text-muted-foreground">{produto?.codigo ?? "Sem código"}</p></td>
                                <td className="px-4 py-3">{equipeMap.get(item.equipe_id) ?? "—"}</td>
                                <td className="num px-4 py-3 text-right">{fmt(item.quantidade_sistema)}</td>
                                <td className="px-4 py-3 text-left">{unidadeMap.get(produto?.unidade_id ?? "")?.sigla ?? "—"}</td>
                                <td className="px-4 py-3 text-right">
                                  {selecionado.status === "ABERTO" ? <Input className="ml-auto w-32 text-right" type="number" min="0" step="any" value={contagens[item.id] ?? ""} onChange={(e) => setContagens({ ...contagens, [item.id]: e.target.value })} /> : <span>{item.quantidade_contada == null ? "—" : fmt(item.quantidade_contada)}</span>}
                                </td>
                                <td className="num px-4 py-3 text-right font-semibold">{diff == null ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}</td>
                                <td className="px-4 py-3 text-right">{selecionado.status === "ABERTO" ? <Button size="sm" variant="outline" onClick={() => void salvarContagem(item)}>Salvar</Button> : null}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="divide-y md:hidden">
                      {itens.map((item) => {
                        const produto = produtoMap.get(item.produto_id);
                        const diff = item.quantidade_contada == null ? null : item.quantidade_contada - item.quantidade_sistema;
                        return (
                          <div key={item.id} className="space-y-3 p-4">
                            <div>
                              <p className="font-medium">{produto?.nome ?? "Produto"}</p>
                              <p className="text-xs text-muted-foreground">Equipe: {equipeMap.get(item.equipe_id) ?? "—"} · Sistema: {fmt(item.quantidade_sistema)} {unidadeMap.get(produto?.unidade_id ?? "")?.sigla ?? ""}</p>
                            </div>
                            {selecionado.status === "ABERTO" ? (
                              <>
                                <Input type="number" min="0" step="any" value={contagens[item.id] ?? ""} onChange={(e) => setContagens({ ...contagens, [item.id]: e.target.value })} placeholder="Quantidade contada" />
                                <Button className="w-full" variant="outline" onClick={() => void salvarContagem(item)}>Salvar contagem</Button>
                              </>
                            ) : <p className="text-sm">Contado: {item.quantidade_contada == null ? "—" : fmt(item.quantidade_contada)}</p>}
                            <p className="text-sm font-semibold">Diferença: {diff == null ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selecionado.status !== "ABERTO" ? (
                    <div className="rounded-2xl border">
                      <div className="flex items-center gap-2 border-b px-4 py-3">
                        <History className="size-4 text-muted-foreground" />
                        <div><p className="font-semibold">Histórico do inventário</p><p className="text-xs text-muted-foreground">Registros gerados a partir do encerramento deste inventário.</p></div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-between rounded-xl bg-muted/20 px-3 py-3 text-sm">
                          <span>Ajustes de estoque gerados</span>
                          <Badge variant="secondary">{movimentosAjusteInventario.length}</Badge>
                        </div>
                        {movimentosAjusteInventario.length > 0 ? (
                          <div className="mt-3 divide-y rounded-xl border">
                            {movimentosAjusteInventario.map((movimento) => {
                              const produto = produtoMap.get(movimento.produto_id);
                              const equipe = equipeMap.get(movimento.equipe_id) ?? "Equipe";
                              const entrada = (movimento.sinal ?? 1) > 0;
                              return (
                                <div key={movimento.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">{produto?.nome ?? "Produto"}</p>
                                    <p className="text-xs text-muted-foreground">{equipe} · {dataFmt(movimento.data)}</p>
                                  </div>
                                  <span className="shrink-0 font-semibold">{entrada ? "+" : "−"}{fmt(movimento.quantidade)} {unidadeMap.get(produto?.unidade_id ?? "")?.sigla ?? ""}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-muted-foreground">Nenhum ajuste de estoque foi gerado no encerramento.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-5 py-3 backdrop-blur sm:px-6">
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {selecionado.status === "ABERTO" ? (
                      <Button variant="outline" onClick={() => void cancelar()}>
                        <XCircle className="mr-2 size-4" />
                        Cancelar inventário
                      </Button>
                    ) : null}
                    <Button variant="outline" onClick={() => imprimirInventario(selecionado, itens, produtoMap, equipeMap, unidadeMap, selecionado.status === "ABERTO" ? "ABERTO" : "CONCLUIDO")}>
                      <Printer className="mr-2 size-4" />
                      {selecionado.status === "ABERTO" ? "Imprimir formulário" : "Imprimir inventário"}
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {selecionado.status === "CONCLUIDO" ? (
                      <Button onClick={() => void abrirInferencia()} disabled={carregandoInferencia || salvando}>
                        <ClipboardCheck className="mr-2 size-4" />
                        {carregandoInferencia ? "Calculando estoque…" : "Inferir estoque a partir do inventário"}
                      </Button>
                    ) : null}
                    {selecionado.status === "ABERTO" ? (
                      <Button onClick={solicitarEncerramento} disabled={salvando}>
                        <CheckCircle2 className="mr-2 size-4" />
                        {salvando ? "Encerrando…" : "Encerrar inventário"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={inferenciaAberta} onOpenChange={setInferenciaAberta}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Inferir estoque a partir do inventário</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Esta operação vai comparar o estoque atual com a contagem física.</p>
              <p className="mt-1">O sistema não usa apenas o saldo registrado na abertura do inventário. Ele consulta as movimentações atuais, calcula o saldo de cada posição e mostra abaixo exatamente o ajuste que será lançado para que o estoque passe a refletir a quantidade contada.</p>
            </div>

            {itens.some((item) => item.quantidade_contada == null) ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">Existem posições sem contagem.</p>
                <p className="mt-1">{itens.filter((item) => item.quantidade_contada == null).length} posição(ões) não será(ão) alterada(s) pela inferência.</p>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left">Produto</th>
                      <th className="px-4 py-3 text-left">Equipe</th>
                      <th className="px-4 py-3 text-right">Estoque atual</th>
                      <th className="px-4 py-3 text-right">Contagem</th>
                      <th className="px-4 py-3 text-center">Movimentação</th>
                      <th className="px-4 py-3 text-right">Estoque após</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inferencia.map((item) => {
                      const produto = produtoMap.get(item.produtoId);
                      const unidade = unidadeMap.get(produto?.unidade_id ?? "")?.sigla ?? "";
                      const semAlteracao = Math.abs(item.diferenca) <= Number.EPSILON;
                      return (
                        <tr key={item.itemId} className="border-b last:border-0">
                          <td className="px-4 py-3"><p className="font-medium">{produto?.nome ?? "Produto"}</p><p className="text-xs text-muted-foreground">{produto?.codigo ?? "Sem código"}</p></td>
                          <td className="px-4 py-3">{equipeMap.get(item.equipeId) ?? "—"}</td>
                          <td className="px-4 py-3 text-right">{fmt(item.quantidadeAtual)} {unidade}</td>
                          <td className="px-4 py-3 text-right font-medium">{fmt(item.quantidadeContada)} {unidade}</td>
                          <td className="px-4 py-3 text-center">{semAlteracao ? <Badge variant="secondary">Sem alteração</Badge> : <span className="inline-flex items-center gap-1 font-semibold"><span>{item.diferenca > 0 ? "+" : "−"}{fmt(Math.abs(item.diferenca))} {unidade}</span><ArrowRight className="size-4" /></span>}</td>
                          <td className="px-4 py-3 text-right font-semibold">{fmt(item.quantidadeApos)} {unidade}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y md:hidden">
                {inferencia.map((item) => {
                  const produto = produtoMap.get(item.produtoId);
                  const unidade = unidadeMap.get(produto?.unidade_id ?? "")?.sigla ?? "";
                  const semAlteracao = Math.abs(item.diferenca) <= Number.EPSILON;
                  return (
                    <div key={item.itemId} className="space-y-3 p-4">
                      <div><p className="font-medium">{produto?.nome ?? "Produto"}</p><p className="text-xs text-muted-foreground">{equipeMap.get(item.equipeId) ?? "—"} · {produto?.codigo ?? "Sem código"}</p></div>
                      <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Estoque atual</p><p className="font-medium">{fmt(item.quantidadeAtual)} {unidade}</p></div><div><p className="text-xs text-muted-foreground">Contagem</p><p className="font-medium">{fmt(item.quantidadeContada)} {unidade}</p></div><div><p className="text-xs text-muted-foreground">Movimentação</p><p className="font-semibold">{semAlteracao ? "Sem alteração" : `${item.diferenca > 0 ? "+" : "−"}${fmt(Math.abs(item.diferenca))} ${unidade}`}</p></div><div><p className="text-xs text-muted-foreground">Estoque após</p><p className="font-semibold">{fmt(item.quantidadeApos)} {unidade}</p></div></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4 text-sm">
              <p className="font-semibold">Confirmação</p>
              <p className="mt-1 text-muted-foreground">Serão geradas {inferencia.filter((item) => Math.abs(item.diferenca) > Number.EPSILON).length} movimentação(ões) de ajuste. Depois da operação, cada posição ajustada terá como saldo o valor da contagem física informada.</p>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => setInferenciaAberta(false)}>Cancelar</Button>
              <Button onClick={() => void aplicarInferencia()} disabled={salvando || inferencia.some((item) => !Number.isFinite(item.quantidadeContada))}>
                <CheckCircle2 className="mr-2 size-4" />
                {salvando ? "Aplicando ajustes…" : "Confirmar e atualizar estoque"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={revisaoAberta} onOpenChange={setRevisaoAberta}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisar inventário antes de encerrar</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{selecionado?.equipe_id ? (equipeMap.get(selecionado.equipe_id) ?? "Equipe") : "Inventário geral"}</p>
                {selecionado ? statusBadge(selecionado.status) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Aberto em {dataFmt(selecionado?.data_abertura)} · {funcionarioMap.get(selecionado?.responsavel_id ?? "") ?? "Responsável não informado"}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Posições</p><p className="mt-1 text-xl font-bold">{itens.length}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Contadas</p><p className="mt-1 text-xl font-bold">{contados} / {itens.length}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Sem diferença</p><p className="mt-1 text-xl font-bold">{Math.max(0, contados - diferencas)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Divergências</p><p className="mt-1 text-xl font-bold">{diferencas}</p></div>
            </div>

            {itens.some((item) => item.quantidade_contada == null) ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">Ainda existem posições sem contagem.</p>
                <p className="mt-1">{itens.filter((item) => item.quantidade_contada == null).length} posição(ões) ainda não foi(ram) contada(s). {config.inventario.permitir_inventario_parcial ? "O fechamento parcial está permitido pela configuração." : "O inventário completo está configurado como obrigatório e o encerramento será bloqueado."}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <p className="font-semibold">Todas as posições foram contadas.</p>
                <p className="mt-1">O inventário está pronto para ser encerrado.</p>
              </div>
            )}

            {diferencas > 0 ? (
              <div className="rounded-xl border p-4">
                <p className="font-semibold">Divergências que serão tratadas</p>
                <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                  {itens.filter((item) => item.quantidade_contada != null && Math.abs((item.quantidade_contada ?? 0) - item.quantidade_sistema) > Number.EPSILON).map((item) => {
                    const produto = produtoMap.get(item.produto_id);
                    const diff = (item.quantidade_contada ?? 0) - item.quantidade_sistema;
                    return <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-medium">{produto?.nome ?? "Produto"}</p><p className="text-xs text-muted-foreground">{equipeMap.get(item.equipe_id) ?? "Equipe"} · Sistema {fmt(item.quantidade_sistema)} · Contado {fmt(item.quantidade_contada ?? 0)}</p></div><span className="shrink-0 font-semibold">{diff > 0 ? "+" : ""}{fmt(diff)}</span></div>;
                  })}
                </div>
                {config.inventario.ajustar_automaticamente ? <p className="mt-3 text-sm text-muted-foreground">O fechamento gerará {diferencas} ajuste(s) de estoque, mantendo a equipe de cada posição inventariada.</p> : <p className="mt-3 text-sm text-muted-foreground">O ajuste automático está desabilitado. As divergências não alterarão o estoque ao encerrar.</p>}
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => setRevisaoAberta(false)}>Voltar para a contagem</Button>
              <Button onClick={() => void encerrar()} disabled={salvando}>
                <CheckCircle2 className="mr-2 size-4" />
                {salvando ? "Encerrando…" : "Confirmar encerramento"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>    </div>
  );
}
