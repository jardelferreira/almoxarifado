import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CalendarDays,
  Eye,
  FileSpreadsheet,
  FileText,
  MapPin,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/common/Combobox";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { repo } from "@/services/repo";
import { num } from "@/utils/format";
import type { Movimentacao } from "@/types";

export const Route = createFileRoute("/app/movimentacoes")({
  validateSearch: (search: Record<string, unknown>): MovimentacoesBusca => ({
    produto: typeof search["produto"] === "string" ? search["produto"] : undefined,
  }),
  ssr: false,
  head: () => ({
    meta: [
      { title: "Movimentações do Almoxarifado — Entradas e Saídas" },
      {
        name: "description",
        content:
          "Tabela completa de movimentações com pesquisa, filtros, paginação, detalhes, exclusão e exportação.",
      },
      { property: "og:title", content: "Movimentações do Almoxarifado" },
      {
        property: "og:description",
        content:
          "Histórico completo de entradas, saídas, devoluções, ajustes e transferências.",
      },
    ],
  }),
  component: MovimentacoesPage,
});

type MovimentacoesBusca = { produto: string | undefined };

const TIPOS = [
  "ENTRADA",
  "SAIDA",
  "DEVOLUCAO",
  "AJUSTE",
  "TRANSFERENCIA",
] as const;

const PAGINA = 25;

/**
 * Movimentações antigas podem ter apenas a data (YYYY-MM-DD), enquanto
 * lançamentos recentes podem trazer ISO completo (YYYY-MM-DDTHH:mm:ss...Z).
 *
 * Mantemos a data sem conversão de timezone para não deslocar o dia
 * registrado pelo usuário.
 */
function formatarDataMovimentacao(valor?: string | null) {
  if (!valor) return "—";

  const data = valor.slice(0, 10);
  const partes = data.split("-");

  if (partes.length !== 3 || partes.some((parte) => !parte)) {
    return valor;
  }

  const [ano, mes, dia] = partes;
  const dataFormatada = `${dia}/${mes}/${ano}`;

  const horaMatch = valor.match(/T(\d{2}):(\d{2})/);
  if (!horaMatch) return dataFormatada;

  return `${dataFormatada} ${horaMatch[1]}:${horaMatch[2]}`;
}

function dataParaFiltro(valor?: string | null) {
  return valor?.slice(0, 10) ?? "";
}

function rotuloTipo(tipo: Movimentacao["tipo"]) {
  const rotulos: Record<Movimentacao["tipo"], string> = {
    ENTRADA: "Entrada",
    SAIDA: "Saída",
    DEVOLUCAO: "Devolução",
    AJUSTE: "Ajuste",
    TRANSFERENCIA: "Transferência",
  };

  return rotulos[tipo];
}

