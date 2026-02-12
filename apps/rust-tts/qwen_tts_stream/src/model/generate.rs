use candle_core::{IndexOp, Result, Tensor};

use crate::{
    model::{
        Model,
        config::GenerateConfig,
        options::{CustomVoiceOptions, VoiceCloneOptions, VoiceDesignOptions},
        types::GenerationResult,
        voice_clone::VoiceClonePromptItem,
    },
    nn::{generation::Output, generation_options::GenerationOptions},
};

impl Model {
    /// Get the default generation config.
    pub fn generate_defaults(&self) -> &GenerateConfig {
        &self.generate_defaults
    }

    /// Set the default generation config.
    pub fn set_generate_defaults(&mut self, config: GenerateConfig) {
        self.generate_defaults = config;
    }

    /// Decode generation output to waveform, properly truncating to effective lengths.
    ///
    /// This handles the case where generated codes include EOS tokens that should
    /// not be passed to the tokenizer decoder (which has a smaller codebook).
    fn decode_output(&self, output: &Output) -> Result<Tensor> {
        let tokenizer = self.audio_tokenizer.as_ref().ok_or_else(|| {
            candle_core::Error::Msg(
                "Audio tokenizer not loaded. Cannot decode audio codes to waveform. \
                 Make sure the tokenizer weights (tokenizer.safetensors) are available \
                 in the model directory."
                    .to_string(),
            )
        })?;

        if tracing::enabled!(tracing::Level::DEBUG) {
            tracing::debug!(
                shape = ?output.codes.dims(),
                effective_lengths = ?output.effective_lengths,
                num_steps = output.num_steps,
                "decode_output"
            );

            // Check for out-of-range codes
            if let Ok(codes_flat) = output.codes.flatten_all() {
                if let Ok(max_code) = codes_flat.max(0) {
                    tracing::debug!(max_code = ?max_code.to_scalar::<u32>(), "max code value");
                }
                if let Ok(min_code) = codes_flat.min(0) {
                    tracing::debug!(min_code = ?min_code.to_scalar::<u32>(), "min code value");
                }
            }

            // Print first few codes from codebook 0
            if output.codes.dim(1).unwrap_or(0) > 0 {
                if let Ok(first_step) = output.codes.i((0, 0, ..)) {
                    tracing::debug!(codes = ?first_step.to_vec1::<u32>(), "first step codes");
                }
                if let Ok(last_step_idx) = output.codes.dim(1)
                    && last_step_idx > 0
                    && let Ok(last_step) = output.codes.i((0, last_step_idx - 1, ..))
                {
                    tracing::debug!(codes = ?last_step.to_vec1::<u32>(), "last step codes");
                }
            }
        }

        // Chunked decoding constants - reduces VRAM usage for long sequences
        // PyTorch uses ~1/3 the VRAM because it processes in chunks
        const CHUNK_THRESHOLD: usize = 512;
        const CHUNK_SIZE: usize = 256;
        const LEFT_CONTEXT: usize = 32;

        // If we have effective_lengths, truncate each sample to exclude EOS tokens
        if let Some(ref lengths) = output.effective_lengths {
            let batch_size = output.codes.dim(0)?;

            // For batch_size=1, simple case
            if batch_size == 1 {
                let len = lengths.first().copied().unwrap_or(output.codes.dim(1)?);

                // The codes array contains generated audio codes only (no BOS token).
                // BOS is used as an embedding input to start generation but is not stored in codes.
                // Step 0..len-1 contain audio codes, step len contains EOS (2150)
                // We decode steps 0..len (all valid audio codes, excluding EOS at the end)
                let truncated = output.codes.i((0..1, 0..len, ..))?;

                if tracing::enabled!(tracing::Level::DEBUG) {
                    tracing::debug!(len = len, "truncating codes");
                    tracing::debug!(len = len, "decoding steps 0..len (excluding EOS)");

                    // Check truncated codes
                    if let Ok(trunc_flat) = truncated.flatten_all()
                        && let Ok(max_code) = trunc_flat.max(0)
                    {
                        tracing::debug!(max_code = ?max_code.to_scalar::<u32>(), "truncated max code");
                    }
                }

                if len > CHUNK_THRESHOLD {
                    tracing::debug!(
                        len = len,
                        chunk_size = CHUNK_SIZE,
                        "using chunked decode for long sequence"
                    );
                    return tokenizer.chunked_decode(&truncated, CHUNK_SIZE, LEFT_CONTEXT);
                }
                return tokenizer.decode(&truncated);
            }

            // For batched outputs, decode each sample separately and concatenate
            // (This is less efficient but correct)
            let mut audio_samples = Vec::with_capacity(batch_size);
            for (i, &len) in lengths.iter().enumerate() {
                // Decode all audio codes (0..len), excluding EOS
                let sample_codes = output.codes.i((i..i + 1, 0..len, ..))?;
                // Use chunked decoding for long sequences
                let audio = if len > CHUNK_THRESHOLD {
                    tokenizer.chunked_decode(&sample_codes, CHUNK_SIZE, LEFT_CONTEXT)?
                } else {
                    tokenizer.decode(&sample_codes)?
                };
                audio_samples.push(audio);
            }

            // Concatenate along batch dimension
            let refs: Vec<&Tensor> = audio_samples.iter().collect();
            Tensor::cat(&refs, 0)
        } else {
            // No effective_lengths - decode all codes
            // This path shouldn't normally be hit for proper generation output
            tracing::warn!("no effective_lengths, decoding all codes");
            let len = output.codes.dim(1)?;
            if len > CHUNK_THRESHOLD {
                tokenizer.chunked_decode(&output.codes, CHUNK_SIZE, LEFT_CONTEXT)
            } else {
                tokenizer.decode(&output.codes)
            }
        }
    }

