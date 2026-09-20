import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Eye,
  ClipboardList,
  Warehouse,
  Wrench,
  UserRound,
  PackageCheck,
  PackageOpen,
  ArrowRightLeft,
  Truck,
  Building2,
  CircleAlert,
  CircleCheck,
  Ban,
  Pencil,
  Plus,
  Search,
  Trash2,
  ChevronDown,
  DollarSign,
  FileText,
  Link2,
  Unlink2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useProjetoAtivoId } from "@/hooks/useAppData";
import { useLiveQuery } from "dexie-react-hooks";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { getDB } from "@/db/db";
import { equipamentosRepo } from "@/services/equipamentos/repo";
import { categoriasEquipamentosRepo } from "@/services/equipamentos/categorias-repo";
import { estoqueEquipamentosRepo } from "@/services/equipamentos/estoque-repo";
import { movimentacoesEquipamentosRepo } from "@/services/equipamentos/movimentacoes-repo";
import { manutencoesEquipamentosRepo } from "@/services/equipamentos/manutencoes-repo";
import { documentosRepo } from "@/services/documentos-repo";
import { financeiroDocumentosEquipamentosRepo } from "@/services/equipamentos/financeiro-documentos-repo";
import {
  resolverCustoRecorrenteUnitario,
  resolverValorUnitario,
} from "@/services/equipamentos/custos";

import type {
  CategoriaEquipamento,
  Empresa,
  Equipe,
  Equipamento,
  EquipamentoTipoControle,
  EquipamentoVinculo,
  EstoqueEquipamento,
  MovimentacaoEquipamento,
  Funcionario,
  ManutencaoEquipamento,
  ManutencaoEquipamentoTipo,
  Documento,
  DocumentoItem,
  ManutencaoDocumento,
  ApropriacaoFinanceiraEquipamento,
} from "@/types";
import {
  manutencaoEquipamentoTipoLabel,
  manutencaoEquipamentoStatusLabel,
  manutencaoEquipamentoDetalhamentoLabel,
} from "@/types";

export const Route = createFileRoute("/app/equipamentos")({
  ssr: false,
  component: EquipamentosPage,
});

type Formulario = {
  nome: string;
  categoria_id: string;
  tipo_controle: EquipamentoTipoControle;
  marca: string;
  modelo: string;
  descricao: string;
  valor_referencia: string;
  custo_recorrente: string;
  periodicidade_custo: "HORA" | "DIA" | "SEMANA" | "MES" | "ANO" | "";
};

type EstoqueEquipamentoUI = EstoqueEquipamento & { ativo?: boolean };

type ManutencaoFormulario = {
  tipo: ManutencaoEquipamentoTipo;
  motivo: string;
  descricao_servico: string;
  empresa_id: string;
  data_previsao_retorno: string;
  resultado: string;
  observacoes: string;
};

type ManutencaoRetroativaFormulario = ManutencaoFormulario & {
  estoque_equipamento_id: string;
  quantidade: string;
  data_abertura: string;
  data_envio: string;
  data_retorno: string;
};

type EstoqueFormulario = {
  equipamento_id: string;
  empresa_id: string;
  vinculo: EquipamentoVinculo;
  equipe_id: string;
  quantidade: string;
  patrimonio: string;
  identificacao: string;
  serial: string;
  data_entrada: string;
  referencia_documento: string;
  observacoes: string;
  valor_unitario: string;
  custo_recorrente_unitario: string;
  periodicidade_custo: "HORA" | "DIA" | "SEMANA" | "MES" | "ANO" | "";
};

const formularioInicial: Formulario = {
  nome: "",
  categoria_id: "",
  tipo_controle: "INDIVIDUAL",
  marca: "",
  modelo: "",
  descricao: "",
  valor_referencia: "",
  custo_recorrente: "",
  periodicidade_custo: "",
};

function manutencaoFormularioInicial(): ManutencaoFormulario {
  return {
    tipo: "CORRETIVA",
    motivo: "",
    descricao_servico: "",
    empresa_id: "",
    data_previsao_retorno: "",
    resultado: "",
    observacoes: "",
  };
}

function manutencaoRetroativaFormularioInicial(estoqueId = ""): ManutencaoRetroativaFormulario {
  return {
    ...manutencaoFormularioInicial(),
    estoque_equipamento_id: estoqueId,
    quantidade: "1",
    data_abertura: new Date().toISOString().slice(0, 10),
    data_envio: "",
    data_retorno: "",
  };
}

function estoqueFormularioInicial(equipamentoId = ""): EstoqueFormulario {
  return {
    equipamento_id: equipamentoId,
    empresa_id: "",
    vinculo: "PROPRIO",
    equipe_id: "",
    quantidade: "1",
    patrimonio: "",
    identificacao: "",
    serial: "",
    data_entrada: new Date().toISOString().slice(0, 10),
    referencia_documento: "",
    observacoes: "",
    valor_unitario: "",
    custo_recorrente_unitario: "",
    periodicidade_custo: "",
  };
}

function EquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );
  const financeiroEquipamentosAtivo = configuracao?.modulos.financeiro_equipamentos === true;
  const manutencaoEquipamentosAtivo = configuracao?.modulos.manutencao_equipamentos === true;
  const documentosEquipamentosAtivo = configuracao?.modulos.documentos === true && configuracao?.documentos.habilitado === true;
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [estoques, setEstoques] = useState<EstoqueEquipamentoUI[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEquipamento[]>([]);
  const [manutencoes, setManutencoes] = useState<ManutencaoEquipamento[]>([]);
  const [categorias, setCategorias] = useState<CategoriaEquipamento[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [manutencaoDocumentos, setManutencaoDocumentos] = useState<Map<string, ManutencaoDocumento[]>>(new Map());
  const [apropriacoesFinanceiras, setApropriacoesFinanceiras] = useState<ApropriacaoFinanceiraEquipamento[]>([]);
  const [busca, setBusca] = useState("");
  const [formulario, setFormulario] = useState<Formulario>(formularioInicial);
  const [estoqueFormulario, setEstoqueFormulario] = useState<EstoqueFormulario>(estoqueFormularioInicial());
  const [editando, setEditando] = useState<Equipamento | null>(null);
  const [equipamentoDetalhe, setEquipamentoDetalhe] = useState<Equipamento | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [dialogEstoque, setDialogEstoque] = useState(false);
  const [dialogNovaCategoria, setDialogNovaCategoria] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [historicosAbertos, setHistoricosAbertos] = useState<Set<string>>(new Set());
  const [estoqueFinanceiroEditando, setEstoqueFinanceiroEditando] = useState<EstoqueEquipamentoUI | null>(null);
  const [estoqueFinanceiroFormulario, setEstoqueFinanceiroFormulario] = useState({
    valor_unitario: "",
    custo_recorrente_unitario: "",
    periodicidade_custo: "" as EstoqueFormulario["periodicidade_custo"],
  });
  const [manutencaoEditando, setManutencaoEditando] = useState<ManutencaoEquipamento | null>(null);
  const [manutencaoFormulario, setManutencaoFormulario] = useState<ManutencaoFormulario>(manutencaoFormularioInicial());
  const [manutencaoRetroativaFormulario, setManutencaoRetroativaFormulario] = useState<ManutencaoRetroativaFormulario>(manutencaoRetroativaFormularioInicial());
  const [dialogManutencao, setDialogManutencao] = useState(false);
  const [dialogManutencaoRetroativa, setDialogManutencaoRetroativa] = useState(false);
  const [dialogDocumentosManutencao, setDialogDocumentosManutencao] = useState(false);
  const [documentosManutencaoEditando, setDocumentosManutencaoEditando] = useState<ManutencaoEquipamento | null>(null);
  const [documentoSelecionadoId, setDocumentoSelecionadoId] = useState("");
  const [apropriacaoDocumentoId, setApropriacaoDocumentoId] = useState("");
  const [apropriacaoDocumentoItemId, setApropriacaoDocumentoItemId] = useState("");
  const [apropriacaoDocumentosItens, setApropriacaoDocumentosItens] = useState<DocumentoItem[]>([]);
  const [valorApropriacao, setValorApropriacao] = useState("");

  async function carregar() {
    if (!projetoId) return;
    const db = getDB();
    const [
      equipamentosData,
      estoquesData,
      movimentacoesData,
      manutencoesData,
      categoriasData,
      empresasData,
      equipesData,
      funcionariosData,
      documentosData,
      apropriacoesData,
    ] = await Promise.all([
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.movimentacoes_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      manutencoesEquipamentosRepo.listar(projetoId),
      categoriasEquipamentosRepo.listar(projetoId),
      db.empresas.where("projeto_id").equals(projetoId).filter((e) => e.ativo).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).filter((e) => e.ativo).toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
      documentosEquipamentosAtivo ? documentosRepo.listar(projetoId) : Promise.resolve([] as Documento[]),
      financeiroEquipamentosAtivo ? financeiroDocumentosEquipamentosRepo.listarApropriacoes(projetoId) : Promise.resolve([] as ApropriacaoFinanceiraEquipamento[]),
    ]);
    const estoquesNormalizados = estoquesData.map((estoque) =>
      estoque.ativo === undefined ? { ...estoque, ativo: true } : estoque,
    );
    const legados = estoquesNormalizados.filter((estoque) => estoque.ativo === true && estoquesData.find((item) => item.id === estoque.id)?.ativo === undefined);
    if (legados.length) {
      await db.estoque_equipamentos.bulkPut(legados);
    }

    setEquipamentos(equipamentosData);
    setEstoques(estoquesNormalizados);
    setMovimentacoes(movimentacoesData);
    setManutencoes(manutencoesData);
    setCategorias(categoriasData.filter((c) => c.ativo));
    setEmpresas(empresasData);
    setEquipes(equipesData);
    setFuncionarios(funcionariosData);
    setDocumentos(documentosData);
    setApropriacoesFinanceiras(apropriacoesData);

    if (documentosEquipamentosAtivo) {
      const pares = await Promise.all(
        manutencoesData.map(async (manutencao) => [
          manutencao.id,
          await financeiroDocumentosEquipamentosRepo.listarDocumentosDaManutencao(projetoId, manutencao.id),
        ] as const),
      );
      setManutencaoDocumentos(new Map(pares));
    } else {
      setManutencaoDocumentos(new Map());
    }
  }

  useEffect(() => { void carregar(); }, [projetoId, documentosEquipamentosAtivo, financeiroEquipamentosAtivo, manutencaoEquipamentosAtivo]);

  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);
  const empresaPorId = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome])), [empresas]);
  const equipePorId = useMemo(() => new Map(equipes.map((e) => [e.id, e.nome])), [equipes]);
  const estoquePorEquipamento = useMemo(() => {
    const map = new Map<string, EstoqueEquipamento[]>();
    for (const estoque of estoques) map.set(estoque.equipamento_id, [...(map.get(estoque.equipamento_id) ?? []), estoque]);
    return map;
  }, [estoques]);
  type ResumoEstoque = {
    quantidade: number;
    saldo: number;
    almoxarifado: number;
    manutencao: number;
    apropriado: number;
    disponivel: number;
  };

  const resumoPorEstoque = useMemo(() => {
    const resultado = new Map<string, ResumoEstoque>();

    for (const estoque of estoques) {
      if (estoque.ativo === false) continue;
      resultado.set(estoque.id, {
        quantidade: estoque.quantidade,
        saldo: estoque.quantidade,
        almoxarifado: estoque.quantidade,
        manutencao: 0,
        apropriado: 0,
        disponivel: estoque.quantidade,
      });
    }

    const movimentos = [...movimentacoes].sort((a, b) =>
      `${a.criado_em}|${a.id}`.localeCompare(`${b.criado_em}|${b.id}`),
    );

    for (const movimento of movimentos) {
      const estado = resultado.get(movimento.estoque_equipamento_id);
      if (!estado) continue;
      const q = Math.max(0, movimento.quantidade);

      const retirarDaOrigem = (parte: MovimentacaoEquipamento["tipo_origem"], id: string) => {
        if (parte === "EQUIPE") {
          const equipe = equipes.find((item) => item.id === id);
          const nome = equipe?.nome.trim().toLowerCase();
          if (nome === "almoxarifado") estado.almoxarifado -= q;
          if (nome === "manutenção") estado.manutencao -= q;
        } else if (parte === "FUNCIONARIO") {
          estado.apropriado -= q;
        }
      };

      const adicionarAoDestino = (parte: MovimentacaoEquipamento["tipo_destino"], id: string) => {
        if (parte === "EQUIPE") {
          const equipe = equipes.find((item) => item.id === id);
          const nome = equipe?.nome.trim().toLowerCase();
          if (nome === "almoxarifado") estado.almoxarifado += q;
          if (nome === "manutenção") estado.manutencao += q;
        } else if (parte === "FUNCIONARIO") {
          estado.apropriado += q;
        }
      };

      switch (movimento.tipo) {
        case "ENTRADA":
          break;
        case "SINALIZAR_MANUTENCAO":
          retirarDaOrigem(movimento.tipo_origem, movimento.origem_id);
          adicionarAoDestino(movimento.tipo_destino, movimento.destino_id);
          break;
        case "ENVIO":
          if (movimento.tipo_origem === "EQUIPE") {
            const origem = equipes.find((item) => item.id === movimento.origem_id);
            const nomeOrigem = origem?.nome.trim().toLowerCase();
            if (nomeOrigem === "almoxarifado") {
              estado.almoxarifado -= q;
              estado.manutencao += q;
            }
            // Se a origem já é Manutenção, o envio externo não altera a contagem.
          } else if (movimento.tipo_origem === "FUNCIONARIO") {
            // Compatibilidade com históricos antigos.
            estado.apropriado -= q;
            estado.manutencao += q;
          }
          break;
        case "MANUTENCAO":
          // Histórico antigo: preserva a semântica física anterior.
          if (movimento.tipo_origem === "EQUIPE" && movimento.origem_id === equipes.find((e) => e.nome.trim().toLowerCase() === "almoxarifado")?.id) {
            estado.almoxarifado -= q;
            estado.manutencao += q;
          } else if (movimento.tipo_origem === "FUNCIONARIO") {
            estado.apropriado -= q;
            estado.manutencao += q;
          }
          break;
        case "RETIRADA_MANUTENCAO":
          if (movimento.origem_id === equipes.find((e) => e.nome.trim().toLowerCase() === "almoxarifado")?.id) {
            estado.almoxarifado -= q;
            estado.manutencao += q;
          }
          // Se já estava em Manutenção, o envio externo não reduz o saldo.
          break;
        case "RETORNO_MANUTENCAO":
          estado.manutencao -= q;
          estado.almoxarifado += q;
          break;
        case "DEVOLUCAO_FORNECEDOR":
        case "BAIXA":
          retirarDaOrigem(movimento.tipo_origem, movimento.origem_id);
          break;
        default:
          retirarDaOrigem(movimento.tipo_origem, movimento.origem_id);
          adicionarAoDestino(movimento.tipo_destino, movimento.destino_id);
          break;
      }
    }

    for (const [id, estado] of resultado) {
      const estoque = estoques.find((item) => item.id === id);
      if (!estoque) continue;
      // Saldo físico considera somente devoluções/baixas ainda pendentes.
      // REENTRADA desfaz a última devolução/baixa pendente, exatamente como
      // a regra do repositório de movimentações.
      const pendencias: Array<{ tipo: "DEVOLUCAO_FORNECEDOR" | "BAIXA"; restante: number }> = [];
      for (const movimento of movimentos) {
        if (movimento.estoque_equipamento_id !== id) continue;

        if (movimento.tipo === "DEVOLUCAO_FORNECEDOR" || movimento.tipo === "BAIXA") {
          pendencias.push({ tipo: movimento.tipo, restante: Math.max(0, movimento.quantidade) });
          continue;
        }

        if (movimento.tipo === "REENTRADA") {
          let restante = Math.max(0, movimento.quantidade);
          while (restante > 0 && pendencias.length > 0) {
            const pendencia = pendencias[pendencias.length - 1];
            if (!pendencia) break;
            const aplicada = Math.min(restante, pendencia.restante);
            pendencia.restante -= aplicada;
            restante -= aplicada;
            if (pendencia.restante <= 0) pendencias.pop();
          }
        }
      }

      const devolvido = pendencias
        .filter((item) => item.tipo === "DEVOLUCAO_FORNECEDOR")
        .reduce((total, item) => total + item.restante, 0);
      const baixado = pendencias
        .filter((item) => item.tipo === "BAIXA")
        .reduce((total, item) => total + item.restante, 0);

      estado.saldo = Math.max(0, estoque.quantidade - devolvido - baixado);
      estado.quantidade = estoque.quantidade;
      estado.almoxarifado = Math.max(0, estado.almoxarifado);
      estado.manutencao = Math.max(0, estado.manutencao);
      estado.apropriado = Math.max(0, estado.apropriado);
      estado.disponivel = estado.almoxarifado;
    }

    return resultado;
  }, [estoques, movimentacoes, equipes]);

  const resumoPorEquipamento = useMemo(() => {
    const mapa = new Map<string, ResumoEstoque>();
    for (const estoque of estoques) {
      if (estoque.ativo === false) continue;
      const resumo = resumoPorEstoque.get(estoque.id);
      if (!resumo) continue;
      const atual = mapa.get(estoque.equipamento_id) ?? {
        quantidade: 0, saldo: 0, almoxarifado: 0, manutencao: 0, apropriado: 0, disponivel: 0,
      };
      atual.quantidade += resumo.quantidade;
      atual.saldo += resumo.saldo;
      atual.almoxarifado += resumo.almoxarifado;
      atual.manutencao += resumo.manutencao;
      atual.apropriado += resumo.apropriado;
      atual.disponivel += resumo.disponivel;
      mapa.set(estoque.equipamento_id, atual);
    }
    return mapa;
  }, [estoques, resumoPorEstoque]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return equipamentos;
    return equipamentos.filter((e) => [e.nome, e.marca, e.modelo, e.descricao, categoriaPorId.get(e.categoria_id)].some((v) => String(v ?? "").toLowerCase().includes(termo)));
  }, [equipamentos, busca, categoriaPorId]);

  const atualizarCampo = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => setFormulario((atual) => ({ ...atual, [campo]: valor }));
  const atualizarEstoque = <K extends keyof EstoqueFormulario>(campo: K, valor: EstoqueFormulario[K]) => setEstoqueFormulario((atual) => ({ ...atual, [campo]: valor }));

  function abrirNovo() { setEditando(null); setFormulario(formularioInicial); setDialogAberto(true); }
  function abrirEdicao(e: Equipamento) {
    setEditando(e);
    setFormulario({
      nome: e.nome,
      categoria_id: e.categoria_id,
      tipo_controle: e.tipo_controle,
      marca: e.marca ?? "",
      modelo: e.modelo ?? "",
      descricao: e.descricao ?? "",
      valor_referencia: e.valor_referencia == null ? "" : String(e.valor_referencia),
      custo_recorrente: e.custo_recorrente == null ? "" : String(e.custo_recorrente),
      periodicidade_custo: e.periodicidade_custo ?? "",
    });
    setDialogAberto(true);
  }
  async function abrirDetalhes(equipamento: Equipamento) {
    if (!projetoId) return;
    try {
      const registros = await getDB().estoque_equipamentos
        .where("projeto_id")
        .equals(projetoId)
        .toArray();
      setEstoques(registros);
      setEquipamentoDetalhe(equipamento);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os registros de estoque.");
    }
  }

  function abrirNovoEstoque(equipamento?: Equipamento) {
    if (equipamento?.ativo === false) {
      toast.error("Este equipamento está inativo. Ative o cadastro antes de adicionar ao estoque.");
      return;
    }
    setEstoqueFormulario(estoqueFormularioInicial(equipamento?.id));
    setDialogEstoque(true);
  }

  function abrirEdicaoFinanceiro(estoque: EstoqueEquipamentoUI) {
    setEstoqueFinanceiroEditando(estoque);
    setEstoqueFinanceiroFormulario({
      valor_unitario: estoque.valor_unitario == null ? "" : String(estoque.valor_unitario),
      custo_recorrente_unitario: estoque.custo_recorrente_unitario == null ? "" : String(estoque.custo_recorrente_unitario),
      periodicidade_custo: estoque.periodicidade_custo ?? "",
    });
  }

  async function alternarEstoqueAtivo(estoque: EstoqueEquipamentoUI) {
    if (!projetoId) return;
    try {
      const db = getDB();
      const atual = await db.estoque_equipamentos.get(estoque.id);
      if (!atual || atual.projeto_id !== projetoId) {
        throw new Error("Registro de estoque não encontrado neste projeto.");
      }
      const ativo = estoque.ativo === false;
      await db.estoque_equipamentos.put({
        ...atual,
        ativo,
        atualizado_em: new Date().toISOString(),
      });
      await carregar();
      toast.success(ativo ? "Registro de estoque ativado." : "Registro de estoque desativado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o status do registro.");
    }
  }

  async function salvar() {
    if (!projetoId) return;
    if (!formulario.nome.trim()) {
      toast.error("Informe o nome do equipamento.");
      return;
    }
    if (!formulario.categoria_id) {
      toast.error("Selecione a categoria.");
      return;
    }
    try {
      setSalvando(true);
      await equipamentosRepo.salvar(projetoId, {
        ...(editando ? { id: editando.id } : {}),
        categoria_id: formulario.categoria_id,
        nome: formulario.nome.trim(),
        tipo_controle: formulario.tipo_controle,
        modelo: formulario.modelo.trim() || null,
        marca: formulario.marca.trim() || null,
        descricao: formulario.descricao.trim() || null,
        valor_referencia: financeiroEquipamentosAtivo && formulario.valor_referencia.trim() !== "" ? Number(formulario.valor_referencia) : null,
        custo_recorrente: financeiroEquipamentosAtivo && formulario.custo_recorrente.trim() !== "" ? Number(formulario.custo_recorrente) : null,
        periodicidade_custo: financeiroEquipamentosAtivo && formulario.periodicidade_custo ? formulario.periodicidade_custo : null,
        fonte_valor: financeiroEquipamentosAtivo && formulario.valor_referencia.trim() !== "" ? "INFORMADO" : null,
        ativo: editando?.ativo ?? true,
      });
      await carregar(); setDialogAberto(false); setEditando(null);
      toast.success(editando ? "Equipamento atualizado." : "Equipamento cadastrado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o equipamento."); }
    finally { setSalvando(false); }
  }
  async function salvarEstoque() {
    if (!projetoId) return;
    if (!estoqueFormulario.equipamento_id) {
      toast.error("Selecione o equipamento do cadastro.");
      return;
    }
    if (!estoqueFormulario.empresa_id) {
      toast.error("Selecione a empresa proprietária.");
      return;
    }
    if (!estoqueFormulario.data_entrada) {
      toast.error("Informe a data de entrada.");
      return;
    }

    const equipamento = equipamentos.find((e) => e.id === estoqueFormulario.equipamento_id);
    if (!equipamento) {
      toast.error("Equipamento cadastrado não encontrado.");
      return;
    }
    if (equipamento.ativo === false) {
      toast.error("Este equipamento está inativo. Ative o cadastro antes de adicionar ao estoque.");
      return;
    }

    const quantidade = equipamento.tipo_controle === "INDIVIDUAL"
      ? 1
      : Number(estoqueFormulario.quantidade);

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      toast.error("Informe uma quantidade válida.");
    return;
    }

    if (equipamento.tipo_controle === "QUANTITATIVO" && !Number.isInteger(quantidade)) {
      toast.error("A quantidade deve ser inteira.");
    return;
    }

    const db = getDB();
    let estoqueCriado: EstoqueEquipamento | null = null;

    try {
      setSalvando(true);

      const almoxarifado = await db.equipes
        .where("projeto_id")
        .equals(projetoId)
        .filter((equipe) => equipe.ativo && equipe.nome.trim().toLowerCase() === "almoxarifado")
        .first();

      if (!almoxarifado) {
        throw new Error("A equipe Almoxarifado não foi encontrada neste projeto.");
      }

      // Adicionar ao estoque é uma ENTRADA.
      // Primeiro nasce o registro físico; depois registramos a movimentação que o levou ao Almoxarifado.
      estoqueCriado = await estoqueEquipamentosRepo.salvar(projetoId, {
        equipamento_id: equipamento.id,
        empresa_id: estoqueFormulario.empresa_id,
        vinculo: estoqueFormulario.vinculo,
        equipe_id: estoqueFormulario.equipe_id || null,
        quantidade,
        devolvido: 0,
        patrimonio: estoqueFormulario.patrimonio.trim() || null,
        identificacao: estoqueFormulario.identificacao.trim() || null,
        serial: estoqueFormulario.serial.trim() || null,
        data_entrada: estoqueFormulario.data_entrada,
        referencia_documento: estoqueFormulario.referencia_documento.trim() || null,
        observacoes: estoqueFormulario.observacoes.trim() || null,
        valor_unitario: financeiroEquipamentosAtivo && estoqueFormulario.valor_unitario.trim() !== "" ? Number(estoqueFormulario.valor_unitario) : null,
        custo_recorrente_unitario: financeiroEquipamentosAtivo && estoqueFormulario.custo_recorrente_unitario.trim() !== "" ? Number(estoqueFormulario.custo_recorrente_unitario) : null,
        periodicidade_custo: financeiroEquipamentosAtivo && estoqueFormulario.periodicidade_custo ? estoqueFormulario.periodicidade_custo : null,
        fonte_valor: financeiroEquipamentosAtivo && estoqueFormulario.valor_unitario.trim() !== "" ? "INFORMADO" : null,
      });

      // Registros físicos novos começam ativos. O campo é administrativo e não interfere no status operacional.
      await db.estoque_equipamentos.update(estoqueCriado.id, {
        ativo: true,
      });

      try {
        await movimentacoesEquipamentosRepo.salvar({
          projeto_id: projetoId,
          estoque_equipamento_id: estoqueCriado.id,
          tipo: "ENTRADA",
          quantidade,
          tipo_origem: "EMPRESA",
          origem_id: estoqueFormulario.empresa_id,
          tipo_destino: "EQUIPE",
          destino_id: almoxarifado.id,
          data: estoqueFormulario.data_entrada,
          referencia_documento: estoqueFormulario.referencia_documento.trim() || null,
          observacoes: estoqueFormulario.observacoes.trim() || null,
        });
      } catch (error) {
        await db.estoque_equipamentos.delete(estoqueCriado.id);
        throw error;
      }

      await carregar();
      setDialogEstoque(false);
      setEstoqueFormulario(estoqueFormularioInicial());
      toast.success("Equipamento adicionado ao estoque e entrada registrada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a entrada do equipamento.");
    return;
    } finally {
      setSalvando(false);
    }
  }
  async function criarCategoria() {
    if (!projetoId) return;
    if (!novaCategoria.trim()) {
      toast.error("Informe o nome da categoria.");
      return;
    }
    try {
      setSalvando(true);
      const categoria = await categoriasEquipamentosRepo.salvar(projetoId, { nome: novaCategoria.trim(), ativo: true });
      setCategorias((atual) => [...atual, categoria]); atualizarCampo("categoria_id", categoria.id); setNovaCategoria(""); setDialogNovaCategoria(false); toast.success("Categoria criada.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível criar a categoria."); }
    finally { setSalvando(false); }
  }

  async function salvarFinanceiroEstoque() {
    if (!projetoId || !estoqueFinanceiroEditando) return;

    const valorUnitario = estoqueFinanceiroFormulario.valor_unitario.trim() === ""
      ? null
      : Number(estoqueFinanceiroFormulario.valor_unitario);
    const custoRecorrente = estoqueFinanceiroFormulario.custo_recorrente_unitario.trim() === ""
      ? null
      : Number(estoqueFinanceiroFormulario.custo_recorrente_unitario);

    if (valorUnitario !== null && (!Number.isFinite(valorUnitario) || valorUnitario < 0)) {
      toast.error("Informe um valor unitário válido.");
      return;
    }
    if (custoRecorrente !== null && (!Number.isFinite(custoRecorrente) || custoRecorrente < 0)) {
      toast.error("Informe um custo recorrente válido.");
      return;
    }
    if (custoRecorrente !== null && !estoqueFinanceiroFormulario.periodicidade_custo) {
      toast.error("Informe a periodicidade do custo recorrente.");
      return;
    }

    try {
      setSalvando(true);
      const atualizado = await estoqueEquipamentosRepo.atualizarFinanceiro(
        projetoId,
        estoqueFinanceiroEditando.id,
        {
          valor_unitario: valorUnitario,
          custo_recorrente_unitario: custoRecorrente,
          periodicidade_custo: custoRecorrente === null ? null : (estoqueFinanceiroFormulario.periodicidade_custo || null),
        },
      );
      setEstoques((atual) => atual.map((item) => item.id === atualizado.id ? { ...item, ...atualizado } : item));
      setEstoqueFinanceiroEditando(null);
      toast.success("Custos do registro físico atualizados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os custos do registro físico.");
    } finally {
      setSalvando(false);
    }
  }

  const atualizarManutencao = <K extends keyof ManutencaoFormulario>(campo: K, valor: ManutencaoFormulario[K]) =>
    setManutencaoFormulario((atual) => ({ ...atual, [campo]: valor }));

  const atualizarManutencaoRetroativa = <K extends keyof ManutencaoRetroativaFormulario>(
    campo: K,
    valor: ManutencaoRetroativaFormulario[K],
  ) => setManutencaoRetroativaFormulario((atual) => ({ ...atual, [campo]: valor }));

  function abrirEdicaoManutencao(manutencao: ManutencaoEquipamento) {
    if (!manutencaoEquipamentosAtivo) {
      toast.info("Ative o módulo de manutenção para detalhar esta ocorrência.");
      return;
    }
    setManutencaoEditando(manutencao);
    setManutencaoFormulario({
      tipo: manutencao.tipo,
      motivo: manutencao.motivo,
      descricao_servico: manutencao.descricao_servico ?? "",
      empresa_id: manutencao.empresa_id ?? "",
      data_previsao_retorno: manutencao.data_previsao_retorno ?? "",
      resultado: manutencao.resultado ?? "",
      observacoes: manutencao.observacoes ?? "",
    });
    setDialogManutencao(true);
  }

  function abrirNovaManutencaoRetroativa() {
    if (!manutencaoEquipamentosAtivo) {
      toast.info("Ative o módulo de manutenção para registrar ocorrências retroativas.");
      return;
    }
    const primeiro = estoqueSelecionado.find((item) => item.ativo !== false);
    if (!primeiro) {
      toast.error("Não há registro físico ativo para registrar a ocorrência.");
      return;
    }
    setManutencaoRetroativaFormulario(manutencaoRetroativaFormularioInicial(primeiro.id));
    setDialogManutencaoRetroativa(true);
  }

  async function salvarManutencaoDetalhamento() {
    if (!projetoId || !manutencaoEditando) return;

    try {
      setSalvando(true);
      const salva = await manutencoesEquipamentosRepo.atualizarDetalhamento(
        projetoId,
        manutencaoEditando.id,
        {
          tipo: manutencaoFormulario.tipo,
          motivo: manutencaoFormulario.motivo,
          descricao_servico: manutencaoFormulario.descricao_servico || null,
          empresa_id: manutencaoFormulario.empresa_id || null,
          data_previsao_retorno: manutencaoFormulario.data_previsao_retorno || null,
          resultado: manutencaoFormulario.resultado || null,
          observacoes: manutencaoFormulario.observacoes || null,
        },
      );
      setManutencoes((atual) => atual.map((item) => item.id === salva.id ? salva : item));
      setDialogManutencao(false);
      setManutencaoEditando(null);
      toast.success("Detalhamento da manutenção atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o detalhamento da manutenção.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarManutencaoRetroativa() {
    if (!projetoId) return;
    const dados = manutencaoRetroativaFormulario;
    const estoque = estoques.find((item) => item.id === dados.estoque_equipamento_id);
    if (!estoque) {
      toast.error("Selecione um registro físico válido.");
      return;
    }
    const quantidade = Number(dados.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    try {
      setSalvando(true);
      const salva = await manutencoesEquipamentosRepo.criarRetroativa(projetoId, {
        estoque_equipamento_id: estoque.id,
        tipo: dados.tipo,
        motivo: dados.motivo,
        descricao_servico: dados.descricao_servico || null,
        empresa_id: dados.empresa_id || null,
        data_abertura: dados.data_abertura,
        data_envio: dados.data_envio || null,
        data_previsao_retorno: dados.data_previsao_retorno || null,
        data_retorno: dados.data_retorno || null,
        resultado: dados.resultado || null,
        observacoes: dados.observacoes || null,
        quantidade,
      });
      setManutencoes((atual) => [salva, ...atual.filter((item) => item.id !== salva.id)]);
      setDialogManutencaoRetroativa(false);
      toast.success("Ocorrência retroativa registrada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a ocorrência retroativa.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirDocumentosManutencao(manutencao: ManutencaoEquipamento) {
    if (!documentosEquipamentosAtivo) return;
    setDocumentosManutencaoEditando(manutencao);
    setDocumentoSelecionadoId("");
    setApropriacaoDocumentoId("");
    setApropriacaoDocumentoItemId("");
    setApropriacaoDocumentosItens([]);
    setValorApropriacao("");
    setDialogDocumentosManutencao(true);
  }

  async function vincularDocumentoManutencao() {
    if (!projetoId || !documentosManutencaoEditando || !documentoSelecionadoId) return;
    setSalvando(true);
    try {
      await financeiroDocumentosEquipamentosRepo.vincularDocumentoManutencao(
        projetoId,
        documentosManutencaoEditando.id,
        documentoSelecionadoId,
      );
      toast.success("Documento vinculado à manutenção.");
      await carregar();
      setDocumentoSelecionadoId("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível vincular o documento.");
    } finally {
      setSalvando(false);
    }
  }

  async function desvincularDocumentoManutencao(vinculoId: string) {
    if (!projetoId) return;
    setSalvando(true);
    try {
      await financeiroDocumentosEquipamentosRepo.desvincularDocumentoManutencao(projetoId, vinculoId);
      toast.success("Documento desvinculado.");
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desvincular o documento.");
    } finally {
      setSalvando(false);
    }
  }

  async function selecionarDocumentoParaApropriacao(documentoId: string) {
    setApropriacaoDocumentoId(documentoId);
    setApropriacaoDocumentoItemId("");
    if (!documentoId) {
      setApropriacaoDocumentosItens([]);
      return;
    }
    const itens = await getDB().documento_itens.where("documento_id").equals(documentoId).toArray();
    setApropriacaoDocumentosItens(itens);
  }

  async function criarApropriacaoFinanceira() {
    if (!projetoId || !documentosManutencaoEditando || !apropriacaoDocumentoId) return;
    const valor = Number(String(valorApropriacao).replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error("Informe um valor de apropriação maior que zero.");
      return;
    }
    const estoque = estoques.find((item) => item.id === documentosManutencaoEditando.estoque_equipamento_id);
    if (!estoque) {
      toast.error("Registro físico da manutenção não encontrado.");
      return;
    }

    setSalvando(true);
    try {
      await financeiroDocumentosEquipamentosRepo.criarApropriacao(projetoId, {
        documentoId: apropriacaoDocumentoId,
        documentoItemId: apropriacaoDocumentoItemId || null,
        manutencaoId: documentosManutencaoEditando.id,
        estoqueEquipamentoId: estoque.id,
        valor,
      });
      toast.success("Custo apropriado ao equipamento.");
      setValorApropriacao("");
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a apropriação.");
    } finally {
      setSalvando(false);
    }
  }

  async function removerApropriacaoFinanceira(apropriacaoId: string) {
    if (!projetoId) return;
    setSalvando(true);
    try {
      await financeiroDocumentosEquipamentosRepo.removerApropriacao(projetoId, apropriacaoId);
      toast.success("Apropriação removida.");
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover a apropriação.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(equipamento: Equipamento) {
    if (!projetoId) return;

    try {
      await equipamentosRepo.salvar(projetoId, {
        id: equipamento.id,
        categoria_id: equipamento.categoria_id,
        nome: equipamento.nome,
        tipo_controle: equipamento.tipo_controle,
        modelo: equipamento.modelo ?? null,
        marca: equipamento.marca ?? null,
        descricao: equipamento.descricao ?? null,
        valor_referencia: equipamento.valor_referencia ?? null,
        custo_recorrente: equipamento.custo_recorrente ?? null,
        periodicidade_custo: equipamento.periodicidade_custo ?? null,
        fonte_valor: equipamento.fonte_valor ?? null,
        ativo: equipamento.ativo === false,
      });
      await carregar();
      setEquipamentoDetalhe((atual) =>
        atual?.id === equipamento.id
          ? { ...atual, ativo: equipamento.ativo === false }
          : atual,
      );
      toast.success(
        equipamento.ativo === false
          ? `Equipamento "${equipamento.nome}" ativado.`
          : `Equipamento "${equipamento.nome}" desativado.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o status do equipamento.",
      );
    }
  }
  async function excluir(e: Equipamento) {
    if (!projetoId || !window.confirm(`Excluir o cadastro "${e.nome}"?`)) return;
    try { await equipamentosRepo.excluir(projetoId, e.id); await carregar(); toast.success("Cadastro excluído."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir o cadastro."); }
  }

  const estoqueSelecionado = equipamentoDetalhe ? estoquePorEquipamento.get(equipamentoDetalhe.id) ?? [] : [];
  const manutencoesSelecionadas = equipamentoDetalhe
    ? manutencoes.filter((item) => item.equipamento_id === equipamentoDetalhe.id)
    : [];
  const estoquePorId = useMemo(() => new Map(estoques.map((item) => [item.id, item])), [estoques]);
  const saldoTotal = (id: string) => resumoPorEquipamento.get(id)?.saldo ?? 0;
  const quantidadeTotal = (id: string) => resumoPorEquipamento.get(id)?.quantidade ?? 0;
  const almoxarifadoTotal = (id: string) => resumoPorEquipamento.get(id)?.almoxarifado ?? 0;
  const apropriadoTotal = (id: string) => resumoPorEquipamento.get(id)?.apropriado ?? 0;
  const manutencaoTotal = (id: string) => resumoPorEquipamento.get(id)?.manutencao ?? 0;
  const vinculoLabel = (v: EquipamentoVinculo) => v === "PROPRIO" ? "Próprio" : v === "ALUGADO" ? "Alugado" : "Empréstimo";
  const funcionarioPorId = useMemo(() => new Map(funcionarios.map((f) => [f.id, f])), [funcionarios]);
  const movimentosPorEstoque = useMemo(() => {
    const mapa = new Map<string, MovimentacaoEquipamento[]>();
    for (const movimento of movimentacoes) {
      const lista = mapa.get(movimento.estoque_equipamento_id) ?? [];
      lista.push(movimento);
      mapa.set(movimento.estoque_equipamento_id, lista);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => `${a.criado_em}|${a.id}`.localeCompare(`${b.criado_em}|${b.id}`));
    }
    return mapa;
  }, [movimentacoes]);
  const movimentacaoPorId = useMemo(() => new Map(movimentacoes.map((movimento) => [movimento.id, movimento])), [movimentacoes]);
  type AlocacaoAtual = {
    tipo: "EQUIPE" | "FUNCIONARIO" | "EMPRESA";
    id: string;
    quantidade: number;
  };

  const alocacoesAtuais = useMemo(() => {
    const resultado = new Map<string, AlocacaoAtual[]>();

    for (const estoque of estoques) {
      if (estoque.ativo === false) continue;

      const equipamento = equipamentos.find((item) => item.id === estoque.equipamento_id);
      const movimentos = movimentosPorEstoque.get(estoque.id) ?? [];
      const saldoAtual = resumoPorEstoque.get(estoque.id)?.saldo ?? Math.max(0, estoque.quantidade - estoque.devolvido);

      // Equipamento individual representa uma unidade física. Portanto, sua
      // localização atual deve ser única e refletir somente o estado final do
      // histórico, nunca somar localizações de movimentações passadas.
      if (equipamento?.tipo_controle === "INDIVIDUAL") {
        if (saldoAtual <= 0) {
          resultado.set(estoque.id, []);
          continue;
        }

        const almoxarifado = equipes.find((e) => e.nome.trim().toLowerCase() === "almoxarifado");
        let localAtual: AlocacaoAtual | null = almoxarifado
          ? { tipo: "EQUIPE", id: almoxarifado.id, quantidade: 1 }
          : null;

        const chaveAtual = () => localAtual ? `${localAtual.tipo}:${localAtual.id}` : null;

        for (const movimento of movimentos) {
          if (movimento.tipo === "ENTRADA") {
            localAtual = {
              tipo: movimento.tipo_destino,
              id: movimento.destino_id,
              quantidade: 1,
            };
            continue;
          }

          const origemKey = `${movimento.tipo_origem}:${movimento.origem_id}`;
          const destinoKey = `${movimento.tipo_destino}:${movimento.destino_id}`;

          // Baixa e devolução ao fornecedor encerram o saldo físico atual.
          if (movimento.tipo === "BAIXA" || movimento.tipo === "DEVOLUCAO_FORNECEDOR") {
            localAtual = null;
            continue;
          }

          // Reentrada restaura a unidade no destino (Almoxarifado quando
          // o destino não foi persistido no histórico antigo).
          if (movimento.tipo === "REENTRADA") {
            if (movimento.tipo_destino && movimento.destino_id) {
              localAtual = { tipo: movimento.tipo_destino, id: movimento.destino_id, quantidade: 1 };
            } else if (almoxarifado) {
              localAtual = { tipo: "EQUIPE", id: almoxarifado.id, quantidade: 1 };
            }
            continue;
          }

          // Para os demais movimentos, só alteramos a localização se a
          // unidade realmente estiver na origem registrada.
          if (chaveAtual() === origemKey) {
            localAtual = {
              tipo: movimento.tipo_destino,
              id: movimento.destino_id,
              quantidade: 1,
            };
          } else if (!localAtual && movimento.tipo_destino && movimento.destino_id) {
            // Compatibilidade com históricos antigos que não preservaram a
            // origem exatamente como está no registro atual.
            localAtual = {
              tipo: movimento.tipo_destino,
              id: movimento.destino_id,
              quantidade: 1,
            };
          }
        }

        resultado.set(estoque.id, localAtual ? [localAtual] : []);
        continue;
      }

      // Controle quantitativo continua usando alocações acumuladas, pois uma
      // mesma quantidade pode estar distribuída em mais de um local.
      const locais = new Map<string, AlocacaoAtual>();
      const almoxarifado = equipes.find((e) => e.nome.trim().toLowerCase() === "almoxarifado");
      if (almoxarifado && estoque.quantidade > 0) {
        locais.set(`EQUIPE:${almoxarifado.id}`, { tipo: "EQUIPE", id: almoxarifado.id, quantidade: estoque.quantidade });
      }

      for (const movimento of movimentos) {
        if (movimento.tipo === "ENTRADA") continue;
        const origemKey = `${movimento.tipo_origem}:${movimento.origem_id}`;
        const destinoKey = `${movimento.tipo_destino}:${movimento.destino_id}`;
        const origem = locais.get(origemKey);
        if (origem) {
          origem.quantidade = Math.max(0, origem.quantidade - movimento.quantidade);
          if (origem.quantidade === 0) locais.delete(origemKey);
        }
        const destino = locais.get(destinoKey);
        if (destino) destino.quantidade += movimento.quantidade;
        else locais.set(destinoKey, { tipo: movimento.tipo_destino, id: movimento.destino_id, quantidade: movimento.quantidade });
      }

      resultado.set(estoque.id, [...locais.values()].filter((item) => item.quantidade > 0));
    }
    return resultado;
  }, [estoques, equipamentos, equipes, movimentosPorEstoque, resumoPorEstoque]);

  const rotuloLocal = (alocacao: AlocacaoAtual) => {
    if (alocacao.tipo === "FUNCIONARIO") {
      const funcionario = funcionarioPorId.get(alocacao.id);
      return funcionario ? `Funcionário: ${funcionario.nome}${funcionario.matricula ? ` — ${funcionario.matricula}` : ""}` : "Funcionário não localizado";
    }
    if (alocacao.tipo === "EMPRESA") return `Empresa: ${empresaPorId.get(alocacao.id) ?? "não localizada"}`;
    return `Equipe: ${equipePorId.get(alocacao.id) ?? "não localizada"}`;
  };

  const situacaoSemLocalizacao = (estoqueId: string) => {
    const historico = movimentosPorEstoque.get(estoqueId) ?? [];
    const pendencias: Array<"DEVOLUCAO_FORNECEDOR" | "BAIXA"> = [];

    for (const movimento of historico) {
      if (movimento.tipo === "DEVOLUCAO_FORNECEDOR" || movimento.tipo === "BAIXA") {
        pendencias.push(movimento.tipo);
        continue;
      }
      if (movimento.tipo === "REENTRADA") {
        let restante = Math.max(0, movimento.quantidade);
        while (restante > 0 && pendencias.length > 0) {
          pendencias.pop();
          restante = 0;
        }
      }
    }

    const ultima = pendencias.at(-1);
    if (ultima === "DEVOLUCAO_FORNECEDOR") return "Devolvido ao fornecedor";
    if (ultima === "BAIXA") return "Baixado definitivamente";
    return "Sem localização atual";
  };

  const rotuloParticipante = (tipo: MovimentacaoEquipamento["tipo_origem"], id: string) => {
    if (tipo === "FUNCIONARIO") {
      const funcionario = funcionarioPorId.get(id);
      return funcionario ? funcionario.nome : "Funcionário não localizado";
    }
    if (tipo === "EMPRESA") return empresaPorId.get(id) ?? "Empresa não localizada";
    return equipePorId.get(id) ?? "Equipe não localizada";
  };

  const movimentacaoVisual = (tipo: MovimentacaoEquipamento["tipo"]) => {
    switch (tipo) {
      case "ENTRADA":
        return { label: "Entrada no estoque", icon: PackageCheck, iconClass: "text-emerald-600", badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700" };
      case "SAIDA":
        return { label: "Saída para funcionário", icon: PackageOpen, iconClass: "text-blue-600", badgeClass: "border-blue-200 bg-blue-50 text-blue-700" };
      case "DEVOLUCAO":
        return { label: "Devolução do funcionário", icon: ArrowRightLeft, iconClass: "text-cyan-600", badgeClass: "border-cyan-200 bg-cyan-50 text-cyan-700" };
      case "TRANSFERENCIA":
        return { label: "Transferência entre funcionários", icon: ArrowRightLeft, iconClass: "text-violet-600", badgeClass: "border-violet-200 bg-violet-50 text-violet-700" };
      case "SINALIZAR_MANUTENCAO":
        return { label: "Sinalizar para manutenção", icon: Wrench, iconClass: "text-amber-600", badgeClass: "border-amber-200 bg-amber-50 text-amber-700" };
      case "ENVIO":
        return { label: "Envio para manutenção", icon: Truck, iconClass: "text-orange-600", badgeClass: "border-orange-200 bg-orange-50 text-orange-700" };
      case "RETORNO_MANUTENCAO":
        return { label: "Retorno da manutenção", icon: Wrench, iconClass: "text-sky-600", badgeClass: "border-sky-200 bg-sky-50 text-sky-700" };
      case "DEVOLUCAO_FORNECEDOR":
        return { label: "Devolução ao fornecedor", icon: Building2, iconClass: "text-rose-600", badgeClass: "border-rose-200 bg-rose-50 text-rose-700" };
      case "BAIXA":
        return { label: "Baixa definitiva", icon: Ban, iconClass: "text-red-600", badgeClass: "border-red-200 bg-red-50 text-red-700" };
      case "REENTRADA":
        return { label: "Reentrada no estoque", icon: PackageCheck, iconClass: "text-violet-600", badgeClass: "border-violet-200 bg-violet-50 text-violet-700" };
      case "MANUTENCAO":
        return { label: "Manutenção (histórico)", icon: Wrench, iconClass: "text-amber-600", badgeClass: "border-amber-200 bg-amber-50 text-amber-700" };
      case "RETIRADA_MANUTENCAO":
        return { label: "Envio para manutenção (histórico)", icon: Truck, iconClass: "text-orange-600", badgeClass: "border-orange-200 bg-orange-50 text-orange-700" };
    }
  };

  const dataMovimentacao = (movimento: MovimentacaoEquipamento) => {
    const criado = new Date(movimento.criado_em);
    if (!Number.isNaN(criado.getTime())) {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(criado);
    }

    const [ano = "", mes = "", dia = ""] = movimento.data.split("-");
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : movimento.data;
  };


  const resumoGeral = useMemo(() => {
    const equipamentosAtivos = equipamentos.filter((equipamento) => equipamento.ativo !== false);
    const estoquesAtivos = estoques.filter((estoque) => estoque.ativo !== false);

    return {
      equipamentos: equipamentosAtivos.length,
      saldo: equipamentosAtivos.reduce(
        (total, equipamento) => total + (resumoPorEquipamento.get(equipamento.id)?.saldo ?? 0),
        0,
      ),
      almoxarifado: equipamentosAtivos.reduce(
        (total, equipamento) => total + (resumoPorEquipamento.get(equipamento.id)?.almoxarifado ?? 0),
        0,
      ),
      emUso: equipamentosAtivos.reduce(
        (total, equipamento) => total + (resumoPorEquipamento.get(equipamento.id)?.apropriado ?? 0),
        0,
      ),
      manutencao: equipamentosAtivos.reduce(
        (total, equipamento) => total + (resumoPorEquipamento.get(equipamento.id)?.manutencao ?? 0),
        0,
      ),
      registros: estoquesAtivos.length,
    };
  }, [equipamentos, estoques, resumoPorEquipamento]);

  const cardsResumo = [
    {
      label: "Equipamentos",
      value: resumoGeral.equipamentos,
      description: "cadastros ativos",
      icon: PackageCheck,
      className: "border-primary/15 bg-primary/5",
      iconClassName: "text-primary",
    },
    {
      label: "Saldo total",
      value: resumoGeral.saldo,
      description: "quantidade em estoque",
      icon: ClipboardList,
      className: "border-sky-200 bg-sky-50/60",
      iconClassName: "text-sky-700",
    },
    {
      label: "Almoxarifado",
      value: resumoGeral.almoxarifado,
      description: "disponíveis para retirada",
      icon: Warehouse,
      className: "border-emerald-200 bg-emerald-50/60",
      iconClassName: "text-emerald-700",
    },
    {
      label: "Em uso",
      value: resumoGeral.emUso,
      description: "apropriados a funcionários",
      icon: UserRound,
      className: "border-blue-200 bg-blue-50/60",
      iconClassName: "text-blue-700",
    },
    {
      label: "Manutenção",
      value: resumoGeral.manutencao,
      description: "em manutenção",
      icon: Wrench,
      className: "border-orange-200 bg-orange-50/60",
      iconClassName: "text-orange-700",
    },
    {
      label: "Registros físicos",
      value: resumoGeral.registros,
      description: "registros ativos de estoque",
      icon: Box,
      className: "border-border bg-muted/20",
      iconClassName: "text-muted-foreground",
    },
  ];

  if (!projetoId) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum projeto ativo selecionado.</CardContent></Card>;

  return <>
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Equipamentos</h1><p className="text-sm text-muted-foreground">Cadastros de equipamentos e registros físicos de estoque.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => abrirNovoEstoque()}><ClipboardList className="mr-2 h-4 w-4" />Adicionar ao estoque</Button><Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" />Novo equipamento</Button></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cardsResumo.map(({ label, value, description, icon: Icon, className, iconClassName }) => (
          <Card key={label} className={`overflow-hidden shadow-sm ${className}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background/70">
                  <Icon className={`h-5 w-5 ${iconClassName}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold"><Box className="h-4 w-4 text-primary" /> Catálogo de equipamentos</div>
              <p className="mt-1 text-xs text-muted-foreground">Visão consolidada do saldo e da situação operacional.</p>
            </div>
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar equipamento..." className="pl-9 bg-background" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/10 text-left">
                <th className="px-4 py-3 font-medium">Equipamento</th><th className="px-4 py-3 font-medium">Categoria</th><th className="px-4 py-3 font-medium">Controle</th><th className="px-4 py-3 text-center font-medium">Saldo</th><th className="px-4 py-3 text-center font-medium">Almox.</th><th className="px-4 py-3 text-center font-medium">Em uso</th><th className="px-4 py-3 text-center font-medium">Manut.</th><th className="px-4 py-3 text-center font-medium">Registros</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr></thead>
              <tbody>
                {filtrados.map((e) => {
                  const registros = estoquePorEquipamento.get(e.id) ?? [];
                  const saldo = saldoTotal(e.id);
                  const almox = almoxarifadoTotal(e.id);
                  const emUso = apropriadoTotal(e.id);
                  const manutencao = manutencaoTotal(e.id);
                  return <tr key={e.id} className="group border-b transition-colors last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${e.ativo === false ? "border-muted bg-muted/50 text-muted-foreground" : "border-primary/15 bg-primary/5 text-primary"}`}><Box className="h-5 w-5" /></div>
                        <div className="min-w-0"><div className="font-semibold leading-tight">{e.nome}</div>{(e.marca || e.modelo) && <div className="mt-1 text-xs text-muted-foreground">{[e.marca, e.modelo].filter(Boolean).join(" • ")}</div>}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><span className="text-sm">{categoriaPorId.get(e.categoria_id) ?? "—"}</span></td>
                    <td className="px-4 py-3.5"><Badge variant="outline" className="bg-background">{e.tipo_controle === "INDIVIDUAL" ? "Individual" : "Quantitativo"}</Badge></td>
                    <td className="px-4 py-3.5 text-center"><span className="inline-flex min-w-9 items-center justify-center rounded-lg border bg-background px-2 py-1 font-bold">{saldo}</span></td>
                    <td className="px-4 py-3.5 text-center"><span className="inline-flex items-center gap-1.5 font-medium text-emerald-700"><Warehouse className="h-3.5 w-3.5" />{almox}</span></td>
                    <td className="px-4 py-3.5 text-center"><span className="inline-flex items-center gap-1.5 font-medium text-blue-700"><UserRound className="h-3.5 w-3.5" />{emUso}</span></td>
                    <td className="px-4 py-3.5 text-center"><span className={`inline-flex items-center gap-1.5 font-medium ${manutencao > 0 ? "text-orange-700" : "text-muted-foreground"}`}><Wrench className="h-3.5 w-3.5" />{manutencao}</span></td>
                    <td className="px-4 py-3.5 text-center"><Badge variant="outline" className="min-w-8 justify-center">{registros.length}</Badge></td>
                    <td className="px-4 py-3.5">
                      <label className="inline-flex cursor-pointer items-center gap-2" title={e.ativo === false ? "Ativar equipamento" : "Desativar equipamento"}>
                        <input type="checkbox" checked={e.ativo !== false} onChange={() => void alternarAtivo(e)} className="h-4 w-4 cursor-pointer rounded border-input accent-primary" />
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${e.ativo === false ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{e.ativo === false ? <CircleAlert className="h-3 w-3" /> : <CircleCheck className="h-3 w-3" />}{e.ativo === false ? "Inativo" : "Ativo"}</span>
                      </label>
                    </td>
                    <td className="px-4 py-3.5"><div className="flex justify-end gap-1 opacity-80 transition-opacity group-hover:opacity-100"><Button variant="ghost" size="icon" className="h-8 w-8" title="Detalhes" onClick={() => void abrirDetalhes(e)}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" title="Adicionar estoque" onClick={() => abrirNovoEstoque(e)}><Plus className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => abrirEdicao(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir" onClick={() => void excluir(e)}><Trash2 className="h-4 w-4" /></Button></div></td>
                  </tr>;
                })}
                {filtrados.length === 0 && <tr><td colSpan={10} className="py-14 text-center text-sm text-muted-foreground"><div className="flex flex-col items-center gap-2"><Box className="h-8 w-8 text-muted-foreground/50" /><span>{busca ? "Nenhum equipamento encontrado." : "Nenhum equipamento cadastrado."}</span></div></td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>

    <Dialog open={Boolean(equipamentoDetalhe)} onOpenChange={(open) => !open && setEquipamentoDetalhe(null)}><DialogContent className="w-[calc(100vw-1rem)] max-w-none max-h-[95vh] overflow-y-auto p-3 sm:w-[calc(100vw-2rem)] sm:max-w-[1400px] sm:p-5 lg:max-w-[1500px]"><DialogHeader><DialogTitle className="flex items-center gap-2"><Box className="h-5 w-5 text-primary" />Detalhes do equipamento</DialogTitle></DialogHeader>{equipamentoDetalhe && <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-semibold">{equipamentoDetalhe.nome}</h2><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{categoriaPorId.get(equipamentoDetalhe.categoria_id) ?? "Sem categoria"}</Badge><Badge variant="outline">{equipamentoDetalhe.tipo_controle === "INDIVIDUAL" ? "Controle individual" : "Controle quantitativo"}</Badge><Badge variant={equipamentoDetalhe.ativo === false ? "outline" : "secondary"}>{equipamentoDetalhe.ativo === false ? "Inativo" : "Ativo"}</Badge></div><p className="mt-3 text-sm text-muted-foreground">{[equipamentoDetalhe.marca, equipamentoDetalhe.modelo].filter(Boolean).join(" • ") || "Marca/modelo não informados"}</p>{equipamentoDetalhe.descricao && <p className="mt-2 max-w-3xl text-sm">{equipamentoDetalhe.descricao}</p>}</div><Button onClick={() => abrirNovoEstoque(equipamentoDetalhe)} disabled={equipamentoDetalhe.ativo === false}><Plus className="mr-2 h-4 w-4" />Adicionar estoque</Button></div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-xl border border-primary/15 bg-primary/5 p-4"><div className="flex items-center gap-2 text-xs font-medium text-primary"><Box className="h-4 w-4" />Saldo</div><p className="mt-2 text-2xl font-bold">{saldoTotal(equipamentoDetalhe.id)}</p></div><div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-center gap-2 text-xs font-medium text-emerald-700"><Warehouse className="h-4 w-4" />Almoxarifado</div><p className="mt-2 text-2xl font-bold text-emerald-800">{almoxarifadoTotal(equipamentoDetalhe.id)}</p></div><div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4"><div className="flex items-center gap-2 text-xs font-medium text-blue-700"><UserRound className="h-4 w-4" />Em uso</div><p className="mt-2 text-2xl font-bold text-blue-800">{apropriadoTotal(equipamentoDetalhe.id)}</p></div><div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4"><div className="flex items-center gap-2 text-xs font-medium text-orange-700"><Wrench className="h-4 w-4" />Manutenção</div><p className="mt-2 text-2xl font-bold text-orange-800">{manutencaoTotal(equipamentoDetalhe.id)}</p></div><div className="rounded-xl border bg-muted/20 p-4"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><ClipboardList className="h-4 w-4" />Registros físicos</div><p className="mt-2 text-2xl font-bold">{estoqueSelecionado.length}</p></div></div>
      <div className="space-y-3"><div><h3 className="font-semibold">Estoque físico</h3><p className="text-sm text-muted-foreground">Cada linha representa um registro físico independente. Com o financeiro ativo, os custos abaixo representam os valores efetivos dessa unidade/lote.</p></div><div className="overflow-x-auto rounded-lg border"><table className="min-w-[1120px] w-full text-sm"><thead><tr className="border-b bg-muted/30 text-left"><th className="px-3 py-3">Proprietário</th><th className="px-3 py-3">Vínculo</th><th className="px-3 py-3">Localização atual</th><th className="px-3 py-3">Identificação</th><th className="px-3 py-3">Serial</th><th className="px-3 py-3">Patrimônio</th><th className="px-3 py-3">Saldo</th>{financeiroEquipamentosAtivo && <><th className="px-3 py-3">Valor efetivo</th><th className="px-3 py-3">Recorrente</th></>}<th className="px-3 py-3">Ativo</th>{financeiroEquipamentosAtivo && <th className="px-3 py-3 text-right">Financeiro</th>}</tr></thead><tbody>{estoqueSelecionado.map((e) => { const equipamento = equipamentoDetalhe; const valorUnitario = resolverValorUnitario(equipamento, e); const custoRecorrente = resolverCustoRecorrenteUnitario(equipamento, e); const valorTotal = valorUnitario == null ? null : valorUnitario * Math.max(0, e.quantidade); const recorrenteTotal = custoRecorrente == null ? null : custoRecorrente * Math.max(0, e.quantidade); const valorEspecifico = e.valor_unitario != null; const recorrenteEspecifico = e.custo_recorrente_unitario != null; return <tr key={e.id} className="border-b last:border-0 align-top"><td className="px-3 py-3">{empresaPorId.get(e.empresa_id) ?? "—"}</td><td className="px-3 py-3">{vinculoLabel(e.vinculo)}</td><td className="px-3 py-3"><div className="space-y-1">{(alocacoesAtuais.get(e.id) ?? []).map((local) => <div key={`${local.tipo}:${local.id}`}><span>{rotuloLocal(local)}</span><span className="ml-2 text-xs text-muted-foreground">({local.quantidade})</span></div>)}{(alocacoesAtuais.get(e.id) ?? []).length === 0 && <span className={resumoPorEstoque.get(e.id)?.saldo === 0 ? "font-medium text-muted-foreground" : "text-muted-foreground"}>{situacaoSemLocalizacao(e.id)}</span>}</div></td><td className="px-3 py-3">{e.identificacao ?? "—"}</td><td className="px-3 py-3">{e.serial ?? "—"}</td><td className="px-3 py-3">{e.patrimonio ?? "—"}</td><td className="px-3 py-3 font-medium">{resumoPorEstoque.get(e.id)?.saldo ?? Math.max(0, e.quantidade - e.devolvido)}</td>{financeiroEquipamentosAtivo && <><td className="px-3 py-3"><div className="font-semibold">{valorTotal == null ? "—" : valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div><div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span>{valorUnitario == null ? "Sem valor" : `${valorUnitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} / un.`}</span><Badge variant="outline" className="h-5 px-1.5 text-[10px]">{valorEspecifico ? "Específico" : "Padrão"}</Badge></div></td><td className="px-3 py-3"><div className="font-medium">{recorrenteTotal == null ? "—" : recorrenteTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div><div className="mt-1 text-xs text-muted-foreground">{(e.periodicidade_custo ?? equipamento.periodicidade_custo) === "HORA" ? "por hora" : (e.periodicidade_custo ?? equipamento.periodicidade_custo) === "DIA" ? "por dia" : (e.periodicidade_custo ?? equipamento.periodicidade_custo) === "SEMANA" ? "por semana" : (e.periodicidade_custo ?? equipamento.periodicidade_custo) === "MES" ? "por mês" : (e.periodicidade_custo ?? equipamento.periodicidade_custo) === "ANO" ? "por ano" : "sem periodicidade"}{recorrenteEspecifico ? " · específico" : " · padrão"}</div></td></>}<td className="px-3 py-3"><label className="inline-flex cursor-pointer items-center gap-2" title={e.ativo === false ? "Ativar registro" : "Desativar registro"}><input type="checkbox" checked={e.ativo !== false} onChange={() => void alternarEstoqueAtivo(e)} className="h-4 w-4 cursor-pointer rounded border-input accent-primary" /><span className="text-xs text-muted-foreground">{e.ativo === false ? "Inativo" : "Ativo"}</span></label></td>{financeiroEquipamentosAtivo && <td className="px-3 py-3 text-right"><Button variant="outline" size="sm" className="h-8" onClick={() => abrirEdicaoFinanceiro(e)}><DollarSign className="mr-1.5 h-3.5 w-3.5" />Editar custos</Button></td>}</tr>; })}{estoqueSelecionado.length === 0 && <tr><td colSpan={financeiroEquipamentosAtivo ? 11 : 8} className="py-8 text-center text-muted-foreground">Nenhum registro de estoque.</td></tr>}</tbody></table></div></div>
      {(manutencaoEquipamentosAtivo || manutencoesSelecionadas.length > 0) && <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Ciclo de manutenção</h3>
              {manutencoesSelecionadas.some((item) => item.status_operacional === "AGUARDANDO_ENVIO" || item.status_operacional === "EM_MANUTENCAO") && (
                <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                  {manutencoesSelecionadas.filter((item) => item.status_operacional === "AGUARDANDO_ENVIO" || item.status_operacional === "EM_MANUTENCAO").length} em aberto
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Sinalização abre o ciclo, envio inicia a manutenção e retorno encerra automaticamente a ocorrência.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!manutencaoEquipamentosAtivo && <Badge variant="outline" className="h-9 items-center border-muted-foreground/20 px-3 text-muted-foreground">Detalhamento desativado</Badge>}
            {manutencaoEquipamentosAtivo && <Button size="sm" variant="outline" onClick={abrirNovaManutencaoRetroativa}><Wrench className="mr-2 h-4 w-4" />Registrar retroativa</Button>}
          </div>
        </div>

        {!manutencaoEquipamentosAtivo && <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          O detalhamento de manutenção está desativado. Os ciclos continuam sendo criados, atualizados e encerrados pelas movimentações para preservar o histórico operacional.
        </div>}

        <div className="grid gap-3 lg:grid-cols-2">
          {manutencoesSelecionadas.map((manutencao) => {
            const stock = estoquePorId.get(manutencao.estoque_equipamento_id);
            const sinalizacao = manutencao.movimento_sinalizacao_id ? movimentacaoPorId.get(manutencao.movimento_sinalizacao_id) : undefined;
            const envio = manutencao.movimento_envio_id ? movimentacaoPorId.get(manutencao.movimento_envio_id) : undefined;
            const retorno = manutencao.movimento_retorno_id ? movimentacaoPorId.get(manutencao.movimento_retorno_id) : undefined;
            const statusClass =
              manutencao.status_operacional === "CONCLUIDA"
                ? "border-emerald-200 bg-emerald-50/50"
                : manutencao.status_operacional === "CANCELADA"
                  ? "border-red-200 bg-red-50/40"
                  : "border-orange-200 bg-orange-50/40";
            const detalhamentoPendente = manutencao.status_detalhamento !== "DETALHADA";
            return <div key={manutencao.id} className={`rounded-xl border p-4 ${statusClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{manutencaoEquipamentoTipoLabel(manutencao.tipo)}</Badge>
                    <Badge variant="outline">{manutencaoEquipamentoStatusLabel(manutencao.status_operacional)}</Badge>
                    <Badge variant="outline" className={detalhamentoPendente ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{manutencaoEquipamentoDetalhamentoLabel(manutencao.status_detalhamento)}</Badge>
                  </div>
                  <p className="mt-2 font-semibold">{manutencao.motivo}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stock ? (stock.identificacao || stock.patrimonio || stock.serial || `Registro ${stock.id.slice(0, 8)}`) : "Registro físico não localizado"}
                    {` · quantidade ${manutencao.quantidade}`}
                  </p>
                </div>
                {manutencaoEquipamentosAtivo && detalhamentoPendente && (
                  <Button variant="outline" size="sm" onClick={() => abrirEdicaoManutencao(manutencao)}><Pencil className="mr-2 h-3.5 w-3.5" />Detalhar</Button>
                )}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
                <div><span className="text-muted-foreground">Sinalização:</span> {sinalizacao?.data ? new Date(sinalizacao.data + "T00:00:00").toLocaleDateString("pt-BR") : new Date(manutencao.data_abertura + "T00:00:00").toLocaleDateString("pt-BR")}</div>
                <div><span className="text-muted-foreground">Envio:</span> {envio?.data ? new Date(envio.data + "T00:00:00").toLocaleDateString("pt-BR") : "Aguardando envio"}</div>
                <div><span className="text-muted-foreground">Previsão:</span> {manutencao.data_previsao_retorno ? new Date(manutencao.data_previsao_retorno + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</div>
                <div><span className="text-muted-foreground">Retorno:</span> {retorno?.data ? new Date(retorno.data + "T00:00:00").toLocaleDateString("pt-BR") : "Em aberto"}</div>
                <div><span className="text-muted-foreground">Origem:</span> {manutencao.origem === "AUTOMATICA" ? "Movimentação" : manutencao.origem === "RETROATIVA" ? "Retroativa" : "Manual"}</div>
                <div><span className="text-muted-foreground">Empresa:</span> {manutencao.empresa_id ? (empresaPorId.get(manutencao.empresa_id) ?? "Não localizada") : "Não informada"}</div>
              </div>

              {sinalizacao?.observacoes && <div className="mt-3 rounded-lg border bg-background/70 p-3 text-sm"><span className="font-medium">Relato na sinalização:</span> {sinalizacao.observacoes}</div>}
              {envio?.observacoes && <div className="mt-2 rounded-lg border bg-background/70 p-3 text-sm"><span className="font-medium">Observação do envio:</span> {envio.observacoes}</div>}
              {retorno?.observacoes && <div className="mt-2 rounded-lg border bg-background/70 p-3 text-sm"><span className="font-medium">Relato no retorno:</span> {retorno.observacoes}</div>}
              {manutencao.descricao_servico && <p className="mt-3 text-sm"><span className="font-medium">Serviço:</span> {manutencao.descricao_servico}</p>}
              {manutencao.resultado && <p className="mt-2 text-sm"><span className="font-medium">Resultado:</span> {manutencao.resultado}</p>}
              {manutencao.observacoes && <p className="mt-2 text-sm"><span className="font-medium">Detalhamento:</span> {manutencao.observacoes}</p>}
              {documentosEquipamentosAtivo && (() => {
                const vinculos = manutencaoDocumentos.get(manutencao.id) ?? [];
                const apropriado = apropriacoesFinanceiras
                  .filter((item) => item.manutencao_id === manutencao.id)
                  .reduce((total, item) => total + item.valor, 0);
                return <div className="mt-4 rounded-xl border bg-background/70 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">Documentos e custos</p>
                        <p className="text-xs text-muted-foreground">{vinculos.length} documento(s) vinculado(s){financeiroEquipamentosAtivo ? ` · ${apropriado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} apropriado` : ""}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => abrirDocumentosManutencao(manutencao)}>
                      <Link2 className="mr-2 h-3.5 w-3.5" />Gerenciar
                    </Button>
                  </div>
                  {vinculos.length > 0 && <div className="mt-3 space-y-2">
                    {vinculos.map((vinculo) => {
                      const documento = documentos.find((item) => item.id === vinculo.documento_id);
                      return <div key={vinculo.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{documento ? `${documento.tipo === "NOTA_FISCAL" ? "NF" : documento.tipo} ${documento.numero}` : `Documento ${vinculo.documento_id.slice(0, 8)}`}</p>
                          {documento?.valor_total != null && <p className="text-xs text-muted-foreground">{documento.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>}
                        </div>
                      </div>;
                    })}
                  </div>}
                </div>;
              })()}
            </div>;
          })}
        </div>
        {manutencoesSelecionadas.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma ocorrência de manutenção registrada para este equipamento. As próximas sinalizações criarão o ciclo automaticamente.</div>}
      </div>}
      <div className="space-y-3"><div><h3 className="font-semibold">Histórico de movimentações</h3><p className="text-sm text-muted-foreground">Histórico do equipamento, separado por registro físico.</p></div><div className="space-y-3">{estoqueSelecionado.map((e) => { const historico = movimentosPorEstoque.get(e.id) ?? []; const aberto = historicosAbertos.has(e.id); return <div key={e.id} className="rounded-lg border"><button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50" onClick={() => setHistoricosAbertos((atual) => { const proximo = new Set(atual); if (proximo.has(e.id)) proximo.delete(e.id); else proximo.add(e.id); return proximo; })}><div className="min-w-0"><div className="font-medium">{e.identificacao || e.patrimonio || e.serial || `Registro ${e.id.slice(0, 8)}`}</div><div className="mt-1 text-xs text-muted-foreground">{historico.length} {historico.length === 1 ? "movimentação registrada" : "movimentações registradas"}</div></div><div className="flex shrink-0 items-center gap-3"><Badge variant="outline">Saldo: {resumoPorEstoque.get(e.id)?.saldo ?? Math.max(0, e.quantidade - e.devolvido)}</Badge><ChevronDown className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} /></div></button>{aberto && <div className="border-t px-4"><div className="divide-y">{historico.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nenhuma movimentação registrada.</p> : historico.map((movimento) => { const visual = movimentacaoVisual(movimento.tipo); const Icon = visual.icon; return <div key={movimento.id} className="group grid gap-3 py-4 sm:grid-cols-[110px_1fr_auto] sm:items-start"><div className="pt-1 text-xs text-muted-foreground">{dataMovimentacao(movimento)}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${visual.badgeClass}`}><Icon className={`h-3.5 w-3.5 ${visual.iconClass}`} />{visual.label}</span><span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">Qtd. {movimento.quantidade}</span></div><div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="inline-flex items-center rounded-md border bg-background px-2 py-1">{rotuloParticipante(movimento.tipo_origem, movimento.origem_id)}</span><span className="text-muted-foreground">→</span><span className="inline-flex items-center rounded-md border bg-background px-2 py-1">{rotuloParticipante(movimento.tipo_destino, movimento.destino_id)}</span></div>{movimento.referencia_documento && <div className="mt-2 text-xs text-muted-foreground">Documento: {movimento.referencia_documento}</div>}{movimento.observacoes && <div className="mt-1 text-xs text-muted-foreground">{movimento.observacoes}</div>}</div></div>; })}</div></div>}</div>; })}</div></div>
    </div>}</DialogContent></Dialog>


    <Dialog open={Boolean(estoqueFinanceiroEditando)} onOpenChange={(open) => !open && setEstoqueFinanceiroEditando(null)}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />Financeiro do registro físico</DialogTitle></DialogHeader>{estoqueFinanceiroEditando && <div className="space-y-5 py-2"><div className="rounded-xl border bg-muted/30 p-4"><div className="font-semibold">{equipamentoDetalhe?.nome ?? "Equipamento"}</div><div className="mt-1 text-sm text-muted-foreground">{estoqueFinanceiroEditando.identificacao || estoqueFinanceiroEditando.patrimonio || estoqueFinanceiroEditando.serial || `Registro ${estoqueFinanceiroEditando.id.slice(0, 8)}`} · {vinculoLabel(estoqueFinanceiroEditando.vinculo)} · quantidade {estoqueFinanceiroEditando.quantidade}</div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Valor unitário efetivo</Label><Input type="number" min="0" step="0.01" value={estoqueFinanceiroFormulario.valor_unitario} onChange={(e) => setEstoqueFinanceiroFormulario((atual) => ({ ...atual, valor_unitario: e.target.value }))} placeholder="Usar valor padrão do cadastro" /><p className="text-xs text-muted-foreground">Deixe vazio para usar o valor padrão do cadastro.</p></div><div className="space-y-2"><Label>Custo recorrente unitário</Label><Input type="number" min="0" step="0.01" value={estoqueFinanceiroFormulario.custo_recorrente_unitario} onChange={(e) => setEstoqueFinanceiroFormulario((atual) => ({ ...atual, custo_recorrente_unitario: e.target.value }))} placeholder="Usar custo padrão" /><p className="text-xs text-muted-foreground">Deixe vazio para usar o custo padrão do cadastro.</p></div></div><div className="space-y-2"><Label>Periodicidade do custo recorrente</Label><Select value={estoqueFinanceiroFormulario.periodicidade_custo || "__padrao__"} onValueChange={(v) => setEstoqueFinanceiroFormulario((atual) => ({ ...atual, periodicidade_custo: v === "__padrao__" ? "" : v as EstoqueFormulario["periodicidade_custo"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__padrao__">Usar padrão do cadastro</SelectItem><SelectItem value="HORA">Por hora</SelectItem><SelectItem value="DIA">Por dia</SelectItem><SelectItem value="SEMANA">Por semana</SelectItem><SelectItem value="MES">Por mês</SelectItem><SelectItem value="ANO">Por ano</SelectItem></SelectContent></Select></div><div className="rounded-xl border bg-muted/20 p-4 text-sm"><div className="font-medium">Como será calculado</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><div><span className="text-muted-foreground">Valor do registro:</span> <strong>{(() => { const unit = resolverValorUnitario(equipamentoDetalhe!, estoqueFinanceiroEditando); return unit == null ? "—" : (unit * Math.max(0, estoqueFinanceiroEditando.quantidade)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); })()}</strong></div><div><span className="text-muted-foreground">Recorrente:</span> <strong>{(() => { const unit = resolverCustoRecorrenteUnitario(equipamentoDetalhe!, estoqueFinanceiroEditando); return unit == null ? "—" : (unit * Math.max(0, estoqueFinanceiroEditando.quantidade)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); })()}</strong></div></div></div></div>}<DialogFooter><Button variant="outline" onClick={() => setEstoqueFinanceiroEditando(null)} disabled={salvando}>Cancelar</Button><Button onClick={() => void salvarFinanceiroEstoque()} disabled={salvando}>{salvando ? "Salvando..." : "Salvar custos"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={dialogManutencao} onOpenChange={(open) => { if (!open) { setDialogManutencao(false); setManutencaoEditando(null); } }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-none max-h-[92vh] overflow-y-auto sm:w-[calc(100vw-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-orange-600" />Detalhar manutenção</DialogTitle>
        </DialogHeader>
        {manutencaoEditando && <div className="grid gap-4 py-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{manutencaoEquipamentoStatusLabel(manutencaoEditando.status_operacional)}</Badge>
              <Badge variant="outline">{manutencaoEquipamentoDetalhamentoLabel(manutencaoEditando.status_detalhamento)}</Badge>
              <Badge variant="outline">Qtd. {manutencaoEditando.quantidade}</Badge>
            </div>
            <p className="mt-2 font-semibold">{manutencaoEditando.motivo}</p>
            <p className="mt-1 text-xs text-muted-foreground">O estado operacional é controlado pelas movimentações. Aqui entram somente as informações complementares da ocorrência.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Tipo</Label><Select value={manutencaoFormulario.tipo} onValueChange={(v) => atualizarManutencao("tipo", v as ManutencaoEquipamentoTipo)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CORRETIVA">Corretiva</SelectItem><SelectItem value="PREVENTIVA">Preventiva</SelectItem><SelectItem value="INSPECAO">Inspeção</SelectItem><SelectItem value="OUTRA">Outra</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Empresa / oficina</Label><Select value={manutencaoFormulario.empresa_id || "__nenhuma__"} onValueChange={(v) => atualizarManutencao("empresa_id", v === "__nenhuma__" ? "" : v)}><SelectTrigger><SelectValue placeholder="Não informada" /></SelectTrigger><SelectContent><SelectItem value="__nenhuma__">Não informada</SelectItem>{empresas.map((empresa) => <SelectItem key={empresa.id} value={empresa.id}>{empresa.nome}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>Motivo / diagnóstico</Label><Input value={manutencaoFormulario.motivo} onChange={(e) => atualizarManutencao("motivo", e.target.value)} /></div>
          <div className="space-y-2"><Label>Serviço / descrição técnica</Label><textarea value={manutencaoFormulario.descricao_servico} onChange={(e) => atualizarManutencao("descricao_servico", e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Serviço executado, peças, diagnóstico ou outras informações técnicas..." /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Previsão de retorno</Label><Input type="date" value={manutencaoFormulario.data_previsao_retorno} onChange={(e) => atualizarManutencao("data_previsao_retorno", e.target.value)} /></div>
            <div className="rounded-xl border bg-muted/20 p-3 text-sm"><span className="font-medium">Ciclo:</span> {manutencaoEditando.data_abertura} → {manutencaoEditando.data_envio ?? "aguardando envio"} → {manutencaoEditando.data_retorno ?? "em aberto"}</div>
          </div>
          <div className="space-y-2"><Label>Resultado</Label><textarea value={manutencaoFormulario.resultado} onChange={(e) => atualizarManutencao("resultado", e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Conclusão técnica, causa identificada, condição de retorno..." /></div>
          <div className="space-y-2"><Label>Observações complementares</Label><textarea value={manutencaoFormulario.observacoes} onChange={(e) => atualizarManutencao("observacoes", e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Complemento ao que foi registrado nas movimentações..." /></div>
          <div className="rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground">Os relatos do operador nas movimentações de sinalização, envio e retorno continuam preservados como fonte operacional da ocorrência.</div>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => { setDialogManutencao(false); setManutencaoEditando(null); }} disabled={salvando}>Cancelar</Button><Button onClick={() => void salvarManutencaoDetalhamento()} disabled={salvando || !manutencaoEditando}>{salvando ? "Salvando..." : "Salvar detalhamento"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={dialogDocumentosManutencao} onOpenChange={(open) => { if (!open) { setDialogDocumentosManutencao(false); setDocumentosManutencaoEditando(null); } }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-none max-h-[92vh] overflow-y-auto sm:w-[calc(100vw-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Documentos e custos da manutenção</DialogTitle>
        </DialogHeader>
        {documentosManutencaoEditando && <div className="space-y-5 py-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="font-semibold">{documentosManutencaoEditando.motivo}</p>
            <p className="mt-1 text-xs text-muted-foreground">O vínculo documental preserva a evidência da manutenção. A apropriação financeira é um rateio separado do histórico físico.</p>
          </div>

          <section className="space-y-3">
            <div>
              <h3 className="font-semibold">Vincular documento</h3>
              <p className="text-xs text-muted-foreground">Um mesmo documento pode ser relacionado a mais de um equipamento.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={documentoSelecionadoId || "__nenhum__"} onValueChange={(v) => setDocumentoSelecionadoId(v === "__nenhum__" ? "" : v)}>
                <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Selecione um documento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">Selecione...</SelectItem>
                  {documentos.filter((documento) => !(manutencaoDocumentos.get(documentosManutencaoEditando.id) ?? []).some((vinculo) => vinculo.documento_id === documento.id)).map((documento) => (
                    <SelectItem key={documento.id} value={documento.id}>{documento.tipo === "NOTA_FISCAL" ? "NF" : documento.tipo} {documento.numero}{documento.serie ? ` · Série ${documento.serie}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void vincularDocumentoManutencao()} disabled={salvando || !documentoSelecionadoId}><Link2 className="mr-2 h-4 w-4" />Vincular</Button>
            </div>
            <div className="space-y-2">
              {(manutencaoDocumentos.get(documentosManutencaoEditando.id) ?? []).map((vinculo) => {
                const documento = documentos.find((item) => item.id === vinculo.documento_id);
                return <div key={vinculo.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{documento ? `${documento.tipo === "NOTA_FISCAL" ? "NF" : documento.tipo} ${documento.numero}` : vinculo.documento_id}</p><p className="text-xs text-muted-foreground">{documento?.empresa_id ? (empresaPorId.get(documento.empresa_id) ?? "Empresa não localizada") : "Sem empresa informada"}{documento?.valor_total != null ? ` · ${documento.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</p></div>
                  <Button variant="ghost" size="icon" title="Desvincular" disabled={salvando} onClick={() => void desvincularDocumentoManutencao(vinculo.id)}><Unlink2 className="h-4 w-4" /></Button>
                </div>;
              })}
              {(manutencaoDocumentos.get(documentosManutencaoEditando.id) ?? []).length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum documento vinculado.</p>}
            </div>
          </section>

          {financeiroEquipamentosAtivo && <section className="space-y-3 rounded-xl border bg-muted/10 p-4">
            <div>
              <h3 className="font-semibold">Apropriar custo</h3>
              <p className="text-xs text-muted-foreground">O valor apropriado fica vinculado ao documento e à ocorrência, mantendo o rateio auditável.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Documento</Label><Select value={apropriacaoDocumentoId || "__nenhum__"} onValueChange={(v) => void selecionarDocumentoParaApropriacao(v === "__nenhum__" ? "" : v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent><SelectItem value="__nenhum__">Selecione...</SelectItem>{(manutencaoDocumentos.get(documentosManutencaoEditando.id) ?? []).map((vinculo) => { const documento = documentos.find((item) => item.id === vinculo.documento_id); return documento ? <SelectItem key={documento.id} value={documento.id}>{documento.tipo === "NOTA_FISCAL" ? "NF" : documento.tipo} {documento.numero}</SelectItem> : null; })}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Item do documento</Label><Select value={apropriacaoDocumentoItemId || "__documento__"} onValueChange={(v) => setApropriacaoDocumentoItemId(v === "__documento__" ? "" : v)} disabled={!apropriacaoDocumentoId}><SelectTrigger><SelectValue placeholder="Documento inteiro" /></SelectTrigger><SelectContent><SelectItem value="__documento__">Documento inteiro</SelectItem>{apropriacaoDocumentosItens.map((item) => <SelectItem key={item.id} value={item.id}>{item.descricao}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1 space-y-2"><Label>Valor apropriado *</Label><Input type="number" min="0.01" step="0.01" value={valorApropriacao} onChange={(e) => setValorApropriacao(e.target.value)} placeholder="0,00" /></div><Button onClick={() => void criarApropriacaoFinanceira()} disabled={salvando || !apropriacaoDocumentoId}><DollarSign className="mr-2 h-4 w-4" />Apropriar</Button></div>
            <div className="space-y-2">
              {apropriacoesFinanceiras.filter((item) => item.manutencao_id === documentosManutencaoEditando.id).map((item) => {
                const documento = documentos.find((doc) => doc.id === item.documento_id);
                return <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"><div><p className="text-sm font-medium">{item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p><p className="text-xs text-muted-foreground">{documento ? `${documento.tipo === "NOTA_FISCAL" ? "NF" : documento.tipo} ${documento.numero}` : item.documento_id}</p></div><Button variant="ghost" size="icon" title="Remover apropriação" disabled={salvando} onClick={() => void removerApropriacaoFinanceira(item.id)}><Trash2 className="h-4 w-4" /></Button></div>;
              })}
              {apropriacoesFinanceiras.filter((item) => item.manutencao_id === documentosManutencaoEditando.id).length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum custo apropriado nesta ocorrência.</p>}
            </div>
          </section>}
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => { setDialogDocumentosManutencao(false); setDocumentosManutencaoEditando(null); }} disabled={salvando}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={dialogManutencaoRetroativa} onOpenChange={(open) => { if (!open) setDialogManutencaoRetroativa(false); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-none max-h-[92vh] overflow-y-auto sm:w-[calc(100vw-2rem)] sm:max-w-3xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-orange-600" />Registrar ocorrência retroativa</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">Use esta opção para registrar ciclos antigos que ocorreram antes da adoção do detalhamento. O vínculo com movimentações continua opcional.</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Registro físico *</Label><Select value={manutencaoRetroativaFormulario.estoque_equipamento_id} onValueChange={(v) => atualizarManutencaoRetroativa("estoque_equipamento_id", v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{estoqueSelecionado.filter((stock) => stock.ativo !== false).map((stock) => <SelectItem key={stock.id} value={stock.id}>{stock.identificacao || stock.patrimonio || stock.serial || stock.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Quantidade *</Label><Input type="number" min={1} step={1} value={manutencaoRetroativaFormulario.quantidade} onChange={(e) => atualizarManutencaoRetroativa("quantidade", e.target.value)} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Tipo</Label><Select value={manutencaoRetroativaFormulario.tipo} onValueChange={(v) => atualizarManutencaoRetroativa("tipo", v as ManutencaoEquipamentoTipo)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CORRETIVA">Corretiva</SelectItem><SelectItem value="PREVENTIVA">Preventiva</SelectItem><SelectItem value="INSPECAO">Inspeção</SelectItem><SelectItem value="OUTRA">Outra</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Empresa / oficina</Label><Select value={manutencaoRetroativaFormulario.empresa_id || "__nenhuma__"} onValueChange={(v) => atualizarManutencaoRetroativa("empresa_id", v === "__nenhuma__" ? "" : v)}><SelectTrigger><SelectValue placeholder="Não informada" /></SelectTrigger><SelectContent><SelectItem value="__nenhuma__">Não informada</SelectItem>{empresas.map((empresa) => <SelectItem key={empresa.id} value={empresa.id}>{empresa.nome}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>Motivo *</Label><Input value={manutencaoRetroativaFormulario.motivo} onChange={(e) => atualizarManutencaoRetroativa("motivo", e.target.value)} placeholder="Ex.: revisão, defeito, reparo..." /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label>Abertura *</Label><Input type="date" value={manutencaoRetroativaFormulario.data_abertura} onChange={(e) => atualizarManutencaoRetroativa("data_abertura", e.target.value)} /></div>
            <div className="space-y-2"><Label>Envio</Label><Input type="date" value={manutencaoRetroativaFormulario.data_envio} onChange={(e) => atualizarManutencaoRetroativa("data_envio", e.target.value)} /></div>
            <div className="space-y-2"><Label>Retorno</Label><Input type="date" value={manutencaoRetroativaFormulario.data_retorno} onChange={(e) => atualizarManutencaoRetroativa("data_retorno", e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Previsão de retorno</Label><Input type="date" value={manutencaoRetroativaFormulario.data_previsao_retorno} onChange={(e) => atualizarManutencaoRetroativa("data_previsao_retorno", e.target.value)} /></div>
          <div className="space-y-2"><Label>Serviço / descrição técnica</Label><textarea value={manutencaoRetroativaFormulario.descricao_servico} onChange={(e) => atualizarManutencaoRetroativa("descricao_servico", e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
          <div className="space-y-2"><Label>Resultado</Label><textarea value={manutencaoRetroativaFormulario.resultado} onChange={(e) => atualizarManutencaoRetroativa("resultado", e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
          <div className="space-y-2"><Label>Observações</Label><textarea value={manutencaoRetroativaFormulario.observacoes} onChange={(e) => atualizarManutencaoRetroativa("observacoes", e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogManutencaoRetroativa(false)} disabled={salvando}>Cancelar</Button><Button onClick={() => void salvarManutencaoRetroativa()} disabled={salvando}>{salvando ? "Registrando..." : "Registrar ocorrência"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={dialogNovaCategoria} onOpenChange={setDialogNovaCategoria}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Nova categoria de equipamento</DialogTitle></DialogHeader><div className="space-y-2 py-2"><Label>Nome da categoria</Label><Input value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void criarCategoria(); } }} /></div><DialogFooter><Button variant="outline" onClick={() => setDialogNovaCategoria(false)}>Cancelar</Button><Button onClick={() => void criarCategoria()} disabled={salvando}>{salvando ? "Criando..." : "Criar categoria"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={dialogAberto} onOpenChange={setDialogAberto}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editando ? "Editar equipamento" : "Novo equipamento"}</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><div className="space-y-2"><Label>Nome *</Label><Input value={formulario.nome} onChange={(e) => atualizarCampo("nome", e.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Categoria *</Label><Select value={formulario.categoria_id} onValueChange={(v) => { if (v === "__nova__") { setNovaCategoria(""); setDialogNovaCategoria(true); } else atualizarCampo("categoria_id", v); }}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}<SelectItem value="__nova__">+ Nova categoria</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Tipo de controle *</Label><Select value={formulario.tipo_controle} onValueChange={(v) => atualizarCampo("tipo_controle", v as EquipamentoTipoControle)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INDIVIDUAL">Individual</SelectItem><SelectItem value="QUANTITATIVO">Quantitativo</SelectItem></SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Marca</Label><Input value={formulario.marca} onChange={(e) => atualizarCampo("marca", e.target.value)} /></div><div className="space-y-2"><Label>Modelo</Label><Input value={formulario.modelo} onChange={(e) => atualizarCampo("modelo", e.target.value)} /></div></div><div className="space-y-2"><Label>Descrição</Label><textarea value={formulario.descricao} onChange={(e) => atualizarCampo("descricao", e.target.value)} rows={4} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" /></div>{financeiroEquipamentosAtivo && <div className="rounded-xl border bg-muted/20 p-4"><div className="mb-3"><p className="text-sm font-semibold">Parâmetros financeiros padrão</p><p className="mt-1 text-xs text-muted-foreground">Servem como referência para as unidades deste cadastro. Podem ser sobrescritos no estoque físico.</p></div><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Valor de referência</Label><Input type="number" min="0" step="0.01" value={formulario.valor_referencia} onChange={(e) => atualizarCampo("valor_referencia", e.target.value)} placeholder="0,00" /></div><div className="space-y-2"><Label>Custo recorrente</Label><Input type="number" min="0" step="0.01" value={formulario.custo_recorrente} onChange={(e) => atualizarCampo("custo_recorrente", e.target.value)} placeholder="0,00" /></div><div className="space-y-2"><Label>Periodicidade</Label><Select value={formulario.periodicidade_custo || "__nenhuma__"} onValueChange={(v) => atualizarCampo("periodicidade_custo", v === "__nenhuma__" ? "" : v as Formulario["periodicidade_custo"])}><SelectTrigger><SelectValue placeholder="Sem periodicidade" /></SelectTrigger><SelectContent><SelectItem value="__nenhuma__">Sem periodicidade</SelectItem><SelectItem value="HORA">Por hora</SelectItem><SelectItem value="DIA">Por dia</SelectItem><SelectItem value="SEMANA">Por semana</SelectItem><SelectItem value="MES">Por mês</SelectItem><SelectItem value="ANO">Por ano</SelectItem></SelectContent></Select></div></div></div>}</div><DialogFooter><Button variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button><Button onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : "Salvar equipamento"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={dialogEstoque} onOpenChange={setDialogEstoque}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Adicionar equipamento ao estoque</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><div className="space-y-2"><Label>Equipamento *</Label><Select value={estoqueFormulario.equipamento_id} onValueChange={(v) => atualizarEstoque("equipamento_id", v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{equipamentos.filter((e) => e.ativo !== false).map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Empresa proprietária *</Label><Select value={estoqueFormulario.empresa_id} onValueChange={(v) => atualizarEstoque("empresa_id", v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Vínculo *</Label><Select value={estoqueFormulario.vinculo} onValueChange={(v) => atualizarEstoque("vinculo", v as EquipamentoVinculo)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PROPRIO">Próprio</SelectItem><SelectItem value="ALUGADO">Alugado</SelectItem><SelectItem value="EMPRESTIMO">Empréstimo</SelectItem></SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Quantidade *</Label><Input type="number" min={1} step={1} disabled={equipamentos.find((e) => e.id === estoqueFormulario.equipamento_id)?.tipo_controle === "INDIVIDUAL"} value={estoqueFormulario.quantidade} onChange={(e) => atualizarEstoque("quantidade", e.target.value)} /></div><div className="space-y-2"><Label>Equipe de destino</Label><Select value={estoqueFormulario.equipe_id || "__projeto__"} onValueChange={(v) => atualizarEstoque("equipe_id", v === "__projeto__" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__projeto__">Projeto inteiro</SelectItem>{equipes.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Patrimônio</Label><Input value={estoqueFormulario.patrimonio} onChange={(e) => atualizarEstoque("patrimonio", e.target.value)} /></div><div className="space-y-2"><Label>Identificação</Label><Input value={estoqueFormulario.identificacao} onChange={(e) => atualizarEstoque("identificacao", e.target.value)} /></div><div className="space-y-2"><Label>Serial</Label><Input value={estoqueFormulario.serial} onChange={(e) => atualizarEstoque("serial", e.target.value)} /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Data de entrada *</Label><Input type="date" value={estoqueFormulario.data_entrada} onChange={(e) => atualizarEstoque("data_entrada", e.target.value)} /></div><div className="space-y-2"><Label>Documento de referência</Label><Input value={estoqueFormulario.referencia_documento} onChange={(e) => atualizarEstoque("referencia_documento", e.target.value)} /></div></div>{financeiroEquipamentosAtivo && <div className="rounded-xl border bg-muted/20 p-4"><div className="mb-3"><p className="text-sm font-semibold">Parâmetros financeiros da unidade/lote</p><p className="mt-1 text-xs text-muted-foreground">Preencha apenas quando o valor ou custo desta unidade for diferente do padrão do cadastro.</p></div><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Valor unitário</Label><Input type="number" min="0" step="0.01" value={estoqueFormulario.valor_unitario} onChange={(e) => atualizarEstoque("valor_unitario", e.target.value)} placeholder="Usar padrão" /></div><div className="space-y-2"><Label>Custo recorrente unitário</Label><Input type="number" min="0" step="0.01" value={estoqueFormulario.custo_recorrente_unitario} onChange={(e) => atualizarEstoque("custo_recorrente_unitario", e.target.value)} placeholder="Usar padrão" /></div><div className="space-y-2"><Label>Periodicidade</Label><Select value={estoqueFormulario.periodicidade_custo || "__nenhuma__"} onValueChange={(v) => atualizarEstoque("periodicidade_custo", v === "__nenhuma__" ? "" : v as EstoqueFormulario["periodicidade_custo"])}><SelectTrigger><SelectValue placeholder="Usar padrão" /></SelectTrigger><SelectContent><SelectItem value="__nenhuma__">Usar padrão</SelectItem><SelectItem value="HORA">Por hora</SelectItem><SelectItem value="DIA">Por dia</SelectItem><SelectItem value="SEMANA">Por semana</SelectItem><SelectItem value="MES">Por mês</SelectItem><SelectItem value="ANO">Por ano</SelectItem></SelectContent></Select></div></div></div>}<div className="space-y-2"><Label>Observações</Label><textarea value={estoqueFormulario.observacoes} onChange={(e) => atualizarEstoque("observacoes", e.target.value)} rows={4} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogEstoque(false)}>Cancelar</Button><Button onClick={() => void salvarEstoque()} disabled={salvando}>{salvando ? "Registrando entrada..." : "Registrar entrada"}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

