import { getDB, uid } from "@/db/db";
import type {
  AnaliseMesclagemParametros,
  GerarPerfilMescladoInput,
  MesclagemConflito,
  MesclagemFonte,
  MesclagemEquipamentoAnalise,
  MesclagemRegraAnalise,
  PerfilParametroCusto,
  PerfilParametroCustoEquipamento,
  PerfilParametroCustoRegra,
} from "@/types";
import { chaveEquipamentoPerfil } from "@/services/equipamentos/perfis-parametros-custos-repo";

function texto(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function numeroIgual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.000001;
}

function data(valor: string | null): string {
  return valor ?? "";
}

function valorRegra(regra: PerfilParametroCustoRegra): string {
  const custo = regra.custo_unitario_manual == null ? "sem custo manual" : regra.custo_unitario_manual.toString();
  return `${regra.fator} ${regra.unidade_base_sigla}/${regra.unidade_consumo_sigla} · ${custo}`;
}

function chaveCompatibilidadeRegra(regra: PerfilParametroCustoRegra): string {
  return [
    regra.chave_produto,
    texto(regra.unidade_base_sigla),
    texto(regra.unidade_consumo_sigla),
    regra.direcionador,
    regra.periodicidade ?? "",
    data(regra.vigencia_inicio),
    data(regra.vigencia_fim),
  ].join("|");
}

function clone<T>(valor: T): T {
  return structuredClone(valor);
}

export function validarPerfisParaMesclagem(perfis: PerfilParametroCusto[]): void {
  if (perfis.length < 2) {
    throw new Error("Selecione pelo menos dois perfis para iniciar a mesclagem.");
  }

  const familias = new Set<string>();
  for (const perfil of perfis) {
    if (!perfil.equipamentos.length) {
      throw new Error(`O perfil “${perfil.nome} v${perfil.versao}” não possui equipamentos para consolidar.`);
    }
    if (familias.has(perfil.perfil_id)) {
      throw new Error(`Selecione somente uma versão de cada família de perfil. “${perfil.nome}” foi selecionado mais de uma vez.`);
    }
    familias.add(perfil.perfil_id);
  }
}

function conflitoEquipamento(
  equipamento: string,
  campo: string,
  descricao: string,
  valores: Array<{ perfilId: string; perfilNome: string; valor: string }>,
): MesclagemConflito {
  return {
    id: `equip:${equipamento}:${campo}`,
    tipo: "EQUIPAMENTO",
    chave: equipamento,
    equipamento_nome: equipamento,
    campo,
    descricao,
    fontes: valores,
  };
}

function conflitoRegra(
  equipamentoNome: string,
  regraChave: string,
  produtoNome: string,
  campo: string,
  descricao: string,
  valores: Array<{ perfilId: string; perfilNome: string; valor: string }>,
): MesclagemConflito {
  return {
    id: `regra:${regraChave}:${campo}`,
    tipo: "REGRA",
    chave: regraChave,
    equipamento_nome: equipamentoNome,
    produto_nome: produtoNome,
    campo,
    descricao,
    fontes: valores,
  };
}

