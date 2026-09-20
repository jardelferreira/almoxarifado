import type { ID } from "./common";

/** Vínculo documental da ocorrência técnica de manutenção. */
export interface ManutencaoDocumento {
  id: ID;
  projeto_id: ID;
  manutencao_id: ID;
  documento_id: ID;
  observacao: string | null;
  criado_em: string;
}

export type ApropriacaoFinanceiraEquipamentoTipo = "MANUTENCAO";

/**
 * Rateio financeiro rastreável de um documento para um equipamento.
 *
 * O item do documento e a ocorrência de manutenção são opcionais porque
 * nem todo documento possui itens detalhados e uma apropriação pode existir
 * como custo do equipamento mesmo sem ocorrência vinculada.
 */
export interface ApropriacaoFinanceiraEquipamento {
  id: ID;
  projeto_id: ID;
  tipo: ApropriacaoFinanceiraEquipamentoTipo;
  documento_id: ID;
  documento_item_id: ID | null;
  manutencao_id: ID | null;
  estoque_equipamento_id: ID;
  equipamento_id: ID;
  valor: number;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}
