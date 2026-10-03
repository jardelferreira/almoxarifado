import { getDB, uid } from "@/db/db";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { normalizarDataHoraLocal } from "@/utils/format";
import {
  reduzirConsumoPelaDevolucao,
  restaurarConsumoDaDevolucao,
  type ResultadoRestauracaoConsumo,
} from "@/services/equipamentos/consumo-devolucao";
import type {
  Categoria,
  Empresa,
  Equipe,
  EquipeMembro,
  Funcionario,
  Local,
  Movimentacao,
  Produto,
  Projeto,
  Unidade,
} from "@/types";

/**
 * Quantidades são ponto flutuante: 0,3 − 0,1 − 0,2 dá −2,7e-17, e a checagem
 * `saldo < 0` rejeitaria uma saída que zera o estoque exatamente. Toda
 * comparação de saldo/quantidade passa por aqui.
 */
const arredondar = (valor: number): number => Number(valor.toFixed(6));

type ProjetoEntity =
  | Empresa
  | Funcionario
  | Local
  | Produto
  | Equipe;

type ProjetoEntityInput<T extends ProjetoEntity> = Omit<T, "id"> & {
  id?: string;
};

const TABELAS_POR_PROJETO = new Set([
  "empresas",
  "funcionarios",
  "locais",
  "produtos",
  "equipes",
]);

/**
 * Camada de acesso a dados.
 *
 * Dados operacionais são sempre acessados dentro do contexto
 * de um projeto. Categorias e unidades continuam globais.
 */
