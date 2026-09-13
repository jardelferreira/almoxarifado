import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Search,
  Printer,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  exportarRelatorioEquipamentosPorResponsavel,
  imprimirRelatorioEquipamentosPorResponsavel,
  type RelatorioEquipamentosPorResponsavel,
  type RelatorioResponsavelLinha,
} from "@/services/equipamentos/relatorios";

export function RelatorioEquipamentosResponsavel({
  dados,
  projetoNome,
}: {
  dados: RelatorioEquipamentosPorResponsavel;
  projetoNome: string;
}) {
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const linhasFiltradas = useMemo<RelatorioResponsavelLinha[]>(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");

    if (!termo) return dados.linhas;

    return dados.linhas.filter((linha) => {
      const camposResponsavel = [
        linha.funcionario.nome,
        linha.equipe?.nome,
      ];

      const camposEquipamentos = linha.equipamentos.flatMap((item) => [
        item.equipamento.nome,
        item.categoria?.nome,
        item.identificacao,
        item.estoque.patrimonio,
        item.estoque.serial,
      ]);

      return [...camposResponsavel, ...camposEquipamentos]
        .filter(Boolean)
        .some((valor) =>
          String(valor).toLocaleLowerCase("pt-BR").includes(termo),
        );
    });
  }, [busca, dados.linhas]);

  const alternar = (funcionarioId: string) => {
    setAbertos((atual) => {
      const novo = new Set(atual);

      if (novo.has(funcionarioId)) {
        novo.delete(funcionarioId);
      } else {
        novo.add(funcionarioId);
      }

      return novo;
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <ResumoCard
            label="Responsáveis"
            value={dados.totalResponsaveis}
            icon={<UserRound className="size-4" />}
          />
          <ResumoCard
            label="Registros"
            value={dados.totalRegistros}
            icon={<FileSpreadsheet className="size-4" />}
          />
          <ResumoCard
            label="Quantidade em uso"
            value={dados.quantidade}
            icon={<UserRound className="size-4" />}
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
                  exportarRelatorioEquipamentosPorResponsavel(dados, "xlsx")
                }
              >
                <FileSpreadsheet className="mr-2 size-4" />
                Excel
              </Button>

              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() =>
                  imprimirRelatorioEquipamentosPorResponsavel(dados, projetoNome)
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
                  exportarRelatorioEquipamentosPorResponsavel(dados, "csv")
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
              placeholder="Buscar responsável, equipe ou equipamento..."
              className="pl-9"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="w-10 px-3 py-3" />
                  <th className="px-4 py-3 text-left font-medium">
                    Responsável
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    Equipe
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Registros
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Quantidade
                  </th>
                </tr>
              </thead>

              <tbody>
                {linhasFiltradas.map((linha) => {
                  const aberto = abertos.has(linha.funcionario.id);

                  return (
                    <ResponsavelRow
                      key={linha.funcionario.id}
                      linha={linha}
                      aberto={aberto}
                      onToggle={() => alternar(linha.funcionario.id)}
                    />
                  );
                })}

                {!linhasFiltradas.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      {dados.linhas.length
                        ? "Nenhum registro corresponde à busca."
                        : "Nenhum equipamento está em uso por responsáveis neste projeto."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Exibindo {linhasFiltradas.length} de {dados.linhas.length} responsáveis.
            </span>
            <span>
              Os equipamentos são considerados somente enquanto houver quantidade apropriada ao funcionário.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ResponsavelRow({
  linha,
  aberto,
  onToggle,
}: {
  linha: RelatorioResponsavelLinha;
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b">
        <td className="px-3 py-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex size-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label={aberto ? "Recolher equipamentos" : "Ver equipamentos"}
          >
            {aberto ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        </td>

        <td className="px-4 py-3">
          <div className="font-medium">{linha.funcionario.nome}</div>
          {linha.funcionario.matricula && (
            <div className="text-xs text-muted-foreground">
              Matrícula: {linha.funcionario.matricula}
            </div>
          )}
        </td>

        <td className="px-4 py-3">
          {linha.equipe ? (
            <Badge variant="secondary">{linha.equipe.nome}</Badge>
          ) : (
            <span className="text-muted-foreground">Sem equipe</span>
          )}
        </td>

        <td className="px-4 py-3 text-right">{linha.registros}</td>

        <td className="px-4 py-3 text-right font-semibold">
          {linha.quantidade}
        </td>
      </tr>

      {aberto &&
        linha.equipamentos.map((equipamento) => (
          <tr
            key={`${equipamento.estoqueId}-${equipamento.funcionario.id}`}
            className="border-b bg-muted/20"
          >
            <td />
            <td colSpan={2} className="px-4 py-3">
              <div className="pl-4">
                <div className="font-medium">
                  {equipamento.equipamento.nome}
                </div>
                <div className="text-xs text-muted-foreground">
                  {equipamento.categoria?.nome ?? "Sem categoria"}
                </div>
                {equipamento.estoque.observacoes && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Obs.: {equipamento.estoque.observacoes}
                  </div>
                )}
              </div>
            </td>
            <td className="px-4 py-3 text-right text-muted-foreground">
              {equipamento.identificacao}
            </td>
            <td className="px-4 py-3 text-right font-semibold">
              {equipamento.quantidade}
            </td>
          </tr>
        ))}
    </>
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
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
