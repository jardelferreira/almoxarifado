import type {
  EquipamentoPeriodicidadeCusto,
  EquipamentoTipoControle,
} from "./equipamento";
import type { ID } from "./common";
import type {
  RegraConsumoEquipamentoDirecionador,
  RegraConsumoEquipamentoPeriodicidade,
} from "./regra-consumo-equipamento";

export type SimulacaoPeriodicidadeRecorrencia = EquipamentoPeriodicidadeCusto | null;

export interface SimulacaoCustoEquipamentoEntrada {
  equipamento_id: ID;
  quantidade: number;
  uso_previsto: number;
  direcionador: RegraConsumoEquipamentoDirecionador;
  manutencao_ocorrencias_por_unidade: number;
  manutencao_valor_por_ocorrencia: number;
  custo_recorrente_unitario_override: number | null;
  periodicidade_recorrente_override: SimulacaoPeriodicidadeRecorrencia;
}

export interface SimulacaoCustoProdutoLinha {
  produto_id: ID;
  nome: string;
  unidade_consumo_sigla: string;
  unidade_base_sigla: string;
  fator: number;
  direcionador: RegraConsumoEquipamentoDirecionador;
  periodicidade_regra: RegraConsumoEquipamentoPeriodicidade | null;
  quantidade_prevista: number;
  custo_unitario_sugerido: number | null;
  custo_unitario_aplicado: number | null;
  custo_total: number;
  fonte_custo: "HISTORICO" | "MANUAL" | "SEM_CUSTO";
  dias_ativos: number;
  multiplicador_periodicidade: number | null;
  formula_memoria: string;
  fonte_historico?: {
    documento_id: ID;
    documento_numero: string;
    documento_tipo: string;
    data: string | null;
    valor_unitario: number;
  };
}

export interface SimulacaoCustoEquipamentoResultado {
  equipamento_id: ID;
  nome: string;
  modelo: string | null;
  tipo_controle: EquipamentoTipoControle;
  quantidade: number;
  uso_previsto: number;
  direcionador: RegraConsumoEquipamentoDirecionador;
  custo_operacional: number;
  custo_manutencao: number;
  manutencao_ocorrencias_previstas: number;
  custo_recorrente: number;
  investimento_aquisicao: number;
  depreciacao_projetada: number;
  dias_periodo: number;
  unidades_recorrencia_calculadas: number;
  valor_referencia_unitario: number | null;
  vida_util_meses: number | null;
  meses_depreciacao_calculados: number;
  formula_depreciacao: string | null;
  custo_total: number;
  periodicidade_recorrente: SimulacaoPeriodicidadeRecorrencia;
  custo_recorrente_unitario: number | null;
  regras_aplicadas: number;
  regras_ignoradas: number;
  regras_ignoradas_detalhes: Array<{ produto_id: ID; produto_nome: string; direcionador: RegraConsumoEquipamentoDirecionador }>;
  produtos_sem_custo: number;
  produtos: SimulacaoCustoProdutoLinha[];
}

export interface SimulacaoCustoEquipamentoResumo {
  projeto_id: ID;
  periodo: { inicio: string; fim: string };
  dias_periodo: number;
  equipamentos: SimulacaoCustoEquipamentoResultado[];
  custo_operacional: number;
  custo_manutencao: number;
  manutencao_ocorrencias_previstas: number;
  custo_recorrente: number;
  investimento_aquisicao: number;
  depreciacao_projetada: number;
  custo_total: number;
  produtos_sem_custo: number;
  regras_sem_aderencia: number;
  dados_base_historicos: boolean;
}
