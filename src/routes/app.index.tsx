import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  ListChecks,
  PackageCheck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/common/StatCard";
import { Combobox } from "@/components/common/Combobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { agruparPorPeriodo, consumoPor, montarEstoque } from "@/services/estoque";
import { formatarData, num } from "@/utils/format";

export const Route = createFileRoute("/app/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard do Almoxarifado — Consumo e Estoque" },
      {
        name: "description",
        content:
          "Indicadores de estoque, consumo por período, top materiais, consumo por local, empresa e encarregado do almoxarifado.",
      },
      { property: "og:title", content: "Dashboard do Almoxarifado" },
      {
        property: "og:description",
        content: "Indicadores de estoque e consumo calculados a partir das movimentações.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string | null>(null);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [localId, setLocalId] = useState<string | null>(null);
  const [encarregadoId, setEncarregadoId] = useState<string | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<"dia" | "semana" | "mes">("dia");
  const [soCriticos, setSoCriticos] = useState(false);

  const filtrados = useMemo(() => {
    if (!dados) return [];
    const prodCat = new Map(dados.produtos.map((p) => [p.id, p.categoria_id ?? ""]));
    return dados.movimentacoes.filter((m) => {
      if (de && m.data < de) return false;
      if (ate && m.data > ate) return false;
      if (categoriaId && prodCat.get(m.produto_id) !== categoriaId) return false;
      if (tipo && m.tipo !== tipo) return false;
      if (produtoId && m.produto_id !== produtoId) return false;
      if (funcionarioId && m.funcionario_id !== funcionarioId) return false;
      if (empresaId && m.empresa_id !== empresaId) return false;
      if (localId && m.local_id !== localId) return false;
      if (encarregadoId && m.encarregado_id !== encarregadoId) return false;
      if (equipeId && m.equipe_id !== equipeId) return false;
      return true;
    });
  }, [
    dados,
    de,
    ate,
    categoriaId,
    tipo,
    produtoId,
    funcionarioId,
    empresaId,
    localId,
    encarregadoId,
    equipeId,
  ]);

  const estoque = useMemo(
    () =>
      dados
        ? montarEstoque(dados.produtos, filtrados, dados.unidades, dados.categorias, dados.equipes)
        : [],
    [dados, filtrados],
  );

  if (!dados) return <p className="text-sm text-muted-foreground">Carregando dados…</p>;

  const nomeDe = <T extends { id: string }>(arr: T[], get: (x: T) => string) => {
    const map = new Map(arr.map((x) => [x.id, get(x)]));
    return (id: string) => map.get(id) ?? "—";
  };
  const nomeProduto = nomeDe(dados.produtos, (p) => p.nome);
  const nomeLocal = nomeDe(dados.locais, (l) => l.nome);
  const nomeEmpresa = nomeDe(dados.empresas, (e) => e.nome);
  const nomeFunc = nomeDe(dados.funcionarios, (f) => f.nome);

  const entradas = filtrados
    .filter((m) => m.tipo === "ENTRADA" || m.tipo === "DEVOLUCAO")
    .reduce((a, m) => a + m.quantidade, 0);
  const saidas = filtrados.filter((m) => m.tipo === "SAIDA").reduce((a, m) => a + m.quantidade, 0);
  const criticos = estoque.filter((e) => e.baixo);
  const comEstoque = estoque.filter((e) => e.estoque > 0);

  const serie = agruparPorPeriodo(filtrados, grupo);
  const topMateriais = consumoPor(filtrados, (m) => m.produto_id, nomeProduto, 8);
  const porLocal = consumoPor(filtrados, (m) => m.local_id, nomeLocal, 6);
  const porEmpresa = consumoPor(filtrados, (m) => m.empresa_id, nomeEmpresa, 6);
  const porEncarregado = consumoPor(filtrados, (m) => m.encarregado_id, nomeFunc, 6);

  const tabela = (soCriticos ? criticos : estoque)
    .slice()
    .sort((a, b) => a.estoque - a.minimo - (b.estoque - b.minimo))
    .slice(0, 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Estoque e consumo calculados a partir de {num(dados.movimentacoes.length)} movimentações
          do projeto.
        </p>
      </div>

      {/* Filtros globais */}
      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Categoria</Label>
            <Combobox
              placeholder="Todas"
              value={categoriaId}
              onChange={setCategoriaId}
              opcoes={dados.categorias.map((c) => ({ value: c.id, label: c.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Combobox
              placeholder="Todos"
              value={tipo}
              onChange={setTipo}
              opcoes={[
                { value: "ENTRADA", label: "Entrada" },
                { value: "SAIDA", label: "Saída" },
                { value: "DEVOLUCAO", label: "Devolução" },
                { value: "AJUSTE", label: "Ajuste" },
                { value: "TRANSFERENCIA", label: "Transferência" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Produto</Label>
            <Combobox
              placeholder="Todos"
              value={produtoId}
              onChange={setProdutoId}
              opcoes={dados.produtos.map((p) => ({ value: p.id, label: p.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Funcionário</Label>
            <Combobox
              placeholder="Todos"
              value={funcionarioId}
              onChange={setFuncionarioId}
              opcoes={dados.funcionarios.map((f) => ({ value: f.id, label: f.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Empresa</Label>
            <Combobox
              placeholder="Todas"
              value={empresaId}
              onChange={setEmpresaId}
              opcoes={dados.empresas.map((c) => ({ value: c.id, label: c.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Local</Label>
            <Combobox
              placeholder="Todos"
              value={localId}
              onChange={setLocalId}
              opcoes={dados.locais.map((c) => ({ value: c.id, label: c.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Encarregado</Label>
            <Combobox
              placeholder="Todos"
              value={encarregadoId}
              onChange={setEncarregadoId}
              opcoes={dados.funcionarios.map((c) => ({ value: c.id, label: c.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estoque / equipe</Label>
            <Combobox
              placeholder="Todos"
              value={equipeId}
              onChange={setEquipeId}
              opcoes={dados.equipes.map((e) => ({ value: e.id, label: e.nome }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Movimentações"
          valor={num(filtrados.length)}
          icon={ListChecks}
          sub="no filtro atual"
        />
        <StatCard label="Itens de estoque" valor={num(estoque.length)} icon={Boxes} />
        <StatCard
          label="Com estoque"
          valor={num(comEstoque.length)}
          icon={PackageCheck}
          tone="success"
        />
        <StatCard
          label="Abaixo do mínimo"
          valor={num(criticos.length)}
          icon={AlertTriangle}
          tone="warning"
          sub="clique para ver críticos"
          onClick={() => setSoCriticos(true)}
        />
        <StatCard label="Entradas" valor={num(entradas)} icon={ArrowDownCircle} tone="success" />
        <StatCard label="Saídas" valor={num(saidas)} icon={ArrowUpCircle} tone="danger" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Consumo ao longo do tempo</CardTitle>
          <div className="flex gap-1">
            {(["dia", "semana", "mes"] as const).map((g) => (
              <Button
                key={g}
                size="sm"
                variant={grupo === g ? "default" : "outline"}
                onClick={() => setGrupo(g)}
              >
                {g === "mes" ? "mês" : g}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="h-72">
          {serie.length === 0 ? (
            <Vazio />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="saidas"
                  name="Saídas"
                  stroke="var(--chart-5)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="entradas"
                  name="Entradas"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoBarras
          titulo="Top materiais consumidos"
          dados={topMateriais}
          cor="var(--chart-1)"
        />
        <GraficoBarras titulo="Consumo por local" dados={porLocal} cor="var(--chart-2)" />
        <GraficoBarras titulo="Consumo por empresa" dados={porEmpresa} cor="var(--chart-4)" />
        <GraficoBarras
          titulo="Consumo por encarregado"
          dados={porEncarregado}
          cor="var(--chart-3)"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            {soCriticos ? "Estoque crítico" : "Situação do estoque"}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setSoCriticos((v) => !v)}>
            {soCriticos ? "Ver todos" : "Só críticos"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Equipe</TableHead>
                  <TableHead>Un.</TableHead>
                  <TableHead className="text-right">Atual</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabela.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nenhum produto para exibir.
                    </TableCell>
                  </TableRow>
                )}
                {tabela.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/app/estoque"
                        search={{ produto: e.produto.id }}
                        className="hover:underline"
                      >
                        {e.produto.nome}
                      </Link>
                    </TableCell>
                    <TableCell>{e.equipe.nome}</TableCell>
                    <TableCell>{e.unidade?.sigla ?? "—"}</TableCell>
                    <TableCell className="num text-right">{num(e.estoque)}</TableCell>
                    <TableCell className="num text-right">{num(e.minimo)}</TableCell>
                    <TableCell className="num text-right">{num(e.estoque - e.minimo)}</TableCell>
                    <TableCell>
                      {e.baixo ? (
                        <Badge className="bg-warning text-warning-foreground">Estoque baixo</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {dados.movimentacoes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Última movimentação em {formatarData(dados.movimentacoes[0]?.data)}.
        </p>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
};

function Vazio() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sem dados para o filtro selecionado.
    </div>
  );
}

function GraficoBarras({
  titulo,
  dados,
  cor,
}: {
  titulo: string;
  dados: { id: string; nome: string; total: number }[];
  cor: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {dados.length === 0 ? (
          <Vazio />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis
                type="category"
                dataKey="nome"
                width={130}
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="total" name="Quantidade" radius={[0, 4, 4, 0]}>
                {dados.map((d) => (
                  <Cell key={d.id} fill={cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
