import type { Categoria, Equipe, EstoqueItem, Movimentacao, Produto, Unidade } from "@/types";

/** Efeito de uma movimentação sobre o estoque (positivo ou negativo). */
export function efeito(m: Movimentacao): number {
  switch (m.tipo) {
    case "ENTRADA":
    case "DEVOLUCAO":
      return m.quantidade;
    case "SAIDA":
      return -m.quantidade;
    case "AJUSTE":
    case "TRANSFERENCIA":
      return (m.sinal ?? 1) * m.quantidade;
    default:
      return 0;
  }
}

export function estoquePorProduto(movs: Movimentacao[], equipeId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of movs) {
    if (m.equipe_id !== equipeId) continue;
    map.set(m.produto_id, (map.get(m.produto_id) ?? 0) + efeito(m));
  }
  return map;
}

export function estoqueDoProduto(movs: Movimentacao[], produtoId: string, equipeId: string) {
  return movs
    .filter((m) => m.produto_id === produtoId && m.equipe_id === equipeId)
    .reduce((acc, m) => acc + efeito(m), 0);
}

export function montarEstoque(
  produtos: Produto[],
  movs: Movimentacao[],
  unidades: Unidade[],
  categorias: Categoria[],
  equipes: Equipe[],
  equipeId?: string,
): EstoqueItem[] {
  const uMap = new Map(unidades.map((u) => [u.id, u]));
  const cMap = new Map(categorias.map((c) => [c.id, c]));
  const pMap = new Map(produtos.map((p) => [p.id, p]));
  const eMap = new Map(equipes.map((e) => [e.id, e]));
  const chaves = new Set(
    movs
      .filter((m) => !equipeId || m.equipe_id === equipeId)
      .map((m) => `${m.produto_id}:${m.equipe_id}`),
  );
  return [...chaves].flatMap((chave) => {
    const [produtoId, equipeIdDoItem] = chave.split(":");
    if (!produtoId || !equipeIdDoItem) return [];
    const p = pMap.get(produtoId);
    const equipe = eMap.get(equipeIdDoItem);
    if (!p || !equipe) return [];
    const estoque = estoqueDoProduto(movs, p.id, equipe.id);
    return [
      {
        id: chave,
        produto: p,
        equipe,
        unidade: p.unidade_id ? uMap.get(p.unidade_id) : undefined,
        categoria: p.categoria_id ? cMap.get(p.categoria_id) : undefined,
        estoque,
        minimo: p.estoque_minimo ?? 0,
        baixo: (p.estoque_minimo ?? 0) > 0 && estoque < (p.estoque_minimo ?? 0),
      },
    ];
  });
}

/** Agrupa saídas por chave, retornando totais ordenados. */
export function consumoPor(
  movs: Movimentacao[],
  key: (m: Movimentacao) => string | null | undefined,
  label: (id: string) => string,
  limite = 8,
) {
  const map = new Map<string, number>();
  for (const m of movs) {
    if (m.tipo !== "SAIDA") continue;
    const k = key(m) ?? "__sem__";
    map.set(k, (map.get(k) ?? 0) + m.quantidade);
  }
  return [...map.entries()]
    .map(([id, total]) => ({
      id,
      nome: id === "__sem__" ? "Não informado" : label(id),
      total: Number(total.toFixed(2)),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
}

export function agruparPorPeriodo(movs: Movimentacao[], grupo: "dia" | "semana" | "mes") {
  const chave = (data: string) => {
    const d = new Date(`${data}T00:00:00`);
    if (Number.isNaN(d.getTime())) return data;
    if (grupo === "mes") return data.slice(0, 7);
    if (grupo === "semana") {
      const dia = d.getDay();
      const ini = new Date(d);
      ini.setDate(d.getDate() - dia);
      return ini.toISOString().slice(0, 10);
    }
    return data;
  };

  const map = new Map<string, { saidas: number; entradas: number }>();
  for (const m of movs) {
    const k = chave(m.data);
    const cur = map.get(k) ?? { saidas: 0, entradas: 0 };
    if (m.tipo === "SAIDA") cur.saidas += m.quantidade;
    if (m.tipo === "ENTRADA" || m.tipo === "DEVOLUCAO") cur.entradas += m.quantidade;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([periodo, v]) => ({ periodo, ...v }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}
