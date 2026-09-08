import type { ID } from "./common";

export interface Arquivo {
  id: string;
  projeto_id: string;
  nome: string;
  nome_original: string;
  chave_r2: string;
  tipo: string;
  mime_type: string;
  tamanho: number;
  criado_em: string;
}
