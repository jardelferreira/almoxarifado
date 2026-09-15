import { getDB, uid } from "@/db/db";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { inventarioRepo } from "@/services/inventario-repo";
import type { InventarioItem, Movimentacao } from "@/types";

export type InferenciaInventario = {
  itemId: string;
  produtoId: string;
  equipeId: string;
  quantidadeAtual: number;
  quantidadeContada: number;
  diferenca: number;
  quantidadeApos: number;
};

function efeitoMovimento(movimento: Movimentacao) {
  if (movimento.tipo === "ENTRADA" || movimento.tipo === "DEVOLUCAO") return movimento.quantidade;
  if (movimento.tipo === "SAIDA") return -movimento.quantidade;
  return (movimento.sinal ?? 1) * movimento.quantidade;
}

function diferencasContadas(itens: InventarioItem[]) {
  return itens.filter(
    (item) => item.quantidade_contada != null && Math.abs(item.quantidade_contada - item.quantidade_sistema) > Number.EPSILON,
  );
}

async function obterSaldosAtuais(projetoId: string) {
  const db = getDB();
  const movimentacoes = await db.movimentacoes.where("projeto_id").equals(projetoId).toArray();
  const saldos = new Map<string, number>();

  for (const movimento of movimentacoes) {
    const chave = `${movimento.produto_id}:${movimento.equipe_id}`;
    saldos.set(chave, (saldos.get(chave) ?? 0) + efeitoMovimento(movimento));
  }

  return saldos;
}

async function montarInferencia(projetoId: string, itens: InventarioItem[]) {
  const saldosAtuais = await obterSaldosAtuais(projetoId);

  return itens
    .filter((item) => item.quantidade_contada != null)
    .map<InferenciaInventario>((item) => {
      if (!item.equipe_id) {
        throw new Error("Um item do inventário não possui equipe de estoque vinculada.");
      }

      const quantidadeAtual = saldosAtuais.get(`${item.produto_id}:${item.equipe_id}`) ?? 0;
      const quantidadeContada = item.quantidade_contada ?? 0;
      const diferenca = quantidadeContada - quantidadeAtual;

      return {
        itemId: item.id,
        produtoId: item.produto_id,
        equipeId: item.equipe_id,
        quantidadeAtual,
        quantidadeContada,
        diferenca,
        quantidadeApos: quantidadeAtual + diferenca,
      };
    });
}

async function gerarAjustes(
  inventarioId: string,
  projetoId: string,
  itens: InventarioItem[],
) {
  const db = getDB();
  const existentes = await db.movimentacoes.where("projeto_id").equals(projetoId).toArray();
  const marcador = `Ajuste gerado pelo inventário ${inventarioId}.`;
  if (existentes.some((movimento) => movimento.observacao === marcador)) {
    return { ajustesGerados: 0, jaAplicado: true };
  }

  const inferencias = await montarInferencia(projetoId, itens);
  const diferencas = inferencias.filter((item) => Math.abs(item.diferenca) > Number.EPSILON);
  if (!diferencas.length) return { ajustesGerados: 0, jaAplicado: false };

  const agora = new Date().toISOString();
  const movimentos: Movimentacao[] = diferencas.map((item) => ({
    id: uid(),
    projeto_id: projetoId,
    data: agora,
    tipo: "AJUSTE",
    produto_id: item.produtoId,
    quantidade: Math.abs(item.diferenca),
    sinal: item.diferenca > 0 ? 1 : -1,
    funcionario_id: null,
    encarregado_id: null,
    empresa_id: null,
    local_id: null,
    local_destino_id: null,
    movimentacao_origem_id: null,
    observacao: marcador,
    equipe_id: item.equipeId,
    documento_id: null,
    documento_item_id: null,
  }));

  await db.movimentacoes.bulkAdd(movimentos);
  return { ajustesGerados: movimentos.length, jaAplicado: false };
}

