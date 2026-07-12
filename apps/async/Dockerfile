# =============================================================================
# Ferni Async Workers - Cloud Run Container
# =============================================================================
#
# Multi-stage build for fast, small production images.
# Uses esbuild for fast TypeScript compilation.

# -----------------------------------------------------------------------------
# Build stage
# -----------------------------------------------------------------------------
FROM node:20-slim AS builder

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/async/package.json ./apps/async/package.json

# Install all dependencies (including devDependencies for build)
RUN pnpm install --filter @ferni/async... --frozen-lockfile --prefer-offline || pnpm install --filter @ferni/async...

# Copy source and config
COPY apps/async/tsconfig.json apps/async/esbuild.config.js ./apps/async/
COPY apps/async/src ./apps/async/src
COPY src ./src

# Build with esbuild (fast!)
WORKDIR /app/apps/async
RUN pnpm build:fast

# -----------------------------------------------------------------------------
# Production stage
# -----------------------------------------------------------------------------
FROM node:20-slim

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm for production install
RUN npm install -g pnpm@9

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/async/package.json ./apps/async/package.json

# Install production dependencies only
RUN pnpm install --filter @ferni/async --prod --frozen-lockfile --prefer-offline || pnpm install --filter @ferni/async --prod

# Copy built files from builder
WORKDIR /app/apps/async
COPY --from=builder /app/apps/async/dist ./dist

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/server.js"]

