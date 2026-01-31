# Singularity Agent Container
# Claude Code CLI-based autonomous agent with vector search

FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    cron \
    jq \
    git \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root agent user
RUN useradd -m -s /bin/bash agent

# Create app directory structure
RUN mkdir -p /app/agent/memory \
    /app/scripts \
    /app/logs/agent-output \
    /app/state \
    && chown -R agent:agent /app

# Set up Python virtual environment
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Copy and install Python requirements
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy scripts
COPY scripts/ /app/scripts/
RUN chmod +x /app/scripts/*.sh

# Copy crontab
COPY docker/crontab /etc/cron.d/agent-cron
RUN chmod 0644 /etc/cron.d/agent-cron \
    && crontab -u agent /etc/cron.d/agent-cron

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set working directory
WORKDIR /app

# Environment defaults
ENV AGENT_MODEL=sonnet
ENV TZ=UTC
ENV EMBEDDING_MODEL=all-MiniLM-L6-v2

ENTRYPOINT ["/entrypoint.sh"]
