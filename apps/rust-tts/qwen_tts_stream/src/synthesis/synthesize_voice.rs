use anyhow::{Result, bail};

use crate::io::voice_prompt::write_wav;
#[cfg(feature = "audio-loading")]
use crate::io::voice_prompt::{load_voice_prompt, save_voice_prompt};
use crate::io::{GenerationArgs, IoArgs, SynthesisItem, VoiceCloneParams};
use crate::model::Model;
#[cfg(feature = "audio-loading")]
use crate::model::options::VoiceCloneOptions;
use crate::model::options::{CustomVoiceOptions, VoiceDesignOptions};
#[cfg(feature = "audio-loading")]
use crate::model::voice_clone::VoiceClonePromptItem;

pub fn synthesize_custom_voice_item(
    model: &Model,
    gen_args: &GenerationArgs,
    io_args: &IoArgs,
    speaker: &str,
    instruct: Option<&str>,
    item: &SynthesisItem,
) -> Result<()> {
    // Check if text processor is loaded
    if !model.has_text_processor() {
        bail!("Text tokenizer not loaded. Make sure tokenizer.json exists in the model directory.");
    }

    tracing::info!("Generating speech...");

    // Build options
    let options = if gen_args.greedy {
        CustomVoiceOptions {
            max_new_tokens: Some(gen_args.max_tokens),
            do_sample: Some(false),
            subtalker_do_sample: Some(false),
            temperature: Some(1.0), // Temperature doesn't matter when do_sample=false
            repetition_penalty: gen_args.repetition_penalty,
            ..Default::default()
        }
    } else {
        CustomVoiceOptions {
            max_new_tokens: Some(gen_args.max_tokens),
            temperature: gen_args.temperature,
            top_k: gen_args.top_k,
            top_p: gen_args.top_p,
            repetition_penalty: gen_args.repetition_penalty,
            subtalker_temperature: gen_args.subtalker_temperature,
            subtalker_top_k: gen_args.subtalker_top_k,
            subtalker_top_p: gen_args.subtalker_top_p,
            subtalker_do_sample: if gen_args.no_subtalker_sample {
                Some(false)
            } else {
                None
            },
            ..Default::default()
        }
    };

    let result = model
        .generate_custom_voice_from_text(
            &item.text,
            speaker,
            &item.language,
            instruct,
            Some(options),
        )
        .map_err(|e| anyhow::anyhow!("Generation failed: {}", e))?;

    if tracing::enabled!(tracing::Level::INFO) {
        let num_samples = result.audio.dims()[0];
        let duration_secs = num_samples as f32 / result.sample_rate as f32;
        let approx_steps = (duration_secs * 12.0) as usize; // 12Hz codec
        tracing::info!(
            num_samples,
            sample_rate = result.sample_rate,
            duration_secs,
            approx_steps,
            "Generated audio"
        );
    }

    // Debug output: generation results
    if io_args.debug && tracing::enabled!(tracing::Level::DEBUG) {
        let dims = result.audio.dims();
        let num_samples = dims[0];
        let duration_secs = num_samples as f32 / result.sample_rate as f32;
        tracing::debug!(
            audio_shape = ?dims,
            duration_secs,
            approx_steps = (duration_secs * 12.0) as usize,
            "Generation results"
        );
    }

    // Write WAV file
    write_wav(&item.output, &result.audio, result.sample_rate)?;

    tracing::info!(path = ?item.output, "Saved audio");
    Ok(())
}

