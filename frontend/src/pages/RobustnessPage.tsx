import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { BarList } from "../components/charts/BarList";
import { Swatch } from "../components/Swatch";
import { api, ApiError, MODEL_IDS, type ModelId, type Reading, type Robustness } from "../lib/api";
import { formatScore, type Label } from "../lib/format";
import { useApp } from "../lib/store";
import "./RobustnessPage.css";

const TRAPS_KEY = "tweetlens-traps";
const MAX_TRAPS = 20;
const LABELS: Label[] = ["negative", "neutral", "positive"];

interface Trap {
  id: string;
  text: string;
  expected: Label;
}

interface Row {
  id: string;
  text: string;
  expected: Label;
  why: string;
  readings: Record<ModelId, Reading & { correct: boolean }>;
  custom?: boolean;
}

function loadTraps(): Trap[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TRAPS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((t) => typeof t?.text === "string" && LABELS.includes(t?.expected)) : [];
  } catch {
    return [];
  }
}

function saveTraps(traps: Trap[]) {
  try {
    localStorage.setItem(TRAPS_KEY, JSON.stringify(traps));
  } catch {
    /* the tray still works for this visit */
  }
}

function withCorrect(readings: Record<ModelId, Reading>, expected: Label) {
  return Object.fromEntries(
    MODEL_IDS.map((m) => [m, { ...readings[m], correct: readings[m].label === expected }]),
  ) as Record<ModelId, Reading & { correct: boolean }>;
}

const LABEL_VAR: Record<Label, string> = { negative: "var(--acid)", neutral: "var(--litmus)", positive: "var(--base)" };

