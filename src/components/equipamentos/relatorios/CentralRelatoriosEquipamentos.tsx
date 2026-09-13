import { useState } from "react";
import {
  BarChart3,
  Construction,
  FileClock,
  Package,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RelatorioEquipamentosSituacao } from "@/components/equipamentos/relatorios/RelatorioEquipamentosSituacao";
import { RelatorioEquipamentosEquipe } from "@/components/equipamentos/relatorios/RelatorioEquipamentosEquipe";
import { RelatorioEquipamentosEmUso } from "@/components/equipamentos/relatorios/RelatorioEquipamentosEmUso";
import { RelatorioEquipamentosResponsavel } from "@/components/equipamentos/relatorios/RelatorioEquipamentosResponsavel";
import { RelatorioEquipamentosDisponibilidade } from "@/components/equipamentos/relatorios/RelatorioEquipamentosDisponibilidade";
import { RelatorioEquipamentosManutencao } from "@/components/equipamentos/relatorios/RelatorioEquipamentosManutencao";
import { RelatorioEquipamentosMovimentacoes } from "@/components/equipamentos/relatorios/RelatorioEquipamentosMovimentacoes";
import type {
  RelatorioEquipamentosSituacao as DadosRelatorioSituacao,
  RelatorioEquipamentosEquipe as DadosRelatorioEquipe,
  RelatorioEquipamentosEmUso as DadosRelatorioEmUso,
  RelatorioEquipamentosPorResponsavel as DadosRelatorioResponsavel,
  RelatorioEquipamentosDisponibilidade as DadosRelatorioDisponibilidade,
  RelatorioEquipamentosManutencao as DadosRelatorioManutencao,
  RelatorioEquipamentosMovimentacoes as DadosRelatorioMovimentacoes,
} from "@/services/equipamentos/relatorios";

type RelatorioId =
  | "situacao"
  | "equipe"
  | "uso"
  | "responsavel"
  | "disponibilidade"
  | "manutencao"
  | "movimentacoes";

type RelatorioOpcao = {
  id: RelatorioId;
  label: string;
  descricao: string;
  icon: typeof BarChart3;
  disponivel: boolean;
};

const relatorios: RelatorioOpcao[] = [
  {
    id: "situacao",
    label: "Por situação",
    descricao: "Visão atual dos equipamentos",
    icon: BarChart3,
    disponivel: true,
  },
  {
    id: "equipe",
    label: "Por equipe",
    descricao: "Distribuição por equipe",
    icon: Users,
    disponivel: true,
  },
  {
    id: "uso",
    label: "Em uso",
    descricao: "Equipamentos apropriados",
    icon: UserRound,
    disponivel: true,
  },
  {
    id: "responsavel",
    label: "Por responsável",
    descricao: "Equipamentos por pessoa",
    icon: Users,
    disponivel: true,
  },
  {
    id: "disponibilidade",
    label: "Disponibilidade",
    descricao: "Equipamentos disponíveis",
    icon: Package,
    disponivel: true,
  },
  {
    id: "manutencao",
    label: "Manutenção",
    descricao: "Equipamentos em manutenção",
    icon: Wrench,
    disponivel: true,
  },
  {
    id: "movimentacoes",
    label: "Movimentações",
    descricao: "Histórico de movimentações",
    icon: FileClock,
    disponivel: true,
  },
];

export function CentralRelatoriosEquipamentos({
  dadosSituacao,
  dadosEquipe,
  dadosEmUso,
  dadosResponsavel,
  dadosDisponibilidade,
  dadosManutencao,
  dadosMovimentacoes,
  projetoNome,
}: {
  dadosSituacao: DadosRelatorioSituacao;
  dadosEquipe: DadosRelatorioEquipe;
  dadosEmUso: DadosRelatorioEmUso;
  dadosResponsavel: DadosRelatorioResponsavel;
  dadosDisponibilidade: DadosRelatorioDisponibilidade;
  dadosManutencao: DadosRelatorioManutencao;
  dadosMovimentacoes: DadosRelatorioMovimentacoes;
  projetoNome: string;
}) {
  const [relatorioAtivo, setRelatorioAtivo] =
    useState<RelatorioId>("situacao");

  const ativo = relatorios.find((item) => item.id === relatorioAtivo);
  const AtivoIcon = ativo?.icon;

  if (!ativo || !AtivoIcon) {
    return null;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <BarChart3 className="size-4 text-primary" aria-hidden="true" />
            Equipamentos · Relatórios
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Visões operacionais
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Analise o estado atual, uso, disponibilidade, manutenção e movimentações do projeto ativo.
          </p>
        </div>
        <Badge variant="outline" className="w-fit shrink-0">Projeto ativo</Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
        <Card className="overflow-hidden">
          <CardContent className="p-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
              {relatorios.map((item) => {
                const Icon = item.icon;
                const selecionado = item.id === relatorioAtivo;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!item.disponivel}
                    onClick={() => {
                      if (item.disponivel) {
                        setRelatorioAtivo(item.id);
                      }
                    }}
                    className={cn(
                      "group flex min-w-[175px] shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors lg:w-full",
                      selecionado
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                      !item.disponivel && "cursor-not-allowed opacity-50",
                    )}
                    aria-current={selecionado ? "page" : undefined}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-md",
                        selecionado
                          ? "bg-primary-foreground/15"
                          : "bg-muted",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.label}
                      </span>
                      <span
                        className={cn(
                          "hidden truncate text-xs lg:block",
                          selecionado
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {item.descricao}
                      </span>
                    </span>

                    {!item.disponivel && (
                      <Badge
                        variant="secondary"
                        className="hidden text-[10px] lg:inline-flex"
                      >
                        Em breve
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <section className="min-w-0" aria-labelledby="relatorio-atual">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <AtivoIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="relatorio-atual" className="font-display text-xl font-bold tracking-tight">
                {ativo.label}
              </h2>
              <p className="text-xs text-muted-foreground">{ativo.descricao}</p>
            </div>
          </div>

          {relatorioAtivo === "situacao" && (
            <RelatorioEquipamentosSituacao
              dados={dadosSituacao}
              projetoNome={projetoNome}
            />
          )}

          {relatorioAtivo === "equipe" && (
            <RelatorioEquipamentosEquipe
              dados={dadosEquipe}
              projetoNome={projetoNome}
            />
          )}

          {relatorioAtivo === "uso" && (
            <RelatorioEquipamentosEmUso
              dados={dadosEmUso}
              projetoNome={projetoNome}
            />
          )}

          {relatorioAtivo === "responsavel" && (
            <RelatorioEquipamentosResponsavel
              dados={dadosResponsavel}
              projetoNome={projetoNome}
            />
          )}

          {relatorioAtivo === "disponibilidade" && (
            <RelatorioEquipamentosDisponibilidade
              dados={dadosDisponibilidade}
              projetoNome={projetoNome}
            />
          )}

          {relatorioAtivo === "manutencao" && (
            <RelatorioEquipamentosManutencao
              dados={dadosManutencao}
              projetoNome={projetoNome}
            />
          )}

          {relatorioAtivo === "movimentacoes" && (
            <RelatorioEquipamentosMovimentacoes
              dados={dadosMovimentacoes}
              projetoNome={projetoNome}
            />
          )}
        </section>
      </div>

    </div>
  );
}
