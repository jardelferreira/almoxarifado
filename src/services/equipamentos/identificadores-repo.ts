import { getDB } from "@/db/db";

function normalizar(valor?: string | null): string | null {
  const texto = valor?.trim();
  return texto ? texto.toLowerCase() : null;
}

/**
 * Patrimônio e serial são identificadores únicos dentro do projeto.
 * A regra vale inclusive para registros inativos/encerrados.
 */
export async function validarPatrimonioESerialUnicos(
  projetoId: string,
  dados: {
    patrimonio?: string | null;
    serial?: string | null;
    ignorarEstoqueId?: string;
  },
): Promise<void> {
  const db = getDB();
  const patrimonio = normalizar(dados.patrimonio);
  const serial = normalizar(dados.serial);

  if (!patrimonio && !serial) return;

  const estoques = await db.estoque_equipamentos
    .where("projeto_id")
    .equals(projetoId)
    .toArray();

  if (
    patrimonio &&
    estoques.some(
      (item) =>
        item.id !== dados.ignorarEstoqueId &&
        normalizar(item.patrimonio) === patrimonio,
    )
  ) {
    throw new Error(
      `Já existe um equipamento com o patrimônio "${dados.patrimonio!.trim()}" neste projeto.`,
    );
  }

  if (
    serial &&
    estoques.some(
      (item) =>
        item.id !== dados.ignorarEstoqueId &&
        normalizar(item.serial) === serial,
    )
  ) {
    throw new Error(
      `Já existe um equipamento com o serial "${dados.serial!.trim()}" neste projeto.`,
    );
  }
}
