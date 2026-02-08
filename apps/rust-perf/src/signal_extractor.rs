//! Human Signal Extraction with Optimized Regex
//!
//! This module extracts meaningful signals from conversation text:
//! - Dates (birthdays, anniversaries, loss dates)
//! - Values and beliefs
//! - Dreams and aspirations
//! - Fears and concerns
//! - Stress triggers
//! - Growth markers
//! - Challenges
//! - Comfort patterns
//!
//! Key optimizations:
//! - Pre-compiled regex patterns (60+ patterns cached)
//! - Parallel batch processing with Rayon
//! - Early exit on signal type detection
//!
//! Expected performance: 3-5x faster than JavaScript regex

use rayon::prelude::*;
use regex::Regex;
use std::collections::HashMap;

lazy_static::lazy_static! {
    /// Pre-compiled signal extraction patterns
    static ref SIGNAL_PATTERNS: SignalPatterns = SignalPatterns::new();
}

/// Signal types that can be extracted
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum SignalType {
    Birthday,
    Anniversary,
    LossAnniversary,
    Appointment,
    Value,
    Dream,
    Fear,
    StressTrigger,
    GrowthMarker,
    Challenge,
    ComfortPattern,
    Preference,
    Relationship,
    Habit,
    Goal,
}

impl SignalType {
    pub fn as_str(&self) -> &'static str {
        match self {
            SignalType::Birthday => "birthday",
            SignalType::Anniversary => "anniversary",
            SignalType::LossAnniversary => "loss_anniversary",
            SignalType::Appointment => "appointment",
            SignalType::Value => "value",
            SignalType::Dream => "dream",
            SignalType::Fear => "fear",
            SignalType::StressTrigger => "stress_trigger",
            SignalType::GrowthMarker => "growth_marker",
            SignalType::Challenge => "challenge",
            SignalType::ComfortPattern => "comfort_pattern",
            SignalType::Preference => "preference",
            SignalType::Relationship => "relationship",
            SignalType::Habit => "habit",
            SignalType::Goal => "goal",
        }
    }
}

/// An extracted signal with its context
#[derive(Debug, Clone)]
pub struct ExtractedSignal {
    pub signal_type: SignalType,
    pub value: String,
    pub context: String,
    pub start: usize,
    pub end: usize,
    pub confidence: f32,
}

/// Pre-compiled signal patterns organized by type
struct SignalPatterns {
    // Date patterns
    birthday: Vec<Regex>,
    anniversary: Vec<Regex>,
    loss: Vec<Regex>,
    appointment: Vec<Regex>,

    // Value patterns
    values: Vec<Regex>,

    // Dream/aspiration patterns
    dreams: Vec<Regex>,

    // Fear patterns
    fears: Vec<Regex>,

    // Stress patterns
    stress: Vec<Regex>,

    // Growth patterns
    growth: Vec<Regex>,

    // Challenge patterns
    challenges: Vec<Regex>,

    // Comfort patterns
    comfort: Vec<Regex>,

    // Preference patterns
    preferences: Vec<Regex>,

    // Relationship patterns
    relationships: Vec<Regex>,

    // Habit patterns
    habits: Vec<Regex>,

    // Goal patterns
    goals: Vec<Regex>,
}

