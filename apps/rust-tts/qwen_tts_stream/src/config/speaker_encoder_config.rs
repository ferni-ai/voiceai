//! Speaker encoder configuration (ECAPA-TDNN).

use serde::Deserialize;

/// Configuration for the ECAPA-TDNN speaker encoder.
///
/// The speaker encoder extracts fixed-size speaker embeddings from mel spectrograms,
/// enabling voice cloning and speaker-conditioned generation.
///
/// Architecture: TDNN → SE-Res2Net blocks → Multi-layer Feature Aggregation → Attentive Statistics Pooling
#[derive(Debug, Clone, Deserialize)]
pub struct SpeakerEncoderConfig {
    /// Input mel spectrogram dimension (default: 128)
    #[serde(default = "default_mel_dim")]
    pub mel_dim: usize,

    /// Output speaker embedding dimension (default: 1024)
    #[serde(default = "default_enc_dim")]
    pub enc_dim: usize,

    /// Channel sizes for each encoder layer: [initial_tdnn, se_res2net_1, se_res2net_2, se_res2net_3, mfa]
    #[serde(default = "default_enc_channels")]
    pub enc_channels: Vec<usize>,

    /// Kernel sizes for each encoder layer
    #[serde(default = "default_enc_kernel_sizes")]
    pub enc_kernel_sizes: Vec<usize>,

    /// Dilation rates for each encoder layer
    #[serde(default = "default_enc_dilations")]
    pub enc_dilations: Vec<usize>,

    /// Attention channels in attentive statistics pooling
    #[serde(default = "default_enc_attention_channels")]
    pub enc_attention_channels: usize,

    /// Scale factor for Res2Net blocks
    #[serde(default = "default_enc_res2net_scale")]
    pub enc_res2net_scale: usize,

    /// Squeeze-excitation channel dimension
    #[serde(default = "default_enc_se_channels")]
    pub enc_se_channels: usize,

    /// Audio sample rate
    #[serde(default = "default_sample_rate")]
    pub sample_rate: usize,
}

fn default_mel_dim() -> usize {
    128
}
fn default_enc_dim() -> usize {
    1024
}
fn default_enc_channels() -> Vec<usize> {
    vec![512, 512, 512, 512, 1536]
}
fn default_enc_kernel_sizes() -> Vec<usize> {
    vec![5, 3, 3, 3, 1]
}
fn default_enc_dilations() -> Vec<usize> {
    vec![1, 2, 3, 4, 1]
}
fn default_enc_attention_channels() -> usize {
    128
}
fn default_enc_res2net_scale() -> usize {
    8
}
fn default_enc_se_channels() -> usize {
    128
}
fn default_sample_rate() -> usize {
    24000
}

impl Default for SpeakerEncoderConfig {
    fn default() -> Self {
        Self {
            mel_dim: default_mel_dim(),
            enc_dim: default_enc_dim(),
            enc_channels: default_enc_channels(),
            enc_kernel_sizes: default_enc_kernel_sizes(),
            enc_dilations: default_enc_dilations(),
            enc_attention_channels: default_enc_attention_channels(),
            enc_res2net_scale: default_enc_res2net_scale(),
            enc_se_channels: default_enc_se_channels(),
            sample_rate: default_sample_rate(),
        }
    }
}
