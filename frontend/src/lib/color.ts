import { formatHex, interpolate } from "culori";

import { PALETTES, type ThemeName } from "./tokens";

type Ramp = (t: number) => string;

function ramp(stops: string[]): Ramp {
  const fn = interpolate(stops, "oklch");
  return (t: number) => formatHex(fn(Math.min(1, Math.max(0, t)))) ?? stops[0];
}

const scoreRamps: Record<ThemeName, Ramp> = {
  bench: ramp([PALETTES.bench.acid, PALETTES.bench.litmus, PALETTES.bench.base]),
  night: ramp([PALETTES.night.acid, PALETTES.night.litmus, PALETTES.night.base]),
};

const heatRamps: Record<ThemeName, Ramp> = {
  bench: ramp([PALETTES.bench.paper, PALETTES.bench.litmus]),
  night: ramp([PALETTES.night.paper, PALETTES.night.litmus]),
};

/** Score in [-1, 1] to a colour on the acid, litmus, base ramp (OKLCH). */
export function scoreColor(score: number, theme: ThemeName): string {
  return scoreRamps[theme]((Math.max(-1, Math.min(1, score)) + 1) / 2);
}

/**
 * How far toward litmus the heat ramp goes. Past about 0.7 neither graphite nor
 * paper text reaches 4.5:1 on the cell, so the ramp stops at 0.62 and counts
 * are always printed in graphite (at least 5:1 in both themes).
 */
export const HEAT_MAX = 0.62;

/** Single-hue ramp from paper toward litmus for confusion matrices, t in [0, 1]. */
export function heatColor(t: number, theme: ThemeName): string {
  return heatRamps[theme](Math.min(1, Math.max(0, t)) * HEAT_MAX);
}

/** Text on a heat cell is always graphite; see HEAT_MAX. */
export function heatTextColor(theme: ThemeName): string {
  return PALETTES[theme].graphite;
}

/** Interpolate between two colours in OKLCH (used for the 300ms hue glide). */
export function mix(from: string, to: string, t: number): string {
  return formatHex(interpolate([from, to], "oklch")(Math.min(1, Math.max(0, t)))) ?? to;
}

export function labelColor(label: string, theme: ThemeName): string {
  const p = PALETTES[theme];
  return label === "negative" ? p.acid : label === "positive" ? p.base : p.litmus;
}
