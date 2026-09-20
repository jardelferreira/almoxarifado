import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Copy,
  Download,
  History,
  Import,
  Layers3,
  MoreHorizontal,
  Trash2,
  Upload,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import {
  duplicarPerfil,
  excluirPerfil,
  exportarPerfis,
  importarPerfis,
  listarPerfis,
} from "@/services/equipamentos/perfis-parametros-custos-repo";
import type { PerfilParametroCusto } from "@/types";

export const Route = createFileRoute("/app/perfis-parametros-equipamentos")({
  ssr: false,
  component: PerfisParametrosEquipamentosPage,
});

function formatarData(data: string): string {
  const valor = data.length === 10 ? `${data}T00:00:00` : data;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(valor));
}

function PerfisParametrosEquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const [historicoPerfilId, setHistoricoPerfilId] = useState<string | null>(null);
  const [dialogImportar, setDialogImportar] = useState(false);
  const [importando, setImportando] = useState(false);
  const [arquivoNome, setArquivoNome] = useState("");
  const inputArquivo = useRef<HTMLInputElement | null>(null);

  const perfis = useLiveQuery(
    () => (projetoId ? listarPerfis(projetoId) : Promise.resolve([] as PerfilParametroCusto[])),
    [projetoId],
  ) ?? [];

  const grupos = useMemo(() => {
    const mapa = new Map<string, PerfilParametroCusto[]>();
    for (const perfil of perfis) {
      const atual = mapa.get(perfil.perfil_id) ?? [];
      atual.push(perfil);
      mapa.set(perfil.perfil_id, atual);
    }
    return [...mapa.values()].sort((a, b) => {
      const aa = a[0];
      const bb = b[0];
      return (aa?.nome ?? "").localeCompare(bb?.nome ?? "", "pt-BR");
    });
  }, [perfis]);

  const historico = useMemo(
    () => perfis.filter((perfil) => perfil.perfil_id === historicoPerfilId),
    [perfis, historicoPerfilId],
  );

  async function baixarExportacao() {
    if (!projetoId) return;
    try {
      const json = await exportarPerfis(projetoId);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `perfis_parametros_custos_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Perfis exportados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar os perfis.");
    }
  }

  async function importarArquivo(file: File) {
    if (!projetoId) return;
    setImportando(true);
    try {
      const perfisImportados = await importarPerfis(projetoId, await file.text());
      toast.success(`${perfisImportados.length} perfil${perfisImportados.length === 1 ? "" : "s"} importado${perfisImportados.length === 1 ? "" : "s"}.`);
      setArquivoNome(file.name);
      setDialogImportar(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o arquivo.");
    } finally {
      setImportando(false);
    }
  }

  async function duplicar(perfil: PerfilParametroCusto) {
    if (!projetoId) return;
    try {
      await duplicarPerfil(projetoId, perfil.id);
      toast.success("Perfil duplicado como uma nova família de versões.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível duplicar o perfil.");
    }
  }

  async function excluir(perfil: PerfilParametroCusto) {
    if (!projetoId) return;
    const confirmado = window.confirm(`Excluir todas as versões de “${perfil.nome}”?`);
    if (!confirmado) return;
    try {
      await excluirPerfil(projetoId, perfil.perfil_id);
      toast.success("Perfil excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o perfil.");
    }
  }

  if (!projetoId) {
    return <main className="p-6 text-sm text-muted-foreground">Selecione um projeto para gerenciar os perfis.</main>;
  }

  return (
    <main className="min-w-0 space-y-6 bg-gradient-to-b from-primary/[0.025] via-background to-background p-4 sm:p-6 lg:p-8">
      <header className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/[0.09] via-background to-background shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Layers3 className="size-4" /> Perfis de parâmetros
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Perfis de Parâmetros de Custos</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Salve conjuntos reutilizáveis de equipamentos, regras, custos, manutenção e recorrência. Cada salvamento de um perfil existente cria uma nova versão, preservando o histórico.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={baixarExportacao} disabled={!grupos.length}>
              <Download className="size-4" /> Exportar
            </Button>
            <Button variant="outline" onClick={() => { setArquivoNome(""); setDialogImportar(true); }}>
              <Upload className="size-4" /> Importar
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/mesclar-parametros-equipamentos">Mesclar parâmetros</Link>
            </Button>
            <Button asChild>
              <Link to="/app/simulacao-custos" search={{ perfil: undefined }}>Abrir simulador</Link>
            </Button>
          </div>
        </div>
      </header>

      {arquivoNome ? (
        <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-xs text-success">
          Último arquivo processado: <strong>{arquivoNome}</strong>
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Biblioteca</p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Perfis salvos</h2>
          </div>
          <span className="text-xs text-muted-foreground">{grupos.length} família{grupos.length === 1 ? "" : "s"} · {perfis.length} versão{perfis.length === 1 ? "" : "s"}</span>
        </div>

        {!grupos.length ? (
          <Card className="border-dashed">
            <CardContent className="px-6 py-14 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Workflow className="size-6" /></div>
              <p className="mt-3 text-sm font-semibold">Nenhum perfil salvo</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">Monte uma simulação e use “Salvar perfil” para criar a primeira versão reutilizável.</p>
              <Button asChild className="mt-5" size="sm"><Link to="/app/simulacao-custos" search={{ perfil: undefined }}>Montar simulação</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {grupos.map((versoes) => {
              const atual = versoes[0]!;
              return (
                <Card key={atual.perfil_id} className="overflow-hidden">
                  <CardHeader className="border-b bg-muted/15 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="truncate text-base">{atual.nome}</CardTitle>
                          <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">v{atual.versao}</Badge>
                          {atual.origem === "IMPORTADO" ? <Badge variant="outline">Importado</Badge> : atual.origem === "CONSOLIDADO" ? <Badge variant="outline" className="border-success/25 bg-success/10 text-success">Consolidado</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {atual.equipamentos.length} equipamento{atual.equipamentos.length === 1 ? "" : "s"} · referência {formatarData(atual.periodo_referencia_inicio)} — {formatarData(atual.periodo_referencia_fim)}
                        </p>
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => setHistoricoPerfilId(atual.perfil_id)} aria-label="Ver histórico de versões">
                        <History className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 p-4 sm:p-5">
                    {atual.descricao ? <p className="text-sm leading-6 text-muted-foreground">{atual.descricao}</p> : null}
                    {atual.fonte_dados ? <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Origem:</span> {atual.fonte_dados}</p> : null}
                    <div className="grid grid-cols-3 divide-x rounded-xl border bg-muted/20 py-3">
                      <Mini label="Equipamentos" value={String(atual.equipamentos.length)} />
                      <Mini label="Regras" value={String(atual.equipamentos.reduce((s, e) => s + e.regras.length, 0))} />
                      <Mini label="Versões" value={String(versoes.length)} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link to="/app/simulacao-custos" search={{ perfil: atual.id }}>Carregar na simulação</Link>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => duplicar(atual)}><Copy className="size-3.5" /> Duplicar</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => excluir(atual)}><Trash2 className="size-3.5" /> Excluir</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div className="rounded-2xl border bg-muted/15 px-4 py-3.5 sm:px-5">
        <div className="flex items-start gap-3">
          <MoreHorizontal className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">Regra de segurança do perfil</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Salvar, duplicar, importar e versionar um perfil não altera equipamentos, regras de consumo ou históricos. O perfil é uma camada de parâmetros separada do dado operacional.</p>
          </div>
        </div>
      </div>

      <Dialog open={dialogImportar} onOpenChange={setDialogImportar}>
        <DialogContent>
          <DialogHeader><DialogTitle>Importar perfis de parâmetros</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">Selecione um JSON exportado pelo módulo de perfis. O arquivo será incorporado ao projeto atual como novas famílias, sem sobrescrever as existentes.</p>
            <input ref={inputArquivo} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importarArquivo(file); }} />
            <Button type="button" className="w-full" onClick={() => inputArquivo.current?.click()} disabled={importando}>
              {importando ? "Importando…" : <><Import className="size-4" /> Selecionar arquivo JSON</>}
            </Button>
          </div>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setDialogImportar(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historicoPerfilId} onOpenChange={(open) => !open && setHistoricoPerfilId(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Histórico de versões</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {historico.map((perfil) => (
              <div key={perfil.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2"><Badge variant="outline">v{perfil.versao}</Badge><span className="text-sm font-medium">{perfil.nome}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">Atualizado em {formatarData(perfil.atualizado_em)} · {perfil.equipamentos.length} equipamento{perfil.equipamentos.length === 1 ? "" : "s"}</p>
                </div>
                <Button asChild size="sm" variant="outline"><Link to="/app/simulacao-custos" search={{ perfil: perfil.id }}>Carregar versão</Link></Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="px-3 text-center"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>;
}
