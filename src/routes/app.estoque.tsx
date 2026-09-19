import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import * as XLSX from "xlsx";
import {
  ArrowRight,
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  MapPin,
  PackageSearch,
  Printer,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/common/Combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDB } from "@/db/db";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { historicoEstoque, montarEstoque } from "@/services/estoque";
import type { Movimentacao } from "@/types";
import { formatarData, num } from "@/utils/format";

type Busca = { produto?: string };
type FiltrosEstoque = {
  equipeId: string;
  categoriaId: string;
  unidadeId: string;
  status: "" | "OK" | "BAIXO";
  saldo: "" | "COM_ESTOQUE" | "ZERADO";
};

const TIPOS = ["ENTRADA", "SAIDA", "DEVOLUCAO", "AJUSTE", "TRANSFERENCIA"] as const;

export const Route = createFileRoute("/app/estoque")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): Busca =>
    typeof search["produto"] === "string" ? { produto: search["produto"] } : {},
  head: () => ({
    meta: [
      { title: "Estoque e Histórico por Produto — Almoxarifado" },
      {
        name: "description",
        content:
          "Consulte o estoque atual e o histórico completo, com filtros e exportação.",
      },
    ],
  }),
  component: EstoquePage,
});

function abrirImpressao(titulo: string, html: string) {
  const janela = window.open("", "_blank");
  if (!janela) return;

  janela.document.write(`<!doctype html><html lang="pt-BR"><head>
    <meta charset="utf-8"><title>${titulo}</title>
    <style>
      @page{size:landscape;margin:10mm}
      body{font-family:Arial,sans-serif;color:#111827;font-size:10px}
      h1{margin:0 0 4px;font-size:20px}.sub{color:#6b7280;margin-bottom:14px}
      .meta{display:flex;gap:24px;margin-bottom:12px}.meta b{display:block;font-size:8px;text-transform:uppercase;color:#6b7280}
      table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #d1d5db;padding:5px;text-align:left;vertical-align:top}
      th{background:#f3f4f6;font-size:8px;text-transform:uppercase}.right{text-align:right}
      .footer{margin-top:12px;color:#6b7280;font-size:8px}
    </style></head><body>${html}
    <div class="footer">Relatório gerado pelo ALMOXARIFADO em ${new Date().toLocaleString("pt-BR")}</div>
    </body></html>`);
  janela.document.close();
  janela.focus();
  window.setTimeout(() => janela.print(), 200);
}

