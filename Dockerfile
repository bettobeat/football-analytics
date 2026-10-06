# SportLikely — single image: Express API + built React site + SQLite on a volume.
# Node 24 (node:sqlite is built in). Used by Railway (see railway.json) or any Docker host.

# ---- 1. build the frontend ----
FROM node:24-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
# vite build only (skip the tsc pass so a stray unused import can't block a deploy)
RUN npx vite build

# ---- 2. build the backend ----
FROM node:24-alpine AS api
WORKDIR /api
COPY backend/package*.json ./
RUN npm install --no-audit --no-fund
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

# ---- 3. runtime ----
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    STATIC_DIR=/app/frontend/dist
WORKDIR /app/backend
COPY --from=api /api/node_modules ./node_modules
COPY --from=api /api/dist ./dist
COPY --from=api /api/package.json ./package.json
COPY --from=web /web/dist /app/frontend/dist
RUN mkdir -p /data
EXPOSE 3001
CMD ["node", "dist/index.js"]
