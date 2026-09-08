import type { ID } from "./common";

export type FuncionarioStatus = "ATIVO" | "INATIVO";

/** Funcionário pertence ao contexto de um projeto. */
export interface Funcionario {
  id: ID;
  projeto_id: ID;
  matricula?: string | null | undefined;
  nome: string;
  funcao?: string | null | undefined;
  encarregado_id?: ID | null | undefined;
  empresa_id?: ID | null | undefined;
  status: FuncionarioStatus;
  /** Equipe que deve assumir por padrão os lançamentos deste funcionário. */
  equipe_raiz_id?: ID | null | undefined;
}
