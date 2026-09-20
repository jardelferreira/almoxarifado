import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarDays,
  Gauge,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/common/Combobox";
import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { regrasConsumoEquipamentosRepo } from "@/services/equipamentos/regras-consumo-repo";
import type {
  Equipamento,
  EstoqueEquipamento,
  Produto,
  RegraConsumoEquipamento,
  RegraConsumoEquipamentoDirecionador,
  RegraConsumoEquipamentoPeriodicidade,
  Unidade,
} from "@/types";

export const Route = createFileRoute("/app/regras-consumo-equipamentos")({
  ssr: false,
  component: RegrasConsumoEquipamentosPage,
});

type EscopoRegra = "CATALOGO" | "ESTOQUE";

type Formulario = {
  equipamentoId: string;
  escopo: EscopoRegra;
  estoqueEquipamentoId: string;
  produtoId: string;
  fator: string;
  unidadeBaseId: string;
  unidadeConsumoId: string;
  direcionador: RegraConsumoEquipamentoDirecionador;
  periodicidade: RegraConsumoEquipamentoPeriodicidade | "";
  vigenciaInicio: string;
  vigenciaFim: string;
  observacao: string;
  ativo: boolean;
};

const DIRECIONADORES: Array<{ value: RegraConsumoEquipamentoDirecionador; label: string }> = [
  { value: "HORA", label: "Hora de operação" },
  { value: "DIA", label: "Dia" },
  { value: "CICLO", label: "Ciclo" },
  { value: "KM", label: "Quilometragem" },
  { value: "PRODUCAO", label: "Quantidade produzida" },
  { value: "USO_MANUAL", label: "Uso informado manualmente" },
  { value: "PERIODO", label: "Período" },
];

const PERIODICIDADES: Array<{ value: RegraConsumoEquipamentoPeriodicidade; label: string }> = [
  { value: "HORA", label: "Hora" },
  { value: "DIA", label: "Dia" },
  { value: "SEMANA", label: "Semana" },
  { value: "MES", label: "Mês" },
  { value: "ANO", label: "Ano" },
];

function formularioInicial(): Formulario {
  return {
    equipamentoId: "",
    escopo: "CATALOGO",
    estoqueEquipamentoId: "",
    produtoId: "",
    fator: "",
    unidadeBaseId: "",
    unidadeConsumoId: "",
    direcionador: "HORA",
    periodicidade: "",
    vigenciaInicio: "",
    vigenciaFim: "",
    observacao: "",
    ativo: true,
  };
}

function num(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}

