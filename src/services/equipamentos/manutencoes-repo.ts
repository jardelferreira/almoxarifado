import { getDB, uid } from "@/db/db";
import type {
  ManutencaoEquipamento,
  ManutencaoEquipamentoOrigem,
  ManutencaoEquipamentoStatusDetalhamento,
  ManutencaoEquipamentoStatusOperacional,
  ManutencaoEquipamentoTipo,
  MovimentacaoEquipamento,
} from "@/types";

type StoredManutencao = Partial<ManutencaoEquipamento> & {
  id: string;
  projeto_id: string;
  estoque_equipamento_id: string;
  equipamento_id: string;
  // Compatibilidade com a primeira V14 da ocorrência desacoplada.
  status?: string;
  data_inicio?: string | null;
};

type DetalhamentoInput = {
  tipo: ManutencaoEquipamentoTipo;
  motivo: string;
  descricao_servico?: string | null;
  empresa_id?: string | null;
  data_previsao_retorno?: string | null;
  resultado?: string | null;
  observacoes?: string | null;
};

type RetroativaInput = DetalhamentoInput & {
  estoque_equipamento_id: string;
  data_abertura: string;
  data_envio?: string | null;
  data_retorno?: string | null;
  movimento_sinalizacao_id?: string | null;
  movimento_envio_id?: string | null;
  movimento_retorno_id?: string | null;
  quantidade?: number;
};

const TIPOS: ManutencaoEquipamentoTipo[] = [
  "CORRETIVA",
  "PREVENTIVA",
  "INSPECAO",
  "OUTRA",
];

function normalizarTexto(valor?: string | null): string | null {
  const texto = valor?.trim();
  return texto ? texto : null;
}

function validarData(data: string | null | undefined, campo: string): void {
  if (!data) return;
  if (Number.isNaN(new Date(data).getTime())) {
    throw new Error(`A data de ${campo} é inválida.`);
  }
}

function validarTipo(tipo: ManutencaoEquipamentoTipo): void {
  if (!TIPOS.includes(tipo)) throw new Error("Tipo de manutenção inválido.");
}

function statusDetalhamentoAtual(item: {
  descricao_servico?: string | null;
  empresa_id?: string | null;
  resultado?: string | null;
  observacoes?: string | null;
}): ManutencaoEquipamentoStatusDetalhamento {
  const preenchidos = [
    item.descricao_servico,
    item.empresa_id,
    item.resultado,
    item.observacoes,
  ].filter((valor) => Boolean(valor?.trim?.() ?? valor)).length;

  if (preenchidos === 0) return "NAO_DETALHADA";
  if (preenchidos >= 3) return "DETALHADA";
  return "PARCIALMENTE_DETALHADA";
}

function normalizarOcorrencia(row: StoredManutencao): ManutencaoEquipamento {
  if (row.status_operacional && row.status_detalhamento && row.origem && row.quantidade) {
    return {
      ...(row as ManutencaoEquipamento),
      quantidade: Number(row.quantidade) || 1,
      status_detalhamento: row.status_detalhamento,
    };
  }

  const legadoStatus = row.status;
  const status_operacional: ManutencaoEquipamentoStatusOperacional =
    legadoStatus === "CONCLUIDA"
      ? "CONCLUIDA"
      : row.movimento_envio_id || row.data_inicio
        ? "EM_MANUTENCAO"
        : "AGUARDANDO_ENVIO";

  return {
    id: row.id,
    projeto_id: row.projeto_id,
    estoque_equipamento_id: row.estoque_equipamento_id,
    equipamento_id: row.equipamento_id,
    quantidade: Number(row.quantidade) || 1,
    origem: (row.origem as ManutencaoEquipamentoOrigem | undefined) ?? "MANUAL",
    tipo: row.tipo ?? "OUTRA",
    status_operacional,
    status_detalhamento: row.status_detalhamento ?? statusDetalhamentoAtual(row),
    motivo: row.motivo ?? "Manutenção registrada.",
    descricao_servico: row.descricao_servico ?? null,
    empresa_id: row.empresa_id ?? null,
    data_abertura: row.data_abertura ?? row.data_inicio ?? new Date().toISOString().slice(0, 10),
    data_envio: row.data_envio ?? row.data_inicio ?? null,
    data_previsao_retorno: row.data_previsao_retorno ?? null,
    data_retorno: row.data_retorno ?? null,
    data_conclusao: row.data_conclusao ?? row.data_retorno ?? null,
    movimento_sinalizacao_id: row.movimento_sinalizacao_id ?? null,
    movimento_envio_id: row.movimento_envio_id ?? null,
    movimento_retorno_id: row.movimento_retorno_id ?? null,
    resultado: row.resultado ?? null,
    observacoes: row.observacoes ?? null,
    criado_em: row.criado_em ?? new Date().toISOString(),
    atualizado_em: row.atualizado_em ?? new Date().toISOString(),
  };
}

