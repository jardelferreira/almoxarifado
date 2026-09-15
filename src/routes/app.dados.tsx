import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArchiveRestore,
  Database,
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  Import,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOnline, useProjetoAtivoId } from "@/hooks/useAppData";
import { getDB } from "@/db/db";
import { BACKUP_VERSAO, gerarBackupDados, restaurarBackupDados } from "@/services/backup";
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
};

const MODULOS: Modulo[] = [
  { tabela: "projetos", label: "Projetos", descricao: "Identidade e ciclo de vida dos projetos." },
  { tabela: "categorias", label: "Categorias", descricao: "Catálogo de materiais." },
  { tabela: "categorias_equipamentos", label: "Categorias de equipamentos", descricao: "Classificação dos equipamentos." },
  { tabela: "unidades", label: "Unidades", descricao: "Unidades de medida." },
  { tabela: "empresas", label: "Empresas", descricao: "Empresas relacionadas ao projeto." },
  { tabela: "funcionarios", label: "Funcionários", descricao: "Pessoas e vínculos organizacionais." },
  { tabela: "locais", label: "Locais", descricao: "Locais físicos utilizados pelo almoxarifado." },
  { tabela: "produtos", label: "Produtos", descricao: "Cadastro dos materiais." },
  { tabela: "movimentacoes", label: "Movimentações", descricao: "Histórico de entradas, saídas e ajustes." },
  { tabela: "equipes", label: "Equipes", descricao: "Equipes que segregam o estoque." },
  { tabela: "equipe_membros", label: "Membros de equipes", descricao: "Relacionamento entre equipes e funcionários." },
  { tabela: "arquivos", label: "Arquivos", descricao: "Metadados dos arquivos vinculados ao projeto." },
  { tabela: "equipamentos", label: "Equipamentos", descricao: "Cadastro dos equipamentos." },
  { tabela: "estoque_equipamentos", label: "Estoque de equipamentos", descricao: "Registros físicos/lotes de equipamentos." },
  { tabela: "apropriacoes", label: "Apropriações", descricao: "Equipamentos apropriados por funcionários." },
  { tabela: "movimentacoes_equipamentos", label: "Movimentações de equipamentos", descricao: "Histórico operacional dos equipamentos." },
  { tabela: "configuracoes", label: "Configurações", descricao: "Regras do projeto e módulos habilitados." },
  { tabela: "documentos", label: "Documentos", descricao: "Documentos vinculados às operações." },
  { tabela: "documento_itens", label: "Itens de documentos", descricao: "Itens documentais e quantidades." },
  { tabela: "documento_referencias", label: "Referências de documentos", descricao: "Relações entre documentos." },
  { tabela: "inventarios", label: "Inventários", descricao: "Inventários físicos e seus estados." },
  { tabela: "inventario_itens", label: "Itens de inventário", descricao: "Posições contadas e divergências." },
];

function DadosPage() {
  const [projetoId] = useProjetoAtivoId();
  const online = useOnline();
  const inputXlsx = useRef<HTMLInputElement>(null);
  const inputBackup = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<DatasetImportado | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [processando, setProcessando] = useState(false);

  const dados = useLiveQuery(async () => {
    if (!projetoId) return null;

    const db = getDB();
    const tabelas: Array<[string, any[]]> = await Promise.all(
      MODULOS.map(async ({ tabela }): Promise<[string, any[]]> => {
        const existe = db.tables.some((item) => item.name === tabela);
        if (!existe) return [tabela, []];
        return [tabela, await db.table(tabela).toArray()];
      }),
    );

    const mapa = new Map<string, any[]>(tabelas);
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
    try {
      setProcessando(true);
      await gerarBackupDados();
      toast.success(`Backup v${BACKUP_VERSAO} gerado com todos os módulos.`);
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

  const restaurar = async (file: File) => {
    setRestaurando(true);
    try {
      await restaurarBackupDados(await file.text());
      toast.success("Backup restaurado. Todos os módulos presentes no formato foram recuperados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível restaurar o backup.");
    } finally {
      setRestaurando(false);
    }
  };

  if (!projetoId) {
    return <p className="text-sm text-muted-foreground">Nenhum projeto ativo.</p>;
  }

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
                Separe o arquivo de segurança do sistema da exportação legível do projeto. O backup preserva a estrutura interpretável; o Excel é preparado para conferência humana.
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
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Relatório humano, organizado por módulos, com IDs do sistema preservados para rastreabilidade.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/10 p-3"><p className="text-xs text-muted-foreground">Projeto ativo</p><p className="mt-1 text-sm font-semibold">Exportação isolada</p></div>
              <div className="rounded-xl border bg-muted/10 p-3"><p className="text-xs text-muted-foreground">Módulos</p><p className="mt-1 num text-lg font-bold">{dados?.length ?? 0}</p></div>
              <div className="rounded-xl border bg-muted/10 p-3"><p className="text-xs text-muted-foreground">Registros</p><p className="mt-1 num text-lg font-bold">{num(totalRegistros)}</p></div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 text-sm">
              <p className="font-semibold">O Excel não é o backup.</p>
              <p className="mt-1 leading-5 text-muted-foreground">Ele contém nomes e descrições legíveis, relações identificadas, índices/IDs do sistema, estoque atual e abas mesmo quando um módulo está vazio.</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void exportarExcel()} disabled={processando} className="sm:flex-1">
                {processando ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
                Exportar projeto
              </Button>
              <Button variant="outline" onClick={() => inputXlsx.current?.click()} disabled={processando} className="sm:flex-1">
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
                <h2 className="font-semibold">Backup dos dados</h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Arquivo JSON destinado à integridade e restauração dos dados interpretados pelo sistema.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4 text-sm dark:bg-emerald-950/20">
              <p className="font-semibold">Backup v{BACKUP_VERSAO}</p>
              <p className="mt-1 leading-5 text-muted-foreground">Inclui todos os módulos conhecidos pelo formato, mesmo que estejam sem registros. Isso mantém a estrutura compatível com futuras restaurações.</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void gerarBackup()} disabled={processando} className="sm:flex-1">
                {processando ? <RefreshCw className="size-4 animate-spin" /> : <HardDriveDownload className="size-4" />}
                Gerar backup
              </Button>
              <Button variant="outline" onClick={() => inputBackup.current?.click()} disabled={restaurando || processando} className="sm:flex-1">
                {restaurando ? <RefreshCw className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
                Restaurar backup
              </Button>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">A restauração substitui os dados atuais das tabelas incluídas no formato. Use somente um backup confiável.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold">Módulos incluídos no gerenciamento de dados</h2>
              <p className="mt-1 text-sm text-muted-foreground">A estrutura abaixo permanece visível mesmo quando o módulo ainda não possui registros.</p>
            </div>
            <Badge variant="secondary">{dados?.length ?? 0} módulos</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(dados ?? MODULOS.map((modulo) => ({ ...modulo, quantidade: 0 }))).map((modulo) => (
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
          if (file) void restaurar(file);
        }}
      />

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pré-visualização da importação</DialogTitle>
            <DialogDescription>Os registros serão mesclados por ID no projeto atual.</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <p>{num(preview.movimentacoes.length)} movimentações · {num(preview.produtos.length)} produtos · {num(preview.funcionarios.length)} funcionários · {num(preview.empresas.length)} empresas</p>
              {preview.problemas.length > 0 && (
                <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-destructive">
                  {preview.problemas.map((problema) => <li key={problema}>{problema}</li>)}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancelar</Button>
            <Button onClick={() => void confirmarImportacao()} disabled={processando}>Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