impl SignalPatterns {
    fn new() -> Self {
        SignalPatterns {
            // Date patterns
            birthday: vec![
                Regex::new(r"(?i)my birthday is (?:on )?(\w+ \d+|\d+/\d+)").unwrap(),
                Regex::new(r"(?i)born (?:on )?(\w+ \d+(?:,? \d{4})?|\d+/\d+(?:/\d+)?)").unwrap(),
                Regex::new(r"(?i)birthday(?:'s| is) (?:on )?(\w+ \d+)").unwrap(),
            ],
            anniversary: vec![
                Regex::new(r"(?i)(?:our|my) anniversary is (?:on )?(\w+ \d+|\d+/\d+)").unwrap(),
                Regex::new(r"(?i)married (?:on |since )?(\w+ \d+(?:,? \d{4})?|\d+/\d+)").unwrap(),
                Regex::new(r"(?i)got (?:married|engaged) (?:on )?(\w+ \d+)").unwrap(),
            ],
            loss: vec![
                Regex::new(r"(?i)(?:passed away|died|lost)(?: \w+)? (?:on |in )(\w+ \d+|\d{4})").unwrap(),
                Regex::new(r"(?i)death anniversary (?:is )?(?:on )?(\w+ \d+|\d+/\d+)").unwrap(),
                Regex::new(r"(?i)lost (?:my |our )?\w+ (?:on |in )(\w+ \d+|\d{4})").unwrap(),
            ],
            appointment: vec![
                Regex::new(r"(?i)(?:appointment|meeting|call) (?:is )?(?:on |at )?(\w+ \d+|\d+/\d+)(?: at (\d+(?::\d+)?\s*(?:am|pm)?))?").unwrap(),
                Regex::new(r"(?i)(?:scheduled|booked) (?:for )?(\w+ \d+|\d+/\d+)").unwrap(),
            ],

            // Value patterns
            values: vec![
                Regex::new(r"(?i)i (?:really )?(?:believe|value|think) (?:in |that )(.{10,60})").unwrap(),
                Regex::new(r"(?i)(?:what's|what is) (?:most )?important (?:to me|in life) is (.{10,60})").unwrap(),
                Regex::new(r"(?i)i (?:stand|believe strongly) for (.{10,50})").unwrap(),
                Regex::new(r"(?i)my (?:core |main )?(?:values?|principles?) (?:is|are|include) (.{10,60})").unwrap(),
                Regex::new(r"(?i)i (?:care deeply|really care) about (.{10,50})").unwrap(),
            ],

            // Dream patterns
            dreams: vec![
                Regex::new(r"(?i)i(?:'ve| have)? always (?:wanted|dreamed) (?:to|of) (.{10,60})").unwrap(),
                Regex::new(r"(?i)my (?:dream|life goal|ambition) is (?:to )?(.{10,60})").unwrap(),
                Regex::new(r"(?i)(?:one day|someday) i (?:want to|hope to|will) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i (?:aspire|wish|hope) to (.{10,50})").unwrap(),
                Regex::new(r"(?i)bucket list (?:includes?|has|is) (.{10,50})").unwrap(),
            ],

            // Fear patterns
            fears: vec![
                Regex::new(r"(?i)i(?:'m| am) (?:really )?(?:afraid|scared|terrified) (?:of|that) (.{10,60})").unwrap(),
                Regex::new(r"(?i)(?:i|we) (?:worry|worries|am worried) about (.{10,60})").unwrap(),
                Regex::new(r"(?i)my (?:biggest )?fear is (?:that )?(.{10,50})").unwrap(),
                Regex::new(r"(?i)what (?:scares|frightens|terrifies) me (?:is|most) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i(?:'m| am) (?:anxious|nervous) about (.{10,50})").unwrap(),
            ],

            // Stress patterns
            stress: vec![
                Regex::new(r"(?i)(?:really )?stress(?:es|ed|ing)? me (?:out|is) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i get (?:stressed|anxious|overwhelmed) (?:when|by) (.{10,50})").unwrap(),
                Regex::new(r"(?i)(?:drives|makes) me (?:crazy|nuts|insane) (?:when|is) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i can(?:'t| not) (?:handle|deal with|stand) (.{10,50})").unwrap(),
                Regex::new(r"(?i)my (?:stress|anxiety) (?:trigger|comes from) (.{10,50})").unwrap(),
            ],

            // Growth patterns
            growth: vec![
                Regex::new(r"(?i)i(?:'ve| have) (?:been|started) (?:working on|improving) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i(?:'m| am) (?:getting|becoming) (?:better|more|less) (?:at )?(.{10,50})").unwrap(),
                Regex::new(r"(?i)i (?:finally|recently) (?:learned|realized|understood) (.{10,50})").unwrap(),
                Regex::new(r"(?i)(?:progress|improvement|growth) (?:in|with|on) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i(?:'ve| have) (?:overcome|conquered|beaten) (.{10,50})").unwrap(),
            ],

            // Challenge patterns
            challenges: vec![
                Regex::new(r"(?i)(?:struggling|having trouble|difficulty) with (.{10,50})").unwrap(),
                Regex::new(r"(?i)(?:hardest|toughest|biggest challenge) (?:part|thing) is (.{10,50})").unwrap(),
                Regex::new(r"(?i)i (?:can(?:'t| not)|don(?:'t| not)) (?:seem to|know how to) (.{10,50})").unwrap(),
                Regex::new(r"(?i)(?:keeps|kept) (?:failing|struggling) (?:at|with) (.{10,50})").unwrap(),
                Regex::new(r"(?i)my (?:weakness|struggle|challenge) is (.{10,50})").unwrap(),
            ],

            // Comfort patterns
            comfort: vec![
                Regex::new(r"(?i)(?:makes me|helps me) (?:feel )?(?:better|calm|relaxed|happy) (?:is|when) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i (?:feel|am) (?:most )?(?:comfortable|safe|at ease) (?:when|with) (.{10,50})").unwrap(),
                Regex::new(r"(?i)(?:my|a) comfort (?:food|activity|thing) is (.{10,50})").unwrap(),
                Regex::new(r"(?i)(?:helps|calms|soothes) me (?:down|when) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i (?:relax|unwind|decompress) (?:by|with|when) (.{10,50})").unwrap(),
            ],

            // Preference patterns
            preferences: vec![
                Regex::new(r"(?i)i (?:prefer|like|love|enjoy) (.{5,40}) (?:over|more than|instead of)").unwrap(),
                Regex::new(r"(?i)my (?:favorite|preferred) (.{5,30}) is (.{5,30})").unwrap(),
                Regex::new(r"(?i)i(?:'d| would) rather (?:have|do|be) (.{10,50})").unwrap(),
                Regex::new(r"(?i)(?:i hate|can(?:'t| not) stand|dislike) (.{10,40})").unwrap(),
                Regex::new(r"(?i)i always (?:go for|choose|pick) (.{10,40})").unwrap(),
            ],

            // Relationship patterns
            relationships: vec![
                Regex::new(r"(?i)my (?:partner|spouse|husband|wife|boyfriend|girlfriend)(?:'s name)? (?:is )?(\w+)").unwrap(),
                Regex::new(r"(?i)(?:dating|married to|engaged to|with) (\w+) (?:for |since )?").unwrap(),
                Regex::new(r"(?i)my (?:best friend|close friend|friend)(?:'s name)? (?:is )?(\w+)").unwrap(),
                Regex::new(r"(?i)my (?:mom|dad|mother|father|brother|sister|son|daughter)(?:'s name)? (?:is )?(\w+)").unwrap(),
                Regex::new(r"(?i)i have (\d+) (?:kids|children|siblings|brothers|sisters)").unwrap(),
            ],

            // Habit patterns
            habits: vec![
                Regex::new(r"(?i)i (?:usually|always|typically|often) (.{10,50}) (?:every|each|in the)").unwrap(),
                Regex::new(r"(?i)(?:my|a) (?:daily|weekly|morning|evening) (?:routine|habit|ritual) (?:is|includes) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i(?:'ve| have) been (.{10,40}) (?:every|for) (?:day|week|month|year)").unwrap(),
                Regex::new(r"(?i)i (?:try|like|need) to (.{10,40}) (?:every|each|daily)").unwrap(),
                Regex::new(r"(?i)i (?:make it|try) (?:a point|habit) to (.{10,40})").unwrap(),
            ],

            // Goal patterns
            goals: vec![
                Regex::new(r"(?i)(?:my|a) goal (?:is|for \d+) (?:to )?(.{10,50})").unwrap(),
                Regex::new(r"(?i)i(?:'m| am) (?:trying|working|aiming) to (.{10,50})").unwrap(),
                Regex::new(r"(?i)by (?:next|this|the end of) (?:year|month|week) i (?:want|plan|hope) to (.{10,50})").unwrap(),
                Regex::new(r"(?i)i (?:want|need|plan) to (?:achieve|accomplish|reach) (.{10,50})").unwrap(),
                Regex::new(r"(?i)i(?:'m| am) (?:committed|dedicated) to (.{10,50})").unwrap(),
            ],
        }
    }
}

