import {
  ArrowLeftRight,
  Calculator,
  Boxes,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FileChartLine,
  FileClock,
  FileText,
  GitCompareArrows,
  LayoutDashboard,
  LayoutList,
  LogOut,
  Menu,
  PackageSearch,
  Settings,
  Settings2,
  ShieldAlert,
  UserCheck,
  Workflow,
  Warehouse,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useOnline, useProjetoAtivoId } from "@/hooks/useAppData";
import { inicializarProjeto } from "@/services/projeto-inicializacao";
import { configuracoesRepo } from "@/services/configuracoes-repo";
import type { Configuracao } from "@/types";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/db/db";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  visivel?: (configuracao?: Configuracao) => boolean;
  search?: { produto: string | undefined };
  subgrupo?: string;
};

type NavGroup = {
  label: string;
  icon: typeof Boxes;
  items: NavItem[];
  modulo?: keyof Configuracao["modulos"];
  descricao?: string;
};

const navGroups: NavGroup[] = [
  {
    label: "Materiais",
    icon: Boxes,
    modulo: "materiais",
    descricao: "Operação do estoque e materiais",
    items: [
      { to: "/app/lancar", label: "Lançar", icon: ArrowLeftRight, subgrupo: "Operação" },
      { to: "/app/estoque", label: "Estoque", icon: Warehouse, subgrupo: "Operação" },
      { to: "/app/movimentacoes", label: "Movimentações", icon: FileClock, subgrupo: "Operação" },
      {
        to: "/app/inventario",
        label: "Inventário",
        icon: ClipboardList,
        subgrupo: "Operação",
        visivel: (configuracao) => configuracao?.inventario.habilitado !== false,
      },
      { to: "/app/produto", label: "Perfil do produto", icon: PackageSearch, search: { produto: undefined }, subgrupo: "Consulta" },
    ],
  },
  {
    label: "Equipamentos",
    icon: Wrench,
    modulo: "equipamentos",
    descricao: "Controle, análise e custos do parque",
    items: [
      { to: "/app/equipamentos", label: "Equipamentos", icon: LayoutList, subgrupo: "Gestão" },
      { to: "/app/apropriacoes", label: "Apropriações", icon: UserCheck, subgrupo: "Gestão" },
      { to: "/app/movimentacoes-equipamentos", label: "Movimentações", icon: ArrowLeftRight, subgrupo: "Gestão" },
      { to: "/app/relatorios-equipamentos", label: "Relatórios", icon: FileChartLine, subgrupo: "Gestão" },
      { to: "/app/estatisticas-equipamentos", label: "Estatísticas", icon: ChartColumn, subgrupo: "Análise" },
      { to: "/app/simulacao-custos", label: "Simulação de custos", icon: Calculator, subgrupo: "Análise" },
      { to: "/app/previsto-real-equipamentos", label: "Previsto x real", icon: GitCompareArrows, subgrupo: "Análise" },
      { to: "/app/vigia-equipamentos", label: "Vigia de equipamentos", icon: ShieldAlert, subgrupo: "Análise" },
      { to: "/app/perfis-parametros-equipamentos", label: "Perfis de parâmetros", icon: Settings2, subgrupo: "Parâmetros" },
      { to: "/app/mesclar-parametros-equipamentos", label: "Mesclar parâmetros", icon: Workflow, subgrupo: "Parâmetros" },
    ],
  },
  {
    label: "Documentos",
    icon: FileText,
    modulo: "documentos",
    descricao: "Documentação e recebimentos",
    items: [
      { to: "/app/documentos", label: "Documentos", icon: FileText, exact: true, subgrupo: "Documentos" },
      { to: "/app/recebimentos", label: "Recebimentos", icon: PackageSearch, subgrupo: "Documentos" },
    ],
  },
  {
    label: "Inteligência",
    icon: ShieldAlert,
    descricao: "Acompanhamento e análise transversal",
    items: [
      { to: "/app/vigia", label: "Vigia operacional", icon: ShieldAlert, subgrupo: "Monitoramento" },
      { to: "/app/estatisticas", label: "Estatísticas de materiais", icon: ChartColumn, subgrupo: "Análise" },
    ],
  },
  {
    label: "Base cadastral",
    icon: Settings2,
    descricao: "Dados compartilhados pelos módulos",
    items: [
      { to: "/app/cadastros", label: "Cadastros", icon: Settings2, subgrupo: "Base" },
    ],
  },
];

