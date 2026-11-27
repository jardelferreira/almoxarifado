import { useState } from "react";
import { Camera, CheckCircle2, Fingerprint, Server, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cadastrarBiometriaFacial } from "@/lib/face-api-client";

type FuncionarioFacial = { id: string; nome: string };

export function CadastrarBiometriaFacialDialog({
  funcionario,
  open,
  onOpenChange,
}: {
  funcionario: FuncionarioFacial | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [identidadeConfirmada, setIdentidadeConfirmada] = useState(false);

  function fechar() {
    setArquivos([]);
    setIdentidadeConfirmada(false);
    onOpenChange(false);
  }

  function adicionarArquivos(lista: FileList | null) {
    if (!lista) return;
    setArquivos((atuais) => {
      const novos = Array.from(lista).filter((arquivo) => arquivo.type.startsWith("image/"));
      const combinados = [...atuais, ...novos].slice(0, 5);
      if (novos.length !== combinados.length - atuais.length) {
        toast.info("O cadastro facial aceita no máximo 5 imagens.");
      }
      return combinados;
    });
  }

  async function cadastrar() {
    if (!funcionario) return;
    setEnviando(true);
    try {
      const resultado = await cadastrarBiometriaFacial(funcionario.id, arquivos);
      toast.success(`Biometria facial de ${funcionario.nome} cadastrada (${resultado.enrolledImages} imagens).`);
      fechar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar a biometria facial.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(valor) => !valor && !enviando && fechar()}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-2xl p-0">
        <DialogHeader className="border-b border-sidebar-primary/15 bg-gradient-to-r from-sidebar-primary/[0.08] via-background to-background px-6 pb-5 pt-5">
          <DialogTitle className="flex items-center gap-3 font-display text-xl">
            <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Fingerprint className="size-5" />
            </span>
            Cadastrar biometria facial
          </DialogTitle>
          <DialogDescription>
            Funcionário: <strong>{funcionario?.nome ?? "—"}</strong>. Serão usadas de 2 a 5 imagens para
            validar futuras transações em nome dele.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-lg border border-sky-300/70 bg-sky-50 px-4 py-3 text-sm leading-5 text-sky-950 dark:bg-sky-950/20 dark:text-sky-100">
            <p className="flex items-center gap-2 font-semibold"><Server className="size-4" /> Cadastro protegido pelo backend</p>
            <p className="mt-1">As imagens serão enviadas ao backend do Almoxarifado. A chave de cliente com escopo <code>template:enroll</code> permanece somente no servidor e nunca é exposta ao PWA.</p>
            <p className="mt-2 text-xs opacity-80">Use imagens com uma única pessoa, boa iluminação e ângulos levemente diferentes. Confirme visualmente que as fotos pertencem a este funcionário antes de cadastrar.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-sidebar-primary/30 bg-sidebar-primary/[0.04] px-4 text-center transition-colors hover:bg-sidebar-primary/[0.08]">
              <Camera className="size-6 text-sidebar-primary" />
              <span className="text-sm font-semibold">Capturar pela câmera</span>
              <span className="text-xs text-muted-foreground">Imagem {arquivos.length + 1} de até 5</span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png"
                capture="user"
                onChange={(event) => {
                  adicionarArquivos(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 text-center transition-colors hover:bg-muted/40">
              <Upload className="size-6 text-muted-foreground" />
              <span className="text-sm font-semibold">Selecionar imagens</span>
              <span className="text-xs text-muted-foreground">JPEG ou PNG</span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png"
                multiple
                onChange={(event) => {
                  adicionarArquivos(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Imagens selecionadas ({arquivos.length}/5)</p>
            {arquivos.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                Adicione pelo menos duas imagens para continuar.
              </p>
            ) : (
              <div className="space-y-2">
                {arquivos.map((arquivo, indice) => (
                  <div key={`${arquivo.name}-${indice}`} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover imagem ${indice + 1}`}
                      onClick={() => setArquivos((atuais) => atuais.filter((_, i) => i !== indice))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm leading-5">
            <Checkbox
              checked={identidadeConfirmada}
              onCheckedChange={(valor) => setIdentidadeConfirmada(valor === true)}
              className="mt-0.5"
            />
            <span>
              Confirmei visualmente que todas as imagens pertencem a <strong>{funcionario?.nome ?? "este funcionário"}</strong>.
              A API valida a qualidade e a similaridade, mas não comprova por conta própria a identidade da pessoa.
            </span>
          </label>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={fechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void cadastrar()} disabled={enviando || arquivos.length < 2 || !identidadeConfirmada}>
            {enviando ? "Cadastrando…" : "Cadastrar biometria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
