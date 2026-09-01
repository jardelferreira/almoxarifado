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
    if (novo) {
      localStorage.setItem(KEY_PROJETO, novo);
    } else {
      localStorage.removeItem(KEY_PROJETO);
    }

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

/**
 * Retorna somente os dados pertencentes ao projeto ativo.
 *
 * Categorias e unidades continuam globais, pois são catálogos
 * compartilhados entre os projetos.
 */
export function useDados(projetoId: string | null) {
  return useLiveQuery(
    async () => {
      const db = getDB();

      const projetos = await db.projetos.toArray();

      // Sem projeto ativo, não carregamos dados operacionais.
      if (!projetoId) {
        return {
          projetos,
          categorias: await db.categorias.toArray(),
          unidades: await db.unidades.toArray(),
          empresas: [],
          funcionarios: [],
          locais: [],
          produtos: [],
          equipes: [],
          equipeMembros: [],
          movimentacoes: [],
        };
      }

      const [
        categorias,
        unidades,
        empresas,
        funcionarios,
        locais,
        produtos,
        equipes,
      ] = await Promise.all([
        // Catálogos globais
        db.categorias.toArray(),
        db.unidades.toArray(),

        // Dados isolados pelo projeto
        db.empresas
          .where("projeto_id")
          .equals(projetoId)
          .toArray(),

        db.funcionarios
          .where("projeto_id")
          .equals(projetoId)
          .toArray(),

        db.locais
          .where("projeto_id")
          .equals(projetoId)
          .toArray(),

        db.produtos
          .where("projeto_id")
          .equals(projetoId)
          .toArray(),

        db.equipes
          .where("projeto_id")
          .equals(projetoId)
          .toArray(),
      ]);

      /**
       * Membros não possuem projeto_id diretamente.
       *
       * Como equipe_id já pertence ao projeto, buscamos somente
       * os membros das equipes do projeto atual.
       */
      const equipeIds = equipes.map((equipe) => equipe.id);

      const equipeMembros = equipeIds.length
        ? await db.equipe_membros
            .where("equipe_id")
            .anyOf(equipeIds)
            .toArray()
        : [];

      const movimentacoes: Movimentacao[] = await db.movimentacoes
        .where("projeto_id")
        .equals(projetoId)
        .toArray();

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
        movimentacoes: movimentacoes.sort((a, b) =>
          a.data < b.data ? 1 : -1,
        ),
      };
    },
    [projetoId],
  );
}

export function useProjetos() {
  return useLiveQuery(
    () => getDB().projetos.toArray(),
    [],
    [],
  );
}