function Navigation({
  groups,
  expanded,
  configuracao,
  onNavigate,
}: {
  groups: NavGroup[];
  expanded: boolean;
  configuracao?: Configuracao | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const dashboardItem: NavItem = {
    to: "/app",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  };

  const itemVisivel = (item: NavItem, modulo?: keyof Configuracao["modulos"]) =>
    (!modulo || !configuracao || configuracao.modulos[modulo] !== false) &&
    (!item.visivel || item.visivel(configuracao));

  const renderItem = (item: NavItem) => {
    const classes = [
      "group relative flex min-h-9 items-center rounded-lg text-sm font-medium",
      "text-sidebar-foreground/78 transition-colors duration-150",
      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
      expanded ? "gap-3 px-3" : "justify-center px-2",
    ].join(" ");

    const activeClasses = [
      "group relative flex min-h-9 items-center rounded-lg text-sm font-semibold",
      "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm",
      "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary",
      "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
      expanded ? "gap-3 px-3" : "justify-center px-2",
    ].join(" ");

    const content = (
      <>
        <item.icon
          className="size-[17px] shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
        {expanded && <span className="truncate">{item.label}</span>}
      </>
    );

    const props = {
      activeOptions: { exact: item.exact ?? false },
      onClick: onNavigate,
      title: !expanded ? item.label : undefined,
      "aria-label": !expanded ? item.label : undefined,
      className: classes,
      activeProps: { className: activeClasses },
    } as const;

    if (item.search) {
      return (
        <Link key={item.to} to="/app/produto" search={item.search} {...props}>
          {content}
        </Link>
      );
    }

    return (
      <Link key={item.to} to={item.to} {...props}>
        {content}
      </Link>
    );
  };

  return (
    <nav aria-label="Navegação principal" className="sidebar-scrollbar flex-1 overflow-y-auto px-2.5 py-3">
      <div className="space-y-1">
        <div className="mb-3 border-b border-sidebar-border pb-3">
          {renderItem(dashboardItem)}
        </div>

        {groups.map((group) => {
          const moduloAtivo = !group.modulo || !configuracao || configuracao.modulos[group.modulo] !== false;
          const items = group.items.filter((item) => itemVisivel(item, group.modulo));
          const GroupIcon = group.icon;

          return (
            <section key={group.label} aria-label={group.label} className="py-1">
              <div
                className={[
                  "flex min-h-9 items-center rounded-lg",
                  expanded ? "gap-2.5 px-2.5" : "justify-center px-1",
                  moduloAtivo ? "text-sidebar-foreground" : "text-sidebar-foreground/40",
                ].join(" ")}
                title={!expanded && !moduloAtivo ? `${group.label}: módulo desativado` : undefined}
              >
                <GroupIcon
                  className={[
                    "size-[16px] shrink-0",
                    moduloAtivo ? "text-sidebar-primary" : "text-sidebar-foreground/40",
                  ].join(" ")}
                  aria-hidden="true"
                />
                {expanded && (
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{group.label}</span>
                    {group.descricao ? (
                      <p className="truncate text-[9px] text-sidebar-foreground/40">{group.descricao}</p>
                    ) : null}
                  </div>
                )}
              </div>

              {moduloAtivo && items.length > 0 ? (
                <div className={expanded ? "mt-0.5 ml-2 border-l border-sidebar-border/80 pl-1.5" : "mt-0.5"}>
                  <div className="space-y-0.5">
                    {items.map((item, index) => {
                      const previous = items[index - 1];
                      const showSubgroup = expanded && item.subgrupo && item.subgrupo !== previous?.subgrupo;
                      return (
                        <div key={item.to}>
                          {showSubgroup ? (
                            <div className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/35">
                              {item.subgrupo}
                            </div>
                          ) : null}
                          {renderItem(item)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!moduloAtivo && group.modulo && expanded ? (
                <Link
                  to="/app/configuracoes"
                  onClick={onNavigate}
                  className="mx-2 mb-2 mt-1 flex min-h-8 items-center justify-center gap-2 rounded-lg border border-dashed border-sidebar-border px-2.5 text-[11px] font-medium text-sidebar-foreground/60 transition-colors hover:border-sidebar-primary/40 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <Settings2 className="size-3.5" />
                  Ativar em Configurações
                </Link>
              ) : null}
            </section>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const online = useOnline();
  const [projetoId, setProjetoAtivo] = useProjetoAtivoId();
  const navigate = useNavigate();
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [mobileMenuAberto, setMobileMenuAberto] = useState(false);

  const projeto = useLiveQuery(
    () => (projetoId ? getDB().projetos.get(projetoId) : undefined),
    [projetoId],
  );

  const configuracao = useLiveQuery(
    () => (projetoId ? configuracoesRepo.obter(projetoId) : undefined),
    [projetoId],
  );

  // O menu espelha a estrutura de negócio: cada módulo mantém seus links subordinados.
  const gruposVisiveis = navGroups;

  useEffect(() => {
    if (!projetoId) return;

    void inicializarProjeto(projetoId);
  }, [projetoId]);

  const trocarProjeto = () => {
    setProjetoAtivo(null);
    void navigate({ to: "/" });
  };

  const statusLabel = online ? "Online" : "Modo offline";
  const statusDescricao = online
    ? "Dados salvos neste dispositivo"
    : "Sincroniza ao reconectar";

  return (
    <div className="min-h-screen bg-background">
      {/* Navegação desktop: recolhível para preservar a área útil. */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-sidebar text-sidebar-foreground shadow-sm transition-[width] duration-200 ease-out md:flex ${sidebarAberta ? "w-60" : "w-16"
          }`}
      >
        <div
          className={`flex min-h-20 items-center border-b border-sidebar-border ${sidebarAberta ? "justify-between px-4" : "justify-center px-2"
            }`}
        >
          {sidebarAberta ? (
            <div className="min-w-0">
              <p className="truncate font-display text-2xl font-bold uppercase tracking-wide text-sidebar-primary">
                Almoxarifado
              </p>
              <p className="mt-0.5 text-xs text-sidebar-foreground/70">
                Gestão local-first
              </p>
            </div>
          ) : (
            <div
              className="flex size-9 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-primary"
              title="Almoxarifado"
            >
              <Boxes className="size-5" />
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setSidebarAberta((aberta) => !aberta)}
            aria-label={sidebarAberta ? "Recolher menu" : "Expandir menu"}
            title={sidebarAberta ? "Recolher menu" : "Expandir menu"}
          >
            {sidebarAberta ? (
              <ChevronLeft className="size-4 transition-transform duration-200" />
            ) : (
              <ChevronRight className="size-4 transition-transform duration-200" />
            )}
          </Button>
        </div>

        <Navigation
          groups={gruposVisiveis}
          expanded={sidebarAberta}
          configuracao={configuracao}
        />

        <div className="border-t border-sidebar-border bg-sidebar/80 p-2.5">
          <div
            className={[
              "mb-2 flex items-center rounded-xl bg-sidebar-accent/70",
              sidebarAberta ? "gap-2.5 px-3 py-2" : "justify-center p-2",
            ].join(" ")}
            role="status"
            aria-live="polite"
            title={statusDescricao}
          >
            {online ? (
              <span className="relative flex size-3.5 shrink-0 items-center justify-center">
                <span className="absolute size-2 animate-ping rounded-full bg-success/60" />
                <span className="relative size-1.5 rounded-full bg-success" />
              </span>
            ) : (
              <WifiOff className="size-3.5 shrink-0 text-sidebar-primary" />
            )}
            {sidebarAberta && (
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground">{statusLabel}</p>
                <p className="truncate text-[11px] text-sidebar-foreground/55">{statusDescricao}</p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Link
              to="/app/dados"
              title={!sidebarAberta ? "Dados e backup" : undefined}
              aria-label={!sidebarAberta ? "Dados e backup" : undefined}
              className={[
                "flex min-h-10 items-center rounded-md text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                sidebarAberta ? "gap-3 px-3" : "justify-center px-2",
              ].join(" ")}
            >
              <Database className="size-[18px] shrink-0" aria-hidden="true" />
              {sidebarAberta && <span>Dados e backup</span>}
            </Link>
            <Link
              to="/app/configuracoes"
              title={!sidebarAberta ? "Configurações" : undefined}
              aria-label={!sidebarAberta ? "Configurações" : undefined}
              className={[
                "flex min-h-10 items-center rounded-md text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                sidebarAberta ? "gap-3 px-3" : "justify-center px-2",
              ].join(" ")}
            >
              <Settings className="size-[18px] shrink-0" aria-hidden="true" />
              {sidebarAberta && <span>Configurações</span>}
            </Link>
            <button
              type="button"
              onClick={trocarProjeto}
              title={!sidebarAberta ? "Trocar projeto" : undefined}
              aria-label={!sidebarAberta ? "Trocar projeto" : undefined}
              className={[
                "flex min-h-10 w-full items-center rounded-md text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                sidebarAberta ? "gap-3 px-3" : "justify-center px-2",
              ].join(" ")}
            >
              <LogOut className="size-[18px] shrink-0" aria-hidden="true" />
              {sidebarAberta && <span>Trocar projeto</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Menu mobile: substitui a navegação horizontal e mantém a área de conteúdo livre. */}
      {mobileMenuAberto && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileMenuAberto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 md:hidden ${mobileMenuAberto ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex min-h-20 items-center justify-between border-b border-sidebar-border px-4">
          <div>
            <p className="font-display text-2xl font-bold uppercase tracking-wide text-sidebar-primary">
              Almoxarifado
            </p>
            <p className="mt-0.5 text-xs text-sidebar-foreground/70">
              Gestão local-first
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setMobileMenuAberto(false)}
            aria-label="Fechar menu"
            title="Fechar menu"
          >
            <X className="size-5" />
          </Button>
        </div>

        <Navigation
          groups={gruposVisiveis}
          expanded
          configuracao={configuracao}
          onNavigate={() => setMobileMenuAberto(false)}
        />

        <div className="border-t border-sidebar-border bg-sidebar/80 p-3">
          <div
            className="mb-2 flex items-center gap-2.5 rounded-xl bg-sidebar-accent/70 px-3 py-2"
            role="status"
            aria-live="polite"
          >
            {online ? (
              <span className="relative flex size-3.5 shrink-0 items-center justify-center">
                <span className="absolute size-2 animate-ping rounded-full bg-success/60" />
                <span className="relative size-1.5 rounded-full bg-success" />
              </span>
            ) : (
              <WifiOff className="size-3.5 shrink-0 text-sidebar-primary" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground">{statusLabel}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/55">{statusDescricao}</p>
            </div>
          </div>

          <div className="space-y-1">
            <Link
              to="/app/dados"
              onClick={() => setMobileMenuAberto(false)}
              className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Database className="size-[18px] shrink-0" aria-hidden="true" />
              <span>Dados e backup</span>
            </Link>
            <Link
              to="/app/configuracoes"
              onClick={() => setMobileMenuAberto(false)}
              className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Settings className="size-[18px] shrink-0" aria-hidden="true" />
              <span>Configurações</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setMobileMenuAberto(false);
                trocarProjeto();
              }}
              className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-[18px] shrink-0" aria-hidden="true" />
              <span>Trocar projeto</span>
            </button>
          </div>
        </div>
      </aside>

      <div className={sidebarAberta ? "md:pl-60" : "md:pl-16"}>
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-3 py-2.5 backdrop-blur sm:px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuAberto(true)}
              aria-label="Abrir menu"
              title="Abrir menu"
            >
              <Menu className="size-4" />
            </Button>

            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-xs">
                Projeto ativo
              </p>
              <p className="truncate font-display text-base font-semibold leading-tight sm:text-lg">
                {projeto ? `${projeto.codigo} · ${projeto.nome}` : "Nenhum projeto"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div
              className="hidden items-center gap-1.5 rounded-full border border-border/80 bg-muted/30 px-2.5 py-1.5 text-xs font-medium text-muted-foreground lg:flex"
              role="status"
              aria-live="polite"
              title={statusDescricao}
            >
              {online ? (
                <span className="relative flex size-2.5 items-center justify-center">
                  <span className="absolute size-2 animate-ping rounded-full bg-success/60" />
                  <span className="relative size-1.5 rounded-full bg-success" />
                </span>
              ) : (
                <WifiOff className="size-3.5 text-primary" />
              )}
              {statusLabel}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="h-10 gap-2 rounded-xl border border-primary/20 bg-primary px-3.5 font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4"
                  aria-label="Abrir menu do projeto"
                >
                  <span className="flex size-6 items-center justify-center rounded-lg bg-primary-foreground/15">
                    <Settings className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="hidden sm:inline">Menu</span>
                  <ChevronDown className="size-4 opacity-80" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-2">
                <DropdownMenuLabel className="px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Projeto ativo</p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">
                      {projeto ? `${projeto.codigo} · ${projeto.nome}` : "Nenhum projeto"}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="h-11 cursor-pointer rounded-lg px-3">
                  <Link to="/app/dados">
                    <Database className="size-4" />
                    <span>Dados e backup</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="h-11 cursor-pointer rounded-lg px-3">
                  <Link to="/app/configuracoes">
                    <Settings className="size-4" />
                    <span>Configurações</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={trocarProjeto}
                  className="h-11 cursor-pointer rounded-lg px-3 text-muted-foreground focus:text-foreground"
                >
                  <LogOut className="size-4" />
                  <span>Trocar projeto</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}