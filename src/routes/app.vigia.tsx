import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Info,
  PackageCheck,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AcompanhamentoInteligencia } from "@/components/inteligencia/AcompanhamentoInteligencia";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { inteligenciaRepo } from "@/services/inteligencia-repo";
import {
  calcularVigiaOperacional,
  criarPeriodoPadrao,
  LIMIAR_DESVIO_CONSUMO_PERCENTUAL,
  MIN_SAIDAS_MAPA_RISCO,
  type ResumoVigiaOperacional,
  type VigiaAcao,
  type VigiaAlerta,
  type VigiaPrioridade,
  type VigiaTipoAlerta,
} from "@/services/estatisticas-materiais";

export const Route = createFileRoute("/app/vigia")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vigia Operacional — Almoxarifado" },
      {
        name: "description",
        content: "Central operacional de alertas, riscos, reposição, desvios e qualidade.",
      },
    ],
  }),
  component: VigiaOperacionalPage,
});

const janelaOpcoes = [7, 30, 90] as const;

const gruposVigia: Array<{
  tipo: VigiaTipoAlerta;
  label: string;
  detalhe: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  panelBg: string;
}> = [
  {
    tipo: "REPOSICAO",
    label: "Reposições",
    detalhe: "Sugestões de reposição para produtos participantes da inteligência.",
    icon: PackageCheck,
    accent: "border-l-emerald-500",
    iconBg: "bg-emerald-50 text-emerald-700",
    panelBg: "bg-emerald-50/[0.28]",
  },
  {
    tipo: "RISCO_COBERTURA",
    label: "Risco de cobertura",
    detalhe: "Posições com cobertura curta ou próxima da ruptura.",
    icon: AlertTriangle,
    accent: "border-l-red-500",
    iconBg: "bg-red-50 text-red-700",
    panelBg: "bg-red-50/[0.28]",
  },
  {
    tipo: "DESVIO_PRODUTO",
    label: "Desvios por produto",
    detalhe: "Produtos cujo padrão de consumo mudou de forma relevante.",
    icon: TrendingUp,
    accent: "border-l-sky-500",
    iconBg: "bg-sky-50 text-sky-700",
    panelBg: "bg-sky-50/[0.28]",
  },
  {
    tipo: "DESVIO_EQUIPE",
    label: "Desvios por equipe",
    detalhe: "Equipes com mudança relevante no padrão de saídas.",
    icon: Users,
    accent: "border-l-violet-500",
    iconBg: "bg-violet-50 text-violet-700",
    panelBg: "bg-violet-50/[0.28]",
  },
  {
    tipo: "QUALIDADE",
    label: "Qualidade",
    detalhe: "Ocorrências que exigem verificação ou correção operacional.",
    icon: ShieldAlert,
    accent: "border-l-amber-500",
    iconBg: "bg-amber-50 text-amber-700",
    panelBg: "bg-amber-50/[0.28]",
  },
];

function formatarDataHoraLocal(data?: string | null) {
  if (!data) return "—";
  const instante = new Date(data);
  if (Number.isNaN(instante.getTime())) return data.slice(0, 10);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(instante);
}

function prioridadeLabel(prioridade: VigiaPrioridade) {
  if (prioridade === "alta") return "Alta";
  if (prioridade === "media") return "Média";
  return "Informativa";
}

