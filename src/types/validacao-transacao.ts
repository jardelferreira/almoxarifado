import type { ID } from "./common";

/** Métodos previstos para autenticar uma transação de equipamento. */
export type MetodoValidacaoTransacao = "PIN" | "DIGITAL" | "FACIAL";

/** Papel do funcionário na transação que está sendo autenticada. */
export type PapelValidacaoTransacao = "ORIGEM" | "DESTINO";

/** Dados transitórios usados somente durante a validação. Nunca persistir o PIN. */
export interface ValidacaoTransacaoPinEntrada {
  metodo: "PIN";
  funcionario_id: ID;
  papel: PapelValidacaoTransacao;
  pin: string;
}

/** Resultado transitório da Face API; a imagem nunca é persistida no PWA. */
export interface ValidacaoTransacaoFacialEntrada {
  metodo: "FACIAL";
  funcionario_id: ID;
  papel: PapelValidacaoTransacao;
  face_verificacao: {
    subjectId: string;
    httpStatus: number;
    captureValid: boolean;
    verificationReceived: boolean;
    revisaoOperador: boolean;
  };
}

export type ValidacaoTransacaoEntrada =
  | ValidacaoTransacaoPinEntrada
  | ValidacaoTransacaoFacialEntrada;

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