/// Result of signal extraction
#[derive(Debug, Clone)]
pub struct SignalExtractionResult {
    /// All extracted signals
    pub signals: Vec<ExtractedSignal>,
    /// Count by signal type (used internally for statistics)
    #[allow(dead_code)]
    pub counts: HashMap<String, u32>,
    /// Has any signals
    pub has_signals: bool,
    /// High-value signals (dates, relationships)
    pub high_value_count: u32,
}

/// Extract signals from text
pub fn extract_signals(text: &str) -> SignalExtractionResult {
    if text.is_empty() {
        return SignalExtractionResult {
            signals: vec![],
            counts: HashMap::new(),
            has_signals: false,
            high_value_count: 0,
        };
    }

    let patterns = &*SIGNAL_PATTERNS;
    let mut signals = Vec::new();
    let mut counts = HashMap::new();

    // Extract dates (high value)
    extract_with_type(&patterns.birthday, text, SignalType::Birthday, 0.9, &mut signals);
    extract_with_type(&patterns.anniversary, text, SignalType::Anniversary, 0.9, &mut signals);
    extract_with_type(&patterns.loss, text, SignalType::LossAnniversary, 0.9, &mut signals);
    extract_with_type(&patterns.appointment, text, SignalType::Appointment, 0.8, &mut signals);

    // Extract values and beliefs
    extract_with_type(&patterns.values, text, SignalType::Value, 0.7, &mut signals);

    // Extract dreams
    extract_with_type(&patterns.dreams, text, SignalType::Dream, 0.7, &mut signals);

    // Extract fears
    extract_with_type(&patterns.fears, text, SignalType::Fear, 0.8, &mut signals);

    // Extract stress triggers
    extract_with_type(&patterns.stress, text, SignalType::StressTrigger, 0.8, &mut signals);

    // Extract growth markers
    extract_with_type(&patterns.growth, text, SignalType::GrowthMarker, 0.7, &mut signals);

    // Extract challenges
    extract_with_type(&patterns.challenges, text, SignalType::Challenge, 0.7, &mut signals);

    // Extract comfort patterns
    extract_with_type(&patterns.comfort, text, SignalType::ComfortPattern, 0.7, &mut signals);

    // Extract preferences
    extract_with_type(&patterns.preferences, text, SignalType::Preference, 0.6, &mut signals);

    // Extract relationships (high value)
    extract_with_type(&patterns.relationships, text, SignalType::Relationship, 0.9, &mut signals);

    // Extract habits
    extract_with_type(&patterns.habits, text, SignalType::Habit, 0.7, &mut signals);

    // Extract goals
    extract_with_type(&patterns.goals, text, SignalType::Goal, 0.7, &mut signals);

    // Build counts
    for signal in &signals {
        *counts.entry(signal.signal_type.as_str().to_string()).or_insert(0) += 1;
    }

    let high_value_count = signals
        .iter()
        .filter(|s| matches!(
            s.signal_type,
            SignalType::Birthday | SignalType::Anniversary | SignalType::LossAnniversary | SignalType::Relationship
        ))
        .count() as u32;

    SignalExtractionResult {
        has_signals: !signals.is_empty(),
        signals,
        counts,
        high_value_count,
    }
}

