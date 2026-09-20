import { getDB, uid } from "@/db/db";
import type {
  Equipamento,
  EstoqueEquipamento,
  Produto,
  RegraConsumoEquipamento,
  RegraConsumoEquipamentoPeriodicidade,
  RegraConsumoEquipamentoDirecionador,
} from "@/types";

export interface DadosRegraConsumoEquipamento {
  equipamentoId: string;
  estoqueEquipamentoId: string | null;
  produtoId: string;
  fator: number;
  unidadeBaseId: string;
  unidadeConsumoId: string;
  direcionador: RegraConsumoEquipamentoDirecionador;
  periodicidade: RegraConsumoEquipamentoPeriodicidade | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  observacao: string | null;
  ativo: boolean;
}

function validarFator(fator: number): void {
  if (!Number.isFinite(fator) || fator <= 0) {
    throw new Error("O fator de consumo deve ser maior que zero.");
  }
}

function validarVigencia(inicio: string | null, fim: string | null): void {
  if (inicio && fim && inicio > fim) {
    throw new Error("A data final da vigência não pode ser anterior à data inicial.");
  }
}

function dataDentroDaVigencia(
  data: string,
  inicio: string | null,
  fim: string | null,
): boolean {
  if (inicio && data < inicio) return false;
  if (fim && data > fim) return false;
  return true;
}

function intervalosSobrepostos(
  inicioA: string | null,
  fimA: string | null,
  inicioB: string | null,
  fimB: string | null,
): boolean {
  const inicio1 = inicioA ?? "0000-01-01";
  const fim1 = fimA ?? "9999-12-31";
  const inicio2 = inicioB ?? "0000-01-01";
  const fim2 = fimB ?? "9999-12-31";

  return inicio1 <= fim2 && inicio2 <= fim1;
}

async function obterContexto(
  projetoId: string,
  dados: DadosRegraConsumoEquipamento,
): Promise<{
  equipamento: Equipamento;
  produto: Produto;
  estoque: EstoqueEquipamento | null;
}> {
  const db = getDB();
  const [equipamento, produto, estoque, unidadeBase, unidadeConsumo] = await Promise.all([
    db.equipamentos.get(dados.equipamentoId),
    db.produtos.get(dados.produtoId),
    dados.estoqueEquipamentoId
      ? db.estoque_equipamentos.get(dados.estoqueEquipamentoId)
      : Promise.resolve(null),
    db.unidades.get(dados.unidadeBaseId),
    db.unidades.get(dados.unidadeConsumoId),
  ]);

  if (!equipamento || equipamento.projeto_id !== projetoId) {
    throw new Error("Equipamento não encontrado neste projeto.");
  }

  if (!produto || produto.projeto_id !== projetoId) {
    throw new Error("Produto não encontrado neste projeto.");
  }

  if (!unidadeBase || !unidadeBase.ativo) {
    throw new Error("A unidade da base não foi encontrada ou está inativa.");
  }

  if (!unidadeConsumo || !unidadeConsumo.ativo) {
    throw new Error("A unidade de consumo não foi encontrada ou está inativa.");
  }

  if (estoque) {
    if (estoque.projeto_id !== projetoId || estoque.equipamento_id !== equipamento.id) {
      throw new Error("O registro físico selecionado não pertence ao equipamento informado.");
    }
  } else if (dados.estoqueEquipamentoId) {
    throw new Error("Registro físico do equipamento não encontrado.");
  }

  return { equipamento, produto, estoque: estoque ?? null };
}

async function validarConflito(
  projetoId: string,
  dados: DadosRegraConsumoEquipamento,
  idIgnorar: string | null,
): Promise<void> {
  const regras = await getDB().regras_consumo_equipamentos
    .where("projeto_id")
    .equals(projetoId)
    .toArray();

  const conflito = regras.find((regra) => {
    if (regra.id === idIgnorar) return false;
    if (regra.ativo !== dados.ativo) return false;
    if (!regra.ativo || !dados.ativo) return false;
    if (regra.equipamento_id !== dados.equipamentoId) return false;
    if (regra.estoque_equipamento_id !== dados.estoqueEquipamentoId) return false;
    if (regra.produto_id !== dados.produtoId) return false;
    if (regra.direcionador !== dados.direcionador) return false;
    if (regra.periodicidade !== dados.periodicidade) return false;

    return intervalosSobrepostos(
      regra.vigencia_inicio,
      regra.vigencia_fim,
      dados.vigenciaInicio,
      dados.vigenciaFim,
    );
  });

  if (conflito) {
    throw new Error(
      "Já existe uma regra ativa para este equipamento, produto, direcionador e período de vigência.",
    );
  }
}

