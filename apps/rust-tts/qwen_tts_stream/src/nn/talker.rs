//! Talker model for generating semantic codes.
//!
//! The talker is the main transformer that generates codebook 0 (semantic tokens)
//! given text embeddings and speaker embeddings. It uses multimodal RoPE for
//! 3D position encoding.

use candle_core::{IndexOp, Result, Tensor};
use candle_nn::{Embedding, Linear, Module, VarBuilder, embedding, linear_no_bias};

use crate::{
    config::talker_config::TalkerConfig,
    nn::{
        code_predictor::TalkerCodePredictorForConditionalGeneration,
        decoder_layer::TalkerDecoderLayer, kv_cache::KVCache, mlp::TalkerResizeMLP, norm::RMSNorm,
        rope::talker::TalkerRotaryEmbedding,
    },
};

/// Talker model backbone.
///
/// Transformer model with multimodal RoPE for combined text and audio processing.
#[derive(Debug, Clone)]
pub struct TalkerModel {
    layers: Vec<TalkerDecoderLayer>,
    norm: RMSNorm,
    rotary_emb: TalkerRotaryEmbedding,
    codec_embedding: Embedding,
    text_embedding: Embedding,
}

impl TalkerModel {
    pub fn new(config: &TalkerConfig, use_flash_attn: bool, vb: VarBuilder) -> Result<Self> {
        let layers = (0..config.num_hidden_layers)
            .map(|i| {
                TalkerDecoderLayer::new(config, i, use_flash_attn, vb.pp(format!("layers.{}", i)))
            })
            .collect::<Result<Vec<_>>>()?;

        let norm = RMSNorm::new(config.hidden_size, config.rms_norm_eps, vb.pp("norm"))?;

        let head_dim = config.head_dim();
        let rotary_emb = TalkerRotaryEmbedding::new(
            head_dim,
            config.max_position_embeddings,
            config.rope_theta,
            vb.device(),
        )?;

        let codec_embedding = embedding(
            config.vocab_size,
            config.hidden_size,
            vb.pp("codec_embedding"),
        )?;

        let text_embedding = embedding(
            config.text_vocab_size,
            config.text_hidden_size,
            vb.pp("text_embedding"),
        )?;

        Ok(Self {
            layers,
            norm,
            rotary_emb,
            codec_embedding,
            text_embedding,
        })
    }

    pub fn load(config: &TalkerConfig, use_flash_attn: bool, vb: VarBuilder) -> Result<Self> {
        Self::new(config, use_flash_attn, vb)
    }

    /// Get codec embedding layer.
    pub fn get_codec_embedding(&self) -> &Embedding {
        &self.codec_embedding
    }

    /// Get text embedding layer.
    pub fn get_text_embedding(&self) -> &Embedding {
        &self.text_embedding
    }