function prioridadeClasses(prioridade: VigiaPrioridade) {
  if (prioridade === "alta") return "border-red-200 bg-red-50 text-red-700";
  if (prioridade === "media") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function acaoLabel(acao: VigiaAcao) {
  switch (acao) {
    case "REPOSICAO":
      return "Ver reposição";
    case "PARAMETROS_PRODUTO":
      return "Ver parâmetros";
    case "RISCO_PRODUTO":
      return "Ver cobertura";
    case "DESVIO_PRODUTO":
      return "Ver consumo";
    case "DESVIO_EQUIPE":
      return "Ver equipes";
    case "QUALIDADE":
      return "Ver qualidade";
  }
}

function acaoRota(acao: VigiaAcao) {
  if (acao === "PARAMETROS_PRODUTO") return "/app/cadastros" as const;
  return "/app/estatisticas" as const;
}

function prioridadeBadge(prioridade: VigiaPrioridade) {
  return (
    <Badge variant="outline" className={prioridadeClasses(prioridade)}>
      {prioridadeLabel(prioridade)}
    </Badge>
  );
}

function CardResumo({
  titulo,
  valor,
  detalhe,
  tone,
  icon: Icon,
}: {
  titulo: string;
  valor: number;
  detalhe: string;
  tone: "danger" | "warning" | "primary" | "neutral" | "info";
  icon: LucideIcon;
}) {
  const toneClasses = {
    danger: "border-red-200 bg-red-50/70",
    warning: "border-amber-200 bg-amber-50/70",
    primary: "border-sidebar-primary/20 bg-sidebar-primary/5",
    info: "border-sky-200 bg-sky-50/70",
    neutral: "border-border bg-card",
  } as const;

  return (
    <Card className={toneClasses[tone]}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{valor.toLocaleString("pt-BR")}</p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{detalhe}</p>
        </div>
        <span className="rounded-xl bg-background/85 p-2 shadow-sm">
          <Icon className="size-5 text-current" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}

function assinaturaVigia(alerta: VigiaAlerta) {
  return ["VIGIA", alerta.tipo, alerta.produtoId ?? "", alerta.equipeId ?? ""].join(":");
}

function AcaoCard({
  alerta,
  projetoId,
  periodo,
}: {
  alerta: VigiaAlerta;
  projetoId: string;
  periodo: { de: string; ate: string };
}) {
  const navigate = useNavigate();
  const principal = alerta.acaoPrincipal ?? (alerta.tipo === "QUALIDADE" ? "QUALIDADE" : "RISCO_PRODUTO");
  const secundaria = alerta.acaoSecundaria ?? null;
  const [registrando, setRegistrando] = useState(false);

  const registrar = async (navegar: boolean, acao: VigiaAcao) => {
    try {
      setRegistrando(true);
      await inteligenciaRepo.iniciar({
        projetoId,
        chave: `vigia:${alerta.id}:${periodo.de}:${periodo.ate}`,
        assinatura: assinaturaVigia(alerta),
        origem: "VIGIA",
        tipo: alerta.tipo,
        prioridade: alerta.prioridade,
        titulo: alerta.titulo,
        descricao: alerta.descricao,
        regra: alerta.regra,
        produtoId: alerta.produtoId,
        equipeId: alerta.equipeId,
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
    <Card className="overflow-hidden border-sidebar-primary/15 bg-card shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {prioridadeBadge(alerta.prioridade)}
              {alerta.indicador ? <Badge variant="secondary">{alerta.indicador}</Badge> : null}
            </div>
            <h3 className="mt-2 text-sm font-semibold">{alerta.titulo}</h3>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{alerta.descricao}</p>
            {alerta.regra ? (
              <div className="mt-3 rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Regra:</span> {alerta.regra}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <Button type="button" size="sm" variant="outline" disabled={registrando} onClick={() => void registrar(false, principal)}>
              Acompanhar
            </Button>
            <Button type="button" size="sm" disabled={registrando} onClick={() => void registrar(true, principal)} className="justify-between">
              {acaoLabel(principal)}
              <ArrowRight className="ml-2 size-3.5" />
            </Button>
            {secundaria ? (
              <Button type="button" size="sm" variant="ghost" disabled={registrando} onClick={() => void registrar(true, secundaria)} className="justify-between">
                {acaoLabel(secundaria)}
                <ArrowRight className="ml-2 size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VigiaOperacionalPage() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [diasJanela, setDiasJanela] = useState<(typeof janelaOpcoes)[number]>(30);
  const [gruposAbertos, setGruposAbertos] = useState<Record<VigiaTipoAlerta, boolean>>({
    REPOSICAO: true,
    RISCO_COBERTURA: true,
    DESVIO_PRODUTO: true,
    DESVIO_EQUIPE: true,
    QUALIDADE: true,
  });

  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );

  const periodo = useMemo(() => criarPeriodoPadrao(diasJanela), [diasJanela]);
  const vigia = useMemo<ResumoVigiaOperacional | null>(() => {
    if (!dados) return null;
    const documentosAtivos = configuracao?.modulos.documentos === true && configuracao.documentos.habilitado === true;

    return calcularVigiaOperacional(
      dados.produtos,
      dados.movimentacoes,
      dados.equipes,
      periodo,
      {
        documentosAtivos,
        exigirDocumentoEntrada: documentosAtivos && configuracao?.documentos.exigir_na_entrada === true,
        exigirJustificativaAjuste: configuracao?.estoque.exigir_justificativa_ajuste === true,
        limiteAlertas: 24,
      },
    );
  }, [dados, configuracao, periodo.de, periodo.ate]);

  const gruposAlertas = useMemo(
    () =>
      gruposVigia.map((grupo) => ({
        ...grupo,
        alertas: (vigia?.alertas ?? []).filter((alerta) => alerta.tipo === grupo.tipo),
      })),
    [vigia?.alertas],
  );

  const acoesRecomendadas = useMemo(() => {
    const prioridades: VigiaTipoAlerta[] = ["REPOSICAO", "RISCO_COBERTURA", "DESVIO_PRODUTO", "DESVIO_EQUIPE", "QUALIDADE"];
    const escolhidas: VigiaAlerta[] = [];
    for (const tipo of prioridades) {
      const alerta = (vigia?.alertas ?? []).find((item) => item.tipo === tipo);
      if (alerta) escolhidas.push(alerta);
      if (escolhidas.length >= 5) break;
    }
    return escolhidas;
  }, [vigia?.alertas]);

  if (!projetoId) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
          <BellRing className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-semibold">Selecione um projeto para ativar o Vigia Operacional.</p>
        </CardContent>
      </Card>
    );
  }

  if (!vigia) {
    return (
      <Card className="overflow-hidden">
        <div className="h-1 animate-pulse bg-sidebar-primary" />
        <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
          <BellRing className="size-9 animate-pulse text-sidebar-primary" aria-hidden="true" />
          <p className="mt-3 font-semibold">Preparando o Vigia Operacional…</p>
          <p className="mt-1 text-sm text-muted-foreground">Analisando riscos, consumo, reposição e qualidade.</p>
        </CardContent>
      </Card>
    );
  }

  const documentosAtivos = configuracao?.modulos.documentos === true && configuracao.documentos.habilitado === true;

  return (
    <div className="space-y-7 pb-10">
      <header className="space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-sidebar-primary/10 p-2 text-sidebar-primary">
                <BellRing className="size-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sidebar-primary">Vigia operacional</p>
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">O que merece atenção agora?</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              O Vigia transforma sinais do estoque em recomendações explicáveis. Ele prepara o próximo passo; a decisão e a execução continuam com o almoxarife.
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Janela de análise</p>
            <div className="flex flex-wrap gap-2">
              {janelaOpcoes.map((dias) => (
                <Button key={dias} type="button" size="sm" variant={dias === diasJanela ? "default" : "outline"} onClick={() => setDiasJanela(dias)}>
                  {dias} dias
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border bg-muted/30 px-3 py-1.5">Base: {periodo.de.split("-").reverse().join("/")} → {periodo.ate.split("-").reverse().join("/")}</span>
          <span className="rounded-full border bg-muted/30 px-3 py-1.5">Documentos: {documentosAtivos ? "ativos" : "fora da leitura documental"}</span>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CardResumo titulo="Risco de cobertura" valor={vigia.criticos} detalhe={`${vigia.atencao} em atenção · ${vigia.criticos} críticos`} tone={vigia.criticos ? "danger" : vigia.atencao ? "warning" : "neutral"} icon={AlertTriangle} />
        <CardResumo titulo="Reposições" valor={vigia.reposicoes} detalhe={vigia.reposicoes ? `${vigia.reposicoesImediatas} imediatas · ${vigia.reposicoesExcluidasConfiguracao} fora da inteligência` : vigia.reposicoesExcluidasConfiguracao > 0 ? `${vigia.reposicoesExcluidasConfiguracao} produto(s) fora da inteligência · nenhum habilitado gerou sugestão` : "Nenhuma reposição sugerida na janela"} tone={vigia.reposicoesImediatas ? "danger" : vigia.reposicoes ? "warning" : "neutral"} icon={PackageCheck} />
        <CardResumo titulo="Desvio · produto" valor={gruposAlertas.find((grupo) => grupo.tipo === "DESVIO_PRODUTO")?.alertas.length ?? 0} detalhe="Mudanças relevantes no consumo" tone={vigia.desvios ? "info" : "neutral"} icon={TrendingUp} />
        <CardResumo titulo="Desvio · equipe" valor={gruposAlertas.find((grupo) => grupo.tipo === "DESVIO_EQUIPE")?.alertas.length ?? 0} detalhe="Mudanças por equipe" tone={vigia.desvios ? "primary" : "neutral"} icon={Users} />
        <CardResumo titulo="Qualidade" valor={vigia.alertasQualidade} detalhe={`${vigia.alertasQualidadeAltos} de alta prioridade`} tone={vigia.alertasQualidadeAltos ? "danger" : vigia.alertasQualidade ? "warning" : "neutral"} icon={ShieldAlert} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-sidebar-primary" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold uppercase">Ações recomendadas</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">As ocorrências mais representativas de cada frente, já acompanhadas do motivo e do próximo passo.</p>
          </div>
          <Badge variant="outline">{acoesRecomendadas.length} ação(ões) destacada(s)</Badge>
        </div>

        {acoesRecomendadas.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {acoesRecomendadas.map((alerta) => <AcaoCard key={alerta.id} alerta={alerta} projetoId={projetoId} periodo={periodo} />)}
          </div>
        ) : (
          <Card className="border-emerald-200 bg-emerald-50/60">
            <CardContent className="flex items-start gap-3 p-5">
              <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" aria-hidden="true" />
              <div>
                <p className="font-semibold text-emerald-900">Nenhuma ação prioritária foi identificada.</p>
                <p className="mt-1 text-sm text-emerald-800/80">Os cinco sinais foram lidos e, dentro da janela escolhida, não há ocorrência que exija encaminhamento.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Info className="size-4 text-sidebar-primary" />Como o Vigia decidiu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border bg-muted/20 p-3"><p className="font-semibold">Cobertura</p><p className="mt-1 text-muted-foreground">Mapa de risco exige pelo menos {MIN_SAIDAS_MAPA_RISCO} saídas e reaproveita o cálculo de consumo/cobertura das Estatísticas.</p></div>
            <div className="rounded-xl border bg-muted/20 p-3"><p className="font-semibold">Reposição</p><p className="mt-1 text-muted-foreground">Considera apenas produtos participantes da inteligência, com mínimo de {MIN_SAIDAS_MAPA_RISCO} saídas e alvo de 30 dias.</p></div>
            <div className="rounded-xl border bg-muted/20 p-3"><p className="font-semibold">Desvios</p><p className="mt-1 text-muted-foreground">Sinaliza variação absoluta de pelo menos {LIMIAR_DESVIO_CONSUMO_PERCENTUAL}% entre as janelas comparadas.</p></div>
            <div className="rounded-xl border bg-muted/20 p-3"><p className="font-semibold">Qualidade</p><p className="mt-1 text-muted-foreground">Documentação só entra na leitura quando o módulo de Documentos estiver ativo e habilitado. Ajustes seguem a regra de justificativa configurada.</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="size-4 text-sidebar-primary" />Próximos caminhos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-between"><Link to="/app/estatisticas">Abrir Estatísticas<ArrowRight className="size-4" /></Link></Button>
            <Button asChild variant="outline" className="w-full justify-between"><Link to="/app/inventario">Abrir Inventário<ArrowRight className="size-4" /></Link></Button>
            <p className="pt-2 text-xs leading-5 text-muted-foreground">Use as ações destacadas acima para seguir diretamente para a análise correspondente. O Vigia não abre inventário, altera estoque ou executa ajustes sozinho.</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <AcompanhamentoInteligencia projetoId={projetoId} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold uppercase">Ocorrências por frente</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cinco grupos com identidade visual própria. Recolha o que já foi entendido e mantenha aberto o que exige decisão.</p>
          </div>
          <Badge variant="outline">{vigia.alertas.length} ocorrências na fila</Badge>
        </div>

        <div className="space-y-3">
          {gruposAlertas.map((grupo) => {
            const aberto = gruposAbertos[grupo.tipo];
            const altas = grupo.alertas.filter((alerta) => alerta.prioridade === "alta").length;
            const medias = grupo.alertas.filter((alerta) => alerta.prioridade === "media").length;
            const Icon = grupo.icon;
            const estado = altas > 0 ? "Crítico" : grupo.alertas.length > 0 ? "Atenção" : "Sem ocorrências";
            const estadoClass = altas > 0 ? "border-red-200 bg-red-50 text-red-700" : grupo.alertas.length ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";

            return (
              <div key={grupo.tipo} className={`overflow-hidden rounded-2xl border border-l-4 shadow-sm ${grupo.accent} ${grupo.panelBg}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-primary"
                  onClick={() => setGruposAbertos((atual) => ({ ...atual, [grupo.tipo]: !atual[grupo.tipo] }))}
                  aria-expanded={aberto}
                >
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${grupo.iconBg}`}><Icon className="size-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{grupo.label}</span>
                      <Badge variant="secondary">{grupo.alertas.length}</Badge>
                      <Badge variant="outline" className={estadoClass}>{estado}</Badge>
                      {altas ? <Badge variant="outline" className={prioridadeClasses("alta")}>{altas} alta{altas > 1 ? "s" : ""}</Badge> : null}
                      {medias ? <Badge variant="outline" className={prioridadeClasses("media")}>{medias} média{medias > 1 ? "s" : ""}</Badge> : null}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{grupo.detalhe}</span>
                  </span>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background" aria-hidden="true">
                    <ChevronDown className={`size-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
                  </span>
                </button>

                {aberto ? (
                  <div className="border-t bg-muted/[0.04] p-3">
                    {grupo.alertas.length ? (
                      <div className="grid gap-2 xl:grid-cols-2">
                        {grupo.alertas.map((alerta) => (
                          <Card key={alerta.id} className="border bg-background shadow-none">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">{prioridadeBadge(alerta.prioridade)}{alerta.indicador ? <Badge variant="secondary">{alerta.indicador}</Badge> : null}</div>
                                  <h3 className="mt-2 text-sm font-semibold">{alerta.titulo}</h3>
                                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{alerta.descricao}</p>
                                </div>
                              </div>
                              {alerta.regra ? <p className="mt-3 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Base da decisão:</span> {alerta.regra}</p> : null}
                              {alerta.data ? <p className="mt-2 text-xs text-muted-foreground">Leitura registrada em {formatarDataHoraLocal(alerta.data)}</p> : null}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">Este grupo não possui ocorrências dentro da janela selecionada.</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
