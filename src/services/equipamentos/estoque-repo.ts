import { getDB, uid } from "@/db/db";
import type {
  Equipamento,
  EstoqueEquipamento,
  EquipamentoVinculo,
  EquipamentoStatus,
} from "@/types";

export type EstoqueEquipamentoInput = {
  id?: string;
  equipamento_id: string;
  empresa_id: string;
  vinculo: EquipamentoVinculo;
  equipe_id?: string | null;
  patrimonio?: string | null;
  identificacao?: string | null;
  serial?: string | null;
  quantidade: number;
  devolvido?: number;
  data_entrada: string;
  referencia_documento?: string | null;
  observacoes?: string | null;
};

function normalizarTexto(
  valor?: string | null,
): string | null {
  const texto = valor?.trim();

  return texto ? texto : null;
}

function calcularStatus(
  quantidade: number,
  devolvido: number,
): EquipamentoStatus {
  return quantidade - devolvido > 0
    ? "ATIVO"
    : "ENCERRADO";
}

function validarQuantidade(
  equipamento: Equipamento,
  quantidade: number,
  devolvido: number,
): void {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error(
      "A quantidade deve ser maior que zero.",
    );
  }

  if (
    !Number.isFinite(devolvido) ||
    devolvido < 0 ||
    devolvido > quantidade
  ) {
    throw new Error(
      "A quantidade devolvida deve estar entre zero e a quantidade total.",
    );
  }

  if (
    equipamento.tipo_controle === "INDIVIDUAL" &&
    quantidade !== 1
  ) {
    throw new Error(
      "Equipamento com controle individual deve possuir quantidade igual a 1.",
    );
  }
}

async function validarEquipamento(
  projetoId: string,
  equipamentoId: string,
): Promise<Equipamento> {
  const equipamento =
    await getDB().equipamentos.get(equipamentoId);

  if (
    !equipamento ||
    equipamento.projeto_id !== projetoId
  ) {
    throw new Error(
      "Equipamento não encontrado neste projeto.",
    );
  }

  if (!equipamento.ativo) {
    throw new Error(
      "O cadastro do equipamento está inativo.",
    );
  }

  return equipamento;
}

async function validarEmpresa(
  projetoId: string,
  empresaId: string,
): Promise<void> {
  const empresa =
    await getDB().empresas.get(empresaId);

  if (
    !empresa ||
    empresa.projeto_id !== projetoId
  ) {
    throw new Error(
      "A empresa não pertence ao projeto.",
    );
  }

  if (!empresa.ativo) {
    throw new Error(
      "A empresa selecionada está inativa.",
    );
  }
}

async function validarEquipe(
  projetoId: string,
  equipeId?: string | null,
): Promise<void> {
  if (!equipeId) {
    return;
  }

  const equipe =
    await getDB().equipes.get(equipeId);

  if (
    !equipe ||
    equipe.projeto_id !== projetoId
  ) {
    throw new Error(
      "A equipe não pertence ao projeto.",
    );
  }

  if (!equipe.ativo) {
    throw new Error(
      "A equipe selecionada está inativa.",
    );
  }
}

async function validarIdentificacao(
  projetoId: string,
  identificacao: string | null,
  estoqueId?: string,
): Promise<void> {
  if (!identificacao) {
    return;
  }

  const registros =
    await getDB().estoque_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();

  const duplicado = registros.some(
    (registro) =>
      registro.id !== estoqueId &&
      registro.identificacao?.trim().toLowerCase() ===
        identificacao.toLowerCase(),
  );

  if (duplicado) {
    throw new Error(
      `Já existe um equipamento com a identificação "${identificacao}" neste projeto.`,
    );
  }
}

