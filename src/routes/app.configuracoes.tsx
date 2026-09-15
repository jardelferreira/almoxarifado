import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
    Archive,
    Boxes,
    Check,
    FileText,
    Package,
    RotateCcw,
    Save,
    Settings2,
    SlidersHorizontal,
    Warehouse,
    Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import { criarConfiguracaoPadrao } from "@/types/configuracao";
import type { Configuracao, DocumentoTipo } from "@/types";
import { useProjetoAtivoId } from "@/hooks/useAppData";

export const Route = createFileRoute("/app/configuracoes")({
    ssr: false,
    head: () => ({
        meta: [
            { title: "Configurações — Almoxarifado" },
            { name: "description", content: "Parâmetros operacionais do projeto ativo." },
        ],
    }),
    component: ConfiguracoesPage,
});

const TIPOS_DOCUMENTO: Array<{ value: DocumentoTipo; label: string; description: string }> = [
    { value: "NOTA_FISCAL", label: "Nota Fiscal", description: "NF-e, NFS-e e documentos fiscais." },
    { value: "ROMANEIO", label: "Romaneio", description: "Controle de entrega e transporte." },
    { value: "PEDIDO", label: "Pedido", description: "Pedidos internos ou de compra." },
    { value: "DOCUMENTO_INTERNO", label: "Documento interno", description: "Registros próprios do almoxarifado." },
];

const tipoLabel = (tipo: DocumentoTipo) =>
    TIPOS_DOCUMENTO.find((item) => item.value === tipo)?.label ?? tipo;