export function analisarMesclagem(perfis: PerfilParametroCusto[]): AnaliseMesclagemParametros {
  validarPerfisParaMesclagem(perfis);

  const fontes: MesclagemFonte[] = perfis.map((perfil) => ({
    id: perfil.id,
    perfil_id: perfil.perfil_id,
    nome: perfil.nome,
    versao: perfil.versao,
    periodo_inicio: perfil.periodo_referencia_inicio,
    periodo_fim: perfil.periodo_referencia_fim,
    projeto_id: perfil.projeto_id,
  }));

  const porEquipamento = new Map<string, Array<{ perfil: PerfilParametroCusto; snapshot: PerfilParametroCustoEquipamento }>>();
  for (const perfil of perfis) {
    for (const snapshot of perfil.equipamentos) {
      const lista = porEquipamento.get(snapshot.chave_equipamento) ?? [];
      lista.push({ perfil, snapshot });
      porEquipamento.set(snapshot.chave_equipamento, lista);
    }
  }

  const equipamentos: MesclagemEquipamentoAnalise[] = [];
  const regras: MesclagemRegraAnalise[] = [];
  const conflitos: MesclagemConflito[] = [];
  const avisos: string[] = [];

  for (const [chave, entradas] of porEquipamento) {
    const base = entradas[0]!;
    const fontesEquipamento = entradas.map((item) => item.perfil.id);
    equipamentos.push({
      chave,
      nome: base.snapshot.nome,
      fontes: fontesEquipamento,
      snapshotBase: clone(base.snapshot),
      quantidadeFontes: entradas.length,
    });

    const camposNumericos: Array<{ nome: keyof PerfilParametroCustoEquipamento & string; rotulo: string }> = [
      { nome: "quantidade", rotulo: "Quantidade" },
      { nome: "uso_previsto", rotulo: "Uso previsto" },
      { nome: "manutencao_ocorrencias_por_unidade", rotulo: "Manutenção por unidade" },
      { nome: "manutencao_valor_por_ocorrencia", rotulo: "Valor por manutenção" },
    ];

    if (entradas.some((item) => item.snapshot.tipo_controle !== base.snapshot.tipo_controle)) {
      conflitos.push(
        conflitoEquipamento(
          chave,
          "tipo_controle",
          "O mesmo equipamento aparece com tipos de controle incompatíveis.",
          entradas.map((item) => ({
            perfilId: item.perfil.id,
            perfilNome: `${item.perfil.nome} v${item.perfil.versao}`,
            valor: item.snapshot.tipo_controle,
          })),
        ),
      );
    }

    if (entradas.some((item) => texto(item.snapshot.modelo) !== texto(base.snapshot.modelo))) {
      conflitos.push(
        conflitoEquipamento(
          chave,
          "modelo",
          "O mesmo equipamento aparece com modelos diferentes.",
          entradas.map((item) => ({
            perfilId: item.perfil.id,
            perfilNome: `${item.perfil.nome} v${item.perfil.versao}`,
            valor: item.snapshot.modelo ?? "—",
          })),
        ),
      );
    }

    for (const campo of camposNumericos) {
      const valores = entradas.map((item) => Number(item.snapshot[campo.nome]));
      const diferentes = valores.some((valor) => !numeroIgual(valor, valores[0] ?? 0));
      if (diferentes) {
        conflitos.push(
          conflitoEquipamento(
            chave,
            campo.nome,
            `Os perfis informam valores diferentes para “${campo.rotulo}”. A mesclagem não faz média cega desses parâmetros.`,
            entradas.map((item) => ({
              perfilId: item.perfil.id,
              perfilNome: `${item.perfil.nome} v${item.perfil.versao}`,
              valor: String(item.snapshot[campo.nome]),
            })),
          ),
        );
      }
    }

    if (entradas.some((item) => !numeroIgual(item.snapshot.custo_recorrente_unitario_override ?? -1, base.snapshot.custo_recorrente_unitario_override ?? -1))) {
      conflitos.push(
        conflitoEquipamento(
          chave,
          "custo_recorrente_unitario_override",
          "Os perfis informam custos recorrentes diferentes para o mesmo equipamento.",
          entradas.map((item) => ({
            perfilId: item.perfil.id,
            perfilNome: `${item.perfil.nome} v${item.perfil.versao}`,
            valor: item.snapshot.custo_recorrente_unitario_override == null ? "—" : item.snapshot.custo_recorrente_unitario_override.toString(),
          })),
        ),
      );
    }

    if (entradas.some((item) => (item.snapshot.periodicidade_recorrente_override ?? null) !== (base.snapshot.periodicidade_recorrente_override ?? null))) {
      conflitos.push(
        conflitoEquipamento(
          chave,
          "periodicidade_recorrente_override",
          "Os perfis informam periodicidades recorrentes diferentes.",
          entradas.map((item) => ({
            perfilId: item.perfil.id,
            perfilNome: `${item.perfil.nome} v${item.perfil.versao}`,
            valor: item.snapshot.periodicidade_recorrente_override ?? "—",
          })),
        ),
      );
    }

    const porProduto = new Map<string, Array<{ perfil: PerfilParametroCusto; regra: PerfilParametroCustoRegra }>>();
    for (const entrada of entradas) {
      for (const regra of entrada.snapshot.regras) {
        const lista = porProduto.get(regra.chave_produto) ?? [];
        lista.push({ perfil: entrada.perfil, regra });
        porProduto.set(regra.chave_produto, lista);
      }
    }

    for (const [produtoChave, regrasProduto] of porProduto) {
      const variantes = new Map<string, Array<{ perfil: PerfilParametroCusto; regra: PerfilParametroCustoRegra }>>();
      for (const entrada of regrasProduto) {
        const chave = chaveCompatibilidadeRegra(entrada.regra);
        const lista = variantes.get(chave) ?? [];
        lista.push(entrada);
        variantes.set(chave, lista);
      }

      if (variantes.size > 1) {
        conflitos.push(
          conflitoRegra(
            base.snapshot.nome,
            `${chave}|${produtoChave}`,
            regrasProduto[0]!.regra.produto_nome,
            "compatibilidade",
            "O mesmo produto possui regras com unidades, direcionador, periodicidade ou vigência incompatíveis.",
            [...variantes.values()].map((variante) => {
              const item = variante[0]!;
              return {
                perfilId: item.perfil.id,
                perfilNome: `${item.perfil.nome} v${item.perfil.versao}`,
                valor: valorRegra(item.regra),
              };
            }),
          ),
        );
        continue;
      }

      const variante = [...variantes.values()][0]!;
      const regraBase = variante[0]!.regra;
      const fatorDiferente = variante.some((item) => !numeroIgual(item.regra.fator, regraBase.fator));
      const custoDiferente = variante.some((item) => !numeroIgual(item.regra.custo_unitario_manual ?? -1, regraBase.custo_unitario_manual ?? -1));
      const observacaoDiferente = variante.some((item) => texto(item.regra.observacao) !== texto(regraBase.observacao));

      const regraChave = `${chave}|${produtoChave}`;
      regras.push({
        chave: regraChave,
        equipamentoChave: chave,
        produtoNome: regraBase.produto_nome,
        fontes: variante.map((item) => item.perfil.id),
        regraBase: clone(regraBase),
      });

      if (fatorDiferente) {
        conflitos.push(
          conflitoRegra(
            base.snapshot.nome,
            regraChave,
            regraBase.produto_nome,
            "fator",
            "Os fatores são diferentes. Sem estatísticas observadas anexadas às fontes, a mesclagem exige uma escolha explícita.",
            variante.map((item) => ({
              perfilId: item.perfil.id,
              perfilNome: `${item.perfil.nome} v${item.perfil.versao}`,
              valor: valorRegra(item.regra),
            })),
          ),
        );
      }

      if (custoDiferente) {
        conflitos.push(
          conflitoRegra(
            base.snapshot.nome,
            `${regraChave}:custo`,
            regraBase.produto_nome,
            "custo_unitario_manual",
            "Os custos unitários manuais são diferentes. Nenhum custo é calculado por média aritmética.",
            variante.map((item) => ({
              perfilId: item.perfil.id,
              perfilNome: `${item.perfil.nome} v${item.perfil.versao}`,
              valor: item.regra.custo_unitario_manual == null ? "—" : item.regra.custo_unitario_manual.toString(),
            })),
          ),
        );
      }

      if (observacaoDiferente) {
        avisos.push(`A observação do insumo “${regraBase.produto_nome}” varia entre as fontes; será mantida a observação da fonte escolhida para a regra.`);
      }
    }
  }

  return { fontes, equipamentos, regras, conflitos, avisos };
}

