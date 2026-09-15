import { getDB, uid } from "@/db/db";
import type {
  Documento,
  DocumentoItem,
  DocumentoReferencia,
  DocumentoReferenciaTipo,
  DocumentoStatus,
} from "@/types";

export type CriarDocumentoDados = Omit<
  Documento,
  "id" | "projeto_id" | "criado_em" | "atualizado_em" | "status"
>;

export type CriarDocumentoItemDados = Omit<DocumentoItem, "id" | "documento_id">;

export type CriarDocumentoReferenciaDados = Omit<
  DocumentoReferencia,
  "id" | "projeto_id" | "criado_em"
>;

function validarQuantidade(quantidade: number): void {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("A quantidade do item deve ser maior que zero.");
  }
}

function calcularStatus(totalDocumentado: number, totalLancado: number): DocumentoStatus {
  if (totalLancado <= Number.EPSILON) return "PENDENTE";
  if (totalLancado >= totalDocumentado - Number.EPSILON) return "CONCLUIDO";
  return "PARCIAL";
}

export const documentosRepo = {
  async listar(projetoId: string): Promise<Documento[]> {
    return getDB().documentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray()
      .then((documentos) =>
        documentos.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em)),
      );
  },

  async obter(documentoId: string): Promise<Documento | undefined> {
    return getDB().documentos.get(documentoId);
  },

  async criar(
    projetoId: string,
    dados: CriarDocumentoDados,
    itens: CriarDocumentoItemDados[] = [],
  ): Promise<Documento> {
    const agora = new Date().toISOString();
    const documento: Documento = {
      ...dados,
      id: uid(),
      projeto_id: projetoId,
      status: "PENDENTE",
      criado_em: agora,
      atualizado_em: agora,
    };

    const itensCriados: DocumentoItem[] = itens.map((item) => {
      validarQuantidade(item.quantidade);
      return {
        ...item,
        id: uid(),
        documento_id: documento.id,
      };
    });

    const db = getDB();
    await db.transaction("rw", db.documentos, db.documento_itens, async () => {
      await db.documentos.add(documento);
      if (itensCriados.length) {
        await db.documento_itens.bulkAdd(itensCriados);
      }
    });

    return documento;
  },

  async atualizar(
    documentoId: string,
    dados: Partial<Omit<Documento, "id" | "projeto_id" | "criado_em" | "status">>,
  ): Promise<Documento> {
    const atual = await this.obter(documentoId);
    if (!atual) throw new Error("Documento não encontrado.");

    if (atual.status === "CANCELADO") {
      throw new Error("Não é possível editar um documento cancelado.");
    }

    const atualizado: Documento = {
      ...atual,
      ...dados,
      id: atual.id,
      projeto_id: atual.projeto_id,
      criado_em: atual.criado_em,
      status: atual.status,
      atualizado_em: new Date().toISOString(),
    };

    await getDB().documentos.put(atualizado);
    return atualizado;
  },

  async cancelar(documentoId: string): Promise<Documento> {
    const documento = await this.obter(documentoId);
    if (!documento) throw new Error("Documento não encontrado.");

    if (documento.status === "CANCELADO") return documento;

    const movimentos = await getDB().movimentacoes
      .where("documento_id")
      .equals(documentoId)
      .count();

    if (movimentos > 0) {
      throw new Error(
        "Não é possível cancelar um documento que já possui movimentações. Faça a reversão pelo fluxo de estoque.",
      );
    }

    return this.atualizarStatusForcado(documentoId, "CANCELADO");
  },

  async atualizarStatusForcado(
    documentoId: string,
    status: DocumentoStatus,
  ): Promise<Documento> {
    const documento = await this.obter(documentoId);
    if (!documento) throw new Error("Documento não encontrado.");

    const atualizado: Documento = {
      ...documento,
      status,
      atualizado_em: new Date().toISOString(),
    };

    await getDB().documentos.put(atualizado);
    return atualizado;
  },

  async remover(documentoId: string): Promise<void> {
    const db = getDB();

    const documento = await this.obter(documentoId);
    if (!documento) return;

    const movimentos = await db.movimentacoes
      .where("documento_id")
      .equals(documentoId)
      .count();

    if (movimentos > 0) {
      throw new Error(
        "Não é possível excluir um documento que já possui movimentações vinculadas.",
      );
    }

    await db.transaction(
      "rw",
      db.documentos,
      db.documento_itens,
      db.documento_referencias,
      async () => {
        const refs = await db.documento_referencias
          .where("documento_id")
          .equals(documentoId)
          .toArray();

        const refsInversas = await db.documento_referencias
          .where("documento_referenciado_id")
          .equals(documentoId)
          .toArray();

        const idsReferencias = [
          ...refs.map((item) => item.id),
          ...refsInversas.map((item) => item.id),
        ].filter((id, index, array) => array.indexOf(id) === index);

        if (idsReferencias.length) {
          await db.documento_referencias.bulkDelete(idsReferencias);
        }

        const itens = await db.documento_itens
          .where("documento_id")
          .equals(documentoId)
          .toArray();

        if (itens.length) {
          await db.documento_itens.bulkDelete(itens.map((item) => item.id));
        }

        await db.documentos.delete(documentoId);
      },
    );
  },

  async listarItens(documentoId: string): Promise<DocumentoItem[]> {
    return getDB().documento_itens
      .where("documento_id")
      .equals(documentoId)
      .toArray();
  },

  async obterItem(itemId: string): Promise<DocumentoItem | undefined> {
    return getDB().documento_itens.get(itemId);
  },

  async adicionarItem(
    documentoId: string,
    dados: CriarDocumentoItemDados,
  ): Promise<DocumentoItem> {
    const documento = await this.obter(documentoId);
    if (!documento) throw new Error("Documento não encontrado.");
    if (documento.status === "CANCELADO") {
      throw new Error("Não é possível adicionar itens a um documento cancelado.");
    }

    validarQuantidade(dados.quantidade);

    const item: DocumentoItem = {
      ...dados,
      id: uid(),
      documento_id: documentoId,
    };

    await getDB().documento_itens.add(item);
    await this.atualizarStatus(documentoId);
    return item;
  },

  async atualizarItem(
    itemId: string,
    dados: Partial<Omit<DocumentoItem, "id" | "documento_id">>,
  ): Promise<DocumentoItem> {
    const item = await this.obterItem(itemId);
    if (!item) throw new Error("Item do documento não encontrado.");

    const documento = await this.obter(item.documento_id);
    if (!documento) throw new Error("Documento do item não encontrado.");
    if (documento.status === "CANCELADO") {
      throw new Error("Não é possível editar itens de um documento cancelado.");
    }

    if (dados.quantidade !== undefined) {
      validarQuantidade(dados.quantidade);
      const lancada = await this.quantidadeLancada(itemId);
      if (dados.quantidade + Number.EPSILON < lancada) {
        throw new Error(
          `A quantidade documentada não pode ser menor que a quantidade já lançada (${lancada}).`,
        );
      }
    }

    const atualizado: DocumentoItem = {
      ...item,
      ...dados,
      id: item.id,
      documento_id: item.documento_id,
    };

    await getDB().documento_itens.put(atualizado);
    await this.atualizarStatus(item.documento_id);
    return atualizado;
  },

  async removerItem(itemId: string): Promise<void> {
    const item = await this.obterItem(itemId);
    if (!item) return;

    const documento = await this.obter(item.documento_id);
    if (documento?.status === "CANCELADO") {
      throw new Error("Não é possível remover itens de um documento cancelado.");
    }

    const lancada = await this.quantidadeLancada(itemId);
    if (lancada > Number.EPSILON) {
      throw new Error(
        "Não é possível remover um item que já possui lançamentos no estoque.",
      );
    }

    await getDB().documento_itens.delete(itemId);
    await this.atualizarStatus(item.documento_id);
  },

  async listarReferencias(documentoId: string): Promise<DocumentoReferencia[]> {
    return getDB().documento_referencias
      .where("documento_id")
      .equals(documentoId)
      .toArray();
  },

  async listarDocumentosRelacionadosDetalhados(documentoId: string): Promise<
    Array<{
      documento: Documento;
      referencia: DocumentoReferencia;
      direcao: "DIRETA" | "INVERSA";
    }>
  > {
    const db = getDB();
    const [diretas, inversas] = await Promise.all([
      db.documento_referencias.where("documento_id").equals(documentoId).toArray(),
      db.documento_referencias
        .where("documento_referenciado_id")
        .equals(documentoId)
        .toArray(),
    ]);

    const registros = [
      ...diretas.map((referencia) => ({ referencia, documentoId: referencia.documento_referenciado_id, direcao: "DIRETA" as const })),
      ...inversas.map((referencia) => ({ referencia, documentoId: referencia.documento_id, direcao: "INVERSA" as const })),
    ];

    if (!registros.length) return [];

    const documentos = await db.documentos.bulkGet(registros.map((item) => item.documentoId));

    return registros.flatMap((registro, index) => {
      const documento = documentos[index];
      return documento ? [{ documento, referencia: registro.referencia, direcao: registro.direcao }] : [];
    });
  },

  async listarDocumentosRelacionados(documentoId: string): Promise<Documento[]> {
    const db = getDB();
    const [diretas, inversas] = await Promise.all([
      db.documento_referencias.where("documento_id").equals(documentoId).toArray(),
      db.documento_referencias
        .where("documento_referenciado_id")
        .equals(documentoId)
        .toArray(),
    ]);

    const ids = [
      ...diretas.map((item) => item.documento_referenciado_id),
      ...inversas.map((item) => item.documento_id),
    ].filter((id, index, array) => array.indexOf(id) === index);

    if (!ids.length) return [];
    return db.documentos
      .bulkGet(ids)
      .then((items) => items.filter(Boolean) as Documento[]);
  },

  async criarReferencia(
    projetoId: string,
    documentoId: string,
    documentoReferenciadoId: string,
    tipoRelacao: DocumentoReferenciaTipo = "REFERENCIA",
    observacao?: string | null,
  ): Promise<DocumentoReferencia> {
    if (documentoId === documentoReferenciadoId) {
      throw new Error("Um documento não pode ser referência de si mesmo.");
    }

    const db = getDB();
    const [origem, destino] = await Promise.all([
      db.documentos.get(documentoId),
      db.documentos.get(documentoReferenciadoId),
    ]);

    if (!origem || !destino) {
      throw new Error("Documento de origem ou documento referenciado não encontrado.");
    }

    if (origem.projeto_id !== projetoId || destino.projeto_id !== projetoId) {
      throw new Error("Os documentos devem pertencer ao projeto ativo.");
    }

    if (origem.status === "CANCELADO") {
      throw new Error("Não é possível adicionar referências a um documento cancelado.");
    }

    const [existente, inversa] = await Promise.all([
      db.documento_referencias
        .where("[documento_id+documento_referenciado_id]")
        .equals([documentoId, documentoReferenciadoId])
        .first(),
      db.documento_referencias
        .where("[documento_id+documento_referenciado_id]")
        .equals([documentoReferenciadoId, documentoId])
        .first(),
    ]);

    // A relação é armazenada uma única vez e exibida nos dois sentidos.
    if (existente) return existente;
    if (inversa) return inversa;

    const referencia: DocumentoReferencia = {
      id: uid(),
      projeto_id: projetoId,
      documento_id: documentoId,
      documento_referenciado_id: documentoReferenciadoId,
      tipo_relacao: tipoRelacao,
      observacao: observacao ?? null,
      criado_em: new Date().toISOString(),
    };

    await db.documento_referencias.add(referencia);
    return referencia;
  },

  async removerReferencia(referenciaId: string): Promise<void> {
    await getDB().documento_referencias.delete(referenciaId);
  },

  async quantidadeLancada(itemId: string): Promise<number> {
    const movimentacoes = await getDB().movimentacoes
      .where("documento_item_id")
      .equals(itemId)
      .toArray();

    return movimentacoes.reduce((total, movimento) => {
      const sinal = movimento.sinal ?? (movimento.tipo === "SAIDA" ? -1 : 1);
      return total + movimento.quantidade * sinal;
    }, 0);
  },

  async quantidadePendente(itemId: string): Promise<number> {
    const item = await this.obterItem(itemId);
    if (!item) throw new Error("Item do documento não encontrado.");

    const lancada = await this.quantidadeLancada(itemId);
    return Math.max(0, item.quantidade - lancada);
  },

  async atualizarStatus(documentoId: string): Promise<Documento | undefined> {
    const documento = await this.obter(documentoId);
    if (!documento || documento.status === "CANCELADO") return documento;

    const itens = await this.listarItens(documentoId);
    let totalDocumentado = 0;
    let totalLancado = 0;

    for (const item of itens) {
      totalDocumentado += item.quantidade;
      totalLancado += await this.quantidadeLancada(item.id);
    }

    return this.atualizarStatusCalculado(
      documento,
      calcularStatus(totalDocumentado, totalLancado),
    );
  },

  async atualizarStatusCalculado(
    documento: Documento,
    status: DocumentoStatus,
  ): Promise<Documento> {
    if (documento.status === "CANCELADO") return documento;

    const atualizado: Documento = {
      ...documento,
      status,
      atualizado_em: new Date().toISOString(),
    };

    await getDB().documentos.put(atualizado);
    return atualizado;
  },
};
