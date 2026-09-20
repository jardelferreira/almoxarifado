import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  GitCompareArrows,
  History,
  Loader2,
  Package,
  Settings2,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { calcularSimulacaoCustos } from "@/services/equipamentos/simulacao-custos";
import { carregarPerfilParaSimulacao, listarPerfisAtuais } from "@/services/equipamentos/perfis-parametros-custos-repo";
import { compararPrevistoReal } from "@/services/equipamentos/previsto-real-equipamentos";
import type { PrevistoRealEquipamento, PrevistoRealResumo, SimulacaoCustoEquipamentoEntrada } from "@/types";

type Busca = { perfil: string | undefined };

export const Route = createFileRoute("/app/previsto-real-equipamentos")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): Busca => ({
    perfil: typeof search["perfil"] === "string" ? search["perfil"] : undefined,
  }),
  component: PrevistoRealEquipamentosPage,
});

function periodoPadrao(dias: number) {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - (dias - 1) * 86_400_000);
  const iso = (data: Date) => data.toISOString().slice(0, 10);
  return { inicio: iso(inicio), fim: iso(fim) };
}

function moeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function numero(valor: number, casas = 0) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);
}

function percentual(valor: number | null) {
  return valor == null ? "—" : `${numero(valor * 100, 1)}%`;
}

