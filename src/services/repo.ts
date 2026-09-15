import { getDB, uid } from "@/db/db";
import { configuracoesRepo } from "@/services/configuracoes-repo";
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

  async saveProjeto(p: Omit<Projeto, "id"> & { id?: string }) {
    const projeto: Projeto = {
      ...p,
      id: p.id ?? uid(),
    };

    await getDB().projetos.put(projeto);

    return projeto;
  },

  async deleteProjeto(id: string) {
    const db = getDB();

    const tabelas = [
      db.projetos,
      db.movimentacoes,
      db.empresas,
      db.funcionarios,
      db.locais,
      db.produtos,
      db.equipes,
    ];

    await db.transaction("rw", tabelas, async () => {
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

    if (!Number.isFinite(m.quantidade) || m.quantidade <= 0) {
      throw new Error("A quantidade da movimentação deve ser maior que zero.");
    }

    const db = getDB();
    const configuracao = await configuracoesRepo.obter(m.projeto_id);
    const equipe = await db.equipes.get(m.equipe_id);

    if (!equipe) {
      throw new Error("Equipe não encontrada");
    }

    if (equipe.projeto_id !== m.projeto_id) {
      throw new Error(
        "A equipe não pertence ao projeto da movimentação",
      );
    }

    if (!equipe.ativo) {
      throw new Error("A equipe selecionada está inativa.");
    }

    const produto = await db.produtos.get(m.produto_id);
    if (!produto || produto.projeto_id !== m.projeto_id) {
      throw new Error(
        "O produto não pertence ao projeto da movimentação",
      );
    }

    if (!produto.ativo) {
      throw new Error("O produto selecionado está inativo.");
    }

    if (m.documento_id) {
      const documento = await db.documentos.get(m.documento_id);
      if (!documento || documento.projeto_id !== m.projeto_id) {
        throw new Error("O documento não pertence ao projeto da movimentação.");
      }
      if (documento.status === "CANCELADO") {
        throw new Error("Não é possível vincular um documento cancelado à movimentação.");
      }
    }

    const documentoExigido =
      configuracao.modulos.documentos &&
      ((m.tipo === "ENTRADA" && configuracao.documentos.exigir_na_entrada) ||
        (m.tipo === "SAIDA" && configuracao.documentos.exigir_na_saida) ||
        (m.tipo === "TRANSFERENCIA" && configuracao.documentos.exigir_na_transferencia) ||
        (m.tipo === "DEVOLUCAO" && configuracao.documentos.exigir_na_devolucao) ||
        (m.tipo === "AJUSTE" && configuracao.documentos.exigir_no_ajuste));

    if (documentoExigido && !m.documento_id) {
      throw new Error("Esta operação exige um documento conforme as configurações do projeto.");
    }

    if (m.tipo === "AJUSTE") {
      if (!configuracao.estoque.permitir_ajustes) {
        throw new Error("Os ajustes de estoque estão desabilitados nas configurações do projeto.");
      }

      if (configuracao.estoque.exigir_justificativa_ajuste && !m.observacao?.trim()) {
        throw new Error("Informe a justificativa do ajuste.");
      }
    }

    if (m.tipo === "DEVOLUCAO") {
      if (!m.movimentacao_origem_id) {
        throw new Error("A devolução deve estar vinculada a uma saída de origem.");
      }

      const origem = await db.movimentacoes.get(m.movimentacao_origem_id);
      if (!origem || origem.projeto_id !== m.projeto_id) {
        throw new Error("A movimentação de origem não pertence ao projeto.");
      }
      if (origem.tipo !== "SAIDA") {
        throw new Error("A devolução deve estar vinculada a uma movimentação de saída.");
      }
      if (origem.produto_id !== m.produto_id || origem.equipe_id !== m.equipe_id) {
        throw new Error("A devolução deve permanecer vinculada ao mesmo produto e equipe da saída.");
      }

      const devolvido = await db.movimentacoes
        .where("projeto_id")
        .equals(m.projeto_id)
        .filter((item) => item.tipo === "DEVOLUCAO" && item.movimentacao_origem_id === origem.id)
        .toArray();
      const totalDevolvido = devolvido.reduce((total, item) => total + item.quantidade, 0);
      if (totalDevolvido + m.quantidade > origem.quantidade) {
        throw new Error("A quantidade devolvida excede o saldo disponível da saída de origem.");
      }
    }

    if (m.tipo === "SAIDA" || m.tipo === "TRANSFERENCIA" || (m.tipo === "AJUSTE" && (m.sinal ?? 1) < 0)) {
      const movimentacoes = await db.movimentacoes
        .where("projeto_id")
        .equals(m.projeto_id)
        .toArray();

      const saldoAtual = movimentacoes
        .filter((item) => item.produto_id === m.produto_id && item.equipe_id === m.equipe_id)
        .reduce((saldo, item) => {
          if (item.tipo === "ENTRADA" || item.tipo === "DEVOLUCAO") return saldo + item.quantidade;
          if (item.tipo === "SAIDA") return saldo - item.quantidade;
          if (item.tipo === "AJUSTE" || item.tipo === "TRANSFERENCIA") return saldo + (item.sinal ?? 1) * item.quantidade;
          return saldo;
        }, 0);

      const saldoResultante = saldoAtual + (m.tipo === "AJUSTE" ? (m.sinal ?? 1) * m.quantidade : -m.quantidade);
      if (saldoResultante < 0 && !configuracao.estoque.permitir_estoque_negativo) {
        throw new Error(`Quantidade insuficiente na equipe "${equipe.nome}". Disponível: ${saldoAtual}.`);
      }
    }

    const mov: Movimentacao = {
      ...m,
      id: m.id ?? uid(),
    };

    await db.movimentacoes.put(mov);

    return mov;
  },

  async registrarTransferencia({
    projetoId,
    produtoId,
    quantidade,
    equipeOrigemId,
    equipeDestinoId,
    localOrigemId = null,
    localDestinoId = null,
    responsavelOrigemId = null,
    responsavelDestinoId = null,
    documentoId = null,
    data,
    observacao = null,
  }: {
    projetoId: string;
    produtoId: string;
    quantidade: number;
    equipeOrigemId: string;
    equipeDestinoId: string;
    localOrigemId?: string | null;
    localDestinoId?: string | null;
    responsavelOrigemId?: string | null;
    responsavelDestinoId?: string | null;
    documentoId?: string | null;
    data: string;
    observacao?: string | null;
  }): Promise<{ origem: Movimentacao; destino: Movimentacao }> {
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      throw new Error("A quantidade da transferência deve ser maior que zero.");
    }

    if (equipeOrigemId === equipeDestinoId && localOrigemId === localDestinoId) {
      throw new Error("A origem e o destino da transferência devem ser diferentes.");
    }

    const db = getDB();
    const configuracao = await configuracoesRepo.obter(projetoId);
    const [produto, equipeOrigem, equipeDestino] = await Promise.all([
      db.produtos.get(produtoId),
      db.equipes.get(equipeOrigemId),
      db.equipes.get(equipeDestinoId),
    ]);

    if (!produto || produto.projeto_id !== projetoId || !produto.ativo) {
      throw new Error("O produto selecionado não pertence ao projeto ou está inativo.");
    }
    if (!equipeOrigem || equipeOrigem.projeto_id !== projetoId || !equipeOrigem.ativo) {
      throw new Error("A equipe de origem não pertence ao projeto ou está inativa.");
    }
    if (!equipeDestino || equipeDestino.projeto_id !== projetoId || !equipeDestino.ativo) {
      throw new Error("A equipe de destino não pertence ao projeto ou está inativa.");
    }

    const movimentacoes = await db.movimentacoes.where("projeto_id").equals(projetoId).toArray();
    const saldoOrigem = movimentacoes
      .filter((item) => item.produto_id === produtoId && item.equipe_id === equipeOrigemId)
      .reduce((saldo, item) => {
        if (item.tipo === "ENTRADA" || item.tipo === "DEVOLUCAO") return saldo + item.quantidade;
        if (item.tipo === "SAIDA") return saldo - item.quantidade;
        if (item.tipo === "AJUSTE" || item.tipo === "TRANSFERENCIA") return saldo + (item.sinal ?? 1) * item.quantidade;
        return saldo;
      }, 0);

    if (saldoOrigem - quantidade < 0 && !configuracao.estoque.permitir_estoque_negativo) {
      throw new Error(`Quantidade insuficiente na equipe de origem "${equipeOrigem.nome}". Disponível: ${saldoOrigem}.`);
    }

    const agora = new Date().toISOString();
    const origemId = uid();
    const destinoId = uid();
    const nota = observacao?.trim() || null;

    const origem: Movimentacao = {
      id: origemId,
      projeto_id: projetoId,
      data,
      tipo: "TRANSFERENCIA",
      produto_id: produtoId,
      quantidade,
      sinal: -1,
      funcionario_id: responsavelOrigemId,
      encarregado_id: null,
      empresa_id: null,
      local_id: localOrigemId,
      local_destino_id: localDestinoId,
      observacao: nota,
      equipe_id: equipeOrigemId,
      documento_id: documentoId,
      documento_item_id: null,
    };

    const destino: Movimentacao = {
      id: destinoId,
      projeto_id: projetoId,
      data,
      tipo: "TRANSFERENCIA",
      produto_id: produtoId,
      quantidade,
      sinal: 1,
      funcionario_id: responsavelDestinoId,
      encarregado_id: null,
      empresa_id: null,
      local_id: localDestinoId,
      local_destino_id: localOrigemId,
      observacao: nota,
      equipe_id: equipeDestinoId,
      documento_id: documentoId,
      documento_item_id: null,
      movimentacao_origem_id: origemId,
    };

    await db.transaction("rw", db.movimentacoes, async () => {
      await db.movimentacoes.bulkPut([origem, destino]);
    });

    return { origem, destino };
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