export const repo = {
  // ---------- Projetos ----------

  async listProjetos(): Promise<Projeto[]> {
    return (await getDB().projetos.toArray()).sort((a, b) =>
      a.nome.localeCompare(b.nome),
    );
  },

  async getProjeto(id: string) {
    return getDB().projetos.get(id);
  },

  async saveProjeto(p: Omit<Projeto, "id"> & { id?: string }) {
    const projeto: Projeto = {
      ...p,
      id: p.id ?? uid(),
    };

    await getDB().projetos.put(projeto);

    return projeto;
  },

  async deleteProjeto(id: string) {
    const db = getDB();
    const tabelasProjeto = [
      "categorias_equipamentos", "empresas", "funcionarios", "locais", "produtos",
      "movimentacoes", "equipes", "arquivos", "equipamentos", "estoque_equipamentos",
      "movimentacoes_equipamentos", "configuracoes", "documentos", "documento_referencias",
      "inventarios", "inteligencia_acoes", "manutencoes_equipamentos", "manutencao_documentos",
      "apropriacoes_financeiras_equipamentos", "consumos_equipamentos",
      "regras_consumo_equipamentos", "perfis_parametros_custos",
    ];

    const [equipes, estoques, documentos, inventarios] = await Promise.all([
      db.equipes.where("projeto_id").equals(id).toArray(),
      db.estoque_equipamentos.where("projeto_id").equals(id).toArray(),
      db.documentos.where("projeto_id").equals(id).toArray(),
      db.inventarios.where("projeto_id").equals(id).toArray(),
    ]);

    const equipeIds = equipes.map((item) => item.id);
    const estoqueIds = estoques.map((item) => item.id);
    const documentoIds = documentos.map((item) => item.id);
    const inventarioIds = inventarios.map((item) => item.id);

    await db.transaction(
      "rw",
      [db.projetos, ...tabelasProjeto.map((nome) => db.table(nome)), db.equipe_membros, db.apropriacoes, db.documento_itens, db.inventario_itens],
      async () => {
        if (equipeIds.length) await db.equipe_membros.where("equipe_id").anyOf(equipeIds).delete();
        if (estoqueIds.length) await db.apropriacoes.where("estoque_equipamento_id").anyOf(estoqueIds).delete();
        if (documentoIds.length) await db.documento_itens.where("documento_id").anyOf(documentoIds).delete();
        if (inventarioIds.length) await db.inventario_itens.where("inventario_id").anyOf(inventarioIds).delete();

        for (const tabela of tabelasProjeto) {
          await db.table(tabela).where("projeto_id").equals(id).delete();
        }

        // Limpa órfãos históricos deixados por versões anteriores.
        const equipesAtuais = new Set((await db.equipes.toArray()).map((item) => item.id));
        const estoquesAtuais = new Set((await db.estoque_equipamentos.toArray()).map((item) => item.id));
        const documentosAtuais = new Set((await db.documentos.toArray()).map((item) => item.id));
        const inventariosAtuais = new Set((await db.inventarios.toArray()).map((item) => item.id));

        const membrosOrfaos = (await db.equipe_membros.toArray()).filter((item) => !equipesAtuais.has(item.equipe_id));
        if (membrosOrfaos.length) await db.equipe_membros.bulkDelete(membrosOrfaos.map((item) => item.id));
        const apropriacoesOrfas = (await db.apropriacoes.toArray()).filter((item) => !estoquesAtuais.has(item.estoque_equipamento_id));
        if (apropriacoesOrfas.length) await db.apropriacoes.bulkDelete(apropriacoesOrfas.map((item) => item.id));
        const itensDocumentoOrfaos = (await db.documento_itens.toArray()).filter((item) => !documentosAtuais.has(item.documento_id));
        if (itensDocumentoOrfaos.length) await db.documento_itens.bulkDelete(itensDocumentoOrfaos.map((item) => item.id));
        const itensInventarioOrfaos = (await db.inventario_itens.toArray()).filter((item) => !inventariosAtuais.has(item.inventario_id));
        if (itensInventarioOrfaos.length) await db.inventario_itens.bulkDelete(itensInventarioOrfaos.map((item) => item.id));

        await db.projetos.delete(id);
      },
    );
  },

  async duplicarProjeto(id: string) {
    const db = getDB();
    const original = await db.projetos.get(id);
    if (!original) throw new Error("Projeto não encontrado");

    const novoProjetoId = uid();
    const novo: Projeto = {
      ...original,
      id: novoProjetoId,
      codigo: `${original.codigo}-COPIA`,
      nome: `${original.nome} (cópia)`,
    };

    const tabelasProjeto = [
      "categorias_equipamentos", "empresas", "funcionarios", "locais", "produtos",
      "movimentacoes", "equipes", "arquivos", "equipamentos", "estoque_equipamentos",
      "movimentacoes_equipamentos", "configuracoes", "documentos", "documento_referencias",
      "inventarios", "inteligencia_acoes", "manutencoes_equipamentos", "manutencao_documentos",
      "apropriacoes_financeiras_equipamentos", "consumos_equipamentos",
      "regras_consumo_equipamentos", "perfis_parametros_custos",
    ];

    const linhasPorTabela = new Map<string, Array<Record<string, unknown>>>();
    for (const tabela of tabelasProjeto) {
      linhasPorTabela.set(tabela, (await db.table(tabela).where("projeto_id").equals(id).toArray()) as Array<Record<string, unknown>>);
    }

    const filhosPorIds = async (tabela: string, campo: string, ids: string[]) => {
      if (!ids.length) return [] as Array<Record<string, unknown>>;
      const conjunto = new Set(ids);
      const registros = (await db.table(tabela).toArray()) as Array<Record<string, unknown>>;
      return registros.filter((registro) => conjunto.has(String(registro[campo] ?? "")));
    };

    const equipes = (linhasPorTabela.get("equipes") ?? []).map((item) => String(item["id"] ?? ""));
    const estoques = (linhasPorTabela.get("estoque_equipamentos") ?? []).map((item) => String(item["id"] ?? ""));
    const documentos = (linhasPorTabela.get("documentos") ?? []).map((item) => String(item["id"] ?? ""));
    const inventarios = (linhasPorTabela.get("inventarios") ?? []).map((item) => String(item["id"] ?? ""));

    const relacionamentos: Record<string, Array<Record<string, unknown>>> = {
      equipe_membros: await filhosPorIds("equipe_membros", "equipe_id", equipes),
      apropriacoes: await filhosPorIds("apropriacoes", "estoque_equipamento_id", estoques),
      documento_itens: await filhosPorIds("documento_itens", "documento_id", documentos),
      inventario_itens: await filhosPorIds("inventario_itens", "inventario_id", inventarios),
    };

    const mapas = new Map<string, Map<string, string>>();
    const gerarMapa = (tabela: string, linhas: Array<Record<string, unknown>>) => {
      const mapa = new Map<string, string>();
      for (const linha of linhas) {
        const antigo = String(linha["id"] ?? "");
        if (antigo) mapa.set(antigo, uid());
      }
      mapas.set(tabela, mapa);
    };

    for (const [tabela, linhas] of linhasPorTabela) gerarMapa(tabela, linhas);
    for (const [tabela, linhas] of Object.entries(relacionamentos)) gerarMapa(tabela, linhas);

    // Cada família de perfil mantém suas versões, mas recebe uma nova identidade.
    const perfilFamilias = new Map<string, string>();
    for (const linha of linhasPorTabela.get("perfis_parametros_custos") ?? []) {
      const antigo = String(linha["perfil_id"] ?? "");
      if (antigo && !perfilFamilias.has(antigo)) perfilFamilias.set(antigo, uid());
    }

    const mapId = (tabela: string, valor: unknown) => {
      const antigo = String(valor ?? "");
      return antigo ? mapas.get(tabela)?.get(antigo) ?? antigo : valor;
    };
    const mapOptional = (tabela: string, valor: unknown) => {
      const antigo = String(valor ?? "");
      return antigo ? mapId(tabela, antigo) : null;
    };

    if (original.empresa_id) {
      novo.empresa_id = String(mapId("empresas", original.empresa_id));
    } else {
      novo.empresa_id = null;
    }

    const remap = (tabela: string, linha: Record<string, unknown>): Record<string, unknown> => {
      const row: Record<string, unknown> = { ...linha, id: mapId(tabela, linha["id"]), projeto_id: novoProjetoId };
      const set = (campo: string, destino: string, opcional = true) => {
        if (!Object.prototype.hasOwnProperty.call(row, campo)) return;
        row[campo] = opcional ? mapOptional(destino, row[campo]) : mapId(destino, row[campo]);
      };

      switch (tabela) {
        case "funcionarios": set("empresa_id", "empresas"); set("encarregado_id", "funcionarios"); set("equipe_raiz_id", "equipes"); break;
        case "locais": set("local_pai_id", "locais"); break;
        case "produtos": set("categoria_id", "categorias"); set("unidade_id", "unidades"); break;
        case "movimentacoes":
          set("produto_id", "produtos", false); set("funcionario_id", "funcionarios"); set("encarregado_id", "funcionarios"); set("empresa_id", "empresas"); set("local_id", "locais"); set("local_destino_id", "locais"); set("equipe_id", "equipes", false); set("documento_id", "documentos"); set("documento_item_id", "documento_itens"); set("movimentacao_origem_id", "movimentacoes"); break;
        case "equipamentos": set("categoria_id", "categorias_equipamentos", false); break;
        case "estoque_equipamentos": set("equipamento_id", "equipamentos", false); set("empresa_id", "empresas", false); set("equipe_id", "equipes"); break;
        case "apropriacoes": set("estoque_equipamento_id", "estoque_equipamentos", false); set("funcionario_id", "funcionarios", false); break;
        case "movimentacoes_equipamentos": {
          set("estoque_equipamento_id", "estoque_equipamentos", false);
          const participante = (tipo: unknown) => String(tipo ?? "").toUpperCase() === "EMPRESA" ? "empresas" : String(tipo ?? "").toUpperCase() === "EQUIPE" ? "equipes" : "funcionarios";
          set("origem_id", participante(row["tipo_origem"]), false); set("destino_id", participante(row["tipo_destino"]), false); break;
        }
        case "documentos": set("empresa_id", "empresas"); break;
        case "documento_itens": set("documento_id", "documentos", false); set("produto_id", "produtos"); set("equipe_destino_id", "equipes"); break;
        case "documento_referencias": set("documento_id", "documentos", false); set("documento_referenciado_id", "documentos", false); break;
        case "inventarios": set("equipe_id", "equipes"); set("responsavel_id", "funcionarios"); break;
        case "inventario_itens": set("inventario_id", "inventarios", false); set("produto_id", "produtos", false); set("equipe_id", "equipes"); break;
        case "manutencoes_equipamentos": set("estoque_equipamento_id", "estoque_equipamentos", false); set("equipamento_id", "equipamentos", false); set("empresa_id", "empresas"); set("movimento_sinalizacao_id", "movimentacoes_equipamentos"); set("movimento_envio_id", "movimentacoes_equipamentos"); set("movimento_retorno_id", "movimentacoes_equipamentos"); break;
        case "manutencao_documentos": set("manutencao_id", "manutencoes_equipamentos", false); set("documento_id", "documentos", false); break;
        case "apropriacoes_financeiras_equipamentos": set("documento_id", "documentos", false); set("documento_item_id", "documento_itens"); set("manutencao_id", "manutencoes_equipamentos"); set("estoque_equipamento_id", "estoque_equipamentos", false); set("equipamento_id", "equipamentos", false); break;
        case "consumos_equipamentos": set("movimentacao_id", "movimentacoes", false); set("estoque_equipamento_id", "estoque_equipamentos", false); set("equipamento_id", "equipamentos", false); set("unidade_id", "unidades"); break;
        case "regras_consumo_equipamentos": set("equipamento_id", "equipamentos", false); set("estoque_equipamento_id", "estoque_equipamentos"); set("produto_id", "produtos", false); set("unidade_base_id", "unidades", false); set("unidade_consumo_id", "unidades", false); break;
        case "perfis_parametros_custos": {
          const perfil = String(row["perfil_id"] ?? "");
          if (perfil) row["perfil_id"] = perfilFamilias.get(perfil) ?? uid();
          break;
        }
        case "inteligencia_acoes": {
          set("produto_id", "produtos"); set("equipe_id", "equipes");
          const origem = String(row["origem"] ?? "").toUpperCase();
          const tabelaReferencia = origem === "VIGIA" ? "equipamentos" : origem === "INVENTARIO" ? "inventarios" : "produtos";
          set("referencia_id", tabelaReferencia);
          break;
        }
      }
      return row;
    };

    const novasLinhas: Array<[string, Array<Record<string, unknown>>]> = [];
    for (const [tabela, linhas] of linhasPorTabela) novasLinhas.push([tabela, linhas.map((linha) => remap(tabela, linha))]);
    for (const [tabela, linhas] of Object.entries(relacionamentos)) novasLinhas.push([tabela, linhas.map((linha) => remap(tabela, linha))]);

    const tabelasTransacao = [db.projetos, ...tabelasProjeto.map((nome) => db.table(nome)), db.equipe_membros, db.apropriacoes, db.documento_itens, db.inventario_itens];
    await db.transaction("rw", tabelasTransacao, async () => {
      await db.projetos.put(novo);
      for (const [tabela, linhas] of novasLinhas) {
        if (linhas.length) await db.table(tabela).bulkPut(linhas);
      }
    });

    return novo;
  },

  // ---------- Cadastros globais ----------

  categorias: crudGlobal<Categoria>("categorias"),

  unidades: crudGlobal<Unidade>("unidades"),

  // ---------- Cadastros por projeto ----------

  empresas: crudProjeto<Empresa>("empresas"),

  funcionarios: crudProjeto<Funcionario>("funcionarios"),

  locais: crudProjeto<Local>("locais"),

  produtos: crudProjeto<Produto>("produtos"),

  equipes: crudProjeto<Equipe>("equipes"),

  // ---------- Equipe / membros ----------

  async membrosDaEquipe(equipeId: string): Promise<EquipeMembro[]> {
    return getDB()
      .equipe_membros
      .where("equipe_id")
      .equals(equipeId)
      .toArray();
  },

  async salvarMembrosDaEquipe(
    equipeId: string,
    funcionarioIds: string[],
  ) {
    const db = getDB();

    const equipe = await db.equipes.get(equipeId);

    if (!equipe) {
      throw new Error("Equipe não encontrada");
    }

    const idsUnicos = [...new Set(funcionarioIds)];

    /**
     * Garante que todos os funcionários pertencem
     * ao mesmo projeto da equipe.
     */
    const funcionarios = await Promise.all(
      idsUnicos.map((id) => db.funcionarios.get(id)),
    );

    const invalidos = funcionarios.some(
      (funcionario) =>
        !funcionario ||
        funcionario.projeto_id !== equipe.projeto_id,
    );

    if (invalidos) {
      throw new Error(
        "Não é possível adicionar funcionário de outro projeto à equipe",
      );
    }

    await db.transaction(
      "rw",
      db.equipe_membros,
      async () => {
        await db.equipe_membros
          .where("equipe_id")
          .equals(equipeId)
          .delete();

        await db.equipe_membros.bulkPut(
          idsUnicos.map((funcionario_id) => ({
            id: uid(),
            equipe_id: equipeId,
            funcionario_id,
          })),
        );
      },
    );
  },

  // ---------- Movimentações ----------

  async listMovimentacoes(
    projetoId: string,
  ): Promise<Movimentacao[]> {
    const rows = await getDB()
      .movimentacoes
      .where("projeto_id")
      .equals(projetoId)
      .toArray();

    return rows.sort((a, b) =>
      a.data < b.data
        ? 1
        : a.data > b.data
          ? -1
          : 0,
    );
  },

  async saveMovimentacao(
    m: Omit<Movimentacao, "id"> & { id?: string },
  ) {
    if (!m.equipe_id) {
      throw new Error(
        "Uma equipe responsável é obrigatória na movimentação",
      );
    }

    if (!Number.isFinite(m.quantidade) || m.quantidade <= 0) {
      throw new Error("A quantidade da movimentação deve ser maior que zero.");
    }

    const db = getDB();
    const configuracao = await configuracoesRepo.obter(m.projeto_id);
    const equipe = await db.equipes.get(m.equipe_id);

    if (!equipe) {
      throw new Error("Equipe não encontrada");
    }

    if (equipe.projeto_id !== m.projeto_id) {
      throw new Error(
        "A equipe não pertence ao projeto da movimentação",
      );
    }

    if (!equipe.ativo) {
      throw new Error("A equipe selecionada está inativa.");
    }

    const produto = await db.produtos.get(m.produto_id);
    if (!produto || produto.projeto_id !== m.projeto_id) {
      throw new Error(
        "O produto não pertence ao projeto da movimentação",
      );
    }

    if (!produto.ativo) {
      throw new Error("O produto selecionado está inativo.");
    }

    if (m.documento_id) {
      const documento = await db.documentos.get(m.documento_id);
      if (!documento || documento.projeto_id !== m.projeto_id) {
        throw new Error("O documento não pertence ao projeto da movimentação.");
      }
      if (documento.status === "CANCELADO") {
        throw new Error("Não é possível vincular um documento cancelado à movimentação.");
      }
    }

    const documentoExigido =
      configuracao.modulos.documentos &&
      ((m.tipo === "ENTRADA" && configuracao.documentos.exigir_na_entrada) ||
        (m.tipo === "SAIDA" && configuracao.documentos.exigir_na_saida) ||
        (m.tipo === "TRANSFERENCIA" && configuracao.documentos.exigir_na_transferencia) ||
        (m.tipo === "DEVOLUCAO" && configuracao.documentos.exigir_na_devolucao) ||
        (m.tipo === "AJUSTE" && configuracao.documentos.exigir_no_ajuste));

    if (documentoExigido && !m.documento_id) {
      throw new Error("Esta operação exige um documento conforme as configurações do projeto.");
    }

    if (m.tipo === "AJUSTE") {
      if (!configuracao.estoque.permitir_ajustes) {
        throw new Error("Os ajustes de estoque estão desabilitados nas configurações do projeto.");
      }

      if (configuracao.estoque.exigir_justificativa_ajuste && !m.observacao?.trim()) {
        throw new Error("Informe a justificativa do ajuste.");
      }
    }

    if (m.tipo === "DEVOLUCAO") {
      if (!m.movimentacao_origem_id) {
        throw new Error("A devolução deve estar vinculada a uma saída de origem.");
      }

      const origem = await db.movimentacoes.get(m.movimentacao_origem_id);
      if (!origem || origem.projeto_id !== m.projeto_id) {
        throw new Error("A movimentação de origem não pertence ao projeto.");
      }
      if (origem.tipo !== "SAIDA") {
        throw new Error("A devolução deve estar vinculada a uma movimentação de saída.");
      }
      if (origem.produto_id !== m.produto_id || origem.equipe_id !== m.equipe_id) {
        throw new Error("A devolução deve permanecer vinculada ao mesmo produto e equipe da saída.");
      }

      const devolvido = await db.movimentacoes
        .where("projeto_id")
        .equals(m.projeto_id)
        .filter(
          (item) =>
            item.tipo === "DEVOLUCAO" &&
            item.movimentacao_origem_id === origem.id &&
            item.id !== m.id,
        )
        .toArray();
      const totalDevolvido = devolvido.reduce((total, item) => total + item.quantidade, 0);
      if (arredondar(totalDevolvido + m.quantidade) > arredondar(origem.quantidade)) {
        throw new Error("A quantidade devolvida excede o saldo disponível da saída de origem.");
      }
    }

    if (m.tipo === "SAIDA" || m.tipo === "TRANSFERENCIA" || (m.tipo === "AJUSTE" && (m.sinal ?? 1) < 0)) {
      const movimentacoes = await db.movimentacoes
        .where("projeto_id")
        .equals(m.projeto_id)
        .toArray();

      const saldoAtual = movimentacoes
        .filter((item) => item.produto_id === m.produto_id && item.equipe_id === m.equipe_id)
        .reduce((saldo, item) => {
          if (item.tipo === "ENTRADA" || item.tipo === "DEVOLUCAO") return saldo + item.quantidade;
          if (item.tipo === "SAIDA") return saldo - item.quantidade;
          if (item.tipo === "AJUSTE" || item.tipo === "TRANSFERENCIA") return saldo + (item.sinal ?? 1) * item.quantidade;
          return saldo;
        }, 0);

      const saldoResultante = arredondar(saldoAtual + (m.tipo === "AJUSTE" ? (m.sinal ?? 1) * m.quantidade : -m.quantidade));
      if (saldoResultante < 0 && !configuracao.estoque.permitir_estoque_negativo) {
        throw new Error(`Quantidade insuficiente na equipe "${equipe.nome}". Disponível: ${saldoAtual}.`);
      }
    }

    const existente = m.id ? await db.movimentacoes.get(m.id) : undefined;

    // Editar uma saída já apropriada a equipamentos não pode deixar o
    // consumo maior que a própria saída (nem apontar para outro produto).
    if (existente && existente.tipo === "SAIDA") {
      const consumos = await db.consumos_equipamentos
        .where("movimentacao_id")
        .equals(existente.id)
        .toArray();

      if (consumos.length > 0) {
        if (m.tipo !== "SAIDA" || m.produto_id !== existente.produto_id) {
          throw new Error(
            "Esta saída possui consumo apropriado a equipamentos; remova as apropriações antes de alterar o tipo ou o produto.",
          );
        }
        const apropriado = arredondar(
          consumos.reduce((total, consumo) => total + consumo.quantidade, 0),
        );
        if (arredondar(m.quantidade) < apropriado) {
          throw new Error(
            `Esta saída possui ${apropriado} apropriado(s) a equipamentos; a quantidade não pode ser menor que isso.`,
          );
        }
      }
    }

    // O rastro de redução é sempre gerado aqui; nunca aceito de fora.
    const base: Movimentacao = {
      ...m,
      id: m.id ?? uid(),
      data: normalizarDataHoraLocal(m.data) ?? m.data,
      criado_em: m.criado_em ?? existente?.criado_em ?? new Date().toISOString(),
    };
    delete base.consumo_reduzido;

    let mov: Movimentacao = base;

    // Gravação da movimentação + efeito sobre o consumo por equipamento são
    // atômicos: ou a devolução e a redução do consumo acontecem juntas, ou
    // nenhuma. Dentro da transação só há chamadas Dexie.
    await db.transaction(
      "rw",
      [db.movimentacoes, db.consumos_equipamentos],
      async () => {
        // Reescrever uma devolução existente: primeiro desfaz o efeito antigo.
        if (existente?.tipo === "DEVOLUCAO") {
          await restaurarConsumoDaDevolucao(existente);
        }

        await db.movimentacoes.put(base);

        if (base.tipo === "DEVOLUCAO") {
          const rastro = await reduzirConsumoPelaDevolucao(base);
          if (rastro.length > 0) {
            mov = { ...base, consumo_reduzido: rastro };
            await db.movimentacoes.put(mov);
          }
        }
      },
    );

    return mov;
  },

  async registrarTransferencia({
    projetoId,
    produtoId,
    quantidade,
    equipeOrigemId,
    equipeDestinoId,
    localOrigemId = null,
    localDestinoId = null,
    responsavelOrigemId = null,
    responsavelDestinoId = null,
    documentoId = null,
    data,
    observacao = null,
  }: {
    projetoId: string;
    produtoId: string;
    quantidade: number;
    equipeOrigemId: string;
    equipeDestinoId: string;
    localOrigemId?: string | null;
    localDestinoId?: string | null;
    responsavelOrigemId?: string | null;
    responsavelDestinoId?: string | null;
    documentoId?: string | null;
    data: string;
    observacao?: string | null;
  }): Promise<{ origem: Movimentacao; destino: Movimentacao }> {
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      throw new Error("A quantidade da transferência deve ser maior que zero.");
    }

    if (equipeOrigemId === equipeDestinoId && localOrigemId === localDestinoId) {
      throw new Error("A origem e o destino da transferência devem ser diferentes.");
    }

    const db = getDB();
    const configuracao = await configuracoesRepo.obter(projetoId);
    const [produto, equipeOrigem, equipeDestino] = await Promise.all([
      db.produtos.get(produtoId),
      db.equipes.get(equipeOrigemId),
      db.equipes.get(equipeDestinoId),
    ]);

    if (!produto || produto.projeto_id !== projetoId || !produto.ativo) {
      throw new Error("O produto selecionado não pertence ao projeto ou está inativo.");
    }
    if (!equipeOrigem || equipeOrigem.projeto_id !== projetoId || !equipeOrigem.ativo) {
      throw new Error("A equipe de origem não pertence ao projeto ou está inativa.");
    }
    if (!equipeDestino || equipeDestino.projeto_id !== projetoId || !equipeDestino.ativo) {
      throw new Error("A equipe de destino não pertence ao projeto ou está inativa.");
    }

    const movimentacoes = await db.movimentacoes.where("projeto_id").equals(projetoId).toArray();
    const saldoOrigem = movimentacoes
      .filter((item) => item.produto_id === produtoId && item.equipe_id === equipeOrigemId)
      .reduce((saldo, item) => {
        if (item.tipo === "ENTRADA" || item.tipo === "DEVOLUCAO") return saldo + item.quantidade;
        if (item.tipo === "SAIDA") return saldo - item.quantidade;
        if (item.tipo === "AJUSTE" || item.tipo === "TRANSFERENCIA") return saldo + (item.sinal ?? 1) * item.quantidade;
        return saldo;
      }, 0);

    if (arredondar(saldoOrigem - quantidade) < 0 && !configuracao.estoque.permitir_estoque_negativo) {
      throw new Error(`Quantidade insuficiente na equipe de origem "${equipeOrigem.nome}". Disponível: ${saldoOrigem}.`);
    }

    const dataMovimentacao = normalizarDataHoraLocal(data) ?? data;
    const criadoEm = new Date().toISOString();
    const origemId = uid();
    const destinoId = uid();
    const nota = observacao?.trim() || null;

    const origem: Movimentacao = {
      id: origemId,
      projeto_id: projetoId,
      data: dataMovimentacao,
      tipo: "TRANSFERENCIA",
      produto_id: produtoId,
      quantidade,
      sinal: -1,
      funcionario_id: responsavelOrigemId,
      encarregado_id: null,
      empresa_id: null,
      local_id: localOrigemId,
      local_destino_id: localDestinoId,
      observacao: nota,
      equipe_id: equipeOrigemId,
      documento_id: documentoId,
      documento_item_id: null,
      criado_em: criadoEm,
    };

    const destino: Movimentacao = {
      id: destinoId,
      projeto_id: projetoId,
      data: dataMovimentacao,
      tipo: "TRANSFERENCIA",
      produto_id: produtoId,
      quantidade,
      sinal: 1,
      funcionario_id: responsavelDestinoId,
      encarregado_id: null,
      empresa_id: null,
      local_id: localDestinoId,
      local_destino_id: localOrigemId,
      observacao: nota,
      equipe_id: equipeDestinoId,
      documento_id: documentoId,
      documento_item_id: null,
      movimentacao_origem_id: origemId,
      criado_em: criadoEm,
    };

    await db.transaction("rw", db.movimentacoes, async () => {
      await db.movimentacoes.bulkPut([origem, destino]);
    });

    return { origem, destino };
  },

  async deleteMovimentacao(
    id: string,
  ): Promise<{ consumoRestaurado: ResultadoRestauracaoConsumo | null }> {
    const db = getDB();

    const movimentacao = await db.movimentacoes.get(id);

    if (!movimentacao) {
      return { consumoRestaurado: null };
    }

    let consumoRestaurado: ResultadoRestauracaoConsumo | null = null;

    await db.transaction(
      "rw",
      [db.movimentacoes, db.consumos_equipamentos],
      async () => {
        // Excluir uma saída que tem devoluções deixaria as devoluções
        // apontando para um registro inexistente e ainda somando estoque.
        if (movimentacao.tipo === "SAIDA") {
          const devolucoes = await db.movimentacoes
            .where("projeto_id")
            .equals(movimentacao.projeto_id)
            .filter(
              (item) =>
                item.tipo === "DEVOLUCAO" &&
                item.movimentacao_origem_id === movimentacao.id,
            )
            .count();

          if (devolucoes > 0) {
            throw new Error(
              `Esta saída possui ${devolucoes} devolução(ões) vinculada(s). Exclua as devoluções antes de excluir a saída.`,
            );
          }
        }

        // Excluir uma devolução devolve ao consumo dos equipamentos o que ela
        // havia reduzido (limitado ao saldo da saída).
        if (movimentacao.tipo === "DEVOLUCAO") {
          consumoRestaurado = await restaurarConsumoDaDevolucao(movimentacao);
        }

        await db.consumos_equipamentos
          .where("movimentacao_id")
          .equals(id)
          .delete();
        await db.movimentacoes.delete(id);
      },
    );

    return { consumoRestaurado };
  },

  async movimentacoesDoProduto(
    projetoId: string,
    produtoId: string,
  ) {
    const rows = await getDB()
      .movimentacoes
      .where("projeto_id")
      .equals(projetoId)
      .toArray();

    return rows
      .filter((r) => r.produto_id === produtoId)
      .sort((a, b) =>
        a.data < b.data ? 1 : -1,
      );
  },

  async temMovimentacoes(
    campo: keyof Movimentacao,
    valor: string,
  ) {
    const all = await getDB()
      .movimentacoes
      .toArray();

    return all.some((m) => m[campo] === valor);
  },
};

