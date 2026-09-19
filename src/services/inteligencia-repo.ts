import { getDB, uid } from "@/db/db";
import type {
  InteligenciaAcao,
  InteligenciaOrigem,
  InteligenciaPrioridade,
  InteligenciaResultado,
  InteligenciaStatus,
} from "@/types";

type RegistrarAcaoArgs = {
  projetoId: string;
  chave: string;
  assinatura: string;
  origem: InteligenciaOrigem;
  tipo: string;
  prioridade: InteligenciaPrioridade;
  titulo: string;
  descricao: string;
  regra?: string | null;
  produtoId?: string | null;
  equipeId?: string | null;
  referenciaId?: string | null;
};

function ordenarMaisRecentes(a: InteligenciaAcao, b: InteligenciaAcao) {
  return b.registrada_em.localeCompare(a.registrada_em);
}

async function obterPorChave(projetoId: string, chave: string) {
  return getDB().inteligencia_acoes
    .where("[projeto_id+chave]")
    .equals([projetoId, chave])
    .first();
}

export const inteligenciaRepo = {
  async listar(
    projetoId: string,
    opcoes: {
      status?: InteligenciaStatus | "TODOS";
      produtoId?: string | null;
      origens?: InteligenciaOrigem[];
      limite?: number;
    } = {},
  ): Promise<InteligenciaAcao[]> {
    const registros = await getDB().inteligencia_acoes.where("projeto_id").equals(projetoId).toArray();
    const origemSet = opcoes.origens?.length ? new Set(opcoes.origens) : null;

    return registros
      .filter((registro) => opcoes.status === "TODOS" || !opcoes.status || registro.status === opcoes.status)
      .filter((registro) => !opcoes.produtoId || registro.produto_id === opcoes.produtoId)
      .filter((registro) => !origemSet || origemSet.has(registro.origem))
      .sort(ordenarMaisRecentes)
      .slice(0, Math.max(1, opcoes.limite ?? 40));
  },

  async iniciar(args: RegistrarAcaoArgs): Promise<{ registro: InteligenciaAcao; novo: boolean }> {
    const existente = await obterPorChave(args.projetoId, args.chave);
    const agora = new Date().toISOString();

    if (existente) {
      if (existente.status === "CONCLUIDA") {
        return { registro: existente, novo: false };
      }

      const atualizado: InteligenciaAcao = {
        ...existente,
        assinatura: args.assinatura,
        prioridade: args.prioridade,
        titulo: args.titulo,
        descricao: args.descricao,
        regra: args.regra ?? existente.regra ?? null,
        produto_id: args.produtoId ?? existente.produto_id ?? null,
        equipe_id: args.equipeId ?? existente.equipe_id ?? null,
        referencia_id: args.referenciaId ?? existente.referencia_id ?? null,
        status: "EM_ANDAMENTO",
        iniciada_em: existente.iniciada_em || agora,
        atualizado_em: agora,
      };
      await getDB().inteligencia_acoes.put(atualizado);
      return { registro: atualizado, novo: false };
    }

    const registro: InteligenciaAcao = {
      id: uid(),
      projeto_id: args.projetoId,
      chave: args.chave,
      assinatura: args.assinatura,
      origem: args.origem,
      tipo: args.tipo,
      prioridade: args.prioridade,
      titulo: args.titulo,
      descricao: args.descricao,
      regra: args.regra ?? null,
      produto_id: args.produtoId ?? null,
      equipe_id: args.equipeId ?? null,
      referencia_id: args.referenciaId ?? null,
      status: "EM_ANDAMENTO",
      resultado: null,
      observacao: null,
      registrada_em: agora,
      iniciada_em: agora,
      concluida_em: null,
      atualizado_em: agora,
    };

    await getDB().inteligencia_acoes.add(registro);
    return { registro, novo: true };
  },

  async concluir(id: string, resultado: InteligenciaResultado, observacao?: string | null) {
    const registro = await getDB().inteligencia_acoes.get(id);
    if (!registro) throw new Error("Ação inteligente não encontrada.");
    if (registro.status === "CONCLUIDA") return registro;

    const agora = new Date().toISOString();
    const atualizado: InteligenciaAcao = {
      ...registro,
      status: "CONCLUIDA",
      resultado,
      observacao: observacao?.trim() || null,
      concluida_em: agora,
      atualizado_em: agora,
    };
    await getDB().inteligencia_acoes.put(atualizado);
    return atualizado;
  },

  async descartar(id: string, observacao?: string | null) {
    const registro = await getDB().inteligencia_acoes.get(id);
    if (!registro) throw new Error("Ação inteligente não encontrada.");
    const agora = new Date().toISOString();
    const atualizado: InteligenciaAcao = {
      ...registro,
      status: "DESCARTADA",
      observacao: observacao?.trim() || null,
      concluida_em: agora,
      atualizado_em: agora,
    };
    await getDB().inteligencia_acoes.put(atualizado);
    return atualizado;
  },

  async concluirPorReferencia(
    origem: InteligenciaOrigem,
    referenciaId: string,
    resultado: InteligenciaResultado,
    observacao?: string | null,
  ) {
    const registros = await getDB().inteligencia_acoes.where("referencia_id").equals(referenciaId).toArray();
    const alvo = registros.find((registro) => registro.origem === origem && registro.status === "EM_ANDAMENTO");
    if (!alvo) return null;
    return this.concluir(alvo.id, resultado, observacao);
  },

  async contarAssinatura(projetoId: string, assinatura: string) {
    const registros = await getDB().inteligencia_acoes.where("projeto_id").equals(projetoId).toArray();
    return registros.filter((registro) => registro.assinatura === assinatura).length;
  },
};
