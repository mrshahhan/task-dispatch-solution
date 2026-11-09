const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, без перехода на летнее время

/** Дата YYYY-MM-DD по времени Алматы для ISO-времени (UTC). */
export function almatyDate(iso: string): string {
  return new Date(Date.parse(iso) + ALMATY_OFFSET_MS).toISOString().slice(0, 10);
}

/** true, если строка — существующая календарная дата YYYY-MM-DD. */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
