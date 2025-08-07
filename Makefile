.PHONY: dev-server lint format check test

dev-server:
	uvicorn server.app:app --reload --host 0.0.0.0 --port 8000

lint:
	ruff check .

format:
	ruff format .

check:
	ruff check . --fix

test:
	pytest