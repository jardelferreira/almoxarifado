import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChartColumn,
  CircleDollarSign,
  ClipboardCheck,
  Gauge,
  History,
  Layers3,
  PackageCheck,
  ShieldAlert,
  ToolCase,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { AcompanhamentoInteligencia } from "@/components/inteligencia/AcompanhamentoInteligencia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { inteligenciaRepo } from "@/services/inteligencia-repo";
import { listarPerfisAtuais } from "@/services/equipamentos/perfis-parametros-custos-repo";
import {
  calcularVigiaEquipamentos,
} from "@/services/equipamentos/vigia-equipamentos";
import type {
  PeriodoEstatisticasEquipamentos,
  VigiaEquipamentoAcao,
  VigiaEquipamentoAlerta,
  VigiaEquipamentoGrupo,
  VigiaEquipamentosResumo,
} from "@/types";

export const Route = createFileRoute("/app/vigia-equipamentos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vigia de Equipamentos — Almoxarifado" },
      {
        name: "description",
        content: "Inteligência operacional, manutenção, consumo, qualidade e finanças dos equipamentos.",
      },
    ],
  }),
  component: VigiaEquipamentosPage,
});

const janelaOpcoes = [30, 90, 180] as const;

const grupos: Array<{
  id: VigiaEquipamentoGrupo;
  titulo: string;
  descricao: string;
  icon: LucideIcon;
  badge: string;
  panel: string;
  iconBg: string;
}> = [
  {
    id: "OPERACAO",
    titulo: "Operação",
    descricao: "Uso, movimentação e apropriação prolongada.",
    icon: Gauge,
    badge: "bg-sky-50 text-sky-700 border-sky-200",
    panel: "border-sky-200/70 bg-sky-50/20",
    iconBg: "bg-sky-100 text-sky-700",
  },
  {
    id: "MANUTENCAO",
    titulo: "Manutenção",
    descricao: "Ocorrências abertas, recorrência e duração.",
    icon: ToolCase,
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    panel: "border-amber-200/70 bg-amber-50/20",
    iconBg: "bg-amber-100 text-amber-700",
  },
  {
    id: "FINANCEIRO",
    titulo: "Financeiro",
    descricao: "Valor, custo efetivo, recorrência e desvios.",
    icon: CircleDollarSign,
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    panel: "border-emerald-200/70 bg-emerald-50/20",
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "CONSUMO",
    titulo: "Consumo",
    descricao: "Insumos, custos ausentes e desvios de parâmetro.",
    icon: PackageCheck,
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    panel: "border-violet-200/70 bg-violet-50/20",
    iconBg: "bg-violet-100 text-violet-700",
  },
  {
    id: "QUALIDADE",
    titulo: "Qualidade",
    descricao: "Lacunas que reduzem a confiabilidade da análise.",
    icon: ShieldAlert,
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    panel: "border-rose-200/70 bg-rose-50/20",
    iconBg: "bg-rose-100 text-rose-700",
  },
];

function criarPeriodoPadrao(dias: number): PeriodoEstatisticasEquipamentos {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - (dias - 1) * 86_400_000);
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}

function prioridadeLabel(prioridade: VigiaEquipamentoAlerta["prioridade"]): string {
  if (prioridade === "alta") return "Alta";
  if (prioridade === "media") return "Média";
  return "Informativa";
}