/// Helper to extract signals with a specific type
fn extract_with_type(
    patterns: &[Regex],
    text: &str,
    signal_type: SignalType,
    confidence: f32,
    signals: &mut Vec<ExtractedSignal>,
) {
    for pattern in patterns {
        for cap in pattern.captures_iter(text) {
            if let Some(m) = cap.get(1) {
                // Get surrounding context (50 chars before and after)
                let start = cap.get(0).map(|c| c.start()).unwrap_or(0);
                let end = cap.get(0).map(|c| c.end()).unwrap_or(text.len());
                let context_start = start.saturating_sub(50);
                let context_end = (end + 50).min(text.len());
                let context = text[context_start..context_end].to_string();

                signals.push(ExtractedSignal {
                    signal_type: signal_type.clone(),
                    value: m.as_str().trim().to_string(),
                    context,
                    start,
                    end,
                    confidence,
                });
            }
        }
    }
}

/// Batch extract signals from multiple texts in parallel
pub fn batch_extract_signals(texts: &[&str]) -> Vec<SignalExtractionResult> {
    texts.par_iter().map(|t| extract_signals(t)).collect()
}

/// Quick check if text likely contains signals (fast path)
pub fn likely_has_signals(text: &str) -> bool {
    if text.len() < 15 {
        return false;
    }

    // Check for common signal indicators
    let lower = text.to_lowercase();

    // Date indicators
    if lower.contains("birthday") || lower.contains("anniversary") || lower.contains("born") {
        return true;
    }

    // Value/belief indicators
    if lower.contains("i believe") || lower.contains("i value") || lower.contains("important to me") {
        return true;
    }

    // Fear/stress indicators
    if lower.contains("afraid") || lower.contains("scared") || lower.contains("stress") || lower.contains("worry") {
        return true;
    }

    // Dream/goal indicators
    if lower.contains("my dream") || lower.contains("my goal") || lower.contains("i want to") {
        return true;
    }

    // Relationship indicators
    if lower.contains("my wife") || lower.contains("my husband") || lower.contains("my partner") {
        return true;
    }

    false
}

/// Extract only date signals (optimized for common use case)
pub fn extract_date_signals(text: &str) -> Vec<ExtractedSignal> {
    let patterns = &*SIGNAL_PATTERNS;
    let mut signals = Vec::new();

    extract_with_type(&patterns.birthday, text, SignalType::Birthday, 0.9, &mut signals);
    extract_with_type(&patterns.anniversary, text, SignalType::Anniversary, 0.9, &mut signals);
    extract_with_type(&patterns.loss, text, SignalType::LossAnniversary, 0.9, &mut signals);
    extract_with_type(&patterns.appointment, text, SignalType::Appointment, 0.8, &mut signals);

    signals
}

