import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Plus,
  Trash2,
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
import { lerArquivo, salvarDataset, type DatasetImportado } from "@/services/excel";
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

  const abrir = (id: string) => {
    setProjetoAtivo(id);
    navigate({ to: "/app" });
  };

  const criar = async () => {
    if (!form.codigo.trim() || !form.nome.trim()) {
      toast.error("Informe código e nome do projeto");
      return;
    }

    try {
      // Primeiro criamos o projeto para obter seu ID.
      const p = await repo.saveProjeto({
        codigo: form.codigo.trim(),
        nome: form.nome.trim(),
        empresa_id: null,
        status: "ATIVO",
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        observacao: null,
      });

      // A empresa depende do projeto, portanto é criada depois.
      let empresaId: string | null = null;

      if (form.empresa.trim()) {
        const emp = await repo.empresas.save(p.id, {
          projeto_id: p.id,
          nome: form.empresa.trim(),
          tipo: "PROPRIA",
          ativo: true,
        });

        empresaId = emp.id;

        // Atualiza o projeto com a empresa recém-criada.
        await repo.saveProjeto({
          ...p,
          empresa_id: empresaId,
        });
      }

      toast.success("Projeto criado");
      setNovoAberto(false);
      abrir(p.id);
    } catch (error) {
      console.error(error);
      toast.error(
        `Não foi possível criar o projeto: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`,
      );
    }
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
    if (preview.problemas.length > 0) {
      toast.error("A planilha possui inconsistências e não pode ser importada.");
      return;
    }
    try {
      await salvarDataset(preview);
      toast.success("Projeto importado com sucesso");
      const id = preview.projetos[0]?.id;
      setPreview(null);
      if (id) abrir(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o projeto.");
    }
  };

  const limparDados = async () => {
    if (
      !confirm(
        "Limpar todos os dados salvos neste dispositivo? Esta ação remove projetos, estoque, movimentações e backups locais. Não pode ser desfeita.",
      )
    ) {
      return;
    }

    try {
      if ("indexedDB" in window && typeof indexedDB.databases === "function") {
        const bancos = await indexedDB.databases();
        await Promise.all(
          bancos
            .filter((db) => db.name)
            .map(
              (db) =>
                new Promise<void>((resolve, reject) => {
                  const request = indexedDB.deleteDatabase(db.name!);
                  request.onsuccess = () => resolve();
                  request.onerror = () => reject(request.error ?? new Error("Erro ao limpar banco de dados"));
                  request.onblocked = () => resolve();
                }),
            ),
        );
      }

      localStorage.clear();
      sessionStorage.clear();
      toast.success("Dados do app limpos");
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível limpar todos os dados do app");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-sidebar px-6 py-10 text-sidebar-foreground shadow-md">
        <div className="mx-auto max-w-5xl">
          <Badge className="gap-1.5 bg-sidebar-primary text-sidebar-primary-foreground">
            <span
              className={`size-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`}
              aria-hidden
            />
            {online ? "Online" : "Modo offline — dados salvos neste dispositivo"}
          </Badge>
          <h1 className="mt-4 font-display text-4xl font-bold uppercase tracking-wide text-sidebar-foreground md:text-5xl">
            Gestão de Almoxarifado
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-sidebar-foreground/75">
            Controle de estoque, movimentações e consumo de obra. Tudo salvo no seu
            dispositivo (IndexedDB), com Excel apenas para importar e exportar.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
            variant="destructive"
            className="h-auto justify-start gap-3 py-4"
            onClick={() => void limparDados()}
          >
            <Trash2 className="size-5" />
            <span className="text-left">
              <span className="block font-semibold">Limpar dados</span>
              <span className="block text-xs opacity-80">Apaga tudo localmente</span>
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
        <div className="mt-10 flex items-baseline gap-2 border-b border-border pb-2">
          <h2 className="font-display text-2xl font-semibold uppercase tracking-wide">
            Projetos
          </h2>
          <span className="text-sm font-medium text-muted-foreground">
            {(projetos ?? []).length}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(projetos ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum projeto ainda. Crie um novo ou importe a planilha modelo.
            </p>
          )}
          {(projetos ?? []).map((p) => (
            <Card
              key={p.id}
              className={`transition-shadow hover:shadow-md ${
                p.status === "ATIVO" ? "border-primary/40 bg-primary/[0.03]" : ""
              }`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-baseline gap-1.5 truncate">
                    <span className="font-display font-semibold text-muted-foreground">
                      {p.codigo}
                    </span>
                    <span className="truncate font-semibold">{p.nome}</span>
                  </span>
                  <Badge
                    variant={p.status === "ATIVO" ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {p.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3.5 shrink-0" />
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
                      const codigo = prompt("Novo código do projeto", p.codigo);

                      if (codigo === null) {
                        return;
                      }

                      if (!codigo.trim()) {
                        toast.error("Informe um código para o projeto");
                        return;
                      }

                      const nome = prompt("Novo nome do projeto", p.nome);

                      if (nome === null) {
                        return;
                      }

                      if (!nome.trim()) {
                        toast.error("Informe um nome para o projeto");
                        return;
                      }

                      try {
                        await repo.saveProjeto({
                          ...p,
                          codigo: codigo.trim(),
                          nome: nome.trim(),
                        });

                        toast.success("Projeto atualizado");
                      } catch (error) {
                        console.error(error);
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Não foi possível atualizar o projeto",
                        );
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
        <DialogContent className="w-[calc(100%-2rem)] max-w-2xl">
          <DialogHeader className="-mx-2 rounded-lg border-b border-border bg-primary px-2 pb-2 shadow-sm">
            <DialogTitle className="text-white  border-b border-white-100 mx-2 mt-2 rounded text-center py-2" >Novo projeto</DialogTitle>
            <DialogDescription className="text-white text-center">
              Insira os dados iniciais do projeto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="032 ou 115..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome do Projeto - Etapa ou Fase"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Empresa</Label>
              <Input
                value={form.empresa}
                onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                placeholder="Nome da Empresa"
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
            <Button size="lg" className="gap-2 font-semibold shadow-sm" onClick={criar}>
              <Plus className="size-4" />
              Criar projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pré-visualização da importação */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="-mx-2 rounded-lg border-b border-border bg-primary/20 px-2 pb-4 shadow-sm">
            <DialogTitle>Pré-visualização da importação</DialogTitle>
            <DialogDescription>
              Revise antes de criar o projeto e gravar seus dados no dispositivo. A importação só grava após todas as validações.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="font-display text-lg font-semibold">
                  {Object.values(preview.contagens).reduce((total, quantidade) => total + quantidade, 0)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">registros</span>{" "}
                  · {Object.values(preview.contagens).filter(Boolean).length}{" "}
                  <span className="text-sm font-normal text-muted-foreground">módulos</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A planilha foi reconhecida nas tabelas suportadas pelo projeto.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
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
            <Button
              size="lg"
              className="gap-2 font-semibold shadow-sm"
              onClick={confirmarImportacao}
              disabled={!preview || preview.problemas.length > 0}
            >
              <CheckCircle2 className="size-4" />
              Importar projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}