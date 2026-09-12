import {
  Activity,
  ArrowLeftRight,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
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
} from "lucide-react";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useOnline, useProjetoAtivoId } from "@/hooks/useAppData";
import { inicializarProjeto } from "@/services/projeto-inicializacao";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/db/db";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

type NavGroup = {
  label: string;
  icon: typeof Boxes;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Almoxarifado",
    icon: Boxes,
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/app/lancar", label: "Lançar", icon: PackagePlus },
      { to: "/app/movimentacoes", label: "Movimentações", icon: ListChecks },
      { to: "/app/estoque", label: "Estoque", icon: Warehouse },
      { to: "/app/cadastros", label: "Cadastros", icon: Settings2 },
      { to: "/app/dados", label: "Dados", icon: Database },
    ],
  },
  {
    label: "Equipamentos",
    icon: Wrench,
    items: [
      { to: "/app/equipamentos", label: "Equipamentos", icon: HardHat },
      { to: "/app/apropriacoes", label: "Apropriações", icon: UserCheck },
      { to: "/app/movimentacoes-equipamentos", label: "Movimentações", icon: Activity },
    ],
  },
];

function Navigation({
  expanded,
  onNavigate,
}: {
  expanded: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-2 py-3">
      <div className="space-y-4">
        {navGroups.map((group) => {
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
                {group.items.map((item) => (
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
                      expanded ? "gap-3 px-3" : "justify-center px-2",
                    ].join(" ")}
                    activeProps={{
                      className: [
                        "group relative flex min-h-10 items-center rounded-md text-sm font-medium",
                        "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm",
                        "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary",
                        expanded ? "gap-3 px-3" : "justify-center px-2",
                      ].join(" "),
                    }}
                  >
                    <item.icon
                      className="size-[18px] shrink-0"
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

  useEffect(() => {
    if (!projetoId) return;

    void inicializarProjeto(projetoId);
  }, [projetoId]);

  return (
    <div className="min-h-screen bg-background">
      {/* Navegação desktop: recolhível para preservar a área útil. */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-sidebar text-sidebar-foreground shadow-sm transition-[width] duration-200 ease-out md:flex ${
            sidebarAberta ? "w-60" : "w-16"
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
              <ChevronLeft className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </Button>
        </div>

        <Navigation expanded={sidebarAberta} />

        <div
          className={`border-t border-sidebar-border p-3 text-xs ${sidebarAberta ? "" : "flex justify-center"
            }`}
        >
          <div className="flex items-center gap-2 text-sidebar-foreground/80">
            {online ? (
              <>
                <Wifi className="size-3.5 shrink-0 text-success" />
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
              Dados salvos neste dispositivo
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
          expanded
          onNavigate={() => setMobileMenuAberto(false)}
        />

        <div className="border-t border-sidebar-border p-3 text-xs">
          <div className="flex items-center gap-2 text-sidebar-foreground/80">
            {online ? (
              <>
                <Wifi className="size-3.5 text-success" /> Online
              </>
            ) : (
              <>
                <WifiOff className="size-3.5 text-sidebar-primary" /> Modo offline
              </>
            )}
          </div>
          <p className="mt-1 text-sidebar-foreground/55">
            Dados salvos neste dispositivo
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

          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => navigate({ to: "/" })}
          >
            Trocar projeto
          </Button>
        </header>

        <main className="p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
