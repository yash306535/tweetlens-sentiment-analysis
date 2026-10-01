"""Live pulse: replay the TweetEval test split as a stream.

There is no live connection to X. The page says so; this module makes the
replay feel live by pacing it on the server and sending it as server-sent
events.
"""

from __future__ import annotations

import asyncio
import json
import re
from functools import lru_cache

import numpy as np

from .data import LABELS, load
from .models import Readers, reading

SEED = 2017


@lru_cache(maxsize=1)
def corpus() -> tuple[list[str], list[int], list[int]]:
    texts, labels = load("sentiment", "test")
    order = np.random.default_rng(SEED).permutation(len(texts)).tolist()
    return texts, labels, order


def matching(track: str | None) -> list[int]:
    texts, _, order = corpus()
    if not track:
        return order
    pattern = re.compile(rf"(?<!\w){re.escape(track.strip())}(?!\w)", re.IGNORECASE)
    return [i for i in order if pattern.search(texts[i])]


async def stream(
    request,
    readers: Readers,
    model_id: str,
    rate: float,
    track: str | None,
    start: int,
    limit: int | None = None,
):
    texts, labels, _ = corpus()
    indices = matching(track)
    if not indices:
        message = (
            f"No tweet in the replay mentions '{track}'. Try a broader word, or clear the box to see every tweet."
        )
        yield f"event: empty\ndata: {json.dumps({'message': message})}\n\n"
        return
    yield f"event: info\ndata: {json.dumps({'matching': len(indices), 'total': len(texts)})}\n\n"
    delay = 1.0 / max(0.25, min(rate, 20.0))
    seq = start
    while limit is None or seq - start < limit:
        if await request.is_disconnected():
            return
        i = indices[seq % len(indices)]
        probs = readers.proba(model_id, [texts[i]])[0]
        payload = {
            "seq": seq,
            "id": i,
            "text": texts[i],
            "gold": LABELS["sentiment"][labels[i]],
            **reading(probs),
        }
        yield f"event: tweet\ndata: {json.dumps(payload)}\n\n"
        seq += 1
        await asyncio.sleep(delay)
