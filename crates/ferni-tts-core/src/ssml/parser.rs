//! SSML Parser Implementation
//!
//! Fast XML parsing with full W3C SSML 1.1 support plus Ferni extensions.

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use std::collections::HashMap;

use super::types::*;
use crate::error::{Error, Result};

/// SSML Parser with configurable options
pub struct SsmlParser {
    /// Whether to allow Ferni extensions (ferni: namespace)
    pub allow_ferni_extensions: bool,

    /// Whether to validate during parsing
    pub validate: bool,

    /// Maximum document size in bytes
    pub max_size: usize,

    /// Maximum nesting depth
    pub max_depth: usize,
}

impl Default for SsmlParser {
    fn default() -> Self {
        Self::new()
    }
}

impl SsmlParser {
    pub fn new() -> Self {
        Self {
            allow_ferni_extensions: true,
            validate: false,
            max_size: 1024 * 1024, // 1MB
            max_depth: 32,
        }
    }

    /// Parse SSML string into document
    pub fn parse(&self, input: &str) -> Result<SsmlDocument> {
        // Size check
        if input.len() > self.max_size {
            return Err(Error::RequestTooLarge {
                size_bytes: input.len(),
                max_bytes: self.max_size,
            });
        }

        let mut reader = Reader::from_str(input);
        reader.trim_text(true);

        let mut doc = SsmlDocument::new();
        let mut depth = 0;

        // Parse until we find <speak>
        loop {
            match reader.read_event() {
                Ok(Event::Start(ref e)) if e.name().as_ref() == b"speak" => {
                    // Parse speak attributes
                    doc.version = get_attr(e, "version").unwrap_or_else(|| "1.1".to_string());
                    doc.lang = get_attr(e, "xml:lang").or_else(|| get_attr(e, "lang"));

                    // Parse children
                    doc.elements = self.parse_children(&mut reader, &mut depth)?;
                    break;
                }
                Ok(Event::Eof) => {
                    return Err(Error::ssml_parse("Missing <speak> root element", 0));
                }
                Err(e) => {
                    return Err(Error::ssml_parse(format!("XML error: {}", e), reader.buffer_position()));
                }
                _ => continue,
            }
        }

        // Calculate metadata
        doc.metadata = self.calculate_metadata(&doc);

        Ok(doc)
    }

    /// Parse children elements recursively
    fn parse_children(
        &self,
        reader: &mut Reader<&[u8]>,
        depth: &mut usize,
    ) -> Result<Vec<SsmlElement>> {
        *depth += 1;
        if *depth > self.max_depth {
            return Err(Error::ssml_parse(
                format!("Maximum nesting depth ({}) exceeded", self.max_depth),
                reader.buffer_position(),
            ));
        }

        let mut elements = Vec::new();

        loop {
            match reader.read_event() {
                Ok(Event::Start(ref e)) => {
                    let element = self.parse_element(e, reader, depth)?;
                    elements.push(element);
                }
                Ok(Event::Empty(ref e)) => {
                    let element = self.parse_empty_element(e)?;
                    elements.push(element);
                }
                Ok(Event::Text(e)) => {
                    let text = e.unescape().map_err(|err| {
                        Error::ssml_parse(format!("Text decode error: {}", err), reader.buffer_position())
                    })?;
                    let text = text.to_string();
                    if !text.is_empty() {
                        elements.push(SsmlElement::Text(text));
                    }
                }
                Ok(Event::End(_)) => {
                    *depth -= 1;
                    return Ok(elements);
                }
                Ok(Event::Eof) => {
                    return Err(Error::ssml_parse("Unexpected end of document", reader.buffer_position()));
                }
                Err(e) => {
                    return Err(Error::ssml_parse(format!("XML error: {}", e), reader.buffer_position()));
                }
                _ => continue,
            }
        }
    }

