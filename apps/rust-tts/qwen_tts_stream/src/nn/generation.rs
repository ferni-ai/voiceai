//! Top-level Qwen3-TTS generation model.
//!
//! Combines the talker, code predictor, and speaker encoder for end-to-end
//! text-to-speech generation.
//!
//! The generation process follows the Python reference (modeling.py:2063-2287):
//! 1. Construct prompt embeddings from text tokens, language, and speaker
//! 2. Autoregressively generate codec tokens using the talker
//! 3. For each step, generate codebook 0 then codebooks 1-31 using code predictor

use candle_core::{DType, Device, IndexOp, Result, Tensor};
use candle_nn::{Module, VarBuilder};
use std::collections::HashMap;

use crate::{
    config::{talker_config::DialectValue, tts_config::Config},
    nn::{
        generation_options::GenerationOptions,
        generation_utils::{
            create_attention_mask_from_lengths, create_position_ids_with_padding,
            left_pad_sequences,
        },
        kv_cache::KVCache,
        sampling::{SamplingConfig, sample_token},
        speaker_encoder::SpeakerEncoder,
        talker::TalkerForConditionalGeneration,
    },
};

/// Output from the TTS model.
pub struct Output {
    /// Generated audio codes of shape (batch, steps, num_code_groups)
    pub codes: Tensor,
    /// Number of generation steps
    pub num_steps: usize,
    /// Effective lengths per batch item (for variable-length outputs)
    pub effective_lengths: Option<Vec<usize>>,
}

impl Output {
    /// Get codes for a specific batch item, truncated to its effective length.
    pub fn codes_for_batch(&self, batch_idx: usize) -> Result<Tensor> {
        if let Some(lengths) = self
            .effective_lengths
            .as_ref()
            .filter(|l| batch_idx < l.len())
        {
            let len = lengths[batch_idx];
            return self.codes.i((batch_idx, ..len, ..));
        }
        // Return full codes for this batch item
        self.codes.i((batch_idx, .., ..))
    }

    /// Get list of codes tensors, one per batch item, each truncated to effective length.
    pub fn codes_list(&self) -> Result<Vec<Tensor>> {
        let batch_size = self.codes.dim(0)?;
        let mut result = Vec::with_capacity(batch_size);
        for b in 0..batch_size {
            result.push(self.codes_for_batch(b)?);
        }
        Ok(result)
    }
}

/// Top-level Qwen3-TTS model for conditional generation.
///
/// Combines:
/// - Speaker encoder for extracting speaker embeddings (optional - only in Base model)
/// - Talker for generating semantic codes (codebook 0)
/// - Code predictor for generating acoustic codes (codebooks 1-31)
#[derive(Debug)]
pub struct ConditionalGeneration {
    talker: TalkerForConditionalGeneration,
    speaker_encoder: Option<SpeakerEncoder>,
    config: Config,
    device: Device,
}

impl ConditionalGeneration {
    pub fn new(config: Config, use_flash_attn: bool, vb: VarBuilder) -> Result<Self> {
        let device = vb.device().clone();

        let talker = TalkerForConditionalGeneration::new(
            &config.talker_config,
            use_flash_attn,
            vb.pp("talker"),
        )?;

        // Speaker encoder is optional - only present in Base model for voice cloning
        let speaker_encoder = if let Some(ref enc_config) = config.speaker_encoder_config {
            Some(SpeakerEncoder::new(enc_config, vb.pp("speaker_encoder"))?)
        } else {
            tracing::debug!("No speaker_encoder_config found, skipping speaker encoder loading");
            None
        };

        Ok(Self {
            talker,
            speaker_encoder,
            config,
            device,
        })
    }

    pub fn load(config: Config, use_flash_attn: bool, vb: VarBuilder) -> Result<Self> {
        Self::new(config, use_flash_attn, vb)
    }

    /// Get the speaker encoder (only available in Base model).
    pub fn get_speaker_encoder(&self) -> Option<&SpeakerEncoder> {
        self.speaker_encoder.as_ref()
    }

    /// Check if speaker encoder is available (only true for Base model).
    pub fn has_speaker_encoder(&self) -> bool {
        self.speaker_encoder.is_some()
    }

    /// Get the talker model.
    pub fn get_talker(&self) -> &TalkerForConditionalGeneration {
        &self.talker
    }

    /// Get the config.
    pub fn get_config(&self) -> &Config {
        &self.config
    }

    /// Extract speaker embedding from mel spectrogram.
    ///
    /// Args:
    ///   mel: Mel spectrogram of shape (batch, time, mel_dim)
    ///
    /// Returns:
    ///   Speaker embedding of shape (batch, enc_dim)
    ///
    /// # Errors
    /// Returns an error if the speaker encoder is not available (not a Base model).
    pub fn encode_speaker(&self, mel: &Tensor) -> Result<Tensor> {
        match &self.speaker_encoder {
            Some(encoder) => encoder.forward(mel),
            None => candle_core::bail!(
                "Speaker encoder not available - this model doesn't support voice cloning. Use a Base model for voice cloning."
            ),
        }
    }

    /// Create 3D position IDs for multimodal RoPE.
    ///
    /// For TTS, all three position dimensions (temporal, height, width) are the same
    /// since we only have 1D sequence.
    pub fn create_position_ids(&self, seq_len: usize, batch_size: usize) -> Result<Tensor> {
        let positions = Tensor::arange(0i64, seq_len as i64, &self.device)?;
        let positions = positions.unsqueeze(0)?.expand((batch_size, seq_len))?;

        // Stack 3 copies for temporal, height, width
        let position_ids = Tensor::stack(&[&positions, &positions, &positions], 0)?;

        Ok(position_ids)
    }

    /// Create causal attention mask.
    pub fn create_causal_mask(&self, seq_len: usize, dtype: DType) -> Result<Tensor> {
        // Create upper triangular mask manually
        let mut mask_data = vec![0.0f32; seq_len * seq_len];
        for i in 0..seq_len {
            for j in (i + 1)..seq_len {
                mask_data[i * seq_len + j] = f32::NEG_INFINITY;
            }
        }
        let mask = Tensor::from_vec(mask_data, (seq_len, seq_len), &self.device)?;
        let mask = mask.to_dtype(dtype)?;
        // Add batch and head dimensions
        mask.unsqueeze(0)?.unsqueeze(0)
    }

    /// Create causal attention mask for cached generation.
    ///
    /// When using KV-cache, the query only attends to a subset of positions,
    /// but can see all cached positions. This creates a mask of shape
    /// (1, 1, new_seq_len, total_seq_len).
    pub fn create_causal_mask_cached(
        &self,
        cache_len: usize,
        new_seq_len: usize,
        dtype: DType,
    ) -> Result<Tensor> {
        let total_len = cache_len + new_seq_len;

        // Create mask: each new position can see all cached positions plus
        // positions up to and including itself
        let mut mask_data = vec![0.0f32; new_seq_len * total_len];
        for i in 0..new_seq_len {
            let curr_pos = cache_len + i;
            for j in (curr_pos + 1)..total_len {
                mask_data[i * total_len + j] = f32::NEG_INFINITY;
            }
        }
        let mask = Tensor::from_vec(mask_data, (new_seq_len, total_len), &self.device)?;
        let mask = mask.to_dtype(dtype)?;
        // Add batch and head dimensions
        mask.unsqueeze(0)?.unsqueeze(0)
    }

    /// Create position IDs for a specific range (for cached generation).
    ///
    /// When generating with cache, we only need position IDs for the new tokens,
    /// starting from the cache position.
    pub fn create_position_ids_range(
        &self,
        start_pos: usize,
        seq_len: usize,
        batch_size: usize,
    ) -> Result<Tensor> {
        let positions =
            Tensor::arange(start_pos as i64, (start_pos + seq_len) as i64, &self.device)?;
        let positions = positions.unsqueeze(0)?.expand((batch_size, seq_len))?;

        // Stack 3 copies for temporal, height, width (TTS uses 1D, so all same)
        Tensor::stack(&[&positions, &positions, &positions], 0)
    }

