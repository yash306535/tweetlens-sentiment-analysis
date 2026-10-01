import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { scoreColor } from "../lib/color";
import { formatDay } from "../lib/format";
import { useTheme } from "../lib/theme";

interface Props {
  scores: number[];
  dates: (string | null)[];
  selected: number | null;
  onSelect: (index: number) => void;
  height?: number;
}

/** The whole batch as one strip of thin bands, one per tweet, in date order. */
export function Barcode({ scores, dates, selected, onSelect, height = 72 }: Props) {
  const { theme, palette } = useTheme();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const n = scores.length;

  useLayoutEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !n) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    const ctx = el.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const step = width / n;
    // Cache colours: scores repeat at two decimals.
    const cache = new Map<number, string>();
    for (let i = 0; i < n; i++) {
      const key = Math.round(scores[i] * 100);
      let colour = cache.get(key);
      if (!colour) {
        colour = scoreColor(key / 100, theme);
        cache.set(key, colour);
      }
      ctx.fillStyle = colour;
      // A hair of overlap avoids seams between sub-pixel bands.
      ctx.fillRect(i * step, 0, step + 0.6, height);
    }
    if (selected !== null) {
      const x = selected * step;
      ctx.strokeStyle = palette.graphite;
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.max(1, x - 1), 1, Math.max(step, 2) + 2, height - 2);
    }
  }, [scores, width, height, theme, palette, selected, n]);

  const indexAt = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * n)));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const current = selected ?? -1;
    const jump = e.shiftKey ? Math.max(1, Math.round(n / 20)) : 1;
    if (e.key === "ArrowRight") onSelect(Math.min(n - 1, current + jump));
    else if (e.key === "ArrowLeft") onSelect(Math.max(0, current - jump));
    else if (e.key === "Home") onSelect(0);
    else if (e.key === "End") onSelect(n - 1);
    else return;
    e.preventDefault();
  };

  // Day ticks: mark where the date changes.
  const ticks: { x: number; label: string }[] = [];
  if (dates.some(Boolean)) {
    let lastDay = "";
    dates.forEach((d, i) => {
      if (!d) return;
      const day = d.slice(0, 10);
      if (day !== lastDay) {
        ticks.push({ x: (i / n) * 100, label: formatDay(d) });
        lastDay = day;
      }
    });
  }
  // Drop labels that would collide with the previous one.
  const shown = new Set<number>();
  let lastX = -Infinity;
  ticks.forEach((t, i) => {
    const px = (t.x / 100) * width;
    if (px - lastX >= 64 && px <= width - 48) {
      shown.add(i);
      lastX = px;
    }
  });

  return (
    <div className="barcode">
      <div
        ref={wrap}
        className="barcode__strip"
        tabIndex={0}
        role="group"
        aria-label={`Mood barcode of ${n} tweets. Use the arrow keys to move through them; hold Shift to jump.`}
        onKeyDown={onKeyDown}
        onClick={(e) => onSelect(indexAt(e.clientX))}
      >
        <canvas ref={canvas} style={{ width: "100%", height }} aria-hidden="true" />
      </div>
      {ticks.length > 0 && (
        <div className="barcode__ticks small muted" aria-hidden="true">
          {ticks.map((t, i) =>
            shown.has(i) ? (
              <span key={i} style={{ left: `${t.x}%` }}>
                {t.label}
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
