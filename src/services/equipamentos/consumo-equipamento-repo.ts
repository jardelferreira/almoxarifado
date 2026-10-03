import { getDB, uid } from "@/db/db";
import {
  regrasConsumoEquipamentosRepo,
  resolverRegrasEfetivas,
} from "@/services/equipamentos/regras-consumo-repo";
import {
  arredondarQuantidade,
  quantidadeLiquidaDaSaida,
} from "@/services/equipamentos/consumo-devolucao";
import { estadoEquipamentosRepo } from "@/services/equipamentos/estado-repo";
import type {
  ConsumoEquipamento,
  Equipamento,
  EstoqueEquipamento,
  Movimentacao,
  Produto,
} from "@/types";

export type SalvarConsumoEquipamentoInput = {
  id?: string;
  movimentacaoId: string;
  estoqueEquipamentoId: string;
  quantidade: number;
  observacao?: string | null;
  origem?: ConsumoEquipamento["origem"];
};

export interface CandidatoConsumoEquipamento {
  estoqueEquipamentoId: string;
  equipamentoId: string;
  equipamentoNome: string;
  identificacao: string | null;
  regraIds: string[];
  quantidadeEmUso: number;
  funcionarioNome: string | null;
}

export type StatusOpcaoApropriacaoEquipamento =
  | "EM_USO_PELO_DESTINATARIO"
  | "EM_USO"
  | "DISPONIVEL"
  | "MANUTENCAO"
  | "ENCERRADO"
  | "ESTADO_INVALIDO";

export interface OpcaoApropriacaoEquipamento {
  estoqueEquipamentoId: string;
  equipamentoId: string;
  equipamentoNome: string;
  identificacao: string | null;
  status: StatusOpcaoApropriacaoEquipamento;
  quantidadeEmUso: number;
  usuarios: Array<{
    funcionarioId: string;
    funcionarioNome: string;
    quantidade: number;
  }>;
  compativelComProduto: boolean;
  regraIds: string[];
}

/**
 * Motivo pelo qual um equipamento que ESTÁ com o funcionário foi descartado
 * da vinculação automática. Antes, esses descartes eram silenciosos
 * (`return null`), o que tornava impossível saber por que nada foi vinculado.
 */
export type MotivoDescarteCandidato =
  | "ENCERRADO"
  | "SEM_REGRA_PARA_PRODUTO"
  | "ESTADO_INVALIDO";

export interface DescarteCandidatoEquipamento {
  estoqueEquipamentoId: string;
  equipamentoNome: string;
  identificacao: string | null;
  motivo: MotivoDescarteCandidato;
  /** Mensagem técnica original, quando o motivo é ESTADO_INVALIDO. */
  detalhe?: string;
}

export type MotivoSemCandidato =
  | "SAIDA_SEM_FUNCIONARIO"
  | "FUNCIONARIO_NAO_ENCONTRADO"
  | "FUNCIONARIO_INATIVO"
  | "FUNCIONARIO_SEM_EQUIPAMENTO"
  | "EQUIPAMENTO_DESCARTADO"
  | "SAIDA_JA_POSSUI_APROPRIACAO"
  | "SAIDA_TOTALMENTE_DEVOLVIDA";

export interface DiagnosticoApropriacao {
  motivo: MotivoSemCandidato;
  descartados: DescarteCandidatoEquipamento[];
}

export type ResultadoApropriacaoAutomatica =
  | {
      status: "VINCULADO";
      consumo: ConsumoEquipamento;
      candidato: CandidatoConsumoEquipamento;
    }
  | {
      status: "AMBIGUO";
      candidatos: CandidatoConsumoEquipamento[];
    }
  | {
      status: "SEM_CANDIDATO";
      diagnostico: DiagnosticoApropriacao;
    };

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

// Reexportado para que as telas usem a MESMA regra de arredondamento.
export { arredondarQuantidade };

function validarQuantidade(quantidade: number): void {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("A quantidade apropriada deve ser maior que zero.");
  }
}

function identificacaoDoEstoque(estoque: EstoqueEquipamento): string | null {
  return estoque.identificacao || estoque.patrimonio || estoque.serial || null;
}

function somarQuantidades(registros: ConsumoEquipamento[]): number {
  return arredondarQuantidade(
    registros.reduce((total, registro) => total + registro.quantidade, 0),
  );
}

