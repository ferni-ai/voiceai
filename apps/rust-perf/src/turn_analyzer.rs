//! Turn Analysis with Aho-Corasick Multi-Pattern Matching
//!
//! This module provides fast turn-boundary detection using Aho-Corasick automaton.
//! Detects turn-final phrases and continuation phrases in O(n) time.
//!
//! Key optimizations:
//! - Aho-Corasick automaton (O(n) for ALL patterns simultaneously)
//! - Pre-compiled at startup via lazy_static
//! - Case-insensitive matching
//!
//! Expected performance: 2-4x faster than JavaScript iteration

use aho_corasick::{AhoCorasick, MatchKind};
use rayon::prelude::*;

lazy_static::lazy_static! {
    /// Pre-compiled Aho-Corasick automaton for turn-final phrases
    static ref TURN_FINAL_AC: TurnFinalAutomaton = TurnFinalAutomaton::new();

    /// Pre-compiled Aho-Corasick automaton for continuation phrases
    static ref CONTINUATION_AC: ContinuationAutomaton = ContinuationAutomaton::new();

    /// Combined automaton for both types
    static ref COMBINED_AC: CombinedAutomaton = CombinedAutomaton::new();
}

/// Turn-final phrases that indicate the speaker is likely done
const TURN_FINAL_PHRASES: &[&str] = &[
    "you know?",
    "right?",
    "isn't it?",
    "so yeah",
    "anyway",
    "that's basically it",
    "what's your take?",
    "i guess",
    "probably",
    "maybe",
    "what do you think?",
    "does that make sense?",
    "am i wrong?",
    "wouldn't you say?",
    "don't you think?",
    "that's it",
    "that's all",
    "end of story",
    "bottom line",
    "long story short",
    "in a nutshell",
    "to sum up",
    "basically",
    "essentially",
    "fundamentally",
    "at the end of the day",
    "when all is said and done",
    "if you ask me",
    "in my opinion",
    "from my perspective",
];

/// Continuation phrases that indicate the speaker will continue
const CONTINUATION_PHRASES: &[&str] = &[
    "but",
    "and",
    "because",
    "so",
    "although",
    "however",
    "also",
    "for example",
    "like",
    "i mean",
    "well",
    "actually",
    "basically",
    "you see",
    "the thing is",
    "here's the thing",
    "let me explain",
    "what i'm saying is",
    "on the other hand",
    "furthermore",
    "moreover",
    "in addition",
    "not only that",
    "plus",
    "besides",
    "anyway so",
    "anyway but",
    "hold on",
    "wait",
    "let me finish",
];

/// Pre-compiled turn-final automaton
struct TurnFinalAutomaton {
    ac: AhoCorasick,
    patterns: Vec<&'static str>,
}

impl TurnFinalAutomaton {
    fn new() -> Self {
        let patterns: Vec<&str> = TURN_FINAL_PHRASES.to_vec();
        let ac = AhoCorasick::builder()
            .ascii_case_insensitive(true)
            .match_kind(MatchKind::LeftmostFirst)
            .build(&patterns)
            .expect("Failed to build turn-final automaton");
        TurnFinalAutomaton { ac, patterns }
    }
}

/// Pre-compiled continuation automaton
struct ContinuationAutomaton {
    ac: AhoCorasick,
    patterns: Vec<&'static str>,
}

impl ContinuationAutomaton {
    fn new() -> Self {
        let patterns: Vec<&str> = CONTINUATION_PHRASES.to_vec();
        let ac = AhoCorasick::builder()
            .ascii_case_insensitive(true)
            .match_kind(MatchKind::LeftmostFirst)
            .build(&patterns)
            .expect("Failed to build continuation automaton");
        ContinuationAutomaton { ac, patterns }
    }
}

