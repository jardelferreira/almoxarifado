import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BarChart3,
  CalendarClock,
  ChartNoAxesCombined,
  Check,
  CircleDollarSign,
  Clock3,
  Gauge,
  HardHat,
  Loader2,
  PackageCheck,
  RotateCcw,
  ShieldAlert,
  ToolCase,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { estatisticasEquipamentosRepo } from "@/services/equipamentos/estatisticas-equipamentos";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import type { EstatisticasEquipamentosResumo } from "@/types";

export const Route = createFileRoute("/app/estatisticas-equipamentos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Estatísticas de Equipamentos — Almoxarifado" },
      {
        name: "description",
        content: "Visão operacional, manutenção, consumo e financeira dos equipamentos do projeto ativo.",
      },
    ],
  }),
  component: EstatisticasEquipamentosPage,
});

type Aba = "visao" | "utilizacao" | "manutencao" | "consumo" | "financeiro";

/* -------------------------------------------------------------------------- */
/* Tons — mesma paleta do tema (primary / success / warning / destructive)    */
/* -------------------------------------------------------------------------- */

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

const TONE_RAIL: Record<Tone, string> = {
  neutral: "bg-transparent",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const TONE_SURFACE: Record<Tone, string> = {
  neutral: "bg-muted/[0.16]",
  primary: "bg-primary/[0.025]",
  success: "bg-success/[0.028]",
  warning: "bg-warning/[0.035]",
  danger: "bg-destructive/[0.03]",
};

const TONE_BADGE: Record<Tone, string> = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

type AbaConfig = {
  id: Aba;
  label: string;
  descricao: string;
  icon: LucideIcon;
};

const ABAS: ReadonlyArray<AbaConfig> = [
  { id: "visao", label: "Visão geral", descricao: "Estado e fluxo", icon: ChartNoAxesCombined },
  { id: "utilizacao", label: "Utilização", descricao: "Uso do parque", icon: Gauge },
  { id: "manutencao", label: "Manutenção", descricao: "Ciclos técnicos", icon: ToolCase },
  { id: "consumo", label: "Consumo", descricao: "Insumos apropriados", icon: PackageCheck },
  { id: "financeiro", label: "Financeiro", descricao: "Custos e valores", icon: CircleDollarSign },
];

function criarPeriodoPadrao(dias: number) {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - (dias - 1) * 86_400_000);
  const iso = (data: Date) => data.toISOString().slice(0, 10);
  return { inicio: iso(inicio), fim: iso(fim) };
}

function formatarNumero(valor: number, casas = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(valor);
}

function formatarPercentual(valor: number | null): string {
  return valor == null ? "—" : `${formatarNumero(valor * 100, 1)}%`;
}

function formatarDias(valor: number | null): string {
  return valor == null ? "—" : `${formatarNumero(valor, 1)} d`;
}

