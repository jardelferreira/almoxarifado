import { getDB, uid } from "@/db/db";
import { regrasConsumoEquipamentosRepo } from "@/services/equipamentos/regras-consumo-repo";
import type {
  Equipamento,
  PerfilParametroCusto,
  PerfilParametroCustoExportado,
  PerfilParametroCustoEquipamento,
  PerfilParametroCustoOrigem,
  PerfilParametroCustoRegra,
  PacotePerfisParametroCusto,
  SalvarPerfilParametroCustoInput,
  CarregarPerfilParametroCustoResultado,
} from "@/types";
import {
  PERFIL_PARAMETRO_CUSTO_FORMATO,
  PERFIL_PARAMETRO_CUSTO_VERSAO_FORMATO,
} from "@/types";

function normalizarTexto(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function chaveEquipamentoPerfil(equipamento: Pick<Equipamento, "nome" | "modelo">): string {
  return `${normalizarTexto(equipamento.nome)}|${normalizarTexto(equipamento.modelo)}`;
}

export function chaveProdutoPerfil(produto: { codigo?: string | null | undefined; nome: string; unidade_id?: string | null | undefined }): string {
  const codigo = normalizarTexto(produto.codigo);
  if (codigo) return `codigo:${codigo}`;
  return `nome:${normalizarTexto(produto.nome)}|unidade:${normalizarTexto(produto.unidade_id)}`;
}

function numero(valor: number | null | undefined): number | null {
  return valor != null && Number.isFinite(valor) && valor >= 0 ? valor : null;
}

function validarNome(nome: string): string {
  const normalizado = nome.trim();
  if (!normalizado) throw new Error("Informe um nome para o perfil de parâmetros.");
  if (normalizado.length > 120) throw new Error("O nome do perfil pode ter no máximo 120 caracteres.");
  return normalizado;
}

function validarPeriodo(inicio: string, fim: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    throw new Error("O período de referência deve utilizar o formato AAAA-MM-DD.");
  }
  if (inicio > fim) throw new Error("O período de referência é inválido.");
}

async function criarSnapshotEquipamento(
  projetoId: string,
  entrada: SalvarPerfilParametroCustoInput["equipamentos"][number],
  precosManuais: Record<string, number | null>,
): Promise<PerfilParametroCustoEquipamento> {
  const db = getDB();
  const equipamento = await db.equipamentos.get(entrada.equipamento_id);
  if (!equipamento || equipamento.projeto_id !== projetoId) {
    throw new Error("Um equipamento selecionado não pertence ao projeto ativo.");
  }

  const [regras, produtos, unidades] = await Promise.all([
    regrasConsumoEquipamentosRepo.listarPorEquipamento(projetoId, equipamento.id),
    db.produtos.where("projeto_id").equals(projetoId).toArray(),
    db.unidades.toArray(),
  ]);

  const produtoPorId = new Map(produtos.map((item) => [item.id, item]));
  const unidadePorId = new Map(unidades.map((item) => [item.id, item]));

  const regrasSnapshot = regras
    .filter((regra) => regra.ativo && regra.estoque_equipamento_id === null)
    .map((regra): PerfilParametroCustoRegra | null => {
      const produto = produtoPorId.get(regra.produto_id);
      if (!produto) return null;
      const unidadeBase = unidadePorId.get(regra.unidade_base_id);
      const unidadeConsumo = unidadePorId.get(regra.unidade_consumo_id);
      return {
        chave_produto: chaveProdutoPerfil(produto),
        produto_nome: produto.nome,
        produto_codigo: produto.codigo ?? null,
        unidade_base_sigla: unidadeBase?.sigla ?? "un.",
        unidade_consumo_sigla: unidadeConsumo?.sigla ?? "un.",
        fator: regra.fator,
        direcionador: regra.direcionador,
        periodicidade: regra.periodicidade,
        vigencia_inicio: regra.vigencia_inicio,
        vigencia_fim: regra.vigencia_fim,
        observacao: regra.observacao,
        custo_unitario_manual: numero(precosManuais[regra.produto_id]),
      };
    })
    .filter((item): item is PerfilParametroCustoRegra => item !== null);

  return {
    chave_equipamento: chaveEquipamentoPerfil(equipamento),
    nome: equipamento.nome,
    modelo: equipamento.modelo ?? null,
    tipo_controle: equipamento.tipo_controle,
    quantidade: Math.max(1, Number(entrada.quantidade) || 1),
    uso_previsto: Math.max(0, Number(entrada.uso_previsto) || 0),
    direcionador: entrada.direcionador,
    manutencao_ocorrencias_por_unidade: Math.max(0, Number(entrada.manutencao_ocorrencias_por_unidade) || 0),
    manutencao_valor_por_ocorrencia: Math.max(0, Number(entrada.manutencao_valor_por_ocorrencia) || 0),
    custo_recorrente_unitario_override: numero(entrada.custo_recorrente_unitario_override),
    periodicidade_recorrente_override: entrada.periodicidade_recorrente_override,
    regras: regrasSnapshot,
  };
}

