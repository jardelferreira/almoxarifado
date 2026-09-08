import type { ID } from "./common";

export type ProjetoStatus = "ATIVO" | "PAUSADO" | "ENCERRADO";

export interface Projeto {
  id: ID;
  codigo: string;
  nome: string;
  empresa_id?: ID | null | undefined;
  status: ProjetoStatus;
  data_inicio?: string | null | undefined;
  data_fim?: string | null | undefined;
  observacao?: string | null | undefined;
}
