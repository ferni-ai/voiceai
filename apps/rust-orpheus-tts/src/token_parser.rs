//! Orpheus SNAC token parser.
//!
//! Orpheus TTS generates `<custom_token_N>` tokens where N encodes a SNAC audio
//! code plus a position-dependent offset. Every 7 tokens form one SNAC "frame"
//! distributed across 3 codebook levels:
//!
//!   Position 0 → Level 0 (coarsest, ~12 Hz)
//!   Position 1 → Level 1 (~23 Hz)
//!   Position 2 → Level 2 (finest, ~47 Hz)
//!   Position 3 → Level 2
//!   Position 4 → Level 1
//!   Position 5 → Level 2
//!   Position 6 → Level 2
//!
//! The code formula: `code = raw_number - 10 - (position_in_group * 4096)`
//! Each code is in range [0, 4095] (codebook size = 4096).

/// SNAC codes separated by codebook level, ready for the decoder.
#[derive(Debug, Clone)]
pub struct SnacCodes {
    /// Level 0 (coarsest): N codes at ~12 Hz
    pub level_0: Vec<i64>,
    /// Level 1 (middle): 2*N codes at ~23 Hz
    pub level_1: Vec<i64>,
    /// Level 2 (finest): 4*N codes at ~47 Hz
    pub level_2: Vec<i64>,
}

/// Maps token position within a group of 7 to SNAC codebook level.
const POSITION_TO_LEVEL: [usize; 7] = [0, 1, 2, 2, 1, 2, 2];

/// Minimum groups to buffer before emitting (4 groups = 28 tokens ≈ 333ms).
const MIN_GROUPS_FOR_EMIT: usize = 4;

/// Streaming parser that accumulates Orpheus tokens and emits SNAC code batches.
pub struct TokenParser {
    /// Accumulated codes per level
    codes: [Vec<i64>; 3],
    /// Current token index (determines position within group of 7)
    token_index: usize,
    /// Number of complete groups accumulated
    complete_groups: usize,
    /// Total tokens processed
    pub total_tokens: usize,
}

impl TokenParser {
    pub fn new() -> Self {
        Self {
            codes: [Vec::new(), Vec::new(), Vec::new()],
            token_index: 0,
            complete_groups: 0,
            total_tokens: 0,
        }
    }

    /// Feed a token string from the LLM. Returns `Some(SnacCodes)` when enough
    /// tokens have accumulated for a decode batch.
    ///
    /// Token format: `<custom_token_12345>` or just `custom_token_12345` or the
    /// raw token text from the streaming API.
    pub fn feed_token(&mut self, token_str: &str) -> Option<SnacCodes> {
        let raw_number = match parse_custom_token(token_str) {
            Some(n) => n,
            None => return None, // Not an audio token (could be BOS/EOS/etc.)
        };

        let position = self.token_index % 7;
        let code = raw_number - 10 - (position as i64 * 4096);

        // Validate code is in valid range
        if code < 0 || code >= 4096 {
            tracing::warn!(
                raw_number,
                position,
                code,
                "SNAC code out of range, skipping"
            );
            return None;
        }

        let level = POSITION_TO_LEVEL[position];
        self.codes[level].push(code);

        self.token_index += 1;
        self.total_tokens += 1;

        // Check if we completed a group of 7
        if self.token_index % 7 == 0 {
            self.complete_groups += 1;

            // Emit batch when we have enough groups
            if self.complete_groups >= MIN_GROUPS_FOR_EMIT {
                return Some(self.take_codes());
            }
        }

        None
    }

    /// Flush any remaining buffered codes (for end of generation).
    ///
    /// Only emits complete groups — discards any trailing tokens from an
    /// incomplete group of 7 to maintain the 1:2:4 level ratio required
    /// by the SNAC decoder.
    pub fn flush(&mut self) -> Option<SnacCodes> {
        if self.codes[0].is_empty() {
            return None;
        }

        // Truncate to complete groups only (1:2:4 ratio)
        let complete = self.codes[0].len().min(self.codes[1].len() / 2).min(self.codes[2].len() / 4);
        if complete == 0 {
            self.codes = [Vec::new(), Vec::new(), Vec::new()];
            return None;
        }

        let codes = SnacCodes {
            level_0: self.codes[0][..complete].to_vec(),
            level_1: self.codes[1][..complete * 2].to_vec(),
            level_2: self.codes[2][..complete * 4].to_vec(),
        };
        self.codes = [Vec::new(), Vec::new(), Vec::new()];
        self.complete_groups = 0;
        Some(codes)
    }

