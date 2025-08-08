.PHONY: dev-server dev-frontend lint format check test validation

dev-server:
	uvicorn server.app:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd ui && npm run dev

lint:
	ruff check .

format:
	ruff format .

check:
	ruff check . --fix

test:
	python -m pytest

validate: format lint test
	@echo "✅ All validation checks passed!"