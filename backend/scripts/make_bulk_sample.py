"""Build the Bulk analyzer's sample file from the Twitter US Airline Sentiment
dataset (Figure Eight / Crowdflower, February 2015, CC BY-NC-SA 4.0).

Keeps 1,200 tweets chosen at random with a fixed seed, with only the columns the
analyzer uses plus the airline. User names are dropped.

    python scripts/make_bulk_sample.py path/to/Tweets.csv
"""

import sys
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "samples" / "airline-tweets-feb-2015.csv"

source = pd.read_csv(sys.argv[1], dtype=str, keep_default_na=False)
sample = source.sample(n=1200, random_state=2015)
sample = pd.DataFrame(
    {
        "date": pd.to_datetime(sample["tweet_created"], utc=True).dt.strftime("%Y-%m-%d %H:%M"),
        "airline": sample["airline"],
        "text": sample["text"].str.replace(r"\s+", " ", regex=True).str.strip(),
        "label": sample["airline_sentiment"],
    }
).sort_values("date")
OUT.parent.mkdir(parents=True, exist_ok=True)
sample.to_csv(OUT, index=False)
print(f"Wrote {len(sample):,} rows to {OUT}")
print(sample["label"].value_counts().to_dict())
