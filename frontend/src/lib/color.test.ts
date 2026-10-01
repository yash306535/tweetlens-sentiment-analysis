import { readFileSync } from "node:fs";

import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

import { heatColor, heatTextColor, scoreColor } from "./color";
import { formatScore, verdict } from "./format";
import { PALETTES, type ThemeName } from "./tokens";

const THEMES: ThemeName[] = ["bench", "night"];
const steps = Array.from({ length: 101 }, (_, i) => i / 100);

describe("score colours", () => {
  it("hit the palette at -1, 0 and +1", () => {
    for (const theme of THEMES) {
      expect(scoreColor(-1, theme)).toBe(PALETTES[theme].acid);
      expect(scoreColor(0, theme)).toBe(PALETTES[theme].litmus);
      expect(scoreColor(1, theme)).toBe(PALETTES[theme].base);
    }
  });

  it("stay readable as text on paper at every point of the ramp", () => {
    for (const theme of THEMES) {
      for (const t of steps) {
        const c = scoreColor(t * 2 - 1, theme);
        expect(wcagContrast(c, PALETTES[theme].paper)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keep paper text readable on every strip colour", () => {
    for (const theme of THEMES) {
      for (const t of steps) {
        expect(wcagContrast(PALETTES[theme].paper, scoreColor(t * 2 - 1, theme))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("heat cells", () => {
  it("keep their count text above 4.5:1 across the ramp", () => {
    for (const theme of THEMES) {
      for (const t of steps) {
        expect(wcagContrast(heatTextColor(theme), heatColor(t, theme))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("tokens", () => {
  it("match between tokens.css and tokens.ts", () => {
    const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
    const [light, ...rest] = css.split("@media (prefers-color-scheme: dark)");
    const dark = rest.join("");
    const read = (block: string, name: string) => block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`))?.[1];
    for (const [name, value] of Object.entries(PALETTES.bench)) expect(read(light, name), name).toBe(value);
    for (const [name, value] of Object.entries(PALETTES.night)) expect(read(dark, name), name).toBe(value);
  });
});

describe("formatting", () => {
  it("always signs scores with a true minus", () => {
    expect(formatScore(0.623)).toBe("+0.62");
    expect(formatScore(-0.805)).toBe("−0.81");
    expect(formatScore(0.001)).toBe("±0.00");
    expect(formatScore(-0.004)).toBe("±0.00");
  });

  it("says leans below 50%", () => {
    expect(verdict("positive", 0.7)).toBe("Reads positive");
    expect(verdict("neutral", 0.41)).toBe("Leans neutral");
  });
});
