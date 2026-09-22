.PHONY: help dev dev-backend dev-frontend build test test-backend lint docker-up docker-down docker-logs clean

help:
	@echo "======================================================================="
	@echo "KELVRIN Sovereign Agentic AI Workbench — Developer Operations"
	@echo "======================================================================="
	@echo "make dev           - Start both Frontend & Backend in development mode"
	@echo "make dev-backend   - Start FastAPI Uvicorn backend server with reload"
	@echo "make dev-frontend  - Start Vite frontend dev server on port 5173"
	@echo "make build         - Compile TypeScript and build production assets"
	@echo "make test          - Run full 22-phase automated backend pytest suite"
	@echo "make lint          - Verify TypeScript types across the entire project"
	@echo "make docker-up     - Launch sovereign multi-container stack via Docker Compose"
	@echo "make docker-down   - Gracefully shut down all Docker containers"
	@echo "make docker-logs   - Stream real-time logs from backend container"
	@echo "make clean         - Remove build artifacts, caches, and temp files"
	@echo "======================================================================="

dev:
	@echo "Starting KELVRIN in development mode..."
	npm run dev

dev-backend:
	npm run dev:backend

dev-frontend:
	npm run dev

build:
	npm run build

test:
	npm run test

test-backend:
	npm run test:backend

lint:
	cd frontend && npx tsc -b

docker-up:
	docker compose up --build -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f backend

clean:
	rm -rf frontend/dist frontend/node_modules/.vite .pytest_cache
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	@echo "Cleaned all temporary build artifacts and caches."
