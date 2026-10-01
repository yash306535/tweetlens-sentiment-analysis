// The palette from DESIGN.md. src/styles/tokens.css holds the same values for
// CSS; tokens.test.ts fails if the two drift apart.

export type ThemeName = "bench" | "night";

export interface Palette {
  paper: string;
  surface: string;
  graphite: string;
  pencil: string;
  bench: string;
  acid: string;
  litmus: string;
  base: string;
}

export const PALETTES: Record<ThemeName, Palette> = {
  bench: {
    paper: "#f2f4f3",
    surface: "#f2f4f3",
    graphite: "#262b30",
    pencil: "#5e666d",
    bench: "#d9e0dc",
    acid: "#c8364e",
    litmus: "#7b5ca6",
    base: "#2a6cb0",
  },
  night: {
    paper: "#1b2025",
    surface: "#252b31",
    graphite: "#e4e8e6",
    pencil: "#9aa3a9",
    bench: "#343b42",
    acid: "#e2566c",
    litmus: "#9d80c8",
    base: "#4f8fd6",
  },
};
