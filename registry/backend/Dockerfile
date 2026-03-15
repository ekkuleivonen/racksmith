FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

ARG RACKSMITH_VERSION=dev
ENV RACKSMITH_VERSION=$RACKSMITH_VERSION

WORKDIR /app

COPY registry/backend/pyproject.toml registry/backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY registry/backend/ .

RUN groupadd -r -g 10000 racksmith && useradd -r -u 10000 -g racksmith -d /app -s /sbin/nologin racksmith \
    && chown -R racksmith:racksmith /app

USER racksmith

CMD ["uv", "run", "python", "main.py"]
