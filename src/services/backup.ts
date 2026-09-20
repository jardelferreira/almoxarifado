import { getDB } from "@/db/db";

export const BACKUP_FORMATO = "ALMOXARIFADO_BACKUP";
export const BACKUP_VERSAO = 7;

export const BACKUP_TABELAS = [
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
  "manutencoes_equipamentos",
  "manutencao_documentos",
  "apropriacoes_financeiras_equipamentos",
  "consumos_equipamentos",
  "regras_consumo_equipamentos",
  "perfis_parametros_custos",
] as const;

export type BackupTabela = (typeof BACKUP_TABELAS)[number];

export interface BackupArquivo {
  formato: typeof BACKUP_FORMATO;
  versao: number;
  gerado_em: string;
  banco: string;
  tabelas: Record<string, unknown[]>;
}

function tabelaExiste(nome: string): boolean {
  return getDB().tables.some((tabela) => tabela.name === nome);
}

async function lerTabela(nome: string): Promise<unknown[]> {
  if (!tabelaExiste(nome)) return [];
  return getDB().table(nome).toArray();
}

export async function criarBackupDados(): Promise<BackupArquivo> {
  const tabelas = Object.fromEntries(
    await Promise.all(
      BACKUP_TABELAS.map(async (nome) => [nome, await lerTabela(nome)] as const),
    ),
  );

  return {
    formato: BACKUP_FORMATO,
    versao: BACKUP_VERSAO,
    gerado_em: new Date().toISOString(),
    banco: "almoxarifado",
    tabelas,
  };
}

export async function gerarBackupDados(): Promise<void> {
  const backup = await criarBackupDados();
  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup_almoxarifado_v${BACKUP_VERSAO}_${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizarBackup(
  entrada: unknown,
): Record<string, unknown[]> {
  if (!entrada || typeof entrada !== "object") {
    throw new Error("Arquivo de backup inválido.");
  }

  const objeto = entrada as Record<string, unknown>;

  if (objeto["formato"] === BACKUP_FORMATO && objeto["tabelas"]) {
    if (typeof objeto["tabelas"] !== "object" || objeto["tabelas"] === null) {
      throw new Error("Estrutura de tabelas do backup inválida.");
    }

    const tabelas = objeto["tabelas"] as Record<string, unknown>;
    return Object.fromEntries(
      BACKUP_TABELAS.map((nome) => [
        nome,
        Array.isArray(tabelas[nome]) ? tabelas[nome] : [],
      ]),
    );
  }

  // Compatibilidade com o backup legado v1, que usava as tabelas
  // diretamente na raiz do JSON.
  const legado = objeto as Record<string, unknown>;
  return Object.fromEntries(
    BACKUP_TABELAS.map((nome) => [
      nome,
      Array.isArray(legado[nome]) ? legado[nome] : [],
    ]),
  );
}

export async function restaurarBackupDados(json: string): Promise<void> {
  let entrada: unknown;

  try {
    entrada = JSON.parse(json);
  } catch {
    throw new Error("O arquivo selecionado não contém JSON válido.");
  }

  const tabelas = normalizarBackup(entrada);
  const db = getDB();
  const tabelasExistentes = db.tables.filter((tabela) =>
    BACKUP_TABELAS.includes(tabela.name as BackupTabela),
  );

  if (tabelasExistentes.length === 0) {
    throw new Error("Nenhuma tabela compatível com este backup foi encontrada no banco local.");
  }

  await db.transaction(
    "rw",
    tabelasExistentes,
    async () => {
      for (const tabela of tabelasExistentes) {
        await tabela.clear();
      }

      for (const tabela of tabelasExistentes) {
        const registros = tabelas[tabela.name] ?? [];
        if (registros.length > 0) {
          await tabela.bulkPut(registros);
        }
      }
    },
  );
}

export function contarRegistrosBackup(
  backup: BackupArquivo,
): Record<string, number> {
  return Object.fromEntries(
    BACKUP_TABELAS.map((nome) => [
      nome,
      Array.isArray(backup.tabelas[nome])
        ? backup.tabelas[nome].length
        : 0,
    ]),
  );
}
