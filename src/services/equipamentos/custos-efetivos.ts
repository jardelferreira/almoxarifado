import { getDB } from "@/db/db";
import {
  resolverCustoRecorrenteUnitario,
} from "@/services/equipamentos/custos";
import type {
  CustoEfetivoComponente,
  PeriodoCustoEquipamento,
  ResumoCustoEfetivoEquipamento,
  ResumoCustoEfetivoEquipamentoAgregado,
  Equipamento,
  EstoqueEquipamento,
  MovimentacaoEquipamento,
} from "@/types";

function normalizarDia(valor: string): string {
  return valor.slice(0, 10);
}

function validarPeriodo(periodo: PeriodoCustoEquipamento): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodo.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(periodo.fim)) {
    throw new Error("O período de custo deve utilizar o formato AAAA-MM-DD.");
  }

  if (periodo.inicio > periodo.fim) {
    throw new Error("A data final do período não pode ser anterior à data inicial.");
  }
}

function diaUtc(dia: string): number {
  const partes = dia.split("-").map(Number);
  const ano = partes[0] ?? 0;
  const mes = partes[1] ?? 1;
  const diaNumero = partes[2] ?? 1;
  return Date.UTC(ano, mes - 1, diaNumero);
}

function adicionarDias(dia: string, quantidade: number): string {
  return new Date(diaUtc(dia) + quantidade * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function diasEntre(inicio: string, fimExclusivo: string): number {
  return Math.max(0, (diaUtc(fimExclusivo) - diaUtc(inicio)) / 86_400_000);
}

function unidadesRecorrencia(
  inicio: string,
  fimExclusivo: string,
  quantidade: number,
  periodicidade: NonNullable<EstoqueEquipamento["periodicidade_custo"]>,
): number {
  if (quantidade <= 0 || inicio >= fimExclusivo) return 0;

  const dias = diasEntre(inicio, fimExclusivo);

  if (periodicidade === "HORA") return dias * 24 * quantidade;
  if (periodicidade === "DIA") return dias * quantidade;
  if (periodicidade === "SEMANA") return (dias / 7) * quantidade;

  let cursor = inicio;
  let unidades = 0;

  while (cursor < fimExclusivo) {
    const data = new Date(diaUtc(cursor));
    const ano = data.getUTCFullYear();
    const mes = data.getUTCMonth();

    const proximaVirada =
      periodicidade === "MES"
        ? new Date(Date.UTC(ano, mes + 1, 1))
        : new Date(Date.UTC(ano + 1, 0, 1));

    const proximaData = proximaVirada.toISOString().slice(0, 10);
    const fimTrecho = proximaData < fimExclusivo ? proximaData : fimExclusivo;
    const diasTrecho = diasEntre(cursor, fimTrecho);

    const denominador =
      periodicidade === "MES"
        ? diasEntre(
            new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
            proximaData,
          )
        : diasEntre(
            new Date(Date.UTC(ano, 0, 1)).toISOString().slice(0, 10),
            proximaData,
          );

    unidades += (diasTrecho / denominador) * quantidade;
    cursor = fimTrecho;
  }

  return unidades;
}

function deltaQuantidadeAtiva(movimentacao: MovimentacaoEquipamento): number {
  switch (movimentacao.tipo) {
    case "ENTRADA":
    case "REENTRADA":
      return movimentacao.quantidade;
    case "DEVOLUCAO_FORNECEDOR":
    case "BAIXA":
      return -movimentacao.quantidade;
    default:
      return 0;
  }
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(6));
}

function calcularRecorrencia(
  equipamento: Equipamento,
  estoque: EstoqueEquipamento,
  movimentacoes: MovimentacaoEquipamento[],
  periodo: PeriodoCustoEquipamento,
): { valor: number; componente: CustoEfetivoComponente | null } {
  const unitario = resolverCustoRecorrenteUnitario(equipamento, estoque);
  const periodicidade = estoque.periodicidade_custo ?? equipamento.periodicidade_custo;

  if (unitario == null || periodicidade == null || unitario <= 0) {
    return { valor: 0, componente: null };
  }

  const dataEntrada = normalizarDia(estoque.data_entrada);
  const fimExclusivo = adicionarDias(periodo.fim, 1);
  const eventos = [...movimentacoes]
    .filter((movimentacao) => normalizarDia(movimentacao.data) >= dataEntrada)
    .map((movimentacao) => ({
      data: normalizarDia(movimentacao.data),
      delta: deltaQuantidadeAtiva(movimentacao),
      id: movimentacao.id,
    }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

  const possuiEntradaInicial = eventos.some(
    (evento) => evento.data === dataEntrada && evento.delta > 0,
  );

  // Registros novos normalmente possuem uma ENTRADA correspondente à data de entrada.
  // Históricos antigos podem não possuir essa movimentação; nesse caso, data_entrada
  // e quantidade do registro físico formam a linha de base disponível.
  const inicioFisico = dataEntrada;
  const cursorInicial = inicioFisico > periodo.inicio ? inicioFisico : periodo.inicio;
  if (cursorInicial >= fimExclusivo) {
    return { valor: 0, componente: null };
  }

  // Reconstroi a quantidade ativa exatamente no primeiro dia do período.
  let quantidade = possuiEntradaInicial ? 0 : Math.max(0, estoque.quantidade);
  for (const evento of eventos) {
    if (evento.data > cursorInicial) break;
    quantidade = Math.max(0, quantidade + evento.delta);
  }

  let cursor = cursorInicial;
  let unidadesRecorrenciaTotal = 0;

  for (const evento of eventos) {
    if (evento.data <= cursor) continue;
    if (evento.data >= fimExclusivo) break;

    unidadesRecorrenciaTotal += unidadesRecorrencia(
      cursor,
      evento.data,
      Math.max(0, quantidade),
      periodicidade,
    );

    quantidade = Math.max(0, quantidade + evento.delta);
    cursor = evento.data;
  }

  if (cursor < fimExclusivo) {
    unidadesRecorrenciaTotal += unidadesRecorrencia(
      cursor,
      fimExclusivo,
      Math.max(0, quantidade),
      periodicidade,
    );
  }

  const valor = arredondar(
    unitario * unidadesRecorrenciaTotal,
  );

  if (valor <= 0) {
    return { valor: 0, componente: null };
  }

  const componente: CustoEfetivoComponente = {
    id: `recorrencia:${estoque.id}:${periodo.inicio}:${periodo.fim}`,
    origem: "RECORRENCIA",
    referencia_id: estoque.id,
    estoque_equipamento_id: estoque.id,
    data: periodo.fim,
    valor,
    descricao: `Custo recorrente efetivo (${periodicidade})`,
  };

  return { valor, componente };
}

async function obterDadosEstoque(
  projetoId: string,
  estoqueId: string,
): Promise<{ equipamento: Equipamento; estoque: EstoqueEquipamento }> {
  const db = getDB();
  const estoque = await db.estoque_equipamentos.get(estoqueId);

  if (!estoque || estoque.projeto_id !== projetoId) {
    throw new Error("Registro de estoque do equipamento não encontrado neste projeto.");
  }

  const equipamento = await db.equipamentos.get(estoque.equipamento_id);
  if (!equipamento || equipamento.projeto_id !== projetoId) {
    throw new Error("Equipamento do registro de estoque não encontrado neste projeto.");
  }

  return { equipamento, estoque };
}

async function calcularEstoque(
  projetoId: string,
  estoqueId: string,
  periodo: PeriodoCustoEquipamento,
): Promise<ResumoCustoEfetivoEquipamento> {
  validarPeriodo(periodo);

  const db = getDB();
  const { equipamento, estoque } = await obterDadosEstoque(projetoId, estoqueId);

  const [consumos, apropriacoes, movimentos, documentos] = await Promise.all([
    db.consumos_equipamentos.where("estoque_equipamento_id").equals(estoqueId).toArray(),
    db.apropriacoes_financeiras_equipamentos.where("estoque_equipamento_id").equals(estoqueId).toArray(),
    db.movimentacoes_equipamentos.where("estoque_equipamento_id").equals(estoqueId).toArray(),
    db.documentos.where("projeto_id").equals(projetoId).toArray(),
  ]);

  const inicio = periodo.inicio;
  const fim = periodo.fim;

  let custoOperacional = 0;
  let quantidadeConsumida = 0;
  let consumosComCusto = 0;
  let consumosSemCusto = 0;
  const componentes: CustoEfetivoComponente[] = [];

  for (const consumo of consumos) {
    const data = normalizarDia(consumo.data_apropriacao);
    if (data < inicio || data > fim) continue;

    quantidadeConsumida += consumo.quantidade;

    const valor = consumo.custo_total ?? (
      consumo.custo_unitario == null
        ? null
        : arredondar(consumo.custo_unitario * consumo.quantidade)
    );

    if (valor == null) {
      consumosSemCusto += 1;
      continue;
    }

    consumosComCusto += 1;
    custoOperacional += valor;
    componentes.push({
      id: consumo.id,
      origem: "CONSUMO_ESTOQUE",
      referencia_id: consumo.movimentacao_id,
      estoque_equipamento_id: estoqueId,
      data,
      valor,
      descricao: "Consumo de material apropriado ao equipamento",
    });
  }

  let custoManutencao = 0;
  let apropriacoesManutencao = 0;
  let apropriacoesSemManutencao = 0;
  const documentosPorId = new Map(documentos.map((documento) => [documento.id, documento]));

  for (const apropriacao of apropriacoes) {
    const documento = documentosPorId.get(apropriacao.documento_id);
    const data = normalizarDia(documento?.data_entrada ?? documento?.data_emissao ?? apropriacao.criado_em);

    if (data < inicio || data > fim) continue;

    if (apropriacao.valor <= 0) continue;

    custoManutencao += apropriacao.valor;
    apropriacoesManutencao += 1;
    if (!apropriacao.manutencao_id) apropriacoesSemManutencao += 1;

    componentes.push({
      id: apropriacao.id,
      origem: "MANUTENCAO_DOCUMENTO",
      referencia_id: apropriacao.documento_id,
      estoque_equipamento_id: estoqueId,
      data,
      valor: apropriacao.valor,
      descricao: "Apropriação financeira de documento de manutenção",
    });
  }

  const recorrencia = calcularRecorrencia(
    equipamento,
    estoque,
    movimentos,
    periodo,
  );

  if (recorrencia.componente) {
    componentes.push(recorrencia.componente);
  }

  const custoRecorrente = recorrencia.valor;
  const custoTotal = arredondar(custoOperacional + custoManutencao + custoRecorrente);

  return {
    projeto_id: projetoId,
    equipamento_id: equipamento.id,
    estoque_equipamento_id: estoque.id,
    periodo: { ...periodo },
    custo_operacional: arredondar(custoOperacional),
    custo_manutencao: arredondar(custoManutencao),
    custo_recorrente: arredondar(custoRecorrente),
    custo_total: custoTotal,
    quantidade_consumida: arredondar(quantidadeConsumida),
    consumos_com_custo: consumosComCusto,
    consumos_sem_custo: consumosSemCusto,
    apropriacoes_manutencao: apropriacoesManutencao,
    apropriacoes_sem_manutencao: apropriacoesSemManutencao,
    componentes: componentes.sort((a, b) =>
      a.data.localeCompare(b.data) || a.id.localeCompare(b.id),
    ),
  };
}

export const custosEfetivosEquipamentosRepo = {
  async calcularPorEstoque(
    projetoId: string,
    estoqueEquipamentoId: string,
    periodo: PeriodoCustoEquipamento,
  ): Promise<ResumoCustoEfetivoEquipamento> {
    return calcularEstoque(projetoId, estoqueEquipamentoId, periodo);
  },

  async calcularPorEquipamento(
    projetoId: string,
    equipamentoId: string,
    periodo: PeriodoCustoEquipamento,
  ): Promise<ResumoCustoEfetivoEquipamentoAgregado> {
    validarPeriodo(periodo);

    const estoques = await getDB().estoque_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .filter((estoque) => estoque.equipamento_id === equipamentoId)
      .toArray();

    if (estoques.length === 0) {
      throw new Error("O equipamento não possui registros físicos neste projeto.");
    }

    const resumos = await Promise.all(
      estoques.map((estoque) => calcularEstoque(projetoId, estoque.id, periodo)),
    );

    return {
      projeto_id: projetoId,
      equipamento_id: equipamentoId,
      periodo: { ...periodo },
      custo_operacional: arredondar(resumos.reduce((total, item) => total + item.custo_operacional, 0)),
      custo_manutencao: arredondar(resumos.reduce((total, item) => total + item.custo_manutencao, 0)),
      custo_recorrente: arredondar(resumos.reduce((total, item) => total + item.custo_recorrente, 0)),
      custo_total: arredondar(resumos.reduce((total, item) => total + item.custo_total, 0)),
      quantidade_consumida: arredondar(resumos.reduce((total, item) => total + item.quantidade_consumida, 0)),
      consumos_com_custo: resumos.reduce((total, item) => total + item.consumos_com_custo, 0),
      consumos_sem_custo: resumos.reduce((total, item) => total + item.consumos_sem_custo, 0),
      apropriacoes_manutencao: resumos.reduce((total, item) => total + item.apropriacoes_manutencao, 0),
      apropriacoes_sem_manutencao: resumos.reduce((total, item) => total + item.apropriacoes_sem_manutencao, 0),
      estoques: resumos,
      componentes: resumos.flatMap((item) => item.componentes),
    };
  },

  async calcularPorProjeto(
    projetoId: string,
    periodo: PeriodoCustoEquipamento,
  ): Promise<ResumoCustoEfetivoEquipamentoAgregado[]> {
    validarPeriodo(periodo);

    const equipamentos = await getDB().equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();

    const resultados: ResumoCustoEfetivoEquipamentoAgregado[] = [];

    for (const equipamento of equipamentos) {
      const estoques = await getDB().estoque_equipamentos
        .where("projeto_id")
        .equals(projetoId)
        .filter((estoque) => estoque.equipamento_id === equipamento.id)
        .count();

      if (estoques === 0) continue;

      resultados.push(
        await this.calcularPorEquipamento(projetoId, equipamento.id, periodo),
      );
    }

    return resultados.sort((a, b) => b.custo_total - a.custo_total);
  },
};
