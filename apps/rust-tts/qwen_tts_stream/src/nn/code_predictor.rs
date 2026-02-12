//! Code Predictor sub-model for generating codebooks 1-31.
//!
//! After the main talker predicts codebook 0 (semantic tokens), the code predictor
//! generates the remaining 31 codebooks (acoustic tokens) autoregressively.

use candle_core::{IndexOp, Result, Tensor};
use candle_nn::{Embedding, Linear, Module, VarBuilder, embedding, linear_no_bias};

use crate::{
    config::{code_predictor_config::CodePredictorConfig, talker_config::TalkerConfig},
    nn::{
        attention::create_causal_mask,
        decoder_layer::DecoderLayer,
        kv_cache::KVCache,
        norm::RMSNorm,
        rope::standard::RotaryEmbedding,
        sampling::{SamplingConfig, sample_token},
    },
};

/// Code predictor model backbone.
///
/// A smaller transformer that generates remaining codebooks given the hidden
/// states from the main talker.
#[derive(Debug, Clone)]
pub struct TalkerCodePredictorModel {
    layers: Vec<DecoderLayer>,
    norm: RMSNorm,
    rotary_emb: RotaryEmbedding,
    codec_embeddings: Vec<Embedding>,
}

impl TalkerCodePredictorModel {
    pub fn new(
        config: &CodePredictorConfig,
        embedding_dim: usize,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        let layers = (0..config.num_hidden_layers)
            .map(|i| DecoderLayer::new(config, i, use_flash_attn, vb.pp(format!("layers.{}", i))))
            .collect::<Result<Vec<_>>>()?;

        let norm = RMSNorm::new(config.hidden_size, config.rms_norm_eps, vb.pp("norm"))?;

        let head_dim = config.head_dim;
        let rotary_emb = RotaryEmbedding::new(
            head_dim,
            config.max_position_embeddings,
            config.rope_theta,
            vb.device(),
        )?;

        // Embeddings for each codebook except the first (which is handled by talker)
        let codec_embeddings = (0..(config.num_code_groups - 1))
            .map(|i| {
                embedding(
                    config.vocab_size,
                    embedding_dim,
                    vb.pp(format!("codec_embedding.{}", i)),
                )
            })
            .collect::<Result<Vec<_>>>()?;

        Ok(Self {
            layers,
            norm,
            rotary_emb,
            codec_embeddings,
        })
    }

    pub fn load(
        config: &CodePredictorConfig,
        embedding_dim: usize,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(config, embedding_dim, use_flash_attn, vb)
    }

    /// Get embedding for a specific codebook index.
    pub fn get_embedding(&self, codebook_idx: usize) -> Option<&Embedding> {
        if codebook_idx > 0 && codebook_idx <= self.codec_embeddings.len() {
            Some(&self.codec_embeddings[codebook_idx - 1])
        } else {
            None
        }
    }

