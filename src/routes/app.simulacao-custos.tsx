import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gauge,
  GitCompareArrows,
  HardHat,
  Loader2,
  Layers3,
  Package,
  Plus,
  Save,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/common/Combobox";
import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import {
  aplicarPrecosManuaisNaSimulacao,
  calcularSimulacaoCustos,
} from "@/services/equipamentos/simulacao-custos";
import {
  carregarPerfilParaSimulacao,
  salvarPerfil,
} from "@/services/equipamentos/perfis-parametros-custos-repo";
import type {
  Equipamento,
  EquipamentoPeriodicidadeCusto,
  RegraConsumoEquipamentoDirecionador,
  SimulacaoCustoEquipamentoEntrada,
  SimulacaoCustoEquipamentoResumo,
  EstoqueEquipamento,
} from "@/types";

type SimulacaoBusca = {
  perfil: string | undefined;
};

export const Route = createFileRoute("/app/simulacao-custos")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SimulacaoBusca => ({
    perfil: typeof search["perfil"] === "string" ? search["perfil"] : undefined,
  }),
  component: SimulacaoCustosPage,
});

type LinhaSimulacao = SimulacaoCustoEquipamentoEntrada;

type FormPeriodo = {
  inicio: string;
  fim: string;
};

const DIRECIONADORES: Array<{ value: RegraConsumoEquipamentoDirecionador; label: string; unidade: string }> = [
  { value: "HORA", label: "Hora de operação", unidade: "h" },
  { value: "DIA", label: "Dia", unidade: "dia" },
  { value: "CICLO", label: "Ciclo", unidade: "ciclo" },
  { value: "KM", label: "Quilometragem", unidade: "km" },
  { value: "PRODUCAO", label: "Produção", unidade: "un." },
  { value: "USO_MANUAL", label: "Uso informado", unidade: "base" },
  { value: "PERIODO", label: "Período", unidade: "período" },
];

const PERIODICIDADES_RECORRENTES: Array<{ value: EquipamentoPeriodicidadeCusto; label: string }> = [
  { value: "HORA", label: "Por hora" },
  { value: "DIA", label: "Por dia" },
  { value: "SEMANA", label: "Por semana" },
  { value: "MES", label: "Por mês" },
  { value: "ANO", label: "Por ano" },
];

