import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { Stage } from "../lib/api";
import { useReducedMotion } from "../lib/motion";
import "./PipelineXRay.css";

interface Props {
  stages: Stage[];
}

const STRIKE_MS = 380;
const PLAY_MS = 1150;

export function PipelineXRay({ stages }: Props) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [striking, setStriking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(0);
  const last = stages.length - 1;
  const current = stages[Math.min(index, last)];

  // A new tweet can have the same number of stages; clamp just in case.
  useEffect(() => {
    if (index > last) setIndex(last);
  }, [index, last]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const goTo = useCallback(
    (target: number) => {
      window.clearTimeout(timer.current);
      const next = Math.max(0, Math.min(last, target));
      const stage = stages[next];
      const removes = stage && (stage.removed.length > 0 || Object.keys(stage.fused).length > 0);
      if (next === index + 1 && removes && !reduced) {
        // Strike first, then collapse into the next stage.
        setStriking(true);
        timer.current = window.setTimeout(() => {
          setStriking(false);
          setIndex(next);
        }, STRIKE_MS);
      } else {
        setStriking(false);
        setIndex(next);
      }
    },
    [index, last, reduced, stages],
  );

  // Play all: step forward on a fixed beat.
  useEffect(() => {
    if (!playing) return;
    if (index >= last && !striking) {
      setPlaying(false);
      return;
    }
    if (striking) return;
    const t = window.setTimeout(() => goTo(index + 1), index === 0 ? 450 : PLAY_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, last, striking, goTo]);

  const play = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (index >= last) {
      setStriking(false);
      setIndex(0);
    }
    setPlaying(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setPlaying(false);
      goTo(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPlaying(false);
      goTo(index - 1);
    }
  };

  // While striking, the current stage stays on screen with the tokens that are
  // about to go struck through; then the index moves and they collapse.
  const nextStage = stages[Math.min(index + 1, last)];
  const shown = current;
  const leaving = useMemo(() => new Set(striking ? nextStage.removed : []), [striking, nextStage]);
  const fusing = useMemo(() => new Set(striking ? Object.keys(nextStage.fused) : []), [striking, nextStage]);
  const changed = useMemo(() => {
    if (striking || index === 0) return new Set<string>();
    const ids = new Set<string>(current.morphed);
    Object.values(current.split).forEach((kids) => kids.forEach((k) => ids.add(k)));
    Object.values(current.fused).forEach((k) => ids.add(k));
    return ids;
  }, [current, index, striking]);
  const splitChildren = useMemo(() => {
    const ids = new Set<string>();
    Object.values(current.split).forEach((kids) => kids.slice(1).forEach((k) => ids.add(k)));
    return ids;
  }, [current]);

  const summary = describeChange(current, index);

  return (
    <div className="xray" onKeyDown={onKeyDown}>
      <ol className="xray__steps" aria-label="Pipeline stages">
        {stages.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              className={`xray__step ${i === index ? "is-current" : ""} ${i > 0 && !s.changed ? "is-idle" : ""}`}
              aria-current={i === index ? "step" : undefined}
              aria-label={`Stage ${i + 1}: ${s.title}${i > 0 && !s.changed ? " (no change for this tweet)" : ""}`}
              onClick={() => {
                setPlaying(false);
                goTo(i);
              }}
            >
              <span className="num">{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="xray__head" aria-live="polite">
        <p className="xray__count small muted num">
          Stage {index + 1} of {stages.length}
        </p>
        <h3 className="xray__title">{current.title}</h3>
        <p className="xray__desc small muted">{current.description}</p>
      </div>

      <div
        className="xray__line"
        tabIndex={0}
        role="group"
        aria-label={`Tokens at stage ${index + 1}: ${shown.tokens.map((t) => t.text).join(" ") || "none"}. Use the left and right arrow keys to step through the stages.`}
      >
        <LayoutGroup>
          <AnimatePresence mode="popLayout" initial={false}>
            {shown.tokens.map((token) => (
              <motion.span
                key={token.id}
                layout="position"
                className={[
                  "tok",
                  token.kind === "emoji" && index < 2 ? "tok--emoji" : "",
                  changed.has(token.id) ? "tok--changed" : "",
                  leaving.has(token.id) ? "tok--striking" : "",
                  fusing.has(token.id) ? "tok--fusing" : "",
                ].join(" ")}
                initial={splitChildren.has(token.id) ? { opacity: 0, x: -14 } : { opacity: 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.22 } }}
                transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.9 }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={token.text}
                    className="tok__text"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.24 }}
                  >
                    {renderText(token.text)}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
            ))}
          </AnimatePresence>
        </LayoutGroup>
        {shown.tokens.length === 0 && (
          <span className="xray__empty small muted">Nothing left for the model to read.</span>
        )}
      </div>

      <p className="xray__summary small muted">{summary}</p>

      <div className="xray__controls">
        <button
          type="button"
          className="button"
          onClick={() => {
            setPlaying(false);
            goTo(index - 1);
          }}
          disabled={index === 0}
        >
          Previous stage
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setPlaying(false);
            goTo(index + 1);
          }}
          disabled={index >= last}
        >
          Next stage
        </button>
        <button type="button" className="button button--quiet" onClick={play} aria-pressed={playing}>
          {playing ? "Pause" : index >= last ? "Play again" : "Play all"}
        </button>
        <span className="xray__keys small muted">or use the arrow keys</span>
      </div>
    </div>
  );
}

function renderText(text: string) {
  if (text.startsWith("NOT_")) {
    return (
      <>
        <span className="tok__not">NOT_</span>
        {text.slice(4)}
      </>
    );
  }
  return text;
}

function describeChange(stage: Stage, index: number): string {
  if (index === 0) {
    const n = stage.tokens.length;
    return `${n} ${n === 1 ? "token" : "tokens"}. Step forward to watch the tweet turn into what the models read.`;
  }
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (stage.removed.length) parts.push(`${plural(stage.removed.length, "token", "tokens")} removed`);
  const splits = Object.keys(stage.split).length;
  if (splits) parts.push(`${plural(splits, "token", "tokens")} split apart`);
  const fused = Object.keys(stage.fused).length;
  if (fused) parts.push(`${plural(fused, "negation", "negations")} fused`);
  const morphed = stage.morphed.length - (fused ? Object.keys(stage.fused).length : 0);
  if (morphed > 0) parts.push(`${plural(morphed, "token", "tokens")} rewritten`);
  if (!parts.length) return "Nothing to change in this tweet at this stage.";
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}
