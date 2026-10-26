# Generic Node.js application
# Falls back to common entry points: server.js, app.js, index.js, main.js

FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm install --frozen-lockfile --prod; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile --production; \
    else \
      npm ci --omit=dev; \
    fi

COPY . .
ENV NODE_ENV=production
EXPOSE 3000

# Try common entry points in order
CMD ["sh", "-c", "node $([ -f server.js ] && echo server.js || ([ -f app.js ] && echo app.js || ([ -f src/index.js ] && echo src/index.js || echo index.js)))"]