    /// Sum embeddings across all codebooks for reference audio codes.
    ///
    /// This implements the Python reference (modeling.py:1979-1984):
    /// ```python
    /// codec_embed = []
    /// for i in range(self.talker.config.num_code_groups):
    ///     if i == 0:
    ///         codec_embed.append(self.talker.get_input_embeddings()(ref_code[:, :1]))
    ///     else:
    ///         codec_embed.append(self.talker.code_predictor.get_input_embeddings()[i-1](ref_code[:, i:i+1]))
    /// codec_embed = torch.cat(codec_embed, dim=1).sum(1).unsqueeze(0)
    /// ```
    ///
    /// Args:
    ///   ref_codes: Reference audio codes of shape (batch, time_steps, num_code_groups)
    ///
    /// Returns:
    ///   Summed embeddings of shape (batch, time_steps, hidden_size)
    fn sum_ref_code_embeddings(&self, ref_codes: &Tensor) -> Result<Tensor> {
        let (_batch_size, _time_steps, num_codebooks) = ref_codes.dims3()?;
        let num_code_groups = self.config.talker_config.num_code_groups;

        // For each time step, sum embeddings across all codebooks
        let mut embed_sum: Option<Tensor> = None;

        for i in 0..num_codebooks.min(num_code_groups) {
            // Get codes for codebook i: (batch, time_steps)
            let codes_i = ref_codes.i((.., .., i))?;

            // Embed using appropriate embedding layer
            let embed_i = if i == 0 {
                // Codebook 0: use talker's codec_embedding
                self.talker.embed_code(&codes_i)?
            } else {
                // Codebooks 1-31: use code_predictor's embeddings
                if let Some(emb_layer) = self.talker.get_code_predictor().get_input_embedding(i) {
                    emb_layer.forward(&codes_i)?
                } else {
                    continue;
                }
            };

            embed_sum = Some(match embed_sum {
                None => embed_i,
                Some(sum) => (sum + embed_i)?,
            });
        }

        embed_sum.ok_or_else(|| candle_core::Error::Msg("No codebooks to embed".to_string()))
    }

    /// Generate ICL (in-context learning) prompt for voice cloning.
    ///
    /// This implements the Python reference (modeling.py:1963-2014):
    /// - Combines reference text embeddings with target text embeddings
    /// - Creates codec embeddings from reference audio codes
    /// - Handles streaming vs non-streaming mode padding
    ///
    /// Args:
    ///   text_ids: Target text token IDs (tokens 3:-5 from full sequence)
    ///   ref_text_ids: Reference text token IDs (tokens 3:-2 from ref sequence)
    ///   ref_codes: Reference audio codes (batch, time, num_code_groups)
    ///   tts_pad_embed: TTS padding embedding
    ///   tts_eos_embed: TTS end-of-sequence embedding
    ///   non_streaming_mode: Whether to use non-streaming mode
    ///
    /// Returns:
    ///   (icl_input_embed, trailing_text_hidden) tuple
    pub fn generate_icl_prompt(
        &self,
        text_ids: &Tensor,
        ref_text_ids: &Tensor,
        ref_codes: &Tensor,
        tts_pad_embed: &Tensor,
        tts_eos_embed: &Tensor,
        non_streaming_mode: bool,
    ) -> Result<(Tensor, Tensor)> {
        let (_batch_size, _text_len) = text_ids.dims2()?;
        let (_eos_id, bos_id, pad_id) = self.talker.get_special_tokens();

        tracing::info!(
            text_ids_shape = ?text_ids.dims(),
            ref_text_ids_shape = ?ref_text_ids.dims(),
            ref_codes_shape = ?ref_codes.dims(),
            non_streaming_mode = non_streaming_mode,
            "generate_icl_prompt: input shapes"
        );

        // 1. Create text embedding: text_projection(text_embeddings(cat(ref_text_ids, text_ids)))
        //    Then append tts_eos_embed
        let combined_text_ids = Tensor::cat(&[ref_text_ids, text_ids], 1)?;
        let text_embed = self.talker.embed_and_project_text(&combined_text_ids)?;
        let text_embed = Tensor::cat(&[&text_embed, tts_eos_embed], 1)?;
        let text_lens = text_embed.dim(1)?;

        tracing::info!(
            combined_text_ids_shape = ?combined_text_ids.dims(),
            text_embed_shape = ?text_embed.dims(),
            text_lens = text_lens,
            "generate_icl_prompt: text embedding"
        );

        // 2. Create codec embedding from reference codes
        //    Sum embeddings across all codebooks for each time step
        let ref_codes_embed = self.sum_ref_code_embeddings(ref_codes)?;

        tracing::info!(
            ref_codes_embed_shape = ?ref_codes_embed.dims(),
            "generate_icl_prompt: ref_codes summed embedding"
        );

        // 3. Prepend codec BOS embedding
        let bos_tensor = Tensor::new(&[bos_id as u32], &self.device)?.unsqueeze(0)?;
        let bos_embed = self.talker.embed_code(&bos_tensor)?; // (1, 1, hidden_size)
        let codec_embed = Tensor::cat(&[&bos_embed, &ref_codes_embed], 1)?;
        let codec_lens = codec_embed.dim(1)?;

        tracing::info!(
            codec_embed_shape = ?codec_embed.dims(),
            codec_lens = codec_lens,
            "generate_icl_prompt: codec embedding (BOS + ref_codes)"
        );

        // 4. Combine text and codec embeddings based on mode
        if non_streaming_mode {
            // Non-streaming: pad text to align with codec, then append codec + tts_pad
            // icl_input_embed = text_embed + codec_pad_embed
            // icl_input_embed = cat([icl_input_embed, codec_embed + tts_pad_embed])

            // Create padding codec embedding for text content
            let pad_ids: Vec<u32> = vec![pad_id as u32; text_lens];
            let pad_tensor = Tensor::new(&pad_ids[..], &self.device)?.unsqueeze(0)?;
            let text_pad_embed = self.talker.embed_code(&pad_tensor)?;

            // Add text embedding to codec padding
            let text_with_pad = (&text_embed + &text_pad_embed)?;

            // Expand tts_pad_embed to match codec length
            let tts_pad_expanded =
                tts_pad_embed.expand((1, codec_lens, self.talker.hidden_size()))?;

            // Add codec embedding to tts_pad
            let codec_with_pad = (&codec_embed + &tts_pad_expanded)?;

            // Concatenate: [text + pad, codec + tts_pad]
            let icl_input_embed = Tensor::cat(&[&text_with_pad, &codec_with_pad], 1)?;

            tracing::info!(
                text_with_pad_shape = ?text_with_pad.dims(),
                codec_with_pad_shape = ?codec_with_pad.dims(),
                icl_input_embed_shape = ?icl_input_embed.dims(),
                "generate_icl_prompt: non-streaming mode output"
            );

            Ok((icl_input_embed, tts_pad_embed.clone()))
        } else {
            // Streaming mode: interleave text and codec based on their lengths
            if text_lens > codec_lens {
                // Text is longer: take first codec_lens of text, return rest as trailing
                let text_truncated = text_embed.i((.., ..codec_lens, ..))?;
                let combined = (&text_truncated + &codec_embed)?;
                let trailing = text_embed.i((.., codec_lens.., ..))?;
                tracing::info!(
                    text_truncated_shape = ?text_truncated.dims(),
                    combined_shape = ?combined.dims(),
                    trailing_shape = ?trailing.dims(),
                    "generate_icl_prompt: streaming mode (text longer)"
                );
                Ok((combined, trailing))
            } else {
                // Codec is longer or equal: pad text with tts_pad_embed
                let pad_count = codec_lens - text_lens;
                let text_padded = if pad_count > 0 {
                    let pads: Vec<Tensor> = (0..pad_count).map(|_| tts_pad_embed.clone()).collect();
                    let pad_tensors: Vec<&Tensor> = pads.iter().collect();
                    let mut all_tensors = vec![&text_embed];
                    all_tensors.extend(pad_tensors);
                    Tensor::cat(&all_tensors, 1)?
                } else {
                    text_embed.clone()
                };

                let combined = (&text_padded + &codec_embed)?;
                tracing::info!(
                    pad_count = pad_count,
                    text_padded_shape = ?text_padded.dims(),
                    combined_shape = ?combined.dims(),
                    "generate_icl_prompt: streaming mode (codec longer or equal)"
                );
                Ok((combined, tts_pad_embed.clone()))
            }
        }
    }

