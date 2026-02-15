//! Model configuration loaded from `config.json` (HuggingFace Qwen3-Omni).
//!
//! Mirrors:
//! - Python: `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/thinker/layers.py` (ThinkerModelArgs)
//! - Python: `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/talker/config.py`
//! - Python: `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/code2wav/config.py`
//! - Python: `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/encoders/audio.py` (AudioEncoderConfig)

use serde::Deserialize;
use std::path::Path;

/// Top-level model config (loaded from config.json).
#[derive(Debug, Clone, Deserialize)]
pub struct ModelConfig {
    pub thinker_config: Option<ThinkerConfigWrapper>,
    pub talker_config: Option<TalkerConfig>,
    pub code2wav_config: Option<Code2WavConfig>,
}

impl ModelConfig {
    /// Load from `config.json` (or `thinker_config.json`) in the model directory.
    /// Accepts both Rust shape (thinker_config: { text_config, audio_config }) and
    /// Python shape (top-level text_config, audio_config, talker_config, code2wav_config).
    pub fn from_path(path: &Path) -> anyhow::Result<Self> {
        let config_path = if path.is_dir() {
            let config = path.join("config.json");
            if config.exists() {
                config
            } else {
                path.join("thinker_config.json")
            }
        } else {
            path.to_path_buf()
        };
        let data = std::fs::read_to_string(&config_path)?;
        let v: serde_json::Value = serde_json::from_str(&data)?;
        let normalized = if v.get("thinker_config").is_none() && v.get("text_config").is_some() {
            // Python-shaped: wrap text_config + audio_config into thinker_config
            let thinker = serde_json::json!({
                "text_config": v.get("text_config"),
                "audio_config": v.get("audio_config"),
            });
            let mut m = serde_json::Map::new();
            m.insert("thinker_config".to_string(), thinker);
            if let Some(t) = v.get("talker_config") {
                m.insert("talker_config".to_string(), t.clone());
            }
            if let Some(c) = v.get("code2wav_config") {
                m.insert("code2wav_config".to_string(), c.clone());
            }
            serde_json::Value::Object(m)
        } else {
            v
        };
        let config: Self = serde_json::from_value(normalized)?;
        Ok(config)
    }

    pub fn thinker_text_config(&self) -> ThinkerTextConfig {
        self.thinker_config
            .as_ref()
            .and_then(|t| t.text_config.clone())
            .unwrap_or_default()
    }

    pub fn audio_config(&self) -> AudioEncoderConfig {
        self.thinker_config
            .as_ref()
            .and_then(|t| t.audio_config.clone())
            .unwrap_or_default()
    }

    pub fn talker(&self) -> TalkerConfig {
        self.talker_config.clone().unwrap_or_default()
    }

    pub fn code2wav(&self) -> Code2WavConfig {
        self.code2wav_config.clone().unwrap_or_default()
    }
}

// ─── Thinker ──────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ThinkerConfigWrapper {
    pub text_config: Option<ThinkerTextConfig>,
    pub audio_config: Option<AudioEncoderConfig>,
}

/// Thinker text backbone: MoE transformer.
#[derive(Debug, Clone, Deserialize)]
pub struct ThinkerTextConfig {
    #[serde(default = "default_model_type")]
    pub model_type: String,
    #[serde(default = "default_thinker_hidden")]
    pub hidden_size: usize,
    #[serde(default = "default_thinker_layers")]
    pub num_hidden_layers: usize,
    #[serde(default = "default_thinker_heads")]
    pub num_attention_heads: usize,
    #[serde(default = "default_thinker_kv_heads")]
    pub num_key_value_heads: usize,
    #[serde(default = "default_thinker_experts")]
    pub num_experts: usize,
    #[serde(default = "default_thinker_experts_per_tok")]
    pub num_experts_per_tok: usize,
    #[serde(default = "default_thinker_moe_intermediate")]
    pub moe_intermediate_size: usize,
    #[serde(default)]
    pub shared_expert_intermediate_size: usize,
    #[serde(default = "default_rms_norm_eps")]
    pub rms_norm_eps: f32,
    #[serde(default = "default_thinker_vocab")]
    pub vocab_size: usize,
    #[serde(default = "default_rope_theta")]
    pub rope_theta: f64,
    #[serde(default)]
    pub attention_bias: bool,
    #[serde(default = "default_true")]
    pub use_qk_norm: bool,
    pub head_dim: Option<usize>,
    pub max_position_embeddings: Option<usize>,
    #[serde(default)]
    pub tie_word_embeddings: bool,
}

