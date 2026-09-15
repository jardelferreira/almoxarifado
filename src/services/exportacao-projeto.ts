import writeExcelFile from "write-excel-file/browser";
import { getDB } from "@/db/db";

const COR = {
  cabecalho: "#17324D",
  cabecalhoTexto: "#FFFFFF",
  borda: "#D9E1E8",
  zebra: "#F8FAFC",
  sucesso: "#DCFCE7",
  sucessoTexto: "#166534",
  alerta: "#FEF3C7",
  alertaTexto: "#92400E",
  perigo: "#FEE2E2",
  perigoTexto: "#991B1B",
  info: "#DBEAFE",
  infoTexto: "#1D4ED8",
};

type Row = any;

type Column = {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "center" | "right";
  number?: boolean;
};

const TABELAS = [
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
] as const;


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
  vinculo: "Vínculo",
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
};

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

function numero(valor: unknown): number {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : 0;
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
  return ROTULOS[campo] ?? campo.replace(/_/g, " ").replace(/\b\w/g, (letra) => letra.toUpperCase());
}

function statusTexto(valor: unknown): string {
  if (typeof valor === "boolean") return valor ? "ATIVO" : "INATIVO";
  return texto(valor);
}

function efeitoMovimento(row: Row): number {
  const quantidade = numero(row.quantidade);
  const tipo = texto(row.tipo);
  if (tipo === "ENTRADA" || tipo === "DEVOLUCAO") return quantidade;
  if (tipo === "SAIDA") return -quantidade;
  return (numero(row.sinal) || 1) * quantidade;
}

type ExportCell = {
  value?: string | number | boolean | Date;
  type?: StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor | "Formula";
  fontWeight?: "bold";
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderStyle?:
    | "hair"
    | "dotted"
    | "dashDotDot"
    | "dashDot"
    | "dashed"
    | "thin"
    | "mediumDashDotDot"
    | "slantDashDot"
    | "mediumDashDot"
    | "mediumDashed"
    | "medium"
    | "double"
    | "thick";
  align?: "left" | "center" | "right";
  alignVertical?: "top" | "center" | "bottom";
  wrap?: boolean;
};

function valorExcel(valor: unknown): string | number | boolean | Date | undefined {
  if (valor === null || valor === undefined) return undefined;
  if (valor instanceof Date) return valor;
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
    return valor;
  }
  return texto(valor);
}

function estiloCelula(valor: unknown, linha: number, campo: string, row: Row): ExportCell {
  const valorCalculado = valorExcel(valor);
  const celula: ExportCell = {
    ...(valorCalculado !== undefined ? { value: valorCalculado } : {}),
    borderColor: COR.borda,
    borderStyle: "thin",
    alignVertical: "top",
    wrap: campo.includes("observ") || campo === "descricao",
  };

  if (linha % 2 === 0) celula.backgroundColor = COR.zebra;

  const valorTexto = texto(valor).toUpperCase();
  if (campo === "tipo") {
    const cores: Record<string, [string, string]> = {
      ENTRADA: [COR.sucesso, COR.sucessoTexto],
      DEVOLUCAO: [COR.info, COR.infoTexto],
      SAIDA: [COR.perigo, COR.perigoTexto],
      AJUSTE: [COR.alerta, COR.alertaTexto],
      TRANSFERENCIA: [COR.info, COR.infoTexto],
    };
    const cor = cores[valorTexto];
    if (cor) {
      celula.backgroundColor = cor[0];
      celula.textColor = cor[1];
    }
  }

  if (campo === "status" || campo === "ativo") {
    if (["ATIVO", "OK", "CONCLUIDO"].includes(valorTexto)) {
      celula.backgroundColor = COR.sucesso;
      celula.textColor = COR.sucessoTexto;
    } else if (["INATIVO", "CANCELADO", "BAIXO"].includes(valorTexto)) {
      celula.backgroundColor = COR.perigo;
      celula.textColor = COR.perigoTexto;
    } else if (["ABERTO", "PENDENTE", "PARCIAL"].includes(valorTexto)) {
      celula.backgroundColor = COR.alerta;
      celula.textColor = COR.alertaTexto;
    }
  }

  if (campo === "saldo" && numero(row.saldo) < 0) {
    celula.backgroundColor = COR.perigo;
    celula.textColor = COR.perigoTexto;
  }

  return celula;
}

