import { getDB } from "@/db/db";
import type {
  ConsumoEquipamento,
  Movimentacao,
  ReducaoConsumoDevolucao,
} from "@/types";

/**
 * Regra de negócio: a devolução reduz o consumo apropriado a equipamento da
 * saída que ela referencia, e a exclusão/edição da devolução restaura esse
 * consumo.
 *
 * Este módulo depende APENAS do banco (nunca de outros repositórios) para
 * poder ser usado por `repo.saveMovimentacao` / `repo.deleteMovimentacao` sem
 * criar dependência circular. Tudo aqui deve rodar dentro de uma transação
 * Dexie que inclua `movimentacoes` e `consumos_equipamentos`, e só usa
 * chamadas Dexie (nada de await em outras promises).
 *
 * Onde fica o rastro: a própria movimentação de DEVOLUÇÃO guarda
 * `consumo_reduzido` (um snapshot de cada apropriação que ela mexeu). Assim o
 * rastro some junto com a devolução, acompanha o backup da movimentação e
 * não exige nova tabela.
 */

const CASAS_DECIMAIS = 6;

export function arredondarQuantidade(valor: number): number {
  return Number(valor.toFixed(CASAS_DECIMAIS));
}

function recalcularCustoTotal(
  custoUnitario: number | null,
  quantidade: number,
): number | null {
  return custoUnitario == null
    ? null
    : Number((custoUnitario * quantidade).toFixed(CASAS_DECIMAIS));
}

