//! Audio tokenizer commands (encode/decode).

use anyhow::{Context, Result, bail};
use candle_core::{DType, Device, Tensor};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::io::ModelArgs;
use crate::io::tokenizer::get_tokenizer_path;
use crate::io::voice_prompt::write_wav;
use crate::model::Model;

/// Tokenizer subcommand
#[derive(Debug, Clone)]
pub enum TokenizerCommand {
    /// Encode audio file to codes
    Encode { input: PathBuf, output: PathBuf },
    /// Decode codes back to audio
    Decode { input: PathBuf, output: PathBuf },
    /// Round-trip test: encode then decode
    Roundtrip {
        input: PathBuf,
        output: PathBuf,
        save_codes: Option<PathBuf>,
    },
}

const CODES_FILE_VERSION: u32 = 1;

/// Audio codes file format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioCodesFile {
    pub version: u32,
    pub sample_rate: u32,
    pub num_codebooks: usize,
    pub num_steps: usize,
    pub codes: Vec<Vec<i64>>,
}

pub fn run_tokenizer(
    command: &TokenizerCommand,
    model_args: &ModelArgs,
    device: &Device,
    dtype: DType,
) -> Result<()> {
    use crate::model::loader::{LoaderConfig, ModelLoader};

    // Get model path (use tokenizer-specific default if not specified)
    let model_path = get_tokenizer_path(model_args)?;

    tracing::info!(
        model = %model_path.display(),
        device = ?device,
        dtype = ?dtype,
        "Tokenizer configuration"
    );

    // Load the tokenizer
    tracing::info!("Loading tokenizer...");
    let loader_config = LoaderConfig {
        dtype,
        load_tokenizer: true,
        load_text_tokenizer: false,
        load_generate_config: false,
        use_flash_attn: false,
    };

    let loader = ModelLoader::from_local_dir(&model_path)
        .map_err(|e| anyhow::anyhow!("Failed to create model loader: {}", e))?;

    let mut model = loader
        .load_tts_model(device, &loader_config)
        .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {}", e))?;

    tracing::info!("Tokenizer loaded!");

    match command {
        TokenizerCommand::Encode { input, output } => {
            encode_audio(&mut model, input, output)?;
        }
        TokenizerCommand::Decode { input, output } => {
            decode_codes(&model, input, output)?;
        }
        TokenizerCommand::Roundtrip {
            input,
            output,
            save_codes,
        } => {
            roundtrip(&mut model, input, output, save_codes.as_ref())?;
        }
    }

    Ok(())
}

#[cfg(feature = "audio-loading")]
fn encode_audio(model: &mut Model, input: &PathBuf, output: &PathBuf) -> Result<()> {
    use crate::audio::utils::{load_audio_file, resample};

    tracing::info!(input = ?input, "Encoding audio");

    let audio = load_audio_file(input.to_str().unwrap())
        .map_err(|e| anyhow::anyhow!("Failed to load audio: {}", e))?;

    let original_sr = audio.sample_rate;

    let audio = if audio.sample_rate != 24000 {
        tracing::info!(from = audio.sample_rate, to = 24000, "Resampling audio");
        resample(&audio, 24000).map_err(|e| anyhow::anyhow!("Failed to resample: {}", e))?
    } else {
        audio
    };

    tracing::info!(
        duration_secs = audio.duration_secs(),
        samples = audio.samples.len(),
        "Audio loaded"
    );

    let audio_tensor = audio
        .to_tensor(model.device())
        .map_err(|e| anyhow::anyhow!("Failed to convert to tensor: {}", e))?;

    tracing::info!("Encoding...");
    let codes = model
        .encode_audio(&audio_tensor)
        .map_err(|e| anyhow::anyhow!("Failed to encode: {}", e))?;

    let codes_shape = codes.dims();
    tracing::debug!(codes_shape = ?codes_shape, "Encoded codes");

    let codes_vec: Vec<Vec<i64>> = codes
        .to_vec2()
        .map_err(|e| anyhow::anyhow!("Failed to convert codes: {}", e))?;

    let codes_file = AudioCodesFile {
        version: CODES_FILE_VERSION,
        sample_rate: original_sr,
        num_codebooks: codes_shape[1],
        num_steps: codes_shape[0],
        codes: codes_vec,
    };

    let json = serde_json::to_string_pretty(&codes_file)?;
    fs::write(output, json)?;

    tracing::info!(path = ?output, "Saved codes");
    tracing::debug!(
        steps = codes_file.num_steps,
        codebooks = codes_file.num_codebooks,
        "Codes dimensions"
    );

    Ok(())
}

#[cfg(not(feature = "audio-loading"))]
fn encode_audio(_model: &mut Model, _input: &PathBuf, _output: &PathBuf) -> Result<()> {
    bail!("Encoding requires the 'audio-loading' feature. Rebuild with --features audio-loading")
}

