import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArchiveRestore,
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Fingerprint,
  HardDriveDownload,
  Import,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOnline, useProjetoAtivoId } from "@/hooks/useAppData";
import { getDB } from "@/db/db";
import {
  BACKUP_VERSAO,
  analisarBackupDados,
  gerarBackupDados,
  restaurarBackupDados,
  type BackupAnalise,
} from "@/services/backup";
import { exportarProjetoParaExcel } from "@/services/exportacao-projeto";
import { lerArquivo, salvarDataset, type DatasetImportado } from "@/services/excel";
import { num } from "@/utils/format";

export const Route = createFileRoute("/app/dados")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dados e Backup — Almoxarifado" },
      {
        name: "description",
        content: "Gerenciamento de backup, restauração e exportação do projeto para Excel.",
      },
    ],
  }),
  component: DadosPage,
});

type Modulo = {
  tabela: string;
  label: string;
  descricao: string;
  grupo: "Base" | "Materiais" | "Equipamentos" | "Documentos" | "Inventário" | "Inteligência" | "Sistema";
};

const MODULOS: Modulo[] = [
  { tabela: "projetos", label: "Projetos", descricao: "Identidade e ciclo de vida dos projetos.", grupo: "Base" },
  { tabela: "categorias", label: "Categorias", descricao: "Catálogo global de materiais.", grupo: "Base" },
  { tabela: "categorias_equipamentos", label: "Categorias de equipamentos", descricao: "Classificação dos equipamentos por projeto.", grupo: "Equipamentos" },
  { tabela: "unidades", label: "Unidades", descricao: "Unidades de medida compartilhadas.", grupo: "Base" },
  { tabela: "empresas", label: "Empresas", descricao: "Empresas próprias, terceiros e fornecedores.", grupo: "Base" },
  { tabela: "funcionarios", label: "Funcionários", descricao: "Pessoas e vínculos organizacionais.", grupo: "Base" },
  { tabela: "locais", label: "Locais", descricao: "Locais físicos e frentes de trabalho.", grupo: "Base" },
  { tabela: "produtos", label: "Produtos", descricao: "Materiais, consumíveis e insumos.", grupo: "Materiais" },
  { tabela: "movimentacoes", label: "Movimentações", descricao: "Entradas, saídas, transferências e ajustes.", grupo: "Materiais" },
  { tabela: "equipes", label: "Equipes", descricao: "Equipes que segregam o estoque e a operação.", grupo: "Base" },
  { tabela: "equipe_membros", label: "Membros de equipes", descricao: "Relacionamento entre equipes e funcionários.", grupo: "Base" },
  { tabela: "arquivos", label: "Arquivos", descricao: "Metadados dos arquivos vinculados ao projeto.", grupo: "Sistema" },
  { tabela: "equipamentos", label: "Equipamentos", descricao: "Catálogo de modelos e parâmetros financeiros.", grupo: "Equipamentos" },
  { tabela: "estoque_equipamentos", label: "Estoque de equipamentos", descricao: "Unidades físicas e lotes controlados.", grupo: "Equipamentos" },
  { tabela: "apropriacoes", label: "Apropriações", descricao: "Equipamentos atribuídos a funcionários.", grupo: "Equipamentos" },
  { tabela: "movimentacoes_equipamentos", label: "Movimentações de equipamentos", descricao: "Histórico físico e operacional dos equipamentos.", grupo: "Equipamentos" },
  { tabela: "regras_consumo_equipamentos", label: "Regras de consumo", descricao: "Parâmetros de consumo por equipamento e produto.", grupo: "Equipamentos" },
  { tabela: "consumos_equipamentos", label: "Consumos de equipamentos", descricao: "Apropriações analíticas das saídas de materiais.", grupo: "Equipamentos" },
  { tabela: "manutencoes_equipamentos", label: "Manutenções", descricao: "Ocorrências técnicas e ciclo de manutenção.", grupo: "Equipamentos" },
  { tabela: "manutencao_documentos", label: "Documentos de manutenção", descricao: "Vínculos entre manutenção e documentação.", grupo: "Equipamentos" },
  { tabela: "apropriacoes_financeiras_equipamentos", label: "Apropriações financeiras", descricao: "Rateios de documentos para equipamentos.", grupo: "Equipamentos" },
  { tabela: "perfis_parametros_custos", label: "Perfis de parâmetros", descricao: "Versões reutilizáveis para simulação de custos.", grupo: "Equipamentos" },
  { tabela: "documentos", label: "Documentos", descricao: "Notas fiscais, romaneios, pedidos e documentos internos.", grupo: "Documentos" },
  { tabela: "documento_itens", label: "Itens de documentos", descricao: "Itens, quantidades e valores documentais.", grupo: "Documentos" },
  { tabela: "documento_referencias", label: "Referências de documentos", descricao: "Relações entre documentos.", grupo: "Documentos" },
  { tabela: "inventarios", label: "Inventários", descricao: "Inventários físicos e seus estados.", grupo: "Inventário" },
  { tabela: "inventario_itens", label: "Itens de inventário", descricao: "Posições, contagens e divergências.", grupo: "Inventário" },
  { tabela: "inteligencia_acoes", label: "Ações de inteligência", descricao: "Acompanhamento, execução e resultado das recomendações.", grupo: "Inteligência" },
  { tabela: "configuracoes", label: "Configurações", descricao: "Regras, módulos habilitados e políticas do projeto.", grupo: "Sistema" },
];

