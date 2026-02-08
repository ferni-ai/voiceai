//! SSML Validation
//!
//! Validates parsed SSML documents for correctness and safety.

use super::types::*;
use crate::error::{Error, Result};

/// Validation options
#[derive(Debug, Clone)]
pub struct ValidationOptions {
    /// Maximum text length
    pub max_text_length: usize,

    /// Maximum number of elements
    pub max_elements: usize,

    /// Allow empty documents
    pub allow_empty: bool,

    /// Require root speak element
    pub require_speak: bool,
}

impl Default for ValidationOptions {
    fn default() -> Self {
        Self {
            max_text_length: 10_000,
            max_elements: 1000,
            allow_empty: false,
            require_speak: true,
        }
    }
}

/// Validate an SSML document
pub fn validate_ssml(doc: &SsmlDocument) -> Result<()> {
    validate_ssml_with_options(doc, &ValidationOptions::default())
}

/// Validate with custom options
pub fn validate_ssml_with_options(doc: &SsmlDocument, options: &ValidationOptions) -> Result<()> {
    // Check for empty document
    if !options.allow_empty && doc.elements.is_empty() {
        return Err(Error::SsmlInvalidElement {
            element: "speak".to_string(),
            reason: "Document is empty".to_string(),
        });
    }

    // Check text length
    let plain_text = doc.plain_text();
    if plain_text.len() > options.max_text_length {
        return Err(Error::RequestTooLarge {
            size_bytes: plain_text.len(),
            max_bytes: options.max_text_length,
        });
    }

    // Count and validate elements
    let mut element_count = 0;
    validate_elements(&doc.elements, &mut element_count, options)?;

    if element_count > options.max_elements {
        return Err(Error::SsmlInvalidElement {
            element: "document".to_string(),
            reason: format!("Too many elements: {} (max: {})", element_count, options.max_elements),
        });
    }

    Ok(())
}

fn validate_elements(
    elements: &[SsmlElement],
    count: &mut usize,
    options: &ValidationOptions,
) -> Result<()> {
    for element in elements {
        *count += 1;
        if *count > options.max_elements {
            return Err(Error::SsmlInvalidElement {
                element: "document".to_string(),
                reason: format!("Too many elements (max: {})", options.max_elements),
            });
        }

        match element {
            // Validate prosody attributes
            SsmlElement::Prosody { rate, pitch, volume, children, .. } => {
                if let Some(rate) = rate {
                    validate_rate(rate)?;
                }
                if let Some(pitch) = pitch {
                    validate_pitch(pitch)?;
                }
                if let Some(volume) = volume {
                    validate_volume(volume)?;
                }
                validate_elements(children, count, options)?;
            }

            // Validate break attributes
            SsmlElement::Break { time, strength } => {
                if let Some(time) = time {
                    let ms = parse_duration_ms(time);
                    if ms > 10_000 {
                        return Err(Error::SsmlAttribute {
                            element: "break".to_string(),
                            message: format!("Break time too long: {}ms (max: 10000ms)", ms),
                        });
                    }
                }
            }

            // Validate Ferni extensions
            SsmlElement::FerniEmotion { intensity, children, .. } => {
                if *intensity < 0.0 || *intensity > 2.0 {
                    return Err(Error::SsmlAttribute {
                        element: "ferni:emotion".to_string(),
                        message: format!("Intensity must be 0.0-2.0, got: {}", intensity),
                    });
                }
                validate_elements(children, count, options)?;
            }

            SsmlElement::FerniMemory { familiarity, children, .. } => {
                if *familiarity < 0.0 || *familiarity > 1.0 {
                    return Err(Error::SsmlAttribute {
                        element: "ferni:memory".to_string(),
                        message: format!("Familiarity must be 0.0-1.0, got: {}", familiarity),
                    });
                }
                validate_elements(children, count, options)?;
            }

            // Recursive validation for elements with children
            SsmlElement::Voice { children, .. }
            | SsmlElement::Emphasis { children, .. }
            | SsmlElement::SayAs { children, .. }
            | SsmlElement::Sub { children, .. }
            | SsmlElement::Phoneme { children, .. }
            | SsmlElement::Paragraph { children }
            | SsmlElement::Sentence { children }
            | SsmlElement::Word { children, .. }
            | SsmlElement::Lang { children, .. } => {
                validate_elements(children, count, options)?;
            }

            // No validation needed for these
            SsmlElement::Text(_)
            | SsmlElement::Mark { .. }
            | SsmlElement::Audio { .. }
            | SsmlElement::FerniBreath { .. }
            | SsmlElement::FerniBackchannel { .. }
            | SsmlElement::FerniSilence { .. } => {}
        }
    }

    Ok(())
}