    /// Forward pass through the transformer layers.
    pub fn forward(
        &self,
        inputs_embeds: &Tensor,
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor> {
        let (batch_size, seq_len, _) = inputs_embeds.dims3()?;

        // Create position IDs
        let position_ids = Tensor::arange(0i64, seq_len as i64, inputs_embeds.device())?
            .unsqueeze(0)?
            .expand((batch_size, seq_len))?;

        // Compute RoPE embeddings
        let (cos, sin) = self.rotary_emb.forward(inputs_embeds, &position_ids)?;

        // Create causal mask if not provided
        // This matches PyTorch behavior where a causal mask is always created
        // even when attention_mask=None is passed
        let causal_mask;
        let attention_mask = if attention_mask.is_some() {
            attention_mask
        } else {
            causal_mask = create_causal_mask(
                seq_len,
                seq_len,
                inputs_embeds.dtype(),
                inputs_embeds.device(),
            )?;
            Some(&causal_mask)
        };

        // Pass through layers
        let mut hidden_states = inputs_embeds.clone();
        for layer in &self.layers {
            hidden_states = layer.forward(&hidden_states, (&cos, &sin), attention_mask)?;
        }

        // Final normalization
        self.norm.forward(&hidden_states)
    }

    /// Forward pass with KV-cache for efficient autoregressive generation.
    ///
    /// Args:
    ///   inputs_embeds: Input embeddings (batch, seq_len, hidden_size)
    ///   cache_position: Starting position in the sequence (for RoPE)
    ///   attention_mask: Optional attention mask
    ///   cache: Mutable reference to KV-cache
    ///
    /// Returns:
    ///   Output hidden states (batch, seq_len, hidden_size)
    pub fn forward_with_cache(
        &self,
        inputs_embeds: &Tensor,
        cache_position: usize,
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
    ) -> Result<Tensor> {
        let (batch_size, seq_len, _) = inputs_embeds.dims3()?;

        // Create position IDs starting from cache_position
        let position_ids = Tensor::arange(
            cache_position as i64,
            (cache_position + seq_len) as i64,
            inputs_embeds.device(),
        )?
        .unsqueeze(0)?
        .expand((batch_size, seq_len))?;

        // Compute RoPE embeddings for these positions
        let (cos, sin) = self.rotary_emb.forward(inputs_embeds, &position_ids)?;

        // Pass through layers with cache
        let mut hidden_states = inputs_embeds.clone();
        for layer in &self.layers {
            hidden_states =
                layer.forward_with_cache(&hidden_states, (&cos, &sin), attention_mask, cache)?;
        }

        // Final normalization
        self.norm.forward(&hidden_states)
    }

    /// Get the number of layers.
    pub fn num_layers(&self) -> usize {
        self.layers.len()
    }
}

/// Code predictor for conditional generation.
///
/// Wraps the model backbone with LM heads for each codebook.
#[derive(Debug, Clone)]
pub struct TalkerCodePredictorForConditionalGeneration {
    model: TalkerCodePredictorModel,
    lm_heads: Vec<Linear>,
    small_to_mtp_projection: Option<Linear>,
    num_code_groups: usize,
}

impl TalkerCodePredictorForConditionalGeneration {
    pub fn new(
        config: &CodePredictorConfig,
        talker_config: &TalkerConfig,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        let model = TalkerCodePredictorModel::new(
            config,
            talker_config.hidden_size,
            use_flash_attn,
            vb.pp("model"),
        )?;

        // LM head for each codebook except the first
        let lm_heads = (0..(config.num_code_groups - 1))
            .map(|i| {
                linear_no_bias(
                    config.hidden_size,
                    config.vocab_size,
                    vb.pp(format!("lm_head.{}", i)),
                )
            })
            .collect::<Result<Vec<_>>>()?;

        // Projection if hidden sizes differ
        let small_to_mtp_projection = if config.hidden_size != talker_config.hidden_size {
            Some(candle_nn::linear(
                talker_config.hidden_size,
                config.hidden_size,
                vb.pp("small_to_mtp_projection"),
            )?)
        } else {
            None
        };

        Ok(Self {
            model,
            lm_heads,
            small_to_mtp_projection,
            num_code_groups: config.num_code_groups,
        })
    }

    pub fn load(
        config: &CodePredictorConfig,
        talker_config: &TalkerConfig,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(config, talker_config, use_flash_attn, vb)
    }

    /// Get input embedding layer for a specific codebook index.
    ///
    /// Args:
    ///   codebook_idx: 1-based codebook index (1 to num_code_groups - 1)
    ///
    /// Returns:
    ///   The embedding layer for the specified codebook, or None if invalid index
    pub fn get_input_embedding(&self, codebook_idx: usize) -> Option<&Embedding> {
        self.model.get_embedding(codebook_idx)
    }

