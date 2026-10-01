import { annotate, annotationGroup } from "rough-notation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { api, ApiError, type Explanation, type ModelId } from "../lib/api";
import { formatScore, formatWeight } from "../lib/format";
import { useReducedMotion } from "../lib/motion";
import { useTheme } from "../lib/theme";
import "./WhyPanel.css";

interface Props {
  text: string;
  model: ModelId;
  modelName: string;
}

const MIN_WEIGHT = 0.015;
const MAX_MARKED = 8;

export function WhyPanel({ text, model, modelName }: Props) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const regionId = useId();

  useEffect(() => {
    if (!open || !text.trim()) return;
    const controller = new AbortController();
    setLoading(true);
    const t = window.setTimeout(() => {
      api
        .explain(text, model, controller.signal)
        .then((e) => {
          setExplanation(e);
          setError(null);
        })
        .catch((err: ApiError) => {
          if (err.name !== "AbortError") setError(err.message);
        })
        .finally(() => setLoading(false));
    }, 150);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [open, text, model]);

  const current = explanation && explanation.model === model ? explanation : null;

  return (
    <div className="why">
      <button
        type="button"
        className="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide the reasons" : "Why this prediction?"}
      </button>

      {open && (
        <div id={regionId} className="why__body">
          {error && (
            <div className="error" role="alert">
              <strong>The reasons couldn't be worked out.</strong>
              <span>{error}</span>
            </div>
          )}
          {!error && !current && <p className="small muted">Working out which words mattered…</p>}
          {current && (
            <ExplainedText
              key={`${current.model}:${text}`}
              text={text}
              explanation={current}
              hover={hover}
              setHover={setHover}
              stale={loading}
            />
          )}
          {current && (
            <>
              <p className="why__how small muted">
                For {modelName}, each word's weight is how far the score moves when that word is removed and the
                tweet is read again. Blue underlines pushed the score up, red ones pulled it down; thicker lines
                mattered more. Hover over a word, or tab to it, for its exact weight.
              </p>
              <WeightList explanation={current} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ranked(explanation: Explanation) {
  return explanation.words
    .map((w, i) => ({ ...w, i }))
    .filter((w) => Math.abs(w.weight) >= MIN_WEIGHT)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, MAX_MARKED);
}

function ExplainedText({
  text,
  explanation,
  hover,
  setHover,
  stale,
}: {
  text: string;
  explanation: Explanation;
  hover: number | null;
  setHover: (i: number | null) => void;
  stale: boolean;
}) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const marked = useMemo(() => ranked(explanation), [explanation]);
  const max = Math.max(...marked.map((w) => Math.abs(w.weight)), 0.0001);

  // Draw the underlines one after another, strongest first.
  useEffect(() => {
    const annotations = marked
      .map((w) => {
        const el = refs.current[w.i];
        if (!el) return null;
        const strength = Math.abs(w.weight) / max;
        return annotate(el, {
          type: "underline",
          color: w.weight < 0 ? palette.acid : palette.base,
          strokeWidth: 1 + 3 * strength,
          padding: [0, 1, 1, 1],
          iterations: 1,
          animationDuration: 350,
          animate: !reduced,
        });
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
    const group = annotationGroup(annotations);
    const t = window.setTimeout(() => group.show(), 60);
    return () => {
      window.clearTimeout(t);
      annotations.forEach((a) => a.remove());
    };
  }, [marked, max, palette, reduced]);

  // The API counts offsets in code points; JavaScript strings count UTF-16
  // units, so an emoji would shift every later word. Find each word instead.
  const segments: { text: string; word?: number }[] = [];
  let pos = 0;
  explanation.words.forEach((w, i) => {
    const start = text.indexOf(w.text, pos);
    if (start < 0) return;
    if (start > pos) segments.push({ text: text.slice(pos, start) });
    segments.push({ text: w.text, word: i });
    pos = start + w.text.length;
  });
  if (pos < text.length) segments.push({ text: text.slice(pos) });

  const markedSet = new Set(marked.map((w) => w.i));
  const hovered = hover !== null ? explanation.words[hover] : null;

  return (
    <div className={`why__text-wrap ${stale ? "is-stale" : ""}`}>
      <p className="why__text">
        {segments.map((seg, k) =>
          seg.word === undefined ? (
            <span key={k}>{seg.text}</span>
          ) : (
            <span
              key={k}
              ref={(el) => {
                refs.current[seg.word!] = el;
              }}
              className={`why__word ${markedSet.has(seg.word) ? "is-marked" : ""}`}
              tabIndex={0}
              aria-describedby={hover === seg.word ? "why-tip" : undefined}
              onPointerEnter={() => setHover(seg.word!)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(seg.word!)}
              onBlur={() => setHover(null)}
            >
              {seg.text}
              {hover === seg.word && hovered && (
                <span id="why-tip" role="tooltip" className="why__tip small">
                  Weight <span className="num">{formatWeight(hovered.weight)}</span>. Without this word the score is{" "}
                  <span className="num">{formatScore(explanation.score - hovered.weight)}</span>.
                </span>
              )}
            </span>
          ),
        )}
      </p>
    </div>
  );
}

function WeightList({ explanation }: { explanation: Explanation }) {
  const top = ranked(explanation).slice(0, 6);
  if (!top.length) {
    return (
      <p className="small muted">
        No single word moves the score by more than {MIN_WEIGHT.toFixed(3)}. The reading comes from the tweet as a
        whole.
      </p>
    );
  }
  const max = Math.max(...top.map((w) => Math.abs(w.weight)));
  return (
    <table className="weights">
      <caption className="visually-hidden">Words that moved the score most</caption>
      <thead className="visually-hidden">
        <tr>
          <th scope="col">Word</th>
          <th scope="col">Pulled toward negative</th>
          <th scope="col">Pushed toward positive</th>
        </tr>
      </thead>
      <tbody>
        {top.map((w) => {
          const pct = (Math.abs(w.weight) / max) * 100;
          return (
            <tr key={w.i}>
              <th scope="row" className="weights__word">
                {w.text}
              </th>
              <td className="weights__neg">
                {w.weight < 0 && (
                  <span className="weights__cell">
                    <span className="weights__value num small">{formatWeight(w.weight)}</span>
                    <span className="weights__bar weights__bar--neg" style={{ width: `${pct * 0.6}%` }} />
                  </span>
                )}
              </td>
              <td className="weights__pos">
                {w.weight > 0 && (
                  <span className="weights__cell">
                    <span className="weights__bar weights__bar--pos" style={{ width: `${pct * 0.6}%` }} />
                    <span className="weights__value num small">{formatWeight(w.weight)}</span>
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
