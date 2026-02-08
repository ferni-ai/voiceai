//! Autoregressive text generation with temperature sampling.

use std::path::Path;

use mlx_rs::{ops, ops::indexing, Array};
use tokenizers::Tokenizer;

use crate::config::ThinkerTextConfig;
use crate::thinker::Qwen3OmniThinker;

/// Text generation helper.
pub struct TextGenerator {
    pub tokenizer: Tokenizer,
    pub eos_token_id: u32,
    pub bos_token_id: u32,
}

impl TextGenerator {
    pub fn new(model_dir: &Path, _config: &ThinkerTextConfig) -> anyhow::Result<Self> {
        let tokenizer_path = model_dir.join("tokenizer.json");
        let tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {}", e))?;

        // Default EOS/BOS for Qwen3
        let eos_token_id = tokenizer
            .token_to_id("<|endoftext|>")
            .unwrap_or(151643);
        let bos_token_id = tokenizer
            .token_to_id("<|im_start|>")
            .unwrap_or(151644);

        Ok(Self {
            tokenizer,
            eos_token_id,
            bos_token_id,
        })
    }

    /// Tokenize text to input_ids array (1, L).
    pub fn tokenize(&self, text: &str) -> anyhow::Result<Array> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| anyhow::anyhow!("Tokenization failed: {}", e))?;
        let ids: Vec<i32> = encoding.get_ids().iter().map(|&id| id as i32).collect();
        let len = ids.len() as i32;
        Ok(Array::from_slice(&ids, &[1, len]))
    }

    /// Decode token ids back to text.
    pub fn decode(&self, token_ids: &[u32]) -> anyhow::Result<String> {
        self.tokenizer
            .decode(token_ids, true)
            .map_err(|e| anyhow::anyhow!("Decode failed: {}", e))
    }

    /// Autoregressive generation loop.
    ///
    /// `thinker`: the Thinker model.
    /// `input_ids`: initial token ids (1, L).
    /// `max_tokens`: maximum number of new tokens.
    /// `temperature`: sampling temperature (0 = greedy).
    /// `audio_features`: optional audio features for conditioning.
    pub fn generate(
        &self,
        thinker: &mut Qwen3OmniThinker,
        input_ids: &Array,
        max_tokens: usize,
        temperature: f32,
        audio_features: Option<&Array>,
    ) -> anyhow::Result<Vec<u32>> {
        let mut all_ids: Vec<i32> = input_ids.as_slice::<i32>().to_vec();
        let mut generated_tokens: Vec<u32> = Vec::new();

        for _ in 0..max_tokens {
            let len = all_ids.len() as i32;
            let current_input = Array::from_slice(&all_ids, &[1, len]);

            let logits = thinker.forward_thinker(&current_input, audio_features)?;

            let idx_last = Array::from_int(len - 1);
            let last_logits = logits.take_axis(&idx_last, 1)?;
            let last_logits = last_logits.squeeze_axes(&[0, 1])?;

            let next_token = if temperature <= 0.0 {
                indexing::argmax_axis(&last_logits, 0, false)?
            } else {
                let temp_arr = Array::from(temperature);
                let scaled = last_logits.divide(&temp_arr)?;
                let probs = ops::softmax_axis(&scaled, -1, None)?;
                mlx_rs::random::categorical(&probs, None, None, None)?
            };

            next_token.eval()?;
            let token_id = next_token.item::<i32>() as u32;

            if token_id == self.eos_token_id {
                break;
            }

            generated_tokens.push(token_id);
            all_ids.push(token_id as i32);
        }

        Ok(generated_tokens)
    }
}
