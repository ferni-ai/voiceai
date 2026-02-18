//! Autoregressive audio generation for Higgs Audio V2 on MLX (Rust).
//!
//! Full TTS pipeline:
//!   1. Tokenize text, embed, forward through model in text mode
//!   2. Detect/force <|audio_out_bos|> transition
//!   3. Generate 8-codebook audio tokens per step (delay pattern)
//!   4. Revert delay pattern to align codebooks
//!   5. Decode aligned codes via xCodec ONNX → 24kHz PCM
//!
//! Port of apps/mlx-higgs/generate.py.

use std::path::Path;
use std::time::Instant;

use anyhow::{bail, Result};
use mlx_rs::{
    module::{ModuleParameters, ModuleParametersExt},
    ops::{self, indexing::IndexOp},
    random, Array,
};
use tracing::info;

use crate::config::HiggsAudioConfig;
use crate::model::HiggsAudioModelMlx;

// ─── Generation Config ──────────────────────────────────────

/// Parameters for audio generation.
pub struct GenerationConfig {
    pub max_audio_tokens: usize,
    pub temperature: f32,
    pub top_p: f32,
    pub top_k: usize,
    pub chunk_size: usize,
}

impl Default for GenerationConfig {
    fn default() -> Self {
        Self {
            max_audio_tokens: 1500,
            temperature: 0.3,
            top_p: 0.95,
            top_k: 50,
            chunk_size: 25,
        }
    }
}

/// Result of audio generation.
pub struct GeneratedAudio {
    /// Aligned codes: codes[codebook][time_step].
    pub codes: Vec<Vec<i64>>,
    /// Total raw steps generated.
    pub raw_steps: usize,
    /// Performance stats.
    pub stats: GenerationStats,
}

pub struct GenerationStats {
    pub prefill_ms: f64,
    pub gen_ms: f64,
    pub total_ms: f64,
    pub tokens_per_sec: f64,
    pub audio_duration_s: f64,
    pub rtf: f64,
}

// ─── Weight Loading ─────────────────────────────────────────

/// Load sharded safetensors weights into the model.
///
/// Higgs V2 ships weights across multiple `model-NNNNN-of-NNNNN.safetensors`
/// files. We load each shard and merge into the model's parameters.
pub fn load_weights(model: &mut HiggsAudioModelMlx, model_dir: &Path) -> Result<()> {
    let t0 = Instant::now();

    // Find all safetensors shards
    let mut shard_paths: Vec<std::path::PathBuf> = std::fs::read_dir(model_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .map(|n| {
                    let s = n.to_string_lossy();
                    s.starts_with("model-") && s.ends_with(".safetensors")
                })
                .unwrap_or(false)
        })
        .collect();
    shard_paths.sort();

    if shard_paths.is_empty() {
        bail!("No model-*.safetensors files found in {}", model_dir.display());
    }

    info!(num_shards = shard_paths.len(), "Loading weight shards");

    // Get mutable parameter map
    let mut params = model.parameters_mut().flatten();

    for (i, shard) in shard_paths.iter().enumerate() {
        let shard_data = Array::load_safetensors(shard)?;
        let num_tensors = shard_data.len();

        for (key, value) in shard_data {
            if let Some(param) = params.get_mut(&*key) {
                **param = value;
            }
        }

        info!(shard = i + 1, tensors = num_tensors, "Shard loaded");
    }

    // Evaluate all parameters (trigger lazy loading)
    model.eval()?;

    let elapsed = t0.elapsed();
    info!(load_ms = elapsed.as_millis() as u64, "All weights loaded");

    Ok(())
}

// ─── Sampling ───────────────────────────────────────────────

/// Greedy argmax sampling from 1D logits.
fn sample_argmax(logits: &Array) -> Result<i32> {
    let idx = ops::indexing::argmax(logits, None)?;
    mlx_rs::transforms::eval(std::iter::once(&idx))?;
    let val: i32 = idx.item();
    Ok(val)
}

