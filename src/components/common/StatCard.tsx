import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  valor,
  sub,
  icon: Icon,
  tone = "default",
  onClick,
}: {
  label: string;
  valor: string | number;
  sub?: string;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "success" | "danger";
  onClick?: () => void;
}) {
  const tones = {
    default: "border-border",
    warning: "border-warning/50 bg-warning/5",
    success: "border-success/40 bg-success/5",
    danger: "border-destructive/40 bg-destructive/5",
  };
  const iconTones = {
    default: "text-muted-foreground",
    warning: "text-warning",
    success: "text-success",
    danger: "text-destructive",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-lg border bg-card p-4 text-left transition-shadow",
        tones[tone],
        onClick && "hover:shadow-md cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className={cn("size-4", iconTones[tone])} />}
      </div>
      <p className="num mt-2 font-display text-3xl font-bold leading-none">{valor}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </button>
  );
}
