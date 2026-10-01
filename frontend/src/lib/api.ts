import type { Label } from "./format";

export type ModelId = "vader" | "nb" | "logreg" | "mlp";
export const MODEL_IDS: ModelId[] = ["vader", "nb", "logreg", "mlp"];

export interface Reading {
  probs: Record<Label, number>;
  score: number;
  label: Label;
  confidence: number;
}

export interface PipelineToken {
  id: string;
  text: string;
  kind: string;
}

export interface Stage {
  key: string;
  title: string;
  description: string;
  tokens: PipelineToken[];
  removed: string[];
  morphed: string[];
  split: Record<string, string[]>;
  fused: Record<string, string>;
  changed: boolean;
}

export interface Analysis {
  text: string;
  readings: Record<ModelId, Reading>;
  pipeline: Stage[];
  cleaned: string;
  emotions: Record<string, number>;
  irony: number;
  elapsed_ms: number;
}

export interface ExplainedWord {
  start: number;
  end: number;
  text: string;
  weight: number;
}

export interface Explanation {
  model: ModelId;
  score: number;
  words: ExplainedWord[];
}

export interface Evaluation {
  accuracy: number;
  macro_f1: number;
  macro_recall: number;
  per_class: Record<Label, { precision: number; recall: number; f1: number; support: number }>;
  confusion: number[][];
}

export interface ModelMeta {
  id: ModelId;
  name: string;
  reads: "raw" | "pipeline";
  summary: string;
  test: Evaluation | null;
  latency_ms: number | null;
}

export interface Meta {
  default_model: ModelId;
  models: ModelMeta[];
  labels: Label[];
  emotions: string[];
  stages: { key: string; title: string }[];
  hinglish_words: number;
  dataset: {
    name: string;
    url: string;
    train: number;
    val: number;
    test: number;
    test_distribution: Record<Label, number>;
  } | null;
  emotion_metrics: { train: number; macro_f1: number };
  irony_metrics: { train: number; macro_f1: number };
  trained_at: string | null;
}

export interface RobustnessTest {
  id: string;
  category: string;
  text: string;
  expected: Label;
  why: string;
  readings: Record<ModelId, Reading & { correct: boolean }>;
}

export interface Robustness {
  about: string;
  categories: { id: string; name: string; size: number }[];
  tests: RobustnessTest[];
  correct: Record<ModelId, number>;
  by_category: Record<string, Record<ModelId, number>>;
}

export interface BulkRow {
  row: number;
  text: string;
  date: string | null;
  label: Label | null;
  reading: Label;
  score: number;
  probs: [number, number, number];
}

export interface BulkTerm {
  term: string;
  n: number;
  mean_score: number;
}

export interface BulkSummary {
  filename: string;
  model: ModelId;
  rows: number;
  mean_score: number;
  counts: Record<Label, number>;
  has_dates: boolean;
  has_labels: boolean;
  first_date?: string;
  last_date?: string;
  timeline_bucket?: "day" | "hour";
  timeline?: { start: string; n: number; mean_score: number; counts: Record<Label, number> }[];
  evaluation?: { n: number; accuracy: number; macro_f1: number; confusion: number[][] };
  terms: { min_count: number; negative: BulkTerm[]; positive: BulkTerm[] };
  most_negative: { row: number; text: string; score: number }[];
  most_positive: { row: number; text: string; score: number }[];
}

export interface BulkResult {
  summary: BulkSummary;
  rows: BulkRow[];
  warnings: string[];
}

export interface PulseTweet extends Reading {
  seq: number;
  id: number;
  text: string;
  gold: Label;
}

export const OFFLINE_MESSAGE =
  "TweetLens can't reach its models. Start the API with `make api` and try again.";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(OFFLINE_MESSAGE);
  }
  if (!response.ok) {
    let message = OFFLINE_MESSAGE;
    if (response.status < 500 || response.status === 501) {
      try {
        const body = await response.json();
        if (typeof body.detail === "string") message = body.detail;
        else if (Array.isArray(body.detail)) message = "TweetLens couldn't read that request.";
      } catch {
        /* keep the default message */
      }
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  analyze: (text: string, signal?: AbortSignal) => postJson<Analysis>("/api/analyze", { text }, signal),
  explain: (text: string, model: ModelId, signal?: AbortSignal) =>
    postJson<Explanation>("/api/explain", { text, model }, signal),
  read: (texts: string[], signal?: AbortSignal) =>
    postJson<{ results: { text: string; readings: Record<ModelId, Reading> }[] }>("/api/read", { texts }, signal),
  robustness: () => request<Robustness>("/api/robustness"),
  bulk: (file: File, model: ModelId) => {
    const form = new FormData();
    form.append("file", file);
    form.append("model", model);
    return request<BulkResult>("/api/bulk", { method: "POST", body: form });
  },
  pulseUrl: (params: { model: ModelId; rate: number; track?: string; start?: number }) => {
    const q = new URLSearchParams({ model: params.model, rate: String(params.rate) });
    if (params.track) q.set("track", params.track);
    if (params.start) q.set("start", String(params.start));
    return `/api/pulse?${q}`;
  },
};
