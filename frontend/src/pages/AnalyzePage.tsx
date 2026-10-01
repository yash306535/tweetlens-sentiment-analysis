import { useCallback, useEffect, useRef } from "react";

import { Composer } from "../components/Composer";
import { EmotionPanel } from "../components/EmotionPanel";
import { LitmusStrip } from "../components/LitmusStrip";
import { ModelPicker } from "../components/ModelPicker";
import { PipelineXRay } from "../components/PipelineXRay";
import { ScoreReading } from "../components/ScoreReading";
import { WhyPanel } from "../components/WhyPanel";
import { formatScore } from "../lib/format";
import { prefersReducedMotion, useMediaQuery } from "../lib/motion";
import { useApp } from "../lib/store";
import { useReading } from "../lib/useReading";
import "./AnalyzePage.css";

const DEMO_TEXT = "Not gonna lie, the new update is actually pretty good 👍";
const DEMO_KEY = "tweetlens-demo-played";
const TYPE_MS = 28;

function demoPlayed(): boolean {
  try {
    return sessionStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return true;
  }
}

function markDemoPlayed() {
  try {
    sessionStorage.setItem(DEMO_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function AnalyzePage() {
  const { model, setModel, modelName, analysis, meta } = useApp();
  const { text, setText, result, error, busy, dipKey, run, type, stale } = useReading();
  const compact = useMediaQuery("(max-width: 719px)");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const demo = useRef<{ timer: number; running: boolean }>({ timer: 0, running: false });

  // The one orchestrated moment: on the first visit of a session, a demo tweet
  // types itself and the strip wicks up.
  useEffect(() => {
    if (demoPlayed() || analysis.text) return;
    if (prefersReducedMotion()) {
      // No typing; the tweet and its reading simply appear.
      const timer = window.setTimeout(() => {
        markDemoPlayed();
        setText(DEMO_TEXT);
        run(DEMO_TEXT, true);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const chars = Array.from(DEMO_TEXT);
    let i = 0;
    demo.current.running = true;
    const step = () => {
      i += 1;
      setText(chars.slice(0, i).join(""));
      if (i < chars.length) {
        demo.current.timer = window.setTimeout(step, TYPE_MS + (chars[i - 1] === " " ? 30 : 0));
      } else {
        demo.current.running = false;
        markDemoPlayed();
        demo.current.timer = window.setTimeout(() => run(DEMO_TEXT, true), 220);
      }
    };
    demo.current.timer = window.setTimeout(step, 500);
    const current = demo.current;
    return () => window.clearTimeout(current.timer);
  }, []); // once, on mount

  // Touching the composer during the demo finishes it at once and selects the
  // text, so typing replaces it.
  const interruptDemo = useCallback(() => {
    if (!demo.current.running) return;
    window.clearTimeout(demo.current.timer);
    demo.current.running = false;
    markDemoPlayed();
    setText(DEMO_TEXT);
    run(DEMO_TEXT, true);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [run, setText]);

  const onExample = (value: string) => {
    interruptDemo();
    setText(value);
    run(value, true);
  };

  const reading = result?.readings[model] ?? null;
  const stripLabel = reading
    ? `Litmus strip: ${formatScore(reading.score)}, ${reading.label}, read by ${modelName(model)}`
    : "Litmus strip, dry: no tweet tested yet";

  const strip = (
    <LitmusStrip
      score={reading?.score ?? null}
      dipKey={dipKey}
      orientation={compact ? "horizontal" : "vertical"}
      length={compact ? undefined : 320}
      thickness={compact ? 44 : 72}
      label={stripLabel}
    />
  );

  return (
    <div className="analyze">
      <div className="analyze__main">
        <header className="page-head">
          <h1 id="analyze-title">Analyze a tweet</h1>
        </header>

        <Composer
          id="tweet"
          ref={inputRef}
          value={text}
          labelledBy="analyze-title"
          onChange={type}
          onSubmit={() => run(text, true)}
          onExample={onExample}
          onInteract={interruptDemo}
        />

        <div className="analyze__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => run(text, true)}
            disabled={!text.trim()}
          >
            Test this tweet
          </button>
          <ModelPicker value={model} onChange={setModel} />
        </div>

        {compact && <div className="analyze__band">{strip}</div>}

        <div className={`analyze__reading ${stale || busy ? "is-pending" : ""}`} aria-live="polite">
          {error && (
            <div className="error" role="alert">
              <strong>That tweet couldn't be read.</strong>
              <span>{error}</span>
            </div>
          )}
          {!error && reading && <ScoreReading reading={reading} modelName={modelName(model)} />}
          {!error && !reading && (
            <p className="analyze__empty muted">
              Dip a tweet to read it. The strip turns red for negative, violet for neutral and blue for positive, and
              the score runs from −1 to +1.
            </p>
          )}
        </div>

        {result && (
          <>
            <section className="section" aria-labelledby="xray-title">
              <h2 id="xray-title">Pipeline x-ray</h2>
              <p className="section-intro">
                What Naive Bayes, logistic regression and the neural net actually read. VADER reads the raw tweet.
              </p>
              <div className="analyze__xray">
                <PipelineXRay stages={result.pipeline} />
              </div>
            </section>

            <section className="section" aria-labelledby="why-title">
              <h2 id="why-title" className="visually-hidden">
                Why this prediction
              </h2>
              <WhyPanel text={result.text} model={model} modelName={modelName(model)} />
            </section>

            <section className="section">
              <EmotionPanel
                emotions={result.emotions}
                irony={result.irony}
                positiveReading={reading?.label === "positive"}
                meta={meta}
              />
            </section>
          </>
        )}
      </div>

      {!compact && (
        <aside className="analyze__strip" aria-label="Litmus strip">
          <div className="analyze__strip-inner">
            {strip}
            <p className="analyze__strip-caption small muted">{modelName(model)}</p>
          </div>
        </aside>
      )}
    </div>
  );
}
