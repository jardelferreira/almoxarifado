import type { ID } from "./common";

/** Local pertence ao contexto de um projeto. */
export interface Local {
  id: ID;
  projeto_id: ID;
  codigo?: string | null | undefined;
  nome: string;
  local_pai_id?: ID | null | undefined;
  ativo: boolean;
}
