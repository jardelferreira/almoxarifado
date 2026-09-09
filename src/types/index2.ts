export type ID = string;

export type ProjetoStatus = "ATIVO" | "PAUSADO" | "ENCERRADO";
export type EmpresaTipo = "PROPRIA" | "TERCEIRA" | "FORNECEDOR";
export type FuncionarioStatus = "ATIVO" | "INATIVO";
export type MovimentacaoTipo =
  | "ENTRADA"
  | "SAIDA"
  | "DEVOLUCAO"
  | "AJUSTE"
  | "TRANSFERENCIA";

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

export interface Categoria {
  id: ID;
  nome: string;
  ativo: boolean;
  categoria_id?: Categoria;
}

export interface CategoriaEquipamento {
  id: ID;
  nome: string;
  ativo: boolean;
}

export interface Unidade {
  id: ID;
  sigla: string;
  descricao: string;
  ativo: boolean;
}

/**
 * Empresa pertence ao contexto de um projeto.
 */
export interface Empresa {
  id: ID;
  projeto_id: ID;
  nome: string;
  tipo: EmpresaTipo;
  ativo: boolean;
}

/**
 * Funcionário pertence ao contexto de um projeto.
 */
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

/**
 * Local pertence ao contexto de um projeto.
 */
export interface Local {
  id: ID;
  projeto_id: ID;
  codigo?: string | null | undefined;
  nome: string;
  local_pai_id?: ID | null | undefined;
  ativo: boolean;
}

/**
 * Produto pertence ao contexto de um projeto.
 */
export interface Produto {
  id: ID;
  projeto_id: ID;
  codigo?: string | null | undefined;
  nome: string;
  descricao?: string | null | undefined;
  categoria_id?: ID | null | undefined;
  unidade_id?: ID | null | undefined;
  marca?: string | null | undefined;
  modelo?: string | null | undefined;
  estoque_minimo: number;
  ativo: boolean;
}

export interface Movimentacao {
  id: ID;
  projeto_id: ID;
  data: string;
  tipo: MovimentacaoTipo;
  produto_id: ID;
  quantidade: number;
  sinal?: (1 | -1) | undefined;
  funcionario_id?: ID | null | undefined;
  encarregado_id?: ID | null | undefined;
  empresa_id?: ID | null | undefined;
  local_id?: ID | null | undefined;
  local_destino_id?: ID | null | undefined;
  movimentacao_origem_id?: ID | null | undefined;
  observacao?: string | null | undefined;

  /** Toda movimentação pertence ao estoque de uma equipe. */
  equipe_id: ID;
}

/**
 * Equipe pertence ao contexto de um projeto.
 */
export interface Equipe {
  id: ID;
  projeto_id: ID;
  nome: string;
  descricao?: string | null | undefined;
  ativo: boolean;

  /** Mantido para compatibilidade: todo estoque novo é segregado por equipe. */
  estoque_segregado: boolean;
}

export interface EquipeMembro {
  id: ID;
  equipe_id: ID;
  funcionario_id: ID;
}

export interface EstoqueItem {
  id: string;
  produto: Produto;
  equipe: Equipe;
  unidade?: Unidade | undefined;
  categoria?: Categoria | undefined;
  estoque: number;
  minimo: number;
  baixo: boolean;
}

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

export type EquipamentoTipoControle = "INDIVIDUAL" | "QUANTITATIVO";
export type EquipamentoVinculo = "PROPRIO" | "ALUGADO" | "EMPRESTIMO";
export type EquipamentoStatus = "ATIVO" | "ENCERRADO";

/**
 * Categoria exclusiva para equipamentos.
 * Pertence ao projeto e não altera a categoria existente de produtos.
 */
export interface CategoriaEquipamento {
  id: ID;
  projeto_id: ID;
  nome: string;
  ativo: boolean;
}

/**
 * Cadastro do equipamento/modelo controlável.
 * Representa o "que é" o equipamento, e não uma unidade física específica.
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
 * Registro do equipamento que efetivamente pertence ao estoque do projeto.
 * Recebe as informações adicionais da unidade/lote físico.
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
  status: EquipamentoStatus;

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