    /// Decode audio codes to waveform.
    ///
    /// # Arguments
    ///
    /// * `codes` - Audio codes of shape `(batch, seq_len, num_quantizers)`
    ///
    /// # Returns
    ///
    /// Audio waveform tensor
    pub fn decode_codes(&self, codes: &Tensor) -> Result<Tensor> {
        if let Some(ref tokenizer) = self.audio_tokenizer {
            tokenizer.decode(codes)
        } else {
            Err(candle_core::Error::Msg(
                "Audio tokenizer not available".to_string(),
            ))
        }
    }

    /// Encode audio waveform to discrete codes.
    ///
    /// # Arguments
    ///
    /// * `audio` - Audio waveform tensor of shape `(samples,)` or `(batch, samples)` at 24kHz
    ///
    /// # Returns
    ///
    /// Audio codes tensor of shape `(steps, num_codebooks)` or `(batch, steps, num_codebooks)`
    pub fn encode_audio(&mut self, audio: &Tensor) -> Result<Tensor> {
        if let Some(ref mut tokenizer) = self.audio_tokenizer {
            // Ensure audio is 2D: (batch, samples)
            let audio_batched = if audio.dims().len() == 1 {
                audio.unsqueeze(0)?
            } else {
                audio.clone()
            };
            let codes = tokenizer.encode(&audio_batched)?;
            // If input was 1D, squeeze the batch dim from output
            if audio.dims().len() == 1 && codes.dims().len() == 3 {
                codes.squeeze(0)
            } else {
                Ok(codes)
            }
        } else {
            Err(candle_core::Error::Msg(
                "Audio tokenizer not available".to_string(),
            ))
        }
    }

    /// Get the sample rate of generated audio.
    pub fn sample_rate(&self) -> usize {
        self.audio_tokenizer
            .as_ref()
            .map(|t| t.output_sample_rate())
            .unwrap_or(24000)
    }

    // ===== High-Level Generation APIs (matching Python) =====

