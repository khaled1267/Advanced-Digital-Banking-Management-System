export type AnalyticsRange = { start: Date; end: Date; key: string };

export function parseAnalyticsRange(params: URLSearchParams, now = new Date()): AnalyticsRange | null {
  const key = params.get("range") ?? "30d";
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  if (key === "7d" || key === "30d" || key === "90d") {
    const days = Number(key.slice(0, -1));
    return { start: new Date(end.getTime() - days * 86_400_000), end, key };
  }
  const startText = params.get("startDate");
  const endText = params.get("endDate");
  if (key !== "custom" || !startText || !endText || !/^\d{4}-\d{2}-\d{2}$/.test(startText) || !/^\d{4}-\d{2}-\d{2}$/.test(endText)) return null;
  const start = new Date(`${startText}T00:00:00.000Z`);
  const lastDay = new Date(`${endText}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(lastDay.getTime()) || start.toISOString().slice(0, 10) !== startText || lastDay.toISOString().slice(0, 10) !== endText) return null;
  const span = lastDay.getTime() - start.getTime();
  if (span < 0 || span >= 365 * 86_400_000 || lastDay >= end) return null;
  return { start, end: new Date(lastDay.getTime() + 86_400_000), key: "custom" };
}
