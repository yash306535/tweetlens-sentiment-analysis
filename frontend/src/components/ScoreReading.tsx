import type { Reading } from "../lib/api";
import { formatPercent, formatScore, verdict } from "../lib/format";
import "./ScoreReading.css";

interface Props {
  reading: Reading;
  modelName: string;
  size?: "hero" | "compact";
}

const ORDER = ["negative", "neutral", "positive"] as const;
const VAR = { negative: "var(--acid)", neutral: "var(--litmus)", positive: "var(--base)" };

export function ScoreReading({ reading, modelName, size = "hero" }: Props) {
  return (
    <div className={`reading reading--${size}`}>
      <p className="reading__score num" aria-label={`Score ${formatScore(reading.score)}`}>
        {formatScore(reading.score)}
      </p>
      <div className="reading__text">
        <p className="reading__verdict">
          <strong>{verdict(reading.label, reading.confidence)}.</strong>{" "}
          <span className="muted">
            {modelName} gives it {formatPercent(reading.confidence)}.
          </span>
        </p>
        <ProbabilityBar reading={reading} />
      </div>
    </div>
  );
}

export function ProbabilityBar({ reading }: { reading: Reading }) {
  return (
    <div className="probs">
      <div className="probs__bar" aria-hidden="true">
        {ORDER.map((label) => (
          <span
            key={label}
            className="probs__seg"
            style={{ flexGrow: Math.max(reading.probs[label], 0.002), background: VAR[label] }}
          />
        ))}
      </div>
      <ul className="probs__labels small">
        {ORDER.map((label) => (
          <li key={label}>
            <span style={{ color: VAR[label] }}>{label}</span>{" "}
            <span className="num">{formatPercent(reading.probs[label])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