    /// Generate remaining codebooks given talker hidden states.
    ///
    /// Python reference: modeling.py:1672-1680
    /// The subtalker uses sampling with temperature/top_k/top_p for more natural audio.
    ///
    /// Args:
    ///   hidden_states: Hidden states from talker after predicting codebook 0
    ///                  Shape: (batch, seq_len, hidden_size) where seq_len >= 1
    ///   attention_mask: Optional attention mask
    ///   sampling_config: Sampling configuration for the code predictor
    ///
    /// Returns:
    ///   Tensor of shape (batch, num_code_groups - 1) containing predicted codes
    pub fn generate(
        &self,
        hidden_states: &Tensor,
        attention_mask: Option<&Tensor>,
        sampling_config: &SamplingConfig,
    ) -> Result<Tensor> {
        let (batch_size, _, _) = hidden_states.dims3()?;

        // Project if needed
        let hidden_states = if let Some(ref proj) = self.small_to_mtp_projection {
            let projected = proj.forward(hidden_states)?;
            if tracing::enabled!(tracing::Level::TRACE)
                && let Ok(hs_f32) = projected.to_dtype(candle_core::DType::F32)
                && let Ok(mean) = hs_f32.mean_all().and_then(|m| m.to_scalar::<f32>())
            {
                tracing::trace!(
                    mean = format!("{:.6}", mean),
                    "code_predictor: after projection"
                );
            }
            projected
        } else {
            tracing::trace!("code_predictor: no projection needed (Identity)");
            hidden_states.clone()
        };

        // Accumulate embeddings for autoregressive generation
        let mut all_embeds = hidden_states.clone();
        let mut predicted_codes = Vec::new();

        for codebook_idx in 1..self.num_code_groups {
            // Forward through model
            let outputs = self.model.forward(&all_embeds, attention_mask)?;

            // Get logits for this codebook from the last position
            let last_hidden = outputs.i((.., outputs.dim(1)? - 1, ..))?;
            let logits = self.lm_heads[codebook_idx - 1].forward(&last_hidden)?;

            if tracing::enabled!(tracing::Level::TRACE)
                && codebook_idx <= 3
                && let Ok(logits_f32) = logits.to_dtype(candle_core::DType::F32)
                && let (Ok(max_val), Ok(min_val), Ok(argmax), Ok(mean_val)) = (
                    logits_f32.max(1).and_then(|m| Ok(m.to_vec1::<f32>()?[0])),
                    logits_f32.min(1).and_then(|m| Ok(m.to_vec1::<f32>()?[0])),
                    logits_f32
                        .argmax(1)
                        .and_then(|m| Ok(m.to_vec1::<u32>()?[0])),
                    logits_f32.mean_all().and_then(|m| m.to_scalar::<f32>()),
                )
            {
                tracing::trace!(
                    codebook = codebook_idx,
                    max = format!("{:.4}", max_val),
                    min = format!("{:.4}", min_val),
                    mean = format!("{:.4}", mean_val),
                    argmax = argmax,
                    "code_predictor logits"
                );
            }
            // Also print hidden state stats
            if tracing::enabled!(tracing::Level::TRACE)
                && codebook_idx <= 3
                && let Ok(hs_f32) = last_hidden.to_dtype(candle_core::DType::F32)
                && let (Ok(hs_mean), Ok(hs_first)) = (
                    hs_f32.mean_all().and_then(|m| m.to_scalar::<f32>()),
                    hs_f32.i((0, ..5)).and_then(|t| t.to_vec1::<f32>()),
                )
            {
                tracing::trace!(
                    codebook = codebook_idx,
                    hidden_mean = format!("{:.6}", hs_mean),
                    hidden_first = ?hs_first,
                    "code_predictor hidden"
                );
            }

            // Sample for each batch element
            // Python uses: do_sample=True, temperature=0.8, top_k=30, top_p=0.8
            let mut batch_codes = Vec::with_capacity(batch_size);
            for b in 0..batch_size {
                let batch_logits = logits.get(b)?;
                // Empty generated_tokens since code predictor doesn't use repetition penalty
                let code = sample_token(&batch_logits, sampling_config, &[])?;
                batch_codes.push(code as u32);
            }
            let code = Tensor::from_vec(batch_codes.clone(), batch_size, hidden_states.device())?;
            predicted_codes.push(code.clone());

            if tracing::enabled!(tracing::Level::TRACE) && codebook_idx <= 3 {
                tracing::trace!(
                    codebook = codebook_idx,
                    sampled_code = batch_codes[0],
                    "code_predictor sampled"
                );
            }

            // Get embedding for next iteration
            if codebook_idx < self.num_code_groups - 1 {
                let code_embed = self.model.codec_embeddings[codebook_idx - 1].forward(&code)?;

                // Project embedding if needed (same projection as hidden states)
                let code_embed = if let Some(ref proj) = self.small_to_mtp_projection {
                    proj.forward(&code_embed)?
                } else {
                    code_embed
                };

                // Print embedding stats for the predicted code
                if tracing::enabled!(tracing::Level::TRACE)
                    && codebook_idx <= 2
                    && let Ok(embed_f32) = code_embed.to_dtype(candle_core::DType::F32)
                    && let (Ok(embed_mean), Ok(embed_first)) = (
                        embed_f32.mean_all().and_then(|m| m.to_scalar::<f32>()),
                        embed_f32.i((0, ..5)).and_then(|t| t.to_vec1::<f32>()),
                    )
                {
                    tracing::trace!(
                        embedding_idx = codebook_idx - 1,
                        code = batch_codes[0],
                        mean = format!("{:.6}", embed_mean),
                        first = ?embed_first,
                        "code_predictor embedding"
                    );
                }
                if tracing::enabled!(tracing::Level::TRACE) && codebook_idx <= 2 {
                    tracing::trace!(
                        shape = ?all_embeds.dims(),
                        "code_predictor all_embeds before concat"
                    );
                }

                let code_embed = code_embed.unsqueeze(1)?;
                all_embeds = Tensor::cat(&[&all_embeds, &code_embed], 1)?;

                if tracing::enabled!(tracing::Level::TRACE) && codebook_idx <= 2 {
                    tracing::trace!(
                        shape = ?all_embeds.dims(),
                        "code_predictor all_embeds after concat"
                    );
                }
            }
        }

        // Stack all predicted codes
        Tensor::stack(&predicted_codes.iter().collect::<Vec<_>>(), 1)
    }

