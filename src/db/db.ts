import Dexie, { type Table } from "dexie";
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
  Arquivo,
} from "@/types";

export class AlmoxarifadoDB extends Dexie {
  projetos!: Table<Projeto, string>;
  categorias!: Table<Categoria, string>;
  unidades!: Table<Unidade, string>;
  empresas!: Table<Empresa, string>;
  funcionarios!: Table<Funcionario, string>;
  locais!: Table<Local, string>;
  produtos!: Table<Produto, string>;
  movimentacoes!: Table<Movimentacao, string>;
  equipes!: Table<Equipe, string>;
  equipe_membros!: Table<EquipeMembro, string>;
  arquivos!: Table<Arquivo, string>;

  constructor() {
    super("almoxarifado");

    this.version(1).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, nome, tipo, ativo",
      funcionarios:
        "id, nome, matricula, empresa_id, encarregado_id, status",
      locais: "id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id",
    });

    this.version(2).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, nome, tipo, ativo",
      funcionarios:
        "id, nome, matricula, empresa_id, encarregado_id, status",
      locais: "id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",
      equipes: "id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
    });

    this.version(3).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, nome, tipo, ativo",
      funcionarios:
        "id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais:
        "id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",
      equipes: "id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos: "id, projeto_id, criado_em, tipo, mime_type",
    });

    this.version(4).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, nome, tipo, ativo",
      funcionarios:
        "id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais:
        "id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",
      equipes: "id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos: "id, projeto_id, criado_em, tipo, mime_type",
    }).upgrade(async (tx) => {
      const equipeLegadoId = "equipe_legado";

      const equipes = tx.table("equipes");
      const movimentacoes = tx.table("movimentacoes");

      if (!(await equipes.get(equipeLegadoId))) {
        await equipes.add({
          id: equipeLegadoId,
          nome: "Equipe migrada",
          descricao:
            "Criada para preservar movimentações anteriores à gestão por equipe.",
          ativo: true,
          estoque_segregado: true,
        });
      }

      const movs = await movimentacoes.toArray();

      for (const mov of movs) {
        if (!mov.equipe_id) {
          await movimentacoes.put({
            ...mov,
            equipe_id: equipeLegadoId,
          });
        }
      }
    });

    /**
     * Versão 5
     *
     * Introduz o isolamento dos dados operacionais por projeto.
     */
    this.version(5)
      .stores({
        projetos: "id, codigo, nome, status",

        // Catálogos globais
        categorias: "id, nome, ativo",
        unidades: "id, sigla, ativo",

        // Dados isolados por projeto
        empresas: "id, projeto_id, nome, tipo, ativo",

        funcionarios:
          "id, projeto_id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",

        locais:
          "id, projeto_id, nome, codigo, local_pai_id, ativo",

        produtos:
          "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",

        movimentacoes:
          "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",

        equipes:
          "id, projeto_id, nome, ativo",

        equipe_membros:
          "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",

        arquivos:
          "id, projeto_id, criado_em, tipo, mime_type",
      })
      .upgrade(async (tx) => {
        /**
         * Migração de dados existentes.
         *
         * O IndexedDB não possui acesso ao projeto ativo armazenado
         * no localStorage durante a migração de forma confiável.
         *
         * Portanto, os registros antigos serão associados ao primeiro
         * projeto existente. Os dados novos serão gravados corretamente
         * pelo projeto ativo nas próximas etapas.
         */
        const projetos = tx.table("projetos");
        const projeto = await projetos.toCollection().first();

        if (!projeto) {
          return;
        }

        const projetoId = projeto.id;

        const migrarTabela = async (
          tabela: string,
          campo: string,
        ) => {
          const table = tx.table(tabela);
          const registros = await table.toArray();

          for (const registro of registros) {
            if (!registro[campo]) {
              await table.put({
                ...registro,
                [campo]: projetoId,
              });
            }
          }
        };

        await migrarTabela("empresas", "projeto_id");
        await migrarTabela("funcionarios", "projeto_id");
        await migrarTabela("locais", "projeto_id");
        await migrarTabela("produtos", "projeto_id");
        await migrarTabela("equipes", "projeto_id");
      });
  }
}

let dbInstance: AlmoxarifadoDB | null = null;

export function uid(): string {
  return crypto.randomUUID();
}

export function getDB() {
  if (!dbInstance) {
    dbInstance = new AlmoxarifadoDB();
  }

  return dbInstance;
}