    /// Generate speech with a custom predefined voice (CustomVoice model).
    ///
    /// This method matches the Python `generate_custom_voice()` API.
    ///
    /// # Arguments
    ///
    /// * `text_ids` - Tokenized text IDs (from tokenizer)
    /// * `speaker` - Speaker name (must be in model's spk_id mapping)
    /// * `language` - Language code (e.g., "english", "chinese", "auto")
    /// * `instruct` - Optional instruction text for voice styling
    /// * `options` - Optional sampling parameters (uses defaults if None)
    ///
    /// # Returns
    ///
    /// `GenerationResult` containing audio waveform and sample rate.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Model is not a CustomVoice model
    /// - Speaker is not found in config
    /// - Language is not supported
    pub fn generate_custom_voice_full(
        &self,
        text_ids: &Tensor,
        speaker: &str,
        language: &str,
        instruct: Option<&str>,
        options: Option<CustomVoiceOptions>,
    ) -> Result<GenerationResult> {
        // Validate model type
        self.require_custom_voice_model()?;

        // Validate inputs
        self.validate_speaker(speaker)?;
        self.validate_language(language)?;

        let opts = options.unwrap_or_default();

        // Merge sampling config with defaults
        let sampling_config = self.generate_defaults.merge(
            opts.do_sample,
            opts.top_k,
            opts.top_p,
            opts.temperature,
            opts.repetition_penalty,
            opts.subtalker_do_sample,
            opts.subtalker_top_k,
            opts.subtalker_top_p,
            opts.subtalker_temperature,
        );

        let max_tokens = self
            .generate_defaults
            .effective_max_tokens(opts.max_new_tokens);

        // Tokenize instruct if provided
        let instruct_ids = if let Some(inst) = instruct {
            if let Some(ref processor) = self.text_processor {
                let ids = processor.tokenize_instruct(inst);
                tracing::debug!(
                    instruct = inst,
                    token_count = ids.len(),
                    tokens = ?&ids[..ids.len().min(20)],
                    "Tokenized instruct"
                );
                Some(Tensor::new(&ids[..], &self.device)?.unsqueeze(0)?)
            } else {
                tracing::debug!("No text_processor available, skipping instruct tokenization");
                None
            }
        } else {
            tracing::debug!("No instruct provided");
            None
        };

        // Build generation options
        let gen_options = GenerationOptions {
            language: language.to_string(),
            speaker: Some(speaker.to_string()),
            instruct: instruct.map(|s| s.to_string()),
            instruct_ids,
            non_streaming_mode: opts.non_streaming_mode.unwrap_or(true),
            speaker_embed: None,
            ref_codes: None,
            ref_text_ids: None,
            x_vector_only_mode: false,
        };

        // Generate using the full prompt construction pipeline
        let output = self
            .model
            .generate(text_ids, &gen_options, max_tokens, &sampling_config)?;

        // Check if any audio was generated
        let num_steps = output.codes.dim(1)?;
        if num_steps == 0 {
            return Err(candle_core::Error::Msg(
                "Generation produced no audio. The model generated 0 steps. \
                 This may indicate: (1) the input text is too short, \
                 (2) the model weights are not loaded correctly, \
                 (3) the speaker name is invalid, or \
                 (4) there's a configuration mismatch."
                    .to_string(),
            ));
        }

        // Decode to audio
        let audio = self.decode_output(&output)?;

        Ok(GenerationResult {
            audio,
            sample_rate: self.sample_rate(),
            codes: Some(output.codes),
            effective_lengths: output.effective_lengths,
        })
    }