async function criarPerfilCompleto(
  projetoId: string,
  input: SalvarPerfilParametroCustoInput,
  perfilId: string,
  versao: number,
): Promise<PerfilParametroCusto> {
  validarNome(input.nome);
  validarPeriodo(input.periodo_referencia_inicio, input.periodo_referencia_fim);
  if (!input.equipamentos.length) throw new Error("Adicione pelo menos um equipamento antes de salvar o perfil.");

  const equipamentos = await Promise.all(
    input.equipamentos.map((entrada) => criarSnapshotEquipamento(projetoId, entrada, input.precosManuais)),
  );
  const agora = new Date().toISOString();
  return {
    id: uid(),
    perfil_id: perfilId,
    projeto_id: projetoId,
    nome: input.nome.trim(),
    descricao: input.descricao?.trim() || null,
    versao,
    origem: input.origem ?? "MANUAL",
    periodo_referencia_inicio: input.periodo_referencia_inicio,
    periodo_referencia_fim: input.periodo_referencia_fim,
    fonte_dados: input.fonte_dados?.trim() || null,
    equipamentos,
    observacoes: input.observacoes?.trim() || null,
    criado_em: agora,
    atualizado_em: agora,
  };
}

async function proximaVersao(projetoId: string, perfilId: string): Promise<number> {
  const rows = await getDB().perfis_parametros_custos
    .where("[projeto_id+perfil_id]")
    .equals([projetoId, perfilId])
    .toArray();
  return rows.reduce((max, item) => Math.max(max, item.versao), 0) + 1;
}

export async function listarPerfis(projetoId: string): Promise<PerfilParametroCusto[]> {
  const rows = await getDB().perfis_parametros_custos
    .where("projeto_id")
    .equals(projetoId)
    .toArray();
  return rows.sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR") || b.versao - a.versao || b.atualizado_em.localeCompare(a.atualizado_em),
  );
}

export async function listarPerfisAtuais(projetoId: string): Promise<PerfilParametroCusto[]> {
  const rows = await listarPerfis(projetoId);
  const atuais = new Map<string, PerfilParametroCusto>();
  for (const row of rows) {
    const atual = atuais.get(row.perfil_id);
    if (!atual || row.versao > atual.versao) atuais.set(row.perfil_id, row);
  }
  return [...atuais.values()].sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
}

export async function obterPerfil(projetoId: string, id: string): Promise<PerfilParametroCusto> {
  const perfil = await getDB().perfis_parametros_custos.get(id);
  if (!perfil || perfil.projeto_id !== projetoId) throw new Error("Perfil de parâmetros não encontrado.");
  return perfil;
}

export async function salvarPerfil(
  projetoId: string,
  input: SalvarPerfilParametroCustoInput,
): Promise<PerfilParametroCusto> {
  const perfilId = input.perfilId ?? uid();
  const versao = input.perfilId ? await proximaVersao(projetoId, perfilId) : 1;
  const perfil = await criarPerfilCompleto(projetoId, input, perfilId, versao);
  await getDB().perfis_parametros_custos.put(perfil);
  return perfil;
}

export async function duplicarPerfil(
  projetoId: string,
  perfilId: string,
  novoNome?: string,
): Promise<PerfilParametroCusto> {
  const original = await obterPerfil(projetoId, perfilId);
  const agora = new Date().toISOString();
  const copia: PerfilParametroCusto = {
    ...structuredClone(original),
    id: uid(),
    perfil_id: uid(),
    nome: (novoNome?.trim() || `${original.nome} — cópia`).slice(0, 120),
    versao: 1,
    origem: "DUPLICADO",
    criado_em: agora,
    atualizado_em: agora,
  };
  await getDB().perfis_parametros_custos.put(copia);
  return copia;
}

export async function excluirPerfil(projetoId: string, perfilId: string): Promise<void> {
  const rows = await getDB().perfis_parametros_custos
    .where("[projeto_id+perfil_id]")
    .equals([projetoId, perfilId])
    .toArray();
  if (!rows.length) throw new Error("Perfil de parâmetros não encontrado.");
  await getDB().perfis_parametros_custos.bulkDelete(rows.map((row) => row.id));
}

export async function exportarPerfis(
  projetoId: string,
  perfilIds?: string[],
): Promise<string> {
  const todos = await listarPerfis(projetoId);
  const selecionados = perfilIds?.length
    ? todos.filter((perfil) => perfilIds.includes(perfil.perfil_id))
    : todos;
  const pacote: PacotePerfisParametroCusto = {
    formato: PERFIL_PARAMETRO_CUSTO_FORMATO,
    versao_formato: PERFIL_PARAMETRO_CUSTO_VERSAO_FORMATO,
    exportado_em: new Date().toISOString(),
    perfis: selecionados.map(({ projeto_id: _projetoId, ...perfil }) => perfil),
  };
  return JSON.stringify(pacote, null, 2);
}

