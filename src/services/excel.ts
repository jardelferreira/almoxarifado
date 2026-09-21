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

/**
 * Importação da representação tabular do projeto.
 *
 * Regra central:
 * - Excel representa dados do projeto e pode recriá-lo.
 * - O projeto de destino é explícito.
 * - Registros do projeto de destino são SUBSTITUÍDOS, não mesclados.
 * - IDs da planilha são preservados.
 * - Categorias e unidades são catálogos globais e são mesclados por ID.
 *
 * Isso é importante para o domínio de equipamentos: deixar registros antigos
 * de equipes/estoques junto com os IDs da planilha pode fazer o estado do
 * equipamento resolver a equipe "Almoxarifado" errada e produzir erros como
 * "BAIXA deve partir do Almoxarifado ou da Manutenção".
 */

export const TABELAS_IMPORTACAO = [
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

const ABA_PARA_TABELA: Record<string, string> = {
  APROPRIACOES_FINANCEIRAS_EQUIPA:
    "apropriacoes_financeiras_equipamentos",
};

const TABELAS_GLOBAIS = new Set(["categorias", "unidades"]);

type Linha = Record<string, unknown>;

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

  /**
   * Todas as tabelas reconhecidas. As linhas são mantidas com os campos
   * originais para que módulos novos não sejam descartados pela importação.
   */
  tabelas: Record<string, Linha[]>;
  contagens: Record<string, number>;
  problemas: string[];
}

const S = (valor: unknown): string =>
  valor === undefined || valor === null ? "" : String(valor).trim();

const B = (valor: unknown): boolean => {
  if (typeof valor === "boolean") return valor;

  const s = S(valor).toUpperCase();

  return ["1", "SIM", "TRUE", "VERDADEIRO", "ATIVO", "S", "YES"].includes(
    s,
  );
};

const N = (valor: unknown): number => {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : 0;
  }

  const s = S(valor)
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const numero = Number(s);
  return Number.isFinite(numero) ? numero : 0;
};