pub fn synthesize_voice_design_item(
    model: &Model,
    gen_args: &GenerationArgs,
    io_args: &IoArgs,
    description: &str,
    item: &SynthesisItem,
) -> Result<()> {
    // Check if text processor is loaded
    if !model.has_text_processor() {
        bail!("Text tokenizer not loaded. Make sure tokenizer.json exists in the model directory.");
    }

    tracing::info!("Generating speech...");

    // Build options
    let options = if gen_args.greedy {
        VoiceDesignOptions {
            max_new_tokens: Some(gen_args.max_tokens),
            do_sample: Some(false),
            subtalker_do_sample: Some(false),
            temperature: Some(1.0),
            repetition_penalty: gen_args.repetition_penalty,
            ..Default::default()
        }
    } else {
        VoiceDesignOptions {
            max_new_tokens: Some(gen_args.max_tokens),
            temperature: gen_args.temperature,
            top_k: gen_args.top_k,
            top_p: gen_args.top_p,
            repetition_penalty: gen_args.repetition_penalty,
            subtalker_temperature: gen_args.subtalker_temperature,
            subtalker_top_k: gen_args.subtalker_top_k,
            subtalker_top_p: gen_args.subtalker_top_p,
            subtalker_do_sample: if gen_args.no_subtalker_sample {
                Some(false)
            } else {
                None
            },
            ..Default::default()
        }
    };

    let result = model
        .generate_voice_design_from_text(&item.text, description, &item.language, Some(options))
        .map_err(|e| anyhow::anyhow!("Generation failed: {}", e))?;

    if tracing::enabled!(tracing::Level::INFO) {
        let num_samples = result.audio.dims()[0];
        let duration_secs = num_samples as f32 / result.sample_rate as f32;
        let approx_steps = (duration_secs * 12.0) as usize;
        tracing::info!(
            num_samples,
            sample_rate = result.sample_rate,
            duration_secs,
            approx_steps,
            "Generated audio"
        );
    }

    if io_args.debug && tracing::enabled!(tracing::Level::DEBUG) {
        let dims = result.audio.dims();
        let num_samples = dims[0];
        let duration_secs = num_samples as f32 / result.sample_rate as f32;
        tracing::debug!(
            audio_shape = ?dims,
            duration_secs,
            approx_steps = (duration_secs * 12.0) as usize,
            "Generation results"
        );
    }

    // Write WAV file
    write_wav(&item.output, &result.audio, result.sample_rate)?;

    tracing::info!(path = ?item.output, "Saved audio");
    Ok(())
}

/// Static storage for cached voice clone prompt (used across batch items)
#[cfg(feature = "audio-loading")]
static VOICE_CLONE_PROMPT_CACHE: std::sync::OnceLock<VoiceClonePromptItem> =
    std::sync::OnceLock::new();

