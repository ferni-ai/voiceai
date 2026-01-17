//! Fast Token and Word Counting
//!
//! This module provides optimized token/word counting using byte-level operations.
//! Called on every LLM turn for context management.
//!
//! Key optimizations:
//! - Byte-level iteration (no UTF-8 decoding for basic counting)
//! - SIMD-friendly inner loops
//! - Parallel batch processing
//!
//! Expected performance: 2-3x faster than JavaScript split/filter

use memchr::memchr_iter;
use rayon::prelude::*;

/// Count words in text (space-separated tokens)
/// Fast byte-level counting without full tokenization
#[inline]
pub fn count_words(text: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }

    let bytes = text.as_bytes();
    let mut count = 0u32;
    let mut in_word = false;

    // Byte-level iteration (faster than char iteration)
    for &b in bytes {
        if b == b' ' || b == b'\t' || b == b'\n' || b == b'\r' {
            if in_word {
                count += 1;
                in_word = false;
            }
        } else {
            in_word = true;
        }
    }

    // Count last word if text doesn't end with whitespace
    if in_word {
        count += 1;
    }

    count
}

/// Count approximate tokens (OpenAI-style)
/// Rough approximation: words + punctuation + special tokens
/// For exact counts, use tiktoken, but this is 10-100x faster
#[inline]
pub fn count_tokens_approx(text: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }

    let bytes = text.as_bytes();
    let mut token_count = 0u32;
    let mut in_word = false;

    for &b in bytes {
        match b {
            // Whitespace ends word
            b' ' | b'\t' | b'\n' | b'\r' => {
                if in_word {
                    token_count += 1;
                    in_word = false;
                }
            }
            // Punctuation is often a separate token
            b'.' | b',' | b'!' | b'?' | b';' | b':' | b'"' | b'\'' | b'(' | b')' | b'[' | b']'
            | b'{' | b'}' | b'-' | b'/' | b'\\' | b'@' | b'#' | b'$' | b'%' | b'^' | b'&'
            | b'*' | b'+' | b'=' | b'<' | b'>' | b'|' | b'~' | b'`' => {
                if in_word {
                    token_count += 1;
                    in_word = false;
                }
                token_count += 1; // Punctuation is its own token
            }
            // Regular characters
            _ => {
                in_word = true;
            }
        }
    }

    // Count last word
    if in_word {
        token_count += 1;
    }

    token_count
}

/// Count characters (Unicode-aware)
#[inline]
pub fn count_chars(text: &str) -> u32 {
    text.chars().count() as u32
}

/// Count bytes
#[inline]
pub fn count_bytes(text: &str) -> u32 {
    text.len() as u32
}

/// Count sentences (period/exclamation/question terminated)
#[inline]
pub fn count_sentences(text: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }

    let bytes = text.as_bytes();
    let mut count = 0u32;

    for (i, &b) in bytes.iter().enumerate() {
        if b == b'.' || b == b'!' || b == b'?' {
            // Check it's not part of abbreviation or ellipsis
            // Simple heuristic: followed by space, newline, or end
            if i + 1 >= bytes.len()
                || bytes[i + 1] == b' '
                || bytes[i + 1] == b'\n'
                || bytes[i + 1] == b'\r'
            {
                count += 1;
            }
        }
    }

    // Count at least 1 if there's any text
    count.max(if text.trim().is_empty() { 0 } else { 1 })
}

/// Count lines (newline-separated)
#[inline]
pub fn count_lines(text: &str) -> u32 {
    if text.is_empty() {
        return 0;
    }

    // Count newlines + 1 (for the last line)
    let newline_count = memchr_iter(b'\n', text.as_bytes()).count() as u32;
    newline_count + 1
}

/// Comprehensive text statistics
#[derive(Debug, Clone)]
pub struct TextStats {
    pub words: u32,
    pub tokens_approx: u32,
    pub chars: u32,
    pub bytes: u32,
    pub sentences: u32,
    pub lines: u32,
    pub avg_word_length: f32,
}

