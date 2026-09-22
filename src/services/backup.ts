import { getDB } from "@/db/db";

export const BACKUP_FORMATO = "ALMOXARIFADO_BACKUP";
export const BACKUP_VERSAO = 8;
export const BACKUP_DB_VERSAO = 19;

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
  "inteligencia_acoes",
  "manutencoes_equipamentos",
  "manutencao_documentos",
  "apropriacoes_financeiras_equipamentos",
  "consumos_equipamentos",
  "regras_consumo_equipamentos",
  "perfis_parametros_custos",
] as const;

export type BackupTabela = (typeof BACKUP_TABELAS)[number];

export type BackupTabelas = {
  [K in BackupTabela]: unknown[];
};

interface BackupRegistro {
  [chave: string]: unknown;
  banco?: unknown;
  banco_versao?: unknown;
  categoria_id?: unknown;
  codigo?: unknown;
  data_fim?: unknown;
  data_inicio?: unknown;
  documento_id?: unknown;
  documento_item_id?: unknown;
  documento_referenciado_id?: unknown;
  empresa_id?: unknown;
  encarregado_id?: unknown;
  equipamento_id?: unknown;
  equipe_destino_id?: unknown;
  equipe_id?: unknown;
  equipe_raiz_id?: unknown;
  escopo?: unknown;
  estoque_equipamento_id?: unknown;
  formato?: unknown;
  funcionario_id?: unknown;
  gerado_em?: unknown;
  id?: unknown;
  integridade?: unknown;
  inventario_id?: unknown;
  local_destino_id?: unknown;
  local_id?: unknown;
  manutencao_id?: unknown;
  movimentacao_id?: unknown;
  movimentacao_origem_id?: unknown;
  nome?: unknown;
  produto_id?: unknown;
  projeto?: unknown;
  projeto_id?: unknown;
  responsavel_id?: unknown;
  resumo?: unknown;
  status?: unknown;
  tabelas?: unknown;
  unidade_base_id?: unknown;
  unidade_consumo_id?: unknown;
  unidade_id?: unknown;
  versao?: unknown;
}

const TABELAS_GLOBAIS: readonly BackupTabela[] = ["categorias", "unidades"];
const TABELAS_PROJETO_DIRETO: readonly BackupTabela[] = [
  "categorias_equipamentos",
  "empresas",
  "funcionarios",
  "locais",
  "produtos",
  "movimentacoes",
  "equipes",
  "arquivos",
  "equipamentos",
  "estoque_equipamentos",
  "movimentacoes_equipamentos",
  "configuracoes",
  "documentos",
  "documento_referencias",
  "inventarios",
  "inteligencia_acoes",
  "manutencoes_equipamentos",
  "manutencao_documentos",
  "apropriacoes_financeiras_equipamentos",
  "consumos_equipamentos",
  "regras_consumo_equipamentos",
  "perfis_parametros_custos",
];

export interface BackupProjetoIdentidade {
  id: string;
  codigo: string;
  nome: string;
  status?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
}

export interface BackupIntegridade {
  algoritmo: "SHA-256";
  conteudo_sha256: string;
  observacao: string;
}

export interface BackupArquivo {
  formato: typeof BACKUP_FORMATO;
  versao: number;
  gerado_em: string;
  banco: string;
  escopo?: "PROJETO" | "LEGADO";
  projeto?: BackupProjetoIdentidade | null | undefined;
  banco_versao?: number | null | undefined;
  integridade?: BackupIntegridade | undefined;
  resumo?: {
    tabelas_com_dados: number;
    registros_totais: number;
  } | undefined;
  /** Preservado apenas em memória durante a validação/restauração para tratar
   * backups legados que não possuem todas as tabelas atuais. */
  tabelas_presentes?: BackupTabela[];
  tabelas: BackupTabelas;
}

export interface BackupImpactoTabela {
  tabela: string;
  no_backup: number;
  no_projeto_atual: number;
  substituidos: number;
  inclusao_global: number;
}

export interface BackupAnalise {
  valido: boolean;
  compatibilidade: "ATUAL" | "LEGADO" | "INCOMPATIVEL";
  versao: number;
  banco_versao: number | null;
  projeto: BackupProjetoIdentidade | null;
  projeto_atual_id: string | null;
  projeto_igual: boolean;
  hash_status: "VALIDO" | "INVALIDO" | "NAO_VERIFICADO";
  hash: string | null;
  registros_totais: number;
  tabelas_com_dados: number;
  tabelas_ausentes: string[];
  erros: string[];
  avisos: string[];
  impacto: BackupImpactoTabela[];
}

export interface RestaurarBackupResultado {
  projetoId: string;
  registrosImportados: number;
  registrosSubstituidos: number;
}

function tabelaExiste(nome: string): boolean {
  return getDB().tables.some((tabela) => tabela.name === nome);
}

async function lerTabela(nome: string): Promise<unknown[]> {
  if (!tabelaExiste(nome)) return [];
  return getDB().table(nome).toArray();
}

function ordenarPorId(registros: unknown[]): unknown[] {
  return [...registros].sort((a, b) => {
    const aa = a && typeof a === "object" ? String((a as BackupRegistro).id ?? "") : "";
    const bb = b && typeof b === "object" ? String((b as BackupRegistro).id ?? "") : "";
    return aa.localeCompare(bb);
  });
}

function estabilizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(estabilizar);
  if (valor && typeof valor === "object") {
    const objeto = valor as BackupRegistro;
    return Object.fromEntries(
      Object.keys(objeto)
        .sort()
        .map((chave) => [chave, estabilizar(objeto[chave])]),
    );
  }
  return valor;
}

function corpoParaIntegridade(entrada: BackupArquivo): string {
  const tabelas = Object.fromEntries(
    BACKUP_TABELAS.map((nome) => [nome, ordenarPorId(entrada.tabelas[nome] ?? [])]),
  );

  return JSON.stringify(
    estabilizar({
      formato: entrada.formato,
      versao: entrada.versao,
      banco: entrada.banco,
      escopo: entrada.escopo ?? null,
      projeto: entrada.projeto ?? null,
      banco_versao: entrada.banco_versao ?? null,
      tabelas,
    }),
  );
}

async function sha256(texto: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("O navegador não disponibilizou o recurso de integridade criptográfica para este backup.");
  }
  const bytes = new TextEncoder().encode(texto);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extrairProjeto(tabelas: BackupTabelas): BackupProjetoIdentidade | null {
  const projetos = tabelas.projetos ?? [];
  if (projetos.length !== 1) return null;
  const projeto = projetos[0];
  if (!projeto || typeof projeto !== "object") return null;
  const item = projeto as BackupRegistro;
  if (typeof item.id !== "string" || typeof item.codigo !== "string" || typeof item.nome !== "string") return null;
  return {
    id: item.id,
    codigo: item.codigo,
    nome: item.nome,
    status: typeof item.status === "string" ? item.status : null,
    data_inicio: typeof item.data_inicio === "string" ? item.data_inicio : null,
    data_fim: typeof item.data_fim === "string" ? item.data_fim : null,
  };
}

