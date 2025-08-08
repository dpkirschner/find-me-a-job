.PHONY: run dev-backend dev-frontend deps clean lint format check test validation

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

deps:
	@echo "📦 Installing Python dependencies..."
	pip install -e .[dev]
	@echo "📦 Installing frontend dependencies..."
	cd frontend && npm install
	@echo "✅ All dependencies installed!"

clean:
	@echo "🧹 Cleaning frontend caches..."
	cd frontend && rm -rf .next node_modules package-lock.json
	@echo "🧹 Cleaning backend caches..."
	rm -rf __pycache__ .pytest_cache build dist *.egg-info
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	@echo "📦 Reinstalling dependencies..."
	$(MAKE) deps
	@echo "✅ Clean and reinstall complete!"

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