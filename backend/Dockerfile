FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

# Install git (repo clone/fetch), ping (node reachability), and openssh-client (Ansible SSH)
RUN apt-get update && apt-get install -y --no-install-recommends git iputils-ping openssh-client && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# Include Ansible collections requirements used at worker startup
COPY .racksmith/collections/requirements.yml /.racksmith/collections/requirements.yml

# Copy application code
COPY backend/ .

# Default: run the FastAPI app
CMD ["uv", "run", "python", "main.py"]