function RegrasConsumoEquipamentosPage() {
  const [projetoId] = useProjetoAtivoId();
  const equipamentos = useLiveQuery(
    () => (projetoId ? getDB().equipamentos.where("projeto_id").equals(projetoId).toArray() : Promise.resolve([] as Equipamento[])),
    [projetoId],
  ) ?? [];
  const produtos = useLiveQuery(
    () => (projetoId ? getDB().produtos.where("projeto_id").equals(projetoId).toArray() : Promise.resolve([] as Produto[])),
    [projetoId],
  ) ?? [];
  const estoques = useLiveQuery(
    () => (projetoId ? getDB().estoque_equipamentos.where("projeto_id").equals(projetoId).toArray() : Promise.resolve([] as EstoqueEquipamento[])),
    [projetoId],
  ) ?? [];
  const unidades = useLiveQuery(
    () => getDB().unidades.toArray(),
    [],
  ) ?? [];
  const regras = useLiveQuery(
    () => (projetoId ? regrasConsumoEquipamentosRepo.listarProjeto(projetoId) : Promise.resolve([] as RegraConsumoEquipamento[])),
    [projetoId],
  ) ?? [];

  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<RegraConsumoEquipamento | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(formularioInicial());
  const [salvando, setSalvando] = useState(false);

  const equipamentosAtivos = useMemo(
    () => equipamentos.filter((item) => item.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)),
    [equipamentos],
  );
  const produtosAtivos = useMemo(
    () => produtos.filter((item) => item.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)),
    [produtos],
  );
  const unidadesAtivas = useMemo(
    () => unidades.filter((item) => item.ativo).sort((a, b) => a.sigla.localeCompare(b.sigla)),
    [unidades],
  );
  const estoqueEscopo = useMemo(
    () => estoques
      .filter((item) => item.ativo !== false && item.equipamento_id === formulario.equipamentoId)
      .sort((a, b) => (a.identificacao ?? a.patrimonio ?? a.serial ?? a.id).localeCompare(b.identificacao ?? b.patrimonio ?? b.serial ?? b.id)),
    [estoques, formulario.equipamentoId],
  );

  const equipamentoPorId = useMemo(
    () => new Map(equipamentos.map((item) => [item.id, item])),
    [equipamentos],
  );
  const produtoPorId = useMemo(
    () => new Map(produtos.map((item) => [item.id, item])),
    [produtos],
  );
  const unidadePorId = useMemo(
    () => new Map(unidades.map((item) => [item.id, item])),
    [unidades],
  );
  const estoquePorId = useMemo(
    () => new Map(estoques.map((item) => [item.id, item])),
    [estoques],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return regras;

    return regras.filter((regra) => {
      const equipamento = equipamentoPorId.get(regra.equipamento_id)?.nome ?? "";
      const produto = produtoPorId.get(regra.produto_id)?.nome ?? "";
      const estoque = regra.estoque_equipamento_id
        ? estoquePorId.get(regra.estoque_equipamento_id)?.identificacao ?? ""
        : "";
      return `${equipamento} ${produto} ${estoque}`.toLowerCase().includes(termo);
    });
  }, [busca, equipamentoPorId, produtoPorId, estoquePorId, regras]);

  function atualizarFormulario<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
  }

  function abrirNovo() {
    setEditando(null);
    setFormulario(formularioInicial());
    setDialogAberto(true);
  }

  function abrirEdicao(regra: RegraConsumoEquipamento) {
    const produto = produtoPorId.get(regra.produto_id);
    setEditando(regra);
    setFormulario({
      equipamentoId: regra.equipamento_id,
      escopo: regra.estoque_equipamento_id ? "ESTOQUE" : "CATALOGO",
      estoqueEquipamentoId: regra.estoque_equipamento_id ?? "",
      produtoId: regra.produto_id,
      fator: String(regra.fator),
      unidadeBaseId: regra.unidade_base_id,
      unidadeConsumoId: regra.unidade_consumo_id || produto?.unidade_id || "",
      direcionador: regra.direcionador,
      periodicidade: regra.periodicidade ?? "",
      vigenciaInicio: regra.vigencia_inicio ?? "",
      vigenciaFim: regra.vigencia_fim ?? "",
      observacao: regra.observacao ?? "",
      ativo: regra.ativo,
    });
    setDialogAberto(true);
  }

  function selecionarProduto(produtoId: string | null) {
    const id = produtoId ?? "";
    atualizarFormulario("produtoId", id);
    const produto = produtos.find((item) => item.id === id);
    if (produto?.unidade_id) {
      atualizarFormulario("unidadeConsumoId", produto.unidade_id);
    }
  }

  function selecionarEquipamento(equipamentoId: string | null) {
    const id = equipamentoId ?? "";
    setFormulario((atual) => ({
      ...atual,
      equipamentoId: id,
      estoqueEquipamentoId: "",
    }));
  }

  async function salvar() {
    if (!projetoId) return;

    const fator = Number(formulario.fator.replace(",", "."));
    if (!formulario.equipamentoId || !formulario.produtoId) {
      toast.error("Selecione o equipamento e o produto.");
      return;
    }
    if (formulario.escopo === "ESTOQUE" && !formulario.estoqueEquipamentoId) {
      toast.error("Selecione o registro físico que receberá o override.");
      return;
    }
    if (!formulario.unidadeBaseId || !formulario.unidadeConsumoId) {
      toast.error("Informe as unidades da base e do consumo.");
      return;
    }
    if (!Number.isFinite(fator) || fator <= 0) {
      toast.error("O fator de consumo deve ser maior que zero.");
      return;
    }

    setSalvando(true);
    try {
      const dados = {
        equipamentoId: formulario.equipamentoId,
        estoqueEquipamentoId: formulario.escopo === "ESTOQUE" ? formulario.estoqueEquipamentoId : null,
        produtoId: formulario.produtoId,
        fator,
        unidadeBaseId: formulario.unidadeBaseId,
        unidadeConsumoId: formulario.unidadeConsumoId,
        direcionador: formulario.direcionador,
        periodicidade: formulario.direcionador === "PERIODO" && formulario.periodicidade
          ? formulario.periodicidade
          : null,
        vigenciaInicio: formulario.vigenciaInicio || null,
        vigenciaFim: formulario.vigenciaFim || null,
        observacao: formulario.observacao.trim() || null,
        ativo: formulario.ativo,
      } as const;

      if (editando) {
        await regrasConsumoEquipamentosRepo.atualizar(projetoId, editando.id, dados);
        toast.success("Regra de consumo atualizada.");
      } else {
        await regrasConsumoEquipamentosRepo.criar(projetoId, dados);
        toast.success("Regra de consumo criada.");
      }

      setDialogAberto(false);
      setEditando(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a regra.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(regra: RegraConsumoEquipamento) {
    if (!projetoId) return;
    const confirmar = window.confirm("Excluir esta regra de consumo? O histórico de consumo real não será alterado.");
    if (!confirmar) return;

    try {
      await regrasConsumoEquipamentosRepo.remover(projetoId, regra.id);
      toast.success("Regra de consumo excluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a regra.");
    }
  }

  if (!projetoId) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum projeto ativo selecionado.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Regras de consumo</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Relacione cada equipamento a produtos consumíveis por um fator e um direcionador de utilização. Overrides físicos substituem o parâmetro padrão sem apagar sua origem.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="mr-2 size-4" /> Nova regra
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Regras</p><p className="mt-1 text-2xl font-bold">{regras.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Ativas</p><p className="mt-1 text-2xl font-bold">{regras.filter((item) => item.ativo).length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Overrides físicos</p><p className="mt-1 text-2xl font-bold">{regras.filter((item) => item.estoque_equipamento_id).length}</p></CardContent></Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Parâmetros cadastrados</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">A regra é uma configuração. O consumo real continua registrado separadamente nas apropriações de estoque.</p>
            </div>
            <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Pesquisar equipamento, produto..." className="w-full sm:max-w-sm" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead><tr className="border-b bg-muted/10 text-left">
                <th className="px-4 py-3 font-medium">Equipamento</th>
                <th className="px-4 py-3 font-medium">Escopo</th>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Regra</th>
                <th className="px-4 py-3 font-medium">Vigência</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr></thead>
              <tbody>
                {filtradas.map((regra) => {
                  const equipamento = equipamentoPorId.get(regra.equipamento_id);
                  const produto = produtoPorId.get(regra.produto_id);
                  const unidadeBase = unidadePorId.get(regra.unidade_base_id);
                  const unidadeConsumo = unidadePorId.get(regra.unidade_consumo_id);
                  const estoque = regra.estoque_equipamento_id
                    ? estoquePorId.get(regra.estoque_equipamento_id)
                    : null;
                  const direcionador = DIRECIONADORES.find((item) => item.value === regra.direcionador)?.label ?? regra.direcionador;
                  return (
                    <tr key={regra.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium">{equipamento?.nome ?? "Equipamento não encontrado"}</div>
                        {equipamento?.modelo && <div className="text-xs text-muted-foreground">{equipamento.modelo}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {estoque ? (
                          <div className="space-y-1"><Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">Override físico</Badge><div className="text-xs text-muted-foreground">{estoque.identificacao || estoque.patrimonio || estoque.serial || estoque.id.slice(0, 8)}</div></div>
                        ) : <Badge variant="secondary">Padrão</Badge>}
                      </td>
                      <td className="px-4 py-3">{produto?.nome ?? "Produto não encontrado"}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{num(regra.fator)} {unidadeConsumo?.sigla ?? ""} / {unidadeBase?.sigla ?? ""}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{direcionador}{regra.periodicidade ? ` · ${regra.periodicidade.toLowerCase()}` : ""}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>{regra.vigencia_inicio || "Desde o início"}</div>
                        <div>{regra.vigencia_fim || "Sem término"}</div>
                      </td>
                      <td className="px-4 py-3">
                        {regra.ativo ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Ativa</Badge> : <Badge variant="outline">Inativa</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="size-8" title="Editar regra" onClick={() => abrirEdicao(regra)}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" title="Excluir regra" onClick={() => void remover(regra)}><Trash2 className="size-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtradas.length === 0 && <tr><td colSpan={7} className="py-14 text-center text-sm text-muted-foreground">Nenhuma regra de consumo cadastrada.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Gauge className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Como o parâmetro será usado</p>
              <p className="text-muted-foreground">O fator descreve o consumo esperado por unidade do direcionador/base. A regra não altera movimentações históricas e não transforma previsão em consumo realizado.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={(open) => { if (!open) { setDialogAberto(false); setEditando(null); } }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="size-5 text-primary" />{editando ? "Editar regra de consumo" : "Nova regra de consumo"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" /><p>O período de vigência permite manter parâmetros históricos sem substituir regras anteriores. Um override físico afeta somente o registro selecionado.</p></div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Equipamento *</Label>
                <Combobox
                  opcoes={equipamentosAtivos.map((item) => ({ value: item.id, label: item.nome, hint: item.modelo ?? undefined }))}
                  value={formulario.equipamentoId || null}
                  onChange={selecionarEquipamento}
                  placeholder="Selecione o equipamento..."
                  vazio="Nenhum equipamento encontrado."
                />
              </div>

              <div className="space-y-2">
                <Label>Escopo *</Label>
                <Select value={formulario.escopo} onValueChange={(valor) => atualizarFormulario("escopo", valor as EscopoRegra)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CATALOGO">Padrão do equipamento</SelectItem>
                    <SelectItem value="ESTOQUE">Override de registro físico</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Registro físico</Label>
                <Select
                  value={formulario.estoqueEquipamentoId || "__nenhum__"}
                  onValueChange={(valor) => atualizarFormulario("estoqueEquipamentoId", valor === "__nenhum__" ? "" : valor)}
                  disabled={formulario.escopo !== "ESTOQUE"}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhum__">Nenhum</SelectItem>
                    {estoqueEscopo.map((estoque) => <SelectItem key={estoque.id} value={estoque.id}>{estoque.identificacao || estoque.patrimonio || estoque.serial || estoque.id.slice(0, 8)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {formulario.escopo === "ESTOQUE" && estoqueEscopo.length === 0 && <p className="text-xs text-amber-700">Não há registros físicos ativos para este equipamento.</p>}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Produto consumível *</Label>
                <Combobox
                  opcoes={produtosAtivos.map((item) => ({ value: item.id, label: item.nome, hint: item.codigo ?? (item.unidade_id ? unidadePorId.get(item.unidade_id)?.sigla : undefined) }))}
                  value={formulario.produtoId || null}
                  onChange={selecionarProduto}
                  placeholder="Selecione o produto..."
                  vazio="Nenhum produto encontrado."
                />
                {formulario.produtoId && produtoPorId.get(formulario.produtoId)?.unidade_id && <p className="text-xs text-muted-foreground">Unidade cadastrada do produto: {unidadePorId.get(produtoPorId.get(formulario.produtoId)?.unidade_id ?? "")?.sigla ?? "—"}.</p>}
              </div>

              <div className="space-y-2">
                <Label>Fator de consumo *</Label>
                <Input type="number" min="0" step="0.000001" value={formulario.fator} onChange={(event) => atualizarFormulario("fator", event.target.value)} placeholder="Ex.: 2,5" />
                <p className="text-xs text-muted-foreground">Quantidade de consumo para cada uma unidade da base.</p>
              </div>

              <div className="space-y-2">
                <Label>Unidade da base *</Label>
                <Combobox
                  opcoes={unidadesAtivas.map((item) => ({ value: item.id, label: `${item.sigla} — ${item.descricao}` }))}
                  value={formulario.unidadeBaseId || null}
                  onChange={(value) => atualizarFormulario("unidadeBaseId", value ?? "")}
                  placeholder="Ex.: HORA"
                  vazio="Nenhuma unidade encontrada."
                />
              </div>

              <div className="space-y-2">
                <Label>Unidade do consumo *</Label>
                <Combobox
                  opcoes={unidadesAtivas.map((item) => ({ value: item.id, label: `${item.sigla} — ${item.descricao}` }))}
                  value={formulario.unidadeConsumoId || null}
                  onChange={(value) => atualizarFormulario("unidadeConsumoId", value ?? "")}
                  placeholder="Usar unidade do produto"
                  vazio="Nenhuma unidade encontrada."
                />
              </div>

              <div className="space-y-2">
                <Label>Direcionador *</Label>
                <Select
                  value={formulario.direcionador}
                  onValueChange={(valor) => setFormulario((atual) => ({ ...atual, direcionador: valor as RegraConsumoEquipamentoDirecionador, periodicidade: valor === "PERIODO" ? atual.periodicidade : "" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIRECIONADORES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Periodicidade</Label>
                <Select
                  value={formulario.periodicidade || "__nenhuma__"}
                  onValueChange={(valor) => atualizarFormulario("periodicidade", valor === "__nenhuma__" ? "" : valor as RegraConsumoEquipamentoPeriodicidade)}
                  disabled={formulario.direcionador !== "PERIODO"}
                >
                  <SelectTrigger><SelectValue placeholder="Sem periodicidade" /></SelectTrigger>
                  <SelectContent><SelectItem value="__nenhuma__">Sem periodicidade</SelectItem>{PERIODICIDADES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Início da vigência</Label>
                <Input type="date" value={formulario.vigenciaInicio} onChange={(event) => atualizarFormulario("vigenciaInicio", event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Fim da vigência</Label>
                <Input type="date" value={formulario.vigenciaFim} onChange={(event) => atualizarFormulario("vigenciaFim", event.target.value)} />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Observação</Label>
                <textarea value={formulario.observacao} onChange={(event) => atualizarFormulario("observacao", event.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Fonte do parâmetro, condição de uso ou justificativa..." />
              </div>

              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={formulario.ativo} onChange={(event) => atualizarFormulario("ativo", event.target.checked)} className="size-4 rounded border-input accent-primary" />
                <span>Regra ativa para novos cálculos</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : "Salvar regra"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
