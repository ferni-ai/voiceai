use candle_core::{DType, IndexOp, Result, Tensor};
use candle_nn::VarBuilder;

use crate::audio::encoder::{
    quantizer::EncoderSplitRVQ,
    seanet::{Downsample, EncoderTransformer, SeaNetEncoder},
};

/// Encoder for the 12Hz tokenizer.
///
/// Converts audio waveforms to discrete codes using the native Qwen3-TTS architecture.
/// The encoder produces 16 codebooks at 12.5Hz (24000/1920 samples per frame).
#[derive(Debug, Clone)]
pub struct TokenizerV2Encoder {
    seanet: SeaNetEncoder,
    transformer: EncoderTransformer,
    downsample: Downsample,
    quantizer: EncoderSplitRVQ,
    valid_num_quantizers: usize,
}

impl TokenizerV2Encoder {
    /// Create a new encoder.
    pub fn new(
        valid_num_quantizers: usize,
        device: &candle_core::Device,
        dtype: DType,
        vb: VarBuilder,
    ) -> Result<Self> {
        let seanet = SeaNetEncoder::new(vb.pp("encoder"))?;

        // Transformer: 8 layers, 512 dim, 8 heads, 2048 MLP dim
        let transformer =
            EncoderTransformer::new(512, 8, 2048, 8, device, dtype, vb.pp("encoder_transformer"))?;

        // Downsample: stride 2
        let downsample = Downsample::new(512, 2, vb.pp("downsample"))?;

        // Quantizer: 256 codebook dim, 512 input/output dim, 2048 bins
        // 1 semantic + 31 acoustic codebooks, but we only use first 16
        let quantizer = EncoderSplitRVQ::new(
            256,
            512,
            512,
            1,
            31, // n_q_semantic, n_q_acoustic
            2048,
            vb.pp("quantizer"),
        )?;

        Ok(Self {
            seanet,
            transformer,
            downsample,
            quantizer,
            valid_num_quantizers,
        })
    }

    /// Load encoder for Qwen3-TTS weights.
    ///
    /// Handles the Qwen3-TTS weight prefix structure where encoder weights
    /// are nested under "encoder." (e.g., `encoder.encoder.layers.*`).
    ///
    /// The caller should pass a VarBuilder already prefixed with "encoder."
    /// (e.g., `vb.pp("encoder")`), and this function will use it directly
    /// without adding another prefix.
    pub fn for_v2(valid_num_quantizers: usize, vb: VarBuilder) -> Result<Self> {
        let device = vb.device().clone();
        let dtype = vb.dtype();
        // Don't add another "encoder" prefix - the caller already added it
        Self::new(valid_num_quantizers, &device, dtype, vb)
    }

    /// Get the number of valid quantizers.
    pub fn valid_num_quantizers(&self) -> usize {
        self.valid_num_quantizers
    }

    /// Encode audio waveform to discrete codes.
    ///
    /// # Arguments
    /// * `audio` - Input audio waveform of shape `(batch, channels, samples)` or `(batch, samples)`
    ///
    /// # Returns
    /// * Discrete codes of shape `(batch, num_quantizers, seq_len)`
    pub fn encode(&mut self, audio: &Tensor) -> Result<Tensor> {
        // Ensure audio has channel dimension: (batch, samples) -> (batch, 1, samples)
        let audio = if audio.dims().len() == 2 {
            audio.unsqueeze(1)?
        } else {
            audio.clone()
        };

        // SeaNet encoder: [B, 1, samples] -> [B, 512, T]
        let h = self.seanet.forward(&audio)?;

        // Transpose for transformer: [B, 512, T] -> [B, T, 512]
        let h = h.transpose(1, 2)?;

        // Transformer: [B, T, 512] -> [B, T, 512]
        let h = self.transformer.forward(&h)?;

        // Transpose back: [B, T, 512] -> [B, 512, T]
        let h = h.transpose(1, 2)?;

        // Downsample: [B, 512, T] -> [B, 512, T/2]
        let h = self.downsample.forward(&h)?;

        // Quantize: [B, 512, T/2] -> [B, n_q, T/2]
        let codes = self.quantizer.encode(&h)?;

        // Limit to valid quantizers
        let n_q = codes.dim(1)?;
        if n_q > self.valid_num_quantizers {
            codes.narrow(1, 0, self.valid_num_quantizers)
        } else {
            Ok(codes)
        }
    }

    /// Encode audio with padding mask support.
    pub fn encode_with_mask(
        &mut self,
        audio: &Tensor,
        padding_mask: &Tensor,
        downsample_rate: usize,
    ) -> Result<Vec<Tensor>> {
        let codes = self.encode(audio)?;
        let batch_size = audio.dim(0)?;
        let mut result = Vec::with_capacity(batch_size);

        for b in 0..batch_size {
            let mask = padding_mask.i(b)?;
            let code = codes.i(b)?;

            let mask_f64 = mask.to_dtype(DType::F64)?;
            let valid_samples = mask_f64.sum_all()?.to_scalar::<f64>()? as usize;
            let valid_frames = valid_samples / downsample_rate;

            let seq_len = code.dim(1)?;
            let trimmed = if valid_frames < seq_len && valid_frames > 0 {
                code.narrow(1, 0, valid_frames)?
            } else {
                code.clone()
            };

            result.push(trimmed.transpose(0, 1)?);
        }

        Ok(result)
    }

    /// Reset internal state (no-op for non-streaming encoder).
    pub fn reset_state(&mut self) {
        // No streaming state in this implementation
    }
}

/// Output from the encoder containing discrete audio codes.
#[derive(Debug, Clone)]
pub struct TokenizerV2EncoderOutput {
    /// List of audio codes, each of shape `(seq_len_i, num_quantizers)`
    pub audio_codes: Vec<Tensor>,
}

impl TokenizerV2EncoderOutput {
    pub fn new(audio_codes: Vec<Tensor>) -> Self {
        Self { audio_codes }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::{DType, Device};

    #[test]
    fn test_encoder_output_shape() {
        let codes = vec![
            Tensor::zeros((25, 16), DType::I64, &Device::Cpu).unwrap(),
            Tensor::zeros((30, 16), DType::I64, &Device::Cpu).unwrap(),
        ];
        let output = TokenizerV2EncoderOutput::new(codes);
        assert_eq!(output.audio_codes.len(), 2);
        assert_eq!(output.audio_codes[0].dims(), &[25, 16]);
        assert_eq!(output.audio_codes[1].dims(), &[30, 16]);
    }
}
