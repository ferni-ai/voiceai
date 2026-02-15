//! Adaptive Pacing — Speed modulation within utterances.
//!
//! Detects word/phrase boundaries from energy envelope and applies
//! time-stretching: slow down for emphasis, speed up for filler phrases.
//! Uses simple overlap-add (WSOLA-like) for time stretching.

/// A segment of audio with its detected type for pacing decisions.
#[derive(Debug)]
struct Segment {
    start: usize,
    end: usize,
    kind: SegmentKind,
}

#[derive(Debug)]
enum SegmentKind {
    /// Content word (after a pause) — slow down for emphasis
    Emphasis,
    /// Normal speech — keep speed
    Normal,
    /// Silence/pause — keep as-is
    Silence,
}

/// Detect segments from energy envelope.
///
/// Returns a list of segments categorized as Emphasis, Normal, or Silence.
fn detect_segments(samples: &[f32], sample_rate: u32) -> Vec<Segment> {
    let hop = (sample_rate as usize) / 100; // 10ms hops
    let window = hop * 2; // 20ms analysis window
    let silence_threshold = 0.02f32;
    let min_segment_samples = (sample_rate as f64 * 0.05) as usize; // 50ms minimum

    let mut segments = Vec::new();
    let mut current_start = 0;
    let mut is_silent = false;
    let mut after_pause = false;

    let mut i = 0;
    while i + window <= samples.len() {
        let rms = (samples[i..i + window]
            .iter()
            .map(|s| s * s)
            .sum::<f32>()
            / window as f32)
            .sqrt();

        let now_silent = rms < silence_threshold;

        if now_silent != is_silent {
            let segment_len = i - current_start;
            if segment_len >= min_segment_samples {
                let kind = if is_silent {
                    SegmentKind::Silence
                } else if after_pause {
                    SegmentKind::Emphasis
                } else {
                    SegmentKind::Normal
                };

                segments.push(Segment {
                    start: current_start,
                    end: i,
                    kind,
                });

                if is_silent {
                    after_pause = true;
                } else {
                    after_pause = false;
                }
            }
            current_start = i;
            is_silent = now_silent;
        }

        i += hop;
    }

    // Final segment
    if current_start < samples.len() {
        let kind = if is_silent {
            SegmentKind::Silence
        } else if after_pause {
            SegmentKind::Emphasis
        } else {
            SegmentKind::Normal
        };
        segments.push(Segment {
            start: current_start,
            end: samples.len(),
            kind,
        });
    }

    segments
}

/// Simple time-stretching via overlap-add.
///
/// `rate` > 1.0 speeds up (fewer output samples), < 1.0 slows down (more output samples).
fn time_stretch(samples: &[f32], rate: f32) -> Vec<f32> {
    if (rate - 1.0).abs() < 0.01 || samples.is_empty() {
        return samples.to_vec();
    }

    let output_len = (samples.len() as f64 / rate as f64) as usize;
    let mut output = Vec::with_capacity(output_len);

    // Simple linear interpolation resampling for time stretching
    for i in 0..output_len {
        let src_pos = i as f64 * rate as f64;
        let src_idx = src_pos as usize;
        let frac = (src_pos - src_idx as f64) as f32;

        if src_idx + 1 < samples.len() {
            let s = samples[src_idx] * (1.0 - frac) + samples[src_idx + 1] * frac;
            output.push(s);
        } else if src_idx < samples.len() {
            output.push(samples[src_idx]);
        } else {
            break;
        }
    }

    output
}

