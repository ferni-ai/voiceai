//! Code predictor configuration.

use serde::Deserialize;

use crate::config::rope_config::RopeScaling;

/// Configuration for the code predictor sub-model.
///
/// The code predictor generates codebooks 1-31 (acoustic tokens) given the hidden
/// states from the main talker after predicting codebook 0 (semantic token).
/// It uses a smaller transformer architecture with standard (non-multimodal) RoPE.
#[derive(Debug, Clone, Deserialize)]
pub struct CodePredictorConfig {
    /// Vocabulary size for codec tokens (default: 2048)
    #[serde(default = "default_vocab_size")]
    pub vocab_size: usize,

    /// Hidden size of the transformer (default: 1024)
    #[serde(default = "default_hidden_size")]
    pub hidden_size: usize,

    /// Intermediate (FFN) size (default: 3072)
    #[serde(default = "default_intermediate_size")]
    pub intermediate_size: usize,

    /// Number of transformer layers (default: 5)
    #[serde(default = "default_num_hidden_layers")]
    pub num_hidden_layers: usize,

    /// Number of attention heads (default: 16)
    #[serde(default = "default_num_attention_heads")]
    pub num_attention_heads: usize,

    /// Number of key-value heads for GQA (default: 8)
    #[serde(default = "default_num_key_value_heads")]
    pub num_key_value_heads: usize,

    /// Dimension of each attention head (default: 128)
    #[serde(default = "default_head_dim")]
    pub head_dim: usize,

    /// Activation function (default: "silu")
    #[serde(default = "default_hidden_act")]
    pub hidden_act: String,

    /// Maximum position embeddings (default: 32768)
    #[serde(default = "default_max_position_embeddings")]
    pub max_position_embeddings: usize,

    /// Weight initialization std (default: 0.02)
    #[serde(default = "default_initializer_range")]
    pub initializer_range: f64,

    /// RMS norm epsilon (default: 1e-6)
    #[serde(default = "default_rms_norm_eps")]
    pub rms_norm_eps: f64,

    /// RoPE theta base frequency (default: 10000.0)
    #[serde(default = "default_rope_theta")]
    pub rope_theta: f64,

    /// Optional RoPE scaling configuration
    pub rope_scaling: Option<RopeScaling>,

    /// Whether to use bias in attention projections (default: false)
    #[serde(default)]
    pub attention_bias: bool,

    /// Attention dropout rate (default: 0.0)
    #[serde(default)]
    pub attention_dropout: f64,

    /// Number of code groups (codebooks) to predict (default: 32)
    #[serde(default = "default_num_code_groups")]
    pub num_code_groups: usize,

    /// Whether to use sliding window attention
    #[serde(default)]
    pub use_sliding_window: bool,

    /// Sliding window size (default: 4096)
    #[serde(default = "default_sliding_window")]
    pub sliding_window: Option<usize>,

    /// Number of layers using full attention (rest use sliding window)
    #[serde(default = "default_max_window_layers")]
    pub max_window_layers: usize,

    /// Explicit layer types (computed if not provided)
    pub layer_types: Option<Vec<String>>,

    /// Padding token ID
    pub pad_token_id: Option<usize>,
}

fn default_vocab_size() -> usize {
    2048
}
fn default_hidden_size() -> usize {
    1024
}
fn default_intermediate_size() -> usize {
    3072
}
fn default_num_hidden_layers() -> usize {
    5
}
fn default_num_attention_heads() -> usize {
    16
}
fn default_num_key_value_heads() -> usize {
    8
}
fn default_head_dim() -> usize {
    128
}
fn default_hidden_act() -> String {
    "silu".to_string()
}
fn default_max_position_embeddings() -> usize {
    32768
}
fn default_initializer_range() -> f64 {
    0.02
}
fn default_rms_norm_eps() -> f64 {
    1e-6
}
fn default_rope_theta() -> f64 {
    10000.0
}
fn default_num_code_groups() -> usize {
    32
}
fn default_sliding_window() -> Option<usize> {
    Some(4096)
}
fn default_max_window_layers() -> usize {
    28
}

impl Default for CodePredictorConfig {
    fn default() -> Self {
        Self {
            vocab_size: default_vocab_size(),
            hidden_size: default_hidden_size(),
            intermediate_size: default_intermediate_size(),
            num_hidden_layers: default_num_hidden_layers(),
            num_attention_heads: default_num_attention_heads(),
            num_key_value_heads: default_num_key_value_heads(),
            head_dim: default_head_dim(),
            hidden_act: default_hidden_act(),
            max_position_embeddings: default_max_position_embeddings(),
            initializer_range: default_initializer_range(),
            rms_norm_eps: default_rms_norm_eps(),
            rope_theta: default_rope_theta(),
            rope_scaling: None,
            attention_bias: false,
            attention_dropout: 0.0,
            num_code_groups: default_num_code_groups(),
            use_sliding_window: false,
            sliding_window: default_sliding_window(),
            max_window_layers: default_max_window_layers(),
            layer_types: None,
            pad_token_id: None,
        }
    }
}

impl CodePredictorConfig {
    /// Get layer types, computing from sliding window settings if not explicitly set.
    pub fn get_layer_types(&self) -> Vec<String> {
        if let Some(ref types) = self.layer_types {
            types.clone()
        } else {
            (0..self.num_hidden_layers)
                .map(|i| {
                    if self.use_sliding_window && i >= self.max_window_layers {
                        "sliding_attention".to_string()
                    } else {
                        "full_attention".to_string()
                    }
                })
                .collect()
        }
    }
}

impl crate::nn::attention::config::AttentionConfig for CodePredictorConfig {
    fn hidden_size(&self) -> usize {
        self.hidden_size
    }

    fn num_attention_heads(&self) -> usize {
        self.num_attention_heads
    }

    fn num_key_value_heads(&self) -> usize {
        self.num_key_value_heads
    }

    fn head_dim(&self) -> usize {
        self.head_dim
    }

    fn attention_bias(&self) -> bool {
        self.attention_bias
    }

    fn rms_norm_eps(&self) -> f64 {
        self.rms_norm_eps
    }

    fn sliding_window(&self) -> Option<usize> {
        self.sliding_window
    }
}
