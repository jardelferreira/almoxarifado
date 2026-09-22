import writeExcelFile from "write-excel-file/browser";
import { getDB } from "@/db/db";

const COR = {
  cabecalho: "#17324D",
  cabecalhoTexto: "#FFFFFF",
  borda: "#D9E1E8",
  zebra: "#F8FAFC",
};

type Row = any;

type Column = {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "center" | "right";
  number?: boolean;
};

type ExportCell = {
  value?: string | number | boolean | Date;
  type?: StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor | "Formula";
  fontWeight?: "bold";
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderStyle?: "thin" | "medium" | "double";
  align?: "left" | "center" | "right";
  alignVertical?: "top" | "center" | "bottom";
  wrap?: boolean;
};

type ExcelCell = ExportCell;

type ExcelSheetData = ExcelCell[][];

type ExcelSheet = {
  sheet: string;
  data: ExcelSheetData;
  columns: Array<{ width?: number }>;
  orientation: "landscape";
  stickyRowsCount: number;
};

/**
 * O Excel exportado pelo sistema também é uma fonte válida para a importação.
 * Por isso cada tabela persistida possui uma aba canônica e preserva os campos
 * originais. A única exceção é o nome da tabela financeira, que excederia o
 * limite de 31 caracteres do Excel e usa o alias documentado abaixo.
 */
const TABELAS_EXPORTACAO = [
  "projetos",
  "categorias",
  "categorias_equipamentos",
  "unidades",
  "empresas",
  "funcionarios",
  "locais",
  "produtos",
  "movimentacoes",
  "equipes",
  "equipe_membros",
  "arquivos",
  "equipamentos",
  "estoque_equipamentos",
  "apropriacoes",
  "movimentacoes_equipamentos",
  "configuracoes",
  "documentos",
  "documento_itens",
  "documento_referencias",
  "inventarios",
  "inventario_itens",
  "inteligencia_acoes",
  "manutencoes_equipamentos",
  "manutencao_documentos",
  "apropriacoes_financeiras_equipamentos",
  "consumos_equipamentos",
  "regras_consumo_equipamentos",
  "perfis_parametros_custos",
] as const;

const ABA_EXPORTACAO: Record<string, string> = {
  projetos: "PROJETOS",
  categorias: "CATEGORIAS",
  categorias_equipamentos: "CATEGORIAS_EQUIPAMENTOS",
  unidades: "UNIDADES",
  empresas: "EMPRESAS",
  funcionarios: "FUNCIONARIOS",
  locais: "LOCAIS",
  produtos: "PRODUTOS",
  movimentacoes: "MOVIMENTACOES",
  equipes: "EQUIPES",
  equipe_membros: "EQUIPE_MEMBROS",
  arquivos: "ARQUIVOS",
  equipamentos: "EQUIPAMENTOS",
  estoque_equipamentos: "ESTOQUE_EQUIPAMENTOS",
  apropriacoes: "APROPRIACOES",
  movimentacoes_equipamentos: "MOVIMENTACOES_EQUIPAMENTOS",
  configuracoes: "CONFIGURACOES",
  documentos: "DOCUMENTOS",
  documento_itens: "DOCUMENTO_ITENS",
  documento_referencias: "DOCUMENTO_REFERENCIAS",
  inventarios: "INVENTARIOS",
  inventario_itens: "INVENTARIO_ITENS",
  inteligencia_acoes: "INTELIGENCIA_ACOES",
  manutencoes_equipamentos: "MANUTENCOES_EQUIPAMENTOS",
  manutencao_documentos: "MANUTENCAO_DOCUMENTOS",
  apropriacoes_financeiras_equipamentos: "APROPRIACOES_FIN_EQUIP",
  consumos_equipamentos: "CONSUMOS_EQUIPAMENTOS",
  regras_consumo_equipamentos: "REGRAS_CONSUMO_EQUIPAMENTOS",
  perfis_parametros_custos: "PERFIS_PARAMETROS_CUSTOS",
};

