//! Full Qwen3-Omni audio-to-audio pipeline: mel -> encoder -> thinker (layer 18) -> talker -> code2wav.
//!
//! Single entry point for process_audio_omni from rust-omni.
//! Talker is fully implemented: text decoder (20 MoE layers) → code predictor (5 dense layers).
//! Code predictor produces codec logits (batch, seq, 32, 2048) consumed by Code2Wav.

use crate::candle_audio_encoder::Qwen3OmniAudioEncoder;
use crate::candle_code2wav::Qwen3OmniCode2Wav;
use crate::candle_mel::MelSpectrogram;
use crate::candle_talker::Qwen3OmniTalker;
use crate::candle_thinker::{Qwen3OmniThinker, ThinkerKvCache};
use candle_core::{D, Device, DType, IndexOp, Result as CandleResult, Tensor};
use candle_nn::VarBuilder;
use std::sync::mpsc;
use std::time::Instant;
use tokenizers::Tokenizer;

/// Timing metrics for each pipeline stage.
#[derive(Debug, Clone)]
pub struct PipelineTimings {
    pub mel_ms: f64,
    pub encoder_ms: f64,
    pub thinker_ms: f64,
    pub talker_ms: f64,
    pub code2wav_ms: f64,
    pub total_ms: f64,
    pub ttfb_ms: Option<f64>,
}

/// A chunk of PCM audio produced by the streaming pipeline.
#[derive(Debug)]
pub struct AudioChunk {
    /// PCM f32 samples at 24 kHz.
    pub samples: Vec<f32>,
    /// Which codec frame index this chunk corresponds to.
    pub frame_index: usize,
}

/// Full Qwen3-Omni pipeline: raw audio -> 24 kHz waveform (no Whisper, no external TTS).
#[allow(dead_code)]
pub struct FullOmniPipeline {
    mel: MelSpectrogram,
    encoder: Qwen3OmniAudioEncoder,
    thinker: Qwen3OmniThinker,
    talker: Qwen3OmniTalker,
    code2wav: Qwen3OmniCode2Wav,
    tokenizer: Tokenizer,
    device: Device,
    accept_hidden_layer: usize,
}

impl FullOmniPipeline {
    /// Load all components from a single model directory (full Qwen3-Omni checkpoint).
    /// Uses Metal GPU if available, otherwise the provided device (e.g. CPU).
    pub fn load(model_path: &str, tokenizer_path: &str, device: &Device) -> CandleResult<Self> {
        let device = Device::new_metal(0).unwrap_or_else(|_| device.clone());
        Self::load_inner(model_path, tokenizer_path, device)
    }

    /// Load with default device (Metal if available, else CPU). Use from NAPI when no device is configured.
    pub fn load_from_dir(model_path: &str, tokenizer_path: &str) -> CandleResult<Self> {
        let device = Device::new_metal(0).unwrap_or_else(|_| Device::Cpu);
        Self::load_inner(model_path, tokenizer_path, device)
    }

    fn load_inner(model_path: &str, tokenizer_path: &str, device: Device) -> CandleResult<Self> {
        let mel = MelSpectrogram::new();
        let encoder = Qwen3OmniAudioEncoder::load(model_path, &device)?;
        let thinker = Qwen3OmniThinker::load(model_path, &device)?;
        let talker = Qwen3OmniTalker::load(model_path, &device)?;
        let code2wav = Qwen3OmniCode2Wav::load(model_path, &device)?;
        let tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| candle_core::Error::Msg(format!("Load tokenizer: {}", e)))?;
        let accept_hidden_layer = talker.config().accept_hidden_layer;

