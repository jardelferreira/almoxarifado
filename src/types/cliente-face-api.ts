import type { ID } from "./common";

/** Client facial único vinculado ao projeto local. A chave só é exibida pela API na criação/rotação. */
export interface ClienteFaceApi {
  id: ID;
  projeto_id: ID;
  client_id: string;
  display_name: string;
  api_key: string;
  scopes: string[];
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}