function classeTipo(tipo: Movimentacao["tipo"]) {
  if (tipo === "ENTRADA" || tipo === "DEVOLUCAO") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (tipo === "SAIDA") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (tipo === "AJUSTE") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function efeitoMovimentacao(movimentacao: Movimentacao) {
  if (movimentacao.tipo === "SAIDA") return -movimentacao.quantidade;

  if (
    movimentacao.tipo === "AJUSTE" ||
    movimentacao.tipo === "TRANSFERENCIA"
  ) {
    return (movimentacao.sinal ?? 1) * movimentacao.quantidade;
  }

  return movimentacao.quantidade;
}

function saldoAnteriorDaMovimentacao(
  movimentacoes: Movimentacao[],
  selecionada: Movimentacao,
) {
  const anteriores = movimentacoes
    .filter(
      (movimentacao) =>
        movimentacao.projeto_id === selecionada.projeto_id &&
        movimentacao.produto_id === selecionada.produto_id &&
        movimentacao.equipe_id === selecionada.equipe_id,
    )
    .sort((a, b) => {
      const data = a.data.localeCompare(b.data);
      return data !== 0 ? data : a.id.localeCompare(b.id);
    });

  let saldo = 0;

  for (const movimentacao of anteriores) {
    if (movimentacao.id === selecionada.id) return saldo;
    saldo += efeitoMovimentacao(movimentacao);
  }

  return saldo;
}

function escaparHtml(valor: unknown) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function abrirImpressao(titulo: string, html: string) {
  const janela = window.open("", "_blank");

  if (!janela) {
    toast.error("O navegador bloqueou a janela de impressão.");
    return;
  }

  janela.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escaparHtml(titulo)}</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    body {
      font-family: Arial, sans-serif;
      color: #111827;
      font-size: 10px;
    }
    h1 { margin: 0 0 4px; font-size: 20px; }
    .sub { color: #6b7280; margin-bottom: 14px; }
    .meta {
      display: flex;
      gap: 24px;
      margin-bottom: 12px;
    }
    .meta b {
      display: block;
      font-size: 8px;
      text-transform: uppercase;
      color: #6b7280;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border-bottom: 1px solid #d1d5db;
      padding: 5px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f3f4f6;
      font-size: 8px;
      text-transform: uppercase;
    }
    .right { text-align: right; }
    .footer {
      margin-top: 12px;
      color: #6b7280;
      font-size: 8px;
    }
  </style>
</head>
<body>
  ${html}
  <div class="footer">
    Relatório gerado pelo ALMOXARIFADO em ${escaparHtml(
      new Date().toLocaleString("pt-BR"),
    )}
  </div>
</body>
</html>`);

  janela.document.close();
  janela.focus();
  window.setTimeout(() => janela.print(), 200);
}

export function MovimentacoesPage() {
  const { produto: produtoParam } = Route.useSearch();
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);

  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  const [produtoId, setProdutoId] = useState<string | null>(produtoParam ?? null);
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [localId, setLocalId] = useState<string | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pagina, setPagina] = useState(0);
  const [detalhe, setDetalhe] = useState<Movimentacao | null>(null);

  const nomeMap = useMemo(() => {
    if (!dados) return null;

    return {
      produto: new Map(dados.produtos.map((p) => [p.id, p])),
      unidade: new Map(dados.unidades.map((u) => [u.id, u])),
      func: new Map(dados.funcionarios.map((f) => [f.id, f.nome])),
      empresa: new Map(dados.empresas.map((e) => [e.id, e.nome])),
      local: new Map(dados.locais.map((l) => [l.id, l.nome])),
      equipe: new Map(dados.equipes.map((e) => [e.id, e.nome])),
    };
  }, [dados]);

  const filtradas = useMemo(() => {
    if (!dados || !nomeMap) return [];

    const termo = q.trim().toLocaleLowerCase("pt-BR");

    return dados.movimentacoes.filter((movimentacao) => {
      if (tipo && movimentacao.tipo !== tipo) return false;
      if (produtoId && movimentacao.produto_id !== produtoId) return false;
      if (
        funcionarioId &&
        movimentacao.funcionario_id !== funcionarioId
      ) {
        return false;
      }
      if (empresaId && movimentacao.empresa_id !== empresaId) {
        return false;
      }
      if (localId && movimentacao.local_id !== localId) return false;
      if (equipeId && movimentacao.equipe_id !== equipeId) return false;

      const dataMovimentacao = dataParaFiltro(movimentacao.data);

      if (de && dataMovimentacao < de) return false;
      if (ate && dataMovimentacao > ate) return false;

      if (termo) {
        const produto = nomeMap.produto.get(movimentacao.produto_id);

        const alvo = [
          produto?.nome,
          produto?.codigo,
          produto?.marca,
          produto?.modelo,
          nomeMap.func.get(movimentacao.funcionario_id ?? ""),
          nomeMap.func.get(movimentacao.encarregado_id ?? ""),
          nomeMap.empresa.get(movimentacao.empresa_id ?? ""),
          nomeMap.local.get(movimentacao.local_id ?? ""),
          nomeMap.equipe.get(movimentacao.equipe_id),
          movimentacao.observacao,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");

        if (!alvo.includes(termo)) return false;
      }

      return true;
    });
  }, [
    dados,
    nomeMap,
    tipo,
    produtoId,
    funcionarioId,
    empresaId,
    localId,
    equipeId,
    de,
    ate,
    q,
  ]);

  const paginas = Math.max(1, Math.ceil(filtradas.length / PAGINA));
  const page = Math.min(pagina, paginas - 1);
  const visiveis = filtradas.slice(
    page * PAGINA,
    page * PAGINA + PAGINA,
  );

  const limparFiltros = () => {
    setQ("");
    setTipo(null);
    setProdutoId(null);
    setFuncionarioId(null);
    setEmpresaId(null);
    setLocalId(null);
    setEquipeId(null);
    setDe("");
    setAte("");
    setPagina(0);
  };

  const atualizar = (fn: () => void) => {
    fn();
    setPagina(0);
  };

  const linhas = useMemo(() => {
    if (!dados || !nomeMap) return [];

    return filtradas.map((movimentacao) => {
      const produto = nomeMap.produto.get(movimentacao.produto_id);

      return {
        data: formatarDataMovimentacao(movimentacao.data),
        tipo: movimentacao.tipo,
        produto: produto?.nome ?? "—",
        codigo: produto?.codigo ?? "",
        quantidade: movimentacao.quantidade,
        unidade: produto?.unidade_id
          ? nomeMap.unidade.get(produto.unidade_id)?.sigla ?? "—"
          : "—",
        funcionario:
          nomeMap.func.get(movimentacao.funcionario_id ?? "") ?? "—",
        encarregado:
          nomeMap.func.get(movimentacao.encarregado_id ?? "") ?? "—",
        empresa:
          nomeMap.empresa.get(movimentacao.empresa_id ?? "") ?? "—",
        local: nomeMap.local.get(movimentacao.local_id ?? "") ?? "—",
        equipe: nomeMap.equipe.get(movimentacao.equipe_id) ?? "—",
        observacao: movimentacao.observacao ?? "",
      };
    });
  }, [dados, nomeMap, filtradas]);

  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      linhas.map((linha) => ({
        Data: linha.data,
        Tipo: linha.tipo,
        Produto: linha.produto,
        Código: linha.codigo,
        Quantidade: linha.quantidade,
        Unidade: linha.unidade,
        Funcionário: linha.funcionario,
        Encarregado: linha.encarregado,
        Empresa: linha.empresa,
        Local: linha.local,
        Equipe: linha.equipe,
        Observação: linha.observacao,
      })),
    );

    ws["!cols"] = [
      { wch: 19 },
      { wch: 16 },
      { wch: 34 },
      { wch: 16 },
      { wch: 12 },
      { wch: 10 },
      { wch: 26 },
      { wch: 26 },
      { wch: 26 },
      { wch: 24 },
      { wch: 24 },
      { wch: 40 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, "Movimentações");
    XLSX.writeFile(
      workbook,
      `movimentacoes-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const imprimir = () => {
    abrirImpressao(
      "Relatório de movimentações",
      `
        <h1>Relatório de movimentações</h1>
        <div class="sub">
          ${escaparHtml(
            `${filtradas.length} registro(s) · visão conforme os filtros atuais.`,
          )}
        </div>
        <div class="meta">
          <div><b>De</b>${escaparHtml(de || "—")}</div>
          <div><b>Até</b>${escaparHtml(ate || "—")}</div>
          <div><b>Registros</b>${filtradas.length}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Produto</th>
              <th class="right">Qtd.</th>
              <th>Un.</th>
              <th>Funcionário</th>
              <th>Encarregado</th>
              <th>Empresa</th>
              <th>Local</th>
              <th>Equipe</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            ${linhas
              .map(
                (linha) => `
                  <tr>
                    <td>${escaparHtml(linha.data)}</td>
                    <td>${escaparHtml(linha.tipo)}</td>
                    <td>
                      <b>${escaparHtml(linha.produto)}</b><br>
                      ${escaparHtml(linha.codigo)}
                    </td>
                    <td class="right">${escaparHtml(num(linha.quantidade))}</td>
                    <td>${escaparHtml(linha.unidade)}</td>
                    <td>${escaparHtml(linha.funcionario)}</td>
                    <td>${escaparHtml(linha.encarregado)}</td>
                    <td>${escaparHtml(linha.empresa)}</td>
                    <td>${escaparHtml(linha.local)}</td>
                    <td>${escaparHtml(linha.equipe)}</td>
                    <td>${escaparHtml(linha.observacao || "—")}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      `,
    );
  };

  const excluir = async (movimentacao: Movimentacao) => {
    if (
      !confirm(
        "Excluir esta movimentação? A ação não pode ser desfeita.",
      )
    ) {
      return;
    }

    try {
      await repo.deleteMovimentacao(movimentacao.id);
      toast.success("Movimentação excluída");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a movimentação.",
      );
    }
  };

  if (!dados || !nomeMap) {
    return (
      <p className="text-sm text-muted-foreground">
        Carregando…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sidebar-primary">
            <FileText className="size-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">
              Materiais
            </span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            Movimentações
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {num(filtradas.length)} registro(s) encontrados.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportarExcel}
            disabled={linhas.length === 0}
          >
            <FileSpreadsheet className="mr-2 size-4" />
            Excel
          </Button>
          <Button
            size="sm"
            onClick={imprimir}
            disabled={linhas.length === 0}
          >
            <Printer className="mr-2 size-4" />
            Imprimir / PDF
          </Button>
        </div>
      </header>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Filtros
              </p>
              <p className="text-sm text-muted-foreground">
                Refine a consulta; exportações consideram todos os registros
                filtrados.
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={limparFiltros}
            >
              <RotateCcw className="mr-2 size-4" />
              Limpar filtros
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs">Pesquisa</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Produto, código, pessoa, local..."
                  value={q}
                  onChange={(event) =>
                    atualizar(() => setQ(event.target.value))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Combobox
                placeholder="Todos"
                value={tipo}
                onChange={(value) => atualizar(() => setTipo(value))}
                opcoes={TIPOS.map((item) => ({
                  value: item,
                  label: item,
                }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Produto</Label>
              <Combobox
                placeholder="Todos"
                value={produtoId}
                onChange={(value) =>
                  atualizar(() => setProdutoId(value))
                }
                opcoes={dados.produtos.map((produto) => ({
                  value: produto.id,
                  label: produto.nome,
                }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Funcionário</Label>
              <Combobox
                placeholder="Todos"
                value={funcionarioId}
                onChange={(value) =>
                  atualizar(() => setFuncionarioId(value))
                }
                opcoes={dados.funcionarios.map((funcionario) => ({
                  value: funcionario.id,
                  label: funcionario.nome,
                }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Empresa</Label>
              <Combobox
                placeholder="Todas"
                value={empresaId}
                onChange={(value) =>
                  atualizar(() => setEmpresaId(value))
                }
                opcoes={dados.empresas.map((empresa) => ({
                  value: empresa.id,
                  label: empresa.nome,
                }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Local</Label>
              <Combobox
                placeholder="Todos"
                value={localId}
                onChange={(value) =>
                  atualizar(() => setLocalId(value))
                }
                opcoes={dados.locais.map((local) => ({
                  value: local.id,
                  label: local.nome,
                }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Equipe</Label>
              <Combobox
                placeholder="Todas"
                value={equipeId}
                onChange={(value) =>
                  atualizar(() => setEquipeId(value))
                }
                opcoes={dados.equipes.map((equipe) => ({
                  value: equipe.id,
                  label: equipe.nome,
                }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">De</Label>
              <Input
                type="date"
                value={de}
                onChange={(event) =>
                  atualizar(() => setDe(event.target.value))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Até</Label>
              <Input
                type="date"
                value={ate}
                onChange={(event) =>
                  atualizar(() => setAte(event.target.value))
                }
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b bg-muted/30">
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead>Un.</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Encarregado</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Equipe</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>

              <TableBody>
                {visiveis.map((movimentacao) => {
                  const produto = nomeMap.produto.get(
                    movimentacao.produto_id,
                  );

                  return (
                    <TableRow
                      key={movimentacao.id}
                      className="group hover:bg-muted/20"
                    >
                      <TableCell className="whitespace-nowrap">
                        {formatarDataMovimentacao(movimentacao.data)}
                      </TableCell>

                      <TableCell>
                        <Badge variant="secondary">
                          {movimentacao.tipo}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="max-w-64">
                          <div className="truncate font-semibold">
                            {produto?.nome ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {produto?.codigo ?? ""}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="num text-right font-bold">
                        {num(movimentacao.quantidade)}
                      </TableCell>

                      <TableCell>
                        {produto?.unidade_id
                          ? nomeMap.unidade.get(produto.unidade_id)?.sigla ??
                            "—"
                          : "—"}
                      </TableCell>

                      <TableCell>
                        {nomeMap.func.get(
                          movimentacao.funcionario_id ?? "",
                        ) ?? "—"}
                      </TableCell>

                      <TableCell>
                        {nomeMap.func.get(
                          movimentacao.encarregado_id ?? "",
                        ) ?? "—"}
                      </TableCell>

                      <TableCell>
                        {nomeMap.empresa.get(
                          movimentacao.empresa_id ?? "",
                        ) ?? "—"}
                      </TableCell>

                      <TableCell>
                        {nomeMap.local.get(
                          movimentacao.local_id ?? "",
                        ) ?? "—"}
                      </TableCell>

                      <TableCell>
                        {nomeMap.equipe.get(movimentacao.equipe_id) ??
                          "—"}
                      </TableCell>

                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Detalhes"
                          onClick={() => setDetalhe(movimentacao)}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Excluir"
                          className="text-destructive"
                          onClick={() => void excluir(movimentacao)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {visiveis.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="py-14 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma movimentação encontrada para os filtros atuais.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">
              Página {page + 1} de {paginas} · {num(filtradas.length)} registro(s)
            </span>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPagina(page - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= paginas - 1}
                onClick={() => setPagina(page + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!detalhe}
        onOpenChange={(open) => !open && setDetalhe(null)}
      >
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b bg-muted/20 px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background shadow-sm">
                <ArrowRightLeft className="size-5 text-sidebar-primary" />
              </div>

              <div className="min-w-0">
                <DialogTitle className="text-lg">
                  Detalhes da movimentação
                </DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Histórico e contexto do lançamento selecionado.
                </p>
              </div>
            </div>
          </DialogHeader>

          {detalhe && (() => {
            const produto = nomeMap.produto.get(detalhe.produto_id);
            const unidade = produto?.unidade_id
              ? nomeMap.unidade.get(produto.unidade_id)?.sigla
              : undefined;
            const equipe = nomeMap.equipe.get(detalhe.equipe_id) ?? "—";
            const localOrigem =
              nomeMap.local.get(detalhe.local_id ?? "") ?? "—";
            const localDestino =
              nomeMap.local.get(detalhe.local_destino_id ?? "") ?? "—";
            const efeito = efeitoMovimentacao(detalhe);
            const quantidadeAssinada = `${efeito < 0 ? "−" : "+"}${num(
              Math.abs(efeito),
            )}`;
            const saldoAnterior = saldoAnteriorDaMovimentacao(
              dados.movimentacoes,
              detalhe,
            );
            const saldoPosterior = saldoAnterior + efeito;

            return (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                  <div className="space-y-5">
                    <section className="rounded-xl border bg-background p-4 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={classeTipo(detalhe.tipo)}
                            >
                              {rotuloTipo(detalhe.tipo)}
                            </Badge>

                            <span className="text-xs text-muted-foreground">
                              {formatarDataMovimentacao(detalhe.data)}
                            </span>
                          </div>

                          <h3 className="truncate text-base font-semibold">
                            {produto?.nome ?? "Produto não encontrado"}
                          </h3>

                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {produto?.codigo && (
                              <span>Código: {produto.codigo}</span>
                            )}
                            {produto?.marca && (
                              <span>Marca: {produto.marca}</span>
                            )}
                            {produto?.modelo && (
                              <span>Modelo: {produto.modelo}</span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 rounded-xl border bg-muted/20 px-4 py-3 sm:min-w-36 sm:text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Quantidade
                          </p>
                          <p
                            className={`num mt-0.5 text-2xl font-bold ${
                              efeito < 0
                                ? "text-red-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {quantidadeAssinada}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {unidade ?? "unidade(s)"}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Antes: {num(saldoAnterior)}
                          </p>
                        </div>
                      </div>
                    </section>

                    <section>
                      <div className="mb-3 flex items-center gap-2">
                        <CalendarDays className="size-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">
                          Informações do lançamento
                        </h4>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                          ["Data", formatarDataMovimentacao(detalhe.data)],
                          ["Tipo", rotuloTipo(detalhe.tipo)],
                          ["Unidade", unidade ?? "—"],
                          ["Quantidade lançada", num(detalhe.quantidade)],
                          ["Estoque antes", num(saldoAnterior)],
                          ["Efeito no estoque", quantidadeAssinada],
                          ["Estoque após", num(saldoPosterior)],
                          ["Equipe", equipe],
                        ].map(([chave, valor]) => (
                          <div key={chave} className="rounded-lg border p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {chave}
                            </p>
                            <p
                              className={`mt-1 text-sm font-medium ${
                                chave === "Efeito no estoque"
                                  ? efeito < 0
                                    ? "text-red-600"
                                    : "text-emerald-600"
                                  : ""
                              }`}
                            >
                              {valor}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div className="mb-3 flex items-center gap-2">
                        <ArrowRight className="size-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">
                          Origem e destino
                        </h4>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border bg-muted/10 p-4">
                          <div className="flex items-center gap-2">
                            <MapPin className="size-4 text-muted-foreground" />
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Local de origem
                            </p>
                          </div>
                          <p className="mt-2 text-sm font-semibold">
                            {localOrigem}
                          </p>
                        </div>

                        <div className="rounded-xl border bg-muted/10 p-4">
                          <div className="flex items-center gap-2">
                            <MapPin className="size-4 text-muted-foreground" />
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Local de destino
                            </p>
                          </div>
                          <p className="mt-2 text-sm font-semibold">
                            {localDestino}
                          </p>
                        </div>
                      </div>
                    </section>

                    <section>
                      <div className="mb-3 flex items-center gap-2">
                        <UserRound className="size-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">
                          Responsáveis e envolvidos
                        </h4>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                          [
                            "Funcionário",
                            nomeMap.func.get(detalhe.funcionario_id ?? "") ??
                              "—",
                            UserRound,
                          ],
                          [
                            "Encarregado",
                            nomeMap.func.get(detalhe.encarregado_id ?? "") ??
                              "—",
                            UserRound,
                          ],
                          [
                            "Empresa",
                            nomeMap.empresa.get(detalhe.empresa_id ?? "") ??
                              "—",
                            Building2,
                          ],
                        ].map(([chave, valor, Icon]) => (
                          <div key={chave as string} className="rounded-lg border p-3">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              {(() => {
                                const IconComponent = Icon as typeof UserRound;
                                return <IconComponent className="size-3.5" />;
                              })()}
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                                {chave as string}
                              </p>
                            </div>
                            <p className="mt-1 text-sm font-medium">
                              {valor as string}
                            </p>
                          </div>
                        ))}

                        <div className="rounded-lg border p-3 sm:col-span-2 lg:col-span-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <UsersRound className="size-3.5" />
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                              Equipe responsável pelo estoque
                            </p>
                          </div>
                          <p className="mt-1 text-sm font-medium">{equipe}</p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border bg-muted/10 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Observação
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                        {detalhe.observacao?.trim() ||
                          "Nenhuma observação registrada."}
                      </p>
                    </section>
                  </div>
                </div>

                <div className="shrink-0 border-t bg-background/95 px-5 py-3 backdrop-blur sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Registro da movimentação selecionada.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDetalhe(null)}
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
