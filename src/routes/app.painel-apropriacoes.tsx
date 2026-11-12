import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, type ReactNode } from "react";
import {
  ClipboardSignature,
  FileDown,
  PackageCheck,
  Search,
  UserRound,
  UserRoundMinus,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Combobox } from "@/components/common/Combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { estadoEquipamentosRepo } from "@/services/equipamentos/estado-repo";
import { movimentacoesEquipamentosRepo } from "@/services/equipamentos/movimentacoes-repo";
import type { Equipamento, EstoqueEquipamento, Funcionario } from "@/types";
import { formatarCpf } from "@/utils/seguranca";
import { num } from "@/utils/format";

export const Route = createFileRoute("/app/painel-apropriacoes")({
  ssr: false,
  head: () => ({ meta: [{ title: "Painel de Apropriações" }] }),
  component: PainelApropriacoesPage,
});

type ItemPainel = {
  estoque: EstoqueEquipamento;
  equipamento: Equipamento;
  quantidade: number;
  identificacao: string;
};

type AcaoPainel = "APROPRIAR" | "DEVOLVER";
type ModoPainel = "ATENDIMENTO" | "CONSULTA";

type ProprietarioConsulta = {
  id: string;
  nome: string;
  matricula: string | null | undefined;
  quantidade: number;
  ativo: boolean;
};

type ConsultaPosse = {
  estoque: EstoqueEquipamento;
  equipamento: Equipamento;
  identificacao: string;
  disponivel: number;
  manutencao: number;
  proprietarios: ProprietarioConsulta[];
};

