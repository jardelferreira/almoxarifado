import type { ID } from "./common";

export interface PainelInventarioItem {
  id: ID;
  produto_id: ID;
  produto: string;
  codigo?: string | null;
  unidade?: string | null;
  equipe?: string | null;
  quantidade_sistema: number;
  quantidade_contada?: number | null;
  observacao?: string | null;
}

export interface PainelInventarioDados {
  projeto_id: ID;
  projeto_nome: string;
  inventario: {
    id: ID;
    status: "ABERTO" | "CONCLUIDO";
    data_abertura: string;
    observacao?: string | null;
    escopo: string;
  };
  funcionario: { id: ID; nome: string; matricula?: string | null };
  itens: PainelInventarioItem[];
  atualizado_em: string;
}

export interface RegistroPublicacaoInventario {
  inventario_id: ID;
  cpf_hash: string;
  pin_hash: string;
  pin_salt: string;
  pin_iteracoes: number;
  iv: string;
  dados: string;
  atualizado_em: string;
}

export interface AtualizacaoPainelInventario {
  item_id: ID;
  quantidade_contada: number;
  observacao?: string | null;
  cpf_hash: string;
  atualizado_em: string;
}

export interface PublicacaoInventario {
  formato: "ALMOXARIFADO_PAINEL_INVENTARIO";
  versao: 1;
  projeto_id: ID;
  inventario_id: ID;
  atualizado_em: string;
  registros: RegistroPublicacaoInventario[];
}

export interface IndicePainelInventario {
  formato: "ALMOXARIFADO_INDICE_PAINEL_INVENTARIO";
  versao: 1;
  projeto_id: ID;
  cpf_hash: string;
  inventarios: Array<
    Pick<
      RegistroPublicacaoInventario,
      "inventario_id" | "pin_salt" | "pin_iteracoes" | "atualizado_em"
    >
  >;
}