fn decode_codes(model: &Model, input: &PathBuf, output: &PathBuf) -> Result<()> {
    tracing::info!(input = ?input, "Decoding codes");

    let content = fs::read_to_string(input)
        .with_context(|| format!("Failed to read codes file: {:?}", input))?;

    let codes_file: AudioCodesFile = serde_json::from_str(&content)
        .with_context(|| format!("Failed to parse codes file: {:?}", input))?;

    if codes_file.version != CODES_FILE_VERSION {
        bail!(
            "Codes file version mismatch: expected {}, got {}",
            CODES_FILE_VERSION,
            codes_file.version
        );
    }

    tracing::debug!(
        steps = codes_file.num_steps,
        codebooks = codes_file.num_codebooks,
        "Codes loaded"
    );

    let codes_flat: Vec<i64> = codes_file.codes.iter().flatten().copied().collect();
    let codes = Tensor::from_vec(
        codes_flat,
        (codes_file.num_steps, codes_file.num_codebooks),
        model.device(),
    )?;

    tracing::info!("Decoding...");
    let audio = model
        .decode_codes(&codes)
        .map_err(|e| anyhow::anyhow!("Failed to decode: {}", e))?;

    if tracing::enabled!(tracing::Level::INFO) {
        let num_samples = audio.dims()[0];
        let sample_rate = 24000;
        let duration_secs = num_samples as f32 / sample_rate as f32;
        tracing::info!(duration_secs, num_samples, sample_rate, "Audio decoded");
    }

    write_wav(output, &audio, 24000)?;
    tracing::info!(path = ?output, "Saved audio");

    Ok(())
}

#[cfg(feature = "audio-loading")]
fn roundtrip(
    model: &mut Model,
    input: &PathBuf,
    output: &PathBuf,
    save_codes: Option<&PathBuf>,
) -> Result<()> {
    use crate::audio::utils::{load_audio_file, resample};

    tracing::info!(input = ?input, output = ?output, "Round-trip test");

    let audio = load_audio_file(input.to_str().unwrap())
        .map_err(|e| anyhow::anyhow!("Failed to load audio: {}", e))?;

    let original_sr = audio.sample_rate;
    let original_duration = audio.duration_secs();
    let original_samples = audio.samples.len();

    let audio = if audio.sample_rate != 24000 {
        tracing::info!(from = audio.sample_rate, to = 24000, "Resampling audio");
        resample(&audio, 24000).map_err(|e| anyhow::anyhow!("Failed to resample: {}", e))?
    } else {
        audio
    };

    tracing::info!(
        duration_secs = original_duration,
        samples = original_samples,
        sample_rate = original_sr,
        "Input audio"
    );

    let audio_tensor = audio
        .to_tensor(model.device())
        .map_err(|e| anyhow::anyhow!("Failed to convert to tensor: {}", e))?;

    tracing::info!("Encoding...");
    let codes = model
        .encode_audio(&audio_tensor)
        .map_err(|e| anyhow::anyhow!("Failed to encode: {}", e))?;

    let codes_shape = codes.dims();
    tracing::debug!(
        steps = codes_shape[0],
        codebooks = codes_shape[1],
        "Encoded codes"
    );

    if let Some(codes_path) = save_codes {
        let codes_vec: Vec<Vec<i64>> = codes
            .to_vec2()
            .map_err(|e| anyhow::anyhow!("Failed to convert codes: {}", e))?;

        let codes_file = AudioCodesFile {
            version: CODES_FILE_VERSION,
            sample_rate: original_sr,
            num_codebooks: codes_shape[1],
            num_steps: codes_shape[0],
            codes: codes_vec,
        };

        let json = serde_json::to_string_pretty(&codes_file)?;
        fs::write(codes_path, json)?;
        tracing::info!(path = ?codes_path, "Saved codes");
    }

    tracing::info!("Decoding...");
    let reconstructed = model
        .decode_codes(&codes)
        .map_err(|e| anyhow::anyhow!("Failed to decode: {}", e))?;

    let num_samples = reconstructed.dims()[0];
    let sample_rate = 24000;
    let duration_secs = num_samples as f32 / sample_rate as f32;

    tracing::info!(duration_secs, num_samples, sample_rate, "Output audio");

    write_wav(output, &reconstructed, sample_rate)?;

    tracing::info!(
        input_duration = original_duration,
        output_duration = duration_secs,
        path = ?output,
        "Round-trip complete"
    );

    Ok(())
}

#[cfg(not(feature = "audio-loading"))]
fn roundtrip(
    _model: &mut Model,
    _input: &PathBuf,
    _output: &PathBuf,
    _save_codes: Option<&PathBuf>,
) -> Result<()> {
    bail!("Round-trip requires the 'audio-loading' feature. Rebuild with --features audio-loading")
}
