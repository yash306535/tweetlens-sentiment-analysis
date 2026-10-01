import pytest

from tweetlens.data import ARTIFACTS_DIR

needs_models = pytest.mark.skipif(
    not (ARTIFACTS_DIR / "logreg.joblib").exists(),
    reason="trained models are missing; run `make train`",
)


@pytest.fixture(scope="session")
def readers():
    from tweetlens.models import Readers

    return Readers()


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from tweetlens.api import app

    with TestClient(app) as c:
        yield c