impl Default for ThinkerTextConfig {
    fn default() -> Self {
        Self {
            model_type: "qwen3_omni_moe_thinker".to_string(),
            hidden_size: 2048,
            num_hidden_layers: 48,
            num_attention_heads: 32,
            num_key_value_heads: 4,
            num_experts: 128,
            num_experts_per_tok: 8,
            moe_intermediate_size: 768,
            shared_expert_intermediate_size: 0,
            rms_norm_eps: 1e-6,
            vocab_size: 152_064,
            rope_theta: 1_000_000.0,
            attention_bias: false,
            use_qk_norm: true,
            head_dim: None,
            max_position_embeddings: None,
            tie_word_embeddings: false,
        }
    }
}

impl ThinkerTextConfig {
    pub fn head_dim(&self) -> usize {
        self.head_dim
            .unwrap_or(self.hidden_size / self.num_attention_heads)
    }
}

// ─── Audio Encoder ────────────────────────────────────────

/// Audio encoder config (AuT): Conv2d stem + 32 transformer encoder layers.
#[derive(Debug, Clone, Deserialize)]
pub struct AudioEncoderConfig {
    #[serde(default = "default_mel_bins")]
    pub num_mel_bins: usize,
    #[serde(default = "default_d_model")]
    pub d_model: usize,
    #[serde(default = "default_encoder_layers")]
    pub encoder_layers: usize,
    #[serde(default = "default_encoder_heads")]
    pub encoder_attention_heads: usize,
    #[serde(default = "default_encoder_ffn")]
    pub encoder_ffn_dim: usize,
    #[serde(default = "default_output_dim")]
    pub output_dim: usize,
    #[serde(default = "default_max_source_positions")]
    pub max_source_positions: usize,
    #[serde(default = "default_downsample_hidden")]
    pub downsample_hidden_size: usize,
    #[serde(default)]
    pub scale_embedding: bool,
}

impl Default for AudioEncoderConfig {
    fn default() -> Self {
        Self {
            num_mel_bins: 128,
            d_model: 1280,
            encoder_layers: 32,
            encoder_attention_heads: 20,
            encoder_ffn_dim: 5120,
            output_dim: 2048,
            max_source_positions: 1500,
            downsample_hidden_size: 480,
            scale_embedding: false,
        }
    }
}

impl AudioEncoderConfig {
    /// Spatial mel dimension after 3x stride-2 convolutions.
    pub fn conv_output_mel_dim(&self) -> usize {
        let mut d = self.num_mel_bins;
        for _ in 0..3 {
            d = (d + 2 * 1 - 3) / 2 + 1;
        }
        d
    }

    /// Flattened conv output: downsample_hidden_size * conv_output_mel_dim.
    pub fn conv_out_input_dim(&self) -> usize {
        self.downsample_hidden_size * self.conv_output_mel_dim()
    }

    pub fn head_dim(&self) -> usize {
        self.d_model / self.encoder_attention_heads
    }
}

// ─── Talker ───────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct TalkerConfig {
    #[serde(default = "default_thinker_hidden")]
    pub thinker_hidden_size: usize,
    #[serde(default = "default_accept_layer")]
    pub accept_hidden_layer: usize,
    #[serde(default = "default_code_groups")]
    pub num_code_groups: usize,
    pub text_config: Option<TalkerTextConfig>,
    pub code_predictor_config: Option<TalkerCodePredictorConfig>,
}

impl Default for TalkerConfig {
    fn default() -> Self {
        Self {
            thinker_hidden_size: 2048,
            accept_hidden_layer: 18,
            num_code_groups: 32,
            text_config: Some(TalkerTextConfig::default()),
            code_predictor_config: Some(TalkerCodePredictorConfig::default()),
        }
    }
}

