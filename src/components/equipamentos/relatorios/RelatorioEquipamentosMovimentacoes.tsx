import { useMemo, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Download,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  RelatorioEquipamentosMovimentacoes,
  RelatorioMovimentacaoLinha,
} from "@/services/equipamentos/relatorios";
import {
  exportarRelatorioEquipamentosMovimentacoes,
  imprimirRelatorioEquipamentosMovimentacoes,
  formatarDataHoraRelatorio,
  rotuloTipoMovimentacao,
} from "@/services/equipamentos/relatorios";
import { Badge } from "@/components/ui/badge";

export function RelatorioEquipamentosMovimentacoes({
  dados,
  projetoNome,
}: {
  dados: RelatorioEquipamentosMovimentacoes;
  projetoNome: string;
}) {
  const [busca, setBusca] = useState("");
  const [filtroTipos, setFiltroTipos] = useState<string[]>([]);

  const tiposDisponiveis = useMemo(() => {
    const valores = new Set(
      dados.linhas.map((linha) => linha.movimentacao.tipo),
    );

    return [...valores].sort((a, b) =>
      rotuloTipoMovimentacao(a).localeCompare(
        rotuloTipoMovimentacao(b),
        "pt-BR",
      ),
    );
  }, [dados.linhas]);

  const linhas = useMemo<RelatorioMovimentacaoLinha[]>(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");

    return dados.linhas.filter((linha) => {
      if (
        filtroTipos.length > 0 &&
        !filtroTipos.includes(linha.movimentacao.tipo)
      ) {
        return false;
      }

      if (!termo) return true;

      return [
        linha.movimentacao.tipo,
        rotuloTipoMovimentacao(linha.movimentacao.tipo),
        linha.equipamento?.nome,
        linha.estoque?.identificacao,
        linha.estoque?.patrimonio,
        linha.estoque?.serial,
        linha.funcionarioOrigem?.nome,
        linha.funcionarioDestino?.nome,
        linha.equipeOrigem?.nome,
        linha.equipeDestino?.nome,
        linha.estoque?.referencia_documento,
        linha.movimentacao.observacoes,
      ]
        .filter(Boolean)
        .some((valor) =>
          String(valor).toLocaleLowerCase("pt-BR").includes(termo),
        );
    });
  }, [busca, dados.linhas, filtroTipos]);

  const relatorioFiltrado = useMemo<RelatorioEquipamentosMovimentacoes>(() => ({
    ...dados,
    linhas,
    totalMovimentacoes: linhas.length,
    quantidade: linhas.reduce(
      (total, linha) => total + linha.movimentacao.quantidade,
      0,
    ),
  }), [dados, linhas]);

  const limparFiltros = () => {
    setBusca("");
    setFiltroTipos([]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <Resumo label="Movimentações" value={relatorioFiltrado.totalMovimentacoes} />
          <Resumo label="Quantidade movimentada" value={relatorioFiltrado.quantidade} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Ações
              </p>
              <p className="text-sm text-muted-foreground">Exporte ou imprima a visão atual.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportarRelatorioEquipamentosMovimentacoes(relatorioFiltrado, "xlsx")
                }
              >
                <FileSpreadsheet className="mr-2 size-4" />
                Excel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() =>
                  imprimirRelatorioEquipamentosMovimentacoes(relatorioFiltrado, projetoNome)
                }
              >
                <Printer className="mr-2 size-4" />
                Imprimir / PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportarRelatorioEquipamentosMovimentacoes(relatorioFiltrado, "csv")
                }
              >
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar tipo, equipamento, pessoa ou documento..."
                className="pl-9"
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 min-w-[190px] justify-between"
                >
                  <span className="truncate">
                    Tipo:{" "}
                    {filtroTipos.length === 0
                      ? "Todos"
                      : `${filtroTipos.length} selecionados`}
                  </span>
                  {filtroTipos.length ? (
                    <Badge variant="secondary">{filtroTipos.length}</Badge>
                  ) : (
                    <ChevronsUpDown className="size-3.5 text-muted-foreground" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[290px] p-2">
                <div className="flex items-center justify-between border-b px-2 pb-2">
                  <div>
                    <p className="text-sm font-semibold">Tipo de movimentação</p>
                    <p className="text-xs text-muted-foreground">
                      Selecione um ou mais tipos.
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setFiltroTipos(tiposDisponiveis)}
                    >
                      Todos
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setFiltroTipos([])}
                    >
                      Limpar
                    </Button>
                  </div>
                </div>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {tiposDisponiveis.map((tipo) => {
                    const checked = filtroTipos.includes(tipo);
                    return (
                      <button
                        key={tipo}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                        onClick={() =>
                          setFiltroTipos((atual) =>
                            checked
                              ? atual.filter((item) => item !== tipo)
                              : [...atual, tipo],
                          )
                        }
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background"
                          }`}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {rotuloTipoMovimentacao(tipo)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {(busca || filtroTipos.length > 0) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 gap-2"
                onClick={limparFiltros}
              >
                <RotateCcw className="size-3.5" />
                Limpar
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Exibindo {linhas.length} de {dados.linhas.length} movimentações.
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Data / hora</th>
                  <th className="px-4 py-3 text-left font-medium">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium">Equipamento</th>
                  <th className="px-4 py-3 text-left font-medium">Origem</th>
                  <th className="px-4 py-3 text-left font-medium">Destino</th>
                  <th className="px-4 py-3 text-right font-medium">Quantidade</th>
                  <th className="px-4 py-3 text-left font-medium">Observações</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr key={linha.movimentacao.id} className="border-b last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatarDataHoraRelatorio(linha.movimentacao.criado_em)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {rotuloTipoMovimentacao(linha.movimentacao.tipo)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {linha.equipamento?.nome ?? "Equipamento não encontrado"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {linha.estoque?.identificacao ||
                          linha.estoque?.patrimonio ||
                          linha.estoque?.serial ||
                          "Sem identificação"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {linha.funcionarioOrigem?.nome ||
                        linha.equipeOrigem?.nome ||
                        linha.movimentacao.tipo_origem}
                    </td>
                    <td className="px-4 py-3">
                      {linha.funcionarioDestino?.nome ||
                        linha.equipeDestino?.nome ||
                        linha.movimentacao.tipo_destino}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {linha.movimentacao.quantidade}
                    </td>
                    <td className="px-4 py-3">
                      {linha.movimentacao.observacoes ||
                        linha.estoque?.observacoes ||
                        "—"}
                    </td>
                  </tr>
                ))}
                {!linhas.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhuma movimentação encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Resumo({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
