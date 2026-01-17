//! SSML Type Definitions
//!
//! Full W3C SSML 1.1 types plus Ferni extensions.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A parsed SSML document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsmlDocument {
    /// SSML version (default: 1.1)
    pub version: String,

    /// XML language attribute
    pub lang: Option<String>,

    /// Root elements inside <speak>
    pub elements: Vec<SsmlElement>,

    /// Document-level metadata
    pub metadata: SsmlMetadata,
}

impl SsmlDocument {
    /// Create a new empty document
    pub fn new() -> Self {
        Self {
            version: "1.1".to_string(),
            lang: Some("en-US".to_string()),
            elements: Vec::new(),
            metadata: SsmlMetadata::default(),
        }
    }

    /// Get plain text content (stripping all markup)
    pub fn plain_text(&self) -> String {
        self.elements
            .iter()
            .map(|e| e.plain_text())
            .collect::<Vec<_>>()
            .join("")
    }

    /// Estimate speech duration in milliseconds
    pub fn estimated_duration_ms(&self) -> u64 {
        // Average speaking rate: ~150 words/minute = ~2.5 words/second
        // Average word: ~5 characters
        // So roughly 12.5 chars/second = 80ms per char
        let text_duration = (self.plain_text().len() as u64) * 80;

        // Add explicit breaks
        let break_duration: u64 = self.elements
            .iter()
            .map(|e| e.break_duration_ms())
            .sum();

        text_duration + break_duration
    }

    /// Apply a global prosody transformation
    pub fn apply_prosody(&mut self, prosody: &Prosody) {
        // Wrap all elements in a prosody element
        let elements = std::mem::take(&mut self.elements);
        self.elements = vec![SsmlElement::Prosody {
            rate: prosody.rate.clone(),
            pitch: prosody.pitch.clone(),
            volume: prosody.volume.clone(),
            contour: prosody.contour.clone(),
            range: prosody.range.clone(),
            duration: prosody.duration.clone(),
            children: elements,
        }];
    }

    /// Insert a break at a specific position
    pub fn insert_break(&mut self, index: usize, duration_ms: u64) {
        if index <= self.elements.len() {
            self.elements.insert(index, SsmlElement::Break {
                time: Some(format!("{}ms", duration_ms)),
                strength: None,
            });
        }
    }
}

impl Default for SsmlDocument {
    fn default() -> Self {
        Self::new()
    }
}

/// Document metadata for optimization and caching
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SsmlMetadata {
    /// Total character count
    pub char_count: usize,

    /// Number of words
    pub word_count: usize,

    /// Has custom voice elements
    pub has_voice_switch: bool,

    /// Has Ferni extensions
    pub has_ferni_extensions: bool,

    /// List of mark names for bookmark events
    pub marks: Vec<String>,

    /// Languages used in document
    pub languages: Vec<String>,
}

/// SSML Element enumeration (all W3C elements + Ferni extensions)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SsmlElement {
    // =========================================================================
    // Text Content
    // =========================================================================

    /// Raw text content
    Text(String),

    // =========================================================================
    // W3C SSML 1.1 Elements
    // =========================================================================

    /// Voice selection
    Voice {
        name: Option<String>,
        gender: Option<Gender>,
        age: Option<u8>,
        variant: Option<String>,
        lang: Option<String>,
        children: Vec<SsmlElement>,
    },

    /// Prosody control (rate, pitch, volume, etc.)
    Prosody {
        rate: Option<String>,
        pitch: Option<String>,
        volume: Option<String>,
        contour: Option<String>,
        range: Option<String>,
        duration: Option<String>,
        children: Vec<SsmlElement>,
    },

    /// Break/pause
    Break {
        time: Option<String>,
        strength: Option<BreakStrength>,
    },

    /// Emphasis
    Emphasis {
        level: EmphasisLevel,
        children: Vec<SsmlElement>,
    },

    /// Say-as (interpret text as specific type)
    SayAs {
        interpret_as: InterpretAs,
        format: Option<String>,
        detail: Option<String>,
        children: Vec<SsmlElement>,
    },

    /// Substitution
    Sub {
        alias: String,
        children: Vec<SsmlElement>,
    },

    /// Phoneme (pronunciation guide)
    Phoneme {
        alphabet: PhonemeAlphabet,
        ph: String,
        children: Vec<SsmlElement>,
    },

    /// Audio clip reference
    Audio {
        src: String,
        fallback: Option<Box<SsmlElement>>,
    },

    /// Bookmark mark
    Mark {
        name: String,
    },

    /// Paragraph
    Paragraph {
        children: Vec<SsmlElement>,
    },

    /// Sentence
    Sentence {
        children: Vec<SsmlElement>,
    },

    /// Word
    Word {
        role: Option<String>,
        children: Vec<SsmlElement>,
    },

    /// Language switch
    Lang {
        lang: String,
        children: Vec<SsmlElement>,
    },

    // =========================================================================
    // Ferni Extensions (ferni: namespace)
    // =========================================================================

    /// Emotional coloring
    FerniEmotion {
        emotion_type: FerniEmotionType,
        intensity: f32, // 0.0 - 2.0 (1.0 = normal)
        children: Vec<SsmlElement>,
    },

    /// Memory prosody (emphasize remembered entities)
    FerniMemory {
        entity_type: MemoryEntityType,
        familiarity: f32, // 0.0 - 1.0 (how well known)
        children: Vec<SsmlElement>,
    },

    /// Breathing pattern
    FerniBreath {
        breath_type: BreathType,
    },

    /// Backchannel sound
    FerniBackchannel {
        sound: BackchannelSound,
    },

    /// Meaningful silence (weighted pause)
    FerniSilence {
        weight: SilenceWeight,
        purpose: SilencePurpose,
    },
}

