import { getDB } from "@/db/db";
import type {
  Apropriacao,
  Equipe,
  Equipamento,
  EstoqueEquipamento,
  MovimentacaoEquipamento,
} from "@/types";

export type EstadoEstoqueEquipamento = {
  estoque: EstoqueEquipamento;
  equipamento: Equipamento;

  quantidade: number;
  devolvido: number;
  baixado: number;
  saldo: number;

  almoxarifado: number;
  manutencao: number;
  empresa: number;

  apropriado: number;
  disponivel: number;

  funcionarios: Map<string, number>;
  equipes: Map<string, number>;

  encerrado: boolean;
};

export type ApropriacaoAtual = Apropriacao & {
  saldo: number;
};

function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function ordenarMovimentacoes(
  movimentacoes: MovimentacaoEquipamento[],
): MovimentacaoEquipamento[] {
  return [...movimentacoes].sort((a, b) => {
    const dataA = `${a.data}|${a.criado_em}|${a.id}`;
    const dataB = `${b.data}|${b.criado_em}|${b.id}`;

    return dataA.localeCompare(dataB);
  });
}

async function obterEquipesDoProjeto(
  projetoId: string,
): Promise<{
  almoxarifado: Equipe;
  manutencao: Equipe;
}> {
  const equipes = await getDB()
    .equipes
    .where("projeto_id")
    .equals(projetoId)
    .toArray();

  const almoxarifado = equipes.find(
    (equipe) => normalizarNome(equipe.nome) === "almoxarifado",
  );

  const manutencao = equipes.find(
    (equipe) => normalizarNome(equipe.nome) === "manutencao",
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

function adicionar(
  mapa: Map<string, number>,
  id: string,
  quantidade: number,
) {
  mapa.set(id, (mapa.get(id) ?? 0) + quantidade);
}

function remover(
  mapa: Map<string, number>,
  id: string,
  quantidade: number,
) {
  const atual = mapa.get(id) ?? 0;
  const novoSaldo = atual - quantidade;

  if (novoSaldo < 0) {
    throw new Error(
      `Movimentação inválida: o participante "${id}" não possui quantidade suficiente.`,
    );
  }

  mapa.set(id, novoSaldo);
}

export const estadoEquipamentosRepo = {
  async calcular(
    projetoId: string,
    estoqueEquipamentoId: string,
  ): Promise<EstadoEstoqueEquipamento> {
    const db = getDB();

    const estoque = await db.estoque_equipamentos.get(
      estoqueEquipamentoId,
    );

    if (!estoque || estoque.projeto_id !== projetoId) {
      throw new Error(
        "Estoque de equipamento não encontrado neste projeto.",
      );
    }

    const equipamento = await db.equipamentos.get(
      estoque.equipamento_id,
    );

    if (!equipamento || equipamento.projeto_id !== projetoId) {
      throw new Error(
        "Equipamento não encontrado neste projeto.",
      );
    }

    const equipes = await obterEquipesDoProjeto(projetoId);

    const movimentacoes = await db.movimentacoes_equipamentos
      .where("estoque_equipamento_id")
      .equals(estoqueEquipamentoId)
      .toArray();

    const ordenadas = ordenarMovimentacoes(movimentacoes);

    /*
     * O estoque físico começa no Almoxarifado.
     *
     * `quantidade` representa tudo que entrou originalmente
     * nesse registro de estoque.
     */
    let almoxarifado = estoque.quantidade;
    let manutencao = 0;
    let empresa = 0;

    const funcionarios = new Map<string, number>();
    const equipesAtuais = new Map<string, number>([[equipes.almoxarifado.id, estoque.quantidade]]);

    const adicionarEquipe = (equipeId: string, quantidade: number) => {
      equipesAtuais.set(equipeId, (equipesAtuais.get(equipeId) ?? 0) + quantidade);
    };

    const removerEquipe = (equipeId: string, quantidade: number) => {
      const atual = equipesAtuais.get(equipeId) ?? 0;
      const novo = atual - quantidade;
      if (novo < 0) {
        throw new Error("Quantidade insuficiente na equipe para esta movimentação.");
      }
      if (novo === 0) equipesAtuais.delete(equipeId);
      else equipesAtuais.set(equipeId, novo);
    };

    let devolvido = 0;
    let baixado = 0;

    // Devoluções ao fornecedor e baixas encerram quantidade física.
    // REENTRADA reverte a última pendência encerrada, preservando o histórico.
    const pendenciasReentrada: Array<{ tipo: "DEVOLUCAO_FORNECEDOR" | "BAIXA"; restante: number }> = [];

    for (const movimentacao of ordenadas) {
      const quantidade = movimentacao.quantidade;

      if (quantidade <= 0) {
        throw new Error(
          `A movimentação ${movimentacao.id} possui quantidade inválida.`,
        );
      }

      switch (movimentacao.tipo) {
        case "ENTRADA": {
          /*
           * A entrada não aumenta novamente o estoque.
           *
           * A criação do EstoqueEquipamento já representa
           * a existência física das unidades.
           */
          break;
        }

        case "SAIDA": {
          if (movimentacao.tipo_origem !== "EQUIPE") {
            throw new Error(
              "SAIDA deve ter origem em uma equipe.",
            );
          }

          if (movimentacao.origem_id !== equipes.almoxarifado.id) {
            throw new Error(
              "SAIDA deve partir do Almoxarifado.",
            );
          }

          if (movimentacao.tipo_destino !== "FUNCIONARIO") {
            throw new Error(
              "SAIDA deve ter um funcionário como destino.",
            );
          }

          almoxarifado -= quantidade;
          removerEquipe(movimentacao.origem_id, quantidade);

          if (almoxarifado < 0) {
            throw new Error(
              "Movimentação inválida: quantidade insuficiente no Almoxarifado.",
            );
          }

          adicionar(
            funcionarios,
            movimentacao.destino_id,
            quantidade,
          );

          break;
        }

        case "DEVOLUCAO": {
          if (movimentacao.tipo_origem !== "FUNCIONARIO") {
            throw new Error(
              "DEVOLUCAO deve partir de um funcionário.",
            );
          }

          if (movimentacao.tipo_destino !== "EQUIPE") {
            throw new Error(
              "DEVOLUCAO deve ter uma equipe como destino.",
            );
          }

          remover(
            funcionarios,
            movimentacao.origem_id,
            quantidade,
          );

          if (movimentacao.destino_id !== equipes.almoxarifado.id) {
            throw new Error(
              "DEVOLUCAO deve retornar ao Almoxarifado.",
            );
          }

          almoxarifado += quantidade;
          adicionarEquipe(movimentacao.destino_id, quantidade);

          break;
        }

        case "TRANSFERENCIA": {
          if (movimentacao.tipo_origem !== "FUNCIONARIO") {
            throw new Error(
              "TRANSFERENCIA deve partir de um funcionário.",
            );
          }

          if (movimentacao.tipo_destino !== "FUNCIONARIO") {
            throw new Error(
              "TRANSFERENCIA deve ter outro funcionário como destino.",
            );
          }

          if (
            movimentacao.origem_id ===
            movimentacao.destino_id
          ) {
            throw new Error(
              "O funcionário de origem e destino não podem ser iguais.",
            );
          }

          remover(
            funcionarios,
            movimentacao.origem_id,
            quantidade,
          );

          adicionar(
            funcionarios,
            movimentacao.destino_id,
            quantidade,
          );

          break;
        }

        case "SINALIZAR_MANUTENCAO": {
          // Sinalização é somente administrativa.
          break;
        }

        case "MANUTENCAO": {
          // Histórico antigo: MANUTENCAO representava envio efetivo.
          if (movimentacao.tipo_origem === "FUNCIONARIO") {
            remover(
              funcionarios,
              movimentacao.origem_id,
              quantidade,
            );
          } else if (
            movimentacao.tipo_origem === "EQUIPE" &&
            movimentacao.origem_id === equipes.almoxarifado.id
          ) {
            almoxarifado -= quantidade;
            removerEquipe(movimentacao.origem_id, quantidade);
            if (almoxarifado < 0) {
              throw new Error(
                "Quantidade insuficiente no Almoxarifado para manutenção.",
              );
            }
          } else {
            throw new Error(
              "A origem de MANUTENCAO deve ser Almoxarifado ou funcionário.",
            );
          }

          manutencao += quantidade;
          adicionarEquipe(equipes.manutencao.id, quantidade);
          break;
        }

        case "ENVIO": {
          if (movimentacao.tipo_origem === "EQUIPE") {
            if (movimentacao.origem_id !== equipes.almoxarifado.id) {
              throw new Error(
                "ENVIO por equipe deve partir do Almoxarifado.",
              );
            }

            almoxarifado -= quantidade;
            removerEquipe(movimentacao.origem_id, quantidade);

            if (almoxarifado < 0) {
              throw new Error(
                "Quantidade insuficiente no Almoxarifado para envio à manutenção.",
              );
            }
          } else if (movimentacao.tipo_origem === "FUNCIONARIO") {
            remover(
              funcionarios,
              movimentacao.origem_id,
              quantidade,
            );
          } else {
            throw new Error(
              "ENVIO deve partir do Almoxarifado ou de um funcionário.",
            );
          }

          manutencao += quantidade;
          adicionarEquipe(equipes.manutencao.id, quantidade);

          if (movimentacao.tipo_destino === "EMPRESA") {
            empresa += quantidade;
          }

          break;
        }

        case "RETIRADA_MANUTENCAO": {
          if (movimentacao.tipo_origem !== "EQUIPE") {
            throw new Error(
              "RETIRADA_MANUTENCAO deve partir de uma equipe.",
            );
          }

          if (
            movimentacao.origem_id !== equipes.manutencao.id &&
            movimentacao.origem_id !== equipes.almoxarifado.id
          ) {
            throw new Error(
              "RETIRADA_MANUTENCAO deve partir do Almoxarifado ou Manutenção.",
            );
          }

          if (movimentacao.tipo_destino !== "EMPRESA") {
            throw new Error(
              "RETIRADA_MANUTENCAO deve ter uma empresa como destino.",
            );
          }

          if (movimentacao.origem_id === equipes.manutencao.id) {
            // O equipamento já está contabilizado na Manutenção.
            // Enviar para uma empresa externa muda apenas a informação
            // da movimentação/localização externa; não altera a contagem
            // de Manutenção. `empresa` é apenas um marcador interno para
            // permitir identificar o retorno da manutenção externa.
            empresa += quantidade;
          } else {
            // Envio direto do Almoxarifado para manutenção externa:
            // o equipamento passa a ser contabilizado em Manutenção.
            almoxarifado -= quantidade;
            removerEquipe(movimentacao.origem_id, quantidade);

            if (almoxarifado < 0) {
              throw new Error(
                "Quantidade insuficiente no Almoxarifado.",
              );
            }

            manutencao += quantidade;
            adicionarEquipe(equipes.manutencao.id, quantidade);
            empresa += quantidade;
          }

          break;
        }

        case "RETORNO_MANUTENCAO": {
          if (movimentacao.tipo_destino !== "EQUIPE") {
            throw new Error(
              "RETORNO_MANUTENCAO deve ter uma equipe como destino.",
            );
          }

          if (
            movimentacao.destino_id !==
            equipes.almoxarifado.id
          ) {
            throw new Error(
              "RETORNO_MANUTENCAO deve retornar ao Almoxarifado.",
            );
          }

          if (movimentacao.tipo_origem === "EQUIPE") {
            if (movimentacao.origem_id !== equipes.manutencao.id) {
              throw new Error(
                "O retorno interno da manutenção deve partir da equipe Manutenção.",
              );
            }

            manutencao -= quantidade;
            removerEquipe(movimentacao.origem_id, quantidade);

            if (manutencao < 0) {
              throw new Error(
                "Quantidade insuficiente na Manutenção para retorno ao Almoxarifado.",
              );
            }

            almoxarifado += quantidade;
            adicionarEquipe(movimentacao.destino_id, quantidade);
            break;
          }

          if (movimentacao.tipo_origem !== "EMPRESA") {
            throw new Error(
              "RETORNO_MANUTENCAO deve partir da Manutenção ou da empresa de manutenção.",
            );
          }

          empresa -= quantidade;

          if (empresa < 0) {
            throw new Error(
              "Quantidade insuficiente fora do projeto para retorno.",
            );
          }

          manutencao -= quantidade;
          removerEquipe(equipes.manutencao.id, quantidade);

          if (manutencao < 0) {
            throw new Error(
              "Quantidade insuficiente na Manutenção para retorno da manutenção externa.",
            );
          }

          almoxarifado += quantidade;
          adicionarEquipe(equipes.almoxarifado.id, quantidade);

          break;
        }

        case "REENTRADA": {
          const restante = movimentacao.quantidade;
          let quantidadeReentrada = restante;

          while (quantidadeReentrada > 0 && pendenciasReentrada.length > 0) {
            const pendencia = pendenciasReentrada[pendenciasReentrada.length - 1];
            if (!pendencia) break;
            const aplicada = Math.min(quantidadeReentrada, pendencia.restante);
            pendencia.restante -= aplicada;
            quantidadeReentrada -= aplicada;

            if (pendencia.tipo === "DEVOLUCAO_FORNECEDOR") {
              devolvido -= aplicada;
            } else {
              baixado -= aplicada;
            }

            adicionarEquipe(movimentacao.destino_id, aplicada);
            if (movimentacao.destino_id === equipes.almoxarifado.id) {
              almoxarifado += aplicada;
            } else if (movimentacao.destino_id === equipes.manutencao.id) {
              manutencao += aplicada;
            }

            if (pendencia.restante === 0) {
              pendenciasReentrada.pop();
            }
          }

          if (quantidadeReentrada > 0) {
            throw new Error(
              "REENTRADA excede a quantidade de equipamento disponível para restauração.",
            );
          }

          break;
        }

        case "BAIXA": {
          if (movimentacao.tipo_origem !== "EQUIPE") {
            throw new Error(
              "BAIXA deve partir do Almoxarifado.",
            );
          }

          if (movimentacao.origem_id !== equipes.almoxarifado.id) {
            throw new Error(
              "BAIXA somente pode ser realizada para equipamento que esteja no Almoxarifado.",
            );
          }

          if (movimentacao.tipo_destino !== "EMPRESA") {
            throw new Error(
              "BAIXA deve registrar a empresa proprietária como destino administrativo.",
            );
          }

          almoxarifado -= quantidade;
          removerEquipe(movimentacao.origem_id, quantidade);

          if (almoxarifado < 0) {
            throw new Error(
              "Quantidade insuficiente no Almoxarifado para baixa.",
            );
          }

          baixado += quantidade;
          pendenciasReentrada.push({
            tipo: "BAIXA",
            restante: quantidade,
          });
          break;
        }

        case "DEVOLUCAO_FORNECEDOR": {
          if (
            movimentacao.tipo_origem !== "EQUIPE"
          ) {
            throw new Error(
              "DEVOLUCAO_FORNECEDOR deve partir de uma equipe.",
            );
          }

          if (
            movimentacao.origem_id !==
              equipes.almoxarifado.id &&
            movimentacao.origem_id !==
              equipes.manutencao.id
          ) {
            throw new Error(
              "DEVOLUCAO_FORNECEDOR deve partir do Almoxarifado ou Manutenção.",
            );
          }

          if (
            movimentacao.tipo_destino !== "EMPRESA"
          ) {
            throw new Error(
              "DEVOLUCAO_FORNECEDOR deve ter uma empresa como destino.",
            );
          }

          if (
            movimentacao.origem_id ===
            equipes.almoxarifado.id
          ) {
            almoxarifado -= quantidade;
            removerEquipe(movimentacao.origem_id, quantidade);

            if (almoxarifado < 0) {
              throw new Error(
                "Quantidade insuficiente no Almoxarifado para devolução ao fornecedor.",
              );
            }
          } else {
            manutencao -= quantidade;
            removerEquipe(movimentacao.origem_id, quantidade);

            if (manutencao < 0) {
              throw new Error(
                "Quantidade insuficiente na Manutenção para devolução ao fornecedor.",
              );
            }
          }

          devolvido += quantidade;
          pendenciasReentrada.push({
            tipo: "DEVOLUCAO_FORNECEDOR",
            restante: quantidade,
          });

          break;
        }

        default: {
          const tipo: never = movimentacao.tipo;
          throw new Error(
            `Tipo de movimentação não suportado: ${tipo}`,
          );
        }
      }
    }

    /*
     * O saldo físico do projeto é tudo que ainda não foi
     * devolvido definitivamente ao fornecedor.
     */
    const saldo = estoque.quantidade - devolvido - baixado;

    if (saldo < 0) {
      throw new Error(
        "Estado inconsistente: devoluções e baixas excedem a quantidade do estoque.",
      );
    }

    /*
     * Tudo que está com funcionário é considerado apropriado.
     */
    let apropriado = 0;

    for (const quantidade of funcionarios.values()) {
      apropriado += quantidade;
    }

    /*
     * O disponível é aquilo que está no Almoxarifado e não
     * está em manutenção.
     *
     * Como manutenção é uma localização independente,
     * basta considerar o saldo atual do Almoxarifado.
     */
    const disponivel = almoxarifado;

    // `empresa` é somente um marcador interno para os equipamentos
    // enviados para manutenção externa. Ele nunca é somado como uma
    // localização adicional e não altera a contagem de Manutenção.
    const quantidadeEmEquipes = [...equipesAtuais.values()].reduce(
      (total, quantidade) => total + quantidade,
      0,
    );
    const totalDistribuido =
      quantidadeEmEquipes +
      apropriado +
      devolvido +
      baixado;

    /*
     * Uma pequena proteção contra inconsistências no histórico.
     */
    if (totalDistribuido !== estoque.quantidade) {
      throw new Error(
        `Estado inconsistente para o equipamento "${equipamento.nome}". ` +
          `Quantidade registrada: ${estoque.quantidade}; ` +
          `quantidade distribuída no histórico: ${totalDistribuido}.`,
      );
    }

    return {
      estoque,
      equipamento,

      quantidade: estoque.quantidade,
      devolvido,
      baixado,
      saldo,

      almoxarifado,
      manutencao,
      empresa,

      apropriado,
      disponivel,

      funcionarios,
      equipes: equipesAtuais,

      encerrado: saldo === 0,
    };
  },

  async listarApropriacoesAtuais(
    projetoId: string,
    estoqueEquipamentoId: string,
  ): Promise<ApropriacaoAtual[]> {
    const estado = await this.calcular(
      projetoId,
      estoqueEquipamentoId,
    );

    const db = getDB();

    const apropriacoes =
      await db.apropriacoes
        .where("estoque_equipamento_id")
        .equals(estoqueEquipamentoId)
        .toArray();

    return apropriacoes
      .map((apropriacao) => {
        const saldo =
          estado.funcionarios.get(
            apropriacao.funcionario_id,
          ) ?? 0;

        return {
          ...apropriacao,
          saldo,
        };
      })
      .filter((apropriacao) => apropriacao.saldo > 0);
  },
};