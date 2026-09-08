import { getDB, uid } from "@/db/db";
import type { Apropriacao } from "@/types";

export type ApropriacaoInput = Omit<
  Apropriacao,
  "id" | "criado_em" | "atualizado_em"
> & {
  id?: string;
};

async function buscarExistente(
  estoqueEquipamentoId: string,
  funcionarioId: string,
): Promise<Apropriacao | undefined> {
  return getDB()
    .apropriacoes
    .where(
      "[estoque_equipamento_id+funcionario_id]",
    )
    .equals([
      estoqueEquipamentoId,
      funcionarioId,
    ])
    .first();
}

async function validarRelacionamentos(
  projetoId: string,
  dados: ApropriacaoInput,
): Promise<void> {
  const db = getDB();

  const estoque =
    await db.estoque_equipamentos.get(
      dados.estoque_equipamento_id,
    );

  if (
    !estoque ||
    estoque.projeto_id !== projetoId
  ) {
    throw new Error(
      "O estoque de equipamento não pertence ao projeto atual.",
    );
  }

  const funcionario =
    await db.funcionarios.get(
      dados.funcionario_id,
    );

  if (
    !funcionario ||
    funcionario.projeto_id !== projetoId
  ) {
    throw new Error(
      "O funcionário não pertence ao projeto atual.",
    );
  }

  if (funcionario.status !== "ATIVO") {
    throw new Error(
      "Não é possível apropriar equipamento para funcionário inativo.",
    );
  }
}

function validarQuantidade(
  quantidade: number,
): void {
  if (
    !Number.isFinite(quantidade) ||
    quantidade <= 0
  ) {
    throw new Error(
      "A quantidade apropriada deve ser maior que zero.",
    );
  }
}

async function calcularTotalApropriado(
  estoqueEquipamentoId: string,
  ignorarId?: string,
): Promise<number> {
  const apropriacoes =
    await getDB()
      .apropriacoes
      .where("estoque_equipamento_id")
      .equals(estoqueEquipamentoId)
      .toArray();

  return apropriacoes.reduce(
    (total, apropriacao) => {
      if (
        ignorarId &&
        apropriacao.id === ignorarId
      ) {
        return total;
      }

      return total + apropriacao.quantidade;
    },
    0,
  );
}

