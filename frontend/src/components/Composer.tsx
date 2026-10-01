import { forwardRef, type KeyboardEvent } from "react";

import "./Composer.css";

export const LIMIT = 280;

export interface Example {
  label: string;
  text: string;
}

export const EXAMPLES: Example[] = [
  { label: "Sarcastic", text: "Wow, my flight got delayed again. Thanks so much, really loving this airline 🙃" },
  { label: "Hinglish", text: "Movie ekdum bakwas thi yaar, paisa barbaad 😒" },
  { label: "Negation", text: "Honestly not bad at all, I don't regret going" },
  { label: "Emoji only", text: "😂😂🔥" },
];

interface Props {
  id: string;
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onExample: (text: string) => void;
  onInteract?: () => void;
  rows?: number;
  labelledBy?: string;
}

export function charCount(text: string): number {
  return Array.from(text).length;
}

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
  { id, value, onChange, onSubmit, onExample, onInteract, rows = 4, labelledBy },
  ref,
) {
  const count = charCount(value);
  const left = LIMIT - count;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onInteract?.();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  };

  return (
    <div className="composer">
      <div className="composer__box">
        <textarea
          ref={ref}
          id={id}
          className="composer__input"
          value={value}
          rows={rows}
          placeholder="Paste a tweet, or write one"
          aria-labelledby={labelledBy}
          aria-describedby={`${id}-hint`}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPointerDown={onInteract}
          onFocus={onInteract}
        />
        <div className="composer__foot">
          <CounterRing count={count} />
        </div>
      </div>
      <p id={`${id}-hint`} className="visually-hidden">
        Press Enter to test the tweet, Shift and Enter for a new line.
      </p>
      <div className="composer__row">
        <div className="composer__examples" role="group" aria-label="Example tweets">
          <span className="composer__examples-label small muted" aria-hidden="true">
            Examples
          </span>
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className="chip" onClick={() => onExample(ex.text)}>
              {ex.label}
            </button>
          ))}
        </div>
      </div>
      <span className="visually-hidden" aria-live="polite">
        {left <= 20 ? (left >= 0 ? `${left} characters left` : `${-left} characters over the limit`) : ""}
      </span>
    </div>
  );
});

function CounterRing({ count }: { count: number }) {
  const size = 22;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = Math.min(1, count / LIMIT);
  const left = LIMIT - count;
  const warn = left <= 20;
  return (
    <div className="counter" title={`${count} of ${LIMIT} characters`}>
      <span className={`counter__left num ${left < 0 ? "counter__left--over" : ""} ${warn ? "is-near" : ""}`}>
        {count > 0 ? left : LIMIT}
      </span>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bench)" strokeWidth={stroke} />
        {count > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={left < 0 ? "var(--acid)" : "var(--graphite)"}
            strokeWidth={stroke}
            strokeDasharray={`${c * fill} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="counter__progress"
          />
        )}
      </svg>
    </div>
  );
}
