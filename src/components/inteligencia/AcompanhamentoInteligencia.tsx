import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, CircleHelp, Clock3, History, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { inteligenciaRepo } from "@/services/inteligencia-repo";
import type { InteligenciaAcao, InteligenciaResultado, InteligenciaOrigem } from "@/types";

const resultadoLabel: Record<InteligenciaResultado, string> = {
  CONFIRMADO: "Confirmado",
  NAO_CONFIRMADO: "Não confirmado",
  PARCIAL: "Parcial",
  SEM_RESULTADO: "Sem resultado",
};

const resultadoClass: Record<InteligenciaResultado, string> = {
  CONFIRMADO: "border-emerald-200 bg-emerald-50 text-emerald-700",
  NAO_CONFIRMADO: "border-slate-200 bg-slate-50 text-slate-700",
  PARCIAL: "border-amber-200 bg-amber-50 text-amber-700",
  SEM_RESULTADO: "border-blue-200 bg-blue-50 text-blue-700",
};

function statusBadge(registro: InteligenciaAcao) {
  if (registro.status === "EM_ANDAMENTO") {
    return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700"><Clock3 className="mr-1 size-3" />Em acompanhamento</Badge>;
  }
  if (registro.status === "DESCARTADA") {
    return <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600"><XCircle className="mr-1 size-3" />Descartada</Badge>;
  }
  if (registro.resultado) {
    return <Badge variant="outline" className={resultadoClass[registro.resultado]}>{resultadoLabel[registro.resultado]}</Badge>;
  }
  return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 size-3" />Concluída</Badge>;
}

function formatarData(data: string) {
  const instante = new Date(data);
  if (Number.isNaN(instante.getTime())) return data.slice(0, 10);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(instante);
}

export function AcompanhamentoInteligencia({
  projetoId,
  produtoId,
  origens,
  compact = false,
}: {
  projetoId: string;
  produtoId?: string | null;
  origens?: InteligenciaOrigem[];
  compact?: boolean;
}) {
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [resultado, setResultado] = useState<InteligenciaResultado>("CONFIRMADO");
  const [observacao, setObservacao] = useState("");

  const registros = useLiveQuery(
    () => inteligenciaRepo.listar(
      projetoId,
      {
        ...(produtoId !== undefined ? { produtoId } : {}),
        ...(origens !== undefined ? { origens } : {}),
        limite: compact ? 8 : 24,
      },
    ),
    [projetoId, produtoId, origens?.join("|") ?? "", compact],
  );

  const resumo = useMemo(() => {
    const itens = registros ?? [];
    return {
      emAndamento: itens.filter((item) => item.status === "EM_ANDAMENTO").length,
      confirmados: itens.filter((item) => item.status === "CONCLUIDA" && item.resultado === "CONFIRMADO").length,
      naoConfirmados: itens.filter((item) => item.status === "CONCLUIDA" && item.resultado === "NAO_CONFIRMADO").length,
    };
  }, [registros]);

  const registrarResultado = async (registro: InteligenciaAcao) => {
    try {
      await inteligenciaRepo.concluir(registro.id, resultado, observacao);
      toast.success("Resultado da ação registrado.");
      setAbertoId(null);
      setObservacao("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar o resultado.");
    }
  };

  return (
    <Card className="overflow-hidden border-sidebar-primary/15 shadow-sm">
      <CardHeader className="border-b bg-sidebar-primary/[0.035] pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><History className="size-4 text-sidebar-primary" />Acompanhamento da inteligência</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Registre o que aconteceu depois da recomendação. Esses registros não alteram as regras automaticamente; eles formam a memória operacional para futuras calibrações.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{resumo.emAndamento} em acompanhamento</Badge>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{resumo.confirmados} confirmada(s)</Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{resumo.naoConfirmados} não confirmada(s)</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className={compact ? "space-y-2 p-3" : "space-y-3 p-4"}>
        {!registros?.length ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">Nenhuma ação inteligente registrada ainda. Use “Acompanhar” em uma recomendação para começar o ciclo.</div>
        ) : (
          registros.map((registro) => (
            <div key={registro.id} className="rounded-2xl border bg-background p-3 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(registro)}
                    <Badge variant="secondary">{registro.origem}</Badge>
                    <Badge variant="outline">{registro.prioridade === "alta" ? "Alta" : registro.prioridade === "media" ? "Média" : "Informativa"}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{registro.titulo}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{registro.descricao}</p>
                  {registro.regra ? <p className="mt-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Regra:</span> {registro.regra}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Registrada em {formatarData(registro.registrada_em)}</span>
                    {registro.concluida_em ? <span>· concluída em {formatarData(registro.concluida_em)}</span> : null}
                  </div>
                  {registro.observacao ? <p className="mt-2 rounded-lg border border-sidebar-primary/15 bg-sidebar-primary/[0.035] px-3 py-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Resultado registrado:</span> {registro.observacao}</p> : null}
                </div>

                {registro.status === "EM_ANDAMENTO" ? (
                  <Button size="sm" variant="outline" onClick={() => { setAbertoId((atual) => atual === registro.id ? null : registro.id); setResultado("CONFIRMADO"); setObservacao(""); }}>
                    {abertoId === registro.id ? "Fechar" : "Registrar resultado"}
                  </Button>
                ) : null}
              </div>

              {abertoId === registro.id ? (
                <div className="mt-3 border-t pt-3">
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(resultadoLabel) as InteligenciaResultado[]).map((opcao) => (
                      <Button key={opcao} type="button" size="sm" variant={resultado === opcao ? "default" : "outline"} onClick={() => setResultado(opcao)}>{resultadoLabel[opcao]}</Button>
                    ))}
                  </div>
                  <Textarea className="mt-3 min-h-20" value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="O que foi encontrado ou qual foi o resultado da ação? (opcional)" />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="size-3.5" />O feedback é registrado como histórico operacional.</p>
                    <Button size="sm" onClick={() => void registrarResultado(registro)}><CheckCircle2 className="mr-2 size-3.5" />Salvar resultado</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
