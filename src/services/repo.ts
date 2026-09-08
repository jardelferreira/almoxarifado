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

type ProjetoEntity =
  | Empresa
  | Funcionario
  | Local
  | Produto
  | Equipe;

type ProjetoEntityInput<T extends ProjetoEntity> = Omit<T, "id"> & {
  id?: string;
};

const TABELAS_POR_PROJETO = new Set([
  "empresas",
  "funcionarios",
  "locais",
  "produtos",
  "equipes",
]);

/**
 * Camada de acesso a dados.
 *
 * Dados operacionais são sempre acessados dentro do contexto
 * de um projeto. Categorias e unidades continuam globais.
 */
export const repo = {
  // ---------- Projetos ----------

  async listProjetos(): Promise<Projeto[]> {
    return (await getDB().projetos.toArray()).sort((a, b) =>
      a.nome.localeCompare(b.nome),
    );
  },

  async getProjeto(id: string) {
    return getDB().projetos.get(id);
  },

  // async saveProjeto(p: Omit<Projeto, "id"> & { id?: string }) {
  //   const projeto: Projeto = {
  //     ...p,
  //     id: p.id ?? uid(),
  //   };

  //   await getDB().projetos.put(projeto);

  //   return projeto;
  // },


  async saveProjeto(p: Omit<Projeto, "id"> & { id?: string }) {
    const db = getDB();

    const novoProjeto = !p.id;

    const projeto: Projeto = {
      ...p,
      id: p.id ?? uid(),
    };

    if (!novoProjeto) {
      await db.projetos.put(projeto);
      return projeto;
    }

    const equipesPadrao: Equipe[] = [
      {
        id: uid(),
        projeto_id: projeto.id,
        nome: "Almoxarifado",
        descricao: null,
        ativo: true,
        estoque_segregado: true,
      },
      {
        id: uid(),
        projeto_id: projeto.id,
        nome: "Manutenção",
        descricao: null,
        ativo: true,
        estoque_segregado: true,
      },
    ];

    await db.transaction(
      "rw",
      [db.projetos, db.equipes],
      async () => {
        await db.projetos.put(projeto);
        await db.equipes.bulkPut(equipesPadrao);
      },
    );

    return projeto;
  },

  async deleteProjeto(id: string) {
    const db = getDB();

    /*
     * Primeiro identificamos as equipes do projeto.
     * equipe_membros não possui projeto_id próprio, portanto seu
     * isolamento é feito através do equipe_id.
     */
    const equipes = await db.equipes
      .where("projeto_id")
      .equals(id)
      .toArray();

    const equipeIds = equipes.map((equipe) => equipe.id);

    const tabelas = [
      db.projetos,
      db.movimentacoes,
      db.empresas,
      db.funcionarios,
      db.locais,
      db.produtos,
      db.equipes,
      db.equipe_membros,
    ];

    await db.transaction("rw", tabelas, async () => {
      /*
       * Remove os membros das equipes deste projeto antes
       * de remover as próprias equipes.
       */
      if (equipeIds.length > 0) {
        await db.equipe_membros
          .where("equipe_id")
          .anyOf(equipeIds)
          .delete();
      }

      await db.movimentacoes
        .where("projeto_id")
        .equals(id)
        .delete();

      await db.empresas
        .where("projeto_id")
        .equals(id)
        .delete();

      await db.funcionarios
        .where("projeto_id")
        .equals(id)
        .delete();

      await db.locais
        .where("projeto_id")
        .equals(id)
        .delete();

      await db.produtos
        .where("projeto_id")
        .equals(id)
        .delete();

      await db.equipes
        .where("projeto_id")
        .equals(id)
        .delete();

      await db.projetos.delete(id);
    });
  },

  async duplicarProjeto(id: string) {
    const db = getDB();

    const orig = await db.projetos.get(id);

    if (!orig) {
      throw new Error("Projeto não encontrado");
    }

    const novo: Projeto = {
      ...orig,
      id: uid(),
      codigo: `${orig.codigo}-COPIA`,
      nome: `${orig.nome} (cópia)`,
    };

    const [
      empresas,
      funcionarios,
      locais,
      produtos,
      equipes,
      membros,
      movimentacoes,
    ] = await Promise.all([
      db.empresas.where("projeto_id").equals(id).toArray(),
      db.funcionarios.where("projeto_id").equals(id).toArray(),
      db.locais.where("projeto_id").equals(id).toArray(),
      db.produtos.where("projeto_id").equals(id).toArray(),
      db.equipes.where("projeto_id").equals(id).toArray(),
      Promise.resolve([] as EquipeMembro[]),
      db.movimentacoes.where("projeto_id").equals(id).toArray(),
    ]);

    /**
     * Mapeamentos antigos -> novos IDs.
     *
     * Isso é fundamental para impedir que o projeto duplicado
     * continue apontando para produtos/equipes/locais do original.
     */
    const produtoIds = new Map<string, string>();
    const equipeIds = new Map<string, string>();
    const localIds = new Map<string, string>();
    const funcionarioIds = new Map<string, string>();
    const empresaIds = new Map<string, string>();

    const novasEmpresas = empresas.map((empresa) => {
      const novoId = uid();

      empresaIds.set(empresa.id, novoId);

      return {
        ...empresa,
        id: novoId,
        projeto_id: novo.id,
      };
    });

    const novosFuncionarios = funcionarios.map((funcionario) => {
      const novoId = uid();

      funcionarioIds.set(funcionario.id, novoId);

      return {
        ...funcionario,
        id: novoId,
        projeto_id: novo.id,
      };
    });

    const novosLocais = locais.map((local) => {
      const novoId = uid();

      localIds.set(local.id, novoId);

      return {
        ...local,
        id: novoId,
        projeto_id: novo.id,
      };
    });

    const novosProdutos = produtos.map((produto) => {
      const novoId = uid();

      produtoIds.set(produto.id, novoId);

      return {
        ...produto,
        id: novoId,
        projeto_id: novo.id,
      };
    });

    const novasEquipes = equipes.map((equipe) => {
      const novoId = uid();

      equipeIds.set(equipe.id, novoId);

      return {
        ...equipe,
        id: novoId,
        projeto_id: novo.id,
      };
    });

    /**
     * Corrige referências internas dos registros duplicados.
     */

    for (const funcionario of novosFuncionarios) {
      if (funcionario.empresa_id) {
        funcionario.empresa_id =
          empresaIds.get(funcionario.empresa_id) ??
          funcionario.empresa_id;
      }

      if (funcionario.encarregado_id) {
        funcionario.encarregado_id =
          funcionarioIds.get(funcionario.encarregado_id) ??
          funcionario.encarregado_id;
      }

      if (funcionario.equipe_raiz_id) {
        funcionario.equipe_raiz_id =
          equipeIds.get(funcionario.equipe_raiz_id) ??
          funcionario.equipe_raiz_id;
      }
    }

    for (const local of novosLocais) {
      if (local.local_pai_id) {
        local.local_pai_id =
          localIds.get(local.local_pai_id) ??
          local.local_pai_id;
      }
    }

    const novosMembros: EquipeMembro[] = membros
      .filter((membro) => equipeIds.has(membro.equipe_id))
      .map((membro) => ({
        ...membro,
        id: uid(),
        equipe_id: equipeIds.get(membro.equipe_id)!,
        funcionario_id:
          funcionarioIds.get(membro.funcionario_id) ??
          membro.funcionario_id,
      }));

    const novasMovimentacoes = movimentacoes.map((mov) => ({
      ...mov,
      id: uid(),
      projeto_id: novo.id,
      produto_id:
        produtoIds.get(mov.produto_id) ??
        mov.produto_id,
      equipe_id:
        equipeIds.get(mov.equipe_id) ??
        mov.equipe_id,
      funcionario_id: mov.funcionario_id
        ? funcionarioIds.get(mov.funcionario_id) ??
        mov.funcionario_id
        : null,
      encarregado_id: mov.encarregado_id
        ? funcionarioIds.get(mov.encarregado_id) ??
        mov.encarregado_id
        : null,
      empresa_id: mov.empresa_id
        ? empresaIds.get(mov.empresa_id) ??
        mov.empresa_id
        : null,
      local_id: mov.local_id
        ? localIds.get(mov.local_id) ??
        mov.local_id
        : null,
      local_destino_id: mov.local_destino_id
        ? localIds.get(mov.local_destino_id) ??
        mov.local_destino_id
        : null,
      movimentacao_origem_id: mov.movimentacao_origem_id
        ? undefined
        : undefined,
    }));

    await db.transaction(
      "rw",
      [
        db.projetos,
        db.empresas,
        db.funcionarios,
        db.locais,
        db.produtos,
        db.equipes,
        db.equipe_membros,
        db.movimentacoes,
      ],
      async () => {
        await db.projetos.put(novo);

        await db.empresas.bulkPut(novasEmpresas);
        await db.funcionarios.bulkPut(novosFuncionarios);
        await db.locais.bulkPut(novosLocais);
        await db.produtos.bulkPut(novosProdutos);
        await db.equipes.bulkPut(novasEquipes);
        await db.equipe_membros.bulkPut(novosMembros);
        await db.movimentacoes.bulkPut(novasMovimentacoes);
      },
    );

    return novo;
  },

  // ---------- Cadastros globais ----------

  categorias: crudGlobal<Categoria>("categorias"),

  unidades: crudGlobal<Unidade>("unidades"),

  // ---------- Cadastros por projeto ----------

  empresas: crudProjeto<Empresa>("empresas"),

  funcionarios: crudProjeto<Funcionario>("funcionarios"),

  locais: crudProjeto<Local>("locais"),

  produtos: crudProjeto<Produto>("produtos"),

  equipes: crudProjeto<Equipe>("equipes"),

  // ---------- Equipe / membros ----------

  async membrosDaEquipe(equipeId: string): Promise<EquipeMembro[]> {
    return getDB()
      .equipe_membros
      .where("equipe_id")
      .equals(equipeId)
      .toArray();
  },

  async salvarMembrosDaEquipe(
    equipeId: string,
    funcionarioIds: string[],
  ) {
    const db = getDB();

    const equipe = await db.equipes.get(equipeId);

    if (!equipe) {
      throw new Error("Equipe não encontrada");
    }

    const idsUnicos = [...new Set(funcionarioIds)];

    /**
     * Garante que todos os funcionários pertencem
     * ao mesmo projeto da equipe.
     */
    const funcionarios = await Promise.all(
      idsUnicos.map((id) => db.funcionarios.get(id)),
    );

    const invalidos = funcionarios.some(
      (funcionario) =>
        !funcionario ||
        funcionario.projeto_id !== equipe.projeto_id,
    );

    if (invalidos) {
      throw new Error(
        "Não é possível adicionar funcionário de outro projeto à equipe",
      );
    }

    await db.transaction(
      "rw",
      db.equipe_membros,
      async () => {
        await db.equipe_membros
          .where("equipe_id")
          .equals(equipeId)
          .delete();

        await db.equipe_membros.bulkPut(
          idsUnicos.map((funcionario_id) => ({
            id: uid(),
            equipe_id: equipeId,
            funcionario_id,
          })),
        );
      },
    );
  },

  // ---------- Movimentações ----------

  async listMovimentacoes(
    projetoId: string,
  ): Promise<Movimentacao[]> {
    const rows = await getDB()
      .movimentacoes
      .where("projeto_id")
      .equals(projetoId)
      .toArray();

    return rows.sort((a, b) =>
      a.data < b.data
        ? 1
        : a.data > b.data
          ? -1
          : 0,
    );
  },

  async saveMovimentacao(
    m: Omit<Movimentacao, "id"> & { id?: string },
  ) {
    if (!m.equipe_id) {
      throw new Error(
        "Uma equipe responsável é obrigatória na movimentação",
      );
    }

    const db = getDB();

    const equipe = await db.equipes.get(m.equipe_id);

    if (!equipe) {
      throw new Error("Equipe não encontrada");
    }

    if (equipe.projeto_id !== m.projeto_id) {
      throw new Error(
        "A equipe não pertence ao projeto da movimentação",
      );
    }

    if (m.produto_id) {
      const produto = await db.produtos.get(m.produto_id);

      if (!produto || produto.projeto_id !== m.projeto_id) {
        throw new Error(
          "O produto não pertence ao projeto da movimentação",
        );
      }
    }

    const mov: Movimentacao = {
      ...m,
      id: m.id ?? uid(),
    };

    await db.movimentacoes.put(mov);

    return mov;
  },

  async deleteMovimentacao(id: string) {
    const db = getDB();

    const movimentacao = await db.movimentacoes.get(id);

    if (!movimentacao) {
      return;
    }

    await db.movimentacoes.delete(id);
  },

  async movimentacoesDoProduto(
    projetoId: string,
    produtoId: string,
  ) {
    const rows = await getDB()
      .movimentacoes
      .where("projeto_id")
      .equals(projetoId)
      .toArray();

    return rows
      .filter((r) => r.produto_id === produtoId)
      .sort((a, b) =>
        a.data < b.data ? 1 : -1,
      );
  },

  async temMovimentacoes(
    campo: keyof Movimentacao,
    valor: string,
  ) {
    const all = await getDB()
      .movimentacoes
      .toArray();

    return all.some((m) => m[campo] === valor);
  },
};

