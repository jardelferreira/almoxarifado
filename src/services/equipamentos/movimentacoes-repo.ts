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
    "SINALIZAR_MANUTENCAO",
    "ENVIO",
    "RETORNO_MANUTENCAO",
    "MANUTENCAO",
    "RETIRADA_MANUTENCAO",
    "DEVOLUCAO_FORNECEDOR",
    "BAIXA",
    "REENTRADA",
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

    case "SINALIZAR_MANUTENCAO":
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

    case "ENVIO":
      if (tipo_origem === "FUNCIONARIO") {
        await removerApropriacao(
          estoque_equipamento_id,
          origem_id,
          quantidade,
          agora,
        );
      }
      return;

    case "RETIRADA_MANUTENCAO":
      return;

    default:
      return;
  }
}

async function obterPendenciaReentrada(
  projetoId: string,
  estoqueEquipamentoId: string,
): Promise<{ tipo: "DEVOLUCAO_FORNECEDOR" | "BAIXA"; restante: number; origemId: string }> {
  const movimentacoes = await getDB()
    .movimentacoes_equipamentos
    .where("estoque_equipamento_id")
    .equals(estoqueEquipamentoId)
    .toArray();

  const ordenadas = [...movimentacoes].sort((a, b) => {
    const dataA = `${a.data}|${a.criado_em}|${a.id}`;
    const dataB = `${b.data}|${b.criado_em}|${b.id}`;
    return dataA.localeCompare(dataB);
  });

  const pendentes: Array<{ tipo: "DEVOLUCAO_FORNECEDOR" | "BAIXA"; restante: number; origemId: string }> = [];

  for (const movimentacao of ordenadas) {
    if (movimentacao.tipo === "DEVOLUCAO_FORNECEDOR" || movimentacao.tipo === "BAIXA") {
      pendentes.push({
        tipo: movimentacao.tipo,
        restante: movimentacao.quantidade,
        origemId: movimentacao.destino_id,
      });
      continue;
    }

    if (movimentacao.tipo === "REENTRADA") {
      let restante = movimentacao.quantidade;
      while (restante > 0) {
        const pendencia = pendentes.at(-1);
        if (!pendencia) {
          throw new Error("Histórico inconsistente: REENTRADA sem devolução ou baixa pendente.");
        }
        const aplicada = Math.min(restante, pendencia.restante);
        pendencia.restante -= aplicada;
        restante -= aplicada;
      }
    }
  }

  const pendencia = pendentes.at(-1);
  if (!pendencia || pendencia.restante <= 0) {
    throw new Error("Este registro não possui quantidade devolvida ou baixada disponível para reentrada.");
  }

  return pendencia;
}