impl TalkerConfig {
    pub fn text(&self) -> TalkerTextConfig {
        self.text_config.clone().unwrap_or_default()
    }

    pub fn code_predictor(&self) -> TalkerCodePredictorConfig {
        self.code_predictor_config.clone().unwrap_or_default()
    }
}

/// Talker text decoder: 20 MoE layers.
#[derive(Debug, Clone, Deserialize)]
pub struct TalkerTextConfig {
    #[serde(default = "default_talker_vocab")]
    pub vocab_size: usize,
    #[serde(default = "default_talker_hidden")]
    pub hidden_size: usize,
    #[serde(default = "default_talker_layers")]
    pub num_hidden_layers: usize,
    #[serde(default = "default_talker_heads")]
    pub num_attention_heads: usize,
    #[serde(default = "default_talker_kv_heads")]
    pub num_key_value_heads: usize,
    #[serde(default = "default_thinker_experts")]
    pub num_experts: usize,
    #[serde(default = "default_thinker_experts_per_tok")]
    pub num_experts_per_tok: usize,
    #[serde(default = "default_talker_moe_intermediate")]
    pub moe_intermediate_size: usize,
    #[serde(default)]
    pub shared_expert_intermediate_size: usize,
    #[serde(default = "default_rms_norm_eps")]
    pub rms_norm_eps: f32,
    #[serde(default = "default_rope_theta")]
    pub rope_theta: f64,
    #[serde(default = "default_max_pos")]
    pub max_position_embeddings: usize,
    #[serde(default = "default_talker_head_dim")]
    pub head_dim: usize,
}

impl Default for TalkerTextConfig {
    fn default() -> Self {
        Self {
            vocab_size: 4206,
            hidden_size: 1024,
            num_hidden_layers: 20,
            num_attention_heads: 16,
            num_key_value_heads: 2,
            num_experts: 128,
            num_experts_per_tok: 8,
            moe_intermediate_size: 384,
            shared_expert_intermediate_size: 0,
            rms_norm_eps: 1e-6,
            rope_theta: 1_000_000.0,
            max_position_embeddings: 65536,
            head_dim: 64,
        }
    }
}

/// Code predictor: 5 dense decoder layers.
#[derive(Debug, Clone, Deserialize)]
pub struct TalkerCodePredictorConfig {
    #[serde(default = "default_talker_hidden")]
    pub hidden_size: usize,
    #[serde(default = "default_code_pred_layers")]
    pub num_hidden_layers: usize,
    #[serde(default = "default_talker_heads")]
    pub num_attention_heads: usize,
    #[serde(default = "default_code_pred_kv_heads")]
    pub num_key_value_heads: usize,
    #[serde(default = "default_code_pred_intermediate")]
    pub intermediate_size: usize,
    #[serde(default = "default_rms_norm_eps")]
    pub rms_norm_eps: f32,
    #[serde(default = "default_rope_theta")]
    pub rope_theta: f64,
    #[serde(default = "default_max_pos")]
    pub max_position_embeddings: usize,
    #[serde(default = "default_talker_head_dim")]
    pub head_dim: usize,
    #[serde(default = "default_code_groups")]
    pub num_code_groups: usize,
    #[serde(default = "default_code_vocab")]
    pub vocab_size: usize,
}

impl Default for TalkerCodePredictorConfig {
    fn default() -> Self {
        Self {
            hidden_size: 1024,
            num_hidden_layers: 5,
            num_attention_heads: 16,
            num_key_value_heads: 8,
            intermediate_size: 3072,
            rms_norm_eps: 1e-6,
            rope_theta: 1_000_000.0,
            max_position_embeddings: 65536,
            head_dim: 64,
            num_code_groups: 32,
            vocab_size: 2048,
        }
    }
}

// ─── Code2Wav ─────────────────────────────────────────────

