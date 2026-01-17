//! Meaningful Silence Transform
//!
//! Strategic pauses that create emotional impact.
//! "The pause is as important as the words."
//!
//! Types of meaningful silence:
//! - Reflection pause: Let user process
//! - Emphasis pause: What follows is important
//! - Transition pause: Topic is changing
//! - Emotional space: Room to feel
//! - Anticipation pause: Build tension

use super::SuperhumanContext;
use crate::ssml::{SsmlDocument, SsmlElement, SilenceWeight, SilencePurpose};
use crate::error::Result;

/// Meaningful silence transform
pub struct MeaningfulSilenceTransform {
    /// Base pause duration multiplier
    pub pause_multiplier: f32,

    /// Whether to add emotional space pauses
    pub add_emotional_pauses: bool,

    /// Whether to add reflection pauses after questions
    pub add_reflection_pauses: bool,
}

impl Default for MeaningfulSilenceTransform {
    fn default() -> Self {
        Self {
            pause_multiplier: 1.0,
            add_emotional_pauses: true,
            add_reflection_pauses: true,
        }
    }
}

impl MeaningfulSilenceTransform {
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply meaningful silence to SSML document
    pub fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        // Adjust pause multiplier based on context
        let adjusted_multiplier = self.calculate_pause_multiplier(ctx);

        // Process elements to add strategic pauses
        doc.elements = self.process_elements(&doc.elements, ctx, adjusted_multiplier);

        // Add reflection pause at end if responding to question
        if ctx.is_response_to_question.unwrap_or(false) && self.add_reflection_pauses {
            doc.elements.push(SsmlElement::FerniSilence {
                weight: SilenceWeight::Subtle,
                purpose: SilencePurpose::Reflection,
            });
        }

