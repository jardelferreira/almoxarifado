import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/common/Combobox";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { repo } from "@/services/repo";
import { estoqueDoProduto } from "@/services/estoque";
import { formatarData, hoje, num } from "@/utils/format";
import type { Movimentacao, MovimentacaoTipo } from "@/types";

export const Route = createFileRoute("/app/lancar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Lançar Movimentação — Saída, Entrada, Devolução e Ajuste" },
      {
        name: "description",
        content:
          "Fluxo rápido para lançar saídas, entradas, devoluções, ajustes e transferências de materiais do almoxarifado.",
      },
      { property: "og:title", content: "Lançar Movimentação" },
      {
        property: "og:description",
        content: "Lançamento rápido de saída, entrada, devolução, ajuste e transferência.",
      },
    ],
  }),
  component: LancarPage,
});

type Campo = "funcionario" | "empresa" | "local" | "sinal";

const CONFIG: Record<
  string,
  { tipo: MovimentacaoTipo; titulo: string; campos: Campo[]; descricao: string }
> = {
  saida: {
    tipo: "SAIDA",
    titulo: "Saída",
    descricao:
      "Retirada de material do almoxarifado. Selecione o produto para ver a quantidade disponível.",
    campos: ["funcionario", "local"],
  },
  entrada: {
    tipo: "ENTRADA",
    titulo: "Entrada",
    descricao: "Recebimento de material. Aumenta o estoque.",
    campos: ["empresa", "local"],
  },
  devolucao: {
    tipo: "DEVOLUCAO",
    titulo: "Devolução",
    descricao: "Selecione a saída de origem e informe a quantidade devolvida.",
    campos: [],
  },
  ajuste: {
    tipo: "AJUSTE",
    titulo: "Ajuste",
    descricao: "Correção de inventário. Exige motivo e confirmação.",
    campos: ["sinal", "local"],
  },
  transferencia: {
    tipo: "TRANSFERENCIA",
    titulo: "Transferência",
    descricao: "Move material entre locais, respeitando o estoque disponível.",
    campos: [],
  },
};

function LancarPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase">Lançar movimentação</h1>
        <p className="text-sm text-muted-foreground">
          Escolha o tipo e registre em poucos cliques.
        </p>
      </div>
      <Tabs defaultValue="saida">
        <TabsList>
          {Object.entries(CONFIG).map(([k, c]) => (
            <TabsTrigger key={k} value={k}>
              {c.titulo}
            </TabsTrigger>
          ))}
        </TabsList>
        {Object.keys(CONFIG).map((k) => (
          <TabsContent key={k} value={k}>
            {k === "devolucao" ? <FormularioDevolucao /> : <Formulario modo={k} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formulário padrão (saída, entrada, ajuste, transferência)          */
/* ------------------------------------------------------------------ */

function Formulario({ modo }: { modo: string }) {
  const cfg = CONFIG[modo]!;
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [data, setData] = useState(hoje());
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [localId, setLocalId] = useState<string | null>(null);
  const [localDestinoId, setLocalDestinoId] = useState<string | null>(null);
  const [respOrigemId, setRespOrigemId] = useState<string | null>(null);
  const [respDestinoId, setRespDestinoId] = useState<string | null>(null);
  const [sinal, setSinal] = useState<1 | -1>(1);
  const [observacao, setObservacao] = useState("");

  const produtos = useMemo(() => (dados?.produtos ?? []).filter((p) => p.ativo), [dados]);

  if (!dados || !projetoId) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const produto = dados.produtos.find((p) => p.id === produtoId);
  const unidade = produto?.unidade_id
    ? dados.unidades.find((u) => u.id === produto.unidade_id)
    : undefined;
  const atual =
    produtoId && equipeId ? estoqueDoProduto(dados.movimentacoes, produtoId, equipeId) : 0;
  const limitaEstoque = cfg.tipo === "SAIDA" || cfg.tipo === "TRANSFERENCIA";
  const disponivel = Math.max(atual, 0);
  const qtd = Number(quantidade.replace(",", ".")) || 0;
  const efeitoQtd =
    cfg.tipo === "SAIDA"
      ? -qtd
      : cfg.tipo === "AJUSTE"
        ? sinal * qtd
        : cfg.tipo === "TRANSFERENCIA"
          ? 0
          : qtd;
  const resultante = atual + efeitoQtd;

  // Funcionário define encarregado e empresa automaticamente
  const funcionario = dados.funcionarios.find((f) => f.id === funcionarioId);
  const encarregadoAuto = funcionario?.encarregado_id
    ? dados.funcionarios.find((f) => f.id === funcionario.encarregado_id)
    : undefined;
  const empresaAuto = funcionario?.empresa_id
    ? dados.empresas.find((e) => e.id === funcionario.empresa_id)
    : undefined;

  const limpar = () => {
    setProdutoId(null);
    setQuantidade("");
    setObservacao("");
  };

  const salvar = async () => {
    if (!equipeId) {
      toast.error("Defina a equipe responsável pelo estoque");
      return;
    }
    if (!produtoId) {
      toast.error("Selecione primeiro o produto");
      return;
    }
    if (!(qtd > 0)) {
      toast.error("Informe uma quantidade maior que zero");
      return;
    }
    if (limitaEstoque && qtd > disponivel) {
      toast.error(`Quantidade acima do disponível (${num(disponivel)} ${unidade?.sigla ?? ""})`);
      return;
    }
    if (!data) {
      toast.error("Informe a data");
      return;
    }
    if (cfg.tipo === "TRANSFERENCIA" && (!localId || !localDestinoId)) {
      toast.error("Informe local de origem e destino");
      return;
    }
    if (cfg.tipo === "ENTRADA") {
      const empresa = dados.empresas.find((e) => e.id === empresaId);
      if (!empresa || empresa.tipo !== "FORNECEDOR") {
        toast.error("Selecione uma empresa do tipo fornecedor");
        return;
      }
    }
    if (cfg.tipo === "SAIDA") {
      const empresa = dados.empresas.find((e) => e.id === funcionario?.empresa_id);
      if (empresa?.tipo === "FORNECEDOR") {
        toast.error("Saídas não podem ser vinculadas a um fornecedor");
        return;
      }
    }
    if (cfg.tipo === "AJUSTE" && !observacao.trim()) {
      toast.error("Informe o motivo do ajuste");
      return;
    }
    if (resultante < 0 && cfg.tipo !== "TRANSFERENCIA") {
      const ok = confirm(
        `Esta operação deixa o estoque negativo (${num(resultante)} ${unidade?.sigla ?? ""}). Confirmar mesmo assim?`,
      );
      if (!ok) return;
    }
    if (cfg.tipo === "AJUSTE" && !confirm("Confirmar ajuste de estoque?")) return;

    const base: Omit<Movimentacao, "id"> = {
      projeto_id: projetoId,
      data,
      tipo: cfg.tipo,
      produto_id: produtoId,
      quantidade: qtd,
      sinal: cfg.tipo === "AJUSTE" ? sinal : 1,
      funcionario_id: funcionarioId,
      encarregado_id: funcionario?.encarregado_id ?? null,
      empresa_id: cfg.campos.includes("funcionario")
        ? (funcionario?.empresa_id ?? null)
        : empresaId,
      local_id: localId,
      equipe_id: equipeId,
      observacao: observacao.trim() || null,
    };

    if (cfg.tipo === "TRANSFERENCIA") {
      const nomeOrigem = dados.locais.find((l) => l.id === localId)?.nome ?? "";
      const nomeDestino = dados.locais.find((l) => l.id === localDestinoId)?.nome ?? "";
      const respO = dados.funcionarios.find((f) => f.id === respOrigemId)?.nome ?? "—";
      const respD = dados.funcionarios.find((f) => f.id === respDestinoId)?.nome ?? "—";
      const nota = [
        `Responsável origem: ${respO}`,
        `Responsável destino: ${respD}`,
        observacao.trim(),
      ]
        .filter(Boolean)
        .join(" | ");

      await repo.saveMovimentacao({
        ...base,
        sinal: -1,
        local_id: localId,
        local_destino_id: localDestinoId,
        funcionario_id: respOrigemId,
        observacao: `Transferência para ${nomeDestino}. ${nota}`.trim(),
      });
      await repo.saveMovimentacao({
        ...base,
        sinal: 1,
        local_id: localDestinoId,
        funcionario_id: respDestinoId,
        observacao: `Transferência de ${nomeOrigem}. ${nota}`.trim(),
      });
    } else {
      await repo.saveMovimentacao(base);
    }
    toast.success(`${cfg.titulo} registrada`);
    limpar();
  };

  const opt = <T extends { id: string; nome: string }>(arr: T[]) =>
    arr.map((x) => ({ value: x.id, label: x.nome }));
  const funcAtivos = dados.funcionarios.filter((f) => {
    if (f.status !== "ATIVO") return false;
    const empresa = dados.empresas.find((e) => e.id === f.empresa_id);
    return empresa?.tipo !== "FORNECEDOR";
  });
  const empAtivas = dados.empresas.filter(
    (e) => e.ativo && (cfg.tipo === "ENTRADA" ? e.tipo === "FORNECEDOR" : true),
  );
  const locAtivos = dados.locais.filter((l) => l.ativo);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{cfg.titulo}</CardTitle>
          <p className="text-sm text-muted-foreground">{cfg.descricao}</p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Equipe responsável pelo estoque</Label>
            <Combobox
              placeholder="Selecionar equipe"
              value={equipeId}
              onChange={(v) => {
                setEquipeId(v);
                setProdutoId(null);
                setQuantidade("");
              }}
              opcoes={dados.equipes
                .filter((e) => e.ativo)
                .map((e) => ({ value: e.id, label: e.nome }))}
            />
            <p className="text-xs text-muted-foreground">
              {equipeId
                ? "Todas as movimentações ficam no saldo desta equipe."
                : "Obrigatória para registrar a movimentação."}
            </p>
          </div>
          {/* Produto sempre primeiro */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>1. Produto</Label>
            <Combobox
              placeholder="Selecionar produto"
              value={produtoId}
              onChange={(v) => {
                setProdutoId(v);
                setQuantidade("");
              }}
              opcoes={produtos.map((p) => ({
                value: p.id,
                label: p.nome,
                hint: dados.unidades.find((u) => u.id === p.unidade_id)?.sigla,
              }))}
            />
            {produto && (
              <p className="text-xs text-muted-foreground">
                Disponível:{" "}
                <span className="num font-semibold text-foreground">
                  {num(atual)} {unidade?.sigla ?? ""}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              2. Quantidade {unidade ? `(${unidade.sigla})` : ""}
              {limitaEstoque && produto ? ` — máx. ${num(disponivel)}` : ""}
            </Label>
            <Input
              type="number"
              min={0}
              step="any"
              {...(limitaEstoque ? { max: disponivel } : {})}
              disabled={!produtoId}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="0"
            />
            {limitaEstoque && qtd > disponivel && (
              <p className="text-xs text-destructive">Acima do disponível ({num(disponivel)})</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          {cfg.campos.includes("sinal") && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tipo de ajuste</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={sinal === 1 ? "default" : "outline"}
                  onClick={() => setSinal(1)}
                >
                  Ajuste positivo
                </Button>
                <Button
                  type="button"
                  variant={sinal === -1 ? "default" : "outline"}
                  onClick={() => setSinal(-1)}
                >
                  Ajuste negativo
                </Button>
              </div>
            </div>
          )}

          {cfg.campos.includes("funcionario") && (
            <>
              <div className="space-y-1.5">
                <Label>Funcionário</Label>
                <Combobox
                  placeholder="Selecionar"
                  value={funcionarioId}
                  onChange={(v) => {
                    setFuncionarioId(v);
                    const equipeRaiz = dados.funcionarios.find((f) => f.id === v)?.equipe_raiz_id;
                    if (equipeRaiz) setEquipeId(equipeRaiz);
                  }}
                  opcoes={opt(funcAtivos)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Encarregado (automático)</Label>
                <Input readOnly value={encarregadoAuto?.nome ?? ""} placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label>Empresa (automático)</Label>
                <Input readOnly value={empresaAuto?.nome ?? ""} placeholder="—" />
              </div>
            </>
          )}

          {cfg.campos.includes("empresa") && (
            <div className="space-y-1.5">
              <Label>{cfg.tipo === "ENTRADA" ? "Fornecedor" : "Empresa"}</Label>
              <Combobox
                placeholder="Selecionar"
                value={empresaId}
                onChange={setEmpresaId}
                opcoes={opt(empAtivas)}
              />
            </div>
          )}

          {cfg.campos.includes("local") && (
            <div className="space-y-1.5">
              <Label>Local</Label>
              <Combobox
                placeholder="Selecionar"
                value={localId}
                onChange={setLocalId}
                opcoes={opt(locAtivos)}
              />
            </div>
          )}

          {cfg.tipo === "TRANSFERENCIA" && (
            <>
              <div className="space-y-1.5">
                <Label>Local de origem</Label>
                <Combobox
                  placeholder="Selecionar"
                  value={localId}
                  onChange={setLocalId}
                  opcoes={opt(locAtivos)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Local de destino</Label>
                <Combobox
                  placeholder="Selecionar"
                  value={localDestinoId}
                  onChange={setLocalDestinoId}
                  opcoes={opt(locAtivos)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável pela origem</Label>
                <Combobox
                  placeholder="Selecionar"
                  value={respOrigemId}
                  onChange={setRespOrigemId}
                  opcoes={opt(funcAtivos)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável pelo destino</Label>
                <Combobox
                  placeholder="Selecionar"
                  value={respDestinoId}
                  onChange={setRespDestinoId}
                  opcoes={opt(funcAtivos)}
                />
              </div>
            </>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{cfg.tipo === "AJUSTE" ? "Motivo / observação" : "Observação"}</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button onClick={salvar}>Registrar {cfg.titulo.toLowerCase()}</Button>
            <Button variant="outline" onClick={limpar}>
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <ResumoProduto
        nome={produto?.nome}
        sigla={unidade?.sigla}
        minimo={produto?.estoque_minimo ?? 0}
        atual={atual}
        resultante={resultante}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Devolução — baseada numa saída existente                            */
/* ------------------------------------------------------------------ */

function FormularioDevolucao() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [data, setData] = useState(hoje());
  const [origemId, setOrigemId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");

  if (!dados || !projetoId) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const saidas = dados.movimentacoes.filter((m) => m.tipo === "SAIDA");
  const devolvidoPor = (saidaId: string) =>
    dados.movimentacoes
      .filter((m) => m.tipo === "DEVOLUCAO" && m.movimentacao_origem_id === saidaId)
      .reduce((a, m) => a + m.quantidade, 0);

  const nomeProduto = (id: string) => dados.produtos.find((p) => p.id === id)?.nome ?? "—";
  const nomeFunc = (id?: string | null) => dados.funcionarios.find((f) => f.id === id)?.nome ?? "—";

  const opcoes = saidas
    .map((m) => {
      const restante = m.quantidade - devolvidoPor(m.id);
      return { m, restante };
    })
    .filter((x) => x.restante > 0)
    .map(({ m, restante }) => ({
      value: m.id,
      label: `${formatarData(m.data)} · ${nomeProduto(m.produto_id)} · ${nomeFunc(m.funcionario_id)}`,
      hint: `restam ${num(restante)}`,
    }));

  const origem = saidas.find((m) => m.id === origemId);
  const produto = origem ? dados.produtos.find((p) => p.id === origem.produto_id) : undefined;
  const unidade = produto?.unidade_id
    ? dados.unidades.find((u) => u.id === produto.unidade_id)
    : undefined;
  const entregue = origem?.quantidade ?? 0;
  const jaDevolvido = origem ? devolvidoPor(origem.id) : 0;
  const maximo = Math.max(entregue - jaDevolvido, 0);
  const qtd = Number(quantidade.replace(",", ".")) || 0;
  const atual = origem
    ? estoqueDoProduto(dados.movimentacoes, origem.produto_id, origem.equipe_id)
    : 0;

  const salvar = async () => {
    if (!origem) {
      toast.error("Selecione a movimentação de saída");
      return;
    }
    if (!(qtd > 0)) {
      toast.error("A quantidade devolvida deve ser maior que zero");
      return;
    }
    if (qtd > maximo) {
      toast.error(`A devolução não pode passar de ${num(maximo)} ${unidade?.sigla ?? ""}`);
      return;
    }
    await repo.saveMovimentacao({
      projeto_id: projetoId,
      data,
      tipo: "DEVOLUCAO",
      produto_id: origem.produto_id,
      quantidade: qtd,
      sinal: 1,
      funcionario_id: origem.funcionario_id ?? null,
      encarregado_id: origem.encarregado_id ?? null,
      empresa_id: origem.empresa_id ?? null,
      local_id: origem.local_id ?? null,
      equipe_id: origem.equipe_id,
      movimentacao_origem_id: origem.id,
      observacao:
        `Devolução da saída de ${formatarData(origem.data)} (${nomeFunc(origem.funcionario_id)}). ${observacao.trim()}`.trim(),
    });
    toast.success("Devolução registrada");
    setOrigemId(null);
    setQuantidade("");
    setObservacao("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Devolução</CardTitle>
          <p className="text-sm text-muted-foreground">{CONFIG["devolucao"]!.descricao}</p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>1. Movimentação de saída</Label>
            <Combobox
              placeholder="Selecionar saída"
              vazio="Nenhuma saída pendente de devolução"
              value={origemId}
              onChange={(v) => {
                setOrigemId(v);
                setQuantidade("");
              }}
              opcoes={opcoes}
            />
          </div>

          {origem && (
            <div className="sm:col-span-2 grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-4">
              <Campo titulo="Produto" valor={nomeProduto(origem.produto_id)} />
              <Campo titulo="Entregue" valor={`${num(entregue)} ${unidade?.sigla ?? ""}`} />
              <Campo titulo="Já devolvido" valor={num(jaDevolvido)} />
              <Campo titulo="Pode devolver" valor={num(maximo)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              2. Quantidade a devolver {unidade ? `(${unidade.sigla})` : ""}
              {origem ? ` — máx. ${num(maximo)}` : ""}
            </Label>
            <Input
              type="number"
              min={0}
              max={maximo}
              step="any"
              disabled={!origem}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="0"
            />
            {qtd > maximo && (
              <p className="text-xs text-destructive">Acima do permitido ({num(maximo)})</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observação</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          <div className="sm:col-span-2 flex gap-2">
            <Button onClick={salvar} disabled={!origem || !(qtd > 0) || qtd > maximo}>
              Registrar devolução
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setOrigemId(null);
                setQuantidade("");
                setObservacao("");
              }}
            >
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <ResumoProduto
        nome={produto?.nome}
        sigla={unidade?.sigla}
        minimo={produto?.estoque_minimo ?? 0}
        atual={atual}
        resultante={atual + qtd}
      />
    </div>
  );
}

function Campo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{titulo}</p>
      <p className="num font-medium">{valor}</p>
    </div>
  );
}

function ResumoProduto({
  nome,
  sigla,
  minimo,
  atual,
  resultante,
}: {
  nome?: string | undefined;
  sigla?: string | undefined;
  minimo: number;
  atual: number;
  resultante: number;
}) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">Resumo do produto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!nome ? (
          <p className="text-muted-foreground">Selecione um produto para ver o estoque.</p>
        ) : (
          <>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Produto</p>
              <p className="font-medium">{nome}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Unidade</p>
                <p className="font-medium">{sigla ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Estoque mínimo</p>
                <p className="num font-medium">{num(minimo)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Estoque atual</p>
                <p className="num font-display text-2xl font-bold">{num(atual)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Após lançamento</p>
                <p
                  className={`num font-display text-2xl font-bold ${resultante < 0 ? "text-destructive" : ""}`}
                >
                  {num(resultante)}
                </p>
              </div>
            </div>
            {resultante < minimo && (
              <Badge className="bg-warning text-warning-foreground">
                Ficará abaixo do estoque mínimo
              </Badge>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