function registrosTotal(tabelas: BackupTabelas): number {
  return BACKUP_TABELAS.reduce((total, nome) => total + (tabelas[nome]?.length ?? 0), 0);
}

function tabelasFaltantes(tabelas: BackupTabelas): string[] {
  return BACKUP_TABELAS.filter((nome) => !Array.isArray(tabelas[nome]));
}

function adicionarErro(erros: string[], mensagem: string): void {
  if (!erros.includes(mensagem)) erros.push(mensagem);
}

function adicionarAviso(avisos: string[], mensagem: string): void {
  if (!avisos.includes(mensagem)) avisos.push(mensagem);
}

function ids(registros: unknown[]): Set<string> {
  return new Set(
    registros
      .filter((registro): registro is BackupRegistro => !!registro && typeof registro === "object")
      .map((registro) => String(registro.id ?? ""))
      .filter(Boolean),
  );
}

function validarDuplicidades(tabelas: BackupTabelas, erros: string[]): void {
  for (const nome of BACKUP_TABELAS) {
    const registros = tabelas[nome] ?? [];
    const vistos = new Set<string>();
    for (const registro of registros) {
      if (!registro || typeof registro !== "object") {
        adicionarErro(erros, `A tabela “${nome}” contém um registro inválido.`);
        continue;
      }
      const id = String((registro as BackupRegistro).id ?? "");
      if (!id) {
        adicionarErro(erros, `A tabela “${nome}” contém registro sem ID.`);
        continue;
      }
      if (vistos.has(id)) {
        adicionarErro(erros, `A tabela “${nome}” contém ID duplicado: ${id}.`);
      }
      vistos.add(id);
    }
  }
}