async function obterMovimentacao(
  projetoId: string,
  movimentacaoId: string,
): Promise<Movimentacao> {
  const movimentacao = await getDB().movimentacoes.get(movimentacaoId);

  if (!movimentacao || movimentacao.projeto_id !== projetoId) {
    throw new Error("Movimentação não encontrada neste projeto.");
  }

  if (movimentacao.tipo !== "SAIDA") {
    throw new Error("Somente saídas de materiais podem ser apropriadas a equipamentos.");
  }

  return movimentacao;
}

async function obterProduto(
  projetoId: string,
  produtoId: string,
): Promise<Produto> {
  const produto = await getDB().produtos.get(produtoId);

  if (!produto || produto.projeto_id !== projetoId) {
    throw new Error("O produto da movimentação não pertence ao projeto.");
  }

  return produto;
}

function precoValido(valor: number | null | undefined): valor is number {
  return valor != null && Number.isFinite(valor) && valor >= 0;
}

/**
 * Regra de negócio: o custo do consumo usa SEMPRE o último preço unitário
 * disponível do produto, isto é, o `valor_unitario` do item de documento mais
 * recente (por data de emissão) entre os documentos não cancelados do projeto.
 *
 * Antes, o custo vinha do `documento_item_id` da própria saída — campo que o
 * lançamento grava sempre como `null`; por isso todo consumo ficava "sem custo".
 */
async function obterUltimoPrecoDoProduto(
  projetoId: string,
  produtoId: string,
): Promise<number | null> {
  const db = getDB();
  const itens = await db.documento_itens
    .where("produto_id")
    .equals(produtoId)
    .toArray();

  if (itens.length === 0) return null;

  const documentoIds = [...new Set(itens.map((item) => item.documento_id))];
  const documentos = await db.documentos.bulkGet(documentoIds);

  const chaveDoDocumento = new Map<string, string>();
  for (const documento of documentos) {
    if (
      !documento ||
      documento.projeto_id !== projetoId ||
      documento.status === "CANCELADO"
    ) {
      continue;
    }
    chaveDoDocumento.set(
      documento.id,
      documento.data_emissao ?? documento.data_entrada ?? documento.criado_em,
    );
  }

  const ordenados = itens
    .filter(
      (item) =>
        precoValido(item.valor_unitario) &&
        chaveDoDocumento.has(item.documento_id),
    )
    .map((item) => ({
      valor: item.valor_unitario as number,
      chave: `${chaveDoDocumento.get(item.documento_id) ?? ""}|${item.id}`,
    }))
    .sort((a, b) => b.chave.localeCompare(a.chave));

  return ordenados[0]?.valor ?? null;
}

async function validarEquipamento(
  projetoId: string,
  estoqueEquipamentoId: string,
): Promise<{ estoqueId: string; equipamentoId: string }> {
  const estoque = await getDB().estoque_equipamentos.get(estoqueEquipamentoId);

  if (!estoque || estoque.projeto_id !== projetoId) {
    throw new Error("Registro de estoque do equipamento não encontrado neste projeto.");
  }

  const equipamento = await getDB().equipamentos.get(estoque.equipamento_id);

  if (!equipamento || equipamento.projeto_id !== projetoId) {
    throw new Error("Equipamento do registro de estoque não encontrado neste projeto.");
  }

  return {
    estoqueId: estoque.id,
    equipamentoId: equipamento.id,
  };
}

