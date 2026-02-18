//! Higgs Audio V2 model configuration.
//!
//! Deserialized from HuggingFace config.json.

use serde::Deserialize;

/// Top-level Higgs Audio config.
#[derive(Debug, Clone, Deserialize)]
pub struct HiggsAudioConfig {
    pub text_config: TextConfig,
    pub hidden_size: usize,
    pub audio_num_codebooks: usize,
    pub audio_codebook_size: usize,
    pub audio_stream_bos_id: usize,
    pub audio_stream_eos_id: usize,
    pub audio_out_bos_token_id: usize,
    pub audio_eos_token_id: usize,
    #[serde(default)]
    pub audio_out_token_idx: usize,
    pub audio_dual_ffn_layers: Vec<usize>,
    pub audio_ffn_hidden_size: usize,
    pub audio_ffn_intermediate_size: usize,
    #[serde(default = "default_adapter_type")]
    pub audio_adapter_type: String,
    #[serde(default)]
    pub use_delay_pattern: bool,
    #[serde(default)]
    pub audio_embed_avg: bool,
    #[serde(default = "default_pad_token_id")]
    pub pad_token_id: usize,
}

fn default_adapter_type() -> String {
    "dual_ffn_fast_forward".to_string()
}
fn default_pad_token_id() -> usize {
    128001
}

/// Text backbone config (Llama 3.2 3B).
#[derive(Debug, Clone, Deserialize)]
pub struct TextConfig {
    pub hidden_size: usize,
    pub num_hidden_layers: usize,
    pub num_attention_heads: usize,
    pub num_key_value_heads: usize,
    pub intermediate_size: usize,
    pub vocab_size: usize,
    pub max_position_embeddings: usize,
    pub rms_norm_eps: f64,
    pub rope_theta: f64,
    pub rope_scaling: Option<RopeScaling>,
    #[serde(default = "default_head_dim")]
    pub head_dim: usize,
    pub bos_token_id: usize,
    pub eos_token_id: usize,
    #[serde(default)]
    pub tie_word_embeddings: bool,
}

fn default_head_dim() -> usize {
    128
}

#[derive(Debug, Clone, Deserialize)]
pub struct RopeScaling {
    pub factor: f64,
    pub high_freq_factor: f64,
    pub low_freq_factor: f64,
    pub original_max_position_embeddings: usize,
    pub rope_type: String,
}

impl HiggsAudioConfig {
    pub fn audio_vocab_per_codebook(&self) -> usize {
        self.audio_codebook_size + 2
    }

    pub fn audio_lm_head_size(&self) -> usize {
        self.audio_num_codebooks * self.audio_vocab_per_codebook()
    }

    pub fn has_dual_ffn(&self, layer_idx: usize) -> bool {
        self.audio_dual_ffn_layers.contains(&layer_idx)
    }

    pub fn is_fast_forward(&self) -> bool {
        self.audio_adapter_type == "dual_ffn_fast_forward"
    }
}