function validarReferencias(tabelas: BackupTabelas, projeto: BackupProjetoIdentidade | null, erros: string[], avisos: string[]): void {
  if (!projeto) {
    adicionarErro(erros, "O backup precisa conter exatamente um projeto principal.");
    return;
  }

  const projetoId = projeto.id;
  const projetos = tabelas.projetos ?? [];
  if (projetos.some((item) => (item as BackupRegistro)?.id !== projetoId)) {
    adicionarErro(erros, "O identificador do projeto informado no cabeçalho não coincide com a tabela de projetos.");
  }

  for (const nome of TABELAS_PROJETO_DIRETO) {
    const registros = tabelas[nome] ?? [];
    const fora = registros.filter(
      (registro) =>
        !!registro &&
        typeof registro === "object" &&
        (registro as BackupRegistro).projeto_id !== projetoId,
    );
    if (fora.length > 0) {
      adicionarErro(erros, `A tabela “${nome}” possui ${fora.length} registro(s) fora do projeto do backup.`);
    }
  }

  const categoriaIds = ids(tabelas.categorias ?? []);
  const unidadeIds = ids(tabelas.unidades ?? []);
  const empresaIds = ids(tabelas.empresas ?? []);
  const funcionarioIds = ids(tabelas.funcionarios ?? []);
  const localIds = ids(tabelas.locais ?? []);
  const produtoIds = ids(tabelas.produtos ?? []);
  const equipeIds = ids(tabelas.equipes ?? []);
  const equipamentoIds = ids(tabelas.equipamentos ?? []);
  const estoqueEquipamentoIds = ids(tabelas.estoque_equipamentos ?? []);
  const documentoIds = ids(tabelas.documentos ?? []);
  const documentoItemIds = ids(tabelas.documento_itens ?? []);
  const inventarioIds = ids(tabelas.inventarios ?? []);
  const manutencaoIds = ids(tabelas.manutencoes_equipamentos ?? []);
  const movimentacaoIds = ids(tabelas.movimentacoes ?? []);

  for (const produto of tabelas.produtos ?? []) {
    const item = produto as BackupRegistro;
    if (item.categoria_id && !categoriaIds.has(String(item.categoria_id))) adicionarErro(erros, `Produto ${String(item.id)} referencia categoria inexistente.`);
    if (item.unidade_id && !unidadeIds.has(String(item.unidade_id))) adicionarErro(erros, `Produto ${String(item.id)} referencia unidade inexistente.`);
  }

  for (const funcionario of tabelas.funcionarios ?? []) {
    const item = funcionario as BackupRegistro;
    if (item.empresa_id && !empresaIds.has(String(item.empresa_id))) adicionarErro(erros, `Funcionário ${String(item.id)} referencia empresa inexistente.`);
    if (item.equipe_raiz_id && !equipeIds.has(String(item.equipe_raiz_id))) adicionarErro(erros, `Funcionário ${String(item.id)} referencia equipe inexistente.`);
    if (item.encarregado_id && !funcionarioIds.has(String(item.encarregado_id))) adicionarErro(erros, `Funcionário ${String(item.id)} referencia encarregado inexistente.`);
  }

  for (const equipe of tabelas.equipes ?? []) {
    const item = equipe as BackupRegistro;
    if (item.projeto_id !== projetoId) adicionarErro(erros, `Equipe ${String(item.id)} está fora do projeto.`);
  }

  for (const membro of tabelas.equipe_membros ?? []) {
    const item = membro as BackupRegistro;
    if (!equipeIds.has(String(item.equipe_id))) adicionarErro(erros, `Membro de equipe ${String(item.id)} referencia equipe inexistente.`);
    if (!funcionarioIds.has(String(item.funcionario_id))) adicionarErro(erros, `Membro de equipe ${String(item.id)} referencia funcionário inexistente.`);
  }

  for (const estoque of tabelas.estoque_equipamentos ?? []) {
    const item = estoque as BackupRegistro;
    if (!equipamentoIds.has(String(item.equipamento_id))) adicionarErro(erros, `Estoque de equipamento ${String(item.id)} referencia equipamento inexistente.`);
    if (!empresaIds.has(String(item.empresa_id))) adicionarErro(erros, `Estoque de equipamento ${String(item.id)} referencia empresa inexistente.`);
    if (item.equipe_id && !equipeIds.has(String(item.equipe_id))) adicionarErro(erros, `Estoque de equipamento ${String(item.id)} referencia equipe inexistente.`);
  }

  for (const movimento of tabelas.movimentacoes ?? []) {
    const item = movimento as BackupRegistro;
    if (!produtoIds.has(String(item.produto_id))) adicionarErro(erros, `Movimentação ${String(item.id)} referencia produto inexistente.`);
    if (item.equipe_id && !equipeIds.has(String(item.equipe_id))) adicionarErro(erros, `Movimentação ${String(item.id)} referencia equipe inexistente.`);
    if (item.funcionario_id && !funcionarioIds.has(String(item.funcionario_id))) adicionarErro(erros, `Movimentação ${String(item.id)} referencia funcionário inexistente.`);
    if (item.encarregado_id && !funcionarioIds.has(String(item.encarregado_id))) adicionarErro(erros, `Movimentação ${String(item.id)} referencia encarregado inexistente.`);
    if (item.empresa_id && !empresaIds.has(String(item.empresa_id))) adicionarErro(erros, `Movimentação ${String(item.id)} referencia empresa inexistente.`);
    if (item.local_id && !localIds.has(String(item.local_id))) adicionarErro(erros, `Movimentação ${String(item.id)} referencia local inexistente.`);
    if (item.local_destino_id && !localIds.has(String(item.local_destino_id))) adicionarErro(erros, `Movimentação ${String(item.id)} referencia local de destino inexistente.`);
    if (item.movimentacao_origem_id && !movimentacaoIds.has(String(item.movimentacao_origem_id))) adicionarAviso(avisos, `Movimentação ${String(item.id)} referencia uma movimentação de origem que não está presente no backup.`);
    if (item.documento_id && !documentoIds.has(String(item.documento_id))) adicionarErro(erros, `Movimentação ${String(item.id)} referencia documento inexistente.`);
    if (item.documento_item_id && !documentoItemIds.has(String(item.documento_item_id))) adicionarErro(erros, `Movimentação ${String(item.id)} referencia item documental inexistente.`);
  }

  for (const equipamento of tabelas.equipamentos ?? []) {
    const item = equipamento as BackupRegistro;
    if (!item.categoria_id || !ids(tabelas.categorias_equipamentos ?? []).has(String(item.categoria_id))) {
      adicionarErro(erros, `Equipamento ${String(item.id)} referencia categoria de equipamento inexistente.`);
    }
  }

  for (const movimento of tabelas.movimentacoes_equipamentos ?? []) {
    const item = movimento as BackupRegistro;
    if (!estoqueEquipamentoIds.has(String(item.estoque_equipamento_id))) adicionarErro(erros, `Movimentação de equipamento ${String(item.id)} referencia estoque físico inexistente.`);
    for (const campo of ["origem_id", "destino_id"] as const) {
      const valor = item[campo];
      const parte = item[campo === "origem_id" ? "tipo_origem" : "tipo_destino"];
      if (!parte || !["EMPRESA", "EQUIPE", "FUNCIONARIO"].includes(String(parte))) {
        adicionarErro(erros, `Movimentação de equipamento ${String(item.id)} possui tipo de ${campo === "origem_id" ? "origem" : "destino"} ausente ou inválido.`);
        continue;
      }
      if (!valor) {
        adicionarErro(erros, `Movimentação de equipamento ${String(item.id)} possui ${campo} ausente.`);
        continue;
      }
      const ok = parte === "EMPRESA" ? empresaIds.has(String(valor)) : parte === "EQUIPE" ? equipeIds.has(String(valor)) : funcionarioIds.has(String(valor));
      if (!ok) adicionarErro(erros, `Movimentação de equipamento ${String(item.id)} referencia ${String(parte)} inexistente em ${campo}.`);
    }
  }

  for (const apropriacao of tabelas.apropriacoes ?? []) {
    const item = apropriacao as BackupRegistro;
    if (!estoqueEquipamentoIds.has(String(item.estoque_equipamento_id))) adicionarErro(erros, `Apropriação ${String(item.id)} referencia estoque físico inexistente.`);
    if (!funcionarioIds.has(String(item.funcionario_id))) adicionarErro(erros, `Apropriação ${String(item.id)} referencia funcionário inexistente.`);
  }

  for (const documento of tabelas.documentos ?? []) {
    const item = documento as BackupRegistro;
    if (item.empresa_id && !empresaIds.has(String(item.empresa_id))) adicionarErro(erros, `Documento ${String(item.id)} referencia empresa inexistente.`);
  }

  for (const itemDocumento of tabelas.documento_itens ?? []) {
    const item = itemDocumento as BackupRegistro;
    if (!documentoIds.has(String(item.documento_id))) adicionarErro(erros, `Item de documento ${String(item.id)} referencia documento inexistente.`);
    if (item.produto_id && !produtoIds.has(String(item.produto_id))) adicionarErro(erros, `Item de documento ${String(item.id)} referencia produto inexistente.`);
    if (item.equipe_destino_id && !equipeIds.has(String(item.equipe_destino_id))) adicionarErro(erros, `Item de documento ${String(item.id)} referencia equipe inexistente.`);
  }

  for (const referencia of tabelas.documento_referencias ?? []) {
    const item = referencia as BackupRegistro;
    if (!documentoIds.has(String(item.documento_id)) || !documentoIds.has(String(item.documento_referenciado_id))) adicionarErro(erros, `Referência documental ${String(item.id)} contém documento inexistente.`);
  }

  for (const inventario of tabelas.inventarios ?? []) {
    const item = inventario as BackupRegistro;
    if (item.equipe_id && !equipeIds.has(String(item.equipe_id))) adicionarErro(erros, `Inventário ${String(item.id)} referencia equipe inexistente.`);
    if (item.responsavel_id && !funcionarioIds.has(String(item.responsavel_id))) adicionarErro(erros, `Inventário ${String(item.id)} referencia responsável inexistente.`);
  }

  for (const itemInventario of tabelas.inventario_itens ?? []) {
    const item = itemInventario as BackupRegistro;
    if (!inventarioIds.has(String(item.inventario_id))) adicionarErro(erros, `Item de inventário ${String(item.id)} referencia inventário inexistente.`);
    if (!produtoIds.has(String(item.produto_id))) adicionarErro(erros, `Item de inventário ${String(item.id)} referencia produto inexistente.`);
    if (!equipeIds.has(String(item.equipe_id))) adicionarErro(erros, `Item de inventário ${String(item.id)} referencia equipe inexistente.`);
  }

  for (const manutencao of tabelas.manutencoes_equipamentos ?? []) {
    const item = manutencao as BackupRegistro;
    if (!estoqueEquipamentoIds.has(String(item.estoque_equipamento_id))) adicionarErro(erros, `Manutenção ${String(item.id)} referencia estoque físico inexistente.`);
    if (!equipamentoIds.has(String(item.equipamento_id))) adicionarErro(erros, `Manutenção ${String(item.id)} referencia equipamento inexistente.`);
    if (item.empresa_id && !empresaIds.has(String(item.empresa_id))) adicionarErro(erros, `Manutenção ${String(item.id)} referencia empresa inexistente.`);
  }

  for (const manutencao of tabelas.manutencoes_equipamentos ?? []) {
    const item = manutencao as BackupRegistro;
    for (const campo of ["movimento_sinalizacao_id", "movimento_envio_id", "movimento_retorno_id"]) {
      const valor = item[campo];
      if (valor && !ids(tabelas.movimentacoes_equipamentos ?? []).has(String(valor))) {
        adicionarErro(erros, `Manutenção ${String(item.id)} referencia movimentação de equipamento inexistente em ${campo}.`);
      }
    }
  }

  for (const vinculacao of tabelas.manutencao_documentos ?? []) {
    const item = vinculacao as BackupRegistro;
    if (!manutencaoIds.has(String(item.manutencao_id))) adicionarErro(erros, `Vínculo de manutenção ${String(item.id)} referencia manutenção inexistente.`);
    if (!documentoIds.has(String(item.documento_id))) adicionarErro(erros, `Vínculo de manutenção ${String(item.id)} referencia documento inexistente.`);
  }

  for (const apropriacao of tabelas.apropriacoes_financeiras_equipamentos ?? []) {
    const item = apropriacao as BackupRegistro;
    if (!documentoIds.has(String(item.documento_id))) adicionarErro(erros, `Apropriação financeira ${String(item.id)} referencia documento inexistente.`);
    if (item.documento_item_id && !documentoItemIds.has(String(item.documento_item_id))) adicionarErro(erros, `Apropriação financeira ${String(item.id)} referencia item documental inexistente.`);
    if (item.manutencao_id && !manutencaoIds.has(String(item.manutencao_id))) adicionarErro(erros, `Apropriação financeira ${String(item.id)} referencia manutenção inexistente.`);
    if (!estoqueEquipamentoIds.has(String(item.estoque_equipamento_id))) adicionarErro(erros, `Apropriação financeira ${String(item.id)} referencia estoque físico inexistente.`);
    if (!equipamentoIds.has(String(item.equipamento_id))) adicionarErro(erros, `Apropriação financeira ${String(item.id)} referencia equipamento inexistente.`);
  }

  for (const consumo of tabelas.consumos_equipamentos ?? []) {
    const item = consumo as BackupRegistro;
    if (!movimentacaoIds.has(String(item.movimentacao_id))) adicionarErro(erros, `Consumo de equipamento ${String(item.id)} referencia movimentação inexistente.`);
    if (!estoqueEquipamentoIds.has(String(item.estoque_equipamento_id))) adicionarErro(erros, `Consumo de equipamento ${String(item.id)} referencia estoque físico inexistente.`);
    if (!equipamentoIds.has(String(item.equipamento_id))) adicionarErro(erros, `Consumo de equipamento ${String(item.id)} referencia equipamento inexistente.`);
    if (item.unidade_id && !unidadeIds.has(String(item.unidade_id))) adicionarErro(erros, `Consumo de equipamento ${String(item.id)} referencia unidade inexistente.`);
  }

  for (const regra of tabelas.regras_consumo_equipamentos ?? []) {
    const item = regra as BackupRegistro;
    if (!equipamentoIds.has(String(item.equipamento_id))) adicionarErro(erros, `Regra de consumo ${String(item.id)} referencia equipamento inexistente.`);
    if (item.estoque_equipamento_id && !estoqueEquipamentoIds.has(String(item.estoque_equipamento_id))) adicionarErro(erros, `Regra de consumo ${String(item.id)} referencia estoque físico inexistente.`);
    if (!produtoIds.has(String(item.produto_id))) adicionarErro(erros, `Regra de consumo ${String(item.id)} referencia produto inexistente.`);
    if (!unidadeIds.has(String(item.unidade_base_id)) || !unidadeIds.has(String(item.unidade_consumo_id))) adicionarErro(erros, `Regra de consumo ${String(item.id)} referencia unidade inexistente.`);
  }

  for (const acao of tabelas.inteligencia_acoes ?? []) {
    const item = acao as BackupRegistro;
    if (item.produto_id && !produtoIds.has(String(item.produto_id))) adicionarErro(erros, `Ação de inteligência ${String(item.id)} referencia produto inexistente.`);
    if (item.equipe_id && !equipeIds.has(String(item.equipe_id))) adicionarErro(erros, `Ação de inteligência ${String(item.id)} referencia equipe inexistente.`);
  }

  if ((tabelas.perfis_parametros_custos ?? []).some((perfil) => {
    const item = perfil as BackupRegistro;
    return item.projeto_id !== projetoId;
  })) {
    adicionarErro(erros, "Um ou mais perfis de parâmetros pertencem a outro projeto.");
  }

  if ((tabelas.movimentacoes_equipamentos ?? []).length < (tabelas.estoque_equipamentos ?? []).length) {
    adicionarAviso(avisos, "Existem registros físicos de equipamentos com poucos eventos operacionais; isso pode reduzir a qualidade da análise temporal.");
  }
}

