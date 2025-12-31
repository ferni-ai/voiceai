//! SSML Pattern Processing with Optimized Regex
//!
//! This module provides fast SSML tag detection, extraction, and manipulation
//! using Rust's optimized regex engine (DFA-based).
//!
//! Key optimizations:
//! - Pre-compiled regex patterns (cached)
//! - Parallel processing for batch operations
//! - Zero-copy slicing where possible
//! - memchr for fast byte searching
//!
//! Expected performance: 3-10x faster than JavaScript regex

use memchr::memmem;
use rayon::prelude::*;
use regex::{Regex, RegexSet};
use std::collections::HashMap;
use std::sync::Mutex;

lazy_static::lazy_static! {
    /// Pre-compiled SSML tag patterns
    static ref SSML_PATTERNS: SsmlPatterns = SsmlPatterns::new();

    /// Finder for < character (start of any tag)
    static ref TAG_START_FINDER: memmem::Finder<'static> = memmem::Finder::new(b"<");

    /// Cache for custom patterns
    static ref CUSTOM_PATTERNS: Mutex<HashMap<String, Regex>> = Mutex::new(HashMap::new());
}

/// Pre-compiled SSML patterns
struct SsmlPatterns {
    // Individual tag patterns
    break_tag: Regex,
    emotion_tag: Regex,
    speed_tag: Regex,
    volume_tag: Regex,
    spell_tag: Regex,
    emphasis_tag: Regex,
    prosody_tag: Regex,
    phoneme_tag: Regex,
    say_as_tag: Regex,
    speak_tag: Regex,

    // Self-closing tag pattern
    self_closing: Regex,

    // Any SSML tag (for stripping)
    any_tag: Regex,

    // RegexSet for parallel matching
    tag_set: RegexSet,
}