    /// Generate speech with voice design from text description (VoiceDesign model).
    ///
    /// This method matches the Python `generate_voice_design()` API.
    ///
    /// # Arguments
    ///
    /// * `text_ids` - Tokenized text IDs (from tokenizer)
    /// * `instruct` - Voice description instruction (e.g., "A warm female voice")
    /// * `language` - Language code (e.g., "english", "chinese", "auto")
    /// * `options` - Optional sampling parameters (uses defaults if None)
    ///
    /// # Returns
    ///
    /// `GenerationResult` containing audio waveform and sample rate.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Model is not a VoiceDesign model
    /// - Language is not supported
    pub fn generate_voice_design_full(
        &self,
        text_ids: &Tensor,
        instruct: &str,
        language: &str,
        options: Option<VoiceDesignOptions>,
    ) -> Result<GenerationResult> {
        // Validate model type
        self.require_voice_design_model()?;

        // Validate language
        self.validate_language(language)?;

        let opts = options.unwrap_or_default();

        // Merge sampling config with defaults
        let sampling_config = self.generate_defaults.merge(
            opts.do_sample,
            opts.top_k,
            opts.top_p,
            opts.temperature,
            opts.repetition_penalty,
            opts.subtalker_do_sample,
            opts.subtalker_top_k,
            opts.subtalker_top_p,
            opts.subtalker_temperature,
        );

        let max_tokens = self
            .generate_defaults
            .effective_max_tokens(opts.max_new_tokens);

        // Tokenize voice description (instruct) for embedding
        let instruct_ids = if let Some(ref processor) = self.text_processor {
            let ids = processor.tokenize_instruct(instruct);
            tracing::debug!(
                instruct = instruct,
                token_count = ids.len(),
                tokens = ?&ids[..ids.len().min(20)],
                "VoiceDesign: Tokenized instruct"
            );
            Some(Tensor::new(&ids[..], &self.device)?.unsqueeze(0)?)
        } else {
            tracing::warn!("VoiceDesign: No text_processor available!");
            None
        };

        // Build generation options with instruct as the voice description
        let gen_options = GenerationOptions {
            language: language.to_string(),
            speaker: None,
            instruct: Some(instruct.to_string()),
            instruct_ids,
            non_streaming_mode: opts.non_streaming_mode.unwrap_or(true),
            speaker_embed: None,
            ref_codes: None,
            ref_text_ids: None,
            x_vector_only_mode: false,
        };

        // Generate using the full prompt construction pipeline
        let output = self
            .model
            .generate(text_ids, &gen_options, max_tokens, &sampling_config)?;

        // Check if any audio was generated
        let num_steps = output.codes.dim(1)?;
        if num_steps == 0 {
            return Err(candle_core::Error::Msg(
                "Generation produced no audio. The model generated 0 steps. \
                 This may indicate: (1) the input text is too short, \
                 (2) the model weights are not loaded correctly, or \
                 (3) there's a configuration mismatch."
                    .to_string(),
            ));
        }

        // Decode to audio
        let audio = self.decode_output(&output)?;

        Ok(GenerationResult {
            audio,
            sample_rate: self.sample_rate(),
            codes: Some(output.codes),
            effective_lengths: output.effective_lengths,
        })
    }

