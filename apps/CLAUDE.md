# Applications (`apps/`)

> **Navigation index for all Ferni platform applications.**

This directory contains all client applications and deployment targets. Each app has its own CLAUDE.md with specific build instructions and patterns.

---

## Platform Overview

| Platform            | Apps                             | Status      |
| ------------------- | -------------------------------- | ----------- |
| **Web**             | `web/`, `website/`               | Production  |
| **iOS**             | `ios-native/`, `shared/`         | Production  |
| **Android**         | `android-native/`                | Development |
| **Desktop**         | `electron/`, `macos-menubar/`    | Development |
| **Backend Workers** | `async/`, `intelligence-worker/` | Production  |
| **Performance**     | `rust-audio/`, `rust-perf/`      | Production  |
| **CLI**             | `cli/`                           | Production  |

---

## App Index

### Web Platform

| App        | CLAUDE.md | Purpose                                                               |
| ---------- | --------- | --------------------------------------------------------------------- |
| `web/`     | ✅        | Main web client (Vite, Lit, TypeScript)                               |
| `website/` | ✅        | 4 Eleventy portals (ferni.ai, developers, marketplace, design-system) |

### Mobile

| App               | CLAUDE.md | Purpose                                                  |
| ----------------- | --------- | -------------------------------------------------------- |
| `ios-native/`     | ✅        | Full iOS app (SwiftUI, LiveKit, Watch, CarPlay, Widgets) |
| `android-native/` | ✅        | Android app (Kotlin, Jetpack Compose)                    |
| `shared/`         | ✅        | Shared Swift Package for iOS/macOS                       |
| `ios/`            | ✅        | Placeholder → points to `ios-native/`                    |

### Desktop

| App              | CLAUDE.md | Purpose                                        |
| ---------------- | --------- | ---------------------------------------------- |
| `electron/`      | ✅        | Cross-platform desktop (Electron, system tray) |
| `macos-menubar/` | ✅        | Native Swift menubar app                       |

### Backend Workers

| App                    | CLAUDE.md | Purpose                                      |
| ---------------------- | --------- | -------------------------------------------- |
| `async/`               | ✅        | Cloud Run async worker (Pub/Sub, batch jobs) |
| `intelligence-worker/` | ✅        | Intelligence processing service              |

### Performance (Rust NAPI)

| App           | CLAUDE.md | Purpose                                            |
| ------------- | --------- | -------------------------------------------------- |
| `rust-audio/` | ✅        | Zero-allocation audio DSP (AGC, noise suppression) |
| `rust-perf/`  | ✅        | SIMD-optimized operations (embeddings, hashing)    |

### Self-Hosted Voice (Local / On-Device)

| App               | CLAUDE.md | Purpose                                                       |
| ----------------- | --------- | ------------------------------------------------------------- |
| `kyutai-local/`   | ✅        | Kyutai DSM MLX servers (STT + TTS on Apple Silicon)           |
| `mlx-higgs/`      | —         | Higgs Audio V2 MLX server (TTS, INT4 quantized, ~75 tok/s)    |
| `rust-higgs-mlx/` | —         | Higgs Audio V2 Rust MLX server (TTS, same protocol as Python) |

### CLI & Marketing

| App                   | CLAUDE.md | Purpose                                 |
| --------------------- | --------- | --------------------------------------- |
| `cli/`                | ✅        | User-facing Ferni CLI (`ferni` command) |
| `marketing/`          | ✅        | Marketing assets, automation            |
| `marketplace-agents/` | ✅        | Installable AI persona bundles          |

---

## Quick Start by Platform

### Web Development

```bash
cd apps/web && pnpm dev     # Vite dev server on :3004
```

### iOS Development

```bash
cd apps/ios-native
open FerniVoice.xcodeproj   # Xcode
```

### Electron Development

```bash
cd apps/electron && pnpm dev
```

### Rust Modules

```bash
cd apps/rust-audio && cargo build --release
cd apps/rust-perf && cargo build --release
```

---

## Self-Hosted Voice Pipeline

Two self-hosted TTS options exist alongside cloud TTS (Cartesia). Both run on Apple Silicon for local dev and can target GPU for production.

### Kyutai DSM (STT + TTS)

