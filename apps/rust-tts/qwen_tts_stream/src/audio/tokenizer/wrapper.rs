//! Unified tokenizer wrapper supporting both 12Hz and 25Hz tokenizers.

use candle_core::{Result, Tensor};

use crate::audio::{encoder::v2::TokenizerV2EncoderOutput, tokenizer::v2::TokenizerV2};

/// Tokenizer type identifier.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TokenizerType {
    /// 12.5 Hz tokenizer (V2)
    Hz12,
    /// 25 Hz tokenizer (V1)
    Hz25,
}

/// Unified wrapper for audio tokenizers.
///
/// Provides a common interface for both 12Hz and 25Hz tokenizers.
pub enum TokenizerWrapper {
    /// 12Hz tokenizer (V2)
    V2(TokenizerV2),
    // V1 would be added here for 25Hz tokenizer
}

impl TokenizerWrapper {
    /// Create from 12Hz tokenizer.
    pub fn from_v2(tokenizer: TokenizerV2) -> Self {
        Self::V2(tokenizer)
    }

    /// Get the tokenizer type.
    pub fn tokenizer_type(&self) -> TokenizerType {
        match self {
            Self::V2(_) => TokenizerType::Hz12,
        }
    }

    /// Get the tokenizer rate in Hz.
    pub fn rate(&self) -> f64 {
        match self {
            Self::V2(t) => t.config().tokenizer_rate(),
        }
    }

    /// Get the input sample rate.
    pub fn input_sample_rate(&self) -> usize {
        match self {
            Self::V2(t) => t.input_sample_rate(),
        }
    }

    /// Get the output sample rate.
    pub fn output_sample_rate(&self) -> usize {
        match self {
            Self::V2(t) => t.output_sample_rate(),
        }
    }

    /// Get the encode downsample rate (samples per code frame).
    pub fn encode_downsample_rate(&self) -> usize {
        match self {
            Self::V2(t) => t.encode_downsample_rate(),
        }
    }

    /// Get the decode upsample rate (samples per code frame).
    pub fn decode_upsample_rate(&self) -> usize {
        match self {
            Self::V2(t) => t.decode_upsample_rate(),
        }
    }

    /// Check if the encoder is available.
    pub fn has_encoder(&self) -> bool {
        match self {
            Self::V2(t) => t.has_encoder(),
        }
    }

    /// Encode audio waveform to discrete codes.
    ///
    /// Requires encoder to be loaded. Use `has_encoder()` to check availability.
    ///
    /// # Arguments
    /// * `audio` - Input audio waveform of shape `(batch, samples)`
    ///
    /// # Returns
    /// * Discrete codes of shape `(batch, num_quantizers, seq_len)`
    ///
    /// # Errors
    /// * Returns error if encoder is not loaded
    pub fn encode(&mut self, audio: &Tensor) -> Result<Tensor> {
        match self {
            Self::V2(t) => t.encode(audio),
        }
    }

    /// Encode audio with padding mask for variable-length sequences.
    ///
    /// # Arguments
    /// * `audio` - Input audio waveform of shape `(batch, samples)`
    /// * `padding_mask` - Mask of shape `(batch, samples)` where 1 = valid, 0 = padding
    ///
    /// # Returns
    /// * Encoder output containing list of code tensors
    pub fn encode_with_mask(
        &mut self,
        audio: &Tensor,
        padding_mask: &Tensor,
    ) -> Result<TokenizerV2EncoderOutput> {
        match self {
            Self::V2(t) => t.encode_with_mask(audio, padding_mask),
        }
    }

    /// Reset the encoder's internal streaming state.
    pub fn reset_encoder_state(&mut self) {
        match self {
            Self::V2(t) => t.reset_encoder_state(),
        }
    }

    /// Decode audio codes to waveform.
    ///
    /// Args:
    ///   codes: Audio codes of shape (batch, seq_len, num_quantizers)
    ///
    /// Returns:
    ///   Audio waveform of shape (batch, samples)
    pub fn decode(&self, codes: &Tensor) -> Result<Tensor> {
        match self {
            Self::V2(t) => t.decode(codes),
        }
    }

    /// Decode with chunking for long sequences.
    pub fn chunked_decode(
        &self,
        codes: &Tensor,
        chunk_size: usize,
        left_context_size: usize,
    ) -> Result<Tensor> {
        match self {
            Self::V2(t) => t.chunked_decode(codes, chunk_size, left_context_size),
        }
    }
}
