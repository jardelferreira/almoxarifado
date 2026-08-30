import { getDB, uid } from "@/db/db";
import type {
  Categoria,
  Empresa,
  Equipe,
  EquipeMembro,
  Funcionario,
  Local,
  Movimentacao,
  Produto,
  Projeto,
  Unidade,
} from "@/types";

/**
 * Camada de acesso a dados. A UI nunca fala com o IndexedDB diretamente —
 * assim é possível trocar por uma API/Postgres no futuro.
 */

export const repo = {
  // ---------- Projetos ----------
  async listProjetos(): Promise<Projeto[]> {
    return (await getDB().projetos.toArray()).sort((a, b) => a.nome.localeCompare(b.nome));
  },
  async getProjeto(id: string) {
    return getDB().projetos.get(id);
  },
  async saveProjeto(p: Omit<Projeto, "id"> & { id?: string }) {
    const projeto: Projeto = { ...p, id: p.id ?? uid() };
    await getDB().projetos.put(projeto);
    return projeto;
  },
  async deleteProjeto(id: string) {
    const db = getDB();
    await db.transaction("rw", db.projetos, db.movimentacoes, async () => {
      await db.movimentacoes.where("projeto_id").equals(id).delete();
      await db.projetos.delete(id);
    });
  },
  async duplicarProjeto(id: string) {
    const db = getDB();
    const orig = await db.projetos.get(id);
    if (!orig) throw new Error("Projeto não encontrado");
    const novo: Projeto = {
      ...orig,
      id: uid(),
      codigo: `${orig.codigo}-COPIA`,
      nome: `${orig.nome} (cópia)`,
    };
    const movs = await db.movimentacoes.where("projeto_id").equals(id).toArray();
    await db.transaction("rw", db.projetos, db.movimentacoes, async () => {
      await db.projetos.put(novo);
      await db.movimentacoes.bulkPut(movs.map((m) => ({ ...m, id: uid(), projeto_id: novo.id })));
    });
    return novo;
  },

  // ---------- Cadastros ----------
  categorias: crud<Categoria>("categorias"),
  unidades: crud<Unidade>("unidades"),
  empresas: crud<Empresa>("empresas"),
  funcionarios: crud<Funcionario>("funcionarios"),
  locais: crud<Local>("locais"),
  produtos: crud<Produto>("produtos"),
  equipes: crud<Equipe>("equipes"),

  async membrosDaEquipe(equipeId: string): Promise<EquipeMembro[]> {
    return getDB().equipe_membros.where("equipe_id").equals(equipeId).toArray();
  },
  async salvarMembrosDaEquipe(equipeId: string, funcionarioIds: string[]) {
    const db = getDB();
    const idsUnicos = [...new Set(funcionarioIds)];
    await db.transaction("rw", db.equipe_membros, async () => {
      await db.equipe_membros.where("equipe_id").equals(equipeId).delete();
      await db.equipe_membros.bulkPut(
        idsUnicos.map((funcionario_id) => ({ id: uid(), equipe_id: equipeId, funcionario_id })),
      );
    });
  },

  // ---------- Movimentações ----------
  async listMovimentacoes(projetoId: string): Promise<Movimentacao[]> {
    const rows = await getDB().movimentacoes.where("projeto_id").equals(projetoId).toArray();
    return rows.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  },
  async saveMovimentacao(m: Omit<Movimentacao, "id"> & { id?: string }) {
    if (!m.equipe_id) throw new Error("Uma equipe responsável é obrigatória na movimentação");
    const mov: Movimentacao = { ...m, id: m.id ?? uid() };
    await getDB().movimentacoes.put(mov);
    return mov;
  },
  async deleteMovimentacao(id: string) {
    await getDB().movimentacoes.delete(id);
  },
  async movimentacoesDoProduto(projetoId: string, produtoId: string) {
    const rows = await getDB().movimentacoes.where("produto_id").equals(produtoId).toArray();
    return rows
      .filter((r) => r.projeto_id === projetoId)
      .sort((a, b) => (a.data < b.data ? 1 : -1));
  },
  async temMovimentacoes(campo: keyof Movimentacao, valor: string) {
    const all = await getDB().movimentacoes.toArray();
    return all.some((m) => m[campo] === valor);
  },
};

function crud<T extends { id: string }>(table: string) {
  return {
    async list(): Promise<T[]> {
      // @ts-expect-error dynamic table access
      return getDB()[table].toArray() as Promise<T[]>;
    },
    async get(id: string): Promise<T | undefined> {
      // @ts-expect-error dynamic table access
      return getDB()[table].get(id);
    },
    async save(item: Omit<T, "id"> & { id?: string }): Promise<T> {
      const row = { ...item, id: item.id ?? uid() } as T;
      // @ts-expect-error dynamic table access
      await getDB()[table].put(row);
      return row;
    },
    async bulkSave(items: T[]) {
      // @ts-expect-error dynamic table access
      await getDB()[table].bulkPut(items);
    },
    async remove(id: string) {
      // @ts-expect-error dynamic table access
      await getDB()[table].delete(id);
    },
  };
}
