FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

# Install dependencies
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY backend/ .

# Copy the builtin action library (.racksmith/actions/ at repo root)
COPY .racksmith/ .racksmith/

# Default: run the FastAPI app
CMD ["uv", "run", "python", "main.py"]
