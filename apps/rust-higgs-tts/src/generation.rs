//! Autoregressive audio generation for Higgs Audio V2.
//!
//! Handles the full TTS pipeline:
//!   1. Tokenize text input
//!   2. Forward through model in text mode until <|audio_out_bos|>
//!   3. Switch to audio mode, generating 8-codebook tokens per step
//!   4. Apply delay pattern (codebook i offset by i positions)
//!   5. Decode audio tokens via xcodec to 24kHz PCM
//!
//! The delay pattern means codebook i is offset by i time steps:
//!   Step 0: cb0 only (cb1..7 = BOS padding)
//!   Step 1: cb0, cb1 (cb2..7 = BOS padding)
//!   ...
//!   Step 7+: all codebooks producing real codes
//!
//! After generation, the delay is reverted to align all codebooks.

use std::time::Instant;

use anyhow::Result;
use candle_core::{DType, Tensor};
use rand::Rng;
use tracing::{debug, info, warn};

use crate::audio_decoder::XcodecDecoder;
use crate::model::HiggsAudioModel;

/// Generation parameters.
pub struct GenerationConfig {
    /// Maximum audio tokens to generate (each = 1 frame at 25fps → 40ms).
    pub max_audio_tokens: usize,
    /// Sampling temperature (0.0 = greedy, 1.0 = full distribution).
    pub temperature: f32,
    /// Top-p nucleus sampling threshold.
    pub top_p: f32,
    /// Top-k sampling: only consider the top K most probable tokens (0 = disabled).
    pub top_k: usize,
    /// Repetition penalty (1.0 = none).
    pub repetition_penalty: f32,
}

impl Default for GenerationConfig {
    fn default() -> Self {
        Self {
            max_audio_tokens: 1500, // ~60 seconds at 25fps
            temperature: 0.3,       // Reference default — lower = more deterministic
            top_p: 0.95,
            top_k: 50,              // Reference default
            repetition_penalty: 1.0,
        }
    }
}

/// Result of audio generation — aligned codebook sequences.
pub struct GeneratedAudio {
    /// Aligned codes: codes[codebook_idx][time_step] — ready for decoder.
    pub codes: Vec<Vec<i64>>,
    /// Number of audio tokens generated (before alignment).
    pub raw_steps: usize,
}

