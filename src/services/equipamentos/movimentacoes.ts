import { getDB, uid } from "@/db/db";
import type {
    Equipamento,
    MovimentacaoEquipamento,
    MovimentacaoEquipamentoTipo,
} from "@/types";

interface RegistrarMovimentacaoInput {
    projetoId: string;
    equipamentoId: string;
    tipo: MovimentacaoEquipamentoTipo;
    quantidade: number;
    funcionarioId?: string;
    funcionarioDestinoId?: string;
    data?: string;
    observacoes?: string | null;
}

interface Participante {
    tipo: MovimentacaoEquipamento["tipo_origem"];
    id: string;
}

async function obterEquipamento(
    projetoId: string,
    equipamentoId: string,
): Promise<Equipamento> {
    const equipamento = await getDB().equipamentos.get(equipamentoId);

    if (!equipamento || equipamento.projeto_id !== projetoId) {
        throw new Error(
            "Equipamento não encontrado neste projeto.",
        );
    }

    return equipamento;
}

async function obterEmpresa(
    projetoId: string,
    empresaId: string,
): Promise<Participante> {
    const empresa = await getDB().empresas.get(empresaId);

    if (!empresa || empresa.projeto_id !== projetoId) {
        throw new Error(
            "A empresa não pertence ao projeto.",
        );
    }

    return {
        tipo: "EMPRESA",
        id: empresa.id,
    };
}

async function obterFuncionario(
    projetoId: string,
    funcionarioId: string,
): Promise<Participante> {
    const funcionario = await getDB().funcionarios.get(
        funcionarioId,
    );

    if (
        !funcionario ||
        funcionario.projeto_id !== projetoId
    ) {
        throw new Error(
            "O funcionário não pertence ao projeto.",
        );
    }

    if (funcionario.status !== "ATIVO") {
        throw new Error(
            "Não é possível movimentar equipamento para um funcionário inativo.",
        );
    }

    return {
        tipo: "FUNCIONARIO",
        id: funcionario.id,
    };
}

async function obterEquipe(
    projetoId: string,
    nome: "Almoxarifado" | "Manutenção",
): Promise<Participante> {
    const equipes = await getDB()
        .equipes
        .where("projeto_id")
        .equals(projetoId)
        .toArray();

    const equipe = equipes.find(
        (item) =>
            item.nome.trim().toLowerCase() ===
            nome.toLowerCase(),
    );

    if (!equipe) {
        throw new Error(
            `A equipe "${nome}" não foi encontrada no projeto.`,
        );
    }

    if (!equipe.ativo) {
        throw new Error(
            `A equipe "${nome}" está inativa.`,
        );
    }

    return {
        tipo: "EQUIPE",
        id: equipe.id,
    };
}

async function quantidadeApropriada(
    equipamentoId: string,
    funcionarioId: string,
): Promise<number> {
    const apropriacao = await getDB()
        .apropriacoes
        .where("[equipamento_id+funcionario_id]")
        .equals([equipamentoId, funcionarioId])
        .first();

    return apropriacao?.quantidade ?? 0;
}

async function quantidadeEmManutencao(
    projetoId: string,
    equipamentoId: string,
): Promise<number> {
    const movimentacoes = await getDB()
        .movimentacoes_equipamentos
        .where("equipamento_id")
        .equals(equipamentoId)
        .filter(
            (movimentacao) =>
                movimentacao.projeto_id === projetoId,
        )
        .toArray();

    let quantidade = 0;

    for (const movimentacao of movimentacoes) {
        switch (movimentacao.tipo) {
            case "MANUTENCAO":
                quantidade += movimentacao.quantidade;
                break;

            case "RETIRADA_MANUTENCAO":
            case "RETORNO_MANUTENCAO":
                quantidade -= movimentacao.quantidade;
                break;

            case "DEVOLUCAO_FORNECEDOR":
                if (
                    movimentacao.tipo_origem === "EQUIPE"
                ) {
                    const equipe = await getDB()
                        .equipes
                        .get(movimentacao.origem_id);

                    if (
                        equipe?.nome.trim().toLowerCase() ===
                        "manutenção"
                    ) {
                        quantidade -= movimentacao.quantidade;
                    }
                }
                break;
        }
    }

    return Math.max(0, quantidade);
}