    /// Generate speech with voice cloning (Base model).
    ///
    /// This method matches the Python `generate_voice_clone()` API.
    ///
    /// # Arguments
    ///
    /// * `text_ids` - Tokenized text IDs (from tokenizer)
    /// * `prompt` - Voice clone prompt (from `create_voice_clone_prompt_*`)
    /// * `language` - Language code (e.g., "english", "chinese", "auto")
    /// * `options` - Optional sampling parameters (uses defaults if None)
    ///
    /// # Returns
    ///
    /// `GenerationResult` containing audio waveform and sample rate.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Model is not a Base model
    /// - Language is not supported
    /// - Voice clone prompt is invalid
    pub fn generate_voice_clone_full(
        &self,
        text_ids: &Tensor,
        prompt: &VoiceClonePromptItem,
        language: &str,
        options: Option<VoiceCloneOptions>,
    ) -> Result<GenerationResult> {
        // Validate model type
        self.require_base_model()?;

        // Validate language
        self.validate_language(language)?;

        // Validate prompt
        prompt.validate().map_err(candle_core::Error::Msg)?;

        let opts = options.unwrap_or_default();

        // Merge sampling config with defaults
        let sampling_config = self.generate_defaults.merge(
            opts.do_sample,
            opts.top_k,
            opts.top_p,
            opts.temperature,
            opts.repetition_penalty,
            opts.subtalker_do_sample,
            opts.subtalker_top_k,
            opts.subtalker_top_p,
            opts.subtalker_temperature,
        );

        let max_tokens = self
            .generate_defaults
            .effective_max_tokens(opts.max_new_tokens);

        // Get speaker embedding
        let speaker_embed = if prompt.ref_spk_embedding.dims().len() == 1 {
            prompt.ref_spk_embedding.unsqueeze(0)?
        } else {
            prompt.ref_spk_embedding.clone()
        };

        // Tokenize reference text for ICL mode if available
        // IMPORTANT: Use tokenize_ref_text, not tokenize_for_tts!
        // ref_text format: <|im_start|>assistant\n{text}<|im_end|>\n (2-token suffix)
        // tts format:      <|im_start|>assistant\n{text}<|im_end|>\n<|im_start|>assistant\n (5-token suffix)
        let ref_text_ids = if let Some(ref ref_text) = prompt.ref_text {
            if let Some(ref processor) = self.text_processor {
                let ids = processor.tokenize_ref_text(ref_text);
                Some(Tensor::from_vec(ids.clone(), (1, ids.len()), &self.device)?)
            } else {
                None
            }
        } else {
            None
        };

        // Build generation options
        let gen_options = GenerationOptions {
            language: language.to_string(),
            speaker: None,
            instruct: None,
            instruct_ids: None,
            // ICL mode benefits from non-streaming (separates text and codec embeddings).
            // X-vector only mode can use streaming.
            // User can override with explicit non_streaming_mode option.
            non_streaming_mode: opts
                .non_streaming_mode
                .unwrap_or(!prompt.x_vector_only_mode),
            speaker_embed: Some(speaker_embed),
            ref_codes: prompt.ref_code.clone(),
            ref_text_ids,
            x_vector_only_mode: prompt.x_vector_only_mode,
        };

        // Generate using the full prompt construction pipeline
        let output = self
            .model
            .generate(text_ids, &gen_options, max_tokens, &sampling_config)?;

        // Check if any audio was generated
        let num_steps = output.codes.dim(1)?;
        if num_steps == 0 {
            return Err(candle_core::Error::Msg(
                "Generation produced no audio. The model generated 0 steps. \
                 This may indicate: (1) the input text is too short, \
                 (2) the model weights are not loaded correctly, \
                 (3) the voice clone prompt is invalid, or \
                 (4) there's a configuration mismatch."
                    .to_string(),
            ));
        }

        // ICL mode: prepend ref_codes to generated codes before decoding,
        // then cut off the reference audio portion from the output.
        // This matches the Python implementation (qwen3_tts_model.py:614-629).
        let (audio, ref_audio_cut_samples) = if let Some(ref ref_codes) = prompt.ref_code {
            if !prompt.x_vector_only_mode {
                // ref_codes shape: (seq_len, num_quantizers)
                // output.codes shape: (batch, seq_len, num_quantizers)
                let ref_codes_len = ref_codes.dim(0)?;
                let output_codes_len = output.codes.dim(1)?;

                tracing::info!(
                    ref_codes_shape = ?ref_codes.dims(),
                    output_codes_shape = ?output.codes.dims(),
                    ref_codes_len = ref_codes_len,
                    output_codes_len = output_codes_len,
                    "ICL prepend: before combining"
                );

                // Ensure ref_codes has batch dimension
                let ref_codes_batched = ref_codes.unsqueeze(0)?; // (1, ref_len, num_quantizers)

                // Concatenate: [ref_codes, generated_codes]
                let combined_codes = Tensor::cat(&[&ref_codes_batched, &output.codes], 1)?;

                // Decode the combined codes
                let combined_output = crate::nn::generation::Output {
                    codes: combined_codes,
                    effective_lengths: output
                        .effective_lengths
                        .as_ref()
                        .map(|lens| lens.iter().map(|&l| l + ref_codes_len).collect()),
                    num_steps: output.num_steps + ref_codes_len,
                };

                tracing::info!(
                    combined_codes_shape = ?combined_output.codes.dims(),
                    combined_effective_lengths = ?combined_output.effective_lengths,
                    "ICL prepend: after combining"
                );

                let full_audio = self.decode_output(&combined_output)?;

                // Calculate how many audio samples to cut off
                // cut = ref_len / decoded_len * wav_len (proportional approach, matches Python)
                let decoded_codes_len = combined_output
                    .effective_lengths
                    .as_ref()
                    .and_then(|l| l.first().copied())
                    .unwrap_or(combined_output.codes.dim(1)?);
                let audio_samples = full_audio.dim(full_audio.dims().len() - 1)?;
                let cut_ratio = ref_codes_len as f64 / decoded_codes_len as f64;
                let cut_samples = (cut_ratio * audio_samples as f64) as usize;

                // Compute actual samples per code for reference
                let samples_per_code = audio_samples as f64 / decoded_codes_len as f64;

                tracing::info!(
                    ref_codes_len = ref_codes_len,
                    decoded_codes_len = decoded_codes_len,
                    audio_samples = audio_samples,
                    cut_ratio = format!("{:.4}", cut_ratio),
                    cut_samples = cut_samples,
                    samples_per_code = format!("{:.2}", samples_per_code),
                    "ICL prepend: cut calculation"
                );

                // Cut off the reference audio portion
                let audio = if full_audio.dims().len() == 2 {
                    // Shape: (batch, samples)
                    full_audio.i((.., cut_samples..))?
                } else {
                    // Shape: (samples,)
                    full_audio.i(cut_samples..)?
                };

                tracing::info!(
                    full_audio_samples = audio_samples,
                    output_audio_samples = audio.dim(audio.dims().len() - 1)?,
                    "ICL prepend: after cutting"
                );

                (audio, cut_samples)
            } else {
                // X-vector only mode: no prepending/cutting needed
                (self.decode_output(&output)?, 0)
            }
        } else {
            // No ref_codes: standard decoding
            (self.decode_output(&output)?, 0)
        };

        let _ = ref_audio_cut_samples; // Used for debugging, silence unused warning

        Ok(GenerationResult {
            audio,
            sample_rate: self.sample_rate(),
            codes: Some(output.codes),
            effective_lengths: output.effective_lengths,
        })
    }