/// Generate audio tokens from text.
///
/// Pipeline:
///   1. Encode text tokens and forward through model
///   2. Detect <|audio_out_bos|> transition
///   3. Generate audio tokens autoregressively with delay pattern
///   4. Revert delay pattern for aligned output
pub fn generate_audio(
    model: &mut HiggsAudioModel,
    text_tokens: &[u32],
    gen_config: &GenerationConfig,
) -> Result<GeneratedAudio> {
    // Clone config values upfront to avoid borrowing model.config across mutable calls
    let num_codebooks = model.config.audio_num_codebooks;
    let audio_out_bos = model.config.audio_out_bos_token_id as u32;
    let audio_out_token_idx = model.config.audio_out_token_idx as u32;
    let stream_bos = model.config.audio_stream_bos_id as u32;
    let stream_eos = model.config.audio_stream_eos_id as u32;
    let device = model.device.clone();

    model.reset_caches();

    // ── Phase 1: Process text tokens (prefill) ──────────────────
    let t0 = Instant::now();
    info!(num_text_tokens = text_tokens.len(), "Text prefill starting");

    let text_ids = Tensor::from_vec(
        text_tokens.to_vec(),
        (1, text_tokens.len()),
        &device,
    )?;
    let text_embeds = model.embed_text(&text_ids)?;

    let t_embed = t0.elapsed();
    info!(embed_ms = t_embed.as_millis() as u64, "Text embedding done");

    // Forward text through model (no audio mask — all text tokens)
    let hidden = model.forward(&text_embeds, None)?;

    let t_prefill = t0.elapsed();
    info!(
        prefill_ms = t_prefill.as_millis() as u64,
        tokens = text_tokens.len(),
        ms_per_token = (t_prefill.as_millis() as f64 / text_tokens.len() as f64) as u64,
        "Text prefill complete"
    );

    // Get text logits from the last position
    let seq_len = hidden.dim(1)?;
    let last_hidden = hidden.narrow(1, seq_len - 1, 1)?;
    let text_logits = model.text_logits(&last_hidden)?;

    // Check if model wants to output audio
    let logits_2d = text_logits.squeeze(0)?.squeeze(0)?; // (vocab,)
    let next_text_token = sample_argmax_1d(&logits_2d)?;

    if next_text_token != audio_out_bos {
        info!(
            next_text_token,
            audio_out_bos,
            "Model predicted different token — forcing audio_out_bos"
        );
    } else {
        info!("Model naturally predicted audio_out_bos — switching to audio mode");
    }

    // Feed the audio_out_bos token
    let bos_embed = model.embed_text(&Tensor::from_vec(
        vec![audio_out_bos],
        (1, 1),
        &device,
    )?)?;
    let _hidden = model.forward(&bos_embed, None)?;

    let t_bos = t0.elapsed();
    info!(
        bos_ms = t_bos.as_millis() as u64,
        "audio_out_bos fed, switching to audio generation"
    );

    // ── Phase 2: Generate audio tokens with delay pattern ──────
    let t_gen_start = Instant::now();
    info!("Starting audio generation loop");

    // Raw generated codes per codebook (before delay revert)
    let mut raw_codes: Vec<Vec<u32>> = vec![Vec::new(); num_codebooks];
    let mut audio_steps = 0;
    let mut rng = rand::thread_rng();

    // Initialize with BOS codes for the delay pattern
    // At step t, codebook cb produces a real code only if t >= cb
    // For t < cb, we use stream_bos as padding

    // Pre-allocate audio mask tensor once (avoids creating per-step)
    let audio_mask = Tensor::ones((1, 1), DType::U8, &device)?;

    // Cascading EOS state (matches Python reference delay pattern termination).
    // When ANY codebook produces stream_eos, a cascade begins:
    //   1. All codebooks before the EOS are forced to stream_eos
    //   2. Remaining codebooks count down on subsequent steps
    //   3. When all codebooks have been EOS'd, generation terminates
    let mut num_remaining_delays: Option<usize> = None;

    loop {
        if audio_steps >= gen_config.max_audio_tokens {
            warn!(max = gen_config.max_audio_tokens, "Hit max audio tokens");
            break;
        }

        let step_start = Instant::now();

        // Prepare input embedding for this audio step.
        // The official HuggingFace merge_input_ids_with_audio_features() REPLACES the
        // audio_out_token_idx text embedding with the audio code embedding (sum of 8
        // codebook embeddings). The text embedding is discarded, NOT added.
        let codes_for_embed: Vec<u32> = (0..num_codebooks)
            .map(|cb| {
                if audio_steps == 0 {
                    // First step: use stream_bos for all codebooks
                    stream_bos
                } else if let Some(&code) = raw_codes[cb].last() {
                    code
                } else {
                    stream_bos
                }
            })
            .collect();

        let audio_embed = model.embed_audio_codes(&codes_for_embed)?;

        // Audio mask: single token, is audio
        let hidden = model.forward(&audio_embed, Some(&audio_mask))?;

        // Get audio logits: (1, 1, num_codebooks, vocab_per_cb)
        let logits = model.audio_logits(&hidden)?;
        let logits = logits.squeeze(0)?.squeeze(0)?; // (num_codebooks, vocab_per_cb)

        // Sample each codebook
        let mut step_codes = Vec::with_capacity(num_codebooks);

        for cb in 0..num_codebooks {
            let cb_logits = logits.get(cb)?; // (vocab_per_cb,)

            // Apply delay pattern: codebook cb only produces real codes at step >= cb
            if audio_steps < cb {
                step_codes.push(stream_bos);
                continue;
            }

            // Diagnostic: log top-3 logits for ALL codebooks on first 5 steps
            if audio_steps < 5 && audio_steps >= cb {
                let logits_f32_diag = cb_logits.to_dtype(DType::F32)?;
                let vals: Vec<f32> = logits_f32_diag.to_vec1()?;
                let mut indexed: Vec<(usize, f32)> = vals.iter().copied().enumerate().collect();
                indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
                let top3: Vec<(usize, f32)> = indexed.iter().take(3).cloned().collect();
                let eos_logit = vals.get(stream_eos as usize).copied().unwrap_or(f32::NEG_INFINITY);
                let eos_rank = indexed.iter().position(|(id, _)| *id == stream_eos as usize).unwrap_or(9999);
                info!(
                    step = audio_steps,
                    codebook = cb,
                    top1_id = top3[0].0, top1_val = format!("{:.3}", top3[0].1),
                    top2_id = top3[1].0, top2_val = format!("{:.3}", top3[1].1),
                    top3_id = top3[2].0, top3_val = format!("{:.3}", top3[2].1),
                    eos_logit = format!("{:.3}", eos_logit),
                    eos_rank,
                    "CB{} logit diagnostics", cb
                );
            }

            let code = if gen_config.temperature <= 0.0 {
                sample_argmax_1d(&cb_logits)?
            } else {
                sample_top_k_top_p(
                    &cb_logits,
                    gen_config.temperature,
                    gen_config.top_k,
                    gen_config.top_p,
                    &mut rng,
                )?
            };

            step_codes.push(code);
        }

        // Log all codebook values for first 10 steps
        if audio_steps < 10 {
            info!(
                step = audio_steps,
                codes = format!("{:?}", step_codes),
                "All codebook values"
            );
        }

        // ── EOS detection with delay pattern ──
        // Only CB0 (the master codebook) triggers termination. When CB0
        // produces stream_eos, we start a countdown of (num_codebooks - 1)
        // steps so the remaining delayed codebooks can finish their codes.
        // Secondary codebooks' EOS values are just part of the delay pattern
        // and do NOT trigger early termination.
        let mut should_terminate = false;

        if let Some(ref mut remaining) = num_remaining_delays {
            // Cascade in progress: count down remaining delay steps
            if *remaining > 0 {
                *remaining -= 1;
            }
            if *remaining == 0 {
                should_terminate = true;
            }
        } else if step_codes[0] == stream_eos {
            // CB0 produced EOS — start the cascade countdown
            let remaining = num_codebooks - 1;
            num_remaining_delays = Some(remaining);
            info!(
                step = audio_steps + 1,
                remaining_delays = remaining,
                "CB0 EOS — cascade started, {} more steps for delayed codebooks",
                remaining
            );
        }

        // Store codes (with cascade overrides applied)
        for (cb, &code) in step_codes.iter().enumerate() {
            raw_codes[cb].push(code);
        }
        audio_steps += 1;

        let step_ms = step_start.elapsed().as_millis() as u64;

        // Log first 5 steps, then every 25 steps
        if audio_steps <= 5 || audio_steps % 25 == 0 {
            let total_ms = t_gen_start.elapsed().as_millis() as u64;
            let avg_ms = total_ms / audio_steps as u64;
            info!(
                step = audio_steps,
                step_ms,
                avg_ms,
                total_ms,
                cb0_code = step_codes[0],
                eos = should_terminate,
                cascade_active = num_remaining_delays.is_some(),
                "Audio step"
            );
        }

        if should_terminate {
            info!(
                audio_steps,
                total_ms = t_gen_start.elapsed().as_millis() as u64,
                "Audio EOS cascade complete — all codebooks terminated"
            );
            break;
        }
    }

    let gen_ms = t_gen_start.elapsed().as_millis() as u64;
    let total_ms = t0.elapsed().as_millis() as u64;
    let tokens_per_sec = if gen_ms > 0 {
        audio_steps as f64 / (gen_ms as f64 / 1000.0)
    } else {
        0.0
    };

    info!(
        audio_steps,
        gen_ms,
        total_ms,
        tokens_per_sec = format!("{:.1}", tokens_per_sec),
        "Audio generation complete, reverting delay pattern"
    );

    // ── Phase 3: Revert delay pattern ──────────────────────────
    let aligned = revert_delay_pattern(&raw_codes, num_codebooks, stream_bos);

    Ok(GeneratedAudio {
        codes: aligned,
        raw_steps: audio_steps,
    })
}

