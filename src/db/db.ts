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
      funcionarios: "id, nome, matricula, empresa_id, encarregado_id, status",
      locais: "id, nome, codigo, local_pai_id, ativo",
      produtos: "id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id",
    });
    this.version(2).stores({
      projetos: "id, codigo, nome, status",
      categorias: "id, nome, ativo",
      unidades: "id, sigla, ativo",
      empresas: "id, nome, tipo, ativo",
      funcionarios: "id, nome, matricula, empresa_id, encarregado_id, status",
      locais: "id, nome, codigo, local_pai_id, ativo",
      produtos: "id, nome, codigo, categoria_id, unidade_id, ativo",
      movimentacoes:
        "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",
      equipes: "id, nome, ativo",
      equipe_membros: "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
    });
    this.version(3)
      .stores({
        projetos: "id, codigo, nome, status",
        categorias: "id, nome, ativo",
        unidades: "id, sigla, ativo",
        empresas: "id, nome, tipo, ativo",
        funcionarios: "id, nome, matricula, empresa_id, encarregado_id, equipe_raiz_id, status",
        locais: "id, nome, codigo, local_pai_id, ativo",
        produtos: "id, nome, codigo, categoria_id, unidade_id, ativo",
        movimentacoes:
          "id, projeto_id, data, tipo, produto_id, funcionario_id, encarregado_id, empresa_id, local_id, equipe_id",
        equipes: "id, nome, ativo",
        equipe_membros: "id, equipe_id, funcionario_id, [equipe_id+funcionario_id]",
        arquivos: "id, projeto_id, criado_em, tipo, mime_type",
      })
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
      arquivos:
        "id, projeto_id, criado_em, tipo, mime_type",
    })
      .upgrade(async (tx) => {
        const equipeLegadoId = "equipe_legado";
        const equipes = tx.table("equipes");
        if (!(await equipes.get(equipeLegadoId))) {
          await equipes.add({
            id: equipeLegadoId,
            nome: "Equipe migrada",
            descricao: "Criada para preservar movimentações anteriores à gestão por equipe.",
            ativo: true,
            estoque_segregado: true,
          });
        }
        await tx
          .table("movimentacoes")
          .toCollection()
          .modify((movimentacao) => {
            if (!movimentacao.equipe_id) movimentacao.equipe_id = equipeLegadoId;
          });
      });
  }
}

let _db: AlmoxarifadoDB | null = null;

/** Acesso ao banco local. Só existe no navegador. */
export function getDB(): AlmoxarifadoDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB só está disponível no navegador");
  }
  if (!_db) _db = new AlmoxarifadoDB();
  return _db;
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;