async function quantidadeNoAlmoxarifado(
    projetoId: string,
    equipamentoId: string,
): Promise<number> {
    const movimentacoes = await getDB()
        .movimentacoes_equipamentos
        .where("equipamento_id")
        .equals(equipamentoId)
        .filter(
            (movimentacao) =>
                movimentacao.projeto_id === projetoId,
        )
        .toArray();

    let quantidade = 0;

    for (const movimentacao of movimentacoes) {
        switch (movimentacao.tipo) {
            case "ENTRADA":
                quantidade += movimentacao.quantidade;
                break;

            case "SAIDA":
                quantidade -= movimentacao.quantidade;
                break;

            case "DEVOLUCAO":
                quantidade += movimentacao.quantidade;
                break;

            case "MANUTENCAO":
                if (
                    movimentacao.tipo_origem === "EQUIPE"
                ) {
                    quantidade -= movimentacao.quantidade;
                }
                break;

            case "RETORNO_MANUTENCAO":
                quantidade += movimentacao.quantidade;
                break;

            case "DEVOLUCAO_FORNECEDOR":
                if (
                    movimentacao.tipo_origem === "EQUIPE"
                ) {
                    const equipe = await getDB()
                        .equipes
                        .get(movimentacao.origem_id);

                    if (
                        equipe?.nome.trim().toLowerCase() ===
                        "almoxarifado"
                    ) {
                        quantidade -= movimentacao.quantidade;
                    }
                }
                break;
        }
    }

    return Math.max(0, quantidade);
}

async function alterarApropriacao(
    equipamentoId: string,
    funcionarioId: string,
    delta: number,
    agora: string,
): Promise<void> {
    const db = getDB();

    const existente = await db
        .apropriacoes
        .where("[equipamento_id+funcionario_id]")
        .equals([equipamentoId, funcionarioId])
        .first();

    const quantidadeAtual = existente?.quantidade ?? 0;
    const novaQuantidade = quantidadeAtual + delta;

    if (novaQuantidade < 0) {
        throw new Error(
            "A quantidade apropriada não pode ficar negativa.",
        );
    }

    if (novaQuantidade === 0) {
        if (existente) {
            await db.apropriacoes.delete(existente.id);
        }

        return;
    }

    await db.apropriacoes.put({
        id: existente?.id ?? uid(),
        equipamento_id: equipamentoId,
        funcionario_id: funcionarioId,
        quantidade: novaQuantidade,
        criado_em: existente?.criado_em ?? agora,
        atualizado_em: agora,
    });
}

function validarQuantidade(quantidade: number): void {
    if (
        !Number.isFinite(quantidade) ||
        quantidade <= 0
    ) {
        throw new Error(
            "A quantidade da movimentação deve ser maior que zero.",
        );
    }
}

async function validarQuantidadeDisponivel(
    projetoId: string,
    equipamentoId: string,
    quantidade: number,
): Promise<void> {
    const equipamento = await obterEquipamento(
        projetoId,
        equipamentoId,
    );

    const almoxarifado =
        await quantidadeNoAlmoxarifado(
            projetoId,
            equipamentoId,
        );

    if (quantidade > almoxarifado) {
        throw new Error(
            `Quantidade indisponível no Almoxarifado. Disponível: ${almoxarifado}.`,
        );
    }

    const manutencao =
        await quantidadeEmManutencao(
            projetoId,
            equipamentoId,
        );

    const saldo =
        equipamento.quantidade -
        equipamento.devolvido;

    if (
        almoxarifado + manutencao >
        saldo
    ) {
        throw new Error(
            "O estado do equipamento está inconsistente com o saldo registrado.",
        );
    }
}

