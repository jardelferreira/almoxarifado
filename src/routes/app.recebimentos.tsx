import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  PackageCheck,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/common/Combobox";
import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { documentoEstoqueService } from "@/services/documento-estoque";
import { documentosRepo } from "@/services/documentos-repo";
import type { Documento, DocumentoItem, DocumentoTipo } from "@/types";

export const Route = createFileRoute("/app/recebimentos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recebimentos — Almoxarifado" },
      {
        name: "description",
        content: "Recebimento de materiais vinculados a documentos, com lançamentos parciais no estoque.",
      },
    ],
  }),
  component: RecebimentosPage,
});

const PAGINA = 20;

type TipoFiltro = DocumentoTipo | "TODOS";

const tipoLabel: Record<DocumentoTipo, string> = {
  NOTA_FISCAL: "Nota Fiscal",
  ROMANEIO: "Romaneio",
  PEDIDO: "Pedido",
  DOCUMENTO_INTERNO: "Documento interno",
};

const hoje = () => new Date().toISOString().slice(0, 10);

const formatarData = (data?: string | null) => {
  if (!data) return "—";
  const valor = data.includes("T") ? data.slice(0, 10) : data;
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
};

const formatarNumero = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(valor);

function RecebimentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const db = getDB();

  const dados = useLiveQuery(
    async () => {
      if (!projetoId) return null;
      const [documentos, itens, movimentos, produtos, empresas, equipes, locais, unidades] = await Promise.all([
        documentosRepo.listar(projetoId),
        db.documento_itens.toArray(),
        db.movimentacoes.where("projeto_id").equals(projetoId).toArray(),
        db.produtos.where("projeto_id").equals(projetoId).toArray(),
        db.empresas.where("projeto_id").equals(projetoId).toArray(),
        db.equipes.where("projeto_id").equals(projetoId).toArray(),
        db.locais.where("projeto_id").equals(projetoId).toArray(),
        db.unidades.toArray(),
      ]);
      return { documentos, itens, movimentos, produtos, empresas, equipes, locais, unidades };
    },
    [projetoId],
  );

  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<TipoFiltro>("TODOS");
  const [pagina, setPagina] = useState(0);
  const [documentoSelecionado, setDocumentoSelecionado] = useState<Documento | null>(null);
  const [itemSelecionado, setItemSelecionado] = useState<DocumentoItem | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [localId, setLocalId] = useState<string | null>(null);
  const [data, setData] = useState(hoje());
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const empresaMap = useMemo(
    () => new Map((dados?.empresas ?? []).map((empresa) => [empresa.id, empresa.nome])),
    [dados?.empresas],
  );
  const produtoMap = useMemo(
    () => new Map((dados?.produtos ?? []).map((produto) => [produto.id, produto])),
    [dados?.produtos],
  );
  const unidadeMap = useMemo(
    () => new Map((dados?.unidades ?? []).map((unidade) => [unidade.id, unidade.sigla])),
    [dados?.unidades],
  );

  const quantidadeLancada = (itemId: string) =>
    (dados?.movimentos ?? [])
      .filter((movimento) => movimento.documento_item_id === itemId)
      .reduce((total, movimento) => {
        const sinal = movimento.sinal ?? (movimento.tipo === "SAIDA" ? -1 : 1);
        return total + movimento.quantidade * sinal;
      }, 0);

  const itensPendentesPorDocumento = useMemo(() => {
    const mapa = new Map<string, DocumentoItem[]>();
    for (const item of dados?.itens ?? []) {
      const pendente = Math.max(0, item.quantidade - quantidadeLancada(item.id));
      if (pendente <= Number.EPSILON) continue;
      const lista = mapa.get(item.documento_id) ?? [];
      lista.push(item);
      mapa.set(item.documento_id, lista);
    }
    return mapa;
  }, [dados]);

  const documentosPendentes = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();

    return dados.documentos.filter((documento) => {
      if (documento.status === "CANCELADO" || documento.status === "CONCLUIDO") return false;
      if (!itensPendentesPorDocumento.has(documento.id)) return false;
      if (tipo !== "TODOS" && documento.tipo !== tipo) return false;

      if (termo) {
        const alvo = [
          documento.numero,
          documento.serie,
          tipoLabel[documento.tipo],
          empresaMap.get(documento.empresa_id ?? ""),
          documento.observacao,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [dados, busca, tipo, empresaMap, itensPendentesPorDocumento]);

  const paginas = Math.max(1, Math.ceil(documentosPendentes.length / PAGINA));
  const paginaAtual = Math.min(pagina, paginas - 1);
  const visiveis = documentosPendentes.slice(paginaAtual * PAGINA, paginaAtual * PAGINA + PAGINA);

  if (!projetoId) {
    return <p className="text-sm text-muted-foreground">Selecione um projeto para visualizar os recebimentos.</p>;
  }

  if (!dados) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  const abrirLancamento = (item: DocumentoItem) => {
    const documento = dados.documentos.find((doc) => doc.id === item.documento_id);
    if (!documento) return;
    const pendente = Math.max(0, item.quantidade - quantidadeLancada(item.id));
    setDocumentoSelecionado(documento);
    setItemSelecionado(item);
    setQuantidade(String(pendente));
    setEquipeId(dados.equipes.find((equipe) => equipe.ativo)?.id ?? null);
    setLocalId(null);
    setData(hoje());
    setObservacao("");
  };

  const lancar = async () => {
    if (!documentoSelecionado || !itemSelecionado || !equipeId || !projetoId) return;

    const valor = Number(quantidade.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    const pendente = Math.max(0, itemSelecionado.quantidade - quantidadeLancada(itemSelecionado.id));
    if (valor > pendente + Number.EPSILON) {
      toast.error(`A quantidade não pode ultrapassar o saldo pendente de ${formatarNumero(pendente)}.`);
      return;
    }

    setSalvando(true);
    try {
      await documentoEstoqueService.lancarItem({
        projetoId,
        documentoItemId: itemSelecionado.id,
        equipeId,
        quantidade: valor,
        data,
        localId,
        observacao: observacao.trim() || null,
      });
      toast.success("Recebimento lançado no estoque.");
      setDocumentoSelecionado(null);
      setItemSelecionado(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível lançar o recebimento.");
    } finally {
      setSalvando(false);
    }
  };

  const documentoAberto = documentoSelecionado;
  const itensDocumento = documentoAberto
    ? itensPendentesPorDocumento.get(documentoAberto.id) ?? []
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck className="size-7 text-primary" />
            <h1 className="font-display text-3xl font-bold uppercase">Recebimentos</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Lance no estoque os materiais recebidos por documento.
          </p>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5 px-3 py-1.5">
          <ArrowDownToLine className="size-4" />
          {documentosPendentes.length} pendente(s)
        </Badge>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Pesquisa</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Número, empresa, tipo ou observação…"
                value={busca}
                onChange={(event) => {
                  setBusca(event.target.value);
                  setPagina(0);
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de documento</Label>
            <Combobox
              value={tipo === "TODOS" ? null : tipo}
              onChange={(value) => {
                setTipo((value as TipoFiltro | null) ?? "TODOS");
                setPagina(0);
              }}
              placeholder="Todos"
              opcoes={(Object.keys(tipoLabel) as DocumentoTipo[]).map((item) => ({
                value: item,
                label: tipoLabel[item],
              }))}
            />
          </div>
        </CardHeader>
      </Card>

      {visiveis.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="size-10 text-muted-foreground/50" />
            <p className="font-medium">Nenhum recebimento pendente</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Documentos concluídos, cancelados ou sem saldo pendente não aparecem nesta tela.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Documento</th>
                  <th className="px-4 py-3 text-left font-medium">Empresa</th>
                  <th className="px-4 py-3 text-left font-medium">Emissão</th>
                  <th className="px-4 py-3 text-left font-medium">Itens pendentes</th>
                  <th className="px-4 py-3 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((documento) => {
                  const itens = itensPendentesPorDocumento.get(documento.id) ?? [];
                  return (
                    <tr key={documento.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{tipoLabel[documento.tipo]} {documento.numero || "Sem número"}</p>
                            {documento.serie ? <p className="text-xs text-muted-foreground">Série {documento.serie}</p> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">{empresaMap.get(documento.empresa_id ?? "") ?? "—"}</td>
                      <td className="px-4 py-4">{formatarData(documento.data_emissao)}</td>
                      <td className="px-4 py-4">
                        <Badge variant="secondary">{itens.length} item(ns)</Badge>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button size="sm" onClick={() => setDocumentoSelecionado(documento)}>
                          <PackageCheck className="mr-1.5 size-4" /> Receber
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {visiveis.map((documento) => {
              const itens = itensPendentesPorDocumento.get(documento.id) ?? [];
              return (
                <Card key={documento.id} className="rounded-2xl">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <div className="rounded-xl bg-muted p-2"><FileText className="size-5" /></div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{tipoLabel[documento.tipo]} {documento.numero || "Sem número"}</p>
                          <p className="text-sm text-muted-foreground">{empresaMap.get(documento.empresa_id ?? "") ?? "Sem empresa"}</p>
                        </div>
                      </div>
                      <Badge variant="outline">{itens.length} itens</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">Emissão</p><p className="font-medium">{formatarData(documento.data_emissao)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Entrada</p><p className="font-medium">{formatarData(documento.data_entrada)}</p></div>
                    </div>
                    <Button className="w-full" onClick={() => setDocumentoSelecionado(documento)}>
                      <PackageCheck className="mr-1.5 size-4" /> Receber materiais
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Página {paginaAtual + 1} de {paginas}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" disabled={paginaAtual === 0} onClick={() => setPagina((value) => Math.max(0, value - 1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" disabled={paginaAtual >= paginas - 1} onClick={() => setPagina((value) => Math.min(paginas - 1, value + 1))}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!documentoAberto} onOpenChange={(open) => !open && setDocumentoSelecionado(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="size-5 text-primary" />
              Receber {documentoAberto ? `${tipoLabel[documentoAberto.tipo]} ${documentoAberto.numero}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {documentoAberto ? (
              <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Empresa</p><p className="font-medium">{empresaMap.get(documentoAberto.empresa_id ?? "") ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Emissão</p><p className="font-medium">{formatarData(documentoAberto.data_emissao)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline">{documentoAberto.status}</Badge></div>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Itens com saldo pendente</Label>
              <div className="space-y-2">
                {itensDocumento.map((item) => {
                  const produto = item.produto_id ? produtoMap.get(item.produto_id) : null;
                  const unidade = item.produto_id ? unidadeMap.get(produto?.unidade_id ?? "") : null;
                  const lancado = quantidadeLancada(item.id);
                  const pendente = Math.max(0, item.quantidade - lancado);
                  const ativo = itemSelecionado?.id === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => abrirLancamento(item)}
                      className={`w-full rounded-xl border p-3 text-left transition hover:bg-muted/30 ${ativo ? "border-primary bg-primary/5" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{produto?.nome ?? item.descricao}</p>
                          <p className="text-xs text-muted-foreground">Documentado: {formatarNumero(item.quantidade)} {unidade ?? ""} · Recebido: {formatarNumero(lancado)} · Pendente: {formatarNumero(pendente)}</p>
                        </div>
                        <Badge variant="secondary">{formatarNumero(pendente)} {unidade ?? ""}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {itemSelecionado ? (
              <div className="rounded-2xl border p-4 space-y-4">
                <div>
                  <p className="font-semibold">Lançar recebimento</p>
                  <p className="text-sm text-muted-foreground">{produtoMap.get(itemSelecionado.produto_id ?? "")?.nome ?? itemSelecionado.descricao}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Quantidade recebida</Label>
                    <Input inputMode="decimal" value={quantidade} onChange={(event) => setQuantidade(event.target.value)} />
                    <p className="text-xs text-muted-foreground">Máximo: {formatarNumero(Math.max(0, itemSelecionado.quantidade - quantidadeLancada(itemSelecionado.id)))}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data do recebimento</Label>
                    <Input type="date" value={data} onChange={(event) => setData(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Equipe / estoque</Label>
                    <Combobox value={equipeId} onChange={setEquipeId} placeholder="Selecionar equipe" opcoes={dados.equipes.filter((equipe) => equipe.ativo).map((equipe) => ({ value: equipe.id, label: equipe.nome }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Local de armazenamento</Label>
                    <Combobox value={localId} onChange={setLocalId} placeholder="Opcional" opcoes={dados.locais.map((local) => ({ value: local.id, label: local.nome }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Observação</Label>
                  <Input placeholder="Observação do recebimento…" value={observacao} onChange={(event) => setObservacao(event.target.value)} />
                </div>
                <Button className="w-full" disabled={salvando || !equipeId} onClick={lancar}>
                  <ArrowDownToLine className="mr-1.5 size-4" />
                  {salvando ? "Lançando…" : "Confirmar entrada no estoque"}
                </Button>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">Selecione um item acima para realizar o recebimento.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDocumentoSelecionado(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
