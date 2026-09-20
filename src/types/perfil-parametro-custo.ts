import type { ID } from "./common";
import type { EquipamentoTipoControle, EquipamentoPeriodicidadeCusto } from "./equipamento";
import type {
  RegraConsumoEquipamentoDirecionador,
  RegraConsumoEquipamentoPeriodicidade,
} from "./regra-consumo-equipamento";

export const PERFIL_PARAMETRO_CUSTO_FORMATO = "ALMOXARIFADO_PERFIL_PARAMETROS_CUSTOS" as const;
export const PERFIL_PARAMETRO_CUSTO_VERSAO_FORMATO = 1 as const;

export type PerfilParametroCustoOrigem = "MANUAL" | "IMPORTADO" | "DUPLICADO" | "CONSOLIDADO";

export interface PerfilParametroCustoRegra {
  chave_produto: string;
  produto_nome: string;
  produto_codigo: string | null;
  unidade_base_sigla: string;
  unidade_consumo_sigla: string;
  fator: number;
  direcionador: RegraConsumoEquipamentoDirecionador;
  periodicidade: RegraConsumoEquipamentoPeriodicidade | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  observacao: string | null;
  custo_unitario_manual: number | null;
}

export interface PerfilParametroCustoEquipamento {
  chave_equipamento: string;
  nome: string;
  modelo: string | null;
  tipo_controle: EquipamentoTipoControle;
  quantidade: number;
  uso_previsto: number;
  direcionador: RegraConsumoEquipamentoDirecionador;
  manutencao_ocorrencias_por_unidade: number;
  manutencao_valor_por_ocorrencia: number;
  custo_recorrente_unitario_override: number | null;
  periodicidade_recorrente_override: EquipamentoPeriodicidadeCusto | null;
  regras: PerfilParametroCustoRegra[];
}

/**
 * Perfil persistido como uma versão imutável de um conjunto de parâmetros.
 * `perfil_id` identifica a família; `versao` identifica a revisão.
 */
export interface PerfilParametroCusto {
  id: ID;
  perfil_id: ID;
  projeto_id: ID;
  nome: string;
  descricao: string | null;
  versao: number;
  origem: PerfilParametroCustoOrigem;
  periodo_referencia_inicio: string;
  periodo_referencia_fim: string;
  fonte_dados: string | null;
  equipamentos: PerfilParametroCustoEquipamento[];
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type PerfilParametroCustoExportado = Omit<PerfilParametroCusto, "projeto_id">;

export interface PacotePerfisParametroCusto {
  formato: typeof PERFIL_PARAMETRO_CUSTO_FORMATO;
  versao_formato: typeof PERFIL_PARAMETRO_CUSTO_VERSAO_FORMATO;
  exportado_em: string;
  perfis: PerfilParametroCustoExportado[];
}

export interface SalvarPerfilParametroCustoInput {
  nome: string;
  descricao: string | null;
  periodo_referencia_inicio: string;
  periodo_referencia_fim: string;
  fonte_dados: string | null;
  equipamentos: Array<{
    equipamento_id: ID;
    quantidade: number;
    uso_previsto: number;
    direcionador: RegraConsumoEquipamentoDirecionador;
    manutencao_ocorrencias_por_unidade: number;
    manutencao_valor_por_ocorrencia: number;
    custo_recorrente_unitario_override: number | null;
    periodicidade_recorrente_override: EquipamentoPeriodicidadeCusto | null;
  }>;
  precosManuais: Record<string, number | null>;
  observacoes: string | null;
  perfilId?: ID;
  origem?: PerfilParametroCustoOrigem;
}

export interface CarregarPerfilParametroCustoResultado {
  perfil: PerfilParametroCusto;
  equipamentos: Array<{
    equipamento_id: ID;
    quantidade: number;
    uso_previsto: number;
    direcionador: RegraConsumoEquipamentoDirecionador;
    manutencao_ocorrencias_por_unidade: number;
    manutencao_valor_por_ocorrencia: number;
    custo_recorrente_unitario_override: number | null;
    periodicidade_recorrente_override: EquipamentoPeriodicidadeCusto | null;
  }>;
  precosManuais: Record<string, number | null>;
  avisos: string[];
}
