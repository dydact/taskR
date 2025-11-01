PROJECT_ROOT := $(shell pwd)
PYTHON ?= python3
PIP ?= pip3

ifneq (,$(wildcard .venv/bin/python))
PYTHON := $(PROJECT_ROOT)/.venv/bin/python
PIP := $(PROJECT_ROOT)/.venv/bin/pip
endif

.PHONY: install lint format test up down migrate docs deptx-migrate deptx-smoke preference-smoke preference-guardrail preference-monitor autopm-agent scheduler-agent retention-job linkage-forwarder billing-export billing-console refresh-analytics local-llm

install:
	@echo "Installing backend dependencies"
	@cd services/api && $(PIP) install -r requirements.txt
	@echo "Installing package dependencies"
	@cd packages/common_events && if [ -f requirements.txt ]; then $(PIP) install -r requirements.txt; fi
	@cd packages/common_auth && if [ -f requirements.txt ]; then $(PIP) install -r requirements.txt; fi
	@cd packages/doc_ingest && if [ -f requirements.txt ]; then $(PIP) install -r requirements.txt; fi
	@cd packages/deptx_core && if [ -f requirements.txt ]; then $(PIP) install -r requirements.txt; fi
	@echo "Installing frontend dependencies"
	@cd apps/web && npm install || true

lint:
	@echo "Running linters"
	@cd services/api && $(PYTHON) -m ruff check src || true
	@cd packages/common_events && $(PYTHON) -m ruff check src || true

format:
	@echo "Formatting code"
	@cd services/api && $(PYTHON) -m ruff format src
	@cd packages/common_events && $(PYTHON) -m ruff format src

test:
	@echo "Running backend tests"
	@cd services/api && $(PYTHON) -m pytest || true
	@echo "Running common auth tests"
	@cd packages/common_auth && $(PYTHON) -m pytest || true
	@cd packages/deptx_core && $(PYTHON) -m pytest || true

up:
	docker-compose up -d

down:
	docker-compose down

migrate:
	@./scripts/migrate.sh

refresh-analytics:
	@echo "Refreshing analytics materialized views"
	@psql "$$TR_DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_space_completion_daily;" || \
	psql "$$TR_DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_space_completion_daily;"
	@psql "$$TR_DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_space_worklog_minutes;" || \
	psql "$$TR_DATABASE_URL" -c "REFRESH MATERIALIZED VIEW mv_space_worklog_minutes;"

local-llm:
	@MODEL_NAME="$$MODEL_NAME" bash ./scripts/run_local_llm.sh

docs:
	@echo "Docs live under docs/"

deptx-migrate:
	@./scripts/deptx_migrate.sh

deptx-smoke:
	@./scripts/deptx_smoke.sh

preference-smoke:
	@./scripts/preference_smoke.sh

preference-guardrail:
	@./scripts/preference_guardrail_check.py $(ARGS)

preference-monitor:
	@./scripts/preference_guardrail_check.py --loop $(ARGS)

autopm-agent:
	@./scripts/autopm_agent.py $(ARGS)

scheduler-agent:
	@./scripts/scheduler_agent.py $(ARGS)

retention-job:
	@./scripts/retention_job.py $(ARGS)

linkage-forwarder:
	@./scripts/run_linkage_forwarder.py $(ARGS)

billing-export:
	@./scripts/export_billing_report.py $(ARGS)

billing-console:
	@./scripts/billing_console.py $(ARGS)
