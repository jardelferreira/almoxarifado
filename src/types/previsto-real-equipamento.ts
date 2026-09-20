import type { ID } from "./common";
import type { RegraConsumoEquipamentoDirecionador } from "./regra-consumo-equipamento";
import type { SimulacaoCustoEquipamentoResumo } from "./simulacao-custo-equipamento";

export type DesvioCausa =
  | "UTILIZACAO"
  | "CONSUMO"
  | "PRECO"
  | "MANUTENCAO"
  | "RECORRENCIA"
  | "DADOS_AUSENTES";

export interface ComparacaoValor {
  previsto: number;
  real: number;
  diferenca: number;
  percentual: number | null;
}

export interface ComparacaoUso {
  direcionador: RegraConsumoEquipamentoDirecionador;
  previsto: number;
  real: number | null;
  unidade: string;
  comparavel: boolean;
  observacao: string | null;
}

export interface ComparacaoProduto {
  produto_id: ID;
  nome: string;
  quantidade_prevista: number;
  quantidade_real: number;
  quantidade_diferenca: number;
  custo_previsto: number;
  custo_real: number;
  custo_diferenca: number;
  custo_percentual: number | null;
}

export interface DesvioCausaDetalhe {
  causa: DesvioCausa;
  intensidade: number;
  descricao: string;
}

export interface PrevistoRealEquipamento {
  equipamento_id: ID;
  nome: string;
  modelo: string | null;
  quantidade: number;
  uso: ComparacaoUso;
  consumo: ComparacaoValor;
  manutencao: ComparacaoValor;
  recorrencia: ComparacaoValor;
  operacional: ComparacaoValor;
  total: ComparacaoValor;
  produtos: ComparacaoProduto[];
  manutencoes_previstas: number;
  manutencoes_reais: number;
  causas: DesvioCausaDetalhe[];
  qualidade: string[];
}

export interface PrevistoRealResumo {
  projeto_id: ID;
  periodo: { inicio: string; fim: string };
  perfil_id: ID;
  perfil_nome: string;
  perfil_versao: number;
  previsto: {
    operacao: number;
    manutencao: number;
    recorrencia: number;
    total: number;
  };
  real: {
    operacao: number;
    manutencao: number;
    recorrencia: number;
    total: number;
  };
  total: ComparacaoValor;
  equipamentos: PrevistoRealEquipamento[];
  causas: DesvioCausaDetalhe[];
  qualidade: string[];
  simulacao: SimulacaoCustoEquipamentoResumo;
}
