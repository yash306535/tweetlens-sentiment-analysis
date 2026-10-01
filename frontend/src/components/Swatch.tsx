import { scoreColor } from "../lib/color";
import { formatScore } from "../lib/format";
import { useTheme } from "../lib/theme";

interface Props {
  score: number;
  wrong?: boolean;
  label: string;
  width?: number;
  height?: number;
}

/** A small piece of litmus paper in a model's hue. A wrong call gets a paper-coloured cross. */
export function Swatch({ score, wrong = false, label, width = 22, height = 40 }: Props) {
  const { theme, palette } = useTheme();
  const handle = Math.round(height * 0.16);
  const fill = scoreColor(score, theme);
  const cx = width / 2;
  const cy = handle + (height - handle) / 2;
  const r = Math.min(width, height - handle) * 0.24;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${formatScore(score)}${wrong ? ", wrong" : ""}`}
      className="swatch"
    >
      <title>{`${label}: ${formatScore(score)}${wrong ? ", wrong call" : ""}`}</title>
      <rect x="0" y="0" width={width} height={height} rx="2" fill="var(--strip-paper)" />
      <rect x="0" y={handle} width={width} height={height - handle} rx="2" fill={fill} />
      <rect x="0" y={handle} width={width} height="2" fill={fill} />
      {wrong && (
        <g stroke={palette.paper} strokeWidth="1.75" strokeLinecap="round">
          <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} />
          <line x1={cx + r} y1={cy - r} x2={cx - r} y2={cy + r} />
        </g>
      )}
    </svg>
  );
}
