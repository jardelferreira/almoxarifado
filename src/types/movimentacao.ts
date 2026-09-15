import type { ID } from "./common";

export type MovimentacaoTipo =
  | "ENTRADA"
  | "SAIDA"
  | "DEVOLUCAO"
  | "AJUSTE"
  | "TRANSFERENCIA";

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
}
