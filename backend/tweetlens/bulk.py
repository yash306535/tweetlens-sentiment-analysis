"""Read a whole CSV of tweets with one model."""

from __future__ import annotations

import io
import math
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

from .models import SENTIMENT, Readers
from .preprocess import clean_many

MAX_ROWS = 20_000
MAX_BYTES = 10 * 1024 * 1024
DATE_COLUMNS = ("date", "created_at", "tweet_created", "timestamp", "datetime", "time")
LABEL_COLUMNS = ("label", "sentiment")

TEXT_LABELS = {
    "negative": 0, "neg": 0, "-": 0,
    "neutral": 1, "neu": 1, "none": 1,
    "positive": 2, "pos": 2, "+": 2,
}


class BulkError(ValueError):
    """An error the person can fix. The message says how."""


def _read_csv(raw: bytes) -> pd.DataFrame:
    if not raw.strip():
        raise BulkError("This file is empty. Export the tweets as CSV with a 'text' column and upload it again.")
    if len(raw) > MAX_BYTES:
        mb = len(raw) / (1024 * 1024)
        raise BulkError(
            f"This file is {mb:.1f} MB. TweetLens reads files up to 10 MB; split it and upload the parts."
        )
    last_error = None
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(
                io.BytesIO(raw), dtype=str, keep_default_na=False, encoding=encoding,
                on_bad_lines="skip", engine="python",
            )
        except UnicodeDecodeError as exc:
            last_error = exc
        except (pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
            raise BulkError(
                "This file couldn't be read as CSV. Save it as comma-separated values "
                "(in Excel: File, Save As, CSV UTF-8) and upload it again."
            ) from exc
    raise BulkError("This file isn't UTF-8 or Latin-1 text. Save it as CSV UTF-8 and upload it again.") from last_error


def _find(columns: dict[str, str], names) -> str | None:
    for name in names:
        if name in columns:
            return columns[name]
    return None


def _labels(series: pd.Series) -> tuple[list[int | None], str | None]:
    """Map a label column to 0/1/2. Returns the labels and a warning, if any."""
    values = [str(v).strip().lower() for v in series]
    present = {v for v in values if v}
    if not present:
        return [None] * len(values), None
    if present <= set(TEXT_LABELS):
        return [TEXT_LABELS.get(v) for v in values], None
    numeric = set()
    for v in present:
        try:
            numeric.add(float(v))
        except ValueError:
            return [None] * len(values), (
                "The 'label' column has values TweetLens doesn't know, such as "
                f"'{sorted(present - set(TEXT_LABELS))[0]}'. Use negative, neutral and positive "
                "to get the error matrix."
            )
    if numeric <= {-1.0, 0.0, 1.0} and -1.0 in numeric:
        mapping = {-1.0: 0, 0.0: 1, 1.0: 2}
    elif numeric <= {0.0, 2.0, 4.0} and 4.0 in numeric:
        mapping = {0.0: 0, 2.0: 1, 4.0: 2}  # Sentiment140
    elif numeric <= {0.0, 1.0, 2.0}:
        mapping = {0.0: 0, 1.0: 1, 2.0: 2}  # TweetEval
    else:
        return [None] * len(values), (
            "The 'label' column uses numbers TweetLens can't map. Use negative, neutral and "
            "positive, or -1, 0 and 1, to get the error matrix."
        )
    return [mapping.get(float(v)) if v else None for v in values], None


def analyse_csv(raw: bytes, readers: Readers, model_id: str, filename: str = "upload.csv") -> dict:
    frame = _read_csv(raw)
    columns = {str(c).strip().lower(): c for c in frame.columns}
    text_col = columns.get("text")
    if text_col is None:
        found = ", ".join(f"'{c}'" for c in list(frame.columns)[:8]) or "none"
        raise BulkError(
            "This CSV has no 'text' column. Rename the column that holds the tweets to 'text' "
            f"and upload it again. (Columns found: {found}.)"
        )

    warnings: list[str] = []
    texts = frame[text_col].astype(str).str.strip()
    keep = texts != ""
    if not keep.any():
        raise BulkError(
            "This CSV has a 'text' column but every row in it is empty. Fill in the tweets and upload it again."
        )
    skipped = int((~keep).sum())
    if skipped:
        warnings.append(f"{skipped:,} rows had no text and were skipped.")
    frame = frame[keep].reset_index(drop=True)
    texts = texts[keep].reset_index(drop=True)
    if len(frame) > MAX_ROWS:
        raise BulkError(
            f"This CSV has {len(frame):,} rows. TweetLens reads up to {MAX_ROWS:,} at a time; "
            "split the file and upload the parts."
        )

    date_col = _find(columns, DATE_COLUMNS)
    dates = None
    if date_col is not None:
        dates = pd.to_datetime(frame[date_col], errors="coerce", utc=True, format="mixed")
        bad = int(dates.isna().sum())
        if bad == len(dates):
            warnings.append(
                f"The '{date_col}' column couldn't be read as dates, so the barcode is in file order. "
                "Use a format like 2015-02-24 11:35."
            )
            dates = None
        elif bad:
            warnings.append(f"{bad:,} dates couldn't be read; those tweets sit at the end of the barcode.")

    label_col = _find(columns, LABEL_COLUMNS)
    labels: list[int | None] = [None] * len(frame)
    if label_col is not None:
        labels, warning = _labels(frame[label_col])
        if warning:
            warnings.append(warning)

    text_list = texts.tolist()
    cleaned = clean_many(text_list)
    probs = readers.proba(model_id, text_list, cleaned)
    scores = probs[:, 2] - probs[:, 0]
    preds = probs.argmax(axis=1)

    order = list(range(len(frame)))
    if dates is not None:
        order.sort(key=lambda i: (pd.isna(dates[i]), dates[i] if not pd.isna(dates[i]) else 0, i))

    rows = []
    for i in order:
        rows.append(
            {
                "row": i + 1,
                "text": text_list[i],
                "date": None if dates is None or pd.isna(dates[i]) else dates[i].isoformat(),
                "label": None if labels[i] is None else SENTIMENT[labels[i]],
                "reading": SENTIMENT[int(preds[i])],
                "score": round(float(scores[i]), 4),
                "probs": [round(float(p), 4) for p in probs[i]],
            }
        )

    counts = {label: int(np.sum(preds == k)) for k, label in enumerate(SENTIMENT)}
    summary: dict = {
        "filename": filename,
        "model": model_id,
        "rows": len(rows),
        "mean_score": round(float(scores.mean()), 4),
        "counts": counts,
        "has_dates": dates is not None,
        "has_labels": any(label is not None for label in labels),
    }

    if dates is not None:
        valid = dates.dropna()
        summary["first_date"] = valid.min().isoformat()
        summary["last_date"] = valid.max().isoformat()
        span_hours = (valid.max() - valid.min()).total_seconds() / 3600
        freq = "D" if span_hours >= 48 else "h"
        summary["timeline_bucket"] = "day" if freq == "D" else "hour"
        buckets: dict = defaultdict(list)
        for i in range(len(frame)):
            if not pd.isna(dates[i]):
                buckets[dates[i].floor(freq)].append(i)
        summary["timeline"] = [
            {
                "start": key.isoformat(),
                "n": len(idx),
                "mean_score": round(float(scores[idx].mean()), 4),
                "counts": {label: int(np.sum(preds[idx] == k)) for k, label in enumerate(SENTIMENT)},
            }
            for key, idx in sorted(buckets.items())
        ]

    labelled = [i for i, label in enumerate(labels) if label is not None]
    if labelled:
        y_true = [labels[i] for i in labelled]
        y_pred = [int(preds[i]) for i in labelled]
        summary["evaluation"] = {
            "n": len(labelled),
            "accuracy": round(accuracy_score(y_true, y_pred), 4),
            "macro_f1": round(f1_score(y_true, y_pred, average="macro", labels=[0, 1, 2], zero_division=0), 4),
            "confusion": confusion_matrix(y_true, y_pred, labels=[0, 1, 2]).tolist(),
        }

    summary["terms"] = _driving_terms(cleaned, scores)
    ranked = np.argsort(scores)
    summary["most_negative"] = [_brief(text_list, scores, i) for i in ranked[:5]]
    summary["most_positive"] = [_brief(text_list, scores, i) for i in ranked[::-1][:5]]
    return {"summary": summary, "rows": rows, "warnings": warnings}


def _brief(texts, scores, i) -> dict:
    return {"row": int(i) + 1, "text": texts[i], "score": round(float(scores[i]), 4)}


def _driving_terms(cleaned: list[str], scores: np.ndarray, top: int = 8) -> dict:
    """Words whose tweets read most negative or most positive on average."""
    seen: dict[str, list[int]] = defaultdict(list)
    for i, line in enumerate(cleaned):
        for token in set(line.split()):
            if token in ("!", "?"):
                continue
            seen[token].append(i)
    min_count = max(5, math.ceil(len(cleaned) * 0.005))
    stats = [
        {"term": term, "n": len(idx), "mean_score": round(float(scores[idx].mean()), 4)}
        for term, idx in seen.items()
        if len(idx) >= min_count
    ]
    stats.sort(key=lambda s: s["mean_score"])
    return {
        "min_count": min_count,
        "negative": [s for s in stats[:top] if s["mean_score"] < 0],
        "positive": [s for s in reversed(stats[-top:]) if s["mean_score"] > 0],
    }