async function validarEntrada(
    projetoId: string,
    equipamento: Equipamento,
    quantidade: number,
): Promise<void> {
    const almoxarifado =
        await quantidadeNoAlmoxarifado(
            projetoId,
            equipamento.id,
        );

    const manutencao =
        await quantidadeEmManutencao(
            projetoId,
            equipamento.id,
        );

    const apropriacoes = await getDB()
        .apropriacoes
        .where("equipamento_id")
        .equals(equipamento.id)
        .toArray();

    const apropriado = apropriacoes.reduce(
        (total, item) => total + item.quantidade,
        0,
    );

    const saldo =
        equipamento.quantidade -
        equipamento.devolvido;

    const atualmenteDistribuido =
        almoxarifado +
        manutencao +
        apropriado;

    if (
        atualmenteDistribuido + quantidade >
        saldo
    ) {
        throw new Error(
            `A entrada ultrapassa o saldo disponível do equipamento. Saldo: ${saldo}. Já distribuído: ${atualmenteDistribuido}.`,
        );
    }
}

async function validarRetornoManutencao(
    projetoId: string,
    equipamentoId: string,
    quantidade: number,
): Promise<void> {
    const manutencao =
        await quantidadeEmManutencao(
            projetoId,
            equipamentoId,
        );

    if (quantidade > manutencao) {
        throw new Error(
            `Quantidade em manutenção insuficiente. Disponível: ${manutencao}.`,
        );
    }
}

async function validarDevolucaoFornecedor(
    projetoId: string,
    equipamento: Equipamento,
    quantidade: number,
): Promise<void> {
    const almoxarifado =
        await quantidadeNoAlmoxarifado(
            projetoId,
            equipamento.id,
        );

    const manutencao =
        await quantidadeEmManutencao(
            projetoId,
            equipamento.id,
        );

    const disponivel =
        almoxarifado + manutencao;

    if (quantidade > disponivel) {
        throw new Error(
            `Quantidade insuficiente para devolução ao fornecedor. Disponível: ${disponivel}.`,
        );
    }
}

async function registrarMovimentacao(
    projetoId: string,
    equipamentoId: string,
    tipo: MovimentacaoEquipamentoTipo,
    quantidade: number,
    origem: Participante,
    destino: Participante,
    data: string,
    observacoes?: string | null,
): Promise<MovimentacaoEquipamento> {
    const agora = new Date().toISOString();

    const movimentacao: MovimentacaoEquipamento = {
        id: uid(),
        projeto_id: projetoId,
        equipamento_id: equipamentoId,
        tipo,
        quantidade,
        tipo_origem: origem.tipo,
        origem_id: origem.id,
        tipo_destino: destino.tipo,
        destino_id: destino.id,
        data,
        observacoes: observacoes ?? null,
        criado_em: agora,
        atualizado_em: agora,
    };

    await getDB()
        .movimentacoes_equipamentos
        .add(movimentacao);

    return movimentacao;
}