function dataBR(data: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${data}T00:00:00`));
}

function sinal(valor: number) {
  return valor > 0.005 ? "positivo" : valor < -0.005 ? "negativo" : "neutro";
}

function PrevistoRealEquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const { perfil: perfilParam } = Route.useSearch();
  const [periodo, setPeriodo] = useState(periodoPadrao(30));
  const [perfilId, setPerfilId] = useState<string>(perfilParam ?? "");
  const [linhas, setLinhas] = useState<SimulacaoCustoEquipamentoEntrada[]>([]);
  const [precosManuais, setPrecosManuais] = useState<Record<string, number | null>>({});
  const [perfilInfo, setPerfilInfo] = useState<{ id: string; nome: string; versao: number } | null>(null);
  const [dados, setDados] = useState<PrevistoRealResumo | null>(null);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);
  const [comparando, setComparando] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );

  const perfis = useLiveQuery(
    () => (projetoId ? listarPerfisAtuais(projetoId) : Promise.resolve([])),
    [projetoId],
  ) ?? [];

  const financeiroAtivo = configuracao?.modulos.financeiro_equipamentos === true;

  useEffect(() => {
    if (!projetoId || !perfilParam) return;
    setPerfilId(perfilParam);
  }, [projetoId, perfilParam]);

  async function carregarPerfil(id: string) {
    if (!projetoId || !id) return;
    setCarregandoPerfil(true);
    setDados(null);
    try {
      const carregado = await carregarPerfilParaSimulacao(projetoId, id);
      setPerfilId(carregado.perfil.id);
      setPerfilInfo({ id: carregado.perfil.id, nome: carregado.perfil.nome, versao: carregado.perfil.versao });
      setPeriodo({ inicio: carregado.perfil.periodo_referencia_inicio, fim: carregado.perfil.periodo_referencia_fim });
      setLinhas(carregado.equipamentos);
      setPrecosManuais(carregado.precosManuais);
      if (carregado.avisos.length) toast.warning(carregado.avisos[0]);
    } catch (error) {
      setPerfilInfo(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o perfil.");
    } finally {
      setCarregandoPerfil(false);
    }
  }

  useEffect(() => {
    if (!projetoId || !perfilId || !perfis.length) return;
    const existe = perfis.some((perfil) => perfil.id === perfilId);
    if (existe) void carregarPerfil(perfilId);
    // carregar somente quando o parâmetro inicial/seleção muda; o lint de hooks não consegue modelar essa intenção.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId, perfilId, perfis.length]);

  async function comparar() {
    if (!projetoId || !perfilInfo) return;
    if (!periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim) {
      toast.error("Informe um período válido.");
      return;
    }
    if (!linhas.length) {
      toast.error("O perfil não possui equipamentos válidos no projeto atual.");
      return;
    }

    setComparando(true);
    try {
      const simulacao = await calcularSimulacaoCustos(projetoId, {
        inicio: periodo.inicio,
        fim: periodo.fim,
        equipamentos: linhas,
        precosManuais,
      });
      const comparacao = await compararPrevistoReal(projetoId, {
        inicio: periodo.inicio,
        fim: periodo.fim,
        simulacao,
        perfilId: perfilInfo.id,
        perfilNome: perfilInfo.nome,
        perfilVersao: perfilInfo.versao,
      });
      setDados(comparacao);
      setSelecionado(comparacao.equipamentos[0]?.equipamento_id ?? null);
      toast.success("Previsto x Real atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível calcular a comparação.");
    } finally {
      setComparando(false);
    }
  }

  if (!projetoId) {
    return <EmptyPage icon={GitCompareArrows} title="Selecione um projeto" description="A comparação usa o histórico real do projeto ativo e os parâmetros financeiros do perfil escolhido." />;
  }

  if (!financeiroAtivo) {
    return <EmptyPage icon={CircleDollarSign} title="Módulo financeiro desativado" description="A comparação previsto x real depende de custos e parâmetros financeiros registrados. Ative o módulo para continuar." action={<Button asChild><Link to="/app/configuracoes">Abrir configurações</Link></Button>} />;
  }

  const linhaSelecionada = dados?.equipamentos.find((item) => item.equipamento_id === selecionado) ?? null;
  const totalClass = dados ? sinal(dados.total.diferenca) : "neutro";

  return (
    <main className="min-w-0 space-y-6 bg-gradient-to-b from-primary/[0.025] via-background to-background p-4 sm:p-6 lg:p-8">
      <header className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/[0.10] via-background to-background shadow-sm">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <GitCompareArrows className="size-4" />
              Controle de desempenho
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Previsto x Real</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Confronte uma simulação com o histórico efetivamente registrado, separando diferença, percentual e fatores sustentados pelos dados disponíveis.
            </p>
            {perfilInfo ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                  Perfil · {perfilInfo.nome} · v{perfilInfo.versao}
                </Badge>
                <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                  <Link to="/app/simulacao-custos" search={{ perfil: perfilInfo.id }}><Calculator className="mr-1.5 size-3.5" /> Abrir simulação</Link>
                </Button>
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border bg-background/85 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <History className="size-4 text-primary" /> Período comparado
            </div>
            <p className="mt-2 font-display text-base font-semibold sm:text-lg">
              {dataBR(periodo.inicio)} <span className="text-muted-foreground">até</span> {dataBR(periodo.fim)}
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border bg-background shadow-sm">
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(260px,1fr)_180px_180px_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label>Perfil de parâmetros</Label>
            <Select value={perfilId ?? ""} onValueChange={(value) => void carregarPerfil(value)}>
              <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
              <SelectContent>
                {perfis.map((perfil) => (
                  <SelectItem key={perfil.id} value={perfil.id}>{perfil.nome} · v{perfil.versao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="previsto-real-de">Início</Label>
            <Input id="previsto-real-de" type="date" value={periodo.inicio} max={periodo.fim} onChange={(event) => { setPeriodo((atual) => ({ ...atual, inicio: event.target.value })); setDados(null); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="previsto-real-ate">Fim</Label>
            <Input id="previsto-real-ate" type="date" value={periodo.fim} min={periodo.inicio} onChange={(event) => { setPeriodo((atual) => ({ ...atual, fim: event.target.value })); setDados(null); }} />
          </div>
          <Button type="button" onClick={() => void comparar()} disabled={!perfilInfo || carregandoPerfil || comparando}>
            {carregandoPerfil || comparando ? <Loader2 className="size-4 animate-spin" /> : <GitCompareArrows className="size-4" />}
            {comparando ? "Comparando…" : "Comparar"}
          </Button>
        </div>
        {!perfis.length ? (
          <div className="border-t bg-warning/5 px-4 py-3 text-xs text-muted-foreground sm:px-5">
            Nenhum perfil atual de parâmetros foi encontrado. <Link className="font-semibold text-primary underline-offset-4 hover:underline" to="/app/perfis-parametros-equipamentos">Crie um perfil</Link> antes de comparar.
          </div>
        ) : null}
      </section>

      {dados ? (
        <>
          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">1 · Resultado executivo</p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">O que mudou entre o cenário e o realizado</h2>
              </div>
              <p className="max-w-2xl text-xs leading-5 text-muted-foreground">Diferença positiva significa custo real acima do previsto; diferença negativa indica custo real abaixo da previsão.</p>
            </div>
            <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
              <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
                <Metric label="Custo previsto" value={moeda(dados.total.previsto)} icon={Calculator} />
                <Metric label="Custo real" value={moeda(dados.total.real)} icon={History} tone={totalClass === "positivo" ? "danger" : totalClass === "negativo" ? "success" : "neutral"} />
                <Metric label="Diferença" value={moeda(dados.total.diferenca)} icon={dados.total.diferenca >= 0 ? TrendingUp : TrendingDown} tone={totalClass === "positivo" ? "danger" : totalClass === "negativo" ? "success" : "neutral"} destaque />
                <Metric label="Diferença percentual" value={percentual(dados.total.percentual)} icon={BarChart3} tone={totalClass === "positivo" ? "danger" : totalClass === "negativo" ? "success" : "neutral"} />
              </div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/10">
                <CardTitle className="text-base">Composição do custo</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                <CompareBar label="Operação" previsto={dados.previsto.operacao} real={dados.real.operacao} tone="primary" />
                <CompareBar label="Manutenção" previsto={dados.previsto.manutencao} real={dados.real.manutencao} tone="warning" />
                <CompareBar label="Recorrência" previsto={dados.previsto.recorrencia} real={dados.real.recorrencia} tone="success" />
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/10">
                <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="size-4 text-warning" /> Fatores indicados pelos dados</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                {dados.causas.length ? (
                  <div className="space-y-2.5">
                    {dados.causas.slice(0, 5).map((causa) => <CauseRow key={causa.causa} causa={causa} />)}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                    Nenhum desvio relevante foi identificado com os dados disponíveis.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {dados.qualidade.length ? (
            <div className="rounded-2xl border border-warning/25 bg-warning/10 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <div>
                  <p className="text-sm font-semibold">Limitações da comparação</p>
                  <div className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                    {dados.qualidade.map((item) => <p key={item}>• {item}</p>)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <section className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">2 · Equipamentos</p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Onde o desvio aconteceu</h2>
            </div>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1060px] text-sm">
                    <thead className="border-b bg-muted/30 text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
                      <tr>
                        <th className="sticky left-0 z-10 bg-muted/95 px-4 py-3 text-left font-semibold">Equipamento</th>
                        <th className="px-4 py-3 text-right font-semibold">Previsto</th>
                        <th className="px-4 py-3 text-right font-semibold">Real</th>
                        <th className="px-4 py-3 text-right font-semibold">Diferença</th>
                        <th className="px-4 py-3 text-right font-semibold">%</th>
                        <th className="px-4 py-3 text-right font-semibold">Consumo</th>
                        <th className="px-4 py-3 text-right font-semibold">Manut.</th>
                        <th className="px-4 py-3 text-left font-semibold">Principal fator</th>
                        <th className="px-4 py-3 text-center font-semibold">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {dados.equipamentos.map((item) => {
                        const principal = item.causas[0];
                        const classe = sinal(item.total.diferenca);
                        return (
                          <tr key={item.equipamento_id} className="transition-colors hover:bg-muted/20">
                            <td className="sticky left-0 z-10 bg-background px-4 py-3.5">
                              <div className="font-medium">{item.nome}</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">{item.modelo ?? "Sem modelo"} · {numero(item.quantidade)} un.</div>
                            </td>
                            <td className="px-4 py-3.5 text-right tabular-nums">{moeda(item.total.previsto)}</td>
                            <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{moeda(item.total.real)}</td>
                            <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${classe === "positivo" ? "text-destructive" : classe === "negativo" ? "text-success" : ""}`}>{moeda(item.total.diferenca)}</td>
                            <td className="px-4 py-3.5 text-right tabular-nums">{percentual(item.total.percentual)}</td>
                            <td className="px-4 py-3.5 text-right tabular-nums">{numero(item.consumo.real, 2)}</td>
                            <td className="px-4 py-3.5 text-right tabular-nums">{numero(item.manutencoes_reais)}</td>
                            <td className="px-4 py-3.5">{principal ? <Badge variant="outline" className="border-warning/25 bg-warning/10 text-warning">{rotuloCausa(principal.causa)}</Badge> : <span className="text-xs text-muted-foreground">Sem desvio relevante</span>}</td>
                            <td className="px-4 py-3.5 text-center"><Button type="button" size="sm" variant={selecionado === item.equipamento_id ? "default" : "outline"} onClick={() => setSelecionado(item.equipamento_id)}>{selecionado === item.equipamento_id ? "Aberto" : "Ver"}</Button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {linhaSelecionada ? <DetalheEquipamento item={linhaSelecionada} /> : null}

          <div className="rounded-2xl border bg-muted/20 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <Settings2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">A comparação não altera parâmetros nem histórico</p>
                <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
                  O cenário é recalculado a partir do perfil selecionado e confrontado com os registros reais do período. Nenhuma regra, custo ou movimentação é atualizada automaticamente.
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border bg-background shadow-sm">
          <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border bg-primary/10 text-primary"><GitCompareArrows className="size-6" /></div>
            <p className="mt-4 font-semibold">Selecione um perfil e compare com o realizado</p>
            <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">A simulação será recalculada no período escolhido e comparada com consumo, manutenção e custos efetivamente registrados.</p>
          </div>
        </div>
      )}
    </main>
  );
}

