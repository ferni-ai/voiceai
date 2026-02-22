//! Parakeet TDT STT Engine — NVIDIA ASR via ONNX Runtime.
//!
//! Supports **Parakeet TDT 0.6B** (streaming + batch) or **Parakeet TDT 1.1B** (batch only).
//!
//! - **Batch** via `ParakeetTDT`: Full-utterance transcription with word-level timestamps.
//!   Use 0.6B (25 languages) or 1.1B (English, better accuracy). Same ONNX layout (encoder-model.onnx, decoder_joint-model.onnx, vocab.txt).
//! - **Streaming** via `ParakeetEOU` (optional): Only available with 0.6B; pass `eou_model_dir`.
//!   For 1.1B (TDT-only), leave `eou_model_dir` unset; `process_chunk` returns None, `transcribe`/`finalize` use TDT.
//!
//! GPU acceleration (CUDA/Metal) when available.

use anyhow::Result;

#[cfg(feature = "parakeet")]
use tracing::{debug, info, warn};
#[cfg(feature = "parakeet")]
use parakeet_rs::{ParakeetEOU, ParakeetTDT, TimestampMode, Transcriber};

/// A word with timing information from TDT's native timestamp prediction.
#[derive(Debug, Clone)]
pub struct TimedWord {
    pub word: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

/// Partial transcript emitted during streaming inference.
#[derive(Debug, Clone)]
pub struct PartialTranscript {
    /// The current best transcript hypothesis.
    pub text: String,
    /// Whether the model detected end-of-utterance.
    pub is_eou: bool,
}

/// Final verified transcript with word-level timestamps.
#[derive(Debug, Clone)]
pub struct FinalTranscript {
    pub text: String,
    pub words: Vec<TimedWord>,
    pub duration_ms: u64,
}

/// Parakeet STT engine: batch (TDT) always; streaming (EOU) optional.
///
/// - **TDT + EOU** (0.6B): pass `eou_model_dir` for streaming partials + batch finalize.
/// - **TDT only** (1.1B or 0.6B): pass `eou_model_dir: None`; only batch `transcribe`/`finalize` (no streaming partials).
#[cfg(feature = "parakeet")]
pub struct ParakeetSttEngine {
    /// Batch model (TDT 0.6B or 1.1B) for transcription and word timestamps.
    batch: ParakeetTDT,
    /// Optional streaming model (EOU); only 0.6B has EOU. None = TDT-only mode (e.g. 1.1B).
    streaming: Option<ParakeetEOU>,
}

#[cfg(feature = "parakeet")]
impl ParakeetSttEngine {
    /// Load Parakeet TDT (required) and optionally EOU (streaming).
    ///
    /// # Arguments
    /// * `tdt_model_dir` - Directory with TDT ONNX (encoder-model.onnx, decoder_joint-model.onnx, vocab.txt). Use 0.6B or 1.1B.
    /// * `eou_model_dir` - If set, load EOU for streaming partials (0.6B only). If None, TDT-only (e.g. Parakeet 1.1B).
    pub fn new(tdt_model_dir: &str, eou_model_dir: Option<&str>) -> Result<Self> {
        info!(tdt_dir = %tdt_model_dir, "Loading Parakeet TDT model...");
        let batch = ParakeetTDT::from_pretrained(tdt_model_dir, None)
            .map_err(|e| anyhow::anyhow!("Failed to load Parakeet TDT: {}", e))?;
        info!("Parakeet TDT batch model loaded");

        let streaming = if let Some(eou_dir) = eou_model_dir {
            info!(eou_dir = %eou_dir, "Loading Parakeet EOU streaming model...");
            match ParakeetEOU::from_pretrained(eou_dir, None) {
                Ok(model) => {
                    info!("Parakeet EOU streaming model loaded");
                    Some(model)
                }
                Err(e) => {
                    warn!(error = %e, "EOU load failed, using TDT-only mode");
                    None
                }
            }
        } else {
            info!("No EOU dir — TDT-only mode (e.g. Parakeet 1.1B)");
            None
        };

        Ok(Self { batch, streaming })
    }

    /// Process a streaming audio chunk (160ms / 2560 samples at 16kHz).
    ///
    /// Returns a partial transcript only when EOU is loaded (0.6B). In TDT-only mode (e.g. 1.1B), returns None.
    pub fn process_chunk(&mut self, pcm_16k: &[f32]) -> Result<Option<PartialTranscript>> {
        let Some(ref mut streaming) = self.streaming else {
            return Ok(None); // TDT-only: no streaming partials
        };
        let text = match streaming.transcribe(pcm_16k, false) {
            Ok(s) => s.trim().to_string(),
            Err(e) => {
                debug!(error = %e, "Streaming chunk produced no output");
                return Ok(None);
            }
        };
        if text.is_empty() {
            Ok(None)
        } else {
            Ok(Some(PartialTranscript {
                text,
                is_eou: false,
            }))
        }
    }

