import * as XLSX from "xlsx";
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
import { normalizar } from "@/utils/format";

export interface DatasetImportado {
  projetos: Projeto[];
  categorias: Categoria[];
  unidades: Unidade[];
  empresas: Empresa[];
  funcionarios: Funcionario[];
  locais: Local[];
  produtos: Produto[];
  equipes: Equipe[];
  equipeMembros: EquipeMembro[];
  movimentacoes: Movimentacao[];
  problemas: string[];
}

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const B = (v: unknown) => {
  const s = S(v).toUpperCase();
  if (["", "1", "SIM", "TRUE", "VERDADEIRO", "ATIVO", "S"].includes(s)) return true;
  return false;
};
const N = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = S(v).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const D = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = S(v);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
};

function rows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return raw.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[S(k).toUpperCase()] = v;
    return out;
  });
}

export function lerArquivo(buffer: ArrayBuffer): DatasetImportado {
  const wb = XLSX.read(buffer, { cellDates: true });
  const problemas: string[] = [];

  const projetos: Projeto[] = rows(wb, "PROJETOS").map((r) => ({
    id: S(r["ID"]) || uid(),
    codigo: S(r["CODIGO"]),
    nome: S(r["NOME"]) || S(r["CODIGO"]) || "Projeto importado",
    empresa_id: S(r["EMPRESA_ID"]) || null,
    status: (S(r["STATUS"]).toUpperCase() || "ATIVO") as Projeto["status"],
    data_inicio: D(r["DATA_INICIO"]) || null,
    data_fim: D(r["DATA_FIM"]) || null,
    observacao: S(r["OBSERVACAO"]) || null,
  }));

  const categorias: Categoria[] = rows(wb, "CATEGORIAS").map((r) => ({
    id: S(r["ID"]) || uid(),
    nome: S(r["NOME"]),
    ativo: B(r["ATIVO"]),
  }));

  const unidades: Unidade[] = rows(wb, "UNIDADES").map((r) => ({
    id: S(r["ID"]) || uid(),
    sigla: S(r["SIGLA"]),
    descricao: S(r["DESCRICAO"]),
    ativo: B(r["ATIVO"]),
  }));

  const empresas: Empresa[] = rows(wb, "EMPRESAS").map((r) => ({
    id: S(r["ID"]) || uid(),
    projeto_id: "",
    nome: S(r["NOME"]),
    tipo: (S(r["TIPO"]).toUpperCase().startsWith("PR") ? "PROPRIA" : "TERCEIRA") as Empresa["tipo"],
    ativo: B(r["ATIVO"]),
  }));

  const funcionarios: Funcionario[] = rows(wb, "FUNCIONARIOS").map((r) => ({
    id: S(r["ID"]) || uid(),
    projeto_id: "",
    matricula: S(r["MATRICULA"]) || null,
    nome: S(r["NOME"]),
    funcao: S(r["FUNCAO"]) || null,
    encarregado_id: S(r["ENCARREGADO_ID"]) || null,
    empresa_id: S(r["EMPRESA_ID"]) || null,
    equipe_raiz_id: S(r["EQUIPE_RAIZ_ID"]) || null,
    status: (S(r["STATUS"]).toUpperCase() === "INATIVO"
      ? "INATIVO"
      : "ATIVO") as Funcionario["status"],
  }));

  const locais: Local[] = rows(wb, "LOCAIS").map((r) => ({
    id: S(r["ID"]) || uid(),
    projeto_id: "",
    codigo: S(r["CODIGO"]) || null,
    nome: S(r["NOME"]),
    local_pai_id: S(r["LOCAL_PAI_ID"]) || null,
    ativo: B(r["ATIVO"]),
  }));

  const produtos: Produto[] = rows(wb, "PRODUTOS").map((r) => ({
    id: S(r["ID"]) || uid(),
    projeto_id: "",
    codigo: S(r["CODIGO"]) || null,
    nome: S(r["NOME"]),
    descricao: S(r["DESCRICAO"]) || null,
    categoria_id: S(r["CATEGORIA_ID"]) || null,
    unidade_id: S(r["UNIDADE_ID"]) || null,
    marca: S(r["MARCA"]) || null,
    modelo: S(r["MODELO"]) || null,
    estoque_minimo: N(r["ESTOQUE_MINIMO"]),
    ativo: B(r["ATIVO"]),
  }));

  const equipes: Equipe[] = rows(wb, "EQUIPES").map((r) => ({
    id: S(r["ID"]) || uid(),
    projeto_id: "",
    nome: S(r["NOME"]),
    descricao: S(r["DESCRICAO"]) || null,
    ativo: B(r["ATIVO"]),
    estoque_segregado: B(r["ESTOQUE_SEGREGADO"]),
  }));
  const equipeMembros: EquipeMembro[] = rows(wb, "EQUIPE_MEMBROS").map((r) => ({
    id: S(r["ID"]) || uid(),
    equipe_id: S(r["EQUIPE_ID"]),
    funcionario_id: S(r["FUNCIONARIO_ID"]),
  }));

  const movimentacoes: Movimentacao[] = rows(wb, "MOVIMENTACOES").map((r) => ({
    id: S(r["ID"]) || uid(),
    projeto_id: S(r["PROJETO_ID"]),
    data: D(r["DATA"]),
    tipo: (S(r["TIPO"]).toUpperCase() || "SAIDA") as Movimentacao["tipo"],
    produto_id: S(r["PRODUTO_ID"]),
    quantidade: Math.abs(N(r["QUANTIDADE"])),
    sinal: N(r["QUANTIDADE"]) < 0 ? -1 : 1,
    funcionario_id: S(r["FUNCIONARIO_ID"]) || null,
    encarregado_id: S(r["ENCARREGADO_ID"]) || null,
    empresa_id: S(r["EMPRESA_ID"]) || null,
    local_id: S(r["LOCAL_ID"]) || null,
    observacao: S(r["OBSERVACAO"]) || null,
    equipe_id: S(r["EQUIPE_ID"]),
  }));

  // ---------- Validações ----------
  const dup = (nome: string, ids: string[]) => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    ids.forEach((i) => (seen.has(i) ? dups.add(i) : seen.add(i)));
    if (dups.size) problemas.push(`${nome}: ${dups.size} ID(s) duplicado(s)`);
  };
  dup(
    "Produtos",
    produtos.map((p) => p.id),
  );
  dup(
    "Funcionários",
    funcionarios.map((f) => f.id),
  );
  dup(
    "Empresas",
    empresas.map((e) => e.id),
  );
  dup(
    "Movimentações",
    movimentacoes.map((m) => m.id),
  );

  const semelhantes = (nome: string, nomes: string[]) => {
    const map = new Map<string, number>();
    nomes.forEach((n) => map.set(normalizar(n), (map.get(normalizar(n)) ?? 0) + 1));
    const qtd = [...map.values()].filter((v) => v > 1).length;
    if (qtd) problemas.push(`${nome}: ${qtd} possível(is) duplicidade(s) por nome`);
  };
  semelhantes(
    "Empresas",
    empresas.map((e) => e.nome),
  );
  semelhantes(
    "Produtos",
    produtos.map((p) => p.nome),
  );

  const unidIds = new Set(unidades.map((u) => u.id));
  const semUnid = produtos.filter((p) => !p.unidade_id || !unidIds.has(p.unidade_id));
  if (semUnid.length) problemas.push(`${semUnid.length} produto(s) sem unidade válida`);

  const semEmp = funcionarios.filter((f) => !f.empresa_id);
  if (semEmp.length) problemas.push(`${semEmp.length} funcionário(s) sem empresa`);

  const prodIds = new Set(produtos.map((p) => p.id));
  const movSemProd = movimentacoes.filter((m) => !prodIds.has(m.produto_id));
  if (movSemProd.length)
    problemas.push(`${movSemProd.length} movimentação(ões) com produto inexistente`);

  const movQtd = movimentacoes.filter((m) => !(m.quantidade > 0));
  if (movQtd.length) problemas.push(`${movQtd.length} movimentação(ões) com quantidade inválida`);

  const movData = movimentacoes.filter((m) => !m.data);
  if (movData.length) problemas.push(`${movData.length} movimentação(ões) com data inválida`);

  const movSemLocal = movimentacoes.filter((m) => !m.local_id);
  if (movSemLocal.length) problemas.push(`${movSemLocal.length} movimentação(ões) sem local`);

  const movSemEquipe = movimentacoes.filter((m) => !m.equipe_id);
  if (movSemEquipe.length)
    problemas.push(`${movSemEquipe.length} movimentação(ões) sem equipe responsável`);

  return {
    projetos,
    categorias,
    unidades,
    empresas,
    funcionarios,
    locais,
    produtos,
    equipes,
    equipeMembros,
    movimentacoes,
    problemas,
  };
}

