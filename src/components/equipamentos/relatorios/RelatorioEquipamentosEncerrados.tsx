import { useMemo, useState } from "react";
import {
  ArchiveX,
  Download,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  RelatorioEquipamentoEncerradoLinha,
  RelatorioEquipamentosEncerrados,
} from "@/services/equipamentos/relatorios";
import {
  exportarRelatorioEquipamentosEncerrados,
  imprimirRelatorioEquipamentosEncerrados,
  motivoEncerramentoLabel,
} from "@/services/equipamentos/relatorios";

export function RelatorioEquipamentosEncerrados({
  dados,
  projetoNome,
}: {
  dados: RelatorioEquipamentosEncerrados;
  projetoNome: string;
}) {
  const [busca, setBusca] = useState("");

  const linhas = useMemo<RelatorioEquipamentoEncerradoLinha[]>(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return dados.linhas;

    return dados.linhas.filter((linha) =>
      [
        linha.equipamento.nome,
        linha.equipamento.marca,
        linha.equipamento.modelo,
        linha.categoria?.nome,
        linha.estoque.identificacao,
        linha.estoque.patrimonio,
        linha.estoque.serial,
        linha.empresa?.nome,
        motivoEncerramentoLabel(linha.motivo),
        linha.estoque.observacoes,
      ]
        .filter(Boolean)
        .some((valor) =>
          String(valor)
            .toLocaleLowerCase("pt-BR")
            .includes(termo),
        ),
    );
  }, [busca, dados.linhas]);

  const resumo = useMemo(
    () => ({
      registros: linhas.length,
      quantidade: linhas.reduce(
        (total, linha) => total + linha.quantidadeOriginal,
        0,
      ),
      baixado: linhas.reduce((total, linha) => total + linha.baixado, 0),
      devolvido: linhas.reduce((total, linha) => total + linha.devolvido, 0),
    }),
    [linhas],
  );

  const limpar = () => setBusca("");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Resumo label="Registros" value={resumo.registros} />
          <Resumo label="Quantidade encerrada" value={resumo.quantidade} />
          <Resumo label="Baixado" value={resumo.baixado} />
          <Resumo label="Devolvido" value={resumo.devolvido} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-red-50 text-red-700">
                <ArchiveX className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Registros encerrados</p>
                <p className="text-xs text-muted-foreground">
                  Somente registros com saldo atual igual a zero.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() =>
                  imprimirRelatorioEquipamentosEncerrados(
                    projetoNome,
                    linhas,
                  )
                }
              >
                <Printer className="mr-2 size-4" />
                Imprimir / PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  exportarRelatorioEquipamentosEncerrados(linhas, "xlsx")
                }
              >
                <FileSpreadsheet className="mr-2 size-4" />
                Excel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  exportarRelatorioEquipamentosEncerrados(linhas, "csv")
                }
              >
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-end">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar equipamento, identificação, proprietário ou motivo..."
                className="pl-9"
              />
            </div>

            {busca && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 gap-2"
                onClick={limpar}
              >
                <RotateCcw className="size-3.5" />
                Limpar
              </Button>
            )}
          </div>

          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold">
                    Equipamento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">
                    Categoria
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">
                    Identificação
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">
                    Proprietário
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">
                    Motivo
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">
                    Original
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">
                    Baixado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">
                    Devolvido
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">
                    Observações
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, index) => (
                  <tr
                    key={linha.estoqueId}
                    className={index % 2 ? "border-b bg-muted/20" : "border-b"}
                  >
                    <td className="px-4 py-3 font-medium">
                      {linha.equipamento.nome}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {linha.categoria?.nome ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {linha.estoque.identificacao ||
                        linha.estoque.patrimonio ||
                        linha.estoque.serial ||
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      {linha.empresa?.nome ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {motivoEncerramentoLabel(linha.motivo)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {linha.quantidadeOriginal}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {linha.baixado}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {linha.devolvido}
                    </td>
                    <td className="max-w-[280px] px-4 py-3 text-muted-foreground">
                      {linha.estoque.observacoes || "—"}
                    </td>
                  </tr>
                ))}

                {!linhas.length && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      {dados.linhas.length
                        ? "Nenhum registro corresponde à busca."
                        : "Nenhum equipamento baixado ou encerrado neste projeto."}
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
    <div className="rounded-xl border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight">
        {value}
      </p>
    </div>
  );
}