async function verificarProjeto(projetoId: string, estoqueId: string): Promise<{ estoque: any; equipamento: any }> {
  const db = getDB();
  const estoque = await db.estoque_equipamentos.get(estoqueId);
  if (!estoque || estoque.projeto_id !== projetoId) {
    throw new Error("Registro de estoque não encontrado neste projeto.");
  }
  const equipamento = await db.equipamentos.get(estoque.equipamento_id);
  if (!equipamento || equipamento.projeto_id !== projetoId) {
    throw new Error("Equipamento não encontrado neste projeto.");
  }
  return { estoque, equipamento };
}

async function verificarEmpresa(projetoId: string, empresaId?: string | null): Promise<void> {
  if (!empresaId) return;
  const empresa = await getDB().empresas.get(empresaId);
  if (!empresa || empresa.projeto_id !== projetoId) throw new Error("A empresa de manutenção não pertence ao projeto.");
  if (!empresa.ativo) throw new Error("A empresa de manutenção está inativa.");
}

function ordenar(rows: ManutencaoEquipamento[]) {
  return [...rows].sort((a, b) => `${b.data_abertura}|${b.id}`.localeCompare(`${a.data_abertura}|${a.id}`));
}

async function buscarOcorrenciasEstoque(estoqueId: string): Promise<ManutencaoEquipamento[]> {
  const rows = await getDB().manutencoes_equipamentos.where("estoque_equipamento_id").equals(estoqueId).toArray();
  return rows.map((row) => normalizarOcorrencia(row as StoredManutencao));
}

async function salvarInterno(ocorrencia: ManutencaoEquipamento): Promise<ManutencaoEquipamento> {
  await getDB().manutencoes_equipamentos.put(ocorrencia);
  return ocorrencia;
}

function novoBase(
  projetoId: string,
  estoque: any,
  tipo: ManutencaoEquipamentoTipo,
  motivo: string,
  origem: ManutencaoEquipamentoOrigem,
  quantidade: number,
  dataAbertura: string,
): ManutencaoEquipamento {
  const agora = new Date().toISOString();
  return {
    id: uid(),
    projeto_id: projetoId,
    estoque_equipamento_id: estoque.id,
    equipamento_id: estoque.equipamento_id,
    quantidade,
    origem,
    tipo,
    status_operacional: "AGUARDANDO_ENVIO",
    status_detalhamento: "NAO_DETALHADA",
    motivo: motivo.trim() || "Manutenção registrada.",
    descricao_servico: null,
    empresa_id: null,
    data_abertura: dataAbertura,
    data_envio: null,
    data_previsao_retorno: null,
    data_retorno: null,
    data_conclusao: null,
    movimento_sinalizacao_id: null,
    movimento_envio_id: null,
    movimento_retorno_id: null,
    resultado: null,
    observacoes: null,
    criado_em: agora,
    atualizado_em: agora,
  };
}

function aplicarDetalhamento(
  ocorrencia: ManutencaoEquipamento,
  dados: DetalhamentoInput,
): ManutencaoEquipamento {
  const atualizada: ManutencaoEquipamento = {
    ...ocorrencia,
    tipo: dados.tipo,
    motivo: dados.motivo.trim() || ocorrencia.motivo,
    descricao_servico: normalizarTexto(dados.descricao_servico),
    empresa_id: dados.empresa_id ?? null,
    data_previsao_retorno: dados.data_previsao_retorno ?? null,
    resultado: normalizarTexto(dados.resultado),
    observacoes: normalizarTexto(dados.observacoes),
    atualizado_em: new Date().toISOString(),
  };
  atualizada.status_detalhamento = statusDetalhamentoAtual(atualizada);
  return atualizada;
}