export const estoqueEquipamentosRepo = {
  async listar(
    projetoId: string,
  ): Promise<EstoqueEquipamento[]> {
    return getDB()
      .estoque_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();
  },

  async buscar(
    projetoId: string,
    estoqueEquipamentoId: string,
  ): Promise<EstoqueEquipamento | undefined> {
    const registro =
      await getDB()
        .estoque_equipamentos
        .get(estoqueEquipamentoId);

    if (
      !registro ||
      registro.projeto_id !== projetoId
    ) {
      return undefined;
    }

    return registro;
  },

  async salvar(
    projetoId: string,
    dados: EstoqueEquipamentoInput,
  ): Promise<EstoqueEquipamento> {
    const db = getDB();

    const equipamento = await validarEquipamento(
      projetoId,
      dados.equipamento_id,
    );

    await validarEmpresa(
      projetoId,
      dados.empresa_id,
    );

    await validarEquipe(
      projetoId,
      dados.equipe_id,
    );

    const quantidade = dados.quantidade;
    const devolvido = dados.devolvido ?? 0;

    validarQuantidade(
      equipamento,
      quantidade,
      devolvido,
    );

    const identificacao =
      normalizarTexto(dados.identificacao);

    await validarIdentificacao(
      projetoId,
      identificacao,
      dados.id,
    );

    if (!dados.data_entrada) {
      throw new Error(
        "A data de entrada é obrigatória.",
      );
    }

    const agora = new Date().toISOString();
    const id = dados.id ?? uid();

    const existente = dados.id
      ? await db.estoque_equipamentos.get(dados.id)
      : undefined;

    if (
      dados.id &&
      (
        !existente ||
        existente.projeto_id !== projetoId
      )
    ) {
      throw new Error(
        "Registro de estoque não encontrado neste projeto.",
      );
    }

    if (
      existente &&
      existente.equipamento_id !== dados.equipamento_id
    ) {
      throw new Error(
        "O equipamento do registro de estoque não pode ser alterado.",
      );
    }

    if (
      existente &&
      devolvido < existente.devolvido
    ) {
      throw new Error(
        "A quantidade devolvida não pode ser reduzida.",
      );
    }

    const estoqueEquipamento: EstoqueEquipamento = {
      id,
      projeto_id: projetoId,
      equipamento_id: dados.equipamento_id,
      empresa_id: dados.empresa_id,
      vinculo: dados.vinculo,
      equipe_id: dados.equipe_id ?? null,
      patrimonio: normalizarTexto(dados.patrimonio),
      identificacao,
      serial: normalizarTexto(dados.serial),
      quantidade,
      devolvido,
      status: calcularStatus(
        quantidade,
        devolvido,
      ),
      data_entrada: dados.data_entrada,
      referencia_documento: normalizarTexto(
        dados.referencia_documento,
      ),
      observacoes: normalizarTexto(
        dados.observacoes,
      ),
      criado_em: existente?.criado_em ?? agora,
      atualizado_em: agora,
    };

    await db.estoque_equipamentos.put(
      estoqueEquipamento,
    );

    return estoqueEquipamento;
  },

  async excluir(
    projetoId: string,
    estoqueEquipamentoId: string,
  ): Promise<void> {
    const db = getDB();

    const registro =
      await db.estoque_equipamentos.get(
        estoqueEquipamentoId,
      );

    if (
      !registro ||
      registro.projeto_id !== projetoId
    ) {
      throw new Error(
        "Registro de estoque não encontrado neste projeto.",
      );
    }

    if (registro.devolvido > 0) {
      throw new Error(
        "Não é possível excluir um equipamento que possui devolução registrada.",
      );
    }

    const apropriacoes =
      await db.apropriacoes
        .where("estoque_equipamento_id")
        .equals(estoqueEquipamentoId)
        .count();

    if (apropriacoes > 0) {
      throw new Error(
        "Não é possível excluir um equipamento que possui apropriações.",
      );
    }

    const movimentacoes =
      await db.movimentacoes_equipamentos
        .where("estoque_equipamento_id")
        .equals(estoqueEquipamentoId)
        .count();

    if (movimentacoes > 0) {
      throw new Error(
        "Não é possível excluir um equipamento que possui movimentações.",
      );
    }

    await db.estoque_equipamentos.delete(
      estoqueEquipamentoId,
    );
  },
};