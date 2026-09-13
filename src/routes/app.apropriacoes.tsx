import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
    ClipboardCheck,
    Download,
    PackageCheck,
    Search,
    ToolCase,
    UserCheck,
    UserRound,
    UserRoundPlus,
    UserRoundX,
    Wrench,
    type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Combobox } from "@/components/common/Combobox";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/db/db";
import { useProjetoAtivoId } from "@/hooks/useAppData";
import { movimentacoesEquipamentosRepo } from "@/services/equipamentos/movimentacoes-repo";
import { estadoEquipamentosRepo, type EstadoEstoqueEquipamento } from "@/services/equipamentos/estado-repo";
import type {
    Equipamento,
    EstoqueEquipamento,
    Funcionario,
} from "@/types";
import { num } from "@/utils/format";
import { HistoricoEquipamento } from "@/components/equipamentos/HistoricoEquipamento";
import { construirHistoricoEquipamento } from "@/services/equipamentos/historico";
import { gerarRelatorioEquipamento } from "@/services/equipamentos/relatorio-equipamento";

export const Route = createFileRoute("/app/apropriacoes")({
    ssr: false,
    component: ApropriacoesPage,
});

type RegistroStatus = "DISPONIVEL" | "EM_USO" | "MANUTENCAO";

type Registro = {
    estoque: EstoqueEquipamento;
    equipamento: Equipamento;
    estado: EstadoEstoqueEquipamento;
    responsavel: Funcionario | undefined;
    status: RegistroStatus;
};

