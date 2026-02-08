//! Circadian Tempo Transform
//!
//! Adapts speaking speed to user's time of day.
//!
//! - Late night (10pm-5am): Slower, gentler tempo
//! - Morning (6am-9am): Gradually warming up
//! - Midday (10am-2pm): Normal speed
//! - Afternoon (3pm-6pm): Normal speed
//! - Evening (7pm-9pm): Beginning to slow

use super::{SuperhumanContext, MemoryEntity};
use crate::ssml::{SsmlDocument, SsmlElement, Prosody};
use crate::error::Result;

/// Calculate tempo multiplier based on circadian context
///
/// Returns a value between 0.85 (slow) and 1.1 (fast)
pub fn calculate_tempo_multiplier(ctx: &SuperhumanContext) -> f32 {
    let hour = ctx.user_local_hour.unwrap_or(12);

    // Base tempo from hour
    let base_tempo = match hour {
        0..=5 => 0.85,    // Deep night: slowest
        6..=7 => 0.90,    // Early morning: waking up
        8..=9 => 0.95,    // Morning: warming up
        10..=14 => 1.0,   // Midday: normal
        15..=18 => 1.0,   // Afternoon: normal
        19..=20 => 0.97,  // Evening: winding down
        21 => 0.93,       // Late evening: slower
        22..=23 => 0.88,  // Night: slow
        _ => 1.0,
    };

    // Adjust for user tiredness
    let tiredness_adjust = if ctx.user_tired.unwrap_or(false) {
        -0.05 // Slow down if user seems tired
    } else {
        0.0
    };

    // Adjust for user energy (if detected)
    let energy_adjust = ctx.user_energy.map_or(0.0, |e| {
        // If user is low energy, slow down; high energy, speed up slightly
        (e - 0.5) * 0.1 // -0.05 to +0.05
    });

    (base_tempo + tiredness_adjust + energy_adjust).clamp(0.75, 1.15)
}

/// Circadian tempo transform
pub struct CircadianTransform;

impl CircadianTransform {
    pub fn new() -> Self {
        Self
    }

    /// Apply circadian tempo adjustment to SSML document
    pub fn apply(&self, doc: &mut SsmlDocument, ctx: &SuperhumanContext) -> Result<()> {
        let tempo = calculate_tempo_multiplier(ctx);

        // Only apply if significantly different from 1.0
        if (tempo - 1.0).abs() > 0.03 {
            let rate = format!("{}%", (tempo * 100.0) as i32);
            doc.apply_prosody(&Prosody {
                rate: Some(rate),
                ..Default::default()
            });
        }

        // For late night, also slightly lower pitch for gentler tone
        if ctx.is_late_night() {
            self.apply_late_night_gentleness(doc);
        }

        Ok(())
    }

    /// Apply late night gentleness (lower pitch, softer volume)
    fn apply_late_night_gentleness(&self, doc: &mut SsmlDocument) {
        // Wrap content in prosody with lower pitch and softer volume
        let elements = std::mem::take(&mut doc.elements);
        doc.elements = vec![SsmlElement::Prosody {
            rate: None,
            pitch: Some("-1st".to_string()), // Slightly lower pitch
            volume: Some("-2dB".to_string()), // Slightly softer
            contour: None,
            range: None,
            duration: None,
            children: elements,
        }];
    }
}

impl Default for CircadianTransform {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_late_night_tempo() {
        let ctx = SuperhumanContext::new().with_user_local_hour(2);
        let tempo = calculate_tempo_multiplier(&ctx);
        assert!(tempo < 0.90, "Late night should be slow: {}", tempo);
    }

    #[test]
    fn test_midday_tempo() {
        let ctx = SuperhumanContext::new().with_user_local_hour(12);
        let tempo = calculate_tempo_multiplier(&ctx);
        assert!((tempo - 1.0).abs() < 0.05, "Midday should be normal: {}", tempo);
    }

    #[test]
    fn test_tired_adjustment() {
        let mut ctx = SuperhumanContext::new().with_user_local_hour(12);
        ctx.user_tired = Some(true);
        let tempo = calculate_tempo_multiplier(&ctx);
        assert!(tempo < 1.0, "Tired user should get slower tempo: {}", tempo);
    }

    #[test]
    fn test_energy_adjustment() {
        let ctx = SuperhumanContext::new()
            .with_user_local_hour(12)
            .with_user_energy(0.9); // High energy
        let tempo = calculate_tempo_multiplier(&ctx);
        assert!(tempo > 1.0, "High energy should speed up: {}", tempo);
    }
}