const D = (valor: unknown): string => {
  if (valor instanceof Date) {
    return valor.toISOString();
  }

  if (typeof valor === "number") {
    const d = XLSX.SSF.parse_date_code(valor);

    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(
        2,
        "0",
      )}`;
    }
  }

  const s = S(valor);

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s;
  }

  return "";
};

const CAMPOS_JSON = new Set([
  "modulos",
  "documentos",
  "estoque",
  "inventario",
  "equipamentos",
]);

const CAMPOS_BOOLEANOS = new Set([
  "ativo",
  "habilitado",
  "exigir_na_entrada",
  "exigir_na_saida",
  "exigir_na_transferencia",
  "exigir_na_devolucao",
  "exigir_no_ajuste",
  "permitir_estoque_negativo",
  "permitir_ajustes",
  "exigir_justificativa_ajuste",
  "permitir_inventario_parcial",
  "exigir_responsavel",
  "ajustar_automaticamente",
]);

function normalizarValorCampo(
  campo: string,
  valor: unknown,
): unknown {
  const nome = campo.toLowerCase();

  if (valor === "" || valor === undefined) {
    return null;
  }

  if (CAMPOS_JSON.has(nome) && typeof valor === "string") {
    try {
      return JSON.parse(valor);
    } catch {
      return valor;
    }
  }

  if (CAMPOS_BOOLEANOS.has(nome)) {
    return B(valor);
  }

  return valor;
}

function lerAba(
  workbook: XLSX.WorkBook,
  nomeAba: string,
): Linha[] {
  const worksheet = workbook.Sheets[nomeAba];

  if (!worksheet) {
    return [];
  }

  const linhas = XLSX.utils.sheet_to_json<Linha>(worksheet, {
    defval: "",
    raw: true,
  });

  return linhas
    .map((linha) => {
      const resultado: Linha = {};

      for (const [campo, valor] of Object.entries(linha)) {
        const chave = S(campo).toLowerCase();

        if (!chave) continue;

        resultado[chave] = normalizarValorCampo(chave, valor);
      }

      return resultado;
    })
    .filter((linha) =>
      Object.values(linha).some(
        (valor) => valor !== null && valor !== "",
      ),
    );
}

function obterAba(
  workbook: XLSX.WorkBook,
  tabela: string,
): Linha[] {
  const nomePrincipal = tabela.toUpperCase();
  const linhasPrincipais = lerAba(workbook, nomePrincipal);

  if (linhasPrincipais.length > 0) {
    return linhasPrincipais;
  }

  const alias = Object.entries(ABA_PARA_TABELA).find(
    ([, tabelaInterna]) => tabelaInterna === tabela,
  )?.[0];

  return alias ? lerAba(workbook, alias) : [];
}

function projetoDeLinha(linha: Linha): Projeto {
  return {
    id: S(linha["id"]) || uid(),
    codigo: S(linha["codigo"]),
    nome:
      S(linha["nome"]) ||
      S(linha["codigo"]) ||
      "Projeto importado",
    empresa_id: S(linha["empresa_id"]) || null,
    status: (
      S(linha["status"]).toUpperCase() || "ATIVO"
    ) as Projeto["status"],
    data_inicio: D(linha["data_inicio"]) || null,
    data_fim: D(linha["data_fim"]) || null,
    observacao: S(linha["observacao"]) || null,
  };
}

function categoriaDeLinha(linha: Linha): Categoria {
  return {
    id: S(linha["id"]) || uid(),
    nome: S(linha["nome"]),
    ativo: B(linha["ativo"]),
  };
}

function unidadeDeLinha(linha: Linha): Unidade {
  return {
    id: S(linha["id"]) || uid(),
    sigla: S(linha["sigla"]),
    descricao: S(linha["descricao"]),
    ativo: B(linha["ativo"]),
  };
}

function empresaDeLinha(linha: Linha): Empresa {
  return {
    id: S(linha["id"]) || uid(),
    projeto_id: S(linha["projeto_id"]),
    nome: S(linha["nome"]),
    tipo: (
      S(linha["tipo"]).toUpperCase().startsWith("PR")
        ? "PROPRIA"
        : S(linha["tipo"]).toUpperCase().startsWith("FO")
          ? "FORNECEDOR"
          : "TERCEIRA"
    ) as Empresa["tipo"],
    ativo: B(linha["ativo"]),
  };
}

function funcionarioDeLinha(linha: Linha): Funcionario {
  return {
    id: S(linha["id"]) || uid(),
    projeto_id: S(linha["projeto_id"]),
    matricula: S(linha["matricula"]) || null,
    nome: S(linha["nome"]),
    funcao: S(linha["funcao"]) || null,
    encarregado_id: S(linha["encarregado_id"]) || null,
    empresa_id: S(linha["empresa_id"]) || null,
    equipe_raiz_id: S(linha["equipe_raiz_id"]) || null,
    status: (
      S(linha["status"]).toUpperCase() === "INATIVO"
        ? "INATIVO"
        : "ATIVO"
    ) as Funcionario["status"],
  };
}

function localDeLinha(linha: Linha): Local {
  return {
    id: S(linha["id"]) || uid(),
    projeto_id: S(linha["projeto_id"]),
    codigo: S(linha["codigo"]) || null,
    nome: S(linha["nome"]),
    local_pai_id: S(linha["local_pai_id"]) || null,
    ativo: B(linha["ativo"]),
  };
}

function produtoDeLinha(linha: Linha): Produto {
  return {
    id: S(linha["id"]) || uid(),
    projeto_id: S(linha["projeto_id"]),
    codigo: S(linha["codigo"]) || null,
    nome: S(linha["nome"]),
    descricao: S(linha["descricao"]) || null,
    categoria_id: S(linha["categoria_id"]) || null,
    unidade_id: S(linha["unidade_id"]) || null,
    marca: S(linha["marca"]) || null,
    modelo: S(linha["modelo"]) || null,
    estoque_minimo: N(linha["estoque_minimo"]),
    ativo: B(linha["ativo"]),
  };
}

function equipeDeLinha(linha: Linha): Equipe {
  return {
    id: S(linha["id"]) || uid(),
    projeto_id: S(linha["projeto_id"]),
    nome: S(linha["nome"]),
    descricao: S(linha["descricao"]) || null,
    ativo: B(linha["ativo"]),
    estoque_segregado: B(linha["estoque_segregado"]),
  };
}

function equipeMembroDeLinha(linha: Linha): EquipeMembro {
  return {
    id: S(linha["id"]) || uid(),
    equipe_id: S(linha["equipe_id"]),
    funcionario_id: S(linha["funcionario_id"]),
  };
}

function movimentacaoDeLinha(linha: Linha): Movimentacao {
  const quantidadeOriginal = N(linha["quantidade"]);

  return {
    id: S(linha["id"]) || uid(),
    projeto_id: S(linha["projeto_id"]),
    data: D(linha["data"]),
    tipo: (
      S(linha["tipo"]).toUpperCase() || "SAIDA"
    ) as Movimentacao["tipo"],
    produto_id: S(linha["produto_id"]),
    quantidade: Math.abs(quantidadeOriginal),
    sinal: quantidadeOriginal < 0 ? -1 : 1,
    funcionario_id: S(linha["funcionario_id"]) || null,
    encarregado_id: S(linha["encarregado_id"]) || null,
    empresa_id: S(linha["empresa_id"]) || null,
    local_id: S(linha["local_id"]) || null,
    observacao: S(linha["observacao"]) || null,
    equipe_id: S(linha["equipe_id"]),
  };
}

function validarDuplicados(
  problemas: string[],
  tabelas: Record<string, Linha[]>,
): void {
  for (const [tabela, linhas] of Object.entries(tabelas)) {
    const ids = new Set<string>();

    for (const linha of linhas) {
      const id = S(linha["id"]);

      if (!id) continue;

      if (ids.has(id)) {
        problemas.push(`${tabela}: ID duplicado ${id}`);
      }

      ids.add(id);
    }
  }
}

function validarReferencias(
  problemas: string[],
  tabelas: Record<string, Linha[]>,
): void {
  const ids = (tabela: string) =>
    new Set(
      (tabelas[tabela] ?? [])
        .map((linha) => S(linha["id"]))
        .filter(Boolean),
    );

  const produtos = ids("produtos");
  const funcionarios = ids("funcionarios");
  const empresas = ids("empresas");
  const equipes = ids("equipes");
  const locais = ids("locais");
  const equipamentos = ids("equipamentos");
  const estoquesEquipamentos = ids("estoque_equipamentos");
  const documentos = ids("documentos");
  const inventarios = ids("inventarios");
  const manutencoes = ids("manutencoes_equipamentos");
  const unidades = ids("unidades");

  for (const [index, linha] of (
    tabelas["movimentacoes"] ?? []
  ).entries()) {
    if (!produtos.has(S(linha["produto_id"]))) {
      problemas.push(
        `movimentacoes[${index}]: produto_id inexistente`,
      );
    }

    if (
      S(linha["funcionario_id"]) &&
      !funcionarios.has(S(linha["funcionario_id"]))
    ) {
      problemas.push(
        `movimentacoes[${index}]: funcionario_id inexistente`,
      );
    }

    if (
      S(linha["empresa_id"]) &&
      !empresas.has(S(linha["empresa_id"]))
    ) {
      problemas.push(
        `movimentacoes[${index}]: empresa_id inexistente`,
      );
    }

    if (
      S(linha["equipe_id"]) &&
      !equipes.has(S(linha["equipe_id"]))
    ) {
      problemas.push(
        `movimentacoes[${index}]: equipe_id inexistente`,
      );
    }

    if (
      S(linha["local_id"]) &&
      !locais.has(S(linha["local_id"]))
    ) {
      problemas.push(
        `movimentacoes[${index}]: local_id inexistente`,
      );
    }
  }

  for (const [index, linha] of (
    tabelas["equipamentos"] ?? []
  ).entries()) {
    if (
      S(linha["categoria_id"]) &&
      !ids("categorias_equipamentos").has(
        S(linha["categoria_id"]),
      )
    ) {
      problemas.push(
        `equipamentos[${index}]: categoria_id inexistente`,
      );
    }
  }

  for (const [index, linha] of (
    tabelas["estoque_equipamentos"] ?? []
  ).entries()) {
    if (!equipamentos.has(S(linha["equipamento_id"]))) {
      problemas.push(
        `estoque_equipamentos[${index}]: equipamento_id inexistente`,
      );
    }

    if (!empresas.has(S(linha["empresa_id"]))) {
      problemas.push(
        `estoque_equipamentos[${index}]: empresa_id inexistente`,
      );
    }

    if (
      S(linha["equipe_id"]) &&
      !equipes.has(S(linha["equipe_id"]))
    ) {
      problemas.push(
        `estoque_equipamentos[${index}]: equipe_id inexistente`,
      );
    }
  }

  for (const [index, linha] of (
    tabelas["movimentacoes_equipamentos"] ?? []
  ).entries()) {
    if (
      !estoquesEquipamentos.has(
        S(linha["estoque_equipamento_id"]),
      )
    ) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: estoque_equipamento_id inexistente`,
      );
    }

    const tipo = S(linha["tipo"]).toUpperCase();
    const origem = S(linha["tipo_origem"]).toUpperCase();
    const destino = S(linha["tipo_destino"]).toUpperCase();
    const origemId = S(linha["origem_id"]);
    const destinoId = S(linha["destino_id"]);

    if (
      !["ENTRADA", "SAIDA", "DEVOLUCAO", "TRANSFERENCIA",
        "SINALIZAR_MANUTENCAO", "MANUTENCAO", "ENVIO",
        "RETIRADA_MANUTENCAO", "RETORNO_MANUTENCAO",
        "BAIXA", "DEVOLUCAO_FORNECEDOR", "REENTRADA"].includes(
        tipo,
      )
    ) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: tipo inválido (${tipo})`,
      );
      continue;
    }

    if (!["EMPRESA", "EQUIPE", "FUNCIONARIO"].includes(origem)) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: tipo_origem inválido (${origem})`,
      );
    }

    if (!["EMPRESA", "EQUIPE", "FUNCIONARIO"].includes(destino)) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: tipo_destino inválido (${destino})`,
      );
    }

    if (tipo === "BAIXA") {
      if (origem !== "EQUIPE") {
        problemas.push(
          `movimentacoes_equipamentos[${index}]: BAIXA deve partir de uma equipe`,
        );
      }

      const equipesAlmox = (tabelas["equipes"] ?? []).filter(
        (equipe) =>
          normalizar(S(equipe["nome"])) === "ALMOXARIFADO",
      );
      const equipesManutencao = (
        tabelas["equipes"] ?? []
      ).filter(
        (equipe) =>
          normalizar(S(equipe["nome"])) === "MANUTENCAO",
      );

      const idsPermitidos = new Set([
        ...equipesAlmox.map((equipe) => S(equipe["id"])),
        ...equipesManutencao.map((equipe) => S(equipe["id"])),
      ]);

      if (!idsPermitidos.has(origemId)) {
        problemas.push(
          `movimentacoes_equipamentos[${index}]: BAIXA deve partir do Almoxarifado ou da Manutenção`,
        );
      }

      if (destino !== "EMPRESA" || !empresas.has(destinoId)) {
        problemas.push(
          `movimentacoes_equipamentos[${index}]: BAIXA deve ter uma empresa como destino`,
        );
      }
    }

    if (
      tipo === "ENTRADA" &&
      (origem !== "EMPRESA" ||
        destino !== "EQUIPE")
    ) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: ENTRADA deve ser Empresa → Equipe`,
      );
    }

    if (
      tipo === "SAIDA" &&
      (origem !== "EQUIPE" ||
        destino !== "FUNCIONARIO")
    ) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: SAIDA deve ser Almoxarifado → Funcionário`,
      );
    }

    if (
      tipo === "DEVOLUCAO" &&
      (origem !== "FUNCIONARIO" ||
        destino !== "EQUIPE")
    ) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: DEVOLUCAO deve ser Funcionário → Equipe`,
      );
    }

    if (
      tipo === "TRANSFERENCIA" &&
      (origem !== "FUNCIONARIO" ||
        destino !== "FUNCIONARIO" ||
        origemId === destinoId)
    ) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: TRANSFERENCIA deve ser Funcionário → Funcionário com participantes diferentes`,
      );
    }

    if (
      tipo === "RETORNO_MANUTENCAO" &&
      (destino !== "EQUIPE")
    ) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: RETORNO_MANUTENCAO deve retornar para uma equipe`,
      );
    }

    if (
      tipo === "DEVOLUCAO_FORNECEDOR" &&
      (origem !== "EQUIPE" ||
        destino !== "EMPRESA")
    ) {
      problemas.push(
        `movimentacoes_equipamentos[${index}]: DEVOLUCAO_FORNECEDOR deve ser Equipe → Empresa`,
      );
    }
  }

  for (const [index, linha] of (
    tabelas["apropriacoes"] ?? []
  ).entries()) {
    if (
      !estoquesEquipamentos.has(
        S(linha["estoque_equipamento_id"]),
      )
    ) {
      problemas.push(
        `apropriacoes[${index}]: estoque_equipamento_id inexistente`,
      );
    }

    if (
      !funcionarios.has(S(linha["funcionario_id"]))
    ) {
      problemas.push(
        `apropriacoes[${index}]: funcionario_id inexistente`,
      );
    }
  }

  for (const [index, linha] of (
    tabelas["documento_itens"] ?? []
  ).entries()) {
    if (!documentos.has(S(linha["documento_id"]))) {
      problemas.push(
        `documento_itens[${index}]: documento_id inexistente`,
      );
    }

    if (!produtos.has(S(linha["produto_id"]))) {
      problemas.push(
        `documento_itens[${index}]: produto_id inexistente`,
      );
    }

    if (
      S(linha["equipe_destino_id"]) &&
      !equipes.has(S(linha["equipe_destino_id"]))
    ) {
      problemas.push(
        `documento_itens[${index}]: equipe_destino_id inexistente`,
      );
    }
  }

  for (const [index, linha] of (
    tabelas["inventario_itens"] ?? []
  ).entries()) {
    if (!inventarios.has(S(linha["inventario_id"]))) {
      problemas.push(
        `inventario_itens[${index}]: inventario_id inexistente`,
      );
    }

    if (!produtos.has(S(linha["produto_id"]))) {
      problemas.push(
        `inventario_itens[${index}]: produto_id inexistente`,
      );
    }

    if (
      S(linha["equipe_id"]) &&
      !equipes.has(S(linha["equipe_id"]))
    ) {
      problemas.push(
        `inventario_itens[${index}]: equipe_id inexistente`,
      );
    }
  }

  for (const [index, linha] of (
    tabelas["manutencoes_equipamentos"] ?? []
  ).entries()) {
    if (
      !estoquesEquipamentos.has(
        S(linha["estoque_equipamento_id"]),
      )
    ) {
      problemas.push(
        `manutencoes_equipamentos[${index}]: estoque_equipamento_id inexistente`,
      );
    }

    if (
      !equipamentos.has(S(linha["equipamento_id"]))
    ) {
      problemas.push(
        `manutencoes_equipamentos[${index}]: equipamento_id inexistente`,
      );
    }

    if (
      S(linha["empresa_id"]) &&
      !empresas.has(S(linha["empresa_id"]))
    ) {
      problemas.push(
        `manutencoes_equipamentos[${index}]: empresa_id inexistente`,
      );
    }
  }

  for (const [index, linha] of (
    tabelas["regras_consumo_equipamentos"] ?? []
  ).entries()) {
    if (
      !equipamentos.has(S(linha["equipamento_id"]))
    ) {
      problemas.push(
        `regras_consumo_equipamentos[${index}]: equipamento_id inexistente`,
      );
    }

    if (!produtos.has(S(linha["produto_id"]))) {
      problemas.push(
        `regras_consumo_equipamentos[${index}]: produto_id inexistente`,
      );
    }

    if (
      !unidades.has(S(linha["unidade_base_id"])) ||
      !unidades.has(S(linha["unidade_consumo_id"]))
    ) {
      problemas.push(
        `regras_consumo_equipamentos[${index}]: unidade de referência inexistente`,
      );
    }
  }

  void manutencoes;
}