    /// Forward pass through the transformer layers.
    ///
    /// Args:
    ///   inputs_embeds: Combined embeddings (batch, seq_len, hidden_size)
    ///   position_ids: 3D position IDs (3, batch, seq_len)
    ///   attention_mask: Optional causal mask
    pub fn forward(
        &self,
        inputs_embeds: &Tensor,
        position_ids: &Tensor,
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor> {
        // Compute multimodal RoPE embeddings
        let (cos, sin) = self.rotary_emb.forward(inputs_embeds, position_ids)?;

        // Pass through layers
        let mut hidden_states = inputs_embeds.clone();
        for (layer_idx, layer) in self.layers.iter().enumerate() {
            hidden_states = layer.forward(&hidden_states, (&cos, &sin), attention_mask)?;

            if tracing::enabled!(tracing::Level::TRACE) {
                Self::print_layer_stats(&hidden_states, layer_idx)?;
            }
        }

        // Final normalization
        let output = self.norm.forward(&hidden_states)?;

        if tracing::enabled!(tracing::Level::TRACE) {
            Self::print_after_norm_stats(&output)?;
        }

        Ok(output)
    }

    /// Forward pass with KV-cache for efficient autoregressive generation.
    ///
    /// Args:
    ///   inputs_embeds: Combined embeddings (batch, seq_len, hidden_size)
    ///   position_ids: 3D position IDs (3, batch, seq_len) - should only contain positions for NEW tokens
    ///   attention_mask: Optional causal mask - should include both cached and new positions
    ///   cache: Mutable reference to KV cache
    pub fn forward_with_cache(
        &self,
        inputs_embeds: &Tensor,
        position_ids: &Tensor,
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
    ) -> Result<Tensor> {
        // Compute multimodal RoPE embeddings for the new positions only
        let (cos, sin) = self.rotary_emb.forward(inputs_embeds, position_ids)?;

        // Pass through layers with cache
        let mut hidden_states = inputs_embeds.clone();
        for (layer_idx, layer) in self.layers.iter().enumerate() {
            hidden_states =
                layer.forward_with_cache(&hidden_states, (&cos, &sin), attention_mask, cache)?;

            if tracing::enabled!(tracing::Level::TRACE) {
                Self::print_layer_stats(&hidden_states, layer_idx)?;
            }
        }

        // Final normalization
        let output = self.norm.forward(&hidden_states)?;

        if tracing::enabled!(tracing::Level::TRACE) {
            Self::print_after_norm_stats(&output)?;
        }

        Ok(output)
    }

    /// Print hidden state statistics for debugging.
    fn print_layer_stats(hidden_states: &Tensor, layer_idx: usize) -> Result<()> {
        let hs_f32 = hidden_states.to_dtype(candle_core::DType::F32)?;
        let mean_val = hs_f32.mean_all()?.to_scalar::<f32>()?;
        let min_val = hs_f32
            .min(candle_core::D::Minus1)?
            .min(candle_core::D::Minus1)?
            .to_vec1::<f32>()?[0];
        let max_val = hs_f32
            .max(candle_core::D::Minus1)?
            .max(candle_core::D::Minus1)?
            .to_vec1::<f32>()?[0];

        // Get last position, first 5 values
        let seq_len = hidden_states.dim(1)?;
        let last_pos = hs_f32.i((.., seq_len - 1, ..5))?.to_vec2::<f32>()?;
        let first_vals: Vec<String> = last_pos[0].iter().map(|v| format!("{:.4}", v)).collect();

        // Compute std manually (variance then sqrt)
        let variance = hs_f32.var(candle_core::D::Minus1)?;
        let variance_mean = variance.mean_all()?.to_scalar::<f32>()?;
        let std_val = variance_mean.sqrt();

        tracing::trace!(
            layer = layer_idx,
            mean = format!("{:.6}", mean_val),
            std = format!("{:.4}", std_val),
            min = format!("{:.4}", min_val),
            max = format!("{:.4}", max_val),
            first_values = %first_vals.join(", "),
            "Layer stats"
        );
        Ok(())
    }

    /// Print stats after final normalization.
    fn print_after_norm_stats(hidden_states: &Tensor) -> Result<()> {
        let hs_f32 = hidden_states.to_dtype(candle_core::DType::F32)?;
        let mean_val = hs_f32.mean_all()?.to_scalar::<f32>()?;
        let min_val = hs_f32
            .min(candle_core::D::Minus1)?
            .min(candle_core::D::Minus1)?
            .to_vec1::<f32>()?[0];
        let max_val = hs_f32
            .max(candle_core::D::Minus1)?
            .max(candle_core::D::Minus1)?
            .to_vec1::<f32>()?[0];

        let seq_len = hidden_states.dim(1)?;
        let last_pos = hs_f32.i((.., seq_len - 1, ..5))?.to_vec2::<f32>()?;
        let first_vals: Vec<String> = last_pos[0].iter().map(|v| format!("{:.4}", v)).collect();

        let variance = hs_f32.var(candle_core::D::Minus1)?;
        let variance_mean = variance.mean_all()?.to_scalar::<f32>()?;
        let std_val = variance_mean.sqrt();

        tracing::trace!(
            mean = format!("{:.6}", mean_val),
            std = format!("{:.4}", std_val),
            min = format!("{:.4}", min_val),
            max = format!("{:.4}", max_val),
            first_values = %first_vals.join(", "),
            "After norm stats"
        );
        Ok(())
    }

    /// Get the number of transformer layers.
    pub fn num_layers(&self) -> usize {
        self.layers.len()
    }
}

/// Talker model for conditional generation.
///
/// Combines the talker backbone with LM head for codebook 0 prediction
/// and code predictor for codebooks 1-31.
#[derive(Debug, Clone)]
pub struct TalkerForConditionalGeneration {
    model: TalkerModel,
    lm_head: Linear,
    text_projection: TalkerResizeMLP,
    code_predictor: TalkerCodePredictorForConditionalGeneration,
    codec_eos_token_id: usize,
    codec_bos_id: usize,
    codec_pad_id: usize,
    codec_think_id: usize,
    codec_nothink_id: usize,
    codec_think_bos_id: usize,
    codec_think_eos_id: usize,
    num_code_groups: usize,
    hidden_size: usize,
}

impl TalkerForConditionalGeneration {
    pub fn new(config: &TalkerConfig, use_flash_attn: bool, vb: VarBuilder) -> Result<Self> {
        let model = TalkerModel::new(config, use_flash_attn, vb.pp("model"))?;

        let lm_head = linear_no_bias(
            config.hidden_size,
            config.vocab_size,
            vb.pp("codec_head"), // Note: Python uses codec_head, not lm_head
        )?;

        // text_projection: projects text embeddings from text_hidden_size to hidden_size
        // Python: TalkerResizeMLP(text_hidden_size, text_hidden_size, hidden_size, hidden_act, bias=True)
        let text_projection = TalkerResizeMLP::new(
            config.text_hidden_size,
            config.text_hidden_size,
            config.hidden_size,
            &config.hidden_act,
            true, // bias=True for text_projection
            vb.pp("text_projection"),
        )?;

        let code_predictor = TalkerCodePredictorForConditionalGeneration::new(
            &config.code_predictor_config,
            config,
            use_flash_attn,
            vb.pp("code_predictor"),
        )?;

        Ok(Self {
            model,
            lm_head,
            text_projection,
            code_predictor,
            codec_eos_token_id: config.codec_eos_token_id,
            codec_bos_id: config.codec_bos_id,
            codec_pad_id: config.codec_pad_id,
            codec_think_id: config.codec_think_id,
            codec_nothink_id: config.codec_nothink_id,
            codec_think_bos_id: config.codec_think_bos_id,
            codec_think_eos_id: config.codec_think_eos_id,
            num_code_groups: config.num_code_groups,
            hidden_size: config.hidden_size,
        })
    }

