//! Fish Speech Zero-Shot Voice Cloning
//!
//! VITS2-based TTS with zero-shot voice cloning via speaker reference audio.
//! Uses ONNX encoder/decoder (ort). Feature-gated: only available when `voice-conditioning` is enabled.

#![cfg(feature = "voice-conditioning")]

use std::path::Path;
use std::sync::Mutex;

use anyhow::{Context, Result};
use candle_core::{Device, DType, Tensor};
use ort::session::Session;
use ort::value::Value;
use tracing::{debug, info, warn};

/// Fish Speech model configuration.
#[derive(Debug, Clone)]
pub struct FishSpeechConfig {
    /// Path to ONNX text encoder model.
    pub encoder_path: String,
    /// Path to ONNX decoder model (hidden_states -> waveform).
    pub decoder_path: String,
    /// Optional path to ONNX codec encoder for extract_speaker_embedding (reference audio -> embedding).
    pub codec_encoder_path: Option<String>,
    /// Output sample rate.
    pub sample_rate: u32,
    /// Speaker embedding dimension (decoder conditioning).
    pub speaker_dim: usize,
    /// Max text token length for encoder.
    pub max_text_tokens: usize,
}

impl Default for FishSpeechConfig {
    fn default() -> Self {
        Self {
            encoder_path: String::new(),
            decoder_path: String::new(),
            codec_encoder_path: None,
            sample_rate: 24000,
            speaker_dim: 512,
            max_text_tokens: 512,
        }
    }
}

/// Fish Speech TTS engine with ONNX encoder/decoder and optional codec for voice cloning.
pub struct FishSpeechEngine {
    config: FishSpeechConfig,
    device: Device,
    encoder_session: Option<Mutex<Session>>,
    decoder_session: Option<Mutex<Session>>,
    codec_encoder_session: Option<Mutex<Session>>,
    initialized: bool,
}

impl FishSpeechEngine {
    /// Create a new Fish Speech engine. Loads ONNX models when paths exist.
    pub fn new(config: FishSpeechConfig, device: &Device) -> Result<Self> {
        let encoder_session = load_session(&config.encoder_path, "Fish Speech encoder");
        let decoder_session = load_session(&config.decoder_path, "Fish Speech decoder");
        let codec_encoder_session = config
            .codec_encoder_path
            .as_deref()
            .and_then(|p| load_session(p, "Fish Speech codec encoder"));

        let initialized = encoder_session.is_some() && decoder_session.is_some();

        if initialized {
            info!("Fish Speech engine initialized with encoder + decoder");
        } else {
            warn!("Fish Speech engine created without models (synthesize will return silence)");
        }

        Ok(Self {
            config,
            device: device.clone(),
            encoder_session,
            decoder_session,
            codec_encoder_session,
            initialized,
        })
    }

    /// Whether the engine has loaded models and is ready.
    pub fn is_ready(&self) -> bool {
        self.initialized
    }

