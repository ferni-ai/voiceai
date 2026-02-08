//! Emotional Anticipation Transform
//!
//! Express emotion BEFORE the content lands.
//! This creates the feeling that Ferni truly understands.
//!
//! Examples:
//! - User shares good news → Ferni's voice lifts with joy BEFORE responding
//! - User shares concern → Voice softens with empathy at the start
//! - Building to exciting news → Voice gradually builds anticipation

use super::SuperhumanContext;
use crate::ssml::{SsmlDocument, SsmlElement, FerniEmotionType, Prosody, BreakStrength};
use crate::error::Result;

/// Emotional anticipation transform
pub struct EmotionalAnticipationTransform {
    /// How much to anticipate (0.0 = none, 1.0 = full)
    pub anticipation_strength: f32,

    /// Whether to add preparatory pause
    pub add_prep_pause: bool,
}

impl Default for EmotionalAnticipationTransform {
    fn default() -> Self {
        Self {
            anticipation_strength: 0.7,
            add_prep_pause: true,
        }
    }
}

impl EmotionalAnticipationTransform {
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply emotional anticipation to SSML document
    pub fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        // Determine emotional context
        let (emotion, intensity) = self.determine_emotion(ctx);

        if intensity < 0.1 {
            return Ok(()); // No significant emotion to anticipate
        }

        // Apply emotion to the beginning of the document
        self.apply_emotion_prefix(doc, emotion, intensity);

        // Handle emotional trajectory (building emotion)
        if let Some(trajectory) = &ctx.emotional_trajectory {
            self.apply_trajectory(doc, trajectory, intensity);
        }

