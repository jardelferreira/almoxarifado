import { getDB, uid } from "@/db/db";
import type { Equipe } from "@/types";

const EQUIPES_OBRIGATORIAS = [
  {
    nome: "Almoxarifado",
    descricao: "Equipe responsável pelo almoxarifado do projeto.",
  },
  {
    nome: "Manutenção",
    descricao: "Equipe responsável pela manutenção dos equipamentos do projeto.",
  },
] as const;

export async function inicializarProjeto(projetoId: string) {
  if (!projetoId) return;

  const db = getDB();

  const equipes = await db.equipes
    .where("projeto_id")
    .equals(projetoId)
    .toArray();

  const nomesExistentes = new Set(
    equipes.map((equipe) => equipe.nome.trim().toLowerCase()),
  );

  const novasEquipes: Equipe[] = [];

  for (const equipePadrao of EQUIPES_OBRIGATORIAS) {
    const nomeNormalizado = equipePadrao.nome.toLowerCase();

    if (nomesExistentes.has(nomeNormalizado)) {
      continue;
    }

    novasEquipes.push({
      id: uid(),
      projeto_id: projetoId,
      nome: equipePadrao.nome,
      descricao: equipePadrao.descricao,
      ativo: true,
      estoque_segregado: true,
    });
  }

  if (novasEquipes.length === 0) {
    return;
  }

  await db.equipes.bulkPut(novasEquipes);
}