/// Code2Wav config: codebook + 8-layer decoder + ConvNet upsampler.
#[derive(Debug, Clone, Deserialize)]
pub struct Code2WavConfig {
    #[serde(default = "default_talker_hidden")]
    pub hidden_size: usize,
    #[serde(default = "default_c2w_layers")]
    pub num_hidden_layers: usize,
    #[serde(default = "default_talker_heads")]
    pub num_attention_heads: usize,
    #[serde(default = "default_talker_heads")]
    pub num_key_value_heads: usize,
    #[serde(default = "default_code_pred_intermediate")]
    pub intermediate_size: usize,
    #[serde(default = "default_c2w_rms_eps")]
    pub rms_norm_eps: f32,
    #[serde(default = "default_codebook_size")]
    pub codebook_size: usize,
    #[serde(default = "default_codebook_dim")]
    pub codebook_dim: usize,
    #[serde(default = "default_num_quantizers")]
    pub num_quantizers: usize,
    #[serde(default = "default_c2w_decoder_dim")]
    pub decoder_dim: usize,
    #[serde(default = "default_upsample_rates")]
    pub upsample_rates: Vec<usize>,
    #[serde(default = "default_sample_rate")]
    pub sample_rate: usize,
}

impl Default for Code2WavConfig {
    fn default() -> Self {
        Self {
            hidden_size: 1024,
            num_hidden_layers: 8,
            num_attention_heads: 16,
            num_key_value_heads: 16,
            intermediate_size: 3072,
            rms_norm_eps: 1e-5,
            codebook_size: 2048,
            codebook_dim: 512,
            num_quantizers: 16,
            decoder_dim: 1536,
            upsample_rates: vec![8, 5, 4, 3],
            sample_rate: 24_000,
        }
    }
}

impl Code2WavConfig {
    /// Total upsample factor: product of upsample_rates (8*5*4*3 = 480).
    pub fn total_upsample_factor(&self) -> usize {
        self.upsample_rates.iter().product()
    }

    pub fn head_dim(&self) -> usize {
        self.hidden_size / self.num_attention_heads
    }
}

// ─── Default helpers ──────────────────────────────────────

fn default_model_type() -> String { "qwen3_omni_moe_thinker".to_string() }
fn default_true() -> bool { true }
fn default_thinker_hidden() -> usize { 2048 }
fn default_thinker_layers() -> usize { 48 }
fn default_thinker_heads() -> usize { 32 }
fn default_thinker_kv_heads() -> usize { 4 }
fn default_thinker_experts() -> usize { 128 }
fn default_thinker_experts_per_tok() -> usize { 8 }
fn default_thinker_moe_intermediate() -> usize { 768 }
fn default_rms_norm_eps() -> f32 { 1e-6 }
fn default_thinker_vocab() -> usize { 152_064 }
fn default_rope_theta() -> f64 { 1_000_000.0 }
fn default_mel_bins() -> usize { 128 }
fn default_d_model() -> usize { 1280 }
fn default_encoder_layers() -> usize { 32 }
fn default_encoder_heads() -> usize { 20 }
fn default_encoder_ffn() -> usize { 5120 }
fn default_output_dim() -> usize { 2048 }
fn default_max_source_positions() -> usize { 1500 }
fn default_downsample_hidden() -> usize { 480 }
fn default_accept_layer() -> usize { 18 }
fn default_code_groups() -> usize { 32 }
fn default_talker_vocab() -> usize { 4206 }
fn default_talker_hidden() -> usize { 1024 }
fn default_talker_layers() -> usize { 20 }
fn default_talker_heads() -> usize { 16 }
fn default_talker_kv_heads() -> usize { 2 }
fn default_talker_moe_intermediate() -> usize { 384 }
fn default_max_pos() -> usize { 65536 }
fn default_talker_head_dim() -> usize { 64 }
fn default_code_pred_layers() -> usize { 5 }
fn default_code_pred_kv_heads() -> usize { 8 }
fn default_code_pred_intermediate() -> usize { 3072 }
fn default_code_vocab() -> usize { 2048 }
fn default_c2w_layers() -> usize { 8 }
fn default_c2w_rms_eps() -> f32 { 1e-5 }
fn default_codebook_size() -> usize { 2048 }
fn default_codebook_dim() -> usize { 512 }
fn default_num_quantizers() -> usize { 16 }
fn default_c2w_decoder_dim() -> usize { 1536 }
fn default_upsample_rates() -> Vec<usize> { vec![8, 5, 4, 3] }
fn default_sample_rate() -> usize { 24_000 }
