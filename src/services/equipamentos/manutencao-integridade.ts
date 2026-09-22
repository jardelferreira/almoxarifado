/**
 * Regras de integridade que conectam ocorrências de manutenção ao
 * histórico de movimentações de equipamentos.
 *
 * Esta camada é deliberadamente pura: não acessa IndexedDB e não depende
 * da interface. Importação, exportação e backup usam exatamente as mesmas
 * regras para evitar que uma operação aceite um estado que outra rejeite.
 */

type Linha = Record<string, unknown>;

const texto = (valor: unknown): string =>
  valor === undefined || valor === null ? "" : String(valor).trim();

const numero = (valor: unknown): number | null => {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const textoNumero = texto(valor).replace(",", ".");
  if (!textoNumero) return null;
  const valorNumero = Number(textoNumero);
  return Number.isFinite(valorNumero) ? valorNumero : null;
};

const TIPOS_POR_VINCULO = {
  movimento_sinalizacao_id: new Set(["SINALIZAR_MANUTENCAO", "MANUTENCAO"]),
  movimento_envio_id: new Set(["ENVIO", "RETIRADA_MANUTENCAO"]),
  movimento_retorno_id: new Set(["RETORNO_MANUTENCAO"]),
} as const;

export type ErroManutencao = (mensagem: string) => void;

/**
 * Valida o ciclo operacional da manutenção e seus vínculos físicos.
 *
 * A regra central do domínio é: o status operacional é consequência do
 * ciclo de movimentações. Portanto, uma ocorrência EM_MANUTENCAO não pode
 * carregar retorno e uma ocorrência concluída que esteja vinculada a um
 * retorno precisa apontar para um movimento de retorno real.
 */
export function validarIntegridadeManutencoes(
  manutencoes: readonly Linha[],
  movimentacoesEquipamentos: readonly Linha[],
  adicionarErro: ErroManutencao,
): void {
  const movimentosPorId = new Map<string, Linha>();
  for (const movimento of movimentacoesEquipamentos) {
    const id = texto(movimento.id);
    if (id) movimentosPorId.set(id, movimento);
  }

  const vinculosPorMovimento = new Map<string, string[]>();

  for (const manutencao of manutencoes) {
    const manutencaoId = texto(manutencao.id) || "(sem id)";
    const status = texto(manutencao.status_operacional).toUpperCase();
    const estoqueId = texto(manutencao.estoque_equipamento_id);
    const projetoId = texto(manutencao.projeto_id);
    const quantidade = numero(manutencao.quantidade);

    const referenciais = [
      "movimento_sinalizacao_id",
      "movimento_envio_id",
      "movimento_retorno_id",
    ] as const;

    for (const campo of referenciais) {
      const movimentoId = texto(manutencao[campo]);
      if (!movimentoId) continue;

      const movimento = movimentosPorId.get(movimentoId);
      if (!movimento) {
        adicionarErro(
          `Manutenção ${manutencaoId} referencia movimentação de equipamento inexistente em ${campo}.`,
        );
        continue;
      }

      const projetosIguais = texto(movimento.projeto_id) === projetoId;
      if (!projetosIguais) {
        adicionarErro(
          `Manutenção ${manutencaoId} referencia movimentação ${movimentoId} de outro projeto.`,
        );
      }

      if (texto(movimento.estoque_equipamento_id) !== estoqueId) {
        adicionarErro(
          `Manutenção ${manutencaoId} referencia movimentação ${movimentoId} de outro estoque físico.`,
        );
      }

      const tipoMovimento = texto(movimento.tipo).toUpperCase();
      if (!TIPOS_POR_VINCULO[campo].has(tipoMovimento)) {
        adicionarErro(
          `Manutenção ${manutencaoId} referencia movimentação ${movimentoId} com tipo ${tipoMovimento || "ausente"} incompatível com ${campo}.`,
        );
      }

      const quantidadeMovimento = numero(movimento.quantidade);
      if (quantidade !== null && quantidadeMovimento !== null && quantidade !== quantidadeMovimento) {
        adicionarErro(
          `Manutenção ${manutencaoId} possui quantidade ${quantidade}, mas a movimentação ${movimentoId} possui quantidade ${quantidadeMovimento}.`,
        );
      }

      const vinculos = vinculosPorMovimento.get(movimentoId) ?? [];
      vinculos.push(`${manutencaoId}.${campo}`);
      vinculosPorMovimento.set(movimentoId, vinculos);
    }

    const retornoId = texto(manutencao.movimento_retorno_id);
    const envioId = texto(manutencao.movimento_envio_id);
    const sinalizacaoId = texto(manutencao.movimento_sinalizacao_id);
    const dataEnvio = texto(manutencao.data_envio);
    const dataRetorno = texto(manutencao.data_retorno);

    if (status === "AGUARDANDO_ENVIO") {
      if (envioId || retornoId || dataEnvio || dataRetorno) {
        adicionarErro(
          `Manutenção ${manutencaoId} está como AGUARDANDO_ENVIO, mas possui ciclo de envio/retorno incompatível.`,
        );
      }
    }

    if (status === "EM_MANUTENCAO") {
      if (retornoId || dataRetorno) {
        adicionarErro(
          `Manutenção ${manutencaoId} está como EM_MANUTENCAO, mas possui retorno registrado.`,
        );
      }
    }

    if (status === "CANCELADA" && retornoId) {
      adicionarErro(
        `Manutenção ${manutencaoId} está como CANCELADA e não pode possuir movimento de retorno.`,
      );
    }

    if (status === "CONCLUIDA" && retornoId && !dataRetorno) {
      adicionarErro(
        `Manutenção ${manutencaoId} possui movimento de retorno, mas não possui data de retorno.`,
      );
    }

    if (retornoId && dataEnvio && dataRetorno && dataRetorno < dataEnvio) {
      adicionarErro(
        `Manutenção ${manutencaoId} possui data de retorno anterior à data de envio.`,
      );
    }
  }

  for (const [movimentoId, vinculos] of vinculosPorMovimento) {
    if (vinculos.length > 1) {
      adicionarErro(
        `Movimentação de equipamento ${movimentoId} está vinculada a mais de uma ocorrência de manutenção: ${vinculos.join(", ")}.`,
      );
    }
  }
}