export const regrasConsumoEquipamentosRepo = {
  async listarProjeto(projetoId: string): Promise<RegraConsumoEquipamento[]> {
    const rows = await getDB().regras_consumo_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();

    return rows.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  },

  async listarPorEquipamento(
    projetoId: string,
    equipamentoId: string,
  ): Promise<RegraConsumoEquipamento[]> {
    const rows = await getDB().regras_consumo_equipamentos
      .where("[projeto_id+equipamento_id]")
      .equals([projetoId, equipamentoId])
      .toArray();

    return rows.sort((a, b) => {
      if (a.estoque_equipamento_id !== b.estoque_equipamento_id) {
        return a.estoque_equipamento_id ? 1 : -1;
      }
      return b.atualizado_em.localeCompare(a.atualizado_em);
    });
  },

  async listarEfetivas(
    projetoId: string,
    equipamentoId: string,
    estoqueEquipamentoId: string | null,
    dataReferencia = new Date().toISOString().slice(0, 10),
  ): Promise<RegraConsumoEquipamento[]> {
    const regras = await this.listarPorEquipamento(projetoId, equipamentoId);
    const vigentes = regras.filter(
      (regra) =>
        regra.ativo &&
        dataDentroDaVigencia(
          dataReferencia,
          regra.vigencia_inicio,
          regra.vigencia_fim,
        ),
    );

    const efetivas = new Map<string, RegraConsumoEquipamento>();

    for (const regra of vigentes.filter((item) => item.estoque_equipamento_id === null)) {
      efetivas.set(
        `${regra.produto_id}|${regra.direcionador}|${regra.periodicidade ?? ""}`,
        regra,
      );
    }

    if (estoqueEquipamentoId) {
      for (const regra of vigentes.filter(
        (item) => item.estoque_equipamento_id === estoqueEquipamentoId,
      )) {
        efetivas.set(
          `${regra.produto_id}|${regra.direcionador}|${regra.periodicidade ?? ""}`,
          regra,
        );
      }
    }

    return [...efetivas.values()].sort((a, b) => a.produto_id.localeCompare(b.produto_id));
  },

  async criar(
    projetoId: string,
    dados: DadosRegraConsumoEquipamento,
  ): Promise<RegraConsumoEquipamento> {
    validarFator(dados.fator);
    validarVigencia(dados.vigenciaInicio, dados.vigenciaFim);
    await obterContexto(projetoId, dados);
    await validarConflito(projetoId, dados, null);

    const agora = new Date().toISOString();
    const regra: RegraConsumoEquipamento = {
      id: uid(),
      projeto_id: projetoId,
      equipamento_id: dados.equipamentoId,
      estoque_equipamento_id: dados.estoqueEquipamentoId,
      produto_id: dados.produtoId,
      fator: dados.fator,
      unidade_base_id: dados.unidadeBaseId,
      unidade_consumo_id: dados.unidadeConsumoId,
      direcionador: dados.direcionador,
      periodicidade: dados.periodicidade,
      vigencia_inicio: dados.vigenciaInicio,
      vigencia_fim: dados.vigenciaFim,
      origem: "MANUAL",
      observacao: dados.observacao,
      ativo: dados.ativo,
      criado_em: agora,
      atualizado_em: agora,
    };

    await getDB().regras_consumo_equipamentos.add(regra);
    return regra;
  },

  async atualizar(
    projetoId: string,
    regraId: string,
    dados: DadosRegraConsumoEquipamento,
  ): Promise<RegraConsumoEquipamento> {
    const atual = await getDB().regras_consumo_equipamentos.get(regraId);
    if (!atual || atual.projeto_id !== projetoId) {
      throw new Error("Regra de consumo não encontrada neste projeto.");
    }

    validarFator(dados.fator);
    validarVigencia(dados.vigenciaInicio, dados.vigenciaFim);
    await obterContexto(projetoId, dados);
    await validarConflito(projetoId, dados, regraId);

    const atualizado: RegraConsumoEquipamento = {
      ...atual,
      equipamento_id: dados.equipamentoId,
      estoque_equipamento_id: dados.estoqueEquipamentoId,
      produto_id: dados.produtoId,
      fator: dados.fator,
      unidade_base_id: dados.unidadeBaseId,
      unidade_consumo_id: dados.unidadeConsumoId,
      direcionador: dados.direcionador,
      periodicidade: dados.periodicidade,
      vigencia_inicio: dados.vigenciaInicio,
      vigencia_fim: dados.vigenciaFim,
      observacao: dados.observacao,
      ativo: dados.ativo,
      atualizado_em: new Date().toISOString(),
    };

    await getDB().regras_consumo_equipamentos.put(atualizado);
    return atualizado;
  },

  async remover(projetoId: string, regraId: string): Promise<void> {
    const regra = await getDB().regras_consumo_equipamentos.get(regraId);
    if (!regra || regra.projeto_id !== projetoId) {
      throw new Error("Regra de consumo não encontrada neste projeto.");
    }
    await getDB().regras_consumo_equipamentos.delete(regraId);
  },
};