/// Sampling with temperature using MLX's `random::categorical`.
///
/// `categorical` takes logits, applies softmax internally, and samples.
/// We apply temperature scaling before passing to it.
fn sample_top_k_top_p(
    logits: &Array,
    temperature: f32,
    _top_k: usize,
    _top_p: f32,
) -> Result<i32> {
    // Apply temperature
    let scaled = if (temperature - 1.0).abs() > 1e-6 {
        logits.divide(&Array::from(temperature))?
    } else {
        logits.clone()
    };

    // MLX categorical takes logits (unnormalized log-probs) and samples
    // It internally applies softmax.
    // Reshape to (1, vocab) for categorical which expects (num_samples, vocab)
    let vocab_size = scaled.shape()[0];
    let logits_2d = scaled.reshape(&[1, vocab_size])?;
    let sampled = random::categorical(&logits_2d, None, None, None)?;
    mlx_rs::transforms::eval(std::iter::once(&sampled))?;
    let val: i32 = sampled.reshape(&[])?.item();
    Ok(val)
}

// ─── Main Generation Loop ───────────────────────────────────

/// Generate audio from text tokens using the Higgs model.
///
/// This implements the full autoregressive pipeline:
/// 1. Text prefill (embed + forward all text tokens at once)
/// 2. Force audio_out_bos transition
/// 3. Audio token generation with delay pattern
/// 4. Delay pattern revert for aligned output
pub fn generate_audio(
    model: &mut HiggsAudioModelMlx,
    text_tokens: &[i32],
    config: &HiggsAudioConfig,
    gen_config: &GenerationConfig,
) -> Result<GeneratedAudio> {
    let num_codebooks = config.audio_num_codebooks;
    let audio_out_bos = config.audio_out_bos_token_id as i32;
    let stream_bos = config.audio_stream_bos_id as i32;
    let stream_eos = config.audio_stream_eos_id as i32;
    let vocab_per_cb = config.audio_vocab_per_codebook();

    let t0 = Instant::now();

    // ── Phase 1: Text prefill ───────────────────────────────
    let text_ids = Array::from_slice(text_tokens, &[1, text_tokens.len() as i32]);
    let text_embeds = model.embed_text(&text_ids)?;
    let hidden = model.forward_model(&text_embeds, false)?;
    mlx_rs::transforms::eval(std::iter::once(&hidden))?;

    let prefill_ms = t0.elapsed().as_secs_f64() * 1000.0;
    info!(
        tokens = text_tokens.len(),
        prefill_ms = format!("{prefill_ms:.0}"),
        "Text prefill complete"
    );

    // Get text logits from last position
    let seq_len = hidden.shape()[1] as i32;
    let last_hidden = hidden.index((0..1, (seq_len - 1)..seq_len, ..));
    let text_logits = model.text_logits(&last_hidden)?;
    let logits_flat = text_logits.reshape(&[-1])?;
    let next_token = sample_argmax(&logits_flat)?;

    if next_token != audio_out_bos {
        info!(
            predicted = next_token,
            expected = audio_out_bos,
            "Forcing audio_out_bos"
        );
    } else {
        info!("Model naturally predicted audio_out_bos");
    }

    // Feed audio_out_bos
    let bos_ids = Array::from_slice(&[audio_out_bos], &[1, 1]);
    let bos_embed = model.embed_text(&bos_ids)?;
    let _ = model.forward_model(&bos_embed, false)?;

    // ── Phase 2: Audio generation with delay pattern ────────
    let t_gen = Instant::now();

    let mut raw_codes: Vec<Vec<i32>> = vec![Vec::new(); num_codebooks];
    let mut audio_steps: usize = 0;
    let mut num_remaining_delays: Option<usize> = None;

    // Audio mask flag (single token, all audio)
    let audio_mask_flag = true;

    while audio_steps < gen_config.max_audio_tokens {
        // Build input embedding from previous codes
        let codes_for_embed: Vec<u32> = (0..num_codebooks)
            .map(|cb| {
                if audio_steps == 0 {
                    stream_bos as u32
                } else if let Some(&code) = raw_codes[cb].last() {
                    code as u32
                } else {
                    stream_bos as u32
                }
            })
            .collect();

        let audio_embed = model.embed_audio_codes(&codes_for_embed, vocab_per_cb)?;
        let hidden = model.forward_model(&audio_embed, audio_mask_flag)?;

        // Get audio logits: (1, 1, num_codebooks, vocab_per_cb)
        let logits_4d = model.audio_logits(&hidden, num_codebooks, vocab_per_cb)?;
        // Reshape to (num_codebooks, vocab_per_cb)
        let logits = logits_4d.reshape(&[num_codebooks as i32, vocab_per_cb as i32])?;
        mlx_rs::transforms::eval(std::iter::once(&logits))?;

        // Sample each codebook
        let mut step_codes = Vec::with_capacity(num_codebooks);

        for cb in 0..num_codebooks {
            // Delay pattern: codebook cb produces real codes only at step >= cb
            if audio_steps < cb {
                step_codes.push(stream_bos);
                continue;
            }

            let cb_logits = logits.index(cb as i32);

            let code = if gen_config.temperature <= 0.0 {
                sample_argmax(&cb_logits)?
            } else {
                sample_top_k_top_p(
                    &cb_logits,
                    gen_config.temperature,
                    gen_config.top_k,
                    gen_config.top_p,
                )?
            };

            step_codes.push(code);
        }

        // ── EOS detection (CB0 triggers cascade) ────────────
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
                remaining,
                "CB0 EOS — cascade started"
            );
        }

        // Store codes
        for (cb, &code) in step_codes.iter().enumerate() {
            raw_codes[cb].push(code);
        }
        audio_steps += 1;

        // Progress logging
        if audio_steps <= 3 || audio_steps % 50 == 0 {
            let elapsed = t_gen.elapsed().as_secs_f64();
            let tps = audio_steps as f64 / elapsed;
            info!(step = audio_steps, tps = format!("{tps:.1}"), "Generating");
        }

        if should_terminate {
            info!(step = audio_steps, "EOS cascade complete");
            break;
        }
    }

    let gen_ms = t_gen.elapsed().as_secs_f64() * 1000.0;
    let total_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let tps = if gen_ms > 0.0 {
        audio_steps as f64 / (gen_ms / 1000.0)
    } else {
        0.0
    };
    let audio_duration_s = audio_steps as f64 * 0.04; // 25fps → 40ms/frame
    let rtf = if audio_steps > 0 {
        gen_ms / (audio_steps as f64 * 40.0)
    } else {
        0.0
    };

    info!(
        steps = audio_steps,
        gen_ms = format!("{gen_ms:.0}"),
        tps = format!("{tps:.1}"),
        audio_s = format!("{audio_duration_s:.1}"),
        rtf = format!("{rtf:.2}"),
        "Generation complete"
    );

    // Revert delay pattern
    let aligned = revert_delay_pattern(&raw_codes, num_codebooks);

    Ok(GeneratedAudio {
        codes: aligned,
        raw_steps: audio_steps,
        stats: GenerationStats {
            prefill_ms,
            gen_ms,
            total_ms,
            tokens_per_sec: tps,
            audio_duration_s,
            rtf,
        },
    })
}