function crudGlobal<T extends { id: string }>(
  table: string,
) {
  return {
    async list(): Promise<T[]> {
      // @ts-expect-error dynamic table access
      return getDB()[table].toArray() as Promise<T[]>;
    },

    async get(
      id: string,
    ): Promise<T | undefined> {
      // @ts-expect-error dynamic table access
      return getDB()[table].get(id);
    },

    async save(
      item: Omit<T, "id"> & { id?: string },
    ): Promise<T> {
      const row = {
        ...item,
        id: item.id ?? uid(),
      } as T;

      // @ts-expect-error dynamic table access
      await getDB()[table].put(row);

      return row;
    },

    async bulkSave(items: T[]) {
      // @ts-expect-error dynamic table access
      await getDB()[table].bulkPut(items);
    },

    async remove(id: string) {
      // @ts-expect-error dynamic table access
      await getDB()[table].delete(id);
    },
  };
}

function crudProjeto<T extends ProjetoEntity>(
  table: string,
) {
  return {
    async list(
      projetoId: string,
    ): Promise<T[]> {
      // @ts-expect-error dynamic table access
      return getDB()[table]
        .where("projeto_id")
        .equals(projetoId)
        .toArray() as Promise<T[]>;
    },

    async get(
      projetoId: string,
      id: string,
    ): Promise<T | undefined> {
      // @ts-expect-error dynamic table access
      const item = await getDB()[table].get(id);

      if (!item) {
        return undefined;
      }

      if (item.projeto_id !== projetoId) {
        return undefined;
      }

      return item as T;
    },

    async save(
      projetoId: string,
      item: ProjetoEntityInput<T>,
    ): Promise<T> {
      const row = {
        ...item,
        id: item.id ?? uid(),
        projeto_id: projetoId,
      } as T;

      // @ts-expect-error dynamic table access
      await getDB()[table].put(row);

      return row;
    },

    async bulkSave(
      projetoId: string,
      items: T[],
    ) {
      const rows = items.map((item) => ({
        ...item,
        projeto_id: projetoId,
      }));

      // @ts-expect-error dynamic table access
      await getDB()[table].bulkPut(rows);
    },

    async remove(
      projetoId: string,
      id: string,
    ) {
      // @ts-expect-error dynamic table access
      const item = await getDB()[table].get(id);

      if (!item || item.projeto_id !== projetoId) {
        return;
      }

      // @ts-expect-error dynamic table access
      await getDB()[table].delete(id);
    },
  };
}