export function ApropriacoesPage() {
    const [projetoId] = useProjetoAtivoId();
    const [busca, setBusca] = useState("");
    const [filtroStatus, setFiltroStatus] = useState<"TODOS" | "LIVRES" | "EM_USO">("TODOS");
    const [selecionado, setSelecionado] = useState<Registro | null>(null);
    const [dialogApropriar, setDialogApropriar] = useState(false);
    const [dialogDevolver, setDialogDevolver] = useState(false);
    const [alvoDevolucao, setAlvoDevolucao] = useState<Registro | null>(null);
    const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);

    const dados = useLiveQuery(async () => {
        if (!projetoId) return null;

        const db = getDB();
        const [equipamentos, estoques, funcionarios, equipes, empresas, categorias, movimentacoes] = await Promise.all([
            db.equipamentos.where("projeto_id").equals(projetoId).toArray(),
            db.estoque_equipamentos.where("projeto_id").equals(projetoId).toArray(),
            db.funcionarios.where("projeto_id").equals(projetoId).toArray(),
            db.equipes.where("projeto_id").equals(projetoId).toArray(),
            db.empresas.where("projeto_id").equals(projetoId).toArray(),
            db.categorias_equipamentos.where("projeto_id").equals(projetoId).toArray(),
            db.movimentacoes_equipamentos.where("projeto_id").equals(projetoId).toArray(),
        ]);

        const equipamentosPorId = new Map(equipamentos.map((item) => [item.id, item]));
        const funcionariosMap = new Map(funcionarios.map((item) => [item.id, item]));

        const registros = await Promise.all(
            estoques
                .filter((estoque) => estoque.ativo !== false)
                .filter((estoque) => equipamentosPorId.get(estoque.equipamento_id)?.tipo_controle === "INDIVIDUAL")
                .map(async (estoque) => {
                    const equipamento = equipamentosPorId.get(estoque.equipamento_id);
                    if (!equipamento) return null;

                    const estado = await estadoEquipamentosRepo.calcular(projetoId, estoque.id);
                    const atual = [...estado.funcionarios.entries()].find(([, quantidade]) => quantidade > 0);
                    const responsavel = atual ? funcionariosMap.get(atual[0]) : undefined;
                    const status: RegistroStatus = responsavel
                        ? "EM_USO"
                        : estado.manutencao > 0
                            ? "MANUTENCAO"
                            : "DISPONIVEL";

                    return {
                        estoque,
                        equipamento,
                        estado,
                        responsavel,
                        status,
                    } satisfies Registro;
                }),
        );

        return {
            registros: registros.filter((item): item is Registro => item !== null),
            funcionarios,
            equipes,
            empresas,
            categorias,
            movimentacoes,
        };
    }, [projetoId]);

    const registros = useMemo(() => {
        if (!dados) return [];
        const termo = busca.trim().toLowerCase();

        return dados.registros.filter((item) => {
            if (filtroStatus === "LIVRES" && item.status !== "DISPONIVEL") return false;
            if (filtroStatus === "EM_USO" && item.status !== "EM_USO") return false;

            if (!termo) return true;
            return [
                item.equipamento.nome,
                item.equipamento.marca,
                item.equipamento.modelo,
                item.estoque.patrimonio,
                item.estoque.identificacao,
                item.estoque.serial,
                item.responsavel?.nome,
            ]
                .join(" ")
                .toLowerCase()
                .includes(termo);
        });
    }, [dados, busca, filtroStatus]);

    const funcionariosOpcoes = useMemo(() => {
        if (!dados) return [];
        return dados.funcionarios
            .filter((funcionario) => funcionario.status === "ATIVO")
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map((funcionario) => ({
                value: funcionario.id,
                label: funcionario.nome,
                hint: funcionario.matricula ?? undefined,
            }));
    }, [dados]);

    const equipeDoFuncionario = useMemo(() => {
        if (!dados) return new Map<string, string>();
        return new Map(
            dados.funcionarios.map((funcionario) => [
                funcionario.id,
                dados.equipes.find((equipe) => equipe.id === funcionario.equipe_raiz_id)?.nome ?? "Sem equipe",
            ]),
        );
    }, [dados]);

    const participantes = useMemo(() => ({
        funcionarios: new Map(dados?.funcionarios.map((item) => [item.id, item]) ?? []),
        equipes: new Map(dados?.equipes.map((item) => [item.id, item.nome]) ?? []),
        empresas: new Map(dados?.empresas.map((item) => [item.id, item.nome]) ?? []),
    }), [dados]);

    const historicoSelecionado = useMemo(() => {
        if (!selecionado || !dados) return [];
        const movimentos = dados.movimentacoes.filter(
            (movimento) => movimento.estoque_equipamento_id === selecionado.estoque.id,
        );
        return construirHistoricoEquipamento(selecionado.equipamento, movimentos, participantes);
    }, [selecionado, dados, participantes]);

    const abrirApropriacao = (item?: Registro) => {
        const alvo = item ?? selecionado;
        if (!alvo) return;
        setFuncionarioId(null);
        setDialogApropriar(true);
    };

    const salvarApropriacao = async () => {
        if (!projetoId || !selecionado || !funcionarioId) {
            toast.error("Selecione um funcionário.");
            return;
        }

        const funcionario = dados?.funcionarios.find((item) => item.id === funcionarioId);
        if (!funcionario) return;

        setSalvando(true);
        try {
            if (selecionado.responsavel && selecionado.responsavel.id !== funcionarioId) {
                await movimentacoesEquipamentosRepo.salvar({
                    projeto_id: projetoId,
                    estoque_equipamento_id: selecionado.estoque.id,
                    tipo: "DEVOLUCAO",
                    quantidade: 1,
                    tipo_origem: "FUNCIONARIO",
                    origem_id: selecionado.responsavel.id,
                    tipo_destino: "EQUIPE",
                    destino_id: (await obterAlmoxarifadoId(projetoId)),
                    data: new Date().toISOString().slice(0, 10),
                    referencia_documento: null,
                    observacoes: "Troca de responsável pela Central de Apropriações.",
                });
            }

            const almoxarifadoId = await obterAlmoxarifadoId(projetoId);
            await movimentacoesEquipamentosRepo.salvar({
                projeto_id: projetoId,
                estoque_equipamento_id: selecionado.estoque.id,
                tipo: "SAIDA",
                quantidade: 1,
                tipo_origem: "EQUIPE",
                origem_id: almoxarifadoId,
                tipo_destino: "FUNCIONARIO",
                destino_id: funcionarioId,
                data: new Date().toISOString().slice(0, 10),
                referencia_documento: null,
                observacoes: "Apropriação realizada pela Central de Apropriações.",
            });

            toast.success(`Equipamento apropriado para ${funcionario.nome}.`);
            setDialogApropriar(false);
            setSelecionado(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível apropriar o equipamento.");
        } finally {
            setSalvando(false);
        }
    };

    const pedirDevolucao = (item?: Registro) => {
        const alvo = item ?? selecionado;

        if (!alvo?.responsavel || salvando) return;

        setAlvoDevolucao(alvo);
        setDialogDevolver(true);
    };

    const removerApropriacao = async () => {
        const alvo = alvoDevolucao;

        if (!projetoId || !alvo?.responsavel) return;

        setSalvando(true);

        try {
            const almoxarifadoId = await obterAlmoxarifadoId(projetoId);

            await movimentacoesEquipamentosRepo.salvar({
                projeto_id: projetoId,
                estoque_equipamento_id: alvo.estoque.id,
                tipo: "DEVOLUCAO",
                quantidade: 1,
                tipo_origem: "FUNCIONARIO",
                origem_id: alvo.responsavel.id,
                tipo_destino: "EQUIPE",
                destino_id: almoxarifadoId,
                data: new Date().toISOString().slice(0, 10),
                referencia_documento: null,
                observacoes: "Remoção da apropriação pela Central de Apropriações.",
            });

            toast.success(
                "Apropriação removida. Equipamento devolvido ao Almoxarifado.",
            );

            setDialogDevolver(false);
            setAlvoDevolucao(null);
            setSelecionado(null);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Não foi possível remover a apropriação.",
            );
        } finally {
            setSalvando(false);
        }
    };

    const gerarRelatorio = () => {
        if (!selecionado || !dados || !projetoId) return;

        const categoria = dados.categorias.find((item) => item.id === selecionado.equipamento.categoria_id)?.nome ?? "—";
        const equipe = selecionado.responsavel
            ? equipeDoFuncionario.get(selecionado.responsavel.id) ?? "Sem equipe"
            : "Almoxarifado";

        try {
            gerarRelatorioEquipamento({
                equipamento: selecionado.equipamento,
                estoque: selecionado.estoque,
                categoria,
                responsavel: selecionado.responsavel,
                equipe,
                status: selecionado.status,
                movimentacoes: dados.movimentacoes.filter(
                    (movimento) => movimento.estoque_equipamento_id === selecionado.estoque.id,
                ),
                maps: participantes,
            });
            toast.success("Relatório aberto para impressão ou salvamento em PDF.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
        }
    };

    if (!projetoId) {
        return <p className="text-sm text-muted-foreground">Selecione um projeto para consultar as apropriações.</p>;
    }

    if (!dados) {
        return <p className="text-sm text-muted-foreground">Carregando apropriações…</p>;
    }

    const emUso = dados.registros.filter((item) => item.responsavel).length;
    const livres = dados.registros.filter((item) => item.status === "DISPONIVEL").length;

    return (
        <div className="space-y-5">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-sidebar-primary">
                        <ClipboardCheck className="size-5" aria-hidden="true" />
                        <span className="text-xs font-semibold uppercase tracking-[0.14em]">Equipamentos</span>
                    </div>
                    <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Apropriações</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                        Acesso rápido aos equipamentos individuais e aos seus responsáveis atuais.
                    </p>
                </div>
            </header>

            <div className="grid gap-3 sm:grid-cols-3">
                <Resumo icon={PackageCheck} label="Equipamentos" valor={dados.registros.length} />
                <Resumo icon={UserCheck} label="Em uso" valor={emUso} destaque />
                <Resumo icon={Wrench} label="Disponíveis" valor={livres} />
            </div>

            <Card>
                <CardHeader className="border-b bg-muted/20 pb-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="relative w-full lg:max-w-xl">
                            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                            <Input
                                value={busca}
                                onChange={(event) => setBusca(event.target.value)}
                                placeholder="Pesquisar equipamento, patrimônio, série ou responsável…"
                                className="pl-9"
                                aria-label="Pesquisar apropriações"
                            />
                        </div>
                        <div className="flex gap-2">
                            {(["TODOS", "LIVRES", "EM_USO"] as const).map((status) => (
                                <Button
                                    key={status}
                                    type="button"
                                    size="sm"
                                    variant={filtroStatus === status ? "default" : "outline"}
                                    onClick={() => setFiltroStatus(status)}
                                >
                                    {status === "TODOS" ? "Todos" : status === "LIVRES" ? "Disponíveis" : "Em uso"}
                                </Button>
                            ))}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Equipamento</th>
                                    <th className="px-4 py-3 font-semibold">Identificação</th>
                                    <th className="px-4 py-3 font-semibold">Responsável</th>
                                    <th className="px-4 py-3 font-semibold">Equipe</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                    <th className="w-12 px-4 py-3" aria-label="Ações" />
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {registros.map((item) => (
                                    <tr key={item.estoque.id} className="group hover:bg-muted/30">
                                        <td className="px-4 py-3">
                                            <button type="button" className="text-left" onClick={() => setSelecionado(item)}>
                                                <div className="font-medium group-hover:text-primary">{item.equipamento.nome}</div>
                                                <div className="text-xs text-muted-foreground">{[item.equipamento.marca, item.equipamento.modelo].filter(Boolean).join(" · ") || "Sem modelo informado"}</div>
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{item.estoque.patrimonio || item.estoque.identificacao || item.estoque.serial || "—"}</td>
                                        <td className="px-4 py-3 font-medium">{item.responsavel?.nome ?? <span className="text-muted-foreground">Não apropriado</span>}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{item.responsavel ? equipeDoFuncionario.get(item.responsavel.id) ?? "Sem equipe" : "Almoxarifado"}</td>
                                        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                {item.responsavel ? (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                        onClick={() => pedirDevolucao(item)}
                                                        aria-label={`Devolver ${item.equipamento.nome}`}
                                                    >
                                                        <UserRoundX className="mr-1.5 size-4" aria-hidden="true" />
                                                        Devolver
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className="shadow-sm"
                                                        onClick={() => { setSelecionado(item); abrirApropriacao(item); }}
                                                        disabled={item.status !== "DISPONIVEL" || item.estado.almoxarifado < 1}
                                                        aria-label={`Apropriar ${item.equipamento.nome}`}
                                                    >
                                                        <UserRoundPlus className="mr-1.5 size-4" aria-hidden="true" />
                                                        Apropriar
                                                    </Button>
                                                )}
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setSelecionado(item)}
                                                    aria-label={`Consultar ${item.equipamento.nome}`}
                                                    title="Consultar equipamento"
                                                    className="gap-1.5 border-border/80 bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                                                >
                                                    <ToolCase className="size-4" aria-hidden="true" />
                                                    Visualizar
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="space-y-2 p-3 md:hidden">
                        {registros.map((item) => (
                            <div key={item.estoque.id} className="rounded-xl border bg-card p-4 shadow-sm transition hover:bg-muted/30">
                                <button type="button" onClick={() => setSelecionado(item)} className="w-full text-left">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold">{item.equipamento.nome}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{item.estoque.patrimonio || item.estoque.identificacao || item.estoque.serial || "Sem identificação"}</p>
                                        </div>
                                        <StatusBadge status={item.status} />
                                    </div>
                                    <div className="mt-3 flex items-center gap-2 text-sm">
                                        <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                                        <span>{item.responsavel?.nome ?? "Não apropriado"}</span>
                                    </div>
                                </button>
                                <div className="mt-4">
                                    {item.responsavel ? (
                                        <Button
                                            type="button"
                                            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            variant="outline"
                                            onClick={() => pedirDevolucao(item)}
                                        >
                                            <UserRoundX className="mr-2 size-4" aria-hidden="true" />
                                            Devolver equipamento
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            className="w-full shadow-sm"
                                            onClick={() => { setSelecionado(item); abrirApropriacao(item); }}
                                            disabled={item.status !== "DISPONIVEL" || item.estado.almoxarifado < 1}
                                        >
                                            <UserRoundPlus className="mr-2 size-4" aria-hidden="true" />
                                            Apropriar equipamento
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {registros.length === 0 && (
                        <div className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum equipamento encontrado para os filtros atuais.</div>
                    )}
                </CardContent>
            </Card>

            <Sheet open={Boolean(selecionado)} onOpenChange={(open) => !open && setSelecionado(null)}>
                <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
                    {selecionado && (
                        <>
                            <SheetHeader className="border-b pb-4 pr-8 text-left">
                                <div className="flex items-center gap-2 text-sidebar-primary"><Wrench className="size-5" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-[0.12em]">Equipamento individual</span></div>
                                <SheetTitle className="text-xl">{selecionado.equipamento.nome}</SheetTitle>
                                <SheetDescription>
                                    {selecionado.estoque.patrimonio || selecionado.estoque.identificacao || selecionado.estoque.serial || "Sem identificação"}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="space-y-6 py-5">
                                <section aria-labelledby="responsavel-atual" className="rounded-xl border bg-muted/20 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p id="responsavel-atual" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsável atual</p>
                                            <p className="mt-1 text-lg font-semibold">{selecionado.responsavel?.nome ?? "Nenhum"}</p>
                                            <p className="text-sm text-muted-foreground">{selecionado.responsavel ? equipeDoFuncionario.get(selecionado.responsavel.id) ?? "Sem equipe" : "Disponível no Almoxarifado"}</p>
                                        </div>
                                        <StatusBadge status={selecionado.status} />
                                    </div>
                                </section>

                                <InfoSection title="Identificação">
                                    <Info label="Patrimônio" value={selecionado.estoque.patrimonio} />
                                    <Info label="Identificação" value={selecionado.estoque.identificacao} />
                                    <Info label="Número de série" value={selecionado.estoque.serial} />
                                    <Info label="Vínculo" value={selecionado.estoque.vinculo} />
                                </InfoSection>

                                <InfoSection title="Cadastro">
                                    <Info label="Categoria" value={dados.categorias.find((categoria) => categoria.id === selecionado.equipamento.categoria_id)?.nome} />
                                    <Info label="Marca" value={selecionado.equipamento.marca} />
                                    <Info label="Modelo" value={selecionado.equipamento.modelo} />
                                    <Info label="Controle" value={selecionado.equipamento.tipo_controle} />
                                    <Info label="Observações" value={selecionado.estoque.observacoes} wide />
                                </InfoSection>

                                <SheetFooter className="border-t pt-4 sm:flex-col sm:space-x-0">
                                    <div className="grid w-full gap-2">
                                        {selecionado.responsavel ? (
                                            <>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    onClick={() => pedirDevolucao()}
                                                    disabled={salvando}
                                                >
                                                    <UserRoundX className="mr-2 size-4" aria-hidden="true" />
                                                    Devolver equipamento
                                                </Button>
                                                <Button type="button" variant="secondary" onClick={() => abrirApropriacao()} disabled={salvando}>
                                                    <UserRoundPlus className="mr-2 size-4" aria-hidden="true" />
                                                    Alterar responsável
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                type="button"
                                                className="h-11 shadow-sm"
                                                onClick={() => abrirApropriacao()}
                                                disabled={salvando || selecionado.status !== "DISPONIVEL" || selecionado.estado.almoxarifado < 1}
                                            >
                                                <UserRoundPlus className="mr-2 size-4" aria-hidden="true" />
                                                Apropriar equipamento
                                            </Button>
                                        )}
                                        <Button type="button" variant="outline" onClick={gerarRelatorio}>
                                            <Download className="mr-2 size-4" aria-hidden="true" />
                                            Gerar relatório
                                        </Button>
                                    </div>
                                </SheetFooter>
                                <HistoricoEquipamento eventos={historicoSelecionado} />
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            <Dialog open={dialogApropriar} onOpenChange={(open) => !salvando && setDialogApropriar(open)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{selecionado?.responsavel ? "Alterar responsável" : "Apropriar equipamento"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="rounded-lg border bg-muted/20 p-3">
                            <p className="font-medium">{selecionado?.equipamento.nome}</p>
                            <p className="text-xs text-muted-foreground">{selecionado?.estoque.patrimonio || selecionado?.estoque.identificacao || selecionado?.estoque.serial || "Sem identificação"}</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="funcionario-apropriacao">Funcionário responsável</Label>
                            <Combobox
                                opcoes={funcionariosOpcoes}
                                value={funcionarioId}
                                onChange={setFuncionarioId}
                                placeholder="Selecionar funcionário…"
                                vazio="Nenhum funcionário ativo encontrado."
                            />
                        </div>
                        {funcionarioId && <p className="text-xs text-muted-foreground">Equipe: {equipeDoFuncionario.get(funcionarioId) ?? "Sem equipe definida"}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogApropriar(false)} disabled={salvando}>Cancelar</Button>
                        <Button onClick={() => void salvarApropriacao()} disabled={salvando || !funcionarioId}>
                            <UserRoundPlus className="mr-2 size-4" />
                            {salvando ? "Salvando…" : "Apropriar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={dialogDevolver}
                onOpenChange={(open) => {
                    if (!salvando) {
                        setDialogDevolver(open);
                        if (!open) setAlvoDevolucao(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Confirmar devolução</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <p className="text-sm text-muted-foreground">
                            Confirme a devolução deste equipamento para o Almoxarifado. Esta ação registrará uma nova movimentação e removerá a apropriação atual.
                        </p>
                        <div className="rounded-lg border bg-muted/20 p-3">
                            <p className="font-medium">{alvoDevolucao?.equipamento.nome}</p>
                            <p className="text-xs text-muted-foreground">
                                {alvoDevolucao?.estoque.patrimonio || alvoDevolucao?.estoque.identificacao || alvoDevolucao?.estoque.serial || "Sem identificação"}
                            </p>
                            <p className="mt-2 text-sm">
                                Responsável: <span className="font-medium">{alvoDevolucao?.responsavel?.nome ?? "—"}</span>
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDialogDevolver(false)}
                            disabled={salvando}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void removerApropriacao()}
                            disabled={salvando || !alvoDevolucao}
                        >
                            <UserRoundX className="mr-2 size-4" />
                            {salvando ? "Devolvendo…" : "Confirmar devolução"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

async function obterAlmoxarifadoId(projetoId: string) {
    const equipes = await getDB().equipes.where("projeto_id").equals(projetoId).toArray();
    const almoxarifado = equipes.find((equipe) => equipe.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "almoxarifado");
    if (!almoxarifado) throw new Error("A equipe Almoxarifado não foi encontrada neste projeto.");
    return almoxarifado.id;
}

function Resumo({ icon: Icon, label, valor, destaque = false }: { icon: LucideIcon; label: string; valor: number; destaque?: boolean }) {
    return (
        <Card>
            <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${destaque ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold">{num(valor)}</p>
                </div>
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status }: { status: RegistroStatus }) {
    if (status === "EM_USO") return <Badge><UserCheck className="mr-1 size-3" />Em uso</Badge>;
    if (status === "MANUTENCAO") return <Badge variant="outline"><Wrench className="mr-1 size-3" />Em manutenção</Badge>;
    return <Badge variant="secondary"><PackageCheck className="mr-1 size-3" />Disponível</Badge>;
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section aria-labelledby={`info-${title}`}>
            <h2 id={`info-${title}`} className="mb-3 font-semibold">{title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        </section>
    );
}

function Info({ label, value, wide = false }: { label: string; value?: string | null | undefined; wide?: boolean }) {
    return (
        <div className={wide ? "sm:col-span-2" : ""}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-sm font-medium">{value || "—"}</p>
        </div>
    );
}