function escolherFonte(
  resolucoes: Record<string, string>,
  conflito: MesclagemConflito,
  fallback: string,
): string {
  const valor = resolucoes[conflito.id];
  return valor && conflito.fontes.some((fonte) => fonte.perfilId === valor) ? valor : fallback;
}

export async function gerarPerfilMesclado(
  projetoId: string,
  perfis: PerfilParametroCusto[],
  analise: AnaliseMesclagemParametros,
  input: GerarPerfilMescladoInput,
): Promise<PerfilParametroCusto> {
  validarPerfisParaMesclagem(perfis);
  if (!input.nome.trim()) throw new Error("Informe um nome para a base consolidada.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodo_inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(input.periodo_fim) || input.periodo_inicio > input.periodo_fim) {
    throw new Error("Informe um período de referência válido para a base consolidada.");
  }

  const conflitosNaoResolvidos = analise.conflitos.filter((conflito) => !input.resolucoes[conflito.id]);
  if (conflitosNaoResolvidos.length) {
    throw new Error(`Resolva ${conflitosNaoResolvidos.length} conflito${conflitosNaoResolvidos.length === 1 ? "" : "s"} antes de gerar a base consolidada.`);
  }

  const porEquipamento = new Map<string, Array<{ perfil: PerfilParametroCusto; snapshot: PerfilParametroCustoEquipamento }>>();
  for (const perfil of perfis) {
    for (const snapshot of perfil.equipamentos) {
      const lista = porEquipamento.get(snapshot.chave_equipamento) ?? [];
      lista.push({ perfil, snapshot });
      porEquipamento.set(snapshot.chave_equipamento, lista);
    }
  }

  const equipamentos: PerfilParametroCustoEquipamento[] = [];

  for (const [chave, entradas] of porEquipamento) {
    const base = entradas[0]!;
    const conflitosEquip = analise.conflitos.filter((conflito) => conflito.tipo === "EQUIPAMENTO" && conflito.chave === chave);
    const fonteBase = conflitosEquip.length
      ? escolherFonte(input.resolucoes, conflitosEquip[0]!, base.perfil.id)
      : base.perfil.id;
    const snapshotFonte = entradas.find((entrada) => entrada.perfil.id === fonteBase)?.snapshot ?? base.snapshot;
    const resultado = clone(snapshotFonte);

    for (const conflito of conflitosEquip) {
      const fonte = escolherFonte(input.resolucoes, conflito, fonteBase);
      const origem = entradas.find((entrada) => entrada.perfil.id === fonte)?.snapshot;
      if (!origem) continue;
      if (conflito.campo === "tipo_controle") resultado.tipo_controle = origem.tipo_controle;
      else if (conflito.campo === "modelo") resultado.modelo = origem.modelo;
      else if (conflito.campo === "quantidade") resultado.quantidade = origem.quantidade;
      else if (conflito.campo === "uso_previsto") resultado.uso_previsto = origem.uso_previsto;
      else if (conflito.campo === "manutencao_ocorrencias_por_unidade") resultado.manutencao_ocorrencias_por_unidade = origem.manutencao_ocorrencias_por_unidade;
      else if (conflito.campo === "manutencao_valor_por_ocorrencia") resultado.manutencao_valor_por_ocorrencia = origem.manutencao_valor_por_ocorrencia;
      else if (conflito.campo === "custo_recorrente_unitario_override") resultado.custo_recorrente_unitario_override = origem.custo_recorrente_unitario_override;
      else if (conflito.campo === "periodicidade_recorrente_override") resultado.periodicidade_recorrente_override = origem.periodicidade_recorrente_override;
    }

    const porProduto = new Map<string, Array<{ perfil: PerfilParametroCusto; regra: PerfilParametroCustoRegra }>>();
    for (const entrada of entradas) {
      for (const regra of entrada.snapshot.regras) {
        const lista = porProduto.get(regra.chave_produto) ?? [];
        lista.push({ perfil: entrada.perfil, regra });
        porProduto.set(regra.chave_produto, lista);
      }
    }

    resultado.regras = [];
    for (const [produtoChave, variantesProduto] of porProduto) {
      const variantes = new Map<string, Array<{ perfil: PerfilParametroCusto; regra: PerfilParametroCustoRegra }>>();
      for (const entrada of variantesProduto) {
        const compatibilidade = chaveCompatibilidadeRegra(entrada.regra);
        const lista = variantes.get(compatibilidade) ?? [];
        lista.push(entrada);
        variantes.set(compatibilidade, lista);
      }

      const produtoNome = variantesProduto[0]!.regra.produto_nome;
      if (variantes.size > 1) {
        const conflitoId = `regra:${chave}|${produtoChave}:compatibilidade`;
        const conflito = analise.conflitos.find((item) => item.id === conflitoId);
        const fonte = conflito ? escolherFonte(input.resolucoes, conflito, variantesProduto[0]!.perfil.id) : variantesProduto[0]!.perfil.id;
        const escolhida = variantesProduto.find((item) => item.perfil.id === fonte)?.regra;
        if (escolhida) resultado.regras.push(clone(escolhida));
        continue;
      }

      const variante = [...variantes.values()][0]!;
      const regraBase = variante[0]!.regra;
      const regraId = `${chave}|${produtoChave}`;
      const conflitoFator = analise.conflitos.find((item) => item.id === `regra:${regraId}:fator`);
      const conflitoCusto = analise.conflitos.find((item) => item.id === `regra:${regraId}:custo_unitario_manual` || item.id === `regra:${regraId}:custo`);

      let fonte = variante[0]!.perfil.id;
      if (conflitoFator) fonte = escolherFonte(input.resolucoes, conflitoFator, fonte);
      if (conflitoCusto) fonte = escolherFonte(input.resolucoes, conflitoCusto, fonte);
      const origem = variante.find((item) => item.perfil.id === fonte)?.regra ?? regraBase;
      resultado.regras.push(clone(origem));
      void produtoNome;
    }

    // Remove regras duplicadas ocasionadas por fontes ou resoluções equivalentes.
    const unicas = new Map<string, PerfilParametroCustoRegra>();
    for (const regra of resultado.regras) {
      const key = chaveCompatibilidadeRegra(regra);
      if (!unicas.has(key)) unicas.set(key, regra);
    }
    resultado.regras = [...unicas.values()];
    equipamentos.push(resultado);
  }

  const agora = new Date().toISOString();
  const nomesFontes = perfis.map((perfil) => `${perfil.nome} v${perfil.versao}`).join(", ");
  const perfil: PerfilParametroCusto = {
    id: uid(),
    perfil_id: uid(),
    projeto_id: projetoId,
    nome: input.nome.trim().slice(0, 120),
    descricao: input.descricao?.trim() || null,
    versao: 1,
    origem: "CONSOLIDADO",
    periodo_referencia_inicio: input.periodo_inicio,
    periodo_referencia_fim: input.periodo_fim,
    fonte_dados: input.fonte_dados?.trim() || `Base consolidada de ${perfis.length} perfis: ${nomesFontes}`,
    equipamentos,
    observacoes: [
      input.observacoes?.trim(),
      `Origem preservada: ${nomesFontes}.`,
      "Conflitos foram resolvidos explicitamente; nenhum parâmetro divergente foi calculado por média aritmética.",
    ].filter(Boolean).join(" ") || null,
    criado_em: agora,
    atualizado_em: agora,
  };

  await getDB().perfis_parametros_custos.put(perfil);
  return perfil;
}
