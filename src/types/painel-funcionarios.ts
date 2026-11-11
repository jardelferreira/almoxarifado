import type { ID } from "./common";

export interface PainelFuncionarioEquipamento {
  nome: string;
  marca?: string | null;
  modelo?: string | null;
  identificacao: string;
  quantidade: number;
}

export interface PainelFuncionarioMaterial {
  id: ID;
  data: string;
  tipo: "SAIDA" | "DEVOLUCAO" | "OUTRA";
  produto: string;
  codigo?: string | null;
  unidade?: string | null;
  quantidade: number;
  equipe?: string | null;
  local?: string | null;
  observacao?: string | null;
}

export interface PainelFuncionarioDados {
  projeto_id: ID;
  projeto_nome: string;
  funcionario: {
    id: ID;
    nome: string;
    matricula?: string | null;
    funcao?: string | null;
    equipe?: string | null;
  };
  equipamentos: PainelFuncionarioEquipamento[];
  materiais: PainelFuncionarioMaterial[];
  atualizado_em: string;
}

export interface RegistroPublicacaoFuncionario {
  cpf_hash: string;
  pin_hash?: string | null;
  pin_salt?: string | null;
  pin_iteracoes?: number | null;
  protecao: "PIN" | "CPF";
  iv: string;
  dados: string;
}

export interface PublicacaoPainelFuncionarios {
  formato: "ALMOXARIFADO_PAINEL_FUNCIONARIOS";
  versao: 1;
  projeto_id: ID;
  atualizado_em: string;
  funcionarios: RegistroPublicacaoFuncionario[];
}