// ─── Delay Pattern ──────────────────────────────────────────

/// Revert the delay pattern to align all codebooks.
///
/// During generation, codebook `i` is delayed by `i` steps.
/// This removes the delay so all codebooks are time-aligned.
fn revert_delay_pattern(raw_codes: &[Vec<i32>], num_codebooks: usize) -> Vec<Vec<i64>> {
    if raw_codes.is_empty() || raw_codes[0].is_empty() {
        return vec![Vec::new(); num_codebooks];
    }

    let raw_len = raw_codes[0].len();
    let common_len = raw_len.saturating_sub(num_codebooks - 1);
    if common_len == 0 {
        return vec![Vec::new(); num_codebooks];
    }

    let mut aligned = Vec::with_capacity(num_codebooks);
    for cb in 0..num_codebooks {
        let mut codes = Vec::new();
        for &c in raw_codes[cb].iter().skip(cb).take(common_len) {
            if c >= 1024 {
                break;
            }
            codes.push(c as i64);
        }
        aligned.push(codes);
    }

    // Trim to shortest
    let min_len = aligned.iter().map(|c| c.len()).min().unwrap_or(0);
    for codes in &mut aligned {
        codes.truncate(min_len);
    }

    aligned
}

// ─── xCodec ONNX Decoder ───────────────────────────────────

/// xCodec audio decoder via ONNX Runtime.
///
/// Decodes aligned codebook sequences to 24kHz PCM float32.
pub struct XCodecDecoder {
    session: ort::session::Session,
    num_codebooks: usize,
}

