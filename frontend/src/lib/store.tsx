import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, ApiError, type Analysis, type Meta, type ModelId, MODEL_IDS } from "./api";

const MODEL_KEY = "tweetlens-model";

interface AppState {
  meta: Meta | null;
  metaError: string | null;
  model: ModelId;
  setModel: (m: ModelId) => void;
  /** Score of the last tweet analysed anywhere in the app; colours the nav marker. */
  lastScore: number | null;
  setLastScore: (s: number | null) => void;
  /** The Analyze page's last tweet and result, kept while moving between pages. */
  analysis: { text: string; result: Analysis | null };
  setAnalysis: (a: { text: string; result: Analysis | null }) => void;
  modelName: (id: ModelId) => string;
}

const AppContext = createContext<AppState | null>(null);

const FALLBACK_NAMES: Record<ModelId, string> = {
  vader: "VADER",
  nb: "Naive Bayes",
  logreg: "Logistic regression",
  mlp: "Neural net",
};

function savedModel(): ModelId {
  try {
    const m = localStorage.getItem(MODEL_KEY);
    if (m && (MODEL_IDS as string[]).includes(m)) return m as ModelId;
  } catch {
    /* ignore */
  }
  return "logreg";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [model, setModelState] = useState<ModelId>(savedModel);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<{ text: string; result: Analysis | null }>({ text: "", result: null });

  useEffect(() => {
    let cancelled = false;
    const load = (attempt: number) => {
      api
        .meta()
        .then((m) => {
          if (!cancelled) {
            setMeta(m);
            setMetaError(null);
          }
        })
        .catch((err: ApiError) => {
          if (cancelled) return;
          setMetaError(err.message);
          // The API may still be starting; try again a few times.
          if (attempt < 5) window.setTimeout(() => load(attempt + 1), 1500 * (attempt + 1));
        });
    };
    load(0);
    return () => {
      cancelled = true;
    };
  }, []);

  const setModel = useCallback((m: ModelId) => {
    setModelState(m);
    try {
      localStorage.setItem(MODEL_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const modelName = useCallback(
    (id: ModelId) => meta?.models.find((m) => m.id === id)?.name ?? FALLBACK_NAMES[id],
    [meta],
  );

  const value = useMemo(
    () => ({ meta, metaError, model, setModel, lastScore, setLastScore, analysis, setAnalysis, modelName }),
    [meta, metaError, model, setModel, lastScore, analysis, modelName],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp needs an AppProvider");
  return ctx;
}