/**
 * Importa/restaura um projeto.
 *
 * Se o projeto já existir, a importação funciona como uma restauração
 * completa: os registros daquele projeto são substituídos pelos dados
 * presentes na planilha, mantendo os IDs do backup.
 *
 * Se o projeto não existir, ele é criado usando os IDs da planilha.
 *
 * Categorias e unidades são globais e continuam sendo mescladas por ID.
 */
export async function salvarDataset(
  ds: DatasetImportado,
  projetoId?: string,
) {
  if (ds.movimentacoes.some((m) => !m.equipe_id)) {
    throw new Error(
      "Todas as movimentações importadas precisam informar EQUIPE_ID",
    );
  }

  const db = getDB();

  /*
   * Quando projetoId é informado, ele representa explicitamente
   * o projeto de destino.
   *
   * Quando não é informado, usamos o projeto presente na planilha.
   */
  const projetoBackup = ds.projetos[0];

  const destinoId = projetoId ?? projetoBackup?.id;

  if (!destinoId) {
    throw new Error(
      "Não foi possível determinar o projeto de destino da importação.",
    );
  }

  /*
   * Se o projeto já existe, mantemos exatamente o ID dele.
   * Se não existe, o projeto da planilha será criado.
   */
  const projetoExistente = await db.projetos.get(destinoId);

  /*
   * Montamos explicitamente o Projeto para garantir que os campos
   * obrigatórios tenham valores mesmo quando a planilha não os informar.
   */
  const projetoDestino: Projeto = {
    id: destinoId,
    codigo:
      projetoBackup?.codigo ??
      projetoExistente?.codigo ??
      destinoId,
    nome:
      projetoBackup?.nome ??
      projetoExistente?.nome ??
      "Projeto importado",
    empresa_id:
      projetoBackup?.empresa_id ??
      projetoExistente?.empresa_id ??
      null,
    status:
      projetoBackup?.status ??
      projetoExistente?.status ??
      "ATIVO",
    data_inicio:
      projetoBackup?.data_inicio ??
      projetoExistente?.data_inicio ??
      null,
    data_fim:
      projetoBackup?.data_fim ??
      projetoExistente?.data_fim ??
      null,
    observacao:
      projetoBackup?.observacao ??
      projetoExistente?.observacao ??
      null,
  };

  /*
   * Ao restaurar para um projeto existente, os IDs precisam permanecer
   * iguais aos da planilha. Isso permite que o backup seja realmente
   * uma atualização do mesmo conjunto de dados.
   */
  const empresas = ds.empresas.map((empresa) => ({
    ...empresa,
    projeto_id: destinoId,
  }));

  const funcionarios = ds.funcionarios.map((funcionario) => ({
    ...funcionario,
    projeto_id: destinoId,
  }));

  const locais = ds.locais.map((local) => ({
    ...local,
    projeto_id: destinoId,
  }));

  const produtos = ds.produtos.map((produto) => ({
    ...produto,
    projeto_id: destinoId,
  }));

  const equipes = ds.equipes.map((equipe) => ({
    ...equipe,
    projeto_id: destinoId,
  }));

  const movimentacoes = ds.movimentacoes.map((movimentacao) => ({
    ...movimentacao,
    projeto_id: destinoId,
  }));

  /*
   * Os membros de equipe são validados pelas equipes e funcionários
   * presentes no próprio backup.
   */
  const equipeIds = new Set(equipes.map((equipe) => equipe.id));
  const funcionarioIds = new Set(
    funcionarios.map((funcionario) => funcionario.id),
  );

  const equipeMembros = ds.equipeMembros.filter(
    (membro) =>
      equipeIds.has(membro.equipe_id) &&
      funcionarioIds.has(membro.funcionario_id),
  );

  /*
   * IDs existentes no backup.
   *
   * Eles serão usados para remover registros antigos que não fazem
   * mais parte da restauração.
   */
  const ids = {
    empresas: new Set(empresas.map((item) => item.id)),
    funcionarios: new Set(funcionarios.map((item) => item.id)),
    locais: new Set(locais.map((item) => item.id)),
    produtos: new Set(produtos.map((item) => item.id)),
    equipes: new Set(equipes.map((item) => item.id)),
    movimentacoes: new Set(
      movimentacoes.map((item) => item.id),
    ),
  };

  await db.transaction(
    "rw",
    [
      db.projetos,
      db.categorias,
      db.unidades,
      db.empresas,
      db.funcionarios,
      db.locais,
      db.produtos,
      db.movimentacoes,
      db.equipes,
      db.equipe_membros,
    ],
    async () => {
      /*
       * 1. Projeto
       */
      await db.projetos.put(projetoDestino);

      /*
       * 2. Catálogos globais
       *
       * Não removemos categorias/unidades que não estejam no backup,
       * pois elas podem estar sendo utilizadas por outros projetos.
       */
      await db.categorias.bulkPut(ds.categorias);
      await db.unidades.bulkPut(ds.unidades);

      /*
       * 3. Remove registros antigos do projeto que não existem
       *    mais no backup.
       *
       * Isso transforma a operação em uma restauração completa.
       */
      const [empresasAtuais, funcionariosAtuais, locaisAtuais, produtosAtuais, equipesAtuais, movimentacoesAtuais] =
        await Promise.all([
          db.empresas.where("projeto_id").equals(destinoId).toArray(),
          db.funcionarios.where("projeto_id").equals(destinoId).toArray(),
          db.locais.where("projeto_id").equals(destinoId).toArray(),
          db.produtos.where("projeto_id").equals(destinoId).toArray(),
          db.equipes.where("projeto_id").equals(destinoId).toArray(),
          db.movimentacoes.where("projeto_id").equals(destinoId).toArray(),
        ]);

      await db.empresas.bulkDelete(
        empresasAtuais
          .filter((item) => !ids.empresas.has(item.id))
          .map((item) => item.id),
      );

      await db.funcionarios.bulkDelete(
        funcionariosAtuais
          .filter((item) => !ids.funcionarios.has(item.id))
          .map((item) => item.id),
      );

      await db.locais.bulkDelete(
        locaisAtuais
          .filter((item) => !ids.locais.has(item.id))
          .map((item) => item.id),
      );

      await db.produtos.bulkDelete(
        produtosAtuais
          .filter((item) => !ids.produtos.has(item.id))
          .map((item) => item.id),
      );

      await db.equipes.bulkDelete(
        equipesAtuais
          .filter((item) => !ids.equipes.has(item.id))
          .map((item) => item.id),
      );

      await db.movimentacoes.bulkDelete(
        movimentacoesAtuais
          .filter((item) => !ids.movimentacoes.has(item.id))
          .map((item) => item.id),
      );

      /*
       * 4. Substitui os dados do projeto pelo backup.
       */
      await db.empresas.bulkPut(empresas);
      await db.funcionarios.bulkPut(funcionarios);
      await db.locais.bulkPut(locais);
      await db.produtos.bulkPut(produtos);
      await db.equipes.bulkPut(equipes);
      await db.movimentacoes.bulkPut(movimentacoes);

      /*
       * 5. Membros de equipe.
       *
       * Primeiro removemos os membros das equipes deste projeto
       * e depois gravamos exatamente os membros do backup.
       */
      if (equipeIds.size > 0) {
        await db.equipe_membros
          .where("equipe_id")
          .anyOf([...equipeIds])
          .delete();
      }

      if (equipeMembros.length > 0) {
        await db.equipe_membros.bulkPut(equipeMembros);
      }
    },
  );
}

