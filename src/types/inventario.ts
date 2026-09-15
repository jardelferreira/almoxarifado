import type { ID } from "./common";

export type InventarioStatus = "ABERTO" | "CONCLUIDO" | "CANCELADO";

export interface Inventario {
  id: ID;
  projeto_id: ID;
  equipe_id?: ID | null;
  status: InventarioStatus;
  data_abertura: string;
  data_encerramento?: string | null;
  responsavel_id?: ID | null;
  observacao?: string | null;
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
