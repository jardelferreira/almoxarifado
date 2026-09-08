import { getDB, uid } from "@/db/db";
import type {
  Apropriacao,
  Equipe,
  MovimentacaoEquipamento,
  MovimentacaoEquipamentoParte,
  MovimentacaoEquipamentoTipo,
} from "@/types";
import {
  estadoEquipamentosRepo,
  type EstadoEstoqueEquipamento,
} from "./estado-repo";

type MovimentacaoEquipamentoInput = Omit<
  MovimentacaoEquipamento,
  "id" | "criado_em" | "atualizado_em"
> & {
  id?: string;
};

function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function validarQuantidade(quantidade: number): void {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("A quantidade deve ser maior que zero.");
  }
}

async function obterEquipes(
  projetoId: string,
): Promise<{
  almoxarifado: Equipe;
  manutencao: Equipe;
}> {
  const db = getDB();

  const equipes = await db.equipes
    .where("projeto_id")
    .equals(projetoId)
    .toArray();

  const almoxarifado = equipes.find(
    (equipe) =>
      normalizarNome(equipe.nome) === "almoxarifado",
  );

  const manutencao = equipes.find(
    (equipe) =>
      normalizarNome(equipe.nome) === "manutencao",
  );

  if (!almoxarifado) {
    throw new Error(
      "A equipe Almoxarifado não foi encontrada neste projeto.",
    );
  }

  if (!manutencao) {
    throw new Error(
      "A equipe Manutenção não foi encontrada neste projeto.",
    );
  }

  return {
    almoxarifado,
    manutencao,
  };
}

async function validarFuncionario(
  projetoId: string,
  funcionarioId: string,
): Promise<void> {
  const funcionario = await getDB().funcionarios.get(
    funcionarioId,
  );

  if (
    !funcionario ||
    funcionario.projeto_id !== projetoId
  ) {
    throw new Error(
      "O funcionário não pertence ao projeto da movimentação.",
    );
  }

  if (funcionario.status !== "ATIVO") {
    throw new Error(
      "O funcionário está inativo.",
    );
  }
}

async function validarEquipe(
  projetoId: string,
  equipeId: string,
): Promise<Equipe> {
  const equipe = await getDB().equipes.get(equipeId);

  if (
    !equipe ||
    equipe.projeto_id !== projetoId
  ) {
    throw new Error(
      "A equipe não pertence ao projeto da movimentação.",
    );
  }

  if (!equipe.ativo) {
    throw new Error(
      "A equipe está inativa.",
    );
  }

  return equipe;
}

async function validarEmpresa(
  projetoId: string,
  empresaId: string,
): Promise<void> {
  const empresa = await getDB().empresas.get(
    empresaId,
  );

  if (
    !empresa ||
    empresa.projeto_id !== projetoId
  ) {
    throw new Error(
      "A empresa não pertence ao projeto da movimentação.",
    );
  }

  if (!empresa.ativo) {
    throw new Error(
      "A empresa está inativa.",
    );
  }
}

function validarParticipante(
  parte: MovimentacaoEquipamentoParte,
): void {
  const partes: MovimentacaoEquipamentoParte[] = [
    "EMPRESA",
    "EQUIPE",
    "FUNCIONARIO",
  ];

  if (!partes.includes(parte)) {
    throw new Error(
      "Tipo de participante inválido.",
    );
  }
}

function validarTipo(
  tipo: MovimentacaoEquipamentoTipo,
): void {
  const tipos: MovimentacaoEquipamentoTipo[] = [
    "ENTRADA",
    "SAIDA",
    "DEVOLUCAO",
    "TRANSFERENCIA",
    "MANUTENCAO",
    "RETIRADA_MANUTENCAO",
    "RETORNO_MANUTENCAO",
    "DEVOLUCAO_FORNECEDOR",
  ];

  if (!tipos.includes(tipo)) {
    throw new Error(
      "Tipo de movimentação inválido.",
    );
  }
}

function exigirDisponibilidade(
  quantidadeDisponivel: number,
  quantidadeSolicitada: number,
  mensagem: string,
): void {
  if (
    quantidadeSolicitada >
    quantidadeDisponivel
  ) {
    throw new Error(mensagem);
  }
}