/// Combined automaton with tagged patterns
struct CombinedAutomaton {
    ac: AhoCorasick,
    pattern_types: Vec<PhraseType>,
    patterns: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PhraseType {
    TurnFinal,
    Continuation,
}

impl CombinedAutomaton {
    fn new() -> Self {
        let mut patterns = Vec::new();
        let mut pattern_types = Vec::new();

        // Add turn-final phrases
        for phrase in TURN_FINAL_PHRASES {
            patterns.push(phrase.to_string());
            pattern_types.push(PhraseType::TurnFinal);
        }

        // Add continuation phrases
        for phrase in CONTINUATION_PHRASES {
            patterns.push(phrase.to_string());
            pattern_types.push(PhraseType::Continuation);
        }

        let ac = AhoCorasick::builder()
            .ascii_case_insensitive(true)
            .match_kind(MatchKind::LeftmostFirst)
            .build(&patterns)
            .expect("Failed to build combined automaton");

        CombinedAutomaton {
            ac,
            pattern_types,
            patterns,
        }
    }
}

/// Match result with position information
#[derive(Debug, Clone)]
pub struct TurnPhraseMatch {
    pub phrase: String,
    pub phrase_type: PhraseType,
    pub start: usize,
    pub end: usize,
}

/// Result of turn analysis
#[derive(Debug, Clone)]
pub struct TurnAnalysisResult {
    /// All matches found
    pub matches: Vec<TurnPhraseMatch>,
    /// Number of turn-final phrases found
    pub turn_final_count: u32,
    /// Number of continuation phrases found
    pub continuation_count: u32,
    /// Whether text likely ends with turn-final phrase
    pub likely_turn_complete: bool,
    /// Whether text ends with continuation phrase
    pub likely_continuing: bool,
    /// Position of last turn-final phrase (if any)
    pub last_turn_final_pos: Option<usize>,
    /// Position of last continuation phrase (if any)
    pub last_continuation_pos: Option<usize>,
}

/// Analyze text for turn boundary indicators
pub fn analyze_turn(text: &str) -> TurnAnalysisResult {
    if text.is_empty() {
        return TurnAnalysisResult {
            matches: vec![],
            turn_final_count: 0,
            continuation_count: 0,
            likely_turn_complete: false,
            likely_continuing: false,
            last_turn_final_pos: None,
            last_continuation_pos: None,
        };
    }

    let combined = &*COMBINED_AC;
    let mut matches = Vec::new();
    let mut last_turn_final_pos = None;
    let mut last_continuation_pos = None;

    for mat in combined.ac.find_iter(text) {
        let pattern_idx = mat.pattern().as_usize();
        let phrase_type = combined.pattern_types[pattern_idx];
        let phrase = combined.patterns[pattern_idx].clone();

        matches.push(TurnPhraseMatch {
            phrase,
            phrase_type,
            start: mat.start(),
            end: mat.end(),
        });

        match phrase_type {
            PhraseType::TurnFinal => last_turn_final_pos = Some(mat.end()),
            PhraseType::Continuation => last_continuation_pos = Some(mat.end()),
        }
    }

    let turn_final_count = matches
        .iter()
        .filter(|m| m.phrase_type == PhraseType::TurnFinal)
        .count() as u32;
    let continuation_count = matches
        .iter()
        .filter(|m| m.phrase_type == PhraseType::Continuation)
        .count() as u32;

    // Determine likely state based on what's near the end
    let text_len = text.len();
    let near_end_threshold = 15; // Within 15 chars of end

    let likely_turn_complete = last_turn_final_pos
        .map(|pos| text_len - pos < near_end_threshold)
        .unwrap_or(false);

    let likely_continuing = last_continuation_pos
        .map(|pos| text_len - pos < near_end_threshold)
        .unwrap_or(false);

    TurnAnalysisResult {
        matches,
        turn_final_count,
        continuation_count,
        likely_turn_complete,
        likely_continuing,
        last_turn_final_pos,
        last_continuation_pos,
    }
}

/// Check if text contains any turn-final phrases
pub fn has_turn_final(text: &str) -> bool {
    TURN_FINAL_AC.ac.is_match(text)
}

/// Check if text contains any continuation phrases
pub fn has_continuation(text: &str) -> bool {
    CONTINUATION_AC.ac.is_match(text)
}

/// Find all turn-final phrases in text
pub fn find_turn_final_phrases(text: &str) -> Vec<(String, usize, usize)> {
    let ac = &*TURN_FINAL_AC;
    ac.ac
        .find_iter(text)
        .map(|m| {
            let pattern_idx = m.pattern().as_usize();
            (ac.patterns[pattern_idx].to_string(), m.start(), m.end())
        })
        .collect()
}

/// Find all continuation phrases in text
pub fn find_continuation_phrases(text: &str) -> Vec<(String, usize, usize)> {
    let ac = &*CONTINUATION_AC;
    ac.ac
        .find_iter(text)
        .map(|m| {
            let pattern_idx = m.pattern().as_usize();
            (ac.patterns[pattern_idx].to_string(), m.start(), m.end())
        })
        .collect()
}

/// Batch analyze multiple texts in parallel
pub fn batch_analyze_turn(texts: &[&str]) -> Vec<TurnAnalysisResult> {
    texts.par_iter().map(|t| analyze_turn(t)).collect()
}

/// Calculate turn probability score
/// Returns 0.0 (definitely continuing) to 1.0 (definitely complete)
pub fn turn_complete_probability(text: &str) -> f32 {
    let result = analyze_turn(text);

    if result.matches.is_empty() {
        return 0.5; // Neutral
    }

    let mut score = 0.5f32;

    // Adjust based on phrase presence near end
    if result.likely_turn_complete {
        score += 0.3;
    }
    if result.likely_continuing {
        score -= 0.3;
    }

    // Adjust based on overall counts
    let final_weight = result.turn_final_count as f32 * 0.1;
    let cont_weight = result.continuation_count as f32 * 0.1;
    score += final_weight - cont_weight;

    score.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_turn_final_detection() {
        assert!(has_turn_final("So yeah, that's basically it."));
        assert!(has_turn_final("What do you think?"));
        assert!(!has_turn_final("I was going to the store."));
    }

    #[test]
    fn test_continuation_detection() {
        assert!(has_continuation("But I think we should..."));
        assert!(has_continuation("Let me explain what I mean."));
        assert!(!has_continuation("That's all I have to say."));
    }

    #[test]
    fn test_analyze_turn() {
        let result = analyze_turn("I think, but on the other hand, you know?");
        assert!(result.turn_final_count >= 1);
        assert!(result.continuation_count >= 1);
        assert!(result.likely_turn_complete);
    }

    #[test]
    fn test_turn_probability() {
        let complete = turn_complete_probability("That's basically it, you know?");
        let continuing = turn_complete_probability("But let me explain what I mean...");
        assert!(complete > 0.5);
        assert!(continuing < 0.5);
    }

    #[test]
    fn test_case_insensitive() {
        assert!(has_turn_final("YOU KNOW?"));
        assert!(has_turn_final("You Know?"));
        assert!(has_continuation("BUT WAIT"));
        assert!(has_continuation("But Wait"));
    }

    #[test]
    fn test_batch_analysis() {
        let texts = vec![
            "What do you think?",
            "But let me explain...",
            "Just a normal sentence.",
        ];
        let results = batch_analyze_turn(&texts);
        assert_eq!(results.len(), 3);
        assert!(results[0].likely_turn_complete);
        assert!(results[1].likely_continuing);
    }
}