Full self-hosted voice stack — both speech-to-text and text-to-speech.

```bash
# Start MLX servers (Apple Silicon)
cd apps/kyutai-local
python stt_server.py    # STT on port 8089
python tts_server.py    # TTS on port 8090

# Enable in voice agent
USE_KYUTAI_STT=true KYUTAI_STT_URL=ws://localhost:8089/api/asr-streaming \
TTS_PROVIDER=kyutai KYUTAI_TTS_URL=ws://localhost:8090/api/tts_streaming pnpm dev
```

| Component        | Runtime             | Port      | Status           |
| ---------------- | ------------------- | --------- | ---------------- |
| STT (1B model)   | MLX Python          | 8089      | Production-ready |
| TTS (1.6B model) | MLX Python          | 8090      | Production-ready |
| Rust Bridge      | Candle (Metal/CUDA) | 8089/8090 | Production-ready |

**Key files:** `apps/kyutai-local/`, `services/kyutai-bridge/`, `src/speech/providers/kyutai-stt-adapter.ts`, `src/speech/tts-gateway/providers/kyutai-tts.ts`

### Higgs Audio V2 MLX (TTS Only)

Higher-throughput TTS on Apple Silicon with INT4 quantization.

```bash
# Python server
cd apps/mlx-higgs
pip install -r requirements.txt
python server.py    # WebSocket on port 8700, health on port 8701

# Rust server (alternative)
cd apps/rust-higgs-mlx
cargo run --release  # WebSocket on ws://localhost:8700/ws, health on :8700/health

# Enable in voice agent
TTS_PROVIDER=higgs-mlx HIGGS_MLX_URL=ws://localhost:8700 pnpm dev
```

| Metric     | Value                                 |
| ---------- | ------------------------------------- |
| Model      | Higgs Audio V2 (INT4)                 |
| Throughput | ~75 tok/s                             |
| RTF        | ~0.33x real-time                      |
| Output     | 24 kHz, 16-bit PCM                    |
| Protocol   | WebSocket (JSON control + binary PCM) |

**Key files:** `apps/mlx-higgs/`, `apps/rust-higgs-mlx/`, `src/speech/tts-gateway/providers/higgs-mlx.ts`

### Choosing a Self-Hosted TTS

| Feature        | Kyutai DSM             | Higgs MLX          | Cartesia (Cloud) |
| -------------- | ---------------------- | ------------------ | ---------------- |
| STT            | Yes (1B model)         | No                 | No (use Gemini)  |
| TTS            | Yes                    | Yes                | Yes              |
| Voice Cloning  | safetensors embeddings | Default voice only | 40+ voices       |
| Latency (TTFB) | ~250ms                 | ~200ms             | ~150ms           |
| Cost           | Free (self-hosted)     | Free (self-hosted) | ~$0.015/1K chars |
| Runtime        | MLX or Candle          | MLX                | Cloud API        |

Set `TTS_PROVIDER` to switch: `kyutai`, `higgs-mlx`, or `cartesia` (default).

---

## Architecture Notes

### Shared Code

- **Swift**: `apps/shared/` is a Swift Package used by both iOS and macOS apps
- **TypeScript**: Shared types in `src/types/` imported by web and CLI
- **Rust**: NAPI bindings expose Rust to Node.js backend

### Build Outputs

| App        | Output           | Deployment           |
| ---------- | ---------------- | -------------------- |
| `web/`     | `dist/`          | Firebase Hosting     |
| `website/` | `_site/`         | Firebase Hosting     |
| `cli/`     | npm package      | npm registry         |
| `async/`   | Docker           | Cloud Run            |
| `rust-*`   | `.node` binaries | Bundled with backend |

---

## Deployment

All deployments go through the Ferni CLI:

```bash
ferni deploy frontend    # apps/web → Firebase
ferni deploy landing     # apps/website/ferni-website → Firebase
ferni deploy all         # Everything
```

See root `CLAUDE.md` for full deployment documentation.

---

## Related Documentation

- Root `CLAUDE.md` - Project overview, deployment
- `src/CLAUDE.md` - Backend source code
- `design-system/CLAUDE.md` - Design tokens
- `docs/CLAUDE.md` - Architecture documentation

---

_Last updated: January 2026_