export function lerArquivo(
  buffer: ArrayBuffer,
): DatasetImportado {
  const workbook = XLSX.read(buffer, {
    cellDates: true,
  });

  const tabelas: Record<string, Linha[]> = {};

  for (const tabela of TABELAS_IMPORTACAO) {
    tabelas[tabela] = obterAba(workbook, tabela);
  }

  const problemas: string[] = [];

  const projetos = (tabelas["projetos"] ?? []).map(
    projetoDeLinha,
  );

  const categorias = (tabelas["categorias"] ?? []).map(
    categoriaDeLinha,
  );

  const unidades = (tabelas["unidades"] ?? []).map(
    unidadeDeLinha,
  );

  const empresas = (tabelas["empresas"] ?? []).map(
    empresaDeLinha,
  );

  const funcionarios = (
    tabelas["funcionarios"] ?? []
  ).map(funcionarioDeLinha);

  const locais = (tabelas["locais"] ?? []).map(localDeLinha);

  const produtos = (tabelas["produtos"] ?? []).map(
    produtoDeLinha,
  );

  const equipes = (tabelas["equipes"] ?? []).map(
    equipeDeLinha,
  );

  const equipeMembros = (
    tabelas["equipe_membros"] ?? []
  ).map(equipeMembroDeLinha);

  const movimentacoes = (
    tabelas["movimentacoes"] ?? []
  ).map(movimentacaoDeLinha);

  if (projetos.length !== 1) {
    problemas.push(
      `A planilha deve conter exatamente 1 projeto. Encontrados: ${projetos.length}.`,
    );
  }

  validarDuplicados(problemas, tabelas);
  validarReferencias(problemas, tabelas);

  const nomesEmpresas = new Map<string, number>();
  for (const empresa of empresas) {
    const chave = normalizar(empresa.nome);
    nomesEmpresas.set(
      chave,
      (nomesEmpresas.get(chave) ?? 0) + 1,
    );
  }

  const duplicidadesEmpresas = [...nomesEmpresas.values()].filter(
    (quantidade) => quantidade > 1,
  ).length;

  if (duplicidadesEmpresas > 0) {
    problemas.push(
      `Empresas: ${duplicidadesEmpresas} possível(is) duplicidade(s) por nome`,
    );
  }

  const nomesProdutos = new Map<string, number>();
  for (const produto of produtos) {
    const chave = normalizar(produto.nome);
    nomesProdutos.set(
      chave,
      (nomesProdutos.get(chave) ?? 0) + 1,
    );
  }

  const duplicidadesProdutos = [...nomesProdutos.values()].filter(
    (quantidade) => quantidade > 1,
  ).length;

  if (duplicidadesProdutos > 0) {
    problemas.push(
      `Produtos: ${duplicidadesProdutos} possível(is) duplicidade(s) por nome`,
    );
  }

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
    tabelas,
    contagens: Object.fromEntries(
      TABELAS_IMPORTACAO.map((tabela) => [
        tabela,
        (tabelas[tabela] ?? []).length,
      ]),
    ),
    problemas,
  };
}

