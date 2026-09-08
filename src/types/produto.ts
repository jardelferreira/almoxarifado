import type { ID } from "./common";

/** Produto pertence ao contexto de um projeto. */
export interface Produto {
  id: ID;
  projeto_id: ID;
  codigo?: string | null | undefined;
  nome: string;
  descricao?: string | null | undefined;
  categoria_id?: ID | null | undefined;
  unidade_id?: ID | null | undefined;
  marca?: string | null | undefined;
  modelo?: string | null | undefined;
  estoque_minimo: number;
  ativo: boolean;
}