function crudGlobal<T extends { id: string }>(
  table: string,
) {
  return {
    async list(): Promise<T[]> {
      // @ts-expect-error dynamic table access
      return getDB()[table].toArray() as Promise<T[]>;
    },

    async get(
      id: string,
    ): Promise<T | undefined> {
      // @ts-expect-error dynamic table access
      return getDB()[table].get(id);
    },

    async save(
      item: Omit<T, "id"> & { id?: string },
    ): Promise<T> {
      const row = {
        ...item,
        id: item.id ?? uid(),
      } as T;

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

function crudProjeto<T extends ProjetoEntity>(
  table: string,
) {
  return {
    async list(
      projetoId: string,
    ): Promise<T[]> {
      // @ts-expect-error dynamic table access
      return getDB()[table]
        .where("projeto_id")
        .equals(projetoId)
        .toArray() as Promise<T[]>;
    },

    async get(
      projetoId: string,
      id: string,
    ): Promise<T | undefined> {
      // @ts-expect-error dynamic table access
      const item = await getDB()[table].get(id);

      if (!item) {
        return undefined;
      }

      if (item.projeto_id !== projetoId) {
        return undefined;
      }

      return item as T;
    },

    async save(
      projetoId: string,
      item: ProjetoEntityInput<T>,
    ): Promise<T> {
      const row = {
        ...item,
        id: item.id ?? uid(),
        projeto_id: projetoId,
      } as T;

      // @ts-expect-error dynamic table access
      await getDB()[table].put(row);

      return row;
    },

    async bulkSave(
      projetoId: string,
      items: T[],
    ) {
      const rows = items.map((item) => ({
        ...item,
        projeto_id: projetoId,
      }));

      // @ts-expect-error dynamic table access
      await getDB()[table].bulkPut(rows);
    },

    async remove(
      projetoId: string,
      id: string,
    ) {
      // @ts-expect-error dynamic table access
      const item = await getDB()[table].get(id);

      if (!item || item.projeto_id !== projetoId) {
        return;
      }

      // @ts-expect-error dynamic table access
      await getDB()[table].delete(id);
    },
  };
}