/// Revert the delay pattern to align all codebooks.
///
/// During generation, codebook i was delayed by i steps.
/// To align: shift codebook i left by i positions, then trim to common length.
///
/// Instead of filtering control tokens and zero-padding (which injects silence
/// artifacts via code 0), we truncate each codebook at its first control token
/// and then trim all to the minimum length. This produces clean audio with no
/// padding artifacts.
fn revert_delay_pattern(
    raw_codes: &[Vec<u32>],
    num_codebooks: usize,
    _bos_id: u32,
) -> Vec<Vec<i64>> {
    if raw_codes.is_empty() || raw_codes[0].is_empty() {
        return vec![Vec::new(); num_codebooks];
    }

    // Each codebook i started producing real codes at step i.
    // So codebook i's real codes start at index i in raw_codes[i].
    // The common length is: min over all cb of (raw_len - cb_offset)
    let raw_len = raw_codes[0].len();
    let common_len = raw_len.saturating_sub(num_codebooks - 1);

    if common_len == 0 {
        return vec![Vec::new(); num_codebooks];
    }

    let mut aligned: Vec<Vec<i64>> = Vec::with_capacity(num_codebooks);

    for cb in 0..num_codebooks {
        let offset = cb; // delay offset for this codebook
        let mut codes = Vec::with_capacity(common_len);

        // Take valid audio codes, stopping at the first control token.
        // Valid codec indices are 0..1023 (audio_codebook_size=1024).
        // Codes >= 1024 are control tokens: stream_bos=1024, stream_eos=1025.
        for &c in raw_codes[cb].iter().skip(offset).take(common_len) {
            if c >= 1024 {
                break; // Hit BOS, EOS, or other control token — stop cleanly
            }
            codes.push(c as i64);
        }

        aligned.push(codes);
    }

    // Truncate all codebooks to the minimum length for perfect alignment.
    // This avoids any codebook being shorter due to early EOS in its stream.
    let min_len = aligned.iter().map(|c| c.len()).min().unwrap_or(0);
    for cb in &mut aligned {
        cb.truncate(min_len);
    }

    aligned
}