    /// Build TTS special token embeddings (BOS, EOS, PAD) through text_projection.
    ///
    /// These are text token IDs that get embedded and projected to create the TTS
    /// sequence delimiters that are added to codec embeddings.
    fn build_tts_special_embeds(&self) -> Result<(Tensor, Tensor, Tensor)> {
        let tts_token_ids = Tensor::new(
            &[
                self.config.tts_bos_token_id as u32,
                self.config.tts_eos_token_id as u32,
                self.config.tts_pad_token_id as u32,
            ],
            &self.device,
        )?;
        let tts_token_ids = tts_token_ids.unsqueeze(0)?; // (1, 3)

        // Embed and project through text_projection
        let tts_embeds = self.talker.embed_and_project_text(&tts_token_ids)?; // (1, 3, hidden_size)

        // Split into BOS, EOS, PAD
        let tts_bos_embed = tts_embeds.i((.., 0..1, ..))?.contiguous()?;
        let tts_eos_embed = tts_embeds.i((.., 1..2, ..))?.contiguous()?;
        let tts_pad_embed = tts_embeds.i((.., 2..3, ..))?.contiguous()?;

        Ok((tts_bos_embed, tts_eos_embed, tts_pad_embed))
    }

    /// Build codec prefill tokens based on language and speaker dialect.
    ///
    /// Python reference (modeling.py:2113-2142):
    /// - If language is "auto": [codec_nothink_id, codec_think_bos_id, codec_think_eos_id]
    /// - Otherwise: [codec_think_id, codec_think_bos_id, language_id, codec_think_eos_id]
    ///
    /// Dialect handling (modeling.py:2113-2117):
    /// - If language is "chinese" or "auto" and speaker has dialect, use dialect's language_id
    fn build_codec_prefill(
        &self,
        language: &str,
        speaker: Option<&str>,
        codec_language_id: &Option<HashMap<String, usize>>,
        spk_is_dialect: &Option<HashMap<String, DialectValue>>,
    ) -> Result<Vec<usize>> {
        let (think_id, nothink_id, think_bos_id, think_eos_id) = self.talker.get_think_tokens();

        let language_lower = language.to_lowercase();

        // Check for dialect override
        // Python: if language in ["chinese", "auto"] and speaker has dialect, use dialect's language_id
        let effective_language = if language_lower == "chinese" || language_lower == "auto" {
            if let (Some(spk), Some(dialect_map)) = (speaker, spk_is_dialect) {
                let spk_lower = spk.to_lowercase();
                // Look up the dialect value for this speaker
                if let Some(dialect_value) = dialect_map.get(&spk_lower) {
                    // If speaker has a dialect, use that dialect name as the language
                    if let Some(dialect_name) = dialect_value.as_dialect() {
                        dialect_name.to_lowercase()
                    } else {
                        language_lower.clone()
                    }
                } else {
                    language_lower.clone()
                }
            } else {
                language_lower.clone()
            }
        } else {
            language_lower.clone()
        };

        if effective_language == "auto" {
            Ok(vec![nothink_id, think_bos_id, think_eos_id])
        } else if let Some(lang_map) = codec_language_id {
            if let Some(&lang_id) = lang_map.get(&effective_language) {
                Ok(vec![think_id, think_bos_id, lang_id, think_eos_id])
            } else {
                // Language not found, fall back to auto
                Ok(vec![nothink_id, think_bos_id, think_eos_id])
            }
        } else {
            Ok(vec![nothink_id, think_bos_id, think_eos_id])
        }
    }

