import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { PALETTES, type Palette, type ThemeName } from "./tokens";

const STORAGE_KEY = "tweetlens-theme";

interface ThemeState {
  theme: ThemeName;
  palette: Palette;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function effectiveTheme(): ThemeName {
  const attr = document.documentElement.dataset.theme;
  if (attr === "dark") return "night";
  if (attr === "light") return "bench";
  return systemDark() ? "night" : "bench";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() => effectiveTheme());

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(effectiveTheme());
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const meta = document.querySelectorAll('meta[name="theme-color"]');
    meta.forEach((m) => m.setAttribute("content", PALETTES[theme].paper));
  }, [theme]);

  const toggle = useCallback(() => {
    const next = effectiveTheme() === "night" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage can be blocked; the theme still switches for this visit */
    }
    setTheme(effectiveTheme());
  }, []);

  const value = useMemo(() => ({ theme, palette: PALETTES[theme], toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme needs a ThemeProvider");
  return ctx;
}
