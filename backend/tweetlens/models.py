"""The four sentiment readers, plus the emotion and irony readers.

Every sentiment reader returns probabilities in the order
[negative, neutral, positive]. The score shown everywhere in the app is
P(positive) - P(negative), in [-1, +1].
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import cached_property

import joblib
import numpy as np
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from .data import ARTIFACTS_DIR, LABELS
from .preprocess import clean_many

SENTIMENT = LABELS["sentiment"]


@dataclass(frozen=True)
class ModelInfo:
    id: str
    name: str
    reads: str  # "raw" or "pipeline"
    summary: str


MODEL_INFO = [
    ModelInfo(
        "vader",
        "VADER",
        "raw",
        "A hand-built lexicon of about 7,500 words and emoticons with grammar rules for "
        "negation, capitals, exclamation marks and but. It reads the raw tweet. Its four "
        "scores are calibrated into three probabilities by a small logistic regression.",
    ),
    ModelInfo(
        "nb",
        "Naive Bayes",
        "pipeline",
        "Counts every word and word pair after the pipeline and asks which class makes "
        "those counts most likely, treating each word as independent evidence.",
    ),
    ModelInfo(
        "logreg",
        "Logistic regression",
        "pipeline",
        "Weighs TF-IDF features for words, word pairs and 2 to 5 character pieces. The "
        "character pieces let it cope with typos and stretched words. This is the default instrument.",
    ),
    ModelInfo(
        "mlp",
        "Neural net",
        "pipeline",
        "A network with one hidden layer of 128 units over TF-IDF word and word-pair "
        "features. It can combine words in ways a linear model cannot, and overfits faster.",
    ),
]
MODEL_IDS = [m.id for m in MODEL_INFO]
DEFAULT_MODEL = "logreg"


def vader_features(analyzer: SentimentIntensityAnalyzer, texts: list[str]) -> np.ndarray:
    rows = []
    for text in texts:
        s = analyzer.polarity_scores(text or "")
        rows.append([s["neg"], s["neu"], s["pos"], s["compound"]])
    return np.asarray(rows, dtype=float)


class Readers:
    """Loads trained artifacts once and serves predictions."""

    def __init__(self, artifacts_dir=ARTIFACTS_DIR):
        self.dir = artifacts_dir
        missing = [
            name
            for name in ("vader_calibrator", "nb", "logreg", "mlp", "emotion", "irony")
            if not (self.dir / f"{name}.joblib").exists()
        ]
        if missing:
            raise FileNotFoundError(
                "Trained models are missing (" + ", ".join(missing) + "). "
                "Run `make train` (or `python -m tweetlens.train`) first."
            )
        self.analyzer = SentimentIntensityAnalyzer()
        self.vader_calibrator = joblib.load(self.dir / "vader_calibrator.joblib")
        self.pipelines = {k: joblib.load(self.dir / f"{k}.joblib") for k in ("nb", "logreg", "mlp")}
        self.emotion = joblib.load(self.dir / "emotion.joblib")
        self.irony = joblib.load(self.dir / "irony.joblib")

    @cached_property
    def metrics(self) -> dict:
        path = self.dir / "metrics.json"
        return json.loads(path.read_text()) if path.exists() else {}

    # -- sentiment ---------------------------------------------------------

    def proba(self, model_id: str, texts: list[str], cleaned: list[str] | None = None) -> np.ndarray:
        if model_id == "vader":
            return self.vader_calibrator.predict_proba(vader_features(self.analyzer, texts))
        if model_id in self.pipelines:
            if cleaned is None:
                cleaned = clean_many(texts)
            return self.pipelines[model_id].predict_proba(cleaned)
        raise KeyError(model_id)

    def read_all(self, texts: list[str]) -> dict[str, np.ndarray]:
        cleaned = clean_many(texts)
        return {m: self.proba(m, texts, cleaned) for m in MODEL_IDS}

    # -- emotion and irony -------------------------------------------------

    def emotions(self, texts: list[str]) -> np.ndarray:
        return self.emotion.predict_proba(clean_many(texts))

    def irony_proba(self, texts: list[str]) -> np.ndarray:
        return self.irony.predict_proba(clean_many(texts))[:, 1]

    # -- explanations ------------------------------------------------------

    def explain(self, text: str, model_id: str, max_words: int = 80) -> dict:
        """Leave-one-out: a word's weight is how far the score moves when the
        word is removed and the tweet is read again. Positive weights pushed the
        score up (toward positive), negative ones pulled it down.

        `start` and `end` are code-point offsets (Python string indices)."""
        spans = [(m.start(), m.end()) for m in re.finditer(r"\S+", text)][:max_words]
        variants = [text]
        for start, end in spans:
            variants.append(re.sub(r"\s+", " ", (text[:start] + " " + text[end:])).strip())
        probs = self.proba(model_id, variants)
        scores = probs[:, 2] - probs[:, 0]
        base = float(scores[0])
        words = []
        for (start, end), without in zip(spans, scores[1:]):
            words.append(
                {
                    "start": start,
                    "end": end,
                    "text": text[start:end],
                    "weight": round(base - float(without), 4),
                }
            )
        return {"model": model_id, "score": round(base, 4), "words": words}


def reading(probs: np.ndarray) -> dict:
    """One model's reading of one tweet."""
    p = [float(x) for x in probs]
    top = int(np.argmax(p))
    return {
        "probs": {label: round(v, 4) for label, v in zip(SENTIMENT, p)},
        "score": round(p[2] - p[0], 4),
        "label": SENTIMENT[top],
        "confidence": round(p[top], 4),
    }
