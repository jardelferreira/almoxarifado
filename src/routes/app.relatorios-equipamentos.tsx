import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";

import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { CentralRelatoriosEquipamentos } from "@/components/equipamentos/relatorios/CentralRelatoriosEquipamentos";
import {
  consultarRelatorioEquipamentosEmUso,
  consultarRelatorioEquipamentosPorResponsavel,
  consultarRelatorioEquipamentosDisponibilidade,
  consultarRelatorioEquipamentosManutencao,
  consultarRelatorioEquipamentosMovimentacoes,
  consultarRelatorioEquipamentosEquipe,
  consultarRelatorioEquipamentosSituacao,
  consultarRelatorioEquipamentosEncerrados,
} from "@/services/equipamentos/relatorios";

export const Route = createFileRoute("/app/relatorios-equipamentos")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Relatórios de Equipamentos" }],
  }),
  component: RelatoriosEquipamentosPage,
});

function RelatoriosEquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();

  const dadosSituacao = useLiveQuery(
    () =>
      projetoId
        ? consultarRelatorioEquipamentosSituacao(projetoId)
        : undefined,
    [projetoId],
  );

  const dadosEquipe = useLiveQuery(
    () =>
      projetoId
        ? consultarRelatorioEquipamentosEquipe(projetoId)
        : undefined,
    [projetoId],
  );

  const dadosResponsavel = useLiveQuery(
    () =>
      projetoId
        ? consultarRelatorioEquipamentosPorResponsavel(projetoId)
        : undefined,
    [projetoId],
  );

  const dadosDisponibilidade = useLiveQuery(
    () =>
      projetoId
        ? consultarRelatorioEquipamentosDisponibilidade(projetoId)
        : undefined,
    [projetoId],
  );

  const dadosManutencao = useLiveQuery(
    () =>
      projetoId
        ? consultarRelatorioEquipamentosManutencao(projetoId)
        : undefined,
    [projetoId],
  );

  const dadosMovimentacoes = useLiveQuery(
    () =>
      projetoId
        ? consultarRelatorioEquipamentosMovimentacoes(projetoId)
        : undefined,
    [projetoId],
  );

  const dadosEmUso = useLiveQuery(
    () =>
      projetoId
        ? consultarRelatorioEquipamentosEmUso(projetoId)
        : undefined,
    [projetoId],
  );

  const dadosEncerrados = useLiveQuery(
    () =>
      projetoId
        ? consultarRelatorioEquipamentosEncerrados(projetoId)
        : undefined,
    [projetoId],
  );

  const projeto = useLiveQuery(
    () => (projetoId ? getDB().projetos.get(projetoId) : undefined),
    [projetoId],
  );

  if (!projetoId) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecione um projeto para consultar os relatórios de equipamentos.
      </p>
    );
  }

  if (!dadosSituacao || !dadosEquipe || !dadosEmUso || !dadosResponsavel || !dadosDisponibilidade || !dadosManutencao || !dadosMovimentacoes || !dadosEncerrados) {
    return (
      <p className="text-sm text-muted-foreground">
        Carregando relatórios de equipamentos…
      </p>
    );
  }

  return (
    <CentralRelatoriosEquipamentos
      dadosSituacao={dadosSituacao}
      dadosEquipe={dadosEquipe}
      dadosEmUso={dadosEmUso}
      dadosResponsavel={dadosResponsavel}
      dadosDisponibilidade={dadosDisponibilidade}
      dadosManutencao={dadosManutencao}
      dadosMovimentacoes={dadosMovimentacoes}
      dadosEncerrados={dadosEncerrados}
      projetoNome={projeto?.nome ?? projetoId}
    />
  );
}
