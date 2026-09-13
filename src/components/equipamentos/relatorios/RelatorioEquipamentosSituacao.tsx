import { useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Printer, RotateCcw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  RelatorioEquipamentoLinha,
  RelatorioEquipamentosSituacao,
  SituacaoEquipamento,
} from "@/services/equipamentos/relatorios";
import {
  exportarRelatorioEquipamentosSituacao,
  imprimirRelatorioEquipamentosSituacao,
  situacaoLabel,
} from "@/services/equipamentos/relatorios";

const situacoes: Array<{ value: "TODAS" | SituacaoEquipamento; label: string }> = [
  { value: "TODAS", label: "Todas as situações" },
  { value: "DISPONIVEL", label: "Disponível" },
  { value: "EM_USO", label: "Em uso" },
  { value: "MANUTENCAO", label: "Manutenção" },
  { value: "ENCERRADO", label: "Encerrado" },
  { value: "MISTO", label: "Misto" },
];

function statusClass(status: SituacaoEquipamento) {
  switch (status) {
    case "DISPONIVEL":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "EM_USO":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "MANUTENCAO":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "ENCERRADO":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function RelatorioEquipamentosSituacao({
  dados,
  projetoNome,
}: {
  dados: RelatorioEquipamentosSituacao;
  projetoNome: string;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("TODAS");
  const [situacao, setSituacao] = useState<"TODAS" | SituacaoEquipamento>("TODAS");

  const categorias = useMemo(() => {
    const nomes = new Set(
      dados.linhas
        .map((linha) => linha.categoria?.nome)
        .filter((nome): nome is string => Boolean(nome)),
    );
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [dados.linhas]);

  const linhas = useMemo<RelatorioEquipamentoLinha[]>(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");

    return dados.linhas.filter((linha) => {
      if (categoria !== "TODAS" && linha.categoria?.nome !== categoria) return false;
      if (situacao !== "TODAS" && linha.situacao !== situacao) return false;
      if (!termo) return true;

      return [
        linha.equipamento.nome,
        linha.equipamento.marca,
        linha.equipamento.modelo,
        linha.categoria?.nome,
        linha.estoque.identificacao,
        linha.estoque.patrimonio,
        linha.estoque.serial,
        linha.empresa?.nome,
        localizacao(linha),
        linha.estoque.observacoes,
      ]
        .filter(Boolean)
        .some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo));
    });
  }, [busca, categoria, dados.linhas, situacao]);

  const resumoFiltrado = useMemo(() => {
    return linhas.reduce(
      (acc, linha) => {
        acc.total += linha.estado.saldo;
        acc.disponivel += linha.estado.disponivel;
        acc.emUso += linha.estado.apropriado;
        acc.manutencao += linha.estado.manutencao;
        acc.encerrado += linha.estado.devolvido + linha.estado.baixado;
        return acc;
      },
      { total: 0, disponivel: 0, emUso: 0, manutencao: 0, encerrado: 0 },
    );
  }, [linhas]);

  const limparFiltros = () => {
    setBusca("");
    setCategoria("TODAS");
    setSituacao("TODAS");
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <Resumo label="Total" value={dados.resumo.total} />
          <Resumo label="Disponível" value={dados.resumo.disponivel} destaque="emerald" />
          <Resumo label="Em uso" value={dados.resumo.emUso} destaque="blue" />
          <Resumo label="Manutenção" value={dados.resumo.manutencao} destaque="amber" />
          <Resumo label="Encerrado" value={dados.resumo.encerrado} destaque="red" />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Visão atual do estoque</p>
                <p className="text-xs text-muted-foreground">
                  {linhas.length} {linhas.length === 1 ? "registro encontrado" : "registros encontrados"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="default" size="sm" onClick={() => imprimirRelatorioEquipamentosSituacao(projetoNome, linhas, resumoFiltrado)}>
                <Printer className="mr-2 size-4" />
                Imprimir / PDF
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => exportarRelatorioEquipamentosSituacao(linhas, "xlsx")}>
                <FileSpreadsheet className="mr-2 size-4" />
                Excel
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => exportarRelatorioEquipamentosSituacao(linhas, "csv")}>
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </div>
          </div>

          <div className="grid gap-3 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto] lg:items-end">
            <div className="space-y-1.5">
              <label htmlFor="busca-situacao" className="text-xs font-semibold text-foreground">Pesquisar</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="busca-situacao" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Equipamento, patrimônio, série..." className="pl-9" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="categoria-situacao" className="text-xs font-semibold text-foreground">Categoria</label>
              <select id="categoria-situacao" value={categoria} onChange={(event) => setCategoria(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20">
                <option value="TODAS">Todas as categorias</option>
                {categorias.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="status-situacao" className="text-xs font-semibold text-foreground">Situação</label>
              <select id="status-situacao" value={situacao} onChange={(event) => setSituacao(event.target.value as "TODAS" | SituacaoEquipamento)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20">
                {situacoes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={limparFiltros} className="justify-start gap-2 lg:justify-center">
              <RotateCcw className="size-4" />
              Limpar filtros
            </Button>
          </div>

          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Equipamento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Categoria</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Identificação</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Localização / Responsável</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Situação</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Saldo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Disponível</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Em uso</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Manut.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Observações</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, index) => (
                  <tr key={linha.estoque.id} className={index % 2 ? "border-b bg-muted/20" : "border-b"}>
                    <td className="px-4 py-3 font-medium">{linha.equipamento.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{linha.categoria?.nome ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{linha.estoque.identificacao || linha.estoque.patrimonio || linha.estoque.serial || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{localizacao(linha)}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className={statusClass(linha.situacao)}>{situacaoLabel(linha.situacao)}</Badge></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{linha.estado.saldo}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{linha.estado.disponivel}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{linha.estado.apropriado}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{linha.estado.manutencao}</td>
                    <td className="max-w-[280px] px-4 py-3 text-muted-foreground">{linha.estoque.observacoes || "—"}</td>
                  </tr>
                ))}
                {!linhas.length && <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum equipamento encontrado para os filtros atuais.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function localizacao(linha: RelatorioEquipamentoLinha) {
  if (linha.responsaveis.length) return linha.responsaveis.map((item) => item.nome).join(", ");
  if (linha.equipesAtuais.length) return linha.equipesAtuais.map((item) => item.nome).join(", ");
  if (linha.estado.empresa > 0) return "Manutenção externa";
  if (linha.estado.manutencao > 0) return "Manutenção";
  if (linha.estado.disponivel > 0) return "Almoxarifado";
  if (linha.equipe) return linha.equipe.nome;
  return "—";
}

function Resumo({ label, value, destaque }: { label: string; value: number; destaque?: "emerald" | "blue" | "amber" | "red" }) {
  const classes = {
    emerald: "border-emerald-200 bg-emerald-50/60",
    blue: "border-blue-200 bg-blue-50/60",
    amber: "border-amber-200 bg-amber-50/60",
    red: "border-red-200 bg-red-50/60",
  };
  return (
    <div className={`rounded-xl border p-3 ${destaque ? classes[destaque] : "bg-background"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