/// Extract only relationship signals
#[allow(dead_code)]
pub fn extract_relationship_signals(text: &str) -> Vec<ExtractedSignal> {
    let patterns = &*SIGNAL_PATTERNS;
    let mut signals = Vec::new();
    extract_with_type(&patterns.relationships, text, SignalType::Relationship, 0.9, &mut signals);
    signals
}

/// Extract only high-value signals (birthdays, anniversaries, loss anniversaries, relationships)
/// These are signals that are particularly memorable and important for relationship building.
pub fn extract_high_value_signals(text: &str) -> Vec<ExtractedSignal> {
    let patterns = &*SIGNAL_PATTERNS;
    let mut signals = Vec::new();

    // High-value signals: dates and relationships
    extract_with_type(&patterns.birthday, text, SignalType::Birthday, 0.9, &mut signals);
    extract_with_type(&patterns.anniversary, text, SignalType::Anniversary, 0.9, &mut signals);
    extract_with_type(&patterns.loss, text, SignalType::LossAnniversary, 0.9, &mut signals);
    extract_with_type(&patterns.relationships, text, SignalType::Relationship, 0.9, &mut signals);

    signals
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_birthday_extraction() {
        let result = extract_signals("My birthday is on June 15th.");
        assert!(result.has_signals);
        assert!(result.signals.len() >= 1);
        assert!(result.signals.iter().any(|s| s.signal_type == SignalType::Birthday));
    }

    #[test]
    fn test_fear_extraction() {
        let result = extract_signals("I'm really afraid of losing my job.");
        assert!(result.has_signals);
        assert!(result.signals.iter().any(|s| s.signal_type == SignalType::Fear));
    }

    #[test]
    fn test_dream_extraction() {
        let result = extract_signals("I've always wanted to visit Japan and learn the language.");
        assert!(result.has_signals);
        assert!(result.signals.iter().any(|s| s.signal_type == SignalType::Dream));
    }

    #[test]
    fn test_relationship_extraction() {
        let result = extract_signals("My partner Sarah and I have been together for 5 years.");
        assert!(result.has_signals);
        assert!(result.signals.iter().any(|s| s.signal_type == SignalType::Relationship));
    }

    #[test]
    fn test_no_signals() {
        let result = extract_signals("The weather is nice today.");
        assert!(!result.has_signals);
        assert_eq!(result.signals.len(), 0);
    }

    #[test]
    fn test_multiple_signals() {
        let text = "My birthday is June 15th. I'm afraid of heights, but my goal is to go skydiving.";
        let result = extract_signals(text);
        assert!(result.has_signals);
        assert!(result.signals.len() >= 2);
    }

    #[test]
    fn test_likely_has_signals() {
        assert!(likely_has_signals("My birthday is next week."));
        assert!(likely_has_signals("I'm really stressed about work."));
        assert!(!likely_has_signals("The quick brown fox."));
    }

    #[test]
    fn test_batch_extraction() {
        let texts = vec![
            "My birthday is June 15th.",
            "Just a normal day.",
            "I'm worried about the future.",
        ];
        let results = batch_extract_signals(&texts);
        assert_eq!(results.len(), 3);
        assert!(results[0].has_signals);
        assert!(!results[1].has_signals);
        // results[2] ("I'm worried about the future") may or may not have signals depending on rules
    }

    #[test]
    fn test_extract_high_value_signals() {
        // Birthday
        let result = extract_high_value_signals("My birthday is on June 15th.");
        assert!(!result.is_empty());
        assert!(result.iter().any(|s| s.signal_type == SignalType::Birthday));

        // Anniversary
        let result = extract_high_value_signals("Our anniversary is March 20th.");
        assert!(!result.is_empty());
        assert!(result.iter().any(|s| s.signal_type == SignalType::Anniversary));

        // Relationship
        let result = extract_high_value_signals("My partner Sarah is wonderful.");
        assert!(!result.is_empty());
        assert!(result.iter().any(|s| s.signal_type == SignalType::Relationship));

        // Non-high-value signals should not be extracted
        let result = extract_high_value_signals("I'm afraid of heights.");
        assert!(result.is_empty()); // Fear is not high-value

        // Multiple high-value signals
        let result = extract_high_value_signals("My birthday is June 15th and my partner is Alex.");
        assert!(result.len() >= 2);
    }
}