const GRUPOS = ["Base", "Materiais", "Equipamentos", "Documentos", "Inventário", "Inteligência", "Sistema"] as const;

type BackupPreview = {
  fileName: string;
  fileSize: number;
  json: string;
  analise: BackupAnalise;
};

function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


function DadosPage() {
  const [projetoId] = useProjetoAtivoId();
  const online = useOnline();
  const inputXlsx = useRef<HTMLInputElement>(null);
  const inputBackup = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<DatasetImportado | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [backupAceite, setBackupAceite] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [statusRestauracao, setStatusRestauracao] = useState("Revalidando integridade e relacionamentos…");
  const [processando, setProcessando] = useState(false);

  const dados = useLiveQuery(async () => {
    const db = getDB();
    const tabelas: Array<[string, any[]]> = await Promise.all(
      MODULOS.map(async ({ tabela }): Promise<[string, any[]]> => {
        const existe = db.tables.some((item) => item.name === tabela);
        if (!existe) return [tabela, []];
        return [tabela, await db.table(tabela).toArray()];
      }),
    );

    const mapa = new Map<string, any[]>(tabelas);
    if (!projetoId) {
      return MODULOS.map((modulo) => ({ ...modulo, quantidade: 0 }));
    }

    const equipeIds = new Set(
      (mapa.get("equipes") ?? [])
        .filter((item) => item.projeto_id === projetoId)
        .map((item) => String(item.id)),
    );
    const documentoIds = new Set(
      (mapa.get("documentos") ?? [])
        .filter((item) => item.projeto_id === projetoId)
        .map((item) => String(item.id)),
    );
    const inventarioIds = new Set(
      (mapa.get("inventarios") ?? [])
        .filter((item) => item.projeto_id === projetoId)
        .map((item) => String(item.id)),
    );
    const estoqueEquipamentoIds = new Set(
      (mapa.get("estoque_equipamentos") ?? [])
        .filter((item) => item.projeto_id === projetoId)
        .map((item) => String(item.id)),
    );

    const contar = (tabela: string) => {
      const registros = mapa.get(tabela) ?? [];
      if (["categorias", "unidades"].includes(tabela)) return registros.length;
      if (tabela === "equipe_membros") return registros.filter((item) => equipeIds.has(String(item.equipe_id))).length;
      if (tabela === "apropriacoes") return registros.filter((item) => estoqueEquipamentoIds.has(String(item.estoque_equipamento_id))).length;
      if (tabela === "documento_itens") return registros.filter((item) => documentoIds.has(String(item.documento_id))).length;
      if (tabela === "inventario_itens") return registros.filter((item) => inventarioIds.has(String(item.inventario_id))).length;
      if (tabela === "projetos") return registros.filter((item) => item.id === projetoId).length;
      return registros.filter((item) => !item.projeto_id || item.projeto_id === projetoId).length;
    };

    return MODULOS.map((modulo) => ({ ...modulo, quantidade: contar(modulo.tabela) }));
  }, [projetoId]);

  const totalRegistros = useMemo(
    () => (dados ?? []).reduce((total, modulo) => total + modulo.quantidade, 0),
    [dados],
  );

  const gruposDados = useMemo(() => {
    return GRUPOS.map((grupo) => ({
      grupo,
      itens: (dados ?? []).filter((item) => item.grupo === grupo),
      total: (dados ?? [])
        .filter((item) => item.grupo === grupo)
        .reduce((total, item) => total + item.quantidade, 0),
    })).filter((item) => item.itens.length > 0);
  }, [dados]);

  const exportarExcel = async () => {
    if (!projetoId) return;
    try {
      setProcessando(true);
      await exportarProjetoParaExcel(projetoId);
      toast.success("Projeto exportado para Excel.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar o projeto.");
    } finally {
      setProcessando(false);
    }
  };

  const gerarBackup = async () => {
    if (!projetoId) {
      toast.error("Selecione um projeto antes de gerar o backup.");
      return;
    }
    try {
      setProcessando(true);
      await gerarBackupDados(projetoId);
      toast.success(`Backup de projeto v${BACKUP_VERSAO} gerado com integridade SHA-256.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o backup.");
    } finally {
      setProcessando(false);
    }
  };

  const importarPlanilha = async (file: File) => {
    try {
      setPreview(lerArquivo(await file.arrayBuffer()));
    } catch (error) {
      toast.error(`Falha ao ler a planilha: ${error instanceof Error ? error.message : "arquivo inválido"}`);
    }
  };

  const confirmarImportacao = async () => {
    if (!preview || !projetoId) return;
    try {
      setProcessando(true);
      await salvarDataset(preview, projetoId);
      setPreview(null);
      toast.success("Dados da planilha importados para o projeto ativo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar a planilha.");
    } finally {
      setProcessando(false);
    }
  };

  const prepararBackup = async (file: File) => {
    try {
      setRestaurando(true);
      setStatusRestauracao("Lendo e validando o arquivo…");
      const json = await file.text();
      setStatusRestauracao("Conferindo o projeto de origem e a integridade do backup…");
      const analise = await analisarBackupDados(json, projetoId);
      setBackupAceite(false);
      setBackupPreview({ fileName: file.name, fileSize: file.size, json, analise });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o backup.");
    } finally {
      setRestaurando(false);
    }
  };

  const confirmarRestauracao = async () => {
    if (!projetoId) {
      toast.error("Abra um projeto antes de restaurar um backup.");
      return;
    }
    if (!backupPreview || !backupAceite) return;
    try {
      setRestaurando(true);
      setStatusRestauracao("Aplicando o backup ao projeto autorizado…");
      const resultado = await restaurarBackupDados(backupPreview.json, {
        projetoAtualId: projetoId,
        confirmarSubstituicao: true,
      });
      setStatusRestauracao("Restauração concluída com sucesso.");
      setBackupPreview(null);
      setBackupAceite(false);
      toast.success(`Projeto restaurado: ${num(resultado.registrosImportados)} registros restaurados e ${num(resultado.registrosSubstituidos)} registros substituídos.`);
    } catch (error) {
      setStatusRestauracao("A importação foi interrompida. Nenhum dado parcial foi aplicado.");
      toast.error(error instanceof Error ? error.message : "Não foi possível restaurar o backup.");
    } finally {
      setRestaurando(false);
    }
  };

  const podeRestaurar = !!backupPreview && backupPreview.analise.valido && backupPreview.analise.projeto_igual && backupAceite && !restaurando;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-8">
      <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Dados</h1>
                <Badge variant="outline">Gestão do aplicativo</Badge>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                Backup e restauração do projeto ativo. O arquivo só pode restaurar o mesmo projeto que o gerou.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span className={`size-2 rounded-full ${online ? "bg-success" : "bg-primary"}`} />
            {online ? "Online" : "Offline"}
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><FileSpreadsheet className="size-5" /></div>
              <div>
                <h2 className="font-semibold">Exportar projeto para Excel</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Relatório humano para conferência, apresentações e análise fora do sistema.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/10 p-3"><p className="text-xs text-muted-foreground">Projeto ativo</p><p className="mt-1 text-sm font-semibold">{projetoId ? "Selecionado" : "Nenhum"}</p></div>
              <div className="rounded-xl border bg-muted/10 p-3"><p className="text-xs text-muted-foreground">Módulos</p><p className="mt-1 num text-lg font-bold">{dados?.length ?? 0}</p></div>
              <div className="rounded-xl border bg-muted/10 p-3"><p className="text-xs text-muted-foreground">Registros</p><p className="mt-1 num text-lg font-bold">{num(totalRegistros)}</p></div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 text-sm">
              <p className="font-semibold">O Excel não é o backup.</p>
              <p className="mt-1 leading-5 text-muted-foreground">A exportação é orientada à leitura humana. Para restauração integral, use o JSON de backup do projeto.</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void exportarExcel()} disabled={processando || !projetoId} className="sm:flex-1">
                {processando ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
                Exportar projeto
              </Button>
              <Button variant="outline" onClick={() => inputXlsx.current?.click()} disabled={processando || !projetoId} className="sm:flex-1">
                <Import className="size-4" /> Importar planilha
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-700"><ShieldCheck className="size-5" /></div>
              <div>
                <h2 className="font-semibold">Backup integral do projeto</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">JSON completo, isolado pelo projeto ativo e validado por SHA-256.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4 text-sm dark:bg-emerald-950/20">
                <p className="font-semibold">Formato v{BACKUP_VERSAO}</p>
                <p className="mt-1 leading-5 text-muted-foreground">Todos os módulos atuais, incluindo custos, manutenção, regras, perfis e inteligência.</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 text-sm">
                <p className="font-semibold flex items-center gap-2"><Fingerprint className="size-4 text-primary" /> Integridade SHA-256</p>
                <p className="mt-1 leading-5 text-muted-foreground">O conteúdo é verificado antes da restauração.</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void gerarBackup()} disabled={processando || !projetoId} className="sm:flex-1">
                {processando ? <RefreshCw className="size-4 animate-spin" /> : <HardDriveDownload className="size-4" />}
                Gerar backup
              </Button>
              <Button variant="outline" onClick={() => inputBackup.current?.click()} disabled={!projetoId || restaurando || processando} className="sm:flex-1">
                {restaurando ? <RefreshCw className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
                Restaurar projeto
              </Button>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">O backup só pode ser restaurado no projeto ativo que possui a mesma identidade do arquivo. A restauração substitui o estado salvo desse projeto.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold">Estrutura coberta pelo backup</h2>
              <p className="mt-1 text-sm text-muted-foreground">A estrutura abaixo acompanha o banco atual, incluindo os módulos adicionados nas últimas etapas.</p>
            </div>
            <Badge variant="secondary">{MODULOS.length} tabelas</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-5">
            {gruposDados.map((grupo) => (
              <section key={grupo.grupo}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">{grupo.grupo}</h3>
                  <span className="num text-xs text-muted-foreground">{num(grupo.total)} registros</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grupo.itens.map((modulo) => (
                    <div key={modulo.tabela} className="rounded-xl border p-4 transition-colors hover:bg-muted/20">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{modulo.label}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{modulo.descricao}</p>
                        </div>
                        <span className="num shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{num(modulo.quantidade)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>

      <input
        ref={inputXlsx}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importarPlanilha(file);
        }}
      />
      <input
        ref={inputBackup}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void prepararBackup(file);
        }}
      />

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pré-visualização da importação do projeto</DialogTitle>
            <DialogDescription>Os dados da planilha substituirão os dados atuais do projeto ativo. A importação só grava após todas as validações.</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <div className="space-y-3 text-sm">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="font-semibold">
                    {num(
                      Object.values(preview.contagens).reduce(
                        (total, quantidade) => total + quantidade,
                        0,
                      ),
                    )}{" "}
                    registros · {Object.values(preview.contagens).filter(Boolean).length} módulos
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A planilha foi reconhecida em todas as tabelas suportadas pelo projeto.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["Produtos", preview.contagens["produtos"]],
                    ["Movimentações", preview.contagens["movimentacoes"]],
                    ["Equipamentos", preview.contagens["equipamentos"]],
                    ["Estoque de equipamentos", preview.contagens["estoque_equipamentos"]],
                    ["Mov. equipamentos", preview.contagens["movimentacoes_equipamentos"]],
                    ["Manutenções", preview.contagens["manutencoes_equipamentos"]],
                    ["Documentos", preview.contagens["documentos"]],
                    ["Itens de documentos", preview.contagens["documento_itens"]],
                    ["Inventários", preview.contagens["inventarios"]],
                    ["Itens de inventário", preview.contagens["inventario_itens"]],
                    ["Consumos", preview.contagens["consumos_equipamentos"]],
                    ["Regras de consumo", preview.contagens["regras_consumo_equipamentos"]],
                    ["Perfis de custos", preview.contagens["perfis_parametros_custos"]],
                    ["Inteligência", preview.contagens["inteligencia_acoes"]],
                  ].map(([label, quantidade]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="num font-semibold">
                        {num(Number(quantidade ?? 0))}
                      </span>
                    </div>
                  ))}
                </div>

                {preview.problemas.length > 0 && (
                  <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-destructive">
                    {preview.problemas.map((problema) => (
                      <li key={problema}>{problema}</li>
                    ))}
                  </ul>
                )}
              </div>
              {preview.problemas.length > 0 && (
                <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-destructive">
                  {preview.problemas.map((problema) => <li key={problema}>{problema}</li>)}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancelar</Button>
            <Button onClick={() => void confirmarImportacao()} disabled={processando || !!preview?.problemas.length}>Importar projeto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!backupPreview} onOpenChange={(open) => !open && setBackupPreview(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="size-5 text-primary" />
              Pré-visualização da restauração
            </DialogTitle>
            <DialogDescription>
              Selecione um backup deste projeto. O sistema só permitirá a restauração se o arquivo pertencer ao projeto ativo e passar pelas verificações de integridade.
            </DialogDescription>
          </DialogHeader>

          {backupPreview && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <InfoBox label="Arquivo" valor={backupPreview.fileName} detalhe={formatarBytes(backupPreview.fileSize)} />
                <InfoBox label="Formato" valor={`v${backupPreview.analise.versao}`} detalhe={backupPreview.analise.compatibilidade} />
                <InfoBox label="Registros" valor={num(backupPreview.analise.registros_totais)} detalhe={`${backupPreview.analise.tabelas_com_dados} tabelas com dados`} />
                <InfoBox label="Estrutura" valor={`${MODULOS.length - backupPreview.analise.tabelas_ausentes.length}/${MODULOS.length} tabelas`} detalhe={backupPreview.analise.tabelas_ausentes.length ? `${backupPreview.analise.tabelas_ausentes.length} ausente(s)` : "estrutura completa"} />
              </div>

              <div className="rounded-2xl border bg-muted/15 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  {backupPreview.analise.erros.length === 0 ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                  ) : (
                    <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{backupPreview.analise.projeto ? `${backupPreview.analise.projeto.codigo} · ${backupPreview.analise.projeto.nome}` : "Projeto não identificado"}</p>
                    <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                      <p><span className="text-muted-foreground">ID do backup:</span> <span className="font-medium break-all">{backupPreview.analise.projeto?.id ?? "—"}</span></p>
                      <p><span className="text-muted-foreground">Projeto ativo:</span> <span className="font-medium break-all">{backupPreview.analise.projeto_atual_id ?? "nenhum"}</span></p>
                    </div>
                    {backupPreview.analise.projeto_igual ? (
                      <Badge className="mt-3 border-success/30 bg-success/10 text-success">Backup pertence ao projeto ativo</Badge>
                    ) : backupPreview.analise.projeto_atual_id ? (
                      <Badge className="mt-3 border-destructive/30 bg-destructive/10 text-destructive">Backup de outro projeto — restauração bloqueada</Badge>
                    ) : (
                      <Badge className="mt-3 border-destructive/30 bg-destructive/10 text-destructive">Nenhum projeto ativo — restauração bloqueada</Badge>
                    )}
                  </div>
                </div>
              </div>

              {restaurando ? (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4" role="status" aria-live="polite">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="size-4 animate-spin text-primary" />
                    <div>
                      <p className="text-sm font-semibold">Restaurando projeto</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{statusRestauracao}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {backupPreview.analise.erros.length > 0 ? (
                <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-destructive"><AlertTriangle className="size-4" /> Restauração bloqueada</div>
                  <ul className="mt-2 max-h-44 list-disc space-y-1 overflow-y-auto pl-5 text-xs leading-5 text-destructive">
                    {backupPreview.analise.erros.map((erro) => <li key={erro}>{erro}</li>)}
                  </ul>
                </section>
              ) : null}

              {backupPreview.analise.avisos.length > 0 ? (
                <section className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-warning"><AlertTriangle className="size-4" /> Verificações adicionais</div>
                  <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-5 text-xs leading-5">
                    {backupPreview.analise.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}
                  </ul>
                </section>
              ) : null}

              <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.045] p-4 shadow-sm sm:p-5">
                <div className="flex items-start gap-3">
                  <input
                    id="aceitar-backup"
                    type="checkbox"
                    checked={backupAceite}
                    onChange={(event) => setBackupAceite(event.target.checked)}
                    disabled={!backupPreview.analise.valido || !backupPreview.analise.projeto_igual || restaurando}
                    className="mt-0.5 size-5 shrink-0 accent-primary"
                  />
                  <label htmlFor="aceitar-backup" className="cursor-pointer text-sm leading-5">
                    <span className="font-semibold text-foreground">Confirmo a restauração deste projeto.</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      Confirmo que este arquivo pertence ao projeto ativo e autorizo substituir os dados atuais desse projeto pelo estado salvo no backup. Outros projetos não serão alterados.
                    </span>
                  </label>
                </div>
              </div>


            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setBackupPreview(null); setBackupAceite(false); setStatusRestauracao("Revalidando integridade e relacionamentos…"); }} disabled={restaurando}>Cancelar</Button>
            <Button onClick={() => void confirmarRestauracao()} disabled={!podeRestaurar}>
              {restaurando ? <RefreshCw className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
              Restaurar projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoBox({ label, valor, detalhe }: { label: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-xl border bg-muted/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{valor}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detalhe}</p>
    </div>
  );
}