function rotuloCausa(causa: PrevistoRealEquipamento["causas"][number]["causa"]) {
  const mapa = { UTILIZACAO: "Utilização", CONSUMO: "Consumo", PRECO: "Preço", MANUTENCAO: "Manutenção", RECORRENCIA: "Recorrência", DADOS_AUSENTES: "Dados" } as const;
  return mapa[causa];
}

function Metric({ label, value, icon: Icon, tone = "neutral", destaque = false }: { label: string; value: string; icon: typeof Calculator; tone?: "neutral" | "primary" | "success" | "danger"; destaque?: boolean }) {
  const tones = { neutral: "bg-muted text-muted-foreground", primary: "bg-primary/10 text-primary", success: "bg-success/10 text-success", danger: "bg-destructive/10 text-destructive" };
  const texts = { neutral: "text-foreground", primary: "text-primary", success: "text-success", danger: "text-destructive" };
  return <div className={['relative p-4 sm:p-5', destaque ? 'bg-primary/[0.045]' : ''].join(' ')}><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`flex size-6 items-center justify-center rounded-md ${tones[tone]}`}><Icon className="size-3.5" /></span>{label}</div><p className={`mt-3 font-display text-2xl font-semibold tracking-tight tabular-nums ${texts[tone]}`}>{value}</p></div>;
}

