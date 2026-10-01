import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError, type Analysis } from "./api";
import { useApp } from "./store";

const DEBOUNCE_MS = 280;

/**
 * The tweet being read and its result, shared by Analyze and the arena through
 * the app store. `run(text, true)` is a full dip (the strips wick again);
 * `type(text)` reads as you type and only glides the colours.
 */
export function useReading() {
  const { analysis, setAnalysis, model, setLastScore } = useApp();
  const [text, setText] = useState(analysis.text);
  const [result, setResult] = useState<Analysis | null>(analysis.result);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dipKey, setDipKey] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const debounce = useRef(0);

  const run = useCallback(
    (value: string, dip: boolean) => {
      window.clearTimeout(debounce.current);
      controller.current?.abort();
      if (!value.trim()) {
        setResult(null);
        setError(null);
        setBusy(false);
        setAnalysis({ text: value, result: null });
        return;
      }
      const ctrl = new AbortController();
      controller.current = ctrl;
      setBusy(true);
      api
        .analyze(value, ctrl.signal)
        .then((r) => {
          if (ctrl.signal.aborted) return;
          setResult(r);
          setError(null);
          setAnalysis({ text: value, result: r });
          if (dip) setDipKey((k) => k + 1);
        })
        .catch((err: ApiError) => {
          if (err.name === "AbortError") return;
          setError(err.message);
        })
        .finally(() => {
          if (controller.current === ctrl) setBusy(false);
        });
    },
    [setAnalysis],
  );

  const type = useCallback(
    (value: string) => {
      setText(value);
      window.clearTimeout(debounce.current);
      debounce.current = window.setTimeout(() => run(value, false), DEBOUNCE_MS);
    },
    [run],
  );

  useEffect(
    () => () => {
      window.clearTimeout(debounce.current);
      controller.current?.abort();
    },
    [],
  );

  // Keep the nav marker in the colour of the current reading.
  useEffect(() => {
    if (result) setLastScore(result.readings[model].score);
  }, [result, model, setLastScore]);

  const stale = result !== null && result.text !== text.trim();
  return { text, setText, result, error, busy, dipKey, run, type, stale };
}