    /// Parse a start element with children
    fn parse_element(
        &self,
        start: &BytesStart,
        reader: &mut Reader<&[u8]>,
        depth: &mut usize,
    ) -> Result<SsmlElement> {
        let name = String::from_utf8_lossy(start.name().as_ref()).to_string();

        match name.as_str() {
            // W3C SSML Elements
            "voice" => {
                let children = self.parse_children(reader, depth)?;
                Ok(SsmlElement::Voice {
                    name: get_attr(start, "name"),
                    gender: get_attr(start, "gender").and_then(|g| parse_gender(&g)),
                    age: get_attr(start, "age").and_then(|a| a.parse().ok()),
                    variant: get_attr(start, "variant"),
                    lang: get_attr(start, "xml:lang"),
                    children,
                })
            }
            "prosody" => {
                let children = self.parse_children(reader, depth)?;
                Ok(SsmlElement::Prosody {
                    rate: get_attr(start, "rate"),
                    pitch: get_attr(start, "pitch"),
                    volume: get_attr(start, "volume"),
                    contour: get_attr(start, "contour"),
                    range: get_attr(start, "range"),
                    duration: get_attr(start, "duration"),
                    children,
                })
            }
            "emphasis" => {
                let children = self.parse_children(reader, depth)?;
                let level = get_attr(start, "level")
                    .map(|l| parse_emphasis_level(&l))
                    .unwrap_or(EmphasisLevel::Moderate);
                Ok(SsmlElement::Emphasis { level, children })
            }
            "say-as" => {
                let children = self.parse_children(reader, depth)?;
                let interpret_as = get_attr(start, "interpret-as")
                    .map(|i| parse_interpret_as(&i))
                    .unwrap_or(InterpretAs::Verbatim);
                Ok(SsmlElement::SayAs {
                    interpret_as,
                    format: get_attr(start, "format"),
                    detail: get_attr(start, "detail"),
                    children,
                })
            }
            "sub" => {
                let children = self.parse_children(reader, depth)?;
                let alias = get_attr(start, "alias").unwrap_or_default();
                Ok(SsmlElement::Sub { alias, children })
            }
            "phoneme" => {
                let children = self.parse_children(reader, depth)?;
                let alphabet = get_attr(start, "alphabet")
                    .map(|a| if a == "x-sampa" { PhonemeAlphabet::XSampa } else { PhonemeAlphabet::Ipa })
                    .unwrap_or(PhonemeAlphabet::Ipa);
                let ph = get_attr(start, "ph").unwrap_or_default();
                Ok(SsmlElement::Phoneme { alphabet, ph, children })
            }
            "audio" => {
                // Skip to end of audio element
                let _ = self.parse_children(reader, depth)?;
                let src = get_attr(start, "src").unwrap_or_default();
                Ok(SsmlElement::Audio { src, fallback: None })
            }
            "p" => {
                let children = self.parse_children(reader, depth)?;
                Ok(SsmlElement::Paragraph { children })
            }
            "s" => {
                let children = self.parse_children(reader, depth)?;
                Ok(SsmlElement::Sentence { children })
            }
            "w" => {
                let children = self.parse_children(reader, depth)?;
                Ok(SsmlElement::Word {
                    role: get_attr(start, "role"),
                    children,
                })
            }
            "lang" => {
                let children = self.parse_children(reader, depth)?;
                let lang = get_attr(start, "xml:lang").unwrap_or_else(|| "en-US".to_string());
                Ok(SsmlElement::Lang { lang, children })
            }

            // Ferni Extensions
            "ferni:emotion" if self.allow_ferni_extensions => {
                let children = self.parse_children(reader, depth)?;
                let emotion_type = get_attr(start, "type")
                    .map(|t| parse_ferni_emotion(&t))
                    .unwrap_or(FerniEmotionType::Calm);
                let intensity = get_attr(start, "intensity")
                    .and_then(|i| i.parse().ok())
                    .unwrap_or(1.0);
                Ok(SsmlElement::FerniEmotion {
                    emotion_type,
                    intensity,
                    children,
                })
            }
            "ferni:memory" if self.allow_ferni_extensions => {
                let children = self.parse_children(reader, depth)?;
                let entity_type = get_attr(start, "entity")
                    .map(|e| parse_memory_entity(&e))
                    .unwrap_or(MemoryEntityType::Person);
                let familiarity = get_attr(start, "familiarity")
                    .and_then(|f| f.parse().ok())
                    .unwrap_or(0.5);
                Ok(SsmlElement::FerniMemory {
                    entity_type,
                    familiarity,
                    children,
                })
            }

            // Unknown element - treat as pass-through
            _ => {
                let children = self.parse_children(reader, depth)?;
                // Just return the children directly
                Ok(if children.len() == 1 {
                    children.into_iter().next().unwrap()
                } else {
                    SsmlElement::Sentence { children }
                })
            }
        }
    }

