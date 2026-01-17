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
COPY package.json pnpm-lock.yaml* ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile --prefer-offline || pnpm install

# Copy source and config
COPY tsconfig.json esbuild.config.js ./
COPY src ./src

# Build with esbuild (fast!)
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
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile --prefer-offline || pnpm install --prod

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/server.js"]

