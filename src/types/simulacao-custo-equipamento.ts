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
  custo_total: number;
  periodicidade_recorrente: SimulacaoPeriodicidadeRecorrencia;
  custo_recorrente_unitario: number | null;
  regras_aplicadas: number;
  regras_ignoradas: number;
  produtos_sem_custo: number;
  produtos: SimulacaoCustoProdutoLinha[];
}

export interface SimulacaoCustoEquipamentoResumo {
  projeto_id: ID;
  periodo: { inicio: string; fim: string };
  equipamentos: SimulacaoCustoEquipamentoResultado[];
  custo_operacional: number;
  custo_manutencao: number;
  manutencao_ocorrencias_previstas: number;
  custo_recorrente: number;
  custo_total: number;
  produtos_sem_custo: number;
  regras_sem_aderencia: number;
  dados_base_historicos: boolean;
}
