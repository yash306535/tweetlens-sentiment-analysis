import type { ModelId, Reading } from "./api";
import { formatScore } from "./format";

/** One sentence on how the four models agree or split. */
export function describeAgreement(
  readings: Record<ModelId, Reading>,
  name: (id: ModelId) => string,
  order: ModelId[],
): string {
  const groups = new Map<string, ModelId[]>();
  for (const id of order) {
    const label = readings[id].label;
    groups.set(label, [...(groups.get(label) ?? []), id]);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const list = (ids: ModelId[]) =>
    ids.length === 1 ? name(ids[0]) : `${ids.slice(0, -1).map(name).join(", ")} and ${name(ids[ids.length - 1])}`;

  if (sorted.length === 1) {
    const scores = order.map((id) => readings[id].score);
    const lo = Math.min(...scores);
    const hi = Math.max(...scores);
    const weakest = order.reduce((a, b) => (Math.abs(readings[a].score) < Math.abs(readings[b].score) ? a : b));
    return `All four read ${sorted[0][0]}. Scores run from ${formatScore(lo)} to ${formatScore(hi)}; ${name(weakest)} is the least sure.`;
  }
  if (sorted.length === 2 && sorted[0][1].length === 3) {
    const [odd] = sorted[1][1];
    return `${name(odd)} is the outlier: it reads ${sorted[1][0]} while the other three read ${sorted[0][0]}.`;
  }
  if (sorted.length === 2) {
    return `The models split two against two: ${list(sorted[0][1])} read ${sorted[0][0]}, ${list(sorted[1][1])} read ${sorted[1][0]}.`;
  }
  const [a, b, c] = sorted;
  return `No majority: ${list(a[1])} read ${a[0]}, ${list(b[1])} reads ${b[0]} and ${list(c[1])} reads ${c[0]}.`;
}
