import type { Equipamento, EquipamentoVinculo, EstoqueEquipamento } from "@/types";

export type ResumoFinanceiroEquipamento = {
  quantidade: number;
  valor_referencia: number;
  valor_proprio: number;
  valor_alugado: number;
  valor_emprestado: number;
  custo_recorrente: number;
  sem_valor: boolean;
};

function numeroNaoNegativo(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
}

export function resolverValorUnitario(
  equipamento: Pick<Equipamento, "valor_referencia">,
  estoque?: Pick<EstoqueEquipamento, "valor_unitario">,
): number | null {
  return numeroNaoNegativo(estoque?.valor_unitario) ?? numeroNaoNegativo(equipamento.valor_referencia);
}

export function resolverCustoRecorrenteUnitario(
  equipamento: Pick<Equipamento, "custo_recorrente">,
  estoque?: Pick<EstoqueEquipamento, "custo_recorrente_unitario">,
): number | null {
  return numeroNaoNegativo(estoque?.custo_recorrente_unitario) ?? numeroNaoNegativo(equipamento.custo_recorrente);
}

export function calcularValorReferenciaEstoque(
  equipamento: Pick<Equipamento, "valor_referencia">,
  estoque: Pick<EstoqueEquipamento, "quantidade" | "valor_unitario">,
): number {
  const unitario = resolverValorUnitario(equipamento, estoque) ?? 0;
  return unitario * Math.max(0, estoque.quantidade);
}

export function calcularCustoRecorrenteEstoque(
  equipamento: Pick<Equipamento, "custo_recorrente">,
  estoque: Pick<EstoqueEquipamento, "quantidade" | "custo_recorrente_unitario">,
): number {
  const unitario = resolverCustoRecorrenteUnitario(equipamento, estoque) ?? 0;
  return unitario * Math.max(0, estoque.quantidade);
}

export function classificarValorPorVinculo(
  vinculo: EquipamentoVinculo,
  valor: number,
): Pick<ResumoFinanceiroEquipamento, "valor_proprio" | "valor_alugado" | "valor_emprestado"> {
  if (vinculo === "PROPRIO") return { valor_proprio: valor, valor_alugado: 0, valor_emprestado: 0 };
  if (vinculo === "ALUGADO") return { valor_proprio: 0, valor_alugado: valor, valor_emprestado: 0 };
  return { valor_proprio: 0, valor_alugado: 0, valor_emprestado: valor };
}

export function resumirFinanceiroEquipamento(
  equipamento: Equipamento,
  estoques: EstoqueEquipamento[],
): ResumoFinanceiroEquipamento {
  let quantidade = 0;
  let valor_referencia = 0;
  let valor_proprio = 0;
  let valor_alugado = 0;
  let valor_emprestado = 0;
  let custo_recorrente = 0;

  for (const estoque of estoques) {
    if (estoque.ativo === false || estoque.status !== "ATIVO") continue;

    const qtd = Math.max(0, estoque.quantidade - (estoque.devolvido ?? 0) - (estoque.baixado ?? 0));
    if (qtd <= 0) continue;

    quantidade += qtd;
    const valor = calcularValorReferenciaEstoque(equipamento, { ...estoque, quantidade: qtd });
    const recorrente = calcularCustoRecorrenteEstoque(equipamento, { ...estoque, quantidade: qtd });
    valor_referencia += valor;
    custo_recorrente += recorrente;

    const porVinculo = classificarValorPorVinculo(estoque.vinculo, valor);
    valor_proprio += porVinculo.valor_proprio;
    valor_alugado += porVinculo.valor_alugado;
    valor_emprestado += porVinculo.valor_emprestado;
  }

  return { quantidade, valor_referencia, valor_proprio, valor_alugado, valor_emprestado, custo_recorrente, sem_valor: quantidade > 0 && valor_referencia <= 0 };
}
