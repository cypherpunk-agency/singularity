# Singularity Agent Container
# Claude Code CLI-based autonomous agent with control plane
# Python/vector search is handled by a separate container for faster builds

FROM node:20-slim

# Install system dependencies (no Python - that's in the vector service)
# Chromium and dependencies are needed for Puppeteer PDF generation
RUN apt-get update && apt-get install -y \
    cron \
    jq \
    git \
    curl \
    sqlite3 \
    procps \
    chromium \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

# Tell Puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install pnpm
RUN npm install -g pnpm@9

# Create non-root agent user
RUN useradd -m -s /bin/bash agent

# Create app directory structure
RUN mkdir -p /app/agent/memory \
    /app/agent/conversation \
    /app/agent/context \
    /app/scripts \
    /app/logs/agent-output \
    /app/state \
    /app/packages \
    && chown -R agent:agent /app

# Copy scripts
COPY scripts/ /app/scripts/
RUN chmod +x /app/scripts/*.sh

# Copy context files (agent can modify these now)
COPY agent/context/ /app/agent/context/
RUN chown -R agent:agent /app/agent/context

# Copy crontab
COPY docker/crontab /etc/cron.d/agent-cron
RUN chmod 0644 /etc/cron.d/agent-cron \
    && crontab -u agent /etc/cron.d/agent-cron

# Copy control plane packages
COPY package.json pnpm-workspace.yaml tsconfig.base.json /app/
COPY packages/ /app/packages/

# Install and build control plane
WORKDIR /app
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm build

# Fix ownership of installed packages (install runs as root before USER agent)
RUN chown -R agent:agent /app/node_modules /app/packages

# Install Claude Code CLI (native installer - faster than npm)
# Run as agent user so it installs to /home/agent/.claude/
USER agent
RUN curl -fsSL https://claude.ai/install.sh | bash
USER root
ENV PATH="/home/agent/.local/bin:$PATH"

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set working directory
WORKDIR /app

# Environment defaults
ENV AGENT_MODEL=sonnet
ENV TZ=UTC
ENV CONTROL_PLANE_PORT=3001
ENV APP_DIR=/app
# Vector service URL (for control plane to call)
ENV VECTOR_SERVICE_URL=http://vector:5000

# Expose control plane ports
EXPOSE 3000 3001

ENTRYPOINT ["/entrypoint.sh"]