function agruparImpacto(
  tabelas: BackupTabelas,
  projetoAtual: BackupTabelas | null,
  tabelasPresentes: readonly BackupTabela[],
): BackupImpactoTabela[] {
  const presentes = new Set(tabelasPresentes);
  const result: BackupImpactoTabela[] = [];
  for (const nome of BACKUP_TABELAS) {
    const backupCount = tabelas[nome]?.length ?? 0;
    const atualCount = projetoAtual?.[nome]?.length ?? 0;
    const global = TABELAS_GLOBAIS.includes(nome);
    const incluídaNoArquivo = presentes.has(nome);
    result.push({
      tabela: nome,
      no_backup: backupCount,
      no_projeto_atual: atualCount,
      substituidos: global || !incluídaNoArquivo ? 0 : atualCount,
      inclusao_global: global && incluídaNoArquivo ? backupCount : 0,
    });
  }
  return result;
}

async function carregarProjetoAtual(projetoId: string | null): Promise<BackupTabelas | null> {
  if (!projetoId) return null;
  const db = getDB();
  const result = {} as BackupTabelas;
  for (const nome of BACKUP_TABELAS) {
    const registros = await lerTabela(nome);
    if (TABELAS_GLOBAIS.includes(nome)) {
      result[nome] = registros;
    } else if (nome === "equipe_membros") {
      const equipes = new Set(
        (await db.equipes.where("projeto_id").equals(projetoId).toArray()).map((item) => item.id),
      );
      result[nome] = registros.filter((item) => equipes.has((item as BackupRegistro).equipe_id as string));
    } else if (nome === "documento_itens") {
      const documentos = new Set(
        (await db.documentos.where("projeto_id").equals(projetoId).toArray()).map((item) => item.id),
      );
      result[nome] = registros.filter((item) => documentos.has((item as BackupRegistro).documento_id as string));
    } else if (nome === "inventario_itens") {
      const inventarios = new Set(
        (await db.inventarios.where("projeto_id").equals(projetoId).toArray()).map((item) => item.id),
      );
      result[nome] = registros.filter((item) => inventarios.has((item as BackupRegistro).inventario_id as string));
    } else if (nome === "apropriacoes") {
      const estoques = new Set(
        (await db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray()).map((item) => item.id),
      );
      result[nome] = registros.filter((item) => estoques.has((item as BackupRegistro).estoque_equipamento_id as string));
    } else if (nome === "projetos") {
      result[nome] = registros.filter((item) => (item as BackupRegistro).id === projetoId);
    } else {
      result[nome] = registros.filter((item) => (item as BackupRegistro).projeto_id === projetoId);
    }
  }
  return result;
}

