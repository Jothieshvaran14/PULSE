# Generic Node.js Dockerfile — Fallback for unknown frameworks
# Works with npm, yarn, and pnpm out of the box
# Tries common entry points: server.js, app.js, index.js

FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY yarn.lock* pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm install --frozen-lockfile --prod; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile --production; \
    else \
      npm ci --omit=dev; \
    fi

COPY . .
ENV NODE_ENV=production

# Try common entry points in order
CMD ["sh", "-c", "node $([ -f server.js ] && echo server.js || ([ -f app.js ] && echo app.js || ([ -f src/index.js ] && echo src/index.js || echo index.js)))"]