    pub fn load(config: &TalkerConfig, use_flash_attn: bool, vb: VarBuilder) -> Result<Self> {
        Self::new(config, use_flash_attn, vb)
    }

    /// Get the talker model backbone.
    pub fn get_model(&self) -> &TalkerModel {
        &self.model
    }

    /// Get the code predictor.
    pub fn get_code_predictor(&self) -> &TalkerCodePredictorForConditionalGeneration {
        &self.code_predictor
    }

    /// Get special token IDs.
    pub fn get_special_tokens(&self) -> (usize, usize, usize) {
        (
            self.codec_eos_token_id,
            self.codec_bos_id,
            self.codec_pad_id,
        )
    }

    /// Get codec "think" token IDs for prompt construction.
    pub fn get_think_tokens(&self) -> (usize, usize, usize, usize) {
        (
            self.codec_think_id,
            self.codec_nothink_id,
            self.codec_think_bos_id,
            self.codec_think_eos_id,
        )
    }

    /// Get hidden size.
    pub fn hidden_size(&self) -> usize {
        self.hidden_size
    }

    /// Project text embeddings from text_hidden_size to hidden_size.
    ///
    /// This is used to project text encoder outputs into the talker's embedding space.
    /// Python equivalent: self.talker.text_projection(text_embeds)
    pub fn project_text_embeds(&self, text_embeds: &Tensor) -> Result<Tensor> {
        self.text_projection.forward(text_embeds)
    }

    /// Embed text token IDs and project to hidden_size.
    ///
    /// Combines get_text_embeddings() and text_projection() in one step.
    pub fn embed_and_project_text(&self, text_ids: &Tensor) -> Result<Tensor> {
        let text_embeds = self.model.text_embedding.forward(text_ids)?;
        self.text_projection.forward(&text_embeds)
    }

    /// Get codec embedding for a token ID.
    pub fn get_codec_embedding(
        &self,
        token_id: usize,
        device: &candle_core::Device,
    ) -> Result<Tensor> {
        let id_tensor = Tensor::new(&[token_id as u32], device)?;
        self.model.codec_embedding.forward(&id_tensor)
    }