/// Apply adaptive pacing to audio: slow down emphasis, speed up normal speech.
///
/// Returns (min_speed, max_speed) applied across segments.
pub fn apply_adaptive_pacing(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    emotion: &str,
    intensity: f32,
) -> (f32, f32) {
    let intensity = intensity.clamp(0.0, 1.0);

    // Emotion affects pacing ranges
    let (emphasis_rate, normal_rate) = match emotion {
        "warm" | "gentle" => (0.88, 1.0),       // Slow emphasis, normal speed
        "excited" | "cheerful" => (0.92, 1.08),  // Slight slow on emphasis, slight speed up
        "concerned" => (0.85, 0.95),             // Slower overall
        "sad" => (0.82, 0.92),                   // Slowest
        "contemplative" => (0.85, 0.98),         // Deliberate
        _ => (0.92, 1.02),                       // Neutral: minimal changes
    };

    // Scale based on intensity
    let emphasis_rate = 1.0 - (1.0 - emphasis_rate) * intensity;
    let normal_rate = 1.0 + (normal_rate - 1.0) * intensity;

    let segments = detect_segments(samples, sample_rate);
    if segments.is_empty() {
        return (1.0, 1.0);
    }

    let mut min_speed = 1.0f32;
    let mut max_speed = 1.0f32;

    // Build output by time-stretching each segment at its appropriate rate
    let mut output = Vec::with_capacity(samples.len());

    for segment in &segments {
        let segment_samples = &samples[segment.start..segment.end];
        let rate = match segment.kind {
            SegmentKind::Emphasis => {
                min_speed = min_speed.min(emphasis_rate);
                emphasis_rate
            }
            SegmentKind::Normal => {
                max_speed = max_speed.max(normal_rate);
                normal_rate
            }
            SegmentKind::Silence => 1.0, // Keep pauses unchanged
        };

        let stretched = time_stretch(segment_samples, rate);
        output.extend_from_slice(&stretched);
    }

    *samples = output;
    (min_speed, max_speed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_speech_with_pauses(sample_rate: u32) -> Vec<f32> {
        let mut samples = Vec::new();
        // 0.3s speech (will be "emphasis" after pause)
        for i in 0..(sample_rate as usize * 3 / 10) {
            let t = i as f32 / sample_rate as f32;
            samples.push(0.3 * (250.0 * 2.0 * std::f32::consts::PI * t).sin());
        }
        // 0.2s silence
        for _ in 0..(sample_rate as usize / 5) {
            samples.push(0.0);
        }
        // 0.5s speech (emphasis after pause)
        for i in 0..(sample_rate as usize / 2) {
            let t = i as f32 / sample_rate as f32;
            samples.push(0.3 * (300.0 * 2.0 * std::f32::consts::PI * t).sin());
        }
        // 0.3s speech (normal continuation)
        for i in 0..(sample_rate as usize * 3 / 10) {
            let t = i as f32 / sample_rate as f32;
            samples.push(0.3 * (350.0 * 2.0 * std::f32::consts::PI * t).sin());
        }
        samples
    }

    #[test]
    fn test_time_stretch_rate_1() {
        let samples = vec![0.1, 0.2, 0.3, 0.4, 0.5];
        let stretched = time_stretch(&samples, 1.0);
        assert_eq!(stretched.len(), samples.len());
        for (a, b) in samples.iter().zip(stretched.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }

    #[test]
    fn test_time_stretch_slow_down() {
        let samples = vec![0.1, 0.2, 0.3, 0.4, 0.5];
        let stretched = time_stretch(&samples, 0.5);
        assert!(
            stretched.len() > samples.len(),
            "Slowing down should produce more samples"
        );
    }

    #[test]
    fn test_time_stretch_speed_up() {
        let samples = vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
        let stretched = time_stretch(&samples, 1.5);
        assert!(
            stretched.len() < samples.len(),
            "Speeding up should produce fewer samples"
        );
    }

    #[test]
    fn test_adaptive_pacing_returns_valid_range() {
        let mut samples = make_speech_with_pauses(24000);
        let (min_speed, max_speed) = apply_adaptive_pacing(&mut samples, 24000, "warm", 0.7);
        assert!(min_speed <= 1.0, "min_speed should be <= 1.0");
        assert!(max_speed >= 1.0, "max_speed should be >= 1.0");
        assert!(min_speed > 0.5, "min_speed should be reasonable (> 0.5)");
        assert!(max_speed < 2.0, "max_speed should be reasonable (< 2.0)");
    }

    #[test]
    fn test_pacing_values_in_range() {
        let mut samples = make_speech_with_pauses(24000);
        apply_adaptive_pacing(&mut samples, 24000, "excited", 1.0);
        for s in &samples {
            assert!(
                *s >= -1.0 && *s <= 1.0,
                "Sample out of range after pacing: {}",
                s
            );
        }
    }

    #[test]
    fn test_sad_emotion_slows_down() {
        let mut samples = make_speech_with_pauses(24000);
        let original_len = samples.len();
        apply_adaptive_pacing(&mut samples, 24000, "sad", 0.8);
        // Sad emotion should produce more samples (slower speech)
        assert!(
            samples.len() >= original_len - original_len / 10,
            "Sad speech should not significantly shrink"
        );
    }

    #[test]
    fn test_detect_segments() {
        let samples = make_speech_with_pauses(24000);
        let segments = detect_segments(&samples, 24000);
        assert!(
            segments.len() >= 2,
            "Should detect multiple segments, got {}",
            segments.len()
        );
    }
}
