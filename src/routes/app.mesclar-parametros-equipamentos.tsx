import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronRight,
  Layers3,
  Merge,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { listarPerfis } from "@/services/equipamentos/perfis-parametros-custos-repo";
import { analisarMesclagem, gerarPerfilMesclado } from "@/services/equipamentos/mesclagem-parametros-custos";
import type { AnaliseMesclagemParametros, PerfilParametroCusto } from "@/types";

export const Route = createFileRoute("/app/mesclar-parametros-equipamentos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mesclar Parâmetros — Almoxarifado" },
      { name: "description", content: "Validação, compatibilidade e geração de uma base consolidada de parâmetros de custos." },
    ],
  }),
  component: MesclarParametrosEquipamentosPage,
});

function criarPeriodoInicial(perfis: PerfilParametroCusto[]) {
  if (!perfis.length) {
    const hoje = new Date().toISOString().slice(0, 10);
    return { inicio: hoje, fim: hoje };
  }
  return {
    inicio: perfis.reduce((menor, item) => item.periodo_referencia_inicio < menor ? item.periodo_referencia_inicio : menor, perfis[0]!.periodo_referencia_inicio),
    fim: perfis.reduce((maior, item) => item.periodo_referencia_fim > maior ? item.periodo_referencia_fim : maior, perfis[0]!.periodo_referencia_fim),
  };
}

function MesclarParametrosEquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const navigate = useNavigate();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [resolucoes, setResolucoes] = useState<Record<string, string>>({});
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [periodo, setPeriodo] = useState({ inicio: "", fim: "" });
  const [gerando, startTransition] = useTransition();

  const perfis = useLiveQuery(
    () => (projetoId ? listarPerfis(projetoId) : []),
    [projetoId],
  ) ?? [];

  const escolhidos = useMemo(
    () => perfis.filter((perfil) => selecionados.includes(perfil.id)),
    [perfis, selecionados],
  );

  const analise = useMemo<AnaliseMesclagemParametros | null>(() => {
    if (escolhidos.length < 2) return null;
    try {
      return analisarMesclagem(escolhidos);
    } catch {
      return null;
    }
  }, [escolhidos]);

  const periodoInicial = useMemo(() => criarPeriodoInicial(escolhidos), [escolhidos]);

  function alternar(perfil: PerfilParametroCusto) {
    setSelecionados((atual) => {
      if (atual.includes(perfil.id)) return atual.filter((id) => id !== perfil.id);
      const mesmaFamilia = perfis.find((item) => item.id === perfil.id && item.perfil_id === perfil.perfil_id);
      void mesmaFamilia;
      return [...atual, perfil.id];
    });
  }

  function definirResolucao(conflitoId: string, perfilId: string) {
    setResolucoes((atual) => ({ ...atual, [conflitoId]: perfilId }));
  }

  function prepararPeriodo() {
    if (!periodo.inicio && !periodo.fim) return periodoInicial;
    return periodo;
  }

  async function gerar() {
    if (!projetoId || !analise) return;
    const periodoFinal = prepararPeriodo();
    startTransition(() => {
      gerarPerfilMesclado(projetoId, escolhidos, analise, {
        nome,
        descricao: descricao.trim() || null,
        periodo_inicio: periodoFinal.inicio,
        periodo_fim: periodoFinal.fim,
        fonte_dados: `Mesclagem de ${escolhidos.length} perfis de parâmetros`,
        observacoes: observacoes.trim() || null,
        resolucoes,
      })
        .then(async (perfil) => {
          toast.success(`Base consolidada “${perfil.nome}” criada.`);
          await navigate({ to: "/app/perfis-parametros-equipamentos" });
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível gerar a base consolidada."));
    });
  }

  const familiasDuplicadas = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const perfil of escolhidos) mapa.set(perfil.perfil_id, (mapa.get(perfil.perfil_id) ?? 0) + 1);
    return [...mapa.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  }, [escolhidos]);

  const conflitosResolvidos = analise ? analise.conflitos.filter((item) => Boolean(resolucoes[item.id])).length : 0;
  const todosResolvidos = !!analise && analise.conflitos.length === conflitosResolvidos;

  if (!projetoId) {
    return <main className="p-6 text-sm text-muted-foreground">Selecione um projeto para mesclar perfis.</main>;
  }

  return (
    <main className="min-w-0 space-y-6 bg-gradient-to-b from-primary/[0.025] via-background to-background p-4 sm:p-6 lg:p-8">
      <header className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/[0.1] via-background to-background shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Merge className="size-4" /> Consolidação de parâmetros
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Mesclar parâmetros</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Combine perfis compatíveis em uma nova base, preservando origem e exigindo decisão explícita onde os parâmetros divergem.
            </p>
          </div>
          <Button asChild variant="outline"><Link to="/app/perfis-parametros-equipamentos">Voltar aos perfis</Link></Button>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">1 · Fontes</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Escolha as versões a consolidar</h2>
          </div>
          <span className="text-xs text-muted-foreground">{escolhidos.length} selecionado{escolhidos.length === 1 ? "" : "s"}</span>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {perfis.map((perfil) => {
            const ativo = selecionados.includes(perfil.id);
            const mesmaFamilia = familiasDuplicadas.includes(perfil.perfil_id) && ativo;
            return (
              <button
                key={perfil.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => alternar(perfil)}
                className={["rounded-2xl border bg-background p-4 text-left transition", ativo ? "border-primary/50 bg-primary/[0.035] shadow-sm ring-1 ring-primary/15" : "hover:border-primary/25 hover:bg-muted/20"].join(" ")}
              >
                <div className="flex items-start gap-3">
                  <span className={["mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border", ativo ? "border-primary/25 bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground"].join(" ")}>{ativo ? <Check className="size-4" /> : <Layers3 className="size-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{perfil.nome}</span>
                      <Badge variant="outline">v{perfil.versao}</Badge>
                      {perfil.origem === "CONSOLIDADO" ? <Badge variant="outline" className="border-success/25 bg-success/10 text-success">Consolidado</Badge> : null}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{perfil.equipamentos.length} equipamento{perfil.equipamentos.length === 1 ? "" : "s"} · {perfil.periodo_referencia_inicio} até {perfil.periodo_referencia_fim}</span>
                    {mesmaFamilia ? <span className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-warning"><TriangleAlert className="size-3.5" /> Selecione somente uma versão desta família.</span> : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {analise ? (
        <>
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">2 · Compatibilidade</p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Leitura da mesclagem</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-success/25 bg-success/10 text-success"><ShieldCheck className="mr-1 size-3" /> {analise.equipamentos.length} equipamentos</Badge>
                <Badge variant="outline">{analise.regras.length} regras</Badge>
                <Badge variant="outline" className={analise.conflitos.length ? "border-warning/25 bg-warning/10 text-warning" : "border-success/25 bg-success/10 text-success"}>{analise.conflitos.length ? `${conflitosResolvidos}/${analise.conflitos.length} conflitos resolvidos` : "Sem conflitos"}</Badge>
              </div>
            </div>

            {familiasDuplicadas.length ? (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="text-xs leading-5">Há versões diferentes da mesma família selecionadas. Remova versões duplicadas antes de gerar a base consolidada.</p>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="overflow-hidden lg:col-span-2">
                <CardHeader className="border-b bg-muted/15">
                  <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-primary" /> Conflitos que exigem decisão</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!analise.conflitos.length ? (
                    <div className="flex items-start gap-3 p-5"><ShieldCheck className="mt-0.5 size-4 text-success" /><p className="text-sm leading-6">Todos os parâmetros compatíveis apresentam os mesmos valores. A consolidação pode ser gerada sem escolha manual.</p></div>
                  ) : (
                    <div className="divide-y">
                      {analise.conflitos.map((conflito) => (
                        <div key={conflito.id} className="space-y-3 p-4 sm:p-5">
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="border-warning/25 bg-warning/10 text-warning">{conflito.tipo === "EQUIPAMENTO" ? "Equipamento" : "Regra"}</Badge>
                                <span className="text-sm font-semibold">{conflito.campo}</span>
                              </div>
                              <p className="mt-1 text-sm">{conflito.equipamento_nome}{conflito.produto_nome ? ` · ${conflito.produto_nome}` : ""}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{conflito.descricao}</p>
                            </div>
                            <Badge variant="outline" className={resolucoes[conflito.id] ? "border-success/25 bg-success/10 text-success" : "border-warning/25 bg-warning/10 text-warning"}>{resolucoes[conflito.id] ? "Resolvido" : "Pendente"}</Badge>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center">
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {conflito.fontes.map((fonte) => <p key={`${conflito.id}-${fonte.perfilId}`}><span className="font-medium text-foreground">{fonte.perfilNome}:</span> {fonte.valor}</p>)}
                            </div>
                            <Select value={resolucoes[conflito.id] ?? ""} onValueChange={(value) => definirResolucao(conflito.id, value)}>
                              <SelectTrigger><SelectValue placeholder="Escolher fonte" /></SelectTrigger>
                              <SelectContent>
                                {conflito.fontes.map((fonte) => <SelectItem key={fonte.perfilId} value={fonte.perfilId}>{fonte.perfilNome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="border-b bg-muted/15"><CardTitle className="text-base">Fontes preservadas</CardTitle></CardHeader>
                <CardContent className="space-y-3 p-4 sm:p-5">
                  {analise.fontes.map((fonte) => (
                    <div key={fonte.id} className="rounded-xl border bg-muted/15 p-3">
                      <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold">{fonte.nome}</span><Badge variant="outline">v{fonte.versao}</Badge></div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{fonte.periodo_inicio} → {fonte.periodo_fim}</p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">A consolidação é criada como uma nova família. Nenhuma versão de origem é modificada.</div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">3 · Nova base</p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Defina o perfil consolidado</h2>
            </div>
            <Card>
              <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mescla-nome">Nome</Label>
                  <Input id="mescla-nome" value={nome} placeholder="Ex.: Resort Norte — Base Consolidada 2026" onChange={(event) => setNome(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mescla-fonte">Fonte dos dados</Label>
                  <Input id="mescla-fonte" value={`Mesclagem de ${escolhidos.length} perfis de parâmetros`} readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mescla-inicio">Período inicial</Label>
                  <Input id="mescla-inicio" type="date" value={periodo.inicio || periodoInicial.inicio} onChange={(event) => setPeriodo((atual) => ({ ...atual, inicio: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mescla-fim">Período final</Label>
                  <Input id="mescla-fim" type="date" value={periodo.fim || periodoInicial.fim} min={periodo.inicio || periodoInicial.inicio} onChange={(event) => setPeriodo((atual) => ({ ...atual, fim: event.target.value }))} />
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="mescla-descricao">Descrição</Label>
                  <Input id="mescla-descricao" value={descricao} placeholder="Contexto da base consolidada" onChange={(event) => setDescricao(event.target.value)} />
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="mescla-observacoes">Observações</Label>
                  <Input id="mescla-observacoes" value={observacoes} placeholder="Critérios, origem ou notas adicionais" onChange={(event) => setObservacoes(event.target.value)} />
                </div>
              </CardContent>
            </Card>
          </section>

          <div className="flex flex-col gap-3 rounded-2xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3"><ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Pronto para gerar</p><p className="mt-1 text-xs text-muted-foreground">{analise.conflitos.length ? `${conflitosResolvidos} de ${analise.conflitos.length} conflitos resolvidos explicitamente.` : "Nenhuma divergência precisa de decisão."} A base será criada sem alterar as fontes.</p></div></div>
            <Button onClick={() => void gerar()} disabled={gerando || !nome.trim() || familiasDuplicadas.length > 0 || !todosResolvidos}>
              {gerando ? "Gerando…" : "Gerar base consolidada"}<ChevronRight className="size-4" />
            </Button>
          </div>
        </>
      ) : (
        <Card className="border-dashed"><CardContent className="flex min-h-44 flex-col items-center justify-center p-6 text-center"><Merge className="size-7 text-primary" /><p className="mt-3 text-sm font-semibold">Selecione pelo menos dois perfis</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">A análise de compatibilidade aparecerá aqui. A mesclagem não cria média automática para parâmetros divergentes.</p></CardContent></Card>
      )}
    </main>
  );
}