    /// Build the full prompt embeddings for generation.
    ///
    /// This implements the prompt construction from modeling.py:2063-2232.
    ///
    /// Args:
    ///   text_ids: Text token IDs from tokenizer (batch, text_len)
    ///   options: Generation options (language, speaker, etc.)
    ///
    /// Returns:
    ///   (prompt_embeds, trailing_text_hidden, tts_pad_embed) tuple
    pub fn build_prompt(
        &self,
        text_ids: &Tensor,
        options: &GenerationOptions,
    ) -> Result<(Tensor, Option<Tensor>, Tensor)> {
        let (batch_size, _text_len) = text_ids.dims2()?;
        let (_eos_id, bos_id, pad_id) = self.talker.get_special_tokens();

        // 1. Build TTS special embeddings
        let (tts_bos_embed, tts_eos_embed, tts_pad_embed) = self.build_tts_special_embeds()?;

        // 2. Build codec prefill tokens based on language and speaker dialect
        let codec_prefill = self.build_codec_prefill(
            &options.language,
            options.speaker.as_deref(),
            &self.config.talker_config.codec_language_id,
            &self.config.talker_config.spk_is_dialect,
        )?;

        // Embed codec prefill tokens
        let prefill_ids: Vec<u32> = codec_prefill.iter().map(|&x| x as u32).collect();
        let prefill_tensor = Tensor::new(&prefill_ids[..], &self.device)?.unsqueeze(0)?;
        let codec_prefill_embed = self.talker.embed_code(&prefill_tensor)?; // (1, prefill_len, hidden)

        // 3. Build codec pad/bos suffix
        let suffix_ids =
            Tensor::new(&[pad_id as u32, bos_id as u32], &self.device)?.unsqueeze(0)?;
        let codec_suffix_embed = self.talker.embed_code(&suffix_ids)?; // (1, 2, hidden)

        // 4. Handle speaker embedding
        let codec_input_embed = if let Some(ref spk_embed) = options.speaker_embed {
            // Insert speaker embedding between prefill and suffix
            // speaker_embed comes in as (batch, hidden), need (batch, 1, hidden)
            let spk = if spk_embed.dims().len() == 2 {
                spk_embed.unsqueeze(1)? // (batch, hidden) -> (batch, 1, hidden)
            } else if spk_embed.dims().len() == 1 {
                spk_embed.unsqueeze(0)?.unsqueeze(1)? // (hidden,) -> (1, 1, hidden)
            } else {
                spk_embed.clone() // Already 3D
            };
            Tensor::cat(&[&codec_prefill_embed, &spk, &codec_suffix_embed], 1)?
        } else if let Some(ref speaker_name) = options.speaker {
            // Look up speaker from config's spk_id map
            if let Some(ref spk_map) = self.config.talker_config.spk_id {
                let speaker_lower = speaker_name.to_lowercase();
                if let Some(&spk_id) = spk_map.get(&speaker_lower) {
                    // spk_id is a single token ID
                    let spk_ids_tensor =
                        Tensor::new(&[spk_id as u32], &self.device)?.unsqueeze(0)?;
                    let spk_embed = self.talker.embed_code(&spk_ids_tensor)?;
                    Tensor::cat(&[&codec_prefill_embed, &spk_embed, &codec_suffix_embed], 1)?
                } else {
                    Tensor::cat(&[&codec_prefill_embed, &codec_suffix_embed], 1)?
                }
            } else {
                Tensor::cat(&[&codec_prefill_embed, &codec_suffix_embed], 1)?
            }
        } else {
            Tensor::cat(&[&codec_prefill_embed, &codec_suffix_embed], 1)?
        };

        let codec_seq_len = codec_input_embed.dim(1)?;

        // 5. Build role embedding: first 3 tokens (<|im_start|>assistant\n) through text_projection
        let role_ids = text_ids.i((.., 0..3))?;
        let role_embed = self.talker.embed_and_project_text(&role_ids)?; // (batch, 3, hidden)

        // 6. Build TTS embedding layer: tts_pad * (codec_len - 2) + tts_bos, then add codec embedding
        // This creates the "text layer" that gets added to the codec layer
        let pad_count = codec_seq_len.saturating_sub(2);
        let tts_pad_expanded = if pad_count > 0 {
            tts_pad_embed.expand((batch_size, pad_count, self.talker.hidden_size()))?
        } else {
            Tensor::zeros(
                (batch_size, 0, self.talker.hidden_size()),
                tts_pad_embed.dtype(),
                &self.device,
            )?
        };
        let tts_layer = Tensor::cat(&[&tts_pad_expanded, &tts_bos_embed], 1)?;

        // Add TTS layer to codec embedding (excluding the last BOS token from codec)
        let codec_without_last = codec_input_embed.i((.., ..(codec_seq_len - 1), ..))?;
        let combined_embed = (&tts_layer + &codec_without_last)?;

        // 7. Build the main talker input embed
        let mut talker_input_embed = Tensor::cat(&[&role_embed, &combined_embed], 1)?;

        tracing::info!(
            role_embed_len = role_embed.dim(1)?,
            combined_embed_len = combined_embed.dim(1)?,
            talker_input_embed_len = talker_input_embed.dim(1)?,
            codec_seq_len = codec_seq_len,
            pad_count = pad_count,
            "build_prompt: prefix construction"
        );

        // 7b. Handle instruct embeddings (for CustomVoice/VoiceDesign style control)
        // Python reference (modeling.py:2139-2143):
        // if instruct_ids is not None:
        //     if instruct_id is not None:
        //         talker_input_embeds[index].append(self.talker.text_projection(
        //             self.talker.get_text_embeddings()(instruct_id)))
        if let Some(ref instruct_ids) = options.instruct_ids {
            // Embed and project the instruct tokens
            let instruct_embed = self.talker.embed_and_project_text(instruct_ids)?;
            // Prepend instruct embeddings to the main prompt
            talker_input_embed = Tensor::cat(&[&instruct_embed, &talker_input_embed], 1)?;
            tracing::debug!(
                instruct_embed_shape = ?instruct_embed.dims(),
                "build_prompt: prepended instruct_embed"
            );
        }

        // 8. Check for ICL mode (voice cloning with reference codes)
        // Python reference (modeling.py:2183-2192):
        // if voice_clone_prompt is not None and ref_code is not None and icl_mode[index]:
        //     icl_input_embed, trailing_text_hidden = self.generate_icl_prompt(...)
        //     talker_input_embed = cat([talker_input_embed, icl_input_embed])
        if let (Some(ref_codes), Some(ref_text_ids)) = (&options.ref_codes, &options.ref_text_ids) {
            // ICL mode: generate ICL prompt from reference codes and text
            // Extract text content (tokens 3:-5)
            let text_content_end = text_ids.dim(1)?.saturating_sub(5);
            let text_content_ids = if text_content_end > 3 {
                text_ids.i((.., 3..text_content_end))?
            } else {
                text_ids.i((.., 3..4))?
            };

            // Extract ref text content (tokens 3:-2)
            let ref_text_end = ref_text_ids.dim(1)?.saturating_sub(2);
            let ref_text_content_ids = if ref_text_end > 3 {
                ref_text_ids.i((.., 3..ref_text_end))?
            } else {
                ref_text_ids.i((.., 3..4))?
            };

            tracing::info!(
                text_ids_len = text_ids.dim(1)?,
                text_content_slice = format!("3..{}", text_content_end),
                text_content_ids_shape = ?text_content_ids.dims(),
                ref_text_ids_len = ref_text_ids.dim(1)?,
                ref_text_slice = format!("3..{}", ref_text_end),
                ref_text_content_ids_shape = ?ref_text_content_ids.dims(),
                ref_codes_shape = ?ref_codes.dims(),
                x_vector_only_mode = options.x_vector_only_mode,
                "build_prompt: ICL mode - text ID slicing"
            );

            // Ensure ref_codes has batch dimension: (seq_len, num_quantizers) -> (1, seq_len, num_quantizers)
            let ref_codes_batched = if ref_codes.dims().len() == 2 {
                ref_codes.unsqueeze(0)?
            } else {
                ref_codes.clone()
            };

            let (icl_input_embed, trailing) = self.generate_icl_prompt(
                &text_content_ids,
                &ref_text_content_ids,
                &ref_codes_batched,
                &tts_pad_embed,
                &tts_eos_embed,
                options.non_streaming_mode,
            )?;

            tracing::info!(
                talker_input_embed_before = ?talker_input_embed.dims(),
                icl_input_embed_shape = ?icl_input_embed.dims(),
                "build_prompt: ICL mode - before concat"
            );

            talker_input_embed = Tensor::cat(&[&talker_input_embed, &icl_input_embed], 1)?;

            tracing::info!(
                talker_input_embed_after = ?talker_input_embed.dims(),
                "build_prompt: ICL mode - after concat"
            );

            // Expand to batch size
            let prompt = talker_input_embed.expand((
                batch_size,
                talker_input_embed.dim(1)?,
                talker_input_embed.dim(2)?,
            ))?;

            return Ok((prompt, Some(trailing), tts_pad_embed));
        }

        // 9. Handle trailing text for non-streaming mode (non-ICL path)
        let trailing_text_hidden = if options.non_streaming_mode && text_ids.dim(1)? > 8 {
            // In non-streaming mode, we include the full text in the prompt
            // The text content is tokens 3:-5 (excluding role prefix and suffix)
            let text_content_end = text_ids.dim(1)?.saturating_sub(5);
            tracing::debug!(
                text_ids_len = text_ids.dim(1)?,
                text_content_end = text_content_end,
                text_content_tokens = text_content_end.saturating_sub(3),
                "build_prompt non-streaming"
            );
            if text_content_end > 3 {
                let text_content_ids = text_ids.i((.., 3..text_content_end))?;
                let text_content_embed = self.talker.embed_and_project_text(&text_content_ids)?;

                // Add trailing text with tts_eos at the end
                let trailing_with_eos = Tensor::cat(&[&text_content_embed, &tts_eos_embed], 1)?;

                // Create padding codec embedding for the text content
                let text_len = text_content_embed.dim(1)?;
                let pad_ids: Vec<u32> = vec![pad_id as u32; text_len + 1];
                let pad_tensor = Tensor::new(&pad_ids[..], &self.device)?.unsqueeze(0)?;
                let pad_embed = self.talker.embed_code(&pad_tensor)?;

                // Add trailing text layer to codec padding
                let trailing_embed = (&trailing_with_eos + &pad_embed)?;

                // Add final BOS
                let final_bos_ids = Tensor::new(&[bos_id as u32], &self.device)?.unsqueeze(0)?;
                let final_bos_embed = self.talker.embed_code(&final_bos_ids)?;
                let final_bos_with_pad = (&tts_pad_embed + &final_bos_embed)?;

                tracing::debug!(
                    before_cat = ?talker_input_embed.dims(),
                    trailing_embed = ?trailing_embed.dims(),
                    final_bos_with_pad = ?final_bos_with_pad.dims(),
                    "build_prompt non-streaming embed shapes"
                );

                talker_input_embed = Tensor::cat(
                    &[&talker_input_embed, &trailing_embed, &final_bos_with_pad],
                    1,
                )?;

                tracing::debug!(
                    after_cat = ?talker_input_embed.dims(),
                    "build_prompt talker_input_embed"
                );

                Some(tts_pad_embed.clone())
            } else {
                // Add first text token
                let first_text_id = text_ids.i((.., 3..4))?;
                let first_text_embed = self.talker.embed_and_project_text(&first_text_id)?;

                // Get the last codec embedding (bos)
                let last_codec = codec_input_embed.i((.., (codec_seq_len - 1).., ..))?;
                let combined_first = (&first_text_embed + &last_codec)?;

                talker_input_embed = Tensor::cat(&[&talker_input_embed, &combined_first], 1)?;

                // Trailing text for streaming simulation
                if text_ids.dim(1)? > 9 {
                    let trailing_ids = text_ids.i((.., 4..(text_ids.dim(1)? - 5)))?;
                    let trailing_embed = self.talker.embed_and_project_text(&trailing_ids)?;
                    let trailing_with_eos = Tensor::cat(&[&trailing_embed, &tts_eos_embed], 1)?;
                    Some(trailing_with_eos)
                } else {
                    Some(tts_pad_embed.clone())
                }
            }
        } else {
            // Streaming mode: add first text token
            let first_text_id = text_ids.i((.., 3..4))?;
            let first_text_embed = self.talker.embed_and_project_text(&first_text_id)?;

            // Get the last codec embedding (bos)
            let last_codec = codec_input_embed.i((.., (codec_seq_len - 1).., ..))?;
            let combined_first = (&first_text_embed + &last_codec)?;

            talker_input_embed = Tensor::cat(&[&talker_input_embed, &combined_first], 1)?;

            // Trailing text
            if text_ids.dim(1)? > 9 {
                let trailing_ids = text_ids.i((.., 4..(text_ids.dim(1)? - 5)))?;
                let trailing_embed = self.talker.embed_and_project_text(&trailing_ids)?;
                let trailing_with_eos = Tensor::cat(&[&trailing_embed, &tts_eos_embed], 1)?;
                Some(trailing_with_eos)
            } else {
                Some(tts_pad_embed.clone())
            }
        };

        // Expand to batch size
        let prompt = talker_input_embed.expand((
            batch_size,
            talker_input_embed.dim(1)?,
            talker_input_embed.dim(2)?,
        ))?;

        Ok((prompt, trailing_text_hidden, tts_pad_embed))
    }

