import { getDB, uid } from "@/db/db";
import type {
  ApropriacaoFinanceiraEquipamento,
  ManutencaoDocumento,
} from "@/types";

export interface CriarApropriacaoFinanceiraDados {
  documentoId: string;
  documentoItemId?: string | null;
  manutencaoId?: string | null;
  estoqueEquipamentoId: string;
  valor: number;
  observacao?: string | null;
}

export interface SaldoApropriacaoFinanceira {
  origemTotal: number | null;
  apropriado: number;
  disponivel: number | null;
}

function validarValor(valor: number): void {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error("O valor da apropriação deve ser maior que zero.");
  }
}

function normalizarTexto(valor?: string | null): string | null {
  const texto = valor?.trim();
  return texto ? texto : null;
}

async function obterDocumentoValido(projetoId: string, documentoId: string) {
  const documento = await getDB().documentos.get(documentoId);
  if (!documento || documento.projeto_id !== projetoId) {
    throw new Error("Documento não encontrado neste projeto.");
  }
  if (documento.status === "CANCELADO") {
    throw new Error("Não é possível apropriar um documento cancelado.");
  }
  return documento;
}

async function obterManutencaoValida(projetoId: string, manutencaoId: string) {
  const manutencao = await getDB().manutencoes_equipamentos.get(manutencaoId);
  if (!manutencao || manutencao.projeto_id !== projetoId) {
    throw new Error("Ocorrência de manutenção não encontrada neste projeto.");
  }
  return manutencao;
}

async function obterEstoqueValido(projetoId: string, estoqueEquipamentoId: string) {
  const estoque = await getDB().estoque_equipamentos.get(estoqueEquipamentoId);
  if (!estoque || estoque.projeto_id !== projetoId) {
    throw new Error("Registro físico do equipamento não encontrado neste projeto.");
  }
  return estoque;
}

async function validarDocumentoItem(
  projetoId: string,
  documentoId: string,
  documentoItemId?: string | null,
) {
  if (!documentoItemId) return null;

  const item = await getDB().documento_itens.get(documentoItemId);
  if (!item || item.documento_id !== documentoId) {
    throw new Error("O item informado não pertence ao documento selecionado.");
  }

  const documento = await obterDocumentoValido(projetoId, documentoId);
  return { item, documento };
}

async function calcularLimiteFinanceiro(
  projetoId: string,
  documentoId: string,
  documentoItemId: string | null,
): Promise<SaldoApropriacaoFinanceira> {
  const db = getDB();
  const documento = await obterDocumentoValido(projetoId, documentoId);

  let origemTotal: number | null = documento.valor_total ?? null;

  if (documentoItemId) {
    const item = await db.documento_itens.get(documentoItemId);
    if (!item || item.documento_id !== documentoId) {
      throw new Error("O item do documento não foi encontrado.");
    }
    origemTotal =
      item.valor_total ??
      (item.valor_unitario != null ? item.valor_unitario * item.quantidade : null);
  }

  const apropriacoes = await db.apropriacoes_financeiras_equipamentos
    .where("documento_id")
    .equals(documentoId)
    .toArray();

  const apropriado = apropriacoes
    .filter((item) => item.documento_item_id === documentoItemId)
    .reduce((total, item) => total + item.valor, 0);

  return {
    origemTotal,
    apropriado,
    disponivel: origemTotal == null ? null : Math.max(0, origemTotal - apropriado),
  };
}

