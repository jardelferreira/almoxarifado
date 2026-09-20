import type { PerfilParametroCusto, PerfilParametroCustoEquipamento, PerfilParametroCustoRegra } from "./perfil-parametro-custo";

export type MesclagemConflitoTipo = "EQUIPAMENTO" | "REGRA";

export interface MesclagemFonte {
  id: string;
  perfil_id: string;
  nome: string;
  versao: number;
  periodo_inicio: string;
  periodo_fim: string;
  projeto_id: string;
}

export interface MesclagemConflito {
  id: string;
  tipo: MesclagemConflitoTipo;
  chave: string;
  equipamento_nome: string;
  produto_nome?: string;
  campo: string;
  descricao: string;
  fontes: Array<{
    perfilId: string;
    perfilNome: string;
    valor: string;
  }>;
}

export interface MesclagemEquipamentoAnalise {
  chave: string;
  nome: string;
  fontes: string[];
  snapshotBase: PerfilParametroCustoEquipamento;
  quantidadeFontes: number;
}

export interface MesclagemRegraAnalise {
  chave: string;
  equipamentoChave: string;
  produtoNome: string;
  fontes: string[];
  regraBase: PerfilParametroCustoRegra;
}

export interface AnaliseMesclagemParametros {
  fontes: MesclagemFonte[];
  equipamentos: MesclagemEquipamentoAnalise[];
  regras: MesclagemRegraAnalise[];
  conflitos: MesclagemConflito[];
  avisos: string[];
}

export interface GerarPerfilMescladoInput {
  nome: string;
  descricao: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  fonte_dados: string | null;
  observacoes: string | null;
  resolucoes: Record<string, string>;
}
