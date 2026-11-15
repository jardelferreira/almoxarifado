import type { AnyRouter } from "@tanstack/react-router";

const ROTAS_OFFLINE = [
  "/",
  "/consulta-estoque",
  "/consulta-funcionario",
  "/compartilhar-projeto",
  "/app",
  "/app/",
  "/app/apropriacoes",
  "/app/cadastros",
  "/app/compartilhar-painel",
  "/app/configuracoes",
  "/app/cronologia",
  "/app/dados",
  "/app/documentos",
  "/app/equipamentos",
  "/app/estatisticas",
  "/app/estatisticas-equipamentos",
  "/app/estoque",
  "/app/fichas-equipamentos",
  "/app/inventario",
  "/app/lancar",
  "/app/mesclar-parametros-equipamentos",
  "/app/movimentacoes",
  "/app/movimentacoes-equipamentos",
  "/app/painel-apropriacoes",
  "/app/perfis-parametros-equipamentos",
  "/app/previsto-real-equipamentos",
  "/app/produto",
  "/app/recebimentos",
  "/app/regras-consumo-equipamentos",
  "/app/relatorios-equipamentos",
  "/app/simulacao-custos",
  "/app/vigia",
  "/app/vigia-equipamentos",
  "/app/estatisticas/relatorio",
] as const;

export function agendarPrecarregamentoOffline(router: AnyRouter): () => void {
  if (typeof window === "undefined" || !navigator.onLine) return () => undefined;

  let cancelado = false;
  const executar = () => {
    if (cancelado || !navigator.onLine) return;
    void Promise.allSettled(ROTAS_OFFLINE.map((to) => router.preloadRoute({ to } as never)));
  };

  const janela = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  const idleId = janela.requestIdleCallback
    ? janela.requestIdleCallback(executar, { timeout: 2500 })
    : window.setTimeout(executar, 1200);

  return () => {
    cancelado = true;
    if (janela.cancelIdleCallback && janela.requestIdleCallback) janela.cancelIdleCallback(idleId);
    else window.clearTimeout(idleId);
  };
}
