import type { ID } from "./common";

export type ConsumoEquipamentoOrigem = "MANUAL";

/**
 * Apropriação física de uma saída de material para um registro de estoque
 * de equipamento. A movimentação de material permanece intacta; este
 * registro é a dimensão analítica que liga o consumo ao equipamento.
 */
export interface ConsumoEquipamento {
  id: ID;
  projeto_id: ID;
  movimentacao_id: ID;
  estoque_equipamento_id: ID;
  equipamento_id: ID;
  quantidade: number;
  unidade_id: ID | null;
  custo_unitario: number | null;
  custo_total: number | null;
  data_apropriacao: string;
  origem: ConsumoEquipamentoOrigem;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}