export function PainelApropriacoesPage() {
  const [projetoId] = useProjetoAtivoId();
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [dialogAcao, setDialogAcao] = useState(false);
  const [acao, setAcao] = useState<AcaoPainel>("APROPRIAR");
  const [estoqueId, setEstoqueId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("1");
  const [salvando, setSalvando] = useState(false);
  const [buscaEquipamento, setBuscaEquipamento] = useState("");
  const [modo, setModo] = useState<ModoPainel>("ATENDIMENTO");

  const dados = useLiveQuery(async () => {
    if (!projetoId) return null;
    const db = getDB();
    const [funcionarios, equipamentos, estoques, equipes] = await Promise.all([
      db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
      db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
      db.equipes.where("projeto_id").equals(projetoId).toArray(),
    ]);

    const equipamentoPorId = new Map(equipamentos.map((item) => [item.id, item]));
    const funcionarioPorId = new Map(funcionarios.map((item) => [item.id, item]));
    const itens: ItemPainel[] = [];
    const disponiveis: Array<ItemPainel & { disponivel: number }> = [];
    const consultas: ConsultaPosse[] = [];

    const estados = await Promise.all(
      estoques
        .filter((item) => item.ativo !== false)
        .map(async (estoque) => ({
          estoque,
          estado: await estadoEquipamentosRepo.calcular(projetoId, estoque.id),
        })),
    );

    for (const { estoque, estado } of estados) {
      const equipamento = equipamentoPorId.get(estoque.equipamento_id);
      if (!equipamento) continue;
      const identificacao =
        estoque.identificacao || estoque.patrimonio || estoque.serial || "Sem identificação";
      const apropriado = funcionarioId ? (estado.funcionarios.get(funcionarioId) ?? 0) : 0;
      const proprietarios = [...estado.funcionarios.entries()]
        .filter(([, quantidade]) => quantidade > 0)
        .map(([id, quantidade]) => {
          const funcionario = funcionarioPorId.get(id);
          return {
            id,
            nome: funcionario?.nome ?? "Funcionário não localizado",
            matricula: funcionario?.matricula,
            quantidade,
            ativo: funcionario?.status === "ATIVO",
          };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      consultas.push({
        estoque,
        equipamento,
        identificacao,
        disponivel: estado.disponivel,
        manutencao: estado.manutencao,
        proprietarios,
      });
      if (apropriado > 0)
        itens.push({ estoque, equipamento, quantidade: apropriado, identificacao });
      if (estado.disponivel > 0)
        disponiveis.push({
          estoque,
          equipamento,
          quantidade: 0,
          identificacao,
          disponivel: estado.disponivel,
        });
    }

    return {
      funcionarios: funcionarios
        .filter((item) => item.status === "ATIVO")
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      equipes,
      itens: itens.sort((a, b) => a.equipamento.nome.localeCompare(b.equipamento.nome, "pt-BR")),
      disponiveis: disponiveis.sort((a, b) =>
        a.equipamento.nome.localeCompare(b.equipamento.nome, "pt-BR"),
      ),
      consultas: consultas.sort((a, b) =>
        a.equipamento.nome.localeCompare(b.equipamento.nome, "pt-BR"),
      ),
    };
  }, [projetoId, funcionarioId]);

  const funcionario = useMemo(
    () => dados?.funcionarios.find((item) => item.id === funcionarioId),
    [dados, funcionarioId],
  );
  const equipe = useMemo(
    () => dados?.equipes.find((item) => item.id === funcionario?.equipe_raiz_id),
    [dados, funcionario],
  );
  const estoqueSelecionado = dados?.disponiveis.find((item) => item.estoque.id === estoqueId);
  const itemDevolucao = dados?.itens.find((item) => item.estoque.id === estoqueId);
  const consultasFiltradas = useMemo(() => {
    if (!dados || !buscaEquipamento.trim()) return [];
    const termos = normalizarBusca(buscaEquipamento).split(" ").filter(Boolean);
    return dados.consultas.filter((item) => {
      const texto = normalizarBusca(
        [
          item.equipamento.nome,
          item.equipamento.marca,
          item.equipamento.modelo,
          item.identificacao,
          item.estoque.patrimonio,
          item.estoque.serial,
          ...item.proprietarios.flatMap((proprietario) => [
            proprietario.nome,
            proprietario.matricula,
          ]),
        ]
          .filter(Boolean)
          .join(" "),
      );
      return termos.every((termo) => texto.includes(termo));
    });
  }, [dados, buscaEquipamento]);

  const abrirApropriacao = () => {
    setAcao("APROPRIAR");
    setEstoqueId(null);
    setQuantidade("1");
    setDialogAcao(true);
  };

  const abrirDevolucao = (item: ItemPainel) => {
    setAcao("DEVOLVER");
    setEstoqueId(item.estoque.id);
    setQuantidade(item.equipamento.tipo_controle === "INDIVIDUAL" ? "1" : "1");
    setDialogAcao(true);
  };

  const almoxarifadoId = () =>
    dados?.equipes.find(
      (item) =>
        item.nome
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase() === "almoxarifado",
    )?.id;

  const salvarAcao = async () => {
    if (!projetoId || !funcionarioId || !funcionario || !estoqueId) {
      toast.error("Selecione o funcionário e o equipamento.");
      return;
    }
    const item = acao === "APROPRIAR" ? estoqueSelecionado : itemDevolucao;
    if (!item) return;
    const quantidadeNumero =
      item.equipamento.tipo_controle === "INDIVIDUAL" ? 1 : Number(quantidade);
    if (!Number.isInteger(quantidadeNumero) || quantidadeNumero <= 0) {
      toast.error("Informe uma quantidade inteira maior que zero.");
      return;
    }
    const equipeAlmoxarifado = almoxarifadoId();
    if (!equipeAlmoxarifado) {
      toast.error("A equipe Almoxarifado não foi encontrada neste projeto.");
      return;
    }

    setSalvando(true);
    try {
      const estado = await estadoEquipamentosRepo.calcular(projetoId, estoqueId);
      if (acao === "APROPRIAR") {
        if (estado.disponivel < quantidadeNumero)
          throw new Error(`Quantidade disponível: ${estado.disponivel}.`);
        await movimentacoesEquipamentosRepo.salvar({
          projeto_id: projetoId,
          estoque_equipamento_id: estoqueId,
          tipo: "SAIDA",
          quantidade: quantidadeNumero,
          tipo_origem: "EQUIPE",
          origem_id: equipeAlmoxarifado,
          tipo_destino: "FUNCIONARIO",
          destino_id: funcionarioId,
          data: new Date().toISOString().slice(0, 10),
          referencia_documento: null,
          observacoes: "Apropriação realizada pelo Painel de Atendimento.",
        });
        toast.success(`Equipamento apropriado para ${funcionario.nome}.`);
      } else {
        const atual = estado.funcionarios.get(funcionarioId) ?? 0;
        if (atual < quantidadeNumero)
          throw new Error(`Quantidade apropriada atualmente: ${atual}.`);
        await movimentacoesEquipamentosRepo.salvar({
          projeto_id: projetoId,
          estoque_equipamento_id: estoqueId,
          tipo: "DEVOLUCAO",
          quantidade: quantidadeNumero,
          tipo_origem: "FUNCIONARIO",
          origem_id: funcionarioId,
          tipo_destino: "EQUIPE",
          destino_id: equipeAlmoxarifado,
          data: new Date().toISOString().slice(0, 10),
          referencia_documento: null,
          observacoes: "Desapropriação realizada pelo Painel de Atendimento.",
        });
        toast.success("Equipamento devolvido ao Almoxarifado.");
      }
      setDialogAcao(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível concluir o atendimento.",
      );
    } finally {
      setSalvando(false);
    }
  };

  if (!projetoId)
    return (
      <p className="text-sm text-muted-foreground">Selecione um projeto para abrir o painel.</p>
    );
  if (!dados)
    return <p className="text-sm text-muted-foreground">Carregando painel de apropriações…</p>;

  return (
    <div className="space-y-6 text-[15px] lg:text-base">
      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:text-base">
            <ClipboardSignature className="size-4 text-primary" aria-hidden="true" />
            Painéis · Atendimento
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight lg:text-4xl">
            Painel de apropriações
          </h1>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground lg:text-lg">
            Atenda o funcionário, confira os equipamentos em seu nome e registre apropriações ou
            devoluções.
          </p>
        </div>
        <Badge variant="outline" className="w-fit shrink-0">
          Atendimento operacional
        </Badge>
      </header>

      <Tabs value={modo} onValueChange={(value) => setModo(value as ModoPainel)} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border bg-card p-1 shadow-sm">
          <TabsTrigger
            value="ATENDIMENTO"
            className="gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/25 sm:text-base lg:text-lg"
          >
            <UserRound className="size-4 sm:size-5" aria-hidden="true" />
            Atendimento ao funcionário
          </TabsTrigger>
          <TabsTrigger
            value="CONSULTA"
            className="gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/25 sm:text-base lg:text-lg"
          >
            <Search className="size-4 sm:size-5" aria-hidden="true" />
            Consulta de equipamento
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {modo === "ATENDIMENTO" && (
        <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center gap-2">
              <UserRound className="size-4 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold lg:text-lg">Funcionário atendido</h2>
                <p className="text-sm text-muted-foreground lg:text-base">
                  Selecione uma pessoa para consultar ou atualizar a ficha.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <Combobox
              opcoes={dados.funcionarios.map((item) => ({
                value: item.id,
                label: item.nome,
                hint: [
                  item.matricula && `Matrícula: ${item.matricula}`,
                  item.cpf && `CPF: ${formatarCpf(item.cpf)}`,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
              value={funcionarioId}
              onChange={setFuncionarioId}
              placeholder="Pesquisar funcionário…"
              vazio="Nenhum funcionário ativo encontrado."
            />
            {funcionario && (
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nome</p>
                  <p className="text-base font-semibold lg:text-lg">{funcionario.nome}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">CPF</p>
                  <p className="text-base font-medium lg:text-lg">
                    {formatarCpf(funcionario.cpf) || "Não informado"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Matrícula / função</p>
                  <p className="text-base font-medium lg:text-lg">
                    {[funcionario.matricula, funcionario.funcao].filter(Boolean).join(" · ") ||
                      "Não informado"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Equipe</p>
                  <p className="text-base font-medium lg:text-lg">
                    {equipe?.nome ?? "Sem equipe definida"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {modo === "CONSULTA" && (
        <Card className="border-l-4 border-l-amber-500 shadow-sm">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold lg:text-lg">
                  Consultar posse de equipamento
                </h2>
                <p className="text-sm text-muted-foreground lg:text-base">
                  Pesquise por nome, marca, modelo, patrimônio, identificação, serial ou
                  funcionário.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={buscaEquipamento}
                onChange={(event) => setBuscaEquipamento(event.target.value)}
                className="h-11 pl-9 text-base lg:h-12 lg:text-lg"
                placeholder="Ex.: furadeira, patrimônio, serial ou nome do funcionário"
                aria-label="Pesquisar equipamentos e responsáveis"
              />
            </div>
            {!buscaEquipamento.trim() ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Digite pelo menos uma informação para consultar quem está em posse.
              </p>
            ) : consultasFiltradas.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nenhum equipamento ou responsável corresponde à pesquisa.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {consultasFiltradas.length} registro(s) encontrado(s)
                </p>
                {consultasFiltradas.map((item) => (
                  <div
                    key={item.estoque.id}
                    className="rounded-xl border border-l-4 border-l-sky-500 bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="break-words text-base font-semibold lg:text-lg">
                          {item.equipamento.nome}
                        </p>
                        <p className="mt-1 break-words text-base text-muted-foreground">
                          {[item.equipamento.marca, item.equipamento.modelo]
                            .filter(Boolean)
                            .join(" · ") || "Sem marca ou modelo"}
                        </p>
                        <p className="mt-2 break-words text-sm text-muted-foreground">
                          {item.identificacao}
                          {item.estoque.patrimonio && item.identificacao !== item.estoque.patrimonio
                            ? ` · Patrimônio: ${item.estoque.patrimonio}`
                            : ""}
                          {item.estoque.serial && item.identificacao !== item.estoque.serial
                            ? ` · Serial: ${item.estoque.serial}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant={item.proprietarios.length ? "default" : "outline"}>
                          {item.proprietarios.length ? "Em posse" : situacaoConsulta(item)}
                        </Badge>
                        <Badge variant="outline">Disponível: {num(item.disponivel)}</Badge>
                        {item.manutencao > 0 && (
                          <Badge variant="outline">Manutenção: {num(item.manutencao)}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 border-t pt-3">
                      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Responsável atual
                      </p>
                      {item.proprietarios.length === 0 ? (
                        <p className="mt-2 text-base text-muted-foreground">
                          Nenhum funcionário possui este equipamento no momento.
                        </p>
                      ) : (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {item.proprietarios.map((proprietario) => (
                            <div
                              key={proprietario.id}
                              className="flex min-w-0 items-start justify-between gap-3 rounded-lg border-l-2 border-l-emerald-500 bg-muted/30 p-3"
                            >
                              <div className="min-w-0">
                                <p className="break-words text-base font-medium">
                                  {proprietario.nome}
                                  {!proprietario.ativo && (
                                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                                      (inativo)
                                    </span>
                                  )}
                                </p>
                                {proprietario.matricula && (
                                  <p className="mt-0.5 text-sm text-muted-foreground">
                                    Matrícula: {proprietario.matricula}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 text-sm font-semibold">
                                {num(proprietario.quantidade)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {modo === "ATENDIMENTO" &&
        (funcionario ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Resumo
                label="Itens vinculados"
                valor={dados.itens.length}
                icon={<PackageCheck className="size-4" />}
                accentClassName="border-l-primary"
              />
              <Resumo
                label="Quantidade em uso"
                valor={dados.itens.reduce((total, item) => total + item.quantidade, 0)}
                icon={<UserRound className="size-4" />}
                accentClassName="border-l-emerald-500"
              />
              <Resumo
                label="Unidades disponíveis"
                valor={dados.disponiveis.reduce((total, item) => total + item.disponivel, 0)}
                icon={<UserRoundPlus className="size-4" />}
                accentClassName="border-l-amber-500"
              />
            </div>
            <Card className="border-l-4 border-l-emerald-500 shadow-sm">
              <CardHeader className="flex flex-col gap-3 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold lg:text-lg">Ficha de atendimento</h2>
                  <p className="text-sm text-muted-foreground lg:text-base">
                    Equipamentos atualmente vinculados a este funcionário.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      imprimirAtendimento(funcionario, equipe?.nome ?? "Sem equipe", dados.itens)
                    }
                  >
                    <FileDown className="mr-2 size-4" />
                    Imprimir / PDF
                  </Button>
                  <Button type="button" size="sm" onClick={abrirApropriacao}>
                    <UserRoundPlus className="mr-2 size-4" />
                    Apropriar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {dados.itens.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum equipamento apropriado para este funcionário.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-base">
                      <thead className="bg-muted/30 text-left text-sm uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Equipamento</th>
                          <th className="px-4 py-3">Identificação</th>
                          <th className="px-4 py-3 text-right">Quantidade</th>
                          <th className="px-4 py-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {dados.itens.map((item) => (
                          <tr key={item.estoque.id} className="hover:bg-muted/20">
                            <td className="px-4 py-3">
                              <p className="font-semibold">{item.equipamento.nome}</p>
                              <p className="text-sm text-muted-foreground">
                                {referenciasEquipamento(item)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <div>{item.identificacao}</div>
                              <div className="mt-1 text-xs">
                                {referenciasFisicas(item.estoque, item.identificacao)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              {num(item.quantidade)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => abrirDevolucao(item)}
                              >
                                <UserRoundMinus className="mr-1.5 size-4" />
                                Desapropriar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-10 text-center">
              <UserRound className="mx-auto size-10 text-muted-foreground/50" />
              <p className="mt-3 font-medium">
                Selecione um funcionário para iniciar o atendimento
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                A ficha, os equipamentos e as ações aparecerão nesta área.
              </p>
            </CardContent>
          </Card>
        ))}

      <Dialog open={dialogAcao} onOpenChange={(open) => !salvando && setDialogAcao(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acao === "APROPRIAR" ? "Apropriar equipamento" : "Desapropriar equipamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <span className="text-muted-foreground">Funcionário: </span>
              <strong>{funcionario?.nome}</strong>
            </div>
            {acao === "APROPRIAR" ? (
              <div className="space-y-2">
                <Label>Equipamento disponível</Label>
                <div className="rounded-xl border-2 border-primary/35 bg-primary/[0.045] p-3 shadow-sm ring-1 ring-primary/10">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-base font-bold text-foreground">
                        Equipamento disponível
                      </Label>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Pesquise por nome, marca, modelo ou identificador físico.
                      </p>
                    </div>
                    <Badge className="shrink-0 bg-primary text-primary-foreground">
                      Obrigatório
                    </Badge>
                  </div>
                  <Combobox
                    className="h-12 border-primary/40 bg-background text-base font-semibold text-foreground shadow-sm data-[placeholder]:text-muted-foreground"
                    opcoes={dados.disponiveis.map((item) => ({
                      value: item.estoque.id,
                      label: `${item.equipamento.nome} · disponível: ${item.disponivel}`,
                      hint: [
                        referenciasEquipamento(item),
                        referenciasFisicas(item.estoque, item.identificacao),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    }))}
                    value={estoqueId}
                    onChange={setEstoqueId}
                    placeholder="Selecionar equipamento…"
                    vazio="Nenhum equipamento disponível."
                  />
                  {estoqueSelecionado && (
                    <div className="mt-3 rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm">
                      <p className="font-semibold text-foreground">
                        {estoqueSelecionado.equipamento.nome}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {referenciasEquipamento(estoqueSelecionado)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {referenciasFisicas(
                          estoqueSelecionado.estoque,
                          estoqueSelecionado.identificacao,
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="font-medium">{itemDevolucao?.equipamento.nome}</p>
                <p className="text-muted-foreground">{itemDevolucao?.identificacao}</p>
              </div>
            )}
            {estoqueSelecionado?.equipamento.tipo_controle === "QUANTITATIVO" ||
            itemDevolucao?.equipamento.tipo_controle === "QUANTITATIVO" ? (
              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  max={
                    acao === "APROPRIAR"
                      ? estoqueSelecionado?.disponivel
                      : itemDevolucao?.quantidade
                  }
                  value={quantidade}
                  onChange={(event) => setQuantidade(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Informe a quantidade desta operação.
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogAcao(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void salvarAcao()}
              disabled={salvando || !estoqueId}
            >
              {salvando
                ? "Registrando…"
                : acao === "APROPRIAR"
                  ? "Confirmar apropriação"
                  : "Confirmar devolução"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Resumo({
  label,
  valor,
  icon,
  accentClassName,
}: {
  label: string;
  valor: number;
  icon: ReactNode;
  accentClassName: string;
}) {
  return (
    <Card className={`border-l-4 ${accentClassName} shadow-sm`}>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold">{num(valor)}</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}

function referenciasEquipamento(item: Pick<ItemPainel, "equipamento">): string {
  return (
    [item.equipamento.marca, item.equipamento.modelo].filter(Boolean).join(" · ") ||
    "Marca/modelo não informados"
  );
}

function referenciasFisicas(estoque: EstoqueEquipamento, identificacao: string): string {
  return (
    [
      identificacao !== "Sem identificação" ? `Identificação: ${identificacao}` : null,
      estoque.patrimonio ? `Patrimônio: ${estoque.patrimonio}` : null,
      estoque.serial ? `Serial: ${estoque.serial}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Sem identificadores físicos"
  );
}

function normalizarBusca(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, " ");
}

function situacaoConsulta(item: ConsultaPosse): string {
  if (item.manutencao > 0) return "Em manutenção";
  if (item.disponivel > 0) return "No Almoxarifado";
  return "Sem saldo disponível";
}

function escapar(valor: unknown): string {
  return String(valor ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function imprimirAtendimento(funcionario: Funcionario, equipe: string, itens: ItemPainel[]) {
  const janela = window.open("", "_blank", "width=1000,height=800");
  if (!janela) {
    toast.error("O navegador bloqueou a janela de impressão.");
    return;
  }
  const linhas = itens.length
    ? itens
        .map(
          (item) =>
            `<tr><td>${escapar(item.equipamento.nome)}</td><td>${escapar(item.identificacao)}</td><td>${escapar(item.quantidade)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3">Nenhum equipamento apropriado.</td></tr>`;
  janela.document.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atendimento de equipamentos — ${escapar(funcionario.nome)}</title><style>@page{size:A4 portrait;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172b3a;font-size:12px;margin:0}.topo{border-bottom:3px solid #17324d;padding-bottom:12px;margin-bottom:18px}.marca{font-size:10px;font-weight:700;letter-spacing:1.5px;color:#17324d;text-transform:uppercase}h1{margin:5px 0;font-size:24px;color:#17324d}.dados{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:18px}.campo{border:1px solid #d9e0e7;border-radius:6px;padding:8px}.rotulo{display:block;color:#667788;font-size:9px;text-transform:uppercase;font-weight:700;margin-bottom:3px}table{width:100%;border-collapse:collapse}th{background:#17324d;color:white;text-align:left;padding:8px;font-size:10px;text-transform:uppercase}td{border-bottom:1px solid #d9e0e7;padding:8px;vertical-align:top}td:last-child,th:last-child{text-align:right}.assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:70px}.assinatura{border-top:1px solid #172b3a;text-align:center;padding-top:7px}.rodape{margin-top:30px;border-top:1px solid #d9e0e7;padding-top:8px;color:#667788;font-size:10px}@media print{.acoes{display:none}}</style></head><body><div class="acoes" style="text-align:right;margin-bottom:12px"><button onclick="window.print()">Imprimir / Salvar PDF</button></div><div class="topo"><div class="marca">ALMOXARIFADO · Atendimento de equipamentos</div><h1>Ficha de atendimento</h1><div>Emitido em ${escapar(new Date().toLocaleString("pt-BR"))}</div></div><div class="dados"><div class="campo"><span class="rotulo">Funcionário</span>${escapar(funcionario.nome)}</div><div class="campo"><span class="rotulo">CPF</span>${escapar(formatarCpf(funcionario.cpf) || "Não informado")}</div><div class="campo"><span class="rotulo">Equipe</span>${escapar(equipe)}</div></div><table><thead><tr><th>Equipamento</th><th>Identificação</th><th>Quantidade</th></tr></thead><tbody>${linhas}</tbody></table><div class="assinaturas"><div class="assinatura">Funcionário atendido</div><div class="assinatura">Responsável pelo almoxarifado</div></div><div class="rodape">Documento emitido a partir do estado atual das apropriações do projeto.</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script></body></html>`,
  );
  janela.document.close();
  janela.focus();
}