type RegistroComId = { id?: unknown };

/**
 * Mantém o tipo da entidade recebida. O importador trabalha com entidades
 * tipadas (Produto, Equipe, Equipamento, etc.) e também com linhas dinâmicas
 * das abas novas. Não convertemos as entidades tipadas para Record<string,
 * unknown>, pois isso provoca TS2345 no strict mode.
 */
function comProjeto<T extends object>(
  linhas: T[],
  projetoId: string,
): T[] {
  return linhas.map((linha) => {
    if (Object.prototype.hasOwnProperty.call(linha, "projeto_id")) {
      return { ...linha, projeto_id: projetoId } as T;
    }

    return linha;
  });
}

/** Extrai IDs sem exigir que a entidade tenha index signature. */
function idsDosRegistros<T extends RegistroComId>(
  linhas: T[],
): Set<string> {
  return new Set(
    linhas
      .map((linha) => S(linha.id))
      .filter(Boolean),
  );
}

/**
 * Grava uma tabela cujo nome é resolvido em runtime. O cast fica isolado
 * neste boundary porque Dexie não consegue inferir o tipo da tabela a partir
 * de uma string dinâmica. As entidades tipadas continuam intactas no resto
 * do fluxo.
 */
async function bulkPutTabela(
  tabela: string,
  linhas: Linha[],
): Promise<void> {
  if (linhas.length === 0) return;

  const db = getDB();
  await db.table(tabela).bulkPut(linhas as any[]);
}