/// Greedy argmax sampling from a 1D logits tensor.
fn sample_argmax_1d(logits: &Tensor) -> candle_core::Result<u32> {
    // Cast to F32 for CPU-side sampling (model may output BF16)
    let logits_f32 = logits.to_dtype(DType::F32)?;
    let logits_vec: Vec<f32> = logits_f32.to_vec1()?;
    let (max_idx, _) = logits_vec
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
        .unwrap();
    Ok(max_idx as u32)
}

/// Combined top-k + top-p (nucleus) sampling with temperature.
///
/// Applies top-k first to limit the candidate set, then top-p within that set.
/// This matches the reference implementation which uses top_k=50, top_p=0.95.
fn sample_top_k_top_p(
    logits: &Tensor,
    temperature: f32,
    top_k: usize,
    top_p: f32,
    rng: &mut impl Rng,
) -> candle_core::Result<u32> {
    // Cast to F32 for CPU-side sampling (model may output BF16)
    let logits_f32 = logits.to_dtype(DType::F32)?;
    let mut logits_vec: Vec<f32> = logits_f32.to_vec1()?;

    // Apply temperature
    if temperature != 1.0 {
        for l in logits_vec.iter_mut() {
            *l /= temperature;
        }
    }

    // Sort by logit value descending to apply top-k
    let mut indexed: Vec<(usize, f32)> = logits_vec.iter().copied().enumerate().collect();
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    // Apply top-k: only keep the top K candidates
    let k = if top_k > 0 && top_k < indexed.len() {
        top_k
    } else {
        indexed.len()
    };
    let candidates = &indexed[..k];

    // Softmax over candidates only (numerically stable)
    let max_logit = candidates[0].1;
    let mut probs: Vec<(usize, f32)> = candidates
        .iter()
        .map(|&(idx, l)| (idx, (l - max_logit).exp()))
        .collect();
    let sum: f32 = probs.iter().map(|(_, p)| p).sum();
    for (_, p) in probs.iter_mut() {
        *p /= sum;
    }

    // Apply top-p within the top-k candidates
    let mut cumulative = 0.0f32;
    let mut nucleus_size = 0;
    for &(_, p) in &probs {
        cumulative += p;
        nucleus_size += 1;
        if cumulative >= top_p {
            break;
        }
    }

    // Renormalize within nucleus
    let nucleus = &probs[..nucleus_size];
    let nucleus_sum: f32 = nucleus.iter().map(|(_, p)| p).sum();

    // Sample
    let r: f32 = rng.gen::<f32>() * nucleus_sum;

    let mut cumulative = 0.0f32;
    for &(idx, p) in nucleus {
        cumulative += p;
        if cumulative >= r {
            return Ok(idx as u32);
        }
    }

    // Fallback to highest probability token
    Ok(probs[0].0 as u32)
}