    /// Parse an empty (self-closing) element
    fn parse_empty_element(&self, e: &BytesStart) -> Result<SsmlElement> {
        let name = String::from_utf8_lossy(e.name().as_ref()).to_string();

        match name.as_str() {
            "break" => Ok(SsmlElement::Break {
                time: get_attr(e, "time"),
                strength: get_attr(e, "strength").and_then(|s| parse_break_strength(&s)),
            }),
            "mark" => Ok(SsmlElement::Mark {
                name: get_attr(e, "name").unwrap_or_default(),
            }),
            "audio" => Ok(SsmlElement::Audio {
                src: get_attr(e, "src").unwrap_or_default(),
                fallback: None,
            }),

            // Ferni Extensions
            "ferni:breath" if self.allow_ferni_extensions => {
                let breath_type = get_attr(e, "type")
                    .map(|t| parse_breath_type(&t))
                    .unwrap_or(BreathType::Normal);
                Ok(SsmlElement::FerniBreath { breath_type })
            }
            "ferni:backchannel" if self.allow_ferni_extensions => {
                let sound = get_attr(e, "sound")
                    .map(|s| parse_backchannel(&s))
                    .unwrap_or(BackchannelSound::Hmm);
                Ok(SsmlElement::FerniBackchannel { sound })
            }
            "ferni:silence" if self.allow_ferni_extensions => {
                let weight = get_attr(e, "weight")
                    .map(|w| parse_silence_weight(&w))
                    .unwrap_or(SilenceWeight::Moderate);
                let purpose = get_attr(e, "purpose")
                    .map(|p| parse_silence_purpose(&p))
                    .unwrap_or(SilencePurpose::Emphasis);
                Ok(SsmlElement::FerniSilence { weight, purpose })
            }

            // Unknown empty element - return as break
            _ => Ok(SsmlElement::Break {
                time: Some("250ms".to_string()),
                strength: None,
            }),
        }
    }

