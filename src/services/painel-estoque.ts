import { getDB } from "@/db/db";
import { montarEstoque } from "@/services/estoque";
import type { PainelEstoqueDados } from "@/types";

export async function montarPublicacaoPainelEstoque(
  projetoId: string,
): Promise<PainelEstoqueDados> {
  const db = getDB();
  const [projeto, produtos, movimentacoes, unidades, categorias, equipes] = await Promise.all([
    db.projetos.get(projetoId),
    db.produtos.where("projeto_id").equals(projetoId).toArray(),
    db.movimentacoes.where("projeto_id").equals(projetoId).toArray(),
    db.unidades.toArray(),
    db.categorias.toArray(),
    db.equipes.where("projeto_id").equals(projetoId).toArray(),
  ]);
  if (!projeto) throw new Error("Projeto ativo não localizado.");

  const itens = montarEstoque(produtos, movimentacoes, unidades, categorias, equipes)
    .filter((item) => item.equipe.ativo && item.produto.ativo)
    .map(
      (item) =>
        ({
          produtoId: item.produto.id,
          produto: item.produto.nome,
          codigo: item.produto.codigo ?? null,
          categoria: item.categoria?.nome ?? null,
          unidade: item.unidade?.sigla ?? null,
          equipe: item.equipe.nome,
          quantidade: item.estoque,
          minimo: item.minimo,
          status: item.estoque <= 0 ? "ZERADO" : item.baixo ? "BAIXO" : "DISPONIVEL",
        }) as const,
    )
    .sort(
      (a, b) =>
        a.produto.localeCompare(b.produto, "pt-BR") || a.equipe.localeCompare(b.equipe, "pt-BR"),
    );

  return {
    formato: "ALMOXARIFADO_PAINEL_ESTOQUE",
    versao: 1,
    projeto_id: projetoId,
    projeto_nome: projeto.nome,
    atualizado_em: new Date().toISOString(),
    itens,
  };
}
