import { getDB } from "@/db/db";
import type {
    Apropriacao,
    Equipamento,
    EstoqueEquipamento,
    MovimentacaoEquipamento,
} from "@/types";

export interface EstadoEquipamento {
    equipamento: Equipamento;
    saldo: number;
    devolvido: number;
    almoxarifado: number;
    manutencao: number;
    apropriado: number;
    disponivel: number;
}

export interface ApropriacaoEquipamento extends Apropriacao {
    funcionarioNome?: string;
}

async function carregarMovimentacoes(
    projetoId: string,
    estoqueIds: string[],
): Promise<MovimentacaoEquipamento[]> {
    if (!estoqueIds.length) return [];

    return getDB().movimentacoes_equipamentos
        .where("estoque_equipamento_id")
        .anyOf(estoqueIds)
        .filter((movimentacao) => movimentacao.projeto_id === projetoId)
        .toArray();
}

async function carregarApropriacoes(
    estoqueIds: string[],
): Promise<Apropriacao[]> {
    if (!estoqueIds.length) return [];

    return getDB().apropriacoes
        .where("estoque_equipamento_id")
        .anyOf(estoqueIds)
        .toArray();
}

function calcularEstado(
    equipamento: Equipamento,
    estoques: EstoqueEquipamento[],
    movimentacoes: MovimentacaoEquipamento[],
    apropriacoes: Apropriacao[],
): EstadoEquipamento {
    const saldo = Math.max(
        0,
        estoques.reduce((total, estoque) => total + estoque.quantidade - estoque.devolvido - (estoque.baixado ?? 0), 0),
    );

    let almoxarifado = 0;
    let manutencao = 0;

    for (const movimentacao of movimentacoes) {
        switch (movimentacao.tipo) {
            case "ENTRADA":
                if (
                    movimentacao.tipo_destino === "EQUIPE"
                ) {
                    almoxarifado += movimentacao.quantidade;
                }
                break;

            case "SAIDA":
                if (
                    movimentacao.tipo_origem === "EQUIPE" &&
                    movimentacao.tipo_destino === "FUNCIONARIO"
                ) {
                    almoxarifado -= movimentacao.quantidade;
                }
                break;

            case "DEVOLUCAO":
                if (
                    movimentacao.tipo_origem === "FUNCIONARIO" &&
                    movimentacao.tipo_destino === "EQUIPE"
                ) {
                    almoxarifado += movimentacao.quantidade;
                }
                break;

            case "TRANSFERENCIA":
                // Não altera o total apropriado.
                break;

            case "MANUTENCAO":
                if (
                    movimentacao.tipo_destino === "EQUIPE"
                ) {
                    manutencao += movimentacao.quantidade;

                    if (movimentacao.tipo_origem === "EQUIPE") {
                        almoxarifado -= movimentacao.quantidade;
                    }
                }
                break;

            case "RETIRADA_MANUTENCAO":
                manutencao -= movimentacao.quantidade;
                break;

            case "RETORNO_MANUTENCAO":
                almoxarifado += movimentacao.quantidade;
                break;

            case "DEVOLUCAO_FORNECEDOR":
                if (
                    movimentacao.tipo_origem === "EQUIPE"
                ) {
                    almoxarifado -= movimentacao.quantidade;
                }
                break;
        }
    }

    const apropriado = apropriacoes.reduce(
        (total, apropriacao) =>
            total + apropriacao.quantidade,
        0,
    );

    const disponivel = Math.max(
        0,
        almoxarifado,
    );

    return {
        equipamento,
        saldo,
        devolvido: estoques.reduce((total, estoque) => total + estoque.devolvido, 0),
        almoxarifado: Math.max(0, almoxarifado),
        manutencao: Math.max(0, manutencao),
        apropriado,
        disponivel,
    };
}

export const equipamentosConsultas = {
    async estado(
        projetoId: string,
        equipamentoId: string,
    ): Promise<EstadoEquipamento | undefined> {
        const db = getDB();

        const equipamento = await db.equipamentos.get(
            equipamentoId,
        );

        if (
            !equipamento ||
            equipamento.projeto_id !== projetoId
        ) {
            return undefined;
        }

        const estoques = await db.estoque_equipamentos
            .where("equipamento_id")
            .equals(equipamentoId)
            .filter((estoque) => estoque.projeto_id === projetoId)
            .toArray();
        const estoqueIds = estoques.map((estoque) => estoque.id);

        const [movimentacoes, apropriacoes] =
            await Promise.all([
                carregarMovimentacoes(projetoId, estoqueIds),
                carregarApropriacoes(estoqueIds),
            ]);

        return calcularEstado(
            equipamento,
            estoques,
            movimentacoes,
            apropriacoes,
        );
    },

    async estados(
        projetoId: string,
    ): Promise<EstadoEquipamento[]> {
        const db = getDB();

        const equipamentos = await db.equipamentos
            .where("projeto_id")
            .equals(projetoId)
            .toArray();

        const estoquesPorEquipamento = await db.estoque_equipamentos
            .where("projeto_id")
            .equals(projetoId)
            .toArray();

        const resultados = await Promise.all(
            equipamentos.map(async (equipamento) => {
                const estoques = estoquesPorEquipamento.filter(
                    (estoque) => estoque.equipamento_id === equipamento.id,
                );
                const estoqueIds = estoques.map((estoque) => estoque.id);
                const [movimentacoes, apropriacoes] =
                    await Promise.all([
                        carregarMovimentacoes(projetoId, estoqueIds),
                        carregarApropriacoes(estoqueIds),
                    ]);

                return calcularEstado(
                    equipamento,
                    estoques,
                    movimentacoes,
                    apropriacoes,
                );
            }),
        );

        return resultados;
    },

    async apropriacoes(
        projetoId: string,
        equipamentoId: string,
    ): Promise<ApropriacaoEquipamento[]> {
        const db = getDB();

        const equipamento = await db.equipamentos.get(
            equipamentoId,
        );

        if (
            !equipamento ||
            equipamento.projeto_id !== projetoId
        ) {
            return [];
        }

        const apropriacoes =
            await db.apropriacoes
                .where("estoque_equipamento_id")
                .anyOf(
                    (
                        await db.estoque_equipamentos
                            .where("equipamento_id")
                            .equals(equipamentoId)
                            .filter((estoque) => estoque.projeto_id === projetoId)
                            .toArray()
                    ).map((estoque) => estoque.id),
                )
                .toArray();

        const funcionarios = await Promise.all(
            apropriacoes.map((apropriacao) =>
                db.funcionarios.get(
                    apropriacao.funcionario_id,
                ),
            ),
        );

        return apropriacoes.map(
            (apropriacao, index): ApropriacaoEquipamento => ({
                ...apropriacao,
                ...(funcionarios[index]?.nome
                    ? {
                        funcionarioNome: funcionarios[index].nome,
                    }
                    : {}),
            }),
        );
    },
};
