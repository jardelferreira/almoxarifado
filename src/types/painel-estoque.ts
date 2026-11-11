import type { ID } from "./common";

export interface PainelEstoqueItem {
  produtoId: ID;
  produto: string;
  codigo?: string | null;
  categoria?: string | null;
  unidade?: string | null;
  equipe: string;
  quantidade: number;
  minimo: number;
  status: "DISPONIVEL" | "BAIXO" | "ZERADO";
}

export interface PainelEstoqueDados {
  formato: "ALMOXARIFADO_PAINEL_ESTOQUE";
  versao: 1;
  projeto_id: ID;
  projeto_nome: string;
  atualizado_em: string;
  itens: PainelEstoqueItem[];
}
