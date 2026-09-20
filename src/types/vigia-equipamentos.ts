import type { ID } from "./common";

export type VigiaEquipamentoGrupo =
  | "OPERACAO"
  | "MANUTENCAO"
  | "FINANCEIRO"
  | "CONSUMO"
  | "QUALIDADE";

export type VigiaEquipamentoPrioridade = "alta" | "media" | "info";

export type VigiaEquipamentoAcao =
  | "ESTATISTICAS"
  | "EQUIPAMENTOS"
  | "PREVISTO_REAL"
  | "PERFIS";

export interface VigiaEquipamentoAlerta {
  id: string;
  tipo: "EQUIPAMENTO";
  grupo: VigiaEquipamentoGrupo;
  prioridade: VigiaEquipamentoPrioridade;
  titulo: string;
  descricao: string;
  regra: string;
  indicador?: string;
  equipamento_id?: ID;
  equipamento_nome?: string;
  referencia_id?: ID;
  acao_principal: VigiaEquipamentoAcao;
  acao_secundaria?: VigiaEquipamentoAcao;
}

export interface VigiaEquipamentoPerfilBase {
  id: ID;
  nome: string;
  versao: number;
}

export interface VigiaEquipamentosResumo {
  projeto_id: ID;
  periodo: { inicio: string; fim: string };
  alertas: VigiaEquipamentoAlerta[];
  alertasPorGrupo: Record<VigiaEquipamentoGrupo, number>;
  altas: number;
  medias: number;
  informativas: number;
  perfil_base?: VigiaEquipamentoPerfilBase;
  qualidade: string[];
}
