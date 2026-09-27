.PHONY: dev test lint format migrate seed down api web worker

dev:
	docker compose up --build -d
	@echo 'AGENTLAB: http://localhost:3000 | API: http://localhost:8000/docs'
down:
	docker compose down
migrate:
	alembic upgrade head
seed:
	python -m agentlab.demo
api:
	uvicorn agentlab_api.main:app --host 0.0.0.0 --port 8000 --reload
web:
	npm --prefix apps/web run dev
worker:
	celery -A agentlab.worker.celery_app worker -l info --concurrency=4

test:
	pytest -q
	npm --prefix apps/web run typecheck
lint:
	ruff check packages apps/api tests
	npm --prefix apps/web run typecheck
format:
	ruff format packages apps/api tests