export const apropriacoesRepo = {
  async listar(
    projetoId: string,
    estoqueEquipamentoId?: string,
  ): Promise<Apropriacao[]> {
    const db = getDB();

    let apropriacoes: Apropriacao[];

    if (estoqueEquipamentoId) {
      const estoque =
        await db.estoque_equipamentos.get(
          estoqueEquipamentoId,
        );

      if (
        !estoque ||
        estoque.projeto_id !== projetoId
      ) {
        throw new Error(
          "Estoque de equipamento não encontrado neste projeto.",
        );
      }

      apropriacoes =
        await db.apropriacoes
          .where("estoque_equipamento_id")
          .equals(estoqueEquipamentoId)
          .toArray();
    } else {
      const estoques =
        await db.estoque_equipamentos
          .where("projeto_id")
          .equals(projetoId)
          .toArray();

      const estoqueIds = new Set(
        estoques.map((estoque) => estoque.id),
      );

      const todas =
        await db.apropriacoes.toArray();

      apropriacoes = todas.filter(
        (apropriacao) =>
          estoqueIds.has(
            apropriacao.estoque_equipamento_id,
          ),
      );
    }

    return apropriacoes.sort(
      (a, b) =>
        b.atualizado_em.localeCompare(
          a.atualizado_em,
        ),
    );
  },

  async listarPorFuncionario(
    projetoId: string,
    funcionarioId: string,
  ): Promise<Apropriacao[]> {
    const db = getDB();

    const funcionario =
      await db.funcionarios.get(
        funcionarioId,
      );

    if (
      !funcionario ||
      funcionario.projeto_id !== projetoId
    ) {
      throw new Error(
        "Funcionário não encontrado neste projeto.",
      );
    }

    const apropriacoes =
      await db.apropriacoes
        .where("funcionario_id")
        .equals(funcionarioId)
        .toArray();

    const estoqueIds =
      new Set(
        (
          await db.estoque_equipamentos
            .where("projeto_id")
            .equals(projetoId)
            .toArray()
        ).map((estoque) => estoque.id),
      );

    return apropriacoes
      .filter((apropriacao) =>
        estoqueIds.has(
          apropriacao.estoque_equipamento_id,
        ),
      )
      .sort((a, b) =>
        b.atualizado_em.localeCompare(
          a.atualizado_em,
        ),
      );
  },

  async buscar(
    projetoId: string,
    apropriacaoId: string,
  ): Promise<Apropriacao | undefined> {
    const db = getDB();

    const apropriacao =
      await db.apropriacoes.get(
        apropriacaoId,
      );

    if (!apropriacao) {
      return undefined;
    }

    const estoque =
      await db.estoque_equipamentos.get(
        apropriacao.estoque_equipamento_id,
      );

    if (
      !estoque ||
      estoque.projeto_id !== projetoId
    ) {
      return undefined;
    }

    return apropriacao;
  },

  async buscarPorFuncionario(
    projetoId: string,
    estoqueEquipamentoId: string,
    funcionarioId: string,
  ): Promise<Apropriacao | undefined> {
    const db = getDB();

    const estoque =
      await db.estoque_equipamentos.get(
        estoqueEquipamentoId,
      );

    if (
      !estoque ||
      estoque.projeto_id !== projetoId
    ) {
      throw new Error(
        "Estoque de equipamento não encontrado neste projeto.",
      );
    }

    const funcionario =
      await db.funcionarios.get(
        funcionarioId,
      );

    if (
      !funcionario ||
      funcionario.projeto_id !== projetoId
    ) {
      throw new Error(
        "Funcionário não encontrado neste projeto.",
      );
    }

    return buscarExistente(
      estoqueEquipamentoId,
      funcionarioId,
    );
  },

  async salvar(
    projetoId: string,
    dados: ApropriacaoInput,
  ): Promise<Apropriacao> {
    const db = getDB();

    validarQuantidade(dados.quantidade);

    await validarRelacionamentos(
      projetoId,
      dados,
    );

    const estoque =
      await db.estoque_equipamentos.get(
        dados.estoque_equipamento_id,
      );

    if (!estoque) {
      throw new Error(
        "Estoque de equipamento não encontrado.",
      );
    }

    if (estoque.status !== "ATIVO") {
      throw new Error(
        "Não é possível apropriar um equipamento encerrado.",
      );
    }

    /*
     * Procuramos sempre pelo par:
     *
     * estoque_equipamento_id + funcionario_id
     *
     * Isso evita criar dois registros para a mesma
     * apropriação e respeita o índice composto do Dexie.
     */
    const existentePorPar =
      await buscarExistente(
        dados.estoque_equipamento_id,
        dados.funcionario_id,
      );

    /*
     * Se o caller informou um ID diferente do registro
     * existente para o mesmo par, evitamos criar duplicidade.
     */
    if (
      dados.id &&
      existentePorPar &&
      existentePorPar.id !== dados.id
    ) {
      throw new Error(
        "Já existe uma apropriação para este funcionário e equipamento.",
      );
    }

    const id =
      existentePorPar?.id ??
      dados.id ??
      uid();

    const existente =
      existentePorPar ??
      (dados.id
        ? await db.apropriacoes.get(dados.id)
        : undefined);

    if (
      existente &&
      existente.estoque_equipamento_id !==
        dados.estoque_equipamento_id
    ) {
      throw new Error(
        "A apropriação informada não pertence ao estoque de equipamento.",
      );
    }

    if (
      existente &&
      existente.funcionario_id !==
        dados.funcionario_id
    ) {
      throw new Error(
        "A apropriação informada não pertence ao funcionário.",
      );
    }

    /*
     * Quando estamos criando uma nova apropriação,
     * verificamos o saldo disponível para apropriação.
     *
     * Quando estamos atualizando a mesma apropriação,
     * ignoramos a quantidade anterior no cálculo.
     */
    const totalOutrasApropriacoes =
      await calcularTotalApropriado(
        dados.estoque_equipamento_id,
        existente?.id,
      );

    const disponivel =
      estoque.quantidade -
      estoque.devolvido -
      totalOutrasApropriacoes;

    if (dados.quantidade > disponivel) {
      throw new Error(
        `Quantidade indisponível para apropriação. Disponível: ${disponivel}.`,
      );
    }

    const agora =
      new Date().toISOString();

    const apropriacao: Apropriacao = {
      ...dados,
      id,
      criado_em:
        existente?.criado_em ?? agora,
      atualizado_em: agora,
    };

    await db.apropriacoes.put(
      apropriacao,
    );

    return apropriacao;
  },

  async incrementar(
    projetoId: string,
    estoqueEquipamentoId: string,
    funcionarioId: string,
    quantidade: number,
  ): Promise<Apropriacao> {
    validarQuantidade(quantidade);

    const existente =
      await buscarExistente(
        estoqueEquipamentoId,
        funcionarioId,
      );

    if (existente) {
      return this.salvar(projetoId, {
        ...existente,
        quantidade:
          existente.quantidade + quantidade,
      });
    }

    return this.salvar(projetoId, {
      estoque_equipamento_id:
        estoqueEquipamentoId,
      funcionario_id: funcionarioId,
      quantidade,
    });
  },

  async decrementar(
    projetoId: string,
    estoqueEquipamentoId: string,
    funcionarioId: string,
    quantidade: number,
  ): Promise<void> {
    validarQuantidade(quantidade);

    const existente =
      await buscarExistente(
        estoqueEquipamentoId,
        funcionarioId,
      );

    if (!existente) {
      throw new Error(
        "Não existe apropriação para este funcionário e equipamento.",
      );
    }

    if (
      quantidade > existente.quantidade
    ) {
      throw new Error(
        "A quantidade a retirar é maior que a quantidade apropriada.",
      );
    }

    const novaQuantidade =
      existente.quantidade - quantidade;

    if (novaQuantidade === 0) {
      await this.excluir(
        projetoId,
        existente.id,
      );

      return;
    }

    await this.salvar(projetoId, {
      ...existente,
      quantidade: novaQuantidade,
    });
  },

  async excluir(
    projetoId: string,
    apropriacaoId: string,
  ): Promise<void> {
    const apropriacao =
      await this.buscar(
        projetoId,
        apropriacaoId,
      );

    if (!apropriacao) {
      throw new Error(
        "Apropriação não encontrada neste projeto.",
      );
    }

    await getDB()
      .apropriacoes
      .delete(apropriacao.id);
  },
};