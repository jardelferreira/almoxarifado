import { memo, useCallback, useEffect, useRef } from "react";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* -------------------------------------------------------------------------- */
/* Tokens de tom                                                               */
/* -------------------------------------------------------------------------- */
/*
 * Todos os tons usam variáveis do tema (primary / success / warning /
 * destructive). Nada de cores fixas do Tailwind: assim o módulo acompanha
 * light, dark e qualquer troca de paleta feita no tema.
 */

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

type ToneStyle = {
  rail: string;
  surface: string;
  icon: string;
  value: string;
  badge: string;
};

const TONES: Record<Tone, ToneStyle> = {
  neutral: {
    rail: "bg-border",
    surface: "bg-card",
    icon: "bg-muted text-muted-foreground",
    value: "text-foreground",
    badge: "border-border bg-muted/50 text-muted-foreground",
  },
  primary: {
    rail: "bg-primary",
    surface: "bg-primary/[0.04]",
    icon: "bg-primary/10 text-primary",
    value: "text-foreground",
    badge: "border-primary/30 bg-primary/10 text-primary",
  },
  success: {
    rail: "bg-success",
    surface: "bg-success/[0.05]",
    icon: "bg-success/10 text-success",
    value: "text-foreground",
    badge: "border-success/30 bg-success/10 text-success",
  },
  warning: {
    rail: "bg-warning",
    surface: "bg-warning/[0.06]",
    icon: "bg-warning/10 text-warning",
    value: "text-foreground",
    badge: "border-warning/30 bg-warning/10 text-warning",
  },
  danger: {
    rail: "bg-destructive",
    surface: "bg-destructive/[0.05]",
    icon: "bg-destructive/10 text-destructive",
    value: "text-foreground",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

export function toneBadgeClass(tone: Tone): string {
  return TONES[tone].badge;
}

export function toneTextClass(tone: Tone): string {
  switch (tone) {
    case "success":
      return "text-success";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-destructive";
    case "primary":
      return "text-primary";
    default:
      return "text-foreground";
  }
}

/* -------------------------------------------------------------------------- */
/* Cabeçalho de seção                                                          */
/* -------------------------------------------------------------------------- */

export const SectionHeader = memo(function SectionHeader({
  id,
  icon: Icon,
  title,
  description,
  actions,
}: {
  id?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="font-display text-lg font-semibold uppercase leading-tight">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* StatTile — KPI com destaque                                                 */
/* -------------------------------------------------------------------------- */

/*
 * Mesma API do StatCard compartilhado (label / valor / icon / sub / tone),
 * com hierarquia visual mais forte: trilho de cor, número em escala display e
 * elevação reservada para os cartões realmente clicáveis.
 */
export const StatTile = memo(function StatTile({
  label,
  valor,
  icon: Icon,
  sub,
  tone = "neutral",
  onClick,
  hint,
}: {
  label: string;
  valor: string | number;
  icon?: ComponentType<{ className?: string }>;
  sub?: string;
  tone?: Tone;
  onClick?: () => void;
  hint?: string;
}) {
  const t = TONES[tone];
  const body = (
    <>
      <span className={`absolute inset-y-0 left-0 w-1 ${t.rail}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase leading-snug tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${t.icon}`}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className={`mt-2 font-display text-[28px] font-bold leading-none tabular-nums ${t.value}`}>{valor}</p>
      {sub ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{sub}</p> : null}
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p> : null}
    </>
  );

  const base = `relative overflow-hidden rounded-xl border pl-5 pr-4 py-4 ${t.surface}`;

  if (!onClick) {
    return <div className={`${base} shadow-[0_1px_2px_0_rgb(0_0_0_/_0.04)]`}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} group text-left transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
    >
      {body}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Metric — número compacto dentro de um cartão                                */
/* -------------------------------------------------------------------------- */

export const Metric = memo(function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <p className="text-[11px] leading-snug text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold tabular-nums ${toneTextClass(tone)}`}>{value}</p>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* ToneStat — os blocos coloridos de faixa (risco, reposição)                   */
/* -------------------------------------------------------------------------- */

export const ToneStat = memo(function ToneStat({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: string | number;
  tone: Tone;
  caption?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`relative overflow-hidden rounded-xl border px-4 py-3 ${t.surface}`}>
      <span className={`absolute inset-x-0 top-0 h-0.5 ${t.rail}`} aria-hidden="true" />
      <p className="text-[11px] font-medium leading-snug text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${toneTextClass(tone)}`}>{value}</p>
      {caption ? <p className="mt-1 text-[11px] text-muted-foreground">{caption}</p> : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* ToneBadge                                                                   */
/* -------------------------------------------------------------------------- */

export const ToneBadge = memo(function ToneBadge({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${TONES[tone].badge}`}
    >
      {children}
    </span>
  );
});

/* -------------------------------------------------------------------------- */
/* EmptyState                                                                  */
/* -------------------------------------------------------------------------- */

export const EmptyState = memo(function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 text-center ${
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10"
      }`}
    >
      {Icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-inset ring-border">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Painel interno (sub-cartão dentro de um Card)                               */
/* -------------------------------------------------------------------------- */

export const Panel = memo(function Panel({
  title,
  description,
  aside,
  children,
}: {
  title?: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      {title || aside ? (
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Tabelas                                                                     */
/* -------------------------------------------------------------------------- */

export const THEAD_CLASS =
  "sticky top-0 z-10 bg-muted/60 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur";

export function TableShell({ minWidth = 720, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto rounded-xl border sm:mx-0">
      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export const TBODY_CLASS = "divide-y";
export const TR_CLASS = "transition-colors hover:bg-muted/40";
export const TD_CLASS = "px-3 py-2.5";
export const TD_NUM_CLASS = "px-3 py-2.5 text-right tabular-nums";
export const TH_CLASS = "px-3 py-2.5 font-medium";
export const TH_NUM_CLASS = "px-3 py-2.5 text-right font-medium";

/* -------------------------------------------------------------------------- */
/* Tooltip de gráfico com as cores do tema                                     */
/* -------------------------------------------------------------------------- */

type TooltipPayload = { name?: string; value?: number | string; color?: string; dataKey?: string };

export function ChartTooltip({
  active,
  payload,
  label,
  labelPrefix,
  format,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  labelPrefix?: string;
  format?: (valor: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-popover-foreground">
        {labelPrefix ? `${labelPrefix} ` : ""}
        {label}
      </p>
      <div className="mt-1.5 space-y-1">
        {payload.map((item) => (
          <div key={String(item.dataKey ?? item.name)} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: item.color }} aria-hidden="true" />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-popover-foreground">
              {format ? format(Number(item.value)) : String(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Cores de série, resolvidas pelo tema com fallback seguro. */
export const COR_ENTRADA = "var(--success, #16a34a)";
export const COR_SAIDA = "var(--destructive, #dc2626)";
export const COR_ANTERIOR = "var(--chart-2)";
export const COR_ATUAL = "var(--chart-1)";
export const COR_GRID = "var(--border, #e2e8f0)";
export const COR_EIXO = "var(--muted-foreground, #64748b)";

/* -------------------------------------------------------------------------- */
/* ChartCard — moldura padrão dos gráficos, com estado vazio embutido          */
/* -------------------------------------------------------------------------- */

export function ChartCard({
  title,
  description,
  footnote,
  height = 320,
  isEmpty,
  emptyLabel = "Sem movimentações no período selecionado.",
  children,
}: {
  title: string;
  description?: string;
  footnote?: string;
  height?: number;
  isEmpty: boolean;
  emptyLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <p className="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="w-full" style={{ height }}>
          {isEmpty ? (
            <EmptyState title={emptyLabel} description="Ajuste o período ou remova filtros para ver dados aqui." />
          ) : (
            children
          )}
        </div>
        {footnote ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{footnote}</p> : null}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* NavPills — navegação principal entre as análises                            */
/* -------------------------------------------------------------------------- */

export type NavPillItem<T extends string> = {
  id: T;
  label: string;
  short?: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
  badgeTone?: Tone;
};

/*
 * Destaque: superfície própria com borda e sombra, aba ativa em `primary`
 * sólido, contagens de exceções direto na aba, navegação por setas do teclado
 * e rolagem automática do item selecionado. Tudo em tokens do tema.
 */
export function NavPills<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: ReadonlyArray<NavPillItem<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const index = items.findIndex((item) => item.id === value);
      const last = items.length - 1;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? last
            : event.key === "ArrowRight"
              ? index >= last
                ? 0
                : index + 1
              : index <= 0
                ? last
                : index - 1;
      const alvo = items[next];
      if (!alvo) return;
      onChange(alvo.id);
      const node = listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next];
      node?.focus();
    },
    [items, onChange, value],
  );

  return (
    <div className="relative">
      {/* Máscaras de rolagem: indicam que há mais abas fora da área visível. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 rounded-l-xl bg-gradient-to-r from-background to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 rounded-r-xl bg-gradient-to-l from-background to-transparent"
        aria-hidden="true"
      />
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const { id, label, short, icon: Icon, badge, badgeTone = "neutral" } = item;
          const ativo = value === id;
          return (
            <button
              key={id}
              ref={ativo ? activeRef : undefined}
              type="button"
              role="tab"
              id={`aba-${id}`}
              aria-selected={ativo}
              aria-controls={`painel-${id}`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => onChange(id)}
              className={`group relative inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card ${
                ativo
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="whitespace-nowrap sm:hidden">{short ?? label}</span>
              <span className="hidden whitespace-nowrap sm:inline">{label}</span>
              {badge && badge > 0 ? (
                <span
                  className={`ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    ativo ? "bg-primary-foreground/20 text-primary-foreground" : TONES[badgeTone].badge + " border"
                  }`}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeletons                                                                   */
/* -------------------------------------------------------------------------- */

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl border bg-muted/30 ${className}`} />;
}