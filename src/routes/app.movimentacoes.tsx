import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox } from "@/components/common/Combobox";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { repo } from "@/services/repo";
import { formatarData, num } from "@/utils/format";
import type { Movimentacao } from "@/types";

export const Route = createFileRoute("/app/movimentacoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Movimentações do Almoxarifado — Entradas e Saídas" },
      {
        name: "description",
        content:
          "Tabela completa de movimentações com pesquisa, filtros, ordenação, paginação, detalhes e exclusão com confirmação.",
      },
      { property: "og:title", content: "Movimentações do Almoxarifado" },
      {
        property: "og:description",
        content: "Histórico completo de entradas, saídas, devoluções, ajustes e transferências.",
      },
    ],
  }),
  component: MovimentacoesPage,
});

const TIPOS = ["ENTRADA", "SAIDA", "DEVOLUCAO", "AJUSTE", "TRANSFERENCIA"] as const;
const PAGINA = 25;

export function MovimentacoesPage() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [localId, setLocalId] = useState<string | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pagina, setPagina] = useState(0);
  const [detalhe, setDetalhe] = useState<Movimentacao | null>(null);

  const nomeMap = useMemo(() => {
    if (!dados) return null;
    return {
      produto: new Map(dados.produtos.map((p) => [p.id, p])),
      unidade: new Map(dados.unidades.map((u) => [u.id, u])),
      func: new Map(dados.funcionarios.map((f) => [f.id, f.nome])),
      empresa: new Map(dados.empresas.map((e) => [e.id, e.nome])),
      local: new Map(dados.locais.map((l) => [l.id, l.nome])),
      equipe: new Map(dados.equipes.map((e) => [e.id, e.nome])),
    };
  }, [dados]);

  if (!dados || !nomeMap) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const filtradas = dados.movimentacoes.filter((m) => {
    if (tipo && m.tipo !== tipo) return false;
    if (produtoId && m.produto_id !== produtoId) return false;
    if (funcionarioId && m.funcionario_id !== funcionarioId) return false;
    if (empresaId && m.empresa_id !== empresaId) return false;
    if (localId && m.local_id !== localId) return false;
    if (equipeId && m.equipe_id !== equipeId) return false;
    if (de && m.data < de) return false;
    if (ate && m.data > ate) return false;
    if (q) {
      const alvo = [
        nomeMap.produto.get(m.produto_id)?.nome,
        nomeMap.func.get(m.funcionario_id ?? ""),
        nomeMap.empresa.get(m.empresa_id ?? ""),
        nomeMap.local.get(m.local_id ?? ""),
        nomeMap.equipe.get(m.equipe_id),
        m.observacao,
      ]
        .join(" ")
        .toLowerCase();
      if (!alvo.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const paginas = Math.max(1, Math.ceil(filtradas.length / PAGINA));
  const page = Math.min(pagina, paginas - 1);
  const visiveis = filtradas.slice(page * PAGINA, page * PAGINA + PAGINA);

  const excluir = async (m: Movimentacao) => {
    if (!confirm("Excluir esta movimentação? A ação não pode ser desfeita.")) return;
    await repo.deleteMovimentacao(m.id);
    toast.success("Movimentação excluída");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase">Movimentações</h1>
        <p className="text-sm text-muted-foreground">
          {num(filtradas.length)} registro(s) encontrados.
        </p>
      </div>

      <Card>
        <CardHeader className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Pesquisa</Label>
            <Input
              placeholder="Produto, pessoa, local…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPagina(0);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Combobox
              placeholder="Todos"
              value={tipo}
              onChange={(v) => {
                setTipo(v);
                setPagina(0);
              }}
              opcoes={TIPOS.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Produto</Label>
            <Combobox
              placeholder="Todos"
              value={produtoId}
              onChange={(v) => {
                setProdutoId(v);
                setPagina(0);
              }}
              opcoes={dados.produtos.map((p) => ({ value: p.id, label: p.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Funcionário</Label>
            <Combobox
              placeholder="Todos"
              value={funcionarioId}
              onChange={(v) => {
                setFuncionarioId(v);
                setPagina(0);
              }}
              opcoes={dados.funcionarios.map((f) => ({ value: f.id, label: f.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Empresa</Label>
            <Combobox
              placeholder="Todas"
              value={empresaId}
              onChange={(v) => {
                setEmpresaId(v);
                setPagina(0);
              }}
              opcoes={dados.empresas.map((e) => ({ value: e.id, label: e.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Local</Label>
            <Combobox
              placeholder="Todos"
              value={localId}
              onChange={(v) => {
                setLocalId(v);
                setPagina(0);
              }}
              opcoes={dados.locais.map((l) => ({ value: l.id, label: l.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estoque</Label>
            <Combobox
              placeholder="Todos"
              value={equipeId}
              onChange={(v) => {
                setEquipeId(v);
                setPagina(0);
              }}
              opcoes={dados.equipes.map((e) => ({ value: e.id, label: e.nome }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              value={de}
              onChange={(e) => {
                setDe(e.target.value);
                setPagina(0);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              value={ate}
              onChange={(e) => {
                setAte(e.target.value);
                setPagina(0);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>Un.</TableHead>
                <TableHead>Funcionário</TableHead>
                <TableHead>Encarregado</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((m) => {
                const p = nomeMap.produto.get(m.produto_id);
                return (
                  <TableRow key={m.id}>
                    <TableCell>{formatarData(m.data)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{m.tipo}</Badge>
                    </TableCell>
                    <TableCell className="max-w-56 truncate font-medium">
                      {p?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="num text-right">{num(m.quantidade)}</TableCell>
                    <TableCell>
                      {p?.unidade_id ? (nomeMap.unidade.get(p.unidade_id)?.sigla ?? "—") : "—"}
                    </TableCell>
                    <TableCell>{nomeMap.func.get(m.funcionario_id ?? "") ?? "—"}</TableCell>
                    <TableCell>{nomeMap.func.get(m.encarregado_id ?? "") ?? "—"}</TableCell>
                    <TableCell>{nomeMap.empresa.get(m.empresa_id ?? "") ?? "—"}</TableCell>
                    <TableCell>{nomeMap.local.get(m.local_id ?? "") ?? "—"}</TableCell>
                    <TableCell>{nomeMap.equipe.get(m.equipe_id) ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button size="icon" variant="ghost" onClick={() => setDetalhe(m)}>
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => excluir(m)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {visiveis.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground">
                    Nenhuma movimentação encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Página {page + 1} de {paginas}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPagina(page - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= paginas - 1}
                onClick={() => setPagina(page + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da movimentação</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Data", formatarData(detalhe.data)],
                ["Tipo", detalhe.tipo],
                ["Produto", nomeMap.produto.get(detalhe.produto_id)?.nome ?? "—"],
                ["Quantidade", num(detalhe.quantidade)],
                ["Funcionário", nomeMap.func.get(detalhe.funcionario_id ?? "") ?? "—"],
                ["Encarregado", nomeMap.func.get(detalhe.encarregado_id ?? "") ?? "—"],
                ["Empresa", nomeMap.empresa.get(detalhe.empresa_id ?? "") ?? "—"],
                ["Local", nomeMap.local.get(detalhe.local_id ?? "") ?? "—"],
                ["Equipe", nomeMap.equipe.get(detalhe.equipe_id) ?? "—"],
                ["Observação", detalhe.observacao ?? "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs uppercase text-muted-foreground">{k as string}</dt>
                  <dd className="font-medium">{v as string}</dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
