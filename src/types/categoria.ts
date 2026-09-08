import type { ID } from "./common";

export interface Categoria {
  id: ID;
  nome: string;
  ativo: boolean;
  categoria_id?: Categoria;
}
