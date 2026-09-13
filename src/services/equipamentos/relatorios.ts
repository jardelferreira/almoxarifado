import * as XLSX from "xlsx";
import { getDB } from "@/db/db";
import {
  estadoEquipamentosRepo,
  type EstadoEstoqueEquipamento,
} from "@/services/equipamentos/estado-repo";
import type {
  CategoriaEquipamento,
  Equipamento,
  EstoqueEquipamento,
  Equipe,
  Empresa,
  Funcionario,
} from "@/types";

export type SituacaoEquipamento =
  | "DISPONIVEL"
  | "EM_USO"
  | "MANUTENCAO"
  | "ENCERRADO"
  | "MISTO";

export type RelatorioEquipamentoLinha = {
  estoque: EstoqueEquipamento;
  equipamento: Equipamento;
  categoria: CategoriaEquipamento | undefined;
  empresa: Empresa | undefined;
  equipe: Equipe | undefined;
  equipesAtuais: Equipe[];
  responsaveis: Funcionario[];
  estado: EstadoEstoqueEquipamento;
  situacao: SituacaoEquipamento;
};

export type ResumoSituacao = {
  total: number;
  disponivel: number;
  emUso: number;
  manutencao: number;
  encerrado: number;
};

export type RelatorioEquipamentosSituacao = {
  projetoId: string;
  linhas: RelatorioEquipamentoLinha[];
  resumo: ResumoSituacao;
};


export function rotuloTipoMovimentacao(tipo: import("@/types").MovimentacaoEquipamento["tipo"]): string {
  const labels: Record<import("@/types").MovimentacaoEquipamento["tipo"], string> = {
    ENTRADA: "Entrada no estoque",
    SAIDA: "Saída para funcionário",
    DEVOLUCAO: "Devolução do funcionário",
    TRANSFERENCIA: "Transferência entre funcionários",
    SINALIZAR_MANUTENCAO: "Sinalizar para manutenção",
    ENVIO: "Envio para manutenção",
    RETORNO_MANUTENCAO: "Retorno da manutenção",
    DEVOLUCAO_FORNECEDOR: "Devolução ao fornecedor",
    BAIXA: "Baixa definitiva",
    REENTRADA: "Reentrada no estoque",
    MANUTENCAO: "Manutenção (histórico)",
    RETIRADA_MANUTENCAO: "Envio para manutenção (histórico)",
  };
  return labels[tipo];
}

function situacaoDaLinha(
  estado: EstadoEstoqueEquipamento,
): SituacaoEquipamento {
  if (estado.saldo <= 0) return "ENCERRADO";

  const partes = [
    estado.disponivel > 0,
    estado.apropriado > 0,
    estado.manutencao > 0,
  ].filter(Boolean).length;

  if (partes > 1) return "MISTO";
  if (estado.apropriado > 0) return "EM_USO";
  if (estado.manutencao > 0) return "MANUTENCAO";
  return "DISPONIVEL";
}

export async function consultarRelatorioEquipamentosSituacao(
  projetoId: string,
): Promise<RelatorioEquipamentosSituacao> {
  const db = getDB();

  const [equipamentos, estoques, categorias, empresas, equipes, funcionarios] =
    await Promise.all([
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.estoque_equipamentos
        .where("projeto_id")
        .equals(projetoId)
        .toArray(),
      db.categorias_equipamentos
        .where("projeto_id")
        .equals(projetoId)
        .toArray(),
      db.empresas.where("projeto_id").equals(projetoId).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
    ]);

  const equipamentoPorId = new Map(equipamentos.map((item) => [item.id, item]));
  const categoriaPorId = new Map(categorias.map((item) => [item.id, item]));
  const empresaPorId = new Map(empresas.map((item) => [item.id, item]));
  const equipePorId = new Map(equipes.map((item) => [item.id, item]));
  const funcionarioPorId = new Map(funcionarios.map((item) => [item.id, item]));

  const linhas: RelatorioEquipamentoLinha[] = [];

  for (const estoque of estoques) {
    const equipamento = equipamentoPorId.get(estoque.equipamento_id);
    if (!equipamento) continue;

    const estado = await estadoEquipamentosRepo.calcular(projetoId, estoque.id);

    const responsaveis = [...estado.funcionarios.entries()]
      .filter(([, quantidade]) => quantidade > 0)
      .map(([id]) => funcionarioPorId.get(id))
      .filter((item): item is Funcionario => Boolean(item));

    /*
     * O estado atual é derivado do histórico. As equipes de operação não
     * ficam armazenadas no EstadoEstoqueEquipamento; quando o equipamento
     * está com um funcionário, a equipe atual vem do funcionário.
     */
    const equipesAtuais = responsaveis
      .map((funcionario) =>
        funcionario.equipe_raiz_id
          ? equipePorId.get(funcionario.equipe_raiz_id)
          : undefined,
      )
      .filter((item): item is Equipe => Boolean(item));

    linhas.push({
      estoque,
      equipamento,
      categoria: categoriaPorId.get(equipamento.categoria_id),
      empresa: empresaPorId.get(estoque.empresa_id),
      equipe: equipesAtuais[0],
      equipesAtuais,
      responsaveis,
      estado,
      situacao: situacaoDaLinha(estado),
    });
  }

  const resumo = linhas.reduce<ResumoSituacao>(
    (acc, linha) => {
      acc.total += linha.estado.saldo;
      acc.disponivel += linha.estado.disponivel;
      acc.emUso += linha.estado.apropriado;
      acc.manutencao += linha.estado.manutencao;
      acc.encerrado += linha.estado.devolvido + linha.estado.baixado;
      return acc;
    },
    { total: 0, disponivel: 0, emUso: 0, manutencao: 0, encerrado: 0 },
  );

  return { projetoId, linhas, resumo };
}

export function situacaoLabel(situacao: SituacaoEquipamento): string {
  switch (situacao) {
    case "DISPONIVEL":
      return "Disponível";
    case "EM_USO":
      return "Em uso";
    case "MANUTENCAO":
      return "Manutenção";
    case "ENCERRADO":
      return "Encerrado";
    case "MISTO":
      return "Misto";
  }
}

export function localizacaoLinha(linha: RelatorioEquipamentoLinha): string {
  if (linha.responsaveis.length) {
    return linha.responsaveis.map((item) => item.nome).join(", ");
  }
  if (linha.equipesAtuais.length) {
    return linha.equipesAtuais.map((item) => item.nome).join(", ");
  }
  if (linha.estado.manutencao > 0) return "Manutenção";
  if (linha.estado.disponivel > 0) return "Almoxarifado";
  if (linha.equipe) return linha.equipe.nome;
  if (linha.estado.empresa > 0) return linha.empresa?.nome ?? "Empresa externa";
  return "—";
}


type RelatorioFormato = "xlsx" | "csv";