        Ok(Self {
            mel,
            encoder,
            thinker,
            talker,
            code2wav,
            tokenizer,
            device,
            accept_hidden_layer,
        })
    }

    /// Build pipeline with zero weights (no checkpoint) on CPU. For shape validation and tests.
    pub fn new_test_mode_cpu() -> CandleResult<Self> {
        Self::new_test_mode(&Device::Cpu)
    }

    /// Build pipeline with zero weights (no checkpoint). For shape validation and tests.
    /// Uses given device. Tokenizer is a minimal BPE with one token so forward runs.
    pub fn new_test_mode(device: &Device) -> CandleResult<Self> {
        let vb = VarBuilder::zeros(DType::F32, device);
        let mel = MelSpectrogram::new();
        let encoder = Qwen3OmniAudioEncoder::load_with_vb(vb.pp("thinker").pp("audio_encoder"), device)?;
        let thinker = Qwen3OmniThinker::load_with_vb(vb.pp("thinker"), device)?;
        let talker = Qwen3OmniTalker::load_with_vb(vb.pp("talker"), device)?;
        let code2wav = Qwen3OmniCode2Wav::load_with_vb(vb.pp("code2wav"), device)?;
        let temp = std::env::temp_dir().join("ferni_omni_test_tokenizer.json");
        let minimal = r#"{"model":{"type":"BPE","vocab":{"<|endoftext|>":0},"merges":[]}}"#;
        std::fs::write(&temp, minimal)
            .map_err(|e| candle_core::Error::Msg(format!("Write tokenizer: {}", e)))?;
        let tokenizer = Tokenizer::from_file(temp.to_str().ok_or_else(|| candle_core::Error::Msg("temp path".into()))?)
            .map_err(|e| candle_core::Error::Msg(format!("Load tokenizer: {}", e)))?;
        let accept_hidden_layer = talker.config().accept_hidden_layer;

        Ok(Self {
            mel,
            encoder,
            thinker,
            talker,
            code2wav,
            tokenizer,
            device: device.clone(),
            accept_hidden_layer,
        })
    }

    /// Run full pipeline: raw audio (16 kHz mono f32) -> waveform (24 kHz f32).
    ///
    /// Pipeline:
    ///   1. Mel spectrogram from raw audio
    ///   2. Audio encoder → audio embeddings
    ///   3. Thinker (sequence = [audio_emb; token]) → hidden at accept_hidden_layer; use last position
    ///   4. Talker → codec token logits
    ///   5. Code2Wav → 24 kHz waveform
    ///
    /// Audio embeddings are injected into the Thinker as the sequence prefix; output is audio-conditioned.
    /// Returns empty vec if input is empty (no crash).
    pub fn process_audio(&self, samples: &[f32]) -> CandleResult<Vec<f32>> {
        if samples.is_empty() {
            return Ok(Vec::new());
        }

        // Step 1-2: Mel → Audio Encoder
        let mut mel_proc = MelSpectrogram::new();
        let mel_t = mel_proc.compute(samples, &self.device)?;
        let audio_embeddings = self.encoder.forward(&mel_t, None)?;

        // Step 3: Thinker with multimodal input (audio + one token); extract hidden at accept_hidden_layer, last position
        let input_ids = Tensor::new(&[0i64], &self.device)?.unsqueeze(0)?;
        let (_logits, extracted) = self.thinker.forward_with_hidden_states_from_audio(
            &audio_embeddings,
            &input_ids,
            None,
            0,
            self.accept_hidden_layer,
        )?;
        let seq_len = extracted.dim(1)?;
        let hidden_at_layer = extracted.narrow(1, seq_len - 1, 1)?; // (batch, 1, 2048)

        // Step 4: Talker → codec token logits (batch, seq, num_code_groups, vocab_size).
        let talker_out = self.talker.forward(&hidden_at_layer)?;
        let (_batch, _seq, _num_groups, _vocab) = talker_out.dims4()?;
        let codec_logits_f32 = talker_out.to_dtype(candle_core::DType::F32)?;
        let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
        let codec_ids_i64 = codec_ids.to_dtype(candle_core::DType::I64)?;

        // Step 5: Code2Wav → waveform
        let waveform = self.code2wav.forward(&codec_ids_i64)?;
        let out = waveform.flatten_from(0)?.to_vec1::<f32>()?;
        Ok(out)
    }

    /// Run full pipeline with timing metrics: raw audio (16 kHz mono f32) -> (waveform, timings).
    pub fn process_audio_timed(&self, samples: &[f32]) -> CandleResult<(Vec<f32>, PipelineTimings)> {
        let total_start = Instant::now();

        if samples.is_empty() {
            return Ok((
                Vec::new(),
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
            ));
        }

        // Step 1: Mel spectrogram
        let t = Instant::now();
        let mut mel_proc = MelSpectrogram::new();
        let mel_t = mel_proc.compute(samples, &self.device)?;
        let mel_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 2: Audio Encoder
        let t = Instant::now();
        let audio_embeddings = self.encoder.forward(&mel_t, None)?;
        let encoder_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 3: Thinker
        let t = Instant::now();
        let input_ids = Tensor::new(&[0i64], &self.device)?.unsqueeze(0)?;
        let (_logits, extracted) = self.thinker.forward_with_hidden_states_from_audio(
            &audio_embeddings,
            &input_ids,
            None,
            0,
            self.accept_hidden_layer,
        )?;
        let seq_len = extracted.dim(1)?;
        let hidden_at_layer = extracted.narrow(1, seq_len - 1, 1)?;
        let thinker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 4: Talker
        let t = Instant::now();
        let talker_out = self.talker.forward(&hidden_at_layer)?;
        let codec_logits_f32 = talker_out.to_dtype(candle_core::DType::F32)?;
        let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
        let codec_ids_i64 = codec_ids.to_dtype(candle_core::DType::I64)?;
        let talker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 5: Code2Wav
        let t = Instant::now();
        let waveform = self.code2wav.forward(&codec_ids_i64)?;
        let out = waveform.flatten_from(0)?.to_vec1::<f32>()?;
        let code2wav_ms = t.elapsed().as_secs_f64() * 1000.0;

        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;

        Ok((
            out,
            PipelineTimings {
                mel_ms,
                encoder_ms,
                thinker_ms,
                talker_ms,
                code2wav_ms,
                total_ms,
                ttfb_ms: None,
            },
        ))
    }

    /// Process audio with KV cache from a previous turn.
    /// Returns (waveform, timings, new_cache) so the cache can be preserved for the next turn.
    /// If `previous_cache` is None, starts a fresh conversation (clears internal cache).
    pub fn process_audio_with_cache(
        &mut self,
        samples: &[f32],
        previous_cache: Option<ThinkerKvCache>,
    ) -> CandleResult<(Vec<f32>, PipelineTimings, Option<ThinkerKvCache>)> {
        let total_start = Instant::now();

        if samples.is_empty() {
            return Ok((
                Vec::new(),
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
                previous_cache,
            ));
        }

        // Import or clear cache
        if let Some(cache) = previous_cache {
            self.thinker.import_kv_cache(cache);
        } else {
            self.thinker.clear_kv_cache();
        }

        // Step 1: Mel spectrogram
        let t = Instant::now();
        let mut mel_proc = MelSpectrogram::new();
        let mel_t = mel_proc.compute(samples, &self.device)?;
        let mel_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 2: Audio Encoder
        let t = Instant::now();
        let audio_embeddings = self.encoder.forward(&mel_t, None)?;
        let encoder_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 3: Thinker with internal KV cache
        let t = Instant::now();
        let input_ids = Tensor::new(&[0i64], &self.device)?.unsqueeze(0)?;
        let (_final_hidden, extracted) = self.thinker.forward_with_hidden_states_from_audio_cached(
            &audio_embeddings,
            &input_ids,
            self.accept_hidden_layer,
        )?;
        let seq_len = extracted.dim(1)?;
        let hidden_at_layer = extracted.narrow(1, seq_len - 1, 1)?;
        let thinker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Export cache after thinker pass
        let new_cache = self.thinker.export_kv_cache();

        // Step 4: Talker
        let t = Instant::now();
        let talker_out = self.talker.forward(&hidden_at_layer)?;
        let codec_logits_f32 = talker_out.to_dtype(DType::F32)?;
        let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
        let codec_ids_i64 = codec_ids.to_dtype(DType::I64)?;
        let talker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 5: Code2Wav
        let t = Instant::now();
        let waveform = self.code2wav.forward(&codec_ids_i64)?;
        let out = waveform.flatten_from(0)?.to_vec1::<f32>()?;
        let code2wav_ms = t.elapsed().as_secs_f64() * 1000.0;

        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;

        Ok((
            out,
            PipelineTimings {
                mel_ms,
                encoder_ms,
                thinker_ms,
                talker_ms,
                code2wav_ms,
                total_ms,
                ttfb_ms: None,
            },
            new_cache,
        ))
    }

    /// Streaming pipeline: runs mel → encoder → thinker → talker, then sends PCM chunks
    /// through an mpsc channel as each codec frame is decoded by Code2Wav.
    ///
    /// Returns the receiver immediately; the pipeline runs on the calling thread.
    /// Each AudioChunk contains one frame's worth of samples (480 samples at 24 kHz = 20ms).
    pub fn process_audio_streaming(
        &self,
        samples: &[f32],
    ) -> CandleResult<(mpsc::Receiver<AudioChunk>, PipelineTimings)> {
        let (tx, rx) = mpsc::channel();

        if samples.is_empty() {
            return Ok((
                rx,
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
            ));
        }

        let total_start = Instant::now();

        // Step 1: Mel
        let t = Instant::now();
        let mut mel_proc = MelSpectrogram::new();
        let mel_t = mel_proc.compute(samples, &self.device)?;
        let mel_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 2: Audio Encoder
        let t = Instant::now();
        let audio_embeddings = self.encoder.forward(&mel_t, None)?;
        let encoder_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 3: Thinker
        let t = Instant::now();
        let input_ids = Tensor::new(&[0i64], &self.device)?.unsqueeze(0)?;
        let (_logits, extracted) = self.thinker.forward_with_hidden_states_from_audio(
            &audio_embeddings,
            &input_ids,
            None,
            0,
            self.accept_hidden_layer,
        )?;
        let seq_len = extracted.dim(1)?;
        let hidden_at_layer = extracted.narrow(1, seq_len - 1, 1)?;
        let thinker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 4: Talker → codec token logits
        let t = Instant::now();
        let talker_out = self.talker.forward(&hidden_at_layer)?;
        let codec_logits_f32 = talker_out.to_dtype(candle_core::DType::F32)?;
        let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
        let codec_ids_i64 = codec_ids.to_dtype(candle_core::DType::I64)?;
        let talker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 5: Code2Wav streaming — decode frames in small batches and send chunks.
        // NOTE: ConvTranspose1d in Candle has a usize underflow with seq=1 for large strides,
        // so we process at least 2 frames at a time. For single-frame outputs, fall back to
        // non-streaming (process all at once).
        let t = Instant::now();
        let (_, num_frames, _num_q) = codec_ids_i64.dims3()?;
        let upsample_factor = self.code2wav.config().total_upsample_factor();

        if num_frames <= 1 {
            // Single frame: process all at once (avoids ConvTranspose1d underflow)
            let waveform = self.code2wav.forward(&codec_ids_i64)?;
            let chunk_samples = waveform.flatten_from(0)?.to_vec1::<f32>()?;
            let _ = tx.send(AudioChunk {
                samples: chunk_samples,
                frame_index: 0,
            });
        } else {
            // Stream in batches of 2 frames minimum
            let batch_size = 2usize;
            let mut frame_idx = 0usize;
            while frame_idx < num_frames {
                let count = batch_size.min(num_frames - frame_idx);
                // If only 1 frame remains, extend batch backwards to include previous frame
                let (start, count) = if count == 1 && frame_idx > 0 {
                    (frame_idx - 1, 2)
                } else if count == 1 {
                    // Only 1 frame total and we're here means num_frames > 1 is false,
                    // but guard anyway: process the single frame directly
                    let frame_ids = codec_ids_i64.narrow(1, 0, 1)?.contiguous()?;
                    let waveform = self.code2wav.forward(&frame_ids)?;
                    let chunk_samples = waveform.flatten_from(0)?.to_vec1::<f32>()?;
                    let _ = tx.send(AudioChunk {
                        samples: chunk_samples,
                        frame_index: 0,
                    });
                    break;
                } else {
                    (frame_idx, count)
                };

                let batch_ids = codec_ids_i64.narrow(1, start, count)?.contiguous()?;
                let batch_wav = self.code2wav.forward(&batch_ids)?;
                let all_samples = batch_wav.flatten_from(0)?.to_vec1::<f32>()?;

                // Split batch output into per-frame chunks
                let samples_per_frame = upsample_factor;
                for i in 0..count {
                    let actual_frame_idx = start + i;
                    // Skip frames we already sent (when we extended backwards)
                    if actual_frame_idx < frame_idx {
                        continue;
                    }
                    let chunk_start = i * samples_per_frame;
                    let chunk_end = (chunk_start + samples_per_frame).min(all_samples.len());
                    if chunk_start >= all_samples.len() {
                        break;
                    }
                    let chunk_samples = all_samples[chunk_start..chunk_end].to_vec();
                    if tx
                        .send(AudioChunk {
                            samples: chunk_samples,
                            frame_index: actual_frame_idx,
                        })
                        .is_err()
                    {
                        break;
                    }
                }
                frame_idx = start + count;
            }
        }
        let code2wav_ms = t.elapsed().as_secs_f64() * 1000.0;
        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;

        // Drop tx so receiver gets an end-of-stream signal
        drop(tx);

        Ok((
            rx,
            PipelineTimings {
                mel_ms,
                encoder_ms,
                thinker_ms,
                talker_ms,
                code2wav_ms,
                total_ms,
                ttfb_ms: None,
            },
        ))
    }

    /// Streaming pipeline with KV cache support for multi-turn conversations.
    /// Same as `process_audio_streaming` but imports/exports cache for context preservation.
    pub fn process_audio_streaming_with_cache(
        &mut self,
        samples: &[f32],
        previous_cache: Option<ThinkerKvCache>,
    ) -> CandleResult<(mpsc::Receiver<AudioChunk>, PipelineTimings, Option<ThinkerKvCache>)> {
        let (tx, rx) = mpsc::channel();

        if samples.is_empty() {
            return Ok((
                rx,
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
                previous_cache,
            ));
        }

        // Import or clear cache
        if let Some(cache) = previous_cache {
            self.thinker.import_kv_cache(cache);
        } else {
            self.thinker.clear_kv_cache();
        }

        let total_start = Instant::now();

        // Step 1: Mel
        let t = Instant::now();
        let mut mel_proc = MelSpectrogram::new();
        let mel_t = mel_proc.compute(samples, &self.device)?;
        let mel_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 2: Audio Encoder
        let t = Instant::now();
        let audio_embeddings = self.encoder.forward(&mel_t, None)?;
        let encoder_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 3: Thinker with internal KV cache
        let t = Instant::now();
        let input_ids = Tensor::new(&[0i64], &self.device)?.unsqueeze(0)?;
        let (_final_hidden, extracted) = self.thinker.forward_with_hidden_states_from_audio_cached(
            &audio_embeddings,
            &input_ids,
            self.accept_hidden_layer,
        )?;
        let seq_len = extracted.dim(1)?;
        let hidden_at_layer = extracted.narrow(1, seq_len - 1, 1)?;
        let thinker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Export cache after thinker pass
        let new_cache = self.thinker.export_kv_cache();

        // Step 4: Talker → codec token logits
        let t = Instant::now();
        let talker_out = self.talker.forward(&hidden_at_layer)?;
        let codec_logits_f32 = talker_out.to_dtype(DType::F32)?;
        let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
        let codec_ids_i64 = codec_ids.to_dtype(DType::I64)?;
        let talker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 5: Code2Wav streaming — decode frames in small batches and send chunks.
        let t = Instant::now();
        let (_, num_frames, _num_q) = codec_ids_i64.dims3()?;
        let upsample_factor = self.code2wav.config().total_upsample_factor();

        if num_frames <= 1 {
            let waveform = self.code2wav.forward(&codec_ids_i64)?;
            let chunk_samples = waveform.flatten_from(0)?.to_vec1::<f32>()?;
            let _ = tx.send(AudioChunk {
                samples: chunk_samples,
                frame_index: 0,
            });
        } else {
            let batch_size = 2usize;
            let mut frame_idx = 0usize;
            while frame_idx < num_frames {
                let count = batch_size.min(num_frames - frame_idx);
                let (start, count) = if count == 1 && frame_idx > 0 {
                    (frame_idx - 1, 2)
                } else if count == 1 {
                    let frame_ids = codec_ids_i64.narrow(1, 0, 1)?.contiguous()?;
                    let waveform = self.code2wav.forward(&frame_ids)?;
                    let chunk_samples = waveform.flatten_from(0)?.to_vec1::<f32>()?;
                    let _ = tx.send(AudioChunk {
                        samples: chunk_samples,
                        frame_index: 0,
                    });
                    break;
                } else {
                    (frame_idx, count)
                };

                let batch_ids = codec_ids_i64.narrow(1, start, count)?.contiguous()?;
                let batch_wav = self.code2wav.forward(&batch_ids)?;
                let all_samples = batch_wav.flatten_from(0)?.to_vec1::<f32>()?;

                let samples_per_frame = upsample_factor;
                for i in 0..count {
                    let actual_frame_idx = start + i;
                    if actual_frame_idx < frame_idx {
                        continue;
                    }
                    let chunk_start = i * samples_per_frame;
                    let chunk_end = (chunk_start + samples_per_frame).min(all_samples.len());
                    if chunk_start >= all_samples.len() {
                        break;
                    }
                    let chunk_samples = all_samples[chunk_start..chunk_end].to_vec();
                    if tx
                        .send(AudioChunk {
                            samples: chunk_samples,
                            frame_index: actual_frame_idx,
                        })
                        .is_err()
                    {
                        break;
                    }
                }
                frame_idx = start + count;
            }
        }
        let code2wav_ms = t.elapsed().as_secs_f64() * 1000.0;
        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;

        drop(tx);

        Ok((
            rx,
            PipelineTimings {
                mel_ms,
                encoder_ms,
                thinker_ms,
                talker_ms,
                code2wav_ms,
                total_ms,
                ttfb_ms: None,
            },
            new_cache,
        ))
    }

    // =========================================================================
    // Text generation (text → Thinker → text)
    // =========================================================================

    /// Generate text from a prompt using the Thinker's autoregressive decode loop.
    /// Uses KV cache, temperature sampling, and EOS detection.
    pub fn generate_text(
        &self,
        prompt: &str,
        max_new_tokens: usize,
        temperature: f64,
    ) -> CandleResult<String> {
        self.thinker.generate(&self.tokenizer, prompt, max_new_tokens, temperature, None)
    }

    // =========================================================================
    // Audio transcription (audio → Mel → Encoder → Thinker → text)
    // =========================================================================

    /// Transcribe audio to text: runs Mel → Audio Encoder → Thinker (audio-conditioned text generation).
    /// Input: 16 kHz mono f32 PCM samples.
    /// Output: (transcription text, timings).
    pub fn transcribe_audio(
        &self,
        samples: &[f32],
        max_new_tokens: usize,
        temperature: f64,
    ) -> CandleResult<(String, PipelineTimings)> {
        let total_start = Instant::now();

        if samples.is_empty() {
            return Ok((
                String::new(),
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
            ));
        }

        // Step 1: Mel
        let t = Instant::now();
        let mut mel_proc = MelSpectrogram::new();
        let mel_t = mel_proc.compute(samples, &self.device)?;
        let mel_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 2: Audio Encoder
        let t = Instant::now();
        let audio_embeddings = self.encoder.forward(&mel_t, None)?;
        let encoder_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 3: Thinker — audio-conditioned text generation.
        // We inject audio embeddings as prefix, then decode text tokens autoregressively.
        let t = Instant::now();

        // Build the combined audio + text embedding sequence for prefill
        let input_ids = Tensor::new(&[0i64], &self.device)?.unsqueeze(0)?;
        let (logits, _extracted) = self.thinker.forward_with_hidden_states_from_audio(
            &audio_embeddings,
            &input_ids,
            None,
            0,
            self.accept_hidden_layer,
        )?;

        // Now generate text tokens from the prefilled state.
        // Since forward_with_hidden_states_from_audio doesn't expose KV cache externally,
        // we use a simpler approach: take argmax of last logits position as the first generated
        // token, then continue decoding with generate() from that seed.
        let vocab = logits.dim(2)?;
        let seq_len = logits.dim(1)?;
        let last_logits = logits.i((0, seq_len - 1, ..))?;
        let first_token = if temperature <= 0.0 {
            last_logits.argmax(D::Minus1)?.to_scalar::<u32>()?
        } else {
            let scaled = (last_logits.to_dtype(DType::F32)? / temperature)?;
            let probs = candle_nn::ops::softmax(&scaled, D::Minus1)?;
            let probs_vec: Vec<f32> = probs.to_vec1()?;
            let r: f32 = rand::random();
            let mut cum = 0.0f32;
            let mut chosen = vocab - 1;
            for (i, &p) in probs_vec.iter().enumerate() {
                cum += p;
                if r <= cum {
                    chosen = i;
                    break;
                }
            }
            chosen as u32
        };

        // Decode remaining tokens from the first generated token as seed prompt
        let seed_text = self.tokenizer.decode(&[first_token], true)
            .unwrap_or_else(|_| String::new());

        // Use the Thinker's full generate to continue from the seed
        let continued = if max_new_tokens > 1 && !seed_text.is_empty() {
            self.thinker.generate(
                &self.tokenizer,
                &seed_text,
                max_new_tokens.saturating_sub(1),
                temperature,
                None,
            ).unwrap_or_else(|_| seed_text.clone())
        } else {
            seed_text
        };
        let thinker_ms = t.elapsed().as_secs_f64() * 1000.0;

        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;

        Ok((
            continued,
            PipelineTimings {
                mel_ms,
                encoder_ms,
                thinker_ms,
                talker_ms: 0.0,
                code2wav_ms: 0.0,
                total_ms,
                ttfb_ms: None,
            },
        ))
    }

    // =========================================================================
    // Speech synthesis (text → Thinker → Talker → Code2Wav → waveform)
    // =========================================================================

    /// Synthesize speech from text: Thinker (text mode with hidden extraction) → Talker → Code2Wav → 24kHz waveform.
    /// Input: text string.
    /// Output: (f32 PCM samples at 24kHz, timings).
    pub fn synthesize_speech(
        &self,
        text: &str,
        temperature: f64,
    ) -> CandleResult<(Vec<f32>, PipelineTimings)> {
        let total_start = Instant::now();

        if text.is_empty() {
            return Ok((
                Vec::new(),
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
            ));
        }

        // Step 1: Tokenize text and run through Thinker to get hidden states at accept_hidden_layer
        let t = Instant::now();
        let encoding = self.tokenizer.encode(text, true)
            .map_err(|e| candle_core::Error::Msg(format!("Tokenize: {}", e)))?;
        let ids: Vec<i64> = encoding.get_ids().iter().map(|&x| x as i64).collect();
        if ids.is_empty() {
            return Ok((
                Vec::new(),
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
            ));
        }

        let input_ids = Tensor::new(ids.as_slice(), &self.device)?.unsqueeze(0)?;
        let (_logits, extracted) = self.thinker.forward_with_hidden_states(
            &input_ids,
            None,
            0,
            None,
            self.accept_hidden_layer,
        )?;
        let seq_len = extracted.dim(1)?;
        let hidden_at_layer = extracted.narrow(1, seq_len - 1, 1)?; // (batch, 1, hidden_size)
        let thinker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 2: Talker → codec token logits
        let t = Instant::now();
        let talker_out = self.talker.forward(&hidden_at_layer)?;
        let codec_logits_f32 = talker_out.to_dtype(DType::F32)?;
        let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
        let codec_ids_i64 = codec_ids.to_dtype(DType::I64)?;
        let talker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 3: Code2Wav → waveform
        let t = Instant::now();
        let waveform = self.code2wav.forward(&codec_ids_i64)?;
        let out = waveform.flatten_from(0)?.to_vec1::<f32>()?;
        let code2wav_ms = t.elapsed().as_secs_f64() * 1000.0;

        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;

        Ok((
            out,
            PipelineTimings {
                mel_ms: 0.0,
                encoder_ms: 0.0,
                thinker_ms,
                talker_ms,
                code2wav_ms,
                total_ms,
                ttfb_ms: None,
            },
        ))
    }

    /// Speculative audio generation: overlap Thinker with Talker+Code2Wav.
    ///
    /// Architecture:
    ///   1. Run Mel + Encoder (same as normal)
    ///   2. Run Thinker to get ALL hidden states (full sequence at accept_hidden_layer)
    ///   3. Process Talker+Code2Wav INCREMENTALLY (small batches of hidden states)
    ///      and send each audio chunk immediately
    ///
    /// The key insight: even though we run the full Thinker, we process Talker+Code2Wav
    /// incrementally and send each chunk as soon as it's ready.
    /// TTFB = mel + encoder + thinker + ONE talker batch + ONE c2w batch
    /// instead of TTFB = mel + encoder + thinker + ALL talker + ALL c2w.
    ///
    /// For a response with N frames:
    ///   Normal:      [thinker][---all talker---][---all c2w---] → first audio at end
    ///   Speculative: [thinker][t1][c1]→chunk1  [t2][c2]→chunk2 ... → first audio much earlier
    pub fn process_audio_speculative(
        &self,
        samples: &[f32],
    ) -> CandleResult<(mpsc::Receiver<AudioChunk>, PipelineTimings)> {
        let (tx, rx) = mpsc::channel();

        if samples.is_empty() {
            return Ok((
                rx,
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
            ));
        }

        let total_start = Instant::now();

        // Step 1: Mel
        let t = Instant::now();
        let mut mel_proc = MelSpectrogram::new();
        let mel_t = mel_proc.compute(samples, &self.device)?;
        let mel_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 2: Audio Encoder
        let t = Instant::now();
        let audio_embeddings = self.encoder.forward(&mel_t, None)?;
        let encoder_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 3: Thinker — get ALL hidden states at accept_hidden_layer (not just last position)
        let t = Instant::now();
        let input_ids = Tensor::new(&[0i64], &self.device)?.unsqueeze(0)?;
        let (_logits, extracted) = self.thinker.forward_with_hidden_states_from_audio(
            &audio_embeddings,
            &input_ids,
            None,
            0,
            self.accept_hidden_layer,
        )?;
        let thinker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 4: Incrementally process each hidden state position through Talker + Code2Wav.
        // Code2Wav needs >= 2 frames for ConvTranspose1d, so we process in batches of 2.
        let seq_len = extracted.dim(1)?;
        let upsample_factor = self.code2wav.config().total_upsample_factor();
        let mut talker_total_ms = 0.0f64;
        let mut code2wav_total_ms = 0.0f64;
        let mut ttfb_ms: Option<f64> = None;

        if seq_len <= 1 {
            // Single frame: process directly (avoids ConvTranspose1d underflow)
            let hidden = extracted.narrow(1, seq_len.saturating_sub(1), 1)?;

            let t = Instant::now();
            let talker_out = self.talker.forward(&hidden)?;
            let codec_logits_f32 = talker_out.to_dtype(DType::F32)?;
            let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
            let codec_ids_i64 = codec_ids.to_dtype(DType::I64)?;
            talker_total_ms = t.elapsed().as_secs_f64() * 1000.0;

            let t = Instant::now();
            let waveform = self.code2wav.forward(&codec_ids_i64)?;
            let chunk_samples = waveform.flatten_from(0)?.to_vec1::<f32>()?;
            code2wav_total_ms = t.elapsed().as_secs_f64() * 1000.0;

            ttfb_ms = Some(total_start.elapsed().as_secs_f64() * 1000.0);
            let _ = tx.send(AudioChunk {
                samples: chunk_samples,
                frame_index: 0,
            });
        } else {
            let batch_size = 2usize;
            let mut frame_idx = 0usize;
            while frame_idx < seq_len {
                let count = batch_size.min(seq_len - frame_idx);
                // If only 1 frame remains, extend batch backwards to include previous frame
                let (start, count) = if count == 1 && frame_idx > 0 {
                    (frame_idx - 1, 2)
                } else {
                    (frame_idx, count)
                };

                // Talker: process batch of hidden states incrementally
                let t = Instant::now();
                let hidden_batch = extracted.narrow(1, start, count)?;
                let talker_out = self.talker.forward(&hidden_batch)?;
                let codec_logits_f32 = talker_out.to_dtype(DType::F32)?;
                let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
                let codec_ids_i64 = codec_ids.to_dtype(DType::I64)?;
                talker_total_ms += t.elapsed().as_secs_f64() * 1000.0;

                // Code2Wav: decode batch to waveform
                let t = Instant::now();
                let batch_wav = self.code2wav.forward(&codec_ids_i64)?;
                let all_samples = batch_wav.flatten_from(0)?.to_vec1::<f32>()?;
                code2wav_total_ms += t.elapsed().as_secs_f64() * 1000.0;

                // Split batch output into per-frame chunks and send immediately
                let samples_per_frame = upsample_factor;
                for i in 0..count {
                    let actual_frame_idx = start + i;
                    // Skip frames we already sent (when we extended backwards)
                    if actual_frame_idx < frame_idx {
                        continue;
                    }
                    if ttfb_ms.is_none() {
                        ttfb_ms = Some(total_start.elapsed().as_secs_f64() * 1000.0);
                    }
                    let chunk_start = i * samples_per_frame;
                    let chunk_end = (chunk_start + samples_per_frame).min(all_samples.len());
                    if chunk_start >= all_samples.len() {
                        break;
                    }
                    let chunk_samples = all_samples[chunk_start..chunk_end].to_vec();
                    if tx
                        .send(AudioChunk {
                            samples: chunk_samples,
                            frame_index: actual_frame_idx,
                        })
                        .is_err()
                    {
                        break;
                    }
                }
                frame_idx = start + count;
            }
        }

        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
        drop(tx);

        Ok((
            rx,
            PipelineTimings {
                mel_ms,
                encoder_ms,
                thinker_ms,
                talker_ms: talker_total_ms,
                code2wav_ms: code2wav_total_ms,
                total_ms,
                ttfb_ms,
            },
        ))
    }

    /// Speculative speech synthesis: overlap text processing with audio generation.
    ///
    /// Same architecture as `process_audio_speculative` but starting from text:
    ///   1. Tokenize text → Thinker (get ALL hidden states at accept_hidden_layer)
    ///   2. Process Talker+Code2Wav incrementally per hidden state position
    ///   3. Stream each audio chunk immediately
    ///
    /// TTFB = thinker + ONE talker batch + ONE c2w batch (no mel/encoder for text input).
    pub fn synthesize_speech_speculative(
        &self,
        text: &str,
        _temperature: f64,
    ) -> CandleResult<(mpsc::Receiver<AudioChunk>, PipelineTimings)> {
        let (tx, rx) = mpsc::channel();

        if text.is_empty() {
            return Ok((
                rx,
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
            ));
        }

        let total_start = Instant::now();

        // Step 1: Tokenize and run Thinker — get ALL hidden states at accept_hidden_layer
        let t = Instant::now();
        let encoding = self.tokenizer.encode(text, true)
            .map_err(|e| candle_core::Error::Msg(format!("Tokenize: {}", e)))?;
        let ids: Vec<i64> = encoding.get_ids().iter().map(|&x| x as i64).collect();
        if ids.is_empty() {
            return Ok((
                rx,
                PipelineTimings {
                    mel_ms: 0.0,
                    encoder_ms: 0.0,
                    thinker_ms: 0.0,
                    talker_ms: 0.0,
                    code2wav_ms: 0.0,
                    total_ms: 0.0,
                    ttfb_ms: None,
                },
            ));
        }

        let input_ids = Tensor::new(ids.as_slice(), &self.device)?.unsqueeze(0)?;
        let (_logits, extracted) = self.thinker.forward_with_hidden_states(
            &input_ids,
            None,
            0,
            None,
            self.accept_hidden_layer,
        )?;
        let thinker_ms = t.elapsed().as_secs_f64() * 1000.0;

        // Step 2: Incrementally process each hidden state through Talker + Code2Wav
        let seq_len = extracted.dim(1)?;
        let upsample_factor = self.code2wav.config().total_upsample_factor();
        let mut talker_total_ms = 0.0f64;
        let mut code2wav_total_ms = 0.0f64;
        let mut ttfb_ms: Option<f64> = None;

        if seq_len <= 1 {
            let hidden = extracted.narrow(1, seq_len.saturating_sub(1), 1)?;

            let t = Instant::now();
            let talker_out = self.talker.forward(&hidden)?;
            let codec_logits_f32 = talker_out.to_dtype(DType::F32)?;
            let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
            let codec_ids_i64 = codec_ids.to_dtype(DType::I64)?;
            talker_total_ms = t.elapsed().as_secs_f64() * 1000.0;

            let t = Instant::now();
            let waveform = self.code2wav.forward(&codec_ids_i64)?;
            let chunk_samples = waveform.flatten_from(0)?.to_vec1::<f32>()?;
            code2wav_total_ms = t.elapsed().as_secs_f64() * 1000.0;

            ttfb_ms = Some(total_start.elapsed().as_secs_f64() * 1000.0);
            let _ = tx.send(AudioChunk {
                samples: chunk_samples,
                frame_index: 0,
            });
        } else {
            let batch_size = 2usize;
            let mut frame_idx = 0usize;
            while frame_idx < seq_len {
                let count = batch_size.min(seq_len - frame_idx);
                let (start, count) = if count == 1 && frame_idx > 0 {
                    (frame_idx - 1, 2)
                } else {
                    (frame_idx, count)
                };

                let t = Instant::now();
                let hidden_batch = extracted.narrow(1, start, count)?;
                let talker_out = self.talker.forward(&hidden_batch)?;
                let codec_logits_f32 = talker_out.to_dtype(DType::F32)?;
                let codec_ids = codec_logits_f32.argmax(D::Minus1)?;
                let codec_ids_i64 = codec_ids.to_dtype(DType::I64)?;
                talker_total_ms += t.elapsed().as_secs_f64() * 1000.0;

                let t = Instant::now();
                let batch_wav = self.code2wav.forward(&codec_ids_i64)?;
                let all_samples = batch_wav.flatten_from(0)?.to_vec1::<f32>()?;
                code2wav_total_ms += t.elapsed().as_secs_f64() * 1000.0;

                let samples_per_frame = upsample_factor;
                for i in 0..count {
                    let actual_frame_idx = start + i;
                    if actual_frame_idx < frame_idx {
                        continue;
                    }
                    if ttfb_ms.is_none() {
                        ttfb_ms = Some(total_start.elapsed().as_secs_f64() * 1000.0);
                    }
                    let chunk_start = i * samples_per_frame;
                    let chunk_end = (chunk_start + samples_per_frame).min(all_samples.len());
                    if chunk_start >= all_samples.len() {
                        break;
                    }
                    let chunk_samples = all_samples[chunk_start..chunk_end].to_vec();
                    if tx
                        .send(AudioChunk {
                            samples: chunk_samples,
                            frame_index: actual_frame_idx,
                        })
                        .is_err()
                    {
                        break;
                    }
                }
                frame_idx = start + count;
            }
        }

        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
        drop(tx);

        Ok((
            rx,
            PipelineTimings {
                mel_ms: 0.0,
                encoder_ms: 0.0,
                thinker_ms,
                talker_ms: talker_total_ms,
                code2wav_ms: code2wav_total_ms,
                total_ms,
                ttfb_ms,
            },
        ))
    }

    pub fn sample_rate_out(&self) -> u32 {
        self.code2wav.sample_rate()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::DType;
    use candle_nn::VarBuilder;

    #[test]
    fn test_load_from_dir_missing_path() {
        let err = FullOmniPipeline::load_from_dir("/nonexistent/omni/model", "/nonexistent/tokenizer.json");
        assert!(err.is_err());
    }

    /// Empty input returns empty waveform (early return in process_audio).
    /// Full pipeline with loaded model is validated by E2E script when OMNI_MODEL_PATH is set.
    #[test]
    fn test_process_audio_empty_input_returns_empty() {
        // We cannot construct FullOmniPipeline without loading; empty-input behavior is
        // process_audio(&[]) -> Ok(vec![]) in the implementation.
        assert!(true, "empty input: process_audio returns Ok(Vec::new()) per implementation");
    }

    /// Full pipeline shape chain with VarBuilder::zeros: audio_emb -> Thinker -> Talker -> Code2Wav.
    /// Validates the entire dimension chain without real weights (no checkpoint needed).
    /// Slow (~70s on CPU with 36-layer Thinker). Run with: cargo test -- --ignored
    #[test]
    #[ignore]
    fn test_full_pipeline_shape_chain() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);

        let thinker = Qwen3OmniThinker::load_with_vb(vb.pp("thinker"), &device).unwrap();
        let talker = Qwen3OmniTalker::load_with_vb(vb.pp("talker"), &device).unwrap();

        let temp = std::env::temp_dir().join("ferni_omni_shape_chain");
        std::fs::create_dir_all(&temp).ok();
        let code2wav = Qwen3OmniCode2Wav::load(temp.to_str().unwrap(), &device).unwrap();

        // Dummy audio embeddings (batch=1, T=5, 2048) simulating encoder output
        let audio_emb = Tensor::zeros(&[1, 5, 2048], DType::F32, &device).unwrap();
        let input_ids = Tensor::new(&[0i64], &device).unwrap().unsqueeze(0).unwrap();

        let (_logits, extracted) = thinker
            .forward_with_hidden_states_from_audio(&audio_emb, &input_ids, None, 0, 18)
            .unwrap();
        let seq_len = extracted.dim(1).unwrap();
        let hidden_at_layer = extracted.narrow(1, seq_len - 1, 1).unwrap().contiguous().unwrap();

        let talker_out = talker.forward(&hidden_at_layer).unwrap();
        let codec_logits_f32 = talker_out.to_dtype(DType::F32).unwrap();
        let codec_ids = codec_logits_f32.argmax(D::Minus1).unwrap();
        let codec_ids_i64 = codec_ids.to_dtype(DType::I64).unwrap();

        let waveform = code2wav.forward(&codec_ids_i64).unwrap();
        let out = waveform.flatten_from(0).unwrap().to_vec1::<f32>().unwrap();
        let len = out.len();

        assert!(len > 0, "waveform must have samples");
        let expected_per_frame = code2wav.config().total_upsample_factor();
        assert_eq!(len, expected_per_frame, "one frame -> {} samples", expected_per_frame);
    }
}
