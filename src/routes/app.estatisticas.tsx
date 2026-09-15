import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  ChartNoAxesCombined,
  PackageCheck,
  PackageOpen,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/common/Combobox";
import { StatCard } from "@/components/common/StatCard";
import { getDB } from "@/db/db";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import {
  calcularEstadoEstoque,
  calcularCustosDocumentados,
  calcularResumoFinanceiro,
  calcularValorPorGrupo,
  calcularFluxoPeriodo,
  analisarConsumo,
  calcularProdutoEstatistica,
  calcularEstatisticasEquipes,
  calcularProdutoPorEquipe,
  criarPeriodoPadrao,
  filtrarMovimentacoesPeriodo,
  agruparFluxoPorEquipe,
  SEM_EQUIPE_ID,
} from "@/services/estatisticas-materiais";
import { num } from "@/utils/format";

export const Route = createFileRoute("/app/estatisticas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Estatísticas de Materiais — Almoxarifado" },
      {
        name: "description",
        content:
          "Observabilidade de materiais, consumo, cobertura e risco de estoque do projeto ativo.",
      },
    ],
  }),
  component: EstatisticasMateriaisPage,
});

function EstatisticasMateriaisPage() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const periodoPadrao = useMemo(() => criarPeriodoPadrao(30), []);
  const [de, setDe] = useState(periodoPadrao.de);
  const [ate, setAte] = useState(periodoPadrao.ate);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [estatisticaAtiva, setEstatisticaAtiva] = useState<"movimentacoes" | "consumo" | "equipes" | "financeiro">("movimentacoes");

  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );
  const documentos = useLiveQuery(
    async () => (projetoId ? getDB().documentos.where("projeto_id").equals(projetoId).toArray() : []),
    [projetoId],
  );
  const documentoItens = useLiveQuery(
    async () => (projetoId ? getDB().documento_itens.toArray() : []),
    [projetoId],
  );

  const periodo = { de, ate };

  const movsPeriodo = useMemo(
    () => (dados ? filtrarMovimentacoesPeriodo(dados.movimentacoes, periodo) : []),
    [dados, periodo.de, periodo.ate],
  );

  const movimentacoesFiltradas = useMemo(
    () =>
      movsPeriodo.filter((mov) => {
        if (produtoId && mov.produto_id !== produtoId) return false;
        if (equipeId && mov.equipe_id !== equipeId) return false;
        return true;
      }),
    [movsPeriodo, produtoId, equipeId],
  );

  const estado = useMemo(
    () =>
      dados
        ? calcularEstadoEstoque(
            dados.produtos,
            equipeId ? dados.movimentacoes.filter((m) => m.equipe_id === equipeId) : dados.movimentacoes,
            dados.unidades,
            dados.categorias,
            dados.equipes,
          )
        : null,
    [dados, equipeId],
  );

  const fluxo = useMemo(
    () => (dados ? calcularFluxoPeriodo(movimentacoesFiltradas, periodo) : null),
    [dados, movimentacoesFiltradas, periodo.de, periodo.ate],
  );

  const produtoSelecionado = useMemo(
    () => (dados && produtoId ? dados.produtos.find((produto) => produto.id === produtoId) : null),
    [dados, produtoId],
  );

  const produtoAnalise = useMemo(
    () =>
      produtoSelecionado && dados
        ? calcularProdutoEstatistica(
            produtoSelecionado,
            equipeId ? dados.movimentacoes.filter((m) => m.equipe_id === equipeId) : dados.movimentacoes,
            periodo,
          )
        : null,
    [dados, produtoSelecionado, equipeId, periodo.de, periodo.ate],
  );

  const analiseConsumoProduto = useMemo(
    () =>
      produtoSelecionado && dados
        ? analisarConsumo(
            equipeId
              ? dados.movimentacoes.filter(
                  (m) => m.equipe_id === equipeId && m.produto_id === produtoSelecionado.id,
                )
              : dados.movimentacoes.filter((m) => m.produto_id === produtoSelecionado.id),
            periodo,
            produtoAnalise?.estoqueAtual ?? null,
          )
        : null,
    [dados, produtoSelecionado, equipeId, periodo.de, periodo.ate, produtoAnalise?.estoqueAtual],
  );

  // O gráfico sempre exibe um par de barras (entradas/saídas) por estoque de
  // equipe, considerando as movimentações já filtradas por período, produto e
  // equipe conforme os filtros ativos na tela. Estoques não vinculados a uma
  // equipe são agrupados sob "Sem equipe".
  const serieGrafico = useMemo(() => {
    if (!dados) return [];

    return agruparFluxoPorEquipe(movimentacoesFiltradas)
      .map((item) => {
        const equipe = item.equipeId === SEM_EQUIPE_ID ? null : dados.equipes.find((e) => e.id === item.equipeId);

        return {
          equipeId: item.equipeId,
          nome: equipe ? equipe.nome : "Sem equipe",
          entradas: item.entradas,
          saidas: item.saidas,
        };
      })
      .sort((a, b) => {
        if (a.equipeId === SEM_EQUIPE_ID) return 1;
        if (b.equipeId === SEM_EQUIPE_ID) return -1;
        return a.nome.localeCompare(b.nome);
      });
  }, [dados, movimentacoesFiltradas]);

  const estatisticasEquipes = useMemo(
    () =>
      dados
        ? calcularEstatisticasEquipes(
            dados.produtos,
            produtoId
              ? dados.movimentacoes.filter((movimentacao) => movimentacao.produto_id === produtoId)
              : dados.movimentacoes,
            dados.unidades,
            dados.categorias,
            equipeId
              ? dados.equipes.filter((equipe) => equipe.id === equipeId)
              : dados.equipes,
            periodo,
            undefined,
            false,
          )
        : [],
    [dados, produtoId, equipeId, periodo.de, periodo.ate],
  );

  const produtoPorEquipe = useMemo(
    () =>
      produtoSelecionado && dados
        ? calcularProdutoPorEquipe(
            produtoSelecionado,
            equipeId ? dados.movimentacoes.filter((movimentacao) => movimentacao.equipe_id === equipeId) : dados.movimentacoes,
            dados.equipes,
            periodo,
          )
        : [],
    [dados, produtoSelecionado, equipeId, periodo.de, periodo.ate],
  );

  const documentosAtivos = configuracao?.modulos.documentos === true;

  const custos = useMemo(() => {
    if (!documentosAtivos || !dados || !documentoItens || !documentos) return new Map();
    const documentosValidos = new Set(
      documentos.filter((documento) => documento.status !== "CANCELADO").map((documento) => documento.id),
    );
    return calcularCustosDocumentados(
      dados.produtos.map((produto) => produto.id),
      documentoItens.filter((item) => documentosValidos.has(item.documento_id)),
      dados.movimentacoes,
      true,
    );
  }, [dados, documentoItens, documentos, documentosAtivos]);

  const resumoFinanceiro = useMemo(
    () =>
      dados
        ? calcularResumoFinanceiro(
            dados.produtos,
            equipeId ? dados.movimentacoes.filter((m) => m.equipe_id === equipeId) : dados.movimentacoes,
            dados.unidades,
            dados.categorias,
            dados.equipes,
            custos,
            periodo,
            documentosAtivos,
          )
        : null,
    [dados, equipeId, custos, documentosAtivos, periodo.de, periodo.ate],
  );

  const financeiroPorEquipe = useMemo(
    () =>
      dados && documentosAtivos
        ? calcularValorPorGrupo(
            equipeId ? dados.movimentacoes.filter((m) => m.equipe_id === equipeId) : dados.movimentacoes,
            periodo,
            custos,
            (mov) => mov.equipe_id,
            8,
          )
        : [],
    [dados, equipeId, documentosAtivos, custos, periodo.de, periodo.ate],
  );

  const financeiroPorResponsavel = useMemo(
    () =>
      dados && documentosAtivos
        ? calcularValorPorGrupo(
            equipeId ? dados.movimentacoes.filter((m) => m.equipe_id === equipeId) : dados.movimentacoes,
            periodo,
            custos,
            (mov) => mov.encarregado_id ?? mov.funcionario_id,
            8,
          )
        : [],
    [dados, equipeId, documentosAtivos, custos, periodo.de, periodo.ate],
  );

  const produtosEmRisco = useMemo(() => {
    if (!dados) return [];
    return dados.produtos
      .map((produto) =>
        calcularProdutoEstatistica(
          produto,
          equipeId ? dados.movimentacoes.filter((m) => m.equipe_id === equipeId) : dados.movimentacoes,
          periodo,
        ),
      )
      .filter((item) => item.coberturaDias !== null && item.estoqueAtual > 0 && item.coberturaDias <= 30)
      .sort((a, b) => (a.coberturaDias ?? Infinity) - (b.coberturaDias ?? Infinity))
      .slice(0, 8);
  }, [dados, equipeId, periodo.de, periodo.ate]);

  if (!dados) {
    return <p className="text-sm text-muted-foreground">Carregando estatísticas…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase">Estatísticas de materiais</h1>
          <p className="text-sm text-muted-foreground">
            Observabilidade do estoque e apoio à tomada de decisão. O estoque atual é calculado com todo o histórico; o período controla os fluxos e o consumo.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const novo = criarPeriodoPadrao(30);
            setDe(novo.de);
            setAte(novo.ate);
          }}
        >
          Últimos 30 dias
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="date" value={de} onChange={(event) => setDe(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={ate} onChange={(event) => setAte(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Produto</Label>
            <Combobox
              placeholder="Todos os produtos"
              value={produtoId}
              onChange={setProdutoId}
              opcoes={dados.produtos.map((produto) => ({ value: produto.id, label: produto.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Equipe</Label>
            <Combobox
              placeholder="Todas as equipes"
              value={equipeId}
              onChange={setEquipeId}
              opcoes={dados.equipes.map((equipe) => ({ value: equipe.id, label: equipe.nome }))}
            />
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="estado-estoque" className="space-y-3">
        <div className="flex items-center gap-2">
          <PackageOpen className="size-5 text-primary" />
          <h2 id="estado-estoque" className="font-display text-lg font-semibold uppercase">Estado do estoque</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Posições de estoque" valor={num(estado?.posicoesEstoque ?? 0)} icon={PackageOpen} />
          <StatCard label="Produtos com estoque" valor={num(estado?.produtosComEstoque ?? 0)} icon={PackageCheck} tone="success" />
          <StatCard label="Produtos zerados" valor={num(estado?.produtosZerados ?? 0)} icon={ShieldAlert} />
          <StatCard label="Posições abaixo do mínimo" valor={num(estado?.posicoesAbaixoDoMinimo ?? 0)} icon={AlertTriangle} tone="warning" />
          <StatCard label="Produtos abaixo do mínimo" valor={num(estado?.produtosAbaixoDoMinimo ?? 0)} icon={AlertTriangle} tone="warning" />
        </div>
        <p className="text-xs text-muted-foreground">
          Quantidades de unidades diferentes não são somadas em um KPI global. A análise física detalhada é feita por produto/unidade.
        </p>
      </section>

      <div className="overflow-x-auto rounded-2xl border-2 border-primary/20 bg-primary/5 p-1.5 shadow-sm">
        <div role="tablist" aria-label="Categorias de estatísticas" className="flex min-w-max gap-1.5">
          {[
            { id: "movimentacoes" as const, label: "Movimentações", icon: BarChart3 },
            { id: "consumo" as const, label: "Consumo e cobertura", icon: CalendarClock },
            { id: "equipes" as const, label: "Equipes", icon: PackageCheck },
            { id: "financeiro" as const, label: "Financeiro", icon: ChartNoAxesCombined },
          ].map(({ id, label, icon: Icon }) => {
            const ativo = estatisticaAtiva === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => setEstatisticaAtiva(id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  ativo
                    ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {estatisticaAtiva === "equipes" ? (
        <section aria-labelledby="equipes" className="space-y-3">
        <div className="flex items-center gap-2">
          <PackageCheck className="size-5 text-primary" />
          <h2 id="equipes" className="font-display text-lg font-semibold uppercase">Análise por equipe</h2>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {produtoSelecionado ? `Distribuição de ${produtoSelecionado.nome} por equipe` : "Visão operacional por equipe"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {produtoSelecionado ? (
              produtoPorEquipe.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Equipe</th>
                        <th className="px-3 py-2 font-medium text-right">Estoque</th>
                        <th className="px-3 py-2 font-medium text-right">Mínimo</th>
                        <th className="px-3 py-2 font-medium text-right">Consumo/dia</th>
                        <th className="px-3 py-2 font-medium text-right">Cobertura</th>
                        <th className="px-3 py-2 font-medium text-right">Até mínimo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produtoPorEquipe.map((item) => (
                        <tr key={item.equipeId} className="border-b last:border-0">
                          <td className="px-3 py-3 font-medium">{item.equipe.nome}</td>
                          <td className="px-3 py-3 text-right">{num(item.estoqueAtual)}</td>
                          <td className="px-3 py-3 text-right">{num(item.estoqueMinimo)}</td>
                          <td className="px-3 py-3 text-right">{num(item.consumoMedioDiario)}</td>
                          <td className={`px-3 py-3 text-right font-semibold ${item.coberturaDias != null && item.coberturaDias <= 30 ? "text-red-600" : ""}`}>
                            {item.coberturaDias == null ? "—" : `${num(item.coberturaDias)} d`}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {item.diasAteMinimo == null ? "—" : `${num(item.diasAteMinimo)} d`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">O produto selecionado não possui estoque ou movimentações vinculadas às equipes.</p>
              )
            ) : estatisticasEquipes.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {estatisticasEquipes.map((item) => (
                  <div key={item.equipeId} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.equipe.nome}</p>
                        <p className="text-xs text-muted-foreground">{num(item.saidasNoPeriodo)} saídas no período · {num(item.produtosConsumidos)} produtos consumidos</p>
                      </div>
                      {item.produtosEmRisco > 0 ? (
                        <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                          {num(item.produtosEmRisco)} em risco
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-4">
                      <Metric label="Posições" value={num(item.posicoesEstoque)} />
                      <Metric label="Produtos" value={num(item.produtosComEstoque)} />
                      <Metric label="Abaixo mínimo" value={num(item.posicoesAbaixoDoMinimo)} />
                      <Metric label="Saídas/dia" value={num(item.mediaSaidasPorDia)} />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Menor cobertura estimada: {item.menorCoberturaDias == null ? "não determinada" : `${num(item.menorCoberturaDias)} dias`}.
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma equipe possui estoque ou movimentação relevante no período selecionado.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Para a visão global, quantidades físicas de unidades diferentes não são somadas entre produtos. A comparação por equipe utiliza posições, produtos, frequência de saídas e cobertura por material.
            </p>
          </CardContent>
        </Card>
      </section>
      ) : estatisticaAtiva === "movimentacoes" ? (
        <section aria-labelledby="fluxo" className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" />
          <h2 id="fluxo" className="font-display text-lg font-semibold uppercase">Entradas × saídas</h2>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entradas × saídas por equipe</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Movimentações" valor={num(fluxo?.movimentacoes ?? 0)} />
              <StatCard label="Entradas" valor={num(fluxo?.entradasMovimentacoes ?? 0)} icon={PackageCheck} tone="success" sub={`${num(fluxo?.entradasQuantidade ?? 0)} em quantidade lançada`} />
              <StatCard label="Saídas" valor={num(fluxo?.saidasMovimentacoes ?? 0)} icon={PackageOpen} tone="danger" sub={`${num(fluxo?.saidasQuantidade ?? 0)} em quantidade lançada`} />
            </div>
            <div className="mt-6 h-[340px] w-full">
              {serieGrafico.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieGrafico} margin={{ left: 0, right: 8, top: 24, bottom: 0 }} barGap={4} barCategoryGap="20%">
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="nome"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      interval={0}
                      angle={serieGrafico.length > 6 ? -20 : 0}
                      textAnchor={serieGrafico.length > 6 ? "end" : "middle"}
                      height={serieGrafico.length > 6 ? 50 : 30}
                    />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <Tooltip
                      formatter={(valor) => num(Number(valor))}
                      labelFormatter={(label) => `Equipe: ${label}`}
                    />
                    <Bar dataKey="entradas" name="Entradas" fill="#2f9e62" minPointSize={3} isAnimationActive={false} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" name="Saídas" fill="#dc2626" minPointSize={3} isAnimationActive={false} radius={[4, 4, 0, 0]} />
                    <Legend verticalAlign="bottom" height={36} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem movimentações no período selecionado.</div>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Cada par de barras representa as entradas e saídas de um estoque de equipe, considerando os filtros de data, produto e equipe selecionados acima. Estoques sem equipe vinculada aparecem em "Sem equipe".
            </p>
          </CardContent>
        </Card>
      </section>
      ) : estatisticaAtiva === "consumo" ? (
        <section aria-labelledby="riscos" className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-5 text-primary" />
          <h2 id="riscos" className="font-display text-lg font-semibold uppercase">Cobertura e risco de ruptura</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1.6fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Produtos com cobertura ≤ 30 dias</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {produtosEmRisco.length ? (
                produtosEmRisco.map((item) => (
                  <button
                    key={item.produtoId}
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => setProdutoId(item.produtoId)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.produto.nome}</span>
                      <span className="text-xs text-muted-foreground">Consumo médio: {num(item.consumoMedioDiario)}/dia</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold">{item.coberturaDias} dias</span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum produto com consumo suficiente para estimar ruptura em até 30 dias.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Análise do produto selecionado</CardTitle>
            </CardHeader>
            <CardContent>
              {produtoAnalise ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-lg font-semibold">{produtoAnalise.produto.nome}</p>
                    <p className="text-xs text-muted-foreground">{produtoAnalise.produto.codigo ?? "Sem código"}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="Estoque atual" value={num(produtoAnalise.estoqueAtual)} />
                    <Metric label="Estoque mínimo" value={num(produtoAnalise.estoqueMinimo)} />
                    <Metric label="Consumo / dia" value={num(produtoAnalise.consumoMedioDiario)} />
                    <Metric label="Cobertura" value={produtoAnalise.coberturaDias == null ? "—" : `${produtoAnalise.coberturaDias} dias`} />
                    <Metric label="Consumo / semana" value={num(produtoAnalise.consumoMedioSemanal)} />
                    <Metric label="Consumo / mês" value={num(produtoAnalise.consumoMedioMensal)} />
                    <Metric label="Até estoque mínimo" value={produtoAnalise.diasAteMinimo == null ? "—" : `${produtoAnalise.diasAteMinimo} dias`} />
                    <Metric label="Ruptura estimada" value={produtoAnalise.dataEstimadaRuptura ?? "—"} />
                  </div>
                  {analiseConsumoProduto ? (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold">Consumo por janela</p>
                          <p className="text-xs text-muted-foreground">Médias calculadas somente pelas saídas do produto nos últimos N dias, ancoradas na data final selecionada.</p>
                        </div>
                        <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${
                          analiseConsumoProduto.tendencia.direcao === "acelerando"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : analiseConsumoProduto.tendencia.direcao === "reduzindo"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : analiseConsumoProduto.tendencia.direcao === "estavel"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "text-muted-foreground"
                        }`}>
                          {analiseConsumoProduto.tendencia.direcao === "acelerando"
                            ? "Consumo em aceleração"
                            : analiseConsumoProduto.tendencia.direcao === "reduzindo"
                              ? "Consumo em redução"
                              : analiseConsumoProduto.tendencia.direcao === "estavel"
                                ? "Consumo estável"
                                : "Tendência indeterminada"}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {analiseConsumoProduto.janelas.map((janela) => (
                          <div key={janela.dias} className="rounded-lg border p-3">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Últimos {janela.dias} dias</p>
                            <p className="mt-1 text-sm font-semibold">{num(janela.saidas)} em saídas</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {num(janela.mediaDiaria)}/dia · {num(janela.mediaSemanal)}/semana · {num(janela.mediaMensal)}/mês
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Metric
                          label="Variação 7d × 30d"
                          value={
                            analiseConsumoProduto.tendencia.variacao7Sobre30 == null
                              ? "—"
                              : `${analiseConsumoProduto.tendencia.variacao7Sobre30 > 0 ? "+" : ""}${num(analiseConsumoProduto.tendencia.variacao7Sobre30)}%`
                          }
                        />
                        <Metric
                          label="Variação 30d × 90d"
                          value={
                            analiseConsumoProduto.tendencia.variacao30Sobre90 == null
                              ? "—"
                              : `${analiseConsumoProduto.tendencia.variacao30Sobre90 > 0 ? "+" : ""}${num(analiseConsumoProduto.tendencia.variacao30Sobre90)}%`
                          }
                        />
                        <Metric
                          label="Base conservadora"
                          value={
                            analiseConsumoProduto.tendencia.baseConservadora == null
                              ? "—"
                              : `${num(analiseConsumoProduto.tendencia.baseConservadora)}/dia`
                          }
                        />
                        <Metric
                          label="Cobertura conservadora"
                          value={
                            analiseConsumoProduto.coberturaConservadoraDias == null
                              ? "—"
                              : `${num(analiseConsumoProduto.coberturaConservadoraDias)} dias`
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                    A estimativa usa somente saídas do período selecionado e o estoque físico atual do produto. As janelas de consumo são ancoradas na data final selecionada. Sem consumo suficiente, a tendência e a cobertura permanecem indeterminadas.
                  </div>
                </div>
              ) : (
                <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                  Selecione um produto para calcular duração, consumo médio e risco de ruptura.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
      ) : (
        <section aria-labelledby="financeiro" className="space-y-3">
        <div className="flex items-center gap-2">
          <ChartNoAxesCombined className="size-5 text-primary" />
          <h2 id="financeiro" className="font-display text-lg font-semibold uppercase">Observabilidade financeira</h2>
        </div>

        {!documentosAtivos ? (
          <Card className="border-dashed">
            <CardContent className="flex gap-3 p-5 text-sm text-muted-foreground">
              <ChartNoAxesCombined className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-foreground">Valoração financeira indisponível</p>
                <p className="mt-1">Ative o módulo de Documentos para relacionar materiais a custos declarados e visualizar valor do estoque, consumo financeiro, equipes e responsáveis.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Valor do estoque documentado" valor={`R$ ${resumoFinanceiro?.valorEstoqueDocumentado.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "0,00"}`} icon={ChartNoAxesCombined} />
              <StatCard label="Consumo financeiro documentado" valor={`R$ ${resumoFinanceiro?.valorSaidasDocumentado.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "0,00"}`} icon={PackageOpen} />
              <StatCard label="Cobertura de valoração" valor={`${resumoFinanceiro?.coberturaPorPosicoes ?? 0}%`} icon={PackageCheck} tone={resumoFinanceiro && resumoFinanceiro.coberturaPorPosicoes >= 95 ? "success" : "warning"} />
              <StatCard label="Saídas sem custo" valor={num(resumoFinanceiro?.saidasSemCusto ?? 0)} icon={AlertTriangle} tone={resumoFinanceiro?.saidasSemCusto ? "warning" : "success"} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <FinancialTable
                title="Consumo financeiro por equipe"
                rows={financeiroPorEquipe}
                labels={new Map(dados.equipes.map((equipe) => [equipe.id, equipe.nome]))}
              />
              <FinancialTable
                title="Consumo financeiro por responsável"
                rows={financeiroPorResponsavel}
                labels={new Map(dados.funcionarios.map((funcionario) => [funcionario.id, funcionario.nome]))}
              />
            </div>
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">Transparência financeira:</strong> os valores acima são analíticos e usam custo médio documentado por produto. Posições e saídas sem custo declarado não entram no valor documentado e permanecem sinalizadas.
            </div>
          </>
        )}
      </section>
      )}
    </div>
  );
}

function FinancialTable({
  title,
  rows,
  labels,
}: {
  title: string;
  rows: Array<{ id: string; valorDocumentado: number; saidas: number; semCusto: number }>;
  labels: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.id === "__sem__" ? "Não informado" : labels.get(row.id) ?? "Não encontrado"}</p>
                <p className="text-xs text-muted-foreground">{num(row.saidas)} saídas{row.semCusto ? ` · ${num(row.semCusto)} sem custo` : ""}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold">R$ {row.valorDocumentado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Sem saídas no período selecionado.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}