        Ok(())
    }

    fn determine_emotion(&self, ctx: &SuperhumanContext) -> (FerniEmotionType, f32) {
        // First check explicit user emotion (we mirror/respond to it)
        if let Some(user_emotion) = &ctx.user_emotion {
            let intensity = ctx.user_emotion_intensity.unwrap_or(0.5) * self.anticipation_strength;
            let response_emotion = self.get_response_emotion(user_emotion);
            return (response_emotion, intensity);
        }

        // Check topic sensitivity
        if let Some(sensitivity) = ctx.topic_sensitivity {
            if sensitivity > 0.7 {
                return (FerniEmotionType::Empathy, sensitivity * 0.6);
            }
        }

        // Default: calm
        (FerniEmotionType::Calm, 0.0)
    }

    /// Map user emotion to appropriate response emotion
    fn get_response_emotion(&self, user_emotion: &str) -> FerniEmotionType {
        match user_emotion.to_lowercase().as_str() {
            "joy" | "happy" | "excited" => FerniEmotionType::Joy,
            "sad" | "sadness" | "down" => FerniEmotionType::Empathy,
            "anxious" | "worried" | "nervous" => FerniEmotionType::Calm,
            "angry" | "frustrated" => FerniEmotionType::Empathy,
            "curious" | "interested" => FerniEmotionType::Curiosity,
            "tired" | "exhausted" => FerniEmotionType::Warmth,
            "proud" | "accomplished" => FerniEmotionType::Pride,
            "grateful" | "thankful" => FerniEmotionType::Gratitude,
            "hopeful" | "optimistic" => FerniEmotionType::Encouragement,
            "confused" | "uncertain" => FerniEmotionType::Calm,
            _ => FerniEmotionType::Warmth,
        }
    }

    fn apply_emotion_prefix(&self, doc: &mut SsmlDocument, emotion: FerniEmotionType, intensity: f32) {
        let mut new_elements = Vec::new();

        // Add preparatory pause if enabled
        if self.add_prep_pause && intensity > 0.3 {
            new_elements.push(SsmlElement::Break {
                time: Some("200ms".to_string()),
                strength: Some(BreakStrength::Weak),
            });
        }

        // Wrap existing content in emotion
        let elements = std::mem::take(&mut doc.elements);

        // Add prosody changes based on emotion
        let prosody = self.get_emotion_prosody(&emotion, intensity);

        new_elements.push(SsmlElement::FerniEmotion {
            emotion_type: emotion,
            intensity,
            children: if prosody.rate.is_some() || prosody.pitch.is_some() || prosody.volume.is_some() {
                vec![SsmlElement::Prosody {
                    rate: prosody.rate,
                    pitch: prosody.pitch,
                    volume: prosody.volume,
                    contour: prosody.contour,
                    range: prosody.range,
                    duration: prosody.duration,
                    children: elements,
                }]
            } else {
                elements
            },
        });

        doc.elements = new_elements;
    }

    fn get_emotion_prosody(&self, emotion: &FerniEmotionType, intensity: f32) -> Prosody {
        let intensity_factor = intensity.clamp(0.0, 1.0);

        match emotion {
            FerniEmotionType::Joy | FerniEmotionType::Excitement => Prosody {
                pitch: Some(format!("+{}st", (2.0 * intensity_factor) as i8)),
                rate: Some(format!("{}%", 100 + (10.0 * intensity_factor) as i32)),
                volume: Some(format!("+{}dB", (2.0 * intensity_factor) as i8)),
                ..Default::default()
            },
            FerniEmotionType::Sadness | FerniEmotionType::Empathy => Prosody {
                pitch: Some(format!("-{}st", (1.0 * intensity_factor) as i8)),
                rate: Some(format!("{}%", 100 - (10.0 * intensity_factor) as i32)),
                volume: Some(format!("-{}dB", (2.0 * intensity_factor) as i8)),
                ..Default::default()
            },
            FerniEmotionType::Concern => Prosody {
                pitch: Some(format!("-{}st", (1.0 * intensity_factor) as i8)),
                rate: Some(format!("{}%", 100 - (5.0 * intensity_factor) as i32)),
                ..Default::default()
            },
            FerniEmotionType::Curiosity | FerniEmotionType::Anticipation => Prosody {
                pitch: Some(format!("+{}st", (1.0 * intensity_factor) as i8)),
                range: Some(format!("+{}%", (10.0 * intensity_factor) as i8)),
                ..Default::default()
            },
            FerniEmotionType::Calm | FerniEmotionType::Warmth => Prosody {
                pitch: Some("-1st".to_string()),
                rate: Some("95%".to_string()),
                volume: Some("-1dB".to_string()),
                ..Default::default()
            },
            FerniEmotionType::Encouragement | FerniEmotionType::Pride => Prosody {
                pitch: Some(format!("+{}st", (1.0 * intensity_factor) as i8)),
                volume: Some(format!("+{}dB", (1.0 * intensity_factor) as i8)),
                ..Default::default()
            },
            _ => Prosody::default(),
        }
    }

    fn apply_trajectory(&self, doc: &mut SsmlDocument, trajectory: &str, base_intensity: f32) {
        match trajectory.to_lowercase().as_str() {
            "building_to_joy" => {
                // Gradually increase pitch and rate through the document
                self.apply_building_prosody(doc, "+2st", "105%");
            }
            "building_to_concern" => {
                // Gradually slow and lower
                self.apply_building_prosody(doc, "-1st", "95%");
            }
            "building_to_revelation" => {
                // Build anticipation with increasing range
                self.apply_building_prosody(doc, "+1st", "102%");
            }
            _ => {}
        }
    }

    fn apply_building_prosody(&self, doc: &mut SsmlDocument, target_pitch: &str, target_rate: &str) {
        // This would ideally apply gradual changes across sentences
        // For now, we'll add a contour hint
        let elements = std::mem::take(&mut doc.elements);
        doc.elements = vec![SsmlElement::Prosody {
            rate: Some(target_rate.to_string()),
            pitch: Some(target_pitch.to_string()),
            volume: None,
            contour: Some("(0%,+0st) (100%,+2st)".to_string()), // Rising contour
            range: None,
            duration: None,
            children: elements,
        }];
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssml::parse;

    #[test]
    fn test_joy_anticipation() {
        let transform = EmotionalAnticipationTransform::new();
        let ctx = SuperhumanContext::new()
            .with_user_emotion("joy", 0.8);

        let mut doc = parse("<speak>That's wonderful news!</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have emotion wrapper
        let has_emotion = doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniEmotion { emotion_type: FerniEmotionType::Joy, .. }));
        assert!(has_emotion, "Should have joy emotion anticipation");
    }

    #[test]
    fn test_empathy_for_sadness() {
        let transform = EmotionalAnticipationTransform::new();
        let ctx = SuperhumanContext::new()
            .with_user_emotion("sad", 0.7);

        let mut doc = parse("<speak>I understand that's hard.</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should respond with empathy
        let has_empathy = doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniEmotion { emotion_type: FerniEmotionType::Empathy, .. }));
        assert!(has_empathy, "Should respond to sadness with empathy");
    }

    #[test]
    fn test_sensitive_topic() {
        let transform = EmotionalAnticipationTransform::new();
        let ctx = SuperhumanContext::new()
            .with_topic("grief", 0.9);

        let mut doc = parse("<speak>I'm here for you.</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have empathy for sensitive topic
        let has_empathy = doc.elements.iter().any(|e| matches!(e, SsmlElement::FerniEmotion { emotion_type: FerniEmotionType::Empathy, .. }));
        assert!(has_empathy, "Should have empathy for sensitive topic");
    }
}