function normalizarEntrada(entrada: unknown): BackupArquivo {
  if (!entrada || typeof entrada !== "object") throw new Error("Arquivo de backup inválido.");
  const objeto = entrada as BackupRegistro;

  if (objeto.formato === BACKUP_FORMATO && objeto.tabelas && typeof objeto.tabelas === "object") {
    const tabelasEntrada = objeto.tabelas as BackupRegistro;
    const presentes = BACKUP_TABELAS.filter((nome) => Array.isArray(tabelasEntrada[nome]));
    const tabelas = Object.fromEntries(
      BACKUP_TABELAS.map((nome) => [nome, Array.isArray(tabelasEntrada[nome]) ? tabelasEntrada[nome] : []]),
    ) as BackupTabelas;
    return {
      formato: BACKUP_FORMATO,
      versao: typeof objeto.versao === "number" ? objeto.versao : 1,
      gerado_em: typeof objeto.gerado_em === "string" ? objeto.gerado_em : "",
      banco: typeof objeto.banco === "string" ? objeto.banco : "almoxarifado",
      escopo: objeto.escopo === "PROJETO" ? "PROJETO" : "LEGADO",
      projeto: objeto.projeto && typeof objeto.projeto === "object" ? (objeto.projeto as BackupProjetoIdentidade) : extrairProjeto(tabelas),
      banco_versao: typeof objeto.banco_versao === "number" ? objeto.banco_versao : null,
      integridade: objeto.integridade && typeof objeto.integridade === "object" ? (objeto.integridade as BackupIntegridade) : undefined,
      resumo: objeto.resumo && typeof objeto.resumo === "object" ? (objeto.resumo as BackupArquivo["resumo"]) : undefined,
      tabelas_presentes: presentes,
      tabelas,
    };
  }

  const legado = objeto as BackupRegistro;
  const presentes = BACKUP_TABELAS.filter((nome) => Array.isArray(legado[nome]));
  const tabelas = Object.fromEntries(
    BACKUP_TABELAS.map((nome) => [nome, Array.isArray(legado[nome]) ? legado[nome] : []]),
  ) as BackupTabelas;
  return {
    formato: BACKUP_FORMATO,
    versao: typeof legado.versao === "number" ? legado.versao : 1,
    gerado_em: typeof legado.gerado_em === "string" ? legado.gerado_em : "",
    banco: typeof legado.banco === "string" ? legado.banco : "almoxarifado",
    escopo: "LEGADO",
    projeto: extrairProjeto(tabelas),
    tabelas_presentes: presentes,
    tabelas,
  };
}


async function validarConflitosInterprojetos(
  tabelas: BackupTabelas,
  projetoId: string,
  erros: string[],
): Promise<void> {
  const db = getDB();

  const verificarTabelaDireta = async (nome: BackupTabela) => {
    if (!tabelaExiste(nome)) return;
    const existentes = await db.table(nome).toArray();
    const porId = new Map(existentesPorId(existentes));
    for (const registro of tabelas[nome] ?? []) {
      if (!registro || typeof registro !== "object") continue;
      const item = registro as BackupRegistro;
      const id = String(item.id ?? "");
      if (!id) continue;
      const existente = porId.get(id);
      if (!existente || typeof existente !== "object") continue;
      const existenteProjeto = String((existente as BackupRegistro).projeto_id ?? "");
      if (existenteProjeto && existenteProjeto !== projetoId) {
        adicionarErro(
          erros,
          `Conflito interprojetos: a tabela “${nome}” já possui o ID ${id} associado ao projeto ${existenteProjeto}. O backup foi bloqueado para proteger esse outro projeto.`,
        );
      }
    }
  };

  for (const nome of TABELAS_PROJETO_DIRETO) {
    await verificarTabelaDireta(nome);
  }

  const equipes = new Map(
    (await db.equipes.toArray()).map((item) => [item.id, item.projeto_id]),
  );
  const documentos = new Map(
    (await db.documentos.toArray()).map((item) => [item.id, item.projeto_id]),
  );
  const inventarios = new Map(
    (await db.inventarios.toArray()).map((item) => [item.id, item.projeto_id]),
  );
  const estoques = new Map(
    (await db.estoque_equipamentos.toArray()).map((item) => [item.id, item.projeto_id]),
  );

  const verificarRelacionada = async (
    nome: BackupTabela,
    donoPorId: Map<string, string>,
    campoDono: string,
  ) => {
    if (!tabelaExiste(nome)) return;
    const existentes = await db.table(nome).toArray();
    const porId = new Map(existentesPorId(existentes));
    for (const registro of tabelas[nome] ?? []) {
      if (!registro || typeof registro !== "object") continue;
      const item = registro as BackupRegistro;
      const id = String(item.id ?? "");
      if (!id) continue;
      const existente = porId.get(id);
      if (!existente || typeof existente !== "object") continue;
      const donoExistente = donoPorId.get(String((existente as BackupRegistro)[campoDono] ?? ""));
      if (donoExistente && donoExistente !== projetoId) {
        adicionarErro(
          erros,
          `Conflito interprojetos: a tabela “${nome}” já possui o ID ${id} ligado ao projeto ${donoExistente}. O backup foi bloqueado para proteger esse outro projeto.`,
        );
      }
    }
  };

  await verificarRelacionada("equipe_membros", equipes, "equipe_id");
  await verificarRelacionada("documento_itens", documentos, "documento_id");
  await verificarRelacionada("inventario_itens", inventarios, "inventario_id");
  await verificarRelacionada("apropriacoes", estoques, "estoque_equipamento_id");

  if (tabelaExiste("projetos")) {
    const projetos = await db.projetos.toArray();
    const mesmoCodigo = projetos.find((item) => item.id !== projetoId && item.codigo === (tabelas.projetos?.[0] as BackupRegistro)?.codigo);
    if (mesmoCodigo) {
      adicionarErro(
        erros,
        `Conflito de identidade: já existe outro projeto com o código ${(tabelas.projetos?.[0] as BackupRegistro)?.codigo}.`,
      );
    }
  }
}