export const inventarioService = {
  async obterInferencia(inventarioId: string) {
    const db = getDB();
    const inventario = await db.inventarios.get(inventarioId);
    if (!inventario) throw new Error("Inventário não encontrado.");
    if (inventario.status !== "CONCLUIDO") throw new Error("A inferência do estoque está disponível após o encerramento do inventário.");

    const config = await configuracoesRepo.obter(inventario.projeto_id);
    if (!config.inventario.habilitado) throw new Error("O inventário está desabilitado nas configurações do projeto.");
    if (!config.estoque.permitir_ajustes) throw new Error("Os ajustes de estoque estão desabilitados nas configurações do projeto.");

    const itens = await inventarioRepo.itens(inventarioId);
    if (!itens.length) throw new Error("O inventário não possui itens.");

    const naoContados = itens.filter((item) => item.quantidade_contada == null);
    if (!config.inventario.permitir_inventario_parcial && naoContados.length > 0) {
      throw new Error(`Ainda existem ${naoContados.length} item(ns) sem contagem.`);
    }

    const marcador = `Ajuste gerado pelo inventário ${inventarioId}.`;
    const movimentacoes = await db.movimentacoes.where("projeto_id").equals(inventario.projeto_id).toArray();
    const jaAplicado = movimentacoes.some((movimento) => movimento.observacao === marcador);
    const inferencias = await montarInferencia(inventario.projeto_id, itens);

    return {
      inventarioId,
      itens: inferencias,
      jaAplicado,
    };
  },

  async encerrar(inventarioId: string) {
    const db = getDB();
    const inventario = await db.inventarios.get(inventarioId);
    if (!inventario) throw new Error("Inventário não encontrado.");
    if (inventario.status !== "ABERTO") throw new Error("Somente inventários abertos podem ser encerrados.");

    const config = await configuracoesRepo.obter(inventario.projeto_id);
    if (!config.inventario.habilitado) throw new Error("O inventário está desabilitado nas configurações do projeto.");

    const itens = await inventarioRepo.itens(inventarioId);
    if (itens.length === 0) throw new Error("O inventário não possui itens.");

    const naoContados = itens.filter((item) => item.quantidade_contada == null);
    if (!config.inventario.permitir_inventario_parcial && naoContados.length > 0) {
      throw new Error(`Ainda existem ${naoContados.length} item(ns) sem contagem.`);
    }

    if (config.inventario.ajustar_automaticamente && !config.estoque.permitir_ajustes) {
      throw new Error("O inventário está configurado para ajustar automaticamente, mas os ajustes de estoque estão desabilitados.");
    }

    const agora = new Date().toISOString();
    let ajustesGerados = 0;

    await db.transaction("rw", db.inventarios, db.inventario_itens, db.movimentacoes, async () => {
      if (config.inventario.ajustar_automaticamente) {
        const resultado = await gerarAjustes(inventarioId, inventario.projeto_id, itens);
        ajustesGerados = resultado.ajustesGerados;
      }

      await db.inventarios.update(inventarioId, {
        status: "CONCLUIDO",
        data_encerramento: agora,
        atualizado_em: agora,
      });
    });

    return {
      inventarioId,
      ajustesGerados,
      diferencas: diferencasContadas(itens).length,
      ajusteAutomatico: config.inventario.ajustar_automaticamente,
    };
  },

  async aplicarAjustes(inventarioId: string) {
    const db = getDB();
    const inventario = await db.inventarios.get(inventarioId);
    if (!inventario) throw new Error("Inventário não encontrado.");
    if (inventario.status !== "CONCLUIDO") throw new Error("Somente inventários concluídos podem atualizar o estoque.");

    const config = await configuracoesRepo.obter(inventario.projeto_id);
    if (!config.inventario.habilitado) throw new Error("O inventário está desabilitado nas configurações do projeto.");
    if (!config.estoque.permitir_ajustes) throw new Error("Os ajustes de estoque estão desabilitados nas configurações do projeto.");

    const itens = await inventarioRepo.itens(inventarioId);
    if (!itens.length) throw new Error("O inventário não possui itens.");

    const naoContados = itens.filter((item) => item.quantidade_contada == null);
    if (!config.inventario.permitir_inventario_parcial && naoContados.length > 0) {
      throw new Error(`Ainda existem ${naoContados.length} item(ns) sem contagem.`);
    }

    let ajustesGerados = 0;
    let jaAplicado = false;
    await db.transaction("rw", db.inventarios, db.inventario_itens, db.movimentacoes, async () => {
      const resultado = await gerarAjustes(inventarioId, inventario.projeto_id, itens);
      ajustesGerados = resultado.ajustesGerados;
      jaAplicado = resultado.jaAplicado;
      if (!jaAplicado) {
        await db.inventarios.update(inventarioId, { atualizado_em: new Date().toISOString() });
      }
    });

    return { inventarioId, ajustesGerados, jaAplicado };
  },
};