export async function exportarProjeto(projetoId: string) {
  const db = getDB();

  const projeto = await db.projetos.get(projetoId);

  if (!projeto) {
    throw new Error("Projeto não encontrado.");
  }

  const [
    categorias,
    unidades,
    empresas,
    funcionarios,
    locais,
    produtos,
    equipes,
  ] = await Promise.all([
    db.categorias.toArray(),
    db.unidades.toArray(),
    db.empresas.where("projeto_id").equals(projetoId).toArray(),
    db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
    db.locais.where("projeto_id").equals(projetoId).toArray(),
    db.produtos.where("projeto_id").equals(projetoId).toArray(),
    db.equipes.where("projeto_id").equals(projetoId).toArray(),
  ]);

  const equipeIds = new Set(equipes.map((e) => e.id));

  const equipeMembros = await db.equipe_membros
    .filter((m) => equipeIds.has(m.equipe_id))
    .toArray();

  const movimentacoes = await db.movimentacoes
    .where("projeto_id")
    .equals(projetoId)
    .toArray();

  const empresaPorId = new Map(empresas.map((e) => [e.id, e.nome]));
  const funcionarioPorId = new Map(funcionarios.map((f) => [f.id, f.nome]));
  const localPorId = new Map(locais.map((l) => [l.id, l.nome]));
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const categoriaPorId = new Map(categorias.map((c) => [c.id, c.nome]));
  const unidadePorId = new Map(unidades.map((u) => [u.id, u.sigla]));
  const equipePorId = new Map(equipes.map((e) => [e.id, e.nome]));

  const wb = XLSX.utils.book_new();
  const add = (nome: string, data: Record<string, unknown>[], header: string[]) => {
    const ws = XLSX.utils.json_to_sheet(data, { header });
    const ultimaColuna = XLSX.utils.encode_col(Math.max(header.length - 1, 0));
    ws["!autofilter"] = {
      ref: `A1:${ultimaColuna}${Math.max(data.length + 1, 1)}`,
    };
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    ws["!rows"] = [{ hpt: 24 }];
    ws["!cols"] = header.map((campo) => ({
      wch: Math.min(
        campo === "OBSERVACAO" || campo === "DESCRICAO" ? 42 : 32,
        Math.max(
          12,
          campo.length + 3,
          ...data.map((linha) => String(linha[campo] ?? "").length + 2),
        ),
      ),
      hidden: campo === "ID" || campo.endsWith("_ID"),
    }));

    for (let coluna = 0; coluna < header.length; coluna += 1) {
      const celula = ws[XLSX.utils.encode_cell({ r: 0, c: coluna })];

      if (celula) {
        celula.s = {
          fill: { fgColor: { rgb: "17324D" } },
          font: { bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, nome);
  };

  add(
    "CONFIGURACAO",
    [
      { CAMPO: "VERSAO", VALOR: "1.0" },
      { CAMPO: "PROJETO", VALOR: projeto.nome },
      { CAMPO: "PROJETO_ID", VALOR: projeto.id },
      { CAMPO: "EXPORTADO_EM", VALOR: new Date().toISOString() },
    ],
    ["CAMPO", "VALOR"],
  );

  add(
    "PROJETOS",
    [
      {
        ID: projeto.id,
        CODIGO: projeto.codigo,
        NOME: projeto.nome,
        EMPRESA: empresaPorId.get(projeto.empresa_id ?? "") ?? "",
        EMPRESA_ID: projeto.empresa_id ?? "",
        STATUS: projeto.status,
        DATA_INICIO: projeto.data_inicio ?? "",
        DATA_FIM: projeto.data_fim ?? "",
        OBSERVACAO: projeto.observacao ?? "",
      },
    ],
    [
      "ID",
      "CODIGO",
      "NOME",
      "EMPRESA",
      "EMPRESA_ID",
      "STATUS",
      "DATA_INICIO",
      "DATA_FIM",
      "OBSERVACAO",
    ],
  );

  add(
    "CATEGORIAS",
    categorias.map((c) => ({
      ID: c.id,
      NOME: c.nome,
      ATIVO: c.ativo ? 1 : 0,
    })),
    ["ID", "NOME", "ATIVO"],
  );

  add(
    "UNIDADES",
    unidades.map((u) => ({
      ID: u.id,
      SIGLA: u.sigla,
      DESCRICAO: u.descricao,
      ATIVO: u.ativo ? 1 : 0,
    })),
    ["ID", "SIGLA", "DESCRICAO", "ATIVO"],
  );

  add(
    "EMPRESAS",
    empresas.map((e) => ({
      ID: e.id,
      NOME: e.nome,
      TIPO: e.tipo,
      ATIVO: e.ativo ? 1 : 0,
    })),
    ["ID", "NOME", "TIPO", "ATIVO"],
  );

  add(
    "FUNCIONARIOS",
    funcionarios.map((f) => ({
      ID: f.id,
      MATRICULA: f.matricula ?? "",
      NOME: f.nome,
      FUNCAO: f.funcao ?? "",
      ENCARREGADO: funcionarioPorId.get(f.encarregado_id ?? "") ?? "",
      EMPRESA: empresaPorId.get(f.empresa_id ?? "") ?? "",
      EQUIPE_RAIZ: equipePorId.get(f.equipe_raiz_id ?? "") ?? "",
      ENCARREGADO_ID: f.encarregado_id ?? "",
      EMPRESA_ID: f.empresa_id ?? "",
      EQUIPE_RAIZ_ID: f.equipe_raiz_id ?? "",
      STATUS: f.status,
    })),
    [
      "ID",
      "MATRICULA",
      "NOME",
      "FUNCAO",
      "ENCARREGADO",
      "EMPRESA",
      "EQUIPE_RAIZ",
      "ENCARREGADO_ID",
      "EMPRESA_ID",
      "EQUIPE_RAIZ_ID",
      "STATUS",
    ],
  );

  add(
    "LOCAIS",
    locais.map((l) => ({
      ID: l.id,
      CODIGO: l.codigo ?? "",
      NOME: l.nome,
      LOCAL_PAI: localPorId.get(l.local_pai_id ?? "") ?? "",
      LOCAL_PAI_ID: l.local_pai_id ?? "",
      ATIVO: l.ativo ? 1 : 0,
    })),
    ["ID", "CODIGO", "NOME", "LOCAL_PAI", "LOCAL_PAI_ID", "ATIVO"],
  );

  add(
    "PRODUTOS",
    produtos.map((p) => ({
      ID: p.id,
      CODIGO: p.codigo ?? "",
      NOME: p.nome,
      DESCRICAO: p.descricao ?? "",
      CATEGORIA: categoriaPorId.get(p.categoria_id ?? "") ?? "",
      UNIDADE: unidadePorId.get(p.unidade_id ?? "") ?? "",
      CATEGORIA_ID: p.categoria_id ?? "",
      UNIDADE_ID: p.unidade_id ?? "",
      MARCA: p.marca ?? "",
      MODELO: p.modelo ?? "",
      ESTOQUE_MINIMO: p.estoque_minimo,
      ATIVO: p.ativo ? 1 : 0,
    })),
    [
      "ID",
      "CODIGO",
      "NOME",
      "DESCRICAO",
      "CATEGORIA",
      "UNIDADE",
      "CATEGORIA_ID",
      "UNIDADE_ID",
      "MARCA",
      "MODELO",
      "ESTOQUE_MINIMO",
      "ATIVO",
    ],
  );

  add(
    "EQUIPES",
    equipes.map((e) => ({
      ID: e.id,
      NOME: e.nome,
      DESCRICAO: e.descricao ?? "",
      ATIVO: e.ativo ? 1 : 0,
      ESTOQUE_SEGREGADO: e.estoque_segregado ? 1 : 0,
    })),
    ["ID", "NOME", "DESCRICAO", "ATIVO", "ESTOQUE_SEGREGADO"],
  );

  add(
    "EQUIPE_MEMBROS",
    equipeMembros.map((m) => ({
      ID: m.id,
      EQUIPE: equipePorId.get(m.equipe_id) ?? "",
      FUNCIONARIO: funcionarioPorId.get(m.funcionario_id ?? "") ?? "",
      EQUIPE_ID: m.equipe_id,
      FUNCIONARIO_ID: m.funcionario_id,
    })),
    ["ID", "EQUIPE", "FUNCIONARIO", "EQUIPE_ID", "FUNCIONARIO_ID"],
  );

  add(
    "MOVIMENTACOES",
    movimentacoes.map((m) => ({
      ID: m.id,
      PROJETO_ID: m.projeto_id,
      DATA: m.data,
      TIPO: m.tipo,
      PRODUTO: produtoPorId.get(m.produto_id)?.nome ?? "",
      PRODUTO_ID: m.produto_id,
      QUANTIDADE: (m.sinal ?? 1) < 0 ? -m.quantidade : m.quantidade,
      UNIDADE: unidadePorId.get(
        produtoPorId.get(m.produto_id)?.unidade_id ?? "",
      ) ?? "",
      FUNCIONARIO: funcionarioPorId.get(m.funcionario_id ?? "") ?? "",
      FUNCIONARIO_ID: m.funcionario_id ?? "",
      ENCARREGADO: funcionarioPorId.get(m.encarregado_id ?? "") ?? "",
      ENCARREGADO_ID: m.encarregado_id ?? "",
      EMPRESA: empresaPorId.get(m.empresa_id ?? "") ?? "",
      EMPRESA_ID: m.empresa_id ?? "",
      LOCAL: localPorId.get(m.local_id ?? "") ?? "",
      LOCAL_ID: m.local_id ?? "",
      EQUIPE: equipePorId.get(m.equipe_id) ?? "",
      EQUIPE_ID: m.equipe_id ?? "",
      OBSERVACAO: m.observacao ?? "",
    })),
    [
      "ID",
      "PROJETO_ID",
      "DATA",
      "TIPO",
      "PRODUTO",
      "PRODUTO_ID",
      "QUANTIDADE",
      "UNIDADE",
      "FUNCIONARIO",
      "FUNCIONARIO_ID",
      "ENCARREGADO",
      "ENCARREGADO_ID",
      "EMPRESA",
      "EMPRESA_ID",
      "LOCAL",
      "LOCAL_ID",
      "EQUIPE",
      "EQUIPE_ID",
      "OBSERVACAO",
    ],
  );

  const slug = (projeto.codigo || projeto.nome || "PROJETO")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");

  XLSX.writeFile(wb, `MODELO_GESTAO_ALMOXARIFADO_${slug}.xlsx`);
}


export async function gerarBackup() {
  const db = getDB();
  const dump = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    projetos: await db.projetos.toArray(),
    categorias: await db.categorias.toArray(),
    unidades: await db.unidades.toArray(),
    empresas: await db.empresas.toArray(),
    funcionarios: await db.funcionarios.toArray(),
    locais: await db.locais.toArray(),
    produtos: await db.produtos.toArray(),
    movimentacoes: await db.movimentacoes.toArray(),
    equipes: await db.equipes.toArray(),
    equipeMembros: await db.equipe_membros.toArray(),
  };
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_almoxarifado_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restaurarBackup(json: string) {
  const data = JSON.parse(json) as Record<string, unknown[]>;
  const db = getDB();
  await db.transaction(
    "rw",
    [
      db.projetos,
      db.categorias,
      db.unidades,
      db.empresas,
      db.funcionarios,
      db.locais,
      db.produtos,
      db.movimentacoes,
      db.equipes,
      db.equipe_membros,
    ],
    async () => {
      const put = async (
        table: { clear: () => Promise<void>; bulkPut: (rows: never[]) => Promise<unknown> },
        key: string,
      ) => {
        await table.clear();
        const rows = (data[key] ?? []) as never[];
        if (rows.length) await table.bulkPut(rows);
      };
      await put(db.projetos as never, "projetos");
      await put(db.categorias as never, "categorias");
      await put(db.unidades as never, "unidades");
      await put(db.empresas as never, "empresas");
      await put(db.funcionarios as never, "funcionarios");
      await put(db.locais as never, "locais");
      await put(db.produtos as never, "produtos");
      await put(db.movimentacoes as never, "movimentacoes");
      await put(db.equipes as never, "equipes");
      await put(db.equipe_membros as never, "equipeMembros");
    },
  );
}
