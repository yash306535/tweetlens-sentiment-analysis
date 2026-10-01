import pytest

from tweetlens import bulk
from tweetlens.bulk import BulkError, analyse_csv

from .conftest import needs_models

pytestmark = needs_models


def run(readers, csv: str):
    return analyse_csv(csv.encode(), readers, "logreg")


def test_missing_text_column_explains_the_fix(readers):
    with pytest.raises(BulkError) as err:
        run(readers, "tweet,date\nhello,2020-01-01\n")
    assert "no 'text' column" in str(err.value)
    assert "Rename the column" in str(err.value)
    assert "'tweet'" in str(err.value)


def test_empty_text_column(readers):
    with pytest.raises(BulkError, match="every row in it is empty"):
        run(readers, "text\n\n \n")


def test_empty_file(readers):
    with pytest.raises(BulkError, match="empty"):
        run(readers, "")


def test_row_limit(readers, monkeypatch):
    monkeypatch.setattr(bulk, "MAX_ROWS", 2)
    with pytest.raises(BulkError, match="split the file"):
        run(readers, "text\na\nb\nc\n")


def test_dates_order_the_rows_and_build_a_timeline(readers):
    out = run(readers, "text,date\nlater,2021-03-05\nearlier,2021-03-01\nmiddle,2021-03-03\n")
    assert [r["text"] for r in out["rows"]] == ["earlier", "middle", "later"]
    assert out["summary"]["has_dates"]
    assert len(out["summary"]["timeline"]) == 3


def test_numeric_labels_map_and_produce_an_error_matrix(readers):
    out = run(readers, "text,label\nI love it,1\nI hate it,-1\nthe bus is at 9,0\n")
    evaluation = out["summary"]["evaluation"]
    assert evaluation["n"] == 3
    assert sum(map(sum, evaluation["confusion"])) == 3
    assert [r["label"] for r in out["rows"]] == ["positive", "negative", "neutral"]


def test_unknown_labels_warn_instead_of_failing(readers):
    out = run(readers, "text,label\nI love it,great\n")
    assert "evaluation" not in out["summary"]
    assert any("label" in w for w in out["warnings"])


def test_blank_rows_are_skipped_with_a_warning(readers):
    out = run(readers, "text,date\nI love it,2020-01-01\n,2020-01-02\nok,2020-01-03\n")
    assert out["summary"]["rows"] == 2
    assert any("no text" in w for w in out["warnings"])
