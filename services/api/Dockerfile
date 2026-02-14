FROM python:3.11-slim AS base

WORKDIR /workspace
COPY services/api ./services/api
COPY shared-python ./shared-python
COPY toolfront-registry ./toolfront-registry
COPY packages ./packages
WORKDIR /workspace/services/api
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /app
COPY services/api/src ./src
COPY toolfront-registry ./toolfront-registry
COPY packages ./packages
ENV PYTHONPATH=/app/src:/app/packages/common_events/src:/app/packages/common_auth/src:/app/packages/doc_ingest/src:/app/packages/common_billing/src:/app/packages/deptx_core/src

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