async function obterApropriacao(
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

async function adicionarApropriacao(
  estoqueEquipamentoId: string,
  funcionarioId: string,
  quantidade: number,
  agora: string,
): Promise<void> {
  const db = getDB();

  const existente = await obterApropriacao(
    estoqueEquipamentoId,
    funcionarioId,
  );

  if (existente) {
    await db.apropriacoes.put({
      ...existente,
      quantidade:
        existente.quantidade + quantidade,
      atualizado_em: agora,
    });

    return;
  }

  const apropriacao: Apropriacao = {
    id: uid(),
    estoque_equipamento_id:
      estoqueEquipamentoId,
    funcionario_id: funcionarioId,
    quantidade,
    criado_em: agora,
    atualizado_em: agora,
  };

  await db.apropriacoes.put(apropriacao);
}

async function removerApropriacao(
  estoqueEquipamentoId: string,
  funcionarioId: string,
  quantidade: number,
  agora: string,
): Promise<void> {
  const db = getDB();

  const apropriacao = await obterApropriacao(
    estoqueEquipamentoId,
    funcionarioId,
  );

  if (!apropriacao) {
    throw new Error(
      "Não existe apropriação para este funcionário e equipamento.",
    );
  }

  if (quantidade > apropriacao.quantidade) {
    throw new Error(
      "A quantidade devolvida é maior que a quantidade apropriada pelo funcionário.",
    );
  }

  const novaQuantidade =
    apropriacao.quantidade - quantidade;

  if (novaQuantidade === 0) {
    await db.apropriacoes.delete(
      apropriacao.id,
    );

    return;
  }

  await db.apropriacoes.put({
    ...apropriacao,
    quantidade: novaQuantidade,
    atualizado_em: agora,
  });
}

async function atualizarApropriacoes(
  movimentacao: MovimentacaoEquipamento,
  agora: string,
): Promise<void> {
  const {
    tipo,
    estoque_equipamento_id,
    quantidade,
    tipo_origem,
    origem_id,
    tipo_destino,
    destino_id,
  } = movimentacao;

  switch (tipo) {
    case "SAIDA":
      await adicionarApropriacao(
        estoque_equipamento_id,
        destino_id,
        quantidade,
        agora,
      );
      return;

    case "DEVOLUCAO":
      await removerApropriacao(
        estoque_equipamento_id,
        origem_id,
        quantidade,
        agora,
      );
      return;

    case "TRANSFERENCIA":
      await removerApropriacao(
        estoque_equipamento_id,
        origem_id,
        quantidade,
        agora,
      );

      await adicionarApropriacao(
        estoque_equipamento_id,
        destino_id,
        quantidade,
        agora,
      );

      return;

    case "MANUTENCAO":
      if (tipo_origem === "FUNCIONARIO") {
        await removerApropriacao(
          estoque_equipamento_id,
          origem_id,
          quantidade,
          agora,
        );
      }

      return;

    default:
      return;
  }
}

function validarEstadoDaOrigem(
  movimentacao: MovimentacaoEquipamentoInput,
  estado: EstadoEstoqueEquipamento,
  equipes: {
    almoxarifado: Equipe;
    manutencao: Equipe;
  },
): void {
  const {
    tipo,
    quantidade,
    tipo_origem,
    origem_id,
  } = movimentacao;

  switch (tipo) {
    case "SAIDA":
      exigirDisponibilidade(
        estado.almoxarifado,
        quantidade,
        "Quantidade insuficiente no Almoxarifado.",
      );
      return;

    case "DEVOLUCAO": {
      const disponivel =
        estado.funcionarios.get(
          origem_id,
        ) ?? 0;

      exigirDisponibilidade(
        disponivel,
        quantidade,
        "O funcionário não possui quantidade suficiente deste equipamento.",
      );

      return;
    }

    case "TRANSFERENCIA": {
      const disponivel =
        estado.funcionarios.get(
          origem_id,
        ) ?? 0;

      exigirDisponibilidade(
        disponivel,
        quantidade,
        "O funcionário de origem não possui quantidade suficiente deste equipamento.",
      );

      return;
    }

    case "MANUTENCAO":
      if (tipo_origem === "EQUIPE") {
        if (
          origem_id ===
          equipes.almoxarifado.id
        ) {
          exigirDisponibilidade(
            estado.almoxarifado,
            quantidade,
            "Quantidade insuficiente no Almoxarifado para envio à manutenção.",
          );

          return;
        }

        throw new Error(
          "A única equipe permitida como origem de MANUTENCAO é o Almoxarifado.",
        );
      }

      if (tipo_origem === "FUNCIONARIO") {
        const disponivel =
          estado.funcionarios.get(
            origem_id,
          ) ?? 0;

        exigirDisponibilidade(
          disponivel,
          quantidade,
          "O funcionário não possui quantidade suficiente para enviar à manutenção.",
        );

        return;
      }

      throw new Error(
        "Origem inválida para MANUTENCAO.",
      );

    case "RETIRADA_MANUTENCAO":
      if (
        origem_id ===
        equipes.manutencao.id
      ) {
        exigirDisponibilidade(
          estado.manutencao,
          quantidade,
          "Quantidade insuficiente na Manutenção.",
        );

        return;
      }

      if (
        origem_id ===
        equipes.almoxarifado.id
      ) {
        exigirDisponibilidade(
          estado.almoxarifado,
          quantidade,
          "Quantidade insuficiente no Almoxarifado.",
        );

        return;
      }

      throw new Error(
        "Origem inválida para retirada de manutenção.",
      );

    case "RETORNO_MANUTENCAO":
      exigirDisponibilidade(
        estado.empresa,
        quantidade,
        "Não há quantidade suficiente fora do projeto para retorno da manutenção.",
      );
      return;

    case "DEVOLUCAO_FORNECEDOR":
      if (
        origem_id ===
        equipes.almoxarifado.id
      ) {
        exigirDisponibilidade(
          estado.almoxarifado,
          quantidade,
          "Quantidade insuficiente no Almoxarifado para devolução ao fornecedor.",
        );

        return;
      }

      if (
        origem_id ===
        equipes.manutencao.id
      ) {
        exigirDisponibilidade(
          estado.manutencao,
          quantidade,
          "Quantidade insuficiente na Manutenção para devolução ao fornecedor.",
        );

        return;
      }

      throw new Error(
        "Origem inválida para devolução ao fornecedor.",
      );

    case "ENTRADA":
      return;

    default:
      throw new Error(
        "Tipo de movimentação não suportado.",
      );
  }
}

function validarRegraDoTipo(
  movimentacao: MovimentacaoEquipamentoInput,
  equipes: {
    almoxarifado: Equipe;
    manutencao: Equipe;
  },
): void {
  const {
    tipo,
    tipo_origem,
    origem_id,
    tipo_destino,
    destino_id,
  } = movimentacao;

  switch (tipo) {
    case "ENTRADA":
      if (
        tipo_origem !== "EMPRESA" ||
        tipo_destino !== "EQUIPE" ||
        destino_id !==
          equipes.almoxarifado.id
      ) {
        throw new Error(
          "ENTRADA deve ser Empresa → Almoxarifado.",
        );
      }
      return;

    case "SAIDA":
      if (
        tipo_origem !== "EQUIPE" ||
        origem_id !==
          equipes.almoxarifado.id ||
        tipo_destino !== "FUNCIONARIO"
      ) {
        throw new Error(
          "SAIDA deve ser Almoxarifado → Funcionário.",
        );
      }
      return;

    case "DEVOLUCAO":
      if (
        tipo_origem !== "FUNCIONARIO" ||
        tipo_destino !== "EQUIPE" ||
        destino_id !==
          equipes.almoxarifado.id
      ) {
        throw new Error(
          "DEVOLUCAO deve ser Funcionário → Almoxarifado.",
        );
      }
      return;

    case "TRANSFERENCIA":
      if (
        tipo_origem !== "FUNCIONARIO" ||
        tipo_destino !== "FUNCIONARIO"
      ) {
        throw new Error(
          "TRANSFERENCIA deve ser Funcionário → Funcionário.",
        );
      }

      if (origem_id === destino_id) {
        throw new Error(
          "O funcionário de origem e destino não podem ser iguais.",
        );
      }

      return;

    case "MANUTENCAO":
      if (
        tipo_destino !== "EQUIPE" ||
        destino_id !== equipes.manutencao.id
      ) {
        throw new Error(
          "MANUTENCAO deve ter a equipe Manutenção como destino.",
        );
      }

      if (
        tipo_origem !== "EQUIPE" &&
        tipo_origem !== "FUNCIONARIO"
      ) {
        throw new Error(
          "MANUTENCAO deve partir do Almoxarifado ou de um funcionário.",
        );
      }

      return;

    case "RETIRADA_MANUTENCAO":
      if (
        tipo_origem !== "EQUIPE" ||
        (origem_id !==
          equipes.almoxarifado.id &&
          origem_id !==
            equipes.manutencao.id) ||
        tipo_destino !== "EMPRESA"
      ) {
        throw new Error(
          "RETIRADA_MANUTENCAO deve ser Almoxarifado/Manutenção → Empresa.",
        );
      }
      return;

    case "RETORNO_MANUTENCAO":
      if (
        tipo_origem !== "EMPRESA" ||
        tipo_destino !== "EQUIPE" ||
        destino_id !==
          equipes.almoxarifado.id
      ) {
        throw new Error(
          "RETORNO_MANUTENCAO deve ser Empresa → Almoxarifado.",
        );
      }
      return;

    case "DEVOLUCAO_FORNECEDOR":
      if (
        tipo_origem !== "EQUIPE" ||
        (origem_id !==
          equipes.almoxarifado.id &&
          origem_id !==
            equipes.manutencao.id) ||
        tipo_destino !== "EMPRESA"
      ) {
        throw new Error(
          "DEVOLUCAO_FORNECEDOR deve ser Almoxarifado/Manutenção → Empresa.",
        );
      }
      return;

    default:
      throw new Error(
        "Tipo de movimentação não suportado.",
      );
  }
}

async function validarParticipantes(
  movimentacao: MovimentacaoEquipamentoInput,
): Promise<void> {
  const {
    projeto_id,
    tipo_origem,
    origem_id,
    tipo_destino,
    destino_id,
  } = movimentacao;

  validarParticipante(tipo_origem);
  validarParticipante(tipo_destino);

  if (tipo_origem === "EQUIPE") {
    await validarEquipe(
      projeto_id,
      origem_id,
    );
  }

  if (tipo_origem === "FUNCIONARIO") {
    await validarFuncionario(
      projeto_id,
      origem_id,
    );
  }

  if (tipo_origem === "EMPRESA") {
    await validarEmpresa(
      projeto_id,
      origem_id,
    );
  }

  if (tipo_destino === "EQUIPE") {
    await validarEquipe(
      projeto_id,
      destino_id,
    );
  }

  if (tipo_destino === "FUNCIONARIO") {
    await validarFuncionario(
      projeto_id,
      destino_id,
    );
  }

  if (tipo_destino === "EMPRESA") {
    await validarEmpresa(
      projeto_id,
      destino_id,
    );
  }
}

async function validarEntradaUnica(
  estoqueEquipamentoId: string,
  quantidade: number,
): Promise<void> {
  const movimentacoes =
    await getDB()
      .movimentacoes_equipamentos
      .where("estoque_equipamento_id")
      .equals(estoqueEquipamentoId)
      .toArray();

  const existeEntrada = movimentacoes.some(
    (movimentacao) =>
      movimentacao.tipo === "ENTRADA",
  );

  if (existeEntrada) {
    throw new Error(
      "Este estoque de equipamento já possui uma entrada registrada.",
    );
  }

  const estoque =
    await getDB().estoque_equipamentos.get(
      estoqueEquipamentoId,
    );

  if (!estoque) {
    throw new Error(
      "Estoque de equipamento não encontrado.",
    );
  }

  if (quantidade !== estoque.quantidade) {
    throw new Error(
      "A quantidade da ENTRADA deve ser igual à quantidade registrada no estoque.",
    );
  }
}

export const movimentacoesEquipamentosRepo = {
  async listar(
    projetoId: string,
  ): Promise<MovimentacaoEquipamento[]> {
    return getDB()
      .movimentacoes_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray()
      .then((rows) =>
        rows.sort((a, b) => {
          const dataA = `${a.data}|${a.criado_em}`;
          const dataB = `${b.data}|${b.criado_em}`;

          return dataB.localeCompare(dataA);
        }),
      );
  },

  async listarPorEstoque(
    projetoId: string,
    estoqueEquipamentoId: string,
  ): Promise<MovimentacaoEquipamento[]> {
    const estoque =
      await getDB()
        .estoque_equipamentos
        .get(estoqueEquipamentoId);

    if (
      !estoque ||
      estoque.projeto_id !== projetoId
    ) {
      throw new Error(
        "Estoque de equipamento não encontrado neste projeto.",
      );
    }

    const rows =
      await getDB()
        .movimentacoes_equipamentos
        .where("estoque_equipamento_id")
        .equals(estoqueEquipamentoId)
        .toArray();

    return rows.sort((a, b) => {
      const dataA = `${a.data}|${a.criado_em}`;
      const dataB = `${b.data}|${b.criado_em}`;

      return dataB.localeCompare(dataA);
    });
  },

  async salvar(
    dados: MovimentacaoEquipamentoInput,
  ): Promise<MovimentacaoEquipamento> {
    const db = getDB();

    validarTipo(dados.tipo);
    validarQuantidade(dados.quantidade);

    const estoque =
      await db.estoque_equipamentos.get(
        dados.estoque_equipamento_id,
      );

    if (
      !estoque ||
      estoque.projeto_id !== dados.projeto_id
    ) {
      throw new Error(
        "O estoque de equipamento não pertence ao projeto da movimentação.",
      );
    }

    const equipamento =
      await db.equipamentos.get(
        estoque.equipamento_id,
      );

    if (
      !equipamento ||
      equipamento.projeto_id !==
        dados.projeto_id
    ) {
      throw new Error(
        "O equipamento não pertence ao projeto da movimentação.",
      );
    }

    const equipes = await obterEquipes(
      dados.projeto_id,
    );

    validarRegraDoTipo(
      dados,
      equipes,
    );

    await validarParticipantes(dados);

    /*
     * ENTRADA é um evento inicial.
     * O registro de estoque já representa a existência
     * física das unidades no Almoxarifado.
     */
    if (dados.tipo === "ENTRADA") {
      await validarEntradaUnica(
        dados.estoque_equipamento_id,
        dados.quantidade,
      );
    } else {
      /*
       * Para qualquer outra operação, reconstruímos o estado
       * atual e validamos a quantidade na localização correta.
       */
      const estado =
        await estadoEquipamentosRepo.calcular(
          dados.projeto_id,
          dados.estoque_equipamento_id,
        );

      validarEstadoDaOrigem(
        dados,
        estado,
        equipes,
      );
    }

    const agora = new Date().toISOString();

    const movimentacao: MovimentacaoEquipamento =
      {
        ...dados,
        id: dados.id ?? uid(),
        criado_em: agora,
        atualizado_em: agora,
      };

    /*
     * Movimentações existentes não devem ser sobrescritas
     * porque isso poderia invalidar todo o histórico posterior.
     */
    if (dados.id) {
      const existente =
        await db.movimentacoes_equipamentos.get(
          dados.id,
        );

      if (!existente) {
        throw new Error(
          "Movimentação não encontrada.",
        );
      }

      if (
        existente.projeto_id !==
        dados.projeto_id
      ) {
        throw new Error(
          "A movimentação não pertence ao projeto atual.",
        );
      }

      throw new Error(
        "Movimentações existentes não podem ser alteradas. Registre uma nova movimentação para corrigir o histórico.",
      );
    }

    await db.transaction(
      "rw",
      [
        db.movimentacoes_equipamentos,
        db.apropriacoes,
        db.estoque_equipamentos,
      ],
      async () => {
        /*
         * DEVOLUCAO_FORNECEDOR é a única movimentação
         * que reduz permanentemente o saldo físico.
         */
        if (
          movimentacao.tipo ===
          "DEVOLUCAO_FORNECEDOR"
        ) {
          const estoqueAtual =
            await db.estoque_equipamentos.get(
              estoque.id,
            );

          if (!estoqueAtual) {
            throw new Error(
              "Estoque de equipamento não encontrado.",
            );
          }

          const novoDevolvido =
            estoqueAtual.devolvido +
            movimentacao.quantidade;

          if (
            novoDevolvido >
            estoqueAtual.quantidade
          ) {
            throw new Error(
              "A quantidade devolvida não pode ultrapassar a quantidade total do estoque.",
            );
          }

          await db.estoque_equipamentos.put({
            ...estoqueAtual,
            devolvido: novoDevolvido,
            status:
              novoDevolvido <
              estoqueAtual.quantidade
                ? "ATIVO"
                : "ENCERRADO",
            atualizado_em: agora,
          });
        }

        await atualizarApropriacoes(
          movimentacao,
          agora,
        );

        await db.movimentacoes_equipamentos.put(
          movimentacao,
        );
      },
    );

    return movimentacao;
  },

  async excluir(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<void> {
    const movimentacao =
      await getDB()
        .movimentacoes_equipamentos
        .get(movimentacaoId);

    if (
      !movimentacao ||
      movimentacao.projeto_id !== projetoId
    ) {
      throw new Error(
        "Movimentação não encontrada neste projeto.",
      );
    }

    /*
     * O histórico é append-only.
     *
     * Não removemos movimentações porque uma movimentação
     * posterior pode depender dela para determinar o estado.
     */
    throw new Error(
      "Movimentações não podem ser excluídas. Registre uma nova movimentação para corrigir o histórico.",
    );
  },

  async buscar(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<
    MovimentacaoEquipamento | undefined
  > {
    const movimentacao =
      await getDB()
        .movimentacoes_equipamentos
        .get(movimentacaoId);

    if (
      !movimentacao ||
      movimentacao.projeto_id !== projetoId
    ) {
      return undefined;
    }

    return movimentacao;
  },
};