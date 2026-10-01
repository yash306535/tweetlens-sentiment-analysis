import { Composer } from "../components/Composer";
import { type Bar, BarList } from "../components/charts/BarList";
import { ConfusionHeatmap } from "../components/charts/ConfusionHeatmap";
import { LitmusStrip } from "../components/LitmusStrip";
import { MODEL_IDS } from "../lib/api";
import { formatCount, formatScore, verdict } from "../lib/format";
import { useMediaQuery } from "../lib/motion";
import { describeAgreement } from "../lib/outlier";
import { useApp } from "../lib/store";
import { useReading } from "../lib/useReading";
import "./ArenaPage.css";

export function ArenaPage() {
  const { meta, metaError, modelName } = useApp();
  const { text, setText, result, error, busy, dipKey, run, type, stale } = useReading();
  const compact = useMediaQuery("(max-width: 719px)");

  const dataset = meta?.dataset;
  const testSize = dataset?.test;
  const neutralShare = dataset ? dataset.test_distribution.neutral / dataset.test : null;

  const benchModels = meta
    ? [...meta.models].filter((m) => m.test).sort((a, b) => b.test!.macro_f1 - a.test!.macro_f1)
    : [];
  const best = benchModels[0]?.id;

  const f1Bars: Bar[] = benchModels.map((m) => ({
    key: m.id,
    label: m.name,
    value: m.test!.macro_f1,
    display: m.test!.macro_f1.toFixed(2),
    emphasis: m.id === best,
  }));
  const accBars: Bar[] = benchModels.map((m) => ({
    key: m.id,
    label: m.name,
    value: m.test!.accuracy,
    display: m.test!.accuracy.toFixed(2),
    emphasis: m.id === best,
  }));
  if (neutralShare !== null) {
    // Always answering "neutral" scores this; any model must beat it to be useful.
    const f1 = (2 * neutralShare) / (1 + neutralShare) / 3;
    f1Bars.push({
      key: "baseline",
      label: "Always neutral",
      value: f1,
      display: f1.toFixed(2),
      emphasis: false,
      color: "var(--pencil)",
    });
    accBars.push({
      key: "baseline",
      label: "Always neutral",
      value: neutralShare,
      display: neutralShare.toFixed(2),
      emphasis: false,
      color: "var(--pencil)",
    });
  }
  const speedBars = benchModels
    .filter((m) => m.latency_ms !== null)
    .sort((a, b) => a.latency_ms! - b.latency_ms!)
    .map((m) => ({
      key: m.id,
      label: m.name,
      value: m.latency_ms!,
      display: `${m.latency_ms!.toFixed(2)} ms`,
    }));

  return (
    <div className="page arena">
      <header className="page-head">
        <h1 id="arena-title">Model arena</h1>
        <p>Four models read the same tweet. When they disagree, the colours split.</p>
      </header>

      <Composer
        id="arena-tweet"
        value={text}
        rows={3}
        labelledBy="arena-title"
        onChange={type}
        onSubmit={() => run(text, true)}
        onExample={(value) => {
          setText(value);
          run(value, true);
        }}
      />
      <div className="arena__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => run(text, true)}
          disabled={!text.trim()}
        >
          Compare the four models
        </button>
      </div>

      {error && (
        <div className="error arena__error" role="alert">
          <strong>The models couldn't read that tweet.</strong>
          <span>{error}</span>
        </div>
      )}

      <div className={`arena__bench-row ${stale || busy ? "is-pending" : ""}`}>
        <ul className="arena__strips" aria-label="The four readings">
          {MODEL_IDS.map((id, i) => {
            const r = result?.readings[id];
            return (
              <li key={id} className="arena__strip">
                <LitmusStrip
                  score={r?.score ?? null}
                  dipKey={dipKey}
                  length={compact ? 150 : 210}
                  thickness={compact ? 52 : 72}
                  delay={i * 60}
                  label={r ? `${modelName(id)}: ${formatScore(r.score)}, ${r.label}` : `${modelName(id)}: dry`}
                />
                <p className="arena__name">{modelName(id)}</p>
                <p className="arena__score num">{r ? formatScore(r.score) : "–"}</p>
                <p className="arena__verdict small muted">{r ? verdict(r.label, r.confidence) : "Not dipped yet"}</p>
              </li>
            );
          })}
        </ul>
        <p className="arena__agreement" aria-live="polite">
          {result
            ? describeAgreement(result.readings, modelName, MODEL_IDS)
            : "Write a tweet or pick an example to see the four readings side by side."}
        </p>
      </div>

      <section className="section" aria-labelledby="bench-title">
        <h2 id="bench-title">{testSize ? `On ${formatCount(testSize)} held-out tweets` : "On held-out tweets"}</h2>
        <p className="section-intro">
          The TweetEval sentiment test split, which no model saw while training. Macro F1 averages the three classes, so
          the large neutral class can't hide a weak negative one.
        </p>
        {metaError && !meta && <p className="notice">{metaError}</p>}
        {meta && (
          <>
            <div className="arena__charts">
              <div>
                <h3>Macro F1</h3>
                <BarList bars={f1Bars} max={1} caption="Macro F1 by model" />
              </div>
              <div>
                <h3>Accuracy</h3>
                <BarList bars={accBars} max={1} caption="Accuracy by model" />
              </div>
            </div>
            <div className="arena__speed">
              <h3>Time to read one tweet</h3>
              <p className="small muted">Median over 200 tweets on the training machine, pipeline included.</p>
              <BarList bars={speedBars} caption="Median milliseconds per tweet" />
            </div>
          </>
        )}
      </section>

      {meta && (
        <section className="section" aria-labelledby="errors-title">
          <h2 id="errors-title">Where each model goes wrong</h2>
          <p className="section-intro">
            Rows are the true label, columns what the model read. The shade shows each row's share, so a dark diagonal
            means the model gets that class right; the number is the count of tweets.
          </p>
          <div className="arena__heatmaps">
            {meta.models.map((m) =>
              m.test ? <ConfusionHeatmap key={m.id} title={m.name} matrix={m.test.confusion} /> : null,
            )}
          </div>
        </section>
      )}

      {meta && (
        <section className="section" aria-labelledby="how-title">
          <h2 id="how-title">How each model reads</h2>
          <dl className="arena__how">
            {meta.models.map((m) => (
              <div key={m.id}>
                <dt>{m.name}</dt>
                <dd>{m.summary}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
