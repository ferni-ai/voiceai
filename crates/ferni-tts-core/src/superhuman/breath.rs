//! Breath Pattern Transform
//!
//! Adds natural breathing rhythm to speech.
//! Makes the voice feel more human and alive.
//!
//! - Quick breath: Short intake before continuing
//! - Normal breath: Natural pause between thoughts
//! - Deep breath: Before something important
//! - Sigh: Emotional release

use super::SuperhumanContext;
use crate::ssml::{SsmlDocument, SsmlElement, BreathType};
use crate::error::Result;

/// Breath pattern transform
pub struct BreathPatternTransform {
    /// Whether to add breath patterns
    pub enabled: bool,

    /// Average characters between breaths
    pub breath_interval: usize,

    /// Whether to add emotional sighs
    pub emotional_sighs: bool,
}

impl Default for BreathPatternTransform {
    fn default() -> Self {
        Self {
            enabled: true,
            breath_interval: 150, // ~1 breath per long sentence
            emotional_sighs: true,
        }
    }
}

impl BreathPatternTransform {
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply breath patterns to SSML document
    pub fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        // Add breaths between sentences
        doc.elements = self.add_breaths(&doc.elements, ctx);

        // Add emotional sigh if appropriate
        if self.emotional_sighs {
            if let Some(sigh_pos) = self.should_add_sigh(ctx) {
                self.insert_sigh(doc, sigh_pos);
            }
        }

        Ok(())
    }

    fn add_breaths(&self, elements: &[SsmlElement], ctx: &SuperhumanContext) -> Vec<SsmlElement> {
        let mut result = Vec::new();
        let mut chars_since_breath = 0;

        for element in elements {
            match element {
                SsmlElement::Text(text) => {
                    chars_since_breath += text.len();
                    result.push(element.clone());
                }
                SsmlElement::Sentence { children } => {
                    // Process sentence and track characters
                    let text_len: usize = children.iter()
                        .map(|e| e.plain_text().len())
                        .sum();

                    result.push(SsmlElement::Sentence {
                        children: self.add_breaths(children, ctx),
                    });

                    chars_since_breath += text_len;

                    // Add breath after long sentences
                    if chars_since_breath >= self.breath_interval {
                        result.push(SsmlElement::FerniBreath {
                            breath_type: self.select_breath_type(ctx),
                        });
                        chars_since_breath = 0;
                    }
                }
                SsmlElement::Paragraph { children } => {
                    // Paragraphs always get a breath after
                    result.push(SsmlElement::Paragraph {
                        children: self.add_breaths(children, ctx),
                    });

                    result.push(SsmlElement::FerniBreath {
                        breath_type: BreathType::Normal,
                    });
                    chars_since_breath = 0;
                }
                // Process other elements with children
                SsmlElement::Prosody { rate, pitch, volume, contour, range, duration, children } => {
                    result.push(SsmlElement::Prosody {
                        rate: rate.clone(),
                        pitch: pitch.clone(),
                        volume: volume.clone(),
                        contour: contour.clone(),
                        range: range.clone(),
                        duration: duration.clone(),
                        children: self.add_breaths(children, ctx),
                    });
                }
                // Pass through other elements
                other => {
                    result.push(other.clone());
                }
            }
        }

        result
    }

    fn select_breath_type(&self, ctx: &SuperhumanContext) -> BreathType {
        // Late night = deeper breaths
        if ctx.is_late_night() {
            return BreathType::Deep;
        }

        // High energy = quick breaths
        if let Some(energy) = ctx.user_energy {
            if energy > 0.7 {
                return BreathType::Quick;
            }
        }

        // Sensitive topic = deeper breaths
        if let Some(sensitivity) = ctx.topic_sensitivity {
            if sensitivity > 0.7 {
                return BreathType::Deep;
            }
        }

        BreathType::Normal
    }

    fn should_add_sigh(&self, ctx: &SuperhumanContext) -> Option<SighPosition> {
        // Add sigh for certain emotional contexts
        if let Some(emotion) = &ctx.user_emotion {
            match emotion.to_lowercase().as_str() {
                "sad" | "relieved" | "tired" | "frustrated" => {
                    return Some(SighPosition::Start);
                }
                "overwhelmed" | "stressed" => {
                    return Some(SighPosition::Start);
                }
                _ => {}
            }
        }

        // Add sigh for very sensitive topics
        if let Some(sensitivity) = ctx.topic_sensitivity {
            if sensitivity > 0.85 {
                return Some(SighPosition::Start);
            }
        }

        None
    }

    fn insert_sigh(&self, doc: &mut SsmlDocument, position: SighPosition) {
        match position {
            SighPosition::Start => {
                let mut new_elements = vec![
                    SsmlElement::FerniBreath { breath_type: BreathType::Sigh },
                ];
                new_elements.extend(std::mem::take(&mut doc.elements));
                doc.elements = new_elements;
            }
            SighPosition::End => {
                doc.elements.push(SsmlElement::FerniBreath {
                    breath_type: BreathType::Sigh,
                });
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum SighPosition {
    Start,
    End,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssml::parse;

    #[test]
    fn test_breath_after_paragraph() {
        let transform = BreathPatternTransform::new();
        let ctx = SuperhumanContext::new();

        let mut doc = parse("<speak><p>First paragraph.</p><p>Second paragraph.</p></speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have breath elements
        let breath_count = doc.elements.iter()
            .filter(|e| matches!(e, SsmlElement::FerniBreath { .. }))
            .count();
        assert!(breath_count >= 2, "Should have breaths after paragraphs");
    }

    #[test]
    fn test_sigh_for_sad_emotion() {
        let transform = BreathPatternTransform::new();
        let ctx = SuperhumanContext::new()
            .with_user_emotion("sad", 0.7);

        let mut doc = parse("<speak>I understand that's difficult.</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have sigh
        let has_sigh = doc.elements.iter()
            .any(|e| matches!(e, SsmlElement::FerniBreath { breath_type: BreathType::Sigh }));
        assert!(has_sigh, "Sad emotion should trigger sigh");
    }

    #[test]
    fn test_deep_breath_late_night() {
        let transform = BreathPatternTransform::new();
        let ctx = SuperhumanContext::new().with_user_local_hour(2);

        let breath_type = transform.select_breath_type(&ctx);
        assert_eq!(breath_type, BreathType::Deep, "Late night should use deep breaths");
    }

    #[test]
    fn test_disabled_breaths() {
        let mut transform = BreathPatternTransform::new();
        transform.enabled = false;

        let ctx = SuperhumanContext::new();

        let mut doc = parse("<speak><p>Long text.</p></speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should NOT have breath elements
        let has_breath = doc.elements.iter()
            .any(|e| matches!(e, SsmlElement::FerniBreath { .. }));
        assert!(!has_breath, "Disabled transform should not add breaths");
    }
}
