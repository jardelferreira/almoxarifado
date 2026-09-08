import type { ID } from "./common";

export type EmpresaTipo = "PROPRIA" | "TERCEIRA" | "FORNECEDOR";

/** Empresa pertence ao contexto de um projeto. */
export interface Empresa {
  id: ID;
  projeto_id: ID;
  nome: string;
  tipo: EmpresaTipo;
  ativo: boolean;
}
