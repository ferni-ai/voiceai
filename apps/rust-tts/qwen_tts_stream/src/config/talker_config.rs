//! Talker model configuration.

use serde::{Deserialize, Deserializer};
use std::collections::HashMap;

use crate::config::{code_predictor_config::CodePredictorConfig, rope_config::RopeScaling};

/// Dialect value for speakers - can be either `false` (no dialect) or a dialect name string.
///
/// In Python, `spk_is_dialect` maps speaker names to either `False` or a dialect string
/// like `"cantonese"`. This enum handles both cases for proper deserialization.
#[derive(Debug, Clone, PartialEq)]
pub enum DialectValue {
    /// Speaker does not use a dialect
    NoDialect,
    /// Speaker uses the specified dialect (e.g., "cantonese", "sichuanese")
    Dialect(String),
}

impl DialectValue {
    /// Returns the dialect name if this is a dialect, None otherwise.
    pub fn as_dialect(&self) -> Option<&str> {
        match self {
            DialectValue::NoDialect => None,
            DialectValue::Dialect(name) => Some(name),
        }
    }

    /// Returns true if this is not a dialect.
    pub fn is_no_dialect(&self) -> bool {
        matches!(self, DialectValue::NoDialect)
    }
}

impl<'de> Deserialize<'de> for DialectValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de::{self, Visitor};

        struct DialectValueVisitor;

        impl<'de> Visitor<'de> for DialectValueVisitor {
            type Value = DialectValue;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a boolean false or a dialect name string")
            }

            fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                if v {
                    // True is not expected, treat as no dialect
                    Ok(DialectValue::NoDialect)
                } else {
                    Ok(DialectValue::NoDialect)
                }
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(DialectValue::Dialect(v.to_string()))
            }

            fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(DialectValue::Dialect(v))
            }
        }

        deserializer.deserialize_any(DialectValueVisitor)
    }
}

/// Configuration for the main talker model.
///
/// The talker is a transformer model that generates the first codebook (semantic tokens)
/// given text embeddings and speaker embeddings. It uses multimodal RoPE for 3D position
/// encoding (temporal, height, width).
#[derive(Debug, Clone, Deserialize)]
pub struct TalkerConfig {
    /// Code predictor sub-model configuration
    #[serde(default)]
    pub code_predictor_config: CodePredictorConfig,

    /// Vocabulary size for combined text + codec tokens (default: 3072)
    #[serde(default = "default_vocab_size")]
    pub vocab_size: usize,

    /// Hidden size of the transformer (default: 1024)
    #[serde(default = "default_hidden_size")]
    pub hidden_size: usize,

    /// Intermediate (FFN) size (default: 2048)
    #[serde(default = "default_intermediate_size")]
    pub intermediate_size: usize,

    /// Number of transformer layers (default: 20)
    #[serde(default = "default_num_hidden_layers")]
    pub num_hidden_layers: usize,

    /// Number of attention heads (default: 16)
    #[serde(default = "default_num_attention_heads")]
    pub num_attention_heads: usize,

    /// Number of key-value heads for GQA (default: 2)
    #[serde(default = "default_num_key_value_heads")]
    pub num_key_value_heads: usize,

    /// Dimension of each attention head (default: 128)
    /// Note: This is NOT hidden_size / num_attention_heads in Qwen3-TTS.
    /// The attention dimension (num_heads * head_dim) can differ from hidden_size.
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

    /// RoPE scaling configuration (includes mrope_section for multimodal RoPE)
    pub rope_scaling: Option<RopeScaling>,

    /// Whether to use bias in attention projections (default: false)
    #[serde(default)]
    pub attention_bias: bool,

    /// Attention dropout rate (default: 0.0)
    #[serde(default)]
    pub attention_dropout: f64,

    /// Number of code groups (codebooks) (default: 32)
    #[serde(default = "default_num_code_groups")]
    pub num_code_groups: usize,

    /// Text encoder hidden size (default: 2048)
    #[serde(default = "default_text_hidden_size")]
    pub text_hidden_size: usize,

