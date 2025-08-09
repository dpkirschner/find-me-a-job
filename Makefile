# ==============================================================================
# Project Makefile
#
# Commands are grouped by function: Setup, Development, Production, Validation,
# and Cleanup. Run `make help` to see all available commands.
# ==============================================================================

# Variables
FRONTEND_DIR = frontend
BACKEND_SRC_DIRS = backend agents utils
PYTHON_INTERPRETER = python3

.DEFAULT_GOAL := help
.PHONY: help deps run dev-backend dev-frontend build start test test-backend test-frontend validate validate-backend validate-frontend lint format check clean

## -----------------------------------------------------------------------------
## Help
## -----------------------------------------------------------------------------

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

## -----------------------------------------------------------------------------
## 📦 Setup
## -----------------------------------------------------------------------------

deps: ## Install all Python and frontend dependencies.
	@echo "📦 Installing Python dependencies..."
	@$(PYTHON_INTERPRETER) -m pip install -e .[dev]
	@echo "📦 Installing frontend dependencies..."
	@cd $(FRONTEND_DIR) && npm install
	@echo "✅ All dependencies installed!"

## -----------------------------------------------------------------------------
## 💻 Development
## -----------------------------------------------------------------------------

run: ## Run frontend and backend servers concurrently for development.
	@echo "🚀 Starting development servers (backend on :8000)..."
	@trap 'echo "🛑 Stopping servers..."; kill 0' INT; \
	uvicorn backend.app:app --reload --reload-dir $(BACKEND_SRC_DIRS) --host 0.0.0.0 --port 8000 & \
	cd $(FRONTEND_DIR) && npm run dev & \
	wait

dev-backend: ## Run the backend server with hot-reloading.
	@uvicorn backend.app:app --reload --reload-dir $(BACKEND_SRC_DIRS) --host 0.0.0.0 --port 8000

dev-frontend: ## Run the frontend development server.
	@cd $(FRONTEND_DIR) && npm run dev

## -----------------------------------------------------------------------------
## 🚀 Production
## -----------------------------------------------------------------------------

build: ## Build the optimized production frontend.
	@echo "Building production frontend..."
	@cd $(FRONTEND_DIR) && npm run build
	@echo "✅ Frontend build complete in $(FRONTEND_DIR)/.next"

start: ## Start the backend server with Gunicorn for production.
	@echo "🚀 Starting production backend server..."
	@gunicorn backend.app:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000

## -----------------------------------------------------------------------------
## ✅ Validation & QA
## -----------------------------------------------------------------------------

validate: validate-backend validate-frontend ## Run all validation checks for both backend and frontend.
	@echo "✅ All validation checks passed!"

validate-backend: format lint test-backend ## Run all backend validation checks (format, lint, test).
	@echo "✅ Backend validation passed!"

validate-frontend: ## Run all frontend checks (format, lint, test).
	@echo "✅ Running frontend validation..."
	@cd $(FRONTEND_DIR) && npm run format && npm run lint && npm run test

test: test-backend test-frontend ## Run all tests for both backend and frontend.
	@echo "✅ All tests passed!"

test-backend: ## Run backend Python tests with pytest.
	@echo "🐍 Running backend tests..."
	@$(PYTHON_INTERPRETER) -m pytest tests/

test-frontend: ## Run frontend tests with npm.
	@echo "⚡️ Running frontend tests..."
	@cd $(FRONTEND_DIR) && npm test

lint: ## Lint the Python codebase with ruff.
	@ruff check .

format: ## Format the Python codebase with ruff.
	@ruff format .

check: ## Lint and automatically fix Python code.
	@ruff check . --fix

## -----------------------------------------------------------------------------
## 🧹 Cleanup
## -----------------------------------------------------------------------------

clean: ## Remove all cache, build, and temporary files.
	@echo "🧹 Cleaning up project..."
	@rm -rf .pytest_cache build dist *.egg-info
	@cd $(FRONTEND_DIR) && rm -rf .next node_modules
	@find . -type d -name "__pycache__" -exec rm -rf {} +
	@find . -type f -name "*.pyc" -delete
	@echo "✅ Cleanup complete!"