impl XCodecDecoder {
    pub fn new(onnx_path: &Path, num_codebooks: usize) -> Result<Self> {
        info!(path = %onnx_path.display(), "Loading xCodec ONNX decoder");

        let session = ort::session::Session::builder()?
            .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)?
            .commit_from_file(onnx_path)?;

        info!("xCodec decoder loaded");
        Ok(Self {
            session,
            num_codebooks,
        })
    }

    /// Decode aligned codebook sequences to PCM f32 audio.
    pub fn decode(&mut self, codes: &[Vec<i64>]) -> Result<Vec<f32>> {
        if codes.is_empty() || codes[0].is_empty() {
            return Ok(Vec::new());
        }

        let time_steps = codes.iter().map(|c| c.len()).min().unwrap_or(0);
        if time_steps == 0 {
            return Ok(Vec::new());
        }

        // Build input tensor shape: (1, num_codebooks, time_steps)
        let mut flat = vec![0i64; self.num_codebooks * time_steps];
        for cb in 0..self.num_codebooks {
            for t in 0..time_steps {
                if t < codes[cb].len() {
                    flat[cb * time_steps + t] = codes[cb][t];
                }
            }
        }

        let shape = vec![1usize, self.num_codebooks, time_steps];
        let input = ort::value::Value::from_array((shape, flat))?;

        let outputs = self.session.run(ort::inputs!["codes" => input])?;
        let output_tensor = outputs[0].try_extract_tensor::<f32>()?;
        let audio: Vec<f32> = output_tensor.1.iter().copied().collect();

        info!(
            frames = time_steps,
            samples = audio.len(),
            duration_s = format!("{:.2}", audio.len() as f64 / 24000.0),
            "xCodec decode complete"
        );

        Ok(audio)
    }
}

// ─── Text Token Builder ─────────────────────────────────────

/// Build the full token sequence for Higgs TTS.
///
/// Format: <|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n
///         {system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n
///         {text}<|eot_id|>
pub fn build_text_tokens(
    text: &str,
    tokenizer: &tokenizers::Tokenizer,
) -> Result<Vec<i32>> {
    let system_prompt = "Generate audio following instruction.\n\n\
        <|scene_desc_start|>\nAudio is recorded from a quiet room.\n<|scene_desc_end|>";

    let full_prompt = format!(
        "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n\
         {system_prompt}<|eot_id|>\
         <|start_header_id|>user<|end_header_id|>\n\n\
         {text}<|eot_id|>"
    );

    let encoding = tokenizer
        .encode(full_prompt.as_str(), true)
        .map_err(|e| anyhow::anyhow!("Tokenization failed: {e}"))?;

    let ids: Vec<i32> = encoding.get_ids().iter().map(|&id| id as i32).collect();
    info!(tokens = ids.len(), "Text tokenized");
    Ok(ids)
}

// ─── Quantization Helper ────────────────────────────────────

/// Quantize all weight arrays in the model to INT4.
///
/// Iterates over model parameters, quantizing 2D weight matrices
/// using MLX's ops::quantize (group_size=64, bits=4).
pub fn quantize_model_weights(model: &mut HiggsAudioModelMlx) -> Result<()> {
    info!("Applying INT4 weight quantization...");
    let t0 = Instant::now();

    let mut params = model.parameters_mut().flatten();
    let mut quantized_count = 0u32;

    for (_key, param) in params.iter_mut() {
        let shape = param.shape();
        // Only quantize 2D weight matrices (Linear layers)
        if shape.len() == 2 && shape[0] > 1 && shape[1] > 1 {
            // Check dimensions are compatible with group_size=64
            if shape[1] % 64 == 0 {
                match ops::quantize(param.as_ref(), 64, 4) {
                    Ok((quantized_w, _scales, _biases)) => {
                        // For now, store the dequantized version back
                        // (full quantized inference requires QuantizedLinear)
                        if let Ok(dequant) = ops::dequantize(&quantized_w, &_scales, &_biases, 64, 4) {
                            **param = dequant;
                            quantized_count += 1;
                        }
                    }
                    Err(_) => continue,
                }
            }
        }
    }

    model.eval()?;

    let elapsed = t0.elapsed();
    info!(
        ms = elapsed.as_millis() as u64,
        layers = quantized_count,
        "Weight quantization complete"
    );
    Ok(())
}