async function apagarFilhosPorIds(
  tabela: string,
  campo: string,
  ids: Set<string>,
): Promise<void> {
  if (ids.size === 0) return;

  const db = getDB();
  const registros = await db.table(tabela).toArray();

  const removerIds = registros
    .filter((registro: Linha) =>
      ids.has(S(registro[campo])),
    )
    .map((registro: Linha) => S(registro["id"]))
    .filter(Boolean);

  if (removerIds.length > 0) {
    await db.table(tabela).bulkDelete(removerIds);
  }
}

/**
 * Substitui integralmente o conteúdo do projeto ativo.
 *
 * Esta é a correção mais importante em relação ao importador anterior:
 * não fazemos mais bulkPut por cima do projeto existente. Antes de gravar
 * a planilha, removemos os registros antigos do projeto e suas relações
 * sem projeto_id (apropriações, itens de documentos, itens de inventário
 * e membros de equipe).
 */
export async function salvarDataset(
  dataset: DatasetImportado,
  projetoId?: string,
): Promise<void> {
  const projetoOrigem = dataset.projetos[0];

  if (!projetoOrigem) {
    throw new Error(
      "A planilha não contém um projeto para importar.",
    );
  }

  if (dataset.problemas.length > 0) {
    throw new Error(
      `A planilha possui inconsistências e não pode ser importada:\n• ${dataset.problemas.join(
        "\n• ",
      )}`,
    );
  }

  const destinoId = projetoId || projetoOrigem.id;

  if (!destinoId) {
    throw new Error(
      "Não foi possível determinar o projeto de destino.",
    );
  }

  const db = getDB();

  /*
   * O projeto de destino pode existir com IDs diferentes dos dados
   * presentes na planilha. Isso é normal quando usamos a planilha para
   * carregar um projeto em um projeto ativo.
   */
  const projetoDestino: Projeto = {
    ...projetoOrigem,
    id: destinoId,
  };

  const empresas = comProjeto(
    dataset.empresas.map((linha) => ({ ...linha })),
    destinoId,
  );

  const funcionarios = comProjeto(
    dataset.funcionarios.map((linha) => ({ ...linha })),
    destinoId,
  );

  const locais = comProjeto(
    dataset.locais.map((linha) => ({ ...linha })),
    destinoId,
  );

  const produtos = comProjeto(
    dataset.produtos.map((linha) => ({ ...linha })),
    destinoId,
  );

  const equipes = comProjeto(
    dataset.equipes.map((linha) => ({ ...linha })),
    destinoId,
  );

  const categoriasEquipamentos = comProjeto(
    dataset.tabelas["categorias_equipamentos"] ?? [],
    destinoId,
  );

  const arquivos = comProjeto(
    dataset.tabelas["arquivos"] ?? [],
    destinoId,
  );

  const equipamentos = comProjeto(
    dataset.tabelas["equipamentos"] ?? [],
    destinoId,
  );

  const estoqueEquipamentos = comProjeto(
    dataset.tabelas["estoque_equipamentos"] ?? [],
    destinoId,
  );

  const movimentacoesEquipamentos = comProjeto(
    dataset.tabelas["movimentacoes_equipamentos"] ?? [],
    destinoId,
  );

  const configuracoes = comProjeto(
    dataset.tabelas["configuracoes"] ?? [],
    destinoId,
  );

  const documentos = comProjeto(
    dataset.tabelas["documentos"] ?? [],
    destinoId,
  );

  const documentoReferencias = comProjeto(
    dataset.tabelas["documento_referencias"] ?? [],
    destinoId,
  );

  const inventarios = comProjeto(
    dataset.tabelas["inventarios"] ?? [],
    destinoId,
  );

  const inteligenciaAcoes = comProjeto(
    dataset.tabelas["inteligencia_acoes"] ?? [],
    destinoId,
  );

  const manutencoes = comProjeto(
    dataset.tabelas["manutencoes_equipamentos"] ?? [],
    destinoId,
  );

  const manutencaoDocumentos = comProjeto(
    dataset.tabelas["manutencao_documentos"] ?? [],
    destinoId,
  );

  const apropriacoesFinanceiras = comProjeto(
    dataset.tabelas[
      "apropriacoes_financeiras_equipamentos"
    ] ?? [],
    destinoId,
  );

  const consumosEquipamentos = comProjeto(
    dataset.tabelas["consumos_equipamentos"] ?? [],
    destinoId,
  );

  const regrasConsumo = comProjeto(
    dataset.tabelas["regras_consumo_equipamentos"] ?? [],
    destinoId,
  );

  const perfisCustos = comProjeto(
    dataset.tabelas["perfis_parametros_custos"] ?? [],
    destinoId,
  );

  const movimentacoes = comProjeto(
    dataset.tabelas["movimentacoes"] ??
      dataset.movimentacoes.map((item) => ({ ...item })),
    destinoId,
  );

  const equipeMembros = dataset.equipeMembros.map((item) => ({
    ...item,
  }));

  const apropriacoes = (
    dataset.tabelas["apropriacoes"] ?? []
  ).map((linha) => ({ ...linha }));

  const documentoItens = (
    dataset.tabelas["documento_itens"] ?? []
  ).map((linha) => ({ ...linha }));

  const inventarioItens = (
    dataset.tabelas["inventario_itens"] ?? []
  ).map((linha) => ({ ...linha }));

  /*
   * IDs antigos que precisam ser removidos antes de substituir o projeto.
   */
  const [
    empresasAntigas,
    funcionariosAntigos,
    locaisAntigos,
    produtosAntigos,
    equipesAntigas,
    categoriasEquipamentosAntigas,
    arquivosAntigos,
    equipamentosAntigos,
    estoqueEquipamentosAntigos,
    movimentacoesEquipamentosAntigas,
    configuracoesAntigas,
    documentosAntigos,
    documentoReferenciasAntigas,
    inventariosAntigos,
    inteligenciaAcoesAntigas,
    manutencoesAntigas,
    manutencaoDocumentosAntigos,
    apropriacoesFinanceirasAntigas,
    consumosEquipamentosAntigos,
    regrasConsumoAntigas,
    perfisCustosAntigos,
    movimentacoesAntigas,
  ] = await Promise.all([
    db.empresas.where("projeto_id").equals(destinoId).toArray(),
    db.funcionarios.where("projeto_id").equals(destinoId).toArray(),
    db.locais.where("projeto_id").equals(destinoId).toArray(),
    db.produtos.where("projeto_id").equals(destinoId).toArray(),
    db.equipes.where("projeto_id").equals(destinoId).toArray(),
    db.categorias_equipamentos
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.arquivos.where("projeto_id").equals(destinoId).toArray(),
    db.equipamentos.where("projeto_id").equals(destinoId).toArray(),
    db.estoque_equipamentos
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.movimentacoes_equipamentos
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.configuracoes
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.documentos.where("projeto_id").equals(destinoId).toArray(),
    db.documento_referencias
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.inventarios
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.inteligencia_acoes
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.manutencoes_equipamentos
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.manutencao_documentos
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.apropriacoes_financeiras_equipamentos
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.consumos_equipamentos
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.regras_consumo_equipamentos
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.perfis_parametros_custos
      .where("projeto_id")
      .equals(destinoId)
      .toArray(),
    db.movimentacoes.where("projeto_id").equals(destinoId).toArray(),
  ]);

  const equipesAntigasIds = idsDosRegistros(equipesAntigas);
  const equipesNovasIds = idsDosRegistros(equipes);

  const estoqueAntigoIds = idsDosRegistros(
    estoqueEquipamentosAntigos,
  );
  const estoqueNovoIds = idsDosRegistros(
    estoqueEquipamentos,
  );

  const documentosAntigosIds = idsDosRegistros(
    documentosAntigos,
  );
  const documentosNovosIds = idsDosRegistros(documentos);

  const inventariosAntigosIds = idsDosRegistros(
    inventariosAntigos,
  );
  const inventariosNovosIds = idsDosRegistros(inventarios);

  /*
   * Todas as tabelas usadas na transação precisam ser incluídas.
   * O banco não possui FK relacional do IndexedDB; a integridade é
   * controlada pelo fluxo de domínio.
   */
  const tabelasTransacao = [
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
    db.categorias_equipamentos,
    db.arquivos,
    db.equipamentos,
    db.estoque_equipamentos,
    db.apropriacoes,
    db.movimentacoes_equipamentos,
    db.configuracoes,
    db.documentos,
    db.documento_itens,
    db.documento_referencias,
    db.inventarios,
    db.inventario_itens,
    db.inteligencia_acoes,
    db.manutencoes_equipamentos,
    db.manutencao_documentos,
    db.apropriacoes_financeiras_equipamentos,
    db.consumos_equipamentos,
    db.regras_consumo_equipamentos,
    db.perfis_parametros_custos,
  ];

  await db.transaction(
    "rw",
    tabelasTransacao,
    async () => {
      /*
       * 1. Apaga relações filhas sem projeto_id.
       *
       * Fazemos isso antes dos pais para não deixar apropriações,
       * itens ou membros apontando para registros antigos.
       */
      await apagarFilhosPorIds(
        "equipe_membros",
        "equipe_id",
        new Set([
          ...equipesAntigasIds,
          ...equipesNovasIds,
        ]),
      );

      await apagarFilhosPorIds(
        "apropriacoes",
        "estoque_equipamento_id",
        new Set([
          ...estoqueAntigoIds,
          ...estoqueNovoIds,
        ]),
      );

      await apagarFilhosPorIds(
        "documento_itens",
        "documento_id",
        new Set([
          ...documentosAntigosIds,
          ...documentosNovosIds,
        ]),
      );

      await apagarFilhosPorIds(
        "inventario_itens",
        "inventario_id",
        new Set([
          ...inventariosAntigosIds,
          ...inventariosNovosIds,
        ]),
      );

      /*
       * 2. Remove todo o conteúdo anterior do projeto.
       */
      const apagarPorId = async <T extends RegistroComId>(
        tabela: string,
        registros: T[],
      ): Promise<void> => {
        const ids = idsDosRegistros(registros);

        if (ids.size > 0) {
          await db.table(tabela).bulkDelete([...ids]);
        }
      };

      await apagarPorId("empresas", empresasAntigas);
      await apagarPorId("funcionarios", funcionariosAntigos);
      await apagarPorId("locais", locaisAntigos);
      await apagarPorId("produtos", produtosAntigos);
      await apagarPorId("equipes", equipesAntigas);
      await apagarPorId(
        "categorias_equipamentos",
        categoriasEquipamentosAntigas,
      );
      await apagarPorId("arquivos", arquivosAntigos);
      await apagarPorId("equipamentos", equipamentosAntigos);
      await apagarPorId(
        "estoque_equipamentos",
        estoqueEquipamentosAntigos,
      );
      await apagarPorId(
        "movimentacoes_equipamentos",
        movimentacoesEquipamentosAntigas,
      );
      await apagarPorId("configuracoes", configuracoesAntigas);
      await apagarPorId("documentos", documentosAntigos);
      await apagarPorId(
        "documento_referencias",
        documentoReferenciasAntigas,
      );
      await apagarPorId("inventarios", inventariosAntigos);
      await apagarPorId(
        "inteligencia_acoes",
        inteligenciaAcoesAntigas,
      );
      await apagarPorId(
        "manutencoes_equipamentos",
        manutencoesAntigas,
      );
      await apagarPorId(
        "manutencao_documentos",
        manutencaoDocumentosAntigos,
      );
      await apagarPorId(
        "apropriacoes_financeiras_equipamentos",
        apropriacoesFinanceirasAntigas,
      );
      await apagarPorId(
        "consumos_equipamentos",
        consumosEquipamentosAntigos,
      );
      await apagarPorId(
        "regras_consumo_equipamentos",
        regrasConsumoAntigas,
      );
      await apagarPorId(
        "perfis_parametros_custos",
        perfisCustosAntigos,
      );
      await apagarPorId(
        "movimentacoes",
        movimentacoesAntigas,
      );

      /*
       * 3. Projeto e catálogos globais.
       */
      await db.projetos.put(projetoDestino);

      if (dataset.categorias.length > 0) {
        await db.categorias.bulkPut(dataset.categorias);
      }

      if (dataset.unidades.length > 0) {
        await db.unidades.bulkPut(dataset.unidades);
      }

      /*
       * 4. Pais.
       */
      if (empresas.length > 0) {
        await db.empresas.bulkPut(empresas);
      }

      if (funcionarios.length > 0) {
        await db.funcionarios.bulkPut(funcionarios);
      }

      if (locais.length > 0) {
        await db.locais.bulkPut(locais);
      }

      if (produtos.length > 0) {
        await db.produtos.bulkPut(produtos);
      }

      if (equipes.length > 0) {
        await db.equipes.bulkPut(equipes);
      }

      if (categoriasEquipamentos.length > 0) {
        await bulkPutTabela(
          "categorias_equipamentos",
          categoriasEquipamentos,
        );
      }

      if (arquivos.length > 0) {
        await bulkPutTabela("arquivos", arquivos);
      }

      if (equipamentos.length > 0) {
        await bulkPutTabela("equipamentos", equipamentos);
      }

      if (estoqueEquipamentos.length > 0) {
        await bulkPutTabela(
          "estoque_equipamentos",
          estoqueEquipamentos,
        );
      }

      /*
       * 5. Relações e histórico.
       */
      if (equipeMembros.length > 0) {
        await db.equipe_membros.bulkPut(equipeMembros);
      }

      if (apropriacoes.length > 0) {
        await bulkPutTabela("apropriacoes", apropriacoes);
      }

      if (movimentacoes.length > 0) {
        await bulkPutTabela("movimentacoes", movimentacoes);
      }

      if (movimentacoesEquipamentos.length > 0) {
        await bulkPutTabela(
          "movimentacoes_equipamentos",
          movimentacoesEquipamentos,
        );
      }

      if (configuracoes.length > 0) {
        await bulkPutTabela("configuracoes", configuracoes);
      }

      if (documentos.length > 0) {
        await bulkPutTabela("documentos", documentos);
      }

      if (documentoItens.length > 0) {
        await bulkPutTabela("documento_itens", documentoItens);
      }

      if (documentoReferencias.length > 0) {
        await bulkPutTabela(
          "documento_referencias",
          documentoReferencias,
        );
      }

      if (inventarios.length > 0) {
        await bulkPutTabela("inventarios", inventarios);
      }

      if (inventarioItens.length > 0) {
        await bulkPutTabela("inventario_itens", inventarioItens);
      }

      if (inteligenciaAcoes.length > 0) {
        await bulkPutTabela(
          "inteligencia_acoes",
          inteligenciaAcoes,
        );
      }

      if (manutencoes.length > 0) {
        await bulkPutTabela(
          "manutencoes_equipamentos",
          manutencoes,
        );
      }

      if (manutencaoDocumentos.length > 0) {
        await bulkPutTabela(
          "manutencao_documentos",
          manutencaoDocumentos,
        );
      }

      if (apropriacoesFinanceiras.length > 0) {
        await bulkPutTabela(
          "apropriacoes_financeiras_equipamentos",
          apropriacoesFinanceiras,
        );
      }

      if (consumosEquipamentos.length > 0) {
        await bulkPutTabela(
          "consumos_equipamentos",
          consumosEquipamentos,
        );
      }

      if (regrasConsumo.length > 0) {
        await bulkPutTabela(
          "regras_consumo_equipamentos",
          regrasConsumo,
        );
      }

      if (perfisCustos.length > 0) {
        await bulkPutTabela(
          "perfis_parametros_custos",
          perfisCustos,
        );
      }
    },
  );

}

/**
 * Função auxiliar para inspeção manual/automação:
 * informa quantos registros cada aba contém sem alterar o banco.
 */
export function resumirDataset(
  dataset: DatasetImportado,
): string {
  return TABELAS_IMPORTACAO.map(
    (tabela) =>
      `${tabela}: ${dataset.contagens[tabela] ?? 0}`,
  ).join("\n");
}