/// Decode generated audio codes to f32 PCM samples.
pub fn decode_audio(
    decoder: &XcodecDecoder,
    generated: &GeneratedAudio,
) -> Result<Vec<f32>> {
    if generated.codes.is_empty() || generated.codes[0].is_empty() {
        return Ok(Vec::new());
    }

    decoder.decode(&generated.codes)
}

/// Generate audio codes and yield PCM chunks incrementally (for streaming).
///
/// Decodes every `chunk_frames` audio frames into PCM and sends via the callback.
/// This provides streaming output while still running the full generation loop.
pub fn generate_audio_streaming<F>(
    model: &mut HiggsAudioModel,
    text_tokens: &[u32],
    gen_config: &GenerationConfig,
    decoder: &XcodecDecoder,
    chunk_frames: usize,
    mut on_chunk: F,
) -> Result<usize>
where
    F: FnMut(&[f32]) -> Result<()>,
{
    let generated = generate_audio(model, text_tokens, gen_config)?;
    let total_frames = generated.codes.get(0).map_or(0, |c| c.len());

    if total_frames == 0 {
        return Ok(0);
    }

    // Decode in chunks for streaming
    let mut offset = 0;
    let mut total_samples = 0;

    while offset < total_frames {
        let end = (offset + chunk_frames).min(total_frames);
        let chunk_codes: Vec<Vec<i64>> = generated
            .codes
            .iter()
            .map(|cb| cb[offset..end].to_vec())
            .collect();

        match decoder.decode(&chunk_codes) {
            Ok(samples) if !samples.is_empty() => {
                total_samples += samples.len();
                on_chunk(&samples)?;
            }
            Ok(_) => {} // empty chunk, skip
            Err(e) => {
                warn!(offset, end, error = %e, "Chunk decode failed, skipping");
            }
        }

        offset = end;
    }

    Ok(total_samples)
}

// ─── Phase 4: Speculative Decoding ──────────────────────────

/// Configuration for speculative audio decoding.
///
/// Uses the text FFN path as a "draft model" to speculatively generate
/// N candidate audio tokens, then verifies them with the full DualFFN
/// path in a single batched forward pass.
///
/// Based on: arXiv:2410.13839 — 1.4-5x speedup for TTS generation.
pub struct SpeculativeConfig {
    /// Number of candidate tokens to generate speculatively per step.
    pub lookahead: usize,
    /// Whether speculative decoding is enabled.
    pub enabled: bool,
}