impl SsmlElement {
    /// Get plain text content recursively
    pub fn plain_text(&self) -> String {
        match self {
            Self::Text(s) => s.clone(),
            Self::Voice { children, .. }
            | Self::Prosody { children, .. }
            | Self::Emphasis { children, .. }
            | Self::SayAs { children, .. }
            | Self::Sub { children, .. }
            | Self::Phoneme { children, .. }
            | Self::Paragraph { children }
            | Self::Sentence { children }
            | Self::Word { children, .. }
            | Self::Lang { children, .. }
            | Self::FerniEmotion { children, .. }
            | Self::FerniMemory { children, .. } => {
                children.iter().map(|e| e.plain_text()).collect()
            }
            Self::Break { .. } | Self::Mark { .. } | Self::Audio { .. }
            | Self::FerniBreath { .. } | Self::FerniBackchannel { .. }
            | Self::FerniSilence { .. } => String::new(),
        }
    }

    /// Get break duration in milliseconds
    pub fn break_duration_ms(&self) -> u64 {
        match self {
            Self::Break { time, strength } => {
                if let Some(time) = time {
                    parse_duration_ms(time)
                } else if let Some(strength) = strength {
                    strength.default_duration_ms()
                } else {
                    250 // Default pause
                }
            }
            Self::FerniSilence { weight, .. } => weight.duration_ms(),
            Self::FerniBreath { breath_type } => breath_type.duration_ms(),
            _ => 0,
        }
    }
}

