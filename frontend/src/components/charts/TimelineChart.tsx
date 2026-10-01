import { scaleLinear, scaleTime } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { useLayoutEffect, useRef, useState } from "react";

import { scoreColor } from "../../lib/color";
import { formatCount, formatDay, formatScore } from "../../lib/format";
import { useTheme } from "../../lib/theme";

interface Point {
  start: string;
  n: number;
  mean_score: number;
}

interface Props {
  points: Point[];
  bucket: "day" | "hour";
}

const H = 220;
const M = { top: 16, right: 64, bottom: 28, left: 44 };

/** Mean score per day (or hour), labelled directly at the last point. */
export function TimelineChart({ points, bucket }: Props) {
  const { theme } = useTheme();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  useLayoutEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const times = points.map((p) => new Date(p.start));
  const extent = Math.max(0.25, ...points.map((p) => Math.abs(p.mean_score)));
  const limit = Math.min(1, Math.ceil((extent + 0.05) * 4) / 4);
  const x = scaleTime()
    .domain([times[0], times[times.length - 1]])
    .range([M.left, width - M.right]);
  const y = scaleLinear()
    .domain([-limit, limit])
    .range([H - M.bottom, M.top]);
  const ticks = y.ticks(4);
  const path =
    line<Point>()
      .x((p) => x(new Date(p.start)))
      .y((p) => y(p.mean_score))
      .curve(curveMonotoneX)(points) ?? "";
  const last = points[points.length - 1];
  // Keep x labels at least 64px apart.
  const room = Math.max(2, Math.floor((width - M.left - M.right) / 64));
  const candidates = points.length <= 10 ? times : x.ticks(6);
  const every = Math.ceil(candidates.length / room);
  const xTicks = candidates.filter((_, i) => i % every === 0);
  const fmt = (d: Date) =>
    bucket === "day"
      ? formatDay(d.toISOString())
      : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  return (
    <div ref={wrap}>
      <svg width={width} height={H} className="chart" role="img" aria-label={describe(points, bucket)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={M.left - 8} y={y(t) + 5} textAnchor="end" className="chart__axis">
              {t === 0 ? "0" : formatScore(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t.toISOString()} x={x(t)} y={H - 6} textAnchor="middle" className="chart__axis">
            {fmt(t)}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--graphite)" strokeWidth={2} />
        {points.map((p) => (
          <circle
            key={p.start}
            cx={x(new Date(p.start))}
            cy={y(p.mean_score)}
            r={4.5}
            fill={scoreColor(p.mean_score, theme)}
            stroke="var(--paper)"
            strokeWidth={1.5}
          >
            <title>{`${fmt(new Date(p.start))}: ${formatScore(p.mean_score)} across ${formatCount(p.n)} tweets`}</title>
          </circle>
        ))}
        {last && (
          <text x={x(new Date(last.start)) + 10} y={y(last.mean_score) + 5} className="chart__label">
            {formatScore(last.mean_score)}
          </text>
        )}
      </svg>
    </div>
  );
}

function describe(points: Point[], bucket: string): string {
  const parts = points.map((p) => `${formatDay(p.start)} ${formatScore(p.mean_score)}`);
  return `Mean score per ${bucket}: ${parts.join(", ")}`;
}
