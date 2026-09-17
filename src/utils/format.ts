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


/**
 * Converte uma data de negócio sem horário (YYYY-MM-DD) para um instante
 * baseado no relógio local do computador. O retorno é ISO UTC, permitindo
 * que a exibição converta o instante novamente para o fuso local do usuário.
 */
export function normalizarDataHoraLocal(data?: string | null, agora = new Date()) {
  if (!data) return data ?? null;

  const dataMatch = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dataMatch) {
    const [, ano, mes, dia] = dataMatch;
    const local = new Date(
      Number(ano),
      Number(mes) - 1,
      Number(dia),
      agora.getHours(),
      agora.getMinutes(),
      agora.getSeconds(),
      agora.getMilliseconds(),
    );
    return local.toISOString();
  }

  // ISO sem timezone: trata como horário local antes de normalizar para UTC.
  const semFuso = data.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/);
  if (semFuso) {
    return new Date(data).toISOString();
  }

  return data;
}
