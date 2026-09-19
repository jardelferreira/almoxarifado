import type { ID } from "./common";

export type InteligenciaOrigem = "VIGIA" | "INVENTARIO" | "PERFIL_PRODUTO";
export type InteligenciaStatus = "EM_ANDAMENTO" | "CONCLUIDA" | "DESCARTADA";
export type InteligenciaResultado = "CONFIRMADO" | "NAO_CONFIRMADO" | "PARCIAL" | "SEM_RESULTADO";
export type InteligenciaPrioridade = "alta" | "media" | "info";

export interface InteligenciaAcao {
  id: ID;
  projeto_id: ID;
  chave: string;
  assinatura: string;
  origem: InteligenciaOrigem;
  tipo: string;
  prioridade: InteligenciaPrioridade;
  titulo: string;
  descricao: string;
  regra?: string | null;
  produto_id?: ID | null;
  equipe_id?: ID | null;
  referencia_id?: ID | null;
  status: InteligenciaStatus;
  resultado?: InteligenciaResultado | null;
  observacao?: string | null;
  registrada_em: string;
  iniciada_em: string;
  concluida_em?: string | null;
  atualizado_em: string;
}
