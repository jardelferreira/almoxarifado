import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Building2,
  Boxes,
  FolderTree,
  MapPin,
  Pencil,
  Ruler,
  Users,
  UsersRound,
  Plus,
  Search,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronLeft,
  ChevronRight,
  Filter,
  type LucideIcon,
} from "lucide-react";
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
import { salvarFuncionario } from "@/services/funcionarios-repo";
import { criarHashPin, formatarCpf, normalizarCpf } from "@/utils/seguranca";
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

type FiltroStatus = "todos" | "ativos" | "inativos";
type Ordem = "asc" | "desc";

const TAMANHO_PAGINA = 25;

function CadastrosPage() {
  const [projetoId] = useProjetoAtivoId();
  const dados = useDados(projetoId);
  const [q, setQ] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<Aba>("produtos");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [ordem, setOrdem] = useState<Ordem>("asc");
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<{ aba: Aba; item: Record<string, unknown> } | null>(
    null,
  );

  if (!dados) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const normalizarBusca = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();

  const termosBusca = normalizarBusca(q).split(/\s+/).filter(Boolean);

  const novo = (aba: Aba) => {
    const base: Record<Aba, Record<string, unknown>> = {
      produtos: {
        nome: "",
        codigo: "",
        categoria_id: null,
        unidade_id: null,
        estoque_minimo: 0,
        inteligencia_reposicao: true,
        ativo: true,
      },
      categorias: { nome: "", ativo: true },
      unidades: { sigla: "", descricao: "", ativo: true },
      empresas: { nome: "", tipo: "TERCEIRA", ativo: true },
      funcionarios: {
        nome: "",
        cpf: "",
        pin_novo: "",
        matricula: "",
        funcao: "",
        empresa_id: null,
        encarregado_id: null,
        equipe_raiz_id: null,
        status: "ATIVO",
      },
      locais: { nome: "", codigo: "", local_pai_id: null, ativo: true },
      equipes: { nome: "", descricao: "", ativo: true, estoque_segregado: true, membros: [] },
    };
    setEditando({ aba, item: base[aba] });
  };

  const salvar = async () => {
    if (!editando || !projetoId) {
      toast.error("Nenhum projeto ativo selecionado");
      return;
    }

    const { aba, item } = editando;
    const nomeCampo = aba === "unidades" ? "sigla" : "nome";

    if (!String(item[nomeCampo] ?? "").trim()) {
      toast.error("Informe o nome");
      return;
    }

    try {
      if (aba === "produtos") {
        const p = item as unknown as Produto;

        if (!p.categoria_id || !p.unidade_id) {
          toast.error("Produto precisa de categoria e unidade");
          return;
        }

        p.estoque_minimo = Number(p.estoque_minimo) || 0;
        p.inteligencia_reposicao = p.inteligencia_reposicao !== false;
      }

      if (aba === "equipes") {
        const { membros, ...dadosEquipe } = item;

        const equipe = await repo.equipes.save(projetoId, dadosEquipe as unknown as Equipe);

        await repo.salvarMembrosDaEquipe(
          equipe.id,
          (membros as Array<{ funcionario_id: string; papel: "LIDER" | "MEMBRO" }> | undefined) ?? [],
        );

        toast.success("Equipe salva");
        setEditando(null);
        return;
      }

      if (aba === "categorias") {
        await repo.categorias.save(item as unknown as Categoria);
      } else if (aba === "unidades") {
        await repo.unidades.save(item as unknown as Unidade);
      } else if (aba === "empresas") {
        await repo.empresas.save(projetoId, item as unknown as Empresa);
      } else if (aba === "funcionarios") {
        const pinNovo = String(item["pin_novo"] ?? "").trim();
        const { pin_novo: _pinNovo, ...itemFuncionario } = item;
        const funcionarioId = String(itemFuncionario["id"] ?? "");
        const encarregadoId = (itemFuncionario["encarregado_id"] as string | null | undefined) ?? null;
        const equipeAutomatica = encarregadoId ? equipeDoEncarregado(encarregadoId) : null;
        const equipeId = encarregadoId ? equipeAutomatica : ((itemFuncionario["equipe_raiz_id"] as string | null) ?? null);
        const dadosFuncionario = {
          ...itemFuncionario,
          equipe_raiz_id: equipeId ?? undefined,
          cpf: normalizarCpf(String(itemFuncionario["cpf"] ?? "")),
        } as unknown as Funcionario;
        if (pinNovo) Object.assign(dadosFuncionario, await criarHashPin(pinNovo));
        const funcionarioSalvo = await salvarFuncionario(projetoId, dadosFuncionario);
        await repo.atualizarVinculoFuncionarioEquipe(funcionarioSalvo.id, equipeId);
      } else if (aba === "locais") {
        await repo.locais.save(projetoId, item as unknown as Local);
      } else if (aba === "produtos") {
        await repo.produtos.save(projetoId, item as unknown as Produto);
      }

      toast.success("Cadastro salvo");
      setEditando(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o cadastro.");
    }
  };

  const equipeDoEncarregado = (encarregadoId: string): string | null => {
    const encarregado = dados.funcionarios.find((funcionario) => funcionario.id === encarregadoId);
    if (!encarregado) return null;
    if (encarregado.equipe_raiz_id) return encarregado.equipe_raiz_id;
    return (
      dados.equipeMembros.find(
        (membro) => membro.funcionario_id === encarregadoId && membro.papel === "LIDER",
      )?.equipe_id ?? dados.equipeMembros.find((membro) => membro.funcionario_id === encarregadoId)?.equipe_id ?? null
    );
  };

  const toggleAtivo = async (aba: Aba, row: object, campo: "ativo" | "status") => {
    if (!projetoId) {
      toast.error("Nenhum projeto ativo selecionado");
      return;
    }

    const item = row as Record<string, unknown>;

    const novoValor =
      campo === "ativo" ? !item["ativo"] : item["status"] === "ATIVO" ? "INATIVO" : "ATIVO";

    const atualizado = {
      ...item,
      [campo]: novoValor,
    };

    if (aba === "categorias") {
      await repo.categorias.save(atualizado as unknown as Categoria);
    } else if (aba === "unidades") {
      await repo.unidades.save(atualizado as unknown as Unidade);
    } else if (aba === "empresas") {
      await repo.empresas.save(projetoId, atualizado as unknown as Empresa);
    } else if (aba === "funcionarios") {
      await repo.funcionarios.save(projetoId, atualizado as unknown as Funcionario);
    } else if (aba === "locais") {
      await repo.locais.save(projetoId, atualizado as unknown as Local);
    } else if (aba === "produtos") {
      await repo.produtos.save(projetoId, atualizado as unknown as Produto);
    } else if (aba === "equipes") {
      await repo.equipes.save(projetoId, atualizado as unknown as Equipe);
    }
  };

  const nomeDe = <T extends { id: string; nome: string }>(arr: T[], id?: string | null) =>
    arr.find((x) => x.id === id)?.nome ?? "—";

  const prepararLista = <T,>(
    itens: T[],
    texto: (item: T) => string,
    ativo?: (item: T) => boolean,
  ) => {
    const filtrados = itens.filter((item) => {
      const textoNormalizado = normalizarBusca(texto(item));
      const correspondeBusca = termosBusca.every((termo) => textoNormalizado.includes(termo));
      const correspondeStatus =
        !ativo ||
        filtroStatus === "todos" ||
        (filtroStatus === "ativos" && ativo(item)) ||
        (filtroStatus === "inativos" && !ativo(item));
      return correspondeBusca && correspondeStatus;
    });

    return filtrados.sort((a, b) => {
      const comparacao = normalizarBusca(texto(a)).localeCompare(
        normalizarBusca(texto(b)),
        "pt-BR",
        {
          numeric: true,
          sensitivity: "base",
        },
      );
      return ordem === "asc" ? comparacao : -comparacao;
    });
  };

  const listas = (() => {
    const produtos = prepararLista(
      dados.produtos,
      (p) => `${p.nome} ${p.codigo ?? ""} ${nomeDe(dados.categorias, p.categoria_id)}`,
      (p) => p.ativo,
    );
    const categorias = prepararLista(
      dados.categorias,
      (c) => c.nome,
      (c) => c.ativo,
    );
    const unidades = prepararLista(
      dados.unidades,
      (u) => `${u.sigla} ${u.descricao}`,
      (u) => u.ativo,
    );
    const empresas = prepararLista(
      dados.empresas,
      (e) => `${e.nome} ${e.tipo}`,
      (e) => e.ativo,
    );
    const funcionarios = prepararLista(
      dados.funcionarios,
      (f) => `${f.nome} ${f.matricula} ${f.cpf ?? ""} ${f.funcao ?? ""}`,
      (f) => f.status === "ATIVO",
    );
    const locais = prepararLista(
      dados.locais,
      (l) => `${l.nome} ${l.codigo ?? ""} ${nomeDe(dados.locais, l.local_pai_id)}`,
      (l) => l.ativo,
    );
    const equipes = prepararLista(
      dados.equipes,
      (e) => `${e.nome} ${e.descricao ?? ""}`,
      (e) => e.ativo,
    );

    return { produtos, categorias, unidades, empresas, funcionarios, locais, equipes };
  })();

  const totalVisiveis = listas[abaAtiva].length;
  const totalPaginas = Math.max(1, Math.ceil(totalVisiveis / TAMANHO_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const paginaDe = <T,>(itens: T[]) =>
    itens.slice((paginaSegura - 1) * TAMANHO_PAGINA, paginaSegura * TAMANHO_PAGINA);

  const alterarAba = (valor: string) => {
    setAbaAtiva(valor as Aba);
    setPagina(1);
    setQ("");
    setFiltroStatus("todos");
  };

  const limparFiltros = () => {
    setQ("");
    setFiltroStatus("todos");
    setOrdem("asc");
    setPagina(1);
  };

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-sidebar-primary/15 bg-gradient-to-br from-sidebar-primary/[0.08] via-background to-background p-5 shadow-sm md:p-6">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-sidebar-primary" />
        <div className="absolute -right-16 -top-20 size-48 rounded-full bg-sidebar-primary/[0.06]" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <FolderTree className="size-6" />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">
                  Base operacional
                </span>
                <Badge
                  variant="outline"
                  className="border-sidebar-primary/25 bg-sidebar-primary/[0.05] text-sidebar-primary"
                >
                  Cadastros
                </Badge>
              </div>
              <h1 className="font-display text-3xl font-bold uppercase tracking-tight md:text-4xl">
                Cadastros
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Organize as informações que alimentam os lançamentos, o estoque e o rastreamento do
                projeto.
              </p>
            </div>
          </div>
          <div className="hidden rounded-xl border border-sidebar-primary/15 bg-background/80 px-4 py-3 text-right shadow-sm md:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Princípio
            </p>
            <p className="mt-1 text-sm font-semibold">Desative em vez de excluir</p>
          </div>
        </div>
      </div>

      <Tabs value={abaAtiva} onValueChange={alterarAba} className="w-full">
        <div className="rounded-2xl border border-primary bg-muted/35 p-1.5 shadow-sm">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent sm:grid-cols-4 lg:grid-cols-7">
            {(
              [
                { aba: "produtos", label: "Produtos", icon: Boxes },
                { aba: "categorias", label: "Categorias", icon: FolderTree },
                { aba: "unidades", label: "Unidades", icon: Ruler },
                { aba: "empresas", label: "Empresas", icon: Building2 },
                { aba: "funcionarios", label: "Funcionários", icon: Users },
                { aba: "locais", label: "Locais", icon: MapPin },
                { aba: "equipes", label: "Equipes", icon: UsersRound },
              ] satisfies { aba: Aba; label: string; icon: LucideIcon }[]
            ).map(({ aba, label: tabLabel, icon: Icon }) => (
              <TabsTrigger
                key={aba}
                value={aba}
                className="group relative h-12 justify-start gap-2.5 overflow-hidden rounded-lg border border-transparent px-3 text-sm font-semibold transition-all duration-200 hover:bg-background/70 data-[state=active]:border-sidebar-primary/15 data-[state=active]:bg-background data-[state=active]:text-sidebar-primary data-[state=active]:shadow-sm before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-transparent data-[state=active]:before:bg-sidebar-primary"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background/70 text-muted-foreground transition-colors group-data-[state=active]:bg-sidebar-primary/[0.10] group-data-[state=active]:text-sidebar-primary">
                  <Icon className="size-4" />
                </span>
                <span className="truncate">{tabLabel}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {(
          [
            ["produtos", "Produto", "Materiais controlados pelo estoque."],
            ["categorias", "Categoria", "Organize os produtos por grupos."],
            ["unidades", "Unidade", "Defina as unidades de medida utilizadas."],
            ["empresas", "Empresa", "Cadastre empresas próprias, terceiras e fornecedores."],
            ["funcionarios", "Funcionário", "Pessoas relacionadas às operações do projeto."],
            ["locais", "Local", "Defina onde materiais e equipamentos são localizados."],
            ["equipes", "Equipe", "Organize responsáveis e estoques por equipe."],
          ] as const
        ).map(([aba, label, descricao]) => (
          <TabsContent key={aba} value={aba} className="mt-4">
            <Card className="overflow-hidden border-border/80 shadow-sm">
              <CardHeader className="relative border-b border-sidebar-primary/10 bg-gradient-to-r from-sidebar-primary/[0.045] via-background to-background">
                <div className="relative flex flex-col gap-3 pl-3 sm:flex-row sm:items-center sm:justify-between before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-full before:bg-sidebar-primary">
                  <div>
                    <h2 className="font-display text-xl font-bold">{label}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <Input
                        className="w-full sm:w-64"
                        placeholder={`Pesquisar por nome, código ou vínculo…`}
                        value={q}
                        onChange={(e) => {
                          setQ(e.target.value);
                          setPagina(1);
                        }}
                      />
                      <label className="sr-only" htmlFor={`status-${aba}`}>
                        Filtrar situação
                      </label>
                      <select
                        id={`status-${aba}`}
                        value={filtroStatus}
                        onChange={(e) => {
                          setFiltroStatus(e.target.value as FiltroStatus);
                          setPagina(1);
                        }}
                        className="h-11 rounded-md border border-slate-300 bg-background px-3 text-base font-medium text-foreground shadow-sm outline-none transition-colors hover:border-primary/50 focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="todos">Todas as situações</option>
                        <option value="ativos">Somente ativos</option>
                        <option value="inativos">Somente inativos</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`ordem-${aba}`}>
                        Ordenação
                      </label>
                      <button
                        type="button"
                        title={ordem === "asc" ? "Ordenado de A a Z" : "Ordenado de Z a A"}
                        aria-label={ordem === "asc" ? "Alterar para Z a A" : "Alterar para A a Z"}
                        onClick={() => {
                          setOrdem(ordem === "asc" ? "desc" : "asc");
                          setPagina(1);
                        }}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {ordem === "asc" ? (
                          <ArrowDownAZ className="size-4" />
                        ) : (
                          <ArrowUpAZ className="size-4" />
                        )}
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={limparFiltros}
                        title="Limpar filtros"
                      >
                        <Filter className="size-4" />
                        <span className="hidden sm:inline">Limpar</span>
                      </Button>
                    </div>
                    <Button size="sm" className="shrink-0" onClick={() => novo(aba)}>
                      <Plus className="size-4" /> Novo {label.toLowerCase()}
                    </Button>
                  </div>
                </div>
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
                          <TableHead>Reposição inteligente</TableHead>
                        </>
                      )}
                      {aba === "unidades" && <TableHead>Descrição</TableHead>}
                      {aba === "empresas" && <TableHead>Tipo</TableHead>}
                      {aba === "funcionarios" && (
                        <>
                          <TableHead>CPF</TableHead>
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
                          <TableHead>Líderes</TableHead>
                          <TableHead>Estoque</TableHead>
                        </>
                      )}
                      <TableHead>Ativo</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aba === "produtos" &&
                      paginaDe(listas.produtos).map((p: Produto) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell>{nomeDe(dados.categorias, p.categoria_id)}</TableCell>
                          <TableCell>
                            {dados.unidades.find((u) => u.id === p.unidade_id)?.sigla ?? "—"}
                          </TableCell>
                          <TableCell className="num text-right">{num(p.estoque_minimo)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                p.inteligencia_reposicao === false
                                  ? "border-muted-foreground/20 text-muted-foreground"
                                  : "border-sidebar-primary/30 bg-sidebar-primary/5 text-sidebar-primary"
                              }
                            >
                              {p.inteligencia_reposicao === false ? "Desativada" : "Ativa"}
                            </Badge>
                          </TableCell>
                          <Acoes
                            ativo={p.ativo}
                            onToggle={() => toggleAtivo("produtos", p, "ativo")}
                            onEdit={() => setEditando({ aba: "produtos", item: { ...p } })}
                          />
                        </TableRow>
                      ))}

                    {aba === "categorias" &&
                      paginaDe(listas.categorias).map((c: Categoria) => (
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
                      paginaDe(listas.unidades).map((u: Unidade) => (
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
                      paginaDe(listas.empresas).map((e: Empresa) => (
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
                      paginaDe(listas.funcionarios).map((f: Funcionario) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{f.nome}</TableCell>
                          <TableCell>{formatarCpf(f.cpf) || "—"}</TableCell>
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
                      paginaDe(listas.locais).map((l: Local) => (
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
                      paginaDe(listas.equipes).map((e: Equipe) => {
                        const membros = dados.equipeMembros.filter((m) => m.equipe_id === e.id);
                        const lideres = membros
                          .filter((membro) => membro.papel === "LIDER")
                          .map((membro) => nomeDe(dados.funcionarios, membro.funcionario_id))
                          .filter(Boolean);
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">{e.nome}</TableCell>
                            <TableCell>{membros.length}</TableCell>
                            <TableCell>{lideres.length ? lideres.join(", ") : "Nenhum líder"}</TableCell>
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
                                    membros: membros.map((m) => ({
                                      funcionario_id: m.funcionario_id,
                                      papel: m.papel ?? "MEMBRO",
                                    })),
                                  },
                                })
                              }
                            />
                          </TableRow>
                        );
                      })}
                    {totalVisiveis === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="h-28 text-center text-sm text-muted-foreground"
                        >
                          Nenhum cadastro encontrado com os filtros atuais.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
              <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {totalVisiveis === 0
                    ? "Nenhum resultado"
                    : `Exibindo ${(paginaSegura - 1) * TAMANHO_PAGINA + 1}–${Math.min(paginaSegura * TAMANHO_PAGINA, totalVisiveis)} de ${totalVisiveis}`}
                </span>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <span className="whitespace-nowrap">
                    Página {paginaSegura} de {totalPaginas}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Página anterior"
                    disabled={paginaSegura <= 1}
                    onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    <span className="hidden sm:inline">Anterior</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Próxima página"
                    disabled={paginaSegura >= totalPaginas}
                    onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}
                  >
                    <span className="hidden sm:inline">Próxima</span>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b border-sidebar-primary/15 bg-gradient-to-r from-sidebar-primary/[0.08] via-background to-background px-6 pb-5 pt-5 shadow-sm">
            <DialogTitle className="flex items-center gap-3 font-display text-xl">
              <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <Pencil className="size-4" />
              </span>
              {editando
                ? `${editando.item["id"] ? "Editar" : "Novo"} ${
                    editando.aba === "funcionarios"
                      ? "funcionário"
                      : editando.aba === "produtos"
                        ? "produto"
                        : editando.aba === "categorias"
                          ? "categoria"
                          : editando.aba === "unidades"
                            ? "unidade"
                            : editando.aba === "empresas"
                              ? "empresa"
                              : editando.aba === "locais"
                                ? "local"
                                : "equipe"
                  }`
                : "Cadastro"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editando?.aba === "produtos"
                ? "Informe os dados do material e suas regras básicas de estoque."
                : editando?.aba === "funcionarios"
                  ? "Informe os dados da pessoa e seus vínculos operacionais."
                  : editando?.aba === "equipes"
                    ? "Defina a equipe, seu estoque e os membros relacionados."
                    : editando?.aba === "empresas"
                      ? "Cadastre a empresa e informe seu tipo."
                      : editando?.aba === "locais"
                        ? "Defina o local e, quando necessário, seu local pai."
                        : editando?.aba === "categorias"
                          ? "Cadastre o grupo que será usado para organizar produtos."
                          : "Informe os dados necessários para este cadastro."}
            </p>
          </DialogHeader>
          {editando && (
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
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
                  <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 sm:col-span-2">
                    <Switch
                      checked={editando.item["inteligencia_reposicao"] !== false}
                      onCheckedChange={(inteligencia_reposicao) =>
                        setEditando({
                          ...editando,
                          item: { ...editando.item, inteligencia_reposicao },
                        })
                      }
                    />
                    <div className="space-y-0.5">
                      <Label>Participa da inteligência de reposição</Label>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Quando ativa, o Vigia pode sugerir reposição para este produto com base no
                        consumo e no estoque mínimo.
                      </p>
                    </div>
                  </div>
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
                      { value: "FORNECEDOR", label: "Fornecedor" },
                    ]}
                  />
                </div>
              )}
              {editando.aba === "funcionarios" && (
                <>
                  <Campo
                    label="CPF"
                    value={formatarCpf(String(editando.item["cpf"] ?? ""))}
                    onChange={(v) =>
                      setEditando({
                        ...editando,
                        item: { ...editando.item, cpf: v.replace(/\D/g, "").slice(0, 11) },
                      })
                    }
                  />
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
                    sugestoes={[
                      ...new Map(
                        dados.funcionarios
                          .map((funcionario) => funcionario.funcao?.trim() ?? "")
                          .filter(Boolean)
                          .map((funcao) => [funcao.toLocaleLowerCase("pt-BR"), funcao] as const),
                      ).values(),
                    ].sort((a, b) => a.localeCompare(b, "pt-BR"))}
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
                          item: {
                            ...editando.item,
                            encarregado_id: v,
                            equipe_raiz_id: v ? equipeDoEncarregado(v) : editando.item["equipe_raiz_id"] ?? null,
                          },
                        })
                      }
                      opcoes={dados.funcionarios
                        .filter((f) => f.id !== editando.item["id"])
                        .map((f) => ({ value: f.id, label: f.nome }))}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Equipe raiz</Label>
                      {Boolean(editando.item["encarregado_id"] as string | null | undefined) && (
                        <Badge variant="secondary">Definida pelo encarregado</Badge>
                      )}
                    </div>
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
                      disabled={Boolean(editando.item["encarregado_id"])}
                    />
                    <p className="text-xs text-muted-foreground">
                      {editando.item["encarregado_id"]
                        ? "A equipe é herdada automaticamente do encarregado e não pode ser alterada aqui."
                        : "Sem encarregado, o operador pode escolher, trocar ou liberar a equipe."}
                    </p>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                      <span className="font-medium">Equipe atual: </span>
                      {nomeDe(dados.equipes, (editando.item["equipe_raiz_id"] as string | null) ?? null) || "Nenhuma"}
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="pin-funcionario">PIN de segurança</Label>
                    <Input
                      id="pin-funcionario"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={8}
                      value={String(editando.item["pin_novo"] ?? "")}
                      onChange={(event) =>
                        setEditando({
                          ...editando,
                          item: {
                            ...editando.item,
                            pin_novo: event.target.value.replace(/\D/g, "").slice(0, 8),
                          },
                        })
                      }
                      placeholder={
                        editando.item["pin_hash"]
                          ? "Preencha para substituir o PIN atual"
                          : "Opcional · 4 a 8 números"
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      O PIN é armazenado somente como hash e poderá confirmar operações futuras.
                    </p>
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
                    <div>
                      <Label>Membros e papel</Label>
                      <p className="text-xs text-muted-foreground">
                        Novos funcionários sem equipe podem ser adicionados aqui. Para trocar ou liberar alguém já vinculado, edite o cadastro do funcionário.
                      </p>
                    </div>
                    {(() => {
                      const equipeId = String(editando.item["id"] ?? "");
                      const selecionados = (editando.item["membros"] as Array<{ funcionario_id: string; papel: "LIDER" | "MEMBRO" }> | undefined) ?? [];
                      const selecionadosIds = new Set(selecionados.map((membro) => membro.funcionario_id));
                      const ocupadosEmOutraEquipe = new Set(
                        dados.equipeMembros
                          .filter((membro) => membro.equipe_id !== equipeId)
                          .map((membro) => membro.funcionario_id),
                      );
                      return (
                        <SelecaoMultipla
                          opcoes={dados.funcionarios
                            .filter((f) => f.status === "ATIVO" && (selecionadosIds.has(f.id) || !ocupadosEmOutraEquipe.has(f.id)))
                            .map((f) => ({ id: f.id, nome: f.nome }))}
                          selecionados={selecionados}
                          onChange={(membros) =>
                            setEditando({ ...editando, item: { ...editando.item, membros } })
                          }
                        />
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
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
  selecionados: Array<{ funcionario_id: string; papel: "LIDER" | "MEMBRO" }>;
  onChange: (membros: Array<{ funcionario_id: string; papel: "LIDER" | "MEMBRO" }>) => void;
}) {
  const [busca, setBusca] = useState("");
  const normalizar = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
  const termo = normalizar(busca);
  const filtradas = opcoes.filter((opcao) => !termo || normalizar(opcao.nome).includes(termo));

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Filtrar funcionários…"
          className="h-10 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto p-3">
      {filtradas.map((opcao) => {
        const membro = selecionados.find((selecionado) => selecionado.funcionario_id === opcao.id);
        const marcado = Boolean(membro);
        return (
          <div key={opcao.id} className="flex flex-wrap items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/40">
            <Checkbox
              checked={marcado}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...selecionados, { funcionario_id: opcao.id, papel: "MEMBRO" }]
                    : selecionados.filter((item) => item.funcionario_id !== opcao.id),
                )
              }
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={opcao.nome}>{opcao.nome}</span>
            {marcado && (
              <select
                aria-label={`Papel de ${opcao.nome}`}
                value={membro?.papel ?? "MEMBRO"}
                onChange={(event) =>
                  onChange(
                    selecionados.map((item) =>
                      item.funcionario_id === opcao.id
                        ? { ...item, papel: event.target.value as "LIDER" | "MEMBRO" }
                        : item,
                    ),
                  )
                }
                className="h-8 rounded-md border border-slate-300 bg-background px-2 text-xs font-medium text-foreground"
              >
                <option value="MEMBRO">Membro</option>
                <option value="LIDER">Líder</option>
              </select>
            )}
          </div>
        );
      })}
      {filtradas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma opção disponível.</p>
      )}
      </div>
      <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {selecionados.length} selecionado(s) · Líderes recebem papel estruturado para notificações futuras.
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  className,
  sugestoes,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  sugestoes?: string[];
}) {
  const id = `campo-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const listaId = sugestoes?.length ? `${id}-sugestoes` : undefined;
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} list={listaId} />
      {listaId ? (
        <datalist id={listaId}>
          {sugestoes?.map((sugestao) => (
            <option key={sugestao} value={sugestao} />
          ))}
        </datalist>
      ) : null}
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
