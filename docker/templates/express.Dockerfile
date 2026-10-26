# Express.js — Production build
# Uses npm ci --omit=dev for minimal production dependencies

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
CMD ["node", "index.js"]
