import Dexie, { type Table } from "dexie";
import type {
  Categoria,
  CategoriaEquipamento,
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
  Equipamento,
  EstoqueEquipamento,
  Apropriacao,
  MovimentacaoEquipamento,
  Configuracao,
  Documento,
  DocumentoItem,
  DocumentoReferencia,
  Inventario,
  InventarioItem,
} from "@/types";

export class AlmoxarifadoDB extends Dexie {
  projetos!: Table<Projeto, string>;
  categorias!: Table<Categoria, string>;
  categorias_equipamentos!: Table<CategoriaEquipamento, string>;
  unidades!: Table<Unidade, string>;
  empresas!: Table<Empresa, string>;
  funcionarios!: Table<Funcionario, string>;
  locais!: Table<Local, string>;
  produtos!: Table<Produto, string>;
  movimentacoes!: Table<Movimentacao, string>;
  equipes!: Table<Equipe, string>;
  equipe_membros!: Table<EquipeMembro, string>;
  arquivos!: Table<Arquivo, string>;
  equipamentos!: Table<Equipamento, string>;
  estoque_equipamentos!: Table<EstoqueEquipamento, string>;
  apropriacoes!: Table<Apropriacao, string>;
  movimentacoes_equipamentos!: Table<MovimentacaoEquipamento, string>;
  configuracoes!: Table<Configuracao, string>;
  documentos!: Table<Documento, string>;
  documento_itens!: Table<DocumentoItem, string>;
  documento_referencias!: Table<DocumentoReferencia, string>;
  inventarios!: Table<Inventario, string>;
  inventario_itens!: Table<InventarioItem, string>;

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
    this.version(6).stores({
      // Tudo que já existe permanece igual
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, projeto_id, nome, tipo, ativo",
      funcionarios:
        "id, projeto_id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais:
        "id, projeto_id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",
      // MOVIMENTAÇÕES DE PRODUTOS — permanece separada
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",
      equipes:
        "id, projeto_id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos:
        "id, projeto_id, criado_em, tipo, mime_type",
      // NOVO MÓDULO DE EQUIPAMENTOS
      equipamentos:
        "id, projeto_id, categoria_id, empresa_id, equipe_id, identificacao, serial, patrimonio, status",
      apropriacoes:
        "id, equipamento_id, funcionario_id, [equipamento_id+funcionario_id]",
      movimentacoes_equipamentos:
        "id, projeto_id, equipamento_id, tipo, data, tipo_origem, origem_id, tipo_destino, destino_id",
    });

