# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Cache node_modules separately
COPY frontend/package.json ./
RUN npm install

COPY frontend/ .
RUN npm run build

# ── Stage 2: Nginx runtime ───────────────────────────────────────────────────