#[cfg(feature = "audio-loading")]
pub fn synthesize_voice_clone_item(
    model: &mut crate::model::Model,
    gen_args: &GenerationArgs,
    io_args: &IoArgs,
    clone_params: &VoiceCloneParams,
    item: &SynthesisItem,
) -> Result<()> {
    use crate::audio::utils::{load_audio_file, resample};

    // Check if text processor is loaded
    if !model.has_text_processor() {
        bail!("Text tokenizer not loaded. Make sure tokenizer.json exists in the model directory.");
    }

    // Get or create voice clone prompt
    let prompt = if let Some(cached) = VOICE_CLONE_PROMPT_CACHE.get() {
        // Reuse cached prompt for batch processing
        cached.clone()
    } else if let Some(ref load_path) = io_args.load_prompt {
        // Load prompt from file
        tracing::info!(path = ?load_path, "Loading voice prompt");
        let prompt = load_voice_prompt(load_path, model.device(), model.dtype())?;
        let _ = VOICE_CLONE_PROMPT_CACHE.set(prompt.clone());
        prompt
    } else if let Some(ref audio_path) = clone_params.ref_audio {
        // Create prompt from reference audio
        let audio_str = audio_path.to_str().unwrap();

        // Check if it's a URL or a local file
        let ref_audio = if crate::audio::utils::is_url(audio_str) {
            tracing::info!("Downloading reference audio from URL...");
            crate::audio::utils::load_audio_url(audio_str)
                .map_err(|e| anyhow::anyhow!("Failed to load reference audio from URL: {}", e))?
        } else {
            tracing::info!("Loading reference audio...");
            load_audio_file(audio_str)
                .map_err(|e| anyhow::anyhow!("Failed to load reference audio: {}", e))?
        };

        // Resample to 24kHz if needed
        let ref_audio = if ref_audio.sample_rate != 24000 {
            tracing::info!(from = ref_audio.sample_rate, to = 24000, "Resampling audio");
            resample(&ref_audio, 24000).map_err(|e| anyhow::anyhow!("Failed to resample: {}", e))?
        } else {
            ref_audio
        };

        tracing::info!(
            duration_secs = ref_audio.duration_secs(),
            "Reference audio loaded"
        );

        // Convert to tensor
        let ref_tensor = ref_audio
            .to_tensor(model.device())
            .map_err(|e| anyhow::anyhow!("Failed to convert to tensor: {}", e))?;

        tracing::info!("Creating voice clone prompt...");
        tracing::debug!(
            shape = ?ref_tensor.dims(),
            dtype = ?ref_tensor.dtype(),
            "Reference tensor"
        );

        let prompt = model
            .create_voice_clone_prompt_from_audio(
                &ref_tensor,
                clone_params.ref_text.clone(),
                clone_params.x_vector_only,
            )
            .map_err(|e| anyhow::anyhow!("Failed to create prompt: {}", e))?;

        // Debug: print speaker embedding stats for comparison with Python
        if io_args.debug && tracing::enabled!(tracing::Level::DEBUG) {
            let spk_embed = &prompt.ref_spk_embedding;
            tracing::debug!(
                shape = ?spk_embed.dims(),
                dtype = ?spk_embed.dtype(),
                "Speaker embedding"
            );
            if let Ok(embed_f32) = spk_embed.to_dtype(candle_core::DType::F32) {
                if let Ok(values) = embed_f32.to_vec1::<f32>() {
                    let min = values.iter().cloned().fold(f32::INFINITY, f32::min);
                    let max = values.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
                    let sum: f32 = values.iter().sum();
                    let mean = sum / values.len() as f32;
                    tracing::debug!(min, max, mean, "Speaker embedding stats");
                    tracing::debug!(first_10 = ?&values[..values.len().min(10)], "Speaker embedding values");
                    tracing::debug!(last_10 = ?&values[values.len().saturating_sub(10)..], "Speaker embedding values");
                }
            }
        }

        // Save prompt if requested (typically first item only)
        if clone_params.save_prompt {
            if let Some(ref save_path) = io_args.save_prompt {
                tracing::info!(path = ?save_path, "Saving voice prompt");
                save_voice_prompt(
                    &prompt,
                    save_path,
                    clone_params.x_vector_only,
                    clone_params.ref_text.as_deref(),
                )?;
            }
        }

        // Cache for batch processing
        let _ = VOICE_CLONE_PROMPT_CACHE.set(prompt.clone());
        prompt
    } else {
        bail!("Voice cloning requires either --ref-audio or --load-prompt");
    };

    tracing::info!("Generating speech...");

    // Build options
    let options = if gen_args.greedy {
        VoiceCloneOptions {
            max_new_tokens: Some(gen_args.max_tokens),
            do_sample: Some(false),
            subtalker_do_sample: Some(false),
            temperature: Some(1.0),
            repetition_penalty: gen_args.repetition_penalty,
            ..Default::default()
        }
    } else {
        VoiceCloneOptions {
            max_new_tokens: Some(gen_args.max_tokens),
            temperature: gen_args.temperature,
            top_k: gen_args.top_k,
            top_p: gen_args.top_p,
            repetition_penalty: gen_args.repetition_penalty,
            subtalker_temperature: gen_args.subtalker_temperature,
            subtalker_top_k: gen_args.subtalker_top_k,
            subtalker_top_p: gen_args.subtalker_top_p,
            subtalker_do_sample: if gen_args.no_subtalker_sample {
                Some(false)
            } else {
                None
            },
            ..Default::default()
        }
    };

    let result = model
        .generate_voice_clone_from_text(&item.text, &prompt, &item.language, Some(options))
        .map_err(|e| anyhow::anyhow!("Generation failed: {}", e))?;

    if tracing::enabled!(tracing::Level::INFO) {
        let dims = result.audio.dims();
        // Audio shape is either [samples] or [batch, samples]
        let num_samples = dims[dims.len() - 1];
        let duration_secs = num_samples as f32 / result.sample_rate as f32;
        let approx_steps = (duration_secs * 12.0) as usize;
        tracing::info!(
            num_samples,
            sample_rate = result.sample_rate,
            duration_secs,
            approx_steps,
            "Generated audio"
        );
    }

    if io_args.debug && tracing::enabled!(tracing::Level::DEBUG) {
        let dims = result.audio.dims();
        // Audio shape is either [samples] or [batch, samples]
        let num_samples = dims[dims.len() - 1];
        let duration_secs = num_samples as f32 / result.sample_rate as f32;
        tracing::debug!(
            audio_shape = ?dims,
            duration_secs,
            approx_steps = (duration_secs * 12.0) as usize,
            voice_prompt_mode = if prompt.x_vector_only_mode { "x-vector only" } else { "ICL" },
            "Generation results"
        );
    }

    // Write WAV file
    write_wav(&item.output, &result.audio, result.sample_rate)?;

    tracing::info!(path = ?item.output, "Saved audio");
    Ok(())
}

#[cfg(not(feature = "audio-loading"))]
pub fn synthesize_voice_clone_item(
    _model: &mut Model,
    _gen_args: &GenerationArgs,
    _io_args: &IoArgs,
    _clone_params: &VoiceCloneParams,
    _item: &SynthesisItem,
) -> Result<()> {
    bail!(
        "Voice cloning requires the 'audio-loading' feature. Rebuild with --features audio-loading"
    )
}