function exportarExcel(itens: Array<any>) {
  const linhas = itens.map((i) => ({
    Produto: i.produto.nome,
    Código: i.produto.codigo ?? "",
    Equipe: i.equipe.nome,
    Categoria: i.categoria?.nome ?? "",
    Unidade: i.unidade?.sigla ?? "",
    Marca: i.produto.marca ?? "",
    Modelo: i.produto.modelo ?? "",
    Estoque: i.estoque,
    "Estoque mínimo": i.minimo,
    Status: i.baixo ? "BAIXO" : "OK",
  }));
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws["!cols"] = [
    { wch: 34 }, { wch: 16 }, { wch: 24 }, { wch: 22 }, { wch: 10 },
    { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Estoque");
  XLSX.writeFile(wb, `estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function EstoquePage() {
  const { produto: produtoParam } = Route.useSearch();
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [q, setQ] = useState("");
  const [detalhe, setDetalhe] = useState<string | null>(produtoParam ?? null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosEstoque>({
    equipeId: "", categoriaId: "", unidadeId: "", status: "", saldo: "",
  });
  const [historicoFiltros, setHistoricoFiltros] = useState({
    de: "", ate: "", tipo: "", funcionarioId: "", documentoId: "",
  });

  const documentos = useLiveQuery(
    async () => (projetoId ? getDB().documentos.where("projeto_id").equals(projetoId).toArray() : []),
    [projetoId],
  );

  const itens = useMemo(
    () => dados ? montarEstoque(
      dados.produtos, dados.movimentacoes, dados.unidades, dados.categorias, dados.equipes,
      equipeId ?? undefined,
    ) : [],
    [dados, equipeId],
  );

  const filtrados = useMemo(() => {
    const termo = q.trim().toLocaleLowerCase("pt-BR");
    return itens
      .filter((i) => !termo || [
        i.produto.nome, i.produto.codigo, i.produto.marca, i.produto.modelo,
      ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(termo))
      .filter((i) => !filtros.equipeId || i.equipe.id === filtros.equipeId)
      .filter((i) => !filtros.categoriaId || i.produto.categoria_id === filtros.categoriaId)
      .filter((i) => !filtros.unidadeId || i.produto.unidade_id === filtros.unidadeId)
      .filter((i) => !filtros.status || (filtros.status === "BAIXO" ? i.baixo : !i.baixo))
      .filter((i) => !filtros.saldo || (filtros.saldo === "ZERADO" ? i.estoque === 0 : i.estoque > 0))
      .sort((a, b) => a.produto.nome.localeCompare(b.produto.nome));
  }, [itens, q, filtros]);

  const item = itens.find((i) => i.produto.id === detalhe && (!equipeId || i.equipe.id === equipeId));

  const historicoCompleto = useMemo(
    () => item && dados ? historicoEstoque(dados.movimentacoes, item.produto.id, item.equipe.id) : [],
    [dados, item],
  );

  const historico = useMemo(
    () => historicoCompleto.filter(({ movimentacao: m }) => {
      const data = m.data.slice(0, 10);
      if (historicoFiltros.de && data < historicoFiltros.de) return false;
      if (historicoFiltros.ate && data > historicoFiltros.ate) return false;
      if (historicoFiltros.tipo && m.tipo !== historicoFiltros.tipo) return false;
      if (historicoFiltros.funcionarioId && m.funcionario_id !== historicoFiltros.funcionarioId) return false;
      if (historicoFiltros.documentoId && m.documento_id !== historicoFiltros.documentoId) return false;
      return true;
    }),
    [historicoFiltros, historicoCompleto],
  );

  const documentoMap = useMemo(() => new Map((documentos ?? []).map((d) => [d.id, d])), [documentos]);
  const localMap = useMemo(() => new Map(dados?.locais.map((l) => [l.id, l]) ?? []), [dados?.locais]);

  const limparFiltros = () => setFiltros({ equipeId: "", categoriaId: "", unidadeId: "", status: "", saldo: "" });
  const limparHistorico = () => setHistoricoFiltros({ de: "", ate: "", tipo: "", funcionarioId: "", documentoId: "" });

  const imprimirEstoque = () => {
    abrirImpressao("Relatório de estoque", `
      <h1>Relatório de estoque</h1>
      <div class="sub">${filtrados.length} posição(ões) · visão conforme os filtros atuais.</div>
      <div class="meta"><div><b>Posições</b>${filtrados.length}</div><div><b>Abaixo do mínimo</b>${filtrados.filter(i=>i.baixo).length}</div><div><b>Zeradas</b>${filtrados.filter(i=>i.estoque===0).length}</div></div>
      <table><thead><tr><th>Produto</th><th>Equipe</th><th>Categoria</th><th>Un.</th><th class="right">Estoque</th><th class="right">Mínimo</th><th>Status</th></tr></thead>
      <tbody>${filtrados.map(i=>`<tr><td><b>${i.produto.nome}</b><br>${i.produto.codigo ?? ""}</td><td>${i.equipe.nome}</td><td>${i.categoria?.nome ?? "—"}</td><td>${i.unidade?.sigla ?? "—"}</td><td class="right">${num(i.estoque)}</td><td class="right">${num(i.minimo)}</td><td>${i.baixo ? "BAIXO" : "OK"}</td></tr>`).join("")}</tbody></table>
    `);
  };

  if (!dados) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sidebar-primary">
            <PackageSearch className="size-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">Materiais</span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Estoque</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Consulta consolidada do saldo por produto e equipe.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportarExcel(filtrados)}>
            <FileSpreadsheet className="mr-2 size-4" /> Excel
          </Button>
          <Button size="sm" onClick={imprimirEstoque}>
            <Printer className="mr-2 size-4" /> Imprimir / PDF
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Posições", filtrados.length, "posições no resultado"],
          ["Produtos", new Set(filtrados.map(i=>i.produto.id)).size, "produtos distintos"],
          ["Abaixo do mínimo", filtrados.filter(i=>i.baixo).length, "precisam de atenção"],
          ["Estoque zerado", filtrados.filter(i=>i.estoque===0).length, "posições sem saldo"],
        ].map(([label, value, description]) => (
          <Card key={label as string} className="overflow-hidden border-border/70 shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Consulta</p>
              <p className="text-sm text-muted-foreground">Refine a visão atual por características do estoque.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); limparFiltros(); }}>
              <RotateCcw className="mr-2 size-4" /> Limpar filtros
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1.5 xl:col-span-2">
              <Label className="text-xs">Pesquisa</Label>
              <div className="relative">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produto, código, marca ou modelo..." className="pr-9" />
                {q && <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setQ("")}><X className="size-4" /></button>}
              </div>
            </div>
            {[
              ["Equipe", "equipeId", dados.equipes.filter(e=>e.ativo).map(e=>({value:e.id,label:e.nome}))],
              ["Categoria", "categoriaId", dados.categorias.map(c=>({value:c.id,label:c.nome}))],
              ["Unidade", "unidadeId", dados.unidades.map(u=>({value:u.id,label:u.sigla}))],
            ].map(([label, key, opcoes]) => (
              <div key={key as string} className="space-y-1.5">
                <Label className="text-xs">{label as string}</Label>
                <Combobox
                  placeholder="Todas"
                  value={(filtros as any)[key as string] || null}
                  onChange={(v) => setFiltros((f) => ({ ...f, [key as string]: v ?? "" }))}
                  opcoes={opcoes as Array<{value:string;label:string}>}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Combobox placeholder="Todos" value={filtros.status || null} onChange={(v) => setFiltros(f=>({...f,status:(v??"") as FiltrosEstoque["status"]}))}
                opcoes={[{value:"OK",label:"OK"},{value:"BAIXO",label:"Abaixo do mínimo"}]} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Saldo</Label>
              <Combobox placeholder="Todos" value={filtros.saldo || null} onChange={(v) => setFiltros(f=>({...f,saldo:(v??"") as FiltrosEstoque["saldo"]}))}
                opcoes={[{value:"COM_ESTOQUE",label:"Com estoque"},{value:"ZERADO",label:"Zerado"}]} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-b bg-muted/30">
                <TableHead>Produto</TableHead><TableHead>Equipe</TableHead><TableHead>Categoria</TableHead><TableHead>Un.</TableHead>
                <TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">Mínimo</TableHead><TableHead>Status</TableHead><TableHead className="w-28 text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtrados.slice(0, 500).map((i) => (
                  <TableRow key={i.id} className="group hover:bg-muted/20">
                    <TableCell><div className="min-w-56"><div className="font-semibold">{i.produto.nome}</div><div className="mt-1 text-xs text-muted-foreground">{[i.produto.codigo,i.produto.marca,i.produto.modelo].filter(Boolean).join(" · ") || "Sem identificação"}</div></div></TableCell>
                    <TableCell>{i.equipe.nome}</TableCell><TableCell>{i.categoria?.nome ?? "—"}</TableCell><TableCell>{i.unidade?.sigla ?? "—"}</TableCell>
                    <TableCell className="num text-right font-bold">{num(i.estoque)}</TableCell><TableCell className="num text-right text-muted-foreground">{num(i.minimo)}</TableCell>
                    <TableCell>{i.baixo ? <Badge className="bg-warning text-warning-foreground">Baixo</Badge> : <Badge variant="secondary">OK</Badge>}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={()=>{setEquipeId(i.equipe.id);setDetalhe(i.produto.id)}}>Histórico</Button></TableCell>
                  </TableRow>
                ))}
                {filtrados.length === 0 && <TableRow><TableCell colSpan={8} className="py-14 text-center text-sm text-muted-foreground">Nenhuma posição encontrada para os filtros atuais.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          {filtrados.length > 500 && <div className="border-t px-4 py-3 text-xs text-muted-foreground">Exibindo 500 posições. Excel e PDF consideram todas as posições filtradas.</div>}
        </CardContent>
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(open)=>{if(!open){setDetalhe(null);setEquipeId(null);limparHistorico();}}}>
        <DialogContent className="flex max-h-[94vh] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] lg:w-[94vw] xl:w-[92vw]">
          <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-7">
            <DialogTitle className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl border bg-muted/30"><PackageSearch className="size-5" /></span>
              <span className="min-w-0"><span className="block truncate text-xl font-bold">{item?.produto.nome ?? "Histórico"}</span>
                {item && <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
                  <span>Código: {item.produto.codigo ?? "—"}</span><span>Unidade: {item.unidade?.sigla ?? "—"}</span><span>Categoria: {item.categoria?.nome ?? "—"}</span><span>Equipe: {item.equipe.nome}</span>
                </span>}
              </span>
            </DialogTitle>
          </DialogHeader>
          {item ? <><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7"><div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Estoque atual</p><p className="num mt-1 text-2xl font-bold">{num(item.estoque)} {item.unidade?.sigla ?? ""}</p></div>
              <div className="rounded-xl border p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Estoque mínimo</p><p className="num mt-1 text-2xl font-bold">{num(item.minimo)} {item.unidade?.sigla ?? ""}</p></div>
              <div className="rounded-xl border p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total de movimentações</p><p className="num mt-1 text-2xl font-bold">{historicoCompleto.length}</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5"><Label className="text-xs">Data inicial</Label><Input type="date" value={historicoFiltros.de} onChange={e=>setHistoricoFiltros(v=>({...v,de:e.target.value}))}/></div>
              <div className="space-y-1.5"><Label className="text-xs">Data final</Label><Input type="date" value={historicoFiltros.ate} onChange={e=>setHistoricoFiltros(v=>({...v,ate:e.target.value}))}/></div>
              <div className="space-y-1.5"><Label className="text-xs">Tipo</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={historicoFiltros.tipo} onChange={e=>setHistoricoFiltros(v=>({...v,tipo:e.target.value}))}><option value="">Todos</option>{TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
              <div className="space-y-1.5"><Label className="text-xs">Funcionário</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={historicoFiltros.funcionarioId} onChange={e=>setHistoricoFiltros(v=>({...v,funcionarioId:e.target.value}))}><option value="">Todos</option>{dados.funcionarios.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
              <div className="space-y-1.5"><Label className="text-xs">Documento</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={historicoFiltros.documentoId} onChange={e=>setHistoricoFiltros(v=>({...v,documentoId:e.target.value}))}><option value="">Todos</option>{(documentos??[]).map(d=><option key={d.id} value={d.id}>{d.numero}</option>)}</select></div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2"><History className="size-5"/><div><p className="font-semibold">Histórico de movimentações</p><p className="text-xs text-muted-foreground">Todas as movimentações desta posição, com saldo progressivo.</p></div></div>
              <div className="flex items-center gap-2"><Badge variant="outline">{historico.length} registro(s)</Badge>{(historicoFiltros.de||historicoFiltros.ate||historicoFiltros.tipo||historicoFiltros.funcionarioId||historicoFiltros.documentoId)&&<Button variant="ghost" size="sm" onClick={limparHistorico}><X className="mr-2 size-4"/>Limpar</Button>}</div>
            </div>
            <div className="overflow-hidden rounded-xl border"><div className="max-h-[46vh] overflow-auto">
              <Table className="min-w-[1450px]"><TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><TableRow>
                <TableHead>#</TableHead><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">Saldo anterior</TableHead><TableHead className="text-right">Saldo posterior</TableHead><TableHead>Funcionário</TableHead><TableHead>Encarregado</TableHead><TableHead>Empresa</TableHead><TableHead>Local</TableHead><TableHead>Documento</TableHead><TableHead>Observação</TableHead>
              </TableRow></TableHeader><TableBody>
                {historico.map(({movimentacao:m,saldoAnterior,efeito:valor,saldoPosterior},index)=>{
                  const doc=m.documento_id?documentoMap.get(m.documento_id):undefined;
                  const origem=m.local_id?localMap.get(m.local_id)?.nome:undefined;
                  const destino=m.local_destino_id?localMap.get(m.local_destino_id)?.nome:undefined;
                  return <TableRow key={m.id}><TableCell className="text-muted-foreground">{historico.length-index}</TableCell><TableCell className="whitespace-nowrap"><div>{formatarData(m.data)}</div><div className="text-[11px] text-muted-foreground">{new Date(m.data).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div></TableCell><TableCell><Badge variant="secondary">{m.tipo}</Badge></TableCell><TableCell className="num text-right font-semibold"><span className={valor<0?"text-destructive":valor>0?"text-emerald-600":""}>{valor>0?"+":""}{num(valor)}</span></TableCell><TableCell className="num text-right">{num(saldoAnterior)}</TableCell><TableCell className="num text-right font-bold">{num(saldoPosterior)}</TableCell><TableCell>{nome(dados.funcionarios,m.funcionario_id)}</TableCell><TableCell>{nome(dados.funcionarios,m.encarregado_id)}</TableCell><TableCell>{nome(dados.empresas,m.empresa_id)}</TableCell><TableCell>{m.tipo==="TRANSFERENCIA"&&destino?<span className="inline-flex items-center gap-1 text-xs">{origem??"Origem"}<ArrowRight className="size-3"/>{destino}</span>:origem??"—"}</TableCell><TableCell>{doc?<span className="inline-flex items-center gap-1 text-xs"><FileText className="size-3.5"/>{doc.numero}</span>:"—"}</TableCell><TableCell className="max-w-64 truncate" title={m.observacao??""}>{m.observacao?.trim()||"—"}</TableCell></TableRow>
                })}
                {historico.length===0&&<TableRow><TableCell colSpan={12} className="py-12 text-center text-sm text-muted-foreground">Nenhuma movimentação corresponde aos filtros selecionados.</TableCell></TableRow>}
              </TableBody></Table>
            </div></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border p-4"><div className="mb-3 flex items-center gap-2"><BarChart3 className="size-4"/><p className="font-semibold">Resumo do período</p></div><div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">{TIPOS.map(tipo=>{const total=historico.filter(h=>h.movimentacao.tipo===tipo).reduce((s,h)=>s+h.efeito,0);return <div key={tipo} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{tipo}</span><span className="num font-semibold">{total>0?"+":""}{num(total)} {item.unidade?.sigla??""}</span></div>})}</div></div>
              <div className="rounded-2xl border bg-primary/5 p-4"><div className="flex items-start gap-3"><History className="mt-0.5 size-5 shrink-0"/><div><p className="font-semibold">Saldo calculado</p><p className="mt-1 text-sm text-muted-foreground">O saldo é calculado exclusivamente a partir das movimentações existentes.</p></div></div></div>
            </div>
          </div></div><div className="shrink-0 border-t bg-background/95 px-5 py-3 backdrop-blur sm:px-7"><div className="flex items-center justify-between gap-3"><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><Users className="size-4"/>Equipe: {item.equipe.nome}<span>·</span><MapPin className="size-4"/>Posição de estoque</div><div className="flex items-center gap-2"><Button asChild variant="outline"><Link to="/app/produto" search={{ produto: item.produto.id }}>Abrir perfil</Link></Button><Button variant="outline" onClick={()=>setDetalhe(null)}>Fechar</Button></div></div></div></> : <div className="p-6 text-sm text-muted-foreground">A posição de estoque não foi encontrada.</div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function nome<T extends {id:string;nome:string}>(arr:T[],id?:string|null){return arr.find(x=>x.id===id)?.nome??"—";}
