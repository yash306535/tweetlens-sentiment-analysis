import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { mix, scoreColor } from "../lib/color";
import { easeOut, easeOutCubic, useReducedMotion } from "../lib/motion";
import { useTheme } from "../lib/theme";
import { PALETTES } from "../lib/tokens";
import "./LitmusStrip.css";

interface Props {
  /** Score in [-1, 1]; null leaves the strip dry. */
  score: number | null;
  /** Change this number to dip the strip again (full wick). Other score changes glide. */
  dipKey: number;
  orientation?: "vertical" | "horizontal";
  /** Length along the wick, in px. Omit for horizontal strips to fill the container width. */
  length?: number;
  /** Width across the wick, in px. */
  thickness?: number;
  /** Delay before the wick starts, in ms (the arena staggers its four strips). */
  delay?: number;
  label: string;
}

const WICK_MS = 900;
const DRAIN_MS = 120;
const GLIDE_MS = 300;
const SETTLE_MS = 900;
const WAVE_AMP = 3;
const MENISCUS_AMP = 1;

interface Tween {
  from: number;
  to: number;
  start: number;
  duration: number;
  ease: (t: number) => number;
  done?: () => void;
}

interface ColorTween {
  from: string;
  to: string;
  start: number;
  duration: number;
}

const linear = (t: number) => t;

