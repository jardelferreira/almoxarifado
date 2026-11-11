import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  FileSpreadsheet,
  Filter,
  Loader2,
  PackageSearch,
  Printer,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { consultarPainelEstoqueNuvem } from "@/lib/painel-estoque-r2";
import type { PainelEstoqueDados, PainelEstoqueItem } from "@/types";
import { num } from "@/utils/format";

export const Route = createFileRoute("/consulta-estoque")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    projeto: typeof search.projeto === "string" ? search.projeto : "",
    acesso: typeof search.acesso === "string" ? search.acesso : "",
  }),
  head: () => ({ meta: [{ title: "Consulta de estoque — Almoxarifado" }] }),
  component: ConsultaEstoquePage,
});

function ConsultaEstoquePage() {
  const { projeto, acesso } = useSearch({ from: "/consulta-estoque" });
  const [dados, setDados] = useState<PainelEstoqueDados | null>(null);
  const [busca, setBusca] = useState("");
  const [equipe, setEquipe] = useState("TODAS");
  const [status, setStatus] = useState("TODOS");
  const [carregando, setCarregando] = useState(false);

  const carregar = async () => {
    if (!projeto || !acesso) {
      toast.error("Este link de consulta está incompleto.");
      return;
    }
    try {
      setCarregando(true);
      setDados(await consultarPainelEstoqueNuvem({ data: { projetoId: projeto, token: acesso } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o estoque.");
    } finally {
      setCarregando(false);
    }
  };

  const equipes = useMemo(
    () =>
      [...new Set((dados?.itens ?? []).map((item) => item.equipe))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [dados],
  );
  const itens = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return (dados?.itens ?? []).filter((item) => {
      const texto = [item.produto, item.codigo, item.categoria, item.equipe, item.unidade]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return (
        (!termo || texto.includes(termo)) &&
        (equipe === "TODAS" || item.equipe === equipe) &&
        (status === "TODOS" || item.status === status)
      );
    });
  }, [busca, dados, equipe, status]);

  const exportarExcel = () => {
    if (!dados) return;
    const linhas = itens.map((item) => ({
      Produto: item.produto,
      Código: item.codigo ?? "",
      Categoria: item.categoria ?? "",
      Unidade: item.unidade ?? "",
      Equipe: item.equipe,
      Saldo: item.quantidade,
      "Estoque mínimo": item.minimo,
      Situação: rotuloStatus(item.status),
    }));
    const planilha = XLSX.utils.json_to_sheet(linhas);
    planilha["!cols"] = [
      { wch: 36 },
      { wch: 16 },
      { wch: 24 },
      { wch: 12 },
      { wch: 24 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
    ];
    const pasta = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(pasta, planilha, "Estoque");
    XLSX.writeFile(pasta, `consulta-estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${itens.length} posição(ões) exportada(s) para Excel.`);
  };

  const imprimir = () => {
    if (!dados) return;
    const janela = window.open("", "_blank", "width=1100,height=800");
    if (!janela) {
      toast.error("O navegador bloqueou a janela de impressão.");
      return;
    }
    const linhas = itens
      .map(
        (item) =>
          `<tr><td><strong>${escapar(item.produto)}</strong><br><small>${escapar(item.codigo ?? "")}</small></td><td>${escapar(item.categoria ?? "—")}</td><td>${escapar(item.unidade ?? "—")}</td><td>${escapar(item.equipe)}</td><td class="right">${escapar(num(item.quantidade))}</td><td class="right">${escapar(num(item.minimo))}</td><td>${escapar(rotuloStatus(item.status))}</td></tr>`,
      )
      .join("");
    janela.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Consulta de estoque</title><style>@page{size:landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#172b3b;font-size:10px}h1{margin:0 0 4px;font-size:22px}.sub{color:#607382;margin-bottom:14px}.meta{display:flex;gap:28px;margin-bottom:14px}.meta b{display:block;font-size:8px;text-transform:uppercase;color:#607382;margin-bottom:3px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #d2dce2;padding:6px;text-align:left;vertical-align:top}th{background:#edf3f6;font-size:8px;text-transform:uppercase}.right{text-align:right}.footer{margin-top:14px;color:#607382;font-size:8px}</style></head><body><h1>${escapar(dados.projeto_nome)} — Consulta de estoque</h1><div class="sub">Visão conforme os filtros aplicados · Atualizado em ${escapar(new Date(dados.atualizado_em).toLocaleString("pt-BR"))}</div><div class="meta"><div><b>Posições</b>${itens.length}</div><div><b>Disponíveis</b>${itens.filter((item) => item.status === "DISPONIVEL").length}</div><div><b>Abaixo do mínimo</b>${itens.filter((item) => item.status === "BAIXO").length}</div><div><b>Sem saldo</b>${itens.filter((item) => item.status === "ZERADO").length}</div></div><table><thead><tr><th>Produto</th><th>Categoria</th><th>Unidade</th><th>Equipe</th><th class="right">Saldo</th><th class="right">Mínimo</th><th>Situação</th></tr></thead><tbody>${linhas || '<tr><td colspan="7">Nenhum item corresponde aos filtros.</td></tr>'}</tbody></table><div class="footer">Relatório gerado pelo ALMOXARIFADO em ${escapar(new Date().toLocaleString("pt-BR"))}</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`,
    );
    janela.document.close();
    janela.focus();
  };

  if (!dados) {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-xl space-y-5">
          <Cabecalho />
          <Card className="border-l-4 border-l-sky-500 shadow-sm">
            <CardContent className="space-y-4 p-5 sm:p-7">
              <div>
                <h2 className="font-semibold">Consulta de estoque</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Este painel é acessado pelo link ou QR Code compartilhado pelo almoxarifado.
                </p>
              </div>
              <Button
                className="h-12 w-full text-base"
                onClick={() => void carregar()}
                disabled={carregando}
              >
                {carregando ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <PackageSearch className="size-5" />
                )}{" "}
                Carregar estoque
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
        <Cabecalho projetoNome={dados.projeto_nome} atualizado={dados.atualizado_em} />
        <Card className="overflow-hidden border-l-4 border-l-primary shadow-sm">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Pesquisar produto, código ou categoria"
                className="h-12 pl-10 pr-10 text-base"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label="Limpar pesquisa"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={equipe}
                onChange={(event) => setEquipe(event.target.value)}
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="TODAS">Todas as equipes</option>
                {equipes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="TODOS">Todos os status</option>
                <option value="DISPONIVEL">Disponíveis</option>
                <option value="BAIXO">Abaixo do mínimo</option>
                <option value="ZERADO">Sem saldo</option>
              </select>
            </div>
            <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Filter className="size-4" /> {itens.length} posição(ões) encontrada(s)
                </span>
                <span className="text-right text-xs sm:hidden">
                  Atualizado {new Date(dados.atualizado_em).toLocaleString("pt-BR")}
                </span>
              </div>
              <span className="hidden sm:inline">
                Atualizado {new Date(dados.atualizado_em).toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t pt-3 sm:flex sm:flex-wrap">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={exportarExcel}
                className="w-full sm:w-auto"
              >
                <FileSpreadsheet className="mr-1.5 size-4" /> Excel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={imprimir}
                className="w-full sm:w-auto"
              >
                <Printer className="mr-1.5 size-4" /> PDF / Imprimir
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-3">
          {itens.map((item) => (
            <EstoqueCard key={`${item.produtoId}-${item.equipe}`} item={item} />
          ))}
          {!itens.length && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Nenhum item corresponde aos filtros.
              </CardContent>
            </Card>
          )}
        </div>
        <p className="flex items-center justify-center gap-2 px-2 text-center text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" /> Consulta somente leitura. Os dados são
          publicados pelo almoxarifado.
        </p>
      </div>
    </main>
  );
}

function rotuloStatus(status: PainelEstoqueItem["status"]): string {
  if (status === "DISPONIVEL") return "Disponível";
  if (status === "BAIXO") return "Abaixo do mínimo";
  return "Sem saldo";
}

function escapar(valor: unknown): string {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function Cabecalho({ projetoNome, atualizado }: { projetoNome?: string; atualizado?: string }) {
  return (
    <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-l-4 border-l-amber-500 p-5 sm:p-7">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          <PackageSearch className="size-4" /> Consulta pública de estoque
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Estoque disponível
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {projetoNome ? `Projeto: ${projetoNome}. ` : ""}Consulte materiais por nome, equipe e
          situação.
        </p>
        {atualizado && (
          <p className="mt-2 text-xs text-muted-foreground">
            Última atualização: {new Date(atualizado).toLocaleString("pt-BR")}
          </p>
        )}
      </div>
    </header>
  );
}

function EstoqueCard({ item }: { item: PainelEstoqueItem }) {
  const status =
    item.status === "DISPONIVEL"
      ? { label: "Disponível", className: "border-emerald-200 bg-emerald-50 text-emerald-800" }
      : item.status === "BAIXO"
        ? { label: "Atenção", className: "border-amber-200 bg-amber-50 text-amber-800" }
        : { label: "Sem saldo", className: "border-rose-200 bg-rose-50 text-rose-800" };
  return (
    <Card className="overflow-hidden border-l-4 border-l-slate-400 shadow-sm">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold sm:text-lg">{item.produto}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {[item.codigo, item.categoria].filter(Boolean).join(" · ") ||
                "Sem código ou categoria"}
            </p>
          </div>
          <Badge className={`shrink-0 border ${status.className}`}>
            {item.status === "BAIXO" && <AlertTriangle className="mr-1 size-3.5" />}
            {status.label}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo</p>
            <p className="text-xl font-bold">
              {num(item.quantidade)}{" "}
              <span className="text-sm font-medium text-muted-foreground">
                {item.unidade ?? "un."}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Equipe</p>
            <p className="mt-1 break-words text-sm font-medium">{item.equipe}</p>
          </div>
        </div>
        {item.minimo > 0 && (
          <p className="text-xs text-muted-foreground">
            Estoque mínimo: {num(item.minimo)} {item.unidade ?? "un."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
