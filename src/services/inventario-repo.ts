import { getDB, uid } from "@/db/db";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import type { Inventario, InventarioItem } from "@/types";

function validarQuantidade(valor: number | null | undefined, campo: string) {
  if (valor == null) return;
  if (!Number.isFinite(valor) || valor < 0) throw new Error(`${campo} deve ser um número maior ou igual a zero.`);
}

function efeitoMovimento(movimento: { tipo: string; quantidade: number; sinal?: 1 | -1 | undefined }) {
  if (movimento.tipo === "ENTRADA" || movimento.tipo === "DEVOLUCAO") return movimento.quantidade;
  if (movimento.tipo === "SAIDA") return -movimento.quantidade;
  return (movimento.sinal ?? 1) * movimento.quantidade;
}

type EstoqueInventario = { produtoId: string; equipeId: string };

export const inventarioRepo = {
  async listar(projetoId: string): Promise<Inventario[]> {
    return (await getDB().inventarios.where("projeto_id").equals(projetoId).toArray())
      .sort((a, b) => b.data_abertura.localeCompare(a.data_abertura));
  },

  async obter(id: string): Promise<Inventario | undefined> {
    return getDB().inventarios.get(id);
  },

  async itens(inventarioId: string): Promise<InventarioItem[]> {
    return getDB().inventario_itens.where("inventario_id").equals(inventarioId).toArray();
  },

  async abrir(args: {
    projetoId: string;
    equipeId?: string | null;
    /** Posições de estoque: um produto + sua equipe. */
    estoques: EstoqueInventario[];
    responsavelId?: string | null;
    observacao?: string | null;
    /** Permite que o fluxo inteligente abra um inventário parcial geral quando a configuração permitir. */
    modoRecomendado?: boolean;
  }): Promise<Inventario> {
    const db = getDB();
    const config = await configuracoesRepo.obter(args.projetoId);
    if (!config.inventario.habilitado) throw new Error("O inventário está desabilitado nas configurações do projeto.");
    if (config.inventario.exigir_responsavel && !args.responsavelId) throw new Error("Informe o responsável pelo inventário.");

    if (args.equipeId) {
      const equipe = await db.equipes.get(args.equipeId);
      if (!equipe || equipe.projeto_id !== args.projetoId) throw new Error("Equipe inválida para este projeto.");
      if (!equipe.ativo) throw new Error("A equipe selecionada está inativa.");
    }

    const existentes = await db.inventarios.where("projeto_id").equals(args.projetoId).toArray();
    if (existentes.some((i) => i.equipe_id === (args.equipeId ?? null) && i.status === "ABERTO")) {
      throw new Error(args.equipeId ? "Já existe um inventário aberto para esta equipe." : "Já existe um inventário geral aberto para este projeto.");
    }

    const selecionados = [...new Map(args.estoques.map((e) => [`${e.produtoId}:${e.equipeId}`, e])).values()];
    if (selecionados.length === 0) throw new Error("Selecione pelo menos um item de estoque para o inventário.");

    const produtos = await db.produtos.where("projeto_id").equals(args.projetoId).toArray();
    const produtoMap = new Map(produtos.map((p) => [p.id, p]));
    const equipes = await db.equipes.where("projeto_id").equals(args.projetoId).toArray();
    const equipeMap = new Map(equipes.map((e) => [e.id, e]));

    for (const item of selecionados) {
      const produto = produtoMap.get(item.produtoId);
      if (!produto || !produto.ativo) throw new Error("Um dos produtos selecionados não pertence ao estoque ativo do projeto.");
      const equipe = equipeMap.get(item.equipeId);
      if (!equipe || !equipe.ativo) throw new Error("Um dos estoques selecionados possui uma equipe inválida ou inativa.");
      if (args.equipeId && item.equipeId !== args.equipeId) throw new Error("Um dos itens selecionados não pertence à equipe escolhida.");
    }

    const movimentos = await db.movimentacoes.where("projeto_id").equals(args.projetoId).toArray();
    const sistemaPorEstoque = new Map<string, number>();
    for (const movimento of movimentos) {
      const chave = `${movimento.produto_id}:${movimento.equipe_id}`;
      sistemaPorEstoque.set(chave, (sistemaPorEstoque.get(chave) ?? 0) + efeitoMovimento(movimento));
    }

    const disponiveis = [...sistemaPorEstoque.entries()]
      .filter(([, saldo]) => saldo !== 0 || true)
      .flatMap(([chave]) => {
        const [produtoId, equipeId] = chave.split(":");
        if (!produtoId || !equipeId) return [];
        return [{ produtoId, equipeId }];
      })
      .filter((e) => produtoMap.get(e.produtoId)?.ativo && equipeMap.get(e.equipeId)?.ativo);
    const disponiveisSet = new Set(disponiveis.map((e) => `${e.produtoId}:${e.equipeId}`));

    for (const item of selecionados) {
      if (!disponiveisSet.has(`${item.produtoId}:${item.equipeId}`)) {
        throw new Error("Um dos itens selecionados não possui estoque/movimentação para a equipe informada.");
      }
    }

    if (!args.equipeId) {
      if (!config.inventario.permitir_inventario_parcial && selecionados.length !== disponiveis.length) {
        throw new Error(args.modoRecomendado ? "A configuração não permite inventário parcial para o escopo recomendado." : "O inventário geral deve incluir todos os itens de estoque do projeto.");
      }
    } else if (!config.inventario.permitir_inventario_parcial && selecionados.length !== disponiveis.filter((e) => e.equipeId === args.equipeId).length) {
      throw new Error("A configuração exige inventário completo. Todos os itens do estoque da equipe devem ser incluídos.");
    }

    const agora = new Date().toISOString();
    const inventario: Inventario = {
      id: uid(),
      projeto_id: args.projetoId,
      equipe_id: args.equipeId ?? null,
      status: "ABERTO",
      data_abertura: agora,
      data_encerramento: null,
      responsavel_id: args.responsavelId ?? null,
      observacao: args.observacao?.trim() || null,
      criado_em: agora,
      atualizado_em: agora,
    };

    const itens: InventarioItem[] = selecionados.map(({ produtoId, equipeId }) => ({
      id: uid(),
      inventario_id: inventario.id,
      produto_id: produtoId,
      equipe_id: equipeId,
      quantidade_sistema: Math.max(0, sistemaPorEstoque.get(`${produtoId}:${equipeId}`) ?? 0),
      quantidade_contada: null,
      observacao: null,
      criado_em: agora,
      atualizado_em: agora,
    }));

    await db.transaction("rw", db.inventarios, db.inventario_itens, async () => {
      await db.inventarios.add(inventario);
      await db.inventario_itens.bulkAdd(itens);
    });
    return inventario;
  },

  async registrarContagem(inventarioId: string, itemId: string, quantidade: number, observacao?: string | null) {
    validarQuantidade(quantidade, "A contagem");
    const db = getDB();
    const inventario = await db.inventarios.get(inventarioId);
    if (!inventario || inventario.status !== "ABERTO") throw new Error("Este inventário não está aberto para contagem.");
    const item = await db.inventario_itens.get(itemId);
    if (!item || item.inventario_id !== inventarioId) throw new Error("Item de inventário inválido.");
    if (!item.equipe_id) throw new Error("Este item de inventário não possui equipe de estoque vinculada.");
    const atualizado: InventarioItem = { ...item, quantidade_contada: quantidade, observacao: observacao?.trim() || null, atualizado_em: new Date().toISOString() };
    await db.inventario_itens.put(atualizado);
    await db.inventarios.update(inventarioId, { atualizado_em: atualizado.atualizado_em });
    return atualizado;
  },

  async cancelar(inventarioId: string) {
    const db = getDB();
    const inventario = await db.inventarios.get(inventarioId);
    if (!inventario) throw new Error("Inventário não encontrado.");
    if (inventario.status !== "ABERTO") throw new Error("Somente inventários abertos podem ser cancelados.");
    await db.inventarios.update(inventarioId, { status: "CANCELADO", atualizado_em: new Date().toISOString() });
  },
};