type RelatorioPlanilhaConfig = {
  nomeAba: string;
  arquivo: string;
  colunas: string[];
  linhas: Array<Record<string, unknown>>;
  larguras?: Record<string, number>;
  formatosNumero?: string[];
};

function formatarDataRelatorio(valor: string | Date | null | undefined): string {
  if (!valor) return "—";

  // Datas do domínio são frequentemente armazenadas como YYYY-MM-DD.
  // Construí-las no fuso local evita que o navegador recue um dia no pt-BR.
  const data =
    typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
      ? (() => {
          const [ano = 0, mes = 1, dia = 1] = valor.split("-").map(Number);
          return new Date(ano, mes - 1, dia);
        })()
      : valor instanceof Date
        ? valor
        : new Date(valor);

  if (Number.isNaN(data.getTime())) return String(valor);
  return new Intl.DateTimeFormat("pt-BR").format(data);
}

export function formatarDataHoraRelatorio(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

function criarPlanilhaRelatorio(
  config: RelatorioPlanilhaConfig,
  formato: RelatorioFormato,
): void {
  const linhas = config.linhas.map((linha) =>
    config.colunas.map((coluna) => linha[coluna] ?? ""),
  );
  const worksheet = XLSX.utils.aoa_to_sheet([config.colunas, ...linhas]);

  worksheet["!autofilter"] = { ref: worksheet["!ref"] ?? "A1" };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  worksheet["!cols"] = config.colunas.map((coluna) => ({
    wch: config.larguras?.[coluna] ?? 18,
  }));

  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
  for (let coluna = range.s.c; coluna <= range.e.c; coluna += 1) {
    const celula = worksheet[XLSX.utils.encode_cell({ r: 0, c: coluna })];
    if (celula) {
      celula.s = {
        fill: { fgColor: { rgb: "17324D" } },
        font: { bold: true, color: { rgb: "FFFFFF" } },
        alignment: { vertical: "center", horizontal: "left" },
        border: {
          bottom: { style: "medium", color: { rgb: "17324D" } },
        },
      };
    }
  }

  const formatosNumero = new Set(config.formatosNumero ?? []);
  for (let linha = 1; linha <= range.e.r; linha += 1) {
    for (let coluna = range.s.c; coluna <= range.e.c; coluna += 1) {
      const chave = config.colunas[coluna];
      const celula = worksheet[XLSX.utils.encode_cell({ r: linha, c: coluna })];
      if (!chave) continue;
      if (!celula) continue;

      if (linha % 2 === 0) {
        celula.s = {
          ...(celula.s ?? {}),
          fill: { fgColor: { rgb: "F7F9FB" } },
        };
      }

      if (formatosNumero.has(chave) && typeof celula.v === "number") {
        celula.z = "#,##0.##";
        celula.s = {
          ...(celula.s ?? {}),
          alignment: { horizontal: "right", vertical: "center" },
        };
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, config.nomeAba.slice(0, 31));

  if (formato === "csv") {
    XLSX.writeFile(workbook, `${config.arquivo}.csv`, { bookType: "csv" });
  } else {
    XLSX.writeFile(workbook, `${config.arquivo}.xlsx`, { bookType: "xlsx" });
  }
}

export function exportarRelatorioEquipamentosSituacao(
  linhas: RelatorioEquipamentoLinha[],
  formato: "xlsx" | "csv",
) {
  criarPlanilhaRelatorio({
    nomeAba: "Por situação",
    arquivo: `relatorio_equipamentos_por_situacao_${new Date().toISOString().slice(0, 10)}`,
    colunas: [
      "EQUIPAMENTO", "CATEGORIA", "IDENTIFICACAO", "PATRIMONIO", "SERIAL",
      "PROPRIETARIO", "LOCALIZACAO_ATUAL", "SITUACAO", "QUANTIDADE",
      "DISPONIVEL", "EM_USO", "MANUTENCAO", "OBSERVACOES",
    ],
    linhas: linhas.map((linha) => ({
      EQUIPAMENTO: linha.equipamento.nome,
      CATEGORIA: linha.categoria?.nome ?? "—",
      IDENTIFICACAO: linha.estoque.identificacao ?? "—",
      PATRIMONIO: linha.estoque.patrimonio ?? "—",
      SERIAL: linha.estoque.serial ?? "—",
      PROPRIETARIO: linha.empresa?.nome ?? "—",
      LOCALIZACAO_ATUAL: localizacaoLinha(linha),
      SITUACAO: situacaoLabel(linha.situacao),
      QUANTIDADE: linha.estado.saldo,
      DISPONIVEL: linha.estado.disponivel,
      EM_USO: linha.estado.apropriado,
      MANUTENCAO: linha.estado.manutencao,
      OBSERVACOES: linha.estoque.observacoes ?? "",
    })),
    larguras: {
      EQUIPAMENTO: 32, CATEGORIA: 22, IDENTIFICACAO: 20, PATRIMONIO: 18, SERIAL: 20,
      PROPRIETARIO: 28, LOCALIZACAO_ATUAL: 30, SITUACAO: 16, QUANTIDADE: 12,
      DISPONIVEL: 12, EM_USO: 12, MANUTENCAO: 14, OBSERVACOES: 42,
    },
    formatosNumero: ["QUANTIDADE", "DISPONIVEL", "EM_USO", "MANUTENCAO"],
  }, formato);
}

/* -------------------------------------------------------------------------- */
/* Relatório por equipe                                                       */
/* -------------------------------------------------------------------------- */

export type RelatorioEquipeLinha = {
  equipeId: string | null;
  equipeNome: string;
  total: number;
  disponivel: number;
  emUso: number;
  manutencao: number;
  encerrado: number;
};

export type RelatorioEquipamentosEquipe = {
  projetoId: string;
  linhas: RelatorioEquipeLinha[];
  resumo: ResumoSituacao;
};

function acumularEquipe(
  mapa: Map<string, RelatorioEquipeLinha>,
  equipeId: string | null,
  equipeNome: string,
  campo: "disponivel" | "emUso" | "manutencao" | "encerrado",
  quantidade: number,
) {
  if (quantidade <= 0) return;

  const chave = equipeId ?? `__LOCAL__:${equipeNome}`;
  const linha =
    mapa.get(chave) ??
    {
      equipeId,
      equipeNome,
      total: 0,
      disponivel: 0,
      emUso: 0,
      manutencao: 0,
      encerrado: 0,
    };

  linha[campo] += quantidade;
  linha.total =
    linha.disponivel +
    linha.emUso +
    linha.manutencao +
    linha.encerrado;

  mapa.set(chave, linha);
}

export async function consultarRelatorioEquipamentosEquipe(
  projetoId: string,
): Promise<RelatorioEquipamentosEquipe> {
  const db = getDB();

  const [estoques, equipes, funcionarios] = await Promise.all([
    db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
    db.equipes.where("projeto_id").equals(projetoId).toArray(),
    db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
  ]);

  const nomesEquipes = new Map(
    equipes.map((equipe) => [equipe.id, equipe.nome]),
  );

  const equipeDoFuncionario = new Map(
    funcionarios.map((funcionario) => [
      funcionario.id,
      funcionario.equipe_raiz_id ?? null,
    ]),
  );

  const mapa = new Map<string, RelatorioEquipeLinha>();

  const resumo: ResumoSituacao = {
    total: 0,
    disponivel: 0,
    emUso: 0,
    manutencao: 0,
    encerrado: 0,
  };

  for (const estoque of estoques) {
    const estado = await estadoEquipamentosRepo.calcular(
      projetoId,
      estoque.id,
    );

    resumo.total += estado.saldo;
    resumo.disponivel += estado.disponivel;
    resumo.emUso += estado.apropriado;
    resumo.manutencao += estado.manutencao;
    resumo.encerrado += estado.devolvido + estado.baixado;

    /*
     * Equipamentos apropriados a funcionários pertencem, para fins deste
     * relatório, à equipe raiz atual de cada funcionário.
     */
    for (const [funcionarioId, quantidade] of estado.funcionarios) {
      const equipeId = equipeDoFuncionario.get(funcionarioId) ?? null;

      acumularEquipe(
        mapa,
        equipeId,
        equipeId
          ? (nomesEquipes.get(equipeId) ?? "Equipe não encontrada")
          : "Sem equipe",
        "emUso",
        quantidade,
      );
    }

    /* O disponível está fisicamente no Almoxarifado. */
    if (estado.disponivel > 0) {
      acumularEquipe(
        mapa,
        null,
        "Almoxarifado",
        "disponivel",
        estado.disponivel,
      );
    }

    /* A manutenção é uma localização própria do controle de equipamentos. */
    if (estado.manutencao > 0) {
      acumularEquipe(
        mapa,
        null,
        "Manutenção",
        "manutencao",
        estado.manutencao,
      );
    }
  }

  const ordemLocal = (nome: string) => {
    if (nome === "Almoxarifado") return 1;
    if (nome === "Manutenção") return 2;
    if (nome === "Sem equipe") return 3;
    return 0;
  };

  const linhas = Array.from(mapa.values()).sort((a, b) => {
    const prioridade = ordemLocal(a.equipeNome) - ordemLocal(b.equipeNome);
    if (prioridade !== 0) return prioridade;
    return a.equipeNome.localeCompare(b.equipeNome, "pt-BR");
  });

  return {
    projetoId,
    linhas,
    resumo,
  };
}

export function exportarRelatorioEquipamentosEquipe(
  relatorio: RelatorioEquipamentosEquipe,
  formato: "xlsx" | "csv",
) {
  criarPlanilhaRelatorio({
    nomeAba: "Por equipe",
    arquivo: `relatorio_equipamentos_por_equipe_${new Date().toISOString().slice(0, 10)}`,
    colunas: ["EQUIPE", "TOTAL", "DISPONIVEL", "EM_USO", "MANUTENCAO", "ENCERRADO"],
    linhas: relatorio.linhas.map((linha) => ({
      EQUIPE: linha.equipeNome,
      TOTAL: linha.total,
      DISPONIVEL: linha.disponivel,
      EM_USO: linha.emUso,
      MANUTENCAO: linha.manutencao,
      ENCERRADO: linha.encerrado,
    })),
    larguras: { EQUIPE: 34, TOTAL: 12, DISPONIVEL: 14, EM_USO: 12, MANUTENCAO: 14, ENCERRADO: 14 },
    formatosNumero: ["TOTAL", "DISPONIVEL", "EM_USO", "MANUTENCAO", "ENCERRADO"],
  }, formato);
}


/* -------------------------------------------------------------------------- */
/* Relatório Em Uso                                                           */
/* -------------------------------------------------------------------------- */

export type RelatorioEquipamentoEmUsoLinha = {
  estoqueId: string;
  equipamento: Equipamento;
  categoria: CategoriaEquipamento | undefined;
  estoque: EstoqueEquipamento;
  funcionario: Funcionario;
  equipe: Equipe | undefined;
  quantidade: number;
  identificacao: string;
};

export type RelatorioEquipamentosEmUso = {
  projetoId: string;
  linhas: RelatorioEquipamentoEmUsoLinha[];
  totalRegistros: number;
  quantidade: number;
  responsaveis: number;
  equipes: number;
};

export async function consultarRelatorioEquipamentosEmUso(
  projetoId: string,
): Promise<RelatorioEquipamentosEmUso> {
  const db = getDB();

  const [estoques, equipamentos, categorias, funcionarios, equipes] =
    await Promise.all([
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.categorias_equipamentos
        .where("projeto_id")
        .equals(projetoId)
        .toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
    ]);

  const equipamentoPorId = new Map(
    equipamentos.map((item) => [item.id, item]),
  );
  const categoriaPorId = new Map(
    categorias.map((item) => [item.id, item]),
  );
  const funcionarioPorId = new Map(
    funcionarios.map((item) => [item.id, item]),
  );
  const equipePorId = new Map(equipes.map((item) => [item.id, item]));

  const linhas: RelatorioEquipamentoEmUsoLinha[] = [];

  for (const estoque of estoques) {
    const equipamento = equipamentoPorId.get(estoque.equipamento_id);
    if (!equipamento) continue;

    const estado = await estadoEquipamentosRepo.calcular(
      projetoId,
      estoque.id,
    );

    for (const [funcionarioId, quantidade] of estado.funcionarios) {
      if (quantidade <= 0) continue;

      const funcionario = funcionarioPorId.get(funcionarioId);
      if (!funcionario) continue;

      linhas.push({
        estoqueId: estoque.id,
        equipamento,
        categoria: categoriaPorId.get(equipamento.categoria_id),
        estoque,
        funcionario,
        equipe: funcionario.equipe_raiz_id
          ? equipePorId.get(funcionario.equipe_raiz_id)
          : undefined,
        quantidade,
        identificacao:
          estoque.identificacao ||
          estoque.patrimonio ||
          estoque.serial ||
          "Sem identificação",
      });
    }
  }

  linhas.sort((a, b) => {
    const equipamento = a.equipamento.nome.localeCompare(
      b.equipamento.nome,
      "pt-BR",
    );

    if (equipamento !== 0) return equipamento;

    return a.funcionario.nome.localeCompare(
      b.funcionario.nome,
      "pt-BR",
    );
  });

  return {
    projetoId,
    linhas,
    totalRegistros: linhas.length,
    quantidade: linhas.reduce(
      (total, linha) => total + linha.quantidade,
      0,
    ),
    responsaveis: new Set(
      linhas.map((linha) => linha.funcionario.id),
    ).size,
    equipes: new Set(
      linhas
        .map((linha) => linha.equipe?.id)
        .filter((id): id is string => Boolean(id)),
    ).size,
  };
}

export function exportarRelatorioEquipamentosEmUso(
  relatorio: RelatorioEquipamentosEmUso,
  formato: "xlsx" | "csv",
) {
  criarPlanilhaRelatorio({
    nomeAba: "Em uso",
    arquivo: `relatorio_equipamentos_em_uso_${new Date().toISOString().slice(0, 10)}`,
    colunas: ["EQUIPAMENTO", "CATEGORIA", "IDENTIFICACAO", "RESPONSAVEL", "EQUIPE", "QUANTIDADE", "OBSERVACOES"],
    linhas: relatorio.linhas.map((linha) => ({
      EQUIPAMENTO: linha.equipamento.nome,
      CATEGORIA: linha.categoria?.nome ?? "—",
      IDENTIFICACAO: linha.identificacao,
      RESPONSAVEL: linha.funcionario.nome,
      EQUIPE: linha.equipe?.nome ?? "Sem equipe",
      QUANTIDADE: linha.quantidade,
      OBSERVACOES: linha.estoque.observacoes ?? "",
    })),
    larguras: { EQUIPAMENTO: 32, CATEGORIA: 22, IDENTIFICACAO: 20, RESPONSAVEL: 32, EQUIPE: 28, QUANTIDADE: 12, OBSERVACOES: 42 },
    formatosNumero: ["QUANTIDADE"],
  }, formato);
}


/* -------------------------------------------------------------------------- */
/* Relatório Por responsável                                                  */
/* -------------------------------------------------------------------------- */

export type RelatorioEquipamentoPorResponsavelLinha = {
  estoqueId: string;
  equipamento: Equipamento;
  categoria: CategoriaEquipamento | undefined;
  estoque: EstoqueEquipamento;
  funcionario: Funcionario;
  equipe: Equipe | undefined;
  quantidade: number;
  identificacao: string;
};

export type RelatorioResponsavelLinha = {
  funcionario: Funcionario;
  equipe: Equipe | undefined;
  registros: number;
  quantidade: number;
  equipamentos: RelatorioEquipamentoPorResponsavelLinha[];
};

export type RelatorioEquipamentosPorResponsavel = {
  projetoId: string;
  linhas: RelatorioResponsavelLinha[];
  totalResponsaveis: number;
  totalRegistros: number;
  quantidade: number;
};

export async function consultarRelatorioEquipamentosPorResponsavel(
  projetoId: string,
): Promise<RelatorioEquipamentosPorResponsavel> {
  const db = getDB();

  const [estoques, equipamentos, categorias, funcionarios, equipes] =
    await Promise.all([
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.categorias_equipamentos
        .where("projeto_id")
        .equals(projetoId)
        .toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
    ]);

  const equipamentoPorId = new Map(
    equipamentos.map((item) => [item.id, item]),
  );
  const categoriaPorId = new Map(
    categorias.map((item) => [item.id, item]),
  );
  const funcionarioPorId = new Map(
    funcionarios.map((item) => [item.id, item]),
  );
  const equipePorId = new Map(equipes.map((item) => [item.id, item]));

  const porFuncionario = new Map<
    string,
    RelatorioResponsavelLinha
  >();

  for (const estoque of estoques) {
    const equipamento = equipamentoPorId.get(estoque.equipamento_id);
    if (!equipamento) continue;

    const estado = await estadoEquipamentosRepo.calcular(
      projetoId,
      estoque.id,
    );

    for (const [funcionarioId, quantidade] of estado.funcionarios) {
      if (quantidade <= 0) continue;

      const funcionario = funcionarioPorId.get(funcionarioId);
      if (!funcionario) continue;

      const linhaEquipamento: RelatorioEquipamentoPorResponsavelLinha = {
        estoqueId: estoque.id,
        equipamento,
        categoria: categoriaPorId.get(equipamento.categoria_id),
        estoque,
        funcionario,
        equipe: funcionario.equipe_raiz_id
          ? equipePorId.get(funcionario.equipe_raiz_id)
          : undefined,
        quantidade,
        identificacao:
          estoque.identificacao ||
          estoque.patrimonio ||
          estoque.serial ||
          "Sem identificação",
      };

      const existente = porFuncionario.get(funcionarioId);

      if (existente) {
        existente.registros += 1;
        existente.quantidade += quantidade;
        existente.equipamentos.push(linhaEquipamento);
      } else {
        porFuncionario.set(funcionarioId, {
          funcionario,
          equipe: funcionario.equipe_raiz_id
            ? equipePorId.get(funcionario.equipe_raiz_id)
            : undefined,
          registros: 1,
          quantidade,
          equipamentos: [linhaEquipamento],
        });
      }
    }
  }

  const linhas = Array.from(porFuncionario.values());

  for (const linha of linhas) {
    linha.equipamentos.sort((a, b) => {
      const equipamento = a.equipamento.nome.localeCompare(
        b.equipamento.nome,
        "pt-BR",
      );

      if (equipamento !== 0) return equipamento;

      return a.identificacao.localeCompare(
        b.identificacao,
        "pt-BR",
      );
    });
  }

  linhas.sort((a, b) =>
    a.funcionario.nome.localeCompare(
      b.funcionario.nome,
      "pt-BR",
    ),
  );

  return {
    projetoId,
    linhas,
    totalResponsaveis: linhas.length,
    totalRegistros: linhas.reduce(
      (total, linha) => total + linha.registros,
      0,
    ),
    quantidade: linhas.reduce(
      (total, linha) => total + linha.quantidade,
      0,
    ),
  };
}

export function exportarRelatorioEquipamentosPorResponsavel(
  relatorio: RelatorioEquipamentosPorResponsavel,
  formato: "xlsx" | "csv",
) {
  criarPlanilhaRelatorio({
    nomeAba: "Por responsável",
    arquivo: `relatorio_equipamentos_por_responsavel_${new Date().toISOString().slice(0, 10)}`,
    colunas: ["RESPONSAVEL", "EQUIPE", "EQUIPAMENTO", "CATEGORIA", "IDENTIFICACAO", "QUANTIDADE", "OBSERVACOES"],
    linhas: relatorio.linhas.flatMap((responsavel) => responsavel.equipamentos.map((linha) => ({
      RESPONSAVEL: linha.funcionario.nome,
      EQUIPE: linha.equipe?.nome ?? "Sem equipe",
      EQUIPAMENTO: linha.equipamento.nome,
      CATEGORIA: linha.categoria?.nome ?? "—",
      IDENTIFICACAO: linha.identificacao,
      QUANTIDADE: linha.quantidade,
      OBSERVACOES: linha.estoque.observacoes ?? "",
    }))),
    larguras: { RESPONSAVEL: 32, EQUIPE: 28, EQUIPAMENTO: 32, CATEGORIA: 22, IDENTIFICACAO: 20, QUANTIDADE: 12, OBSERVACOES: 42 },
    formatosNumero: ["QUANTIDADE"],
  }, formato);
}


/* -------------------------------------------------------------------------- */
/* Relatório Disponibilidade                                                  */
/* -------------------------------------------------------------------------- */

export type RelatorioDisponibilidadeLinha = {
  estoqueId: string;
  equipamento: Equipamento;
  categoria: CategoriaEquipamento | undefined;
  estoque: EstoqueEquipamento;
  quantidadeEstoque: number;
  disponivel: number;
  emUso: number;
  manutencao: number;
  identificacao: string;
};

export type RelatorioEquipamentosDisponibilidade = {
  projetoId: string;
  linhas: RelatorioDisponibilidadeLinha[];
  totalEquipamentos: number;
  quantidadeEstoque: number;
  disponivel: number;
  emUso: number;
  manutencao: number;
};

export async function consultarRelatorioEquipamentosDisponibilidade(
  projetoId: string,
): Promise<RelatorioEquipamentosDisponibilidade> {
  const db = getDB();

  const [estoques, equipamentos, categorias] = await Promise.all([
    db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
    db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
    db.categorias_equipamentos.where("projeto_id").equals(projetoId).toArray(),
  ]);

  const equipamentoPorId = new Map(
    equipamentos.map((item) => [item.id, item]),
  );
  const categoriaPorId = new Map(
    categorias.map((item) => [item.id, item]),
  );

  const linhas: RelatorioDisponibilidadeLinha[] = [];

  for (const estoque of estoques) {
    const equipamento = equipamentoPorId.get(estoque.equipamento_id);
    if (!equipamento) continue;

    const estado = await estadoEquipamentosRepo.calcular(
      projetoId,
      estoque.id,
    );

    if (estado.saldo <= 0 && estado.disponivel <= 0 && estado.apropriado <= 0) {
      continue;
    }

    linhas.push({
      estoqueId: estoque.id,
      equipamento,
      categoria: categoriaPorId.get(equipamento.categoria_id),
      estoque,
      quantidadeEstoque: estado.saldo,
      disponivel: estado.disponivel,
      emUso: estado.apropriado,
      manutencao: estado.manutencao,
      identificacao:
        estoque.identificacao ||
        estoque.patrimonio ||
        estoque.serial ||
        "Sem identificação",
    });
  }

  linhas.sort((a, b) =>
    a.equipamento.nome.localeCompare(b.equipamento.nome, "pt-BR"),
  );

  return {
    projetoId,
    linhas,
    totalEquipamentos: linhas.length,
    quantidadeEstoque: linhas.reduce(
      (total, linha) => total + linha.quantidadeEstoque,
      0,
    ),
    disponivel: linhas.reduce(
      (total, linha) => total + linha.disponivel,
      0,
    ),
    emUso: linhas.reduce(
      (total, linha) => total + linha.emUso,
      0,
    ),
    manutencao: linhas.reduce(
      (total, linha) => total + linha.manutencao,
      0,
    ),
  };
}

export function exportarRelatorioEquipamentosDisponibilidade(
  relatorio: RelatorioEquipamentosDisponibilidade,
  formato: "xlsx" | "csv",
) {
  criarPlanilhaRelatorio({
    nomeAba: "Disponibilidade",
    arquivo: `relatorio_equipamentos_disponibilidade_${new Date().toISOString().slice(0, 10)}`,
    colunas: ["EQUIPAMENTO", "CATEGORIA", "IDENTIFICACAO", "ESTOQUE", "DISPONIVEL", "EM_USO", "MANUTENCAO", "OBSERVACOES"],
    linhas: relatorio.linhas.map((linha) => ({
      EQUIPAMENTO: linha.equipamento.nome,
      CATEGORIA: linha.categoria?.nome ?? "—",
      IDENTIFICACAO: linha.identificacao,
      ESTOQUE: linha.quantidadeEstoque,
      DISPONIVEL: linha.disponivel,
      EM_USO: linha.emUso,
      MANUTENCAO: linha.manutencao,
      OBSERVACOES: linha.estoque.observacoes ?? "",
    })),
    larguras: { EQUIPAMENTO: 34, CATEGORIA: 22, IDENTIFICACAO: 20, ESTOQUE: 12, DISPONIVEL: 14, EM_USO: 12, MANUTENCAO: 14, OBSERVACOES: 42 },
    formatosNumero: ["ESTOQUE", "DISPONIVEL", "EM_USO", "MANUTENCAO"],
  }, formato);
}

/* -------------------------------------------------------------------------- */
/* Relatório Manutenção                                                       */
/* -------------------------------------------------------------------------- */

export type RelatorioManutencaoLinha = {
  estoqueId: string;
  equipamento: Equipamento;
  categoria: CategoriaEquipamento | undefined;
  estoque: EstoqueEquipamento;
  quantidade: number;
  identificacao: string;
  origem: "ALMOXARIFADO" | "FUNCIONARIO";
  funcionario: Funcionario | undefined;
  equipe: Equipe | undefined;
};

export type RelatorioEquipamentosManutencao = {
  projetoId: string;
  linhas: RelatorioManutencaoLinha[];
  totalRegistros: number;
  quantidade: number;
};

export async function consultarRelatorioEquipamentosManutencao(
  projetoId: string,
): Promise<RelatorioEquipamentosManutencao> {
  const db = getDB();

  const [estoques, equipamentos, categorias, funcionarios, equipes] =
    await Promise.all([
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.categorias_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
    ]);

  const equipamentoPorId = new Map(
    equipamentos.map((item) => [item.id, item]),
  );
  const categoriaPorId = new Map(
    categorias.map((item) => [item.id, item]),
  );
  const funcionarioPorId = new Map(
    funcionarios.map((item) => [item.id, item]),
  );
  const equipePorId = new Map(equipes.map((item) => [item.id, item]));

  const linhas: RelatorioManutencaoLinha[] = [];

  for (const estoque of estoques) {
    const equipamento = equipamentoPorId.get(estoque.equipamento_id);
    if (!equipamento) continue;

    const estado = await estadoEquipamentosRepo.calcular(
      projetoId,
      estoque.id,
    );

    if (estado.manutencao <= 0) continue;

    linhas.push({
      estoqueId: estoque.id,
      equipamento,
      categoria: categoriaPorId.get(equipamento.categoria_id),
      estoque,
      quantidade: estado.manutencao,
      identificacao:
        estoque.identificacao ||
        estoque.patrimonio ||
        estoque.serial ||
        "Sem identificação",
      origem: estado.apropriado > 0 ? "FUNCIONARIO" : "ALMOXARIFADO",
      funcionario: undefined,
      equipe: undefined,
    });
  }

  // A origem física pode envolver mais de um funcionário. Para o relatório,
  // mantemos uma linha consolidada por estoque e identificamos a origem
  // predominantemente como funcionário quando há apropriação.
  linhas.sort((a, b) =>
    a.equipamento.nome.localeCompare(b.equipamento.nome, "pt-BR"),
  );

  return {
    projetoId,
    linhas,
    totalRegistros: linhas.length,
    quantidade: linhas.reduce(
      (total, linha) => total + linha.quantidade,
      0,
    ),
  };
}

export function exportarRelatorioEquipamentosManutencao(
  relatorio: RelatorioEquipamentosManutencao,
  formato: "xlsx" | "csv",
) {
  criarPlanilhaRelatorio({
    nomeAba: "Manutenção",
    arquivo: `relatorio_equipamentos_manutencao_${new Date().toISOString().slice(0, 10)}`,
    colunas: ["EQUIPAMENTO", "CATEGORIA", "IDENTIFICACAO", "QUANTIDADE", "ORIGEM", "OBSERVACOES"],
    linhas: relatorio.linhas.map((linha) => ({
      EQUIPAMENTO: linha.equipamento.nome,
      CATEGORIA: linha.categoria?.nome ?? "—",
      IDENTIFICACAO: linha.identificacao,
      QUANTIDADE: linha.quantidade,
      ORIGEM: linha.origem,
      OBSERVACOES: linha.estoque.observacoes ?? "",
    })),
    larguras: { EQUIPAMENTO: 34, CATEGORIA: 22, IDENTIFICACAO: 20, QUANTIDADE: 12, ORIGEM: 28, OBSERVACOES: 48 },
    formatosNumero: ["QUANTIDADE"],
  }, formato);
}

/* -------------------------------------------------------------------------- */
/* Relatório Movimentações                                                    */
/* -------------------------------------------------------------------------- */

export type RelatorioMovimentacaoLinha = {
  movimentacao: import("@/types").MovimentacaoEquipamento;
  equipamento: Equipamento | undefined;
  estoque: EstoqueEquipamento | undefined;
  funcionarioOrigem: Funcionario | undefined;
  funcionarioDestino: Funcionario | undefined;
  equipeOrigem: Equipe | undefined;
  equipeDestino: Equipe | undefined;
};

export type RelatorioEquipamentosMovimentacoes = {
  projetoId: string;
  linhas: RelatorioMovimentacaoLinha[];
  totalMovimentacoes: number;
  quantidade: number;
};

export async function consultarRelatorioEquipamentosMovimentacoes(
  projetoId: string,
): Promise<RelatorioEquipamentosMovimentacoes> {
  const db = getDB();

  const [movimentacoes, estoques, equipamentos, funcionarios, equipes] =
    await Promise.all([
      db.movimentacoes_equipamentos
        .where("projeto_id")
        .equals(projetoId)
        .toArray(),
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
    ]);

  const estoquePorId = new Map(
    estoques.map((item) => [item.id, item]),
  );
  const equipamentoPorId = new Map(
    equipamentos.map((item) => [item.id, item]),
  );
  const funcionarioPorId = new Map(
    funcionarios.map((item) => [item.id, item]),
  );
  const equipePorId = new Map(equipes.map((item) => [item.id, item]));

  const linhas: RelatorioMovimentacaoLinha[] = movimentacoes.map(
    (movimentacao) => {
      const estoque =
        estoquePorId.get(movimentacao.estoque_equipamento_id);

      const funcionarioOrigem =
        movimentacao.tipo_origem === "FUNCIONARIO"
          ? funcionarioPorId.get(movimentacao.origem_id)
          : undefined;

      const funcionarioDestino =
        movimentacao.tipo_destino === "FUNCIONARIO"
          ? funcionarioPorId.get(movimentacao.destino_id)
          : undefined;

      return {
        movimentacao,
        equipamento: estoque
          ? equipamentoPorId.get(estoque.equipamento_id)
          : undefined,
        estoque,
        funcionarioOrigem,
        funcionarioDestino,
        equipeOrigem:
          movimentacao.tipo_origem === "EQUIPE"
            ? equipePorId.get(movimentacao.origem_id)
            : funcionarioOrigem?.equipe_raiz_id
              ? equipePorId.get(funcionarioOrigem.equipe_raiz_id)
              : undefined,
        equipeDestino:
          movimentacao.tipo_destino === "EQUIPE"
            ? equipePorId.get(movimentacao.destino_id)
            : funcionarioDestino?.equipe_raiz_id
              ? equipePorId.get(funcionarioDestino.equipe_raiz_id)
              : undefined,
      };
    },
  );

  linhas.sort((a, b) =>
    `${b.movimentacao.criado_em}|${b.movimentacao.id}`.localeCompare(
      `${a.movimentacao.criado_em}|${a.movimentacao.id}`,
    ),
  );

  return {
    projetoId,
    linhas,
    totalMovimentacoes: linhas.length,
    quantidade: linhas.reduce(
      (total, linha) => total + linha.movimentacao.quantidade,
      0,
    ),
  };
}

export function exportarRelatorioEquipamentosMovimentacoes(
  relatorio: RelatorioEquipamentosMovimentacoes,
  formato: "xlsx" | "csv",
) {
  criarPlanilhaRelatorio({
    nomeAba: "Movimentações",
    arquivo: `relatorio_equipamentos_movimentacoes_${new Date().toISOString().slice(0, 10)}`,
    colunas: ["DATA", "TIPO", "EQUIPAMENTO", "IDENTIFICACAO", "QUANTIDADE", "ORIGEM", "DESTINO", "DOCUMENTO", "OBSERVACOES"],
    linhas: relatorio.linhas.map((linha) => ({
      DATA: formatarDataHoraRelatorio(linha.movimentacao.criado_em),
      TIPO: rotuloTipoMovimentacao(linha.movimentacao.tipo),
      EQUIPAMENTO: linha.equipamento?.nome ?? "—",
      IDENTIFICACAO: linha.estoque?.identificacao || linha.estoque?.patrimonio || linha.estoque?.serial || "Sem identificação",
      QUANTIDADE: linha.movimentacao.quantidade,
      ORIGEM: linha.funcionarioOrigem?.nome || linha.equipeOrigem?.nome || linha.movimentacao.tipo_origem,
      DESTINO: linha.funcionarioDestino?.nome || linha.equipeDestino?.nome || linha.movimentacao.tipo_destino,
      DOCUMENTO: linha.estoque?.referencia_documento ?? "",
      OBSERVACOES: linha.movimentacao.observacoes ?? "",
    })),
    larguras: { DATA: 14, TIPO: 24, EQUIPAMENTO: 32, IDENTIFICACAO: 20, QUANTIDADE: 12, ORIGEM: 30, DESTINO: 30, DOCUMENTO: 22, OBSERVACOES: 48 },
    formatosNumero: ["QUANTIDADE"],
  }, formato);
}


/* -------------------------------------------------------------------------- */
/* Impressão / PDF                                                            */
/* -------------------------------------------------------------------------- */

function escaparHtmlRelatorio(valor: unknown): string {
  return String(valor ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br />");
}

type CartaoResumo = { label: string; valor: string | number };

function imprimirTabelaRelatorioEquipamentos(
  titulo: string,
  projetoNome: string,
  cabecalhos: string[],
  linhas: Array<Array<unknown>>,
  resumo: CartaoResumo[] = [],
  orientacao: "portrait" | "landscape" = "landscape",
) {
  const janela = window.open("", "_blank", "width=1280,height=900");
  if (!janela) return;

  const dataEmissao = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());

  const cabecalhosHtml = cabecalhos
    .map((cabecalho) => `<th>${escaparHtmlRelatorio(cabecalho)}</th>`)
    .join("");

  const linhasHtml = linhas.length
    ? linhas.map((linha, indice) => `
        <tr class="${indice % 2 === 1 ? "alt" : ""}">
          ${linha.map((valor, coluna) => {
            const numero = typeof valor === "number";
            return `<td class="${numero ? "num" : ""}">${escaparHtmlRelatorio(valor)}</td>`;
          }).join("")}
        </tr>`).join("")
    : `<tr><td class="empty" colspan="${cabecalhos.length}">Nenhum registro encontrado.</td></tr>`;

  const cardsHtml = resumo.length
    ? `<section class="summary">${resumo.map((item) => `
        <div class="summary-card">
          <span>${escaparHtmlRelatorio(item.label)}</span>
          <strong>${escaparHtmlRelatorio(item.valor)}</strong>
        </div>`).join("")}</section>`
    : "";

  janela.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtmlRelatorio(titulo)} — ${escaparHtmlRelatorio(projetoNome)}</title>
<style>
  @page { size: A4 ${orientacao}; margin: 12mm 11mm 15mm; }
  :root {
    color-scheme: light;
    --navy: #17324D;
    --navy-2: #24445F;
    --amber: #D9A441;
    --ink: #243447;
    --muted: #667788;
    --line: #D9E0E7;
    --soft: #F4F7F9;
  }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--ink); background: #fff; font-family: "IBM Plex Sans", Arial, Helvetica, sans-serif; font-size: 9px; line-height: 1.4; }
  .report { width: 100%; }
  .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding: 0 0 12px; border-bottom: 3px solid var(--navy); }
  .brand { color: var(--navy); font-size: 9px; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase; }
  h1 { margin: 4px 0 3px; color: var(--navy); font-family: "Barlow Condensed", Arial, sans-serif; font-size: 22px; line-height: 1.05; letter-spacing: .2px; }
  .subtitle { color: var(--muted); font-size: 9px; }
  .meta { min-width: 180px; text-align: right; color: var(--muted); font-size: 8px; }
  .meta strong { display: block; color: var(--navy); font-size: 9px; margin-bottom: 3px; }
  .summary { display: grid; grid-template-columns: repeat(${Math.min(Math.max(resumo.length, 1), 5)}, 1fr); gap: 7px; margin: 12px 0 13px; }
  .summary-card { border: 1px solid var(--line); border-left: 3px solid var(--amber); border-radius: 6px; padding: 7px 9px; background: var(--soft); }
  .summary-card span { display: block; color: var(--muted); font-size: 7px; font-weight: 700; letter-spacing: .55px; text-transform: uppercase; }
  .summary-card strong { display: block; margin-top: 2px; color: var(--navy); font-family: "Barlow Condensed", Arial, sans-serif; font-size: 17px; line-height: 1; }
  .section-title { display: flex; align-items: center; gap: 7px; margin: 0 0 7px; color: var(--navy); font-size: 10px; font-weight: 800; }
  .section-title::before { content: ""; width: 3px; height: 13px; border-radius: 2px; background: var(--amber); }
  table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: ${cabecalhos.length >= 8 ? "7.5" : cabecalhos.length >= 6 ? "8" : "8.5"}px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { padding: 6px 5px; background: var(--navy); color: #fff; border: 1px solid var(--navy-2); text-align: left; font-size: 7px; font-weight: 800; letter-spacing: .45px; text-transform: uppercase; vertical-align: middle; }
  td { padding: 5px; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
  tbody tr.alt td { background: var(--soft); }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { padding: 18px !important; text-align: center; color: var(--muted); }
  .note { margin-top: 11px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--soft); color: var(--muted); font-size: 8px; }
  .footer { display: flex; justify-content: space-between; gap: 20px; margin-top: 14px; padding-top: 7px; border-top: 1px solid var(--line); color: var(--muted); font-size: 7px; }
  .actions { position: fixed; top: 14px; right: 14px; display: flex; gap: 7px; z-index: 10; }
  .actions button { border: 1px solid #C8D1DA; border-radius: 6px; padding: 7px 10px; background: #fff; color: var(--navy); font-weight: 700; cursor: pointer; }
  .actions .primary { border-color: var(--navy); background: var(--navy); color: #fff; }
  @media screen { body { background: #EEF1F4; padding: 28px; } .report { max-width: 1120px; margin: 0 auto; padding: 24px 26px; background: #fff; box-shadow: 0 10px 32px rgba(20,35,50,.09); } }
  @media print { .actions { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .note, .footer { break-inside: avoid; } }
</style>
</head>
<body>
<div class="actions"><button onclick="window.close()">Fechar</button><button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button></div>
<main class="report">
  <header class="topbar">
    <div><div class="brand">ALMOXARIFADO · Gestão local-first</div><h1>${escaparHtmlRelatorio(titulo)}</h1><div class="subtitle">Projeto: ${escaparHtmlRelatorio(projetoNome)}</div></div>
    <div class="meta"><strong>Relatório de equipamentos</strong>Emitido em ${escaparHtmlRelatorio(dataEmissao)}</div>
  </header>
  ${cardsHtml}
  <section><h2 class="section-title">Dados do relatório</h2><table><thead><tr>${cabecalhosHtml}</tr></thead><tbody>${linhasHtml}</tbody></table></section>
  <div class="note">Documento gerado a partir dos registros atuais do projeto. Os valores refletem o estado calculado no momento da emissão.</div>
  <footer class="footer"><span>ALMOXARIFADO · Gestão local-first</span><span>${escaparHtmlRelatorio(titulo)} · ${escaparHtmlRelatorio(new Date().toLocaleDateString("pt-BR"))}</span></footer>
</main>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),350));</script>
</body></html>`);
  janela.document.close();
  janela.focus();
}

export function imprimirRelatorioEquipamentosSituacao(
  projetoNome: string,
  linhas: RelatorioEquipamentoLinha[],
  resumo: ResumoSituacao,
) {
  imprimirTabelaRelatorioEquipamentos(
    "Equipamentos por situação",
    projetoNome,
    ["Equipamento", "Categoria", "Identificação", "Localização / Responsável", "Situação", "Saldo", "Disponível", "Em uso", "Manutenção", "Observações"],
    linhas.map((linha) => [linha.equipamento.nome, linha.categoria?.nome ?? "—", linha.estoque.identificacao || linha.estoque.patrimonio || linha.estoque.serial || "—", localizacaoLinha(linha), situacaoLabel(linha.situacao), linha.estado.saldo, linha.estado.disponivel, linha.estado.apropriado, linha.estado.manutencao, linha.estoque.observacoes ?? ""]),
    [
      { label: "Total", valor: resumo.total }, { label: "Disponível", valor: resumo.disponivel },
      { label: "Em uso", valor: resumo.emUso }, { label: "Manutenção", valor: resumo.manutencao },
      { label: "Encerrado", valor: resumo.encerrado },
    ],
  );
}

export function imprimirRelatorioEquipamentosEquipe(
  relatorio: RelatorioEquipamentosEquipe,
  projetoNome: string,
) {
  imprimirTabelaRelatorioEquipamentos(
    "Equipamentos por equipe",
    projetoNome,
    ["Equipe", "Total", "Disponível", "Em uso", "Manutenção", "Encerrado"],
    relatorio.linhas.map((linha) => [linha.equipeNome, linha.total, linha.disponivel, linha.emUso, linha.manutencao, linha.encerrado]),
    [
      { label: "Total", valor: relatorio.resumo.total }, { label: "Disponível", valor: relatorio.resumo.disponivel },
      { label: "Em uso", valor: relatorio.resumo.emUso }, { label: "Manutenção", valor: relatorio.resumo.manutencao },
      { label: "Encerrado", valor: relatorio.resumo.encerrado },
    ],
  );
}

export function imprimirRelatorioEquipamentosEmUso(
  relatorio: RelatorioEquipamentosEmUso,
  projetoNome: string,
) {
  imprimirTabelaRelatorioEquipamentos(
    "Equipamentos em uso",
    projetoNome,
    ["Equipamento", "Categoria", "Identificação", "Responsável", "Equipe", "Quantidade", "Observações"],
    relatorio.linhas.map((linha) => [linha.equipamento.nome, linha.categoria?.nome ?? "—", linha.identificacao, linha.funcionario.nome, linha.equipe?.nome ?? "Sem equipe", linha.quantidade, linha.estoque.observacoes ?? ""]),
    [
      { label: "Registros", valor: relatorio.totalRegistros }, { label: "Quantidade", valor: relatorio.quantidade },
      { label: "Responsáveis", valor: relatorio.responsaveis }, { label: "Equipes", valor: relatorio.equipes },
    ],
  );
}

export function imprimirRelatorioEquipamentosPorResponsavel(
  relatorio: RelatorioEquipamentosPorResponsavel,
  projetoNome: string,
) {
  imprimirTabelaRelatorioEquipamentos(
    "Equipamentos por responsável",
    projetoNome,
    ["Responsável", "Equipe", "Equipamento", "Categoria", "Identificação", "Quantidade", "Observações"],
    relatorio.linhas.flatMap((responsavel) => responsavel.equipamentos.map((linha) => [responsavel.funcionario.nome, responsavel.equipe?.nome ?? "Sem equipe", linha.equipamento.nome, linha.categoria?.nome ?? "—", linha.identificacao, linha.quantidade, linha.estoque.observacoes ?? ""])),
    [
      { label: "Responsáveis", valor: relatorio.totalResponsaveis }, { label: "Registros", valor: relatorio.totalRegistros },
      { label: "Quantidade", valor: relatorio.quantidade },
    ],
  );
}

export function imprimirRelatorioEquipamentosDisponibilidade(
  relatorio: RelatorioEquipamentosDisponibilidade,
  projetoNome: string,
) {
  imprimirTabelaRelatorioEquipamentos(
    "Disponibilidade de equipamentos",
    projetoNome,
    ["Equipamento", "Categoria", "Identificação", "Estoque", "Disponível", "Em uso", "Manutenção", "Observações"],
    relatorio.linhas.map((linha) => [linha.equipamento.nome, linha.categoria?.nome ?? "—", linha.identificacao, linha.quantidadeEstoque, linha.disponivel, linha.emUso, linha.manutencao, linha.estoque.observacoes ?? ""]),
    [
      { label: "Equipamentos", valor: relatorio.totalEquipamentos }, { label: "Estoque", valor: relatorio.quantidadeEstoque },
      { label: "Disponível", valor: relatorio.disponivel }, { label: "Em uso", valor: relatorio.emUso },
      { label: "Manutenção", valor: relatorio.manutencao },
    ],
  );
}

export function imprimirRelatorioEquipamentosManutencao(
  relatorio: RelatorioEquipamentosManutencao,
  projetoNome: string,
) {
  imprimirTabelaRelatorioEquipamentos(
    "Equipamentos em manutenção",
    projetoNome,
    ["Equipamento", "Categoria", "Identificação", "Quantidade", "Origem", "Observações"],
    relatorio.linhas.map((linha) => [linha.equipamento.nome, linha.categoria?.nome ?? "—", linha.identificacao, linha.quantidade, linha.origem, linha.estoque.observacoes ?? ""]),
    [
      { label: "Registros", valor: relatorio.totalRegistros }, { label: "Quantidade", valor: relatorio.quantidade },
    ],
  );
}

export function imprimirRelatorioEquipamentosMovimentacoes(
  relatorio: RelatorioEquipamentosMovimentacoes,
  projetoNome: string,
) {
  imprimirTabelaRelatorioEquipamentos(
    "Movimentações de equipamentos",
    projetoNome,
    ["Data", "Tipo", "Equipamento", "Identificação", "Origem", "Destino", "Quantidade", "Documento", "Observações"],
    relatorio.linhas.map((linha) => [
      formatarDataHoraRelatorio(linha.movimentacao.criado_em), rotuloTipoMovimentacao(linha.movimentacao.tipo), linha.equipamento?.nome ?? "—",
      linha.estoque?.identificacao || linha.estoque?.patrimonio || linha.estoque?.serial || "Sem identificação",
      linha.funcionarioOrigem?.nome || linha.equipeOrigem?.nome || linha.movimentacao.tipo_origem,
      linha.funcionarioDestino?.nome || linha.equipeDestino?.nome || linha.movimentacao.tipo_destino,
      linha.movimentacao.quantidade, linha.estoque?.referencia_documento ?? "", linha.movimentacao.observacoes ?? "",
    ]),
    [
      { label: "Movimentações", valor: relatorio.totalMovimentacoes }, { label: "Quantidade", valor: relatorio.quantidade },
    ],
  );
}
