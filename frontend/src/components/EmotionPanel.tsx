import type { Meta } from "../lib/api";
import { formatPercent } from "../lib/format";
import { BarList } from "./charts/BarList";
import "./EmotionPanel.css";

interface Props {
  emotions: Record<string, number>;
  irony: number;
  positiveReading: boolean;
  meta: Meta | null;
}

export function EmotionPanel({ emotions, irony, positiveReading, meta }: Props) {
  const bars = Object.entries(emotions)
    .sort((a, b) => b[1] - a[1])
    .map(([label, p], i) => ({
      key: label,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      value: p,
      display: formatPercent(p),
      emphasis: i === 0,
    }));
  const ironyTrain = meta?.irony_metrics.train;
  const ironyF1 = meta?.irony_metrics.macro_f1;
  const emotionTrain = meta?.emotion_metrics.train;

  return (
    <div className="emotions">
      <div className="emotions__col">
        <h2>Emotions</h2>
        <p className="small muted">
          Which of four emotions the tweet is closest to
          {emotionTrain ? `, learned from ${emotionTrain.toLocaleString("en-GB")} labelled tweets` : ""}.
        </p>
        <BarList bars={bars} max={1} caption="Emotion probabilities" labelWidth="5.5rem" />
      </div>
      <div className="emotions__col">
        <h2>Irony check</h2>
        <p className="emotions__irony">
          <span className="emotions__irony-value num">{formatPercent(irony)}</span> likely ironic
        </p>
        <div
          className="meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(irony * 100)}
          aria-label="Irony likelihood"
        >
          <span className="meter__fill" style={{ width: `${irony * 100}%` }} />
          <span className="meter__mid" aria-hidden="true" />
        </div>
        {irony >= 0.5 && positiveReading && (
          <p className="small">
            Read this one with care: if it is sarcastic, the real tone is probably the opposite of the reading above.
          </p>
        )}
        <p className="small muted">
          Trained on {ironyTrain ? ironyTrain.toLocaleString("en-GB") : "a few thousand"} tweets
          {ironyF1 ? ` (macro F1 ${ironyF1.toFixed(2)} on held-out tweets)` : ""}. Treat it as a hint, not a verdict.
        </p>
      </div>
    </div>
  );
}