    /// Calculate document metadata
    fn calculate_metadata(&self, doc: &SsmlDocument) -> SsmlMetadata {
        let plain_text = doc.plain_text();
        let words: Vec<&str> = plain_text.split_whitespace().collect();

        let mut marks = Vec::new();
        let mut languages = vec![doc.lang.clone().unwrap_or_else(|| "en-US".to_string())];
        let mut has_voice_switch = false;
        let mut has_ferni_extensions = false;

        fn scan_elements(
            elements: &[SsmlElement],
            marks: &mut Vec<String>,
            languages: &mut Vec<String>,
            has_voice: &mut bool,
            has_ferni: &mut bool,
        ) {
            for element in elements {
                match element {
                    SsmlElement::Mark { name } => marks.push(name.clone()),
                    SsmlElement::Voice { lang, children, .. } => {
                        *has_voice = true;
                        if let Some(l) = lang {
                            if !languages.contains(l) {
                                languages.push(l.clone());
                            }
                        }
                        scan_elements(children, marks, languages, has_voice, has_ferni);
                    }
                    SsmlElement::Lang { lang, children } => {
                        if !languages.contains(lang) {
                            languages.push(lang.clone());
                        }
                        scan_elements(children, marks, languages, has_voice, has_ferni);
                    }
                    SsmlElement::FerniEmotion { children, .. }
                    | SsmlElement::FerniMemory { children, .. } => {
                        *has_ferni = true;
                        scan_elements(children, marks, languages, has_voice, has_ferni);
                    }
                    SsmlElement::FerniBreath { .. }
                    | SsmlElement::FerniBackchannel { .. }
                    | SsmlElement::FerniSilence { .. } => {
                        *has_ferni = true;
                    }
                    SsmlElement::Prosody { children, .. }
                    | SsmlElement::Emphasis { children, .. }
                    | SsmlElement::SayAs { children, .. }
                    | SsmlElement::Sub { children, .. }
                    | SsmlElement::Phoneme { children, .. }
                    | SsmlElement::Paragraph { children }
                    | SsmlElement::Sentence { children }
                    | SsmlElement::Word { children, .. } => {
                        scan_elements(children, marks, languages, has_voice, has_ferni);
                    }
                    _ => {}
                }
            }
        }

        scan_elements(&doc.elements, &mut marks, &mut languages, &mut has_voice_switch, &mut has_ferni_extensions);

        SsmlMetadata {
            char_count: plain_text.len(),
            word_count: words.len(),
            has_voice_switch,
            has_ferni_extensions,
            marks,
            languages,
        }
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

fn get_attr(e: &BytesStart, name: &str) -> Option<String> {
    e.attributes()
        .filter_map(|a| a.ok())
        .find(|a| a.key.as_ref() == name.as_bytes())
        .map(|a| String::from_utf8_lossy(&a.value).to_string())
}

fn parse_gender(s: &str) -> Option<Gender> {
    match s.to_lowercase().as_str() {
        "male" => Some(Gender::Male),
        "female" => Some(Gender::Female),
        "neutral" => Some(Gender::Neutral),
        _ => None,
    }
}

fn parse_break_strength(s: &str) -> Option<BreakStrength> {
    match s.to_lowercase().as_str() {
        "none" => Some(BreakStrength::None),
        "x-weak" => Some(BreakStrength::XWeak),
        "weak" => Some(BreakStrength::Weak),
        "medium" => Some(BreakStrength::Medium),
        "strong" => Some(BreakStrength::Strong),
        "x-strong" => Some(BreakStrength::XStrong),
        _ => None,
    }
}

fn parse_emphasis_level(s: &str) -> EmphasisLevel {
    match s.to_lowercase().as_str() {
        "strong" => EmphasisLevel::Strong,
        "moderate" => EmphasisLevel::Moderate,
        "none" => EmphasisLevel::None,
        "reduced" => EmphasisLevel::Reduced,
        _ => EmphasisLevel::Moderate,
    }
}

fn parse_interpret_as(s: &str) -> InterpretAs {
    match s.to_lowercase().as_str() {
        "characters" => InterpretAs::Characters,
        "spell-out" => InterpretAs::SpellOut,
        "cardinal" => InterpretAs::Cardinal,
        "ordinal" => InterpretAs::Ordinal,
        "fraction" => InterpretAs::Fraction,
        "unit" => InterpretAs::Unit,
        "date" => InterpretAs::Date,
        "time" => InterpretAs::Time,
        "telephone" => InterpretAs::Telephone,
        "address" => InterpretAs::Address,
        "currency" => InterpretAs::Currency,
        "expletive" => InterpretAs::Expletive,
        _ => InterpretAs::Verbatim,
    }
}

fn parse_ferni_emotion(s: &str) -> FerniEmotionType {
    match s.to_lowercase().as_str() {
        "joy" => FerniEmotionType::Joy,
        "sadness" => FerniEmotionType::Sadness,
        "concern" => FerniEmotionType::Concern,
        "curiosity" => FerniEmotionType::Curiosity,
        "excitement" => FerniEmotionType::Excitement,
        "calm" => FerniEmotionType::Calm,
        "warmth" => FerniEmotionType::Warmth,
        "empathy" => FerniEmotionType::Empathy,
        "encouragement" => FerniEmotionType::Encouragement,
        "humor" => FerniEmotionType::Humor,
        "seriousness" => FerniEmotionType::Seriousness,
        "anticipation" => FerniEmotionType::Anticipation,
        "relief" => FerniEmotionType::Relief,
        "pride" => FerniEmotionType::Pride,
        "gratitude" => FerniEmotionType::Gratitude,
        _ => FerniEmotionType::Calm,
    }
}

fn parse_memory_entity(s: &str) -> MemoryEntityType {
    match s.to_lowercase().as_str() {
        "person" => MemoryEntityType::Person,
        "place" => MemoryEntityType::Place,
        "event" => MemoryEntityType::Event,
        "preference" => MemoryEntityType::Preference,
        "goal" => MemoryEntityType::Goal,
        "habit" => MemoryEntityType::Habit,
        "relationship" => MemoryEntityType::Relationship,
        _ => MemoryEntityType::Person,
    }
}

fn parse_breath_type(s: &str) -> BreathType {
    match s.to_lowercase().as_str() {
        "quick" => BreathType::Quick,
        "normal" => BreathType::Normal,
        "deep" => BreathType::Deep,
        "sigh" => BreathType::Sigh,
        _ => BreathType::Normal,
    }
}

fn parse_backchannel(s: &str) -> BackchannelSound {
    match s.to_lowercase().as_str() {
        "hmm" => BackchannelSound::Hmm,
        "uh" => BackchannelSound::Uh,
        "mm" => BackchannelSound::Mm,
        "oh" => BackchannelSound::Oh,
        "ah" => BackchannelSound::Ah,
        "yeah" => BackchannelSound::Yeah,
        "mhm" => BackchannelSound::Mhm,
        "wow" => BackchannelSound::Wow,
        _ => BackchannelSound::Hmm,
    }
}

fn parse_silence_weight(s: &str) -> SilenceWeight {
    match s.to_lowercase().as_str() {
        "subtle" => SilenceWeight::Subtle,
        "moderate" => SilenceWeight::Moderate,
        "significant" => SilenceWeight::Significant,
        "dramatic" => SilenceWeight::Dramatic,
        _ => SilenceWeight::Moderate,
    }
}

fn parse_silence_purpose(s: &str) -> SilencePurpose {
    match s.to_lowercase().replace('-', "_").as_str() {
        "reflection" => SilencePurpose::Reflection,
        "emphasis" => SilencePurpose::Emphasis,
        "transition" => SilencePurpose::Transition,
        "emotional_space" => SilencePurpose::EmotionalSpace,
        "anticipation" => SilencePurpose::Anticipation,
        _ => SilencePurpose::Emphasis,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple() {
        let parser = SsmlParser::new();
        let doc = parser.parse("<speak>Hello world</speak>").unwrap();

        assert_eq!(doc.version, "1.1");
        assert_eq!(doc.plain_text(), "Hello world");
    }

    #[test]
    fn test_parse_with_break() {
        let parser = SsmlParser::new();
        let doc = parser.parse(r#"<speak>Hello <break time="500ms"/> world</speak>"#).unwrap();

        assert!(doc.elements.iter().any(|e| matches!(e, SsmlElement::Break { time: Some(t), .. } if t == "500ms")));
    }

    #[test]
    fn test_parse_prosody() {
        let parser = SsmlParser::new();
        let doc = parser.parse(r#"<speak><prosody rate="slow" pitch="+2st">Hello</prosody></speak>"#).unwrap();

        if let Some(SsmlElement::Prosody { rate, pitch, .. }) = doc.elements.first() {
            assert_eq!(rate.as_deref(), Some("slow"));
            assert_eq!(pitch.as_deref(), Some("+2st"));
        } else {
            panic!("Expected prosody element");
        }
    }

    #[test]
    fn test_parse_ferni_emotion() {
        let parser = SsmlParser::new();
        let doc = parser.parse(r#"<speak><ferni:emotion type="joy" intensity="0.8">Great!</ferni:emotion></speak>"#).unwrap();

        if let Some(SsmlElement::FerniEmotion { emotion_type, intensity, .. }) = doc.elements.first() {
            assert_eq!(*emotion_type, FerniEmotionType::Joy);
            assert!((intensity - 0.8).abs() < 0.01);
        } else {
            panic!("Expected ferni:emotion element");
        }
    }

    #[test]
    fn test_metadata_calculation() {
        let parser = SsmlParser::new();
        let doc = parser.parse(r#"<speak>Hello <mark name="test"/> world</speak>"#).unwrap();

        assert_eq!(doc.metadata.word_count, 2);
        assert_eq!(doc.metadata.marks, vec!["test"]);
    }

    #[test]
    fn test_nested_elements() {
        let parser = SsmlParser::new();
        let doc = parser.parse(r#"
            <speak>
                <p>
                    <s><emphasis level="strong">Hello</emphasis> world.</s>
                </p>
            </speak>
        "#).unwrap();

        assert_eq!(doc.plain_text().trim(), "Hello world.");
    }
}