        Ok(())
    }

    fn calculate_pause_multiplier(&self, ctx: &SuperhumanContext) -> f32 {
        let mut multiplier = self.pause_multiplier;

        // Late night = longer pauses
        if ctx.is_late_night() {
            multiplier *= 1.2;
        }

        // Sensitive topic = longer pauses
        if let Some(sensitivity) = ctx.topic_sensitivity {
            if sensitivity > 0.7 {
                multiplier *= 1.0 + (sensitivity - 0.7);
            }
        }

        // Close relationship = can use longer pauses comfortably
        if let Some(stage) = ctx.relationship_stage {
            if stage > 0.7 {
                multiplier *= 1.1;
            }
        }

        multiplier.clamp(0.5, 2.0)
    }

    fn process_elements(
        &self,
        elements: &[SsmlElement],
        ctx: &SuperhumanContext,
        multiplier: f32,
    ) -> Vec<SsmlElement> {
        let mut result = Vec::new();
        let text = Self::extract_text(elements);

        for (i, element) in elements.iter().enumerate() {
            match element {
                SsmlElement::Text(t) => {
                    // Check for natural pause points
                    result.extend(self.process_text(t, ctx, multiplier));
                }
                SsmlElement::Sentence { children } => {
                    let processed = self.process_elements(children, ctx, multiplier);

                    // Add sentence
                    result.push(SsmlElement::Sentence { children: processed });

                    // Check if we should add a pause after this sentence
                    if let Some(pause) = self.should_pause_after_sentence(i, elements, ctx) {
                        result.push(pause);
                    }
                }
                SsmlElement::Paragraph { children } => {
                    let processed = self.process_elements(children, ctx, multiplier);
                    result.push(SsmlElement::Paragraph { children: processed });

                    // Paragraphs get a transition pause
                    if i < elements.len() - 1 {
                        result.push(SsmlElement::FerniSilence {
                            weight: SilenceWeight::Moderate,
                            purpose: SilencePurpose::Transition,
                        });
                    }
                }
                // Pass through other elements, processing children
                SsmlElement::Prosody { rate, pitch, volume, contour, range, duration, children } => {
                    result.push(SsmlElement::Prosody {
                        rate: rate.clone(),
                        pitch: pitch.clone(),
                        volume: volume.clone(),
                        contour: contour.clone(),
                        range: range.clone(),
                        duration: duration.clone(),
                        children: self.process_elements(children, ctx, multiplier),
                    });
                }
                other => result.push(other.clone()),
            }
        }

        result
    }

    fn extract_text(elements: &[SsmlElement]) -> String {
        elements.iter().map(|e| e.plain_text()).collect()
    }

    fn process_text(&self, text: &str, ctx: &SuperhumanContext, multiplier: f32) -> Vec<SsmlElement> {
        let mut result = Vec::new();
        let mut current_text = String::new();

        // Look for emotional markers that deserve pauses
        let pause_triggers = [
            ("...", SilenceWeight::Moderate, SilencePurpose::Reflection),
            (" - ", SilenceWeight::Subtle, SilencePurpose::Emphasis),
            (". But ", SilenceWeight::Subtle, SilencePurpose::Transition),
            (". And ", SilenceWeight::Subtle, SilencePurpose::Transition),
            ("I understand", SilenceWeight::Moderate, SilencePurpose::EmotionalSpace),
            ("I'm sorry", SilenceWeight::Moderate, SilencePurpose::EmotionalSpace),
            ("That's hard", SilenceWeight::Moderate, SilencePurpose::EmotionalSpace),
        ];

        let mut remaining = text.to_string();

        for (trigger, weight, purpose) in pause_triggers.iter() {
            if let Some(pos) = remaining.find(trigger) {
                // Add text before trigger
                if pos > 0 {
                    result.push(SsmlElement::Text(remaining[..pos].to_string()));
                }

                // Add pause
                if self.add_emotional_pauses {
                    result.push(SsmlElement::FerniSilence {
                        weight: *weight,
                        purpose: *purpose,
                    });
                }

                // Add the trigger text
                result.push(SsmlElement::Text(trigger.to_string()));

                remaining = remaining[pos + trigger.len()..].to_string();
            }
        }

        // Add any remaining text
        if !remaining.is_empty() {
            result.push(SsmlElement::Text(remaining));
        }

        if result.is_empty() {
            result.push(SsmlElement::Text(text.to_string()));
        }

        result
    }

    fn should_pause_after_sentence(
        &self,
        index: usize,
        elements: &[SsmlElement],
        ctx: &SuperhumanContext,
    ) -> Option<SsmlElement> {
        // Don't add pause after last element
        if index >= elements.len() - 1 {
            return None;
        }

        // Check if current sentence ends with certain patterns
        if let SsmlElement::Sentence { children } = &elements[index] {
            let text = Self::extract_text(children);

            // Questions get reflection pause
            if text.ends_with('?') {
                return Some(SsmlElement::FerniSilence {
                    weight: SilenceWeight::Subtle,
                    purpose: SilencePurpose::Reflection,
                });
            }

            // Emotional statements get emotional space
            if self.is_emotional_statement(&text) && self.add_emotional_pauses {
                return Some(SsmlElement::FerniSilence {
                    weight: SilenceWeight::Moderate,
                    purpose: SilencePurpose::EmotionalSpace,
                });
            }
        }

        None
    }

    fn is_emotional_statement(&self, text: &str) -> bool {
        let emotional_phrases = [
            "i love", "i miss", "i'm proud", "i'm sorry",
            "that means a lot", "that's beautiful", "that's hard",
            "i understand", "i believe in you", "i'm here for you",
        ];

        let lower = text.to_lowercase();
        emotional_phrases.iter().any(|phrase| lower.contains(phrase))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssml::parse;

    #[test]
    fn test_ellipsis_pause() {
        let transform = MeaningfulSilenceTransform::new();
        let ctx = SuperhumanContext::new();

        let mut doc = parse("<speak>Well... I'm not sure.</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have silence element
        let has_silence = doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniSilence { .. }));
        assert!(has_silence, "Should add pause for ellipsis");
    }

    #[test]
    fn test_late_night_longer_pauses() {
        let transform = MeaningfulSilenceTransform::new();
        let ctx = SuperhumanContext::new().with_user_local_hour(2);

        let multiplier = transform.calculate_pause_multiplier(&ctx);
        assert!(multiplier > 1.0, "Late night should have longer pauses");
    }

    #[test]
    fn test_sensitive_topic_pauses() {
        let transform = MeaningfulSilenceTransform::new();
        let ctx = SuperhumanContext::new().with_topic("grief", 0.9);

        let multiplier = transform.calculate_pause_multiplier(&ctx);
        assert!(multiplier > 1.0, "Sensitive topics should have longer pauses");
    }
}