export const movimentacoesEquipamentosRepo = {
    async registrar(
        input: RegistrarMovimentacaoInput,
    ): Promise<MovimentacaoEquipamento> {
        validarQuantidade(input.quantidade);

        const db = getDB();

        const equipamento = await obterEquipamento(
            input.projetoId,
            input.equipamentoId,
        );

        const agora = new Date().toISOString();
        const data = input.data ?? agora;

        let origem: Participante;
        let destino: Participante;

        switch (input.tipo) {
            case "ENTRADA": {
                await validarEntrada(
                    input.projetoId,
                    equipamento,
                    input.quantidade,
                );

                origem = await obterEmpresa(
                    input.projetoId,
                    equipamento.empresa_id,
                );

                destino = await obterEquipe(
                    input.projetoId,
                    "Almoxarifado",
                );

                break;
            }

            case "SAIDA": {
                if (!input.funcionarioId) {
                    throw new Error(
                        "Funcionário é obrigatório na saída.",
                    );
                }

                await validarQuantidadeDisponivel(
                    input.projetoId,
                    input.equipamentoId,
                    input.quantidade,
                );

                origem = await obterEquipe(
                    input.projetoId,
                    "Almoxarifado",
                );

                destino = await obterFuncionario(
                    input.projetoId,
                    input.funcionarioId,
                );

                break;
            }

            case "DEVOLUCAO": {
                if (!input.funcionarioId) {
                    throw new Error(
                        "Funcionário é obrigatório na devolução.",
                    );
                }

                const apropriada =
                    await quantidadeApropriada(
                        input.equipamentoId,
                        input.funcionarioId,
                    );

                if (input.quantidade > apropriada) {
                    throw new Error(
                        `O funcionário possui apenas ${apropriada} unidade(s) apropriada(s).`,
                    );
                }

                origem = await obterFuncionario(
                    input.projetoId,
                    input.funcionarioId,
                );

                destino = await obterEquipe(
                    input.projetoId,
                    "Almoxarifado",
                );

                break;
            }

            case "TRANSFERENCIA": {
                if (
                    !input.funcionarioId ||
                    !input.funcionarioDestinoId
                ) {
                    throw new Error(
                        "Funcionário de origem e funcionário de destino são obrigatórios na transferência.",
                    );
                }

                if (
                    input.funcionarioId ===
                    input.funcionarioDestinoId
                ) {
                    throw new Error(
                        "O funcionário de origem deve ser diferente do funcionário de destino.",
                    );
                }

                const apropriada =
                    await quantidadeApropriada(
                        input.equipamentoId,
                        input.funcionarioId,
                    );

                if (input.quantidade > apropriada) {
                    throw new Error(
                        `O funcionário possui apenas ${apropriada} unidade(s) apropriada(s).`,
                    );
                }

                origem = await obterFuncionario(
                    input.projetoId,
                    input.funcionarioId,
                );

                destino = await obterFuncionario(
                    input.projetoId,
                    input.funcionarioDestinoId,
                );

                break;
            }

            case "MANUTENCAO": {
                const manutencao =
                    await obterEquipe(
                        input.projetoId,
                        "Manutenção",
                    );

                if (input.funcionarioId) {
                    const apropriada =
                        await quantidadeApropriada(
                            input.equipamentoId,
                            input.funcionarioId,
                        );

                    if (input.quantidade > apropriada) {
                        throw new Error(
                            `O funcionário possui apenas ${apropriada} unidade(s) apropriada(s).`,
                        );
                    }

                    origem = await obterFuncionario(
                        input.projetoId,
                        input.funcionarioId,
                    );
                } else {
                    await validarQuantidadeDisponivel(
                        input.projetoId,
                        input.equipamentoId,
                        input.quantidade,
                    );

                    origem = await obterEquipe(
                        input.projetoId,
                        "Almoxarifado",
                    );
                }

                destino = manutencao;

                break;
            }

            case "RETIRADA_MANUTENCAO": {
                const manutencao =
                    await quantidadeEmManutencao(
                        input.projetoId,
                        input.equipamentoId,
                    );

                if (input.quantidade > manutencao) {
                    throw new Error(
                        `Quantidade disponível em manutenção: ${manutencao}.`,
                    );
                }

                origem = await obterEquipe(
                    input.projetoId,
                    "Manutenção",
                );

                destino = await obterEmpresa(
                    input.projetoId,
                    equipamento.empresa_id,
                );

                break;
            }

            case "RETORNO_MANUTENCAO": {
                await validarRetornoManutencao(
                    input.projetoId,
                    input.equipamentoId,
                    input.quantidade,
                );

                origem = await obterEmpresa(
                    input.projetoId,
                    equipamento.empresa_id,
                );

                destino = await obterEquipe(
                    input.projetoId,
                    "Almoxarifado",
                );

                break;
            }

            case "DEVOLUCAO_FORNECEDOR": {
                await validarDevolucaoFornecedor(
                    input.projetoId,
                    equipamento,
                    input.quantidade,
                );

                const almoxarifado =
                    await obterEquipe(
                        input.projetoId,
                        "Almoxarifado",
                    );

                const manutencao =
                    await obterEquipe(
                        input.projetoId,
                        "Manutenção",
                    );

                const almoxarifadoQuantidade =
                    await quantidadeNoAlmoxarifado(
                        input.projetoId,
                        input.equipamentoId,
                    );

                if (
                    input.quantidade <=
                    almoxarifadoQuantidade
                ) {
                    origem = almoxarifado;
                } else {
                    origem = manutencao;
                }

                destino = await obterEmpresa(
                    input.projetoId,
                    equipamento.empresa_id,
                );

                break;
            }
        }

        return db.transaction(
            "rw",
            [
                db.equipamentos,
                db.apropriacoes,
                db.movimentacoes_equipamentos,
            ],
            async () => {
                const novaMovimentacao =
                    await registrarMovimentacao(
                        input.projetoId,
                        input.equipamentoId,
                        input.tipo,
                        input.quantidade,
                        origem,
                        destino,
                        data,
                        input.observacoes,
                    );

                switch (input.tipo) {
                    case "SAIDA":
                        await alterarApropriacao(
                            input.equipamentoId,
                            input.funcionarioId!,
                            input.quantidade,
                            agora,
                        );
                        break;

                    case "DEVOLUCAO":
                        await alterarApropriacao(
                            input.equipamentoId,
                            input.funcionarioId!,
                            -input.quantidade,
                            agora,
                        );
                        break;

                    case "TRANSFERENCIA":
                        await alterarApropriacao(
                            input.equipamentoId,
                            input.funcionarioId!,
                            -input.quantidade,
                            agora,
                        );

                        await alterarApropriacao(
                            input.equipamentoId,
                            input.funcionarioDestinoId!,
                            input.quantidade,
                            agora,
                        );
                        break;

                    case "MANUTENCAO":
                        if (input.funcionarioId) {
                            await alterarApropriacao(
                                input.equipamentoId,
                                input.funcionarioId,
                                -input.quantidade,
                                agora,
                            );
                        }
                        break;
                }

                if (
                    input.tipo ===
                    "DEVOLUCAO_FORNECEDOR"
                ) {
                    const atualizado =
                        await db.equipamentos.get(
                            input.equipamentoId,
                        );

                    if (!atualizado) {
                        throw new Error(
                            "Equipamento não encontrado durante a atualização.",
                        );
                    }

                    const novoDevolvido =
                        atualizado.devolvido +
                        input.quantidade;

                    if (
                        novoDevolvido >
                        atualizado.quantidade
                    ) {
                        throw new Error(
                            "A quantidade devolvida não pode ultrapassar a quantidade total.",
                        );
                    }

                    await db.equipamentos.put({
                        ...atualizado,
                        devolvido: novoDevolvido,
                        status:
                            atualizado.quantidade -
                                novoDevolvido >
                                0
                                ? "ATIVO"
                                : "ENCERRADO",
                        atualizado_em: agora,
                    });
                }

                return novaMovimentacao;
            },
        );
    },

    async listar(
        projetoId: string,
        equipamentoId?: string,
    ): Promise<MovimentacaoEquipamento[]> {
        const db = getDB();

        const movimentacoes = equipamentoId
            ? await db.movimentacoes_equipamentos
                .where("equipamento_id")
                .equals(equipamentoId)
                .toArray()
            : await db.movimentacoes_equipamentos
                .where("projeto_id")
                .equals(projetoId)
                .toArray();

        return movimentacoes
            .filter(
                (movimentacao) =>
                    movimentacao.projeto_id === projetoId,
            )
            .sort((a, b) =>
                a.data < b.data ? 1 : -1,
            );
    },
};