fn validate_rate(rate: &str) -> Result<()> {
    let valid_keywords = ["x-slow", "slow", "medium", "fast", "x-fast", "default"];

    if valid_keywords.contains(&rate.to_lowercase().as_str()) {
        return Ok(());
    }

    // Check for percentage
    if rate.ends_with('%') {
        if let Ok(pct) = rate.trim_end_matches('%').parse::<f32>() {
            if pct < 10.0 || pct > 500.0 {
                return Err(Error::SsmlAttribute {
                    element: "prosody".to_string(),
                    message: format!("Rate percentage out of range: {}% (10%-500%)", pct),
                });
            }
            return Ok(());
        }
    }

    // Check for multiplier (e.g., "1.5")
    if let Ok(mult) = rate.parse::<f32>() {
        if mult < 0.1 || mult > 5.0 {
            return Err(Error::SsmlAttribute {
                element: "prosody".to_string(),
                message: format!("Rate multiplier out of range: {} (0.1-5.0)", mult),
            });
        }
        return Ok(());
    }

    Err(Error::SsmlAttribute {
        element: "prosody".to_string(),
        message: format!("Invalid rate value: {}", rate),
    })
}

fn validate_pitch(pitch: &str) -> Result<()> {
    let valid_keywords = ["x-low", "low", "medium", "high", "x-high", "default"];

    if valid_keywords.contains(&pitch.to_lowercase().as_str()) {
        return Ok(());
    }

    // Check for semitone adjustment (e.g., "+2st", "-3st")
    if pitch.ends_with("st") {
        let value = pitch.trim_end_matches("st").trim_start_matches('+');
        if let Ok(st) = value.parse::<i8>() {
            if st < -24 || st > 24 {
                return Err(Error::SsmlAttribute {
                    element: "prosody".to_string(),
                    message: format!("Pitch semitones out of range: {}st (-24 to +24)", st),
                });
            }
            return Ok(());
        }
    }

    // Check for Hz value
    if pitch.ends_with("Hz") {
        let value = pitch.trim_end_matches("Hz").trim_start_matches('+');
        if let Ok(hz) = value.parse::<f32>() {
            if hz < 50.0 || hz > 500.0 {
                return Err(Error::SsmlAttribute {
                    element: "prosody".to_string(),
                    message: format!("Pitch Hz out of range: {}Hz (50-500)", hz),
                });
            }
            return Ok(());
        }
    }

    // Check for percentage
    if pitch.ends_with('%') {
        if let Ok(pct) = pitch.trim_end_matches('%').trim_start_matches('+').parse::<f32>() {
            if pct < -50.0 || pct > 50.0 {
                return Err(Error::SsmlAttribute {
                    element: "prosody".to_string(),
                    message: format!("Pitch percentage out of range: {}% (-50% to +50%)", pct),
                });
            }
            return Ok(());
        }
    }

    Err(Error::SsmlAttribute {
        element: "prosody".to_string(),
        message: format!("Invalid pitch value: {}", pitch),
    })
}

fn validate_volume(volume: &str) -> Result<()> {
    let valid_keywords = ["silent", "x-soft", "soft", "medium", "loud", "x-loud", "default"];

    if valid_keywords.contains(&volume.to_lowercase().as_str()) {
        return Ok(());
    }

    // Check for dB adjustment
    if volume.ends_with("dB") {
        let value = volume.trim_end_matches("dB").trim_start_matches('+');
        if let Ok(db) = value.parse::<f32>() {
            if db < -20.0 || db > 20.0 {
                return Err(Error::SsmlAttribute {
                    element: "prosody".to_string(),
                    message: format!("Volume dB out of range: {}dB (-20 to +20)", db),
                });
            }
            return Ok(());
        }
    }

    Err(Error::SsmlAttribute {
        element: "prosody".to_string(),
        message: format!("Invalid volume value: {}", volume),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssml::parse;

    #[test]
    fn test_validate_simple() {
        let doc = parse("<speak>Hello world</speak>").unwrap();
        assert!(validate_ssml(&doc).is_ok());
    }

    #[test]
    fn test_validate_rate() {
        assert!(validate_rate("slow").is_ok());
        assert!(validate_rate("150%").is_ok());
        assert!(validate_rate("1.5").is_ok());
        assert!(validate_rate("600%").is_err()); // Out of range
    }

    #[test]
    fn test_validate_pitch() {
        assert!(validate_pitch("high").is_ok());
        assert!(validate_pitch("+2st").is_ok());
        assert!(validate_pitch("-3st").is_ok());
        assert!(validate_pitch("+30st").is_err()); // Out of range
    }

    #[test]
    fn test_validate_volume() {
        assert!(validate_volume("loud").is_ok());
        assert!(validate_volume("+6dB").is_ok());
        assert!(validate_volume("-10dB").is_ok());
        assert!(validate_volume("+25dB").is_err()); // Out of range
    }

    #[test]
    fn test_validate_break_duration() {
        let doc = parse(r#"<speak>Hello <break time="15000ms"/> world</speak>"#).unwrap();
        assert!(validate_ssml(&doc).is_err()); // Break too long
    }

    #[test]
    fn test_validate_ferni_intensity() {
        let doc = parse(r#"<speak><ferni:emotion type="joy" intensity="3.0">Hi</ferni:emotion></speak>"#).unwrap();
        assert!(validate_ssml(&doc).is_err()); // Intensity out of range
    }
}
