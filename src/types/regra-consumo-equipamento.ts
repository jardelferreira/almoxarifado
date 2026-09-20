import type { ID } from "./common";

export type RegraConsumoEquipamentoDirecionador =
  | "HORA"
  | "DIA"
  | "CICLO"
  | "KM"
  | "PRODUCAO"
  | "USO_MANUAL"
  | "PERIODO";

export type RegraConsumoEquipamentoPeriodicidade =
  | "HORA"
  | "DIA"
  | "SEMANA"
  | "MES"
  | "ANO";

export type RegraConsumoEquipamentoOrigem = "MANUAL";

/**
 * Regra parametrizada que relaciona um equipamento a um produto consumível.
 *
 * Sem `estoque_equipamento_id`, a regra é padrão do cadastro do equipamento.
 * Com `estoque_equipamento_id`, a regra é um override da unidade/lote físico.
 */
export interface RegraConsumoEquipamento {
  id: ID;
  projeto_id: ID;
  equipamento_id: ID;
  estoque_equipamento_id: ID | null;
  produto_id: ID;
  fator: number;
  unidade_base_id: ID;
  unidade_consumo_id: ID;
  direcionador: RegraConsumoEquipamentoDirecionador;
  periodicidade: RegraConsumoEquipamentoPeriodicidade | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  origem: RegraConsumoEquipamentoOrigem;
  observacao: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}