    /// Synthesize speech with optional speaker reference embedding.
    /// Returns PCM f32 audio at the configured sample rate.
    pub async fn synthesize(
        &self,
        text: &str,
        speaker_embedding: Option<&Tensor>,
        _emotion: &str,
    ) -> Result<Vec<f32>> {
        if !self.initialized {
            let duration_samples =
                (text.len() as f32 * 0.1 * self.config.sample_rate as f32) as usize;
            return Ok(vec![
                0.0f32;
                duration_samples.max(self.config.sample_rate as usize / 10)
            ]);
        }

        debug!(
            text_len = text.len(),
            has_speaker = speaker_embedding.is_some(),
            "Fish Speech synthesis"
        );

        // 1. Tokenize: simple byte-level IDs (real Fish Speech uses BPE from model dir)
        let input_ids: Vec<i64> = text
            .bytes()
            .map(|b| b as i64)
            .take(self.config.max_text_tokens)
            .collect();
        if input_ids.is_empty() {
            return Ok(vec![0.0f32; self.config.sample_rate as usize / 10]);
        }
        let seq_len = input_ids.len();

        // 2. Run encoder: input_ids [1, seq_len] -> hidden_states [1, seq_len, dim]
        let enc_session = self
            .encoder_session
            .as_ref()
            .context("Fish Speech encoder session missing")?;
        let enc_input = Value::from_array(([1usize, seq_len], input_ids.clone()))
            .context("Fish Speech encoder input")?;
        let enc_data = {
            let mut guard = enc_session
                .lock()
                .map_err(|e| anyhow::anyhow!("Fish Speech encoder lock: {e}"))?;
            let out = guard.run(ort::inputs![enc_input]).context("Fish Speech encoder run")?;
            let (_, data) = out[0]
                .try_extract_tensor::<f32>()
                .context("Fish Speech encoder output")?;
            data.to_vec()
        };

        // 3. Run decoder: encoder hidden_states [1, seq, dim] + optional speaker [1, speaker_dim] -> waveform
        let dec_session = self
            .decoder_session
            .as_ref()
            .context("Fish Speech decoder session missing")?;

        let enc_value = Value::from_array(([1usize, enc_data.len()], enc_data.to_vec()))
            .context("decoder enc")?;

        let waveform = if let Some(spk) = speaker_embedding {
            let spk_vec: Vec<f32> = spk.flatten_all().and_then(|t| t.to_vec1()).unwrap_or_default();
            let spk_len = spk_vec.len().min(self.config.speaker_dim);
            let mut padded = vec![0.0f32; self.config.speaker_dim];
            padded[..spk_len].copy_from_slice(&spk_vec[..spk_len]);
            let spk_value =
                Value::from_array(([1usize, self.config.speaker_dim], padded)).context("speaker")?;
            let mut guard = dec_session
                .lock()
                .map_err(|e| anyhow::anyhow!("Fish Speech decoder lock: {e}"))?;
            let out = guard
                .run(ort::inputs![enc_value, spk_value])
                .context("Fish Speech decoder run")?;
            let (_, wav_data) = out[0]
                .try_extract_tensor::<f32>()
                .context("Fish Speech decoder output")?;
            wav_data.to_vec()
        } else {
            let enc_value_only =
                Value::from_array(([1usize, enc_data.len()], enc_data.clone())).context("dec enc")?;
            let mut guard = dec_session
                .lock()
                .map_err(|e| anyhow::anyhow!("Fish Speech decoder lock: {e}"))?;
            let out = guard
                .run(ort::inputs![enc_value_only])
                .context("Fish Speech decoder run")?;
            let (_, wav_data) = out[0]
                .try_extract_tensor::<f32>()
                .context("Fish Speech decoder output")?;
            wav_data.to_vec()
        };

        Ok(waveform)
    }

    /// Extract speaker embedding from reference audio (e.g. 10s at 24kHz).
    pub async fn extract_speaker_embedding(
        &self,
        reference_audio: &[f32],
        sample_rate: u32,
    ) -> Result<Tensor> {
        if !self.initialized {
            return Ok(Tensor::zeros(
                &[1, self.config.speaker_dim],
                DType::F32,
                &self.device,
            )?);
        }

        let codec = match &self.codec_encoder_session {
            Some(s) => s,
            None => {
                debug!("No Fish Speech codec encoder; returning zero embedding");
                return Ok(Tensor::zeros(
                    &[1, self.config.speaker_dim],
                    DType::F32,
                    &self.device,
                )?);
            }
        };

        debug!(
            samples = reference_audio.len(),
            sample_rate,
            "Extracting speaker embedding"
        );

        // Resample to model rate if needed (e.g. 24k); for simplicity use first N samples
        let max_samples = (10 * sample_rate) as usize; // 10s cap
        let audio: Vec<f32> = reference_audio
            .iter()
            .take(max_samples)
            .copied()
            .collect();
        if audio.len() < 1000 {
            return Ok(Tensor::zeros(
                &[1, self.config.speaker_dim],
                DType::F32,
                &self.device,
            )?);
        }

        let input = Value::from_array(([1usize, audio.len()], audio))
            .context("Fish Speech codec input")?;
        let mut guard = codec
            .lock()
            .map_err(|e| anyhow::anyhow!("Fish Speech codec lock: {e}"))?;
        let outputs = guard.run(ort::inputs![input]).context("Fish Speech codec run")?;
        let (_, emb_data) = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Fish Speech codec output")?;

        let dim = emb_data.len().min(self.config.speaker_dim);
        let mut padded = vec![0.0f32; self.config.speaker_dim];
        padded[..dim].copy_from_slice(&emb_data[..dim]);

        Tensor::from_vec(padded, (1, self.config.speaker_dim), &self.device)
            .and_then(|t| t.to_dtype(DType::F32))
            .context("Fish Speech embedding tensor")
    }
}

fn load_session(path: &str, label: &str) -> Option<Mutex<Session>> {
    if path.is_empty() {
        return None;
    }
    let p = Path::new(path);
    if !p.exists() {
        warn!(path = %path, "{} model file not found", label);
        return None;
    }
    match Session::builder()
        .and_then(|b| b.commit_from_file(p))
    {
        Ok(s) => {
            info!(path = %path, "{} loaded", label);
            Some(Mutex::new(s))
        }
        Err(e) => {
            warn!(path = %path, error = %e, "{} failed to load", label);
            None
        }
    }
}
