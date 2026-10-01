"""Train every reader on TweetEval and record how each one scores on the
held-out test split. Hyperparameters were picked on the validation split.

    python -m tweetlens.train
"""

from __future__ import annotations

import json
import platform
import statistics
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import sklearn
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    recall_score,
)
from sklearn.naive_bayes import MultinomialNB
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.utils.class_weight import compute_sample_weight
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from .data import ARTIFACTS_DIR, LABELS, fetch, load
from .models import MODEL_INFO, Readers, vader_features
from .preprocess import clean, clean_many

SEED = 7
TOKENS = r"\S+"  # the pipeline already tokenised; split on spaces only


def word_char_tfidf() -> FeatureUnion:
    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    token_pattern=TOKENS, lowercase=False, ngram_range=(1, 2),
                    min_df=2, sublinear_tf=True,
                ),
            ),
            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb", ngram_range=(2, 5), min_df=3,
                    sublinear_tf=True, max_features=300_000,
                ),
            ),
        ]
    )


def build_nb() -> Pipeline:
    return Pipeline(
        [
            ("counts", CountVectorizer(token_pattern=TOKENS, lowercase=False, ngram_range=(1, 2), min_df=2)),
            ("clf", MultinomialNB(alpha=1.0)),
        ]
    )


def build_logreg(C: float = 1.0) -> Pipeline:
    return Pipeline(
        [
            ("features", word_char_tfidf()),
            ("clf", LogisticRegression(C=C, max_iter=3000, class_weight="balanced")),
        ]
    )


def build_mlp() -> Pipeline:
    return Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    token_pattern=TOKENS, lowercase=False, ngram_range=(1, 2),
                    min_df=2, max_features=30_000, sublinear_tf=True,
                ),
            ),
            (
                "clf",
                MLPClassifier(
                    hidden_layer_sizes=(128,), alpha=1e-2, early_stopping=True,
                    validation_fraction=0.1, n_iter_no_change=2, max_iter=30,
                    random_state=SEED,
                ),
            ),
        ]
    )


def evaluate(y_true, y_pred, labels: list[str]) -> dict:
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=list(range(len(labels))), zero_division=0
    )
    return {
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "macro_f1": round(f1_score(y_true, y_pred, average="macro"), 4),
        "macro_recall": round(recall_score(y_true, y_pred, average="macro"), 4),
        "per_class": {
            label: {
                "precision": round(float(p), 4),
                "recall": round(float(r), 4),
                "f1": round(float(f), 4),
                "support": int(s),
            }
            for label, p, r, f, s in zip(labels, precision, recall, f1, support)
        },
        # rows are the true label, columns the predicted one
        "confusion": confusion_matrix(y_true, y_pred, labels=list(range(len(labels)))).tolist(),
    }


def measure_latency(readers: Readers, texts: list[str]) -> dict[str, float]:
    """Median milliseconds to read one tweet from scratch, pipeline included."""
    out = {}
    for info in MODEL_INFO:
        times = []
        for text in texts:
            clean.cache_clear()
            start = time.perf_counter()
            readers.proba(info.id, [text])
            times.append((time.perf_counter() - start) * 1000)
        out[info.id] = round(statistics.median(times), 2)
    return out


def main() -> None:
    fetch()
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    started = time.time()
    labels = LABELS["sentiment"]

    print("Reading TweetEval sentiment")
    x_train, y_train = load("sentiment", "train")
    x_val, y_val = load("sentiment", "val")
    x_test, y_test = load("sentiment", "test")
    t = time.time()
    c_train, c_val, c_test = clean_many(x_train), clean_many(x_val), clean_many(x_test)
    print(f"  pipeline over {len(x_train) + len(x_val) + len(x_test):,} tweets in {time.time() - t:.0f}s")

    metrics: dict = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sklearn": sklearn.__version__,
        "python": platform.python_version(),
        "dataset": {
            "name": "TweetEval sentiment (SemEval-2017 Task 4A)",
            "url": "https://github.com/cardiffnlp/tweeteval",
            "train": len(x_train),
            "val": len(x_val),
            "test": len(x_test),
            "test_distribution": {
                label: int(np.sum(np.asarray(y_test) == i)) for i, label in enumerate(labels)
            },
        },
        "models": {},
    }

    # VADER, calibrated
    print("Calibrating VADER")
    analyzer = SentimentIntensityAnalyzer()
    calibrator = LogisticRegression(max_iter=2000, class_weight="balanced")
    calibrator.fit(vader_features(analyzer, x_train), y_train)
    joblib.dump(calibrator, ARTIFACTS_DIR / "vader_calibrator.joblib")

    print("Training Naive Bayes")
    nb = build_nb().fit(c_train, y_train)
    joblib.dump(nb, ARTIFACTS_DIR / "nb.joblib", compress=3)

    print("Training logistic regression")
    logreg = build_logreg().fit(c_train, y_train)
    joblib.dump(logreg, ARTIFACTS_DIR / "logreg.joblib", compress=3)

    print("Training the neural net")
    mlp = build_mlp()
    mlp.fit(c_train, y_train, clf__sample_weight=compute_sample_weight("balanced", y_train))
    # Adam's moment estimates and the early-stopping copies are only needed to
    # keep training; dropping them shrinks the file about threefold.
    net = mlp.named_steps["clf"]
    for attr in ("_optimizer", "_best_coefs", "_best_intercepts"):
        if hasattr(net, attr):
            setattr(net, attr, None)
    joblib.dump(mlp, ARTIFACTS_DIR / "mlp.joblib", compress=3)

    # Emotion and irony
    for task, C in (("emotion", 2.0), ("irony", 1.0)):
        print(f"Training the {task} reader")
        xt, yt = load(task, "train")
        xe, ye = load(task, "test")
        model = build_logreg(C).fit(clean_many(xt), yt)
        joblib.dump(model, ARTIFACTS_DIR / f"{task}.joblib", compress=3)
        metrics[task] = {
            "train": len(xt),
            "test": len(xe),
            **evaluate(ye, model.predict(clean_many(xe)), LABELS[task]),
        }
        print(f"  {task}: macro F1 {metrics[task]['macro_f1']:.3f}")

    print("Scoring the test split")
    readers = Readers(ARTIFACTS_DIR)
    for info in MODEL_INFO:
        for split, x, y in (("val", x_val, y_val), ("test", x_test, y_test)):
            pred = readers.proba(info.id, x).argmax(axis=1)
            result = evaluate(y, pred, labels)
            metrics["models"].setdefault(info.id, {"name": info.name})[split] = result
        m = metrics["models"][info.id]["test"]
        print(f"  {info.name:20s} accuracy {m['accuracy']:.3f}  macro F1 {m['macro_f1']:.3f}  macro recall {m['macro_recall']:.3f}")

    rng = np.random.default_rng(SEED)
    sample = [x_test[i] for i in rng.choice(len(x_test), size=200, replace=False)]
    latency = measure_latency(readers, sample)
    for model_id, ms in latency.items():
        metrics["models"][model_id]["latency_ms"] = ms

    metrics["training_seconds"] = round(time.time() - started)
    (ARTIFACTS_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"Done in {metrics['training_seconds']}s. Artifacts are in {ARTIFACTS_DIR}")


if __name__ == "__main__":
    main()