impl SsmlPatterns {
    fn new() -> Self {
        SsmlPatterns {
            break_tag: Regex::new(r#"<break\s+time=["']?(\d+(?:ms|s))["']?\s*/>"#).unwrap(),
            emotion_tag: Regex::new(r#"<emotion\s+value=["']?([^"'>\s]+)["']?\s*/>"#).unwrap(),
            speed_tag: Regex::new(r#"<speed\s+ratio=["']?([\d.]+)["']?\s*/>"#).unwrap(),
            // Cartesia Sonic-3 specific tags
            volume_tag: Regex::new(r#"<volume\s+ratio=["']?([\d.]+)["']?\s*/?>"#).unwrap(),
            spell_tag: Regex::new(r#"<spell>([^<]*)</spell>"#).unwrap(),
            emphasis_tag: Regex::new(r#"<emphasis\s+level=["']?([^"'>\s]+)["']?>([^<]*)</emphasis>"#).unwrap(),
            prosody_tag: Regex::new(r#"<prosody\s+([^>]*)>([^<]*)</prosody>"#).unwrap(),
            phoneme_tag: Regex::new(r#"<phoneme\s+alphabet=["']?([^"'>\s]+)["']?\s+ph=["']?([^"']+)["']?>([^<]*)</phoneme>"#).unwrap(),
            say_as_tag: Regex::new(r#"<say-as\s+interpret-as=["']?([^"'>\s]+)["']?([^>]*)>([^<]*)</say-as>"#).unwrap(),
            speak_tag: Regex::new(r#"<speak[^>]*>([\s\S]*?)</speak>"#).unwrap(),
            self_closing: Regex::new(r#"<[^>]+/>"#).unwrap(),
            any_tag: Regex::new(r#"</?[a-zA-Z][^>]*>"#).unwrap(),
            tag_set: RegexSet::new(&[
                r#"<break\s"#,
                r#"<emotion\s"#,
                r#"<speed\s"#,
                r#"<volume\s"#,
                r#"<spell>"#,
                r#"</spell>"#,
                r#"<emphasis\s"#,
                r#"<prosody\s"#,
                r#"<phoneme\s"#,
                r#"<say-as\s"#,
                r#"<speak"#,
            ]).unwrap(),
        }
    }
}

/// SSML tag types
#[derive(Debug, Clone, PartialEq)]
pub enum SsmlTagType {
    Break,
    Emotion,
    Speed,
    Volume,   // Cartesia Sonic-3 specific
    Spell,    // Cartesia Sonic-3 specific
    Emphasis,
    Prosody,
    Phoneme,
    SayAs,
    Speak,
    Unknown,
}

/// Extracted SSML tag with its data
#[derive(Debug, Clone)]
pub struct ExtractedTag {
    pub tag_type: SsmlTagType,
    pub full_match: String,
    pub attributes: HashMap<String, String>,
    pub content: Option<String>,
    pub start_pos: usize,
    pub end_pos: usize,
}

/// Result of SSML analysis
#[derive(Debug, Clone)]
pub struct SsmlAnalysis {
    /// All extracted tags
    pub tags: Vec<ExtractedTag>,
    /// Plain text with all SSML removed
    pub plain_text: String,
    /// Total break time in milliseconds
    pub total_break_ms: u32,
    /// Detected emotions
    pub emotions: Vec<String>,
    /// Speed modifiers found
    pub speeds: Vec<f32>,
    /// Has any SSML tags
    pub has_ssml: bool,
}

/// Fast check if text contains any SSML tags
#[inline]
pub fn contains_ssml(text: &str) -> bool {
    let bytes = text.as_bytes();

    // Fast path: no < means no tags
    if TAG_START_FINDER.find(bytes).is_none() {
        return false;
    }

    // Check for known SSML patterns
    SSML_PATTERNS.tag_set.is_match(text)
}

/// Strip all SSML tags from text, leaving only content
pub fn strip_ssml(text: &str) -> String {
    if !contains_ssml(text) {
        return text.to_string();
    }

    SSML_PATTERNS.any_tag.replace_all(text, "").to_string()
}

/// Extract all break tags and their durations
pub fn extract_breaks(text: &str) -> Vec<(u32, usize, usize)> {
    SSML_PATTERNS.break_tag
        .captures_iter(text)
        .filter_map(|cap| {
            let full_match = cap.get(0)?;
            let duration_str = cap.get(1)?.as_str();

            // Parse duration
            let duration_ms = parse_duration(duration_str)?;

            Some((duration_ms, full_match.start(), full_match.end()))
        })
        .collect()
}

/// Parse duration string (e.g., "200ms", "1s") to milliseconds
#[inline]
fn parse_duration(s: &str) -> Option<u32> {
    if s.ends_with("ms") {
        s.trim_end_matches("ms").parse().ok()
    } else if s.ends_with('s') {
        let seconds: f32 = s.trim_end_matches('s').parse().ok()?;
        Some((seconds * 1000.0) as u32)
    } else {
        s.parse().ok()
    }
}

/// Extract emotion tags
pub fn extract_emotions(text: &str) -> Vec<(String, usize, usize)> {
    SSML_PATTERNS.emotion_tag
        .captures_iter(text)
        .filter_map(|cap| {
            let full_match = cap.get(0)?;
            let emotion = cap.get(1)?.as_str().to_string();
            Some((emotion, full_match.start(), full_match.end()))
        })
        .collect()
}

/// Extract speed modifiers
pub fn extract_speeds(text: &str) -> Vec<(f32, usize, usize)> {
    SSML_PATTERNS.speed_tag
        .captures_iter(text)
        .filter_map(|cap| {
            let full_match = cap.get(0)?;
            let speed: f32 = cap.get(1)?.as_str().parse().ok()?;
            Some((speed, full_match.start(), full_match.end()))
        })
        .collect()
}

/// Full SSML analysis - extract all tags and compute statistics
pub fn analyze_ssml(text: &str) -> SsmlAnalysis {
    let has_ssml = contains_ssml(text);

    if !has_ssml {
        return SsmlAnalysis {
            tags: vec![],
            plain_text: text.to_string(),
            total_break_ms: 0,
            emotions: vec![],
            speeds: vec![],
            has_ssml: false,
        };
    }

    let mut tags = Vec::new();
    let mut total_break_ms = 0u32;
    let mut emotions = Vec::new();
    let mut speeds = Vec::new();

    // Extract breaks
    for (duration, start, end) in extract_breaks(text) {
        total_break_ms += duration;
        let mut attrs = HashMap::new();
        attrs.insert("time".to_string(), format!("{}ms", duration));

        tags.push(ExtractedTag {
            tag_type: SsmlTagType::Break,
            full_match: text[start..end].to_string(),
            attributes: attrs,
            content: None,
            start_pos: start,
            end_pos: end,
        });
    }

    // Extract emotions
    for (emotion, start, end) in extract_emotions(text) {
        emotions.push(emotion.clone());
        let mut attrs = HashMap::new();
        attrs.insert("value".to_string(), emotion);

        tags.push(ExtractedTag {
            tag_type: SsmlTagType::Emotion,
            full_match: text[start..end].to_string(),
            attributes: attrs,
            content: None,
            start_pos: start,
            end_pos: end,
        });
    }

    // Extract speeds
    for (speed, start, end) in extract_speeds(text) {
        speeds.push(speed);
        let mut attrs = HashMap::new();
        attrs.insert("ratio".to_string(), speed.to_string());

        tags.push(ExtractedTag {
            tag_type: SsmlTagType::Speed,
            full_match: text[start..end].to_string(),
            attributes: attrs,
            content: None,
            start_pos: start,
            end_pos: end,
        });
    }

    // Sort tags by position
    tags.sort_by_key(|t| t.start_pos);

    // Strip SSML for plain text
    let plain_text = strip_ssml(text);

    SsmlAnalysis {
        tags,
        plain_text,
        total_break_ms,
        emotions,
        speeds,
        has_ssml,
    }
}

/// Batch analyze multiple texts in parallel
pub fn batch_analyze_ssml(texts: Vec<String>) -> Vec<SsmlAnalysis> {
    texts.par_iter()
        .map(|text| analyze_ssml(text))
        .collect()
}

/// Insert break tag at specified position
pub fn insert_break(text: &str, position: usize, duration_ms: u32) -> String {
    if position > text.len() {
        return text.to_string();
    }

    let break_tag = format!(r#"<break time="{}ms"/>"#, duration_ms);
    let mut result = String::with_capacity(text.len() + break_tag.len());
    result.push_str(&text[..position]);
    result.push_str(&break_tag);
    result.push_str(&text[position..]);
    result
}

/// Insert emotion tag at specified position
pub fn insert_emotion(text: &str, position: usize, emotion: &str) -> String {
    if position > text.len() {
        return text.to_string();
    }

    let emotion_tag = format!(r#"<emotion value="{}"/>"#, emotion);
    let mut result = String::with_capacity(text.len() + emotion_tag.len());
    result.push_str(&text[..position]);
    result.push_str(&emotion_tag);
    result.push_str(&text[position..]);
    result
}

/// Wrap text in speed tag
pub fn wrap_with_speed(text: &str, speed_ratio: f32) -> String {
    format!(r#"<speed ratio="{}"/>{}"#, speed_ratio, text)
}

/// Add custom pattern for matching
pub fn register_custom_pattern(name: &str, pattern: &str) -> bool {
    match Regex::new(pattern) {
        Ok(regex) => {
            CUSTOM_PATTERNS.lock().unwrap().insert(name.to_string(), regex);
            true
        }
        Err(_) => false,
    }
}

/// Match custom pattern
pub fn match_custom_pattern(name: &str, text: &str) -> Vec<(String, usize, usize)> {
    let patterns = CUSTOM_PATTERNS.lock().unwrap();
    if let Some(regex) = patterns.get(name) {
        regex.find_iter(text)
            .map(|m| (m.as_str().to_string(), m.start(), m.end()))
            .collect()
    } else {
        vec![]
    }
}

/// Clear all custom patterns
pub fn clear_custom_patterns() {
    CUSTOM_PATTERNS.lock().unwrap().clear();
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contains_ssml() {
        assert!(contains_ssml(r#"Hello <break time="200ms"/> world"#));
        assert!(contains_ssml(r#"<emotion value="happy"/>Great!"#));
        assert!(contains_ssml(r#"<speed ratio="0.9"/>Slow down"#));
        assert!(!contains_ssml("Plain text without tags"));
        assert!(!contains_ssml("Some < math > expressions"));
    }

    #[test]
    fn test_strip_ssml() {
        let text = r#"Hello <break time="200ms"/> world <emotion value="happy"/> end"#;
        let stripped = strip_ssml(text);
        assert_eq!(stripped, "Hello  world  end");
    }

    #[test]
    fn test_extract_breaks() {
        let text = r#"First <break time="200ms"/> second <break time="1s"/> third"#;
        let breaks = extract_breaks(text);

        assert_eq!(breaks.len(), 2);
        assert_eq!(breaks[0].0, 200); // 200ms
        assert_eq!(breaks[1].0, 1000); // 1s = 1000ms
    }

    #[test]
    fn test_extract_emotions() {
        let text = r#"<emotion value="happy"/>Hello <emotion value="caring"/>there"#;
        let emotions = extract_emotions(text);

        assert_eq!(emotions.len(), 2);
        assert_eq!(emotions[0].0, "happy");
        assert_eq!(emotions[1].0, "caring");
    }

    #[test]
    fn test_analyze_ssml() {
        let text = r#"<emotion value="excited"/>Hello <break time="300ms"/> world"#;
        let analysis = analyze_ssml(text);

        assert!(analysis.has_ssml);
        assert_eq!(analysis.emotions.len(), 1);
        assert_eq!(analysis.emotions[0], "excited");
        assert_eq!(analysis.total_break_ms, 300);
        assert_eq!(analysis.plain_text, "Hello  world");
    }

    #[test]
    fn test_insert_break() {
        let text = "Hello world";
        let result = insert_break(text, 5, 200);
        assert!(result.contains(r#"<break time="200ms"/>"#));
        assert!(result.starts_with("Hello"));
    }

    #[test]
    fn test_insert_emotion() {
        let text = "Hello world";
        let result = insert_emotion(text, 0, "happy");
        assert!(result.starts_with(r#"<emotion value="happy"/>"#));
    }

    #[test]
    fn test_wrap_with_speed() {
        let text = "slow text";
        let result = wrap_with_speed(text, 0.8);
        assert!(result.contains(r#"<speed ratio="0.8"/>"#));
        assert!(result.contains("slow text"));
    }

    #[test]
    fn test_custom_pattern() {
        register_custom_pattern("test", r"\d{3}-\d{4}");
        let matches = match_custom_pattern("test", "Call 555-1234 or 555-5678");
        assert_eq!(matches.len(), 2);
        clear_custom_patterns();
    }

    #[test]
    fn test_batch_analyze() {
        let texts = vec![
            r#"<emotion value="happy"/>Hello"#.to_string(),
            "Plain text".to_string(),
            r#"<break time="100ms"/>Pause"#.to_string(),
        ];

        let results = batch_analyze_ssml(texts);
        assert_eq!(results.len(), 3);
        assert!(results[0].has_ssml);
        assert!(!results[1].has_ssml);
        assert!(results[2].has_ssml);
    }
}
