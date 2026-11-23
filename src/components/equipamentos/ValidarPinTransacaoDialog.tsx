import { useEffect, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

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

/** Modal exclusivo do método PIN. Outros métodos terão componentes próprios. */
export function ValidarPinTransacaoDialog({
  open,
  movimento,
  requisitos,
  salvando = false,
  onOpenChange,
  onConfirm,
}: Props) {
  const [pins, setPins] = useState<Record<string, string>>({});
  const [validando, setValidando] = useState(false);

  useEffect(() => {
    if (open) setPins({});
  }, [open, requisitos]);

  async function confirmar() {
    if (!movimento) return;
    const entradas: ValidacaoTransacaoEntrada[] = requisitos.map((requisito) => ({
      metodo: "PIN",
      funcionario_id: requisito.funcionario_id,
      papel: requisito.papel,
      pin: pins[`${requisito.funcionario_id}:${requisito.papel}`] ?? "",
    }));

    if (entradas.some((entrada) => !/^\d{4,8}$/.test(entrada.pin))) {
      toast.error("Informe todos os PINs com 4 a 8 números.");
      return;
    }

    setValidando(true);
    try {
      await onConfirm(entradas);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível validar a transação.");
    } finally {
      setValidando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !validando && !salvando && onOpenChange(value)}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            Validar transação
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Esta operação envolve funcionário(s) com PIN cadastrado. A confirmação será registrada
            no histórico sem armazenar o PIN.
          </p>
          {requisitos.map((requisito) => {
            const chave = `${requisito.funcionario_id}:${requisito.papel}`;
            return (
              <div key={chave} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <Label htmlFor={`pin-transacao-${chave}`} className="flex items-center gap-2">
                  <LockKeyhole className="size-4" aria-hidden="true" />
                  PIN de {requisito.funcionario_nome}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({requisito.papel === "ORIGEM" ? "origem" : "destino"})
                  </span>
                </Label>
                <Input
                  id={`pin-transacao-${chave}`}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  autoComplete="off"
                  value={pins[chave] ?? ""}
                  onChange={(event) =>
                    setPins((atual) => ({
                      ...atual,
                      [chave]: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="Informe o PIN"
                />
              </div>
            );
          })}
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
            {validando || salvando ? "Validando…" : "Validar e registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
