import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  FileDown,
  FileSpreadsheet,
  Filter,
  Loader2,
  PackageSearch,
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

  const exportarExcel = async () => {
    if (!dados) return;
    const XLSXStyle = await import("xlsx-js-style");
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
    const planilha = XLSXStyle.utils.json_to_sheet(linhas);
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
    planilha["!autofilter"] = { ref: planilha["!ref"] };
    const intervalo = XLSXStyle.utils.decode_range(planilha["!ref"] ?? "A1:H1");
    for (let coluna = intervalo.s.c; coluna <= intervalo.e.c; coluna += 1) {
      const celula = planilha[XLSXStyle.utils.encode_cell({ r: 0, c: coluna })];
      if (celula) {
        celula.s = {
          fill: { fgColor: { rgb: "17324D" } },
          font: { bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: { bottom: { style: "medium", color: { rgb: "F59E0B" } } },
        };
      }
    }
    for (let linha = 1; linha <= intervalo.e.r; linha += 1) {
      const situacao = planilha[XLSXStyle.utils.encode_cell({ r: linha, c: 7 })];
      if (situacao) {
        const disponivel = situacao.v === "Disponível";
        const baixo = situacao.v === "Abaixo do mínimo";
        situacao.s = {
          fill: { fgColor: { rgb: disponivel ? "E8F5EE" : baixo ? "FFF4D6" : "FDE8E8" } },
          font: { bold: true, color: { rgb: disponivel ? "146C43" : baixo ? "8A5A00" : "A61B29" } },
        };
      }
      for (let coluna = 0; coluna <= intervalo.e.c; coluna += 1) {
        const celula = planilha[XLSXStyle.utils.encode_cell({ r: linha, c: coluna })];
        if (celula && !celula.s) celula.s = { alignment: { vertical: "center" } };
      }
    }
    const pasta = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(pasta, planilha, "Estoque");
    XLSXStyle.writeFile(pasta, `consulta-estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${itens.length} posição(ões) exportada(s) para Excel.`);
  };

  const exportarPdf = async () => {
    if (!dados) return;
    try {
      const { PDFDocument, PageSizes, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const fonte = await pdf.embedFont(StandardFonts.Helvetica);
      const fonteNegrito = await pdf.embedFont(StandardFonts.HelveticaBold);
      const [paginaLargura, paginaAltura] = PageSizes.A4;
      const margem = 36;
      const azul = rgb(0.09, 0.2, 0.3);
      const azulClaro = rgb(0.91, 0.95, 0.97);
      const cinza = rgb(0.36, 0.45, 0.51);
      const amber = rgb(0.96, 0.62, 0.04);
      const verde = rgb(0.08, 0.42, 0.25);
      const vermelho = rgb(0.65, 0.12, 0.16);
      const larguraUtil = paginaLargura - margem * 2;
      const colunas = [146, 76, 46, 98, 53, 53, 51];
      const cabecalhos = [
        "Produto",
        "Categoria",
        "Unidade",
        "Equipe",
        "Saldo",
        "Mínimo",
        "Situação",
      ];
      const alturaLinha = 24;
      const alturaCabecalho = 24;
      const alturaRodape = 24;
      const limiteTexto = (valor: string, largura: number, tamanho: number) => {
        const seguro = textoPdf(valor);
        if (fonte.widthOfTextAtSize(seguro, tamanho) <= largura) return seguro;
        let resultado = seguro;
        while (
          resultado.length > 1 &&
          fonte.widthOfTextAtSize(`${resultado}...`, tamanho) > largura
        ) {
          resultado = resultado.slice(0, -1);
        }
        return `${resultado}...`;
      };
      const statusCor = (status: PainelEstoqueItem["status"]) =>
        status === "DISPONIVEL" ? verde : status === "BAIXO" ? amber : vermelho;

      let pagina = pdf.addPage(PageSizes.A4);
      let y = paginaAltura - margem;
      const desenharTopo = () => {
        pagina.drawRectangle({
          x: 0,
          y: paginaAltura - 78,
          width: paginaLargura,
          height: 78,
          color: azul,
        });
        pagina.drawRectangle({ x: 0, y: paginaAltura - 78, width: 10, height: 78, color: amber });
        pagina.drawText("ALMOXARIFADO · CONSULTA PÚBLICA", {
          x: margem,
          y: paginaAltura - 30,
          size: 9,
          font: fonteNegrito,
          color: rgb(0.78, 0.87, 0.91),
        });
        pagina.drawText(limiteTexto("Consulta de estoque", larguraUtil, 20), {
          x: margem,
          y: paginaAltura - 55,
          size: 20,
          font: fonteNegrito,
          color: rgb(1, 1, 1),
        });
        y = paginaAltura - 102;
      };
      const desenharCabecalhoTabela = () => {
        let x = margem;
        pagina.drawRectangle({
          x: margem,
          y: y - alturaCabecalho + 5,
          width: larguraUtil,
          height: alturaCabecalho,
          color: azulClaro,
        });
        cabecalhos.forEach((cabecalho, indice) => {
          pagina.drawText(cabecalho, {
            x: x + 4,
            y: y - 10,
            size: 7.5,
            font: fonteNegrito,
            color: azul,
          });
          x += colunas[indice] ?? 0;
        });
        y -= alturaCabecalho;
      };
      const desenharRodape = () => {
        pagina.drawLine({
          start: { x: margem, y: 30 },
          end: { x: paginaLargura - margem, y: 30 },
          thickness: 0.6,
          color: rgb(0.8, 0.85, 0.88),
        });
        pagina.drawText(`ALMOXARIFADO · ${dados.projeto_nome}`, {
          x: margem,
          y: 17,
          size: 7,
          font: fonte,
          color: cinza,
        });
        pagina.drawText(`Página ${pdf.getPageCount()}`, {
          x: paginaLargura - margem - 48,
          y: 17,
          size: 7,
          font: fonte,
          color: cinza,
        });
      };
      const iniciarPagina = (primeira: boolean) => {
        if (!primeira) {
          pagina = pdf.addPage(PageSizes.A4);
        }
        desenharTopo();
        if (primeira) {
          pagina.drawText(
            textoPdf(
              `${dados.projeto_nome} · ${itens.length} posição(ões) · Atualizado em ${new Date(dados.atualizado_em).toLocaleString("pt-BR")}`,
            ),
            { x: margem, y, size: 8, font: fonte, color: cinza },
          );
          y -= 20;
          const resumo = [
            ["Posições", itens.length],
            ["Disponíveis", itens.filter((item) => item.status === "DISPONIVEL").length],
            ["Abaixo do mínimo", itens.filter((item) => item.status === "BAIXO").length],
            ["Sem saldo", itens.filter((item) => item.status === "ZERADO").length],
          ];
          const larguraResumo = (larguraUtil - 18) / 4;
          resumo.forEach(([rotulo, valor], indice) => {
            const x = margem + indice * (larguraResumo + 6);
            pagina.drawRectangle({
              x,
              y: y - 36,
              width: larguraResumo,
              height: 36,
              borderColor: rgb(0.8, 0.85, 0.88),
              borderWidth: 0.8,
              color: rgb(0.98, 0.99, 0.99),
            });
            pagina.drawText(String(rotulo), {
              x: x + 7,
              y: y - 14,
              size: 7,
              font: fonte,
              color: cinza,
            });
            pagina.drawText(String(valor), {
              x: x + 7,
              y: y - 29,
              size: 12,
              font: fonteNegrito,
              color: azul,
            });
          });
          y -= 52;
        }
        desenharCabecalhoTabela();
      };

      iniciarPagina(true);
      itens.forEach((item, indice) => {
        if (y - alturaLinha < margem + alturaRodape) {
          desenharRodape();
          iniciarPagina(false);
        }
        const valores = [
          item.produto,
          item.categoria ?? "-",
          item.unidade ?? "-",
          item.equipe,
          num(item.quantidade),
          num(item.minimo),
          rotuloStatus(item.status),
        ];
        let x = margem;
        if (indice % 2 === 0)
          pagina.drawRectangle({
            x: margem,
            y: y - alturaLinha + 5,
            width: larguraUtil,
            height: alturaLinha,
            color: rgb(0.98, 0.99, 0.99),
          });
        valores.forEach((valor, coluna) => {
          const largura = colunas[coluna] ?? 0;
          const tamanho = coluna === 0 ? 8 : 7.5;
          const cor = coluna === 6 ? statusCor(item.status) : azul;
          pagina.drawText(limiteTexto(valor, largura - 8, tamanho), {
            x: x + 4,
            y: y - 11,
            size: tamanho,
            font: coluna === 0 ? fonteNegrito : fonte,
            color: cor,
          });
          x += largura;
        });
        y -= alturaLinha;
      });
      if (!itens.length)
        pagina.drawText("Nenhum item corresponde aos filtros.", {
          x: margem + 4,
          y: y - 12,
          size: 9,
          font: fonte,
          color: cinza,
        });
      desenharRodape();
      const bytes = await pdf.save();
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `consulta-estoque-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${itens.length} posição(ões) exportada(s) para PDF A4.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    }
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
        {painelDesatualizado(dados.atualizado_em) && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p>
              <strong>Informação possivelmente desatualizada.</strong> Esta é a última versão
              publicada pelo almoxarifado. A consulta continua disponível enquanto o operador não
              realizar uma nova atualização.
            </p>
          </div>
        )}
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
                onClick={() => void exportarExcel()}
                className="w-full sm:w-auto"
              >
                <FileSpreadsheet className="mr-1.5 size-4" /> Excel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void exportarPdf()}
                className="w-full sm:w-auto"
              >
                <FileDown className="mr-1.5 size-4" /> Exportar PDF
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

function painelDesatualizado(atualizadoEm: string): boolean {
  const data = Date.parse(atualizadoEm);
  return Number.isFinite(data) && Date.now() - data > 24 * 60 * 60 * 1000;
}

function textoPdf(valor: unknown): string {
  return String(valor)
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("·", "-")
    .replaceAll("…", "...");
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
