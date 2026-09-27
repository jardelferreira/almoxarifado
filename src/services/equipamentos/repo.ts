import { getDB, uid } from "@/db/db";
import type {
  Equipamento,
  EquipamentoTipoControle,
  EstoqueEquipamento,
} from "@/types";

export type EquipamentoInput = {
  id?: string;
  categoria_id: string;
  nome: string;
  tipo_controle: EquipamentoTipoControle;
  modelo?: string | null;
  marca?: string | null;
  descricao?: string | null;
  valor_referencia?: number | null;
  custo_recorrente?: number | null;
  periodicidade_custo?: Equipamento["periodicidade_custo"];
  fonte_valor?: Equipamento["fonte_valor"];
  vida_util_meses?: number | null;
  metodo_depreciacao?: Equipamento["metodo_depreciacao"];
  ativo?: boolean;
  situacao?: Equipamento["situacao"];
};

function normalizarTexto(
  valor?: string | null,
): string | null {
  const texto = valor?.trim();

  return texto ? texto : null;
}

function validarTipoControle(
  tipo: EquipamentoTipoControle,
): void {
  if (
    tipo !== "INDIVIDUAL" &&
    tipo !== "QUANTITATIVO"
  ) {
    throw new Error("Tipo de controle de equipamento inválido.");
  }
}

async function obterSaldoFisicoEquipamento(
  projetoId: string,
  equipamentoId: string,
): Promise<number> {
  const db = getDB();
  const estoques = await db.estoque_equipamentos
    .where("projeto_id")
    .equals(projetoId)
    .toArray();

  const registros = estoques.filter(
    (registro) => registro.equipamento_id === equipamentoId,
  );

  if (registros.length === 0) return 0;

  let saldo = registros.reduce(
    (total, registro) => total + Math.max(0, registro.quantidade),
    0,
  );

  for (const registro of registros) {
    const movimentos = await db.movimentacoes_equipamentos
      .where("estoque_equipamento_id")
      .equals(registro.id)
      .toArray();

    const pendencias: Array<{
      tipo: "DEVOLUCAO_FORNECEDOR" | "BAIXA";
      restante: number;
    }> = [];

    for (const movimento of movimentos) {
      const quantidade = Math.max(0, movimento.quantidade);

      if (movimento.tipo === "DEVOLUCAO_FORNECEDOR" || movimento.tipo === "BAIXA") {
        pendencias.push({ tipo: movimento.tipo, restante: quantidade });
        continue;
      }

      if (movimento.tipo === "REENTRADA") {
        let restante = quantidade;
        while (restante > 0 && pendencias.length > 0) {
          const pendencia = pendencias[pendencias.length - 1];
          if (!pendencia) break;
          const aplicada = Math.min(restante, pendencia.restante);
          pendencia.restante -= aplicada;
          restante -= aplicada;
          if (pendencia.restante <= 0) pendencias.pop();
        }
      }
    }

    const devolvido = pendencias
      .filter((item) => item.tipo === "DEVOLUCAO_FORNECEDOR")
      .reduce((total, item) => total + item.restante, 0);
    const baixado = pendencias
      .filter((item) => item.tipo === "BAIXA")
      .reduce((total, item) => total + item.restante, 0);

    saldo -= devolvido + baixado;
  }

  return Math.max(0, saldo);
}

async function validarCategoria(
  projetoId: string,
  categoriaId: string,
): Promise<void> {
  const db = getDB();

  const categoria =
    await db.categorias_equipamentos.get(categoriaId);

  if (!categoria) {
    throw new Error("Categoria de equipamento não encontrada.");
  }

  if (categoria.projeto_id !== projetoId) {
    throw new Error(
      "A categoria não pertence ao projeto do equipamento.",
    );
  }

  if (!categoria.ativo) {
    throw new Error(
      "A categoria de equipamento está inativa.",
    );
  }
}