    this.version(7).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      categorias_equipamentos: "id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, projeto_id, nome, tipo, ativo",
      funcionarios:
        "id, projeto_id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais: "id, projeto_id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",
      equipes: "id, projeto_id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos: "id, projeto_id, criado_em, tipo, mime_type",
      equipamentos:
        "id, projeto_id, categoria_id, empresa_id, equipe_id, identificacao, serial, patrimonio, status",
      apropriacoes:
        "id, equipamento_id, funcionario_id, [equipamento_id+funcionario_id]",
      movimentacoes_equipamentos:
        "id, projeto_id, equipamento_id, tipo, data, tipo_origem, origem_id, tipo_destino, destino_id",
    });

    /**
     * Versão 8
     *
     * Nova estrutura do módulo de equipamentos:
     * - CategoriaEquipamento é isolada por projeto.
     * - Equipamento representa o cadastro/modelo.
     * - EstoqueEquipamento representa a unidade/lote físico em estoque.
     * - Apropriações e movimentações passam a apontar para o estoque físico.
     */
    this.version(8).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      categorias_equipamentos: "id, projeto_id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, projeto_id, nome, tipo, ativo",
      funcionarios:
        "id, projeto_id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais:
        "id, projeto_id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",
      equipes: "id, projeto_id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos: "id, projeto_id, criado_em, tipo, mime_type",

      // Cadastro do equipamento/modelo.
      equipamentos:
        "id, projeto_id, categoria_id, nome, tipo_controle, ativo",

      // Registro físico/lote efetivamente existente no estoque.
      estoque_equipamentos:
        "id, projeto_id, equipamento_id, empresa_id, equipe_id, identificacao, serial, patrimonio, status",

      apropriacoes:
        "id, estoque_equipamento_id, funcionario_id, [estoque_equipamento_id+funcionario_id]",

      movimentacoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, tipo, data, tipo_origem, origem_id, tipo_destino, destino_id",
    });

    /**
     * Versão 9
     *
     * Configurações são isoladas por projeto e não alteram os dados
     * operacionais existentes. O registro é criado sob demanda com
     * os valores padrão do módulo de configurações.
     */
    this.version(9).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      categorias_equipamentos: "id, projeto_id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, projeto_id, nome, tipo, ativo",
      funcionarios:
        "id, projeto_id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais:
        "id, projeto_id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",
      equipes: "id, projeto_id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos: "id, projeto_id, criado_em, tipo, mime_type",
      equipamentos:
        "id, projeto_id, categoria_id, nome, tipo_controle, ativo",
      estoque_equipamentos:
        "id, projeto_id, equipamento_id, empresa_id, equipe_id, identificacao, serial, patrimonio, status",
      apropriacoes:
        "id, estoque_equipamento_id, funcionario_id, [estoque_equipamento_id+funcionario_id]",
      movimentacoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, tipo, data, tipo_origem, origem_id, tipo_destino, destino_id",
      configuracoes: "id, projeto_id",
    });
    /**
     * Versão 10
     *
     * Introduz o módulo documental e os vínculos opcionais das
     * movimentações de materiais com documentos/documento-itens.
     */
    this.version(10).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      categorias_equipamentos: "id, projeto_id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, projeto_id, nome, tipo, ativo",
      funcionarios:
        "id, projeto_id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais: "id, projeto_id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id, documento_id, documento_item_id",
      equipes: "id, projeto_id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos: "id, projeto_id, criado_em, tipo, mime_type",
      equipamentos:
        "id, projeto_id, categoria_id, nome, tipo_controle, ativo",
      estoque_equipamentos:
        "id, projeto_id, equipamento_id, empresa_id, equipe_id, identificacao, serial, patrimonio, status",
      apropriacoes:
        "id, estoque_equipamento_id, funcionario_id, [estoque_equipamento_id+funcionario_id]",
      movimentacoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, tipo, data, tipo_origem, origem_id, tipo_destino, destino_id",
      configuracoes: "id, projeto_id",
      documentos:
        "id, projeto_id, tipo, numero, serie, empresa_id, status, data_emissao",
      documento_itens:
        "id, documento_id, produto_id",
      documento_referencias:
        "id, projeto_id, documento_id, documento_referenciado_id, [documento_id+documento_referenciado_id]",
    });

    /**
     * Versão 11
     *
     * Introduz o inventário físico, mantendo a contagem como snapshot e
     * utilizando movimentações AJUSTE para alterar o estoque.
     */
    this.version(11).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      categorias_equipamentos: "id, projeto_id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, projeto_id, nome, tipo, ativo",
      funcionarios:
        "id, projeto_id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais: "id, projeto_id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id, documento_id, documento_item_id",
      equipes: "id, projeto_id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos: "id, projeto_id, criado_em, tipo, mime_type",
      equipamentos:
        "id, projeto_id, categoria_id, nome, tipo_controle, ativo",
      estoque_equipamentos:
        "id, projeto_id, equipamento_id, empresa_id, equipe_id, identificacao, serial, patrimonio, status",
      apropriacoes:
        "id, estoque_equipamento_id, funcionario_id, [estoque_equipamento_id+funcionario_id]",
      movimentacoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, tipo, data, tipo_origem, origem_id, tipo_destino, destino_id",
      configuracoes: "id, projeto_id",
      documentos:
        "id, projeto_id, tipo, numero, serie, empresa_id, status, data_emissao",
      documento_itens:
        "id, documento_id, produto_id",
      documento_referencias:
        "id, projeto_id, documento_id, documento_referenciado_id, [documento_id+documento_referenciado_id]",
      inventarios:
        "id, projeto_id, equipe_id, status, data_abertura, data_encerramento, responsavel_id",
      inventario_itens:
        "id, inventario_id, produto_id, equipe_id, quantidade_sistema, quantidade_contada, [inventario_id+produto_id]",
    });

    /**
     * Versão 12
     *
     * Um item de inventário representa uma posição de estoque:
     * produto + equipe. Isso permite inventário geral sem perder a
     * segregação do estoque por equipe.
     */
    this.version(12).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      categorias_equipamentos: "id, projeto_id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, projeto_id, nome, tipo, ativo",
      funcionarios:
        "id, projeto_id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
      locais: "id, projeto_id, nome, codigo, local_pai_id, ativo",
      produtos:
        "id, projeto_id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id, documento_id, documento_item_id",
      equipes: "id, projeto_id, nome, ativo",
      equipe_membros:
        "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
      arquivos: "id, projeto_id, criado_em, tipo, mime_type",
      equipamentos:
        "id, projeto_id, categoria_id, nome, tipo_controle, ativo",
      estoque_equipamentos:
        "id, projeto_id, equipamento_id, empresa_id, equipe_id, identificacao, serial, patrimonio, status",
      apropriacoes:
        "id, estoque_equipamento_id, funcionario_id, [estoque_equipamento_id+funcionario_id]",
      movimentacoes_equipamentos:
        "id, projeto_id, estoque_equipamento_id, tipo, data, tipo_origem, origem_id, tipo_destino, destino_id",
      configuracoes: "id, projeto_id",
      documentos:
        "id, projeto_id, tipo, numero, serie, empresa_id, status, data_emissao",
      documento_itens:
        "id, documento_id, produto_id",
      documento_referencias:
        "id, projeto_id, documento_id, documento_referenciado_id, [documento_id+documento_referenciado_id]",
      inventarios:
        "id, projeto_id, equipe_id, status, data_abertura, data_encerramento, responsavel_id",
      inventario_itens:
        "id, inventario_id, produto_id, equipe_id, quantidade_sistema, quantidade_contada, [inventario_id+produto_id+equipe_id]",
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