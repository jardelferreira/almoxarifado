import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useProjetoAtivoId } from "@/hooks/useAppData";

export const Route = createFileRoute("/app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const [projetoId] = useProjetoAtivoId();
  const navigate = useNavigate();

  useEffect(() => {
    if (projetoId === null && typeof window !== "undefined") {
      const stored = localStorage.getItem("almox.projeto_ativo");
      if (!stored) void navigate({ to: "/" });
    }
  }, [projetoId, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
