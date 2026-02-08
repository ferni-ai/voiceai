# Ferni Omni - Unified STT + Thinker + TTS

Single Rust stack: **transcribe** (Whisper) → **think** (Candle MoE) → **speak** (ferni-tts-core).

## Usage (Node.js / NAPI)

```javascript
const { OmniEngine, OmniConfig } = require('ferni-omni');

const config = {
  whisper_model_path: '/path/to/ggml-base.en.bin',
  thinker_model_path: '/path/to/thinker',
  thinker_tokenizer_path: '/path/to/tokenizer.json',
};
const engine = new OmniEngine(config);

const transcript = engine.transcribe(audioFloat32Array);
const response = engine.generate(transcript);
const audioOut = engine.speak(response);
```

## Phase 5: iOS On-Device

To run on iPhone/iPad (CPU + quantization; Candle Metal does not work on iOS yet):

1. **Quantize Thinker** to Q4_K (~5GB for 30B-A3B with 3B active params).
2. **Cross-compile** to iOS:
   ```bash
   rustup target add aarch64-apple-ios
   cd apps/rust-omni
   cargo build --release --target aarch64-apple-ios --no-default-features --features uniffi
   ```
3. **UniFFI Swift bindings**: add `uniffi` feature and `.udl` interface; then:
   ```bash
   uniffi-bindgen generate -o ../ios-native/Sources/UniFFI/
   ```
4. **Integrate** into `apps/ios-native`: link the static lib / xcframework and use generated Swift in `FerniOmniService.swift`.

See plan: `docs/.../rust_candle_full_stack_*.plan.md` (Phase 5).
