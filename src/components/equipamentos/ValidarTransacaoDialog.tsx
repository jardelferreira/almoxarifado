import { useEffect, useState } from "react";

import { ValidarFacialTransacaoDialog } from "./ValidarFacialTransacaoDialog";
import { ValidarPinTransacaoDialog } from "./ValidarPinTransacaoDialog";
import {
  obterMetodoValidacaoTransacao,
  type RascunhoMovimentacaoValidavel,
  type RequisitoValidacaoTransacao,
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

/** Seleciona o modal específico sem acoplar as telas operacionais ao método. */
export function ValidarTransacaoDialog(props: Props) {
  const [metodo, setMetodo] = useState<"PIN" | "FACIAL">("PIN");

  useEffect(() => {
    if (!props.open || !props.movimento) return;
    let ativo = true;
    void obterMetodoValidacaoTransacao(props.movimento.projeto_id).then((valor) => {
      if (ativo && (valor === "PIN" || valor === "FACIAL")) setMetodo(valor);
    });
    return () => {
      ativo = false;
    };
  }, [props.open, props.movimento]);

  if (metodo === "FACIAL") return <ValidarFacialTransacaoDialog {...props} />;
  return <ValidarPinTransacaoDialog {...props} />;
}