function CompareBar({ label, previsto, real, tone }: { label: string; previsto: number; real: number; tone: "primary" | "warning" | "success" }) {
  const max = Math.max(previsto, real, 1);
  const colors = { primary: "bg-primary", warning: "bg-warning", success: "bg-success" };
  return <div className="rounded-xl border p-3.5"><p className="text-xs font-semibold">{label}</p><div className="mt-3 space-y-2"><BarLine label="Previsto" value={previsto} max={max} className="bg-muted-foreground/50" /><BarLine label="Real" value={real} max={max} className={colors[tone]} /></div></div>;
}

function BarLine({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return <div><div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span>{label}</span><span className="font-semibold tabular-nums text-foreground">{moeda(value)}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(2, Math.min(100, (value / max) * 100))}%` }} /></div></div>;
}

function CauseRow({ causa }: { causa: PrevistoRealResumo["causas"][number] }) {
  return <div className="flex items-start gap-3 rounded-xl border bg-muted/10 px-3.5 py-3"><span className="mt-0.5 size-2 shrink-0 rounded-full bg-warning" /><div className="min-w-0"><p className="text-xs font-semibold">{rotuloCausa(causa.causa)}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{causa.descricao}</p></div></div>;
}

function DetalheEquipamento({ item }: { item: PrevistoRealEquipamento }) {
  return <section className="space-y-3"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">3 · Detalhe</p><h2 className="mt-1 font-display text-xl font-semibold tracking-tight">{item.nome}</h2></div><p className="text-xs text-muted-foreground">{item.modelo ?? "Sem modelo"} · {numero(item.quantidade)} unidade(s)</p></div><div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]"><Card><CardContent className="grid divide-y p-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0"><Metric label="Operação" value={`${moeda(item.operacional.previsto)} → ${moeda(item.operacional.real)}`} icon={Package} tone="primary" /><Metric label="Manutenção" value={`${moeda(item.manutencao.previsto)} → ${moeda(item.manutencao.real)}`} icon={Wrench} tone="danger" /><Metric label="Recorrência" value={`${moeda(item.recorrencia.previsto)} → ${moeda(item.recorrencia.real)}`} icon={Clock3} tone="success" /><Metric label="Total" value={`${moeda(item.total.previsto)} → ${moeda(item.total.real)}`} icon={CircleDollarSign} tone={item.total.diferenca > 0 ? "danger" : "success"} destaque /></CardContent></Card><Card className="overflow-hidden"><CardHeader className="border-b bg-muted/10"><CardTitle className="text-base">Consumo por insumo</CardTitle></CardHeader><CardContent className="p-0">{item.produtos.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="border-b bg-muted/30 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="px-4 py-3 text-left">Produto</th><th className="px-4 py-3 text-right">Previsto</th><th className="px-4 py-3 text-right">Real</th><th className="px-4 py-3 text-right">Δ</th></tr></thead><tbody className="divide-y">{item.produtos.slice(0, 12).map((produto) => <tr key={produto.produto_id}><td className="px-4 py-3">{produto.nome}</td><td className="px-4 py-3 text-right tabular-nums">{numero(produto.quantidade_prevista, 2)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{numero(produto.quantidade_real, 2)}</td><td className={`px-4 py-3 text-right font-semibold tabular-nums ${produto.quantidade_diferenca > 0 ? "text-destructive" : produto.quantidade_diferenca < 0 ? "text-success" : ""}`}>{numero(produto.quantidade_diferenca, 2)}</td></tr>)}</tbody></table></div> : <EmptyDetail text="Nenhum insumo previsto ou apropriado no período." />}</CardContent></Card></div><div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader className="border-b bg-muted/10"><CardTitle className="text-base">Utilização e manutenção</CardTitle></CardHeader><CardContent className="grid gap-4 p-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Uso previsto</p><p className="mt-1 text-lg font-semibold tabular-nums">{numero(item.uso.previsto, 2)} {item.uso.unidade}</p></div><div><p className="text-xs text-muted-foreground">Uso real</p><p className="mt-1 text-lg font-semibold tabular-nums">{item.uso.real == null ? "—" : `${numero(item.uso.real, 2)} ${item.uso.unidade}`}</p></div><div><p className="text-xs text-muted-foreground">Manutenções</p><p className="mt-1 text-lg font-semibold tabular-nums">{numero(item.manutencoes_previstas)} → {numero(item.manutencoes_reais)}</p></div></CardContent></Card><Card><CardHeader className="border-b bg-muted/10"><CardTitle className="text-base">Explicação do desvio</CardTitle></CardHeader><CardContent className="space-y-2 p-4">{item.causas.length ? item.causas.map((causa) => <CauseRow key={causa.causa} causa={causa} />) : <div className="rounded-xl bg-success/10 p-3 text-xs text-success">Sem desvio relevante identificado com os dados disponíveis.</div>}{item.qualidade.map((item) => <p key={item} className="text-xs leading-5 text-muted-foreground">• {item}</p>)}</CardContent></Card></div></section>;
}

function EmptyPage({ icon: Icon, title, description, action }: { icon: typeof GitCompareArrows; title: string; description: string; action?: ReactNode }) {
  return <main className="flex min-h-[60vh] items-center justify-center p-6"><Card className="w-full max-w-xl overflow-hidden"><div className="bg-gradient-to-br from-primary/10 via-background to-background p-7 text-center sm:p-9"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-6" /></span><h1 className="mt-4 font-display text-xl font-semibold">{title}</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>{action ? <div className="mt-5">{action}</div> : null}</div></Card></main>;
}

function EmptyDetail({ text }: { text: string }) { return <div className="p-7 text-center text-xs text-muted-foreground">{text}</div>; }