export async function analisarBackupDados(json: string, projetoAtualId: string | null = null): Promise<BackupAnalise> {
  let entrada: unknown;
  try {
    entrada = JSON.parse(json);
  } catch {
    throw new Error("O arquivo selecionado não contém JSON válido.");
  }

  const backup = normalizarEntrada(entrada);
  const erros: string[] = [];
  const avisos: string[] = [];
  const tabelasPresentes = backup.tabelas_presentes ?? [];
  const presentesSet = new Set(tabelasPresentes);
  const faltantes = BACKUP_TABELAS.filter((nome) => !presentesSet.has(nome));

  if (backup.formato !== BACKUP_FORMATO) adicionarErro(erros, "O formato do backup não é compatível.");
  if (backup.escopo !== "PROJETO") adicionarErro(erros, "O arquivo não foi gerado como backup integral de um projeto. Restauração de arquivos legados é bloqueada para evitar comportamento ambíguo.");
  if (backup.versao > BACKUP_VERSAO) adicionarErro(erros, `O backup usa a versão ${backup.versao}, mas este aplicativo entende até a versão ${BACKUP_VERSAO}.`);
  if (backup.banco !== "almoxarifado") adicionarErro(erros, `Banco de origem não reconhecido: ${backup.banco}.`);
  if (backup.banco_versao != null && backup.banco_versao > BACKUP_DB_VERSAO) {
    adicionarErro(erros, `O backup foi gerado em uma versão de banco (${backup.banco_versao}) superior à suportada por este aplicativo (${BACKUP_DB_VERSAO}).`);
  }
  if (backup.banco_versao != null && backup.banco_versao < BACKUP_DB_VERSAO) {
    adicionarAviso(avisos, `O backup foi gerado com banco v${backup.banco_versao}; o banco atual trabalha com v${BACKUP_DB_VERSAO}.`);
  }
  if (faltantes.length > 0) {
    const mensagem = `O arquivo não contém ${faltantes.length} tabela(s) da estrutura atual; durante uma restauração legada essas tabelas serão preservadas no projeto de destino.`;
    if (backup.versao >= BACKUP_VERSAO) adicionarErro(erros, `Backup v${BACKUP_VERSAO} incompleto: ${mensagem}`);
    else adicionarAviso(avisos, mensagem);
  }

  const projeto = extrairProjeto(backup.tabelas);
  const projetoIgual = !!projetoAtualId && !!projeto && projeto.id === projetoAtualId;

  if (!projetoAtualId) {
    adicionarErro(erros, "Nenhum projeto ativo. Abra o projeto que será restaurado antes de selecionar o backup.");
  } else if (!projeto) {
    adicionarErro(erros, "O backup não identifica exatamente um projeto para restauração.");
  } else if (!projetoIgual) {
    adicionarErro(erros, `O projeto do backup (${projeto.codigo}) não corresponde ao projeto ativo atual. Restauração bloqueada para proteger o projeto ativo.`);
  }

  if (projeto) {
    const bancoProjetoAtual = tabelaExiste("projetos") ? await getDB().projetos.get(projeto.id) : undefined;
    if (!bancoProjetoAtual && projetoAtualId === projeto.id) {
      adicionarErro(erros, "O projeto ativo informado não existe mais no banco local.");
    } else if (bancoProjetoAtual && projetoAtualId === projeto.id) {
      if (bancoProjetoAtual.codigo !== projeto.codigo || bancoProjetoAtual.nome !== projeto.nome) {
        adicionarErro(erros, `A identidade do projeto diverge: o ID ${projeto.id} já existe no dispositivo com outro código ou nome.`);
      }
    }
  }

  validarDuplicidades(backup.tabelas, erros);
  validarReferencias(backup.tabelas, projeto, erros, avisos);
  if (projeto) await validarConflitosInterprojetos(backup.tabelas, projeto.id, erros);

  let hashStatus: BackupAnalise["hash_status"] = "NAO_VERIFICADO";
  let hash: string | null = null;
  if (backup.integridade?.algoritmo === "SHA-256" && backup.integridade.conteudo_sha256) {
    const calculado = await sha256(corpoParaIntegridade(backup));
    hash = calculado;
    if (calculado === backup.integridade.conteudo_sha256) {
      hashStatus = "VALIDO";
    } else {
      hashStatus = "INVALIDO";
      adicionarErro(erros, "A assinatura de integridade SHA-256 não confere com o conteúdo do arquivo.");
    }
  } else {
    adicionarAviso(avisos, "Este backup não possui hash de integridade verificável. Isso é esperado em versões antigas do formato.");
  }

  const atual = await carregarProjetoAtual(projetoAtualId);
  const impacto = agruparImpacto(backup.tabelas, atual, tabelasPresentes);
  const registrosTotais = registrosTotal(backup.tabelas);
  const tabelasComDados = BACKUP_TABELAS.filter((nome) => (backup.tabelas[nome]?.length ?? 0) > 0).length;


  return {
    valido: erros.length === 0,
    compatibilidade: erros.length > 0 ? "INCOMPATIVEL" : backup.versao >= BACKUP_VERSAO ? "ATUAL" : "LEGADO",
    versao: backup.versao,
    banco_versao: backup.banco_versao ?? null,
    projeto,
    projeto_atual_id: projetoAtualId,
    projeto_igual: projetoIgual,
    hash_status: hashStatus,
    hash,
    registros_totais: registrosTotais,
    tabelas_com_dados: tabelasComDados,
    tabelas_ausentes: faltantes,
    erros,
    avisos,
    impacto,
  };
}