async function listarConsumosDaMovimentacao(
  projetoId: string,
  movimentacaoId: string,
): Promise<ConsumoEquipamento[]> {
  const registros = await getDB()
    .consumos_equipamentos
    .where("movimentacao_id")
    .equals(movimentacaoId)
    .toArray();

  return registros
    .filter((registro) => registro.projeto_id === projetoId)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

/* ------------------------------------------------------------------ */
/* Detecção de candidatos                                              */
/* ------------------------------------------------------------------ */

/**
 * Pré-filtro de desempenho. Pelo `estado-repo`, um funcionário só passa a ter
 * quantidade de um equipamento por movimentação cujo DESTINO é ele (SAIDA ou
 * TRANSFERENCIA). Logo, só os registros físicos que já foram destinados a ele
 * podem estar "em uso" por ele. Uma consulta pelo índice `destino_id` troca o
 * cálculo de estado de TODOS os equipamentos do projeto pelo de meia dúzia.
 */
async function estoquesJaDestinadosAoFuncionario(
  projetoId: string,
  funcionarioId: string,
): Promise<string[]> {
  const movimentos = await getDB()
    .movimentacoes_equipamentos
    .where("destino_id")
    .equals(funcionarioId)
    .toArray();

  return [
    ...new Set(
      movimentos
        .filter(
          (movimento) =>
            movimento.projeto_id === projetoId &&
            movimento.tipo_destino === "FUNCIONARIO",
        )
        .map((movimento) => movimento.estoque_equipamento_id),
    ),
  ];
}

interface AvaliacaoCandidatos {
  candidatos: CandidatoConsumoEquipamento[];
  /** Preenchido somente quando `candidatos` está vazio. */
  diagnostico: DiagnosticoApropriacao | null;
}

function semCandidatos(
  motivo: MotivoSemCandidato,
  descartados: DescarteCandidatoEquipamento[] = [],
): AvaliacaoCandidatos {
  return { candidatos: [], diagnostico: { motivo, descartados } };
}

type AvaliacaoEstoque =
  | { tipo: "CANDIDATO"; candidato: CandidatoConsumoEquipamento }
  | { tipo: "DESCARTE"; descarte: DescarteCandidatoEquipamento };

/**
 * Localiza equipamentos atualmente apropriados ao funcionário da saída
 * que possuem uma regra efetiva para o mesmo produto na data da movimentação.
 *
 * A busca retorna um candidato por registro físico. Várias regras para o
 * mesmo produto no mesmo equipamento não geram duplicidade de candidato.
 *
 * A fonte da verdade sobre "quem está usando cada equipamento" é o estado
 * reconstruído por `estadoEquipamentosRepo.calcular()` — a mesma fonte da
 * lista manual do modal de movimentação. Por isso este filtro NÃO exige
 * `estoque.status === "ATIVO"`: o estado (`encerrado`) já decide se o
 * registro físico ainda está em operação, e exigir um status adicional fazia
 * a detecção automática divergir da lista manual (equipamento aparecia como
 * "Em uso pelo destinatário · Regra compatível" no modal, mas a vinculação
 * automática dizia "sem candidato").
 *
 * Todo descarte de um equipamento que está com o funcionário é registrado
 * com motivo, em vez de sumir em silêncio.
 */
async function avaliarCandidatos(
  projetoId: string,
  funcionarioId: string,
  produtoId: string,
  dataReferencia: string,
): Promise<AvaliacaoCandidatos> {
  const db = getDB();
  const funcionario = await db.funcionarios.get(funcionarioId);

  if (!funcionario || funcionario.projeto_id !== projetoId) {
    return semCandidatos("FUNCIONARIO_NAO_ENCONTRADO");
  }

  if (funcionario.status !== "ATIVO") {
    return semCandidatos("FUNCIONARIO_INATIVO");
  }

  const dia = dataReferencia.slice(0, 10);

  const idsDeEstoque = await estoquesJaDestinadosAoFuncionario(
    projetoId,
    funcionarioId,
  );

  if (idsDeEstoque.length === 0) {
    return semCandidatos("FUNCIONARIO_SEM_EQUIPAMENTO");
  }

  const estoques = (await db.estoque_equipamentos.bulkGet(idsDeEstoque)).filter(
    (estoque): estoque is EstoqueEquipamento =>
      estoque != null && estoque.projeto_id === projetoId,
  );

  const equipamentos = (
    await db.equipamentos.bulkGet([
      ...new Set(estoques.map((estoque) => estoque.equipamento_id)),
    ])
  ).filter(
    (equipamento): equipamento is Equipamento =>
      equipamento != null && equipamento.projeto_id === projetoId,
  );

  const equipamentoPorId = new Map(
    equipamentos.map((equipamento) => [equipamento.id, equipamento]),
  );

  const avaliacoes = await Promise.all(
    estoques.map(async (estoque): Promise<AvaliacaoEstoque | null> => {
      const equipamento = equipamentoPorId.get(estoque.equipamento_id);
      const base = {
        estoqueEquipamentoId: estoque.id,
        equipamentoNome: equipamento?.nome ?? "Equipamento não encontrado",
        identificacao: identificacaoDoEstoque(estoque),
      };

      const descartar = (
        motivo: MotivoDescarteCandidato,
        detalhe?: string,
      ): AvaliacaoEstoque => ({
        tipo: "DESCARTE",
        descarte: detalhe ? { ...base, motivo, detalhe } : { ...base, motivo },
      });

      /*
       * `calcular` lança erro quando o histórico de UM equipamento é
       * inconsistente (ou quando faltam as equipes Almoxarifado/Manutenção).
       * Sem este isolamento, um único registro ruim derrubava a vinculação
       * de TODOS os equipamentos do projeto.
       */
      let estado: Awaited<ReturnType<typeof estadoEquipamentosRepo.calcular>>;
      try {
        estado = await estadoEquipamentosRepo.calcular(projetoId, estoque.id);
      } catch (error) {
        const detalhe = error instanceof Error ? error.message : String(error);
        // O pré-filtro já garante que este registro foi destinado ao
        // funcionário, então o erro é relevante para ele.
        return descartar("ESTADO_INVALIDO", detalhe);
      }

      const quantidadeEmUso = estado.funcionarios.get(funcionarioId) ?? 0;

      // Equipamento que não está com este funcionário não é candidato nem
      // motivo de diagnóstico.
      if (quantidadeEmUso <= 0) return null;

      /*
       * O que decide se uma unidade pode consumir material é a POSSE FÍSICA
       * atual (o funcionário está com ela e o registro não foi encerrado).
       *
       * `Equipamento.ativo` e `EstoqueEquipamento.ativo` são bloqueios
       * administrativos de NOVAS movimentações do equipamento (ver tipo
       * EstoqueEquipamento). Não fazem sentido para um material que está sendo
       * consumido por uma ferramenta que já está na mão do funcionário — e
       * usá-los aqui era o que rejeitava a "Serra circular 7.1/4 pol." mesmo
       * ela aparecendo como "Em uso" na tela de Apropriações.
       */
      if (estado.encerrado || estoque.status === "ENCERRADO") {
        return descartar("ENCERRADO");
      }
      if (!equipamento) return descartar("ESTADO_INVALIDO", "Equipamento não encontrado no cadastro.");

      const regras = await regrasConsumoEquipamentosRepo.listarEfetivas(
        projetoId,
        equipamento.id,
        estoque.id,
        dia,
      );
      const regrasDoProduto = regras.filter(
        (regra) => regra.produto_id === produtoId,
      );
      if (regrasDoProduto.length === 0) {
        return descartar("SEM_REGRA_PARA_PRODUTO");
      }

      return {
        tipo: "CANDIDATO",
        candidato: {
          estoqueEquipamentoId: estoque.id,
          equipamentoId: equipamento.id,
          equipamentoNome: equipamento.nome,
          identificacao: base.identificacao,
          regraIds: regrasDoProduto.map((regra) => regra.id),
          quantidadeEmUso,
          funcionarioNome: funcionario.nome,
        },
      };
    }),
  );

  const candidatos: CandidatoConsumoEquipamento[] = [];
  const descartados: DescarteCandidatoEquipamento[] = [];

  for (const avaliacao of avaliacoes) {
    if (!avaliacao) continue;
    if (avaliacao.tipo === "CANDIDATO") candidatos.push(avaliacao.candidato);
    else descartados.push(avaliacao.descarte);
  }

  candidatos.sort((a, b) => {
    const nome = a.equipamentoNome.localeCompare(b.equipamentoNome);
    return nome || a.estoqueEquipamentoId.localeCompare(b.estoqueEquipamentoId);
  });

  if (candidatos.length > 0) {
    return { candidatos, diagnostico: null };
  }

  return semCandidatos(
    descartados.length > 0
      ? "EQUIPAMENTO_DESCARTADO"
      : "FUNCIONARIO_SEM_EQUIPAMENTO",
    descartados,
  );
}

const ROTULO_DESCARTE: Record<MotivoDescarteCandidato, string> = {
  ENCERRADO: "registro encerrado",
  SEM_REGRA_PARA_PRODUTO:
    "sem regra de consumo vigente para este produto na data da saída",
  ESTADO_INVALIDO: "histórico do equipamento inconsistente",
};

/** Texto pronto para o usuário explicando por que nada foi vinculado. */
export function descreverDiagnosticoApropriacao(
  diagnostico: DiagnosticoApropriacao,
): string {
  switch (diagnostico.motivo) {
    case "SAIDA_SEM_FUNCIONARIO":
      return "A saída não tem funcionário informado; não há equipamento para vincular automaticamente.";
    case "FUNCIONARIO_NAO_ENCONTRADO":
      return "O funcionário da saída não foi encontrado neste projeto.";
    case "FUNCIONARIO_INATIVO":
      return "O funcionário da saída está inativo; a vinculação automática só considera funcionários ativos.";
    case "SAIDA_JA_POSSUI_APROPRIACAO":
      return "A saída já possui apropriação a equipamento; nada foi alterado.";
    case "SAIDA_TOTALMENTE_DEVOLVIDA":
      return "A saída foi totalmente devolvida; não há consumo a apropriar.";
    case "FUNCIONARIO_SEM_EQUIPAMENTO":
      return "O funcionário da saída não consta como usuário de nenhum equipamento no estado atual. Se o equipamento foi entregue a ele depois, ou já devolvido, use a apropriação manual.";
    case "EQUIPAMENTO_DESCARTADO": {
      const itens = diagnostico.descartados.map(
        (item) =>
          `${item.equipamentoNome}${item.identificacao ? ` · ${item.identificacao}` : ""} (${ROTULO_DESCARTE[item.motivo]}${item.detalhe ? `: ${item.detalhe}` : ""})`,
      );
      return `O funcionário possui equipamento, mas ele não pôde ser vinculado: ${itens.join("; ")}.`;
    }
  }
}

/**
 * Tradução única do resultado da vinculação automática em mensagem de tela,
 * usada pelo lançamento e pelos detalhes da saída para não divergirem.
 */
export function descreverResultadoApropriacao(
  resultado: ResultadoApropriacaoAutomatica,
): { nivel: "sucesso" | "info"; mensagem: string } {
  if (resultado.status === "VINCULADO") {
    const identificacao = resultado.candidato.identificacao
      ? ` · ${resultado.candidato.identificacao}`
      : "";
    return {
      nivel: "sucesso",
      mensagem: `Consumo vinculado automaticamente a ${resultado.candidato.equipamentoNome}${identificacao}.`,
    };
  }

  if (resultado.status === "AMBIGUO") {
    const nomes = resultado.candidatos
      .map(
        (candidato) =>
          `${candidato.equipamentoNome}${candidato.identificacao ? ` · ${candidato.identificacao}` : ""}`,
      )
      .join("; ");
    return {
      nivel: "info",
      mensagem: `${resultado.candidatos.length} equipamentos compatíveis (${nomes}). Para não escolher o errado, selecione o equipamento nos detalhes da saída.`,
    };
  }

  return {
    nivel: "info",
    mensagem: descreverDiagnosticoApropriacao(resultado.diagnostico),
  };
}

/* ------------------------------------------------------------------ */
/* Opções para apropriação manual                                      */
/* ------------------------------------------------------------------ */

async function listarOpcoesApropriacao(
  projetoId: string,
  movimentacaoId: string,
): Promise<OpcaoApropriacaoEquipamento[]> {
  const db = getDB();
  const movimentacao = await obterMovimentacao(projetoId, movimentacaoId);
  const dia = movimentacao.data.slice(0, 10);

  // Tudo que não depende do equipamento é carregado UMA vez: antes havia uma
  // consulta de regras por equipamento (centenas de idas ao banco).
  const [estoques, equipamentos, funcionarios, regrasDoProjeto] =
    await Promise.all([
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
      regrasConsumoEquipamentosRepo.listarProjeto(projetoId),
    ]);

  const equipamentoPorId = new Map(
    equipamentos.map((equipamento) => [equipamento.id, equipamento]),
  );
  const funcionarioPorId = new Map(
    funcionarios.map((funcionario) => [funcionario.id, funcionario]),
  );

  const montar = async (
    estoque: EstoqueEquipamento,
  ): Promise<OpcaoApropriacaoEquipamento | null> => {
    const equipamento = equipamentoPorId.get(estoque.equipamento_id);
    if (!equipamento) return null;

    const regrasDoProduto = resolverRegrasEfetivas(
      regrasDoProjeto,
      equipamento.id,
      estoque.id,
      dia,
    ).filter((regra) => regra.produto_id === movimentacao.produto_id);

    const base = {
      estoqueEquipamentoId: estoque.id,
      equipamentoId: equipamento.id,
      equipamentoNome: equipamento.nome,
      identificacao: identificacaoDoEstoque(estoque),
      compativelComProduto: regrasDoProduto.length > 0,
      regraIds: regrasDoProduto.map((regra) => regra.id),
    };

    let estado: Awaited<ReturnType<typeof estadoEquipamentosRepo.calcular>>;
    try {
      estado = await estadoEquipamentosRepo.calcular(projetoId, estoque.id);
    } catch {
      // Histórico inconsistente: o item continua aparecendo (para permitir
      // apropriação tardia consciente) em vez de derrubar a lista inteira.
      return {
        ...base,
        status: "ESTADO_INVALIDO",
        quantidadeEmUso: 0,
        usuarios: [],
      };
    }

    const usuarios = [...estado.funcionarios.entries()]
      .filter(([, quantidade]) => quantidade > 0)
      .map(([funcionarioId, quantidade]) => ({
        funcionarioId,
        funcionarioNome:
          funcionarioPorId.get(funcionarioId)?.nome ??
          "Funcionário não localizado",
        quantidade,
      }))
      .sort((a, b) => a.funcionarioNome.localeCompare(b.funcionarioNome));

    const emUsoPeloDestinatario = movimentacao.funcionario_id
      ? usuarios.some(
          (usuario) => usuario.funcionarioId === movimentacao.funcionario_id,
        )
      : false;

    let status: StatusOpcaoApropriacaoEquipamento;
    if (estado.encerrado) {
      status = "ENCERRADO";
    } else if (emUsoPeloDestinatario) {
      status = "EM_USO_PELO_DESTINATARIO";
    } else if (usuarios.length > 0) {
      status = "EM_USO";
    } else if (estado.manutencao > 0) {
      status = "MANUTENCAO";
    } else {
      status = "DISPONIVEL";
    }

    return {
      ...base,
      status,
      quantidadeEmUso: usuarios.reduce(
        (total, usuario) => total + usuario.quantidade,
        0,
      ),
      usuarios,
    };
  };

  const opcoes = (await Promise.all(estoques.map(montar))).filter(
    (opcao): opcao is OpcaoApropriacaoEquipamento => opcao != null,
  );

  return opcoes.sort((a, b) => {
    const prioridade = (item: OpcaoApropriacaoEquipamento) => {
      if (
        item.status === "EM_USO_PELO_DESTINATARIO" &&
        item.compativelComProduto
      ) return 0;
      if (item.status === "EM_USO_PELO_DESTINATARIO") return 1;
      if (item.status === "EM_USO" && item.compativelComProduto) return 2;
      if (item.status === "EM_USO") return 3;
      if (item.status === "DISPONIVEL" && item.compativelComProduto) return 4;
      if (item.status === "DISPONIVEL") return 5;
      if (item.status === "MANUTENCAO") return 6;
      if (item.status === "ESTADO_INVALIDO") return 7;
      return 8;
    };

    const porPrioridade = prioridade(a) - prioridade(b);
    if (porPrioridade !== 0) return porPrioridade;

    const porNome = a.equipamentoNome.localeCompare(b.equipamentoNome);
    return porNome || a.estoqueEquipamentoId.localeCompare(b.estoqueEquipamentoId);
  });
}

/* ------------------------------------------------------------------ */
/* Persistência                                                        */
/* ------------------------------------------------------------------ */

/**
 * Validação de saldo + gravação acontecem na MESMA transação. Sem isso, dois
 * cliques rápidos (ou vínculo automático + manual) liam o mesmo saldo e
 * ambos passavam, apropriando mais que a quantidade da saída.
 */
async function salvarConsumo(
  projetoId: string,
  dados: SalvarConsumoEquipamentoInput,
): Promise<ConsumoEquipamento> {
  validarQuantidade(dados.quantidade);

  const db = getDB();

  return db.transaction(
    "rw",
    [
      db.movimentacoes,
      db.produtos,
      db.estoque_equipamentos,
      db.equipamentos,
      db.documento_itens,
      db.documentos,
      db.consumos_equipamentos,
    ],
    async () => {
      const movimentacao = await obterMovimentacao(
        projetoId,
        dados.movimentacaoId,
      );
      const produto = await obterProduto(projetoId, movimentacao.produto_id);
      const equipamento = await validarEquipamento(
        projetoId,
        dados.estoqueEquipamentoId,
      );

      const existentes = await listarConsumosDaMovimentacao(
        projetoId,
        dados.movimentacaoId,
      );
      const registroAtual = dados.id
        ? existentes.find((registro) => registro.id === dados.id)
        : undefined;

      if (dados.id && !registroAtual) {
        throw new Error("A apropriação de consumo não foi encontrada.");
      }

      const totalDeOutros = somarQuantidades(
        existentes.filter((registro) => registro.id !== registroAtual?.id),
      );

      // O teto do rateio é a quantidade LÍQUIDA (saída − devoluções): o que
      // foi devolvido ao estoque não é consumo de nenhum equipamento.
      const liquida = await quantidadeLiquidaDaSaida(projetoId, movimentacao);

      if (arredondarQuantidade(totalDeOutros + dados.quantidade) > liquida) {
        const restante = Math.max(
          0,
          arredondarQuantidade(liquida - totalDeOutros),
        );
        throw new Error(
          `A quantidade apropriada excede o saldo da saída (já descontadas as devoluções). Disponível para rateio: ${restante}.`,
        );
      }

      const custoUnitario = await obterUltimoPrecoDoProduto(
        projetoId,
        produto.id,
      );
      const agora = new Date().toISOString();

      const consumo: ConsumoEquipamento = {
        id: registroAtual?.id ?? uid(),
        projeto_id: projetoId,
        movimentacao_id: movimentacao.id,
        estoque_equipamento_id: equipamento.estoqueId,
        equipamento_id: equipamento.equipamentoId,
        quantidade: dados.quantidade,
        unidade_id: produto.unidade_id ?? null,
        custo_unitario: custoUnitario,
        custo_total:
          custoUnitario == null
            ? null
            : Number((custoUnitario * dados.quantidade).toFixed(6)),
        data_apropriacao: movimentacao.data,
        origem: dados.origem ?? registroAtual?.origem ?? "MANUAL",
        observacao: dados.observacao?.trim() || null,
        criado_em: registroAtual?.criado_em ?? agora,
        atualizado_em: agora,
      };

      await db.consumos_equipamentos.put(consumo);
      return consumo;
    },
  );
}

export const consumoEquipamentoRepo = {
  async listarPorMovimentacao(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<ConsumoEquipamento[]> {
    return listarConsumosDaMovimentacao(projetoId, movimentacaoId);
  },

  async listarPorProjeto(
    projetoId: string,
  ): Promise<ConsumoEquipamento[]> {
    return getDB()
      .consumos_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();
  },

  async quantidadeApropriada(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<number> {
    return somarQuantidades(
      await listarConsumosDaMovimentacao(projetoId, movimentacaoId),
    );
  },

  async detectarCandidatosAutomaticos(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<CandidatoConsumoEquipamento[]> {
    const movimentacao = await obterMovimentacao(projetoId, movimentacaoId);
    if (!movimentacao.funcionario_id) return [];

    const avaliacao = await avaliarCandidatos(
      projetoId,
      movimentacao.funcionario_id,
      movimentacao.produto_id,
      movimentacao.data,
    );
    return avaliacao.candidatos;
  },

  async listarOpcoesApropriacao(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<OpcaoApropriacaoEquipamento[]> {
    return listarOpcoesApropriacao(projetoId, movimentacaoId);
  },

  async apropriarAutomaticamente(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<ResultadoApropriacaoAutomatica> {
    const movimentacao = await obterMovimentacao(projetoId, movimentacaoId);

    if (!movimentacao.funcionario_id) {
      return {
        status: "SEM_CANDIDATO",
        diagnostico: { motivo: "SAIDA_SEM_FUNCIONARIO", descartados: [] },
      };
    }

    // Idempotência: nunca sobrescrever/duplicar uma apropriação existente
    // (inclusive decisões manuais do usuário).
    const existentes = await listarConsumosDaMovimentacao(
      projetoId,
      movimentacao.id,
    );
    if (existentes.length > 0) {
      return {
        status: "SEM_CANDIDATO",
        diagnostico: {
          motivo: "SAIDA_JA_POSSUI_APROPRIACAO",
          descartados: [],
        },
      };
    }

    const liquida = await quantidadeLiquidaDaSaida(projetoId, movimentacao);
    if (liquida <= 0) {
      return {
        status: "SEM_CANDIDATO",
        diagnostico: {
          motivo: "SAIDA_TOTALMENTE_DEVOLVIDA",
          descartados: [],
        },
      };
    }

    const avaliacao = await avaliarCandidatos(
      projetoId,
      movimentacao.funcionario_id,
      movimentacao.produto_id,
      movimentacao.data,
    );

    if (avaliacao.candidatos.length === 0) {
      return {
        status: "SEM_CANDIDATO",
        diagnostico: avaliacao.diagnostico ?? {
          motivo: "FUNCIONARIO_SEM_EQUIPAMENTO",
          descartados: [],
        },
      };
    }

    if (avaliacao.candidatos.length > 1) {
      return { status: "AMBIGUO", candidatos: avaliacao.candidatos };
    }

    const candidato = avaliacao.candidatos[0];
    if (!candidato) {
      return {
        status: "SEM_CANDIDATO",
        diagnostico: {
          motivo: "FUNCIONARIO_SEM_EQUIPAMENTO",
          descartados: [],
        },
      };
    }

    // `salvarConsumo` já garante, na transação, que a soma não excede a saída
    // líquida. Como não havia apropriação prévia, o registro cobre toda ela.
    const consumo = await salvarConsumo(projetoId, {
      movimentacaoId: movimentacao.id,
      estoqueEquipamentoId: candidato.estoqueEquipamentoId,
      quantidade: liquida,
      origem: "AUTOMATICO",
      observacao: `Vinculação automática: funcionário da saída possui o equipamento "${candidato.equipamentoNome}" e há regra de consumo ativa para este produto na data da saída.`,
    });

    return { status: "VINCULADO", consumo, candidato };
  },

  async salvar(
    projetoId: string,
    dados: SalvarConsumoEquipamentoInput,
  ): Promise<ConsumoEquipamento> {
    return salvarConsumo(projetoId, dados);
  },

  /** Quantidade da saída que ainda conta como consumo (saída − devoluções). */
  async quantidadeLiquida(
    projetoId: string,
    movimentacaoId: string,
  ): Promise<number> {
    const movimentacao = await obterMovimentacao(projetoId, movimentacaoId);
    return quantidadeLiquidaDaSaida(projetoId, movimentacao);
  },

  /**
   * Reaplica o ÚLTIMO preço disponível a todas as apropriações já gravadas.
   *
   * O custo é gravado no momento da apropriação; um documento novo com preço
   * mais recente não o atualiza sozinho. Esta rotina é o que o botão "Atualizar
   * preços" da tela de Movimentações executa. Apropriações de produtos sem
   * nenhum preço disponível são mantidas como estão (contadas em `semPreco`).
   */
  async recalcularCustosPeloUltimoPreco(
    projetoId: string,
    produtoId?: string,
  ): Promise<{
    total: number;
    atualizados: number;
    inalterados: number;
    semPreco: number;
  }> {
    const db = getDB();
    const consumos = await db.consumos_equipamentos
      .where("projeto_id")
      .equals(projetoId)
      .toArray();
    const movimentacoes = await db.movimentacoes
      .where("projeto_id")
      .equals(projetoId)
      .toArray();
    const produtoDaMovimentacao = new Map(
      movimentacoes.map((movimentacao) => [movimentacao.id, movimentacao.produto_id]),
    );

    const precoPorProduto = new Map<string, number | null>();
    const agora = new Date().toISOString();
    const alterados: ConsumoEquipamento[] = [];
    let total = 0;
    let inalterados = 0;
    let semPreco = 0;

    for (const consumo of consumos) {
      const produto = produtoDaMovimentacao.get(consumo.movimentacao_id);
      if (!produto || (produtoId && produto !== produtoId)) continue;
      total += 1;

      if (!precoPorProduto.has(produto)) {
        precoPorProduto.set(
          produto,
          await obterUltimoPrecoDoProduto(projetoId, produto),
        );
      }
      const preco = precoPorProduto.get(produto) ?? null;

      if (preco == null) {
        semPreco += 1;
        continue;
      }

      const novoTotal = Number((preco * consumo.quantidade).toFixed(6));
      if (consumo.custo_unitario === preco && consumo.custo_total === novoTotal) {
        inalterados += 1;
        continue;
      }

      alterados.push({
        ...consumo,
        custo_unitario: preco,
        custo_total: novoTotal,
        atualizado_em: agora,
      });
    }

    if (alterados.length > 0) {
      await db.consumos_equipamentos.bulkPut(alterados);
    }

    return { total, atualizados: alterados.length, inalterados, semPreco };
  },

  async remover(
    projetoId: string,
    consumoId: string,
  ): Promise<void> {
    const consumo = await getDB().consumos_equipamentos.get(consumoId);

    if (!consumo || consumo.projeto_id !== projetoId) {
      throw new Error("A apropriação de consumo não foi encontrada.");
    }

    await getDB().consumos_equipamentos.delete(consumoId);
  },

  async removerDaMovimentacao(
    movimentacaoId: string,
  ): Promise<void> {
    const registros = await getDB()
      .consumos_equipamentos
      .where("movimentacao_id")
      .equals(movimentacaoId)
      .toArray();

    if (registros.length === 0) return;

    await getDB().consumos_equipamentos.bulkDelete(
      registros.map((registro) => registro.id),
    );
  },
};