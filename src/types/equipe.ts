import type { ID } from "./common";
import type { Categoria } from "./categoria";
import type { Produto } from "./produto";
import type { Unidade } from "./unidade";

/** Equipe pertence ao contexto de um projeto. */
export interface Equipe {
  id: ID;
  projeto_id: ID;
  nome: string;
  descricao?: string | null | undefined;
  ativo: boolean;

  /** Mantido para compatibilidade: todo estoque novo é segregado por equipe. */
  estoque_segregado: boolean;
}

export interface EquipeMembro {
  id: ID;
  equipe_id: ID;
  funcionario_id: ID;
}

export interface EstoqueItem {
  id: string;
  produto: Produto;
  equipe: Equipe;
  unidade?: Unidade | undefined;
  categoria?: Categoria | undefined;
  estoque: number;
  minimo: number;
  baixo: boolean;
}
