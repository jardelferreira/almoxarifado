import { useEffect, useState } from "react";
import { Camera, ShieldCheck } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [confirmado, setConfirmado] = useState(false);
  const [validando, setValidando] = useState(false);
  const [limiar, setLimiar] = useState(0.55);

  useEffect(() => {
    if (open) {
      setArquivos({});
      setResultados({});
      setConfirmado(false);
      if (movimento) {
        void configuracoesRepo.obter(movimento.projeto_id).then((configuracao) => {
          setLimiar(Math.min(1, Math.max(0, configuracao.seguranca.limiar_reconhecimento_facial)));
        });
      }
    }
  }, [open, requisitos, movimento]);

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
      if (!confirmado) {
        toast.info(
          "As capturas foram aprovadas pelo limiar. Revise os resultados e confirme para continuar.",
        );
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
            revisaoOperador: confirmado,
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
                <Label htmlFor={`face-transacao-${id}`}>
                  Captura pela câmera ou arquivo JPEG/PNG
                </Label>
                <Input
                  id={`face-transacao-${id}`}
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="user"
                  onChange={(event) => {
                    const arquivo = event.target.files?.[0];
                    if (arquivo) {
                      setArquivos((atual) => ({ ...atual, [id]: arquivo }));
                      setResultados((atual) => {
                        const proximo = { ...atual };
                        delete proximo[id];
                        return proximo;
                      });
                    }
                  }}
                />
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
          <label
            className={`flex items-start gap-2 rounded-md border p-3 text-xs leading-5 ${Object.keys(resultados).length < requisitos.length || Object.values(resultados).some((resultado) => (resultado.centroidCosineSimilarity ?? resultado.meanReferenceSimilarity ?? resultado.medianReferenceSimilarity ?? -1) < limiar) ? "pointer-events-none opacity-50" : ""}`}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmado}
              onChange={(event) => setConfirmado(event.target.checked)}
            />
            <span>
              Confirmei que a biometria foi aprovada e autorizo a continuidade desta operação.
            </span>
          </label>
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
          <Button type="button" onClick={() => void confirmar()} disabled={validando || salvando}>
            {validando || salvando
              ? "Verificando…"
              : Object.keys(resultados).length === requisitos.length
                ? "Autorizar transação"
                : "Verificar biometria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function chave(requisito: RequisitoValidacaoTransacao): string {
  return `${requisito.funcionario_id}:${requisito.papel}`;
}
