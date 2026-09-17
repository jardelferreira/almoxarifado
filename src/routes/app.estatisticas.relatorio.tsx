import { createFileRoute } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Download, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDB } from "@/db/db";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import {
  SEM_EQUIPE_ID,
  analisarConsumo,
  calcularAcuracidadeInventarios,
  calcularComparacaoPeriodos,
  calcularCustosDocumentados,
  calcularEstadoEstoque,
  calcularEstatisticasEquipes,
  calcularFluxoFinanceiroPorGrupo,
  calcularFluxoPeriodo,
  calcularProdutoEstatistica,
  calcularProdutoPorEquipe,
  calcularQualidadeEstoque,
  calcularResumoFinanceiro,
  criarPeriodoPadrao,
  filtrarMovimentacoesPeriodo,
} from "@/services/estatisticas-materiais";
import { num } from "@/utils/format";

export const Route = createFileRoute("/app/estatisticas/relatorio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Relatório de Estatísticas de Materiais — Almoxarifado" },
      {
        name: "description",
        content: "Relatório gerencial formatado para impressão e PDF das estatísticas de materiais.",
      },
    ],
  }),
  component: RelatorioEstatisticasMateriaisPage,
});

function RelatorioEstatisticasMateriaisPage() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const params = useMemo(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search), []);
  const periodo = useMemo(() => {
    const de = params.get("de");
    const ate = params.get("ate");
    return de && ate ? { de, ate } : criarPeriodoPadrao(30);
  }, [params]);
  const produtoId = params.get("produtoId");
  const equipeId = params.get("equipeId");

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
  const inventarios = useLiveQuery(
    async () => (projetoId ? getDB().inventarios.where("projeto_id").equals(projetoId).toArray() : []),
    [projetoId],
  );
  const inventarioIdsKey = useMemo(
    () => (inventarios ?? []).map((inventario) => inventario.id).sort().join("|"),
    [inventarios],
  );
  const inventarioItens = useLiveQuery(
    async () => {
      const ids = inventarioIdsKey ? inventarioIdsKey.split("|").filter(Boolean) : [];
      if (!ids.length) return [];
      return getDB().inventario_itens.where("inventario_id").anyOf(ids).toArray();
    },
    [inventarioIdsKey],
  );

  const movsFiltradas = useMemo(
    () =>
      dados
        ? filtrarMovimentacoesPeriodo(dados.movimentacoes, periodo).filter((mov) => {
            if (produtoId && mov.produto_id !== produtoId) return false;
            if (equipeId && mov.equipe_id !== equipeId) return false;
            return true;
          })
        : [],
    [dados, periodo.de, periodo.ate, produtoId, equipeId],
  );
  const movsContexto = useMemo(
    () =>
      (dados?.movimentacoes ?? []).filter((mov) => {
        if (produtoId && mov.produto_id !== produtoId) return false;
        if (equipeId && mov.equipe_id !== equipeId) return false;
        return true;
      }),
    [dados?.movimentacoes, produtoId, equipeId],
  );
  const produtoSelecionado = useMemo(
    () => (produtoId ? dados?.produtos.find((produto) => produto.id === produtoId) ?? null : null),
    [dados?.produtos, produtoId],
  );
  const equipeSelecionada = useMemo(
    () => (equipeId ? dados?.equipes.find((equipe) => equipe.id === equipeId) ?? null : null),
    [dados?.equipes, equipeId],
  );

  const fluxo = useMemo(() => (dados ? calcularFluxoPeriodo(movsFiltradas, periodo) : null), [dados, movsFiltradas, periodo.de, periodo.ate]);
  const comparacao = useMemo(() => calcularComparacaoPeriodos(movsContexto, periodo), [movsContexto, periodo.de, periodo.ate]);
  const estado = useMemo(
    () =>
      dados
        ? calcularEstadoEstoque(
            dados.produtos,
            equipeId ? dados.movimentacoes.filter((mov) => mov.equipe_id === equipeId) : dados.movimentacoes,
            dados.unidades,
            dados.categorias,
            dados.equipes,
          )
        : null,
    [dados, equipeId],
  );
  const produtoAnalise = useMemo(
    () =>
      produtoSelecionado && dados
        ? calcularProdutoEstatistica(
            produtoSelecionado,
            equipeId ? dados.movimentacoes.filter((mov) => mov.equipe_id === equipeId) : dados.movimentacoes,
            periodo,
          )
        : null,
    [dados, produtoSelecionado, equipeId, periodo.de, periodo.ate],
  );
  const consumoProduto = useMemo(
    () =>
      produtoSelecionado && dados
        ? analisarConsumo(
            equipeId
              ? dados.movimentacoes.filter((mov) => mov.equipe_id === equipeId && mov.produto_id === produtoSelecionado.id)
              : dados.movimentacoes.filter((mov) => mov.produto_id === produtoSelecionado.id),
            periodo,
            produtoAnalise?.estoqueAtual ?? null,
          )
        : null,
    [dados, produtoSelecionado, equipeId, periodo.de, periodo.ate, produtoAnalise?.estoqueAtual],
  );
  const produtoPorEquipe = useMemo(
    () =>
      produtoSelecionado && dados
        ? calcularProdutoPorEquipe(
            produtoSelecionado,
            equipeId ? dados.movimentacoes.filter((mov) => mov.equipe_id === equipeId) : dados.movimentacoes,
            dados.equipes,
            periodo,
          )
        : [],
    [dados, produtoSelecionado, equipeId, periodo.de, periodo.ate],
  );
  const estatisticasEquipes = useMemo(
    () =>
      dados
        ? calcularEstatisticasEquipes(
            dados.produtos,
            produtoId ? dados.movimentacoes.filter((mov) => mov.produto_id === produtoId) : dados.movimentacoes,
            dados.unidades,
            dados.categorias,
            equipeId ? dados.movimentacoes.filter((mov) => mov.equipe_id === equipeId) : dados.movimentacoes,
            periodo,
          )
        : [],
    [dados, produtoId, equipeId, periodo.de, periodo.ate],
  );

  const documentosAtivos = configuracao?.modulos.documentos === true;
  const custos = useMemo(() => {
    if (!documentosAtivos || !dados || !documentoItens || !documentos) return new Map();
    const documentosValidos = new Set(documentos.filter((documento) => documento.status !== "CANCELADO").map((documento) => documento.id));
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
            equipeId ? dados.movimentacoes.filter((mov) => mov.equipe_id === equipeId) : dados.movimentacoes,
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
        ? calcularFluxoFinanceiroPorGrupo(
            equipeId ? dados.movimentacoes.filter((mov) => mov.equipe_id === equipeId) : dados.movimentacoes,
            periodo,
            custos,
            (mov) => mov.equipe_id,
            20,
          )
        : [],
    [dados, equipeId, documentosAtivos, custos, periodo.de, periodo.ate],
  );
  const financeiroPorResponsavel = useMemo(
    () =>
      dados && documentosAtivos
        ? calcularFluxoFinanceiroPorGrupo(
            equipeId ? dados.movimentacoes.filter((mov) => mov.equipe_id === equipeId) : dados.movimentacoes,
            periodo,
            custos,
            (mov) => mov.encarregado_id ?? mov.funcionario_id,
            20,
          )
        : [],
    [dados, equipeId, documentosAtivos, custos, periodo.de, periodo.ate],
  );
  const qualidade = useMemo(
    () =>
      dados
        ? calcularQualidadeEstoque(dados.produtos, dados.movimentacoes, dados.equipes, periodo, {
            exigirDocumentoEntrada: configuracao?.documentos.exigir_na_entrada === true,
            exigirJustificativaAjuste: configuracao?.estoque.exigir_justificativa_ajuste === true,
          })
        : null,
    [dados, periodo.de, periodo.ate, configuracao?.documentos.exigir_na_entrada, configuracao?.estoque.exigir_justificativa_ajuste],
  );
  const acuracidade = useMemo(
    () => calcularAcuracidadeInventarios(inventarios ?? [], inventarioItens ?? [], 20),
    [inventarios, inventarioItens],
  );

  if (!dados) return <p className="p-6 text-sm text-muted-foreground">Carregando relatório…</p>;

  const produtoNome = produtoSelecionado?.nome ?? "Todos os produtos";
  const equipeNome = equipeSelecionada?.nome ?? "Todas as equipes";
  const projetoNome = "Projeto ativo";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm 12mm 16mm; }
        @media print {
          html, body { background: #fff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .report-page-break { break-before: page; page-break-before: always; }
          .report-avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .report-table thead { display: table-header-group; }
          .report-table tr { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="min-h-screen bg-muted/20 text-foreground">
        <div className="mx-auto max-w-[1100px] p-4 md:p-8 print:max-w-none print:p-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="size-4" />
              Voltar para estatísticas
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportarRelatorioCsv({ periodo, produtoNome, equipeNome, fluxo, comparacao })}>
                <Download className="size-4" />
                Exportar CSV-resumo
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" />
                Imprimir / salvar PDF
              </Button>
            </div>
          </div>

          <main className="space-y-0">
            <ReportPage title="Relatório de estatísticas de materiais" subtitle="Visão gerencial do estoque, movimentações, consumo, equipes, finanças, inventário e qualidade.">
              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock title="Projeto">{projetoNome}</InfoBlock>
                <InfoBlock title="Emissão">{formatarData(new Date())}</InfoBlock>
                <InfoBlock title="Período analisado">{formatarPeriodo(periodo)}</InfoBlock>
                <InfoBlock title="Período comparativo">{formatarPeriodo(comparacao.periodoAnterior)}</InfoBlock>
                <InfoBlock title="Produto">{produtoNome}</InfoBlock>
                <InfoBlock title="Equipe">{equipeNome}</InfoBlock>
              </div>
              <p className="mt-8 text-xs leading-5 text-muted-foreground">
                Este relatório é uma fotografia analítica dos dados atuais do projeto. O estoque atual considera o histórico completo de movimentações; o período controla os fluxos e indicadores temporais. Quantidades de produtos com unidades diferentes não são somadas em um único indicador físico.
              </p>
            </ReportPage>

            <ReportPage title="1. Resumo executivo" subtitle="Principais indicadores do período selecionado." pageBreak>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Movimentações" value={num(fluxo?.movimentacoes ?? 0)} />
                <Kpi label="Entradas" value={num(fluxo?.entradasMovimentacoes ?? 0)} />
                <Kpi label="Saídas" value={num(fluxo?.saidasMovimentacoes ?? 0)} />
                <Kpi label="Produtos movimentados" value={num(fluxo?.produtosMovimentados ?? 0)} />
                <Kpi label="Posições de estoque" value={num(estado?.posicoesEstoque ?? 0)} />
                <Kpi label="Produtos com estoque" value={num(estado?.produtosComEstoque ?? 0)} />
                <Kpi label="Abaixo do mínimo" value={num(estado?.posicoesAbaixoDoMinimo ?? 0)} />
                <Kpi label="Produtos em risco" value={num(estado?.produtosEmRisco ?? 0)} />
              </div>
              <SectionNote>Devoluções, ajustes e transferências permanecem discriminados nos capítulos específicos; o resumo não transforma esses movimentos em compras.</SectionNote>
            </ReportPage>

            <ReportPage title="2. Comparação entre períodos" subtitle="Período atual versus janela anterior de mesma duração." pageBreak>
              <ComparisonTable comparacao={comparacao} produtoId={produtoId} />
            </ReportPage>

            <ReportPage title="3. Movimentações" subtitle="Fluxo operacional do período selecionado." pageBreak>
              <Table
                headers={["Indicador", "Quantidade"]}
                rows={[
                  ["Total de movimentações", num(fluxo?.movimentacoes ?? 0)],
                  ["Entradas", num(fluxo?.entradasMovimentacoes ?? 0)],
                  ["Saídas", num(fluxo?.saidasMovimentacoes ?? 0)],
                  ["Devoluções", num(fluxo?.devolucoesMovimentacoes ?? 0)],
                  ["Ajustes", num(fluxo?.ajustesMovimentacoes ?? 0)],
                  ["Transferências", num(fluxo?.transferenciasMovimentacoes ?? 0)],
                  ["Produtos movimentados", num(fluxo?.produtosMovimentados ?? 0)],
                ]}
              />
              {produtoSelecionado ? (
                <div className="report-avoid-break mt-6">
                  <h3 className="mb-2 text-sm font-semibold">Produto selecionado: {produtoSelecionado.nome}</h3>
                  <Table
                    headers={["Indicador físico", "Quantidade"]}
                    rows={[
                      ["Entradas no período", num(fluxo?.entradasQuantidade ?? 0)],
                      ["Saídas no período", num(fluxo?.saidasQuantidade ?? 0)],
                      ["Devoluções", num(fluxo?.devolucoesQuantidade ?? 0)],
                    ]}
                  />
                </div>
              ) : null}
            </ReportPage>

            <ReportPage title="4. Consumo e cobertura" subtitle="Estimativa baseada em saídas e estoque físico atual." pageBreak>
              {!produtoSelecionado || !produtoAnalise || !consumoProduto ? (
                <SectionNote>Selecione um produto na tela de estatísticas para incluir uma análise detalhada de consumo, tendência e cobertura.</SectionNote>
              ) : (
                <>
                  <Table
                    headers={["Indicador", "Resultado"]}
                    rows={[
                      ["Produto", produtoSelecionado.nome],
                      ["Estoque atual", num(produtoAnalise.estoqueAtual)],
                      ["Estoque mínimo", num(produtoAnalise.estoqueMinimo)],
                      ["Consumo no período", num(produtoAnalise.consumoPeriodo)],
                      ["Média diária", num(produtoAnalise.consumoMedioDiario)],
                      ["Média semanal", num(produtoAnalise.consumoMedioSemanal)],
                      ["Média mensal", num(produtoAnalise.consumoMedioMensal)],
                      ["Cobertura estimada", produtoAnalise.coberturaDias == null ? "Indeterminada" : `${num(produtoAnalise.coberturaDias)} dias`],
                      ["Tendência", consumoProduto.tendencia.direcao],
                    ]}
                  />
                  <div className="report-avoid-break mt-6">
                    <h3 className="mb-2 text-sm font-semibold">Janelas de consumo</h3>
                    <Table
                      headers={["Janela", "Saídas", "Média/dia", "Média/semana", "Média/mês"]}
                      rows={consumoProduto.janelas.map((janela) => [
                        `${janela.dias} dias`,
                        num(janela.saidas),
                        num(janela.mediaDiaria),
                        num(janela.mediaSemanal),
                        num(janela.mediaMensal),
                      ])}
                    />
                  </div>
                </>
              )}
            </ReportPage>

            <ReportPage title="5. Equipes" subtitle="Distribuição operacional e risco por equipe." pageBreak>
              <Table
                headers={["Equipe", "Posições", "Produtos", "Saídas", "Consumo/dia", "Risco", "Cobertura mínima"]}
                rows={estatisticasEquipes.map((item) => [
                  item.equipe.nome,
                  num(item.posicoesEstoque),
                  num(item.produtosComEstoque),
                  num(item.saidasNoPeriodo),
                  num(item.mediaSaidasPorDia),
                  num(item.produtosEmRisco),
                  item.menorCoberturaDias == null ? "—" : `${num(item.menorCoberturaDias)} dias`,
                ])}
              />
              {produtoSelecionado ? (
                <div className="report-avoid-break mt-6">
                  <h3 className="mb-2 text-sm font-semibold">Produto por equipe: {produtoSelecionado.nome}</h3>
                  <Table
                    headers={["Equipe", "Estoque", "Mínimo", "Consumo", "Média/dia", "Cobertura"]}
                    rows={produtoPorEquipe.map((item) => [
                      item.equipe.nome,
                      num(item.estoqueAtual),
                      num(item.estoqueMinimo),
                      num(item.consumoPeriodo),
                      num(item.consumoMedioDiario),
                      item.coberturaDias == null ? "—" : `${num(item.coberturaDias)} dias`,
                    ])}
                  />
                </div>
              ) : null}
            </ReportPage>

            <ReportPage title="6. Financeiro" subtitle="Valoração baseada em custos documentados e movimentações atribuídas ao contexto selecionado." pageBreak>
              {!documentosAtivos ? (
                <SectionNote>Valoração financeira indisponível: o módulo de Documentos não está ativo para este projeto.</SectionNote>
              ) : (
                <>
                  <Table
                    headers={["Indicador", "Valor"]}
                    rows={[
                      ["Valor do estoque documentado", moeda(resumoFinanceiro?.valorEstoqueDocumentado ?? 0)],
                      ["Entradas documentadas", moeda(resumoFinanceiro?.valorEntradasDocumentado ?? 0)],
                      ["Consumo financeiro", moeda(resumoFinanceiro?.valorSaidasDocumentado ?? 0)],
                      ["Cobertura de valoração", `${num(resumoFinanceiro?.coberturaPorPosicoes ?? 0)}%`],
                      ["Entradas sem custo", num(resumoFinanceiro?.entradasSemCusto ?? 0)],
                      ["Saídas sem custo", num(resumoFinanceiro?.saidasSemCusto ?? 0)],
                    ]}
                  />
                  <div className="grid gap-6 md:grid-cols-2 mt-6">
                    <div className="report-avoid-break">
                      <h3 className="mb-2 text-sm font-semibold">Fluxo por equipe</h3>
                      <Table
                        headers={["Grupo", "Entradas", "Saídas", "Valor entradas", "Valor saídas"]}
                        rows={financeiroPorEquipe.map((row) => [
                          row.id === SEM_EQUIPE_ID ? "Sem equipe" : dados.equipes.find((equipe) => equipe.id === row.id)?.nome ?? row.id,
                          num(row.entradas),
                          num(row.saidas),
                          moeda(row.valorEntradasDocumentado),
                          moeda(row.valorSaidasDocumentado),
                        ])}
                      />
                    </div>
                    <div className="report-avoid-break">
                      <h3 className="mb-2 text-sm font-semibold">Fluxo por responsável</h3>
                      <Table
                        headers={["Responsável", "Entradas", "Saídas", "Valor entradas", "Valor saídas"]}
                        rows={financeiroPorResponsavel.map((row) => [
                          dados.funcionarios.find((funcionario) => funcionario.id === row.id)?.nome ?? (row.id === "__sem__" ? "Sem responsável" : row.id),
                          num(row.entradas),
                          num(row.saidas),
                          moeda(row.valorEntradasDocumentado),
                          moeda(row.valorSaidasDocumentado),
                        ])}
                      />
                    </div>
                  </div>
                  <SectionNote>Os valores são analíticos e usam custo médio documentado por produto. Devoluções não são tratadas como nova compra. A análise por responsável representa as movimentações atribuídas a ele, não propriedade do estoque.</SectionNote>
                </>
              )}
            </ReportPage>

            <ReportPage title="7. Inventário" subtitle="Acuracidade dos inventários concluídos." pageBreak>
              <Table
                headers={["Indicador", "Resultado"]}
                rows={[
                  ["Inventários concluídos", num(acuracidade.inventariosConcluidos)],
                  ["Itens analisados", num(acuracidade.itensAnalisados)],
                  ["Itens contados", num(acuracidade.itensContados)],
                  ["Itens divergentes", num(acuracidade.itensDivergentes)],
                  ["Cobertura de contagem", `${num(acuracidade.coberturaContagem)}%`],
                  ["Acuracidade por posições", `${num(acuracidade.acuracidadePorPosicoes)}%`],
                  ["Acuracidade por quantidade", `${num(acuracidade.acuracidadePorQuantidade)}%`],
                  ["Último inventário", acuracidade.ultimoInventario?.data?.slice(0, 10) ?? "—"],
                ]}
              />
              {acuracidade.maioresDivergencias.length ? (
                <div className="report-avoid-break mt-6">
                  <h3 className="mb-2 text-sm font-semibold">Maiores divergências</h3>
                  <Table
                    headers={["Produto", "Equipe", "Sistema", "Contado", "Diferença"]}
                    rows={acuracidade.maioresDivergencias.map((item) => [
                      dados.produtos.find((produto) => produto.id === item.produtoId)?.nome ?? item.produtoId,
                      item.equipeId ? dados.equipes.find((equipe) => equipe.id === item.equipeId)?.nome ?? item.equipeId : "Sem equipe",
                      num(item.quantidadeSistema),
                      num(item.quantidadeContada),
                      num(item.diferenca),
                    ])}
                  />
                </div>
              ) : (
                <SectionNote>Nenhuma divergência relevante foi encontrada nos inventários concluídos analisados.</SectionNote>
              )}
            </ReportPage>

            <ReportPage title="8. Qualidade e alertas" subtitle="Apontamentos objetivos de integridade do histórico." pageBreak>
              <Table
                headers={["Indicador", "Quantidade"]}
                rows={[
                  ["Alertas", num(qualidade?.total ?? 0)],
                  ["Alta prioridade", num(qualidade?.altas ?? 0)],
                  ["Média prioridade", num(qualidade?.medias ?? 0)],
                  ["Baixa prioridade", num(qualidade?.baixas ?? 0)],
                  ["Saídas sem responsável", num(qualidade?.saidasSemResponsavel ?? 0)],
                  ["Entradas sem documento", num(qualidade?.entradasSemDocumento ?? 0)],
                  ["Ajustes sem justificativa", num(qualidade?.ajustesSemJustificativa ?? 0)],
                  ["Quantidades inválidas", num(qualidade?.quantidadesInvalidas ?? 0)],
                  ["Produtos inexistentes", num(qualidade?.produtosInexistentes ?? 0)],
                  ["Equipes inexistentes", num(qualidade?.equipesInexistentes ?? 0)],
                ]}
              />
              {qualidade?.alertas.length ? (
                <div className="mt-6 space-y-3">
                  {qualidade.alertas.slice(0, 20).map((alerta) => (
                    <div key={alerta.id} className="report-avoid-break rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{alerta.mensagem}</div>
                        <span className="rounded-full border px-2 py-1 text-[11px] font-medium uppercase">{alerta.severidade}</span>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <span>Data: {alerta.data.slice(0, 10)}</span>
                        <span>Movimentação: {alerta.movimentacaoId}</span>
                        <span>Tipo: {alerta.tipoMovimentacao}</span>
                        <span>Quantidade: {num(alerta.quantidade)}</span>
                        <span>Produto: {alerta.produtoId ? dados.produtos.find((produto) => produto.id === alerta.produtoId)?.nome ?? alerta.produtoId : "—"}</span>
                        <span>Equipe: {alerta.equipeId ? dados.equipes.find((equipe) => equipe.id === alerta.equipeId)?.nome ?? alerta.equipeId : "—"}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6">{alerta.comoCorrigir}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <SectionNote>Os alertas não alteram movimentos nem saldo do estoque. Eles apontam inconsistências para correção no módulo de Movimentações ou nos cadastros relacionados.</SectionNote>
            </ReportPage>
          </main>
        </div>
      </div>
    </>
  );
}

function ReportPage({ title, subtitle, children, pageBreak = false }: { title: string; subtitle: string; children: ReactNode; pageBreak?: boolean }) {
  return (
    <section className={`min-h-[260mm] bg-background p-6 md:p-10 print:min-h-0 print:p-0 ${pageBreak ? "report-page-break" : ""}`}>
      <div className="border-b pb-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-1 size-5 shrink-0 text-primary print:hidden" />
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="pt-6">{children}</div>
      <div className="mt-10 flex justify-between border-t pt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Relatório de estatísticas de materiais</span>
        <span>{formatarData(new Date())}</span>
      </div>
    </section>
  );
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-lg border bg-muted/10 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p><p className="mt-1 text-sm font-medium">{children}</p></div>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="report-avoid-break rounded-lg border p-4"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-semibold">{value}</p></div>;
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border report-avoid-break">
      <table className="report-table w-full border-collapse text-xs">
        <thead className="bg-muted/40">
          <tr>{headers.map((header) => <th key={header} className="border-b px-3 py-2 text-left font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => <tr key={index} className="even:bg-muted/10">{row.map((cell, cellIndex) => <td key={cellIndex} className="border-b px-3 py-2 align-top last:border-b-0">{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="px-3 py-5 text-center text-muted-foreground">Sem dados para exibir.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonTable({ comparacao, produtoId }: { comparacao: ReturnType<typeof calcularComparacaoPeriodos>; produtoId: string | null }) {
  const rows: string[][] = [
    ["Movimentações", num(comparacao.atual.movimentacoes), num(comparacao.anterior.movimentacoes), formatarVariacao(comparacao.variacoes.movimentacoes)],
    ["Entradas", num(comparacao.atual.entradasMovimentacoes), num(comparacao.anterior.entradasMovimentacoes), formatarVariacao(comparacao.variacoes.entradasMovimentacoes)],
    ["Saídas", num(comparacao.atual.saidasMovimentacoes), num(comparacao.anterior.saidasMovimentacoes), formatarVariacao(comparacao.variacoes.saidasMovimentacoes)],
    ["Devoluções", num(comparacao.atual.devolucoesMovimentacoes), num(comparacao.anterior.devolucoesMovimentacoes), formatarVariacao(comparacao.variacoes.devolucoesMovimentacoes)],
    ["Produtos movimentados", num(comparacao.atual.produtosMovimentados), num(comparacao.anterior.produtosMovimentados), formatarVariacao(comparacao.variacoes.produtosMovimentados)],
  ];
  if (produtoId) {
    rows.push(
      ["Entradas (quantidade)", num(comparacao.atual.entradasQuantidade), num(comparacao.anterior.entradasQuantidade), formatarVariacao(comparacao.variacoes.entradasQuantidade)],
      ["Saídas (quantidade)", num(comparacao.atual.saidasQuantidade), num(comparacao.anterior.saidasQuantidade), formatarVariacao(comparacao.variacoes.saidasQuantidade)],
    );
  }
  return <Table headers={["Indicador", "Atual", "Anterior", "Variação"]} rows={rows} />;
}

function SectionNote({ children }: { children: ReactNode }) {
  return <div className="report-avoid-break mt-6 rounded-lg border border-dashed bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">{children}</div>;
}

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarPeriodo(periodo: { de: string; ate: string }) {
  return `${periodo.de.split("-").reverse().join("/")} → ${periodo.ate.split("-").reverse().join("/")}`;
}

function formatarData(data: Date) {
  return data.toLocaleDateString("pt-BR");
}

function formatarVariacao(valor: number | null) {
  if (valor == null) return "—";
  return `${valor > 0 ? "+" : ""}${num(valor)}%`;
}

function exportarRelatorioCsv({ periodo, produtoNome, equipeNome, fluxo, comparacao }: { periodo: { de: string; ate: string }; produtoNome: string; equipeNome: string; fluxo: ReturnType<typeof calcularFluxoPeriodo> | null; comparacao: ReturnType<typeof calcularComparacaoPeriodos> }) {
  const linhas = [
    ["Relatório", "Estatísticas de materiais"],
    ["Produto", produtoNome],
    ["Equipe", equipeNome],
    ["Período", formatarPeriodo(periodo)],
    ["Indicador", "Atual", "Anterior", "Variação"],
    ["Movimentações", fluxo?.movimentacoes ?? 0, comparacao.anterior.movimentacoes, comparacao.variacoes.movimentacoes ?? ""],
    ["Entradas", fluxo?.entradasMovimentacoes ?? 0, comparacao.anterior.entradasMovimentacoes, comparacao.variacoes.entradasMovimentacoes ?? ""],
    ["Saídas", fluxo?.saidasMovimentacoes ?? 0, comparacao.anterior.saidasMovimentacoes, comparacao.variacoes.saidasMovimentacoes ?? ""],
  ];
  const csv = linhas.map((linha) => linha.map((valor) => `"${String(valor ?? "").split('"').join('""')}"`).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-estatisticas-materiais-${periodo.ate}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