    // =========================================================================
    // High-Level Text-to-Audio API (with automatic tokenization)
    // =========================================================================

    /// Generate speech from text using a custom voice speaker.
    ///
    /// This is a convenience method that handles tokenization automatically.
    /// Requires a text processor to be loaded.
    ///
    /// # Arguments
    /// * `text` - The text to synthesize
    /// * `speaker` - Speaker name (must be in model's speaker config)
    /// * `language` - Language code (e.g., "english", "chinese")
    /// * `instruct` - Optional instruction for speaking style
    /// * `options` - Generation options (temperature, etc.)
    ///
    /// # Example
    /// ```no_run
    /// use qwen_tts::model::loader::{ModelLoader, LoaderConfig};
    /// use candle_core::Device;
    ///
    /// # fn main() -> Result<(), Box<dyn std::error::Error>> {
    /// let loader = ModelLoader::from_local_dir("/path/to/model")?;
    /// let model = loader.load_tts_model(&Device::Cpu, &LoaderConfig::default())?;
    /// let result = model.generate_custom_voice_from_text(
    ///     "Hello, world!",
    ///     "vivian",
    ///     "english",
    ///     None,
    ///     None,
    /// )?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn generate_custom_voice_from_text(
        &self,
        text: &str,
        speaker: &str,
        language: &str,
        instruct: Option<&str>,
        options: Option<CustomVoiceOptions>,
    ) -> Result<GenerationResult> {
        // Tokenize the text
        let token_ids = self.tokenize_text(text).map_err(candle_core::Error::Msg)?;

        // Convert to tensor
        let text_ids = Tensor::from_vec(token_ids.clone(), (1, token_ids.len()), &self.device)?;

        // Call the underlying method
        self.generate_custom_voice_full(&text_ids, speaker, language, instruct, options)
    }

    /// Generate speech from text using voice design with streaming audio output.
    ///
    /// Like `generate_voice_design_from_text` but calls `on_audio` with f32 PCM
    /// chunks as they become available during generation, enabling sub-350ms TTFA.
    ///
    /// The first chunk is emitted after just 1 code frame (~30-50ms generation time),
    /// then subsequent chunks are emitted every 4 frames. Each code frame decodes to
    /// ~2000 PCM samples (83ms audio at 24kHz).
    ///
    /// # Arguments
    /// * `text` - The text to synthesize
    /// * `voice_description` - Natural language description of the desired voice
    /// * `language` - Language code
    /// * `options` - Generation options
    /// * `on_audio` - Callback receiving f32 PCM sample slices at 24kHz
    pub fn generate_voice_design_streaming<F>(
        &self,
        text: &str,
        voice_description: &str,
        language: &str,
        options: Option<VoiceDesignOptions>,
        mut on_audio: F,
    ) -> Result<()>
    where
        F: FnMut(&[f32]),
    {
        // Validate model type and language
        self.require_voice_design_model()?;
        self.validate_language(language)?;

        let opts = options.unwrap_or_default();

        // Merge sampling config with defaults
        let sampling_config = self.generate_defaults.merge(
            opts.do_sample,
            opts.top_k,
            opts.top_p,
            opts.temperature,
            opts.repetition_penalty,
            opts.subtalker_do_sample,
            opts.subtalker_top_k,
            opts.subtalker_top_p,
            opts.subtalker_temperature,
        );

        let max_tokens = self
            .generate_defaults
            .effective_max_tokens(opts.max_new_tokens);

        // Tokenize text
        let token_ids = self.tokenize_text(text).map_err(candle_core::Error::Msg)?;
        let text_ids = Tensor::from_vec(token_ids.clone(), (1, token_ids.len()), &self.device)?;

        // Tokenize voice description (instruct) for embedding
        let instruct_ids = if let Some(ref processor) = self.text_processor {
            let ids = processor.tokenize_instruct(voice_description);
            Some(Tensor::new(&ids[..], &self.device)?.unsqueeze(0)?)
        } else {
            None
        };

        // Build generation options
        let gen_options = GenerationOptions {
            language: language.to_string(),
            speaker: None,
            instruct: Some(voice_description.to_string()),
            instruct_ids,
            non_streaming_mode: opts.non_streaming_mode.unwrap_or(true),
            speaker_embed: None,
            ref_codes: None,
            ref_text_ids: None,
            x_vector_only_mode: false,
        };

        // Pre-extract tokenizer reference — enables field splitting so the borrow
        // checker sees self.model and self.audio_tokenizer as disjoint borrows.
        let tokenizer = self.audio_tokenizer.as_ref().ok_or_else(|| {
            candle_core::Error::Msg(
                "Audio tokenizer not loaded. Cannot decode streaming audio codes.".to_string(),
            )
        })?;

        // Streaming decode state
        let mut code_buffer: Vec<Tensor> = Vec::new();
        let mut total_samples_emitted: usize = 0;
        let emit_first_after: usize = 1; // Emit after 1st frame for fastest TTFA
        let emit_every: usize = 4; // Then emit every 4 frames (~333ms audio)

        // Generate with streaming callback
        let _output = self.model.generate_streaming(
            &text_ids,
            &gen_options,
            max_tokens,
            &sampling_config,
            |codes: &Tensor, _step: usize| {
                code_buffer.push(codes.clone());

                let should_emit = if total_samples_emitted == 0 {
                    code_buffer.len() >= emit_first_after
                } else {
                    code_buffer.len() % emit_every == 0
                };

                if should_emit {
                    // Stack codes: Vec<(32,)> → (N, 32) → (1, N, 32) for decoder
                    if let Ok(stacked) = Tensor::stack(&code_buffer, 0) {
                        if let Ok(codes_3d) = stacked.unsqueeze(0) {
                            if let Ok(audio) = tokenizer.decode(&codes_3d) {
                                if let Ok(samples) = audio
                                    .flatten_all()
                                    .and_then(|t| t.to_dtype(candle_core::DType::F32))
                                    .and_then(|t| t.to_vec1::<f32>())
                                {
                                    if samples.len() > total_samples_emitted {
                                        on_audio(&samples[total_samples_emitted..]);
                                        total_samples_emitted = samples.len();
                                    }
                                }
                            }
                        }
                    }
                }
            },
        )?;

        // Final flush: decode all codes and emit any remaining audio
        if !code_buffer.is_empty() {
            if let Ok(stacked) = Tensor::stack(&code_buffer, 0) {
                if let Ok(codes_3d) = stacked.unsqueeze(0) {
                    if let Ok(audio) = tokenizer.decode(&codes_3d) {
                        if let Ok(samples) = audio
                            .flatten_all()
                            .and_then(|t| t.to_dtype(candle_core::DType::F32))
                            .and_then(|t| t.to_vec1::<f32>())
                        {
                            if samples.len() > total_samples_emitted {
                                on_audio(&samples[total_samples_emitted..]);
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Generate speech from text using voice design.
    ///
    /// Creates a voice based on a natural language description.
    /// Requires a text processor to be loaded.
    ///
    /// # Arguments
    /// * `text` - The text to synthesize
    /// * `voice_description` - Natural language description of the desired voice
    /// * `language` - Language code
    /// * `options` - Generation options
    ///
    /// # Example
    /// ```no_run
    /// use qwen_tts::model::loader::{ModelLoader, LoaderConfig};
    /// use candle_core::Device;
    ///
    /// # fn main() -> Result<(), Box<dyn std::error::Error>> {
    /// let loader = ModelLoader::from_local_dir("/path/to/model")?;
    /// let model = loader.load_tts_model(&Device::Cpu, &LoaderConfig::default())?;
    /// let result = model.generate_voice_design_from_text(
    ///     "Hello, world!",
    ///     "A warm female voice with slight British accent",
    ///     "english",
    ///     None,
    /// )?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn generate_voice_design_from_text(
        &self,
        text: &str,
        voice_description: &str,
        language: &str,
        options: Option<VoiceDesignOptions>,
    ) -> Result<GenerationResult> {
        // Tokenize the text
        let token_ids = self.tokenize_text(text).map_err(candle_core::Error::Msg)?;

        // Convert to tensor
        let text_ids = Tensor::from_vec(token_ids.clone(), (1, token_ids.len()), &self.device)?;

        // Call the underlying method
        self.generate_voice_design_full(&text_ids, voice_description, language, options)
    }

    /// Generate speech from text using voice cloning.
    ///
    /// Uses a voice clone prompt (created from reference audio) to clone a voice.
    /// Requires a text processor to be loaded.
    ///
    /// # Arguments
    /// * `text` - The text to synthesize
    /// * `prompt` - Voice clone prompt (from `create_voice_clone_prompt_from_*`)
    /// * `language` - Language code
    /// * `options` - Generation options
    ///
    /// # Example
    /// ```no_run
    /// use qwen_tts::model::loader::{ModelLoader, LoaderConfig};
    /// use qwen_tts::model::voice_clone::VoiceClonePromptItem;
    /// use candle_core::{Device, Tensor, DType};
    ///
    /// # fn main() -> Result<(), Box<dyn std::error::Error>> {
    /// let device = Device::Cpu;
    /// let loader = ModelLoader::from_local_dir("/path/to/model")?;
    /// let model = loader.load_tts_model(&device, &LoaderConfig::default())?;
    ///
    /// // Create a voice clone prompt (normally from reference audio)
    /// let speaker_embed = Tensor::zeros((1024,), DType::F32, &device)?;
    /// let prompt = VoiceClonePromptItem::x_vector_only(speaker_embed);
    ///
    /// // Generate with the cloned voice
    /// let result = model.generate_voice_clone_from_text(
    ///     "This is the text I want to synthesize.",
    ///     &prompt,
    ///     "english",
    ///     None,
    /// )?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn generate_voice_clone_from_text(
        &self,
        text: &str,
        prompt: &VoiceClonePromptItem,
        language: &str,
        options: Option<VoiceCloneOptions>,
    ) -> Result<GenerationResult> {
        // Tokenize the text
        let token_ids = self.tokenize_text(text).map_err(candle_core::Error::Msg)?;

        // Convert to tensor
        let text_ids = Tensor::from_vec(token_ids.clone(), (1, token_ids.len()), &self.device)?;

        // Call the underlying method
        self.generate_voice_clone_full(&text_ids, prompt, language, options)
    }

    /// Generate speech for multiple texts using custom voice (batched).
    ///
    /// Tokenizes and pads all texts, then generates speech in a batch.
    ///
    /// # Arguments
    /// * `texts` - The texts to synthesize
    /// * `speaker` - Speaker name
    /// * `language` - Language code
    /// * `instruct` - Optional instruction
    /// * `options` - Generation options
    ///
    /// # Returns
    /// A vector of `GenerationResult`, one per input text.
    pub fn generate_custom_voice_from_texts_batch(
        &self,
        texts: &[&str],
        speaker: &str,
        language: &str,
        instruct: Option<&str>,
        options: Option<CustomVoiceOptions>,
    ) -> Result<Vec<GenerationResult>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        // Tokenize all texts with padding
        let tokenized = self
            .tokenize_texts(texts)
            .map_err(candle_core::Error::Msg)?;

        // Generate for each text individually (batch generation with different lengths
        // is complex, so we iterate for simplicity)
        let mut results = Vec::with_capacity(texts.len());
        for (i, token_seq) in tokenized.input_ids.iter().enumerate() {
            // Use only the non-padded tokens (original length)
            let original_len = tokenized.lengths[i];
            let tokens: Vec<u32> = token_seq[token_seq.len() - original_len..].to_vec();

            let text_ids = Tensor::from_vec(tokens.clone(), (1, tokens.len()), &self.device)?;

            let result = self.generate_custom_voice_full(
                &text_ids,
                speaker,
                language,
                instruct,
                options.clone(),
            )?;
            results.push(result);
        }

        Ok(results)
    }
}
