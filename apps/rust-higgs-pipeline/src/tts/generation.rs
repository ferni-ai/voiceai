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
use tracing::{info, warn};

use crate::tts::decoder::XcodecDecoder;
use crate::tts::model::HiggsAudioModel;

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
    /// Steps per streaming chunk (e.g., 25 ≈ 1s of audio at 25fps token rate).
    pub chunk_size: usize,
}

impl Default for GenerationConfig {
    fn default() -> Self {
        Self {
            max_audio_tokens: 1500, // ~60 seconds at 25fps
            temperature: 0.3,       // Reference default — lower = more deterministic
            top_p: 0.95,
            top_k: 50,              // Reference default
            repetition_penalty: 1.0,
            chunk_size: 25,         // ~1s of audio at 25fps token rate
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

/// A chunk of streaming audio data sent through a channel during generation.
pub enum StreamChunk {
    /// A chunk of decoded PCM audio samples (f32, 24kHz mono).
    Audio(Vec<f32>),
    /// Generation is complete.
    Done { total_steps: usize },
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
    let _audio_out_token_idx = model.config.audio_out_token_idx as u32;
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
                indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
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

/// State returned from the shared prefill phase.
struct PrefillState {
    num_codebooks: usize,
    stream_bos: u32,
    stream_eos: u32,
    device: candle_core::Device,
    /// Number of tokens added to the KV cache during prefill
    /// (text_tokens + 1 BOS token).
    prefill_kv_tokens: usize,
}

/// Shared prefill logic for persistent and streaming generation.
///
/// Processes text tokens, feeds audio_out_bos, and returns model
/// state ready for the audio generation loop.
fn prefill_model(
    model: &mut HiggsAudioModel,
    text_tokens: &[u32],
    kv_cache_tokens: usize,
    max_context_tokens: usize,
    label: &str,
) -> Result<PrefillState> {
    // Only reset if cache overflows
    if kv_cache_tokens > max_context_tokens {
        info!(
            "KV cache overflow ({} > {}), resetting",
            kv_cache_tokens, max_context_tokens
        );
        model.reset_caches();
    }

    let num_codebooks = model.config.audio_num_codebooks;
    let audio_out_bos = model.config.audio_out_bos_token_id as u32;
    let stream_bos = model.config.audio_stream_bos_id as u32;
    let stream_eos = model.config.audio_stream_eos_id as u32;
    let device = model.device.clone();

    let t0 = Instant::now();
    info!(num_text_tokens = text_tokens.len(), "Text prefill starting ({})", label);

    // Embed and forward text tokens (adds text_tokens.len() to KV cache)
    let text_ids = Tensor::from_vec(
        text_tokens.to_vec(),
        (1, text_tokens.len()),
        &device,
    )?;
    let text_embeds = model.embed_text(&text_ids)?;
    let hidden = model.forward(&text_embeds, None)?;

    let t_prefill = t0.elapsed();
    info!(
        prefill_ms = t_prefill.as_millis() as u64,
        tokens = text_tokens.len(),
        "Text prefill complete"
    );

    // Get text logits from the last position
    let seq_len = hidden.dim(1)?;
    let last_hidden = hidden.narrow(1, seq_len - 1, 1)?;
    let text_logits = model.text_logits(&last_hidden)?;

    let logits_2d = text_logits.squeeze(0)?.squeeze(0)?;
    let next_text_token = sample_argmax_1d(&logits_2d)?;

    if next_text_token != audio_out_bos {
        info!(
            next_text_token,
            audio_out_bos,
            "Model predicted different token — forcing audio_out_bos ({})", label
        );
    } else {
        info!("Model naturally predicted audio_out_bos — switching to audio mode");
    }

    // Feed the audio_out_bos token (adds 1 to KV cache)
    let bos_embed = model.embed_text(&Tensor::from_vec(
        vec![audio_out_bos],
        (1, 1),
        &device,
    )?)?;
    let _hidden = model.forward(&bos_embed, None)?;

    info!(
        bos_ms = t0.elapsed().as_millis() as u64,
        "audio_out_bos fed, switching to audio generation ({})", label
    );

    Ok(PrefillState {
        num_codebooks,
        stream_bos,
        stream_eos,
        device,
        prefill_kv_tokens: text_tokens.len() + 1,
    })
}

/// Generate audio tokens WITH persistent KV cache (the core innovation).
/// Unlike generate_audio(), this does NOT reset caches between turns.
/// The model accumulates context across conversation turns.
///
/// Only resets caches if they grow beyond max_context_tokens.
pub fn generate_audio_persistent(
    model: &mut HiggsAudioModel,
    text_tokens: &[u32],
    gen_config: &GenerationConfig,
    kv_cache_tokens: usize,
    max_context_tokens: usize,
) -> Result<(GeneratedAudio, usize)> {
    let ps = prefill_model(model, text_tokens, kv_cache_tokens, max_context_tokens, "persistent cache")?;
    let num_codebooks = ps.num_codebooks;
    let stream_bos = ps.stream_bos;
    let stream_eos = ps.stream_eos;
    let device = ps.device;

    // ── Phase 2: Generate audio tokens with delay pattern ──────
    let t_gen_start = Instant::now();
    info!("Starting audio generation loop (persistent cache)");

    // Raw generated codes per codebook (before delay revert)
    let mut raw_codes: Vec<Vec<u32>> = vec![Vec::new(); num_codebooks];
    let mut audio_steps = 0;
    let mut rng = rand::thread_rng();

    // Pre-allocate audio mask tensor once (avoids creating per-step)
    let audio_mask = Tensor::ones((1, 1), DType::U8, &device)?;

    // Cascading EOS state
    let mut num_remaining_delays: Option<usize> = None;

    loop {
        if audio_steps >= gen_config.max_audio_tokens {
            warn!(max = gen_config.max_audio_tokens, "Hit max audio tokens");
            break;
        }

        let _step_start = Instant::now();

        let codes_for_embed: Vec<u32> = (0..num_codebooks)
            .map(|cb| {
                if audio_steps == 0 {
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

            // Apply delay pattern
            if audio_steps < cb {
                step_codes.push(stream_bos);
                continue;
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

        // ── EOS detection with delay pattern ──
        let mut should_terminate = false;

        if let Some(ref mut remaining) = num_remaining_delays {
            if *remaining > 0 {
                *remaining -= 1;
            }
            if *remaining == 0 {
                should_terminate = true;
            }
        } else if step_codes[0] == stream_eos {
            let remaining = num_codebooks - 1;
            num_remaining_delays = Some(remaining);
            info!(
                step = audio_steps + 1,
                remaining_delays = remaining,
                "CB0 EOS — cascade started"
            );
        }

        // Store codes
        for (cb, &code) in step_codes.iter().enumerate() {
            raw_codes[cb].push(code);
        }
        audio_steps += 1;

        if should_terminate {
            info!(
                audio_steps,
                total_ms = t_gen_start.elapsed().as_millis() as u64,
                "Audio EOS cascade complete"
            );
            break;
        }
    }

    let gen_ms = t_gen_start.elapsed().as_millis() as u64;

    info!(
        audio_steps,
        gen_ms,
        "Audio generation complete (persistent cache), reverting delay pattern"
    );

    // ── Phase 3: Revert delay pattern ──────────────────────────
    let aligned = revert_delay_pattern(&raw_codes, num_codebooks, stream_bos);

    // Verified token count: prefill tokens + one forward pass per audio step
    let new_tokens_added = ps.prefill_kv_tokens + audio_steps;

    Ok((
        GeneratedAudio {
            codes: aligned,
            raw_steps: audio_steps,
        },
        new_tokens_added,
    ))
}

/// Channel-based streaming TTS generation with persistent KV cache.
///
/// Like `generate_audio_persistent()`, but decodes and sends audio chunks
/// through the channel as they become available during generation.
///
/// After the warmup period (`num_codebooks` steps), every `chunk_size` steps
/// the function extracts newly-safe aligned positions, decodes them via xCodec,
/// and sends the PCM samples through `tx`. At finalization (EOS or max tokens),
/// any remaining tail codes are decoded and sent, followed by `StreamChunk::Done`.
///
/// Returns `(total_audio_steps, new_kv_cache_token_count)`.
pub fn generate_audio_streaming(
    model: &mut HiggsAudioModel,
    decoder: &XcodecDecoder,
    text_tokens: &[u32],
    gen_config: &GenerationConfig,
    kv_cache_tokens: usize,
    max_context_tokens: usize,
    chunk_size: usize,
    tx: std::sync::mpsc::Sender<StreamChunk>,
) -> Result<(usize, usize)> {
    let ps = prefill_model(model, text_tokens, kv_cache_tokens, max_context_tokens, "streaming")?;
    let num_codebooks = ps.num_codebooks;
    let stream_bos = ps.stream_bos;
    let stream_eos = ps.stream_eos;
    let device = ps.device;

    // ── Phase 2: Streaming audio generation ──────────────────────
    let t_gen_start = Instant::now();

    let mut raw_codes: Vec<Vec<u32>> = vec![Vec::new(); num_codebooks];
    let mut audio_steps = 0;
    let mut rng = rand::thread_rng();
    let audio_mask = Tensor::ones((1, 1), DType::U8, &device)?;
    let mut num_remaining_delays: Option<usize> = None;

    // Streaming state: track how many aligned positions we've decoded and sent.
    // After warmup (num_codebooks steps), at step s the safe aligned positions
    // are 0 through s - (num_codebooks - 1). We decode in batches of chunk_size.
    let mut decoded_up_to: usize = 0;
    let warmup_steps = num_codebooks;
    let mut steps_since_last_chunk: usize = 0;

    loop {
        if audio_steps >= gen_config.max_audio_tokens {
            warn!(max = gen_config.max_audio_tokens, "Hit max audio tokens");
            break;
        }

        // Prepare input embedding for this audio step
        let codes_for_embed: Vec<u32> = (0..num_codebooks)
            .map(|cb| {
                if audio_steps == 0 {
                    stream_bos
                } else if let Some(&code) = raw_codes[cb].last() {
                    code
                } else {
                    stream_bos
                }
            })
            .collect();

        let audio_embed = model.embed_audio_codes(&codes_for_embed)?;
        let hidden = model.forward(&audio_embed, Some(&audio_mask))?;

        let logits = model.audio_logits(&hidden)?;
        let logits = logits.squeeze(0)?.squeeze(0)?;

        // Sample each codebook
        let mut step_codes = Vec::with_capacity(num_codebooks);
        for cb in 0..num_codebooks {
            let cb_logits = logits.get(cb)?;

            if audio_steps < cb {
                step_codes.push(stream_bos);
                continue;
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

        // ── EOS detection with delay pattern cascade ──
        let mut should_terminate = false;

        if let Some(ref mut remaining) = num_remaining_delays {
            if *remaining > 0 {
                *remaining -= 1;
            }
            if *remaining == 0 {
                should_terminate = true;
            }
        } else if step_codes[0] == stream_eos {
            let remaining = num_codebooks - 1;
            num_remaining_delays = Some(remaining);
            info!(
                step = audio_steps + 1,
                remaining_delays = remaining,
                "CB0 EOS — cascade started (streaming)"
            );
        }

        // Store codes
        for (cb, &code) in step_codes.iter().enumerate() {
            raw_codes[cb].push(code);
        }
        audio_steps += 1;

        // ── Streaming: emit chunk after warmup every chunk_size steps ──
        if audio_steps >= warmup_steps {
            steps_since_last_chunk += 1;
        }

        if steps_since_last_chunk >= chunk_size && !should_terminate {
            let available = audio_steps.saturating_sub(num_codebooks - 1);
            if available > decoded_up_to {
                let chunk_codes = extract_aligned_codes(
                    &raw_codes,
                    num_codebooks,
                    decoded_up_to,
                    available,
                );
                if !chunk_codes[0].is_empty() {
                    match decoder.decode(&chunk_codes) {
                        Ok(samples) if !samples.is_empty() => {
                            if tx.send(StreamChunk::Audio(samples)).is_err() {
                                info!("Stream receiver dropped, stopping generation");
                                break;
                            }
                        }
                        Ok(_) => {}
                        Err(e) => warn!(error = %e, "Streaming decode failed, skipping chunk"),
                    }
                }
                decoded_up_to = available;
                steps_since_last_chunk = 0;
            }
        }

        if should_terminate {
            info!(
                audio_steps,
                total_ms = t_gen_start.elapsed().as_millis() as u64,
                "EOS cascade complete (streaming)"
            );
            break;
        }
    }

    // ── Phase 3: Decode remaining tail ───────────────────────────
    let final_available = audio_steps.saturating_sub(num_codebooks - 1);
    if final_available > decoded_up_to {
        let tail_codes = extract_aligned_codes(
            &raw_codes,
            num_codebooks,
            decoded_up_to,
            final_available,
        );
        if !tail_codes[0].is_empty() {
            match decoder.decode(&tail_codes) {
                Ok(samples) if !samples.is_empty() => {
                    let _ = tx.send(StreamChunk::Audio(samples));
                }
                Ok(_) => {}
                Err(e) => warn!(error = %e, "Tail decode failed"),
            }
        }
    }

    let _ = tx.send(StreamChunk::Done {
        total_steps: audio_steps,
    });

    let gen_ms = t_gen_start.elapsed().as_millis() as u64;
    info!(audio_steps, gen_ms, "Streaming generation complete");

    // Verified token count: prefill tokens + one forward pass per audio step
    let new_tokens_added = ps.prefill_kv_tokens + audio_steps;
    Ok((audio_steps, new_tokens_added))
}

/// Decode generated audio codes to PCM f32 samples via xCodec.
///
/// Takes aligned codes from `GeneratedAudio` and returns 24kHz mono f32 PCM.
/// Returns empty vec if no codes were generated.
pub fn decode_audio(decoder: &XcodecDecoder, generated: &GeneratedAudio) -> Result<Vec<f32>> {
    if generated.codes.is_empty() || generated.codes[0].is_empty() {
        return Ok(Vec::new());
    }
    decoder.decode(&generated.codes)
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

/// Extract aligned codes for positions `[start, end)` from raw generated codes.
///
/// Handles the delay pattern offset: codebook `i`'s code at aligned position `p`
/// is at raw index `p + i`. Stops at control tokens (>= 1024) and truncates all
/// codebooks to the minimum length for alignment safety.
fn extract_aligned_codes(
    raw_codes: &[Vec<u32>],
    num_codebooks: usize,
    start: usize,
    end: usize,
) -> Vec<Vec<i64>> {
    let mut aligned: Vec<Vec<i64>> = Vec::with_capacity(num_codebooks);
    for cb in 0..num_codebooks {
        let mut codes = Vec::with_capacity(end - start);
        for pos in start..end {
            let raw_idx = pos + cb; // delay offset for codebook cb
            if raw_idx >= raw_codes[cb].len() {
                break;
            }
            let code = raw_codes[cb][raw_idx];
            if code >= 1024 {
                break; // Hit control token (BOS/EOS) — stop cleanly
            }
            codes.push(code as i64);
        }
        aligned.push(codes);
    }

    // Truncate to minimum length across codebooks for alignment safety
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
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
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
    indexed.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

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

#[cfg(test)]
mod tests {
    use super::*;

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
        let device = candle_core::Device::Cpu;
        let logits = Tensor::from_vec(vec![0.1f32, 0.9, 0.3], (3,), &device).unwrap();
        assert_eq!(sample_argmax_1d(&logits).unwrap(), 1);
    }

    #[test]
    fn stream_chunk_enum_variants() {
        let audio = StreamChunk::Audio(vec![0.1, 0.2, 0.3]);
        match audio {
            StreamChunk::Audio(samples) => assert_eq!(samples.len(), 3),
            StreamChunk::Done { .. } => panic!("Expected Audio variant"),
        }

        let done = StreamChunk::Done { total_steps: 42 };
        match done {
            StreamChunk::Done { total_steps } => assert_eq!(total_steps, 42),
            StreamChunk::Audio(_) => panic!("Expected Done variant"),
        }
    }

    #[test]
    fn extract_aligned_codes_basic() {
        // 3 codebooks, 6 raw steps
        // cb0: [10, 20, 30, 40, 50, 60]  (delay 0)
        // cb1: [BOS, 11, 21, 31, 41, 51]  (delay 1)
        // cb2: [BOS, BOS, 12, 22, 32, 42]  (delay 2)
        //
        // Aligned positions:
        //   pos 0: cb0[0]=10, cb1[1]=11, cb2[2]=12
        //   pos 1: cb0[1]=20, cb1[2]=21, cb2[3]=22
        //   pos 2: cb0[2]=30, cb1[3]=31, cb2[4]=32
        //   pos 3: cb0[3]=40, cb1[4]=41, cb2[5]=42
        let bos = 1024u32;
        let raw = vec![
            vec![10, 20, 30, 40, 50, 60],
            vec![bos, 11, 21, 31, 41, 51],
            vec![bos, bos, 12, 22, 32, 42],
        ];

        // Extract positions 0..2
        let chunk = extract_aligned_codes(&raw, 3, 0, 2);
        assert_eq!(chunk[0], vec![10, 20]);
        assert_eq!(chunk[1], vec![11, 21]);
        assert_eq!(chunk[2], vec![12, 22]);

        // Extract positions 2..4
        let chunk = extract_aligned_codes(&raw, 3, 2, 4);
        assert_eq!(chunk[0], vec![30, 40]);
        assert_eq!(chunk[1], vec![31, 41]);
        assert_eq!(chunk[2], vec![32, 42]);
    }

    #[test]
    fn extract_aligned_codes_stops_at_control_tokens() {
        // cb0: [10, 20, EOS, 99]
        // cb1: [BOS, 11, 21, EOS]
        let eos = 1025u32;
        let bos = 1024u32;
        let raw = vec![
            vec![10, 20, eos, 99],
            vec![bos, 11, 21, eos],
        ];

        // Extract positions 0..3: cb0 hits EOS at pos 2, cb1 at pos 2 (raw idx 3)
        let chunk = extract_aligned_codes(&raw, 2, 0, 3);
        // cb0: [10, 20] (stops at EOS at raw idx 2)
        // cb1: [11, 21] (raw idx 1, 2 — both valid)
        // min_len = 2
        assert_eq!(chunk[0], vec![10, 20]);
        assert_eq!(chunk[1], vec![11, 21]);
    }

    #[test]
    fn generation_config_default_chunk_size() {
        let config = GenerationConfig::default();
        assert_eq!(config.chunk_size, 25);
    }
}
