import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Eye,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Trash2,
  ChevronDown,
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
import { getDB } from "@/db/db";
import { equipamentosRepo } from "@/services/equipamentos/repo";
import { categoriasEquipamentosRepo } from "@/services/equipamentos/categorias-repo";
import { estoqueEquipamentosRepo } from "@/services/equipamentos/estoque-repo";
import { movimentacoesEquipamentosRepo } from "@/services/equipamentos/movimentacoes-repo";

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
};

type EstoqueEquipamentoUI = EstoqueEquipamento & { ativo?: boolean };

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
};

const formularioInicial: Formulario = {
  nome: "",
  categoria_id: "",
  tipo_controle: "INDIVIDUAL",
  marca: "",
  modelo: "",
  descricao: "",
};

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
  };
}

function EquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [estoques, setEstoques] = useState<EstoqueEquipamentoUI[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEquipamento[]>([]);
  const [categorias, setCategorias] = useState<CategoriaEquipamento[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
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

  async function carregar() {
    if (!projetoId) return;
    const db = getDB();
    const [
      equipamentosData,
      estoquesData,
      movimentacoesData,
      categoriasData,
      empresasData,
      equipesData,
      funcionariosData,
    ] = await Promise.all([
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.movimentacoes_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      categoriasEquipamentosRepo.listar(projetoId),
      db.empresas.where("projeto_id").equals(projetoId).filter((e) => e.ativo).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).filter((e) => e.ativo).toArray(),
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
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
    setCategorias(categoriasData.filter((c) => c.ativo));
    setEmpresas(empresasData);
    setEquipes(equipesData);
    setFuncionarios(funcionariosData);
  }

  useEffect(() => { void carregar(); }, [projetoId]);

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
      const quantidade = Math.max(0, estoque.quantidade - (estoque.devolvido ?? 0));
      resultado.set(estoque.id, {
        quantidade,
        saldo: quantidade,
        almoxarifado: quantidade,
        manutencao: 0,
        apropriado: 0,
        disponivel: quantidade,
      });
    }

    const movimentos = [...movimentacoes].sort((a, b) =>
      a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em),
    );

    for (const movimento of movimentos) {
      const estado = resultado.get(movimento.estoque_equipamento_id);
      if (!estado) continue;
      const q = Math.max(0, movimento.quantidade);

      const retirarDaOrigem = (parte: MovimentacaoEquipamento["tipo_origem"], id: string) => {
        if (parte === "EQUIPE") {
          const equipe = equipes.find((item) => item.id === id);
          const nome = equipe?.nome.trim().toLowerCase();
          if (nome === "almoxarifado") estado.almoxarifado = Math.max(0, estado.almoxarifado - q);
          if (nome === "manutenção") estado.manutencao = Math.max(0, estado.manutencao - q);
        } else if (parte === "FUNCIONARIO") {
          estado.apropriado = Math.max(0, estado.apropriado - q);
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

      if (movimento.tipo === "ENTRADA") continue;
      if (movimento.tipo === "DEVOLUCAO_FORNECEDOR") {
        // devolvido já está refletido em estoque.devolvido; não descontar novamente.
        continue;
      }

      retirarDaOrigem(movimento.tipo_origem, movimento.origem_id);
      adicionarAoDestino(movimento.tipo_destino, movimento.destino_id);
    }

    for (const estado of resultado.values()) {
      estado.disponivel = Math.max(0, estado.almoxarifado);
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
    setFormulario({ nome: e.nome, categoria_id: e.categoria_id, tipo_controle: e.tipo_controle, marca: e.marca ?? "", modelo: e.modelo ?? "", descricao: e.descricao ?? "" });
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
    if (!formulario.nome.trim()) return toast.error("Informe o nome do equipamento.");
    if (!formulario.categoria_id) return toast.error("Selecione a categoria.");
    try {
      setSalvando(true);
      await equipamentosRepo.salvar(projetoId, { ...(editando ? { id: editando.id } : {}), categoria_id: formulario.categoria_id, nome: formulario.nome.trim(), tipo_controle: formulario.tipo_controle, modelo: formulario.modelo.trim() || null, marca: formulario.marca.trim() || null, descricao: formulario.descricao.trim() || null, ativo: editando?.ativo ?? true });
      await carregar(); setDialogAberto(false); setEditando(null);
      toast.success(editando ? "Equipamento atualizado." : "Equipamento cadastrado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o equipamento."); }
    finally { setSalvando(false); }
  }

  async function salvarEstoque() {
    if (!projetoId) return;
    if (!estoqueFormulario.equipamento_id) return toast.error("Selecione o equipamento do cadastro.");
    if (!estoqueFormulario.empresa_id) return toast.error("Selecione a empresa proprietária.");
    if (!estoqueFormulario.data_entrada) return toast.error("Informe a data de entrada.");

    const equipamento = equipamentos.find((e) => e.id === estoqueFormulario.equipamento_id);
    if (!equipamento) return toast.error("Equipamento cadastrado não encontrado.");
    if (equipamento.ativo === false) return toast.error("Este equipamento está inativo. Ative o cadastro antes de adicionar ao estoque.");

    const quantidade = equipamento.tipo_controle === "INDIVIDUAL"
      ? 1
      : Number(estoqueFormulario.quantidade);

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return toast.error("Informe uma quantidade válida.");
    }

    if (equipamento.tipo_controle === "QUANTITATIVO" && !Number.isInteger(quantidade)) {
      return toast.error("A quantidade deve ser inteira.");
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
    } finally {
      setSalvando(false);
    }
  }

  async function criarCategoria() {
    if (!projetoId || !novaCategoria.trim()) return toast.error("Informe o nome da categoria.");
    try {
      setSalvando(true);
      const categoria = await categoriasEquipamentosRepo.salvar(projetoId, { nome: novaCategoria.trim(), ativo: true });
      setCategorias((atual) => [...atual, categoria]); atualizarCampo("categoria_id", categoria.id); setNovaCategoria(""); setDialogNovaCategoria(false); toast.success("Categoria criada.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível criar a categoria."); }
    finally { setSalvando(false); }
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
      lista.sort((a, b) => a.data.localeCompare(b.data) || a.criado_em.localeCompare(b.criado_em));
    }
    return mapa;
  }, [movimentacoes]);

  type AlocacaoAtual = {
    tipo: "EQUIPE" | "FUNCIONARIO" | "EMPRESA";
    id: string;
    quantidade: number;
  };

  const alocacoesAtuais = useMemo(() => {
    const resultado = new Map<string, AlocacaoAtual[]>();

    for (const estoque of estoques) {
      if (estoque.ativo === false) continue;
      const locais = new Map<string, AlocacaoAtual>();
      const almoxarifado = equipes.find((e) => e.nome.trim().toLowerCase() === "almoxarifado");
      if (almoxarifado && estoque.quantidade > 0) {
        locais.set(`EQUIPE:${almoxarifado.id}`, { tipo: "EQUIPE", id: almoxarifado.id, quantidade: estoque.quantidade });
      }

      for (const movimento of movimentosPorEstoque.get(estoque.id) ?? []) {
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
  }, [estoques, equipes, movimentosPorEstoque]);

  const rotuloLocal = (alocacao: AlocacaoAtual) => {
    if (alocacao.tipo === "FUNCIONARIO") {
      const funcionario = funcionarioPorId.get(alocacao.id);
      return funcionario ? `Funcionário: ${funcionario.nome}${funcionario.matricula ? ` — ${funcionario.matricula}` : ""}` : "Funcionário não localizado";
    }
    if (alocacao.tipo === "EMPRESA") return `Empresa: ${empresaPorId.get(alocacao.id) ?? "não localizada"}`;
    return `Equipe: ${equipePorId.get(alocacao.id) ?? "não localizada"}`;
  };

  const rotuloParticipante = (tipo: MovimentacaoEquipamento["tipo_origem"], id: string) => {
    if (tipo === "FUNCIONARIO") {
      const funcionario = funcionarioPorId.get(id);
      return funcionario ? funcionario.nome : "Funcionário não localizado";
    }
    if (tipo === "EMPRESA") return empresaPorId.get(id) ?? "Empresa não localizada";
    return equipePorId.get(id) ?? "Equipe não localizada";
  };

  const dataMovimentacao = (data: string) => {
    const [ano, mes, dia] = data.split("-");
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
  };

  if (!projetoId) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum projeto ativo selecionado.</CardContent></Card>;

  return <>
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Equipamentos</h1><p className="text-sm text-muted-foreground">Cadastros de equipamentos e registros físicos de estoque.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => abrirNovoEstoque()}><ClipboardList className="mr-2 h-4 w-4" />Adicionar ao estoque</Button><Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" />Novo equipamento</Button></div>
      </div>
      <Card><CardHeader><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar equipamento..." className="pl-9" /></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="px-3 py-3 font-medium">Equipamento</th><th className="px-3 py-3 font-medium">Categoria</th><th className="px-3 py-3 font-medium">Controle</th><th className="px-3 py-3 font-medium">Saldo</th><th className="px-3 py-3 font-medium">Almox.</th><th className="px-3 py-3 font-medium">Em uso</th><th className="px-3 py-3 font-medium">Manut.</th><th className="px-3 py-3 font-medium">Registros</th><th className="px-3 py-3 font-medium">Ativo</th><th className="px-3 py-3 text-right font-medium">Ações</th></tr></thead><tbody>
      {filtrados.map((e) => { const registros = estoquePorEquipamento.get(e.id) ?? []; return <tr key={e.id} className="border-b last:border-0"><td className="px-3 py-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><Box className="h-4 w-4" /></div><div><div className="font-medium">{e.nome}</div>{(e.marca || e.modelo) && <div className="text-xs text-muted-foreground">{[e.marca, e.modelo].filter(Boolean).join(" • ")}</div>}</div></div></td><td className="px-3 py-3">{categoriaPorId.get(e.categoria_id) ?? "—"}</td><td className="px-3 py-3"><Badge variant="secondary">{e.tipo_controle === "INDIVIDUAL" ? "Individual" : "Quantitativo"}</Badge></td><td className="px-3 py-3 font-medium">{saldoTotal(e.id)}</td><td className="px-3 py-3">{almoxarifadoTotal(e.id)}</td><td className="px-3 py-3">{apropriadoTotal(e.id)}</td><td className="px-3 py-3">{manutencaoTotal(e.id)}</td><td className="px-3 py-3"><Badge variant="outline">{registros.length}</Badge></td><td className="px-3 py-3">
            <label className="inline-flex cursor-pointer items-center gap-2" title={e.ativo === false ? "Ativar equipamento" : "Desativar equipamento"}>
              <input type="checkbox" checked={e.ativo !== false} onChange={() => void alternarAtivo(e)} className="h-4 w-4 cursor-pointer rounded border-input accent-primary" />
              <span className="text-xs text-muted-foreground">{e.ativo === false ? "Inativo" : "Ativo"}</span>
            </label>
          </td><td className="px-3 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Detalhes" onClick={() => void abrirDetalhes(e)}><Eye className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Adicionar estoque" onClick={() => abrirNovoEstoque(e)}><Plus className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Editar" onClick={() => abrirEdicao(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Excluir" onClick={() => void excluir(e)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>; })}
      {filtrados.length === 0 && <tr><td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">{busca ? "Nenhum equipamento encontrado." : "Nenhum equipamento cadastrado."}</td></tr>}
      </tbody></table></div></CardContent></Card>
    </div>

    <Dialog open={Boolean(equipamentoDetalhe)} onOpenChange={(open) => !open && setEquipamentoDetalhe(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>Detalhes do equipamento</DialogTitle></DialogHeader>{equipamentoDetalhe && <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-semibold">{equipamentoDetalhe.nome}</h2><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{categoriaPorId.get(equipamentoDetalhe.categoria_id) ?? "Sem categoria"}</Badge><Badge variant="outline">{equipamentoDetalhe.tipo_controle === "INDIVIDUAL" ? "Controle individual" : "Controle quantitativo"}</Badge><Badge variant={equipamentoDetalhe.ativo === false ? "outline" : "secondary"}>{equipamentoDetalhe.ativo === false ? "Inativo" : "Ativo"}</Badge></div><p className="mt-3 text-sm text-muted-foreground">{[equipamentoDetalhe.marca, equipamentoDetalhe.modelo].filter(Boolean).join(" • ") || "Marca/modelo não informados"}</p>{equipamentoDetalhe.descricao && <p className="mt-2 max-w-3xl text-sm">{equipamentoDetalhe.descricao}</p>}</div><Button onClick={() => abrirNovoEstoque(equipamentoDetalhe)} disabled={equipamentoDetalhe.ativo === false}><Plus className="mr-2 h-4 w-4" />Adicionar estoque</Button></div></div>
      <div className="grid gap-3 sm:grid-cols-5"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Saldo</p><p className="mt-1 text-xl font-semibold">{saldoTotal(equipamentoDetalhe.id)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Almoxarifado</p><p className="mt-1 text-xl font-semibold">{almoxarifadoTotal(equipamentoDetalhe.id)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Em uso</p><p className="mt-1 text-xl font-semibold">{apropriadoTotal(equipamentoDetalhe.id)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Manutenção</p><p className="mt-1 text-xl font-semibold">{manutencaoTotal(equipamentoDetalhe.id)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Registros físicos</p><p className="mt-1 text-xl font-semibold">{estoqueSelecionado.length}</p></div></div>
      <div className="space-y-3"><div><h3 className="font-semibold">Estoque físico</h3><p className="text-sm text-muted-foreground">Cada linha representa um registro físico independente.</p></div><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/30 text-left"><th className="px-3 py-3">Proprietário</th><th className="px-3 py-3">Vínculo</th><th className="px-3 py-3">Localização atual</th><th className="px-3 py-3">Identificação</th><th className="px-3 py-3">Serial</th><th className="px-3 py-3">Patrimônio</th><th className="px-3 py-3">Saldo</th><th className="px-3 py-3">Ativo</th></tr></thead><tbody>{estoqueSelecionado.map((e) => <tr key={e.id} className="border-b last:border-0 align-top"><td className="px-3 py-3">{empresaPorId.get(e.empresa_id) ?? "—"}</td><td className="px-3 py-3">{vinculoLabel(e.vinculo)}</td><td className="px-3 py-3"><div className="space-y-1">{(alocacoesAtuais.get(e.id) ?? []).map((local) => <div key={`${local.tipo}:${local.id}`}><span>{rotuloLocal(local)}</span><span className="ml-2 text-xs text-muted-foreground">({local.quantidade})</span></div>)}{(alocacoesAtuais.get(e.id) ?? []).length === 0 && <span className="text-muted-foreground">Sem localização atual</span>}</div></td><td className="px-3 py-3">{e.identificacao ?? "—"}</td><td className="px-3 py-3">{e.serial ?? "—"}</td><td className="px-3 py-3">{e.patrimonio ?? "—"}</td><td className="px-3 py-3 font-medium">{e.quantidade - e.devolvido}</td><td className="px-3 py-3"><label className="inline-flex cursor-pointer items-center gap-2" title={e.ativo === false ? "Ativar registro" : "Desativar registro"}><input type="checkbox" checked={e.ativo !== false} onChange={() => void alternarEstoqueAtivo(e)} className="h-4 w-4 cursor-pointer rounded border-input accent-primary" /><span className="text-xs text-muted-foreground">{e.ativo === false ? "Inativo" : "Ativo"}</span></label></td></tr>)}{estoqueSelecionado.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum registro de estoque.</td></tr>}</tbody></table></div></div>
      <div className="space-y-3"><div><h3 className="font-semibold">Histórico de movimentações</h3><p className="text-sm text-muted-foreground">Histórico do equipamento, separado por registro físico.</p></div><div className="space-y-3">{estoqueSelecionado.map((e) => { const historico = movimentosPorEstoque.get(e.id) ?? []; const aberto = historicosAbertos.has(e.id); return <div key={e.id} className="rounded-lg border"><button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50" onClick={() => setHistoricosAbertos((atual) => { const proximo = new Set(atual); if (proximo.has(e.id)) proximo.delete(e.id); else proximo.add(e.id); return proximo; })}><div className="min-w-0"><div className="font-medium">{e.identificacao || e.patrimonio || e.serial || `Registro ${e.id.slice(0, 8)}`}</div><div className="mt-1 text-xs text-muted-foreground">{historico.length} {historico.length === 1 ? "movimentação registrada" : "movimentações registradas"}</div></div><div className="flex shrink-0 items-center gap-3"><Badge variant="outline">Saldo: {e.quantidade - e.devolvido}</Badge><ChevronDown className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} /></div></button>{aberto && <div className="border-t px-4"><div className="divide-y">{historico.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nenhuma movimentação registrada.</p> : historico.map((movimento) => <div key={movimento.id} className="grid gap-2 py-3 sm:grid-cols-[110px_1fr_auto] sm:items-start"><div className="text-xs text-muted-foreground">{dataMovimentacao(movimento.data)}</div><div><div className="font-medium">{movimento.tipo}</div><div className="text-sm text-muted-foreground">{rotuloParticipante(movimento.tipo_origem, movimento.origem_id)} <span className="mx-1">→</span> {rotuloParticipante(movimento.tipo_destino, movimento.destino_id)}</div>{movimento.referencia_documento && <div className="mt-1 text-xs text-muted-foreground">Documento: {movimento.referencia_documento}</div>}{movimento.observacoes && <div className="mt-1 text-xs text-muted-foreground">{movimento.observacoes}</div>}</div><div className="text-sm font-medium sm:text-right">Qtd. {movimento.quantidade}</div></div>)}</div></div>}</div>; })}</div></div>
    </div>}</DialogContent></Dialog>

    <Dialog open={dialogNovaCategoria} onOpenChange={setDialogNovaCategoria}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Nova categoria de equipamento</DialogTitle></DialogHeader><div className="space-y-2 py-2"><Label>Nome da categoria</Label><Input value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void criarCategoria(); } }} /></div><DialogFooter><Button variant="outline" onClick={() => setDialogNovaCategoria(false)}>Cancelar</Button><Button onClick={() => void criarCategoria()} disabled={salvando}>{salvando ? "Criando..." : "Criar categoria"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={dialogAberto} onOpenChange={setDialogAberto}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editando ? "Editar equipamento" : "Novo equipamento"}</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><div className="space-y-2"><Label>Nome *</Label><Input value={formulario.nome} onChange={(e) => atualizarCampo("nome", e.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Categoria *</Label><Select value={formulario.categoria_id} onValueChange={(v) => { if (v === "__nova__") { setNovaCategoria(""); setDialogNovaCategoria(true); } else atualizarCampo("categoria_id", v); }}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}<SelectItem value="__nova__">+ Nova categoria</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Tipo de controle *</Label><Select value={formulario.tipo_controle} onValueChange={(v) => atualizarCampo("tipo_controle", v as EquipamentoTipoControle)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INDIVIDUAL">Individual</SelectItem><SelectItem value="QUANTITATIVO">Quantitativo</SelectItem></SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Marca</Label><Input value={formulario.marca} onChange={(e) => atualizarCampo("marca", e.target.value)} /></div><div className="space-y-2"><Label>Modelo</Label><Input value={formulario.modelo} onChange={(e) => atualizarCampo("modelo", e.target.value)} /></div></div><div className="space-y-2"><Label>Descrição</Label><textarea value={formulario.descricao} onChange={(e) => atualizarCampo("descricao", e.target.value)} rows={4} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button><Button onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : "Salvar equipamento"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={dialogEstoque} onOpenChange={setDialogEstoque}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Adicionar equipamento ao estoque</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><div className="space-y-2"><Label>Equipamento *</Label><Select value={estoqueFormulario.equipamento_id} onValueChange={(v) => atualizarEstoque("equipamento_id", v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{equipamentos.filter((e) => e.ativo !== false).map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Empresa proprietária *</Label><Select value={estoqueFormulario.empresa_id} onValueChange={(v) => atualizarEstoque("empresa_id", v)}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>{empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Vínculo *</Label><Select value={estoqueFormulario.vinculo} onValueChange={(v) => atualizarEstoque("vinculo", v as EquipamentoVinculo)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PROPRIO">Próprio</SelectItem><SelectItem value="ALUGADO">Alugado</SelectItem><SelectItem value="EMPRESTIMO">Empréstimo</SelectItem></SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Quantidade *</Label><Input type="number" min={1} step={1} disabled={equipamentos.find((e) => e.id === estoqueFormulario.equipamento_id)?.tipo_controle === "INDIVIDUAL"} value={estoqueFormulario.quantidade} onChange={(e) => atualizarEstoque("quantidade", e.target.value)} /></div><div className="space-y-2"><Label>Equipe de destino</Label><Select value={estoqueFormulario.equipe_id || "__projeto__"} onValueChange={(v) => atualizarEstoque("equipe_id", v === "__projeto__" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__projeto__">Projeto inteiro</SelectItem>{equipes.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Patrimônio</Label><Input value={estoqueFormulario.patrimonio} onChange={(e) => atualizarEstoque("patrimonio", e.target.value)} /></div><div className="space-y-2"><Label>Identificação</Label><Input value={estoqueFormulario.identificacao} onChange={(e) => atualizarEstoque("identificacao", e.target.value)} /></div><div className="space-y-2"><Label>Serial</Label><Input value={estoqueFormulario.serial} onChange={(e) => atualizarEstoque("serial", e.target.value)} /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Data de entrada *</Label><Input type="date" value={estoqueFormulario.data_entrada} onChange={(e) => atualizarEstoque("data_entrada", e.target.value)} /></div><div className="space-y-2"><Label>Documento de referência</Label><Input value={estoqueFormulario.referencia_documento} onChange={(e) => atualizarEstoque("referencia_documento", e.target.value)} /></div></div><div className="space-y-2"><Label>Observações</Label><textarea value={estoqueFormulario.observacoes} onChange={(e) => atualizarEstoque("observacoes", e.target.value)} rows={4} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogEstoque(false)}>Cancelar</Button><Button onClick={() => void salvarEstoque()} disabled={salvando}>{salvando ? "Registrando entrada..." : "Registrar entrada"}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