function ConfiguracoesPage() {
    const [projetoId] = useProjetoAtivoId();
    const configuracao = useLiveQuery(
        () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
        [projetoId],
    );
    const [rascunho, setRascunho] = useState<Configuracao | null>(null);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (!projetoId) return;
        void configuracoesRepo.inicializar(projetoId);
    }, [projetoId]);

    useEffect(() => {
        if (!configuracao) return;
        setRascunho(structuredClone(configuracao));
    }, [configuracao]);

    const alteracoes = useMemo(() => {
        if (!rascunho || !configuracao) return false;
        return JSON.stringify(rascunho) !== JSON.stringify(configuracao);
    }, [rascunho, configuracao]);

    const atualizarModulo = (modulo: keyof Configuracao["modulos"], habilitado: boolean) => {
        setRascunho((atual) => {
            if (!atual) return atual;

            return {
                ...atual,
                modulos: {
                    ...atual.modulos,
                    [modulo]: habilitado,
                },
                documentos:
                    modulo === "documentos"
                        ? { ...atual.documentos, habilitado }
                        : atual.documentos,
            };
        });
    };

    if (!projetoId) {
        return (
            <div className="mx-auto max-w-3xl py-10">
                <EmptyState title="Nenhum projeto ativo" description="Selecione um projeto para configurar o almoxarifado." />
            </div>
        );
    }

    if (!rascunho) {
        return (
            <div className="mx-auto max-w-5xl py-10">
                <div className="animate-pulse space-y-4">
                    <div className="h-24 rounded-2xl bg-muted" />
                    <div className="h-48 rounded-2xl bg-muted" />
                    <div className="h-48 rounded-2xl bg-muted" />
                </div>
            </div>
        );
    }

    const atualizarDocumento = <K extends keyof Configuracao["documentos"]>(
        campo: K,
        valor: Configuracao["documentos"][K],
    ) => {
        setRascunho((atual) =>
            atual ? { ...atual, documentos: { ...atual.documentos, [campo]: valor } } : atual,
        );
    };

    const atualizarEstoque = <K extends keyof Configuracao["estoque"]>(
        campo: K,
        valor: Configuracao["estoque"][K],
    ) => {
        setRascunho((atual) =>
            atual ? { ...atual, estoque: { ...atual.estoque, [campo]: valor } } : atual,
        );
    };

    const atualizarInventario = <K extends keyof Configuracao["inventario"]>(
        campo: K,
        valor: Configuracao["inventario"][K],
    ) => {
        setRascunho((atual) =>
            atual ? { ...atual, inventario: { ...atual.inventario, [campo]: valor } } : atual,
        );
    };

    const alternarTipoDocumento = (tipo: DocumentoTipo, marcado: boolean) => {
        const atuais = rascunho.documentos.tipos_permitidos;
        const novos = marcado
            ? [...new Set([...atuais, tipo])]
            : atuais.filter((item) => item !== tipo);

        if (novos.length === 0) {
            toast.error("Mantenha pelo menos um tipo de documento permitido.");
            return;
        }

        const tipoPadrao = novos.includes(rascunho.documentos.tipo_padrao)
            ? rascunho.documentos.tipo_padrao
            : (novos[0] ?? "NOTA_FISCAL");

        setRascunho({
            ...rascunho,
            documentos: { ...rascunho.documentos, tipos_permitidos: novos, tipo_padrao: tipoPadrao },
        });
    };

    const salvar = async () => {
        try {
            setSalvando(true);
            await configuracoesRepo.salvar(projetoId, {
                modulos: rascunho.modulos,
                documentos: {
                    ...rascunho.documentos,
                    habilitado: rascunho.modulos.documentos,
                },
                estoque: rascunho.estoque,
                inventario: rascunho.inventario,
                casas_decimais: rascunho.casas_decimais,
            });
            toast.success("Configurações salvas com sucesso.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível salvar as configurações.");
        } finally {
            setSalvando(false);
        }
    };

    const restaurarPadrao = () => {
        const confirmado = window.confirm(
            "Restaurar os valores padrão? As alterações feitas no formulário serão substituídas — isso só terá efeito depois de clicar em Salvar.",
        );
        if (!confirmado) return;

        const padrao = criarConfiguracaoPadrao(projetoId, rascunho.criado_em);
        setRascunho(padrao);
        toast.info("Padrões restaurados no formulário. Salve para confirmar.");
    };

    return (
        <div className="mx-auto w-full max-w-6xl space-y-5 pb-8">
            <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 gap-4">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Settings2 className="size-6" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Configurações</h1>
                                {alteracoes && (
                                    <span
                                        role="status"
                                        className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                    >
                                        Alterações não salvas
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                                Defina as regras que orientam o estoque, os documentos e os futuros inventários deste projeto.
                            </p>
                        </div>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                        <Button variant="outline" onClick={restaurarPadrao} disabled={salvando} className="flex-1 sm:flex-none">
                            <RotateCcw className="size-4" />
                            <span className="hidden sm:inline">Restaurar padrão</span>
                            <span className="sm:hidden">Padrão</span>
                        </Button>
                        <Button onClick={() => void salvar()} disabled={salvando || !alteracoes} className="flex-1 sm:flex-none">
                            <Save className="size-4" />
                            {salvando ? "Salvando…" : "Salvar"}
                        </Button>
                    </div>
                </div>
            </header>
            <section aria-labelledby="modulos-titulo">
                <Card className="overflow-hidden">
                    <CardHeader className="border-b bg-muted/20 p-5 sm:p-6">
                        <SectionHeading
                            icon={<Boxes className="size-5" />}
                            title="Módulos"
                            description="Escolha quais áreas estarão disponíveis para este projeto. Desativar um módulo remove seu acesso pela navegação, sem apagar os dados existentes."
                            id="modulos-titulo"
                        />
                    </CardHeader>
                    <CardContent className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
                        <ModuleCard
                            icon={<Package className="size-5" />}
                            title="Materiais"
                            description="Estoque, lançamentos, movimentações, cadastros e dados."
                            checked={rascunho.modulos.materiais}
                            onCheckedChange={(v) => atualizarModulo("materiais", v)}
                        />
                        <ModuleCard
                            icon={<Wrench className="size-5" />}
                            title="Equipamentos"
                            description="Controle individual, apropriações e movimentações."
                            checked={rascunho.modulos.equipamentos}
                            onCheckedChange={(v) => atualizarModulo("equipamentos", v)}
                        />
                        <ModuleCard
                            icon={<FileText className="size-5" />}
                            title="Documentos"
                            description="Notas fiscais, romaneios, pedidos e documentos internos."
                            checked={rascunho.modulos.documentos}
                            onCheckedChange={(v) => atualizarModulo("documentos", v)}
                        />
                    </CardContent>
                </Card>
            </section>

            <section aria-labelledby="documentos-titulo">
                <Card className="overflow-hidden">
                    <CardHeader className="border-b bg-muted/20 p-5 sm:p-6">
                        <SectionHeading icon={<FileText className="size-5" />} title="Documentos" description="Controle documental é opcional e não altera o fluxo atual quando estiver desativado." id="documentos-titulo" />
                    </CardHeader>
                    <CardContent className="space-y-6 p-5 sm:p-6">
                        <div className={`flex flex-col gap-4 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${rascunho.modulos.documentos ? "border-primary/30 bg-primary/[0.03]" : ""}`}>
                            <div className="flex gap-3">
                                <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary"><FileText className="size-4" /></div>
                                <div>
                                    <p className="text-sm font-semibold">Módulo de documentos</p>
                                    <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                                        {rascunho.modulos.documentos
                                            ? "Ativo. As regras abaixo serão aplicadas ao controle documental."
                                            : "Desativado. Ative o módulo na seção Módulos acima para configurar estas opções."}
                                    </p>
                                </div>
                            </div>
                            <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${rascunho.modulos.documentos ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                {rascunho.modulos.documentos ? "Ativo" : "Desativado"}
                            </span>
                        </div>

                        <div
                            className={`space-y-6 transition-opacity ${rascunho.modulos.documentos ? "" : "pointer-events-none opacity-50"}`}
                            aria-disabled={!rascunho.modulos.documentos}
                        >
                            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                                <div className="space-y-3">
                                    <div className="space-y-3">
                                        <Label htmlFor="tipo-padrao">Tipo padrão</Label>
                                        <Select value={rascunho.documentos.tipo_padrao} onValueChange={(v) => atualizarDocumento("tipo_padrao", v as DocumentoTipo)}>
                                            <SelectTrigger id="tipo-padrao" className="h-11"><SelectValue /></SelectTrigger>
                                            <SelectContent>{rascunho.documentos.tipos_permitidos.map((tipo) => <SelectItem key={tipo} value={tipo}>{tipoLabel(tipo)}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <p className="text-xs leading-5 text-muted-foreground">Será usado como sugestão ao cadastrar um novo documento.</p>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold">Tipos permitidos</h3>
                                        <p className="mt-1 text-xs text-muted-foreground">Escolha os documentos disponíveis no módulo documental.</p>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {TIPOS_DOCUMENTO.map((tipo) => {
                                            const marcado = rascunho.documentos.tipos_permitidos.includes(tipo.value);
                                            return (
                                                <label key={tipo.value} className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ${marcado ? "border-primary/40 bg-primary/[0.03]" : ""}`}>
                                                    <Checkbox checked={marcado} onCheckedChange={(checked) => alternarTipoDocumento(tipo.value, checked === true)} className="mt-0.5" />
                                                    <span className="min-w-0">
                                                        <span className="flex items-center gap-1.5 text-sm font-medium">{tipo.label}{marcado && <Check className="size-3.5 text-primary" />}</span>
                                                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{tipo.description}</span>
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="border-t pt-5">
                                <div className="mb-3"><h3 className="text-sm font-semibold">Quando exigir documento</h3><p className="mt-1 text-xs text-muted-foreground">Essas regras serão aplicadas quando o controle documental estiver habilitado.</p></div>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    <SettingCheck label="Entrada" checked={rascunho.documentos.exigir_na_entrada} onCheckedChange={(v) => atualizarDocumento("exigir_na_entrada", v)} />
                                    <SettingCheck label="Saída" checked={rascunho.documentos.exigir_na_saida} onCheckedChange={(v) => atualizarDocumento("exigir_na_saida", v)} />
                                    <SettingCheck label="Transferência" checked={rascunho.documentos.exigir_na_transferencia} onCheckedChange={(v) => atualizarDocumento("exigir_na_transferencia", v)} />
                                    <SettingCheck label="Devolução" checked={rascunho.documentos.exigir_na_devolucao} onCheckedChange={(v) => atualizarDocumento("exigir_na_devolucao", v)} />
                                    <SettingCheck label="Ajuste" checked={rascunho.documentos.exigir_no_ajuste} onCheckedChange={(v) => atualizarDocumento("exigir_no_ajuste", v)} />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
                <Card className="transition-shadow hover:shadow-md">
                    <CardHeader className="border-b bg-muted/20 p-5 sm:p-6"><SectionHeading icon={<Package className="size-5" />} title="Estoque" description="Regras gerais para as operações de estoque." /></CardHeader>
                    <CardContent className="space-y-2 p-5 sm:p-6">
                        <SwitchRow title="Permitir estoque negativo" description="Permite que uma saída deixe o saldo abaixo de zero." checked={rascunho.estoque.permitir_estoque_negativo} onCheckedChange={(v) => atualizarEstoque("permitir_estoque_negativo", v)} />
                        <SwitchRow title="Permitir ajustes de estoque" description="Habilita correções por divergências identificadas." checked={rascunho.estoque.permitir_ajustes} onCheckedChange={(v) => atualizarEstoque("permitir_ajustes", v)} />
                        <SwitchRow title="Exigir justificativa no ajuste" description="Solicita uma justificativa sempre que houver ajuste." checked={rascunho.estoque.exigir_justificativa_ajuste} onCheckedChange={(v) => atualizarEstoque("exigir_justificativa_ajuste", v)} disabled={!rascunho.estoque.permitir_ajustes} />
                    </CardContent>
                </Card>

                <Card className="transition-shadow hover:shadow-md">
                    <CardHeader className="border-b bg-muted/20 p-5 sm:p-6"><SectionHeading icon={<Warehouse className="size-5" />} title="Inventário" description="Regras preparadas para o módulo de inventário." /></CardHeader>
                    <CardContent className={`space-y-2 p-5 transition-opacity sm:p-6 ${rascunho.inventario.habilitado ? "" : "[&>*:not(:first-child)]:pointer-events-none [&>*:not(:first-child)]:opacity-50"}`}>
                        <SwitchRow title="Habilitar inventário" description="Disponibiliza o controle de contagens e divergências." checked={rascunho.inventario.habilitado} onCheckedChange={(v) => atualizarInventario("habilitado", v)} />
                        <SwitchRow title="Permitir inventário parcial" description="Permite contar apenas parte do estoque." checked={rascunho.inventario.permitir_inventario_parcial} onCheckedChange={(v) => atualizarInventario("permitir_inventario_parcial", v)} />
                        <SwitchRow title="Exigir responsável" description="Identifica quem realizou ou confirmou a contagem." checked={rascunho.inventario.exigir_responsavel} onCheckedChange={(v) => atualizarInventario("exigir_responsavel", v)} />
                        <SwitchRow title="Ajustar divergências automaticamente" description="Gera os ajustes a partir da contagem finalizada." checked={rascunho.inventario.ajustar_automaticamente} onCheckedChange={(v) => atualizarInventario("ajustar_automaticamente", v)} />
                    </CardContent>
                </Card>
            </div>

            <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="border-b bg-muted/20 p-5 sm:p-6"><SectionHeading icon={<SlidersHorizontal className="size-5" />} title="Precisão dos valores" description="Define a quantidade de casas decimais usada nas futuras telas e relatórios." /></CardHeader>
                <CardContent className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <div className="max-w-sm flex-1 space-y-2">
                            <Label htmlFor="casas-decimais">Casas decimais</Label>
                            <Select value={String(rascunho.casas_decimais)} onValueChange={(v) => setRascunho({ ...rascunho, casas_decimais: Number(v) })}>
                                <SelectTrigger id="casas-decimais" className="h-11"><SelectValue /></SelectTrigger>
                                <SelectContent>{[0, 1, 2, 3, 4].map((valor) => <SelectItem key={valor} value={String(valor)}>{valor} {valor === 1 ? "casa decimal" : "casas decimais"}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="flex h-11 items-center gap-2 rounded-lg border bg-muted/30 px-4 text-sm">
                            <span className="text-muted-foreground">Exemplo:</span>
                            <span className="font-mono font-medium">{(1234.5).toFixed(rascunho.casas_decimais)}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
                <Archive className="mt-0.5 size-4 shrink-0" />
                <p>As configurações pertencem ao projeto ativo e são armazenadas localmente neste dispositivo. Alterações só passam a valer depois de clicar em <strong className="font-semibold text-foreground">Salvar</strong>.</p>
            </div>
        </div>
    );
}

function SectionHeading({ icon, title, description, id }: { icon: ReactNode; title: string; description: string; id?: string }) {
    return <div id={id} className="flex gap-3"><div className="mt-0.5 text-primary">{icon}</div><div><CardTitle className="text-base">{title}</CardTitle><CardDescription className="mt-1 leading-5">{description}</CardDescription></div></div>;
}

function ModuleCard({
    icon,
    title,
    description,
    checked,
    onCheckedChange,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}) {
    return (
        <div className={`flex min-h-36 flex-col justify-between rounded-xl border p-4 transition-colors ${checked ? "border-primary/40 bg-primary/[0.03]" : "hover:bg-muted/30"}`}>
            <div className="flex items-start justify-between gap-3">
                <div className={`flex size-10 items-center justify-center rounded-lg ${checked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {icon}
                </div>
                <Switch
                    checked={checked}
                    onCheckedChange={onCheckedChange}
                    aria-label={`${checked ? "Desativar" : "Ativar"} módulo ${title}`}
                />
            </div>
            <div className="mt-4">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
            <p className={`mt-3 text-[11px] font-semibold uppercase tracking-wide ${checked ? "text-primary" : "text-muted-foreground"}`}>
                {checked ? "Módulo ativo" : "Módulo desativado"}
            </p>
        </div>
    );
}

function SettingCheck({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
            <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
            <span>{label}</span>
        </label>
    );
}

function SwitchRow({ title, description, checked, onCheckedChange, disabled }: { title: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean }) {
    return (
        <div className={`flex items-start justify-between gap-4 rounded-xl border p-4 transition-colors ${disabled ? "opacity-50" : "hover:bg-muted/30"}`}>
            <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
            <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5 shrink-0" />
        </div>
    );
}

function EmptyState({ title, description }: { title: string; description: string }) {
    return <div className="rounded-2xl border bg-card p-8 text-center shadow-sm"><Settings2 className="mx-auto size-8 text-muted-foreground" /><h1 className="mt-3 text-lg font-semibold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}