const ROTULOS: Record<string, string> = {
  id: "ID do sistema",
  projeto_id: "ID projeto",
  codigo: "Código",
  nome: "Nome",
  descricao: "Descrição",
  status: "Status",
  ativo: "Status",
  tipo: "Tipo",
  quantidade: "Quantidade",
  data: "Data",
  criado_em: "Criado em",
  atualizado_em: "Atualizado em",
  empresa_id: "ID empresa",
  empresa: "Empresa",
  funcionario_id: "ID funcionário",
  funcionario: "Funcionário",
  encarregado_id: "ID encarregado",
  encarregado: "Encarregado",
  equipe_id: "ID equipe",
  equipe: "Equipe",
  equipe_raiz_id: "ID equipe raiz",
  equipe_raiz: "Equipe raiz",
  produto_id: "ID produto",
  produto: "Produto",
  categoria_id: "ID categoria",
  categoria: "Categoria",
  unidade_id: "ID unidade",
  unidade: "Unidade",
  local_id: "ID local",
  local: "Local",
  local_destino_id: "ID local destino",
  local_destino: "Local destino",
  observacao: "Observação",
  observacoes: "Observações",
  matricula: "Matrícula",
  funcao: "Função",
  marca: "Marca",
  modelo: "Modelo",
  estoque_minimo: "Estoque mínimo",
  sinal: "Sinal",
  documento_id: "ID documento",
  documento_item_id: "ID item documento",
  numero: "Número",
  serie: "Série",
  data_emissao: "Data emissão",
  data_entrada: "Data entrada",
  valor_total: "Valor total",
  valor_unitario: "Valor unitário",
  documento_referenciado_id: "ID documento relacionado",
  tipo_relacao: "Tipo de relação",
  inventario_id: "ID inventário",
  quantidade_sistema: "Quantidade sistema",
  quantidade_contada: "Quantidade contada",
  patrimonio: "Patrimônio",
  serial: "Serial",
  identificacao: "Identificação",
  devolvido: "Devolvido",
  baixado: "Baixado",
  tipo_controle: "Tipo de controle",
  estoque_equipamento_id: "ID estoque equipamento",
  tipo_origem: "Tipo origem",
  origem_id: "ID origem",
  tipo_destino: "Tipo destino",
  destino_id: "ID destino",
  referencia_documento: "Documento de referência",
  mime_type: "MIME type",
  tamanho: "Tamanho (bytes)",
  nome_original: "Nome original",
  chave_r2: "Chave de armazenamento",
  casas_decimais: "Casas decimais",
  fator: "Fator",
  custo_unitario: "Custo unitário",
  custo_total: "Custo total",
  perfil_id: "ID perfil",
  versao: "Versão",
};

const CAMPOS_NUMERICOS = new Set([
  "quantidade",
  "estoque_minimo",
  "quantidade_sistema",
  "quantidade_contada",
  "valor_total",
  "valor_unitario",
  "devolvido",
  "baixado",
  "tamanho",
  "fator",
  "custo_unitario",
  "custo_total",
  "versao",
  "casas_decimais",
]);

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

function valorExcel(valor: unknown): string | number | boolean | Date | undefined {
  if (valor === null || valor === undefined) return undefined;
  if (valor instanceof Date) return valor;
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") return valor;
  return texto(valor);
}

function existeTabela(nome: string): boolean {
  return getDB().tables.some((tabela) => tabela.name === nome);
}

async function lerTabela(nome: string): Promise<Row[]> {
  if (!existeTabela(nome)) return [];
  return (await getDB().table(nome).toArray()).filter(
    (item): item is Row => Boolean(item && typeof item === "object"),
  );
}

function labelCampo(campo: string): string {
  return ROTULOS[campo] ?? campo.replaceAll("_", " ");
}

function colunasDeLinhas(rows: Row[]): Column[] {
  const chaves = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return chaves.map((key) => ({
    key,
    label: labelCampo(key),
    width:
      key === "id" || key.endsWith("_id")
        ? 40
        : key.includes("observ") || key === "descricao"
          ? 42
          : 20,
    number: CAMPOS_NUMERICOS.has(key),
    align: CAMPOS_NUMERICOS.has(key) ? "right" : "left",
  }));
}