    /// Generate remaining codebooks with KV-cache for efficient autoregressive generation.
    ///
    /// This is the optimized version that uses KV-cache across the 31 codebook iterations.
    /// Instead of running 31 full forward passes, it:
    /// 1. First forward: process the initial 2-token input (hidden_state + code_0_embed)
    /// 2. For codebooks 2-31: only process the newly added embedding token
    ///
    /// This reduces computation from O(31 * seq^2) to O(31 * seq) per generation step.
    ///
    /// Args:
    ///   hidden_states: Hidden states from talker after predicting codebook 0
    ///                  Shape: (batch, seq_len, hidden_size) where seq_len >= 1
    ///   attention_mask: Optional attention mask (usually None for code predictor)
    ///   sampling_config: Sampling configuration for the code predictor
    ///
    /// Returns:
    ///   Tensor of shape (batch, num_code_groups - 1) containing predicted codes
    pub fn generate_with_cache(
        &self,
        hidden_states: &Tensor,
        attention_mask: Option<&Tensor>,
        sampling_config: &SamplingConfig,
    ) -> Result<Tensor> {
        let (batch_size, _, _) = hidden_states.dims3()?;

        // Project if needed
        let hidden_states = if let Some(ref proj) = self.small_to_mtp_projection {
            proj.forward(hidden_states)?
        } else {
            hidden_states.clone()
        };

        // Initialize KV-cache for code predictor layers
        let num_layers = self.model.num_layers();
        let mut cache = KVCache::with_num_layers(num_layers);

        // First forward pass: process the initial hidden_states (typically 2 tokens)
        // This populates the KV-cache
        let initial_seq_len = hidden_states.dim(1)?;
        let outputs = self.model.forward_with_cache(
            &hidden_states,
            0, // cache_position starts at 0
            attention_mask,
            &mut cache,
        )?;

        // Get logits for codebook 1 from the last position
        let last_hidden = outputs.i((.., outputs.dim(1)? - 1, ..))?;
        let logits = self.lm_heads[0].forward(&last_hidden)?;

        // Sample codebook 1
        let mut batch_codes = Vec::with_capacity(batch_size);
        for b in 0..batch_size {
            let batch_logits = logits.get(b)?;
            let code = sample_token(&batch_logits, sampling_config, &[])?;
            batch_codes.push(code as u32);
        }
        let code = Tensor::from_vec(batch_codes, batch_size, hidden_states.device())?;
        let mut predicted_codes = vec![code.clone()];

        // Current cache position (how many tokens have been processed)
        let mut cache_position = initial_seq_len;

        // Generate codebooks 2 to 31 using the cache
        for codebook_idx in 2..self.num_code_groups {
            // Get embedding for the previous code
            let code_embed = self.model.codec_embeddings[codebook_idx - 2]
                .forward(predicted_codes.last().unwrap())?;

            // Project embedding if needed
            let code_embed = if let Some(ref proj) = self.small_to_mtp_projection {
                proj.forward(&code_embed)?
            } else {
                code_embed
            };

            // Add sequence dimension: (batch, hidden) -> (batch, 1, hidden)
            let code_embed = code_embed.unsqueeze(1)?;

            // Forward only the new token using cache
            // Create causal mask for the new position
            let total_len = cache_position + 1;
            let causal_mask = create_causal_mask(
                1,         // q_len = 1 (new token)
                total_len, // kv_len = all cached + new
                code_embed.dtype(),
                code_embed.device(),
            )?;

            let outputs = self.model.forward_with_cache(
                &code_embed,
                cache_position,
                Some(&causal_mask),
                &mut cache,
            )?;

            // Get logits for this codebook
            let last_hidden = outputs.i((.., 0, ..))?; // Only 1 position
            let logits = self.lm_heads[codebook_idx - 1].forward(&last_hidden)?;

            // Sample
            let mut batch_codes = Vec::with_capacity(batch_size);
            for b in 0..batch_size {
                let batch_logits = logits.get(b)?;
                let code = sample_token(&batch_logits, sampling_config, &[])?;
                batch_codes.push(code as u32);
            }
            let code = Tensor::from_vec(batch_codes, batch_size, hidden_states.device())?;
            predicted_codes.push(code);

            cache_position += 1;
        }

        // Stack all predicted codes
        Tensor::stack(&predicted_codes.iter().collect::<Vec<_>>(), 1)
    }

    /// Forward pass for a single step during generation.
    ///
    /// Args:
    ///   inputs_embeds: Input embeddings
    ///   generation_step: Current codebook index being generated (1 to 31)
    ///   attention_mask: Optional attention mask
    ///
    /// Returns:
    ///   Logits for the current codebook
    pub fn forward_step(
        &self,
        inputs_embeds: &Tensor,
        generation_step: usize,
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor> {
        // Project if needed
        let inputs_embeds = if let Some(ref proj) = self.small_to_mtp_projection {
            proj.forward(inputs_embeds)?
        } else {
            inputs_embeds.clone()
        };

        // Forward through model
        let hidden_states = self.model.forward(&inputs_embeds, attention_mask)?;

        // Get logits for this codebook
        let lm_head_idx = generation_step
            .saturating_sub(1)
            .min(self.lm_heads.len() - 1);
        self.lm_heads[lm_head_idx].forward(&hidden_states)
    }
}
