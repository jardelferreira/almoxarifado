export function normalizar(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .trim();
}

export function formatarData(iso?: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export function num(v: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);
}
