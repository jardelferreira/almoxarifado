import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Boxes,
  Database,
  LayoutDashboard,
  ListChecks,
  PackageSearch,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useOnline, useProjetoAtivoId } from "@/hooks/useAppData";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/db/db";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/lancar", label: "Lançar", icon: ArrowLeftRight },
  { to: "/app/movimentacoes", label: "Movimentações", icon: ListChecks },
  { to: "/app/estoque", label: "Estoque", icon: PackageSearch },
  { to: "/app/cadastros", label: "Cadastros", icon: Boxes },
  { to: "/app/dados", label: "Dados", icon: Database },
];

export function AppShell({ children }: { children: ReactNode }) {
  const online = useOnline();
  const [projetoId] = useProjetoAtivoId();
  const navigate = useNavigate();
  const projeto = useLiveQuery(
    () => (projetoId ? getDB().projetos.get(projetoId) : undefined),
    [projetoId],
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-5 py-5">
          <p className="font-display text-2xl font-bold uppercase tracking-wide text-sidebar-primary">
            Almoxarifado
          </p>
          <p className="mt-0.5 text-xs text-sidebar-foreground/70">Gestão local-first</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact ?? false }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className:
                  "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary",
              }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
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
          <p className="mt-1 text-sidebar-foreground/55">Dados salvos neste dispositivo</p>
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:px-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Projeto ativo
            </p>
            <p className="font-display text-lg font-semibold leading-tight">
              {projeto ? `${projeto.codigo} · ${projeto.nome}` : "Nenhum projeto"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/" })}>
            Trocar projeto
          </Button>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact ?? false }}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground"
              activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
