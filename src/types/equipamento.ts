import type { ID } from "./common";

export type EquipamentoTipoControle = "INDIVIDUAL" | "QUANTITATIVO";
export type EquipamentoVinculo = "PROPRIO" | "ALUGADO" | "EMPRESTIMO";
export type EquipamentoStatus = "ATIVO" | "ENCERRADO";

export interface CategoriaEquipamento {
  id: ID;
  projeto_id: ID;
  nome: string;
  ativo: boolean;
}

/**
 * Cadastro do equipamento/modelo controlável.
 * Representa o catálogo, não uma unidade física específica.
 */
export interface Equipamento {
  id: ID;
  projeto_id: ID;
  categoria_id: ID;
  nome: string;
  tipo_controle: EquipamentoTipoControle;
  modelo?: string | null | undefined;
  marca?: string | null | undefined;
  descricao?: string | null | undefined;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

/**
 * Registro físico que efetivamente pertence ao estoque do projeto.
 *
 * ativo é um bloqueio administrativo independente do status operacional.
 * - ativo = true/undefined: pode participar de novas movimentações, desde
 *   que também tenha saldo e o Equipamento esteja ativo.
 * - ativo = false: permanece no histórico e no cadastro, mas fica bloqueado
 *   para novas movimentações.
 */
export interface EstoqueEquipamento {
  id: ID;
  projeto_id: ID;
  equipamento_id: ID;
  empresa_id: ID;
  vinculo: EquipamentoVinculo;
  equipe_id?: ID | null | undefined;
  patrimonio?: string | null | undefined;
  identificacao?: string | null | undefined;
  serial?: string | null | undefined;
  quantidade: number;
  devolvido: number;
  baixado?: number;
  status: EquipamentoStatus;
  ativo?: boolean;
  data_entrada: string;
  referencia_documento?: string | null | undefined;
  observacoes?: string | null | undefined;
  criado_em: string;
  atualizado_em: string;
}

export interface Apropriacao {
  id: ID;
  estoque_equipamento_id: ID;
  funcionario_id: ID;
  quantidade: number;
  criado_em: string;
  atualizado_em: string;
}

export type MovimentacaoEquipamentoTipo =
  | "ENTRADA"
  | "SAIDA"
  | "DEVOLUCAO"
  | "TRANSFERENCIA"
  | "MANUTENCAO"
  | "RETIRADA_MANUTENCAO"
  | "RETORNO_MANUTENCAO"
  | "DEVOLUCAO_FORNECEDOR"
  | "BAIXA";

export type MovimentacaoEquipamentoParte =
  | "EMPRESA"
  | "EQUIPE"
  | "FUNCIONARIO";

export interface MovimentacaoEquipamento {
  id: ID;
  projeto_id: ID;
  estoque_equipamento_id: ID;
  tipo: MovimentacaoEquipamentoTipo;
  quantidade: number;
  tipo_origem: MovimentacaoEquipamentoParte;
  origem_id: ID;
  tipo_destino: MovimentacaoEquipamentoParte;
  destino_id: ID;
  data: string;
  referencia_documento?: string | null | undefined;
  observacoes?: string | null | undefined;
  criado_em: string;
  atualizado_em: string;
}