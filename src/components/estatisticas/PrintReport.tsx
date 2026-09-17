import { memo } from "react";
import type {
  analisarConsumo,
  agruparMovimentacoesPorDiaSemana,
  calcularAcuracidadeInventarios,
  calcularAnaliseReposicao,
  calcularComparacaoPeriodos,
  calcularComparacaoPorProduto,
  calcularDesviosConsumoEquipes,
  calcularDesviosConsumoProdutos,
  calcularEstadoEstoque,
  calcularEstatisticasEquipes,
  calcularFluxoFinanceiroPorGrupo,
  calcularFluxoPeriodo,
  calcularMapaRiscoCobertura,
  calcularParetoConsumo,
  calcularProdutoEstatistica,
  calcularProdutoPorEquipe,
  calcularQualidadeEstoque,
  calcularRankingFrequenciaConsumo,
  calcularRegularidadeConsumo,
  calcularResumoFinanceiro,
} from "@/services/estatisticas-materiais";
import {
  MIN_SAIDAS_DESVIO_CONSUMO,
  MIN_SAIDAS_MAPA_RISCO,
  LIMIAR_DESVIO_CONSUMO_PERCENTUAL,
} from "@/services/estatisticas-materiais";
import type { useDados } from "@/hooks/useAppData";
import { num } from "@/utils/format";

/*
 * Relatório de impressão. A composição é idêntica à versão anterior — o que
 * mudou é o empacotamento: agora o componente vive em um arquivo próprio e é
 * memoizado, então ele só volta a renderizar quando os dados realmente mudam,
 * e não a cada tecla digitada nos filtros da tela.
 */

