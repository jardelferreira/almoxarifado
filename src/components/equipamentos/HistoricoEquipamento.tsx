import { useMemo, useState } from "react";
import {
    ArrowDownToLine, ArrowRight, ArrowUpFromLine, ClipboardList,
    Factory, History, PackageCheck, RotateCcw, Truck, Wrench, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatarData } from "@/utils/format";
import type { HistoricoEquipamentoEvento } from "@/services/equipamentos/historico";

type Props = {
    eventos: HistoricoEquipamentoEvento[];
    limiteInicial?: number;
};

const icones = {
    ENTRADA: PackageCheck,
    SAIDA: ArrowUpFromLine,
    DEVOLUCAO: RotateCcw,
    TRANSFERENCIA: ArrowRight,
    SINALIZAR_MANUTENCAO: Wrench,
    ENVIO: Truck,
    RETORNO_MANUTENCAO: RotateCcw,
    DEVOLUCAO_FORNECEDOR: Factory,
    BAIXA: X,
    REENTRADA: ArrowDownToLine,
    MANUTENCAO: Wrench,
    RETIRADA_MANUTENCAO: Wrench,
} as const;

function Evento({ evento }: { evento: HistoricoEquipamentoEvento }) {
    const Icon = icones[evento.tipo] ?? ClipboardList;

    return (
        <div className="relative pl-9">
            <div className="absolute left-0 top-0 flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm">
                <Icon className="size-3.5" aria-hidden="true" />
            </div>
            <div className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <p className="font-medium">{evento.titulo}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{formatarData(evento.data)}</p>
                    </div>
                    <Badge variant="outline">{evento.tipo}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Origem</p><p className="font-medium">{evento.origem}</p></div>
                    <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Destino</p><p className="font-medium">{evento.destino}</p></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Quantidade: <strong className="text-foreground">{evento.quantidade}</strong></span>
                    {evento.referenciaDocumento && <span>Documento: <strong className="text-foreground">{evento.referenciaDocumento}</strong></span>}
                </div>
                {evento.observacoes && <p className="mt-2 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">{evento.observacoes}</p>}
            </div>
        </div>
    );
}

export function HistoricoEquipamento({ eventos, limiteInicial = 4 }: Props) {
    const [aberto, setAberto] = useState(false);
    const recentes = useMemo(() => eventos.slice(0, limiteInicial), [eventos, limiteInicial]);

    return (
        <>
            <section aria-labelledby="historico-equipamento">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2"><History className="size-4 text-sidebar-primary" aria-hidden="true" /><h2 id="historico-equipamento" className="font-semibold">Histórico consolidado</h2></div>
                        <p className="mt-1 text-xs text-muted-foreground">Linha do tempo de todos os movimentos deste equipamento.</p>
                    </div>
                    <Badge variant="secondary">{eventos.length}</Badge>
                </div>

                {eventos.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada para este equipamento.</div>
                ) : (
                    <div className="relative space-y-3 before:absolute before:bottom-3 before:left-3.5 before:top-3 before:w-px before:bg-border">
                        {recentes.map((evento) => <Evento key={evento.id} evento={evento} />)}
                    </div>
                )}

                {eventos.length > limiteInicial && (
                    <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => setAberto(true)}>
                        <History className="mr-2 size-4" aria-hidden="true" />
                        Ver histórico completo ({eventos.length})
                    </Button>
                )}
            </section>

            <Dialog open={aberto} onOpenChange={setAberto}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Histórico consolidado</DialogTitle>
                    </DialogHeader>
                    <div className="relative space-y-3 pb-2 before:absolute before:bottom-3 before:left-3.5 before:top-3 before:w-px before:bg-border">
                        {eventos.map((evento) => <Evento key={evento.id} evento={evento} />)}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
