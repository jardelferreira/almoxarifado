import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Copy,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useProjetoAtivoId, useProjetos, useOnline } from "@/hooks/useAppData";
import { repo } from "@/services/repo";
import {
  lerArquivo,
  restaurarBackup,
  salvarDataset,
  type DatasetImportado,
} from "@/services/excel";
import { formatarData, hoje } from "@/utils/format";
import { uid } from "@/db/db";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Gestão de Almoxarifado Offline — Projetos" },
      {
        name: "description",
        content:
          "Aplicativo local-first de gestão de almoxarifado: controle de estoque, movimentações e dashboard, funcionando offline no seu dispositivo.",
      },
      { property: "og:title", content: "Gestão de Almoxarifado Offline" },
      {
        property: "og:description",
        content:
          "Controle de estoque, movimentações e dashboard offline, com importação e exportação em Excel.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const projetos = useProjetos();
  const [, setProjetoAtivo] = useProjetoAtivoId();
  const navigate = useNavigate();
  const online = useOnline();
  const [novoAberto, setNovoAberto] = useState(false);
  const [form, setForm] = useState({
    codigo: "",
    nome: "",
    empresa: "",
    data_inicio: hoje(),
    data_fim: "",
  });
  const [preview, setPreview] = useState<DatasetImportado | null>(null);
  const inputXlsx = useRef<HTMLInputElement>(null);
  const inputBackup = useRef<HTMLInputElement>(null);

  const abrir = (id: string) => {
    setProjetoAtivo(id);
    navigate({ to: "/app" });
  };

  const criar = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) {
      toast.error("Informe código e nome do projeto");
      return;
    }
    let empresaId: string | null = null;
    if (form.empresa.trim()) {
      const emp = await repo.empresas.save({
        nome: form.empresa.trim(),
        tipo: "PROPRIA",
        ativo: true,
      });
      empresaId = emp.id;
    }
    const p = await repo.saveProjeto({
      codigo: form.codigo.trim(),
      nome: form.nome.trim(),
      empresa_id: empresaId,
      status: "ATIVO",
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      observacao: null,
    });
    toast.success("Projeto criado");
    setNovoAberto(false);
    abrir(p.id);
  };

  const onXlsx = async (file: File) => {
    try {
      const ds = lerArquivo(await file.arrayBuffer());
      if (!ds.projetos.length) {
        ds.projetos = [
          {
            id: uid(),
            codigo: file.name.replace(/\.xlsx$/i, "").slice(0, 20),
            nome: file.name.replace(/\.xlsx$/i, ""),
            status: "ATIVO",
          },
        ];
      }
      setPreview(ds);
    } catch (e) {
      toast.error(`Não foi possível ler a planilha: ${(e as Error).message}`);
    }
  };

  const confirmarImportacao = async () => {
    if (!preview) return;
    await salvarDataset(preview);
    toast.success("Importação concluída");
    const id = preview.projetos[0]?.id;
    setPreview(null);
    if (id) abrir(id);
  };

  const onBackup = async (file: File) => {
    if (!confirm("Restaurar backup substitui TODOS os dados atuais. Continuar?")) return;
    await restaurarBackup(await file.text());
    toast.success("Backup restaurado");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-sidebar px-6 py-10 text-sidebar-foreground">
        <div className="mx-auto max-w-5xl">
          <Badge className="bg-sidebar-primary text-sidebar-primary-foreground">
            {online ? "Online" : "Modo offline — dados salvos neste dispositivo"}
          </Badge>
          <h1 className="mt-4 font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
            Gestão de Almoxarifado
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-sidebar-foreground/75">
            Controle de estoque, movimentações e consumo de obra. Tudo salvo no seu
            dispositivo (IndexedDB), com Excel apenas para importar e exportar.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <Button className="h-auto justify-start gap-3 py-4" onClick={() => setNovoAberto(true)}>
            <Plus className="size-5" />
            <span className="text-left">
              <span className="block font-semibold">Começar novo projeto</span>
              <span className="block text-xs opacity-80">Estrutura vazia</span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-4"
            onClick={() => inputXlsx.current?.click()}
          >
            <FileSpreadsheet className="size-5" />
            <span className="text-left">
              <span className="block font-semibold">Importar planilha</span>
              <span className="block text-xs text-muted-foreground">Modelo .xlsx</span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-4"
            onClick={() => inputBackup.current?.click()}
          >
            <Upload className="size-5" />
            <span className="text-left">
              <span className="block font-semibold">Restaurar backup</span>
              <span className="block text-xs text-muted-foreground">Arquivo .json</span>
            </span>
          </Button>
        </div>

        <input
          ref={inputXlsx}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onXlsx(f);
            e.target.value = "";
          }}
        />
        <input
          ref={inputBackup}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onBackup(f);
            e.target.value = "";
          }}
        />

        <h2 className="mt-10 font-display text-2xl font-semibold uppercase">Projetos</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(projetos ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum projeto ainda. Crie um novo ou importe a planilha modelo.
            </p>
          )}
          {(projetos ?? []).map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>
                    {p.codigo} · {p.nome}
                  </span>
                  <Badge variant="secondary">{p.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Início {formatarData(p.data_inicio)} · Término {formatarData(p.data_fim)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => abrir(p.id)}>
                    <FolderOpen className="size-4" /> Abrir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await repo.duplicarProjeto(p.id);
                      toast.success("Projeto duplicado");
                    }}
                  >
                    <Copy className="size-4" /> Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const nome = prompt("Novo nome do projeto", p.nome);
                      if (nome) {
                        await repo.saveProjeto({ ...p, nome });
                        toast.success("Projeto renomeado");
                      }
                    }}
                  >
                    Renomear
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      if (
                        confirm(
                          `Excluir o projeto "${p.nome}" e todas as suas movimentações?`,
                        )
                      ) {
                        await repo.deleteProjeto(p.id);
                        toast.success("Projeto excluído");
                      }
                    }}
                  >
                    <Trash2 className="size-4" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
          <Download className="size-3.5" /> Os dados ficam somente neste navegador. Faça
          backup e exportação periodicamente em <strong>Dados</strong>.
        </p>
      </main>

      {/* Novo projeto */}
      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
            <DialogDescription>
              Crie uma estrutura vazia. Você pode importar a planilha modelo depois.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="OBRA-122"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Obra 122"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Empresa</Label>
              <Input
                value={form.empresa}
                onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                placeholder="Construtora Ápice"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de início</Label>
              <Input
                type="date"
                value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de término</Label>
              <Input
                type="date"
                value={form.data_fim}
                onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={criar}>Criar projeto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pré-visualização da importação */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pré-visualização da importação</DialogTitle>
            <DialogDescription>
              Revise antes de gravar os dados no dispositivo.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Movimentações", preview.movimentacoes.length],
                  ["Produtos", preview.produtos.length],
                  ["Funcionários", preview.funcionarios.length],
                  ["Empresas", preview.empresas.length],
                  ["Locais", preview.locais.length],
                  ["Categorias", preview.categorias.length],
                  ["Unidades", preview.unidades.length],
                  ["Projetos", preview.projetos.length],
                ].map(([label, n]) => (
                  <div key={label as string} className="rounded-md border border-border p-2">
                    <p className="num text-lg font-semibold">{n as number}</p>
                    <p className="text-xs text-muted-foreground">{label as string}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="font-semibold">Problemas encontrados</p>
                {preview.problemas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum problema detectado.</p>
                ) : (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-destructive">
                    {preview.problemas.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarImportacao}>Importar mesmo assim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
