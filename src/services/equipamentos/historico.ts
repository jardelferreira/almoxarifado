import type { Equipamento, Funcionario, MovimentacaoEquipamento } from "@/types";

export type ParticipanteMaps = {
    funcionarios: Map<string, Funcionario>;
    equipes: Map<string, string>;
    empresas: Map<string, string>;
};

export type HistoricoEquipamentoEvento = {
    id: string;
    movimento: MovimentacaoEquipamento;
    titulo: string;
    descricao: string;
    origem: string;
    destino: string;
    tipo: MovimentacaoEquipamento["tipo"];
    quantidade: number;
    data: string;
    criadoEm: string;
    observacoes: string | null;
    referenciaDocumento: string | null;
};

export function nomeParticipante(
    movimento: MovimentacaoEquipamento,
    maps: ParticipanteMaps,
    lado: "origem" | "destino",
): string {
    const parte = lado === "origem" ? movimento.tipo_origem : movimento.tipo_destino;
    const id = lado === "origem" ? movimento.origem_id : movimento.destino_id;

    if (parte === "FUNCIONARIO") return maps.funcionarios.get(id)?.nome ?? id;
    if (parte === "EQUIPE") return maps.equipes.get(id) ?? id;
    return maps.empresas.get(id) ?? id;
}

export function descricaoMovimento(
    movimento: MovimentacaoEquipamento,
    maps: ParticipanteMaps,
): string {
    const origem = nomeParticipante(movimento, maps, "origem");
    const destino = nomeParticipante(movimento, maps, "destino");

    return `${origem} → ${destino}`;
}

export function tituloMovimento(tipo: MovimentacaoEquipamento["tipo"]): string {
    const titulos: Record<MovimentacaoEquipamento["tipo"], string> = {
        ENTRADA: "Entrada no estoque",
        SAIDA: "Apropriação / saída",
        DEVOLUCAO: "Devolução",
        TRANSFERENCIA: "Transferência",
        SINALIZAR_MANUTENCAO: "Sinalização para manutenção",
        ENVIO: "Envio",
        RETORNO_MANUTENCAO: "Retorno da manutenção",
        DEVOLUCAO_FORNECEDOR: "Devolução ao fornecedor",
        BAIXA: "Baixa",
        REENTRADA: "Reentrada no estoque",
        MANUTENCAO: "Manutenção",
        RETIRADA_MANUTENCAO: "Retirada da manutenção",
    };

    return titulos[tipo];
}

export function ordenarMovimentacoes(
    movimentacoes: MovimentacaoEquipamento[],
): MovimentacaoEquipamento[] {
    return [...movimentacoes].sort((a, b) => {
        const dataA = `${a.data}|${a.criado_em}|${a.id}`;
        const dataB = `${b.data}|${b.criado_em}|${b.id}`;
        return dataB.localeCompare(dataA);
    });
}

export function construirHistoricoEquipamento(
    equipamento: Equipamento | null | undefined,
    movimentacoes: MovimentacaoEquipamento[],
    maps: ParticipanteMaps,
): HistoricoEquipamentoEvento[] {
    if (!equipamento) return [];

    return ordenarMovimentacoes(movimentacoes)
        .filter((movimento) => movimento.projeto_id === equipamento.projeto_id)
        .map((movimento) => ({
            id: movimento.id,
            movimento,
            titulo: tituloMovimento(movimento.tipo),
            descricao: descricaoMovimento(movimento, maps),
            origem: nomeParticipante(movimento, maps, "origem"),
            destino: nomeParticipante(movimento, maps, "destino"),
            tipo: movimento.tipo,
            quantidade: movimento.quantidade,
            data: movimento.data,
            criadoEm: movimento.criado_em,
            observacoes: movimento.observacoes ?? null,
            referenciaDocumento: movimento.referencia_documento ?? null,
        }));
}