    /// Generate audio codes with proper prompt construction.
    ///
    /// This is the recommended generation method that matches the Python reference.
    /// It properly constructs the input prompt with language/speaker embeddings
    /// and uses KV-cache for efficient generation.
    ///
    /// Args:
    ///   text_ids: Text token IDs from tokenizer (batch, text_len)
    ///   options: Generation options (language, speaker, voice clone, etc.)
    ///   max_new_tokens: Maximum number of audio frames to generate
    ///   sampling_config: Sampling configuration
    ///
    /// Returns:
    ///   Generated audio codes
    pub fn generate(
        &self,
        text_ids: &Tensor,
        options: &GenerationOptions,
        max_new_tokens: usize,
        sampling_config: &SamplingConfig,
    ) -> Result<Output> {
        let (batch_size, _) = text_ids.dims2()?;
        let (eos_id, _bos_id, _pad_id) = self.talker.get_special_tokens();

        tracing::debug!(
            talker_vocab_size = self.config.talker_config.vocab_size,
            code_predictor_vocab_size = self.config.talker_config.code_predictor_config.vocab_size,
            num_code_groups = self.config.talker_config.num_code_groups,
            eos_id = eos_id,
            bos_id = _bos_id,
            pad_id = _pad_id,
            temperature = sampling_config.temperature,
            top_k = sampling_config.top_k,
            top_p = sampling_config.top_p,
            repetition_penalty = sampling_config.repetition_penalty,
            max_new_tokens = max_new_tokens,
            "generate config"
        );

        // Configure sampling with EOS token ID for min_new_tokens enforcement
        let mut sampling_config = sampling_config.clone();
        sampling_config.eos_token_id = Some(eos_id);

        // CRITICAL: Suppress special tokens except EOS during generation
        // Python reference (modeling.py:2054-2058):
        // suppress_tokens = [i for i in range(vocab_size - 1024, vocab_size) if i != eos_token_id]
        // This prevents the model from generating BOS, PAD, or other special tokens
        let vocab_size = self.config.talker_config.vocab_size;
        let suppress_start = vocab_size.saturating_sub(1024);
        let suppress_tokens: Vec<usize> = (suppress_start..vocab_size)
            .filter(|&i| i != eos_id)
            .collect();
        sampling_config.suppress_tokens = suppress_tokens;

        tracing::debug!(
            suppress_start = suppress_start,
            suppress_end = vocab_size,
            eos_id = eos_id,
            min_new_tokens = sampling_config.min_new_tokens,
            "suppress_tokens config"
        );

        // Build the prompt embeddings
        let (prompt_embeds, trailing_text_hidden, tts_pad_embed) =
            self.build_prompt(text_ids, options)?;

        let dtype = prompt_embeds.dtype();
        let initial_seq_len = prompt_embeds.dim(1)?;

        tracing::debug!(
            prompt_embeds_shape = ?prompt_embeds.dims(),
            text_ids_shape = ?text_ids.dims(),
            trailing_text_hidden = ?trailing_text_hidden.as_ref().map(|t| t.dims()),
            non_streaming_mode = options.non_streaming_mode,
            x_vector_only_mode = options.x_vector_only_mode,
            "prompt construction"
        );

        // Initialize KV-cache
        let num_layers = self.talker.num_layers();
        let mut cache = KVCache::with_num_layers(num_layers);

        // First forward pass: process the prompt
        let position_ids = self.create_position_ids(initial_seq_len, batch_size)?;
        let attention_mask = self.create_causal_mask(initial_seq_len, dtype)?;

        if tracing::enabled!(tracing::Level::TRACE) {
            // Print initial position_ids
            if let Ok(pos_first_dim) = position_ids.i((0, 0, ..)).and_then(|t| t.to_vec1::<i64>()) {
                tracing::trace!(
                    seq_len = initial_seq_len,
                    values = ?pos_first_dim,
                    "position_ids (initial prompt, first batch, temporal dim)"
                );
            }
        }

        let (logits, hidden_states) = self.talker.forward_with_cache(
            &prompt_embeds,
            &position_ids,
            Some(&attention_mask),
            &mut cache,
        )?;

        // Sample first codebook 0
        let last_logits = logits.i((.., logits.dim(1)? - 1, ..))?;
        let mut generated_code0_tokens: Vec<Vec<i64>> = vec![Vec::new(); batch_size];
        let mut all_codes = Vec::new();
        let mut step = 0;

        // Process first token
        let mut code_0_vec = Vec::with_capacity(batch_size);
        for (b, gen_tokens) in generated_code0_tokens.iter_mut().enumerate() {
            let batch_logits = last_logits.get(b)?;
            let token = sample_token(&batch_logits, &sampling_config, gen_tokens)?;
            gen_tokens.push(token);
            code_0_vec.push(token);
        }

        let code_0 = Tensor::from_vec(code_0_vec.clone(), batch_size, &self.device)?;

        // Per-sample EOS tracking
        // Python reference (modeling.py:2275-2284):
        // - Track when each sample hits EOS
        // - Return variable-length outputs per sample
        let mut sample_eos_step: Vec<Option<usize>> = vec![None; batch_size];

        // Check first token for EOS
        for (b, &code) in code_0_vec.iter().enumerate() {
            if code as usize == eos_id {
                sample_eos_step[b] = Some(0);
            }
        }

        // Create subtalker sampling config from main config
        let subtalker_sampling = sampling_config.for_subtalker();

        // Check for immediate EOS (all samples)
        if !code_0_vec.iter().all(|&c| c as usize == eos_id) {
            // Generate remaining codebooks for first step
            // Python: inputs_embeds=torch.cat((past_hidden, last_id_hidden), dim=1)
            let last_hidden = hidden_states.i((.., hidden_states.dim(1)? - 1, ..))?;
            let last_hidden = last_hidden.unsqueeze(1)?;
            let code_0_embed = self.talker.embed_code(&code_0.unsqueeze(1)?)?;
            let predictor_input = Tensor::cat(&[&last_hidden, &code_0_embed], 1)?;
            let remaining_codes = self.talker.get_code_predictor().generate_with_cache(
                &predictor_input,
                None,
                &subtalker_sampling,
            )?;

            let code_0_expanded = code_0.to_dtype(candle_core::DType::U32)?.unsqueeze(1)?;
            let codes = Tensor::cat(&[&code_0_expanded, &remaining_codes], 1)?;

            // Debug: print codes at key steps for comparison with Python
            if tracing::enabled!(tracing::Level::DEBUG)
                && (step < 5 || step % 50 == 0)
                && let Ok(codes_vec) = codes.to_vec2::<u32>()
            {
                tracing::debug!(step = step, codes = ?&codes_vec[0], "step codes");
            }

            all_codes.push(codes.clone());

            // Prepare embedding for next step
            // Sum all codebook embeddings + add trailing text hidden if available
            let mut next_embed = self.talker.sum_code_embeddings(&codes)?;
            next_embed = next_embed.unsqueeze(1)?;

            // Add trailing text contribution at this step
            if let Some(ref trailing) = trailing_text_hidden {
                if step < trailing.dim(1)? {
                    let trailing_step = trailing.i((.., step..(step + 1), ..))?;
                    next_embed = (&next_embed + &trailing_step)?;
                } else {
                    next_embed = (&next_embed + &tts_pad_embed)?;
                }
            }

            step = 1;

            // Continue generating with cache
            while step < max_new_tokens {
                // Check if all samples have hit EOS
                if sample_eos_step.iter().all(|s| s.is_some()) {
                    break;
                }

                let cache_len = cache.seq_len();

                // Only process the new token embedding
                let position_ids = self.create_position_ids_range(cache_len, 1, batch_size)?;
                let attention_mask = self.create_causal_mask_cached(cache_len, 1, dtype)?;

                if tracing::enabled!(tracing::Level::TRACE)
                    && step < 5
                    && let Ok(pos_val) =
                        position_ids.i((0, 0, 0)).and_then(|t| t.to_scalar::<i64>())
                {
                    tracing::trace!(
                        step = step,
                        cache_len = cache_len,
                        pos = pos_val,
                        "position_ids"
                    );
                }

                let (logits, hidden_states) = self.talker.forward_with_cache(
                    &next_embed,
                    &position_ids,
                    Some(&attention_mask),
                    &mut cache,
                )?;

                // Sample codebook 0
                let last_logits = logits.i((.., 0, ..))?;

                // DEBUG: Print logit stats for first few steps
                if tracing::enabled!(tracing::Level::DEBUG)
                    && step < 5
                    && let Ok(logits_f32) = last_logits.to_dtype(DType::F32)
                    && let (Ok(max_val), Ok(min_val), Ok(argmax), Ok(eos_logit)) = (
                        logits_f32.max(1).and_then(|t| Ok(t.to_vec1::<f32>()?[0])),
                        logits_f32.min(1).and_then(|t| Ok(t.to_vec1::<f32>()?[0])),
                        logits_f32
                            .argmax(1)
                            .and_then(|t| Ok(t.to_vec1::<u32>()?[0])),
                        logits_f32.i((0, eos_id)).and_then(|t| t.to_scalar::<f32>()),
                    )
                {
                    tracing::debug!(
                        step = step,
                        max = format!("{:.4}", max_val),
                        min = format!("{:.4}", min_val),
                        argmax = argmax,
                        eos_logit = format!("{:.4}", eos_logit),
                        "logits stats"
                    );
                }

                let mut code_0_vec = Vec::with_capacity(batch_size);
                for b in 0..batch_size {
                    let batch_logits = last_logits.get(b)?;
                    let token =
                        sample_token(&batch_logits, &sampling_config, &generated_code0_tokens[b])?;
                    generated_code0_tokens[b].push(token);
                    code_0_vec.push(token);

                    // Track EOS for this sample
                    if sample_eos_step[b].is_none() && token as usize == eos_id {
                        tracing::debug!(step = step, batch = b, token = token, "EOS detected");
                        sample_eos_step[b] = Some(step);
                    }
                    // Warn if code >= 2048 (invalid for decoder)
                    if token >= 2048 {
                        tracing::warn!(
                            step = step,
                            token = token,
                            "code_0 >= 2048 (invalid for decoder)"
                        );
                    }
                }

                let code_0 = Tensor::from_vec(code_0_vec.clone(), batch_size, &self.device)?;

                // Generate remaining codebooks (even for samples that hit EOS, for consistent tensor shapes)
                // Python: inputs_embeds=torch.cat((past_hidden, last_id_hidden), dim=1)
                let last_hidden = hidden_states.i((.., 0, ..))?;
                let last_hidden = last_hidden.unsqueeze(1)?;
                let code_0_embed = self.talker.embed_code(&code_0.unsqueeze(1)?)?;
                let predictor_input = Tensor::cat(&[&last_hidden, &code_0_embed], 1)?;
                let remaining_codes = self.talker.get_code_predictor().generate_with_cache(
                    &predictor_input,
                    None,
                    &subtalker_sampling,
                )?;

                let code_0_expanded = code_0.to_dtype(candle_core::DType::U32)?.unsqueeze(1)?;
                let codes = Tensor::cat(&[&code_0_expanded, &remaining_codes], 1)?;
                all_codes.push(codes.clone());

                // Prepare next input with trailing text
                next_embed = self.talker.sum_code_embeddings(&codes)?;
                next_embed = next_embed.unsqueeze(1)?;

                if let Some(ref trailing) = trailing_text_hidden {
                    if step < trailing.dim(1)? {
                        let trailing_step = trailing.i((.., step..(step + 1), ..))?;
                        next_embed = (&next_embed + &trailing_step)?;
                    } else {
                        next_embed = (&next_embed + &tts_pad_embed)?;
                    }
                }

                step += 1;
            }
        }

        // Calculate effective lengths per sample
        let effective_lengths: Vec<usize> = sample_eos_step
            .iter()
            .map(|eos| eos.unwrap_or(step))
            .collect();

        if tracing::enabled!(tracing::Level::DEBUG) {
            // Print first 10 code_0 values to compare with Python
            let first_10_code0: Vec<i64> =
                generated_code0_tokens[0].iter().take(10).cloned().collect();
            tracing::debug!(
                total_steps = step,
                all_codes_len = all_codes.len(),
                sample_eos_step = ?sample_eos_step,
                effective_lengths = ?effective_lengths,
                first_10_code0 = ?first_10_code0,
                "generation complete"
            );
        }

        // Stack all codes
        let codes = if all_codes.is_empty() {
            Tensor::zeros(
                (batch_size, 0, self.config.talker_config.num_code_groups),
                DType::I64,
                &self.device,
            )?
        } else {
            Tensor::stack(&all_codes.iter().collect::<Vec<_>>(), 1)?
        };

        if tracing::enabled!(tracing::Level::DEBUG) {
            tracing::debug!(codes_shape = ?codes.dims(), "codes info");
            if !all_codes.is_empty() {
                // Print first few codes from step 0
                if let Ok(first_step) = codes.i((0, 0, ..)) {
                    tracing::debug!(
                        codes = ?first_step.to_vec1::<u32>(),
                        "codes[0,0,:] (first step)"
                    );
                }
                // Print codes from effective_length-1 step (last valid)
                let last_valid = effective_lengths[0].saturating_sub(1);
                if last_valid < all_codes.len()
                    && let Ok(last_valid_codes) = codes.i((0, last_valid, ..))
                {
                    tracing::debug!(
                        step = last_valid,
                        codes = ?last_valid_codes.to_vec1::<u32>(),
                        "codes (last valid step)"
                    );
                }
                // Print codes from effective_length step (EOS step, if any)
                if effective_lengths[0] < all_codes.len()
                    && let Ok(eos_step_codes) = codes.i((0, effective_lengths[0], ..))
                {
                    tracing::debug!(
                        step = effective_lengths[0],
                        codes = ?eos_step_codes.to_vec1::<u32>(),
                        "codes (EOS step)"
                    );
                }
            }
        }

        Ok(Output {
            codes,
            num_steps: step,
            effective_lengths: Some(effective_lengths),
        })
    }

