import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { importarBackupComoNovoProjeto } from "@/services/backup";
import {
  descriptografarSnapshotProjeto,
  lerEnvelopeSincronizacao,
} from "@/services/sincronizacao-projeto";
import { consultarCompartilhamentoProjeto } from "@/lib/compartilhamento-projeto-r2";

export const Route = createFileRoute("/compartilhar-projeto")({
  ssr: false,
  head: () => ({ meta: [{ title: "Projeto compartilhado — Almoxarifado" }] }),
  component: CompartilharProjetoPage,
});

type Estado = "carregando" | "pronto" | "importando" | "concluido" | "erro";

function CompartilharProjetoPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [mensagem, setMensagem] = useState("Validando o link e a integridade do projeto…");
  const [backupJson, setBackupJson] = useState<string | null>(null);
  const [projeto, setProjeto] = useState<{ id: string; nome: string; codigo: string } | null>(null);
  const [expiraEm, setExpiraEm] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        const parametros = new URLSearchParams(window.location.search);
        const projetoId = parametros.get("projeto") ?? "";
        const token = parametros.get("token") ?? "";
        const chave =
          new URLSearchParams(window.location.hash.replace(/^#/, "")).get("chave") ?? "";
        if (
          !/^[a-zA-Z0-9_-]{8,160}$/.test(projetoId) ||
          !/^[a-f0-9]{64}$/.test(token) ||
          chave.length < 16
        ) {
          throw new Error("Este link está incompleto ou foi alterado.");
        }

        const compartilhamento = await consultarCompartilhamentoProjeto({
          data: { projetoId, token },
        });
        const envelope = lerEnvelopeSincronizacao(
          new TextEncoder().encode(compartilhamento.envelope),
        );
        const backup = await descriptografarSnapshotProjeto(envelope, projetoId, chave);
        if (!backup.projeto || backup.projeto.id !== projetoId)
          throw new Error("A identidade do projeto não pôde ser confirmada.");
        if (!ativo) return;
        setProjeto({
          id: backup.projeto.id,
          nome: backup.projeto.nome,
          codigo: backup.projeto.codigo,
        });
        setExpiraEm(compartilhamento.expiraEm);
        setBackupJson(JSON.stringify(backup));
        setMensagem("Link validado e conteúdo descriptografado com sucesso.");
        setEstado("pronto");
      } catch (error) {
        if (!ativo) return;
        setMensagem(
          error instanceof Error
            ? error.message
            : "Não foi possível validar este compartilhamento.",
        );
        setEstado("erro");
      }
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const importar = async () => {
    if (!backupJson || !projeto) return;
    try {
      setEstado("importando");
      const resultado = await importarBackupComoNovoProjeto(backupJson);
      localStorage.setItem("almox.projeto_ativo", projeto.id);
      setEstado("concluido");
      setMensagem(
        `${resultado.registrosImportados.toLocaleString("pt-BR")} registros foram importados para este dispositivo.`,
      );
      toast.success("Projeto compartilhado adicionado com sucesso.");
    } catch (error) {
      setEstado("pronto");
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar o projeto.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-8">
      <Card className="w-full max-w-2xl overflow-hidden border-l-4 border-l-primary shadow-lg">
        <CardHeader className="border-b bg-primary/[0.04] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <LockKeyhole className="size-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold sm:text-3xl">
                  Projeto compartilhado
                </h1>
                <Badge variant="outline">Acesso protegido</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                O link é validado, descriptografado no navegador e nunca expõe a senha do projeto.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-6 sm:p-8">
          {estado === "carregando" || estado === "importando" ? (
            <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-4 text-sm">
              <Loader2 className="size-5 animate-spin text-primary" />
              {estado === "importando" ? "Adicionando o projeto ao banco local…" : mensagem}
            </div>
          ) : estado === "erro" ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <ShieldAlert className="mt-0.5 size-5 shrink-0" />
              <span>{mensagem}</span>
            </div>
          ) : estado === "concluido" ? (
            <div className="space-y-4 rounded-xl border border-emerald-300 bg-emerald-50/60 p-5 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="size-5" /> Projeto adicionado com sucesso
              </div>
              <p className="text-sm">{mensagem}</p>
              <Button onClick={() => void navigate({ to: "/app" })}>Abrir projeto</Button>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-5 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200">
                  <ShieldCheck className="size-5" /> {mensagem}
                </div>
              </div>
              {projeto && (
                <div className="rounded-xl border bg-background p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Projeto disponível
                  </p>
                  <p className="mt-1 text-xl font-bold">{projeto.nome}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Código: {projeto.codigo}</p>
                  {expiraEm && (
                    <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                      Este link é válido até {new Date(expiraEm).toLocaleString("pt-BR")}.
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
                  Cancelar
                </Button>
                <Button onClick={() => void importar()}>
                  <Download className="size-4" /> Adicionar ao meu dispositivo
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
