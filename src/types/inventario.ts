import type { ID } from "./common";

export type InventarioStatus = "ABERTO" | "CONCLUIDO" | "CANCELADO";

export type InventarioEventoTipo =
  | "ABERTO"
  | "PARTICIPANTE_ADICIONADO"
  | "ITEM_BLOQUEADO"
  | "ITEM_LIBERADO"
  | "CONTAGEM_REGISTRADA"
  | "OBSERVACAO_ATUALIZADA"
  | "ENCERRADO"
  | "CANCELADO";

export interface InventarioParticipante {
  funcionario_id: ID;
  adicionado_em: string;
  adicionado_por_id?: ID | null;
  ultimo_acesso_em?: string | null;
}

export interface InventarioEvento {
  id: ID;
  tipo: InventarioEventoTipo;
  em: string;
  funcionario_id?: ID | null;
  item_id?: ID | null;
  dispositivo_id?: string | null;
  detalhe?: string | null;
}

export interface Inventario {
  id: ID;
  projeto_id: ID;
  equipe_id?: ID | null;
  status: InventarioStatus;
  data_abertura: string;
  data_encerramento?: string | null;
  responsavel_id?: ID | null;
  observacao?: string | null;
  participantes?: InventarioParticipante[];
  eventos?: InventarioEvento[];
  versao?: number;
  criado_em: string;
  atualizado_em: string;
}

export interface InventarioItem {
  id: ID;
  inventario_id: ID;
  produto_id: ID;
  equipe_id: ID;
  quantidade_sistema: number;
  quantidade_contada?: number | null;
  observacao?: string | null;
  bloqueado_por_id?: ID | null;
  bloqueado_em?: string | null;
  bloqueio_expira_em?: string | null;
  conferido_por_id?: ID | null;
  conferido_em?: string | null;
  versao?: number;
  criado_em: string;
  atualizado_em: string;
}

export function diferencaInventario(item: Pick<InventarioItem, "quantidade_sistema" | "quantidade_contada">): number | null {
  if (item.quantidade_contada == null) return null;
  return item.quantidade_contada - item.quantidade_sistema;
}

export function statusInventarioLabel(status: InventarioStatus): string {
  switch (status) {
    case "ABERTO": return "Aberto";
    case "CONCLUIDO": return "Concluído";
    case "CANCELADO": return "Cancelado";
  }
}