function estiloCelula(valor: unknown, linha: number, campo: string): ExportCell {
  const valorCalculado = valorExcel(valor);
  return {
    ...(valorCalculado !== undefined ? { value: valorCalculado } : {}),
    borderColor: COR.borda,
    borderStyle: "thin",
    alignVertical: "top",
    wrap: campo.includes("observ") || campo === "descricao",
    ...(linha % 2 === 0 ? { backgroundColor: COR.zebra } : {}),
  };
}

function criarFolha(linhas: Row[], colunas: Column[]): ExcelSheetData {
  const header: ExcelCell[] = colunas.map((coluna) => ({
    value: coluna.label,
    fontWeight: "bold",
    textColor: COR.cabecalhoTexto,
    backgroundColor: COR.cabecalho,
    borderColor: COR.cabecalho,
    borderStyle: "thin",
    align: coluna.align ?? "left",
    alignVertical: "center",
    wrap: true,
  }));

  const rows = linhas.map((row, indice) =>
    colunas.map((coluna) => {
      const celula = estiloCelula(row[coluna.key], indice, coluna.key);
      if (coluna.number) celula.type = Number;
      if (coluna.align) celula.align = coluna.align;
      return celula;
    }),
  );

  return [header, ...rows];
}

function filtrarPorProjeto(nome: string, rows: Row[], projetoId: string): Row[] {
  if (nome === "categorias" || nome === "unidades") return rows;
  if (nome === "projetos") return rows.filter((row) => texto(row.id) === projetoId);
  if (nome === "equipe_membros") return rows;
  if (nome === "documento_itens") return rows;
  if (nome === "inventario_itens") return rows;
  if (nome === "apropriacoes") return rows;
  return rows.filter((row) => texto(row.projeto_id) === projetoId);
}

/**
 * Filtra relações sem projeto_id usando os pais do projeto ativo.
 */
function filtrarRelacionadas(
  nome: string,
  rows: Row[],
  equipes: Row[],
  documentos: Row[],
  inventarios: Row[],
  estoques: Row[],
): Row[] {
  if (nome === "equipe_membros") {
    const ids = new Set(equipes.map((row) => texto(row.id)));
    return rows.filter((row) => ids.has(texto(row.equipe_id)));
  }
  if (nome === "documento_itens") {
    const ids = new Set(documentos.map((row) => texto(row.id)));
    return rows.filter((row) => ids.has(texto(row.documento_id)));
  }
  if (nome === "inventario_itens") {
    const ids = new Set(inventarios.map((row) => texto(row.id)));
    return rows.filter((row) => ids.has(texto(row.inventario_id)));
  }
  if (nome === "apropriacoes") {
    const ids = new Set(estoques.map((row) => texto(row.id)));
    return rows.filter((row) => ids.has(texto(row.estoque_equipamento_id)));
  }
  return rows;
}

