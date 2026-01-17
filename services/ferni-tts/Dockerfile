# Ferni TTS Service
# Multi-stage build for minimal image size

# ============================================================================
# Stage 1: Build
# ============================================================================
FROM rust:1.75-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Cargo files for dependency caching
COPY Cargo.toml Cargo.lock ./

# Create dummy main for dependency caching
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    echo "pub fn lib() {}" > src/lib.rs

# Build dependencies only (cached layer)
RUN cargo build --release && rm -rf src

# Copy source code
COPY src ./src
COPY proto ./proto
COPY build.rs ./

# Touch main.rs to force rebuild
RUN touch src/main.rs src/lib.rs

# Build the actual application
RUN cargo build --release --features "full"

# ============================================================================
# Stage 2: Runtime
# ============================================================================
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 ferni

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/ferni-tts /app/ferni-tts

# Set ownership
RUN chown -R ferni:ferni /app

USER ferni

# Default environment variables
ENV FERNI_TTS_HOST=0.0.0.0
ENV FERNI_TTS_PORT=8080
ENV FERNI_TTS_LOG_LEVEL=info
ENV FERNI_TTS_JSON_LOGS=true
ENV FERNI_TTS_BACKEND=mock
ENV RUST_BACKTRACE=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Expose port
EXPOSE 8080

# Run the service
CMD ["/app/ferni-tts"]