async function validarEstadoDaOrigem(
  movimentacao: MovimentacaoEquipamentoInput,
  estado: EstadoEstoqueEquipamento,
  equipes: {
    almoxarifado: Equipe;
    manutencao: Equipe;
  },
): Promise<void> {
  const {
    tipo,
    quantidade,
    tipo_origem,
    origem_id,
    tipo_destino,
    destino_id,
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

    case "SINALIZAR_MANUTENCAO":
      if (tipo_origem === "EQUIPE" && origem_id === equipes.almoxarifado.id) {
        exigirDisponibilidade(
          estado.almoxarifado,
          quantidade,
          "Quantidade insuficiente no Almoxarifado para sinalização.",
        );
        return;
      }

      if (tipo_origem === "FUNCIONARIO") {
        exigirDisponibilidade(
          estado.funcionarios.get(origem_id) ?? 0,
          quantidade,
          "O funcionário não possui quantidade suficiente para sinalização.",
        );
        return;
      }

      throw new Error("A sinalização deve partir do Almoxarifado ou de um funcionário.");

    case "MANUTENCAO":
      // Histórico antigo: MANUTENCAO representava o envio efetivo.
      if (tipo_origem === "EQUIPE" && origem_id === equipes.almoxarifado.id) {
        exigirDisponibilidade(
          estado.almoxarifado,
          quantidade,
          "Quantidade insuficiente no Almoxarifado.",
        );
        return;
      }
      if (tipo_origem === "FUNCIONARIO") {
        exigirDisponibilidade(
          estado.funcionarios.get(origem_id) ?? 0,
          quantidade,
          "O funcionário não possui quantidade suficiente.",
        );
        return;
      }
      throw new Error("Origem inválida para MANUTENCAO.");

    case "ENVIO":
      if (tipo_origem === "EQUIPE") {
        if (origem_id !== equipes.almoxarifado.id) {
          throw new Error("O envio por equipe deve partir do Almoxarifado.");
        }
        exigirDisponibilidade(
          estado.almoxarifado,
          quantidade,
          "Quantidade insuficiente no Almoxarifado para envio à manutenção.",
        );
        return;
      }

      if (tipo_origem === "FUNCIONARIO") {
        exigirDisponibilidade(
          estado.funcionarios.get(origem_id) ?? 0,
          quantidade,
          "O funcionário não possui quantidade suficiente para envio à manutenção.",
        );
        return;
      }

      throw new Error("O envio deve partir do Almoxarifado ou de um funcionário.");

    case "RETIRADA_MANUTENCAO":
      if (origem_id === equipes.manutencao.id) {
        exigirDisponibilidade(estado.manutencao, quantidade, "Quantidade insuficiente na Manutenção.");
        return;
      }
      if (origem_id === equipes.almoxarifado.id) {
        exigirDisponibilidade(estado.almoxarifado, quantidade, "Quantidade insuficiente no Almoxarifado.");
        return;
      }
      throw new Error("Origem inválida para retirada de manutenção.");

    case "RETORNO_MANUTENCAO":
      if (tipo_origem === "EQUIPE") {
        exigirDisponibilidade(
          estado.manutencao,
          quantidade,
          "Não há quantidade suficiente na Manutenção para retorno ao Almoxarifado.",
        );
        return;
      }

      exigirDisponibilidade(
        estado.empresa,
        quantidade,
        "Não há quantidade suficiente na empresa de manutenção para retorno.",
      );

      exigirDisponibilidade(
        estado.manutencao,
        quantidade,
        "O equipamento em manutenção externa não possui saldo suficiente para retorno.",
      );
      return;

    case "REENTRADA": {
      if (tipo_origem !== "EMPRESA" || tipo_destino !== "EQUIPE") {
        throw new Error("REENTRADA deve ser Empresa → Equipe.");
      }
      const pendencia = await obterPendenciaReentrada(
        movimentacao.projeto_id,
        movimentacao.estoque_equipamento_id,
      );
      if (origem_id !== pendencia.origemId) {
        throw new Error("A empresa de origem da reentrada deve ser a mesma da última devolução ou baixa pendente.");
      }
      exigirDisponibilidade(
        pendencia.restante,
        quantidade,
        "A quantidade informada excede o equipamento disponível para reentrada.",
      );
      return;
    }

    case "BAIXA":
      if (tipo_origem !== "EQUIPE" || origem_id !== equipes.almoxarifado.id) {
        throw new Error(
          "A baixa somente pode ser realizada para equipamento que esteja no Almoxarifado.",
        );
      }

      if (estado.almoxarifado !== estado.saldo) {
        throw new Error(
          "A baixa somente pode ser realizada quando o equipamento estiver exclusivamente no Almoxarifado.",
        );
      }

      exigirDisponibilidade(
        estado.almoxarifado,
        quantidade,
        "Quantidade insuficiente no Almoxarifado para baixa.",
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

    case "SINALIZAR_MANUTENCAO":
      if (
        (tipo_origem !== "EQUIPE" && tipo_origem !== "FUNCIONARIO") ||
        tipo_destino !== "EQUIPE" ||
        destino_id !== equipes.manutencao.id
      ) {
        throw new Error(
          "SINALIZAR_MANUTENCAO deve registrar a sinalização para Manutenção.",
        );
      }
      return;

    case "MANUTENCAO":
      if (
        (tipo_origem !== "EQUIPE" && tipo_origem !== "FUNCIONARIO") ||
        tipo_destino !== "EQUIPE" ||
        destino_id !== equipes.manutencao.id
      ) {
        throw new Error("MANUTENCAO (histórico) possui origem ou destino inválido.");
      }
      return;

    case "ENVIO":
      if (
        (tipo_origem !== "EQUIPE" && tipo_origem !== "FUNCIONARIO") ||
        tipo_destino !== "EMPRESA"
      ) {
        throw new Error(
          "ENVIO deve ser Almoxarifado ou Funcionário → Empresa de manutenção.",
        );
      }
      if (tipo_origem === "EQUIPE" && origem_id !== equipes.almoxarifado.id) {
        throw new Error("O envio por equipe deve partir do Almoxarifado.");
      }
      return;

    case "RETIRADA_MANUTENCAO":
      if (
        tipo_origem !== "EQUIPE" ||
        (origem_id !== equipes.almoxarifado.id && origem_id !== equipes.manutencao.id) ||
        tipo_destino !== "EMPRESA"
      ) {
        throw new Error("RETIRADA_MANUTENCAO (histórico) possui origem ou destino inválido.");
      }
      return;

    case "RETORNO_MANUTENCAO":
      if (
        tipo_destino !== "EQUIPE" ||
        destino_id !== equipes.almoxarifado.id ||
        (tipo_origem !== "EMPRESA" && tipo_origem !== "EQUIPE")
      ) {
        throw new Error(
          "RETORNO_MANUTENCAO deve ser Manutenção/Empresa de manutenção → Almoxarifado.",
        );
      }

      if (tipo_origem === "EQUIPE" && origem_id !== equipes.manutencao.id) {
        throw new Error(
          "O retorno interno deve partir da equipe Manutenção.",
        );
      }
      return;

    case "BAIXA":
      if (
        tipo_origem !== "EQUIPE" ||
        origem_id !== equipes.almoxarifado.id ||
        tipo_destino !== "EMPRESA"
      ) {
        throw new Error(
          "BAIXA deve ser Almoxarifado → Empresa proprietária.",
        );
      }
      return;

    case "REENTRADA":
      if (tipo_origem !== "EMPRESA" || tipo_destino !== "EQUIPE") {
        throw new Error(
          "REENTRADA deve ser Empresa → Equipe.",
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

async function obterSinalizacaoPendente(
  estoqueEquipamentoId: string,
): Promise<number> {
  const movimentacoes = await getDB()
    .movimentacoes_equipamentos
    .where("estoque_equipamento_id")
    .equals(estoqueEquipamentoId)
    .toArray();

  const ordenadas = [...movimentacoes].sort((a, b) =>
    `${a.data}|${a.criado_em}|${a.id}`.localeCompare(
      `${b.data}|${b.criado_em}|${b.id}`,
    ),
  );

  let pendente = 0;

  for (const movimentacao of ordenadas) {
    if (
      movimentacao.tipo === "SINALIZAR_MANUTENCAO" ||
      movimentacao.tipo === "MANUTENCAO"
    ) {
      pendente += movimentacao.quantidade;
    } else if (
      movimentacao.tipo === "ENVIO" ||
      movimentacao.tipo === "RETIRADA_MANUTENCAO"
    ) {
      pendente = Math.max(0, pendente - movimentacao.quantidade);
    } else if (movimentacao.tipo === "RETORNO_MANUTENCAO") {
      pendente = 0;
    }
  }

  return pendente;
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

    if (
      dados.tipo === "ENVIO" &&
      estoque.vinculo !== "PROPRIO" &&
      dados.destino_id !== estoque.empresa_id
    ) {
      throw new Error(
        "Equipamentos alugados ou emprestados devem ser enviados para a empresa do vínculo.",
      );
    }

    if (dados.tipo === "REENTRADA" && estoque.ativo !== false) {
      const pendencia = await obterPendenciaReentrada(
        dados.projeto_id,
        estoque.id,
      );
      if (pendencia.restante <= 0) {
        throw new Error("Este registro de estoque não possui quantidade pendente para reentrada.");
      }
    }

    if (dados.tipo !== "REENTRADA" && estoque.ativo === false) {
      throw new Error("Este registro de estoque está inativo e não pode receber movimentações.");
    }

    if (dados.tipo === "SINALIZAR_MANUTENCAO") {
      const sinalizacaoPendente = await obterSinalizacaoPendente(
        dados.estoque_equipamento_id,
      );
      if (sinalizacaoPendente > 0) {
        throw new Error(
          "Este equipamento já está sinalizado para manutenção.",
        );
      }
    }

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

      await validarEstadoDaOrigem(
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
        if (movimentacao.tipo === "DEVOLUCAO_FORNECEDOR") {
          const estoqueAtual =
            await db.estoque_equipamentos.get(estoque.id);

          if (!estoqueAtual) {
            throw new Error("Estoque de equipamento não encontrado.");
          }

          const novoDevolvido =
            estoqueAtual.devolvido + movimentacao.quantidade;

          if (novoDevolvido > estoqueAtual.quantidade) {
            throw new Error(
              "A quantidade devolvida não pode ultrapassar a quantidade total do estoque.",
            );
          }

          await db.estoque_equipamentos.put({
            ...estoqueAtual,
            devolvido: novoDevolvido,
            status: novoDevolvido + (estoqueAtual.baixado ?? 0) < estoqueAtual.quantidade ? "ATIVO" : "ENCERRADO",
            ativo: novoDevolvido + (estoqueAtual.baixado ?? 0) < estoqueAtual.quantidade,
            atualizado_em: agora,
          });
        }

        if (movimentacao.tipo === "REENTRADA") {
          const estoqueAtual = await db.estoque_equipamentos.get(estoque.id);
          if (!estoqueAtual) throw new Error("Estoque de equipamento não encontrado.");

          const pendencia = await obterPendenciaReentrada(
            dados.projeto_id,
            estoque.id,
          );
          if (movimentacao.origem_id !== pendencia.origemId) {
            throw new Error("A empresa de origem da reentrada não corresponde ao histórico pendente.");
          }
          if (movimentacao.quantidade > pendencia.restante) {
            throw new Error("A quantidade da reentrada excede a quantidade disponível para restauração.");
          }

          const novoDevolvido = Math.max(
            0,
            estoqueAtual.devolvido - (pendencia.tipo === "DEVOLUCAO_FORNECEDOR" ? movimentacao.quantidade : 0),
          );
          const novoBaixado = Math.max(
            0,
            (estoqueAtual.baixado ?? 0) - (pendencia.tipo === "BAIXA" ? movimentacao.quantidade : 0),
          );

          await db.estoque_equipamentos.put({
            ...estoqueAtual,
            devolvido: novoDevolvido,
            baixado: novoBaixado,
            ativo: true,
            status: "ATIVO",
            atualizado_em: agora,
          });
        }

        if (movimentacao.tipo === "BAIXA") {
          const estoqueAtual = await db.estoque_equipamentos.get(estoque.id);

          if (!estoqueAtual) {
            throw new Error("Estoque de equipamento não encontrado.");
          }

          const estadoAtual = await estadoEquipamentosRepo.calcular(
            dados.projeto_id,
            estoque.id,
          );
          const novoBaixado =
            (estoqueAtual.baixado ?? 0) + movimentacao.quantidade;

          // A baixa é definitiva: o registro é encerrado quando toda a quantidade
          // do registro físico foi baixada.
          if (movimentacao.quantidade > estadoAtual.almoxarifado) {
            throw new Error("Quantidade insuficiente no Almoxarifado para baixa.");
          }

          if (estoqueAtual.devolvido + novoBaixado > estoqueAtual.quantidade) {
            throw new Error("A quantidade baixada não pode ultrapassar o saldo físico do estoque.");
          }

          await db.estoque_equipamentos.put({
            ...estoqueAtual,
            baixado: novoBaixado,
            status: estoqueAtual.devolvido + novoBaixado < estoqueAtual.quantidade ? "ATIVO" : "ENCERRADO",
            ativo: estoqueAtual.devolvido + novoBaixado < estoqueAtual.quantidade,
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