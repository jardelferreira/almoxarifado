import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/common/Combobox";
import { useDados, useProjetoAtivoId } from "@/hooks/useAppData";
import { repo } from "@/services/repo";
import { num } from "@/utils/format";
import type { Categoria, Empresa, Equipe, Funcionario, Local, Produto, Unidade } from "@/types";

export const Route = createFileRoute("/app/cadastros")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cadastros — Produtos, Empresas, Funcionários e Locais" },
      {
        name: "description",
        content:
          "Gerencie produtos, categorias, unidades, empresas, funcionários e locais do almoxarifado com ativação e desativação.",
      },
      { property: "og:title", content: "Cadastros do Almoxarifado" },
      {
        property: "og:description",
        content: "Produtos, categorias, unidades, empresas, funcionários e locais.",
      },
    ],
  }),
  component: CadastrosPage,
});

type Aba =
  "produtos" | "categorias" | "unidades" | "empresas" | "funcionarios" | "locais" | "equipes";

function CadastrosPage() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<{ aba: Aba; item: Record<string, unknown> } | null>(
    null,
  );

  if (!dados) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const busca = (s?: string | null) => (s ?? "").toLowerCase().includes(q.toLowerCase());

  const novo = (aba: Aba) => {
    const base: Record<Aba, Record<string, unknown>> = {
      produtos: {
        nome: "",
        codigo: "",
        categoria_id: null,
        unidade_id: null,
        estoque_minimo: 0,
        ativo: true,
      },
      categorias: { nome: "", ativo: true },
      unidades: { sigla: "", descricao: "", ativo: true },
      empresas: { nome: "", tipo: "TERCEIRA", ativo: true },
      funcionarios: {
        nome: "",
        matricula: "",
        funcao: "",
        empresa_id: null,
        encarregado_id: null,
        equipe_raiz_id: null,
        status: "ATIVO",
      },
      locais: { nome: "", codigo: "", local_pai_id: null, ativo: true },
      equipes: { nome: "", descricao: "", ativo: true, estoque_segregado: true, membro_ids: [] },
    };
    setEditando({ aba, item: base[aba] });
  };

  const salvar = async () => {
    if (!editando) return;
    const { aba, item } = editando;
    const nomeCampo = aba === "unidades" ? "sigla" : "nome";
    if (!String(item[nomeCampo] ?? "").trim()) {
      toast.error("Informe o nome");
      return;
    }
    if (aba === "produtos") {
      const p = item as unknown as Produto;
      if (!p.categoria_id || !p.unidade_id) {
        toast.error("Produto precisa de categoria e unidade");
        return;
      }
      p.estoque_minimo = Number(p.estoque_minimo) || 0;
    }
    if (aba === "equipes") {
      const { membro_ids, ...dadosEquipe } = item;
      const equipe = await repo.equipes.save(dadosEquipe as unknown as Equipe);
      await repo.salvarMembrosDaEquipe(equipe.id, (membro_ids as string[] | undefined) ?? []);
      toast.success("Equipe salva");
      setEditando(null);
      return;
    }
    // @ts-expect-error acesso dinâmico ao repositório
    await repo[aba].save(item);
    toast.success("Cadastro salvo");
    setEditando(null);
  };

  const toggleAtivo = async (aba: Aba, row: object, campo: "ativo" | "status") => {
    const item = row as Record<string, unknown>;
    const novoValor =
      campo === "ativo" ? !item["ativo"] : item["status"] === "ATIVO" ? "INATIVO" : "ATIVO";
    // @ts-expect-error acesso dinâmico ao repositório
    await repo[aba].save({ ...item, [campo]: novoValor });
  };

  const nomeDe = <T extends { id: string; nome: string }>(arr: T[], id?: string | null) =>
    arr.find((x) => x.id === id)?.nome ?? "—";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase">Cadastros</h1>
        <p className="text-sm text-muted-foreground">
          Registros usados em todos os lançamentos. Desative em vez de excluir.
        </p>
      </div>

      <Tabs defaultValue="produtos">
        <TabsList className="flex-wrap">
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="funcionarios">Funcionários</TabsTrigger>
          <TabsTrigger value="locais">Locais</TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
        </TabsList>

        {(
          [
            ["produtos", "Produto"],
            ["categorias", "Categoria"],
            ["unidades", "Unidade"],
            ["empresas", "Empresa"],
            ["funcionarios", "Funcionário"],
            ["locais", "Local"],
            ["equipes", "Equipe"],
          ] as const
        ).map(([aba, label]) => (
          <TabsContent key={aba} value={aba}>
            <Card>
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <Input
                  className="max-w-sm"
                  placeholder="Pesquisar…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <Button size="sm" onClick={() => novo(aba)}>
                  <Plus className="size-4" /> Novo {label.toLowerCase()}
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{aba === "unidades" ? "Sigla" : "Nome"}</TableHead>
                      {aba === "produtos" && (
                        <>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Unidade</TableHead>
                          <TableHead className="text-right">Est. mínimo</TableHead>
                        </>
                      )}
                      {aba === "unidades" && <TableHead>Descrição</TableHead>}
                      {aba === "empresas" && <TableHead>Tipo</TableHead>}
                      {aba === "funcionarios" && (
                        <>
                          <TableHead>Função</TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Encarregado</TableHead>
                          <TableHead>Equipe raiz</TableHead>
                        </>
                      )}
                      {aba === "locais" && <TableHead>Local pai</TableHead>}
                      {aba === "equipes" && (
                        <>
                          <TableHead>Membros</TableHead>
                          <TableHead>Estoque</TableHead>
                        </>
                      )}
                      <TableHead>Ativo</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aba === "produtos" &&
                      dados.produtos
                        .filter((p) => busca(p.nome))
                        .slice(0, 300)
                        .map((p: Produto) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.nome}</TableCell>
                            <TableCell>{nomeDe(dados.categorias, p.categoria_id)}</TableCell>
                            <TableCell>
                              {dados.unidades.find((u) => u.id === p.unidade_id)?.sigla ?? "—"}
                            </TableCell>
                            <TableCell className="num text-right">
                              {num(p.estoque_minimo)}
                            </TableCell>
                            <Acoes
                              ativo={p.ativo}
                              onToggle={() => toggleAtivo("produtos", p, "ativo")}
                              onEdit={() => setEditando({ aba: "produtos", item: { ...p } })}
                            />
                          </TableRow>
                        ))}

                    {aba === "categorias" &&
                      dados.categorias
                        .filter((c) => busca(c.nome))
                        .map((c: Categoria) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.nome}</TableCell>
                            <Acoes
                              ativo={c.ativo}
                              onToggle={() => toggleAtivo("categorias", c, "ativo")}
                              onEdit={() => setEditando({ aba: "categorias", item: { ...c } })}
                            />
                          </TableRow>
                        ))}

                    {aba === "unidades" &&
                      dados.unidades
                        .filter((u) => busca(u.sigla) || busca(u.descricao))
                        .map((u: Unidade) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">{u.sigla}</TableCell>
                            <TableCell>{u.descricao}</TableCell>
                            <Acoes
                              ativo={u.ativo}
                              onToggle={() => toggleAtivo("unidades", u, "ativo")}
                              onEdit={() => setEditando({ aba: "unidades", item: { ...u } })}
                            />
                          </TableRow>
                        ))}

                    {aba === "empresas" &&
                      dados.empresas
                        .filter((e) => busca(e.nome))
                        .map((e: Empresa) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">{e.nome}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{e.tipo}</Badge>
                            </TableCell>
                            <Acoes
                              ativo={e.ativo}
                              onToggle={() => toggleAtivo("empresas", e, "ativo")}
                              onEdit={() => setEditando({ aba: "empresas", item: { ...e } })}
                            />
                          </TableRow>
                        ))}

                    {aba === "funcionarios" &&
                      dados.funcionarios
                        .filter((f) => busca(f.nome) || busca(f.matricula))
                        .slice(0, 300)
                        .map((f: Funcionario) => (
                          <TableRow key={f.id}>
                            <TableCell className="font-medium">{f.nome}</TableCell>
                            <TableCell>{f.funcao ?? "—"}</TableCell>
                            <TableCell>{nomeDe(dados.empresas, f.empresa_id)}</TableCell>
                            <TableCell>{nomeDe(dados.funcionarios, f.encarregado_id)}</TableCell>
                            <TableCell>{nomeDe(dados.equipes, f.equipe_raiz_id)}</TableCell>
                            <Acoes
                              ativo={f.status === "ATIVO"}
                              onToggle={() => toggleAtivo("funcionarios", f, "status")}
                              onEdit={() => setEditando({ aba: "funcionarios", item: { ...f } })}
                            />
                          </TableRow>
                        ))}

                    {aba === "locais" &&
                      dados.locais
                        .filter((l) => busca(l.nome))
                        .map((l: Local) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-medium">{l.nome}</TableCell>
                            <TableCell>{nomeDe(dados.locais, l.local_pai_id)}</TableCell>
                            <Acoes
                              ativo={l.ativo}
                              onToggle={() => toggleAtivo("locais", l, "ativo")}
                              onEdit={() => setEditando({ aba: "locais", item: { ...l } })}
                            />
                          </TableRow>
                        ))}

                    {aba === "equipes" &&
                      dados.equipes
                        .filter((e) => busca(e.nome))
                        .map((e: Equipe) => {
                          const membros = dados.equipeMembros.filter((m) => m.equipe_id === e.id);
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="font-medium">{e.nome}</TableCell>
                              <TableCell>{membros.length}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {e.estoque_segregado ? "Segregado" : "Compartilhado"}
                                </Badge>
                              </TableCell>
                              <Acoes
                                ativo={e.ativo}
                                onToggle={() => toggleAtivo("equipes", e, "ativo")}
                                onEdit={() =>
                                  setEditando({
                                    aba: "equipes",
                                    item: {
                                      ...e,
                                      membro_ids: membros.map((m) => m.funcionario_id),
                                    },
                                  })
                                }
                              />
                            </TableRow>
                          );
                        })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastro</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid gap-3 sm:grid-cols-2">
              {editando.aba !== "unidades" && (
                <Campo
                  label="Nome"
                  className="sm:col-span-2"
                  value={String(editando.item["nome"] ?? "")}
                  onChange={(v) =>
                    setEditando({ ...editando, item: { ...editando.item, nome: v } })
                  }
                />
              )}
              {editando.aba === "unidades" && (
                <>
                  <Campo
                    label="Sigla"
                    value={String(editando.item["sigla"] ?? "")}
                    onChange={(v) =>
                      setEditando({ ...editando, item: { ...editando.item, sigla: v } })
                    }
                  />
                  <Campo
                    label="Descrição"
                    value={String(editando.item["descricao"] ?? "")}
                    onChange={(v) =>
                      setEditando({ ...editando, item: { ...editando.item, descricao: v } })
                    }
                  />
                </>
              )}
              {editando.aba === "produtos" && (
                <>
                  <Campo
                    label="Código"
                    value={String(editando.item["codigo"] ?? "")}
                    onChange={(v) =>
                      setEditando({ ...editando, item: { ...editando.item, codigo: v } })
                    }
                  />
                  <Campo
                    label="Estoque mínimo"
                    value={String(editando.item["estoque_minimo"] ?? "0")}
                    onChange={(v) =>
                      setEditando({
                        ...editando,
                        item: { ...editando.item, estoque_minimo: v },
                      })
                    }
                  />
                  <div className="space-y-1.5">
                    <Label>Categoria</Label>
                    <Combobox
                      placeholder="Selecionar"
                      value={(editando.item["categoria_id"] as string) ?? null}
                      onChange={(v) =>
                        setEditando({
                          ...editando,
                          item: { ...editando.item, categoria_id: v },
                        })
                      }
                      opcoes={dados.categorias.map((c) => ({ value: c.id, label: c.nome }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unidade</Label>
                    <Combobox
                      placeholder="Selecionar"
                      value={(editando.item["unidade_id"] as string) ?? null}
                      onChange={(v) =>
                        setEditando({
                          ...editando,
                          item: { ...editando.item, unidade_id: v },
                        })
                      }
                      opcoes={dados.unidades.map((u) => ({
                        value: u.id,
                        label: `${u.sigla} — ${u.descricao}`,
                      }))}
                    />
                  </div>
                </>
              )}
              {editando.aba === "empresas" && (
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Combobox
                    placeholder="Selecionar"
                    value={(editando.item["tipo"] as string) ?? "TERCEIRA"}
                    onChange={(v) =>
                      setEditando({
                        ...editando,
                        item: { ...editando.item, tipo: v ?? "TERCEIRA" },
                      })
                    }
                    opcoes={[
                      { value: "PROPRIA", label: "Própria" },
                      { value: "TERCEIRA", label: "Terceira" },
                    ]}
                  />
                </div>
              )}
              {editando.aba === "funcionarios" && (
                <>
                  <Campo
                    label="Matrícula"
                    value={String(editando.item["matricula"] ?? "")}
                    onChange={(v) =>
                      setEditando({ ...editando, item: { ...editando.item, matricula: v } })
                    }
                  />
                  <Campo
                    label="Função"
                    value={String(editando.item["funcao"] ?? "")}
                    onChange={(v) =>
                      setEditando({ ...editando, item: { ...editando.item, funcao: v } })
                    }
                  />
                  <div className="space-y-1.5">
                    <Label>Empresa</Label>
                    <Combobox
                      placeholder="Selecionar"
                      value={(editando.item["empresa_id"] as string) ?? null}
                      onChange={(v) =>
                        setEditando({
                          ...editando,
                          item: { ...editando.item, empresa_id: v },
                        })
                      }
                      opcoes={dados.empresas.map((e) => ({ value: e.id, label: e.nome }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Encarregado</Label>
                    <Combobox
                      placeholder="Selecionar"
                      value={(editando.item["encarregado_id"] as string) ?? null}
                      onChange={(v) =>
                        setEditando({
                          ...editando,
                          item: { ...editando.item, encarregado_id: v },
                        })
                      }
                      opcoes={dados.funcionarios.map((f) => ({ value: f.id, label: f.nome }))}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Equipe raiz</Label>
                    <Combobox
                      placeholder="Não definida"
                      value={(editando.item["equipe_raiz_id"] as string) ?? null}
                      onChange={(v) =>
                        setEditando({
                          ...editando,
                          item: { ...editando.item, equipe_raiz_id: v },
                        })
                      }
                      opcoes={dados.equipes
                        .filter((e) => e.ativo)
                        .map((e) => ({ value: e.id, label: e.nome }))}
                    />
                  </div>
                </>
              )}
              {editando.aba === "locais" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Local pai</Label>
                  <Combobox
                    placeholder="Nenhum"
                    value={(editando.item["local_pai_id"] as string) ?? null}
                    onChange={(v) =>
                      setEditando({
                        ...editando,
                        item: { ...editando.item, local_pai_id: v },
                      })
                    }
                    opcoes={dados.locais
                      .filter((l) => l.id !== editando.item["id"])
                      .map((l) => ({ value: l.id, label: l.nome }))}
                  />
                </div>
              )}
              {editando.aba === "equipes" && (
                <>
                  <Campo
                    label="Descrição"
                    className="sm:col-span-2"
                    value={String(editando.item["descricao"] ?? "")}
                    onChange={(v) =>
                      setEditando({ ...editando, item: { ...editando.item, descricao: v } })
                    }
                  />
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Switch
                      checked={Boolean(editando.item["estoque_segregado"])}
                      onCheckedChange={(estoque_segregado) =>
                        setEditando({ ...editando, item: { ...editando.item, estoque_segregado } })
                      }
                    />
                    <Label>Usa estoque segregado</Label>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Membros</Label>
                    <SelecaoMultipla
                      opcoes={dados.funcionarios
                        .filter((f) => f.status === "ATIVO")
                        .map((f) => ({ id: f.id, nome: f.nome }))}
                      selecionados={(editando.item["membro_ids"] as string[] | undefined) ?? []}
                      onChange={(membro_ids) =>
                        setEditando({ ...editando, item: { ...editando.item, membro_ids } })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelecaoMultipla({
  opcoes,
  selecionados,
  onChange,
}: {
  opcoes: { id: string; nome: string }[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
      {opcoes.map((opcao) => {
        const marcado = selecionados.includes(opcao.id);
        return (
          <label key={opcao.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={marcado}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...selecionados, opcao.id]
                    : selecionados.filter((id) => id !== opcao.id),
                )
              }
            />
            {opcao.nome}
          </label>
        );
      })}
      {opcoes.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma opção disponível.</p>
      )}
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const id = `campo-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Acoes({
  ativo,
  onToggle,
  onEdit,
}: {
  ativo: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <>
      <TableCell>
        <Switch checked={ativo} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell className="text-right">
        <Button size="icon" variant="ghost" onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
      </TableCell>
    </>
  );
}
