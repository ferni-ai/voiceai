# ============================================================================
# Kyutai Bridge (Rust/Candle) — STT + TTS server for Ferni voice agent
# ============================================================================
# Builds the kyutai-bridge binary with CUDA support for production (GCE w/ GPU)
# or Metal support for local Mac development.
#
# Build:
#   docker build -f services/kyutai-bridge/Dockerfile -t kyutai-bridge:latest .
#
# Run (GPU):
#   docker run --gpus all -p 8089:8089 -p 8090:8090 kyutai-bridge:latest
#
# Run (mock mode, no models):
#   docker run -p 8089:8089 -p 8090:8090 kyutai-bridge:latest kyutai-bridge --mock
# ============================================================================

# Build stage: Rust + CUDA
FROM nvidia/cuda:12.1.0-devel-ubuntu24.04 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

ENV RUSTUP_INIT_SKIP_PATH_CHECK=yes
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /build
COPY services/kyutai-bridge/ .

RUN cargo build --release

# Runtime stage
FROM nvidia/cuda:12.1.0-runtime-ubuntu24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/kyutai-bridge /usr/local/bin/kyutai-bridge

EXPOSE 8089 8090

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD curl -sf http://localhost:8089/health/ready || exit 1

CMD ["kyutai-bridge"]
