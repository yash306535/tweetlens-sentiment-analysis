"""Download and load the TweetEval splits that TweetLens trains on.

TweetEval (Barbieri et al., 2020) collects SemEval Twitter tasks with fixed
train, validation and test splits: https://github.com/cardiffnlp/tweeteval
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "tweeteval"
ARTIFACTS_DIR = ROOT / "artifacts"

BASE_URL = "https://raw.githubusercontent.com/cardiffnlp/tweeteval/main/datasets"
TASKS = ("sentiment", "emotion", "irony")
SPLITS = ("train", "val", "test")

LABELS = {
    "sentiment": ["negative", "neutral", "positive"],
    "emotion": ["anger", "joy", "optimism", "sadness"],
    "irony": ["not_ironic", "ironic"],
}


def fetch(force: bool = False) -> None:
    for task in TASKS:
        task_dir = DATA_DIR / task
        task_dir.mkdir(parents=True, exist_ok=True)
        for split in SPLITS:
            for part in ("text", "labels"):
                name = f"{split}_{part}.txt"
                target = task_dir / name
                if target.exists() and not force:
                    continue
                url = f"{BASE_URL}/{task}/{name}"
                print(f"Downloading {url}")
                with urllib.request.urlopen(url, timeout=60) as response:
                    target.write_bytes(response.read())


def load(task: str, split: str) -> tuple[list[str], list[int]]:
    task_dir = DATA_DIR / task
    text_path = task_dir / f"{split}_text.txt"
    label_path = task_dir / f"{split}_labels.txt"
    if not text_path.exists():
        raise FileNotFoundError(
            f"{text_path} is missing. Run `python -m tweetlens.data` to download TweetEval."
        )
    texts = text_path.read_text(encoding="utf-8").splitlines()
    labels = [int(x) for x in label_path.read_text(encoding="utf-8").split()]
    if len(texts) != len(labels):
        raise ValueError(f"{task}/{split}: {len(texts)} texts but {len(labels)} labels")
    # TweetEval wraps some tweets in quotes and leaves trailing spaces.
    texts = [t.strip() for t in texts]
    return texts, labels


if __name__ == "__main__":
    fetch(force="--force" in sys.argv)
    print(f"TweetEval is in {DATA_DIR}")
