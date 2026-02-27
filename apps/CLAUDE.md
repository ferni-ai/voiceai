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

### Voice Pipeline (Sonata)

| App        | CLAUDE.md | Purpose                                                                |
| ---------- | --------- | ---------------------------------------------------------------------- |
| `sonata/`  | —         | Sonata NAPI bindings for pocket-voice STT/TTS on Apple Silicon & Linux |

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

## Sonata Voice Pipeline

All STT and TTS goes through the **Sonata** NAPI addon (`apps/sonata/`), which wraps the pocket-voice Rust libraries for both speech-to-text and text-to-speech.

### Architecture

```
apps/sonata/
├── pocket-voice/           # Git submodule (Kyutai DSM 1.6B model)
│   └── src/
│       ├── stt/            # pocket_stt cdylib (Moshi STT)
│       └── tts/            # pocket_tts_rs cdylib (Moshi TTS)
├── src/
│   ├── lib.rs              # NAPI bindings entry
│   ├── napi_bindings.rs    # Node.js-facing API
│   ├── stt.rs              # STT FFI wrapper
│   ├── tts.rs              # TTS FFI wrapper
│   └── ffi.rs              # C FFI declarations
├── Cargo.toml              # NAPI crate config
└── package.json            # @ferni/sonata npm package
```

### Build

```bash
# Local (Apple Silicon — Metal GPU)
cd apps/sonata
pnpm build              # Builds pocket-voice + NAPI module

# Docker/Linux — skip Metal GPU features
cargo build --release --no-default-features  # For pocket-voice crates
```

### Key Files

| File                                             | Purpose                          |
| ------------------------------------------------ | -------------------------------- |
| `apps/sonata/`                                   | NAPI addon crate                 |
| `src/speech/tts-gateway/providers/sonata.ts`     | TypeScript TTS provider          |
| `src/speech/tts-gateway/providers/index.ts`      | Provider factory (Sonata only)   |
| `src/speech/providers/sonata-stt.ts`             | TypeScript STT provider          |

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
