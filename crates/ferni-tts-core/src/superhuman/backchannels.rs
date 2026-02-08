//! Backchannel Transform
//!
//! Adds natural conversational interjections.
//! "Hmm", "Uh-huh", "Oh", "Wow" etc.
//!
//! These create the feeling of active listening and engagement.

use super::SuperhumanContext;
use crate::ssml::{SsmlDocument, SsmlElement, BackchannelSound};
use crate::error::Result;
use std::collections::HashMap;

/// Backchannel transform
pub struct BackchannelTransform {
    /// Whether to add backchannels
    pub enabled: bool,

    /// Probability of adding a backchannel when appropriate (0.0-1.0)
    pub probability: f32,
}

impl Default for BackchannelTransform {
    fn default() -> Self {
        Self {
            enabled: true,
            probability: 0.3, // 30% chance when appropriate
        }
    }
}

impl BackchannelTransform {
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply backchannel additions
    pub fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        // Determine if and what backchannel to add
        if let Some(backchannel) = self.select_backchannel(ctx) {
            // Add backchannel at the start (as a response acknowledgment)
            let mut new_elements = vec![
                SsmlElement::FerniBackchannel { sound: backchannel },
                SsmlElement::Break {
                    time: Some("150ms".to_string()),
                    strength: None,
                },
            ];
            new_elements.extend(std::mem::take(&mut doc.elements));
            doc.elements = new_elements;
        }

        Ok(())
    }

    fn select_backchannel(&self, ctx: &SuperhumanContext) -> Option<BackchannelSound> {
        // Don't add backchannels on first turn
        if ctx.turn_number.unwrap_or(0) < 2 {
            return None;
        }

        // Check response delay - if quick response, might want acknowledgment
        let quick_response = ctx.response_delay_ms.unwrap_or(0) < 500;

        // Check if responding to a question
        let is_response = ctx.is_response_to_question.unwrap_or(false);

        // Select based on context
        if let Some(emotion) = &ctx.user_emotion {
            return self.backchannel_for_emotion(emotion);
        }

        // If it's a response to user, acknowledgment backchannel
        if is_response || quick_response {
            // Simple random selection with probability
            let options = [
                BackchannelSound::Mhm,
                BackchannelSound::Mm,
                BackchannelSound::Yeah,
            ];

            // Use turn number as pseudo-random seed
            let idx = ctx.turn_number.unwrap_or(0) as usize % options.len();
            if self.should_add_backchannel(ctx) {
                return Some(options[idx]);
            }
        }

        None
    }

    fn backchannel_for_emotion(&self, emotion: &str) -> Option<BackchannelSound> {
        if !self.should_add_backchannel_for_emotion(emotion) {
            return None;
        }

        match emotion.to_lowercase().as_str() {
            "excited" | "joy" | "happy" => Some(BackchannelSound::Wow),
            "surprised" => Some(BackchannelSound::Oh),
            "curious" | "interested" => Some(BackchannelSound::Hmm),
            "sad" | "concerned" => Some(BackchannelSound::Mm),
            "agreeing" | "understanding" => Some(BackchannelSound::Mhm),
            _ => None,
        }
    }

    fn should_add_backchannel(&self, ctx: &SuperhumanContext) -> bool {
        // Use turn number for deterministic pseudo-randomness
        let seed = ctx.turn_number.unwrap_or(0);
        let pseudo_random = (seed * 7 + 3) % 100;
        pseudo_random < (self.probability * 100.0) as u32
    }

    fn should_add_backchannel_for_emotion(&self, emotion: &str) -> bool {
        // More likely for strong emotions
        let strong_emotions = ["excited", "surprised", "sad", "joy"];
        if strong_emotions.iter().any(|e| emotion.to_lowercase().contains(e)) {
            return true; // Always add for strong emotions
        }

        // 50% for moderate emotions
        self.probability > 0.25
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssml::parse;

    #[test]
    fn test_excited_backchannel() {
        let transform = BackchannelTransform::new();
        let ctx = SuperhumanContext::new()
            .with_user_emotion("excited", 0.8);

        let mut doc = parse("<speak>That's wonderful!</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have backchannel
        let has_backchannel = doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniBackchannel { sound: BackchannelSound::Wow }));
        assert!(has_backchannel, "Excited emotion should trigger Wow backchannel");
    }

    #[test]
    fn test_first_turn_no_backchannel() {
        let transform = BackchannelTransform::new();
        let mut ctx = SuperhumanContext::new();
        ctx.turn_number = Some(1);

        let mut doc = parse("<speak>Hello!</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should NOT have backchannel on first turn
        let has_backchannel = doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniBackchannel { .. }));
        assert!(!has_backchannel, "First turn should not have backchannel");
    }

    #[test]
    fn test_disabled_backchannel() {
        let mut transform = BackchannelTransform::new();
        transform.enabled = false;

        let ctx = SuperhumanContext::new()
            .with_user_emotion("excited", 0.9);

        let mut doc = parse("<speak>Wow!</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should NOT have backchannel when disabled
        let has_backchannel = doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniBackchannel { .. }));
        assert!(!has_backchannel, "Disabled transform should not add backchannels");
    }
}