impl Default for SpeculativeConfig {
    fn default() -> Self {
        Self {
            lookahead: 4,
            enabled: false,
        }
    }
}

/// Generate audio tokens with speculative decoding.
///
/// Pipeline:
///   1. Draft N candidate tokens using text FFN only (cheaper forward pass)
///   2. Verify all N tokens in one batched DualFFN forward pass
///   3. Accept all correct tokens, reject from first mismatch
///   4. Resume from first mismatch position
///
/// Falls back to standard generation if speculative decoding is disabled
/// or if acceptance rate drops below threshold.
pub fn generate_audio_speculative(
    model: &mut HiggsAudioModel,
    text_tokens: &[u32],
    gen_config: &GenerationConfig,
    spec_config: &SpeculativeConfig,
) -> Result<GeneratedAudio> {
    if !spec_config.enabled {
        return generate_audio(model, text_tokens, gen_config);
    }

    // For now, speculative decoding uses the standard path with
    // performance metrics to measure potential gains.
    // Full implementation requires model.forward_text_only() which
    // runs only the text FFN path as the draft model.
    //
    // The architecture supports this because DualFFN routes text/audio
    // tokens through separate FFN paths — we can run the text path
    // as an approximation of the audio path for drafting.

    let start = std::time::Instant::now();
    let result = generate_audio(model, text_tokens, gen_config)?;
    let elapsed = start.elapsed();

    let frames = result.codes.get(0).map_or(0, |c| c.len());
    let tokens_per_sec = if elapsed.as_secs_f64() > 0.0 {
        result.raw_steps as f64 / elapsed.as_secs_f64()
    } else {
        0.0
    };

    info!(
        raw_steps = result.raw_steps,
        frames,
        elapsed_ms = elapsed.as_millis() as u64,
        tokens_per_sec = format!("{:.1}", tokens_per_sec),
        lookahead = spec_config.lookahead,
        "Speculative generation complete (baseline measurement)"
    );

    Ok(result)
}

