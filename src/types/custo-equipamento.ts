import type { ID } from "./common";

export type CustoEfetivoOrigem =
  | "CONSUMO_ESTOQUE"
  | "MANUTENCAO_DOCUMENTO"
  | "RECORRENCIA";

export interface PeriodoCustoEquipamento {
  inicio: string;
  fim: string;
}

export interface CustoEfetivoComponente {
  id: string;
  origem: CustoEfetivoOrigem;
  referencia_id: ID;
  estoque_equipamento_id: ID;
  data: string;
  valor: number;
  descricao: string;
}

export interface ResumoCustoEfetivoEquipamento {
  projeto_id: ID;
  equipamento_id: ID;
  estoque_equipamento_id: ID;
  periodo: PeriodoCustoEquipamento;
  custo_operacional: number;
  custo_manutencao: number;
  custo_recorrente: number;
  custo_total: number;
  quantidade_consumida: number;
  consumos_com_custo: number;
  consumos_sem_custo: number;
  apropriacoes_manutencao: number;
  apropriacoes_sem_manutencao: number;
  componentes: CustoEfetivoComponente[];
}

export interface ResumoCustoEfetivoEquipamentoAgregado {
  projeto_id: ID;
  equipamento_id: ID;
  periodo: PeriodoCustoEquipamento;
  custo_operacional: number;
  custo_manutencao: number;
  custo_recorrente: number;
  custo_total: number;
  quantidade_consumida: number;
  consumos_com_custo: number;
  consumos_sem_custo: number;
  apropriacoes_manutencao: number;
  apropriacoes_sem_manutencao: number;
  estoques: ResumoCustoEfetivoEquipamento[];
  componentes: CustoEfetivoComponente[];
}