function formatarData(data: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${data}T00:00:00`));
}

function formatarHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(data);
}

function EstatisticasEquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const periodoPadrao = useMemo(() => criarPeriodoPadrao(30), []);
  const [inicio, setInicio] = useState(periodoPadrao.inicio);
  const [fim, setFim] = useState(periodoPadrao.fim);
  const [inicioAplicado, setInicioAplicado] = useState(periodoPadrao.inicio);
  const [fimAplicado, setFimAplicado] = useState(periodoPadrao.fim);
  const [aba, setAba] = useState<Aba>("visao");
  const [dados, setDados] = useState<EstatisticasEquipamentosResumo | null>(null);
  const [erroCalculo, setErroCalculo] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [pendente, startTransition] = useTransition();

  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );

  const financeiroAtivo = configuracao?.modulos.financeiro_equipamentos === true;

  // Validação local do período: feedback imediato, sem esperar o cálculo.
  const erroValidacao = !inicio || !fim ? "Informe as duas datas do período." : inicio > fim ? "A data inicial não pode ser depois da data final." : null;

  const periodoAplicado = useMemo(
    () => ({ inicio: inicioAplicado, fim: fimAplicado }),
    [inicioAplicado, fimAplicado],
  );

  const periodoAlterado = inicio !== inicioAplicado || fim !== fimAplicado;

  useEffect(() => {
    if (!projetoId) {
      setDados(null);
      return;
    }

    let cancelado = false;
    setErroCalculo(null);

    startTransition(() => {
      estatisticasEquipamentosRepo
        .calcular(projetoId, periodoAplicado)
        .then((resultado) => {
          if (!cancelado) {
            setDados(resultado);
            setAtualizadoEm(new Date());
          }
        })
        .catch((error) => {
          if (!cancelado) {
            setDados(null);
            setErroCalculo(
              error instanceof Error
                ? error.message
                : "Não foi possível calcular as estatísticas de equipamentos.",
            );
          }
        });
    });

    return () => {
      cancelado = true;
    };
  }, [projetoId, periodoAplicado]);

  const aplicar = useCallback(() => {
    if (erroValidacao) return;
    setInicioAplicado(inicio);
    setFimAplicado(fim);
  }, [erroValidacao, inicio, fim]);

  const aplicarRapido = useCallback((dias: number) => {
    const periodo = criarPeriodoPadrao(dias);
    setInicio(periodo.inicio);
    setFim(periodo.fim);
    setInicioAplicado(periodo.inicio);
    setFimAplicado(periodo.fim);
  }, []);

  const limpar = useCallback(() => {
    aplicarRapido(30);
  }, [aplicarRapido]);

  const abasDisponiveis = useMemo(
    () => ABAS.filter((item) => financeiroAtivo || item.id !== "financeiro"),
    [financeiroAtivo],
  );

  useEffect(() => {
    if (!abasDisponiveis.some((item) => item.id === aba)) {
      setAba(abasDisponiveis[0]?.id ?? "visao");
    }
  }, [abasDisponiveis, aba]);

  // Contagens de exceção exibidas como selo nas abas correspondentes.
  const badges = useMemo<Partial<Record<Aba, { valor: number; tone: Tone }>>>(() => {
    if (!dados) return {};
    const out: Partial<Record<Aba, { valor: number; tone: Tone }>> = {};
    if (dados.manutencoes_abertas > 0) out.manutencao = { valor: dados.manutencoes_abertas, tone: "warning" };
    if (dados.consumos_sem_custo > 0) out.consumo = { valor: dados.consumos_sem_custo, tone: "warning" };
    return out;
  }, [dados]);

  const rankingCusto = useMemo(
    () =>
      (dados?.por_equipamento ?? [])
        .filter((item) => item.custo_total > 0)
        .slice(0, 8)
        .map((item) => ({
          nome: item.modelo ? `${item.nome} · ${item.modelo}` : item.nome,
          custo: item.custo_total,
        })),
    [dados],
  );

  if (!projetoId) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-8 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Wrench className="size-6" />
            </span>
            <h2 className="font-display text-lg font-semibold">Selecione um projeto</h2>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
              As estatísticas de equipamentos são calculadas sobre o projeto ativo. Escolha um projeto para ver
              utilização, manutenção e custos do parque.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative min-w-0 space-y-6 overflow-hidden bg-gradient-to-b from-primary/[0.018] via-background to-background p-4 sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-52 bg-[radial-gradient(circle_at_12%_0%,hsl(var(--primary)/0.10),transparent_38%),radial-gradient(circle_at_92%_8%,hsl(var(--success)/0.07),transparent_30%)]" aria-hidden="true" />
      {/* Região viva única para status de carregamento/atualização. */}
      <div className="sr-only" role="status" aria-live="polite">
        {pendente ? "Recalculando estatísticas de equipamentos." : atualizadoEm ? `Estatísticas atualizadas às ${formatarHora(atualizadoEm)}.` : ""}
      </div>

      <header className="space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary shadow-sm shadow-primary/5">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ChartNoAxesCombined className="size-3" />
              </span>
              Inteligência de equipamentos
            </div>
            <h1 className="font-display bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">Estatísticas de Equipamentos</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Transforme o histórico operacional em uma leitura objetiva de estado, utilização, manutenção, consumo e custo.
            </p>
          </div>

          <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.075] via-background to-background px-4 py-3 shadow-sm sm:min-w-[300px]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <CalendarClock className="size-4 text-primary" />
                Período analisado
              </div>
              {pendente ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
              ) : atualizadoEm ? (
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Check className="size-3" />
                  {formatarHora(atualizadoEm)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-display text-base font-semibold sm:text-lg">
              {formatarData(inicioAplicado)} <span className="text-muted-foreground">até</span> {formatarData(fimAplicado)}
            </p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.035] via-background to-background shadow-sm">
           <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/20 to-transparent" aria-hidden="true" />
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Período de análise</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_180px_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="estat-equip-de" className="text-xs">Data inicial</Label>
                  <Input
                    id="estat-equip-de"
                    type="date"
                    value={inicio}
                    max={fim || undefined}
                    aria-invalid={erroValidacao ? true : undefined}
                    onChange={(event) => setInicio(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && aplicar()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="estat-equip-ate" className="text-xs">Data final</Label>
                  <Input
                    id="estat-equip-ate"
                    type="date"
                    value={fim}
                    min={inicio || undefined}
                    aria-invalid={erroValidacao ? true : undefined}
                    onChange={(event) => setFim(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && aplicar()}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    className="flex-1 sm:flex-none"
                    onClick={aplicar}
                    disabled={pendente || !!erroValidacao || !periodoAlterado}
                  >
                    {pendente ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Atualizando…
                      </>
                    ) : (
                      "Aplicar período"
                    )}
                  </Button>
                  {periodoAlterado && !pendente ? (
                    <Button type="button" variant="ghost" size="icon" aria-label="Descartar alterações no período" onClick={() => { setInicio(inicioAplicado); setFim(fimAplicado); }}>
                      <RotateCcw className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {erroValidacao ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {erroValidacao}
                </p>
              ) : periodoAlterado ? (
                <p className="mt-2 text-xs text-muted-foreground">Período alterado — clique em “Aplicar período” para atualizar os dados.</p>
              ) : null}
            </div>

            <div className="lg:text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Atalhos</p>
              <div className="mt-2 flex flex-wrap gap-2 lg:justify-end">
                {[7, 30, 90].map((dias) => {
                  const periodo = criarPeriodoPadrao(dias);
                  const ativo = inicioAplicado === periodo.inicio && fimAplicado === periodo.fim;
                  return (
                    <Button
                      key={dias}
                      type="button"
                      size="sm"
                      variant={ativo ? "default" : "outline"}
                      className={ativo ? "shadow-sm shadow-primary/20" : "border-border/80 bg-background/80 hover:border-primary/30 hover:bg-primary/[0.04]"}
                      aria-pressed={ativo}
                      onClick={() => aplicarRapido(dias)}
                    >
                      {dias} dias
                    </Button>
                  );
                })}
                <Button type="button" size="sm" variant="ghost" onClick={limpar} aria-label="Restaurar período padrão de 30 dias">
                  <RotateCcw className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {erroCalculo ? (
        <div className="rounded-2xl border border-destructive/25 bg-gradient-to-r from-destructive/10 to-transparent p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">A análise não pôde ser atualizada.</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{erroCalculo}</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={aplicar}>
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : null}

      <NavTabs abas={abasDisponiveis} ativa={aba} onChange={setAba} badges={badges} />

      {pendente && !dados ? <EstatisticasSkeleton /> : null}

      {dados ? (
        <div className={pendente ? "space-y-6 opacity-60 transition-opacity duration-200" : "space-y-6 transition-opacity duration-200"}>
          <section aria-labelledby="resumo-parque" className="space-y-3">
            <SectionHeader id="resumo-parque" eyebrow="Resumo executivo" title="Estado atual do parque" description="Primeiro veja onde o parque está; depois aprofunde na visão selecionada." />
            <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-background shadow-sm">
               <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-primary/30 to-success/50" aria-hidden="true" />
              <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
                <KpiCell label="Parque" valor={formatarNumero(dados.parque_total)} icon={Wrench} />
                <KpiCell label="Em uso" valor={formatarNumero(dados.em_uso)} icon={HardHat} tone="primary" />
                <KpiCell label="Disponíveis" valor={formatarNumero(dados.disponivel)} icon={PackageCheck} tone="success" />
                <KpiCell
                  label="Em manutenção"
                  valor={formatarNumero(dados.em_manutencao)}
                  icon={ToolCase}
                  tone={dados.em_manutencao > 0 ? "warning" : "neutral"}
                />
                <KpiCell label="Taxa de uso" valor={formatarPercentual(dados.taxa_utilizacao)} icon={Gauge} tone="primary" destaque />
                <KpiCell label="Movimentações" valor={formatarNumero(dados.movimentacoes)} icon={Activity} />
              </div>
            </div>
          </section>

          {aba === "financeiro" && financeiroAtivo ? <Financeiro dados={dados} /> : null}
          {aba === "manutencao" ? <Manutencao dados={dados} /> : null}
          {aba === "consumo" ? <Consumo dados={dados} /> : null}
          {aba === "utilizacao" ? <Utilizacao dados={dados} /> : null}
          {aba === "visao" ? <VisaoGeral dados={dados} rankingCusto={rankingCusto} financeiroAtivo={financeiroAtivo} /> : null}

          <div className="rounded-2xl border border-primary/10 bg-gradient-to-r from-primary/[0.045] via-background to-success/[0.035] px-4 py-3.5 sm:px-5">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">Nota de leitura</p>
                <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
                  Utilização é apresentada como dias-equivalentes de unidade reconstruídos a partir do histórico de
                  movimentações. Sem horímetro ou outro direcionador registrado, o sistema não transforma esse dado em
                  horas de operação.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : !erroCalculo && !pendente ? (
        <EmptyState
          titulo="Sem dados para este período"
          descricao="Ajuste as datas ou verifique se há equipamentos cadastrados neste projeto."
        />
      ) : null}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Navegação por abas — acessível, com selos de exceção e rolagem no mobile   */
/* -------------------------------------------------------------------------- */

function NavTabs({
  abas,
  ativa,
  onChange,
  badges,
}: {
  abas: ReadonlyArray<AbaConfig>;
  ativa: Aba;
  onChange: (aba: Aba) => void;
  badges: Partial<Record<Aba, { valor: number; tone: Tone }>>;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const index = abas.findIndex((item) => item.id === ativa);
      const last = abas.length - 1;
      const next =
        event.key === "Home" ? 0
        : event.key === "End" ? last
        : event.key === "ArrowRight" ? (index >= last ? 0 : index + 1)
        : (index <= 0 ? last : index - 1);
      const alvo = abas[next];
      if (!alvo) return;
      onChange(alvo.id);
      listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next]?.focus();
    },
    [abas, ativa, onChange],
  );

  return (
    <nav aria-label="Visões estatísticas de equipamentos" className="relative">
      <div
        ref={listRef}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex gap-2 overflow-x-auto rounded-2xl border border-primary/10 bg-gradient-to-r from-primary/[0.045] via-muted/30 to-success/[0.035] p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {abas.map((item) => {
          const Icon = item.icon;
          const ativo = ativa === item.id;
          const badge = badges[item.id];
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`aba-${item.id}`}
              aria-selected={ativo}
              aria-controls={`painel-${item.id}`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={[
                "group flex min-w-[152px] shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                ativo
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/15 ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
              ].join(" ")}
            >
              <span
                className={[
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                  ativo ? "border-primary/20 bg-primary-foreground/10 text-primary-foreground" : "border-border/70 bg-background/80",
                ].join(" ")}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate text-sm font-semibold">{item.label}</span>
                  {badge ? (
                    <span
                      className={`inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${TONE_BADGE[badge.tone]}`}
                    >
                      {badge.valor > 99 ? "99+" : badge.valor}
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">{item.descricao}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function SectionHeader({
  id,
  eyebrow,
  title,
  description,
  tone = "primary",
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  tone?: Tone;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${TONE_RAIL[tone]} shadow-[0_0_0_4px_hsl(var(--primary)/0.08)]`} aria-hidden="true" />
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${TONE_TEXT[tone]}`}>{eyebrow}</p>
        </div>
        <h2 id={id} className="mt-1 font-display text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
      </div>
      <p className="max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function KpiCell({
  icon: Icon,
  label,
  valor,
  tone = "neutral",
  destaque = false,
}: {
  icon: LucideIcon;
  label: string;
  valor: string;
  tone?: Tone;
  destaque?: boolean;
}) {
  return (
    <div className={["relative overflow-hidden p-4 sm:p-5", TONE_SURFACE[tone], destaque ? "ring-1 ring-inset ring-current/10" : ""].join(" ")}>
      {tone !== "neutral" ? <span className={`absolute inset-x-0 top-0 h-0.5 ${TONE_RAIL[tone]}`} aria-hidden="true" /> : null}
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border border-current/10 ${TONE_ICON[tone]}`}>
          <Icon className="size-3.5" />
        </span>
        <span>{label}</span>
      </div>
      <p className={`mt-3 font-display text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.7rem] ${tone !== "neutral" ? TONE_TEXT[tone] : ""}`}>
        {valor}
      </p>
    </div>
  );
}

