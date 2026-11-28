import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Fingerprint, Server, Trash2, Upload, X } from "lucide-react";
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
import { cadastrarBiometriaFacial, verificarCapturaFacial } from "@/lib/face-api-client";

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
  const [cameraAberta, setCameraAberta] = useState(false);
  const [cameraCarregando, setCameraCarregando] = useState(false);
  const [validandoImagem, setValidandoImagem] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function pararCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraAberta(false);
  }

  useEffect(() => {
    if (!open) pararCamera();
    return () => pararCamera();
  }, [open]);

  useEffect(() => {
    if (!cameraAberta || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play();
  }, [cameraAberta]);

  function fechar() {
    setArquivos([]);
    setIdentidadeConfirmada(false);
    pararCamera();
    onOpenChange(false);
  }

  async function validarEAdicionar(lista: File[] | null) {
    if (!lista) return;
    const restantes = Math.max(0, 5 - arquivos.length);
    if (restantes === 0) {
      toast.info("O cadastro facial aceita no máximo 5 imagens.");
      return;
    }
    const candidatos = lista
      .filter((arquivo) => arquivo.type.startsWith("image/"))
      .slice(0, restantes);
    if (candidatos.length < lista.length)
      toast.info("O cadastro facial aceita no máximo 5 imagens.");
    if (candidatos.length === 0) {
      toast.error("Selecione uma imagem JPEG ou PNG.");
      return;
    }

    setValidandoImagem(true);
    const aprovados: File[] = [];
    for (const arquivo of candidatos) {
      try {
        await verificarCapturaFacial(arquivo);
        aprovados.push(arquivo);
      } catch (error) {
        toast.error(
          `${arquivo.name}: ${error instanceof Error ? error.message : "imagem inválida"}`,
        );
      }
    }
    if (aprovados.length) setArquivos((atuais) => [...atuais, ...aprovados].slice(0, 5));
    setValidandoImagem(false);
  }

  async function abrirCamera() {
    setErroCamera(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErroCamera(
        "Este navegador não oferece acesso à câmera. Use HTTPS ou localhost e um navegador atualizado.",
      );
      return;
    }
    if (!window.isSecureContext) {
      setErroCamera(
        "A câmera exige HTTPS ou localhost. Em celular, abra o app por um endereço HTTPS.",
      );
      return;
    }
    setCameraCarregando(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      setCameraAberta(true);
    } catch (error) {
      setErroCamera(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "A permissão da câmera foi negada. Autorize a câmera para este site e tente novamente."
          : "Não foi possível abrir a câmera. Verifique se ela está disponível e não está sendo usada por outro aplicativo.",
      );
    } finally {
      setCameraCarregando(false);
    }
  }

  async function capturarFoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || validandoImagem || arquivos.length >= 5) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      toast.error("Este navegador não oferece suporte à captura da câmera.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) {
      toast.error("Não foi possível gerar a foto capturada.");
      return;
    }
    const arquivo = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
    await validarEAdicionar([arquivo]);
  }

  async function cadastrar() {
    if (!funcionario) return;
    setEnviando(true);
    try {
      const resultado = await cadastrarBiometriaFacial(funcionario.id, arquivos);
      toast.success(
        `Biometria facial de ${funcionario.nome} cadastrada (${resultado.enrolledImages} imagens).`,
      );
      fechar();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível cadastrar a biometria facial.",
      );
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
            Funcionário: <strong>{funcionario?.nome ?? "—"}</strong>. Serão usadas de 2 a 5 imagens
            para validar futuras transações em nome dele.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-lg border border-sky-300/70 bg-sky-50 px-4 py-3 text-sm leading-5 text-sky-950 dark:bg-sky-950/20 dark:text-sky-100">
            <p className="flex items-center gap-2 font-semibold">
              <Server className="size-4" /> Cadastro pela API facial configurada
            </p>
            <p className="mt-1">
              As imagens serão enviadas diretamente para a API facial usando a URL e a chave de
              cliente informadas nas configurações do PWA. A mesma chave autoriza o cadastro e a
              verificação facial; a chave administrativa não é usada neste fluxo.
            </p>
            <p className="mt-2 text-xs opacity-80">
              Use imagens com uma única pessoa, boa iluminação e ângulos levemente diferentes.
              Confirme visualmente que as fotos pertencem a este funcionário antes de cadastrar.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3">
              {cameraAberta ? (
                <div className="space-y-3 rounded-lg border border-sidebar-primary/30 bg-black p-2">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="aspect-video w-full rounded-md object-cover"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => void capturarFoto()}
                      disabled={validandoImagem || arquivos.length >= 5}
                    >
                      <Camera className="mr-2 size-4" /> Capturar foto
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label="Fechar câmera"
                      onClick={pararCamera}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void abrirCamera()}
                  disabled={cameraCarregando || arquivos.length >= 5}
                  className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-sidebar-primary/30 bg-sidebar-primary/[0.04] px-4 text-center transition-colors hover:bg-sidebar-primary/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Camera className="size-6 text-sidebar-primary" />
                  <span className="text-sm font-semibold">
                    {cameraCarregando ? "Abrindo câmera…" : "Abrir câmera"}
                  </span>
                  <span className="text-xs text-muted-foreground">Captura validada na hora</span>
                </button>
              )}
              {erroCamera && (
                <p className="text-xs leading-5 text-destructive" role="alert">
                  {erroCamera}
                </p>
              )}
            </div>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 text-center transition-colors hover:bg-muted/40">
              <Upload className="size-6 text-muted-foreground" />
              <span className="text-sm font-semibold">Selecionar imagens</span>
              <span className="text-xs text-muted-foreground">
                JPEG ou PNG · validação automática
              </span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png"
                multiple
                onChange={(event) => {
                  void validarEAdicionar(Array.from(event.target.files ?? []));
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Imagens validadas ({arquivos.length}/5)</p>
            {arquivos.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                Abra a câmera ou selecione arquivos. Cada imagem será validada antes de entrar no
                cadastro.
              </p>
            ) : (
              <div className="space-y-2">
                {arquivos.map((arquivo, indice) => (
                  <div
                    key={`${arquivo.name}-${indice}`}
                    className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                  >
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
              Confirmei visualmente que todas as imagens pertencem a{" "}
              <strong>{funcionario?.nome ?? "este funcionário"}</strong>. A API valida a qualidade e
              a similaridade, mas não comprova por conta própria a identidade da pessoa.
            </span>
          </label>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={fechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void cadastrar()}
            disabled={enviando || validandoImagem || arquivos.length < 2 || !identidadeConfirmada}
          >
            {enviando ? "Cadastrando…" : "Cadastrar biometria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
