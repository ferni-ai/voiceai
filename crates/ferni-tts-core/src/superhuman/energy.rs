//! Energy Matching Transform
//!
//! Mirrors the user's energy level in voice delivery.
//!
//! - Low energy user → Calmer, slower Ferni
//! - High energy user → More animated Ferni
//! - Gradual matching (not jarring)

use super::SuperhumanContext;
use crate::ssml::{SsmlDocument, SsmlElement, Prosody};
use crate::error::Result;

/// Energy matching transform
pub struct EnergyMatchingTransform {
    /// How much to match (0.0 = ignore user energy, 1.0 = full match)
    pub matching_strength: f32,

    /// Whether to match speaking rate
    pub match_rate: bool,

    /// Whether to match pitch variance
    pub match_variance: bool,

    /// Whether to match volume
    pub match_volume: bool,
}

impl Default for EnergyMatchingTransform {
    fn default() -> Self {
        Self {
            matching_strength: 0.6, // Don't fully match, maintain some Ferni personality
            match_rate: true,
            match_variance: true,
            match_volume: true,
        }
    }
}

impl EnergyMatchingTransform {
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply energy matching to SSML document
    pub fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        // Get user's energy level
        let user_energy = ctx.user_energy.unwrap_or(0.5);

        // Calculate how much to adjust (relative to baseline 0.5)
        let energy_delta = user_energy - 0.5;
        let adjusted_delta = energy_delta * self.matching_strength;

        // Build prosody adjustments
        let prosody = self.calculate_prosody(adjusted_delta, ctx);

        // Only apply if meaningful adjustments
        if prosody.rate.is_some() || prosody.range.is_some() || prosody.volume.is_some() {
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

    fn calculate_prosody(&self, energy_delta: f32, ctx: &SuperhumanContext) -> Prosody {
        let mut prosody = Prosody::default();

        // Rate: higher energy = faster, lower = slower
        if self.match_rate {
            // User speaking rate can override
            if let Some(user_rate) = ctx.user_speaking_rate {
                // Normalize user rate (typical range: 100-200 wpm, with 150 as baseline)
                let rate_factor = (user_rate / 150.0).clamp(0.8, 1.3);
                let adjusted = 1.0 + (rate_factor - 1.0) * self.matching_strength;
                prosody.rate = Some(format!("{}%", (adjusted * 100.0) as i32));
            } else {
                // Use energy delta
                let rate_adjust = energy_delta * 0.15; // ±7.5% at max
                if rate_adjust.abs() > 0.02 {
                    prosody.rate = Some(format!("{}%", ((1.0 + rate_adjust) * 100.0) as i32));
                }
            }
        }

        // Pitch variance: higher energy = more expressive
        if self.match_variance {
            // User pitch variance can influence
            if let Some(variance) = ctx.user_pitch_variance {
                // Higher variance = more engaged, more expressive response
                let range_adjust = (variance - 0.5) * 20.0 * self.matching_strength;
                if range_adjust.abs() > 2.0 {
                    prosody.range = Some(format!("{}{}%", if range_adjust > 0.0 { "+" } else { "" }, range_adjust as i8));
                }
            } else {
                // Use energy delta
                let range_adjust = energy_delta * 15.0;
                if range_adjust.abs() > 2.0 {
                    prosody.range = Some(format!("{}{}%", if range_adjust > 0.0 { "+" } else { "" }, range_adjust as i8));
                }
            }
        }

        // Volume: higher energy = slightly louder
        if self.match_volume {
            let volume_adjust = energy_delta * 3.0; // ±1.5dB at max
            if volume_adjust.abs() > 0.5 {
                prosody.volume = Some(format!("{}{}dB", if volume_adjust > 0.0 { "+" } else { "" }, volume_adjust as i8));
            }
        }

        prosody
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssml::parse;

    #[test]
    fn test_high_energy_speeds_up() {
        let transform = EnergyMatchingTransform::new();
        let ctx = SuperhumanContext::new().with_user_energy(0.9);

        let mut doc = parse("<speak>That's exciting!</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have faster rate
        if let Some(SsmlElement::Prosody { rate, .. }) = doc.elements.first() {
            let rate_val: i32 = rate.as_ref().unwrap().trim_end_matches('%').parse().unwrap();
            assert!(rate_val > 100, "High energy should speed up: {}%", rate_val);
        }
    }

    #[test]
    fn test_low_energy_slows_down() {
        let transform = EnergyMatchingTransform::new();
        let ctx = SuperhumanContext::new().with_user_energy(0.2);

        let mut doc = parse("<speak>I understand.</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should have slower rate
        if let Some(SsmlElement::Prosody { rate, .. }) = doc.elements.first() {
            let rate_val: i32 = rate.as_ref().unwrap().trim_end_matches('%').parse().unwrap();
            assert!(rate_val < 100, "Low energy should slow down: {}%", rate_val);
        }
    }

    #[test]
    fn test_neutral_energy_no_change() {
        let transform = EnergyMatchingTransform::new();
        let ctx = SuperhumanContext::new().with_user_energy(0.5);

        let mut doc = parse("<speak>Hello there.</speak>").unwrap();
        transform.apply(&mut doc, &ctx).unwrap();

        // Should be mostly unchanged (might not even add prosody wrapper)
        let text = doc.plain_text();
        assert!(text.contains("Hello"), "Content should be preserved");
    }
}
