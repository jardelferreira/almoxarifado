import type { ID } from "./common";
import type { ConsumoEquipamento } from "./consumo-equipamento";

export type MovimentacaoTipo =
  | "ENTRADA"
  | "SAIDA"
  | "DEVOLUCAO"
  | "AJUSTE"
  | "TRANSFERENCIA";

/**
 * Rastro de como uma DEVOLUÇÃO reduziu o consumo apropriado a equipamentos.
 * Guardado na própria devolução para que a exclusão/edição dela possa
 * restaurar o consumo exatamente como era.
 */
export interface ReducaoConsumoDevolucao {
  consumo_id: ID;
  quantidade_reduzida: number;
  /** A apropriação chegou a zero e foi removida (o snapshot permite recriá-la). */
  removido: boolean;
  /** Estado da apropriação imediatamente antes desta redução. */
  snapshot: ConsumoEquipamento;
}

export interface Movimentacao {
  id: ID;
  projeto_id: ID;
  data: string;
  tipo: MovimentacaoTipo;
  produto_id: ID;
  quantidade: number;
  sinal?: (1 | -1) | undefined;
  funcionario_id?: ID | null | undefined;
  encarregado_id?: ID | null | undefined;
  empresa_id?: ID | null | undefined;
  local_id?: ID | null | undefined;
  local_destino_id?: ID | null | undefined;
  movimentacao_origem_id?: ID | null | undefined;
  observacao?: string | null | undefined;

  /** Toda movimentação pertence ao estoque de uma equipe. */
  equipe_id: ID;

  /** Documento que contextualiza a movimentação, quando houver. */
  documento_id?: ID | null | undefined;

  /** Item específico do documento que originou a movimentação, quando houver. */
  documento_item_id?: ID | null | undefined;

  /**
   * Instante (ISO) em que o registro foi criado. Serve de desempate para
   * movimentações com a mesma `data`; o `id` é um UUID aleatório e não
   * carrega ordem. Registros antigos não possuem o campo.
   */
  criado_em?: string | undefined;

  /** Somente em DEVOLUÇÃO: como ela reduziu o consumo por equipamento. */
  consumo_reduzido?: ReducaoConsumoDevolucao[] | undefined;
}