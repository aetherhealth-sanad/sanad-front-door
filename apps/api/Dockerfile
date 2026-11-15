# Sanad API image (T1.4). Research prototype, not a medical device. Synthetic data only.
# Build from the repository root, because the API loads rules/, catalogue/, schemas/,
# data/synthetic/ and knowledge/ at start-up (sanad_api/catalogues.py):
#     docker build -f apps/api/Dockerfile -t sanad-api .
# Installs no model extra: every model provider stays off by default (CC-011, OD-13).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

COPY apps/api/pyproject.toml apps/api/pyproject.toml
COPY apps/api/sanad_api apps/api/sanad_api
RUN pip install --no-cache-dir "./apps/api[azure]"

COPY rules rules
COPY catalogue catalogue
COPY schemas schemas
COPY data/synthetic data/synthetic
COPY knowledge/passages.v0.1.json knowledge/passages.v0.1.json

# The package is installed into site-packages, so config._repo_root() cannot find /app by
# itself. SQLite lives inside the container: run one replica, and expect cases to be lost on
# every restart or redeploy.
ENV SANAD_REPO_ROOT=/app \
    SANAD_DATABASE_URL=sqlite:////tmp/sanad.db

RUN useradd --uid 10001 --no-create-home sanad
USER sanad

EXPOSE 8000
# --proxy-headers lets the per-IP rate limits see the client address forwarded by the web
# container. Trusting every forwarder is acceptable only because the API has internal ingress.
CMD ["uvicorn", "sanad_api.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
