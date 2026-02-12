//! Decoder configuration for the 12Hz tokenizer.

use serde::Deserialize;

/// Configuration for the 12Hz tokenizer decoder.
///
/// The decoder converts discrete codes back to audio waveforms using:
/// - Vector quantizer dequantization
/// - Transformer-based sequence modeling
/// - ConvNeXt upsampling blocks
/// - Snake activation-based vocoder
#[derive(Debug, Clone, Deserialize)]
pub struct TokenizerV2DecoderConfig {
    /// Codebook size for vector quantization (default: 2048)
    #[serde(default = "default_codebook_size")]
    pub codebook_size: usize,

    /// Hidden size for transformer (default: 1024)
    #[serde(default = "default_hidden_size")]
    pub hidden_size: usize,

    /// Latent dimension after VQ (default: 1024)
    #[serde(default = "default_latent_dim")]
    pub latent_dim: usize,

    /// Codebook dimension (default: 256)
    #[serde(default = "default_codebook_dim")]
    pub codebook_dim: usize,

    /// Maximum position embeddings (default: 8000)
    #[serde(default = "default_max_position_embeddings")]
    pub max_position_embeddings: usize,

    /// RoPE theta base (default: 10000.0)
    #[serde(default = "default_rope_theta")]
    pub rope_theta: f64,

    /// Number of attention heads (default: 16)
    #[serde(default = "default_num_attention_heads")]
    pub num_attention_heads: usize,

    /// Number of key-value heads (default: 16)
    #[serde(default = "default_num_key_value_heads")]
    pub num_key_value_heads: usize,

    /// Head dimension (optional, defaults to hidden_size / num_attention_heads)
    #[serde(default)]
    pub head_dim: Option<usize>,

    /// Whether to use attention bias (default: false)
    #[serde(default)]
    pub attention_bias: bool,

    /// Sliding window size for attention (default: 72)
    #[serde(default = "default_sliding_window")]
    pub sliding_window: usize,

    /// Intermediate (FFN) size (default: 3072)
    #[serde(default = "default_intermediate_size")]
    pub intermediate_size: usize,

    /// Activation function (default: "silu")
    #[serde(default = "default_hidden_act")]
    pub hidden_act: String,

    /// LayerScale initial value (default: 0.01)
    #[serde(default = "default_layer_scale_initial_scale")]
    pub layer_scale_initial_scale: f64,

    /// RMS norm epsilon (default: 1e-5)
    #[serde(default = "default_rms_norm_eps")]
    pub rms_norm_eps: f64,

    /// Number of transformer layers (default: 8)
    #[serde(default = "default_num_hidden_layers")]
    pub num_hidden_layers: usize,

    /// Number of residual quantizers (default: 16)
    #[serde(default = "default_num_quantizers")]
    pub num_quantizers: usize,

    /// Upsampling rates for vocoder (default: [8, 5, 4, 3])
    #[serde(default = "default_upsample_rates")]
    pub upsample_rates: Vec<usize>,

    /// Upsampling ratios for pre-vocoder (default: [2, 2])
    #[serde(default = "default_upsampling_ratios")]
    pub upsampling_ratios: Vec<usize>,

    /// Decoder dimension for vocoder (default: 1536)
    #[serde(default = "default_decoder_dim")]
    pub decoder_dim: usize,

    /// Attention dropout (default: 0.0)
    #[serde(default)]
    pub attention_dropout: f64,
}

fn default_codebook_size() -> usize {
    2048
}
fn default_hidden_size() -> usize {
    1024
}
fn default_latent_dim() -> usize {
    1024
}
fn default_codebook_dim() -> usize {
    256
}
fn default_max_position_embeddings() -> usize {
    8000
}
fn default_rope_theta() -> f64 {
    10000.0
}
fn default_num_attention_heads() -> usize {
    16
}
fn default_num_key_value_heads() -> usize {
    16
}
fn default_sliding_window() -> usize {
    72
}
fn default_intermediate_size() -> usize {
    3072
}
fn default_hidden_act() -> String {
    "silu".to_string()
}
fn default_layer_scale_initial_scale() -> f64 {
    0.01
}
fn default_rms_norm_eps() -> f64 {
    1e-5
}
fn default_num_hidden_layers() -> usize {
    8
}
fn default_num_quantizers() -> usize {
    16
}
fn default_upsample_rates() -> Vec<usize> {
    vec![8, 5, 4, 3]
}
fn default_upsampling_ratios() -> Vec<usize> {
    vec![2, 2]
}
fn default_decoder_dim() -> usize {
    1536
}

impl Default for TokenizerV2DecoderConfig {
    fn default() -> Self {
        Self {
            codebook_size: default_codebook_size(),
            hidden_size: default_hidden_size(),
            latent_dim: default_latent_dim(),
            codebook_dim: default_codebook_dim(),
            max_position_embeddings: default_max_position_embeddings(),
            rope_theta: default_rope_theta(),
            num_attention_heads: default_num_attention_heads(),
            num_key_value_heads: default_num_key_value_heads(),
            head_dim: None,
            attention_bias: false,
            sliding_window: default_sliding_window(),
            intermediate_size: default_intermediate_size(),
            hidden_act: default_hidden_act(),
            layer_scale_initial_scale: default_layer_scale_initial_scale(),
            rms_norm_eps: default_rms_norm_eps(),
            num_hidden_layers: default_num_hidden_layers(),
            num_quantizers: default_num_quantizers(),
            upsample_rates: default_upsample_rates(),
            upsampling_ratios: default_upsampling_ratios(),
            decoder_dim: default_decoder_dim(),
            attention_dropout: 0.0,
        }
    }
}

impl TokenizerV2DecoderConfig {
    /// Calculate total upsampling factor.
    pub fn total_upsample(&self) -> usize {
        self.upsample_rates.iter().product::<usize>()
            * self.upsampling_ratios.iter().product::<usize>()
    }
}
