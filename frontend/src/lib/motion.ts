import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** easeOutExpo-like curve matching cubic-bezier(0.16, 1, 0.3, 1) closely enough for JS tweens. */
export function easeOut(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/** Cubic ease-out: liquid climbing paper slows as it rises. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, t), 3);
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