    /// Text vocabulary size for text embedding layer
    #[serde(default = "default_text_vocab_size")]
    pub text_vocab_size: usize,

    /// Codec EOS token ID (default: 4198)
    #[serde(default = "default_codec_eos_token_id")]
    pub codec_eos_token_id: usize,

    /// Codec BOS token ID (default: 4197)
    #[serde(default = "default_codec_bos_id")]
    pub codec_bos_id: usize,

    /// Codec padding token ID (default: 4196)
    #[serde(default = "default_codec_pad_id")]
    pub codec_pad_id: usize,

    /// Codec "think" token ID
    #[serde(default = "default_codec_think_id")]
    pub codec_think_id: usize,

    /// Codec "no think" token ID
    #[serde(default = "default_codec_nothink_id")]
    pub codec_nothink_id: usize,

    /// Codec think BOS token ID
    #[serde(default = "default_codec_think_bos_id")]
    pub codec_think_bos_id: usize,

    /// Codec think EOS token ID
    #[serde(default = "default_codec_think_eos_id")]
    pub codec_think_eos_id: usize,

    /// Speaker ID mapping (name -> token ID)
    #[serde(default)]
    pub spk_id: Option<HashMap<String, usize>>,

    /// Which speakers use dialect - maps speaker name to dialect name (or NoDialect)
    /// In Python, this can be either `False` or a dialect string like `"cantonese"`
    #[serde(default)]
    pub spk_is_dialect: Option<HashMap<String, DialectValue>>,

    /// Language ID mapping (language -> token ID)
    #[serde(default)]
    pub codec_language_id: Option<HashMap<String, usize>>,

    /// Whether to use sliding window attention
    #[serde(default)]
    pub use_sliding_window: bool,

    /// Sliding window size
    pub sliding_window: Option<usize>,

    /// Padding token ID
    pub pad_token_id: Option<usize>,
}

fn default_vocab_size() -> usize {
    3072
}
fn default_hidden_size() -> usize {
    1024
}
fn default_intermediate_size() -> usize {
    2048
}
fn default_num_hidden_layers() -> usize {
    20
}
fn default_num_attention_heads() -> usize {
    16
}
fn default_num_key_value_heads() -> usize {
    2
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
fn default_text_hidden_size() -> usize {
    2048
}
fn default_text_vocab_size() -> usize {
    151936
}
fn default_codec_eos_token_id() -> usize {
    4198
}
fn default_codec_bos_id() -> usize {
    4197
}
fn default_codec_pad_id() -> usize {
    4196
}
fn default_codec_think_id() -> usize {
    4202
}
fn default_codec_nothink_id() -> usize {
    4203
}
fn default_codec_think_bos_id() -> usize {
    4204
}
fn default_codec_think_eos_id() -> usize {
    4205
}

impl Default for TalkerConfig {
    fn default() -> Self {
        Self {
            code_predictor_config: CodePredictorConfig::default(),
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
            text_hidden_size: default_text_hidden_size(),
            text_vocab_size: default_text_vocab_size(),
            codec_eos_token_id: default_codec_eos_token_id(),
            codec_bos_id: default_codec_bos_id(),
            codec_pad_id: default_codec_pad_id(),
            codec_think_id: default_codec_think_id(),
            codec_nothink_id: default_codec_nothink_id(),
            codec_think_bos_id: default_codec_think_bos_id(),
            codec_think_eos_id: default_codec_think_eos_id(),
            spk_id: None,
            spk_is_dialect: None,
            codec_language_id: None,
            use_sliding_window: false,
            sliding_window: None,
            pad_token_id: None,
        }
    }
}

impl TalkerConfig {
    /// Get the head dimension.
    ///
    /// Note: In Qwen3-TTS, head_dim is explicitly configured (default: 128),
    /// NOT computed as hidden_size / num_attention_heads. This allows the
    /// attention dimension to differ from the residual stream width.
    pub fn head_dim(&self) -> usize {
        self.head_dim
    }
}

impl crate::nn::attention::config::AttentionConfig for TalkerConfig {
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