function PrintReportBase({
  periodo,
  produtoId,
  equipeId,
  fluxo,
  estado,
  comparacao,
  comparacaoPorProduto,
  produtoSelecionado,
  produtoAnalise,
  analiseConsumoProduto,
  rankingConsumoProdutos,
  paretoConsumoProdutos,
  regularidadeConsumoProduto,
  desviosConsumoProdutos,
  desviosConsumoEquipes,
  mapaRiscoCobertura,
  analiseReposicao,
  produtosEmRisco,
  estatisticasEquipes,
  produtoPorEquipe,
  resumoFinanceiro,
  financeiroPorEquipe,
  financeiroPorResponsavel,
  acuracidadeInventario,
  produtosPorId,
  equipesPorId,
  funcionariosPorId,
  distribuicaoDiaSemana,
  qualidade,
}: {
  periodo: { de: string; ate: string };
  produtoId: string | null;
  equipeId: string | null;
  fluxo: ReturnType<typeof calcularFluxoPeriodo> | null;
  estado: ReturnType<typeof calcularEstadoEstoque> | null;
  comparacao: ReturnType<typeof calcularComparacaoPeriodos>;
  comparacaoPorProduto: ReturnType<typeof calcularComparacaoPorProduto>;
  produtoSelecionado: NonNullable<ReturnType<typeof useDados>>["produtos"][number] | null;
  produtoAnalise: ReturnType<typeof calcularProdutoEstatistica> | null;
  analiseConsumoProduto: ReturnType<typeof analisarConsumo> | null;
  rankingConsumoProdutos: ReturnType<typeof calcularRankingFrequenciaConsumo>;
  paretoConsumoProdutos: ReturnType<typeof calcularParetoConsumo>;
  regularidadeConsumoProduto: ReturnType<typeof calcularRegularidadeConsumo> | null;
  desviosConsumoProdutos: ReturnType<typeof calcularDesviosConsumoProdutos>;
  desviosConsumoEquipes: ReturnType<typeof calcularDesviosConsumoEquipes>;
  mapaRiscoCobertura: ReturnType<typeof calcularMapaRiscoCobertura> | null;
  analiseReposicao: ReturnType<typeof calcularAnaliseReposicao> | null;
  produtosEmRisco: ReturnType<typeof calcularProdutoEstatistica>[];
  estatisticasEquipes: ReturnType<typeof calcularEstatisticasEquipes>;
  produtoPorEquipe: ReturnType<typeof calcularProdutoPorEquipe>;
  resumoFinanceiro: ReturnType<typeof calcularResumoFinanceiro> | null;
  financeiroPorEquipe: ReturnType<typeof calcularFluxoFinanceiroPorGrupo>;
  financeiroPorResponsavel: ReturnType<typeof calcularFluxoFinanceiroPorGrupo>;
  acuracidadeInventario: ReturnType<typeof calcularAcuracidadeInventarios>;
  produtosPorId: Map<string, NonNullable<ReturnType<typeof useDados>>["produtos"][number]>;
  equipesPorId: Map<string, NonNullable<ReturnType<typeof useDados>>["equipes"][number]>;
  funcionariosPorId: Map<string, NonNullable<ReturnType<typeof useDados>>["funcionarios"][number]>;
  distribuicaoDiaSemana: ReturnType<typeof agruparMovimentacoesPorDiaSemana>;
  qualidade: ReturnType<typeof calcularQualidadeEstoque>;
}) {
  const produtoNome = produtoSelecionado?.nome ?? "Todos os produtos";
  const equipeNome = equipeId ? equipesPorId.get(equipeId)?.nome ?? "Equipe não localizada" : "Todas as equipes";
  const formatMoney = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const formatDateTime = new Date().toLocaleString("pt-BR");
  const variation = (value: number | null) => value == null ? "—" : `${value > 0 ? "+" : ""}${num(value)}%`;

  return (
    <div className="relatorio-impressao" aria-hidden="true">
      <div className="print-page">
        <header className="print-section" style={{ borderBottom: "2px solid #111827", paddingBottom: 18, marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#6b7280" }}>Relatório gerencial</div>
          <h1 style={{ fontSize: 28, margin: "8px 0 6px", letterSpacing: -0.5 }}>Estatísticas de materiais</h1>
          <p className="print-muted" style={{ margin: 0, lineHeight: 1.5 }}>Observabilidade de estoque, movimentações, consumo, equipes, financeiro, inventário e qualidade.</p>
        </header>

        <div className="print-section" style={{ border: "1px solid #d1d5db", padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280", marginBottom: 12 }}>Parâmetros do relatório</div>
          <table>
            <tbody>
              <tr><td style={{ padding: "5px 0", width: "35%", color: "#6b7280" }}>Período</td><td style={{ padding: "5px 0", fontWeight: 600 }}>{periodo.de} → {periodo.ate}</td></tr>
              <tr><td style={{ padding: "5px 0", color: "#6b7280" }}>Produto</td><td style={{ padding: "5px 0", fontWeight: 600 }}>{produtoNome}</td></tr>
              <tr><td style={{ padding: "5px 0", color: "#6b7280" }}>Equipe</td><td style={{ padding: "5px 0", fontWeight: 600 }}>{equipeNome}</td></tr>
              <tr><td style={{ padding: "5px 0", color: "#6b7280" }}>Gerado em</td><td style={{ padding: "5px 0" }}>{formatDateTime}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="print-section">
          <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Resumo executivo</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <PrintMetric label="Movimentações" value={num(fluxo?.movimentacoes ?? 0)} />
            <PrintMetric label="Entradas" value={num(fluxo?.entradasMovimentacoes ?? 0)} />
            <PrintMetric label="Saídas" value={num(fluxo?.saidasMovimentacoes ?? 0)} />
            <PrintMetric label="Produtos movimentados" value={num(fluxo?.produtosMovimentados ?? 0)} />
            <PrintMetric label="Posições de estoque" value={num(estado?.posicoesEstoque ?? 0)} />
            <PrintMetric label="Produtos com estoque" value={num(estado?.produtosComEstoque ?? 0)} />
            <PrintMetric label="Abaixo do mínimo" value={num(estado?.posicoesAbaixoDoMinimo ?? 0)} />
            <PrintMetric label="Alertas de qualidade" value={num(qualidade.total)} />
          </div>
        </div>

        <div className="print-section" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>Leitura gerencial</h2>
          <p className="print-muted" style={{ margin: "0 0 12px", fontSize: 9.5, lineHeight: 1.5 }}>
            Síntese dos indicadores que merecem acompanhamento no período. Os pontos abaixo são derivados diretamente das análises do relatório e não alteram os critérios de cálculo das seções detalhadas.
          </p>
          <div style={{ borderTop: "1px solid #e5e7eb" }}>
            {[
              `Cobertura: ${num((mapaRiscoCobertura?.critico ?? 0) + (mapaRiscoCobertura?.atencao ?? 0))} produto(s) com cobertura de até 30 dias; ${num(mapaRiscoCobertura?.critico ?? 0)} na faixa crítica e ${num(mapaRiscoCobertura?.atencao ?? 0)} em atenção.`,
              `Reposição: ${num(analiseReposicao?.reposicaoImediata ?? 0)} item(ns) com reposição imediata e ${num(analiseReposicao?.reposicaoPrioritaria ?? 0)} com reposição prioritária, considerando a atividade mínima configurada.`,
              `Desvios: ${num(desviosConsumoProdutos.length)} produto(s) e ${num(desviosConsumoEquipes.length)} equipe(s) apresentaram desvio relevante de consumo.`,
              `Qualidade: ${num(qualidade.altas)} alerta(s) de alta prioridade entre ${num(qualidade.total)} alerta(s) identificados no período.`,
              acuracidadeInventario.inventariosConcluidos > 0
                ? `Inventário: acuracidade por posições de ${num(acuracidadeInventario.acuracidadePorPosicoes)}% em ${num(acuracidadeInventario.inventariosConcluidos)} inventário(s) concluído(s).`
                : "Inventário: não há inventários concluídos suficientes para medir a acuracidade.",
              `Variação de saídas: ${variation(comparacao.variacoes.saidasMovimentacoes)} em relação ao período anterior.`,
            ].map((texto, index) => (
              <div key={index} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #e5e7eb", fontSize: 9.5, lineHeight: 1.45 }}>
                <span style={{ fontWeight: 700, color: "#111827", minWidth: 12 }}>{index + 1}.</span>
                <span>{texto}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="print-page">
        <PrintHeader title="1. Comparação entre períodos" subtitle={`${comparacao.periodoAtual.de} → ${comparacao.periodoAtual.ate} versus ${comparacao.periodoAnterior.de} → ${comparacao.periodoAnterior.ate}`} />
        <PrintTable headers={["Indicador", "Atual", "Anterior", "Variação"]} rows={[
          ["Movimentações", num(comparacao.atual.movimentacoes), num(comparacao.anterior.movimentacoes), variation(comparacao.variacoes.movimentacoes)],
          ["Entradas", num(comparacao.atual.entradasMovimentacoes), num(comparacao.anterior.entradasMovimentacoes), variation(comparacao.variacoes.entradasMovimentacoes)],
          ["Saídas", num(comparacao.atual.saidasMovimentacoes), num(comparacao.anterior.saidasMovimentacoes), variation(comparacao.variacoes.saidasMovimentacoes)],
          ["Devoluções", num(comparacao.atual.devolucoesMovimentacoes), num(comparacao.anterior.devolucoesMovimentacoes), variation(comparacao.variacoes.devolucoesMovimentacoes)],
          ["Produtos movimentados", num(comparacao.atual.produtosMovimentados), num(comparacao.anterior.produtosMovimentados), variation(comparacao.variacoes.produtosMovimentados)],
        ]} />
        <div style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Quantidade física</h3>
          {produtoId ? (
            <PrintTable headers={["Indicador", "Atual", "Anterior", "Variação"]} rows={[
              ["Entradas", num(comparacao.atual.entradasQuantidade), num(comparacao.anterior.entradasQuantidade), variation(comparacao.variacoes.entradasQuantidade)],
              ["Saídas", num(comparacao.atual.saidasQuantidade), num(comparacao.anterior.saidasQuantidade), variation(comparacao.variacoes.saidasQuantidade)],
            ]} />
          ) : <p className="print-muted">A quantidade física não é agregada entre produtos com unidades diferentes. Selecione um produto para esse comparativo.</p>}
        </div>
      </div>

      <div className="print-page">
        <PrintHeader title="2. Comparação por produto" subtitle="Produtos com maior volume de movimentações entre os períodos" />
        {comparacaoPorProduto.length ? (
          <PrintTable
            headers={["Produto", "Mov. atual", "Mov. anterior", "Variação", "Saídas atuais"]}
            rows={comparacaoPorProduto.map((item) => [
              produtosPorId.get(item.produtoId)?.nome ?? "Produto não localizado",
              num(item.atual.movimentacoes),
              num(item.anterior.movimentacoes),
              variation(item.variacoes.movimentacoes),
              num(item.atual.saidas),
            ])}
          />
        ) : (
          <p className="print-muted">Nenhuma movimentação encontrada para os produtos nos períodos comparados.</p>
        )}
        <p className="print-muted" style={{ marginTop: 12, fontSize: 9 }}>Lista limitada aos 10 produtos com maior volume de movimentações no período atual. As métricas são contagens e não agregam quantidades físicas de unidades diferentes.</p>
      </div>

      <div className="print-page">
        <PrintHeader title="3. Movimentações" subtitle="Fluxo registrado no período selecionado" />
        <PrintTable headers={["Indicador", "Quantidade"]} rows={[
          ["Movimentações", num(fluxo?.movimentacoes ?? 0)],
          ["Entradas", num(fluxo?.entradasMovimentacoes ?? 0)],
          ["Saídas", num(fluxo?.saidasMovimentacoes ?? 0)],
          ["Devoluções", num(fluxo?.devolucoesMovimentacoes ?? 0)],
          ["Ajustes", num(fluxo?.ajustesMovimentacoes ?? 0)],
          ["Transferências", num(fluxo?.transferenciasMovimentacoes ?? 0)],
          ["Produtos movimentados", num(fluxo?.produtosMovimentados ?? 0)],
        ]} />
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Quantidades movimentadas</h3>
          <PrintTable headers={["Tipo", "Quantidade"]} rows={[
            ["Entradas", num(fluxo?.entradasQuantidade ?? 0)],
            ["Saídas", num(fluxo?.saidasQuantidade ?? 0)],
            ["Devoluções", num(fluxo?.devolucoesQuantidade ?? 0)],
            ["Ajustes", num(fluxo?.ajustesQuantidade ?? 0)],
            ["Transferências", num(fluxo?.transferenciasQuantidade ?? 0)],
          ]} />
        </div>
        <p className="print-muted" style={{ marginTop: 16, fontSize: 9 }}>As quantidades físicas só são agregadas quando pertencem ao mesmo produto/unidade. O relatório não soma unidades incompatíveis.</p>
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Distribuição por dia da semana</h3>
          <PrintTable headers={["Dia", "Movimentações", "Entradas", "Saídas"]} rows={distribuicaoDiaSemana.map((item) => [item.dia, num(item.movimentacoes), num(item.entradas), num(item.saidas)])} />
          <p className="print-muted" style={{ marginTop: 8, fontSize: 9 }}>As métricas desta seção são contagens de registros e não representam quantidades físicas.</p>
        </div>
      </div>

      <div className="print-page">
        <PrintHeader title="4. Consumo e cobertura" subtitle="Risco de ruptura e projeções operacionais" />
        {produtoAnalise ? (
          <>
            <div style={{ border: "1px solid #d1d5db", padding: 14, marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>{produtoAnalise.produto.nome}</h3>
              <PrintTable headers={["Indicador", "Valor"]} rows={[
                ["Estoque atual", num(produtoAnalise.estoqueAtual)],
                ["Estoque mínimo", num(produtoAnalise.estoqueMinimo)],
                ["Consumo / dia", num(produtoAnalise.consumoMedioDiario)],
                ["Consumo / semana", num(produtoAnalise.consumoMedioSemanal)],
                ["Consumo / mês", num(produtoAnalise.consumoMedioMensal)],
                ["Cobertura", produtoAnalise.coberturaDias == null ? "—" : `${num(produtoAnalise.coberturaDias)} dias`],
                ["Até estoque mínimo", produtoAnalise.diasAteMinimo == null ? "—" : `${num(produtoAnalise.diasAteMinimo)} dias`],
                ["Ruptura estimada", produtoAnalise.dataEstimadaRuptura ?? "—"],
              ]} />
            </div>
            {analiseConsumoProduto ? <PrintTable headers={["Janela", "Saídas", "Média/dia", "Média/semana", "Média/mês"]} rows={analiseConsumoProduto.janelas.map((janela) => [
              `${janela.dias} dias`, num(janela.saidas), num(janela.mediaDiaria), num(janela.mediaSemanal), num(janela.mediaMensal),
            ])} /> : null}
          </>
        ) : null}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Produtos com maior frequência de consumo</h3>
          {rankingConsumoProdutos.length ? (
            <PrintTable headers={["Produto", "Saídas", "Dias com saída", "Frequência/dia", "Participação"]} rows={rankingConsumoProdutos.map((item) => [
              item.produto.nome, num(item.saidas), num(item.diasComSaida), num(item.frequenciaDiaria), item.participacaoPercentual == null ? "—" : `${num(item.participacaoPercentual)}%`,
            ])} />
          ) : (
            <p className="print-muted">Nenhuma saída registrada no período selecionado.</p>
          )}
          <p className="print-muted" style={{ marginTop: 8, fontSize: 9 }}>Ranking ordenado pela frequência de registros de saída. Quantidades físicas não são agregadas entre produtos com unidades diferentes.</p>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Concentração das saídas</h3>
          {paretoConsumoProdutos.length ? (
            <PrintTable
              headers={["Produto", "Saídas", "Participação", "Acumulado"]}
              rows={paretoConsumoProdutos.map((item) => [
                item.produto.nome,
                num(item.saidas),
                `${num(item.participacaoPercentual)}%`,
                `${num(item.acumuladoPercentual)}%`,
              ])}
            />
          ) : (
            <p className="print-muted">Nenhuma saída registrada no período selecionado.</p>
          )}
          <p className="print-muted" style={{ marginTop: 8, fontSize: 9 }}>A concentração é calculada sobre o número de registros de saída. Ela não representa valor financeiro nem quantidade física agregada.</p>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Regularidade do consumo</h3>
          {produtoSelecionado && regularidadeConsumoProduto ? (
            <PrintTable headers={["Indicador", "Valor"]} rows={[
              ["Produto", produtoSelecionado.nome],
              ["Dias com saída", num(regularidadeConsumoProduto.diasComSaida)],
              ["Intervalo médio", regularidadeConsumoProduto.intervaloMedioDias == null ? "—" : `${num(regularidadeConsumoProduto.intervaloMedioDias)} dias`],
              ["Menor intervalo", regularidadeConsumoProduto.menorIntervaloDias == null ? "—" : `${num(regularidadeConsumoProduto.menorIntervaloDias)} dias`],
              ["Maior intervalo", regularidadeConsumoProduto.maiorIntervaloDias == null ? "—" : `${num(regularidadeConsumoProduto.maiorIntervaloDias)} dias`],
              ["Dias do período com saída", `${num(regularidadeConsumoProduto.percentualDiasComSaida)}%`],
            ]} />
          ) : (
            <p className="print-muted">Nenhum produto selecionado para análise de regularidade.</p>
          )}
          <p className="print-muted" style={{ marginTop: 8, fontSize: 9 }}>A regularidade usa dias distintos com registro de saída. O intervalo é calculado entre dias consecutivos com consumo e não representa quantidade física.</p>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Desvios relevantes de consumo</h3>
          <p className="print-muted" style={{ marginBottom: 8, fontSize: 9 }}>Critério: pelo menos {MIN_SAIDAS_DESVIO_CONSUMO} saídas em uma das janelas e variação absoluta de pelo menos {LIMIAR_DESVIO_CONSUMO_PERCENTUAL}%.</p>
          {desviosConsumoProdutos.length ? (
            <PrintTable headers={["Produto", "Saídas atuais", "Saídas anteriores", "Variação"]} rows={desviosConsumoProdutos.map((item) => [
              item.produto.nome,
              num(item.saidasAtual),
              num(item.saidasAnterior),
              item.variacaoPercentual == null ? (item.direcao === "aumento" ? "Novo" : "—") : variation(item.variacaoPercentual),
            ])} />
          ) : <p className="print-muted">Nenhum desvio relevante de produto.</p>}
          <div style={{ marginTop: 12 }}>
            {desviosConsumoEquipes.length ? (
              <PrintTable headers={["Equipe", "Saídas atuais", "Saídas anteriores", "Variação"]} rows={desviosConsumoEquipes.map((item) => [
                item.equipe?.nome ?? "Sem equipe",
                num(item.saidasAtual),
                num(item.saidasAnterior),
                item.variacaoPercentual == null ? (item.direcao === "aumento" ? "Novo" : "—") : variation(item.variacaoPercentual),
              ])} />
            ) : <p className="print-muted">Nenhum desvio relevante de equipe.</p>}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Mapa de risco de cobertura</h3>
          {mapaRiscoCobertura ? (
            <>
              <PrintTable headers={["Faixa", "Produtos"]} rows={[
                ["Crítico · até 7 dias", num(mapaRiscoCobertura.critico)],
                ["Atenção · até 30 dias", num(mapaRiscoCobertura.atencao)],
                ["Adequado · > 30 dias", num(mapaRiscoCobertura.adequado)],
              ]} />
              <p className="print-muted" style={{ marginTop: 8 }}>Critério: estoque positivo e pelo menos {mapaRiscoCobertura.minSaidas} saídas no período. Fora do mapa: {num(mapaRiscoCobertura.excluidosSemEstoque)} produtos sem estoque e {num(mapaRiscoCobertura.excluidosBaixaAtividade)} com baixa atividade.</p>
            </>
          ) : <p className="print-muted">Mapa de risco indisponível.</p>}
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Plano de reposição</h3>
          {analiseReposicao?.itens.length ? (
            <>
              <PrintTable headers={["Produto", "Estoque", "Saídas", "Consumo/dia", "Estoque-alvo", "Reposição", "Prioridade"]} rows={analiseReposicao.itens.map((item) => [
                item.produto.nome,
                num(item.estoqueAtual),
                num(item.saidasPeriodo),
                num(item.consumoMedioDiario),
                num(item.estoqueAlvo),
                num(item.quantidadeSugerida),
                item.prioridade === "imediata" ? "Imediata" : "Prioritária",
              ])} />
              <p className="print-muted" style={{ marginTop: 6 }}>Cobertura-alvo de {num(analiseReposicao.diasAlvo)} dias; somente produtos com pelo menos {MIN_SAIDAS_MAPA_RISCO} saídas são considerados.</p>
            </>
          ) : (
            <p className="print-muted">Nenhum produto com indicação de reposição.</p>
          )}

          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Produtos com cobertura ≤ 30 dias</h3>
          {produtosEmRisco.length ? <PrintTable headers={["Produto", "Estoque", "Consumo/dia", "Cobertura"]} rows={produtosEmRisco.map((item) => [item.produto.nome, num(item.estoqueAtual), num(item.consumoMedioDiario), item.coberturaDias == null ? "—" : `${num(item.coberturaDias)} dias`])} /> : <p className="print-muted">Nenhum produto com consumo suficiente para estimar ruptura em até 30 dias.</p>}
        </div>
      </div>

      <div className="print-page">
        <PrintHeader title="5. Equipes" subtitle="Distribuição operacional, consumo e risco por equipe" />
        <PrintTable headers={["Equipe", "Posições", "Produtos c/ estoque", "Saídas", "Em risco", "Menor cobertura"]} rows={estatisticasEquipes.map((item) => [
          item.equipe.nome, num(item.posicoesEstoque), num(item.produtosComEstoque), num(item.saidasNoPeriodo), num(item.produtosEmRisco), item.menorCoberturaDias == null ? "—" : `${num(item.menorCoberturaDias)} d`,
        ])} />
        {produtoSelecionado ? (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>Produto selecionado por equipe — {produtoSelecionado.nome}</h3>
            <PrintTable headers={["Equipe", "Estoque", "Mínimo", "Consumo/dia", "Cobertura", "Até mínimo"]} rows={produtoPorEquipe.map((item) => [
              item.equipe.nome, num(item.estoqueAtual), num(item.estoqueMinimo), num(item.consumoMedioDiario), item.coberturaDias == null ? "—" : `${num(item.coberturaDias)} d`, item.diasAteMinimo == null ? "—" : `${num(item.diasAteMinimo)} d`,
            ])} />
          </div>
        ) : null}
      </div>

      <div className="print-page">
        <PrintHeader title="6. Financeiro" subtitle="Valoração baseada exclusivamente nos documentos vinculados ao estoque" />
        {resumoFinanceiro ? (
          <>
            <PrintTable headers={["Indicador", "Valor"]} rows={[
              ["Valor do estoque documentado", formatMoney(resumoFinanceiro.valorEstoqueDocumentado)],
              ["Entradas documentadas", formatMoney(resumoFinanceiro.valorEntradasDocumentado)],
              ["Consumo financeiro", formatMoney(resumoFinanceiro.valorSaidasDocumentado)],
              ["Cobertura de valoração", `${resumoFinanceiro.coberturaPorPosicoes}%`],
              ["Entradas sem custo", num(resumoFinanceiro.entradasSemCusto)],
              ["Saídas sem custo", num(resumoFinanceiro.saidasSemCusto)],
            ]} />
            <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>Por equipe</h3>
            <PrintTable headers={["Equipe", "Entradas", "Saídas", "Valor entradas", "Valor saídas"]} rows={financeiroPorEquipe.map((row) => [
              row.id === "__sem__" ? "Não informado" : equipesPorId.get(row.id)?.nome ?? "Não encontrado", num(row.entradas), num(row.saidas), formatMoney(row.valorEntradasDocumentado), formatMoney(row.valorSaidasDocumentado),
            ])} />
          </div>
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 13, marginBottom: 10 }}>Por responsável</h3>
              <PrintTable headers={["Responsável", "Entradas", "Saídas", "Valor entradas", "Valor saídas"]} rows={financeiroPorResponsavel.map((row) => [
                row.id === "__sem__" ? "Não informado" : funcionariosPorId.get(row.id)?.nome ?? "Não encontrado", num(row.entradas), num(row.saidas), formatMoney(row.valorEntradasDocumentado), formatMoney(row.valorSaidasDocumentado),
              ])} />
            </div>
          </>
        ) : <p className="print-muted">Não há base financeira disponível para o relatório neste projeto.</p>}
      </div>

      <div className="print-page">
        <PrintHeader title="7. Inventário" subtitle="Acuracidade dos inventários concluídos" />
        {acuracidadeInventario.inventariosConcluidos === 0 ? (
          <p className="print-muted">Ainda não há inventários concluídos para medir a acuracidade física.</p>
        ) : (
          <>
            <PrintTable headers={["Indicador", "Resultado"]} rows={[
              ["Acuracidade por posições", `${num(acuracidadeInventario.acuracidadePorPosicoes)}%`],
              ["Acuracidade por quantidade", `${num(acuracidadeInventario.acuracidadePorQuantidade)}%`],
              ["Itens divergentes", num(acuracidadeInventario.itensDivergentes)],
              ["Cobertura de contagem", `${num(acuracidadeInventario.coberturaContagem)}%`],
              ["Inventários concluídos", num(acuracidadeInventario.inventariosConcluidos)],
            ]} />
            {acuracidadeInventario.ultimoInventario ? <div style={{ marginTop: 18 }}><h3 style={{ fontSize: 13, marginBottom: 10 }}>Último inventário concluído</h3><PrintTable headers={["Data", "Itens contados", "Divergências", "Divergência absoluta"]} rows={[[acuracidadeInventario.ultimoInventario.data.slice(0, 10), num(acuracidadeInventario.ultimoInventario.itensContados), num(acuracidadeInventario.ultimoInventario.itensDivergentes), num(acuracidadeInventario.ultimoInventario.divergenciaAbsoluta)]]} /></div> : null}
            <div style={{ marginTop: 18 }}><h3 style={{ fontSize: 13, marginBottom: 10 }}>Maiores divergências</h3><PrintTable headers={["Produto", "Equipe", "Data", "Sistema", "Contado", "Diferença", "Acuracidade"]} rows={acuracidadeInventario.maioresDivergencias.map((item) => [
              produtosPorId.get(item.produtoId)?.nome ?? "Produto não localizado", equipesPorId.get(item.equipeId)?.nome ?? "Equipe não localizada", item.data.slice(0, 10), num(item.quantidadeSistema), num(item.quantidadeContada), num(item.diferenca), `${num(item.acuracidadePercentual)}%`,
            ])} /></div>
            <div style={{ marginTop: 18 }}><h3 style={{ fontSize: 13, marginBottom: 10 }}>Histórico</h3><PrintTable headers={["Data", "Contados", "Divergentes", "Por posições", "Por quantidade"]} rows={acuracidadeInventario.historico.map((item) => [item.data.slice(0, 10), num(item.itensContados), num(item.itensDivergentes), `${num(item.acuracidadePorPosicoes)}%`, `${num(item.acuracidadePorQuantidade)}%`])} /></div>
          </>
        )}
      </div>

      <div className="print-page">
        <PrintHeader title="8. Qualidade e alertas" subtitle="Integridade do histórico de movimentações" />
        <PrintTable headers={["Indicador", "Quantidade"]} rows={[
          ["Alertas", num(qualidade.total)],
          ["Alta prioridade", num(qualidade.altas)],
          ["Média prioridade", num(qualidade.medias)],
          ["Baixa prioridade", num(qualidade.baixas)],
          ["Movimentações analisadas", num(qualidade.movimentacoesAnalisadas)],
          ["Posições com saldo negativo", num(qualidade.posicoesComSaldoNegativo)],
          ["Saídas sem responsável", num(qualidade.saidasSemResponsavel)],
          ["Entradas sem documento", num(qualidade.entradasSemDocumento)],
          ["Ajustes sem justificativa", num(qualidade.ajustesSemJustificativa)],
          ["Quantidades inválidas", num(qualidade.quantidadesInvalidas)],
          ["Produtos inexistentes", num(qualidade.produtosInexistentes)],
          ["Equipes inexistentes", num(qualidade.equipesInexistentes)],
        ]} />
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, marginBottom: 10 }}>Alertas detalhados</h3>
          {qualidade.alertas.length ? <PrintTable headers={["Data", "Severidade", "Mov.", "Produto", "Equipe", "Problema", "Como corrigir"]} rows={qualidade.alertas.map((alerta) => [
            alerta.data.slice(0, 10), alerta.severidade === "alta" ? "Alta" : alerta.severidade === "media" ? "Média" : "Baixa", alerta.movimentacaoId, produtosPorId.get(alerta.produtoId ?? "")?.nome ?? "Não localizado", equipesPorId.get(alerta.equipeId ?? "")?.nome ?? (alerta.equipeId ? "Não localizada" : "Sem equipe"), alerta.mensagem, alerta.comoCorrigir,
          ])} /> : <p className="print-muted">Nenhum alerta foi identificado no período selecionado.</p>}
        </div>
      </div>
    </div>
  );
}
function PrintHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header style={{ borderBottom: "2px solid #111827", paddingBottom: 10, marginBottom: 18 }}>
      <h2 style={{ fontSize: 20, margin: 0 }}>{title}</h2>
      <p className="print-muted" style={{ margin: "6px 0 0", fontSize: 9.5 }}>{subtitle}</p>
    </header>
  );
}

function PrintMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #d1d5db", padding: 11 }}>
      <div style={{ fontSize: 8.5, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function PrintTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((header) => <th key={header} style={{ textAlign: header === headers[0] ? "left" : "right", borderBottom: "1.5px solid #111827", padding: "7px 6px", fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.35 }}>{header}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={`${rowIndex}-${cellIndex}`} style={{ textAlign: cellIndex === 0 ? "left" : "right", borderBottom: "1px solid #e5e7eb", padding: "6px", fontSize: 9, verticalAlign: "top", lineHeight: 1.35 }}>{String(cell)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const PrintReport = memo(PrintReportBase);