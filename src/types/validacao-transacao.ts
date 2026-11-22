import type { ID } from "./common";

/** Métodos previstos para autenticar uma transação de equipamento. */
export type MetodoValidacaoTransacao = "PIN" | "DIGITAL" | "FACIAL";

/** Papel do funcionário na transação que está sendo autenticada. */
export type PapelValidacaoTransacao = "ORIGEM" | "DESTINO";

/** Dados transitórios usados somente durante a validação. Nunca persistir o PIN. */
export interface ValidacaoTransacaoEntrada {
  metodo: "PIN";
  funcionario_id: ID;
  papel: PapelValidacaoTransacao;
  pin: string;
}

/** Registro seguro anexado ao histórico da movimentação. */
export interface ValidacaoTransacaoRegistro {
  metodo: MetodoValidacaoTransacao;
  funcionario_id: ID;
  papel: PapelValidacaoTransacao;
  validado_em: string;
}

export interface MetodoValidacaoDisponivel {
  id: MetodoValidacaoTransacao;
  nome: string;
  disponivel: boolean;
  descricao: string;
}