export const financeiroDocumentosEquipamentosRepo = {
  async listarDocumentosDaManutencao(
    projetoId: string,
    manutencaoId: string,
  ): Promise<ManutencaoDocumento[]> {
    await obterManutencaoValida(projetoId, manutencaoId);
    return getDB().manutencao_documentos
      .where("manutencao_id")
      .equals(manutencaoId)
      .toArray();
  },

  async vincularDocumentoManutencao(
    projetoId: string,
    manutencaoId: string,
    documentoId: string,
    observacao?: string | null,
  ): Promise<ManutencaoDocumento> {
    await obterManutencaoValida(projetoId, manutencaoId);
    await obterDocumentoValido(projetoId, documentoId);

    const existente = await getDB().manutencao_documentos
      .where("[manutencao_id+documento_id]")
      .equals([manutencaoId, documentoId])
      .first();

    if (existente) return existente;

    const vinculo: ManutencaoDocumento = {
      id: uid(),
      projeto_id: projetoId,
      manutencao_id: manutencaoId,
      documento_id: documentoId,
      observacao: normalizarTexto(observacao),
      criado_em: new Date().toISOString(),
    };

    await getDB().manutencao_documentos.add(vinculo);
    return vinculo;
  },

  async desvincularDocumentoManutencao(
    projetoId: string,
    vinculoId: string,
  ): Promise<void> {
    const vinculo = await getDB().manutencao_documentos.get(vinculoId);
    if (!vinculo || vinculo.projeto_id !== projetoId) {
      throw new Error("Vínculo entre manutenção e documento não encontrado.");
    }
    await getDB().manutencao_documentos.delete(vinculoId);
  },

  async listarApropriacoes(
    projetoId: string,
    filtro?: {
      manutencaoId?: string;
      documentoId?: string;
      estoqueEquipamentoId?: string;
    },
  ): Promise<ApropriacaoFinanceiraEquipamento[]> {
    let rows: ApropriacaoFinanceiraEquipamento[];
    const db = getDB();

    if (filtro?.manutencaoId) {
      rows = await db.apropriacoes_financeiras_equipamentos
        .where("manutencao_id")
        .equals(filtro.manutencaoId)
        .toArray();
    } else if (filtro?.documentoId) {
      rows = await db.apropriacoes_financeiras_equipamentos
        .where("documento_id")
        .equals(filtro.documentoId)
        .toArray();
    } else if (filtro?.estoqueEquipamentoId) {
      rows = await db.apropriacoes_financeiras_equipamentos
        .where("estoque_equipamento_id")
        .equals(filtro.estoqueEquipamentoId)
        .toArray();
    } else {
      rows = await db.apropriacoes_financeiras_equipamentos
        .where("projeto_id")
        .equals(projetoId)
        .toArray();
    }

    return rows.filter((item) => item.projeto_id === projetoId);
  },

  async saldoApropriavel(
    projetoId: string,
    documentoId: string,
    documentoItemId?: string | null,
  ): Promise<SaldoApropriacaoFinanceira> {
    return calcularLimiteFinanceiro(
      projetoId,
      documentoId,
      documentoItemId ?? null,
    );
  },

  async criarApropriacao(
    projetoId: string,
    dados: CriarApropriacaoFinanceiraDados,
  ): Promise<ApropriacaoFinanceiraEquipamento> {
    validarValor(dados.valor);

    const db = getDB();
    const documento = await obterDocumentoValido(projetoId, dados.documentoId);
    const estoque = await obterEstoqueValido(projetoId, dados.estoqueEquipamentoId);
    const itemDocumento = await validarDocumentoItem(
      projetoId,
      documento.id,
      dados.documentoItemId,
    );

    let manutencaoId: string | null = dados.manutencaoId ?? null;
    if (manutencaoId) {
      const manutencao = await obterManutencaoValida(projetoId, manutencaoId);
      if (manutencao.estoque_equipamento_id !== estoque.id) {
        throw new Error("A ocorrência de manutenção não pertence ao registro físico informado.");
      }
    }

    if (itemDocumento?.item.produto_id && !itemDocumento.item.valor_total && itemDocumento.item.valor_unitario == null) {
      throw new Error("O item selecionado não possui valor suficiente para apropriação financeira.");
    }

    const itensDoDocumento = await db.documento_itens
      .where("documento_id")
      .equals(documento.id)
      .toArray();
    const documentoPossuiItensValorizados = itensDoDocumento.some((item) => {
      const total = item.valor_total ?? (item.valor_unitario != null ? item.valor_unitario * item.quantidade : null);
      return total != null && total > 0;
    });

    if (!dados.documentoItemId && documentoPossuiItensValorizados) {
      throw new Error("Este documento possui itens com valor. Selecione o item para apropriar o custo e evitar dupla contabilização.");
    }

    const limite = await calcularLimiteFinanceiro(
      projetoId,
      documento.id,
      dados.documentoItemId ?? null,
    );

    if (limite.disponivel != null && dados.valor > limite.disponivel + Number.EPSILON) {
      throw new Error(
        `O valor excede o saldo disponível para apropriação. Disponível: R$ ${limite.disponivel.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      );
    }

    if (documento.valor_total != null) {
      const apropriadoDocumento = await db.apropriacoes_financeiras_equipamentos
        .where("documento_id")
        .equals(documento.id)
        .toArray();
      const totalDocumentoApos = apropriadoDocumento.reduce((total, item) => total + item.valor, 0) + dados.valor;
      if (totalDocumentoApos > documento.valor_total + Number.EPSILON) {
        throw new Error(
          `A apropriação excede o valor total do documento. Disponível: R$ ${Math.max(0, documento.valor_total - apropriadoDocumento.reduce((total, item) => total + item.valor, 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
        );
      }
    }

    const agora = new Date().toISOString();
    const apropriacao: ApropriacaoFinanceiraEquipamento = {
      id: uid(),
      projeto_id: projetoId,
      tipo: "MANUTENCAO",
      documento_id: documento.id,
      documento_item_id: dados.documentoItemId ?? null,
      manutencao_id: manutencaoId,
      estoque_equipamento_id: estoque.id,
      equipamento_id: estoque.equipamento_id,
      valor: dados.valor,
      observacao: normalizarTexto(dados.observacao),
      criado_em: agora,
      atualizado_em: agora,
    };

    await db.apropriacoes_financeiras_equipamentos.add(apropriacao);
    return apropriacao;
  },

  async removerApropriacao(
    projetoId: string,
    apropriacaoId: string,
  ): Promise<void> {
    const apropriacao = await getDB().apropriacoes_financeiras_equipamentos.get(apropriacaoId);
    if (!apropriacao || apropriacao.projeto_id !== projetoId) {
      throw new Error("Apropriação financeira não encontrada.");
    }
    await getDB().apropriacoes_financeiras_equipamentos.delete(apropriacaoId);
  },
};