function criarPeriodoPadrao(dias: number): FormPeriodo {
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

function formatarData(data: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${data}T00:00:00`));
}

function criarLinha(equipamento: Equipamento, quantidadePadrao: number): LinhaSimulacao {
  return {
    equipamento_id: equipamento.id,
    quantidade: Math.max(1, quantidadePadrao || 1),
    uso_previsto: 0,
    direcionador: "HORA",
    manutencao_ocorrencias_por_unidade: 0,
    manutencao_valor_por_ocorrencia: 0,
    custo_recorrente_unitario_override: null,
    periodicidade_recorrente_override: null,
  };
}

function normalizarLinhaSimulacao(linha: LinhaSimulacao): LinhaSimulacao {
  const numero = (valor: unknown, padrao = 0) => {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : padrao;
  };

  return {
    ...linha,
    quantidade: Math.max(1, numero(linha.quantidade, 1)),
    uso_previsto: Math.max(0, numero(linha.uso_previsto)),
    manutencao_ocorrencias_por_unidade: Math.max(0, numero(linha.manutencao_ocorrencias_por_unidade)),
    manutencao_valor_por_ocorrencia: Math.max(0, numero(linha.manutencao_valor_por_ocorrencia)),
    custo_recorrente_unitario_override:
      linha.custo_recorrente_unitario_override == null
        ? null
        : Math.max(0, numero(linha.custo_recorrente_unitario_override)),
  };
}

function selecionarConteudoAoFocar(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}

function obterDirecionador(value: RegraConsumoEquipamentoDirecionador) {
  return DIRECIONADORES.find((item) => item.value === value) ?? DIRECIONADORES[0]!;
}

function SimulacaoCustosPage() {
  const [projetoId] = useProjetoAtivoId();
  const periodoInicial = useMemo(() => criarPeriodoPadrao(30), []);
  const [periodo, setPeriodo] = useState<FormPeriodo>(periodoInicial);
  const [periodoAplicado, setPeriodoAplicado] = useState<FormPeriodo>(periodoInicial);
  const [linhas, setLinhas] = useState<LinhaSimulacao[]>([]);
  const [equipamentoParaAdicionar, setEquipamentoParaAdicionar] = useState<string | null>(null);
  const [resultadoBase, setResultadoBase] = useState<SimulacaoCustoEquipamentoResumo | null>(null);
  const [precosManuais, setPrecosManuais] = useState<Record<string, string>>({});
  const [calculando, setCalculando] = useState(false);
  const [perfilAtual, setPerfilAtual] = useState<{ id: string; perfilId: string; versao: number; nome: string } | null>(null);
  const [dialogSalvarPerfil, setDialogSalvarPerfil] = useState(false);
  const [nomePerfil, setNomePerfil] = useState("");
  const [descricaoPerfil, setDescricaoPerfil] = useState("");
  const [fonteDadosPerfil, setFonteDadosPerfil] = useState("");
  const [observacoesPerfil, setObservacoesPerfil] = useState("");
  const { perfil: perfilParam } = Route.useSearch();

  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );

  const equipamentos = useLiveQuery(
    () =>
      projetoId
        ? getDB().equipamentos.where("projeto_id").equals(projetoId).toArray()
        : Promise.resolve([] as Equipamento[]),
    [projetoId],
  ) ?? [];
  
  const estoques = useLiveQuery(
    () =>
      projetoId
        ? getDB().estoque_equipamentos.where("projeto_id").equals(projetoId).toArray()
        : Promise.resolve([] as EstoqueEquipamento[]),
    [projetoId],
  ) ?? [];

  const financeiroAtivo = configuracao?.modulos.financeiro_equipamentos === true;
  const erroPeriodo = !periodo.inicio || !periodo.fim
    ? "Informe as duas datas."
    : periodo.inicio > periodo.fim
      ? "A data inicial não pode ser depois da data final."
      : null;
  const periodoAlterado = periodo.inicio !== periodoAplicado.inicio || periodo.fim !== periodoAplicado.fim;

  const quantidadePorEquipamento = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const estoque of estoques) {
      if (estoque.ativo === false || estoque.status !== "ATIVO") continue;
      const saldo = Math.max(0, estoque.quantidade - (estoque.devolvido ?? 0) - (estoque.baixado ?? 0));
      if (saldo <= 0) continue;
      mapa.set(estoque.equipamento_id, (mapa.get(estoque.equipamento_id) ?? 0) + saldo);
    }
    return mapa;
  }, [estoques]);

  const equipamentosDisponiveis = useMemo(
    () => equipamentos
      // Equipamentos legados sem o campo ativo continuam disponíveis.
      // Somente um equipamento explicitamente inativo deve ser bloqueado.
      .filter((item) => item.ativo !== false && !linhas.some((linha) => linha.equipamento_id === item.id))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    [equipamentos, linhas],
  );
  console.log(linhas)
  const equipamentosPorId = useMemo(
    () => new Map(equipamentos.map((equipamento) => [equipamento.id, equipamento])),
    [equipamentos],
  );

  const precosNumericos = useMemo<Record<string, number | null>>(() => {
    return Object.fromEntries(
      Object.entries(precosManuais).map(([id, valor]) => {
        const numero = Number(valor.replace(",", "."));
        return [id, valor.trim() === "" || !Number.isFinite(numero) || numero < 0 ? null : numero];
      }),
    );
  }, [precosManuais]);

  const resultado = useMemo(
    () =>
      resultadoBase
        ? aplicarPrecosManuaisNaSimulacao(resultadoBase, precosNumericos)
        : null,
    [resultadoBase, precosNumericos],
  );

  useEffect(() => {
    if (!projetoId || !perfilParam) return;
    let cancelado = false;

    carregarPerfilParaSimulacao(projetoId, perfilParam)
      .then((carregado) => {
        if (cancelado) return;

        const periodoCarregado = {
          inicio: carregado.perfil.periodo_referencia_inicio,
          fim: carregado.perfil.periodo_referencia_fim,
        };

        setPeriodo(periodoCarregado);
        setPeriodoAplicado(periodoCarregado);
        setLinhas(carregado.equipamentos.map(normalizarLinhaSimulacao));
        setPrecosManuais(
          Object.fromEntries(
            Object.entries(carregado.precosManuais).map(([id, valor]) => [id, valor == null ? "" : String(valor)]),
          ),
        );
        setResultadoBase(null);
        setPerfilAtual({
          id: carregado.perfil.id,
          perfilId: carregado.perfil.perfil_id,
          versao: carregado.perfil.versao,
          nome: carregado.perfil.nome,
        });
        setNomePerfil(carregado.perfil.nome);
        setDescricaoPerfil(carregado.perfil.descricao ?? "");
        setFonteDadosPerfil(carregado.perfil.fonte_dados ?? "");
        setObservacoesPerfil(carregado.perfil.observacoes ?? "");

        if (carregado.avisos.length) {
          toast.warning(
            `${carregado.equipamentos.length} equipamento${carregado.equipamentos.length === 1 ? "" : "s"} carregado${carregado.equipamentos.length === 1 ? "" : "s"}; ${carregado.avisos.length} aviso${carregado.avisos.length === 1 ? "" : "s"} de correspondência.`,
          );
        } else {
          toast.success(`Perfil “${carregado.perfil.nome}” v${carregado.perfil.versao} carregado.`);
        }
      })
      .catch((error) => {
        if (!cancelado) {
          toast.error(error instanceof Error ? error.message : "Não foi possível carregar o perfil.");
        }
      });

    return () => {
      cancelado = true;
    };
  }, [perfilParam, projetoId]);

  const totalPrevisao = resultado?.custo_total ?? 0;
  const totalOperacional = resultado?.custo_operacional ?? 0;
  const totalManutencao = resultado?.custo_manutencao ?? 0;
  const totalRecorrente = resultado?.custo_recorrente ?? 0;

  function abrirSalvarPerfil() {
    setNomePerfil(perfilAtual?.nome ?? "");
    if (!perfilAtual) {
      setDescricaoPerfil("");
      setFonteDadosPerfil("");
      setObservacoesPerfil("");
    }
    setDialogSalvarPerfil(true);
  }

  async function salvarPerfilAtual() {
    if (!projetoId) return;

    try {
      const salvo = await salvarPerfil(projetoId, {
        nome: nomePerfil,
        descricao: descricaoPerfil || null,
        periodo_referencia_inicio: periodo.inicio,
        periodo_referencia_fim: periodo.fim,
        fonte_dados: fonteDadosPerfil || null,
        equipamentos: linhas,
        precosManuais: precosNumericos,
        observacoes: observacoesPerfil || null,
        ...(perfilAtual?.perfilId ? { perfilId: perfilAtual.perfilId } : {}),
      });

      setPerfilAtual({
        id: salvo.id,
        perfilId: salvo.perfil_id,
        versao: salvo.versao,
        nome: salvo.nome,
      });
      setNomePerfil(salvo.nome);
      setDescricaoPerfil(salvo.descricao ?? "");
      setFonteDadosPerfil(salvo.fonte_dados ?? "");
      setObservacoesPerfil(salvo.observacoes ?? "");
      setDialogSalvarPerfil(false);
      toast.success(`Perfil salvo como versão ${salvo.versao}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o perfil.");
    }
  }

  async function simular() {
    if (!projetoId) return;
    if (erroPeriodo) {
      toast.error(erroPeriodo);
      return;
    }
    if (!linhas.length) {
      toast.error("Adicione pelo menos um equipamento à simulação.");
      return;
    }

    setCalculando(true);
    try {
      const calculado = await calcularSimulacaoCustos(projetoId, {
        inicio: periodo.inicio,
        fim: periodo.fim,
        equipamentos: linhas,
        precosManuais: precosNumericos,
      });
      setPeriodoAplicado({ ...periodo });
      setResultadoBase(calculado);
      toast.success("Simulação atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível calcular a simulação.");
    } finally {
      setCalculando(false);
    }
  }

  function adicionarEquipamento() {
    if (!equipamentoParaAdicionar) return;
    const equipamento = equipamentosPorId.get(equipamentoParaAdicionar);
    if (!equipamento) return;
    const quantidade = quantidadePorEquipamento.get(equipamento.id) ?? 1;
    setLinhas((atual) => [...atual, criarLinha(equipamento, quantidade)]);
    setEquipamentoParaAdicionar(null);
    setResultadoBase(null);
  }

  function atualizarLinha(id: string, patch: Partial<LinhaSimulacao>) {
    setLinhas((atual) => atual.map((linha) => (linha.equipamento_id === id ? { ...linha, ...patch } : linha)));
    setResultadoBase(null);
  }

  function removerEquipamento(id: string) {
    setLinhas((atual) => atual.filter((linha) => linha.equipamento_id !== id));
    setResultadoBase(null);
  }

  function limparSimulacao() {
    setLinhas([]);
    setResultadoBase(null);
    setPrecosManuais({});
  }

  function aplicarRapido(dias: number) {
    const novoPeriodo = criarPeriodoPadrao(dias);
    setPeriodo(novoPeriodo);
    setPeriodoAplicado(novoPeriodo);
    setResultadoBase(null);
  }

  if (!projetoId) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-8 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Calculator className="size-6" />
            </span>
            <h2 className="font-display text-lg font-semibold">Selecione um projeto</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              A simulação utiliza equipamentos, regras e parâmetros do projeto ativo.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!financeiroAtivo) {
    return (
      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <Card className="mx-auto max-w-2xl overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 via-background to-background p-6 sm:p-8">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Calculator className="size-6" />
            </div>
            <Badge className="mt-5 border-primary/20 bg-primary/10 text-primary" variant="outline">Módulo financeiro</Badge>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">Simulação de Custos</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Ative a camada financeira de equipamentos para utilizar recorrência, manutenção prevista e custos de insumos sem alterar o histórico operacional.
            </p>
            <Button asChild className="mt-6">
              <Link to="/app/configuracoes">
                Abrir configurações
              </Link>
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-w-0 space-y-6 bg-gradient-to-b from-primary/[0.025] via-background to-background p-4 sm:p-6 lg:p-8">
      <header className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/[0.09] via-background to-background shadow-sm">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Calculator className="size-4" />
              Inteligência de custos
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Simulação de Custos</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Aplique regras de consumo e parâmetros financeiros a um cenário futuro sem gravar nenhum dado histórico.
            </p>
            {perfilAtual ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                  Perfil · {perfilAtual.nome} · v{perfilAtual.versao}
                </Badge>
                <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                  <Link to="/app/perfis-parametros-equipamentos">
                    <Layers3 className="mr-1.5 size-3.5" /> Perfis
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:min-w-[320px]">
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={abrirSalvarPerfil}>
                <Save className="size-4" /> {perfilAtual ? "Salvar nova versão" : "Salvar perfil"}
              </Button>
              <Button asChild type="button" variant="ghost" size="icon" aria-label="Gerenciar perfis">
                <Link to="/app/perfis-parametros-equipamentos"><Layers3 className="size-4" /></Link>
              </Button>
            </div>
            <div className="rounded-2xl border bg-background/80 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                <Clock3 className="size-4 text-primary" /> Período da simulação
              </div>
              <p className="mt-2 font-display text-base font-semibold sm:text-lg">
                {formatarData(periodoAplicado.inicio)} <span className="text-muted-foreground">até</span> {formatarData(periodoAplicado.fim)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border bg-background shadow-sm">
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-primary">1 · Período</p>
              <h2 className="mt-1 text-base font-semibold">Defina o horizonte do cenário</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_180px]">
              <div className="space-y-1.5">
                <Label htmlFor="sim-custo-de">Data inicial</Label>
                <Input id="sim-custo-de" type="date" value={periodo.inicio} max={periodo.fim} onChange={(event) => { setPeriodo((atual) => ({ ...atual, inicio: event.target.value })); setResultadoBase(null); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-custo-ate">Data final</Label>
                <Input id="sim-custo-ate" type="date" value={periodo.fim} min={periodo.inicio} onChange={(event) => { setPeriodo((atual) => ({ ...atual, fim: event.target.value })); setResultadoBase(null); }} />
              </div>
            </div>
            {erroPeriodo ? <p className="flex items-center gap-1.5 text-xs font-medium text-destructive"><AlertTriangle className="size-3.5" />{erroPeriodo}</p> : null}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground lg:text-right">Atalhos</p>
            <div className="mt-2 flex flex-wrap gap-2 lg:justify-end">
              {[7, 30, 90].map((dias) => {
                const ativo = periodo.inicio === criarPeriodoPadrao(dias).inicio && periodo.fim === criarPeriodoPadrao(dias).fim;
                return <Button key={dias} type="button" size="sm" variant={ativo ? "default" : "outline"} onClick={() => aplicarRapido(dias)}>{dias} dias</Button>;
              })}
              <Button type="button" size="icon" variant="ghost" aria-label="Limpar simulação" onClick={limparSimulacao}><RotateCcw className="size-4" /></Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)] xl:items-start">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-primary">2 · Premissas</p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Equipamentos do cenário</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Cada quantidade representa unidades do equipamento. O uso informado é considerado por unidade e as regras de consumo são aplicadas ao direcionador escolhido.
              </p>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <Combobox
                    value={equipamentoParaAdicionar}
                    onChange={setEquipamentoParaAdicionar}
                    placeholder="Adicionar equipamento"
                    vazio="Nenhum equipamento disponível"
                    opcoes={equipamentosDisponiveis.map((equipamento) => ({
                      value: equipamento.id,
                      label: equipamento.modelo ? `${equipamento.nome} · ${equipamento.modelo}` : equipamento.nome,
                      hint: equipamento.tipo_controle === "INDIVIDUAL" ? "Individual" : "Quantitativo",
                    }))}
                  />
                </div>
                <Button type="button" className="shrink-0" onClick={adicionarEquipamento} disabled={!equipamentoParaAdicionar}>
                  <Plus className="size-4" /> Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          {linhas.length === 0 ? (
            <EmptyScenario />
          ) : (
            linhas.map((linha) => {
              const equipamento = equipamentosPorId.get(linha.equipamento_id);
              if (!equipamento) return null;
              const direcionador = obterDirecionador(linha.direcionador);
              const saldo = quantidadePorEquipamento.get(equipamento.id) ?? 0;

              return (
                <Card key={linha.equipamento_id} className="overflow-hidden">
                  <div className="border-l-4 border-primary">
                    <CardHeader className="border-b bg-primary/[0.025] px-4 py-4 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base">{equipamento.nome}</CardTitle>
                            <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                              {equipamento.tipo_controle === "INDIVIDUAL" ? "Individual" : "Quantitativo"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {equipamento.modelo ?? "Sem modelo"} · saldo atual {formatarNumero(saldo, 2)}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removerEquipamento(equipamento.id)} aria-label={`Remover ${equipamento.nome}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5 p-4 sm:p-5">
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Field label="Quantidade simulada" hint="unidades">
                          <Input type="number" min="1" step="1" value={linha.quantidade} onFocus={selecionarConteudoAoFocar} onChange={(event) => atualizarLinha(linha.equipamento_id, { quantidade: Math.max(1, Number(event.target.value) || 1) })} />
                        </Field>
                        <Field label="Direcionador">
                          <Select value={linha.direcionador} onValueChange={(value) => atualizarLinha(linha.equipamento_id, { direcionador: value as RegraConsumoEquipamentoDirecionador })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{DIRECIONADORES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </Field>
                        <Field label="Uso previsto" hint={`${direcionador.unidade} / unidade`}>
                          <Input type="number" min="0" step="0.01" value={linha.uso_previsto} onFocus={selecionarConteudoAoFocar} onChange={(event) => atualizarLinha(linha.equipamento_id, { uso_previsto: Math.max(0, Number(event.target.value) || 0) })} />
                        </Field>
                        <Field label="Manutenção · ocorrências" hint="por unidade">
                          <Input type="number" min="0" step="1" value={linha.manutencao_ocorrencias_por_unidade} onFocus={selecionarConteudoAoFocar} onChange={(event) => atualizarLinha(linha.equipamento_id, { manutencao_ocorrencias_por_unidade: Math.max(0, Number(event.target.value) || 0) })} />
                        </Field>
                      </div>

                      <div className="grid gap-4 rounded-2xl border bg-muted/20 p-4 sm:grid-cols-2">
                        <Field label="Valor por manutenção" hint="por ocorrência / unidade">
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">R$</span>
                            <Input className="pl-9" type="number" min="0" step="0.01" value={linha.manutencao_valor_por_ocorrencia} onFocus={selecionarConteudoAoFocar} onChange={(event) => atualizarLinha(linha.equipamento_id, { manutencao_valor_por_ocorrencia: Math.max(0, Number(event.target.value) || 0) })} />
                          </div>
                        </Field>
                        <div className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <Label className="text-xs">Custo recorrente unitário</Label>
                            <span className="text-[10px] text-muted-foreground">{equipamento.periodicidade_custo ? `padrão · ${equipamento.periodicidade_custo.toLowerCase()}` : "opcional"}</span>
                          </div>
                          <div className="flex gap-2">
                            <div className="relative min-w-0 flex-1">
                              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">R$</span>
                              <Input
                                className="pl-9"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={equipamento.custo_recorrente != null ? formatarMoeda(equipamento.custo_recorrente) : "Usar padrão"}
                                value={linha.custo_recorrente_unitario_override ?? ""}
                                onFocus={selecionarConteudoAoFocar}
                                onChange={(event) => atualizarLinha(linha.equipamento_id, { custo_recorrente_unitario_override: event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0) })}
                              />
                            </div>
                            <Select
                              value={linha.periodicidade_recorrente_override ?? "__padrao__"}
                              onValueChange={(value) => atualizarLinha(linha.equipamento_id, { periodicidade_recorrente_override: value === "__padrao__" ? null : (value as EquipamentoPeriodicidadeCusto) })}
                            >
                              <SelectTrigger className="w-[132px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__padrao__">Padrão</SelectItem>
                                {PERIODICIDADES_RECORRENTES.map((item) => (
                                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-primary/[0.045] px-3.5 py-3 text-xs text-muted-foreground">
                        <SlidersHorizontal className="size-3.5 text-primary" />
                        <span>
                          Regras de consumo serão lidas no cadastro do equipamento e aplicadas somente quando o direcionador coincidir com <strong className="text-foreground">{direcionador.label}</strong>.
                        </span>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              );
            })
          )}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card className="overflow-hidden shadow-sm">
            <div className="bg-gradient-to-br from-primary/[0.10] via-background to-background p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <CircleDollarSign className="size-4" /> Resultado previsto
              </div>
              <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{formatarMoeda(totalPrevisao)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {resultado ? `Cenário com ${formatarNumero(resultado.equipamentos.length)} equipamento${resultado.equipamentos.length === 1 ? "" : "s"}.` : "Execute a simulação para calcular o cenário."}
              </p>
            </div>
            <CardContent className="p-0">
              <SummaryLine icon={Package} label="Operação / insumos" valor={totalOperacional} tone="primary" />
              <SummaryLine icon={Wrench} label="Manutenção" valor={totalManutencao} tone={totalManutencao > 0 ? "warning" : "neutral"} />
              <SummaryLine icon={RotateCcw} label="Recorrência" valor={totalRecorrente} tone={totalRecorrente > 0 ? "success" : "neutral"} last />
            </CardContent>
            <div className="border-t p-4">
              <Button type="button" className="w-full" onClick={() => void simular()} disabled={calculando || Boolean(erroPeriodo) || linhas.length === 0}>
                {calculando ? <><Loader2 className="size-4 animate-spin" /> Calculando…</> : <><Calculator className="size-4" /> Simular custos</>}
              </Button>
              {resultado && perfilAtual ? (
                <Button asChild type="button" variant="outline" className="mt-2 w-full">
                  <Link to="/app/previsto-real-equipamentos" search={{ perfil: perfilAtual.id }}>
                    <GitCompareArrows className="size-4" /> Comparar com realizado
                  </Link>
                </Button>
              ) : null}
              {periodoAlterado && resultado ? <p className="mt-2 text-center text-[11px] text-warning">O período foi alterado. Execute novamente para atualizar o resultado.</p> : null}
            </div>
          </Card>

          {resultado ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm"><Gauge className="size-4 text-primary" /> Qualidade da simulação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <QualityLine ok={resultado.produtos_sem_custo === 0} label="Todos os insumos têm custo" valor={formatarNumero(resultado.produtos_sem_custo)} />
                <QualityLine ok={resultado.regras_sem_aderencia === 0} label="Regras compatíveis com o direcionador" valor={formatarNumero(resultado.regras_sem_aderencia)} />
                <QualityLine ok={resultado.dados_base_historicos} label="Há preços históricos documentados" valor={resultado.dados_base_historicos ? "Sim" : "Não"} />
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

      {resultado ? <ResultadoSimulacao resultado={resultado} precosManuais={precosManuais} onPrecoChange={(produtoId, valor) => setPrecosManuais((atual) => ({ ...atual, [produtoId]: valor }))} /> : null}

      <div className="rounded-2xl border bg-muted/20 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold">Simulação não altera o histórico</p>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
              O cálculo usa cadastro, regras de consumo e parâmetros financeiros atuais. Nenhuma movimentação, documento, regra ou custo histórico é gravado ou alterado durante a simulação.
            </p>
          </div>
        </div>
      </div>

      <Dialog open={dialogSalvarPerfil} onOpenChange={setDialogSalvarPerfil}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {perfilAtual ? `Salvar nova versão · v${perfilAtual.versao + 1}` : "Salvar perfil de parâmetros"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="perfil-nome">Nome do perfil</Label>
              <Input
                id="perfil-nome"
                value={nomePerfil}
                onChange={(event) => setNomePerfil(event.target.value)}
                placeholder="Ex.: Resort Norte — Base 2026"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perfil-descricao">Descrição</Label>
              <Input
                id="perfil-descricao"
                value={descricaoPerfil}
                onChange={(event) => setDescricaoPerfil(event.target.value)}
                placeholder="Contexto ou finalidade do conjunto de parâmetros"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perfil-fonte">Origem dos dados</Label>
              <Input
                id="perfil-fonte"
                value={fonteDadosPerfil}
                onChange={(event) => setFonteDadosPerfil(event.target.value)}
                placeholder="Ex.: orçamento 2026, fornecedor, medição interna"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perfil-observacoes">Observações</Label>
              <Textarea
                id="perfil-observacoes"
                value={observacoesPerfil}
                onChange={(event) => setObservacoesPerfil(event.target.value)}
                placeholder="Origem dos valores, premissas ou observações do cenário"
                rows={4}
              />
            </div>
            <div className="rounded-xl bg-muted/40 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
              O perfil guarda uma fotografia dos parâmetros atuais. Salvar uma versão não altera o cadastro dos equipamentos nem as regras operacionais.
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogSalvarPerfil(false)}>Cancelar</Button>
            <Button type="button" onClick={() => void salvarPerfilAtual()} disabled={!nomePerfil.trim() || !linhas.length}>Salvar versão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ResultadoSimulacao({
  resultado,
  precosManuais,
  onPrecoChange,
}: {
  resultado: SimulacaoCustoEquipamentoResumo;
  precosManuais: Record<string, string>;
  onPrecoChange: (produtoId: string, valor: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-primary">3 · Análise</p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Como o custo foi formado</h2>
            <p className="mt-1 text-sm text-muted-foreground">Custos operacionais vêm das regras de consumo; manutenção e recorrência vêm das premissas informadas.</p>
          </div>
          <Badge variant="outline" className="w-fit border-primary/20 bg-primary/10 text-primary">{formatarData(resultado.periodo.inicio)} — {formatarData(resultado.periodo.fim)}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Operação" valor={formatarMoeda(resultado.custo_operacional)} icon={Package} tone="primary" />
        <KpiCard label="Manutenção" valor={formatarMoeda(resultado.custo_manutencao)} icon={Wrench} tone="warning" />
        <KpiCard label="Recorrência" valor={formatarMoeda(resultado.custo_recorrente)} icon={RotateCcw} tone="success" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {resultado.equipamentos.map((equipamento) => (
          <Card key={equipamento.equipamento_id} className="overflow-hidden">
            <CardHeader className="border-b bg-muted/15 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{equipamento.nome}</CardTitle>
                    <Badge variant="outline">{equipamento.tipo_controle === "INDIVIDUAL" ? "Individual" : "Quantitativo"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {equipamento.modelo ?? "Sem modelo"} · {formatarNumero(equipamento.quantidade, 2)} un. · {formatarNumero(equipamento.uso_previsto, 2)} {obterDirecionador(equipamento.direcionador).unidade}/un.
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-semibold tabular-nums">{formatarMoeda(equipamento.custo_total)}</p>
                  <p className="text-[11px] text-muted-foreground">custo previsto</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-3 divide-x rounded-xl border bg-muted/20 py-3">
                <MiniMetric label="Insumos" valor={formatarMoeda(equipamento.custo_operacional)} tone="primary" />
                <MiniMetric label="Manutenção" valor={formatarMoeda(equipamento.custo_manutencao)} tone="warning" />
                <MiniMetric label="Recorrência" valor={formatarMoeda(equipamento.custo_recorrente)} tone="success" />
              </div>

              {equipamento.produtos.length ? (
                <div className="overflow-hidden rounded-xl border">
                  <div className="flex items-center justify-between border-b bg-muted/25 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <Package className="size-3.5 text-primary" /> Insumos previstos
                    </div>
                    <span className="text-[11px] text-muted-foreground">{equipamento.produtos.length} regra{equipamento.produtos.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="divide-y">
                    {equipamento.produtos.map((produto) => (
                      <div key={produto.produto_id} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_110px_140px] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{produto.nome}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>{formatarNumero(produto.quantidade_prevista, 2)} {produto.unidade_consumo_sigla}</span>
                            <span>·</span>
                            <span>{formatarNumero(produto.fator, 4)} {produto.unidade_consumo_sigla}/{produto.unidade_base_sigla}</span>
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{produto.fonte_custo === "MANUAL" ? "Manual" : produto.fonte_custo === "HISTORICO" ? "Histórico" : "Sem custo"}</Badge>
                          </div>
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">R$ / unidade</Label>
                          <Input
                            className="mt-1 h-8 text-right text-xs"
                            type="number"
                            min="0"
                            step="0.01"
                            value={precosManuais[produto.produto_id] ?? (produto.custo_unitario_sugerido == null ? "" : String(produto.custo_unitario_sugerido))}
                            onChange={(event) => onPrecoChange(produto.produto_id, event.target.value)}
                            placeholder="Informar"
                          />
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold tabular-nums ${produto.custo_unitario_aplicado == null ? "text-warning" : "text-foreground"}`}>
                            {produto.custo_unitario_aplicado == null ? "Sem custo" : formatarMoeda(produto.custo_total)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {produto.custo_unitario_aplicado == null ? "não entra no total" : `${formatarMoeda(produto.custo_unitario_aplicado)} / ${produto.unidade_consumo_sigla}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/15 px-4 py-5 text-center">
                  <SlidersHorizontal className="mx-auto size-5 text-primary" />
                  <p className="mt-2 text-sm font-medium">Nenhuma regra compatível encontrada</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {equipamento.regras_ignoradas > 0
                      ? `${formatarNumero(equipamento.regras_ignoradas)} regra${equipamento.regras_ignoradas === 1 ? "" : "s"} existe${equipamento.regras_ignoradas === 1 ? "" : "m"}, mas usa outro direcionador.`
                      : "Cadastre uma regra de consumo para transformar uso previsto em consumo."}
                  </p>
                </div>
              )}

              {equipamento.periodicidade_recorrente && equipamento.custo_recorrente_unitario != null ? (
                <div className="flex items-center gap-2 rounded-xl bg-success/10 px-3.5 py-3 text-xs">
                  <RotateCcw className="size-3.5 shrink-0 text-success" />
                  <span className="text-muted-foreground">Recorrência:</span>
                  <strong>{formatarMoeda(equipamento.custo_recorrente_unitario)} / {equipamento.periodicidade_recorrente.toLowerCase()}</strong>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function SummaryLine({ icon: Icon, label, valor, tone, last = false }: { icon: typeof Package; label: string; valor: number; tone: "primary" | "success" | "warning" | "neutral"; last?: boolean }) {
  const classes = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    neutral: "bg-muted text-muted-foreground",
  } as const;
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3.5 ${last ? "" : "border-b"}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${classes[tone]}`}><Icon className="size-3.5" /></span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <strong className="font-display tabular-nums">{formatarMoeda(valor)}</strong>
    </div>
  );
}

function KpiCard({ icon: Icon, label, valor, tone }: { icon: typeof Package; label: string; valor: string; tone: "primary" | "success" | "warning" }) {
  const iconClasses = tone === "primary" ? "bg-primary/10 text-primary" : tone === "success" ? "bg-success/10 text-success" : "bg-warning/10 text-warning";
  const textClasses = tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : "text-warning";
  return (
    <Card className="overflow-hidden">
      <CardContent className="relative p-4 sm:p-5">
        <span className={`absolute inset-x-0 top-0 h-0.5 ${tone === "primary" ? "bg-primary" : tone === "success" ? "bg-success" : "bg-warning"}`} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`flex size-7 items-center justify-center rounded-lg ${iconClasses}`}><Icon className="size-3.5" /></span>{label}</div>
        <p className={`mt-3 font-display text-2xl font-semibold tabular-nums ${textClasses}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, valor, tone }: { label: string; valor: string; tone: "primary" | "success" | "warning" }) {
  const textClasses = tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : "text-warning";
  return (
    <div className="px-2.5 text-center sm:px-3.5">
      <p className="text-[10px] uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${textClasses}`}>{valor}</p>
    </div>
  );
}

function QualityLine({ ok, label, valor }: { ok: boolean; label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {ok ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <AlertTriangle className="size-4 shrink-0 text-warning" />}
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={`text-xs font-semibold ${ok ? "text-success" : "text-warning"}`}>{valor}</span>
    </div>
  );
}

function EmptyScenario() {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/[0.12] px-6 py-12 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><HardHat className="size-6" /></div>
      <p className="mt-3 text-sm font-semibold">Monte o cenário de custos</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        Adicione um ou mais equipamentos, informe o uso previsto e execute a simulação para projetar consumo, manutenção e recorrência.
      </p>
    </div>
  );
}
