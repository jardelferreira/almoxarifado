import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardSignature } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RelatorioEquipamentosResponsavel } from "@/components/equipamentos/relatorios/RelatorioEquipamentosResponsavel";
import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { consultarRelatorioEquipamentosPorResponsavel } from "@/services/equipamentos/relatorios";

export const Route = createFileRoute("/app/fichas-equipamentos")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Fichas de Equipamentos" }],
  }),
  component: FichasEquipamentosPage,
});

function FichasEquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useLiveQuery(
    () => (projetoId ? consultarRelatorioEquipamentosPorResponsavel(projetoId) : undefined),
    [projetoId],
  );
  const projeto = useLiveQuery(
    () => (projetoId ? getDB().projetos.get(projetoId) : undefined),
    [projetoId],
  );

  if (!projetoId) return <p className="text-sm text-muted-foreground">Selecione um projeto para consultar as fichas.</p>;
  if (!dados) return <p className="text-sm text-muted-foreground">Carregando fichas de equipamentos…</p>;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <ClipboardSignature className="size-4 text-primary" aria-hidden="true" />
            Equipamentos · Operação
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Fichas de equipamentos</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Consulte os equipamentos vinculados a cada funcionário e emita fichas para assinatura.</p>
        </div>
        <Badge variant="outline" className="w-fit shrink-0">A4 paisagem</Badge>
      </header>

      <RelatorioEquipamentosResponsavel dados={dados} projetoNome={projeto?.nome ?? projetoId} />
    </div>
  );
}
