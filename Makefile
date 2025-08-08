.PHONY: run dev-backend dev-frontend lint format check test validation

run:
	@echo "🚀 Starting backend and frontend..."
	@trap 'kill %1 %2 2>/dev/null; exit' INT; \
	uvicorn backend.app:app --reload --reload-dir backend --reload-dir agents --reload-dir utils --host 0.0.0.0 --port 8000 & \
	cd frontend && npm run dev & \
	wait

dev-backend:
	uvicorn backend.app:app --reload --reload-dir backend --reload-dir agents --reload-dir utils --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev

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