    /// Forward pass to get logits for codebook 0.
    ///
    /// Args:
    ///   inputs_embeds: Combined embeddings
    ///   position_ids: 3D position IDs
    ///   attention_mask: Optional mask
    ///
    /// Returns:
    ///   (logits, hidden_states)
    pub fn forward(
        &self,
        inputs_embeds: &Tensor,
        position_ids: &Tensor,
        attention_mask: Option<&Tensor>,
    ) -> Result<(Tensor, Tensor)> {
        let hidden_states = self
            .model
            .forward(inputs_embeds, position_ids, attention_mask)?;
        let logits = self.lm_head.forward(&hidden_states)?;
        Ok((logits, hidden_states))
    }

    /// Forward pass with KV-cache for efficient autoregressive generation.
    ///
    /// Args:
    ///   inputs_embeds: Combined embeddings (only new tokens when cache is populated)
    ///   position_ids: 3D position IDs (only for new tokens)
    ///   attention_mask: Causal mask (covering both cached and new positions)
    ///   cache: Mutable KV cache
    ///
    /// Returns:
    ///   (logits, hidden_states)
    pub fn forward_with_cache(
        &self,
        inputs_embeds: &Tensor,
        position_ids: &Tensor,
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
    ) -> Result<(Tensor, Tensor)> {
        let hidden_states =
            self.model
                .forward_with_cache(inputs_embeds, position_ids, attention_mask, cache)?;
        let logits = self.lm_head.forward(&hidden_states)?;
        Ok((logits, hidden_states))
    }

    /// Get the number of transformer layers (for cache initialization).
    pub fn num_layers(&self) -> usize {
        self.model.num_layers()
    }

    /// Generate all codebooks for a single step.
    ///
    /// Args:
    ///   inputs_embeds: Input embeddings
    ///   position_ids: 3D position IDs
    ///   attention_mask: Optional mask
    ///   sampling_config: Sampling configuration for code predictor
    ///
    /// Returns:
    ///   Tensor of shape (batch, num_code_groups) with all codes
    pub fn generate_step(
        &self,
        inputs_embeds: &Tensor,
        position_ids: &Tensor,
        attention_mask: Option<&Tensor>,
        sampling_config: &super::sampling::SamplingConfig,
    ) -> Result<Tensor> {
        // Get logits and hidden states for codebook 0
        let (logits, hidden_states) = self.forward(inputs_embeds, position_ids, attention_mask)?;

        // Sample codebook 0 (greedy - argmax)
        let last_logits = logits.i((.., logits.dim(1)? - 1, ..))?;
        let code_0 = last_logits.argmax(candle_core::D::Minus1)?;

        // Get last hidden state for code predictor
        let last_hidden = hidden_states.i((.., hidden_states.dim(1)? - 1, ..))?;
        let last_hidden = last_hidden.unsqueeze(1)?;

        // Generate remaining codebooks using subtalker sampling config
        let subtalker_config = sampling_config.for_subtalker();
        let remaining_codes =
            self.code_predictor
                .generate_with_cache(&last_hidden, None, &subtalker_config)?;

        // Combine: (batch, 1) + (batch, num_code_groups - 1) -> (batch, num_code_groups)
        let code_0 = code_0.unsqueeze(1)?;
        Tensor::cat(&[&code_0, &remaining_codes], 1)
    }

    /// Get embedding for a code token.
    pub fn embed_code(&self, code: &Tensor) -> Result<Tensor> {
        self.model.codec_embedding.forward(code)
    }

    /// Sum embeddings of all codebooks for next input.
    ///
    /// Implements the Python reference: modeling.py:1979-1984
    /// - Codebook 0: use talker's codec_embedding
    /// - Codebooks 1-31: use code_predictor's codec_embeddings[i-1]
    /// - Sum all embeddings along the codebook dimension
    pub fn sum_code_embeddings(&self, all_codes: &Tensor) -> Result<Tensor> {
        // all_codes: (batch, num_code_groups)
        let num_codebooks = all_codes.dim(1)?;

        // Embed codebook 0 using talker's embedding
        let code_0 = all_codes.i((.., 0))?;
        let mut embed_sum = self.model.codec_embedding.forward(&code_0)?;

        // Sum embeddings from remaining codebooks using code predictor's embeddings
        for i in 1..num_codebooks.min(self.num_code_groups) {
            if let Some(emb_layer) = self.code_predictor.get_input_embedding(i) {
                let code_i = all_codes.i((.., i))?;
                let embed_i = emb_layer.forward(&code_i)?;
                embed_sum = (embed_sum + embed_i)?;
            }
        }

        Ok(embed_sum)
    }
}
