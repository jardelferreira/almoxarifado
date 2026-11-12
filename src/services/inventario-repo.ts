import { getDB, uid } from "@/db/db";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import type { Inventario, InventarioEvento, InventarioItem, InventarioParticipante } from "@/types";
import type { SnapshotInventario } from "@/services/inventario-sync";

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

const DURACAO_BLOQUEIO_MS = 10 * 60 * 1000;

function evento(args: Omit<InventarioEvento, "id" | "em">): InventarioEvento {
  return { id: uid(), em: new Date().toISOString(), ...args };
}

function participantesDo(inventario: Inventario): InventarioParticipante[] {
  return inventario.participantes ? [...inventario.participantes] : [];
}

function eventosDo(inventario: Inventario): InventarioEvento[] {
  return inventario.eventos ? [...inventario.eventos] : [];
}

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

  async mesclarSnapshotRemoto(snapshot: SnapshotInventario): Promise<{ inventario: Inventario; itens: InventarioItem[] }> {
    const db = getDB();
    return db.transaction("rw", db.inventarios, db.inventario_itens, async () => {
      const local = await db.inventarios.get(snapshot.inventario.id);
      const itensLocais = await db.inventario_itens.where("inventario_id").equals(snapshot.inventario.id).toArray();
      const inventarioBase = local && local.atualizado_em > snapshot.inventario.atualizado_em ? local : snapshot.inventario;
      const participantes = [...new Map([...(local?.participantes ?? []), ...(snapshot.inventario.participantes ?? [])].map((item) => [item.funcionario_id, item])).values()];
      const eventos = [...new Map([...(local?.eventos ?? []), ...(snapshot.inventario.eventos ?? [])].map((item) => [item.id, item])).values()].sort((a, b) => a.em.localeCompare(b.em));
      const inventario: Inventario = { ...inventarioBase, participantes, eventos, versao: Math.max(local?.versao ?? 0, snapshot.inventario.versao ?? 0), atualizado_em: new Date().toISOString() };
      const remotoPorId = new Map(snapshot.itens.map((item) => [item.id, item]));
      for (const item of itensLocais) {
        const remoto = remotoPorId.get(item.id);
        remotoPorId.set(item.id, remoto && remoto.atualizado_em > item.atualizado_em ? remoto : item);
      }
      const itens = [...remotoPorId.values()];
      await db.inventarios.put(inventario);
      await db.inventario_itens.bulkPut(itens);
      return { inventario, itens };
    });
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
      participantes: args.responsavelId ? [{ funcionario_id: args.responsavelId, adicionado_em: agora, adicionado_por_id: args.responsavelId, ultimo_acesso_em: agora }] : [],
      eventos: [evento({ tipo: "ABERTO", funcionario_id: args.responsavelId ?? null, detalhe: "Inventário criado." })],
      versao: 1,
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

  async adicionarParticipante(inventarioId: string, funcionarioId: string, adicionadoPorId?: string | null) {
    const db = getDB();
    const agora = new Date().toISOString();
    return db.transaction("rw", db.inventarios, async () => {
      const inventario = await db.inventarios.get(inventarioId);
      if (!inventario || inventario.status !== "ABERTO") throw new Error("Somente inventários abertos podem receber participantes.");
      const funcionario = await db.funcionarios.get(funcionarioId);
      if (!funcionario || funcionario.projeto_id !== inventario.projeto_id || funcionario.status !== "ATIVO") throw new Error("Funcionário inválido para este projeto.");
      const participantes = participantesDo(inventario);
      if (participantes.some((item) => item.funcionario_id === funcionarioId)) return inventario;
      const atualizado: Inventario = {
        ...inventario,
        participantes: [...participantes, { funcionario_id: funcionarioId, adicionado_em: agora, adicionado_por_id: adicionadoPorId ?? null, ultimo_acesso_em: null }],
        eventos: [...eventosDo(inventario), evento({ tipo: "PARTICIPANTE_ADICIONADO", funcionario_id: funcionarioId, detalhe: "Participante autorizado no inventário." })],
        versao: (inventario.versao ?? 0) + 1,
        atualizado_em: agora,
      };
      await db.inventarios.put(atualizado);
      return atualizado;
    });
  },

  async registrarAcesso(inventarioId: string, funcionarioId: string) {
    const db = getDB();
    const inventario = await db.inventarios.get(inventarioId);
    if (!inventario || inventario.status !== "ABERTO") throw new Error("Este inventário não está aberto.");
    if (!participantesDo(inventario).some((item) => item.funcionario_id === funcionarioId)) throw new Error("Este funcionário ainda não foi adicionado ao inventário.");
    const agora = new Date().toISOString();
    const participantes = participantesDo(inventario).map((item) => item.funcionario_id === funcionarioId ? { ...item, ultimo_acesso_em: agora } : item);
    await db.inventarios.update(inventarioId, { participantes, atualizado_em: agora });
  },

  async iniciarConferencia(inventarioId: string, itemId: string, funcionarioId: string, dispositivoId: string) {
    const db = getDB();
    const agora = new Date();
    return db.transaction("rw", db.inventarios, db.inventario_itens, async () => {
      const inventario = await db.inventarios.get(inventarioId);
      if (!inventario || inventario.status !== "ABERTO") throw new Error("Este inventário não está aberto para conferência.");
      if (!participantesDo(inventario).some((item) => item.funcionario_id === funcionarioId)) throw new Error("Acesso não autorizado para este inventário.");
      const item = await db.inventario_itens.get(itemId);
      if (!item || item.inventario_id !== inventarioId) throw new Error("Item de inventário inválido.");
      const expira = item.bloqueio_expira_em ? new Date(item.bloqueio_expira_em).getTime() : 0;
      if (item.bloqueado_por_id && expira > agora.getTime() && item.bloqueado_por_id !== funcionarioId) throw new Error("Este item está sendo conferido por outro operador. Tente novamente quando ele for liberado.");
      const bloqueioExpira = new Date(agora.getTime() + DURACAO_BLOQUEIO_MS).toISOString();
      const atualizado: InventarioItem = { ...item, bloqueado_por_id: funcionarioId, bloqueado_em: agora.toISOString(), bloqueio_expira_em: bloqueioExpira, atualizado_em: agora.toISOString() };
      await db.inventario_itens.put(atualizado);
      await db.inventarios.update(inventarioId, { atualizado_em: agora.toISOString(), versao: (inventario.versao ?? 0) + 1, eventos: [...eventosDo(inventario), evento({ tipo: "ITEM_BLOQUEADO", funcionario_id: funcionarioId, item_id: itemId, dispositivo_id: dispositivoId, detalhe: `Bloqueio válido até ${bloqueioExpira}.` })] });
      return atualizado;
    });
  },

  async registrarContagem(inventarioId: string, itemId: string, quantidade: number, observacao?: string | null, participanteId?: string | null, dispositivoId?: string | null) {
    validarQuantidade(quantidade, "A contagem");
    const db = getDB();
    const inventario = await db.inventarios.get(inventarioId);
    if (!inventario || inventario.status !== "ABERTO") throw new Error("Este inventário não está aberto para contagem.");
    const item = await db.inventario_itens.get(itemId);
    if (!item || item.inventario_id !== inventarioId) throw new Error("Item de inventário inválido.");
    if (!item.equipe_id) throw new Error("Este item de inventário não possui equipe de estoque vinculada.");
    if (participanteId) {
      const expira = item.bloqueio_expira_em ? new Date(item.bloqueio_expira_em).getTime() : 0;
      if (item.bloqueado_por_id !== participanteId || expira <= Date.now()) throw new Error("A conferência deste item expirou. Bloqueie o item novamente antes de salvar.");
    }
    const agora = new Date().toISOString();
    await db.transaction("rw", db.inventarios, db.inventario_itens, async () => {
      const atual = await db.inventarios.get(inventarioId);
      if (!atual || atual.status !== "ABERTO") throw new Error("Este inventário não está aberto para contagem.");
      const itemAtual = await db.inventario_itens.get(itemId);
      if (!itemAtual || itemAtual.inventario_id !== inventarioId) throw new Error("Item de inventário inválido.");
      if (participanteId) {
        const expiraAtual = itemAtual.bloqueio_expira_em ? new Date(itemAtual.bloqueio_expira_em).getTime() : 0;
        if (itemAtual.bloqueado_por_id !== participanteId || expiraAtual <= Date.now()) throw new Error("A conferência deste item expirou ou foi assumida por outro operador.");
      }
      const atualizado: InventarioItem = { ...itemAtual, quantidade_contada: quantidade, observacao: observacao?.trim() || null, conferido_por_id: participanteId ?? itemAtual.conferido_por_id ?? null, conferido_em: agora, bloqueado_por_id: null, bloqueado_em: null, bloqueio_expira_em: null, versao: (itemAtual.versao ?? 0) + 1, atualizado_em: agora };
      await db.inventario_itens.put(atualizado);
      await db.inventarios.update(inventarioId, { atualizado_em: agora, versao: (atual.versao ?? 0) + 1, eventos: [...eventosDo(atual), evento({ tipo: "CONTAGEM_REGISTRADA", funcionario_id: participanteId ?? null, item_id: itemId, dispositivo_id: dispositivoId ?? null, detalhe: `Quantidade registrada: ${quantidade}.` })] });
    });
    return (await db.inventario_itens.get(itemId)) ?? item;
  },

  async cancelar(inventarioId: string) {
    const db = getDB();
    const inventario = await db.inventarios.get(inventarioId);
    if (!inventario) throw new Error("Inventário não encontrado.");
    if (inventario.status !== "ABERTO") throw new Error("Somente inventários abertos podem ser cancelados.");
    const agora = new Date().toISOString();
    await db.inventarios.update(inventarioId, { status: "CANCELADO", atualizado_em: agora, versao: (inventario.versao ?? 0) + 1, eventos: [...eventosDo(inventario), evento({ tipo: "CANCELADO", detalhe: "Inventário cancelado pelo operador." })] });
  },
};