    /// Final batch transcription with word-level timestamps.
    ///
    /// Call this after EOU detection or VAD silence with the complete utterance audio.
    /// Returns a high-accuracy transcript with per-word timing from TDT's native
    /// duration prediction.
    pub fn finalize(&mut self, full_pcm_16k: &[f32]) -> Result<FinalTranscript> {
        let start = std::time::Instant::now();

        let result = self
            .batch
            .transcribe_samples(
                full_pcm_16k.to_vec(),
                16000,
                1,
                Some(TimestampMode::Words),
            )
            .map_err(|e| anyhow::anyhow!("Parakeet TDT transcription failed: {}", e))?;

        let words: Vec<TimedWord> = result.tokens.iter().map(|t| {
            TimedWord {
                word: t.text.clone(),
                start_ms: (t.start * 1000.0) as u64,
                end_ms: (t.end * 1000.0) as u64,
            }
        }).collect();

        let duration_ms = if full_pcm_16k.is_empty() {
            0
        } else {
            (full_pcm_16k.len() as f64 / 16000.0 * 1000.0) as u64
        };

        let latency_ms = start.elapsed().as_millis() as u64;
        debug!(
            text_len = result.text.len(),
            word_count = words.len(),
            duration_ms,
            latency_ms,
            "Parakeet TDT finalization complete"
        );

        Ok(FinalTranscript {
            text: result.text.trim().to_string(),
            words,
            duration_ms,
        })
    }

    /// Reset streaming state for a new utterance.
    pub fn reset_stream(&mut self) {
        // ParakeetEOU maintains internal cache state; creating a fresh instance
        // would require reloading. For now we rely on the model's internal reset.
        debug!("Streaming state reset requested");
    }

    /// Simple batch transcription (no streaming, no timestamps).
    /// Used as a drop-in replacement for the old Whisper `transcribe()`.
    pub fn transcribe(&mut self, pcm_16k: &[f32]) -> Result<String> {
        let result = self
            .batch
            .transcribe_samples(pcm_16k.to_vec(), 16000, 1, None)
            .map_err(|e| anyhow::anyhow!("Parakeet TDT transcription failed: {}", e))?;

        Ok(result.text.trim().to_string())
    }
}

/// Stub engine used when the parakeet feature is not enabled.
#[cfg(not(feature = "parakeet"))]
pub struct ParakeetSttEngine;

#[cfg(not(feature = "parakeet"))]
impl ParakeetSttEngine {
    pub fn new(_tdt_model_dir: &str, _eou_model_dir: Option<&str>) -> Result<Self> {
        anyhow::bail!("Parakeet STT requires the 'parakeet' feature flag")
    }

    pub fn process_chunk(&mut self, _pcm_16k: &[f32]) -> Result<Option<PartialTranscript>> {
        anyhow::bail!("Parakeet STT not available")
    }

    pub fn finalize(&mut self, _full_pcm_16k: &[f32]) -> Result<FinalTranscript> {
        anyhow::bail!("Parakeet STT not available")
    }

    pub fn reset_stream(&mut self) {}

    pub fn transcribe(&mut self, _pcm_16k: &[f32]) -> Result<String> {
        anyhow::bail!("Parakeet STT not available")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timed_word_creation() {
        let word = TimedWord {
            word: "hello".to_string(),
            start_ms: 100,
            end_ms: 500,
        };
        assert_eq!(word.word, "hello");
        assert_eq!(word.start_ms, 100);
        assert_eq!(word.end_ms, 500);
    }

    #[test]
    fn test_partial_transcript_creation() {
        let partial = PartialTranscript {
            text: "hello world".to_string(),
            is_eou: false,
        };
        assert!(!partial.is_eou);
        assert_eq!(partial.text, "hello world");
    }

    #[test]
    fn test_final_transcript_creation() {
        let final_t = FinalTranscript {
            text: "Hello world.".to_string(),
            words: vec![
                TimedWord { word: "Hello".into(), start_ms: 0, end_ms: 400 },
                TimedWord { word: "world.".into(), start_ms: 450, end_ms: 900 },
            ],
            duration_ms: 1000,
        };
        assert_eq!(final_t.words.len(), 2);
        assert_eq!(final_t.duration_ms, 1000);
    }
}
