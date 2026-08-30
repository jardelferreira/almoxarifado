import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Database, Download, FileSpreadsheet, HardDriveDownload, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDados, useOnline, useProjetoAtivoId } from "@/hooks/useAppData";
import {
  exportarProjeto,
  gerarBackup,
  lerArquivo,
  restaurarBackup,
  salvarDataset,
  type DatasetImportado,
} from "@/services/excel";
import { num } from "@/utils/format";

export const Route = createFileRoute("/app/dados")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dados, Excel e Backup — Almoxarifado Offline" },
      {
        name: "description",
        content:
          "Importe e exporte a planilha modelo em Excel, gere backups locais e restaure os dados do almoxarifado.",
      },
      { property: "og:title", content: "Dados, Excel e Backup" },
      {
        property: "og:description",
        content: "Importação e exportação XLSX e backup local dos dados do almoxarifado.",
      },
    ],
  }),
  component: DadosPage,
});

function DadosPage() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const online = useOnline();
  const [preview, setPreview] = useState<DatasetImportado | null>(null);
  const inputXlsx = useRef<HTMLInputElement>(null);
  const inputBackup = useRef<HTMLInputElement>(null);

  const importar = async (file: File) => {
    try {
      setPreview(lerArquivo(await file.arrayBuffer()));
    } catch (e) {
      toast.error(`Falha ao ler a planilha: ${(e as Error).message}`);
    }
  };

  const confirmar = async () => {
    if (!preview || !projetoId) return;
    await salvarDataset(preview, projetoId);
    setPreview(null);
    toast.success("Dados importados para este projeto");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase">Dados</h1>
        <p className="text-sm text-muted-foreground">
          Tudo é salvo no navegador (IndexedDB).{" "}
          {online ? "Você está online." : "Modo offline — dados salvos neste dispositivo."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="size-4" /> Excel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O arquivo exportado mantém as mesmas abas do modelo e pode ser reimportado.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  if (!projetoId) return;
                  await exportarProjeto(projetoId);
                  toast.success("Planilha exportada");
                }}
              >
                <Download className="size-4" /> Exportar projeto
              </Button>
              <Button variant="outline" onClick={() => inputXlsx.current?.click()}>
                <Upload className="size-4" /> Importar planilha
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDriveDownload className="size-4" /> Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Backup completo de todos os projetos em arquivo JSON.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  await gerarBackup();
                  toast.success("Backup gerado");
                }}
              >
                <Download className="size-4" /> Backup dos dados
              </Button>
              <Button variant="outline" onClick={() => inputBackup.current?.click()}>
                <Upload className="size-4" /> Restaurar backup
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4" /> Conteúdo armazenado
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {dados &&
            (
              [
                ["Movimentações", dados.movimentacoes.length],
                ["Produtos", dados.produtos.length],
                ["Funcionários", dados.funcionarios.length],
                ["Empresas", dados.empresas.length],
                ["Locais", dados.locais.length],
                ["Categorias", dados.categorias.length],
                ["Unidades", dados.unidades.length],
                ["Equipes", dados.equipes.length],
                ["Membros de equipes", dados.equipeMembros.length],
                ["Projetos", dados.projetos.length],
              ] as const
            ).map(([label, valor]) => (
              <div key={label} className="rounded-md border border-border p-3">
                <p className="num font-display text-2xl font-bold">{num(valor)}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
        </CardContent>
      </Card>

      <input
        ref={inputXlsx}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importar(f);
          e.target.value = "";
        }}
      />
      <input
        ref={inputBackup}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (!confirm("Restaurar backup substitui TODOS os dados atuais. Continuar?")) return;
          await restaurarBackup(await f.text());
          toast.success("Backup restaurado");
        }}
      />

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pré-visualização da importação</DialogTitle>
            <DialogDescription>
              Os registros serão mesclados por ID no projeto atual.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <p>
                {num(preview.movimentacoes.length)} movimentações · {num(preview.produtos.length)}{" "}
                produtos · {num(preview.funcionarios.length)} funcionários ·{" "}
                {num(preview.empresas.length)} empresas
              </p>
              {preview.problemas.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive">
                  {preview.problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmar}>Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