export function LitmusStrip({
  score,
  dipKey,
  orientation = "vertical",
  length,
  thickness = 72,
  delay = 0,
  label,
}: Props) {
  const id = useId().replace(/:/g, "");
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const vertical = orientation === "vertical";

  const wrapRef = useRef<HTMLDivElement>(null);
  const [autoLength, setAutoLength] = useState(320);
  const along = length ?? autoLength;
  const W = vertical ? thickness : along;
  const H = vertical ? along : thickness;
  const handle = vertical ? 0.14 : 0.1;
  const wetMax = along * (1 - handle);

  const fillRef = useRef<SVGPathElement>(null);
  const edgeRef = useRef<SVGPathElement>(null);

  // Animation state lives in refs so frames don't re-render React.
  const state = useRef({
    progress: 0,
    amp: MENISCUS_AMP,
    phase: 0,
    color: scoreColor(0, theme),
    progressTween: null as Tween | null,
    ampTween: null as Tween | null,
    colorTween: null as ColorTween | null,
    drifting: false,
    frame: 0,
    timer: 0,
  });
  const geometry = useRef({ W, H, wetMax, vertical });
  geometry.current = { W, H, wetMax, vertical };

  useLayoutEffect(() => {
    if (length !== undefined || !wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(([entry]) => setAutoLength(Math.max(120, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [length]);

  function draw() {
    const s = state.current;
    const g = geometry.current;
    const fill = fillRef.current;
    const edge = edgeRef.current;
    if (!fill || !edge) return;
    if (s.progress <= 0.001) {
      fill.setAttribute("d", "");
      edge.setAttribute("d", "");
      return;
    }
    const across = g.vertical ? g.W : g.H;
    const level = s.progress * g.wetMax;
    const steps = 24;
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const u = (i / steps) * across;
      const k = (u / across) * Math.PI * 2;
      const wave = s.amp * (0.62 * Math.sin(k * 1.3 + s.phase) + 0.38 * Math.sin(k * 2.9 + s.phase * 1.7 + 1.1));
      const front = Math.min(level + wave, g.vertical ? g.H : g.W);
      pts.push(g.vertical ? [u, g.H - front] : [front, u]);
    }
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    const close = g.vertical ? ` L${g.W} ${g.H} L0 ${g.H} Z` : ` L0 ${g.H} L0 0 Z`;
    fill.setAttribute("d", line + close);
    edge.setAttribute("d", line);
    fill.setAttribute("fill", s.color);
    // A slightly darker tide line where the liquid front stops, as on real paper.
    edge.setAttribute("stroke", mix(s.color, PALETTES.bench.graphite, 0.22));
  }

  function tick(now: number) {
    const s = state.current;
    let active = false;
    const step = (tw: Tween | null, set: (v: number) => void): Tween | null => {
      if (!tw) return null;
      const t = Math.min(1, Math.max(0, (now - tw.start) / tw.duration));
      set(tw.from + (tw.to - tw.from) * tw.ease(t));
      if (t >= 1) {
        tw.done?.();
        return null;
      }
      active = true;
      return tw;
    };
    s.progressTween = step(s.progressTween, (v) => (s.progress = v));
    s.ampTween = step(s.ampTween, (v) => (s.amp = v));
    if (s.colorTween) {
      const ct = s.colorTween;
      const t = Math.min(1, Math.max(0, (now - ct.start) / ct.duration));
      s.color = mix(ct.from, ct.to, easeOut(t));
      if (t >= 1) s.colorTween = null;
      else active = true;
    }
    if (s.drifting) {
      s.phase += 0.045;
      active = true;
    }
    draw();
    s.frame = active ? requestAnimationFrame(tick) : 0;
  }

  function run() {
    const s = state.current;
    if (!s.frame) s.frame = requestAnimationFrame(tick);
  }

  function stopAll() {
    const s = state.current;
    cancelAnimationFrame(s.frame);
    window.clearTimeout(s.timer);
    s.frame = 0;
    s.progressTween = s.ampTween = null;
    s.colorTween = null;
    s.drifting = false;
  }

  function settleInstantly(color: string | null) {
    const s = state.current;
    stopAll();
    s.progress = color ? 1 : 0;
    s.amp = MENISCUS_AMP;
    if (color) s.color = color;
    draw();
  }

  function wick(target: string) {
    const s = state.current;
    stopAll();
    const startWick = () => {
      const now = performance.now();
      s.color = target;
      s.amp = WAVE_AMP;
      s.drifting = true;
      s.progressTween = {
        from: 0,
        to: 1,
        start: now,
        duration: WICK_MS,
        ease: easeOutCubic,
        done: () => {
          // Let the front keep drifting briefly, then flatten to a faint meniscus.
          s.ampTween = {
            from: WAVE_AMP,
            to: MENISCUS_AMP,
            start: performance.now(),
            duration: SETTLE_MS,
            ease: easeOut,
            done: () => (s.drifting = false),
          };
        },
      };
      run();
    };
    const begin = () => {
      if (s.progress > 0.01) {
        s.progressTween = {
          from: s.progress,
          to: 0,
          start: performance.now(),
          duration: DRAIN_MS,
          ease: linear,
          done: startWick,
        };
        run();
      } else {
        startWick();
      }
    };
    if (delay > 0) s.timer = window.setTimeout(begin, delay);
    else begin();
  }

  function glide(target: string) {
    const s = state.current;
    s.colorTween = { from: s.color, to: target, start: performance.now(), duration: GLIDE_MS };
    run();
  }

  // Full dip whenever dipKey changes.
  const lastDip = useRef<number | null>(null);
  const lastTheme = useRef(theme);
  useEffect(() => {
    const target = score === null ? null : scoreColor(score, theme);
    const first = lastDip.current === null;
    const isDip = lastDip.current !== dipKey;
    const themeChanged = lastTheme.current !== theme;
    lastDip.current = dipKey;
    lastTheme.current = theme;

    if (target === null) {
      settleInstantly(null);
      return;
    }
    // Coming back to a page that already has a reading: show it, don't replay it.
    if (first || reduced || themeChanged) {
      if (state.current.progressTween) {
        // A wick is running; just retarget its colour.
        state.current.color = target;
      } else {
        settleInstantly(target);
      }
      return;
    }
    if (isDip || state.current.progress < 0.01) wick(target);
    else glide(target);
  }, [score, dipKey, theme, reduced]);

  // Redraw when the geometry changes (resizes, orientation switches).
  useEffect(() => {
    draw();
  }, [W, H]);

  useEffect(() => () => stopAll(), []);

  return (
    <div
      ref={wrapRef}
      className={`strip strip--${orientation}`}
      style={vertical ? { width: W, height: H } : { height: H, width: length ?? "100%" }}
    >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        className="strip__svg"
      >
        <defs>
          <clipPath id={`clip-${id}`}>
            <rect x="0" y="0" width={W} height={H} rx="2" ry="2" />
          </clipPath>
          <filter id={`fibre-${id}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={vertical ? "0.85 0.03" : "0.03 0.85"}
              numOctaves={3}
              seed={7}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <g clipPath={`url(#clip-${id})`}>
          <rect x="0" y="0" width={W} height={H} className="strip__paper" />
          <path ref={fillRef} className="strip__wet" />
          <path ref={edgeRef} className="strip__edge" fill="none" strokeWidth="1.2" />
          <rect x="0" y="0" width={W} height={H} filter={`url(#fibre-${id})`} className="strip__fibre" />
        </g>
        <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="2" ry="2" className="strip__outline" />
      </svg>
    </div>
  );
}
