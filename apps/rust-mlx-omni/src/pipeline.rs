//! Full Qwen3-Omni pipeline: audio → text, text → audio, audio → audio.
//!
//! Port of `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/pipeline.py`.

use std::path::Path;

use mlx_rs::{module::ModuleParametersExt, ops::indexing, Array};

use crate::{
    audio_encoder::Qwen3OmniAudioEncoder,
    code2wav::Qwen3OmniCode2Wav,
    config::ModelConfig,
    generate::TextGenerator,
    mel,
    talker::Qwen3OmniTalker,
    thinker::Qwen3OmniThinker,
};

/// Full Qwen3-Omni pipeline.
pub struct FullOmniPipeline {
    pub thinker: Qwen3OmniThinker,
    pub audio_encoder: Qwen3OmniAudioEncoder,
    pub talker: Qwen3OmniTalker,
    pub code2wav: Qwen3OmniCode2Wav,
    pub config: ModelConfig,
    pub generator: TextGenerator,
}

impl FullOmniPipeline {
    /// Load the full pipeline from a model directory containing safetensors + config.json + tokenizer.json.
    pub fn load(model_dir: &Path) -> anyhow::Result<Self> {
        let config = ModelConfig::from_path(model_dir)?;
        let thinker_config = config.thinker_text_config();
        let audio_config = config.audio_config();
        let talker_config = config.talker();
        let code2wav_config = config.code2wav();

        // Create models with random weights
        let mut thinker = Qwen3OmniThinker::new(&thinker_config)?;
        let mut audio_encoder = Qwen3OmniAudioEncoder::new(&audio_config)?;
        let mut talker = Qwen3OmniTalker::new(&talker_config)?;
        let mut code2wav = Qwen3OmniCode2Wav::new(&code2wav_config)?;

        // Load weights from safetensors
        // The model directory should have model-*.safetensors files
        let safetensors_path = model_dir.join("model.safetensors");
        if safetensors_path.exists() {
            thinker.load_safetensors(&safetensors_path)?;
            audio_encoder.load_safetensors(&safetensors_path)?;
            talker.load_safetensors(&safetensors_path)?;
            code2wav.load_safetensors(&safetensors_path)?;
        } else {
            // Try loading from index (sharded model)
            tracing::info!("Looking for sharded safetensors in {:?}", model_dir);
            // TODO: Implement sharded loading from model.safetensors.index.json
        }

        // Load tokenizer
        let generator = TextGenerator::new(model_dir, &thinker_config)?;

        Ok(Self {
            thinker,
            audio_encoder,
            talker,
            code2wav,
            config,
            generator,
        })
    }

    /// Generate text from a prompt (chat completion). Single &mut self for server use.
    /// Returns (text, prompt_tokens, completion_tokens).
    pub fn generate_text(
        &mut self,
        prompt: &str,
        max_tokens: usize,
        temperature: f32,
    ) -> anyhow::Result<(String, usize, usize)> {
        let input_ids = self.generator.tokenize(prompt)?;
        let prompt_tokens = input_ids.shape()[1] as usize;
        let generated = self.generator.generate(
            &mut self.thinker,
            &input_ids,
            max_tokens,
            temperature,
            None,
        )?;
        let completion_tokens = generated.len();
        let text = self.generator.decode(&generated)?;
        Ok((text, prompt_tokens, completion_tokens))
    }

    /// Transcribe audio to text (STT).
    ///
    /// `audio`: raw audio samples (16kHz, f32).
    /// Returns: transcribed text.
    pub fn transcribe(&mut self, audio: &Array) -> anyhow::Result<String> {
        let mel_features = mel::mel_spectrogram(audio, 400, 160, 128, 16_000)
            .map_err(|e| anyhow::anyhow!("mel: {:?}", e))?;
        let audio_features = self.audio_encoder.forward(&mel_features)?;
        let _logits = self.thinker.forward_thinker(
            &Array::from_slice(&[1_i32], &[1, 1]),
            Some(&audio_features),
        )?;
        Ok("TODO: implement decode loop".to_string())
    }

    /// Generate speech from text (TTS).
    ///
    /// `text`: input text.
    /// Returns: waveform (24kHz, f32).
    pub fn synthesize(&mut self, text: &str) -> anyhow::Result<Array> {
        let input_ids = self.generator.tokenize(text)?;
        let (_, hidden) = self.thinker.forward_with_hidden_states(
            &input_ids,
            None,
            18,
        )?;
        let codec_logits = self.talker.forward(&hidden)?;
        let codec_ids = indexing::argmax_axis(&codec_logits, -1, false)?;
        self.code2wav
            .forward(&codec_ids)
            .map_err(|e| anyhow::anyhow!("code2wav: {:?}", e))
    }

    /// Process audio end-to-end: audio-in → audio-out.
    ///
    /// `audio`: raw audio samples (16kHz, f32).
    /// Returns: response waveform (24kHz, f32).
    pub fn process_audio(&mut self, audio: &Array) -> anyhow::Result<Array> {
        let mel_features = mel::mel_spectrogram(audio, 400, 160, 128, 16_000)
            .map_err(|e| anyhow::anyhow!("mel: {:?}", e))?;
        let audio_features = self.audio_encoder.forward(&mel_features)?;

        let input_ids = Array::from_slice(&[1_i32], &[1, 1]);
        let (_, hidden) = self.thinker.forward_with_hidden_states(
            &input_ids,
            Some(&audio_features),
            18,
        )?;

        let codec_logits = self.talker.forward(&hidden)?;
        let codec_ids = indexing::argmax_axis(&codec_logits, -1, false)?;
        self.code2wav
            .forward(&codec_ids)
            .map_err(|e| anyhow::anyhow!("code2wav: {:?}", e))
    }
}
