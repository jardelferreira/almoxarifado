import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export function RelatorioEquipamentosMovimentacoes({
  dados,
  projetoNome,
}: {
  dados: RelatorioEquipamentosMovimentacoes;
  projetoNome: string;
}) {
  const [busca, setBusca] = useState("");

  const linhas = useMemo<RelatorioMovimentacaoLinha[]>(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return dados.linhas;

    return dados.linhas.filter((linha) =>
      [
        linha.movimentacao.tipo,
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
        ),
    );
  }, [busca, dados.linhas]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <Resumo label="Movimentações" value={dados.totalMovimentacoes} />
          <Resumo label="Quantidade movimentada" value={dados.quantidade} />
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
                  exportarRelatorioEquipamentosMovimentacoes(dados, "xlsx")
                }
              >
                <FileSpreadsheet className="mr-2 size-4" />
                Excel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() =>
                  imprimirRelatorioEquipamentosMovimentacoes(dados, projetoNome)
                }
              >
                <Printer className="mr-2 size-4" />
                Imprimir / PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportarRelatorioEquipamentosMovimentacoes(dados, "csv")
                }
              >
                <Download className="mr-2 size-4" />
                CSV
              </Button>
            </div>
          </div>

          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar tipo, equipamento, pessoa ou documento..."
              className="pl-9"
            />
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
