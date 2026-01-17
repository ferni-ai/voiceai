//! Relationship Prosody Transform
//!
//! Adjusts warmth and familiarity based on relationship stage.
//!
//! - New relationships: More formal, respectful
//! - Growing relationships: Warmer, more casual
//! - Close relationships: Very warm, intimate, can use silence comfortably

use super::SuperhumanContext;
use crate::ssml::{SsmlDocument, SsmlElement, Prosody};
use crate::error::Result;

/// Relationship stage thresholds
const STRANGER: f32 = 0.0;
const ACQUAINTANCE: f32 = 0.2;
const FAMILIAR: f32 = 0.4;
const FRIENDLY: f32 = 0.6;
const CLOSE: f32 = 0.8;
const INTIMATE: f32 = 0.95;

/// Relationship prosody transform
pub struct RelationshipProsodyTransform {
    /// Whether to adjust warmth (pitch variance)
    pub adjust_warmth: bool,

    /// Whether to adjust formality (rate)
    pub adjust_formality: bool,
}

impl Default for RelationshipProsodyTransform {
    fn default() -> Self {
        Self {
            adjust_warmth: true,
            adjust_formality: true,
        }
    }
}

impl RelationshipProsodyTransform {
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply relationship-based prosody
    pub fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        let stage = ctx.relationship_stage.unwrap_or(0.3);

        // Determine adjustments based on relationship stage
        let prosody = self.calculate_prosody(stage, ctx);

        // Only apply if there are meaningful adjustments
        if prosody.pitch.is_some() || prosody.rate.is_some() || prosody.range.is_some() {
            let elements = std::mem::take(&mut doc.elements);
            doc.elements = vec![SsmlElement::Prosody {
                rate: prosody.rate,
                pitch: prosody.pitch,
                volume: prosody.volume,
                contour: prosody.contour,
                range: prosody.range,
                duration: prosody.duration,
                children: elements,
            }];
        }

        Ok(())
    }

    fn calculate_prosody(&self, stage: f32, ctx: &SuperhumanContext) -> Prosody {
        let mut prosody = Prosody::default();

        // Warmth increases with relationship stage
        // Expressed through pitch variance (range)
        if self.adjust_warmth {
            let warmth = self.calculate_warmth(stage);
            if warmth > 0.0 {
                prosody.range = Some(format!("+{}%", (warmth * 15.0) as i8));
            }
        }

        // Formality decreases with relationship stage
        // Expressed through slightly faster, more casual rate
        if self.adjust_formality {
            let formality = self.calculate_formality(stage);
            if (formality - 1.0).abs() > 0.02 {
                prosody.rate = Some(format!("{}%", (formality * 100.0) as i32));
            }
        }

        // Close relationships get slightly softer volume (more intimate)
        if stage >= CLOSE {
            prosody.volume = Some("-1dB".to_string());
        }

        // Long-term relationships get subtle pitch adjustment
        if let Some(days) = ctx.relationship_days {
            if days > 90 && stage >= FRIENDLY {
                // Slight pitch down = familiarity
                prosody.pitch = Some("-0.5st".to_string());
            }
        }

        prosody
    }

    fn calculate_warmth(&self, stage: f32) -> f32 {
        // Warmth curve: starts low, increases through friendly, peaks at close
        if stage < ACQUAINTANCE {
            0.0
        } else if stage < FAMILIAR {
            (stage - ACQUAINTANCE) / (FAMILIAR - ACQUAINTANCE) * 0.3
        } else if stage < FRIENDLY {
            0.3 + (stage - FAMILIAR) / (FRIENDLY - FAMILIAR) * 0.3
        } else if stage < CLOSE {
            0.6 + (stage - FRIENDLY) / (CLOSE - FRIENDLY) * 0.3
        } else {
            0.9 + (stage - CLOSE) / (INTIMATE - CLOSE) * 0.1
        }
    }

    fn calculate_formality(&self, stage: f32) -> f32 {
        // Formality curve: formal with strangers, casual with close friends
        // Returns rate multiplier (1.0 = normal, >1.0 = faster/more casual)
        if stage < ACQUAINTANCE {
            0.97 // Slightly slower, more careful
        } else if stage < FAMILIAR {
            0.98
        } else if stage < FRIENDLY {
            1.0
        } else if stage < CLOSE {
            1.02 // Slightly more casual
        } else {
            1.03 // Quite casual
        }
    }

    /// Get stage name for logging/debugging
    pub fn stage_name(stage: f32) -> &'static str {
        if stage < ACQUAINTANCE {
            "stranger"
        } else if stage < FAMILIAR {
            "acquaintance"
        } else if stage < FRIENDLY {
            "familiar"
        } else if stage < CLOSE {
            "friendly"
        } else if stage < INTIMATE {
            "close"
        } else {
            "intimate"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssml::parse;

    #[test]
    fn test_warmth_increases_with_stage() {
        let transform = RelationshipProsodyTransform::new();

        let warmth_stranger = transform.calculate_warmth(0.1);
        let warmth_close = transform.calculate_warmth(0.85);

        assert!(warmth_close > warmth_stranger, "Close relationships should be warmer");
    }

    #[test]
    fn test_formality_decreases_with_stage() {
        let transform = RelationshipProsodyTransform::new();

        let formality_stranger = transform.calculate_formality(0.1);
        let formality_close = transform.calculate_formality(0.85);

        assert!(formality_stranger < formality_close, "Strangers should be more formal (slower)");
    }

    #[test]
    fn test_stage_names() {
        assert_eq!(RelationshipProsodyTransform::stage_name(0.1), "stranger");
        assert_eq!(RelationshipProsodyTransform::stage_name(0.5), "familiar");
        assert_eq!(RelationshipProsodyTransform::stage_name(0.85), "close");
    }

    #[test]
    fn test_close_relationship_prosody() {
        let transform = RelationshipProsodyTransform::new();
        let ctx = SuperhumanContext::new()
            .with_relationship_stage(0.85);

        let mut doc = parse("<speak>Hey, how are you doing?</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have prosody wrapper
        let has_prosody = doc.elements.iter().any(|e| matches!(e, SsmlElement::Prosody { .. }));
        assert!(has_prosody, "Close relationship should add prosody");
    }
}
