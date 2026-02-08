// Ferni Omni - On-device STT + Thinker + TTS (Rust/UniFFI)
//
// When rust-omni is built for aarch64-apple-ios with UniFFI and the generated
// Swift bindings are added to this target, replace the stub implementations
// with calls to the Rust OmniEngine (transcribe, generate, speak).
//
// Phase 5 steps (see apps/rust-omni/README.md):
// 1. Quantize Thinker to Q4_K (~5GB for 30B-A3B)
// 2. Cross-compile: cargo build --release --target aarch64-apple-ios
// 3. Generate Swift: uniffi-bindgen generate -o Sources/UniFFI/
// 4. Link the .xcframework or static lib in Xcode

import Foundation
import os

/// On-device Omni pipeline: transcribe (Whisper) → think (Candle Thinker) → speak (TTS).
/// Uses Rust rust-omni via UniFFI when built for iOS; stub until bindings are integrated.
@MainActor
final class FerniOmniService: ObservableObject {
    static let shared = FerniOmniService()

    @Published private(set) var isAvailable: Bool = false
    @Published private(set) var errorMessage: String?

    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "FerniOmniService")

    private init() {
        // Stub: real implementation will init Rust OmniEngine with model paths
        logger.info("FerniOmniService initialized (stub; add UniFFI bindings for on-device)")
    }

    /// Transcribe audio (Float32, 16 kHz mono) to text via Whisper.
    /// Stub: returns empty until rust-omni UniFFI bindings are linked.
    func transcribe(audioSamples: [Float]) async throws -> String {
        logger.debug("transcribe (stub) samples=\(audioSamples.count)")
        // When UniFFI bindings are added: call Rust OmniEngine.transcribe
        return ""
    }

    /// Generate text from prompt via Candle Thinker (MoE).
    /// Stub: returns prompt until rust-omni UniFFI bindings are linked.
    func generate(prompt: String) async throws -> String {
        logger.debug("generate (stub) prompt=\(prompt.prefix(50))...")
        // When UniFFI bindings are added: call Rust OmniEngine.generate
        return prompt
    }

    /// Synthesize text to speech (Float32 samples, 24 kHz).
    /// Stub: returns empty array until rust-omni UniFFI bindings are linked.
    func speak(text: String) async throws -> [Float] {
        logger.debug("speak (stub) text=\(text.prefix(50))...")
        // When UniFFI bindings are added: call Rust OmniEngine.speak
        return []
    }
}
