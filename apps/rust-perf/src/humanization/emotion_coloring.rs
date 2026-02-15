//! Emotion Coloring — Subtle formant shifts via simple IIR EQ.
//!
//! Applies spectral modifications to convey emotion:
//! - Warmth: boost low frequencies (100-300Hz) by 2-3dB
//! - Brightness: boost 2-4kHz by 1-2dB for cheerful/excited
//! - Compression: reduce dynamic range for concerned/gentle

/// Single-pole low-pass IIR filter (for bass boost extraction).
struct LowPassFilter {
    alpha: f32,
    prev: f32,
}

impl LowPassFilter {
    fn new(cutoff_hz: f32, sample_rate: u32) -> Self {
        let rc = 1.0 / (2.0 * std::f32::consts::PI * cutoff_hz);
        let dt = 1.0 / sample_rate as f32;
        Self {
            alpha: dt / (rc + dt),
            prev: 0.0,
        }
    }

    fn process(&mut self, sample: f32) -> f32 {
        self.prev += self.alpha * (sample - self.prev);
        self.prev
    }
}

/// Single-pole high-pass IIR filter (for brightness extraction).
struct HighPassFilter {
    alpha: f32,
    prev_in: f32,
    prev_out: f32,
}

impl HighPassFilter {
    fn new(cutoff_hz: f32, sample_rate: u32) -> Self {
        let rc = 1.0 / (2.0 * std::f32::consts::PI * cutoff_hz);
        let dt = 1.0 / sample_rate as f32;
        Self {
            alpha: rc / (rc + dt),
            prev_in: 0.0,
            prev_out: 0.0,
        }
    }

    fn process(&mut self, sample: f32) -> f32 {
        let out = self.alpha * (self.prev_out + sample - self.prev_in);
        self.prev_in = sample;
        self.prev_out = out;
        out
    }
}

/// Convert dB gain to linear multiplier.
fn db_to_linear(db: f32) -> f32 {
    10.0f32.powf(db / 20.0)
}

/// Boost low frequencies (warmth). Extracts bass via LPF, boosts, and mixes back.
fn apply_warmth(samples: &mut [f32], sample_rate: u32, boost_db: f32) {
    if boost_db.abs() < 0.1 {
        return;
    }
    let gain = db_to_linear(boost_db) - 1.0; // Extra gain to add
    let mut lpf = LowPassFilter::new(300.0, sample_rate);

    for sample in samples.iter_mut() {
        let bass = lpf.process(*sample);
        *sample += bass * gain;
    }
}

/// Boost high frequencies (brightness). Extracts treble via HPF, boosts, and mixes back.
fn apply_brightness(samples: &mut [f32], sample_rate: u32, boost_db: f32) {
    if boost_db.abs() < 0.1 {
        return;
    }
    let gain = db_to_linear(boost_db) - 1.0;
    let mut hpf = HighPassFilter::new(2000.0, sample_rate);

    for sample in samples.iter_mut() {
        let treble = hpf.process(*sample);
        *sample += treble * gain;
    }
}

/// Soft dynamic range compression (soft knee limiter).
///
/// Reduces peaks above threshold using a smooth curve.
fn apply_compression(samples: &mut [f32], threshold: f32, ratio: f32) {
    if ratio <= 1.0 {
        return;
    }
    for sample in samples.iter_mut() {
        let abs_val = sample.abs();
        if abs_val > threshold {
            let excess = abs_val - threshold;
            let compressed = threshold + excess / ratio;
            *sample = compressed * sample.signum();
        }
    }
}