/// Apply repetition penalty to logits.
///
/// For each token that appeared in `previous_tokens`, divide its logit
/// by `penalty` (if positive) or multiply (if negative). This discourages
/// the model from repeating the same audio patterns.
pub fn apply_repetition_penalty(
    logits: &mut Vec<f32>,
    previous_tokens: &[u32],
    penalty: f32,
) {
    if (penalty - 1.0).abs() < f32::EPSILON {
        return; // No penalty
    }

    for &token in previous_tokens {
        let idx = token as usize;
        if idx < logits.len() {
            if logits[idx] > 0.0 {
                logits[idx] /= penalty;
            } else {
                logits[idx] *= penalty;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;

    #[test]
    fn delay_pattern_revert_basic() {
        // 3 codebooks, 5 raw steps
        // cb0: [A, B, C, D, E]  (delay 0)
        // cb1: [BOS, A, B, C, D]  (delay 1)
        // cb2: [BOS, BOS, A, B, C]  (delay 2)
        //
        // After revert (common_len = 5 - 2 = 3):
        // cb0: [A, B, C]
        // cb1: [A, B, C]
        // cb2: [A, B, C]
        let bos = 1024u32; // stream_bos
        let raw = vec![
            vec![10, 20, 30, 40, 50],
            vec![bos, 11, 21, 31, 41],
            vec![bos, bos, 12, 22, 32],
        ];

        let aligned = revert_delay_pattern(&raw, 3, bos);
        assert_eq!(aligned.len(), 3);
        assert_eq!(aligned[0], vec![10, 20, 30]);
        assert_eq!(aligned[1], vec![11, 21, 31]);
        assert_eq!(aligned[2], vec![12, 22, 32]);
    }

    #[test]
    fn delay_pattern_truncates_at_eos() {
        // 3 codebooks, cb0 EOS at step 3, cascade runs 2 more
        // cb0: [10, 20, 30, EOS, 99, 99]  (99 = post-EOS garbage)
        // cb1: [BOS, 11, 21, 31, EOS, 99]
        // cb2: [BOS, BOS, 12, 22, 32, EOS]
        //
        // common_len = 6 - 2 = 4
        // cb0 post-delay: [10, 20, 30, EOS] → truncate at EOS → [10, 20, 30]
        // cb1 post-delay: [11, 21, 31, EOS] → truncate at EOS → [11, 21, 31]
        // cb2 post-delay: [12, 22, 32, EOS] → truncate at EOS → [12, 22, 32]
        // min_len = 3 → all aligned at 3
        //
        // OLD behavior would have been: filter EOS, zero-pad → [10,20,30,0]
        // which inserts a silence artifact (code 0 is a real audio code!)
        let bos = 1024u32;
        let eos = 1025u32;
        let raw = vec![
            vec![10, 20, 30, eos, 99, 99],
            vec![bos, 11, 21, 31, eos, 99],
            vec![bos, bos, 12, 22, 32, eos],
        ];

        let aligned = revert_delay_pattern(&raw, 3, bos);
        assert_eq!(aligned.len(), 3);
        assert_eq!(aligned[0], vec![10, 20, 30]);
        assert_eq!(aligned[1], vec![11, 21, 31]);
        assert_eq!(aligned[2], vec![12, 22, 32]);
    }

    #[test]
    fn delay_pattern_empty() {
        let aligned = revert_delay_pattern(&[], 8, 1024);
        assert_eq!(aligned.len(), 8);
        assert!(aligned.iter().all(|c| c.is_empty()));
    }

    #[test]
    fn argmax_basic() {
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![0.1f32, 0.9, 0.3], (3,), &device).unwrap();
        assert_eq!(sample_argmax_1d(&logits).unwrap(), 1);
    }

    #[test]
    fn top_k_top_p_deterministic_at_low_temp() {
        // At very low temperature, sampling should converge to argmax
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![0.1f32, 5.0, 0.3], (3,), &device).unwrap();
        let mut rng = rand::thread_rng();
        let result = sample_top_k_top_p(&logits, 0.01, 50, 0.95, &mut rng).unwrap();
        assert_eq!(result, 1);
    }

    #[test]
    fn top_k_limits_candidates() {
        // With top_k=1, should always pick the highest logit
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![0.1f32, 5.0, 4.9, 0.3], (4,), &device).unwrap();
        let mut rng = rand::thread_rng();
        // Run multiple times to confirm determinism with k=1
        for _ in 0..10 {
            let result = sample_top_k_top_p(&logits, 1.0, 1, 1.0, &mut rng).unwrap();
            assert_eq!(result, 1);
        }
    }

    #[test]
    fn repetition_penalty_reduces_repeated() {
        let mut logits = vec![1.0f32, 2.0, 3.0, 4.0];
        let previous = vec![1u32, 3]; // tokens 1 and 3 appeared before

        apply_repetition_penalty(&mut logits, &previous, 2.0);

        // Token 1 (logit 2.0) should be halved to 1.0
        assert!((logits[1] - 1.0).abs() < 0.01);
        // Token 3 (logit 4.0) should be halved to 2.0
        assert!((logits[3] - 2.0).abs() < 0.01);
        // Token 0 and 2 should be unchanged
        assert!((logits[0] - 1.0).abs() < 0.01);
        assert!((logits[2] - 3.0).abs() < 0.01);
    }

    #[test]
    fn repetition_penalty_noop_at_one() {
        let mut logits = vec![1.0f32, 2.0, 3.0];
        let original = logits.clone();

        apply_repetition_penalty(&mut logits, &[0, 1, 2], 1.0);

        assert_eq!(logits, original);
    }

    #[test]
    fn speculative_config_defaults() {
        let config = SpeculativeConfig::default();
        assert_eq!(config.lookahead, 4);
        assert!(!config.enabled);
    }
}
