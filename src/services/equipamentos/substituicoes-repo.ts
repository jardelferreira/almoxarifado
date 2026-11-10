import { getDB, uid } from "@/db/db";
import type {
  EstoqueEquipamento,
  MovimentacaoEquipamento,
  RegraConsumoEquipamento,
  SubstituicaoEquipamento,
} from "@/types";
import { estadoEquipamentosRepo } from "./estado-repo";
import { resolverRegrasEfetivas } from "./regras-consumo-repo";

export interface DadosSubstituicaoEquipamento {
  projetoId: string;
  estoqueOrigemId: string;
  equipamentoSubstitutoId: string;
  quantidade: number;
  data: string;
  patrimonio?: string | null;
  identificacao?: string | null;
  serial?: string | null;
  referenciaDocumento?: string | null;
  motivo?: string | null;
  observacoes?: string | null;
}

function texto(value: string | null | undefined): string | null {
  const normalizado = typeof value === "string" ? value.trim() : "";
  return normalizado || null;
}

function validarQuantidade(quantidade: number): void {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new Error("A quantidade da substituição deve ser um número inteiro maior que zero.");
  }
}

function criarMovimentacao(
  dados: Omit<MovimentacaoEquipamento, "id" | "criado_em" | "atualizado_em">,
  agora: string,
): MovimentacaoEquipamento {
  return {
    ...dados,
    id: uid(),
    criado_em: agora,
    atualizado_em: agora,
  };
}

function criarRegraHerdada(
  regra: RegraConsumoEquipamento,
  novoEquipamentoId: string,
  novoEstoqueId: string,
  agora: string,
): RegraConsumoEquipamento {
  return {
    ...regra,
    id: uid(),
    equipamento_id: novoEquipamentoId,
    estoque_equipamento_id: novoEstoqueId,
    origem: "MANUAL",
    observacao: regra.observacao
      ? `${regra.observacao} (herdada por substituição)`
      : "Herdada por substituição de equipamento.",
    criado_em: agora,
    atualizado_em: agora,
  };
}