    /// Generate audio codes with a streaming callback.
    ///
    /// Identical to `generate()` but calls `on_codes` after each generation step
    /// with the codes tensor for that step (shape: batch, 1, num_code_groups)
    /// and the step index. This enables incremental audio decoding during generation.
    pub fn generate_streaming<F>(
        &self,
        text_ids: &Tensor,
        options: &GenerationOptions,
        max_new_tokens: usize,
        sampling_config: &SamplingConfig,
        mut on_codes: F,
    ) -> Result<Output>
    where
        F: FnMut(&Tensor, usize),
    {
        let (batch_size, _) = text_ids.dims2()?;
        let (eos_id, _bos_id, _pad_id) = self.talker.get_special_tokens();

        let mut sampling_config = sampling_config.clone();
        sampling_config.eos_token_id = Some(eos_id);

        let vocab_size = self.config.talker_config.vocab_size;
        let suppress_start = vocab_size.saturating_sub(1024);
        let suppress_tokens: Vec<usize> = (suppress_start..vocab_size)
            .filter(|&i| i != eos_id)
            .collect();
        sampling_config.suppress_tokens = suppress_tokens;

        // Build the prompt embeddings
        let (prompt_embeds, trailing_text_hidden, tts_pad_embed) =
            self.build_prompt(text_ids, options)?;

        let dtype = prompt_embeds.dtype();
        let initial_seq_len = prompt_embeds.dim(1)?;

        // Initialize KV-cache
        let num_layers = self.talker.num_layers();
        let mut cache = KVCache::with_num_layers(num_layers);

        // First forward pass: process the prompt
        let position_ids = self.create_position_ids(initial_seq_len, batch_size)?;
        let attention_mask = self.create_causal_mask(initial_seq_len, dtype)?;

        let (logits, hidden_states) = self.talker.forward_with_cache(
            &prompt_embeds,
            &position_ids,
            Some(&attention_mask),
            &mut cache,
        )?;

        // Sample first codebook 0
        let last_logits = logits.i((.., logits.dim(1)? - 1, ..))?;
        let mut generated_code0_tokens: Vec<Vec<i64>> = vec![Vec::new(); batch_size];
        let mut all_codes = Vec::new();
        let mut step = 0;

        let mut code_0_vec = Vec::with_capacity(batch_size);
        for (b, gen_tokens) in generated_code0_tokens.iter_mut().enumerate() {
            let batch_logits = last_logits.get(b)?;
            let token = sample_token(&batch_logits, &sampling_config, gen_tokens)?;
            gen_tokens.push(token);
            code_0_vec.push(token);
        }

        let code_0 = Tensor::from_vec(code_0_vec.clone(), batch_size, &self.device)?;
        let mut sample_eos_step: Vec<Option<usize>> = vec![None; batch_size];

        for (b, &code) in code_0_vec.iter().enumerate() {
            if code as usize == eos_id {
                sample_eos_step[b] = Some(0);
            }
        }

        let subtalker_sampling = sampling_config.for_subtalker();

        if !code_0_vec.iter().all(|&c| c as usize == eos_id) {
            let last_hidden = hidden_states.i((.., hidden_states.dim(1)? - 1, ..))?;
            let last_hidden = last_hidden.unsqueeze(1)?;
            let code_0_embed = self.talker.embed_code(&code_0.unsqueeze(1)?)?;
            let predictor_input = Tensor::cat(&[&last_hidden, &code_0_embed], 1)?;
            let remaining_codes = self.talker.get_code_predictor().generate_with_cache(
                &predictor_input,
                None,
                &subtalker_sampling,
            )?;

            let code_0_expanded = code_0.to_dtype(candle_core::DType::U32)?.unsqueeze(1)?;
            let codes = Tensor::cat(&[&code_0_expanded, &remaining_codes], 1)?;

            // Streaming callback for first step
            on_codes(&codes, step);
            all_codes.push(codes.clone());

            let mut next_embed = self.talker.sum_code_embeddings(&codes)?;
            next_embed = next_embed.unsqueeze(1)?;

            if let Some(ref trailing) = trailing_text_hidden {
                if step < trailing.dim(1)? {
                    let trailing_step = trailing.i((.., step..(step + 1), ..))?;
                    next_embed = (&next_embed + &trailing_step)?;
                } else {
                    next_embed = (&next_embed + &tts_pad_embed)?;
                }
            }

            step = 1;

            while step < max_new_tokens {
                if sample_eos_step.iter().all(|s| s.is_some()) {
                    break;
                }

                let cache_len = cache.seq_len();
                let position_ids = self.create_position_ids_range(cache_len, 1, batch_size)?;
                let attention_mask = self.create_causal_mask_cached(cache_len, 1, dtype)?;

                let (logits, hidden_states) = self.talker.forward_with_cache(
                    &next_embed,
                    &position_ids,
                    Some(&attention_mask),
                    &mut cache,
                )?;

                let last_logits = logits.i((.., 0, ..))?;

                let mut code_0_vec = Vec::with_capacity(batch_size);
                for b in 0..batch_size {
                    let batch_logits = last_logits.get(b)?;
                    let token =
                        sample_token(&batch_logits, &sampling_config, &generated_code0_tokens[b])?;
                    generated_code0_tokens[b].push(token);
                    code_0_vec.push(token);

                    if sample_eos_step[b].is_none() && token as usize == eos_id {
                        sample_eos_step[b] = Some(step);
                    }
                }

                let code_0 = Tensor::from_vec(code_0_vec.clone(), batch_size, &self.device)?;

                let last_hidden = hidden_states.i((.., 0, ..))?;
                let last_hidden = last_hidden.unsqueeze(1)?;
                let code_0_embed = self.talker.embed_code(&code_0.unsqueeze(1)?)?;
                let predictor_input = Tensor::cat(&[&last_hidden, &code_0_embed], 1)?;
                let remaining_codes = self.talker.get_code_predictor().generate_with_cache(
                    &predictor_input,
                    None,
                    &subtalker_sampling,
                )?;

                let code_0_expanded = code_0.to_dtype(candle_core::DType::U32)?.unsqueeze(1)?;
                let codes = Tensor::cat(&[&code_0_expanded, &remaining_codes], 1)?;

                // Streaming callback for each step
                on_codes(&codes, step);
                all_codes.push(codes.clone());

                next_embed = self.talker.sum_code_embeddings(&codes)?;
                next_embed = next_embed.unsqueeze(1)?;

                if let Some(ref trailing) = trailing_text_hidden {
                    if step < trailing.dim(1)? {
                        let trailing_step = trailing.i((.., step..(step + 1), ..))?;
                        next_embed = (&next_embed + &trailing_step)?;
                    } else {
                        next_embed = (&next_embed + &tts_pad_embed)?;
                    }
                }

                step += 1;
            }
        }

        let effective_lengths: Vec<usize> = sample_eos_step
            .iter()
            .map(|eos| eos.unwrap_or(step))
            .collect();

        let codes = if all_codes.is_empty() {
            Tensor::zeros(
                (batch_size, 0, self.config.talker_config.num_code_groups),
                DType::I64,
                &self.device,
            )?
        } else {
            Tensor::stack(&all_codes.iter().collect::<Vec<_>>(), 1)?
        };

        Ok(Output {
            codes,
            num_steps: step,
            effective_lengths: Some(effective_lengths),
        })
    }

