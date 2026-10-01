const MINUS = "−";

/** Always signed, true minus sign, two decimals: +0.62, −0.81, ±0.00. */
export function formatScore(score: number, digits = 2): string {
  const rounded = Number(score.toFixed(digits));
  if (rounded === 0) return `±${(0).toFixed(digits)}`;
  const body = Math.abs(rounded).toFixed(digits);
  return rounded > 0 ? `+${body}` : `${MINUS}${body}`;
}

export function formatPercent(p: number): string {
  if (p > 0 && p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-GB");
}

/** Signed weight with three decimals for explanation tooltips. */
export function formatWeight(w: number): string {
  return formatScore(w, 3);
}

export type Label = "negative" | "neutral" | "positive";

/** "Reads positive" when the top class is at least 50%, "Leans positive" below that. */
export function verdict(label: Label, confidence: number): string {
  return `${confidence >= 0.5 ? "Reads" : "Leans"} ${label}`;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatDateRange(first: string, last: string): string {
  const a = new Date(first);
  const b = new Date(last);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const day = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  if (a.toDateString() === b.toDateString()) return day(a, true);
  return `${day(a, !sameYear)} to ${day(b, true)}`;
}
