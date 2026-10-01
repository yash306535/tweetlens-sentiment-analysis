PY := backend/.venv/bin/python
PIP := backend/.venv/bin/pip

.PHONY: setup data train api web dev build serve test screenshots

## First run: install everything, download TweetEval, train the models (~3 minutes)
setup:
	python3 -m venv backend/.venv
	$(PIP) install -r backend/requirements-dev.txt
	cd frontend && npm install
	$(MAKE) train

data:
	cd backend && ../$(PY) -m tweetlens.data

train: data
	cd backend && ../$(PY) -m tweetlens.train

## Development: API on :8000, web app with hot reload on :5173
api:
	cd backend && ../$(PY) -m uvicorn tweetlens.api:app --reload --port 8000

web:
	cd frontend && npm run dev

dev:
	$(MAKE) -j2 api web

## Production: build the web app and serve everything from the API on :8000
build:
	cd frontend && npm run build

serve: build
	cd backend && ../$(PY) -m uvicorn tweetlens.api:app --port 8000

test:
	cd backend && ../$(PY) -m pytest -q
	cd frontend && npm test

## Screenshots of every page at 1440px and 390px in both themes (needs `make serve` running)
screenshots:
	cd frontend && npm run screenshots