async function listarConsumos(
  projetoId: string,
  saidaId: string,
): Promise<ConsumoEquipamento[]> {
  const registros = await getDB()
    .consumos_equipamentos
    .where("movimentacao_id")
    .equals(saidaId)
    .toArray();

  return registros
    .filter((registro) => registro.projeto_id === projetoId)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

async function listarDevolucoesDaSaida(
  projetoId: string,
  saidaId: string,
): Promise<Movimentacao[]> {
  return getDB()
    .movimentacoes
    .where("projeto_id")
    .equals(projetoId)
    .filter(
      (item) =>
        item.tipo === "DEVOLUCAO" && item.movimentacao_origem_id === saidaId,
    )
    .toArray();
}

/**
 * Quantidade da saída que continua sendo consumo: saída − devoluções.
 * `ignorarDevolucaoId` trata uma devolução como inexistente (usado ao
 * restaurar, quando ela está sendo excluída ou reescrita).
 */
export async function quantidadeLiquidaDaSaida(
  projetoId: string,
  saida: Pick<Movimentacao, "id" | "quantidade">,
  ignorarDevolucaoId?: string,
): Promise<number> {
  const devolucoes = await listarDevolucoesDaSaida(projetoId, saida.id);
  const devolvido = devolucoes
    .filter((item) => item.id !== ignorarDevolucaoId)
    .reduce((total, item) => total + item.quantidade, 0);

  return Math.max(0, arredondarQuantidade(saida.quantidade - devolvido));
}

/**
 * Aplica uma devolução já gravada (ou prestes a ser gravada na mesma
 * transação) sobre as apropriações da saída. Devolve o rastro que deve ser
 * salvo em `consumo_reduzido` da própria devolução.
 *
 * O corte é proporcional à quantidade de cada apropriação e limitado ao que
 * a devolução efetivamente "tirou" do consumo: se só parte da saída estava
 * apropriada e o líquido ainda comporta o apropriado, nada é cortado.
 * Apropriações que chegam a zero são removidas (o snapshot permite recriar).
 */
export async function reduzirConsumoPelaDevolucao(
  devolucao: Pick<
    Movimentacao,
    "id" | "projeto_id" | "quantidade" | "movimentacao_origem_id"
  >,
): Promise<ReducaoConsumoDevolucao[]> {
  if (!devolucao.movimentacao_origem_id) return [];

  const db = getDB();
  const saida = await db.movimentacoes.get(devolucao.movimentacao_origem_id);
  if (!saida || saida.projeto_id !== devolucao.projeto_id) return [];

  const existentes = await listarConsumos(devolucao.projeto_id, saida.id);
  if (existentes.length === 0) return [];

  const apropriado = arredondarQuantidade(
    existentes.reduce((total, consumo) => total + consumo.quantidade, 0),
  );

  // A devolução já precisa estar contada no líquido (ela é gravada antes de
  // esta chamada, na mesma transação).
  const liquida = await quantidadeLiquidaDaSaida(devolucao.projeto_id, saida);
  const excedente = Math.min(
    devolucao.quantidade,
    Math.max(0, arredondarQuantidade(apropriado - liquida)),
  );

  if (excedente <= 0) return [];

  const agora = new Date().toISOString();
  const rastro: ReducaoConsumoDevolucao[] = [];
  let restanteACortar = excedente;

  for (let indice = 0; indice < existentes.length; indice += 1) {
    const consumo = existentes[indice];
    if (!consumo) continue;

    const ultimo = indice === existentes.length - 1;
    const corte = ultimo
      ? Math.min(consumo.quantidade, restanteACortar)
      : Math.min(
          consumo.quantidade,
          arredondarQuantidade((excedente * consumo.quantidade) / apropriado),
        );

    if (corte <= 0) continue;

    const nova = arredondarQuantidade(consumo.quantidade - corte);
    restanteACortar = arredondarQuantidade(restanteACortar - corte);
    const removido = nova <= 0;

    rastro.push({
      consumo_id: consumo.id,
      quantidade_reduzida: corte,
      removido,
      snapshot: consumo,
    });

    if (removido) {
      await db.consumos_equipamentos.delete(consumo.id);
      continue;
    }

    const nota = `Reduzido por devolução: ${consumo.quantidade} → ${nova}.`;
    await db.consumos_equipamentos.put({
      ...consumo,
      quantidade: nova,
      custo_total: recalcularCustoTotal(consumo.custo_unitario, nova),
      observacao: consumo.observacao ? `${consumo.observacao} | ${nota}` : nota,
      atualizado_em: agora,
    });
  }

  return rastro;
}

export interface ResultadoRestauracaoConsumo {
  quantidadeRestaurada: number;
  /** Apropriações removidas manualmente depois da devolução: não recriadas. */
  ignoradas: number;
  /** Parte que não coube no saldo da saída (ex.: rateio manual posterior). */
  excedenteNaoRestaurado: number;
}

/**
 * Desfaz o efeito de uma devolução sobre as apropriações. Chamar ao excluir
 * ou reescrever a devolução (antes de remover/substituir o registro, com o
 * objeto ainda contendo `consumo_reduzido`).
 *
 * A restauração é limitada pelo líquido da saída calculado SEM esta
 * devolução, para nunca apropriar mais que a saída — caso o usuário tenha
 * feito rateio manual depois da devolução.
 */
export async function restaurarConsumoDaDevolucao(
  devolucao: Pick<
    Movimentacao,
    "id" | "projeto_id" | "movimentacao_origem_id" | "consumo_reduzido"
  >,
): Promise<ResultadoRestauracaoConsumo> {
  const vazio: ResultadoRestauracaoConsumo = {
    quantidadeRestaurada: 0,
    ignoradas: 0,
    excedenteNaoRestaurado: 0,
  };
  const rastro = devolucao.consumo_reduzido ?? [];
  if (rastro.length === 0 || !devolucao.movimentacao_origem_id) return vazio;

  const db = getDB();
  const saida = await db.movimentacoes.get(devolucao.movimentacao_origem_id);
  if (!saida || saida.projeto_id !== devolucao.projeto_id) return vazio;

  const liquidaSemEsta = await quantidadeLiquidaDaSaida(
    devolucao.projeto_id,
    saida,
    devolucao.id,
  );

  // Snapshots de OUTRAS devoluções que zeraram a mesma apropriação: permitem
  // recriá-la quando esta devolução foi a que só a reduziu parcialmente.
  const outras = (await listarDevolucoesDaSaida(devolucao.projeto_id, saida.id))
    .filter((item) => item.id !== devolucao.id);
  const snapshotDeRemovidas = new Map<string, ConsumoEquipamento>();
  for (const outra of outras) {
    for (const item of outra.consumo_reduzido ?? []) {
      if (item.removido) snapshotDeRemovidas.set(item.consumo_id, item.snapshot);
    }
  }

  let apropriado = arredondarQuantidade(
    (await listarConsumos(devolucao.projeto_id, saida.id)).reduce(
      (total, consumo) => total + consumo.quantidade,
      0,
    ),
  );

  const agora = new Date().toISOString();
  const resultado: ResultadoRestauracaoConsumo = { ...vazio };

  // Ordem inversa à da redução: a última apropriação cortada é a primeira
  // a ser devolvida ao saldo.
  for (const item of [...rastro].reverse()) {
    const sala = Math.max(0, arredondarQuantidade(liquidaSemEsta - apropriado));
    const quantidade = Math.min(item.quantidade_reduzida, sala);
    const sobra = arredondarQuantidade(item.quantidade_reduzida - quantidade);
    if (sobra > 0) resultado.excedenteNaoRestaurado += sobra;
    if (quantidade <= 0) continue;

    const atual = await db.consumos_equipamentos.get(item.consumo_id);

    if (atual) {
      const nova = arredondarQuantidade(atual.quantidade + quantidade);
      const nota = `Restaurado por exclusão/edição de devolução: ${atual.quantidade} → ${nova}.`;
      await db.consumos_equipamentos.put({
        ...atual,
        quantidade: nova,
        custo_total: recalcularCustoTotal(atual.custo_unitario, nova),
        observacao: atual.observacao ? `${atual.observacao} | ${nota}` : nota,
        atualizado_em: agora,
      });
    } else {
      // A apropriação só pode ser recriada se ELA foi removida por zeramento
      // (por esta ou por outra devolução). Se sumiu por ação manual do
      // usuário depois, respeita a decisão dele.
      const base = item.removido
        ? item.snapshot
        : snapshotDeRemovidas.get(item.consumo_id);

      if (!base) {
        resultado.ignoradas += 1;
        continue;
      }

      const nota = "Recriado por exclusão/edição de devolução.";
      await db.consumos_equipamentos.put({
        ...base,
        quantidade,
        custo_total: recalcularCustoTotal(base.custo_unitario, quantidade),
        observacao: base.observacao ? `${base.observacao} | ${nota}` : nota,
        atualizado_em: agora,
      });
    }

    apropriado = arredondarQuantidade(apropriado + quantidade);
    resultado.quantidadeRestaurada = arredondarQuantidade(
      resultado.quantidadeRestaurada + quantidade,
    );
  }

  return resultado;
}