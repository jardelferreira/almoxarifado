import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { getDB } from "@/db/db";
import type { Movimentacao } from "@/types";

const KEY_PROJETO = "almox.projeto_ativo";

export function useProjetoAtivoId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(localStorage.getItem(KEY_PROJETO));
  }, []);
  const set = useCallback((novo: string | null) => {
    if (novo) localStorage.setItem(KEY_PROJETO, novo);
    else localStorage.removeItem(KEY_PROJETO);
    setId(novo);
  }, []);
  return [id, set] as const;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  return online;
}

/** Todos os cadastros + movimentações do projeto ativo, reativos. */
export function useDados(projetoId: string | null) {
  return useLiveQuery(async () => {
    const db = getDB();
    const [
      projetos,
      categorias,
      unidades,
      empresas,
      funcionarios,
      locais,
      produtos,
      equipes,
      equipeMembros,
    ] = await Promise.all([
      db.projetos.toArray(),
      db.categorias.toArray(),
      db.unidades.toArray(),
      db.empresas.toArray(),
      db.funcionarios.toArray(),
      db.locais.toArray(),
      db.produtos.toArray(),
      db.equipes.toArray(),
      db.equipe_membros.toArray(),
    ]);
    const movimentacoes: Movimentacao[] = projetoId
      ? await db.movimentacoes.where("projeto_id").equals(projetoId).toArray()
      : [];
    return {
      projetos,
      categorias,
      unidades,
      empresas,
      funcionarios,
      locais,
      produtos,
      equipes,
      equipeMembros,
      movimentacoes: movimentacoes.sort((a, b) => (a.data < b.data ? 1 : -1)),
    };
  }, [projetoId]);
}

export function useProjetos() {
  return useLiveQuery(() => getDB().projetos.toArray(), [], []);
}
