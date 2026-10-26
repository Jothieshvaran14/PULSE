# Next.js — Multi-stage build with standalone output
# Leverages Next.js standalone mode for minimal production image

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile; \
    else \
      npm ci; \
    fi

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm run build; \
    elif [ -f yarn.lock ]; then \
      yarn build; \
    else \
      npm run build; \
    fi

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone output if available, otherwise copy full build
COPY --from=build /app/public ./public 2>/dev/null || true
COPY --from=build /app/.next/standalone ./ 2>/dev/null || true
COPY --from=build /app/.next/static ./.next/static 2>/dev/null || true

# Fallback: if standalone mode is not configured
COPY --from=build /app/.next ./.next 2>/dev/null || true
COPY --from=build /app/node_modules ./node_modules 2>/dev/null || true
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
