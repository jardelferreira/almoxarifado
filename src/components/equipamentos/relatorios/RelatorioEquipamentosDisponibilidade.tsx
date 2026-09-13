import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  RelatorioDisponibilidadeLinha,
  RelatorioEquipamentosDisponibilidade,
} from "@/services/equipamentos/relatorios";
import {
  exportarRelatorioEquipamentosDisponibilidade,
  imprimirRelatorioEquipamentosDisponibilidade,
} from "@/services/equipamentos/relatorios";

export function RelatorioEquipamentosDisponibilidade({
  dados,
  projetoNome,
}: {
  dados: RelatorioEquipamentosDisponibilidade;
  projetoNome: string;
}) {
  const [busca, setBusca] = useState("");

  const linhas = useMemo<RelatorioDisponibilidadeLinha[]>(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return dados.linhas;

    return dados.linhas.filter((linha) =>
      [
        linha.equipamento.nome,
        linha.categoria?.nome,
        linha.identificacao,
        linha.estoque.patrimonio,
        linha.estoque.serial,
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
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Resumo label="Equipamentos" value={dados.totalEquipamentos} />
          <Resumo label="Em estoque" value={dados.quantidadeEstoque} />
          <Resumo label="Disponível" value={dados.disponivel} />
          <Resumo label="Em uso" value={dados.emUso} />
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
                  exportarRelatorioEquipamentosDisponibilidade(dados, "xlsx")
                }
              >
                <FileSpreadsheet className="mr-2 size-4" />
                Excel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() =>
                  imprimirRelatorioEquipamentosDisponibilidade(dados, projetoNome)
                }
              >
                <Printer className="mr-2 size-4" />
                Imprimir / PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportarRelatorioEquipamentosDisponibilidade(dados, "csv")
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
              placeholder="Buscar equipamento ou identificação..."
              className="pl-9"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Equipamento</th>
                  <th className="px-4 py-3 text-left font-medium">Identificação</th>
                  <th className="px-4 py-3 text-right font-medium">Estoque</th>
                  <th className="px-4 py-3 text-right font-medium">Disponível</th>
                  <th className="px-4 py-3 text-right font-medium">Em uso</th>
                  <th className="px-4 py-3 text-right font-medium">Manutenção</th>
                  <th className="px-4 py-3 text-left font-medium">Observações</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr key={linha.estoqueId} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{linha.equipamento.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {linha.categoria?.nome ?? "Sem categoria"}
                      </div>
                    </td>
                    <td className="px-4 py-3">{linha.identificacao}</td>
                    <td className="px-4 py-3 text-right">{linha.quantidadeEstoque}</td>
                    <td className="px-4 py-3 text-right font-semibold">{linha.disponivel}</td>
                    <td className="px-4 py-3 text-right">{linha.emUso}</td>
                    <td className="px-4 py-3 text-right">{linha.manutencao}</td>
                    <td className="px-4 py-3">{linha.estoque.observacoes ?? "—"}</td>
                  </tr>
                ))}
                {!linhas.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum equipamento encontrado.
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