export const equipamentosRepo = {
  async listar(
    projetoId: string,
  ): Promise<Equipamento[]> {
    return getDB()
      .equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();
  },

  async buscar(
    projetoId: string,
    equipamentoId: string,
  ): Promise<Equipamento | undefined> {
    const equipamento =
      await getDB().equipamentos.get(equipamentoId);

    if (
      !equipamento ||
      equipamento.projeto_id !== projetoId
    ) {
      return undefined;
    }

    return equipamento;
  },

  async salvar(
    projetoId: string,
    dados: EquipamentoInput,
  ): Promise<Equipamento> {
    const db = getDB();

    const nome = dados.nome.trim();

    if (!nome) {
      throw new Error(
        "O nome do equipamento é obrigatório.",
      );
    }

    if (!dados.categoria_id) {
      throw new Error(
        "A categoria do equipamento é obrigatória.",
      );
    }

    validarTipoControle(dados.tipo_controle);

    for (const [campo, valor] of [
      ["valor_referencia", dados.valor_referencia],
      ["custo_recorrente", dados.custo_recorrente],
    ] as const) {
      if (valor !== null && valor !== undefined && (!Number.isFinite(valor) || valor < 0)) {
        throw new Error(`O campo ${campo.replaceAll("_", " ")} deve ser um valor maior ou igual a zero.`);
      }
    }

    if (dados.custo_recorrente !== null && dados.custo_recorrente !== undefined && !dados.periodicidade_custo) {
      throw new Error("Informe a periodicidade quando houver custo recorrente.");
    }

    const agora = new Date().toISOString();
    const id = dados.id ?? uid();

    const existente = dados.id
      ? await db.equipamentos.get(dados.id)
      : undefined;

    if (
      dados.id &&
      (
        !existente ||
        existente.projeto_id !== projetoId
      )
    ) {
      throw new Error(
        "Equipamento não encontrado neste projeto.",
      );
    }

    await validarCategoria(
      projetoId,
      dados.categoria_id,
    );

    if (dados.vida_util_meses !== null && dados.vida_util_meses !== undefined && (!Number.isFinite(dados.vida_util_meses) || dados.vida_util_meses <= 0 || !Number.isInteger(dados.vida_util_meses))) {
      throw new Error("A vida útil deve ser um número inteiro de meses maior que zero.");
    }

    if (dados.vida_util_meses != null && dados.valor_referencia == null && existente?.valor_referencia == null) {
      throw new Error("Informe o valor de referência para configurar a depreciação.");
    }

    if (dados.metodo_depreciacao !== null && dados.metodo_depreciacao !== undefined && dados.metodo_depreciacao !== "LINEAR") {
      throw new Error("Método de depreciação inválido.");
    }

    const situacao = dados.situacao ?? existente?.situacao ?? "ATIVO";
    if (situacao !== "ATIVO" && situacao !== "PLANEJADO") {
      throw new Error("Situação do cadastro inválida.");
    }

    if (situacao === "PLANEJADO" && existente) {
      const saldoFisico = await obterSaldoFisicoEquipamento(
        projetoId,
        id,
      );

      if (saldoFisico > 0) {
        throw new Error(
          `O equipamento não pode ser definido como PLANEJADO enquanto possuir ${saldoFisico} unidade(s) no estoque ou em operação.`,
        );
      }
    }
    const equipamento: Equipamento = {
      id,
      projeto_id: projetoId,
      categoria_id: dados.categoria_id,
      nome,
      tipo_controle: dados.tipo_controle,
      modelo: normalizarTexto(dados.modelo),
      marca: normalizarTexto(dados.marca),
      descricao: normalizarTexto(dados.descricao),
      valor_referencia: dados.valor_referencia ?? existente?.valor_referencia ?? null,
      custo_recorrente: dados.custo_recorrente ?? existente?.custo_recorrente ?? null,
      periodicidade_custo: dados.periodicidade_custo ?? existente?.periodicidade_custo ?? null,
      fonte_valor: dados.fonte_valor ?? existente?.fonte_valor ?? (dados.valor_referencia != null ? "INFORMADO" : null),
      vida_util_meses: dados.vida_util_meses !== undefined ? dados.vida_util_meses : (existente?.vida_util_meses ?? null),
      metodo_depreciacao: dados.metodo_depreciacao !== undefined ? dados.metodo_depreciacao : (existente?.metodo_depreciacao ?? (dados.vida_util_meses != null ? "LINEAR" : null)),
      ativo: dados.ativo ?? existente?.ativo ?? true,
      situacao,
      criado_em: existente?.criado_em ?? agora,
      atualizado_em: agora,
    };

    await db.equipamentos.put(equipamento);

    return equipamento;
  },

  async excluir(
    projetoId: string,
    equipamentoId: string,
  ): Promise<void> {
    const db = getDB();

    const equipamento =
      await db.equipamentos.get(equipamentoId);

    if (
      !equipamento ||
      equipamento.projeto_id !== projetoId
    ) {
      throw new Error(
        "Equipamento não encontrado neste projeto.",
      );
    }

    const estoque =
      await db.estoque_equipamentos
        .where("equipamento_id")
        .equals(equipamentoId)
        .toArray();

    if (estoque.length > 0) {
      throw new Error(
        "Não é possível excluir um equipamento que possui registros de estoque.",
      );
    }

    await db.equipamentos.delete(equipamentoId);
  },
  async alterarAtivo(
    projetoId: string,
    estoqueEquipamentoId: string,
    ativo: boolean,
  ): Promise<EstoqueEquipamento> {
    const db = getDB();
    const estoque = await db.estoque_equipamentos.get(estoqueEquipamentoId);

    if (!estoque || estoque.projeto_id !== projetoId) {
      throw new Error("Registro de estoque não encontrado neste projeto.");
    }

    const atualizado = {
      ...estoque,
      ativo,
      atualizado_em: new Date().toISOString(),
    };

    await db.estoque_equipamentos.put(atualizado);
    return atualizado;
  },
};