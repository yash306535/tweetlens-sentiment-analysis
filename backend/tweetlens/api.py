"""TweetLens HTTP API.

    uvicorn tweetlens.api:app --reload

When `frontend/dist` exists (after `npm run build`), the API also serves the
web app, so one process runs the whole thing.
"""

from __future__ import annotations

import json
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import pulse
from .bulk import BulkError, analyse_csv
from .data import LABELS
from .models import DEFAULT_MODEL, MODEL_IDS, MODEL_INFO, Readers, reading
from .preprocess import HINGLISH, STAGE_TITLES, trace

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT.parent / "frontend" / "dist"
SUITE_PATH = Path(__file__).with_name("robustness_suite.json")
MAX_TEXT = 1000


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.readers = Readers()
    yield


app = FastAPI(title="TweetLens", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def readers(request: Request) -> Readers:
    return request.app.state.readers


def check_model(model: str) -> str:
    if model not in MODEL_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"There is no model called '{model}'. Use one of: {', '.join(MODEL_IDS)}.",
        )
    return model


def check_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Write or paste a tweet first.")
    if len(text) > MAX_TEXT:
        raise HTTPException(
            status_code=422,
            detail=f"This text is {len(text):,} characters. TweetLens reads up to {MAX_TEXT:,}; shorten it and try again.",
        )
    return text


class TextIn(BaseModel):
    text: str = Field(..., description="The tweet to read")


class ExplainIn(BaseModel):
    text: str
    model: str = DEFAULT_MODEL


class BatchIn(BaseModel):
    texts: list[str] = Field(..., max_length=200)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/meta")
def meta(request: Request):
    metrics = readers(request).metrics
    models = []
    for info in MODEL_INFO:
        m = metrics.get("models", {}).get(info.id, {})
        models.append(
            {
                "id": info.id,
                "name": info.name,
                "reads": info.reads,
                "summary": info.summary,
                "test": m.get("test"),
                "latency_ms": m.get("latency_ms"),
            }
        )
    return {
        "default_model": DEFAULT_MODEL,
        "models": models,
        "labels": LABELS["sentiment"],
        "emotions": LABELS["emotion"],
        "stages": [{"key": k, "title": t} for k, t in STAGE_TITLES],
        "hinglish_words": len(HINGLISH),
        "dataset": metrics.get("dataset"),
        "emotion_metrics": {k: metrics.get("emotion", {}).get(k) for k in ("train", "macro_f1")},
        "irony_metrics": {k: metrics.get("irony", {}).get(k) for k in ("train", "macro_f1")},
        "trained_at": metrics.get("trained_at"),
    }


@app.post("/api/analyze")
def analyze(body: TextIn, request: Request):
    text = check_text(body.text)
    r = readers(request)
    started = time.perf_counter()
    stages = trace(text)
    all_probs = r.read_all([text])
    emotions = r.emotions([text])[0]
    irony = float(r.irony_proba([text])[0])
    return {
        "text": text,
        "readings": {m: reading(all_probs[m][0]) for m in MODEL_IDS},
        "pipeline": [s.as_dict() for s in stages],
        "cleaned": " ".join(t.text for t in stages[-1].tokens),
        "emotions": {label: round(float(p), 4) for label, p in zip(LABELS["emotion"], emotions)},
        "irony": round(irony, 4),
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
    }


@app.post("/api/explain")
def explain(body: ExplainIn, request: Request):
    text = check_text(body.text)
    return readers(request).explain(text, check_model(body.model))


@app.post("/api/read")
def read_batch(body: BatchIn, request: Request):
    """All four readings for a handful of tweets (used by the robustness lab)."""
    texts = [check_text(t) for t in body.texts]
    if not texts:
        return {"results": []}
    all_probs = readers(request).read_all(texts)
    return {
        "results": [
            {"text": t, "readings": {m: reading(all_probs[m][i]) for m in MODEL_IDS}}
            for i, t in enumerate(texts)
        ]
    }


@lru_cache(maxsize=1)
def suite() -> dict:
    return json.loads(SUITE_PATH.read_text(encoding="utf-8"))


@app.get("/api/robustness")
def robustness(request: Request):
    data = suite()
    tests = [
        {"id": f"{cat['id']}-{n}", "category": cat["id"], **test}
        for cat in data["categories"]
        for n, test in enumerate(cat["tests"], start=1)
    ]
    all_probs = readers(request).read_all([t["text"] for t in tests])
    correct = {m: 0 for m in MODEL_IDS}
    by_category: dict = {}
    for i, test in enumerate(tests):
        test["readings"] = {}
        for m in MODEL_IDS:
            r = reading(all_probs[m][i])
            r["correct"] = r["label"] == test["expected"]
            test["readings"][m] = r
            correct[m] += r["correct"]
            cat = by_category.setdefault(test["category"], {k: 0 for k in MODEL_IDS})
            cat[m] += r["correct"]
    return {
        "about": data["about"],
        "categories": [{"id": c["id"], "name": c["name"], "size": len(c["tests"])} for c in data["categories"]],
        "tests": tests,
        "correct": correct,
        "by_category": by_category,
    }


@app.get("/api/pulse")
async def pulse_stream(
    request: Request,
    model: str = DEFAULT_MODEL,
    rate: float = Query(2.0, ge=0.25, le=20.0),
    track: str | None = Query(None, max_length=60),
    start: int = Query(0, ge=0),
    limit: int | None = Query(None, ge=1, le=100_000),
):
    check_model(model)
    return StreamingResponse(
        pulse.stream(request, readers(request), model, rate, track, start, limit),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/bulk")
async def bulk(request: Request, file: UploadFile = File(...), model: str = Form(DEFAULT_MODEL)):
    check_model(model)
    raw = await file.read()
    try:
        return analyse_csv(raw, readers(request), model, file.filename or "upload.csv")
    except BulkError as exc:
        return JSONResponse(status_code=422, content={"detail": str(exc)})


# --------------------------------------------------------------------------
# The built web app
# --------------------------------------------------------------------------

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (DIST / path).resolve()
        if path and candidate.is_file() and DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
