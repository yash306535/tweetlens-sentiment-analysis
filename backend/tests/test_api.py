import json

import pytest

from .conftest import needs_models

pytestmark = needs_models


def test_meta_lists_four_models_with_test_metrics(client):
    meta = client.get("/api/meta").json()
    assert [m["id"] for m in meta["models"]] == ["vader", "nb", "logreg", "mlp"]
    for m in meta["models"]:
        assert 0 < m["test"]["macro_f1"] < 1
        assert len(m["test"]["confusion"]) == 3


def test_analyze_returns_consistent_readings(client):
    body = client.post("/api/analyze", json={"text": "I love this so much!! 😍"}).json()
    assert set(body["readings"]) == {"vader", "nb", "logreg", "mlp"}
    for r in body["readings"].values():
        p = r["probs"]
        assert sum(p.values()) == pytest.approx(1, abs=1e-3)
        assert r["score"] == pytest.approx(p["positive"] - p["negative"], abs=1e-3)
    assert body["readings"]["logreg"]["label"] == "positive"
    assert body["pipeline"][0]["key"] == "raw"
    assert len(body["pipeline"]) == 9
    assert set(body["emotions"]) == {"anger", "joy", "optimism", "sadness"}
    assert 0 <= body["irony"] <= 1


def test_analyze_rejects_empty_and_overlong_text(client):
    assert client.post("/api/analyze", json={"text": "  "}).status_code == 422
    assert client.post("/api/analyze", json={"text": "x" * 1001}).status_code == 422


def test_explain_spans_point_into_the_text(client):
    text = "the staff were rude and the food was awful"
    body = client.post("/api/explain", json={"text": text, "model": "logreg"}).json()
    for w in body["words"]:
        assert text[w["start"]:w["end"]] == w["text"]
    weights = {w["text"]: w["weight"] for w in body["words"]}
    assert weights["awful"] < 0
    assert weights["the"] == 0  # stopwords never reach the model


def test_explain_rejects_unknown_model(client):
    r = client.post("/api/explain", json={"text": "hi", "model": "gpt"})
    assert r.status_code == 422


def test_robustness_suite_is_scored_by_every_model(client):
    body = client.get("/api/robustness").json()
    assert len(body["tests"]) == 36
    for m, n in body["correct"].items():
        assert n == sum(t["readings"][m]["correct"] for t in body["tests"])


def test_read_batch(client):
    body = client.post("/api/read", json={"texts": ["good", "bad"]}).json()
    assert len(body["results"]) == 2


def test_bulk_upload(client):
    csv = b"text,label\nI love it,positive\nterrible service,negative\n"
    r = client.post("/api/bulk", files={"file": ("t.csv", csv, "text/csv")}, data={"model": "nb"})
    assert r.status_code == 200
    assert r.json()["summary"]["model"] == "nb"


def test_bulk_error_is_a_sentence(client):
    r = client.post("/api/bulk", files={"file": ("t.csv", b"tweet\nhi\n", "text/csv")})
    assert r.status_code == 422
    assert r.json()["detail"].startswith("This CSV has no 'text' column")


def test_pulse_streams_scored_tweets(client):
    text = client.get("/api/pulse?rate=20&limit=2").text
    events = [json.loads(line[5:]) for line in text.splitlines() if line.startswith("data:")]
    info, first, second = events
    assert info["total"] == 12284
    assert first["seq"] == 0 and second["seq"] == 1
    assert first["gold"] in ("negative", "neutral", "positive")


def test_pulse_track_with_no_match_says_so(client):
    text = client.get("/api/pulse?track=zzqqxxnotaword").text
    assert "event: empty" in text
    assert "zzqqxxnotaword" in text
