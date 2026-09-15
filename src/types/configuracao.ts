import { DocumentoTipo } from "./documento";
export type ConfiguracaoModulos = {
  materiais: boolean;
  equipamentos: boolean;
  documentos: boolean;
};

export type ConfiguracaoDocumentos = {
  habilitado: boolean;
  exigir_na_entrada: boolean;
  exigir_na_saida: boolean;
  exigir_na_transferencia: boolean;
  exigir_na_devolucao: boolean;
  exigir_no_ajuste: boolean;
  tipos_permitidos: DocumentoTipo[];
  tipo_padrao: DocumentoTipo;
};

export type ConfiguracaoEstoque = {
  permitir_estoque_negativo: boolean;
  permitir_ajustes: boolean;
  exigir_justificativa_ajuste: boolean;
};

export type ConfiguracaoInventario = {
  habilitado: boolean;
  permitir_inventario_parcial: boolean;
  exigir_responsavel: boolean;
  ajustar_automaticamente: boolean;
};

export interface Configuracao {
  id: string;
  projeto_id: string;
  modulos: ConfiguracaoModulos;
  documentos: ConfiguracaoDocumentos;
  estoque: ConfiguracaoEstoque;
  inventario: ConfiguracaoInventario;
  casas_decimais: number;
  criado_em: string;
  atualizado_em: string;
}

export function criarConfiguracaoPadrao(
  projetoId: string,
  criadoEm = new Date().toISOString(),
): Configuracao {
  return {
    id: crypto.randomUUID(),
    projeto_id: projetoId,
    modulos: {
      materiais: true,
      equipamentos: true,
      documentos: false,
    },
    documentos: {
      habilitado: false,
      exigir_na_entrada: false,
      exigir_na_saida: false,
      exigir_na_transferencia: false,
      exigir_na_devolucao: false,
      exigir_no_ajuste: false,
      tipos_permitidos: ["NOTA_FISCAL", "ROMANEIO", "PEDIDO", "DOCUMENTO_INTERNO"],
      tipo_padrao: "NOTA_FISCAL",
    },
    estoque: {
      permitir_estoque_negativo: false,
      permitir_ajustes: true,
      exigir_justificativa_ajuste: true,
    },
    inventario: {
      habilitado: true,
      permitir_inventario_parcial: true,
      exigir_responsavel: false,
      ajustar_automaticamente: false,
    },
    casas_decimais: 2,
    criado_em: criadoEm,
    atualizado_em: criadoEm,
  };
}
