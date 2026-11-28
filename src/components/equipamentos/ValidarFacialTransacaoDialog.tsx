import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ShieldCheck, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { configuracoesRepo } from "@/services/configuracoes-repo";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  prepararImagemFacial,
  verificarFuncionarioPorFace,
  type FaceVerificationResult,
} from "@/lib/face-api-client";
import type {
  RascunhoMovimentacaoValidavel,
  RequisitoValidacaoTransacao,
} from "@/services/equipamentos/validacao-transacoes";
import type { ValidacaoTransacaoEntrada } from "@/types";

type Props = {
  open: boolean;
  movimento: RascunhoMovimentacaoValidavel | null;
  requisitos: RequisitoValidacaoTransacao[];
  salvando?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (validacoes: ValidacaoTransacaoEntrada[]) => void | Promise<void>;
};

/** Modal específico da Face API; não armazena imagens nem escores no PWA. */
export function ValidarFacialTransacaoDialog({
  open,
  movimento,
  requisitos,
  salvando = false,
  onOpenChange,
  onConfirm,
}: Props) {
  const [arquivos, setArquivos] = useState<Record<string, File>>({});
  const [resultados, setResultados] = useState<Record<string, FaceVerificationResult>>({});
  const [validando, setValidando] = useState(false);
  const [limiar, setLimiar] = useState(0.55);
  const [cameraAtiva, setCameraAtiva] = useState<string | null>(null);
  const [cameraCarregando, setCameraCarregando] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pararCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraAtiva(null);
  }, []);

  useEffect(() => {
    if (open) {
      pararCamera();
      setArquivos({});
      setResultados({});
      setErroCamera(null);
      if (movimento) {
        void configuracoesRepo.obter(movimento.projeto_id).then((configuracao) => {
          setLimiar(Math.min(1, Math.max(0, configuracao.seguranca.limiar_reconhecimento_facial)));
        });
      }
      const primeiroRequisito = requisitos[0];
      if (primeiroRequisito) {
        window.setTimeout(() => void abrirCamera(chave(primeiroRequisito)), 120);
      }
    } else {
      pararCamera();
    }
    // abrirCamera é uma função declarada no componente e usada apenas após a montagem do modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requisitos, movimento, pararCamera]);

  useEffect(() => {
    if (!cameraAtiva || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play();
  }, [cameraAtiva]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function abrirCamera(id: string) {
    setErroCamera(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErroCamera("Este navegador não oferece acesso à câmera.");
      return;
    }
    if (!window.isSecureContext) {
      setErroCamera("A câmera exige HTTPS ou localhost.");
      return;
    }
    pararCamera();
    setCameraCarregando(true);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      setCameraAtiva(id);
    } catch (error) {
      setErroCamera(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "A permissão da câmera foi negada. Autorize o acesso para este site."
          : "Não foi possível abrir a câmera. Verifique se ela está disponível.",
      );
    } finally {
      setCameraCarregando(false);
    }
  }

  async function capturarFoto(id: string) {
    const video = videoRef.current;
    if (!video || !video.videoWidth || cameraAtiva !== id) return;
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
      toast.error("Não foi possível capturar a imagem.");
      return;
    }
    const arquivo = new File([blob], `transacao-${Date.now()}.jpg`, { type: "image/jpeg" });
    const arquivosAtualizados = { ...arquivos, [id]: arquivo };
    setArquivos(arquivosAtualizados);
    setResultados((atual) => {
      const proximo = { ...atual };
      delete proximo[id];
      return proximo;
    });
    pararCamera();
    const proximo = requisitos.find((requisito) => !arquivosAtualizados[chave(requisito)]);
    if (proximo) {
      window.setTimeout(() => void abrirCamera(chave(proximo)), 120);
    } else {
      window.setTimeout(() => void confirmar(), 120);
    }
  }

  async function confirmar() {
    if (!movimento) return;
    if (requisitos.some((requisito) => !arquivos[chave(requisito)])) {
      toast.error("Capture uma imagem para cada funcionário envolvido.");
      return;
    }

    setValidando(true);
    try {
      const novosResultados = { ...resultados };
      for (const requisito of requisitos) {
        const id = chave(requisito);
        if (novosResultados[id]) continue;
        const preparado = await prepararImagemFacial(arquivos[id]);
        novosResultados[id] = await verificarFuncionarioPorFace(
          movimento.projeto_id,
          requisito.funcionario_id,
          preparado.file,
        );
      }
      setResultados(novosResultados);
      const resultadosFinais = requisitos.map((requisito) => novosResultados[chave(requisito)]);
      const abaixoDoLimiar = resultadosFinais.find(
        (resultado) =>
          (resultado?.centroidCosineSimilarity ??
            resultado?.meanReferenceSimilarity ??
            resultado?.medianReferenceSimilarity ??
            -1) < limiar,
      );
      if (abaixoDoLimiar) {
        toast.error("A biometria facial não corresponde ao funcionário. A transação foi recusada.");
        return;
      }
      const entradas: ValidacaoTransacaoEntrada[] = requisitos.map((requisito) => {
        const resultado = novosResultados[chave(requisito)];
        if (!resultado)
          throw new Error(`A verificação de ${requisito.funcionario_nome} não foi concluída.`);
        return {
          metodo: "FACIAL",
          funcionario_id: requisito.funcionario_id,
          papel: requisito.papel,
          face_verificacao: {
            subjectId: resultado.subjectId,
            httpStatus: resultado.httpStatus,
            captureValid: resultado.captureValid,
            verificationReceived: resultado.verificationReceived,
            revisaoOperador: true,
            escore:
              resultado.centroidCosineSimilarity ??
              resultado.meanReferenceSimilarity ??
              resultado.medianReferenceSimilarity,
            limiar,
            limiarAtendido:
              (resultado.centroidCosineSimilarity ??
                resultado.meanReferenceSimilarity ??
                resultado.medianReferenceSimilarity ??
                -1) >= limiar,
          },
        };
      });
      await onConfirm(entradas);
      pararCamera();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível verificar a captura facial.",
      );
    } finally {
      setValidando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !validando && !salvando && onOpenChange(value)}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            Verificação facial assistida
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Capture o rosto de cada funcionário envolvido. A biometria será validada antes de
            liberar a transação. Nenhuma imagem será salva no PWA.
          </p>
          {requisitos.map((requisito) => {
            const id = chave(requisito);
            const resultado = resultados[id];
            return (
              <div key={id} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center gap-2 font-medium">
                  <Camera className="size-4" aria-hidden="true" />
                  {requisito.funcionario_nome}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({requisito.papel === "ORIGEM" ? "origem" : "destino"})
                  </span>
                </div>
                {cameraAtiva === id ? (
                  <div className="space-y-2 rounded-md border bg-black p-2">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="aspect-video w-full rounded object-cover"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={() => void capturarFoto(id)}
                      >
                        <Camera className="mr-2 size-4" /> Capturar agora
                      </Button>
                      <Button type="button" variant="secondary" onClick={pararCamera}>
                        <VideoOff className="mr-2 size-4" /> Fechar câmera
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant={arquivos[id] ? "outline" : "default"}
                    onClick={() => void abrirCamera(id)}
                    disabled={cameraCarregando || validando || salvando}
                    className="w-full"
                  >
                    <Video className="mr-2 size-4" />
                    {arquivos[id] ? "Capturar novamente" : "Abrir câmera"}
                  </Button>
                )}
                {arquivos[id] && !resultado && (
                  <p className="text-xs text-muted-foreground">
                    Captura realizada. Clique em verificar biometria.
                  </p>
                )}
                {resultado && (
                  <div
                    className={
                      (resultado.centroidCosineSimilarity ??
                        resultado.meanReferenceSimilarity ??
                        resultado.medianReferenceSimilarity ??
                        -1) >= limiar
                        ? "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"
                        : "rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900"
                    }
                  >
                    {(resultado.centroidCosineSimilarity ??
                      resultado.meanReferenceSimilarity ??
                      resultado.medianReferenceSimilarity ??
                      -1) >= limiar
                      ? "Biometria facial aprovada."
                      : "Biometria facial recusada. A transação não pode continuar."}
                  </div>
                )}
              </div>
            );
          })}
          {erroCamera && (
            <p
              className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900"
              role="alert"
            >
              {erroCamera}
            </p>
          )}
          {cameraAtiva == null && Object.keys(resultados).length === 0 && !erroCamera && (
            <p className="text-center text-xs text-muted-foreground">
              A câmera será aberta automaticamente para iniciar a validação.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={validando || salvando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={
              validando || salvando || requisitos.some((requisito) => !arquivos[chave(requisito)])
            }
          >
            {validando || salvando ? "Verificando…" : "Verificar biometria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function chave(requisito: RequisitoValidacaoTransacao): string {
  return `${requisito.funcionario_id}:${requisito.papel}`;
}
