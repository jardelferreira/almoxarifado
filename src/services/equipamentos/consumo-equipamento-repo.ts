import { getDB, uid } from "@/db/db";
import type { ConsumoEquipamento, Movimentacao, Produto } from "@/types";

export type SalvarConsumoEquipamentoInput = {
  id?: string;
  movimentacaoId: string;
  estoqueEquipamentoId: string;
  quantidade: number;
  observacao?: string | null;
};

function validarQuantidade(quantidade: number): void {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("A quantidade apropriada deve ser maior que zero.");
  }
}

async function obterMovimentacao(
  projetoId: string,
  movimentacaoId: string,
): Promise<Movimentacao> {
  const movimentacao = await getDB().movimentacoes.get(movimentacaoId);

  if (!movimentacao || movimentacao.projeto_id !== projetoId) {
    throw new Error("Movimentação não encontrada neste projeto.");
  }

  if (movimentacao.tipo !== "SAIDA") {
    throw new Error("Somente saídas de materiais podem ser apropriadas a equipamentos.");
  }

  return movimentacao;
}

async function obterProduto(
  projetoId: string,
  produtoId: string,
): Promise<Produto> {
  const produto = await getDB().produtos.get(produtoId);

  if (!produto || produto.projeto_id !== projetoId) {
    throw new Error("O produto da movimentação não pertence ao projeto.");
  }

  return produto;
}

async function obterCustoUnitarioDaOrigem(
  movimentacao: Movimentacao,
): Promise<number | null> {
  if (!movimentacao.documento_item_id) {
    return null;
  }

  const item = await getDB().documento_itens.get(
    movimentacao.documento_item_id,
  );

  if (!item) {
    return null;
  }

  if (
    item.documento_id !== movimentacao.documento_id ||
    item.produto_id !== movimentacao.produto_id
  ) {
    return null;
  }

  const valorUnitario = item.valor_unitario;
  return valorUnitario != null && Number.isFinite(valorUnitario) && valorUnitario >= 0
    ? valorUnitario
    : null;
}

async function validarEquipamento(
  projetoId: string,
  estoqueEquipamentoId: string,
): Promise<{ estoqueId: string; equipamentoId: string }> {
  const estoque = await getDB().estoque_equipamentos.get(estoqueEquipamentoId);

  if (!estoque || estoque.projeto_id !== projetoId) {
    throw new Error("Registro de estoque do equipamento não encontrado neste projeto.");
  }

  const equipamento = await getDB().equipamentos.get(estoque.equipamento_id);

  if (!equipamento || equipamento.projeto_id !== projetoId) {
    throw new Error("Equipamento do registro de estoque não encontrado neste projeto.");
  }

  return {
    estoqueId: estoque.id,
    equipamentoId: equipamento.id,
  };
}

export const consumoEquipamentoRepo = {
  async listarPorMovimentacao(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<ConsumoEquipamento[]> {
    const registros = await getDB()
      .consumos_equipamentos
      .where("movimentacao_id")
      .equals(movimentacaoId)
      .toArray();

    return registros
      .filter((registro) => registro.projeto_id === projetoId)
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  },

  async listarPorProjeto(
    projetoId: string,
  ): Promise<ConsumoEquipamento[]> {
    return getDB()
      .consumos_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();
  },

  async quantidadeApropriada(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<number> {
    const registros = await this.listarPorMovimentacao(
      projetoId,
      movimentacaoId,
    );

    return registros.reduce(
      (total, registro) => total + registro.quantidade,
      0,
    );
  },

  async salvar(
    projetoId: string,
    dados: SalvarConsumoEquipamentoInput,
  ): Promise<ConsumoEquipamento> {
    validarQuantidade(dados.quantidade);

    const db = getDB();
    const movimentacao = await obterMovimentacao(
      projetoId,
      dados.movimentacaoId,
    );
    const produto = await obterProduto(
      projetoId,
      movimentacao.produto_id,
    );
    const equipamento = await validarEquipamento(
      projetoId,
      dados.estoqueEquipamentoId,
    );

    const existentes = await this.listarPorMovimentacao(
      projetoId,
      dados.movimentacaoId,
    );
    const registroAtual = dados.id
      ? existentes.find((registro) => registro.id === dados.id)
      : undefined;

    if (dados.id && !registroAtual) {
      throw new Error("A apropriação de consumo não foi encontrada.");
    }

    const totalDeOutros = existentes.reduce(
      (total, registro) =>
        total +
        (registro.id === registroAtual?.id ? 0 : registro.quantidade),
      0,
    );

    if (totalDeOutros + dados.quantidade > movimentacao.quantidade) {
      const restante = Math.max(0, movimentacao.quantidade - totalDeOutros);
      throw new Error(
        `A quantidade apropriada excede o saldo da saída. Disponível para rateio: ${restante} ${produto.unidade_id ? "" : "unidade(s)"}`.trim(),
      );
    }

    const custoUnitario = await obterCustoUnitarioDaOrigem(movimentacao);
    const agora = new Date().toISOString();

    const consumo: ConsumoEquipamento = {
      id: registroAtual?.id ?? uid(),
      projeto_id: projetoId,
      movimentacao_id: movimentacao.id,
      estoque_equipamento_id: equipamento.estoqueId,
      equipamento_id: equipamento.equipamentoId,
      quantidade: dados.quantidade,
      unidade_id: produto.unidade_id ?? null,
      custo_unitario: custoUnitario,
      custo_total:
        custoUnitario == null
          ? null
          : Number((custoUnitario * dados.quantidade).toFixed(6)),
      data_apropriacao: movimentacao.data,
      origem: "MANUAL",
      observacao: dados.observacao?.trim() || null,
      criado_em: registroAtual?.criado_em ?? agora,
      atualizado_em: agora,
    };

    await db.consumos_equipamentos.put(consumo);
    return consumo;
  },

  async remover(
    projetoId: string,
    consumoId: string,
  ): Promise<void> {
    const consumo = await getDB().consumos_equipamentos.get(consumoId);

    if (!consumo || consumo.projeto_id !== projetoId) {
      throw new Error("A apropriação de consumo não foi encontrada.");
    }

    await getDB().consumos_equipamentos.delete(consumoId);
  },

  async removerDaMovimentacao(
    movimentacaoId: string,
  ): Promise<void> {
    const registros = await getDB()
      .consumos_equipamentos
      .where("movimentacao_id")
      .equals(movimentacaoId)
      .toArray();

    if (registros.length === 0) return;

    await getDB().consumos_equipamentos.bulkDelete(
      registros.map((registro) => registro.id),
    );
  },
};