export async function criarBackupDados(projetoId: string): Promise<BackupArquivo> {
  if (!projetoId) throw new Error("Selecione um projeto antes de gerar o backup.");

  const db = getDB();
  const projeto = await db.projetos.get(projetoId);
  if (!projeto) throw new Error("O projeto ativo não foi encontrado.");

  const todos = Object.fromEntries(
    await Promise.all(BACKUP_TABELAS.map(async (nome) => [nome, await lerTabela(nome)] as const)),
  ) as BackupTabelas;

  const equipes = new Set(
    (todos.equipes ?? [])
      .filter((item) => (item as BackupRegistro).projeto_id === projetoId)
      .map((item) => String((item as BackupRegistro).id)),
  );
  const documentos = new Set(
    (todos.documentos ?? [])
      .filter((item) => (item as BackupRegistro).projeto_id === projetoId)
      .map((item) => String((item as BackupRegistro).id)),
  );
  const inventarios = new Set(
    (todos.inventarios ?? [])
      .filter((item) => (item as BackupRegistro).projeto_id === projetoId)
      .map((item) => String((item as BackupRegistro).id)),
  );
  const estoquesEquipamentos = new Set(
    (todos.estoque_equipamentos ?? [])
      .filter((item) => (item as BackupRegistro).projeto_id === projetoId)
      .map((item) => String((item as BackupRegistro).id)),
  );

  const categoriasUsadas = new Set(
    (todos.produtos ?? [])
      .filter((item) => (item as BackupRegistro).projeto_id === projetoId)
      .map((item) => String((item as BackupRegistro).categoria_id ?? ""))
      .filter(Boolean),
  );
  const unidadesUsadas = new Set(
    [
      ...(todos.produtos ?? [])
        .filter((item) => (item as BackupRegistro).projeto_id === projetoId)
        .map((item) => String((item as BackupRegistro).unidade_id ?? "")),
      ...(todos.regras_consumo_equipamentos ?? [])
        .filter((item) => (item as BackupRegistro).projeto_id === projetoId)
        .flatMap((item) => [
          String((item as BackupRegistro).unidade_base_id ?? ""),
          String((item as BackupRegistro).unidade_consumo_id ?? ""),
        ]),
      ...(todos.consumos_equipamentos ?? [])
        .filter((item) => (item as BackupRegistro).projeto_id === projetoId)
        .map((item) => String((item as BackupRegistro).unidade_id ?? "")),
    ].filter(Boolean),
  );
  const tabelas = Object.fromEntries(
    BACKUP_TABELAS.map((nome) => {
      const registros = todos[nome] ?? [];
      if (nome === "categorias") return [nome, registros.filter((item) => categoriasUsadas.has(String((item as BackupRegistro).id)))];
      if (nome === "unidades") return [nome, registros.filter((item) => unidadesUsadas.has(String((item as BackupRegistro).id)))];
      if (nome === "projetos") return [nome, registros.filter((item) => (item as BackupRegistro).id === projetoId)];
      if (nome === "equipe_membros") return [nome, registros.filter((item) => equipes.has(String((item as BackupRegistro).equipe_id)))];
      if (nome === "documento_itens") return [nome, registros.filter((item) => documentos.has(String((item as BackupRegistro).documento_id)))];
      if (nome === "inventario_itens") return [nome, registros.filter((item) => inventarios.has(String((item as BackupRegistro).inventario_id)))];
      if (nome === "apropriacoes") return [nome, registros.filter((item) => estoquesEquipamentos.has(String((item as BackupRegistro).estoque_equipamento_id)))];
      return [nome, registros.filter((item) => (item as BackupRegistro).projeto_id === projetoId)];
    }),
  ) as BackupTabelas;

  const identidade: BackupProjetoIdentidade = {
    id: projeto.id,
    codigo: projeto.codigo,
    nome: projeto.nome,
    status: projeto.status,
    data_inicio: projeto.data_inicio ?? null,
    data_fim: projeto.data_fim ?? null,
  };

  const errosGeracao: string[] = [];
  const avisosGeracao: string[] = [];
  validarDuplicidades(tabelas, errosGeracao);
  validarReferencias(tabelas, identidade, errosGeracao, avisosGeracao);
  if (errosGeracao.length > 0) {
    throw new Error(
      `O projeto atual possui inconsistências que impedem a criação de um backup seguro:\n• ${errosGeracao.join("\n• ")}`,
    );
  }

  const backup: BackupArquivo = {
    formato: BACKUP_FORMATO,
    versao: BACKUP_VERSAO,
    gerado_em: new Date().toISOString(),
    banco: "almoxarifado",
    escopo: "PROJETO",
    projeto: identidade,
    banco_versao: BACKUP_DB_VERSAO,
    tabelas,
  };

  backup.integridade = {
    algoritmo: "SHA-256",
    conteudo_sha256: await sha256(corpoParaIntegridade(backup)),
    observacao: "Integridade do conteúdo do arquivo; não representa assinatura de autenticidade da origem.",
  };

  backup.resumo = {
    tabelas_com_dados: BACKUP_TABELAS.filter((nome) => (tabelas[nome]?.length ?? 0) > 0).length,
    registros_totais: registrosTotal(tabelas),
  };

  return backup;
}

