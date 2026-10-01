import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { ModelPicker } from "../components/ModelPicker";
import { BAND, Ribbon, type RibbonTweet } from "../components/Ribbon";
import { Swatch } from "../components/Swatch";
import { api, OFFLINE_MESSAGE, type ModelId, type PulseTweet } from "../lib/api";
import { formatCount, formatPercent, formatScore, verdict, type Label } from "../lib/format";
import { useApp } from "../lib/store";
import "./PulsePage.css";

const WINDOW = 25;
const SPEEDS = [
  { label: "1×", rate: 2 },
  { label: "2×", rate: 4 },
  { label: "4×", rate: 8 },
];
const KEEP = 600;

type Item = PulseTweet & RibbonTweet;

export function PulsePage() {
  const { model: defaultModel, modelName, setLastScore } = useApp();
  const [model, setModel] = useState<ModelId>(defaultModel);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [held, setHeld] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [track, setTrack] = useState("");
  const [activeTrack, setActiveTrack] = useState("");
  const [matching, setMatching] = useState<{ matching: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ n: 0, agree: 0, negative: 0, neutral: 0, positive: 0 });

  const source = useRef<EventSource | null>(null);
  const nextSeq = useRef(0);
  const recent = useRef<number[]>([]);

  const rate = SPEEDS[speed].rate;
  const flowing = running && !held;

  const close = () => {
    source.current?.close();
    source.current = null;
  };

  const resetRecord = () => {
    nextSeq.current = 0;
    recent.current = [];
    setItems([]);
    setSelected(null);
    setTotals({ n: 0, agree: 0, negative: 0, neutral: 0, positive: 0 });
  };

  // Open the stream whenever it should flow; close it otherwise.
  useEffect(() => {
    if (!flowing) {
      close();
      return;
    }
    const es = new EventSource(api.pulseUrl({ model, rate, track: activeTrack || undefined, start: nextSeq.current }));
    source.current = es;
    es.addEventListener("info", (e) => {
      setMatching(JSON.parse((e as MessageEvent).data));
      setError(null);
    });
    es.addEventListener("empty", (e) => {
      setNotice(JSON.parse((e as MessageEvent).data).message);
      setRunning(false);
      es.close();
    });
    es.addEventListener("tweet", (e) => {
      const t: PulseTweet = JSON.parse((e as MessageEvent).data);
      nextSeq.current = t.seq + 1;
      recent.current = [...recent.current, t.score].slice(-WINDOW);
      const avg = recent.current.reduce((a, b) => a + b, 0) / recent.current.length;
      setItems((list) => [...list, { ...t, avg }].slice(-KEEP));
      setTotals((s) => ({
        ...s,
        n: s.n + 1,
        agree: s.agree + (t.label === t.gold ? 1 : 0),
        [t.label]: s[t.label as Label] + 1,
      }));
    });
    es.onerror = () => {
      es.close();
      setRunning(false);
      setError(OFFLINE_MESSAGE);
    };
    return () => es.close();
  }, [flowing, model, rate, activeTrack]);

  useEffect(() => () => close(), []);

  const latest = items[items.length - 1];
  useEffect(() => {
    if (latest) setLastScore(latest.avg);
  }, [latest, setLastScore]);

  const onTrack = (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setMatching(null);
    resetRecord();
    setActiveTrack(track.trim());
    setRunning(true);
  };

  const clearTrack = () => {
    setTrack("");
    setNotice(null);
    setMatching(null);
    resetRecord();
    setActiveTrack("");
  };

  const onHoldChange = useCallback((holding: boolean) => setHeld(holding), []);
  const chosen = items.find((t) => t.seq === selected) ?? null;

  return (
    <div className="page pulse">
      <header className="page-head">
        <h1>Live pulse</h1>
        <p>
          Replays the TweetEval test split in random order as if it were arriving now. There is no live connection to X.
        </p>
      </header>

      <div className="pulse__controls">
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            setError(null);
            setRunning((r) => !r);
          }}
        >
          {running ? "Pause the stream" : items.length ? "Resume the stream" : "Start the stream"}
        </button>
        <fieldset className="segmented">
          <legend>Speed</legend>
          {SPEEDS.map((s, i) => (
            <span key={s.label}>
              <input type="radio" id={`speed-${i}`} name="speed" checked={speed === i} onChange={() => setSpeed(i)} />
              <label htmlFor={`speed-${i}`}>
                {s.label}
                <span className="visually-hidden"> ({s.rate} tweets a second)</span>
              </label>
            </span>
          ))}
        </fieldset>
        <ModelPicker value={model} onChange={setModel} />
      </div>

      <form className="pulse__track" onSubmit={onTrack}>
        <div className="field">
          <label htmlFor="track">Track a word</label>
          <div className="pulse__track-row">
            <input
              id="track"
              className="input"
              value={track}
              maxLength={60}
              placeholder="for example: iphone, trump, game"
              onChange={(e) => setTrack(e.target.value)}
            />
            <button type="submit" className="button" disabled={!track.trim()}>
              Track this word
            </button>
            {activeTrack && (
              <button type="button" className="button button--quiet" onClick={clearTrack}>
                Show every tweet
              </button>
            )}
          </div>
        </div>
        {matching && activeTrack && (
          <p className="small muted">
            {formatCount(matching.matching)} of {formatCount(matching.total)} tweets mention '{activeTrack}'.
          </p>
        )}
      </form>

      {notice && <p className="notice">{notice}</p>}
      {error && (
        <div className="error" role="alert">
          <strong>The stream stopped.</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="pulse__recorder" aria-labelledby="avg-title">
        <div className="pulse__avg">
          <p className="pulse__avg-value num">{latest ? formatScore(latest.avg) : "–"}</p>
          <p id="avg-title" className="muted">
            Rolling average of the last {WINDOW} tweets, read by {modelName(model)}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="pulse__empty">
            <p className="muted">
              Start the stream to watch tweets arrive. Each one adds a {BAND}px band in its colour; the line above is
              the rolling average.
            </p>
          </div>
        ) : (
          <>
            <Ribbon
              tweets={items}
              selected={selected}
              onSelect={setSelected}
              interval={1000 / rate}
              onHoldChange={onHoldChange}
            />
            <div className="pulse__axis small muted" aria-hidden="true">
              <span>older</span>
              <span>{held && running ? "paused while you look" : "now"}</span>
            </div>
          </>
        )}

        {totals.n > 0 && (
          <p className="pulse__totals">
            {formatCount(totals.n)} tweets so far: {formatCount(totals.negative)} negative,{" "}
            {formatCount(totals.neutral)} neutral and {formatCount(totals.positive)} positive.{" "}
            <span className="muted">
              {modelName(model)} agrees with TweetEval's human labels on {formatPercent(totals.agree / totals.n)} of
              them.
            </span>
          </p>
        )}
      </section>

      <section className="section" aria-labelledby="selected-title" aria-live="polite">
        <h2 id="selected-title">Selected tweet</h2>
        {chosen ? (
          <div className="pulse__chosen">
            <Swatch score={chosen.score} label={modelName(model)} width={28} height={56} />
            <div>
              <p className="pulse__chosen-text">{chosen.text}</p>
              <p className="muted">
                <span className="num">{formatScore(chosen.score)}</span>. {verdict(chosen.label, chosen.confidence)}.
                TweetEval's human label: {chosen.gold}.
              </p>
            </div>
          </div>
        ) : (
          <p className="muted">Click a band on the ribbon, or focus it and use the arrow keys, to read that tweet.</p>
        )}
      </section>
    </div>
  );
}
