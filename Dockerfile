# Multi-stage Dockerfile for Vendra Automata Fullstack App

# --- Stage 1: Build Frontend ---
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY "Vending Machine FSM Simulator Frontend/package.json" "Vending Machine FSM Simulator Frontend/pnpm-lock.yaml*" ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY "Vending Machine FSM Simulator Frontend" ./
ENV VITE_API_BASE_URL=/api
RUN pnpm build

# --- Stage 2: Build Backend ---
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY backend/package.json backend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY backend/ ./
RUN pnpm build

# --- Stage 3: Production Runner ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy backend package files and install production dependencies only
COPY backend/package.json backend/pnpm-lock.yaml* ./
RUN pnpm install --prod

# Copy compiled backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copy compiled frontend into public directory for unified serving
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.js"]
