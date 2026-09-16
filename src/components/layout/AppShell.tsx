import {
  Activity,
  ArrowLeftRight,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  HardHat,
  LayoutDashboard,
  ListChecks,
  Menu,
  PackagePlus,
  PackageSearch,
  Settings2,
  Warehouse,
  Wifi,
  WifiOff,
  Wrench,
  UserCheck,
  X,
  FileChartLine,
  LayoutList,
  FileClock,
  Settings,
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

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  visivel?: (configuracao?: Configuracao) => boolean;
};

type NavGroup = {
  label: string;
  icon: typeof Boxes;
  items: NavItem[];
  // Chave em `configuracao.modulos` que controla se este grupo aparece na navegação.
  // Grupos sem essa chave ficam sempre visíveis.
  modulo?: keyof Configuracao["modulos"];
};

const navGroups: NavGroup[] = [
  {
    label: "Almoxarifado",
    icon: Boxes,
    modulo: "materiais",
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/app/lancar", label: "Lançar", icon: ArrowLeftRight },
      { to: "/app/movimentacoes", label: "Movimentações", icon: FileClock },
      { to: "/app/estoque", label: "Estoque", icon: Warehouse },
      {
        to: "/app/inventario",
        label: "Inventário",
        icon: ClipboardList,
        visivel: (configuracao) => configuracao?.inventario.habilitado !== false,
      },
      { to: "/app/cadastros", label: "Cadastros", icon: Settings2 },
    ],
  },
  {
    label: "Equipamentos",
    icon: Wrench,
    modulo: "equipamentos",
    items: [
      { to: "/app/equipamentos", label: "Equipamentos", icon: LayoutList },
      { to: "/app/apropriacoes", label: "Apropriações", icon: UserCheck },
      { to: "/app/movimentacoes-equipamentos", label: "Movimentações", icon: ArrowLeftRight },
      { to: "/app/relatorios-equipamentos", label: "Relatorios", icon: FileChartLine },
    ],
  },
  {
    label: "Documentos",
    icon: FileText,
    modulo: "documentos",
    items: [
      { to: "/app/documentos", label: "Documentos", icon: FileText, exact: true },
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

  // const db = getDB(); 
  // db.movimentacoes_equipamentos.clear()
  return (
    <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-2 py-3">
      <div className="space-y-4">
        {groups.map((group) => {
          const GroupIcon = group.icon;

          return (
            <section key={group.label} aria-label={group.label}>
              <div
                className={[
                  "mb-2 flex items-center border-b border-sidebar-border pb-2",
                  expanded ? "gap-2 px-2" : "justify-center px-1",
                ].join(" ")}
              >
                <GroupIcon
                  className={expanded ? "size-4 shrink-0 text-sidebar-primary" : "size-4 text-sidebar-foreground/45"}
                  aria-hidden="true"
                />
                {expanded && (
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-primary">
                    {group.label}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                {group.items.filter((item) => item.visivel ? item.visivel(configuracao) : true).map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.exact ?? false }}
                    onClick={onNavigate}
                    title={!expanded ? item.label : undefined}
                    aria-label={!expanded ? item.label : undefined}
                    className={[
                      "group relative flex min-h-10 items-center rounded-md text-sm font-medium",
                      "text-sidebar-foreground/80 transition-colors duration-150",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                      expanded ? "gap-3 px-3" : "justify-center px-2",
                    ].join(" ")}
                    activeProps={{
                      className: [
                        "group relative flex min-h-10 items-center rounded-md text-sm font-medium",
                        "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm",
                        "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary",
                        "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                        expanded ? "gap-3 px-3" : "justify-center px-2",
                      ].join(" "),
                    }}
                  >
                    <item.icon
                      className="size-[18px] shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                    {expanded && <span className="truncate">{item.label}</span>}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        <section aria-label="Outros módulos">
          <div
            className={[
              "mb-2 flex items-center border-b border-sidebar-border pb-2",
              expanded ? "gap-2 px-2" : "justify-center px-1",
            ].join(" ")}
          >
            <Settings2 className="size-4 text-sidebar-foreground/35" aria-hidden="true" />
            {expanded && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/35">
                Outro módulo
              </span>
            )}
          </div>

          <div
            className={[
              "flex min-h-10 items-center rounded-md text-sm font-medium text-sidebar-foreground/30",
              expanded ? "gap-3 px-3" : "justify-center px-2",
            ].join(" ")}
            title="Módulo futuro"
            aria-label="Módulo futuro"
          >
            <Settings2 className="size-[18px] shrink-0" aria-hidden="true" />
            {expanded && <span>Em breve</span>}
          </div>
        </section>
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const online = useOnline();
  const [projetoId] = useProjetoAtivoId();
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

  // Enquanto a configuração ainda não carregou, mantemos todos os grupos visíveis
  // para não "piscar" a navegação. Depois de carregada, um grupo só some se o
  // módulo correspondente estiver explicitamente desativado.
  const gruposVisiveis = navGroups.filter(
    (group) => !group.modulo || !configuracao || configuracao.modulos[group.modulo] !== false,
  );

  useEffect(() => {
    if (!projetoId) return;

    void inicializarProjeto(projetoId);
  }, [projetoId]);

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

        <div
          className={`border-t border-sidebar-border p-3 text-xs ${sidebarAberta ? "" : "flex justify-center"
            }`}
        >
          <div
            className="flex items-center gap-2 text-sidebar-foreground/80"
            role="status"
            aria-live="polite"
          >
            {online ? (
              <>
                <span className="relative flex size-3.5 shrink-0 items-center justify-center">
                  <span className="absolute size-2 animate-ping rounded-full bg-success/60" />
                  <Wifi className="relative size-3.5 text-success" />
                </span>
                {sidebarAberta && <span>Online</span>}
              </>
            ) : (
              <>
                <WifiOff className="size-3.5 shrink-0 text-sidebar-primary" />
                {sidebarAberta && <span>Modo offline</span>}
              </>
            )}
          </div>
          {sidebarAberta && (
            <p className="mt-1 text-sidebar-foreground/55">
              {online ? "Dados salvos neste dispositivo" : "Sincroniza ao reconectar"}
            </p>
          )}
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

        <div className="border-t border-sidebar-border p-3 text-xs">
          <div className="flex items-center gap-2 text-sidebar-foreground/80" role="status" aria-live="polite">
            {online ? (
              <>
                <span className="relative flex size-3.5 items-center justify-center">
                  <span className="absolute size-2 animate-ping rounded-full bg-success/60" />
                  <Wifi className="relative size-3.5 text-success" />
                </span>
                Online
              </>
            ) : (
              <>
                <WifiOff className="size-3.5 text-sidebar-primary" /> Modo offline
              </>
            )}
          </div>
          <p className="mt-1 text-sidebar-foreground/55">
            {online ? "Dados salvos neste dispositivo" : "Sincroniza ao reconectar"}
          </p>
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
              className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground lg:flex"
              role="status"
              aria-live="polite"
              title={online ? "Conectado" : "Sem conexão — dados salvos localmente"}
            >
              {online ? (
                <>
                  <span className="relative flex size-2.5 items-center justify-center">
                    <span className="absolute size-2 animate-ping rounded-full bg-success/60" />
                    <span className="relative size-1.5 rounded-full bg-success" />
                  </span>
                  Online
                </>
              ) : (
                <>
                  <WifiOff className="size-3.5 text-primary" />
                  Offline
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/" })}
              className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Trocar projeto
            </Button>
            <Link
              to="/app/dados"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              activeProps={{
                className: "inline-flex h-9 items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              }}
              title="Dados, backup e exportação"
            >
              <Database className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Dados</span>
            </Link>
            <Link
              to="/app/configuracoes"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              activeProps={{
                className: "inline-flex h-9 items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              }}
              title="Configurações"
            >
              <Settings className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Configurações</span>
            </Link>

          </div>
        </header>

        <main className="p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}