function VisaoGeral({ dados, rankingCusto, financeiroAtivo }: { dados: EstatisticasEquipamentosResumo; rankingCusto: Array<{ nome: string; custo: number }>; financeiroAtivo: boolean }) {
  return (
    <div id="painel-visao" role="tabpanel" aria-labelledby="aba-visao" className="space-y-5">
      <SectionHeader id="visao-composicao" eyebrow="Visão geral" title="Composição do parque e fluxo" description="A visão geral conecta estado físico, vínculo dos equipamentos e movimentações sem misturar métricas financeiras com operação." />

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-primary/[0.035] via-muted/10 to-transparent">
            <CardTitle className="text-base">Composição do parque</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <MetricGroup titulo="Vínculo" itens={[
              ["Próprio", formatarNumero(dados.proprio)],
              ["Alugado", formatarNumero(dados.alugado)],
              ["Empréstimo", formatarNumero(dados.emprestimo)],
            ]} />
            <MetricGroup titulo="Controle" itens={[
              ["Individual", formatarNumero(dados.individual)],
              ["Quantitativo", formatarNumero(dados.quantitativo)],
            ]} />
            <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <MetricValue label="Registros físicos" valor={formatarNumero(dados.registros_fisicos)} />
              <MetricValue label="Saldo físico" valor={formatarNumero(dados.quantidade_saldo, 2)} tone="success" />
              <MetricValue label="Encerrados" valor={formatarNumero(dados.encerrados)} tone={dados.encerrados > 0 ? "warning" : "neutral"} />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-primary/[0.035] via-muted/10 to-transparent">
            <CardTitle className="text-base">Movimentações no período</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {dados.movimentacoes === 0 ? (
              <EmptyState compact titulo="Nenhuma movimentação no período" descricao="Amplie o intervalo de datas para ver o fluxo de equipamentos." />
            ) : (
              [
                ["Entradas", dados.entradas, ArrowDownToLine, "success" as Tone],
                ["Saídas", dados.saidas, ArrowUpFromLine, "primary" as Tone],
                ["Devoluções", dados.devolucoes, ArrowDownToLine, "success" as Tone],
                ["Transferências", dados.transferencias, ArrowLeftRight, "neutral" as Tone],
                ["Sinalizações", dados.sinalizacoes_manutencao, ShieldAlert, "warning" as Tone],
                ["Envios", dados.envios_manutencao, ToolCase, "warning" as Tone],
                ["Retornos", dados.retornos_manutencao, PackageCheck, "success" as Tone],
                ["Baixas", dados.baixas, Activity, "danger" as Tone],
              ].map(([label, valor, Icon, tone]) => {
                const CIcon = Icon as LucideIcon;
                const itemTone = tone as Tone;
                return (
                  <div key={String(label)} className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/20 sm:px-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${TONE_ICON[itemTone]}`}>
                        <CIcon className="size-4" />
                      </span>
                      <span className="truncate text-sm">{String(label)}</span>
                    </div>
                    <span className={`font-semibold tabular-nums ${TONE_TEXT[itemTone]}`}>{formatarNumero(Number(valor))}</span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {financeiroAtivo ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-primary/[0.035] via-muted/10 to-transparent">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-base">Custo efetivo por equipamento</CardTitle>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Mostra somente custos com origem registrada no período.</p>
              </div>
              <span className="text-xs text-muted-foreground">{rankingCusto.length} equipamento{rankingCusto.length === 1 ? "" : "s"} com custo</span>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {rankingCusto.length ? (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rankingCusto} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                    <CartesianGrid horizontal={false} stroke="var(--border, #e2e8f0)" />
                    <XAxis
                      type="number"
                      tickFormatter={(valor) => formatarMoeda(Number(valor))}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--muted-foreground, #64748b)"
                    />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      width={190}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--muted-foreground, #64748b)"
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                      content={<CustoTooltip />}
                    />
                    <Bar
                      dataKey="custo"
                      name="Custo efetivo"
                      fill="var(--primary, #2563eb)"
                      minPointSize={4}
                      radius={[0, 5, 5, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState titulo="Nenhum custo efetivo no período" descricao="O gráfico aparecerá quando consumo, manutenção ou recorrência tiverem origem financeira registrada." />
            )}
          </CardContent>
        </Card>
      ) : null}

      <TabelaEquipamentos dados={dados} financeiroAtivo={financeiroAtivo} />
    </div>
  );
}

function CustoTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-popover-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-popover-foreground">{formatarMoeda(Number(payload[0]?.value ?? 0))}</p>
    </div>
  );
}

function MetricGroup({ titulo, itens }: { titulo: string; itens: Array<[string, string]> }) {
  return (
    <div className="border-b p-4 sm:p-5 last:border-b-0">
      <p className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]" aria-hidden="true" />
        {titulo}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {itens.map(([label, valor]) => (
          <MetricValue key={label} label={label} valor={valor} />
        ))}
      </div>
    </div>
  );
}

function MetricValue({ label, valor, tone = "neutral" }: { label: string; valor: string; tone?: Tone }) {
  return (
    <div className={`rounded-xl border border-border/60 px-3.5 py-3 ${TONE_SURFACE[tone]}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tracking-tight tabular-nums ${tone !== "neutral" ? TONE_TEXT[tone] : ""}`}>{valor}</p>
    </div>
  );
}

function Utilizacao({ dados }: { dados: EstatisticasEquipamentosResumo }) {
  return (
    <div id="painel-utilizacao" role="tabpanel" aria-labelledby="aba-utilizacao" className="space-y-5">
      <SectionHeader id="utilizacao-equipamentos" eyebrow="Utilização" title="Como o parque foi utilizado" description="A leitura usa somente o histórico operacional disponível e não transforma dias de presença em horas de operação." />
      <Card className="overflow-hidden">
        <CardContent className="grid divide-y p-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <KpiCell icon={Gauge} label="Taxa de utilização" valor={formatarPercentual(dados.taxa_utilizacao)} tone="primary" destaque />
          <KpiCell icon={Clock3} label="Unidade-dia em uso" valor={formatarDias(dados.dias_com_uso)} tone="primary" />
          <KpiCell icon={ToolCase} label="Unidade-dia em manutenção" valor={formatarDias(dados.dias_em_manutencao)} tone={dados.dias_em_manutencao ? "warning" : "neutral"} />
          <KpiCell icon={PackageCheck} label="Unidade-dia disponível" valor={formatarDias(dados.dias_disponivel)} tone="success" />
        </CardContent>
      </Card>
      <TabelaEquipamentos dados={dados} financeiroAtivo={false} ordenacao="uso" />
    </div>
  );
}

function Manutencao({ dados }: { dados: EstatisticasEquipamentosResumo }) {
  return (
    <div id="painel-manutencao" role="tabpanel" aria-labelledby="aba-manutencao" className="space-y-5">
      <SectionHeader id="manutencao-equipamentos" eyebrow="Manutenção" title="Ciclos técnicos" tone="warning" description="Volume e duração das ocorrências registradas no período. Custos financeiros permanecem separados nesta leitura." />
      <Card className="overflow-hidden">
        <CardContent className="grid divide-y p-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <KpiCell icon={ToolCase} label="Ocorrências" valor={formatarNumero(dados.manutencoes)} />
          <KpiCell icon={ShieldAlert} label="Abertas" valor={formatarNumero(dados.manutencoes_abertas)} tone={dados.manutencoes_abertas > 0 ? "warning" : "success"} destaque={dados.manutencoes_abertas > 0} />
          <KpiCell icon={PackageCheck} label="Concluídas" valor={formatarNumero(dados.manutencoes_concluidas)} tone="success" />
          <KpiCell icon={Clock3} label="Duração média" valor={formatarDias(dados.duracao_media_manutencao_dias)} />
        </CardContent>
      </Card>
      {dados.manutencoes_abertas > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-xs leading-relaxed text-foreground">
            {formatarNumero(dados.manutencoes_abertas)} ocorrência{dados.manutencoes_abertas === 1 ? "" : "s"} de manutenção
            ainda aberta{dados.manutencoes_abertas === 1 ? "" : "s"} — o equipamento correspondente permanece indisponível
            até o retorno ser registrado.
          </p>
        </div>
      ) : null}
      <TabelaEquipamentos dados={dados} financeiroAtivo={false} ordenacao="manutencao" />
    </div>
  );
}

function Consumo({ dados }: { dados: EstatisticasEquipamentosResumo }) {
  return (
    <div id="painel-consumo" role="tabpanel" aria-labelledby="aba-consumo" className="space-y-5">
      <SectionHeader id="consumo-equipamentos" eyebrow="Consumo" title="Insumos apropriados aos equipamentos" tone="success" description="O consumo é analítico: a saída original do estoque permanece intacta e as apropriações formam a dimensão do equipamento." />
      <Card className="overflow-hidden">
        <CardContent className="grid divide-y p-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
          <KpiCell icon={PackageCheck} label="Quantidade consumida" valor={formatarNumero(dados.quantidade_consumida, 2)} />
          <KpiCell icon={CircleDollarSign} label="Consumos com custo" valor={formatarNumero(dados.consumos_com_custo)} tone="success" destaque />
          <KpiCell icon={ShieldAlert} label="Consumos sem custo" valor={formatarNumero(dados.consumos_sem_custo)} tone={dados.consumos_sem_custo > 0 ? "warning" : "success"} />
        </CardContent>
      </Card>
      <TabelaEquipamentos dados={dados} financeiroAtivo={true} ordenacao="consumo" />
    </div>
  );
}

function Financeiro({ dados }: { dados: EstatisticasEquipamentosResumo }) {
  return (
    <div id="painel-financeiro" role="tabpanel" aria-labelledby="aba-financeiro" className="space-y-5">
      <SectionHeader id="financeiro-equipamentos" eyebrow="Financeiro" title="Custo efetivo e valor do parque" description="Os números abaixo dependem de fontes financeiras registradas. Valor de referência não é tratado como despesa." />
      <Card className="overflow-hidden">
        <CardContent className="grid divide-y p-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <KpiCell icon={CircleDollarSign} label="Operacional" valor={formatarMoeda(dados.custo_operacional)} tone="primary" />
          <KpiCell icon={ToolCase} label="Manutenção" valor={formatarMoeda(dados.custo_manutencao)} tone="warning" />
          <KpiCell icon={TrendingUp} label="Recorrente" valor={formatarMoeda(dados.custo_recorrente)} tone="success" />
          <KpiCell icon={ChartNoAxesCombined} label="Total efetivo" valor={formatarMoeda(dados.custo_total)} tone="primary" destaque />
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-r from-primary/[0.035] via-muted/10 to-transparent">
          <CardTitle className="text-base">Valor de referência do parque</CardTitle>
        </CardHeader>
        <CardContent className="grid divide-y p-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <KpiCell icon={CircleDollarSign} label="Referência" valor={formatarMoeda(dados.valor_referencia)} />
          <KpiCell icon={HardHat} label="Próprio" valor={formatarMoeda(dados.valor_proprio)} />
          <KpiCell icon={TrendingUp} label="Alugado" valor={formatarMoeda(dados.valor_alugado)} />
          <KpiCell icon={Activity} label="Empréstimo" valor={formatarMoeda(dados.valor_emprestado)} />
        </CardContent>
      </Card>
      <TabelaEquipamentos dados={dados} financeiroAtivo ordenacao="custo" />
    </div>
  );
}

const LIMITE_LINHAS_INICIAL = 10;

const ORDENACAO_LABEL: Record<"custo" | "uso" | "manutencao" | "consumo", string> = {
  custo: "custo efetivo",
  uso: "dias em uso",
  manutencao: "ocorrências de manutenção",
  consumo: "quantidade consumida",
};

function TabelaEquipamentos({ dados, financeiroAtivo, ordenacao = "custo" }: { dados: EstatisticasEquipamentosResumo; financeiroAtivo: boolean; ordenacao?: "custo" | "uso" | "manutencao" | "consumo" }) {
  const [expandido, setExpandido] = useState(false);

  const linhas = useMemo(
    () =>
      [...dados.por_equipamento].sort((a, b) => {
        if (ordenacao === "uso") return b.dias_com_uso - a.dias_com_uso;
        if (ordenacao === "manutencao") return b.manutencoes - a.manutencoes || b.dias_em_manutencao - a.dias_em_manutencao;
        if (ordenacao === "consumo") return b.quantidade_consumida - a.quantidade_consumida;
        return b.custo_total - a.custo_total;
      }),
    [dados.por_equipamento, ordenacao],
  );

  const visiveis = expandido ? linhas : linhas.slice(0, LIMITE_LINHAS_INICIAL);
  const totalMovimentos = (item: (typeof linhas)[number]) =>
    item.entradas + item.saidas + item.devolucoes + item.transferencias + item.envios_manutencao + item.retornos_manutencao + item.baixas + item.reentradas;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-primary/[0.035] via-muted/10 to-transparent">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Detalhamento por equipamento</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {linhas.length} registro{linhas.length === 1 ? "" : "s"} · ordenado por {ORDENACAO_LABEL[ordenacao]}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BarChart3 className="size-4 text-primary" />
            <span>Dados do período aplicado</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {linhas.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b border-primary/10 bg-gradient-to-r from-primary/[0.07] via-muted/25 to-success/[0.035] text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/95 px-4 py-3 text-left font-semibold">Equipamento</th>
                    <th className="px-4 py-3 text-right font-semibold">Saldo</th>
                    <th className="px-4 py-3 text-right font-semibold">Uso</th>
                    <th className="px-4 py-3 text-right font-semibold">Manut.</th>
                    <th className="px-4 py-3 text-right font-semibold">Movim.</th>
                    <th className="px-4 py-3 text-right font-semibold">Consumo</th>
                    {financeiroAtivo ? <th className="px-4 py-3 text-right font-semibold">Custo efetivo</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visiveis.map((item) => (
                    <tr key={item.equipamento_id} className="odd:bg-muted/[0.018] transition-colors hover:bg-primary/[0.035]">
                      <td className="sticky left-0 z-10 bg-background/95 px-4 py-3.5 backdrop-blur-sm">
                        <div className="max-w-[280px] truncate font-medium">{item.nome}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          {item.modelo ? <span>{item.modelo}</span> : null}
                          <span className={item.tipo_controle === "INDIVIDUAL" ? "rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-primary" : "rounded-md border border-success/20 bg-success/10 px-1.5 py-0.5 text-success"}>{item.tipo_controle === "INDIVIDUAL" ? "Individual" : "Quantitativo"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{formatarNumero(item.quantidade_saldo, 2)}</td>
                      <td className="px-4 py-3.5 text-right font-medium tabular-nums text-primary">{formatarPercentual(item.taxa_utilizacao)}</td>
                      <td className="px-4 py-3.5 text-right font-medium tabular-nums text-warning">{formatarNumero(item.manutencoes)}</td>
                      <td className="px-4 py-3.5 text-right font-medium tabular-nums text-primary">{formatarNumero(totalMovimentos(item))}</td>
                      <td className="px-4 py-3.5 text-right font-medium tabular-nums text-success">{formatarNumero(item.quantidade_consumida, 2)}</td>
                      {financeiroAtivo ? <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-primary">{formatarMoeda(item.custo_total)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {linhas.length > LIMITE_LINHAS_INICIAL ? (
              <div className="border-t p-3 text-center">
                <Button type="button" variant="ghost" size="sm" onClick={() => setExpandido((v) => !v)}>
                  {expandido ? "Mostrar menos" : `Mostrar todos (${linhas.length})`}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState titulo="Nenhum equipamento encontrado" descricao="O período selecionado ainda não possui dados suficientes para montar o detalhamento." />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ titulo, descricao, compact = false }: { titulo: string; descricao: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? "min-h-24 py-6" : "min-h-40 py-10"}`}>
      <div className="flex size-11 items-center justify-center rounded-2xl border bg-muted/40 text-primary">
        <ChartNoAxesCombined className="size-5" />
      </div>
      <p className="mt-3 text-sm font-semibold">{titulo}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{descricao}</p>
    </div>
  );
}

function EstatisticasSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="overflow-hidden rounded-2xl border">
        <div className="grid sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse border-b bg-muted/30 sm:border-r xl:border-b-0" />
          ))}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-56 animate-pulse rounded-2xl border bg-muted/30" />
        <div className="h-56 animate-pulse rounded-2xl border bg-muted/30" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl border bg-muted/30" />
    </div>
  );
}