export async function gerarBackupDados(projetoId: string): Promise<void> {
  const backup = await criarBackupDados(projetoId);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup_projeto_${backup.projeto?.codigo ?? "almoxarifado"}_v${BACKUP_VERSAO}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function validarConflitosGlobais(tabelas: BackupTabelas): Promise<void> {
  const db = getDB();
  for (const nome of TABELAS_GLOBAIS) {
    if (!tabelaExiste(nome)) continue;
    const existentes = await db.table(nome).toArray();
    const porId = new Map(existentesPorId(existentes));
    for (const registro of tabelas[nome] ?? []) {
      if (!registro || typeof registro !== "object") continue;
      const item = registro as BackupRegistro;
      const id = String(item.id ?? "");
      if (!id) continue;
      const existente = porId.get(id);
      if (existente && JSON.stringify(estabilizar(existente)) !== JSON.stringify(estabilizar(item))) {
        throw new Error(`Conflito no catálogo global “${nome}”: o ID ${id} já existe com conteúdo diferente. O backup foi bloqueado para evitar alteração silenciosa de dados compartilhados.`);
      }
    }
  }
}

function existentesPorId(registros: unknown[]): Array<[string, unknown]> {
  return registros.flatMap((registro) => {
    if (!registro || typeof registro !== "object") return [];
    const id = String((registro as BackupRegistro).id ?? "");
    return id ? [[id, registro]] as Array<[string, unknown]> : [];
  });
}

async function apagarEscopoProjeto(
  projetoId: string,
  tabelas: BackupTabelas,
  tabelasPresentes: readonly BackupTabela[],
): Promise<number> {
  const presentes = new Set(tabelasPresentes);
  const db = getDB();
  let removidos = 0;
  const apagarPorProjeto = async (nome: string) => {
    if (!tabelaExiste(nome)) return;
    const registros = await db.table(nome).toArray();
    const alvo = registros.filter((registro) => (registro as BackupRegistro).projeto_id === projetoId);
    if (alvo.length) {
      const ids = alvo
        .map((item) => (item as BackupRegistro).id)
        .filter((id): id is string | number => typeof id === "string" || typeof id === "number");
      if (ids.length) {
        await db.table(nome).bulkDelete(ids);
      }
      removidos += alvo.length;
    }
  };

  // Relações sem projeto_id são removidas pelo escopo REAL que já existe no
  // projeto de destino, nunca pelos IDs presentes no arquivo recebido.
  // Isso evita apagar uma relação de outro projeto por causa de um backup
  // malformado e garante substituição integral do projeto atual.
  const idsEquipes = new Set(
    (await db.equipes.where("projeto_id").equals(projetoId).toArray()).map((item) => String(item.id)),
  );
  const idsDocumentos = new Set(
    (await db.documentos.where("projeto_id").equals(projetoId).toArray()).map((item) => String(item.id)),
  );
  const idsInventarios = new Set(
    (await db.inventarios.where("projeto_id").equals(projetoId).toArray()).map((item) => String(item.id)),
  );
  const idsEstoques = new Set(
    (await db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray()).map((item) => String(item.id)),
  );

  if (presentes.has("equipe_membros") && tabelaExiste("equipe_membros")) {
    const registros = await db.equipe_membros.toArray();
    const alvo = registros.filter((item) => idsEquipes.has(item.equipe_id));
    if (alvo.length) {
      await db.equipe_membros.bulkDelete(alvo.map((item) => item.id));
      removidos += alvo.length;
    }
  }

  if (presentes.has("documento_itens") && tabelaExiste("documento_itens")) {
    const registros = await db.documento_itens.toArray();
    const alvo = registros.filter((item) => idsDocumentos.has(item.documento_id));
    if (alvo.length) {
      await db.documento_itens.bulkDelete(alvo.map((item) => item.id));
      removidos += alvo.length;
    }
  }

  if (presentes.has("inventario_itens") && tabelaExiste("inventario_itens")) {
    const registros = await db.inventario_itens.toArray();
    const alvo = registros.filter((item) => idsInventarios.has(item.inventario_id));
    if (alvo.length) {
      await db.inventario_itens.bulkDelete(alvo.map((item) => item.id));
      removidos += alvo.length;
    }
  }

  if (presentes.has("apropriacoes") && tabelaExiste("apropriacoes")) {
    const registros = await db.apropriacoes.toArray();
    const alvo = registros.filter((item) => idsEstoques.has(item.estoque_equipamento_id));
    if (alvo.length) {
      await db.apropriacoes.bulkDelete(alvo.map((item) => item.id));
      removidos += alvo.length;
    }
  }

  for (const nome of [...TABELAS_PROJETO_DIRETO].reverse()) {
    if (presentes.has(nome)) await apagarPorProjeto(nome);
  }

  if (presentes.has("projetos") && tabelaExiste("projetos")) {
    const existente = await db.projetos.get(projetoId);
    if (existente) {
      await db.projetos.delete(projetoId);
      removidos += 1;
    }
  }

  return removidos;
}

export async function restaurarBackupDados(
  json: string,
  options: { projetoAtualId?: string | null; confirmarSubstituicao: boolean } = { confirmarSubstituicao: false },
): Promise<RestaurarBackupResultado> {
  if (!options.confirmarSubstituicao) {
    throw new Error("A restauração precisa ser confirmada na tela de restauração do projeto.");
  }

  const projetoAtualId = options.projetoAtualId ?? null;
  if (!projetoAtualId) {
    throw new Error("Abra um projeto antes de restaurar um backup.");
  }

  const analise = await analisarBackupDados(json, projetoAtualId);
  if (!analise.valido || !analise.projeto || !analise.projeto_igual) {
    throw new Error(analise.erros[0] ?? "O backup não pertence ao projeto ativo ou não passou pelas validações necessárias.");
  }

  const backup = normalizarEntrada(JSON.parse(json));
  await validarConflitosGlobais(backup.tabelas);
  const projetoId = projetoAtualId;
  const tabelasPresentes = backup.tabelas_presentes ?? BACKUP_TABELAS;

  const db = getDB();
  const tabelasExistentes = db.tables.filter((tabela) => BACKUP_TABELAS.includes(tabela.name as BackupTabela));
  if (tabelasExistentes.length !== BACKUP_TABELAS.length) {
    throw new Error("O banco local não possui todas as tabelas necessárias para este backup.");
  }

  let removidos = 0;
  let importados = 0;

  await db.transaction("rw", tabelasExistentes, async () => {
    removidos = await apagarEscopoProjeto(projetoId, backup.tabelas, tabelasPresentes);

    for (const nome of TABELAS_GLOBAIS) {
      if (!tabelasPresentes.includes(nome)) continue;
      const registros = backup.tabelas[nome] ?? [];
      if (registros.length) {
        await db.table(nome).bulkPut(registros);
        importados += registros.length;
      }
    }

    const projeto = tabelasPresentes.includes("projetos") ? backup.tabelas.projetos ?? [] : [];
    if (projeto.length) {
      const projetosImportacao = projeto as Parameters<typeof db.projetos.bulkPut>[0];
      await db.projetos.bulkPut(projetosImportacao);
      importados += projeto.length;
    }

    for (const nome of TABELAS_PROJETO_DIRETO) {
      if (!tabelasPresentes.includes(nome)) continue;
      const registros = backup.tabelas[nome] ?? [];
      if (registros.length) {
        await db.table(nome).bulkPut(registros);
        importados += registros.length;
      }
    }

    const relacoes: Array<[BackupTabela, unknown[]]> = [
      ["equipe_membros", backup.tabelas.equipe_membros ?? []],
      ["documento_itens", backup.tabelas.documento_itens ?? []],
      ["inventario_itens", backup.tabelas.inventario_itens ?? []],
      ["apropriacoes", backup.tabelas.apropriacoes ?? []],
    ];

    for (const [nome, registros] of relacoes) {
      if (!tabelasPresentes.includes(nome)) continue;
      if (registros.length) {
        await db.table(nome).bulkPut(registros);
        importados += registros.length;
      }
    }

    // Confere a restauração antes de confirmar a transação. Se qualquer
    // quantidade divergir, o throw faz o IndexedDB desfazer tudo.
    const conferirProjeto = async (nome: string, esperado: number) => {
      const registros = await db.table(nome).toArray() as BackupRegistro[];
      return registros.filter((item) => String(item.projeto_id ?? "") === projetoId).length === esperado;
    };

    for (const nome of TABELAS_PROJETO_DIRETO) {
      if (!tabelasPresentes.includes(nome)) continue;
      const esperado = backup.tabelas[nome]?.length ?? 0;
      if (!(await conferirProjeto(nome, esperado))) {
        throw new Error(`Falha de integridade na restauração: a tabela “${nome}” não contém a quantidade esperada de registros do projeto após a gravação.`);
      }
    }

    if (tabelasPresentes.includes("projetos")) {
      const projetoRestaurado = await db.projetos.get(projetoId);
      if (!projetoRestaurado) throw new Error("Falha de integridade na restauração: o projeto restaurado não foi encontrado após a gravação.");
    }

    const conferirRelacionada = async (nome: string, campo: string, pais: Set<string>, esperado: number) => {
      const registros = await db.table(nome).toArray() as BackupRegistro[];
      const quantidade = registros.filter((item) => pais.has(String(item[campo] ?? ""))).length;
      if (quantidade !== esperado) {
        throw new Error(`Falha de integridade na restauração: a tabela “${nome}” contém ${quantidade} relações, mas o backup possui ${esperado}.`);
      }
    };

    await conferirRelacionada("equipe_membros", "equipe_id", new Set((backup.tabelas.equipes ?? []).map((item) => String((item as BackupRegistro).id))), backup.tabelas.equipe_membros?.length ?? 0);
    await conferirRelacionada("documento_itens", "documento_id", new Set((backup.tabelas.documentos ?? []).map((item) => String((item as BackupRegistro).id))), backup.tabelas.documento_itens?.length ?? 0);
    await conferirRelacionada("inventario_itens", "inventario_id", new Set((backup.tabelas.inventarios ?? []).map((item) => String((item as BackupRegistro).id))), backup.tabelas.inventario_itens?.length ?? 0);
    await conferirRelacionada("apropriacoes", "estoque_equipamento_id", new Set((backup.tabelas.estoque_equipamentos ?? []).map((item) => String((item as BackupRegistro).id))), backup.tabelas.apropriacoes?.length ?? 0);
  });

  return {
    projetoId,
    registrosImportados: importados,
    registrosSubstituidos: removidos,
  };
}

export function contarRegistrosBackup(backup: BackupArquivo): Record<string, number> {
  return Object.fromEntries(
    BACKUP_TABELAS.map((nome) => [nome, Array.isArray(backup.tabelas[nome]) ? backup.tabelas[nome].length : 0]),
  );
}
