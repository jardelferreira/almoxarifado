import { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Search,
  Printer,
  UserCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  exportarRelatorioEquipamentosEmUso,
  imprimirRelatorioEquipamentosEmUso,
  type RelatorioEquipamentosEmUso,
  type RelatorioEquipamentoEmUsoLinha,
} from "@/services/equipamentos/relatorios";

export function RelatorioEquipamentosEmUso({
  dados,
  projetoNome,
}: {
  dados: RelatorioEquipamentosEmUso;
  projetoNome: string;
}) {
  const [busca, setBusca] = useState("");

  const linhasFiltradas = useMemo<RelatorioEquipamentoEmUsoLinha[]>(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");

    if (!termo) {
      return dados.linhas;
    }

    return dados.linhas.filter((linha: RelatorioEquipamentoEmUsoLinha) =>
      [
        linha.equipamento.nome,
        linha.categoria?.nome,
        linha.identificacao,
        linha.estoque.patrimonio,
        linha.estoque.serial,
        linha.funcionario.nome,
        linha.equipe?.nome,
      ]
        .filter(Boolean)
        .some((valor) =>
          String(valor).toLocaleLowerCase("pt-BR").includes(termo),
        ),
    );
  }, [busca, dados.linhas]);

  const relatorioFiltrado = useMemo<RelatorioEquipamentosEmUso>(() => ({
    ...dados,
    linhas: linhasFiltradas,
    totalRegistros: linhasFiltradas.length,
    quantidade: linhasFiltradas.reduce((total, linha) => total + linha.quantidade, 0),
    responsaveis: new Set(linhasFiltradas.map((linha) => linha.funcionario.id)).size,
    equipes: new Set(
      linhasFiltradas
        .map((linha) => linha.equipe?.id)
        .filter((id): id is string => Boolean(id)),
    ).size,
  }), [dados, linhasFiltradas]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <ResumoCard
            label="Registros em uso"
            value={relatorioFiltrado.totalRegistros}
            icon={<UserCheck className="size-4" />}
          />
          <ResumoCard
            label="Quantidade em uso"
            value={relatorioFiltrado.quantidade}
            icon={<FileSpreadsheet className="size-4" />}
          />
          <ResumoCard
            label="Responsáveis"
            value={relatorioFiltrado.responsaveis}
            icon={<UserCheck className="size-4" />}
          />
          <ResumoCard
            label="Equipes"
            value={relatorioFiltrado.equipes}
            icon={<Users className="size-4" />}
          />
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
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  exportarRelatorioEquipamentosEmUso(relatorioFiltrado, "xlsx")
                }
              >
                <FileSpreadsheet className="mr-2 size-4" />
                Excel
              </Button>

              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => imprimirRelatorioEquipamentosEmUso(relatorioFiltrado, projetoNome)}
              >
                <Printer className="mr-2 size-4" />
                Imprimir / PDF
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  exportarRelatorioEquipamentosEmUso(relatorioFiltrado, "csv")
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
              placeholder="Buscar equipamento, identificação, responsável ou equipe..."
              className="pl-9"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">
                    Equipamento
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    Identificação
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    Responsável
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    Equipe
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Quantidade
                  </th>
                </tr>
              </thead>

              <tbody>
                {linhasFiltradas.map((linha: RelatorioEquipamentoEmUsoLinha) => (
                  <tr
                    key={`${linha.estoqueId}-${linha.funcionario.id}`}
                    className="border-b last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {linha.equipamento.nome}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {linha.categoria?.nome ?? "Sem categoria"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div>{linha.identificacao}</div>
                      {linha.estoque.serial && (
                        <div className="text-xs text-muted-foreground">
                          Serial: {linha.estoque.serial}
                        </div>
                      )}
                      {linha.estoque.observacoes && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Obs.: {linha.estoque.observacoes}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 font-medium">
                      {linha.funcionario.nome}
                    </td>

                    <td className="px-4 py-3">
                      {linha.equipe ? (
                        <Badge variant="secondary">
                          {linha.equipe.nome}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          Sem equipe
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-semibold">
                      {linha.quantidade}
                    </td>
                  </tr>
                ))}

                {!linhasFiltradas.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      {dados.linhas.length
                        ? "Nenhum registro corresponde à busca."
                        : "Nenhum equipamento está em uso neste projeto."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Exibindo {linhasFiltradas.length} de {dados.linhas.length} registros.
            </span>
            <span>
              Considera somente quantidades atualmente apropriadas a funcionários.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ResumoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
        {icon}
      </div>

      <div className="mt-2 text-2xl font-bold tracking-tight">
        {value}
      </div>
    </div>
  );
}