    /// Take accumulated codes and reset buffers.
    fn take_codes(&mut self) -> SnacCodes {
        let codes = SnacCodes {
            level_0: std::mem::take(&mut self.codes[0]),
            level_1: std::mem::take(&mut self.codes[1]),
            level_2: std::mem::take(&mut self.codes[2]),
        };
        self.complete_groups = 0;
        codes
    }
}

/// Parse `<custom_token_N>` into the raw number N.
/// Handles formats: `<custom_token_12345>`, `custom_token_12345`, or just the
/// token text from various llama.cpp output formats.
fn parse_custom_token(s: &str) -> Option<i64> {
    let s = s.trim();

    // Skip non-audio special tokens (token IDs < 10 are control tokens)
    if s == "<|audio|>" || s == "<|eot_id|>" || s.starts_with("<|") {
        return None;
    }

    // Try extracting number from various formats
    let number_str = if let Some(rest) = s.strip_prefix("<custom_token_") {
        rest.strip_suffix('>')
    } else if let Some(rest) = s.strip_prefix("custom_token_") {
        Some(rest)
    } else {
        None
    };

    number_str.and_then(|n| n.parse::<i64>().ok()).filter(|&n| n >= 10)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_angle_bracket_format() {
        assert_eq!(parse_custom_token("<custom_token_100>"), Some(100));
    }

    #[test]
    fn parse_bare_format() {
        assert_eq!(parse_custom_token("custom_token_100"), Some(100));
    }

    #[test]
    fn skip_control_tokens() {
        assert_eq!(parse_custom_token("<custom_token_3>"), None); // < 10
        assert_eq!(parse_custom_token("<|audio|>"), None);
        assert_eq!(parse_custom_token("<|eot_id|>"), None);
    }

    #[test]
    fn code_extraction_level_0() {
        // Position 0: code = number - 10
        let code = 100i64 - 10 - (0 * 4096);
        assert_eq!(code, 90);
    }

    #[test]
    fn code_extraction_level_1() {
        // Position 1: code = number - 10 - 4096
        let code = 4200i64 - 10 - (1 * 4096);
        assert_eq!(code, 94);
    }

    #[test]
    fn full_group_of_7_tokens() {
        let mut parser = TokenParser::new();

        // Generate 28 tokens (4 groups) to trigger emit
        // Position offsets: 0, 4096, 8192, 12288, 16384, 20480, 24576
        for group in 0..4 {
            for pos in 0..7 {
                let code = 42; // target code for all positions
                let raw = code + 10 + pos * 4096;
                let token = format!("<custom_token_{}>", raw);
                let result = parser.feed_token(&token);

                if group == 3 && pos == 6 {
                    // Should emit after 4th complete group
                    assert!(result.is_some(), "should emit after 28 tokens");
                    let codes = result.unwrap();
                    assert_eq!(codes.level_0.len(), 4); // 1 per group * 4
                    assert_eq!(codes.level_1.len(), 8); // 2 per group * 4
                    assert_eq!(codes.level_2.len(), 16); // 4 per group * 4
                    assert!(codes.level_0.iter().all(|&c| c == 42));
                } else {
                    assert!(result.is_none());
                }
            }
        }
    }

    #[test]
    fn flush_partial() {
        let mut parser = TokenParser::new();

        // Feed 7 tokens (1 group, not enough for auto-emit)
        for pos in 0..7 {
            let raw = 50 + 10 + pos * 4096;
            parser.feed_token(&format!("<custom_token_{}>", raw));
        }

        let flushed = parser.flush();
        assert!(flushed.is_some());
        let codes = flushed.unwrap();
        assert_eq!(codes.level_0.len(), 1);
        assert_eq!(codes.level_1.len(), 2);
        assert_eq!(codes.level_2.len(), 4);
    }
}
