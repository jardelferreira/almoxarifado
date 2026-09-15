import type { ID } from "./common";

export type DocumentoTipo =
  | "NOTA_FISCAL"
  | "ROMANEIO"
  | "PEDIDO"
  | "DOCUMENTO_INTERNO";

export type DocumentoStatus =
  | "PENDENTE"
  | "PARCIAL"
  | "CONCLUIDO"
  | "CANCELADO";

export interface Documento {
  id: ID;
  projeto_id: ID;
  tipo: DocumentoTipo;
  numero: string;
  serie?: string | null;
  data_emissao?: string | null;
  data_entrada?: string | null;
  empresa_id?: ID | null;
  status: DocumentoStatus;
  valor_total?: number | null;
  observacao?: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface DocumentoItem {
  id: ID;
  documento_id: ID;
  produto_id?: ID | null;
  descricao: string;
  quantidade: number;
  valor_unitario?: number | null;
  valor_total?: number | null;
}

export type DocumentoReferenciaTipo = "REFERENCIA";

export interface DocumentoReferencia {
  id: ID;
  projeto_id: ID;
  documento_id: ID;
  documento_referenciado_id: ID;
  tipo_relacao: DocumentoReferenciaTipo;
  observacao?: string | null;
  criado_em: string;
}

/**
 * Abreviação usada na identificação visual dos documentos.
 *
 * A abreviação é calculada e não precisa ser persistida no banco.
 */
export function getDocumentoTipoAbreviado(tipo: DocumentoTipo): string {
  switch (tipo) {
    case "NOTA_FISCAL":
      return "NF";
    case "ROMANEIO":
      return "RMN";
    case "PEDIDO":
      return "PED";
    case "DOCUMENTO_INTERNO":
      return "DOC";
  }
}

export function getDocumentoTipoLabel(tipo: DocumentoTipo): string {
  switch (tipo) {
    case "NOTA_FISCAL":
      return "Nota Fiscal";
    case "ROMANEIO":
      return "Romaneio";
    case "PEDIDO":
      return "Pedido";
    case "DOCUMENTO_INTERNO":
      return "Documento interno";
  }
}

export function getDocumentoStatusLabel(status: DocumentoStatus): string {
  switch (status) {
    case "PENDENTE":
      return "Pendente";
    case "PARCIAL":
      return "Parcial";
    case "CONCLUIDO":
      return "Concluído";
    case "CANCELADO":
      return "Cancelado";
  }
}

export function formatarDocumentoIdentificador(
  documento: Pick<Documento, "tipo" | "numero">,
  nomeEmpresa?: string | null,
): string {
  const prefixo = getDocumentoTipoAbreviado(documento.tipo);
  const numero = documento.numero.trim() || "SEM-NUMERO";
  const empresa = nomeEmpresa
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 12)
    .toUpperCase();

  return empresa ? `${prefixo}-${numero}-${empresa}` : `${prefixo}-${numero}`;
}
