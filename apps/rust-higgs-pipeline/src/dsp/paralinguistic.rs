//! Paralinguistic Sounds — Non-speech vocalizations.
//!
//! Generates and injects 6 paralinguistic sounds into audio: throat clear,
//! sigh, chuckle, gasp, tongue click, and "hmm" thinking sound. Each is
//! synthesized as a small audio snippet and spliced into the audio stream
//! at phrase boundaries or prepended.

use std::f32::consts::PI;

/// Simple deterministic PRNG for reproducible sound generation.
fn simple_rng(seed: u64, index: u64) -> f32 {
    let h = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(index);
    let h = h ^ (h >> 33);
    ((h & 0x7FFFFFFF) as f32 / 0x7FFFFFFF as f32) * 2.0 - 1.0
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum ParalinguisticSound {
    None,
    ThroatClear,
    Sigh,
    Chuckle,
    Gasp,
    TongueClick,
    HmmThinking,
}

impl ParalinguisticSound {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "throat_clear" | "throatclear" => Self::ThroatClear,
            "sigh" => Self::Sigh,
            "chuckle" => Self::Chuckle,
            "gasp" => Self::Gasp,
            "tongue_click" | "tongueclick" | "click" => Self::TongueClick,
            "hmm_thinking" | "hmmthinking" | "hmm" | "thinking" => Self::HmmThinking,
            _ => Self::None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::ThroatClear => "throat_clear",
            Self::Sigh => "sigh",
            Self::Chuckle => "chuckle",
            Self::Gasp => "gasp",
            Self::TongueClick => "tongue_click",
            Self::HmmThinking => "hmm_thinking",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ParalinguisticResult {
    pub sound: ParalinguisticSound,
    pub samples_added: usize,
    pub insertion_point: usize,
}

/// Generate paralinguistic sound samples.
pub fn generate_sound(
    sound: ParalinguisticSound,
    sample_rate: u32,
    intensity: f32,
) -> Vec<f32> {
    let intensity = intensity.clamp(0.0, 1.0);

    match sound {
        ParalinguisticSound::None => Vec::new(),
        ParalinguisticSound::ThroatClear => generate_throat_clear(sample_rate, intensity),
        ParalinguisticSound::Sigh => generate_sigh(sample_rate, intensity),
        ParalinguisticSound::Chuckle => generate_chuckle(sample_rate, intensity),
        ParalinguisticSound::Gasp => generate_gasp(sample_rate, intensity),
        ParalinguisticSound::TongueClick => generate_tongue_click(sample_rate, intensity),
        ParalinguisticSound::HmmThinking => generate_hmm_thinking(sample_rate, intensity),
    }
}

/// Inject a paralinguistic sound at the beginning of audio (prepend).
pub fn inject_at_start(
    samples: &mut Vec<f32>,
    sound: ParalinguisticSound,
    sample_rate: u32,
    intensity: f32,
) -> ParalinguisticResult {
    let generated = generate_sound(sound, sample_rate, intensity);
    let samples_added = generated.len();

    // Prepend: splice at position 0
    samples.splice(0..0, generated);

    ParalinguisticResult {
        sound,
        samples_added,
        insertion_point: 0,
    }
}

/// Inject at first detected pause (silence > 100ms).
pub fn inject_at_pause(
    samples: &mut Vec<f32>,
    sound: ParalinguisticSound,
    sample_rate: u32,
    intensity: f32,
) -> ParalinguisticResult {
    let generated = generate_sound(sound, sample_rate, intensity);
    let samples_added = generated.len();

    // Find first pause (silence > 100ms)
    let min_silence = (sample_rate as f32 * 0.1) as usize; // 100ms
    let hop = (sample_rate as usize) / 100; // 10ms hops
    let window = hop * 2;

    let mut silence_start: Option<usize> = Option::None;
    let mut insertion_point = 0; // Default to start if no pause found

    let mut i = 0;
    while i + window <= samples.len() {
        let rms = (samples[i..i + window]
            .iter()
            .map(|s| s * s)
            .sum::<f32>()
            / window as f32)
            .sqrt();

        if rms < 0.02 {
            if silence_start.is_none() {
                silence_start = Some(i);
            }
        } else if let Some(start) = silence_start {
            let silence_len = i - start;
            if silence_len >= min_silence {
                insertion_point = start;
                break;
            }
            silence_start = None;
        }

        i += hop;
    }

    samples.splice(insertion_point..insertion_point, generated);

    ParalinguisticResult {
        sound,
        samples_added,
        insertion_point,
    }
}

// ── Sound Generators ─────────────────────────────────────────────────────

/// Throat clear: short noise burst (50ms) with resonant peak at 300-600Hz, then brief silence.
/// Total duration ~80ms.
fn generate_throat_clear(sample_rate: u32, intensity: f32) -> Vec<f32> {
    let total_duration = (0.08 * sample_rate as f32) as usize; // ~80ms
    let burst_duration = (0.05 * sample_rate as f32) as usize; // ~50ms noise burst
    let mut samples = Vec::with_capacity(total_duration);
    let seed = 42u64;

    for i in 0..total_duration {
        if i < burst_duration {
            let progress = i as f32 / burst_duration as f32;
            // Sharp attack, medium decay
            let env = if progress < 0.1 {
                progress / 0.1
            } else {
                (1.0 - progress).max(0.0).powf(1.5)
            };

            // Band-pass noise (300-600Hz resonant peak)
            let noise = simple_rng(seed, i as u64);
            let t = i as f32 / sample_rate as f32;
            let resonance = 0.5 * (450.0 * 2.0 * PI * t).sin(); // Center at ~450Hz

            let mixed = (noise * 0.4 + resonance * 0.6) * env * 0.06 * intensity;
            samples.push(mixed);
        } else {
            // Brief silence after burst
            samples.push(0.0);
        }
    }

    // Low-pass to soften
    simple_low_pass(&mut samples, sample_rate, 800.0);

    samples
}

/// Sigh: slow falling noise envelope, breathier than speech, pitch descending.
/// Duration ~400ms.
fn generate_sigh(sample_rate: u32, intensity: f32) -> Vec<f32> {
    let duration = (0.4 * sample_rate as f32) as usize;
    let mut samples = Vec::with_capacity(duration);
    let seed = 77u64;

    for i in 0..duration {
        let progress = i as f32 / duration as f32;
        let t = i as f32 / sample_rate as f32;

        // Falling amplitude envelope
        let env = (1.0 - progress).powf(0.8);

        // Breathy noise
        let noise = simple_rng(seed, i as u64) * 0.5;

        // Descending tonal component (~300Hz falling to ~150Hz)
        let freq = 300.0 - 150.0 * progress;
        let tone = 0.3 * (freq * 2.0 * PI * t).sin();

        let mixed = (noise + tone) * env * 0.04 * intensity;
        samples.push(mixed);
    }

    // Low-pass sweep effect (cutoff falls over time)
    simple_low_pass(&mut samples, sample_rate, 1200.0);

    samples
}

/// Chuckle: 2-3 rapid voiced pulses with rising then falling pitch.
/// Duration ~300ms.
fn generate_chuckle(sample_rate: u32, intensity: f32) -> Vec<f32> {
    let duration = (0.3 * sample_rate as f32) as usize;
    let mut samples = vec![0.0f32; duration];
    let num_pulses = 3;
    let pulse_spacing = duration / num_pulses;
    let pulse_duration = (pulse_spacing as f32 * 0.6) as usize;

    for p in 0..num_pulses {
        let pulse_start = p * pulse_spacing;
        let pitch_factor = match p {
            0 => 1.0,
            1 => 1.15, // Rising
            _ => 0.9,  // Falling
        };

        for j in 0..pulse_duration {
            let idx = pulse_start + j;
            if idx >= duration {
                break;
            }
            let progress = j as f32 / pulse_duration as f32;
            let t = j as f32 / sample_rate as f32;

            // Amplitude envelope per pulse
            let env = (PI * progress).sin();

            // Voiced pulse at ~150Hz (scaled by pitch factor)
            let freq = 150.0 * pitch_factor;
            let voiced = (freq * 2.0 * PI * t).sin();

            samples[idx] = voiced * env * 0.05 * intensity;
        }
    }

    samples
}

/// Gasp: sharp intake — fast volume rise of noise, brief.
/// Duration ~150ms.
fn generate_gasp(sample_rate: u32, intensity: f32) -> Vec<f32> {
    let duration = (0.15 * sample_rate as f32) as usize;
    let mut samples = Vec::with_capacity(duration);
    let seed = 99u64;

    // Fast attack (5ms), medium decay
    let attack_samples = (0.005 * sample_rate as f32) as usize;

    for i in 0..duration {
        let progress = i as f32 / duration as f32;
        let env = if i < attack_samples {
            i as f32 / attack_samples as f32 // Fast attack
        } else {
            (1.0 - progress).max(0.0).powf(0.5) // Medium decay
        };

        let noise = simple_rng(seed, i as u64);
        samples.push(noise * env * 0.05 * intensity);
    }

    // Slight high-pass to make it sound like an intake
    simple_high_pass(&mut samples, sample_rate, 200.0);

    samples
}

/// Tongue click: very short impulse (5ms) with resonant decay.
/// Duration ~30ms.
fn generate_tongue_click(sample_rate: u32, intensity: f32) -> Vec<f32> {
    let duration = (0.03 * sample_rate as f32) as usize;
    let mut samples = Vec::with_capacity(duration);

    for i in 0..duration {
        let t = i as f32 / sample_rate as f32;
        let progress = i as f32 / duration as f32;

        // Single impulse followed by damped resonant decay at ~2kHz
        let damping = (-progress * 8.0).exp(); // Fast decay
        let resonance = (2000.0 * 2.0 * PI * t).sin() * damping;

        // Initial click impulse in first sample
        let impulse = if i == 0 { 0.5 } else { 0.0 };

        samples.push((impulse + resonance * 0.3) * 0.1 * intensity);
    }

    samples
}

/// "Hmm" thinking sound: low frequency hum with slight pitch movement.
/// Duration ~500ms.
fn generate_hmm_thinking(sample_rate: u32, intensity: f32) -> Vec<f32> {
    let duration = (0.5 * sample_rate as f32) as usize;
    let mut samples = Vec::with_capacity(duration);

    for i in 0..duration {
        let t = i as f32 / sample_rate as f32;
        let progress = i as f32 / duration as f32;

        // Smooth envelope
        let env = if progress < 0.1 {
            progress / 0.1
        } else if progress > 0.85 {
            (1.0 - progress) / 0.15
        } else {
            1.0
        };

        // Base frequency with slight vibrato
        let vibrato = 3.0 * (5.0 * 2.0 * PI * t).sin(); // ~5Hz vibrato
        let freq = 120.0 + vibrato;

        // Fundamental + odd harmonics (nasal quality)
        let fundamental = (freq * 2.0 * PI * t).sin();
        let h3 = 0.4 * (freq * 3.0 * 2.0 * PI * t).sin();
        let h5 = 0.15 * (freq * 5.0 * 2.0 * PI * t).sin();

        let voiced = fundamental + h3 + h5;
        samples.push(voiced * env * 0.03 * intensity);
    }

    samples
}

// ── DSP Helpers ──────────────────────────────────────────────────────────

/// Simple single-pole low-pass filter.
fn simple_low_pass(samples: &mut [f32], sample_rate: u32, cutoff_hz: f32) {
    if samples.len() < 2 || cutoff_hz <= 0.0 {
        return;
    }
    let rc = 1.0 / (2.0 * PI * cutoff_hz);
    let dt = 1.0 / sample_rate as f32;
    let alpha = dt / (rc + dt);

    let mut prev = samples[0];
    for sample in samples.iter_mut().skip(1) {
        prev += alpha * (*sample - prev);
        *sample = prev;
    }
}

/// Simple high-pass filter (signal minus low-passed version).
fn simple_high_pass(samples: &mut [f32], sample_rate: u32, cutoff_hz: f32) {
    if samples.len() < 2 || cutoff_hz <= 0.0 {
        return;
    }
    let original = samples.to_vec();
    simple_low_pass(samples, sample_rate, cutoff_hz);
    for (s, o) in samples.iter_mut().zip(original.iter()) {
        *s = o - *s; // Original minus low-passed = high-passed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_speech_with_pause(sample_rate: u32) -> Vec<f32> {
        let mut samples = Vec::new();
        // 0.5s speech
        for i in 0..(sample_rate as usize / 2) {
            let t = i as f32 / sample_rate as f32;
            samples.push(0.3 * (250.0 * 2.0 * PI * t).sin());
        }
        // 0.2s silence (200ms > 100ms threshold)
        for _ in 0..(sample_rate as usize / 5) {
            samples.push(0.0);
        }
        // 0.5s speech
        for i in 0..(sample_rate as usize / 2) {
            let t = i as f32 / sample_rate as f32;
            samples.push(0.3 * (300.0 * 2.0 * PI * t).sin());
        }
        samples
    }

    #[test]
    fn test_throat_clear_generates() {
        let sound = generate_sound(ParalinguisticSound::ThroatClear, 24000, 0.8);
        assert!(!sound.is_empty(), "ThroatClear should generate audio");
        // ~80ms at 24kHz ≈ 1920 samples
        assert!(sound.len() > 1000 && sound.len() < 3000, "ThroatClear duration unexpected: {}", sound.len());
    }

    #[test]
    fn test_sigh_generates() {
        let sound = generate_sound(ParalinguisticSound::Sigh, 24000, 0.7);
        assert!(!sound.is_empty(), "Sigh should generate audio");
        // ~400ms at 24kHz ≈ 9600 samples
        assert!(sound.len() > 7000 && sound.len() < 12000, "Sigh duration unexpected: {}", sound.len());
    }

    #[test]
    fn test_chuckle_generates() {
        let sound = generate_sound(ParalinguisticSound::Chuckle, 24000, 0.6);
        assert!(!sound.is_empty(), "Chuckle should generate audio");
        // ~300ms at 24kHz ≈ 7200 samples
        assert!(sound.len() > 5000 && sound.len() < 9000, "Chuckle duration unexpected: {}", sound.len());
    }

    #[test]
    fn test_gasp_generates() {
        let sound = generate_sound(ParalinguisticSound::Gasp, 24000, 0.9);
        assert!(!sound.is_empty(), "Gasp should generate audio");
        // ~150ms at 24kHz ≈ 3600 samples
        assert!(sound.len() > 2500 && sound.len() < 5000, "Gasp duration unexpected: {}", sound.len());
    }

    #[test]
    fn test_tongue_click_generates() {
        let sound = generate_sound(ParalinguisticSound::TongueClick, 24000, 0.8);
        assert!(!sound.is_empty(), "TongueClick should generate audio");
        // ~30ms at 24kHz ≈ 720 samples
        assert!(sound.len() > 400 && sound.len() < 1200, "TongueClick duration unexpected: {}", sound.len());
    }

    #[test]
    fn test_hmm_thinking_generates() {
        let sound = generate_sound(ParalinguisticSound::HmmThinking, 24000, 0.7);
        assert!(!sound.is_empty(), "HmmThinking should generate audio");
        // ~500ms at 24kHz ≈ 12000 samples
        assert!(sound.len() > 9000 && sound.len() < 15000, "HmmThinking duration unexpected: {}", sound.len());
    }

    #[test]
    fn test_none_generates_empty() {
        let sound = generate_sound(ParalinguisticSound::None, 24000, 0.5);
        assert!(sound.is_empty(), "None should generate empty audio");
    }

    #[test]
    fn test_all_sounds_in_valid_range() {
        let sounds = [
            ParalinguisticSound::ThroatClear,
            ParalinguisticSound::Sigh,
            ParalinguisticSound::Chuckle,
            ParalinguisticSound::Gasp,
            ParalinguisticSound::TongueClick,
            ParalinguisticSound::HmmThinking,
        ];
        for sound in &sounds {
            let generated = generate_sound(*sound, 24000, 1.0);
            for s in &generated {
                assert!(
                    s.abs() <= 1.0,
                    "Sample out of range for {:?}: {}",
                    sound,
                    s
                );
            }
        }
    }

    #[test]
    fn test_inject_at_start_increases_length() {
        let mut samples = vec![0.5f32; 24000]; // 1s of audio
        let original_len = samples.len();
        let result = inject_at_start(
            &mut samples,
            ParalinguisticSound::ThroatClear,
            24000,
            0.7,
        );
        assert!(samples.len() > original_len, "inject_at_start should add samples");
        assert_eq!(result.insertion_point, 0);
        assert!(result.samples_added > 0);
    }

    #[test]
    fn test_inject_at_pause_finds_silence() {
        let mut samples = make_speech_with_pause(24000);
        let original_len = samples.len();
        let result = inject_at_pause(
            &mut samples,
            ParalinguisticSound::Sigh,
            24000,
            0.6,
        );
        assert!(samples.len() > original_len, "inject_at_pause should add samples");
        assert!(result.samples_added > 0);
        // Insertion point should be roughly where the silence starts (~12000 samples in)
        assert!(
            result.insertion_point > 5000,
            "Should find pause in middle, not at start: {}",
            result.insertion_point
        );
    }

    #[test]
    fn test_from_str_round_trips() {
        let cases = [
            ("throat_clear", ParalinguisticSound::ThroatClear),
            ("sigh", ParalinguisticSound::Sigh),
            ("chuckle", ParalinguisticSound::Chuckle),
            ("gasp", ParalinguisticSound::Gasp),
            ("tongue_click", ParalinguisticSound::TongueClick),
            ("hmm_thinking", ParalinguisticSound::HmmThinking),
            ("hmm", ParalinguisticSound::HmmThinking),
            ("none", ParalinguisticSound::None),
            ("unknown", ParalinguisticSound::None),
        ];
        for (input, expected) in &cases {
            let parsed = ParalinguisticSound::from_str(input);
            assert_eq!(parsed, *expected, "from_str('{}') failed", input);
        }
    }

    #[test]
    fn test_inject_at_start_with_empty_audio() {
        let mut samples = Vec::new();
        let result = inject_at_start(
            &mut samples,
            ParalinguisticSound::TongueClick,
            24000,
            0.5,
        );
        assert!(result.samples_added > 0);
        assert_eq!(samples.len(), result.samples_added);
    }
}
