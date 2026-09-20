import type { ID } from "./common";

export type ManutencaoEquipamentoTipo =
  | "CORRETIVA"
  | "PREVENTIVA"
  | "INSPECAO"
  | "OUTRA";

/** Estado operacional derivado do ciclo de movimentações. */
export type ManutencaoEquipamentoStatusOperacional =
  | "AGUARDANDO_ENVIO"
  | "EM_MANUTENCAO"
  | "CONCLUIDA"
  | "CANCELADA";

/** Nível opcional de preenchimento gerencial da ocorrência. */
export type ManutencaoEquipamentoStatusDetalhamento =
  | "NAO_DETALHADA"
  | "PARCIALMENTE_DETALHADA"
  | "DETALHADA";

export type ManutencaoEquipamentoOrigem =
  | "AUTOMATICA"
  | "MANUAL"
  | "RETROATIVA";

export interface ManutencaoEquipamento {
  id: ID;
  projeto_id: ID;
  estoque_equipamento_id: ID;
  equipamento_id: ID;
  quantidade: number;
  origem: ManutencaoEquipamentoOrigem;
  tipo: ManutencaoEquipamentoTipo;
  status_operacional: ManutencaoEquipamentoStatusOperacional;
  status_detalhamento: ManutencaoEquipamentoStatusDetalhamento;
  motivo: string;
  descricao_servico?: string | null;
  empresa_id?: ID | null;
  data_abertura: string;
  data_envio?: string | null;
  data_previsao_retorno?: string | null;
  data_retorno?: string | null;
  data_conclusao?: string | null;
  movimento_sinalizacao_id?: ID | null;
  movimento_envio_id?: ID | null;
  movimento_retorno_id?: ID | null;
  resultado?: string | null;
  observacoes?: string | null;
  criado_em: string;
  atualizado_em: string;
}

export function manutencaoEquipamentoTipoLabel(tipo: ManutencaoEquipamentoTipo): string {
  switch (tipo) {
    case "CORRETIVA": return "Corretiva";
    case "PREVENTIVA": return "Preventiva";
    case "INSPECAO": return "Inspeção";
    case "OUTRA": return "Outra";
  }
}

export function manutencaoEquipamentoStatusLabel(status: ManutencaoEquipamentoStatusOperacional): string {
  switch (status) {
    case "AGUARDANDO_ENVIO": return "Aguardando envio";
    case "EM_MANUTENCAO": return "Em manutenção";
    case "CONCLUIDA": return "Concluída";
    case "CANCELADA": return "Cancelada";
  }
}

export function manutencaoEquipamentoDetalhamentoLabel(status: ManutencaoEquipamentoStatusDetalhamento): string {
  switch (status) {
    case "NAO_DETALHADA": return "Detalhamento pendente";
    case "PARCIALMENTE_DETALHADA": return "Detalhamento parcial";
    case "DETALHADA": return "Detalhada";
  }
}