type ExcelCell = ExportCell;

type ExcelSheetData = ExcelCell[][];

type ExcelSheet = {
  sheet: string;
  data: ExcelSheetData;
  columns: Array<{ width?: number }>;
  orientation: "landscape";
  stickyRowsCount: number;
};

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

  const rows: ExcelSheetData = linhas.map((row, indice) =>
    colunas.map((coluna) => {
      const valor = row[coluna.key];
      const celula = estiloCelula(valor, indice, coluna.key, row) as ExcelCell;
      if (coluna.number) celula.type = Number;
      if (coluna.align) celula.align = coluna.align;
      return celula;
    }),
  );

  return [header, ...rows];
}

function adicionarNomes(rows: Row[], maps: Record<string, Map<string, string>>): Row[] {
  return rows.map((row) => {
    const resultado: Row = { ...row };
    for (const [campo, map] of Object.entries(maps)) {
      const id = row[`${campo}_id`];
      if (id) resultado[campo] = map.get(texto(id)) ?? "Não localizado";
    }
    return resultado;
  });
}

function colunasDeLinhas(rows: Row[]): Column[] {
  const chaves = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return chaves.map((key) => ({
    key,
    label: labelCampo(key),
    width: key === "id" || key.endsWith("_id") ? 40 : key.includes("observ") || key === "descricao" ? 42 : 20,
    number: ["quantidade", "estoque_minimo", "quantidade_sistema", "quantidade_contada", "valor_total", "valor_unitario", "devolvido", "baixado", "tamanho"].includes(key),
    align: ["quantidade", "estoque_minimo", "quantidade_sistema", "quantidade_contada", "valor_total", "valor_unitario", "devolvido", "baixado", "tamanho"].includes(key) ? "right" : "left",
  }));
}

