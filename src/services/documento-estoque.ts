import { getDB, uid } from "@/db/db";
import type { DocumentoItem, Movimentacao } from "@/types";
import { documentosRepo } from "./documentos-repo";

export interface LancarDocumentoItemDados {
  projetoId: string;
  documentoItemId: string;
  equipeId: string;
  quantidade: number;
  data?: string;
  localId?: string | null;
  funcionarioId?: string | null;
  encarregadoId?: string | null;
  observacao?: string | null;
}

export interface ResultadoLancamentoDocumento {
  movimentacao: Movimentacao;
  item: DocumentoItem;
  quantidadeLancada: number;
  quantidadePendente: number;
}

function validarQuantidade(quantidade: number): void {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("A quantidade a lançar deve ser maior que zero.");
  }
}

export const documentoEstoqueService = {
  async lancarItem(
    dados: LancarDocumentoItemDados,
  ): Promise<ResultadoLancamentoDocumento> {
    validarQuantidade(dados.quantidade);

    const db = getDB();

    return db.transaction(
      "rw",
      db.documento_itens,
      db.documentos,
      db.produtos,
      db.equipes,
      db.movimentacoes,
      async () => {
        const item = await db.documento_itens.get(dados.documentoItemId);

        if (!item) {
          throw new Error("Item do documento não encontrado.");
        }

        const documento = await db.documentos.get(item.documento_id);

        if (!documento) {
          throw new Error("Documento do item não encontrado.");
        }

        if (documento.projeto_id !== dados.projetoId) {
          throw new Error("O documento não pertence ao projeto ativo.");
        }

        if (documento.status === "CANCELADO") {
          throw new Error("Não é possível lançar no estoque um documento cancelado.");
        }

        if (!item.produto_id) {
          throw new Error("Associe o item a um produto antes de lançá-lo no estoque.");
        }

        const produto = await db.produtos.get(item.produto_id);

        if (!produto) {
          throw new Error("Produto do documento não encontrado.");
        }

        if (produto.projeto_id !== dados.projetoId) {
          throw new Error("O produto não pertence ao projeto ativo.");
        }

        const equipe = await db.equipes.get(dados.equipeId);

        if (!equipe) {
          throw new Error("Equipe de estoque não encontrada.");
        }

        if (equipe.projeto_id !== dados.projetoId) {
          throw new Error("A equipe não pertence ao projeto ativo.");
        }

        if (!equipe.ativo) {
          throw new Error("A equipe de estoque está inativa.");
        }

        const movimentosDoItem = await db.movimentacoes
          .where("documento_item_id")
          .equals(item.id)
          .toArray();

        const quantidadeLancada = movimentosDoItem.reduce((total, movimento) => {
          const sinal = movimento.sinal ?? (movimento.tipo === "SAIDA" ? -1 : 1);
          return total + movimento.quantidade * sinal;
        }, 0);

        const quantidadePendente = Math.max(
          0,
          item.quantidade - quantidadeLancada,
        );

        if (dados.quantidade > quantidadePendente + Number.EPSILON) {
          throw new Error(
            `Quantidade excede o saldo pendente do item. Disponível: ${quantidadePendente}.`,
          );
        }

        const movimentacao: Movimentacao = {
          id: uid(),
          projeto_id: dados.projetoId,
          data: dados.data ?? new Date().toISOString(),
          tipo: "ENTRADA",
          produto_id: item.produto_id,
          quantidade: dados.quantidade,
          sinal: 1,
          funcionario_id: dados.funcionarioId ?? null,
          encarregado_id: dados.encarregadoId ?? null,
          empresa_id: documento.empresa_id ?? null,
          local_id: dados.localId ?? null,
          local_destino_id: null,
          movimentacao_origem_id: null,
          observacao:
            dados.observacao ??
            `Lançamento automático do documento ${documento.numero}.`,
          equipe_id: dados.equipeId,
          documento_id: documento.id,
          documento_item_id: item.id,
        };

        await db.movimentacoes.add(movimentacao);

        const novaQuantidadeLancada = quantidadeLancada + dados.quantidade;
        const novaQuantidadePendente = Math.max(
          0,
          item.quantidade - novaQuantidadeLancada,
        );

        const novoStatus =
          novaQuantidadeLancada <= Number.EPSILON
            ? "PENDENTE"
            : novaQuantidadeLancada >= item.quantidade - Number.EPSILON
              ? "CONCLUIDO"
              : "PARCIAL";

        await db.documentos.update(documento.id, {
          status: novoStatus,
          atualizado_em: new Date().toISOString(),
        });

        return {
          movimentacao,
          item,
          quantidadeLancada: novaQuantidadeLancada,
          quantidadePendente: novaQuantidadePendente,
        };
      },
    );
  },

  async lancarSaldoItem(
    dados: Omit<LancarDocumentoItemDados, "quantidade">,
  ): Promise<ResultadoLancamentoDocumento> {
    const quantidade = await documentosRepo.quantidadePendente(dados.documentoItemId);

    if (quantidade <= 0) {
      throw new Error("O item não possui saldo pendente.");
    }

    return this.lancarItem({ ...dados, quantidade });
  },

  async obterSaldoItem(itemId: string) {
    const item = await documentosRepo.obterItem(itemId);
    if (!item) throw new Error("Item do documento não encontrado.");

    const quantidadeLancada = await documentosRepo.quantidadeLancada(itemId);
    return {
      quantidadeDocumentada: item.quantidade,
      quantidadeLancada,
      quantidadePendente: Math.max(0, item.quantidade - quantidadeLancada),
    };
  },
};
