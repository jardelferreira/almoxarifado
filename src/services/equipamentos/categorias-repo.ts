import { getDB, uid } from "@/db/db";
import type { CategoriaEquipamento } from "@/types";

export type CategoriaEquipamentoInput = {
  id?: string;
  nome: string;
  ativo?: boolean;
};

function normalizarNome(nome: string): string {
  return nome.trim();
}

async function validarNome(
  projetoId: string,
  nome: string,
  categoriaId?: string,
): Promise<void> {
  const db = getDB();

  const categorias = await db.categorias_equipamentos
    .where("projeto_id")
    .equals(projetoId)
    .toArray();

  const duplicada = categorias.some(
    (categoria) =>
      categoria.id !== categoriaId &&
      categoria.nome.trim().toLowerCase() ===
        nome.toLowerCase(),
  );

  if (duplicada) {
    throw new Error(
      `Já existe uma categoria de equipamento chamada "${nome}" neste projeto.`,
    );
  }
}

export const categoriasEquipamentosRepo = {
  async listar(
    projetoId: string,
  ): Promise<CategoriaEquipamento[]> {
    return getDB()
      .categorias_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();
  },

  async buscar(
    projetoId: string,
    categoriaId: string,
  ): Promise<CategoriaEquipamento | undefined> {
    const categoria =
      await getDB().categorias_equipamentos.get(categoriaId);

    if (
      !categoria ||
      categoria.projeto_id !== projetoId
    ) {
      return undefined;
    }

    return categoria;
  },

  async salvar(
    projetoId: string,
    dados: CategoriaEquipamentoInput,
  ): Promise<CategoriaEquipamento> {
    const db = getDB();

    const nome = normalizarNome(dados.nome);

    if (!nome) {
      throw new Error(
        "O nome da categoria é obrigatório.",
      );
    }

    await validarNome(
      projetoId,
      nome,
      dados.id,
    );

    const agora = new Date().toISOString();
    const id = dados.id ?? uid();

    const existente = dados.id
      ? await db.categorias_equipamentos.get(dados.id)
      : undefined;

    if (
      dados.id &&
      (
        !existente ||
        existente.projeto_id !== projetoId
      )
    ) {
      throw new Error(
        "Categoria de equipamento não encontrada neste projeto.",
      );
    }

    const categoria: CategoriaEquipamento = {
      id,
      projeto_id: projetoId,
      nome,
      ativo: dados.ativo ?? existente?.ativo ?? true,
    };

    await db.categorias_equipamentos.put(categoria);

    return categoria;
  },

  async excluir(
    projetoId: string,
    categoriaId: string,
  ): Promise<void> {
    const db = getDB();

    const categoria =
      await db.categorias_equipamentos.get(categoriaId);

    if (
      !categoria ||
      categoria.projeto_id !== projetoId
    ) {
      throw new Error(
        "Categoria de equipamento não encontrada neste projeto.",
      );
    }

    const equipamentos =
      await db.equipamentos
        .where("projeto_id")
        .equals(projetoId)
        .filter(
          (equipamento) =>
            equipamento.categoria_id === categoriaId,
        )
        .count();

    if (equipamentos > 0) {
      throw new Error(
        "Não é possível excluir uma categoria que possui equipamentos vinculados.",
      );
    }

    await db.categorias_equipamentos.delete(categoriaId);
  },
};