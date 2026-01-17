//! # SSML Parser Module
//!
//! Full W3C Speech Synthesis Markup Language (SSML) 1.1 implementation.
//!
//! ## Supported Elements
//!
//! | Element | Support | Notes |
//! |---------|---------|-------|
//! | `<speak>` | Full | Root element |
//! | `<voice>` | Full | Voice selection |
//! | `<prosody>` | Full | Rate, pitch, volume, contour |
//! | `<break>` | Full | Pauses with time/strength |
//! | `<emphasis>` | Full | Strong, moderate, reduced, none |
//! | `<say-as>` | Full | Interpret-as with format |
//! | `<sub>` | Full | Substitution |
//! | `<phoneme>` | Full | IPA/X-SAMPA pronunciation |
//! | `<audio>` | Partial | References only, no inline |
//! | `<mark>` | Full | Bookmark events |
//! | `<p>` / `<s>` | Full | Paragraph/sentence |
//! | `<w>` | Full | Word boundaries |
//! | `<lang>` | Full | Language switching |
//! | `<lexicon>` | Planned | Custom pronunciation |
//!
//! ## Ferni Extensions
//!
//! | Element | Description |
//! |---------|-------------|
//! | `<ferni:emotion>` | Emotional coloring (joy, concern, curiosity) |
//! | `<ferni:memory>` | Memory prosody markers |
//! | `<ferni:breath>` | Breathing patterns |
//! | `<ferni:backchannel>` | Natural interjections |

mod parser;
mod types;
mod validator;

pub use parser::SsmlParser;
pub use types::*;
pub use validator::validate_ssml;

/// Parse SSML string into a document
///
/// # Example
///
/// ```rust
/// use ferni_tts::ssml::parse;
///
/// let ssml = r#"<speak>Hello <break time="500ms"/> world!</speak>"#;
/// let doc = parse(ssml)?;
/// ```
pub fn parse(input: &str) -> crate::Result<SsmlDocument> {
    let parser = SsmlParser::new();
    parser.parse(input)
}

/// Parse SSML with validation
pub fn parse_and_validate(input: &str) -> crate::Result<SsmlDocument> {
    let doc = parse(input)?;
    validate_ssml(&doc)?;
    Ok(doc)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_speak() {
        let doc = parse("<speak>Hello world</speak>").unwrap();
        assert_eq!(doc.elements.len(), 1);
    }

    #[test]
    fn test_with_break() {
        let doc = parse(r#"<speak>Hello <break time="500ms"/> world</speak>"#).unwrap();
        assert!(doc.elements.iter().any(|e| matches!(e, SsmlElement::Break { .. })));
    }

    #[test]
    fn test_prosody() {
        let doc = parse(r#"<speak><prosody rate="slow" pitch="+2st">Hello</prosody></speak>"#).unwrap();
        if let Some(SsmlElement::Prosody { rate, pitch, .. }) = doc.elements.first() {
            assert_eq!(rate.as_deref(), Some("slow"));
            assert_eq!(pitch.as_deref(), Some("+2st"));
        }
    }

    #[test]
    fn test_ferni_emotion() {
        let doc = parse(r#"<speak><ferni:emotion type="joy" intensity="0.8">Great news!</ferni:emotion></speak>"#).unwrap();
        assert!(doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniEmotion { .. })));
    }
}
