import { line, curveMonotoneX } from "d3-shape";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { scoreColor } from "../lib/color";
import { formatScore } from "../lib/format";
import { useReducedMotion } from "../lib/motion";
import { useTheme } from "../lib/theme";

export interface RibbonTweet {
  seq: number;
  score: number;
  avg: number;
}

interface Props {
  tweets: RibbonTweet[];
  selected: number | null;
  onSelect: (seq: number) => void;
  /** Milliseconds between tweets, so the scroll lasts exactly one interval. */
  interval: number;
  onHoldChange?: (holding: boolean) => void;
}

export const BAND = 3;
const LINE_TOP = 14;
const LINE_H = 104;
const GAP = 14;
const BAND_H = 64;
const HEIGHT = LINE_TOP + LINE_H + GAP + BAND_H;
const LABEL_W = 34;

/** A chart-recorder ribbon: one 3px band per tweet, newest on the right, with the rolling average drawn above. */
export function Ribbon({ tweets, selected, onSelect, interval, onHoldChange }: Props) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(100, width - LABEL_W);
  const last = tweets.length ? tweets[tweets.length - 1].seq : 0;
  const shift = plotW - (last + 1) * BAND;
  const y = (s: number) => LINE_TOP + ((1 - s) / 2) * LINE_H;
  const path =
    line<RibbonTweet>()
      .x((t) => t.seq * BAND + BAND / 2)
      .y((t) => y(t.avg))
      .curve(curveMonotoneX)(tweets) ?? "";

  const seqAt = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    const x = clientX - rect.left - LABEL_W - shift;
    const seq = Math.floor(x / BAND);
    return tweets.some((t) => t.seq === seq) ? seq : null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!tweets.length) return;
    const current = selected ?? last;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = current + (e.key === "ArrowLeft" ? -1 : 1);
      if (tweets.some((t) => t.seq === next)) onSelect(next);
    } else if (e.key === "End") {
      e.preventDefault();
      onSelect(last);
    }
  };

  const current = tweets[tweets.length - 1];
  const highlight = hover ?? selected;

  return (
    <div
      ref={wrap}
      className="ribbon"
      tabIndex={0}
      role="group"
      aria-label="Chart recorder ribbon. Each band is one tweet, newest on the right. Use the left and right arrow keys to choose a tweet."
      onKeyDown={onKeyDown}
      onFocus={() => onHoldChange?.(true)}
      onBlur={() => onHoldChange?.(false)}
      onPointerEnter={() => onHoldChange?.(true)}
      onPointerLeave={() => {
        setHover(null);
        onHoldChange?.(false);
      }}
      onPointerMove={(e: PointerEvent) => setHover(seqAt(e.clientX))}
      onClick={(e) => {
        const seq = seqAt(e.clientX);
        if (seq !== null) onSelect(seq);
      }}
    >
      <svg width={width} height={HEIGHT} className="chart" aria-hidden="true">
        {[1, 0, -1].map((v) => (
          <g key={v}>
            <line x1={LABEL_W} x2={width} y1={y(v)} y2={y(v)} className="chart__grid" />
            <text x={LABEL_W - 8} y={y(v) + 5} textAnchor="end" className="chart__axis">
              {v === 0 ? "0" : formatScore(v, 0)}
            </text>
          </g>
        ))}
        <rect x={LABEL_W} y={LINE_TOP + LINE_H + GAP} width={plotW} height={BAND_H} rx={2} fill="var(--strip-paper)" />
        <svg x={LABEL_W} width={plotW} height={HEIGHT} overflow="hidden">
          <g
            style={{
              transform: `translateX(${shift}px)`,
              transition: reduced ? "none" : `transform ${interval}ms linear`,
            }}
          >
            {tweets.map((t) => (
              <rect
                key={t.seq}
                x={t.seq * BAND}
                y={LINE_TOP + LINE_H + GAP}
                width={BAND}
                height={BAND_H}
                fill={scoreColor(t.score, theme)}
              />
            ))}
            <path d={path} fill="none" stroke="var(--graphite)" strokeWidth={2} strokeLinejoin="round" />
            {highlight !== null && tweets.some((t) => t.seq === highlight) && (
              <rect
                x={highlight * BAND - 2}
                y={LINE_TOP + LINE_H + GAP - 6}
                width={BAND + 4}
                height={BAND_H + 12}
                fill="none"
                stroke="var(--graphite)"
                strokeWidth={1.5}
                rx={1}
              />
            )}
          </g>
        </svg>
      </svg>
      {current && (
        <p className="ribbon__now small num" style={{ top: y(current.avg) - 11 }}>
          {formatScore(current.avg)}
        </p>
      )}
    </div>
  );
}