export async function exportarProjetoParaExcel(projetoId: string): Promise<void> {
  if (!projetoId) throw new Error("Selecione um projeto antes de exportar.");

  const projeto = await getDB().projetos.get(projetoId);
  if (!projeto) throw new Error("Projeto ativo não encontrado.");

  const tabelas = {} as Record<(typeof TABELAS_EXPORTACAO)[number], Row[]>;
  for (const nome of TABELAS_EXPORTACAO) {
    tabelas[nome] = await lerTabela(nome);
  }

  const equipes = filtrarPorProjeto("equipes", tabelas.equipes, projetoId);
  const documentos = filtrarPorProjeto("documentos", tabelas.documentos, projetoId);
  const inventarios = filtrarPorProjeto("inventarios", tabelas.inventarios, projetoId);
  const estoques = filtrarPorProjeto("estoque_equipamentos", tabelas.estoque_equipamentos, projetoId);
  const produtosProjeto = filtrarPorProjeto("produtos", tabelas.produtos, projetoId);
  const categoriasUsadas = new Set(
    produtosProjeto.map((row) => texto(row.categoria_id)).filter(Boolean),
  );
  const unidadesUsadas = new Set(
    [
      ...produtosProjeto.map((row) => texto(row.unidade_id)),
      ...tabelas.regras_consumo_equipamentos
        .filter((row) => texto(row.projeto_id) === projetoId)
        .flatMap((row) => [texto(row.unidade_base_id), texto(row.unidade_consumo_id)]),
      ...tabelas.consumos_equipamentos
        .filter((row) => texto(row.projeto_id) === projetoId)
        .map((row) => texto(row.unidade_id)),
    ].filter(Boolean),
  );

  const folhas: Array<{ nome: string; data: Row[]; columns: Column[] }> = [];

  const adicionar = (nome: string, data: Row[]) => {
    folhas.push({ nome: ABA_EXPORTACAO[nome] ?? nome.toUpperCase().slice(0, 31), data, columns: colunasDeLinhas(data) });
  };

  for (const nome of TABELAS_EXPORTACAO) {
    let rows = nome === "categorias"
      ? tabelas.categorias.filter((row) => categoriasUsadas.has(texto(row.id)))
      : nome === "unidades"
        ? tabelas.unidades.filter((row) => unidadesUsadas.has(texto(row.id)))
        : filtrarPorProjeto(nome, tabelas[nome], projetoId);
    rows = filtrarRelacionadas(nome, rows, equipes, documentos, inventarios, estoques);
    adicionar(nome, rows);
  }

  // Aba derivada para leitura humana. Não participa da importação.
  const saldo = new Map<string, number>();
  for (const movimento of tabelas.movimentacoes.filter((row) => texto(row.projeto_id) === projetoId)) {
    const quantidade = Number(movimento.quantidade ?? 0);
    const sinal = Number(movimento.sinal ?? 1);
    const tipo = texto(movimento.tipo).toUpperCase();
    const efeito = tipo === "ENTRADA" || tipo === "DEVOLUCAO" ? quantidade : tipo === "SAIDA" ? -quantidade : sinal * quantidade;
    const chave = `${texto(movimento.produto_id)}:${texto(movimento.equipe_id)}`;
    saldo.set(chave, (saldo.get(chave) ?? 0) + efeito);
  }

  const produtos = produtosProjeto;
  const produtoMap = new Map(produtos.map((row) => [texto(row.id), row]));
  const equipeMap = new Map(equipes.map((row) => [texto(row.id), texto(row.nome)]));
  const unidadeMap = new Map(tabelas.unidades.map((row) => [texto(row.id), texto(row.sigla)]));
  const estoqueAtual = [...saldo.entries()].map(([chave, quantidade]) => {
    const [produtoId = "", equipeId = ""] = chave.split(":");
    const produto = produtoMap.get(produtoId);
    const minimo = Number(produto?.estoque_minimo ?? 0);
    return {
      produto_id: produtoId,
      produto: texto(produto?.nome),
      equipe_id: equipeId,
      equipe: equipeMap.get(equipeId) ?? "",
      unidade: unidadeMap.get(texto(produto?.unidade_id)) ?? "",
      estoque_minimo: minimo,
      saldo: quantidade,
      status: minimo > 0 && quantidade < minimo ? "BAIXO" : "OK",
    };
  });
  folhas.push({ nome: "ESTOQUE_ATUAL", data: estoqueAtual, columns: colunasDeLinhas(estoqueAtual) });

  const sheets: ExcelSheet[] = folhas.map((folha) => ({
    sheet: folha.nome.slice(0, 31),
    data: criarFolha(folha.data, folha.columns),
    columns: folha.columns.map((coluna) => ({ width: coluna.width ?? 18 })),
    stickyRowsCount: 1,
    orientation: "landscape",
  }));

  const codigo = texto(projeto.codigo).replace(/[^a-zA-Z0-9]+/g, "_") || "PROJETO";
  await writeExcelFile(sheets, { fontFamily: "Aptos", fontSize: 10 }).toFile(
    `EXPORTACAO_PROJETO_${codigo}.xlsx`,
  );
}
