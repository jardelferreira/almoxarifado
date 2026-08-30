import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/common/Combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { montarEstoque } from "@/services/estoque";
import { formatarData, num } from "@/utils/format";

type Busca = { produto?: string };

export const Route = createFileRoute("/app/estoque")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): Busca =>
    typeof search["produto"] === "string" ? { produto: search["produto"] } : {},
  head: () => ({
    meta: [
      { title: "Estoque e Histórico por Produto — Almoxarifado" },
      {
        name: "description",
        content:
          "Consulte o estoque atual de cada produto e o histórico completo de entradas, saídas, devoluções e ajustes.",
      },
      { property: "og:title", content: "Estoque e Histórico por Produto" },
      {
        property: "og:description",
        content: "Estoque atual calculado das movimentações, com histórico detalhado.",
      },
    ],
  }),
  component: EstoquePage,
});

function EstoquePage() {
  const { produto: produtoParam } = Route.useSearch();
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [q, setQ] = useState("");
  const [soBaixo, setSoBaixo] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(produtoParam ?? null);
  const [equipeId, setEquipeId] = useState<string | null>(null);

  const itens = useMemo(
    () =>
      dados
        ? montarEstoque(
            dados.produtos,
            dados.movimentacoes,
            dados.unidades,
            dados.categorias,
            dados.equipes,
            equipeId ?? undefined,
          )
        : [],
    [dados, equipeId],
  );

  if (!dados) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const filtrados = itens
    .filter((i) => i.produto.nome.toLowerCase().includes(q.toLowerCase()))
    .filter((i) => (soBaixo ? i.baixo : true))
    .sort((a, b) => a.produto.nome.localeCompare(b.produto.nome));

  const item = itens.find((i) => i.produto.id === detalhe);
  const historico = dados.movimentacoes.filter(
    (m) => m.produto_id === detalhe && (!equipeId || m.equipe_id === equipeId),
  );
  const nome = <T extends { id: string; nome: string }>(arr: T[], id?: string | null) =>
    arr.find((x) => x.id === id)?.nome ?? "—";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase">Estoque</h1>
        <p className="text-sm text-muted-foreground">
          {filtrados.length} produto(s) · calculado a partir das movimentações.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-end gap-3 space-y-0">
          <Input
            placeholder="Pesquisar produto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
          <Button
            size="sm"
            variant={soBaixo ? "default" : "outline"}
            onClick={() => setSoBaixo((v) => !v)}
          >
            Estoque baixo
          </Button>
          <div className="w-full max-w-sm space-y-1.5 sm:w-64">
            <Label className="text-xs">Saldo exibido</Label>
            <Combobox
              placeholder="Todas as equipes"
              value={equipeId}
              onChange={(v) => {
                setEquipeId(v);
                setDetalhe(null);
              }}
              opcoes={dados.equipes
                .filter((e) => e.ativo)
                .map((e) => ({ value: e.id, label: `Equipe: ${e.nome}` }))}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Un.</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.slice(0, 300).map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.produto.nome}</TableCell>
                  <TableCell>{i.equipe.nome}</TableCell>
                  <TableCell>{i.categoria?.nome ?? "—"}</TableCell>
                  <TableCell>{i.unidade?.sigla ?? "—"}</TableCell>
                  <TableCell className="num text-right">{num(i.estoque)}</TableCell>
                  <TableCell className="num text-right">{num(i.minimo)}</TableCell>
                  <TableCell>
                    {i.baixo ? (
                      <Badge className="bg-warning text-warning-foreground">Baixo</Badge>
                    ) : (
                      <Badge variant="secondary">OK</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEquipeId(i.equipe.id);
                        setDetalhe(i.produto.id);
                      }}
                    >
                      Histórico
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{item?.produto.nome ?? "Histórico"}</DialogTitle>
          </DialogHeader>
          {item && (
            <div className="mb-3 flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Estoque atual</p>
                <p className="num font-display text-2xl font-bold">
                  {num(item.estoque)} {item.unidade?.sigla ?? ""}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Estoque mínimo</p>
                <p className="num font-display text-2xl font-bold">{num(item.minimo)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Movimentações</p>
                <p className="num font-display text-2xl font-bold">{historico.length}</p>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>Funcionário</TableHead>
                <TableHead>Encarregado</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{formatarData(m.data)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{m.tipo}</Badge>
                  </TableCell>
                  <TableCell className="num text-right">
                    {(m.sinal ?? 1) < 0 || m.tipo === "SAIDA" ? "-" : "+"}
                    {num(m.quantidade)}
                  </TableCell>
                  <TableCell>{nome(dados.funcionarios, m.funcionario_id)}</TableCell>
                  <TableCell>{nome(dados.funcionarios, m.encarregado_id)}</TableCell>
                  <TableCell>{nome(dados.empresas, m.empresa_id)}</TableCell>
                  <TableCell>{nome(dados.locais, m.local_id)}</TableCell>
                  <TableCell className="max-w-40 truncate">{m.observacao ?? "—"}</TableCell>
                </TableRow>
              ))}
              {historico.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Sem movimentações para este produto.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