export const substituicoesEquipamentosRepo = {
  async listar(projetoId: string): Promise<SubstituicaoEquipamento[]> {
    const rows = await getDB().substituicoes_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();

    return rows.sort((a, b) => `${b.data}|${b.criado_em}`.localeCompare(`${a.data}|${a.criado_em}`));
  },

  async buscar(
    projetoId: string,
    id: string,
  ): Promise<SubstituicaoEquipamento | undefined> {
    const row = await getDB().substituicoes_equipamentos.get(id);
    return row?.projeto_id === projetoId ? row : undefined;
  },

  async criar(dados: DadosSubstituicaoEquipamento): Promise<SubstituicaoEquipamento> {
    const db = getDB();
    validarQuantidade(dados.quantidade);

    const [origem, equipamentoSubstituto] = await Promise.all([
      db.estoque_equipamentos.get(dados.estoqueOrigemId),
      db.equipamentos.get(dados.equipamentoSubstitutoId),
    ]);

    if (!origem || origem.projeto_id !== dados.projetoId) {
      throw new Error("O equipamento a devolver não pertence ao projeto atual.");
    }
    if (!equipamentoSubstituto || equipamentoSubstituto.projeto_id !== dados.projetoId) {
      throw new Error("O equipamento substituto não pertence ao projeto atual.");
    }
    if (!equipamentoSubstituto.ativo || equipamentoSubstituto.situacao === "PLANEJADO") {
      throw new Error("O cadastro escolhido para o substituto não está disponível para operação.");
    }

    const equipamentoOrigem = await db.equipamentos.get(origem.equipamento_id);
    if (!equipamentoOrigem) {
      throw new Error("O cadastro do equipamento devolvido não foi encontrado.");
    }
    if (equipamentoOrigem.tipo_controle !== equipamentoSubstituto.tipo_controle) {
      throw new Error("O substituto deve manter o mesmo tipo de controle do equipamento devolvido.");
    }

    const estadoOrigem = await estadoEquipamentosRepo.calcular(dados.projetoId, origem.id);
    if (estadoOrigem.almoxarifado < dados.quantidade) {
      throw new Error("A quantidade solicitada não está disponível no Almoxarifado.");
    }
    if (equipamentoOrigem.tipo_controle === "INDIVIDUAL" && dados.quantidade !== 1) {
      throw new Error("Equipamentos individuais devem ser substituídos um por vez.");
    }

    const equipes = await db.equipes.where("projeto_id").equals(dados.projetoId).toArray();
    const almoxarifado = equipes.find((equipe) =>
      equipe.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "almoxarifado",
    );
    if (!almoxarifado) {
      throw new Error("A equipe Almoxarifado não foi encontrada neste projeto.");
    }

    const data = texto(dados.data);
    if (!data) throw new Error("Informe a data da substituição.");

    const regrasOrigem = await db.regras_consumo_equipamentos
      .where("projeto_id")
      .equals(dados.projetoId)
      .toArray();
    const regrasEfetivas = resolverRegrasEfetivas(
      regrasOrigem,
      origem.equipamento_id,
      origem.id,
      data,
    );

    const agora = new Date().toISOString();
    const novoEstoqueId = uid();
    const movimentacaoDevolucao = criarMovimentacao({
      projeto_id: dados.projetoId,
      estoque_equipamento_id: origem.id,
      tipo: "DEVOLUCAO_FORNECEDOR",
      quantidade: dados.quantidade,
      tipo_origem: "EQUIPE",
      origem_id: almoxarifado.id,
      tipo_destino: "EMPRESA",
      destino_id: origem.empresa_id,
      data,
      referencia_documento: texto(dados.referenciaDocumento),
      observacoes: texto(dados.observacoes),
    }, agora);
    const movimentacaoEntrada = criarMovimentacao({
      projeto_id: dados.projetoId,
      estoque_equipamento_id: novoEstoqueId,
      tipo: "ENTRADA",
      quantidade: dados.quantidade,
      tipo_origem: "EMPRESA",
      origem_id: origem.empresa_id,
      tipo_destino: "EQUIPE",
      destino_id: almoxarifado.id,
      data,
      referencia_documento: texto(dados.referenciaDocumento),
      observacoes: texto(dados.observacoes),
    }, agora);

    const novoEstoque: EstoqueEquipamento = {
      ...origem,
      id: novoEstoqueId,
      equipamento_id: equipamentoSubstituto.id,
      equipe_id: almoxarifado.id,
      patrimonio: equipamentoSubstituto.tipo_controle === "INDIVIDUAL" ? texto(dados.patrimonio) : null,
      identificacao: equipamentoSubstituto.tipo_controle === "INDIVIDUAL" ? texto(dados.identificacao) : null,
      serial: equipamentoSubstituto.tipo_controle === "INDIVIDUAL" ? texto(dados.serial) : null,
      quantidade: dados.quantidade,
      devolvido: 0,
      baixado: 0,
      status: "ATIVO",
      ativo: true,
      data_entrada: data,
      referencia_documento: texto(dados.referenciaDocumento),
      observacoes: texto(dados.observacoes),
      criado_em: agora,
      atualizado_em: agora,
    };

    const regrasHerdadas = regrasEfetivas.map((regra) =>
      criarRegraHerdada(regra, equipamentoSubstituto.id, novoEstoqueId, agora),
    );
    const substituicao: SubstituicaoEquipamento = {
      id: uid(),
      projeto_id: dados.projetoId,
      estoque_origem_id: origem.id,
      equipamento_origem_id: origem.equipamento_id,
      estoque_substituto_id: novoEstoque.id,
      equipamento_substituto_id: novoEstoque.equipamento_id,
      movimentacao_devolucao_id: movimentacaoDevolucao.id,
      movimentacao_entrada_id: movimentacaoEntrada.id,
      quantidade: dados.quantidade,
      data,
      referencia_documento: texto(dados.referenciaDocumento),
      motivo: texto(dados.motivo),
      observacoes: texto(dados.observacoes),
      regras_origem_ids: regrasEfetivas.map((regra) => regra.id),
      regras_substituto_ids: regrasHerdadas.map((regra) => regra.id),
      criado_em: agora,
    };

    await db.transaction(
      "rw",
      [
        db.estoque_equipamentos,
        db.movimentacoes_equipamentos,
        db.regras_consumo_equipamentos,
        db.substituicoes_equipamentos,
      ],
      async () => {
        const origemAtual = await db.estoque_equipamentos.get(origem.id);
        if (!origemAtual) throw new Error("O registro físico de origem não foi encontrado.");

        const devolvido = origemAtual.devolvido + dados.quantidade;
        if (devolvido > origemAtual.quantidade) {
          throw new Error("A quantidade devolvida ultrapassa o saldo físico do equipamento.");
        }

        await db.estoque_equipamentos.put({
          ...origemAtual,
          devolvido,
          status: devolvido + (origemAtual.baixado ?? 0) < origemAtual.quantidade ? "ATIVO" : "ENCERRADO",
          ativo: devolvido + (origemAtual.baixado ?? 0) < origemAtual.quantidade,
          atualizado_em: agora,
        });
        await db.estoque_equipamentos.add(novoEstoque);
        await db.movimentacoes_equipamentos.add(movimentacaoDevolucao);
        await db.movimentacoes_equipamentos.add(movimentacaoEntrada);
        if (regrasHerdadas.length > 0) {
          await db.regras_consumo_equipamentos.bulkAdd(regrasHerdadas);
        }
        await db.substituicoes_equipamentos.add(substituicao);
      },
    );

    return substituicao;
  },
};