/// Apply emotion-based spectral coloring to audio samples in-place.
pub fn apply_emotion_color(
    samples: &mut [f32],
    sample_rate: u32,
    emotion: &str,
    intensity: f32,
) {
    let intensity = intensity.clamp(0.0, 1.0);

    match emotion {
        "warm" | "gentle" => {
            // Boost warmth (low frequencies)
            apply_warmth(samples, sample_rate, 2.5 * intensity);
            // Gentle compression for smoother delivery
            apply_compression(samples, 0.5, 1.0 + 1.5 * intensity);
        }
        "excited" | "cheerful" => {
            // Boost brightness (high frequencies)
            apply_brightness(samples, sample_rate, 1.5 * intensity);
            // Slight warmth too
            apply_warmth(samples, sample_rate, 1.0 * intensity);
        }
        "concerned" => {
            // Moderate warmth + more compression (softer, more controlled)
            apply_warmth(samples, sample_rate, 2.0 * intensity);
            apply_compression(samples, 0.4, 1.0 + 2.0 * intensity);
        }
        "sad" => {
            // Warmth boost, no brightness
            apply_warmth(samples, sample_rate, 3.0 * intensity);
            apply_compression(samples, 0.4, 1.0 + 1.0 * intensity);
        }
        "contemplative" => {
            // Subtle warmth
            apply_warmth(samples, sample_rate, 1.5 * intensity);
        }
        _ => {
            // Neutral: minimal coloring
            apply_warmth(samples, sample_rate, 0.5 * intensity);
        }
    }

    // Clamp to valid range after processing
    for sample in samples.iter_mut() {
        *sample = sample.clamp(-1.0, 1.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sine(sample_rate: u32, freq: f32, duration_s: f32) -> Vec<f32> {
        let n = (sample_rate as f32 * duration_s) as usize;
        (0..n)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                0.5 * (freq * 2.0 * std::f32::consts::PI * t).sin()
            })
            .collect()
    }

    #[test]
    fn test_warmth_boost_adds_bass() {
        let mut samples = make_sine(24000, 200.0, 0.5);
        let energy_before: f32 = samples.iter().map(|s| s * s).sum::<f32>();
        apply_warmth(&mut samples, 24000, 3.0);
        let energy_after: f32 = samples.iter().map(|s| s * s).sum::<f32>();
        assert!(
            energy_after > energy_before,
            "Warmth boost should increase energy of low-frequency signal"
        );
    }

    #[test]
    fn test_brightness_boost_on_high_freq() {
        let mut samples = make_sine(24000, 3000.0, 0.5);
        let energy_before: f32 = samples.iter().map(|s| s * s).sum::<f32>();
        apply_brightness(&mut samples, 24000, 2.0);
        let energy_after: f32 = samples.iter().map(|s| s * s).sum::<f32>();
        assert!(
            energy_after > energy_before,
            "Brightness boost should increase energy of high-frequency signal"
        );
    }

    #[test]
    fn test_compression_reduces_peaks() {
        let mut samples = vec![0.1, 0.3, 0.8, -0.9, 0.2, -0.7];
        apply_compression(&mut samples, 0.5, 3.0);
        for s in &samples {
            assert!(s.abs() < 0.9, "Compression should reduce peaks");
        }
    }

    #[test]
    fn test_emotion_color_values_in_range() {
        for emotion in &["warm", "excited", "concerned", "sad", "neutral", "cheerful"] {
            let mut samples = make_sine(24000, 300.0, 0.5);
            apply_emotion_color(&mut samples, 24000, emotion, 1.0);
            for s in &samples {
                assert!(
                    *s >= -1.0 && *s <= 1.0,
                    "Sample out of range for emotion '{}': {}",
                    emotion,
                    s
                );
            }
        }
    }

    #[test]
    fn test_zero_intensity_is_near_identity() {
        let original = make_sine(24000, 300.0, 0.5);
        let mut samples = original.clone();
        apply_emotion_color(&mut samples, 24000, "warm", 0.0);
        // With zero intensity, output should be very close to input
        let max_diff: f32 = original
            .iter()
            .zip(samples.iter())
            .map(|(a, b)| (a - b).abs())
            .fold(0.0, f32::max);
        assert!(max_diff < 0.01, "Zero intensity should be near identity");
    }
}