// =============================================================================
// Enums for SSML Attributes
// =============================================================================

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Gender {
    Male,
    Female,
    Neutral,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BreakStrength {
    None,
    XWeak,
    Weak,
    Medium,
    Strong,
    XStrong,
}

impl BreakStrength {
    pub fn default_duration_ms(&self) -> u64 {
        match self {
            Self::None => 0,
            Self::XWeak => 100,
            Self::Weak => 250,
            Self::Medium => 500,
            Self::Strong => 750,
            Self::XStrong => 1000,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EmphasisLevel {
    Strong,
    Moderate,
    None,
    Reduced,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum InterpretAs {
    Characters,
    SpellOut,
    Cardinal,
    Ordinal,
    Fraction,
    Unit,
    Date,
    Time,
    Telephone,
    Address,
    Currency,
    Expletive,
    Verbatim,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PhonemeAlphabet {
    Ipa,
    XSampa,
}

// =============================================================================
// Ferni Extension Enums
// =============================================================================

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FerniEmotionType {
    Joy,
    Sadness,
    Concern,
    Curiosity,
    Excitement,
    Calm,
    Warmth,
    Empathy,
    Encouragement,
    Humor,
    Seriousness,
    Anticipation,
    Relief,
    Pride,
    Gratitude,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryEntityType {
    Person,
    Place,
    Event,
    Preference,
    Goal,
    Habit,
    Relationship,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BreathType {
    Quick,      // 100ms
    Normal,     // 250ms
    Deep,       // 500ms
    Sigh,       // 400ms with falling pitch
}

impl BreathType {
    pub fn duration_ms(&self) -> u64 {
        match self {
            Self::Quick => 100,
            Self::Normal => 250,
            Self::Deep => 500,
            Self::Sigh => 400,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BackchannelSound {
    Hmm,
    Uh,
    Mm,
    Oh,
    Ah,
    Yeah,
    Mhm,
    Wow,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SilenceWeight {
    Subtle,     // 200ms
    Moderate,   // 500ms
    Significant,// 800ms
    Dramatic,   // 1200ms
}

impl SilenceWeight {
    pub fn duration_ms(&self) -> u64 {
        match self {
            Self::Subtle => 200,
            Self::Moderate => 500,
            Self::Significant => 800,
            Self::Dramatic => 1200,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SilencePurpose {
    Reflection,     // Let user think
    Emphasis,       // Emphasize previous
    Transition,     // Topic change
    EmotionalSpace, // Processing emotions
    Anticipation,   // Build tension
}

// =============================================================================
// Prosody Helper
// =============================================================================

/// Prosody settings for transformation
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Prosody {
    /// Speaking rate: x-slow, slow, medium, fast, x-fast, or percentage
    pub rate: Option<String>,

    /// Pitch: x-low, low, medium, high, x-high, or Hz/semitones
    pub pitch: Option<String>,

    /// Volume: silent, x-soft, soft, medium, loud, x-loud, or dB
    pub volume: Option<String>,

    /// Pitch contour for intonation
    pub contour: Option<String>,

    /// Pitch range
    pub range: Option<String>,

    /// Fixed duration
    pub duration: Option<String>,
}

impl Prosody {
    /// Create prosody for a given rate multiplier (1.0 = normal)
    pub fn with_rate(multiplier: f32) -> Self {
        Self {
            rate: Some(format!("{}%", (multiplier * 100.0) as i32)),
            ..Default::default()
        }
    }

    /// Create prosody for a given pitch shift in semitones
    pub fn with_pitch_shift(semitones: i8) -> Self {
        let sign = if semitones >= 0 { "+" } else { "" };
        Self {
            pitch: Some(format!("{}{}st", sign, semitones)),
            ..Default::default()
        }
    }

    /// Create prosody for volume adjustment in dB
    pub fn with_volume_db(db: i8) -> Self {
        let sign = if db >= 0 { "+" } else { "" };
        Self {
            volume: Some(format!("{}{}dB", sign, db)),
            ..Default::default()
        }
    }
}

// =============================================================================
// Voice Selection
// =============================================================================

/// Voice selection criteria
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Voice {
    pub name: Option<String>,
    pub gender: Option<Gender>,
    pub age: Option<u8>,
    pub variant: Option<String>,
    pub lang: Option<String>,
}

impl Voice {
    pub fn named(name: impl Into<String>) -> Self {
        Self {
            name: Some(name.into()),
            ..Default::default()
        }
    }
}

// =============================================================================
// Utility Functions
// =============================================================================

/// Parse a duration string (e.g., "500ms", "1.5s") to milliseconds
pub fn parse_duration_ms(s: &str) -> u64 {
    let s = s.trim().to_lowercase();

    if let Some(ms) = s.strip_suffix("ms") {
        ms.parse().unwrap_or(0)
    } else if let Some(s) = s.strip_suffix("s") {
        (s.parse::<f64>().unwrap_or(0.0) * 1000.0) as u64
    } else {
        // Try parsing as plain number (assume ms)
        s.parse().unwrap_or(0)
    }
}

/// Parse a percentage string (e.g., "150%", "-20%") to a multiplier
pub fn parse_percentage(s: &str) -> Option<f32> {
    let s = s.trim();
    if let Some(pct) = s.strip_suffix('%') {
        pct.parse::<f32>().ok().map(|v| v / 100.0)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_duration() {
        assert_eq!(parse_duration_ms("500ms"), 500);
        assert_eq!(parse_duration_ms("1.5s"), 1500);
        assert_eq!(parse_duration_ms("2s"), 2000);
        assert_eq!(parse_duration_ms("100"), 100);
    }

    #[test]
    fn test_parse_percentage() {
        assert_eq!(parse_percentage("150%"), Some(1.5));
        assert_eq!(parse_percentage("50%"), Some(0.5));
        assert_eq!(parse_percentage("-20%"), Some(-0.2));
    }

    #[test]
    fn test_break_strength_duration() {
        assert_eq!(BreakStrength::None.default_duration_ms(), 0);
        assert_eq!(BreakStrength::Medium.default_duration_ms(), 500);
        assert_eq!(BreakStrength::XStrong.default_duration_ms(), 1000);
    }
}
