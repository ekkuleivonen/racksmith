FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

COPY registry/pyproject.toml registry/uv.lock ./
RUN uv sync --frozen --no-dev

COPY registry/ .

CMD ["uv", "run", "python", "main.py"]
