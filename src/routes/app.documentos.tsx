import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  ArrowDownToLine,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2,
  PackageCheck,
  Plus,
  Search,
  Trash2,
  Unlink2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/common/Combobox";
import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { documentoEstoqueService } from "@/services/documento-estoque";
import { documentosRepo } from "@/services/documentos-repo";
import type {
  Documento,
  DocumentoItem,
  DocumentoStatus,
  DocumentoTipo,
} from "@/types";

export const Route = createFileRoute("/app/documentos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Documentos — Almoxarifado" },
      {
        name: "description",
        content: "Controle de documentos, itens, referências e recebimento no estoque.",
      },
    ],
  }),
  component: DocumentosPage,
});

const PAGINA = 20;

const TIPOS: Array<{ value: DocumentoTipo; label: string }> = [
  { value: "NOTA_FISCAL", label: "Nota Fiscal" },
  { value: "ROMANEIO", label: "Romaneio" },
  { value: "PEDIDO", label: "Pedido" },
  { value: "DOCUMENTO_INTERNO", label: "Documento interno" },
];

const STATUS: Array<{ value: DocumentoStatus; label: string }> = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "PARCIAL", label: "Parcial" },
  { value: "CONCLUIDO", label: "Concluído" },
  { value: "CANCELADO", label: "Cancelado" },
];

const statusClass: Record<DocumentoStatus, string> = {
  PENDENTE: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
  PARCIAL: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300",
  CONCLUIDO: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
  CANCELADO: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
};

const tipoLabel = (tipo: DocumentoTipo) =>
  TIPOS.find((item) => item.value === tipo)?.label ?? tipo;

const statusLabel = (status: DocumentoStatus) =>
  STATUS.find((item) => item.value === status)?.label ?? status;

const hoje = () => new Date().toISOString().slice(0, 10);

const formatarDataHora = (data?: string | null) => {
  if (!data) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data));
};

const formatarData = (data?: string | null) => {
  if (!data) return "—";
  const valor = data.includes("T") ? data.slice(0, 10) : data;
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
};

const formatarNumero = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(valor);

type DocumentoForm = {
  tipo: DocumentoTipo;
  numero: string;
  serie: string;
  data_emissao: string;
  data_entrada: string;
  empresa_id: string | null;
  valor_total: string;
  observacao: string;
};

type ItemForm = {
  produto_id: string | null;
  descricao: string;
  quantidade: string;
  valor_unitario: string;
};

const documentoInicial: DocumentoForm = {
  tipo: "NOTA_FISCAL",
  numero: "",
  serie: "",
  data_emissao: hoje(),
  data_entrada: "",
  empresa_id: null,
  valor_total: "",
  observacao: "",
};

const itemInicial: ItemForm = {
  produto_id: null,
  descricao: "",
  quantidade: "1",
  valor_unitario: "",
};

function StatusBadge({ status }: { status: DocumentoStatus }) {
  return (
    <Badge variant="outline" className={`font-medium ${statusClass[status]}`}>
      {status === "CONCLUIDO" ? <CheckCircle2 className="mr-1 size-3.5" /> : null}
      {statusLabel(status)}
    </Badge>
  );
}

function DocumentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const db = getDB();

  const dados = useLiveQuery(
    async () => {
      if (!projetoId) return null;
      const [documentos, empresas, produtos, unidades, equipes, locais] = await Promise.all([
        documentosRepo.listar(projetoId),
        db.empresas.where("projeto_id").equals(projetoId).toArray(),
        db.produtos.where("projeto_id").equals(projetoId).toArray(),
        db.unidades.toArray(),
        db.equipes.where("projeto_id").equals(projetoId).toArray(),
        db.locais.where("projeto_id").equals(projetoId).toArray(),
      ]);

      const itens = await db.documento_itens.toArray();
      const movimentos = await db.movimentacoes.where("projeto_id").equals(projetoId).toArray();

      return { documentos, empresas, produtos, unidades, equipes, locais, itens, movimentos };
    },
    [projetoId],
  );

  const [aba, setAba] = useState<"TODOS" | DocumentoStatus>("TODOS");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);

  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState<DocumentoForm>(documentoInicial);
  const [salvando, setSalvando] = useState(false);

  const [detalhe, setDetalhe] = useState<Documento | null>(null);
  const [itemAberto, setItemAberto] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(itemInicial);
  const [lancamentoAberto, setLancamentoAberto] = useState<DocumentoItem | null>(null);
  const [quantidadeLancamento, setQuantidadeLancamento] = useState("");
  const [equipeLancamento, setEquipeLancamento] = useState<string | null>(null);
  const [localLancamento, setLocalLancamento] = useState<string | null>(null);
  const [referenciaAberta, setReferenciaAberta] = useState(false);
  const [referenciaId, setReferenciaId] = useState<string | null>(null);
  const [referenciaRemover, setReferenciaRemover] = useState<{
    id: string;
    documento: Documento;
  } | null>(null);
  const [cancelamentoAberto, setCancelamentoAberto] = useState(false);

  const empresaMap = useMemo(
    () => new Map((dados?.empresas ?? []).map((empresa) => [empresa.id, empresa.nome])),
    [dados?.empresas],
  );

  const produtoMap = useMemo(
    () => new Map((dados?.produtos ?? []).map((produto) => [produto.id, produto])),
    [dados?.produtos],
  );

  const unidadeMap = useMemo(
    () => new Map((dados?.unidades ?? []).map((unidade) => [unidade.id, unidade])),
    [dados?.unidades],
  );

  const equipeMap = useMemo(
    () => new Map((dados?.equipes ?? []).map((equipe) => [equipe.id, equipe.nome])),
    [dados?.equipes],
  );

  const localMap = useMemo(
    () => new Map((dados?.locais ?? []).map((local) => [local.id, local.nome])),
    [dados?.locais],
  );

  const obterUnidadeProduto = (produtoId?: string | null) => {
    if (!produtoId) return null;
    const produto = produtoMap.get(produtoId);
    return produto?.unidade_id ? unidadeMap.get(produto.unidade_id) ?? null : null;
  };

  const itensDetalhe = useMemo(
    () => (detalhe && dados ? dados.itens.filter((item) => item.documento_id === detalhe.id) : []),
    [dados, detalhe],
  );

  const quantidadeLancada = (itemId: string) =>
    (dados?.movimentos ?? [])
      .filter((movimento) => movimento.documento_item_id === itemId)
      .reduce((total, movimento) => {
        const sinal = movimento.sinal ?? (movimento.tipo === "SAIDA" ? -1 : 1);
        return total + movimento.quantidade * sinal;
      }, 0);

  const filtrados = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();

    return dados.documentos.filter((documento) => {
      if (aba !== "TODOS" && documento.status !== aba) return false;
      if (tipo && documento.tipo !== tipo) return false;
      if (empresaId && documento.empresa_id !== empresaId) return false;

      if (termo) {
        const alvo = [
          documento.numero,
          documento.serie,
          tipoLabel(documento.tipo),
          empresaMap.get(documento.empresa_id ?? ""),
          documento.observacao,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!alvo.includes(termo)) return false;
      }

      return true;
    });
  }, [aba, busca, dados, empresaId, empresaMap, tipo]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / PAGINA));
  const paginaAtual = Math.min(pagina, paginas - 1);
  const visiveis = filtrados.slice(paginaAtual * PAGINA, paginaAtual * PAGINA + PAGINA);

  const limparFiltros = () => {
    setBusca("");
    setTipo(null);
    setEmpresaId(null);
    setPagina(0);
  };

  const abrirNovo = () => {
    setNovo(documentoInicial);
    setNovoAberto(true);
  };

  const selecionarProduto = (id: string | null) => {
    const produto = id ? produtoMap.get(id) : undefined;
    setItemForm((atual) => ({
      ...atual,
      produto_id: id,
      descricao: produto?.nome ?? atual.descricao,
    }));
  };

  const criarDocumento = async () => {
    if (!projetoId) return;
    if (!novo.numero.trim()) {
      toast.error("Informe o número do documento.");
      return;
    }

    const valorTotal = novo.valor_total.trim() ? Number(novo.valor_total) : null;
    if (valorTotal !== null && (!Number.isFinite(valorTotal) || valorTotal < 0)) {
      toast.error("Informe um valor total válido.");
      return;
    }

    try {
      setSalvando(true);
      const documento = await documentosRepo.criar(projetoId, {
        tipo: novo.tipo,
        numero: novo.numero.trim(),
        serie: novo.serie.trim() || null,
        data_emissao: novo.data_emissao || null,
        data_entrada: novo.data_entrada || null,
        empresa_id: novo.empresa_id,
        valor_total: valorTotal,
        observacao: novo.observacao.trim() || null,
      });

      setNovoAberto(false);
      setDetalhe(documento);
      toast.success("Documento cadastrado. Agora você pode adicionar os itens.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar o documento.");
    } finally {
      setSalvando(false);
    }
  };

  const adicionarItem = async () => {
    if (!detalhe) return;
    const quantidade = Number(itemForm.quantidade);

    if (!itemForm.descricao.trim()) {
      toast.error("Informe a descrição do item ou selecione um produto.");
      return;
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    try {
      setSalvando(true);
      await documentosRepo.adicionarItem(detalhe.id, {
        produto_id: itemForm.produto_id,
        descricao: itemForm.descricao.trim(),
        quantidade,
        valor_unitario: itemForm.valor_unitario ? Number(itemForm.valor_unitario) : null,
        valor_total: itemForm.valor_unitario ? Number(itemForm.valor_unitario) * quantidade : null,
      });
      setItemAberto(false);
      setItemForm(itemInicial);
      toast.success("Item adicionado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar o item.");
    } finally {
      setSalvando(false);
    }
  };

  const removerItem = async (item: DocumentoItem) => {
    if (!confirm("Remover este item do documento?")) return;
    try {
      await documentosRepo.removerItem(item.id);
      toast.success("Item removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover o item.");
    }
  };

  const cancelarDocumento = async () => {
    if (!detalhe) return;
    try {
      setSalvando(true);
      await documentosRepo.cancelar(detalhe.id);
      setDetalhe((atual) => (atual ? { ...atual, status: "CANCELADO" } : atual));
      setCancelamentoAberto(false);
      toast.success("Documento cancelado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cancelar o documento.");
    } finally {
      setSalvando(false);
    }
  };

  const excluirDocumento = async (documento: Documento) => {
    if (!confirm(`Excluir ${tipoLabel(documento.tipo)} ${documento.numero}?`)) return;
    try {
      await documentosRepo.remover(documento.id);
      if (detalhe?.id === documento.id) setDetalhe(null);
      toast.success("Documento excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o documento.");
    }
  };

  const abrirLancamento = async (item: DocumentoItem) => {
    try {
      const saldo = await documentoEstoqueService.obterSaldoItem(item.id);
      if (saldo.quantidadePendente <= 0) {
        toast.info("Este item não possui saldo pendente.");
        return;
      }
      setQuantidadeLancamento(String(saldo.quantidadePendente));
      setEquipeLancamento(dados?.equipes.find((equipe) => equipe.ativo)?.id ?? null);
      setLocalLancamento(null);
      setLancamentoAberto(item);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível obter o saldo do item.");
    }
  };

  const lancarNoEstoque = async () => {
    if (!lancamentoAberto || !projetoId || !equipeLancamento) {
      toast.error("Selecione a equipe de estoque.");
      return;
    }

    const quantidade = Number(quantidadeLancamento);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    try {
      setSalvando(true);
      await documentoEstoqueService.lancarItem({
        projetoId,
        documentoItemId: lancamentoAberto.id,
        equipeId: equipeLancamento,
        quantidade,
        data: new Date().toISOString(),
        localId: localLancamento,
      });
      setLancamentoAberto(null);
      toast.success("Item lançado no estoque.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível lançar o item.");
    } finally {
      setSalvando(false);
    }
  };

  const relacionados = useLiveQuery(
    () =>
      detalhe
        ? documentosRepo.listarDocumentosRelacionadosDetalhados(detalhe.id)
        : Promise.resolve([]),
    [detalhe?.id],
  );

  const criarReferencia = async () => {
    if (!projetoId || !detalhe || !referenciaId) {
      toast.error("Selecione um documento.");
      return;
    }
    try {
      await documentosRepo.criarReferencia(projetoId, detalhe.id, referenciaId);
      setReferenciaAberta(false);
      setReferenciaId(null);
      toast.success("Documento relacionado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível relacionar o documento.");
    }
  };

  const removerReferencia = async () => {
    if (!referenciaRemover) return;

    try {
      await documentosRepo.removerReferencia(referenciaRemover.id);
      setReferenciaRemover(null);
      toast.success("Relação removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover a relação.");
    }
  };

  if (!projetoId) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Card className="rounded-2xl">
          <CardContent className="py-10 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground" />
            <h1 className="mt-3 text-lg font-semibold">Nenhum projeto ativo</h1>
            <p className="mt-1 text-sm text-muted-foreground">Selecione um projeto para acessar os documentos.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dados) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando documentos…</div>;
  }

  return (
    <div className="min-h-full bg-muted/30">
      <div className="mx-auto w-full max-w-7xl space-y-5 p-3 pb-8 sm:p-4 md:p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-xl border bg-card p-2.5 text-primary shadow-sm">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Documentos</h1>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Controle documentos, seus itens e os lançamentos correspondentes no estoque.
              </p>
            </div>
          </div>
          <Button onClick={abrirNovo} className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" />
            Novo documento
          </Button>
        </header>

        <Tabs
          value={aba}
          onValueChange={(value) => {
            setAba(value as "TODOS" | DocumentoStatus);
            setPagina(0);
          }}
        >
          <div className="overflow-x-auto">
            <TabsList className="h-auto min-w-full justify-start gap-1 rounded-xl border bg-card p-1 sm:min-w-0">
              <TabsTrigger value="TODOS" className="rounded-lg px-3 py-2">Todos</TabsTrigger>
              {STATUS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="rounded-lg px-3 py-2">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <Card className="rounded-2xl border-border/50 shadow-sm">
          <CardHeader className="border-b bg-card p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Pesquisa</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busca}
                    onChange={(event) => {
                      setBusca(event.target.value);
                      setPagina(0);
                    }}
                    placeholder="Número, série, empresa…"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Combobox
                  placeholder="Todos"
                  value={tipo}
                  onChange={(value) => {
                    setTipo(value);
                    setPagina(0);
                  }}
                  opcoes={TIPOS.map((item) => ({ value: item.value, label: item.label }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Empresa</Label>
                <Combobox
                  placeholder="Todas"
                  value={empresaId}
                  onChange={(value) => {
                    setEmpresaId(value);
                    setPagina(0);
                  }}
                  opcoes={dados.empresas.map((empresa) => ({ value: empresa.id, label: empresa.nome }))}
                />
              </div>
              <Button variant="outline" onClick={limparFiltros} className="h-10">
                <XCircle className="mr-2 size-4" />
                Limpar
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Documento</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 font-semibold">Emissão</th>
                    <th className="px-4 py-3 font-semibold">Entrada</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="w-28 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visiveis.map((documento) => (
                    <tr key={documento.id} className="group hover:bg-muted/30">
                      <td className="px-4 py-3.5">
                        <button type="button" className="text-left" onClick={() => setDetalhe(documento)}>
                          <p className="font-semibold group-hover:text-primary">
                            {documento.numero}
                            {documento.serie ? ` · Série ${documento.serie}` : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {tipoLabel(documento.tipo)}
                          </p>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">{tipoLabel(documento.tipo)}</td>
                      <td className="px-4 py-3.5">{empresaMap.get(documento.empresa_id ?? "") ?? "—"}</td>
                      <td className="px-4 py-3.5">{formatarData(documento.data_emissao)}</td>
                      <td className="px-4 py-3.5">{formatarData(documento.data_entrada)}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={documento.status} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="size-8" title="Visualizar" onClick={() => setDetalhe(documento)}>
                            <FileText className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive hover:text-destructive"
                            title="Excluir"
                            onClick={() => void excluirDocumento(documento)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-16 text-center">
                        <FileText className="mx-auto size-8 text-muted-foreground/40" />
                        <p className="mt-3 text-sm font-medium">Nenhum documento encontrado.</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ajuste os filtros ou cadastre um novo documento.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 p-3 md:hidden">
              {visiveis.map((documento) => (
                <button
                  key={documento.id}
                  type="button"
                  onClick={() => setDetalhe(documento)}
                  className="w-full rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{documento.numero}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {tipoLabel(documento.tipo)} · {empresaMap.get(documento.empresa_id ?? "") ?? "Sem empresa"}
                      </p>
                    </div>
                    <StatusBadge status={documento.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Emissão: {formatarData(documento.data_emissao)}</span>
                    <span>Entrada: {formatarData(documento.data_entrada)}</span>
                  </div>
                </button>
              ))}
              {visiveis.length === 0 && (
                <div className="rounded-xl border bg-card px-4 py-12 text-center">
                  <FileText className="mx-auto size-8 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium">Nenhum documento encontrado.</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <p className="text-xs text-muted-foreground">
                {filtrados.length} documento(s) · página {paginaAtual + 1} de {paginas}
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={paginaAtual === 0}
                  onClick={() => setPagina((valor) => Math.max(0, valor - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={paginaAtual >= paginas - 1}
                  onClick={() => setPagina((valor) => Math.min(paginas - 1, valor + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl lg:max-w-5xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-xl sm:text-2xl">Novo documento</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cadastre primeiro o documento. Os itens são adicionados separadamente depois,
              mantendo cada entidade independente.
            </p>
          </DialogHeader>

          <div className="space-y-6">
            <section className="rounded-2xl border bg-muted/20 p-4 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-primary shadow-sm">
                  <FileText className="size-4" />
                </div>
                <div>
                  <h3 className="font-semibold">Identificação do documento</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Informe somente os dados que pertencem ao documento.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={novo.tipo} onValueChange={(value) => setNovo({ ...novo, tipo: value as DocumentoTipo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Número</Label>
                  <Input value={novo.numero} onChange={(e) => setNovo({ ...novo, numero: e.target.value })} placeholder="4451" />
                </div>
                <div className="space-y-1.5">
                  <Label>Série</Label>
                  <Input value={novo.serie} onChange={(e) => setNovo({ ...novo, serie: e.target.value })} placeholder="1" />
                </div>
                <div className="space-y-1.5">
                  <Label>Empresa</Label>
                  <Combobox
                    placeholder="Selecione"
                    value={novo.empresa_id}
                    onChange={(value) => setNovo({ ...novo, empresa_id: value })}
                    opcoes={dados.empresas.map((empresa) => ({ value: empresa.id, label: empresa.nome }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Data de emissão</Label>
                  <Input type="date" value={novo.data_emissao} onChange={(e) => setNovo({ ...novo, data_emissao: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Data de entrada</Label>
                  <Input type="date" value={novo.data_entrada} onChange={(e) => setNovo({ ...novo, data_entrada: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Valor total</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={novo.valor_total}
                    onChange={(e) => setNovo({ ...novo, valor_total: e.target.value })}
                    placeholder="Opcional"
                  />
                  <p className="text-xs text-muted-foreground">Valor informado no documento, independente dos itens cadastrados.</p>
                </div>
              </div>
            </section>

            <section className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                value={novo.observacao}
                onChange={(e) => setNovo({ ...novo, observacao: e.target.value })}
                placeholder="Observações do documento"
                className="min-h-24 resize-y"
              />
            </section>

            <div className="rounded-xl border border-dashed bg-background p-4">
              <div className="flex items-start gap-3">
                <Plus className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Itens serão adicionados depois</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Depois de cadastrar o documento, use <strong className="font-semibold text-foreground">Adicionar item</strong> para incluir os produtos, suas unidades, quantidades e valores.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setNovoAberto(false)}>Cancelar</Button>
            <Button onClick={() => void criarDocumento()} disabled={salvando}>
              <Plus className="mr-2 size-4" />
              {salvando ? "Salvando…" : "Cadastrar documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          {detalhe && (
            <>
              <DialogHeader className="pr-10">
                <div className="rounded-2xl border bg-primary/[0.045] p-4 sm:p-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-primary shadow-sm">
                        <FileText className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {tipoLabel(detalhe.tipo)}
                          </span>
                          <StatusBadge status={detalhe.status} />
                        </div>
                        <DialogTitle className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                          {detalhe.numero}
                        </DialogTitle>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          {detalhe.serie ? <span>Série {detalhe.serie}</span> : null}
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="size-3.5" />
                            {empresaMap.get(detalhe.empresa_id ?? "") ?? "Sem empresa vinculada"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border bg-background/80 p-3">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <CalendarDays className="size-3.5" /> Emissão
                        </p>
                        <p className="mt-1 font-semibold">{formatarData(detalhe.data_emissao)}</p>
                      </div>
                      <div className="rounded-xl border bg-background/80 p-3">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <ArrowDownToLine className="size-3.5" /> Entrada
                        </p>
                        <p className="mt-1 font-semibold">{formatarData(detalhe.data_entrada)}</p>
                      </div>
                      <div className="rounded-xl border bg-background/80 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Valor total</p>
                        <p className="mt-1 font-semibold">
                          {detalhe.valor_total != null
                            ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(detalhe.valor_total)
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </DialogHeader>


              <section className="rounded-xl border">
                <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold">Itens do documento</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{itensDetalhe.length} item(ns)</p>
                  </div>
                  {detalhe.status !== "CANCELADO" && (
                    <Button size="sm" onClick={() => { setItemForm(itemInicial); setItemAberto(true); }}>
                      <Plus className="mr-2 size-4" />
                      Adicionar item
                    </Button>
                  )}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-background text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Produto / descrição</th>
                        <th className="px-4 py-3 text-right">Documentado</th>
                        <th className="px-4 py-3 text-right">Lançado</th>
                        <th className="px-4 py-3 text-right">Pendente</th>
                        <th className="w-32 px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {itensDetalhe.map((item) => {
                        const lancada = quantidadeLancada(item.id);
                        const pendente = Math.max(0, item.quantidade - lancada);
                        const produto = produtoMap.get(item.produto_id ?? "");
                        return (
                          <tr key={item.id} className="hover:bg-muted/20">
                            <td className="px-4 py-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="font-medium">{produto?.nome ?? item.descricao}</p>
                                {obterUnidadeProduto(item.produto_id) ? (
                                  <Badge variant="secondary" className="shrink-0 text-[10px] font-semibold">
                                    {obterUnidadeProduto(item.produto_id)?.sigla}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                                    Sem unidade
                                  </Badge>
                                )}
                              </div>
                              {produto && produto.nome !== item.descricao && <p className="text-xs text-muted-foreground">{item.descricao}</p>}
                            </td>
                            <td className="num px-4 py-3 text-right">{formatarNumero(item.quantidade)} {(unidadeMap.get(produto?.unidade_id ?? "")?.sigla ?? "")}</td>
                            <td className="num px-4 py-3 text-right">{formatarNumero(lancada)} {obterUnidadeProduto(item.produto_id)?.sigla ?? ""}</td>
                            <td className="num px-4 py-3 text-right font-semibold">{formatarNumero(pendente)} {obterUnidadeProduto(item.produto_id)?.sigla ?? ""}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                {pendente > 0 && item.produto_id && detalhe.status !== "CANCELADO" && (
                                  <Button size="sm" variant="outline" onClick={() => void abrirLancamento(item)}>
                                    <PackageCheck className="mr-1.5 size-4" />
                                    Lançar
                                  </Button>
                                )}
                                {lancada <= 0 && detalhe.status !== "CANCELADO" && (
                                  <Button size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive" onClick={() => void removerItem(item)}>
                                    <Trash2 className="size-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 p-3 md:hidden">
                  {itensDetalhe.map((item) => {
                    const lancada = quantidadeLancada(item.id);
                    const pendente = Math.max(0, item.quantidade - lancada);
                    const produto = produtoMap.get(item.produto_id ?? "");
                    return (
                      <div key={item.id} className="rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{produto?.nome ?? item.descricao}</p>
                            {produto && produto.nome !== item.descricao && <p className="mt-0.5 text-xs text-muted-foreground">{item.descricao}</p>}
                          </div>
                          {obterUnidadeProduto(item.produto_id) ? (
                            <Badge variant="secondary" className="shrink-0 text-[10px] font-semibold">
                              {obterUnidadeProduto(item.produto_id)?.sigla}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                              Sem unidade
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div><p className="text-muted-foreground">Documentado</p><p className="mt-0.5 font-semibold">{formatarNumero(item.quantidade)} {obterUnidadeProduto(item.produto_id)?.sigla ?? ""}</p></div>
                          <div><p className="text-muted-foreground">Lançado</p><p className="mt-0.5 font-semibold">{formatarNumero(lancada)} {obterUnidadeProduto(item.produto_id)?.sigla ?? ""}</p></div>
                          <div><p className="text-muted-foreground">Pendente</p><p className="mt-0.5 font-semibold">{formatarNumero(pendente)} {obterUnidadeProduto(item.produto_id)?.sigla ?? ""}</p></div>
                        </div>
                        {pendente > 0 && item.produto_id && detalhe.status !== "CANCELADO" && (
                          <Button className="mt-3 w-full" variant="outline" onClick={() => void abrirLancamento(item)}>
                            <PackageCheck className="mr-2 size-4" />
                            Lançar no estoque
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {itensDetalhe.length === 0 && (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum item cadastrado neste documento.
                  </div>
                )}
              </section>

              <section className="rounded-xl border">
                <div className="border-b bg-muted/20 p-4">
                  <h3 className="font-semibold">Histórico de recebimentos</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Entradas de estoque vinculadas a este documento.</p>
                </div>
                <div className="divide-y">
                  {dados.movimentos.filter((movimento) => movimento.documento_id === detalhe.id).length > 0 ? (
                    dados.movimentos
                      .filter((movimento) => movimento.documento_id === detalhe.id)
                      .sort((a, b) => b.data.localeCompare(a.data))
                      .map((movimento) => {
                        const item = dados.itens.find((registro) => registro.id === movimento.documento_item_id);
                        const produto = produtoMap.get(item?.produto_id ?? movimento.produto_id);
                        const unidade = unidadeMap.get(produto?.unidade_id ?? "");
                        return (
                          <div key={movimento.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{produto?.nome ?? item?.descricao ?? "Material"}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatarDataHora(movimento.data)}
                                {equipeMap.get(movimento.equipe_id) ? ` · ${equipeMap.get(movimento.equipe_id)}` : ""}
                                {localMap.get(movimento.local_id ?? "") ? ` · ${localMap.get(movimento.local_id ?? "")}` : ""}
                              </p>
                            </div>
                            <div className="shrink-0 text-left sm:text-right">
                              <p className="num font-semibold">+{formatarNumero(movimento.quantidade)} {unidade ? unidade.sigla : "unidade não definida"}</p>
                              <p className="text-xs text-muted-foreground">Entrada no estoque</p>
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Nenhum recebimento registrado para este documento.
                    </div>
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-primary">
                        <Link2 className="size-4" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Documentos relacionados</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Conecte este documento a outros documentos do mesmo projeto. A relação não altera o estoque.
                        </p>
                      </div>
                    </div>
                  </div>
                  {detalhe.status !== "CANCELADO" && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => setReferenciaAberta(true)}>
                      <Link2 className="mr-2 size-4" />
                      Relacionar documento
                    </Button>
                  )}
                </div>

                <div className="p-4">
                  {relacionados && relacionados.length > 0 ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {relacionados.map(({ documento, referencia, direcao }) => (
                        <div key={referencia.id} className="group rounded-xl border bg-background p-3 transition hover:border-primary/30 hover:shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <FileText className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="min-w-0 text-left font-semibold hover:text-primary"
                                  onClick={() => setDetalhe(documento)}
                                >
                                  {tipoLabel(documento.tipo)} {documento.numero}
                                </button>
                                <StatusBadge status={documento.status} />
                              </div>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {empresaMap.get(documento.empresa_id ?? "") ?? "Sem empresa"}
                              </p>
                              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {direcao === "DIRETA" ? "Relacionado a partir deste documento" : "Este documento é relacionado a ele"}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition group-hover:opacity-100">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                title="Abrir documento"
                                onClick={() => setDetalhe(documento)}
                              >
                                <ExternalLink className="size-4" />
                              </Button>
                              {detalhe.status !== "CANCELADO" && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-destructive hover:text-destructive"
                                  title="Remover relação"
                                  onClick={() => setReferenciaRemover({ id: referencia.id, documento })}
                                >
                                  <Unlink2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed bg-muted/10 px-4 py-8 text-center">
                      <Link2 className="mx-auto size-7 text-muted-foreground/50" />
                      <p className="mt-2 text-sm font-medium">Nenhum documento relacionado</p>
                      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                        Use <strong className="font-semibold text-foreground">Relacionar documento</strong> para conectar um pedido, nota fiscal, romaneio ou outro documento deste projeto.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {detalhe.observacao && (
                <section className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observação</p>
                  <p className="mt-1 text-sm">{detalhe.observacao}</p>
                </section>
              )}

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                {detalhe.status === "PENDENTE" ? (
                  <div className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <p>Cancelar encerra o documento e impede novos recebimentos. Esta ação não exclui o documento.</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">O histórico de recebimentos permanece vinculado ao documento.</p>
                )}
                {detalhe.status === "PENDENTE" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setCancelamentoAberto(true)}
                  >
                    <XCircle className="mr-2 size-4" />
                    Cancelar documento
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={cancelamentoAberto} onOpenChange={setCancelamentoAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="size-4" />
              </span>
              Cancelar documento?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O documento <span className="font-semibold text-foreground">{detalhe ? `${tipoLabel(detalhe.tipo)} ${detalhe.numero}` : ""}</span> será marcado como cancelado.
            </p>
            <div className="rounded-xl border bg-muted/30 p-3 text-sm">
              <p className="font-medium">O que muda?</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>• novos recebimentos ficarão bloqueados;</li>
                <li>• o documento continuará disponível para consulta;</li>
                <li>• nenhum lançamento de estoque será criado por esta ação.</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelamentoAberto(false)} disabled={salvando}>Voltar</Button>
            <Button variant="destructive" onClick={() => void cancelarDocumento()} disabled={salvando}>
              <XCircle className="mr-2 size-4" />
              {salvando ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemAberto} onOpenChange={setItemAberto}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-xl">Adicionar item ao documento</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Selecione o produto para trazer sua unidade de medida e confira a descrição antes de salvar.
            </p>
          </DialogHeader>

          <div className="space-y-5">
            <section className="rounded-2xl border bg-muted/20 p-4 sm:p-5">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label>Produto do catálogo</Label>
                  <Combobox
                    placeholder="Pesquise e selecione um produto"
                    value={itemForm.produto_id}
                    onChange={selecionarProduto}
                    opcoes={dados.produtos.map((produto) => ({
                      value: produto.id,
                      label: `${produto.nome}${produto.unidade_id ? ` · ${unidadeMap.get(produto.unidade_id)?.sigla ?? "sem unidade"}` : " · sem unidade"}`,
                    }))}
                  />
                  <p className="text-xs text-muted-foreground">A unidade do produto será usada para orientar quantidade e lançamento.</p>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unidade de medida</p>
                  {obterUnidadeProduto(itemForm.produto_id) ? (
                    <>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-xl font-bold">{obterUnidadeProduto(itemForm.produto_id)?.sigla}</span>
                        <span className="text-sm font-medium text-foreground">
                          — {obterUnidadeProduto(itemForm.produto_id)?.descricao}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Esta é a unidade usada para informar a quantidade do item.
                      </p>
                    </>
                  ) : (
                    <div className="mt-2 rounded-lg border border-dashed p-3">
                      <p className="text-sm font-medium">Nenhuma unidade definida</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Selecione um produto com unidade de medida cadastrada.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <div className="space-y-1.5">
                <Label>Descrição do item</Label>
                <Textarea
                  value={itemForm.descricao}
                  onChange={(e) => setItemForm({ ...itemForm, descricao: e.target.value })}
                  placeholder="Descrição completa do item conforme o documento"
                  className="min-h-28 resize-y"
                />
                <p className="text-xs text-muted-foreground">Use este campo para preservar a descrição apresentada no documento.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Quantidade{obterUnidadeProduto(itemForm.produto_id) ? ` (${obterUnidadeProduto(itemForm.produto_id)?.sigla})` : ""}</Label>
                  <div className="relative">
                    <Input type="number" min="0.0001" step="any" value={itemForm.quantidade} onChange={(e) => setItemForm({ ...itemForm, quantidade: e.target.value })} className={obterUnidadeProduto(itemForm.produto_id) ? "pr-16" : ""} />
                    {obterUnidadeProduto(itemForm.produto_id) && (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                        {obterUnidadeProduto(itemForm.produto_id)?.sigla}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Valor unitário</Label>
                  <Input type="number" min="0" step="0.01" value={itemForm.valor_unitario} onChange={(e) => setItemForm({ ...itemForm, valor_unitario: e.target.value })} placeholder="Opcional" />
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setItemAberto(false)}>Cancelar</Button>
            <Button onClick={() => void adicionarItem()} disabled={salvando}>
              <Plus className="mr-2 size-4" />
              {salvando ? "Adicionando…" : "Adicionar item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lancamentoAberto} onOpenChange={(aberto) => !aberto && setLancamentoAberto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar item no estoque</DialogTitle>
          </DialogHeader>
          {lancamentoAberto && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="font-medium">{produtoMap.get(lancamentoAberto.produto_id ?? "")?.nome ?? lancamentoAberto.descricao}</p>
                <p className="mt-1 text-xs font-medium text-primary">
                  Unidade: {(() => {
                    const unidade = unidadeMap.get(produtoMap.get(lancamentoAberto.produto_id ?? "")?.unidade_id ?? "");
                    return unidade ? `${unidade.sigla} — ${unidade.descricao}` : "Não definida";
                  })()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Informe a quantidade que será recebida agora. O restante continuará pendente.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Quantidade a receber{obterUnidadeProduto(lancamentoAberto?.produto_id) ? ` (${obterUnidadeProduto(lancamentoAberto?.produto_id)?.sigla})` : ""}</Label>
                <Input type="number" min="0.0001" step="any" value={quantidadeLancamento} onChange={(e) => setQuantidadeLancamento(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Equipe de estoque</Label>
                <Combobox
                  placeholder="Selecione a equipe"
                  value={equipeLancamento}
                  onChange={setEquipeLancamento}
                  opcoes={dados.equipes.filter((equipe) => equipe.ativo).map((equipe) => ({ value: equipe.id, label: equipe.nome }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Local</Label>
                <Combobox
                  placeholder="Opcional"
                  value={localLancamento}
                  onChange={setLocalLancamento}
                  opcoes={dados.locais.map((local) => ({ value: local.id, label: local.nome }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLancamentoAberto(null)}>Cancelar</Button>
            <Button onClick={() => void lancarNoEstoque()} disabled={salvando}>
              <ArrowDownToLine className="mr-2 size-4" />
              {salvando ? "Lançando…" : "Lançar no estoque"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={referenciaAberta}
        onOpenChange={(aberto) => {
          setReferenciaAberta(aberto);
          if (!aberto) setReferenciaId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <span className="flex size-9 items-center justify-center rounded-lg border bg-muted text-primary">
                <Link2 className="size-4" />
              </span>
              Relacionar documento
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Crie uma referência documental sem alterar os itens ou o estoque. A relação será exibida nos dois documentos.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documento atual</p>
              <p className="mt-1 font-semibold">
                {detalhe ? `${tipoLabel(detalhe.tipo)} ${detalhe.numero}` : "—"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Documento a relacionar</Label>
              <Combobox
                placeholder="Pesquise por número ou documento"
                value={referenciaId}
                onChange={setReferenciaId}
                opcoes={dados.documentos
                  .filter((documento) => documento.id !== detalhe?.id)
                  .map((documento) => ({
                    value: documento.id,
                    label: `${tipoLabel(documento.tipo)} ${documento.numero} · ${empresaMap.get(documento.empresa_id ?? "") ?? "Sem empresa"}`,
                  }))}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                O documento pode ser de qualquer tipo permitido no projeto. Não é necessário que um seja anterior ao outro.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setReferenciaAberta(false)}>Voltar</Button>
            <Button onClick={() => void criarReferencia()} disabled={!referenciaId}>
              <Link2 className="mr-2 size-4" />
              Relacionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!referenciaRemover}
        onOpenChange={(aberto) => !aberto && setReferenciaRemover(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Unlink2 className="size-4" />
              </span>
              Remover relação?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A relação entre <strong className="text-foreground">{detalhe ? `${tipoLabel(detalhe.tipo)} ${detalhe.numero}` : "este documento"}</strong> e <strong className="text-foreground">{referenciaRemover ? `${tipoLabel(referenciaRemover.documento.tipo)} ${referenciaRemover.documento.numero}` : "o documento relacionado"}</strong> será removida. Os documentos e os lançamentos de estoque não serão alterados.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setReferenciaRemover(null)}>Voltar</Button>
            <Button variant="destructive" onClick={() => void removerReferencia()}>
              <Unlink2 className="mr-2 size-4" />
              Remover relação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