    /// Generate audio codes from a batch of variable-length text inputs.
    ///
    /// This method handles the full pipeline for batched variable-length inference:
    /// 1. Builds prompt embeddings for each sample
    /// 2. Left-pads sequences to uniform length
    /// 3. Creates attention masks that respect both padding and causality
    /// 4. Generates audio codes with per-sample EOS tracking
    ///
    /// This matches the Python reference (modeling.py:2234-2287) for batch inference.
    ///
    /// # Arguments
    /// * `text_ids_list` - List of text token tensors, each of shape (1, text_len_i)
    /// * `options_list` - Generation options for each sample
    /// * `max_new_tokens` - Maximum number of audio frames to generate
    /// * `sampling_config` - Sampling configuration
    ///
    /// # Returns
    /// * Generated audio codes with per-sample effective lengths
    pub fn generate_batch(
        &self,
        text_ids_list: &[Tensor],
        options_list: &[GenerationOptions],
        max_new_tokens: usize,
        sampling_config: &SamplingConfig,
    ) -> Result<Output> {
        let batch_size = text_ids_list.len();
        if batch_size == 0 {
            return Err(candle_core::Error::Msg("Empty batch".to_string()));
        }
        if batch_size != options_list.len() {
            return Err(candle_core::Error::Msg(
                "text_ids_list and options_list must have same length".to_string(),
            ));
        }

        // Single sample - use regular method
        if batch_size == 1 {
            return self.generate(
                &text_ids_list[0],
                &options_list[0],
                max_new_tokens,
                sampling_config,
            );
        }

        let (eos_id, _bos_id, _pad_id) = self.talker.get_special_tokens();

        // 1. Build prompt embeddings for each sample
        let mut prompt_list = Vec::with_capacity(batch_size);
        let mut trailing_list = Vec::with_capacity(batch_size);
        let mut tts_pad_embed: Option<Tensor> = None;

        for (text_ids, options) in text_ids_list.iter().zip(options_list.iter()) {
            let (prompt, trailing, pad_embed) = self.build_prompt(text_ids, options)?;
            // Remove batch dimension to get (seq_len, hidden)
            prompt_list.push(prompt.squeeze(0)?);
            trailing_list.push(trailing);
            if tts_pad_embed.is_none() {
                tts_pad_embed = Some(pad_embed);
            }
        }

        let tts_pad_embed = tts_pad_embed.unwrap();

        // 2. Left-pad prompt embeddings to uniform length
        // Python: sequences_reversed = [t.flip(dims=[0]) for t in sequences]
        //         padded_reversed = pad_sequence(sequences_reversed)
        //         talker_input_embeds = padded_reversed.flip(dims=[1])
        let (prompt_embeds, original_lengths) = left_pad_sequences(&prompt_list, 0.0)?;
        let max_prompt_len = prompt_embeds.dim(1)?;
        let dtype = prompt_embeds.dtype();

        // 3. Create attention mask that respects left-padding
        // Python: indices = torch.arange(max_len).expand(batch_size, -1)
        //         num_pads = max_len - original_lengths
        //         talker_attention_mask = (indices >= num_pads.unsqueeze(1)).long()
        let attention_mask = create_attention_mask_from_lengths(
            &original_lengths,
            max_prompt_len,
            dtype,
            &self.device,
        )?;

        // 4. Create position IDs accounting for padding
        let position_ids_2d =
            create_position_ids_with_padding(&original_lengths, max_prompt_len, &self.device)?;
        // Convert to 3D for multimodal RoPE: (3, batch, seq_len)
        let position_ids =
            Tensor::stack(&[&position_ids_2d, &position_ids_2d, &position_ids_2d], 0)?;

        // 5. Initialize KV-cache
        let num_layers = self.talker.num_layers();
        let mut cache = KVCache::with_num_layers(num_layers);

        // 6. First forward pass with padded inputs
        let (logits, hidden_states) = self.talker.forward_with_cache(
            &prompt_embeds,
            &position_ids,
            Some(&attention_mask),
            &mut cache,
        )?;

        // 7. Sample first codebook 0
        let last_logits = logits.i((.., logits.dim(1)? - 1, ..))?;
        let mut generated_code0_tokens: Vec<Vec<i64>> = vec![Vec::new(); batch_size];
        let mut all_codes = Vec::new();
        let mut step = 0;

        // Create subtalker sampling config from main config
        let subtalker_sampling = sampling_config.for_subtalker();

        let mut code_0_vec = Vec::with_capacity(batch_size);
        for (b, gen_tokens) in generated_code0_tokens.iter_mut().enumerate() {
            let batch_logits = last_logits.get(b)?;
            let token = sample_token(&batch_logits, sampling_config, gen_tokens)?;
            gen_tokens.push(token);
            code_0_vec.push(token);
        }

        let code_0 = Tensor::from_vec(code_0_vec.clone(), batch_size, &self.device)?;

        // Per-sample EOS tracking
        let mut sample_eos_step: Vec<Option<usize>> = vec![None; batch_size];
        for (b, &code) in code_0_vec.iter().enumerate() {
            if code as usize == eos_id {
                sample_eos_step[b] = Some(0);
            }
        }

        // Check for immediate EOS (all samples)
        if !code_0_vec.iter().all(|&c| c as usize == eos_id) {
            // Generate remaining codebooks
            // Python: inputs_embeds=torch.cat((past_hidden, last_id_hidden), dim=1)
            let last_hidden = hidden_states.i((.., hidden_states.dim(1)? - 1, ..))?;
            let last_hidden = last_hidden.unsqueeze(1)?;
            let code_0_embed = self.talker.embed_code(&code_0.unsqueeze(1)?)?;
            let predictor_input = Tensor::cat(&[&last_hidden, &code_0_embed], 1)?;
            let remaining_codes = self.talker.get_code_predictor().generate_with_cache(
                &predictor_input,
                None,
                &subtalker_sampling,
            )?;

            let code_0_expanded = code_0.to_dtype(candle_core::DType::U32)?.unsqueeze(1)?;
            let codes = Tensor::cat(&[&code_0_expanded, &remaining_codes], 1)?;
            all_codes.push(codes.clone());

            // Prepare next embedding
            let mut next_embed = self.talker.sum_code_embeddings(&codes)?;
            next_embed = next_embed.unsqueeze(1)?;

            // Add trailing text if available (per-sample)
            // For simplicity in batch mode, use tts_pad_embed uniformly
            next_embed = (&next_embed + &tts_pad_embed)?;

            step = 1;

            // 8. Continue generation with cache
            while step < max_new_tokens {
                if sample_eos_step.iter().all(|s| s.is_some()) {
                    break;
                }

                let cache_len = cache.seq_len();

                // Create position and mask for single new token
                // All samples now have same cache length
                let new_positions: Vec<i64> = (0..batch_size).map(|_| cache_len as i64).collect();
                let pos_tensor = Tensor::from_vec(new_positions, (batch_size, 1), &self.device)?;
                let position_ids = Tensor::stack(&[&pos_tensor, &pos_tensor, &pos_tensor], 0)?;

                let attention_mask = self.create_causal_mask_cached(cache_len, 1, dtype)?;

                let (logits, hidden_states) = self.talker.forward_with_cache(
                    &next_embed,
                    &position_ids,
                    Some(&attention_mask),
                    &mut cache,
                )?;

                // Sample codebook 0
                let last_logits = logits.i((.., 0, ..))?;
                let mut code_0_vec = Vec::with_capacity(batch_size);
                for b in 0..batch_size {
                    let batch_logits = last_logits.get(b)?;
                    let token =
                        sample_token(&batch_logits, sampling_config, &generated_code0_tokens[b])?;
                    generated_code0_tokens[b].push(token);
                    code_0_vec.push(token);

                    if sample_eos_step[b].is_none() && token as usize == eos_id {
                        sample_eos_step[b] = Some(step);
                    }
                }

                let code_0 = Tensor::from_vec(code_0_vec.clone(), batch_size, &self.device)?;

                // Generate remaining codebooks
                // Python: inputs_embeds=torch.cat((past_hidden, last_id_hidden), dim=1)
                let last_hidden = hidden_states.i((.., 0, ..))?;
                let last_hidden = last_hidden.unsqueeze(1)?;
                let code_0_embed = self.talker.embed_code(&code_0.unsqueeze(1)?)?;
                let predictor_input = Tensor::cat(&[&last_hidden, &code_0_embed], 1)?;
                let remaining_codes = self.talker.get_code_predictor().generate_with_cache(
                    &predictor_input,
                    None,
                    &subtalker_sampling,
                )?;

                let code_0_expanded = code_0.to_dtype(candle_core::DType::U32)?.unsqueeze(1)?;
                let codes = Tensor::cat(&[&code_0_expanded, &remaining_codes], 1)?;
                all_codes.push(codes.clone());

                // Prepare next input
                next_embed = self.talker.sum_code_embeddings(&codes)?;
                next_embed = next_embed.unsqueeze(1)?;
                next_embed = (&next_embed + &tts_pad_embed)?;

                step += 1;
            }
        }

        // Calculate effective lengths
        let effective_lengths: Vec<usize> = sample_eos_step
            .iter()
            .map(|eos| eos.unwrap_or(step))
            .collect();

        // Stack all codes
        let codes = if all_codes.is_empty() {
            Tensor::zeros(
                (batch_size, 0, self.config.talker_config.num_code_groups),
                DType::I64,
                &self.device,
            )?
        } else {
            Tensor::stack(&all_codes.iter().collect::<Vec<_>>(), 1)?
        };

        Ok(Output {
            codes,
            num_steps: step,
            effective_lengths: Some(effective_lengths),
        })
    }
}