export function RobustnessPage() {
  const { modelName } = useApp();
  const [suite, setSuite] = useState<Robustness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traps, setTraps] = useState<Trap[]>(loadTraps);
  const [trapRows, setTrapRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api
      .robustness()
      .then(setSuite)
      .catch((err: ApiError) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!traps.length) {
      setTrapRows([]);
      return;
    }
    const ctrl = new AbortController();
    api
      .read(
        traps.map((t) => t.text),
        ctrl.signal,
      )
      .then(({ results }) =>
        setTrapRows(
          traps.map((t, i) => ({
            id: t.id,
            text: t.text,
            expected: t.expected,
            why: "Added by you. It lives only in this browser.",
            readings: withCorrect(results[i].readings, t.expected),
            custom: true,
          })),
        ),
      )
      .catch((err: ApiError) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    return () => ctrl.abort();
  }, [traps]);

  const addTrap = useCallback((text: string, expected: Label) => {
    setTraps((current) => {
      const next = [...current, { id: `trap-${Date.now()}`, text, expected }].slice(-MAX_TRAPS);
      saveTraps(next);
      return next;
    });
  }, []);

  const removeTrap = useCallback((id: string) => {
    setTraps((current) => {
      const next = current.filter((t) => t.id !== id);
      saveTraps(next);
      return next;
    });
  }, []);

  const groups = useMemo(() => {
    if (!suite) return [];
    const list = suite.categories.map((c) => ({
      id: c.id,
      name: c.name,
      rows: suite.tests.filter((t) => t.category === c.id) as Row[],
    }));
    if (trapRows.length) list.push({ id: "yours", name: "Your traps", rows: trapRows });
    return list;
  }, [suite, trapRows]);

  const allRows = groups.flatMap((g) => g.rows);
  const total = allRows.length;
  const correct = Object.fromEntries(
    MODEL_IDS.map((m) => [m, allRows.filter((r) => r.readings[m].correct).length]),
  ) as Record<ModelId, number>;
  const bestCount = Math.max(...MODEL_IDS.map((m) => correct[m]));

  return (
    <div className="page lab">
      <header className="page-head">
        <h1>Robustness lab</h1>
        <p>
          {suite ? `${suite.tests.length} tweets` : "Tweets"} written by hand to trip models up: negation, sarcasm,
          Hinglish, emoji, slang. Each swatch is one model's reading of that tweet; a cross marks a wrong call.
        </p>
      </header>

      {error && (
        <div className="error" role="alert">
          <strong>The test tray couldn't be filled.</strong>
          <span>{error}</span>
        </div>
      )}
      {!suite && !error && <p className="muted">Dipping every test tweet…</p>}

      {suite && (
        <>
          <section aria-labelledby="score-title" className="lab__score">
            <h2 id="score-title">Correct calls</h2>
            <BarList
              caption="Correct calls by model"
              max={total}
              bars={MODEL_IDS.map((m) => ({
                key: m,
                label: modelName(m),
                value: correct[m],
                display: `${correct[m]} of ${total}`,
                emphasis: correct[m] === bestCount,
              }))}
            />
          </section>

          <section className="section" aria-labelledby="tray-title">
            <h2 id="tray-title">Results tray</h2>
            <p className="section-intro">
              Select a tweet to see the four scores and why it is hard. Category rows count each model's correct calls.
            </p>
            <table className="tray">
              <thead>
                <tr>
                  <th scope="col" className="tray__tweet-col">
                    Tweet
                  </th>
                  {MODEL_IDS.map((m) => (
                    <th key={m} scope="col" className="tray__model-col">
                      {modelName(m)}
                    </th>
                  ))}
                  <th scope="col" className="tray__expected-col">
                    Expected
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.id}>
                    <tr className="tray__group">
                      <th scope="rowgroup" className="tray__group-name">
                        {group.name}
                      </th>
                      {MODEL_IDS.map((m) => (
                        <td key={m} className="tray__group-count num small">
                          <span className="visually-hidden">{modelName(m)}: </span>
                          {group.rows.filter((r) => r.readings[m].correct).length}/{group.rows.length}
                        </td>
                      ))}
                      <td />
                    </tr>
                    {group.rows.map((row) => (
                      <TrayRow
                        key={row.id}
                        row={row}
                        open={open === row.id}
                        onToggle={() => setOpen((o) => (o === row.id ? null : row.id))}
                        onRemove={row.custom ? () => removeTrap(row.id) : undefined}
                        modelName={modelName}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </section>

          <section className="section" aria-labelledby="add-title">
            <h2 id="add-title">Add a trap</h2>
            <p className="section-intro">
              Write a tweet you think will fool the models and say what a careful reader would call it. Traps stay in
              this browser only.
            </p>
            <AddTrap onAdd={addTrap} full={traps.length >= MAX_TRAPS} />
          </section>
        </>
      )}
    </div>
  );
}

function TrayRow({
  row,
  open,
  onToggle,
  onRemove,
  modelName,
}: {
  row: Row;
  open: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  modelName: (m: ModelId) => string;
}) {
  const detailId = `detail-${row.id}`;
  const wrongCount = MODEL_IDS.filter((m) => !row.readings[m].correct).length;
  return (
    <>
      <tr className={`tray__row ${open ? "is-open" : ""}`}>
        <th scope="row" className="tray__tweet">
          <button
            type="button"
            className="tray__toggle"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={onToggle}
          >
            {row.text}
          </button>
        </th>
        {MODEL_IDS.map((m) => (
          <td key={m} className="tray__cell">
            <Swatch score={row.readings[m].score} wrong={!row.readings[m].correct} label={modelName(m)} />
          </td>
        ))}
        <td className="tray__expected small" style={{ color: LABEL_VAR[row.expected] }}>
          {row.expected}
        </td>
      </tr>
      {open && (
        <tr id={detailId} className="tray__detail">
          <td colSpan={6}>
            <p>{row.why}</p>
            <ul className="tray__scores">
              {MODEL_IDS.map((m) => {
                const r = row.readings[m];
                return (
                  <li key={m}>
                    <span className="tray__scores-name">{modelName(m)}</span>{" "}
                    <span className="num">{formatScore(r.score)}</span>{" "}
                    <span className="muted">
                      reads {r.label}
                      {r.correct ? "" : ", wrong"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="small muted">
              {wrongCount === 0
                ? "Every model gets this one right."
                : wrongCount === 4
                  ? "Every model gets this one wrong."
                  : `${wrongCount} of 4 models get this one wrong.`}
            </p>
            {onRemove && (
              <button type="button" className="button button--quiet" onClick={onRemove}>
                Remove this trap
              </button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function AddTrap({ onAdd, full }: { onAdd: (text: string, expected: Label) => void; full: boolean }) {
  const [text, setText] = useState("");
  const [expected, setExpected] = useState<Label | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return setProblem("Write the tweet first.");
    if (!expected) return setProblem("Choose what a careful reader would call it: negative, neutral or positive.");
    setProblem(null);
    onAdd(text.trim(), expected);
    setText("");
    setExpected(null);
  };

  return (
    <form className="trap" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="trap-text">Tweet</label>
        <input
          id="trap-text"
          className="input"
          value={text}
          maxLength={280}
          placeholder="Oh sure, I'd love another software update at 2am"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <fieldset className="segmented">
        <legend>Expected</legend>
        {LABELS.map((l) => (
          <span key={l}>
            <input
              type="radio"
              id={`trap-${l}`}
              name="trap-expected"
              value={l}
              checked={expected === l}
              onChange={() => setExpected(l)}
            />
            <label htmlFor={`trap-${l}`}>{l}</label>
          </span>
        ))}
      </fieldset>
      {problem && (
        <p className="trap__problem small" role="alert">
          {problem}
        </p>
      )}
      <div>
        <button type="submit" className="button button--primary" disabled={full}>
          Add to tray
        </button>
        {full && <p className="small muted">The tray holds {MAX_TRAPS} of your traps. Remove one to add another.</p>}
      </div>
    </form>
  );
}