function prioridadeClass(prioridade: VigiaEquipamentoAlerta["prioridade"]): string {
  if (prioridade === "alta") return "border-red-200 bg-red-50 text-red-700";
  if (prioridade === "media") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function acaoLabel(acao: VigiaEquipamentoAcao): string {
  switch (acao) {
    case "ESTATISTICAS":
      return "Ver estatísticas";
    case "EQUIPAMENTOS":
      return "Abrir equipamentos";
    case "PREVISTO_REAL":
      return "Ver previsto x real";
    case "PERFIS":
      return "Ver parâmetros";
    default:
      return "Ver detalhes";
  }
}

function acaoRota(acao: VigiaEquipamentoAcao) {
  switch (acao) {
    case "EQUIPAMENTOS":
      return "/app/equipamentos" as const;
    case "PREVISTO_REAL":
      return "/app/previsto-real-equipamentos" as const;
    case "PERFIS":
      return "/app/perfis-parametros-equipamentos" as const;
    case "ESTATISTICAS":
    default:
      return "/app/estatisticas-equipamentos" as const;
  }
}

function AlertaEquipamentoCard({
  alerta,
  projetoId,
  periodo,
}: {
  alerta: VigiaEquipamentoAlerta;
  projetoId: string;
  periodo: PeriodoEstatisticasEquipamentos;
}) {
  const navigate = useNavigate();
  const [registrando, setRegistrando] = useState(false);

  const registrar = async (navegar: boolean, acao: VigiaEquipamentoAcao) => {
    try {
      setRegistrando(true);
      await inteligenciaRepo.iniciar({
        projetoId,
        chave: `vigia-equipamentos:${alerta.id}:${periodo.inicio}:${periodo.fim}`,
        assinatura: `EQUIPAMENTOS:${alerta.grupo}:${alerta.id}`,
        origem: "VIGIA",
        tipo: "EQUIPAMENTO",
        prioridade: alerta.prioridade,
        titulo: alerta.titulo,
        descricao: alerta.descricao,
        regra: alerta.regra,
        referenciaId: alerta.referencia_id ?? alerta.equipamento_id ?? null,
      });
      toast.success(navegar ? "Ação registrada. Abrindo o próximo caminho." : "Ação adicionada ao acompanhamento.");
      if (navegar) navigate({ to: acaoRota(acao) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a ação.");
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <Card className="overflow-hidden border-border/80 bg-background shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={prioridadeClass(alerta.prioridade)}>{prioridadeLabel(alerta.prioridade)}</Badge>
              {alerta.indicador ? <Badge variant="secondary">{alerta.indicador}</Badge> : null}
              {alerta.equipamento_nome ? <Badge variant="outline" className="max-w-[260px] truncate">{alerta.equipamento_nome}</Badge> : null}
            </div>
            <h3 className="mt-2 text-sm font-semibold">{alerta.titulo}</h3>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{alerta.descricao}</p>
            <div className="mt-3 rounded-xl border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <span className="font-semibold text-foreground">Base da leitura:</span> {alerta.regra}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <Button type="button" size="sm" variant="outline" disabled={registrando} onClick={() => void registrar(false, alerta.acao_principal)}>
              Acompanhar
            </Button>
            <Button type="button" size="sm" disabled={registrando} onClick={() => void registrar(true, alerta.acao_principal)} className="justify-between">
              {acaoLabel(alerta.acao_principal)}
              <ArrowRight className="ml-2 size-3.5" />
            </Button>
            {alerta.acao_secundaria ? (
              <Button type="button" size="sm" variant="ghost" disabled={registrando} onClick={() => void registrar(true, alerta.acao_secundaria!)} className="justify-between">
                {acaoLabel(alerta.acao_secundaria)}
                <ArrowRight className="ml-2 size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResumoCard({
  titulo,
  valor,
  detalhe,
  icon: Icon,
  tone,
}: {
  titulo: string;
  valor: number;
  detalhe: string;
  icon: LucideIcon;
  tone: "danger" | "warning" | "primary" | "neutral";
}) {
  const classes = {
    danger: "border-red-200 bg-red-50/70",
    warning: "border-amber-200 bg-amber-50/70",
    primary: "border-primary/20 bg-primary/[0.045]",
    neutral: "border-border bg-card",
  } as const;

  return (
    <Card className={classes[tone]}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{titulo}</p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums">{valor}</p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{detalhe}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background/90 shadow-sm">
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}

function GrupoAlertas({
  grupo,
  alertas,
  aberto,
  onToggle,
  projetoId,
  periodo,
}: {
  grupo: (typeof grupos)[number];
  alertas: VigiaEquipamentoAlerta[];
  aberto: boolean;
  onToggle: () => void;
  projetoId: string;
  periodo: PeriodoEstatisticasEquipamentos;
}) {
  const Icon = grupo.icon;
  return (
    <Card className={`overflow-hidden border ${grupo.panel}`}>
      <button type="button" onClick={onToggle} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <CardHeader className="border-b bg-background/70 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${grupo.iconBg}`}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base">{grupo.titulo}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">{grupo.descricao}</p>
              </div>
              <Badge variant="outline" className={grupo.badge}>{alertas.length}</Badge>
            </div>
            <span className="text-xs font-medium text-muted-foreground">{aberto ? "Recolher" : "Abrir"}</span>
          </div>
        </CardHeader>
      </button>

      {aberto ? (
        <CardContent className="space-y-3 p-3 sm:p-4">
          {alertas.length ? alertas.map((alerta) => (
            <AlertaEquipamentoCard key={alerta.id} alerta={alerta} projetoId={projetoId} periodo={periodo} />
          )) : (
            <div className="rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">Nenhum sinal desta frente foi identificado na janela atual.</div>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

function VigiaEquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const [diasJanela, setDiasJanela] = useState<(typeof janelaOpcoes)[number]>(30);
  const [periodo, setPeriodo] = useState<PeriodoEstatisticasEquipamentos>(() => criarPeriodoPadrao(30));
  const [perfilId, setPerfilId] = useState("");
  const [abertos, setAbertos] = useState<Record<VigiaEquipamentoGrupo, boolean>>({
    OPERACAO: true,
    MANUTENCAO: true,
    FINANCEIRO: true,
    CONSUMO: true,
    QUALIDADE: true,
  });
  const [dados, setDados] = useState<VigiaEquipamentosResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );
  const financeiroAtivo = configuracao?.modulos.financeiro_equipamentos === true;
  const perfis = useLiveQuery(() => (projetoId && financeiroAtivo ? listarPerfisAtuais(projetoId) : []), [projetoId, financeiroAtivo]);

  const carregar = useCallback(() => {
    if (!projetoId) return;
    setErro(null);
    void calcularVigiaEquipamentos(projetoId, periodo, {
      financeiroAtivo,
      ...(perfilId ? { perfilId } : {}),
    }).then(setDados).catch((error) => {
      setDados(null);
      setErro(error instanceof Error ? error.message : "Não foi possível calcular o Vigia de equipamentos.");
    });
  }, [financeiroAtivo, perfilId, periodo, projetoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (perfilId && !perfis?.some((perfil) => perfil.id === perfilId)) setPerfilId("");
  }, [perfilId, perfis]);

  const alertasPorGrupo = useMemo(() => {
    const mapa = new Map<VigiaEquipamentoGrupo, VigiaEquipamentoAlerta[]>();
    for (const grupo of grupos) mapa.set(grupo.id, []);
    for (const alerta of dados?.alertas ?? []) mapa.get(alerta.grupo)?.push(alerta);
    return mapa;
  }, [dados?.alertas]);

  const recomendadas = useMemo(() => (dados?.alertas ?? []).slice(0, 5), [dados?.alertas]);

  const aplicarJanela = (dias: (typeof janelaOpcoes)[number]) => {
    setDiasJanela(dias);
    setPeriodo(criarPeriodoPadrao(dias));
  };

  const registrarAcaoRapida = async (alerta: VigiaEquipamentoAlerta) => {
    try {
      await inteligenciaRepo.iniciar({
        projetoId: projetoId!,
        chave: `vigia-equipamentos:${alerta.id}:${periodo.inicio}:${periodo.fim}`,
        assinatura: `EQUIPAMENTOS:${alerta.grupo}:${alerta.id}`,
        origem: "VIGIA",
        tipo: "EQUIPAMENTO",
        prioridade: alerta.prioridade,
        titulo: alerta.titulo,
        descricao: alerta.descricao,
        regra: alerta.regra,
        referenciaId: alerta.referencia_id ?? alerta.equipamento_id ?? null,
      });
      toast.success("Ação adicionada ao acompanhamento.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a ação.");
    }
  };

  if (!projetoId) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
          <BellRing className="size-10 text-muted-foreground" />
          <p className="mt-3 font-semibold">Selecione um projeto para ativar o Vigia de Equipamentos.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <main className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <BellRing className="size-4" />
              Inteligência de equipamentos
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Vigia de Equipamentos</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Detecta sinais operacionais, técnicos, financeiros, de consumo e qualidade sem transformar o alerta em decisão automática.
            </p>
          </div>

          <div className="rounded-2xl border bg-muted/20 p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Janela de análise</p>
            <div className="flex flex-wrap gap-2">
              {janelaOpcoes.map((dias) => (
                <Button key={dias} type="button" size="sm" variant={diasJanela === dias ? "default" : "outline"} onClick={() => aplicarJanela(dias)}>
                  {dias} dias
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <div className="rounded-2xl border bg-background p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <History className="size-4 text-primary" />
              Período observado
            </div>
            <p className="mt-2 font-display text-lg font-semibold">{periodo.inicio.split("-").reverse().join("/")} → {periodo.fim.split("-").reverse().join("/")}</p>
            <p className="mt-1 text-xs text-muted-foreground">Comparação operacional feita também contra uma janela anterior de mesma duração.</p>
          </div>

          {financeiroAtivo ? (
            <div className="rounded-2xl border bg-background p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Layers3 className="size-4 text-primary" />
                Base de parâmetros
              </div>
              <div className="mt-2">
                <Select value={perfilId || "__nenhum__"} onValueChange={(value) => setPerfilId(value === "__nenhum__" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem perfil de comparação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhum__">Sem perfil de comparação</SelectItem>
                    {(perfis ?? []).map((perfil) => (
                      <SelectItem key={perfil.id} value={perfil.id}>{perfil.nome} · v{perfil.versao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Quando selecionado, ativa sinais de desvio previsto × realizado.</p>
            </div>
          ) : (
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <ShieldAlert className="size-4 text-primary" />
                Leitura financeira
              </div>
              <p className="mt-2 text-sm font-semibold">Módulo financeiro desativado</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Operação, manutenção, consumo e qualidade continuam sendo analisados; sinais monetários ficam fora da leitura.</p>
            </div>
          )}

          <Button type="button" className="h-full min-h-20" onClick={carregar} disabled={!projetoId}>
            <TrendingUp className="mr-2 size-4" />
            Atualizar leitura
          </Button>
        </div>
      </header>

      {erro ? (
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold">O Vigia não pôde concluir a leitura.</p>
              <p className="mt-1 text-muted-foreground">{erro}</p>
            </div>
          </div>
        </div>
      ) : null}

      {dados ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ResumoCard titulo="Sinais detectados" valor={dados.alertas.length} detalhe="Ocorrências que merecem leitura" icon={BellRing} tone={dados.alertas.length ? "primary" : "neutral"} />
            <ResumoCard titulo="Alta prioridade" valor={dados.altas} detalhe="Exigem leitura mais cuidadosa" icon={AlertTriangle} tone={dados.altas ? "danger" : "neutral"} />
            <ResumoCard titulo="Em atenção" valor={dados.medias} detalhe="Precisam de acompanhamento" icon={ClipboardCheck} tone={dados.medias ? "warning" : "neutral"} />
            <ResumoCard titulo="Qualidade" valor={dados.alertasPorGrupo.QUALIDADE} detalhe="Lacunas da base analítica" icon={ShieldAlert} tone={dados.alertasPorGrupo.QUALIDADE ? "warning" : "neutral"} />
          </section>

          {dados.perfil_base ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-primary/[0.035] px-4 py-3 text-sm">
              <Layers3 className="size-4 text-primary" />
              <span className="font-semibold">Base financeira:</span>
              <Badge variant="outline" className="border-primary/20 bg-background">{dados.perfil_base.nome} · v{dados.perfil_base.versao}</Badge>
              <span className="text-muted-foreground">Os desvios de parâmetro abaixo são sustentados por esta referência.</span>
            </div>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <SparkleMark />
                  <h2 className="font-display text-lg font-semibold">Ações recomendadas</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Primeiro os sinais prioritários; depois a leitura por frente.</p>
              </div>
              <Badge variant="outline">{recomendadas.length} destacada(s)</Badge>
            </div>

            {recomendadas.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {recomendadas.map((alerta) => (
                  <div key={`rec-${alerta.id}`} className="relative">
                    <AlertaEquipamentoCard alerta={alerta} projetoId={projetoId} periodo={periodo} />
                    <Button type="button" size="icon" variant="ghost" className="absolute right-[150px] top-4 hidden sm:flex lg:hidden xl:flex" aria-label="Adicionar ao acompanhamento" onClick={() => void registrarAcaoRapida(alerta)}>
                      <History className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <Card className="border-emerald-200 bg-emerald-50/60">
                <CardContent className="flex items-start gap-3 p-5">
                  <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" />
                  <div>
                    <p className="font-semibold text-emerald-900">Nenhum sinal prioritário foi identificado.</p>
                    <p className="mt-1 text-sm text-emerald-800/80">A base disponível não apresentou ocorrência acima dos critérios desta janela.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-3">
            {grupos.map((grupo) => (
              <GrupoAlertas
                key={grupo.id}
                grupo={grupo}
                alertas={alertasPorGrupo.get(grupo.id) ?? []}
                aberto={abertos[grupo.id] ?? false}
                onToggle={() => setAbertos((atual) => ({ ...atual, [grupo.id]: !atual[grupo.id] }))}
                projetoId={projetoId}
                periodo={periodo}
              />
            ))}
          </section>

          <Card className="overflow-hidden border-primary/15 shadow-sm">
            <CardHeader className="border-b bg-primary/[0.035]">
              <CardTitle className="flex items-center gap-2 text-base"><History className="size-4 text-primary" />Memória das decisões</CardTitle>
              <p className="text-sm leading-5 text-muted-foreground">O Vigia registra recomendações e seus resultados, mas não altera parâmetros automaticamente. O feedback permanece separado para futuras calibrações.</p>
            </CardHeader>
            <CardContent className="p-4">
              <AcompanhamentoInteligencia projetoId={projetoId} origens={["VIGIA"]} tipos={["EQUIPAMENTO"]} compact />
            </CardContent>
          </Card>

          <div className="rounded-2xl border bg-muted/15 px-4 py-3.5 text-xs leading-5 text-muted-foreground">
            <div className="flex items-start gap-3">
              <Wrench className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>
                O Vigia detecta, interpreta e prioriza sinais; a ação continua humana. Alertas financeiros só aparecem quando o módulo financeiro está ativo, e desvios de parâmetro só são calculados quando um perfil de parâmetros foi selecionado.
              </p>
            </div>
          </div>
        </>
      ) : !erro ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <ChartColumn className="size-10 animate-pulse text-primary" />
            <p className="mt-3 font-semibold">Preparando o Vigia de Equipamentos…</p>
            <p className="mt-1 text-sm text-muted-foreground">Analisando operação, manutenção, consumo e qualidade.</p>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}

function SparkleMark() {
  return <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><BellRing className="size-3.5" /></span>;
}