export const manutencoesEquipamentosRepo = {
  async listar(projetoId: string): Promise<ManutencaoEquipamento[]> {
    const rows = await getDB().manutencoes_equipamentos.where("projeto_id").equals(projetoId).toArray();
    return ordenar(rows.map((row) => normalizarOcorrencia(row as StoredManutencao)));
  },

  async listarPorEstoque(projetoId: string, estoqueId: string): Promise<ManutencaoEquipamento[]> {
    const { estoque } = await verificarProjeto(projetoId, estoqueId);
    if (!estoque) throw new Error("Registro de estoque não encontrado neste projeto.");
    return ordenar(await buscarOcorrenciasEstoque(estoqueId));
  },

  async atualizarDetalhamento(
    projetoId: string,
    ocorrenciaId: string,
    dados: DetalhamentoInput,
  ): Promise<ManutencaoEquipamento> {
    validarTipo(dados.tipo);
    validarData(dados.data_previsao_retorno, "previsão de retorno");
    const db = getDB();
    const stored = await db.manutencoes_equipamentos.get(ocorrenciaId);
    if (!stored || stored.projeto_id !== projetoId) throw new Error("Ocorrência de manutenção não encontrada neste projeto.");
    const atual = aplicarDetalhamento(normalizarOcorrencia(stored as StoredManutencao), dados);
    await verificarEmpresa(projetoId, atual.empresa_id);
    await salvarInterno(atual);
    return atual;
  },

  async criarRetroativa(
    projetoId: string,
    dados: RetroativaInput,
  ): Promise<ManutencaoEquipamento> {
    validarTipo(dados.tipo);
    if (!dados.motivo.trim()) throw new Error("Informe o motivo da manutenção.");
    if (!dados.data_abertura) throw new Error("Informe a data de abertura.");
    validarData(dados.data_abertura, "abertura");
    validarData(dados.data_envio, "envio");
    validarData(dados.data_previsao_retorno, "previsão de retorno");
    validarData(dados.data_retorno, "retorno");
    if (dados.data_envio && dados.data_envio < dados.data_abertura) throw new Error("A data de envio não pode ser anterior à abertura.");
    if (dados.data_retorno && dados.data_envio && dados.data_retorno < dados.data_envio) throw new Error("A data de retorno não pode ser anterior ao envio.");

    const { estoque } = await verificarProjeto(projetoId, dados.estoque_equipamento_id);
    await verificarEmpresa(projetoId, dados.empresa_id);

    const agora = new Date().toISOString();
    const status_operacional: ManutencaoEquipamentoStatusOperacional = dados.data_retorno
      ? "CONCLUIDA"
      : dados.data_envio
        ? "EM_MANUTENCAO"
        : "AGUARDANDO_ENVIO";

    const ocorrencia: ManutencaoEquipamento = {
      ...novoBase(projetoId, estoque, dados.tipo, dados.motivo, "RETROATIVA", Math.max(1, dados.quantidade ?? estoque.quantidade), dados.data_abertura),
      status_operacional,
      data_envio: dados.data_envio ?? null,
      data_previsao_retorno: dados.data_previsao_retorno ?? null,
      data_retorno: dados.data_retorno ?? null,
      data_conclusao: dados.data_retorno ?? null,
      movimento_sinalizacao_id: dados.movimento_sinalizacao_id ?? null,
      movimento_envio_id: dados.movimento_envio_id ?? null,
      movimento_retorno_id: dados.movimento_retorno_id ?? null,
      descricao_servico: normalizarTexto(dados.descricao_servico),
      empresa_id: dados.empresa_id ?? null,
      resultado: normalizarTexto(dados.resultado),
      observacoes: normalizarTexto(dados.observacoes),
      criado_em: agora,
      atualizado_em: agora,
    };
    ocorrencia.status_detalhamento = statusDetalhamentoAtual(ocorrencia);
    await salvarInterno(ocorrencia);
    return ocorrencia;
  },

  async sincronizarComMovimentacao(movimentacao: MovimentacaoEquipamento): Promise<ManutencaoEquipamento | undefined> {
    const tiposSinalizacao = ["SINALIZAR_MANUTENCAO", "MANUTENCAO"];
    const tiposEnvio = ["ENVIO", "RETIRADA_MANUTENCAO"];
    const db = getDB();
    const estoque = await db.estoque_equipamentos.get(movimentacao.estoque_equipamento_id);
    if (!estoque || estoque.projeto_id !== movimentacao.projeto_id) return undefined;

    const atuais = await buscarOcorrenciasEstoque(estoque.id);

    if (tiposSinalizacao.includes(movimentacao.tipo)) {
      const existente = atuais.find((item) => item.movimento_sinalizacao_id === movimentacao.id);
      if (existente) return existente;

      const equipamento = await db.equipamentos.get(estoque.equipamento_id);
      const ocorrencia = novoBase(
        movimentacao.projeto_id,
        estoque,
        "CORRETIVA",
        movimentacao.observacoes?.trim() || "Manutenção sinalizada na movimentação.",
        "AUTOMATICA",
        Math.max(1, movimentacao.quantidade),
        movimentacao.data,
      );
      if (equipamento?.projeto_id !== movimentacao.projeto_id) return undefined;
      ocorrencia.movimento_sinalizacao_id = movimentacao.id;
      ocorrencia.status_detalhamento = "NAO_DETALHADA";
      return salvarInterno(ocorrencia);
    }

    if (tiposEnvio.includes(movimentacao.tipo)) {
      const candidata = atuais
        .filter((item) => item.status_operacional === "AGUARDANDO_ENVIO" && !item.movimento_envio_id)
        .filter((item) => item.quantidade === movimentacao.quantidade)
        .sort((a, b) => `${a.data_abertura}|${a.id}`.localeCompare(`${b.data_abertura}|${b.id}`))[0];

      if (candidata) {
        candidata.movimento_envio_id = movimentacao.id;
        candidata.data_envio = movimentacao.data;
        candidata.status_operacional = "EM_MANUTENCAO";
        candidata.empresa_id = movimentacao.tipo_destino === "EMPRESA"
          ? movimentacao.destino_id
          : candidata.empresa_id ?? null;
        candidata.atualizado_em = new Date().toISOString();
        return salvarInterno(candidata);
      }

      const retroativa = novoBase(
        movimentacao.projeto_id,
        estoque,
        "CORRETIVA",
        movimentacao.observacoes?.trim() || "Envio para manutenção sem sinalização correspondente.",
        "RETROATIVA",
        Math.max(1, movimentacao.quantidade),
        movimentacao.data,
      );
      retroativa.movimento_envio_id = movimentacao.id;
      retroativa.data_envio = movimentacao.data;
      retroativa.status_operacional = "EM_MANUTENCAO";
      retroativa.empresa_id = movimentacao.destino_id || null;
      return salvarInterno(retroativa);
    }

    if (movimentacao.tipo === "RETORNO_MANUTENCAO") {
      const candidata = atuais
        .filter((item) => item.status_operacional === "EM_MANUTENCAO" && !item.movimento_retorno_id)
        .filter((item) => item.quantidade === movimentacao.quantidade)
        .sort((a, b) => `${a.data_envio ?? a.data_abertura}|${a.id}`.localeCompare(`${b.data_envio ?? b.data_abertura}|${b.id}`))[0];

      if (candidata) {
        candidata.movimento_retorno_id = movimentacao.id;
        candidata.data_retorno = movimentacao.data;
        candidata.data_conclusao = movimentacao.data;
        candidata.status_operacional = "CONCLUIDA";
        candidata.atualizado_em = new Date().toISOString();
        return salvarInterno(candidata);
      }

      // Retorno sem ciclo prévio não deve bloquear a operação física. Criamos
      // uma ocorrência retroativa encerrada para preservar a trilha.
      const retroativa = novoBase(
        movimentacao.projeto_id,
        estoque,
        "CORRETIVA",
        movimentacao.observacoes?.trim() || "Retorno de manutenção sem ocorrência anterior.",
        "RETROATIVA",
        Math.max(1, movimentacao.quantidade),
        movimentacao.data,
      );
      retroativa.movimento_retorno_id = movimentacao.id;
      retroativa.data_retorno = movimentacao.data;
      retroativa.data_conclusao = movimentacao.data;
      retroativa.status_operacional = "CONCLUIDA";
      return salvarInterno(retroativa);
    }

    return undefined;
  },
};
