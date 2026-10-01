import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

import { Barcode } from "../components/Barcode";
import { BarList } from "../components/charts/BarList";
import { ConfusionHeatmap } from "../components/charts/ConfusionHeatmap";
import { TimelineChart } from "../components/charts/TimelineChart";
import { ModelPicker } from "../components/ModelPicker";
import { Swatch } from "../components/Swatch";
import { api, ApiError, type BulkResult, type BulkRow, type ModelId } from "../lib/api";
import { formatCount, formatDateRange, formatPercent, formatScore } from "../lib/format";
import { useApp } from "../lib/store";
import "./BulkPage.css";

const SAMPLE_URL = "/samples/airline-tweets-feb-2015.csv";
const SAMPLE_NAME = "airline-tweets-feb-2015.csv";

export function BulkPage() {
  const { model: defaultModel, modelName, setLastScore } = useApp();
  const [model, setModel] = useState<ModelId>(defaultModel);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const read = useCallback(
    (f: File, m: ModelId) => {
      setBusy(true);
      setError(null);
      api
        .bulk(f, m)
        .then((r) => {
          setResult(r);
          setSelected(null);
          setLastScore(r.summary.mean_score);
        })
        .catch((err: ApiError) => setError(err.message))
        .finally(() => setBusy(false));
    },
    [setLastScore],
  );

  const accept = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name) && f.type && !f.type.includes("csv") && !f.type.startsWith("text/")) {
      setError(
        `'${f.name}' doesn't look like a CSV file. Export the tweets as CSV with a 'text' column and upload that.`,
      );
      return;
    }
    setFile(f);
    read(f, model);
  };

  const trySample = async () => {
    try {
      const response = await fetch(SAMPLE_URL);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      accept(new File([blob], SAMPLE_NAME, { type: "text/csv" }));
    } catch {
      setError("The sample file couldn't be loaded. Reload the page and try again.");
    }
  };

  // Changing the model re-reads the same file.
  const changeModel = (m: ModelId) => {
    setModel(m);
    if (file) read(file, m);
  };

  useEffect(() => {
    if (result && resultsRef.current && !busy) resultsRef.current.focus({ preventScroll: true });
  }, [result, busy]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  const s = result?.summary;
  const rows = result?.rows ?? [];
  const chosen = selected !== null ? rows[selected] : null;

  return (
    <div className="page bulk">
      <header className="page-head">
        <h1>Bulk analyzer</h1>
        <p>Read a whole CSV of tweets at once and see the batch as one strip.</p>
      </header>

      <div className="bulk__model">
        <ModelPicker value={model} onChange={changeModel} />
      </div>

      {!result ? (
        <div
          className={`drop ${dragging ? "is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="drop__lead">Drop a CSV of tweets to test a whole batch.</p>
          <p className="muted">
            It needs a 'text' column. A 'date' column orders the barcode and adds a timeline; a 'label' column
            (negative, neutral, positive) adds an error matrix. Up to 20,000 rows.
          </p>
          <div className="drop__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              Upload CSV
            </button>
            <button type="button" className="button" onClick={trySample} disabled={busy}>
              Try 1,200 airline tweets from February 2015
            </button>
          </div>
          <p className="small muted">
            The sample comes from the Twitter US Airline Sentiment dataset (CC BY-NC-SA 4.0).{" "}
            <a href={SAMPLE_URL} download>
              Download it
            </a>{" "}
            to see the format.
          </p>
        </div>
      ) : (
        <div className="bulk__file">
          <p>
            <strong>{s!.filename}</strong>, {formatCount(s!.rows)} {s!.rows === 1 ? "tweet" : "tweets"} read by{" "}
            {modelName(s!.model)}.
          </p>
          <div className="bulk__file-actions">
            <button type="button" className="button button--primary" onClick={() => downloadReport(result)}>
              Download report
            </button>
            <button type="button" className="button" onClick={() => input.current?.click()} disabled={busy}>
              Upload another CSV
            </button>
          </div>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {busy && (
        <p className="bulk__busy muted" role="status">
          Reading {file ? `'${file.name}'` : "the file"} with {modelName(model)}…
        </p>
      )}
      {error && (
        <div className="error bulk__error" role="alert">
          <strong>That file couldn't be read.</strong>
          <span>{error}</span>
        </div>
      )}

      {result && s && (
        <div ref={resultsRef} tabIndex={-1} className={`bulk__results ${busy ? "is-pending" : ""}`}>
          {result.warnings.map((w) => (
            <p key={w} className="notice">
              {w}
            </p>
          ))}

          <section className="bulk__barcode" aria-labelledby="barcode-title">
            <h2 id="barcode-title">Mood barcode</h2>
            <p className="section-intro">
              {formatCount(s.rows)} tweets
              {s.has_dates && s.first_date && s.last_date ? `, ${formatDateRange(s.first_date, s.last_date)}` : ""}, one
              band each {s.has_dates ? "in date order" : "in file order"}. Select a band to read its tweet.
            </p>
            <Barcode
              scores={rows.map((r) => r.score)}
              dates={rows.map((r) => r.date)}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="bulk__chosen" aria-live="polite">
              {chosen ? <ChosenRow row={chosen} /> : null}
            </div>
          </section>

          <section className="section bulk__summary" aria-labelledby="summary-title">
            <h2 id="summary-title" className="visually-hidden">
              Summary
            </h2>
            <div className="bulk__mean">
              <p className="bulk__mean-value num">{formatScore(s.mean_score)}</p>
              <p className="muted">mean score across {formatCount(s.rows)} tweets</p>
            </div>
            <BarList
              caption="Share of tweets by reading"
              max={1}
              labelWidth="5.5rem"
              bars={(["negative", "neutral", "positive"] as const).map((l) => ({
                key: l,
                label: l,
                value: s.counts[l] / s.rows,
                display: `${formatPercent(s.counts[l] / s.rows)} (${formatCount(s.counts[l])})`,
                color: `var(--${l === "negative" ? "acid" : l === "neutral" ? "litmus" : "base"})`,
              }))}
            />
          </section>

          {s.timeline && s.timeline.length > 1 && (
            <section className="section" aria-labelledby="timeline-title">
              <h2 id="timeline-title">Mean score by {s.timeline_bucket}</h2>
              <p className="section-intro">
                Each dot is the average of that {s.timeline_bucket}'s tweets, in its colour.
              </p>
              <TimelineChart points={s.timeline} bucket={s.timeline_bucket ?? "day"} />
            </section>
          )}

          {s.evaluation && (
            <section className="section" aria-labelledby="eval-title">
              <h2 id="eval-title">Against the file's labels</h2>
              <p className="section-intro">
                Accuracy {s.evaluation.accuracy.toFixed(2)} and macro F1 {s.evaluation.macro_f1.toFixed(2)} on{" "}
                {formatCount(s.evaluation.n)} labelled tweets. Rows are the file's label, columns what{" "}
                {modelName(s.model)} read.
              </p>
              <div className="bulk__heat">
                <ConfusionHeatmap title={modelName(s.model)} matrix={s.evaluation.confusion} />
              </div>
            </section>
          )}

          <section className="section" aria-labelledby="terms-title">
            <h2 id="terms-title">Words that go with each mood</h2>
            <p className="section-intro">
              Words in at least {s.terms.min_count} tweets, ranked by the mean score of the tweets that contain them,
              after the pipeline.
            </p>
            <div className="bulk__terms">
              <div>
                <h3>Most negative</h3>
                <TermBars terms={s.terms.negative} tone="negative" />
              </div>
              <div>
                <h3>Most positive</h3>
                <TermBars terms={s.terms.positive} tone="positive" />
              </div>
            </div>
          </section>

          <section className="section" aria-labelledby="extremes-title">
            <h2 id="extremes-title">Strongest readings</h2>
            <div className="bulk__extremes">
              <TweetList title="Most negative" items={s.most_negative} />
              <TweetList title="Most positive" items={s.most_positive} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ChosenRow({ row }: { row: BulkRow }) {
  return (
    <div className="bulk__row">
      <Swatch score={row.score} label="Reading" width={22} height={44} />
      <div>
        <p>{row.text}</p>
        <p className="small muted">
          Row {formatCount(row.row)}
          {row.date ? `, ${new Date(row.date).toUTCString().slice(5, 22)} UTC` : ""}. Score{" "}
          <span className="num">{formatScore(row.score)}</span>, reads {row.reading}
          {row.label ? `; the file says ${row.label}` : ""}.
        </p>
      </div>
    </div>
  );
}

function TermBars({ terms, tone }: { terms: { term: string; n: number; mean_score: number }[]; tone: string }) {
  if (!terms.length) return <p className="small muted">No word appears often enough with a {tone} lean.</p>;
  return (
    <BarList
      caption={`Words with the most ${tone} tweets`}
      max={1}
      labelWidth="9rem"
      bars={terms.map((t) => ({
        key: t.term,
        label: t.term,
        value: Math.abs(t.mean_score),
        display: `${formatScore(t.mean_score)} in ${t.n}`,
        color: tone === "negative" ? "var(--acid)" : "var(--base)",
      }))}
    />
  );
}

function TweetList({ title, items }: { title: string; items: { row: number; text: string; score: number }[] }) {
  return (
    <div>
      <h3>{title}</h3>
      <ol className="bulk__tweets">
        {items.map((t) => (
          <li key={t.row}>
            <Swatch score={t.score} label="Reading" width={16} height={32} />
            <p>
              <span className="num bulk__tweet-score">{formatScore(t.score)}</span> {t.text}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadReport(result: BulkResult) {
  const header = ["row", "date", "text", "label", "reading", "score", "p_negative", "p_neutral", "p_positive"];
  const lines = [header.join(",")];
  for (const r of result.rows) {
    lines.push(
      [r.row, r.date, r.text, r.label, r.reading, r.score, r.probs[0], r.probs[1], r.probs[2]].map(csvCell).join(","),
    );
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.summary.filename.replace(/\.(csv|txt)$/i, "") + `-tweetlens-${result.summary.model}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