/// Get comprehensive text statistics
pub fn get_text_stats(text: &str) -> TextStats {
    let words = count_words(text);
    let chars = count_chars(text);

    TextStats {
        words,
        tokens_approx: count_tokens_approx(text),
        chars,
        bytes: count_bytes(text),
        sentences: count_sentences(text),
        lines: count_lines(text),
        avg_word_length: if words > 0 {
            // Approximate: chars excluding spaces / words
            let non_space_chars = text.chars().filter(|c| !c.is_whitespace()).count() as f32;
            non_space_chars / words as f32
        } else {
            0.0
        },
    }
}

/// Batch count words for multiple texts
pub fn batch_count_words(texts: &[&str]) -> Vec<u32> {
    texts.par_iter().map(|t| count_words(t)).collect()
}

/// Batch count tokens for multiple texts
pub fn batch_count_tokens(texts: &[&str]) -> Vec<u32> {
    texts.par_iter().map(|t| count_tokens_approx(t)).collect()
}

/// Batch get stats for multiple texts
pub fn batch_get_stats(texts: &[&str]) -> Vec<TextStats> {
    texts.par_iter().map(|t| get_text_stats(t)).collect()
}

/// Estimate if text exceeds token limit (fast check)
#[inline]
pub fn exceeds_token_limit(text: &str, limit: u32) -> bool {
    // Quick byte-based estimate first (1 token ≈ 4 bytes average)
    if (text.len() as u32) / 4 < limit {
        return false;
    }

    // More accurate count if needed
    count_tokens_approx(text) > limit
}

/// Truncate text to approximate token limit
pub fn truncate_to_tokens(text: &str, max_tokens: u32) -> &str {
    if !exceeds_token_limit(text, max_tokens) {
        return text;
    }

    // Binary search for the right cutoff point
    let bytes = text.as_bytes();
    let mut low = 0usize;
    let mut high = bytes.len();

    while low < high {
        let mid = (low + high + 1) / 2;

        // Find a valid UTF-8 boundary
        let mut boundary = mid;
        while boundary > 0 && (bytes[boundary] & 0xC0) == 0x80 {
            boundary -= 1;
        }

        let slice = &text[..boundary];
        if count_tokens_approx(slice) <= max_tokens {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    // Find word boundary
    let mut end = low.min(bytes.len());
    while end > 0 && !bytes[end - 1].is_ascii_whitespace() {
        end -= 1;
    }

    // If we couldn't find a word boundary, use the UTF-8 boundary
    if end == 0 {
        while low > 0 && (bytes[low] & 0xC0) == 0x80 {
            low -= 1;
        }
        end = low;
    }

    &text[..end]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_words() {
        assert_eq!(count_words("hello world"), 2);
        assert_eq!(count_words("  hello   world  "), 2);
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("single"), 1);
        assert_eq!(count_words("one two three four five"), 5);
    }

    #[test]
    fn test_count_tokens_approx() {
        // Words + punctuation
        assert!(count_tokens_approx("Hello, world!") >= 4); // Hello , world !
        assert!(count_tokens_approx("It's fine.") >= 4); // It ' s fine .
    }

    #[test]
    fn test_count_sentences() {
        assert_eq!(count_sentences("Hello. How are you?"), 2);
        assert_eq!(count_sentences("One sentence"), 1);
        assert_eq!(count_sentences("Wait... what?"), 2); // Ellipsis counts as end
        assert_eq!(count_sentences(""), 0);
    }

    #[test]
    fn test_count_lines() {
        assert_eq!(count_lines("line1\nline2\nline3"), 3);
        assert_eq!(count_lines("single line"), 1);
        assert_eq!(count_lines(""), 0);
    }

    #[test]
    fn test_get_text_stats() {
        let stats = get_text_stats("Hello, world! How are you?");
        assert!(stats.words >= 4);
        assert!(stats.sentences >= 2);
        assert!(stats.chars >= 20);
    }

    #[test]
    fn test_exceeds_token_limit() {
        assert!(!exceeds_token_limit("short", 100));
        assert!(exceeds_token_limit("word ".repeat(200).as_str(), 100));
    }

    #[test]
    fn test_truncate_to_tokens() {
        let long_text = "word ".repeat(200);
        let truncated = truncate_to_tokens(&long_text, 50);
        assert!(count_tokens_approx(truncated) <= 50);
    }

    #[test]
    fn test_batch_operations() {
        let texts = vec!["hello world", "one two three", "single"];
        let counts = batch_count_words(&texts);
        assert_eq!(counts, vec![2, 3, 1]);
    }
}
