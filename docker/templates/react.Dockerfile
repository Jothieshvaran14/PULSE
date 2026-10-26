# React (Vite / CRA) — Multi-stage build with nginx
# Produces a minimal ~25MB image serving static files

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
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm run build; \
    elif [ -f yarn.lock ]; then \
      yarn build; \
    else \
      npm run build; \
    fi

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/build /usr/share/nginx/html 2>/dev/null || true

# SPA fallback: serve index.html for all routes
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