function validarPacote(entrada: unknown): PerfilParametroCustoExportado[] {
  if (!entrada || typeof entrada !== "object") throw new Error("Arquivo de perfil inválido.");
  const objeto = entrada as Record<string, unknown>;
  if (objeto["formato"] !== PERFIL_PARAMETRO_CUSTO_FORMATO) {
    throw new Error("O arquivo não é um perfil de parâmetros de custos compatível.");
  }
  if (objeto["versao_formato"] !== PERFIL_PARAMETRO_CUSTO_VERSAO_FORMATO) {
    throw new Error(`Versão de perfil não suportada: ${String(objeto["versao_formato"])}.`);
  }
  if (!Array.isArray(objeto["perfis"]) || objeto["perfis"].length === 0) {
    throw new Error("O arquivo não contém perfis de parâmetros.");
  }
  return objeto["perfis"] as PerfilParametroCustoExportado[];
}

export async function importarPerfis(projetoId: string, json: string): Promise<PerfilParametroCusto[]> {
  let entrada: unknown;
  try {
    entrada = JSON.parse(json);
  } catch {
    throw new Error("O arquivo selecionado não contém JSON válido.");
  }
  const perfis = validarPacote(entrada);
  const agora = new Date().toISOString();
  const novosIds = new Map<string, string>();
  const importados: PerfilParametroCusto[] = perfis.map((perfil) => {
    const novoPerfilId = novosIds.get(perfil.perfil_id) ?? uid();
    novosIds.set(perfil.perfil_id, novoPerfilId);
    return {
      ...structuredClone(perfil),
      id: uid(),
      perfil_id: novoPerfilId,
      projeto_id: projetoId,
      origem: "IMPORTADO" as const,
      atualizado_em: agora,
    };
  });
  await getDB().perfis_parametros_custos.bulkPut(importados);
  return importados;
}

export async function carregarPerfilParaSimulacao(
  projetoId: string,
  perfilId: string,
): Promise<CarregarPerfilParametroCustoResultado> {
  const perfil = await obterPerfil(projetoId, perfilId);
  const equipamentosAtuais = await getDB().equipamentos.where("projeto_id").equals(projetoId).toArray();
  const porChave = new Map<string, Equipamento[]>();
  for (const equipamento of equipamentosAtuais) {
    const chave = chaveEquipamentoPerfil(equipamento);
    const lista = porChave.get(chave) ?? [];
    lista.push(equipamento);
    porChave.set(chave, lista);
  }

  const produtos = await getDB().produtos.where("projeto_id").equals(projetoId).toArray();
  const produtoPorChave = new Map<string, string>();
  for (const produto of produtos) produtoPorChave.set(chaveProdutoPerfil(produto), produto.id);

  const avisos: string[] = [];
  const equipamentos: CarregarPerfilParametroCustoResultado["equipamentos"] = [];
  const precosManuais: Record<string, number | null> = {};

  for (const snapshot of perfil.equipamentos) {
    const encontrados = porChave.get(snapshot.chave_equipamento) ?? [];
    if (encontrados.length !== 1) {
      avisos.push(
        encontrados.length > 1
          ? `O equipamento “${snapshot.nome}” possui mais de uma correspondência no projeto atual.`
          : `O equipamento “${snapshot.nome}” não foi encontrado no projeto atual.`,
      );
      continue;
    }

    const equipamento = encontrados[0]!;
    equipamentos.push({
      equipamento_id: equipamento.id,
      quantidade: snapshot.quantidade,
      uso_previsto: snapshot.uso_previsto,
      direcionador: snapshot.direcionador,
      manutencao_ocorrencias_por_unidade: snapshot.manutencao_ocorrencias_por_unidade,
      manutencao_valor_por_ocorrencia: snapshot.manutencao_valor_por_ocorrencia,
      custo_recorrente_unitario_override: snapshot.custo_recorrente_unitario_override,
      periodicidade_recorrente_override: snapshot.periodicidade_recorrente_override,
    });

    for (const regra of snapshot.regras) {
      if (regra.custo_unitario_manual == null) continue;
      const produtoId = produtoPorChave.get(regra.chave_produto);
      if (!produtoId) {
        avisos.push(`O insumo “${regra.produto_nome}” do equipamento “${snapshot.nome}” não foi encontrado no projeto atual.`);
        continue;
      }
      precosManuais[produtoId] = regra.custo_unitario_manual;
    }
  }

  return { perfil, equipamentos, precosManuais, avisos };
}
