# ============================================================================
# ⚠️  DEPRECATED - Use docker/Dockerfile.agent instead
# ============================================================================
# This file is kept for backwards compatibility.
# New builds should use: docker build -f docker/Dockerfile.agent .
# See docker/README.md for documentation.
# ============================================================================

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install CA certificates and other dependencies needed by native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy persona bundles from builder (JSON, MD files needed at runtime)
# These are NOT compiled by TypeScript but loaded dynamically
# The bundles were already copied to src/ in the builder stage
COPY --from=builder /app/src/personas/bundles/ ./dist/personas/bundles/

# Set environment variables
ENV NODE_ENV=production
# Default to ferni persona (can be overridden per-session via dispatch metadata)
ENV PERSONA_ID=ferni

# Expose port for LiveKit agent health checks
EXPOSE 8080

# Run the voice agent (persona determined by PERSONA_ID env var)
CMD ["node", "dist/agent.js", "start"]
