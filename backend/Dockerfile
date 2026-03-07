FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

# Install git (repo clone/fetch) and ping (node reachability checks)
RUN apt-get update && apt-get install -y --no-install-recommends git iputils-ping && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY backend/ .

# Copy the builtin action library (.racksmith/actions/ at repo root)
COPY .racksmith/ .racksmith/

# Default: run the FastAPI app
CMD ["uv", "run", "python", "main.py"]