export async function exportarProjetoParaExcel(projetoId: string): Promise<void> {
  type TabelaNome = (typeof TABELAS)[number];
  const tabelas = {} as Record<TabelaNome, Row[]>;

  for (const nome of TABELAS) {
    tabelas[nome] = await lerTabela(nome);
  }

  const projetos = tabelas.projetos.filter((row) => texto(row.id) === projetoId);
  const projeto = projetos[0];
  if (!projeto) throw new Error("Projeto ativo não encontrado.");

  const filtrarProjeto = (rows: Row[]) => rows.filter((row) => texto(row.projeto_id) === projetoId);

  const empresas = filtrarProjeto(tabelas.empresas);
  const funcionarios = filtrarProjeto(tabelas.funcionarios);
  const locais = filtrarProjeto(tabelas.locais);
  const produtos = filtrarProjeto(tabelas.produtos);
  const equipes = filtrarProjeto(tabelas.equipes);
  const movimentacoes = filtrarProjeto(tabelas.movimentacoes);
  const categoriasEquipamentos = filtrarProjeto(tabelas.categorias_equipamentos);
  const equipamentos = filtrarProjeto(tabelas.equipamentos);
  const estoqueEquipamentos = filtrarProjeto(tabelas.estoque_equipamentos);
  const movimentacoesEquipamentos = filtrarProjeto(tabelas.movimentacoes_equipamentos);
  const documentos = filtrarProjeto(tabelas.documentos);
  const inventarios = filtrarProjeto(tabelas.inventarios);
  const arquivos = filtrarProjeto(tabelas.arquivos);
  const configuracoes = filtrarProjeto(tabelas.configuracoes);

  const empresaMap = new Map(empresas.map((row) => [texto(row.id), texto(row.nome)]));
  const funcionarioMap = new Map(funcionarios.map((row) => [texto(row.id), texto(row.nome)]));
  const localMap = new Map(locais.map((row) => [texto(row.id), texto(row.nome)]));
  const produtoMap = new Map(produtos.map((row) => [texto(row.id), texto(row.nome)]));
  const equipeMap = new Map(equipes.map((row) => [texto(row.id), texto(row.nome)]));
  const unidadeMap = new Map(tabelas.unidades.map((row) => [texto(row.id), texto(row.sigla)]));
  const categoriaMap = new Map(tabelas.categorias.map((row) => [texto(row.id), texto(row.nome)]));
  const categoriaEquipamentoMap = new Map(categoriasEquipamentos.map((row) => [texto(row.id), texto(row.nome)]));
  const equipamentoMap = new Map(equipamentos.map((row) => [texto(row.id), texto(row.nome)]));
  const documentoMap = new Map(documentos.map((row) => [texto(row.id), `${texto(row.tipo)} · ${texto(row.numero)}`]));

  const membros = tabelas.equipe_membros.filter((row) => equipeMap.has(texto(row.equipe_id)));
  const itensDocumentos = tabelas.documento_itens.filter((row) => documentoMap.has(texto(row.documento_id)));
  const referenciasDocumentos = tabelas.documento_referencias.filter((row) => texto(row.projeto_id) === projetoId);
  const itensInventarios = tabelas.inventario_itens.filter((row) => inventarios.some((item) => texto(item.id) === texto(row.inventario_id)));
  const apropriacoes = tabelas.apropriacoes.filter((row) => estoqueEquipamentos.some((item) => texto(item.id) === texto(row.estoque_equipamento_id)));

  const folhas: Array<{ nome: string; data: Row[]; columns: Column[] }> = [];
  const adicionar = (nome: string, data: Row[], columns?: Column[]) => {
    folhas.push({ nome, data, columns: columns ?? colunasDeLinhas(data) });
  };

  adicionar("Projeto", [{
    id: texto(projeto.id), codigo: texto(projeto.codigo), nome: texto(projeto.nome),
    empresa_id: texto(projeto.empresa_id), empresa: empresaMap.get(texto(projeto.empresa_id)) ?? "",
    status: texto(projeto.status), data_inicio: texto(projeto.data_inicio), data_fim: texto(projeto.data_fim),
    observacao: texto(projeto.observacao),
  }]);

  const simples: Array<[string, Row[], Record<string, string>]> = [
    ["Categorias", tabelas.categorias, {}],
    ["Unidades", tabelas.unidades, {}],
    ["Empresas", empresas, {}],
    ["Funcionários", adicionarNomes(funcionarios, { empresa: empresaMap, encarregado: funcionarioMap, equipe_raiz: equipeMap }), {}],
    ["Locais", adicionarNomes(locais, { local_pai: localMap }), {}],
    ["Produtos", adicionarNomes(produtos, { categoria: categoriaMap, unidade: unidadeMap }), {}],
    ["Equipes", equipes, {}],
    ["Membros Equipes", adicionarNomes(membros, { equipe: equipeMap, funcionario: funcionarioMap }), {}],
    ["Cat. Equipamentos", categoriasEquipamentos, {}],
    ["Equipamentos", adicionarNomes(equipamentos, { categoria: categoriaEquipamentoMap }), {}],
    ["Estoque Equip.", adicionarNomes(estoqueEquipamentos, { equipamento: equipamentoMap, empresa: empresaMap, equipe: equipeMap }), {}],
    ["Apropriações", adicionarNomes(apropriacoes, { funcionario: funcionarioMap }), {}],
    ["Documentos", adicionarNomes(documentos, { empresa: empresaMap }), {}],
    ["Itens Documentos", adicionarNomes(itensDocumentos, { documento: documentoMap, produto: produtoMap }), {}],
    ["Ref. Documentos", adicionarNomes(referenciasDocumentos, { documento: documentoMap, documento_referenciado: documentoMap }), {}],
    ["Inventários", adicionarNomes(inventarios, { equipe: equipeMap, responsavel: funcionarioMap }), {}],
    ["Itens Inventário", adicionarNomes(itensInventarios, { produto: produtoMap, equipe: equipeMap }), {}],
    ["Arquivos", arquivos, {}],
  ];

  for (const [nome, rows] of simples) adicionar(nome, rows);

  const movimentosLegiveis = adicionarNomes(movimentacoes, {
    produto: produtoMap, equipe: equipeMap, funcionario: funcionarioMap, encarregado: funcionarioMap,
    empresa: empresaMap, local: localMap, local_destino: localMap,
  });
  adicionar("Movimentações", movimentosLegiveis.map((row) => ({
    ...row,
    quantidade: efeitoMovimento(row),
    unidade: unidadeMap.get(texto(produtos.find((p) => texto(p.id) === texto(row.produto_id))?.unidade_id)) ?? "",
  })));

  const movEquip = adicionarNomes(movimentacoesEquipamentos, {
    estoque_equipamento: equipamentoMap,
    funcionario: funcionarioMap,
    equipe: equipeMap,
    empresa: empresaMap,
  });
  adicionar("Mov. Equipamentos", movEquip);

  const saldo = new Map<string, number>();
  for (const movimento of movimentacoes) {
    const chave = `${texto(movimento.produto_id)}:${texto(movimento.equipe_id)}`;
    saldo.set(chave, (saldo.get(chave) ?? 0) + efeitoMovimento(movimento));
  }
  const estoqueAtual: Row[] = [...saldo.entries()].map(([indice, quantidade]) => {
    const partes = indice.split(":");
    const produtoId = partes[0] ?? "";
    const equipeId = partes[1] ?? "";
    const produto = produtos.find((row) => texto(row.id) === produtoId);
    const minimo = numero(produto?.estoque_minimo);
    return {
      indice_estoque: indice,
      produto_id: produtoId,
      produto: produtoMap.get(produtoId) ?? "",
      codigo: texto(produto?.codigo),
      equipe_id: equipeId,
      equipe: equipeMap.get(equipeId) ?? "",
      unidade: unidadeMap.get(texto(produto?.unidade_id)) ?? "",
      estoque_minimo: minimo,
      saldo: quantidade,
      status: minimo > 0 && quantidade < minimo ? "BAIXO" : "OK",
    };
  });
  adicionar("Estoque Atual", estoqueAtual);

  const configuracaoRows: Row[] = [];
  for (const configuracao of configuracoes) {
    for (const [grupo, valor] of [
      ["MÓDULOS", configuracao.modulos],
      ["DOCUMENTOS", configuracao.documentos],
      ["ESTOQUE", configuracao.estoque],
      ["INVENTÁRIO", configuracao.inventario],
    ] as const) {
      if (!valor || typeof valor !== "object") continue;
      for (const [campo, valorCampo] of Object.entries(valor)) {
        configuracaoRows.push({ projeto_id: texto(configuracao.projeto_id), grupo, configuracao: campo, valor: texto(valorCampo) });
      }
    }
    configuracaoRows.push({ projeto_id: texto(configuracao.projeto_id), grupo: "GERAL", configuracao: "casas_decimais", valor: texto(configuracao.casas_decimais) });
  }
  adicionar("Configurações", configuracaoRows);

  const codigo = texto(projeto.codigo).replace(/[^a-zA-Z0-9]+/g, "_") || "PROJETO";

  const sheets: ExcelSheet[] = folhas.map((folha) => ({
    sheet: folha.nome.slice(0, 31),
    data: criarFolha(folha.data, folha.columns),
    columns: folha.columns.map((coluna) => ({ width: coluna.width ?? 18 })),
    stickyRowsCount: 1,
    orientation: "landscape",
  }));

  await writeExcelFile(sheets, {
    fontFamily: "Aptos",
    fontSize: 10,
  }).toFile(`EXPORTACAO_PROJETO_${codigo}.xlsx`);
}