# syntax=docker/dockerfile:1

# --- Build stage: compile native modules (better-sqlite3), build Tailwind CSS, prune dev deps ---
FROM node:22-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY public ./public
RUN npm run build:css && npm prune --omit=dev

# --- Runtime stage: no compilers, production dependencies only ---
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=data/upcycling.db \
    UPLOAD_DIR=uploads
WORKDIR /app

COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY server ./server
COPY --from=build /app/public ./public

# Writable dirs owned by the unprivileged "node" user; named volumes inherit this ownership.
RUN mkdir -p data uploads && chown -R node:node data uploads
USER node

EXPOSE 3000
VOLUME ["/app/data", "/app/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
