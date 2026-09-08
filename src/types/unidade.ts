import type { ID } from "./common";

export interface Unidade {
  id: ID;
  sigla: string;
  descricao: string;
  ativo: boolean;
}
