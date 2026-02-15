//! Voice Biomarker Extraction
//!
//! Real-time extraction of emotional signals from 16kHz mono PCM audio.
//! Pure DSP — no external signal processing crates needed.
//!
//! Biomarkers extracted:
//! - **Pitch (F0)**: Fundamental frequency via autocorrelation
//! - **Energy**: RMS energy normalized 0.0–1.0
//! - **Jitter**: Pitch period variation (anxiety indicator)
//! - **Shimmer**: Amplitude variation (suppressed emotion)
//! - **Breathiness**: Harmonic-to-noise ratio approximation
//! - **Speech rate**: Estimated syllables per second
//! - **Breath pauses**: Regions of energy dip >200ms

use serde::{Deserialize, Serialize};

/// Voice biomarker results from audio analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceBiomarkers {
    /// Fundamental frequency in Hz (via autocorrelation). 0 if no pitch detected.
    pub pitch_hz: f32,
    /// RMS energy normalized 0.0–1.0.
    pub energy: f32,
    /// Pitch period variation 0.0–1.0 (higher = more anxious).
    pub jitter: f32,
    /// Peak amplitude variation 0.0–1.0 (higher = more suppressed emotion).
    pub shimmer: f32,
    /// Harmonic-to-noise ratio approximation 0.0–1.0 (higher = breathier).
    pub breathiness: f32,
    /// Estimated syllables per second.
    pub speech_rate: f32,
    /// Whether voice activity was detected.
    pub is_speech: bool,
}

/// A detected breath pause (energy dip >200ms).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreathPause {
    /// Start sample index in the input buffer.
    pub start_sample: usize,
    /// End sample index in the input buffer.
    pub end_sample: usize,
    /// Duration in milliseconds.
    pub duration_ms: f32,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Frame size for analysis: 30ms at 16kHz = 480 samples.
const FRAME_SIZE: usize = 480;
/// Hop size: 10ms at 16kHz = 160 samples.
const HOP_SIZE: usize = 160;
/// RMS threshold to consider a frame voiced.
const SPEECH_ENERGY_THRESHOLD: f32 = 0.01;
/// Reference level for normalizing energy (full-scale PCM).
const ENERGY_REFERENCE: f32 = 0.5;
/// Minimum breath pause duration in samples at 16kHz (200ms = 3200).
const MIN_BREATH_PAUSE_SAMPLES: usize = 3200;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Analyze voice biomarkers from a chunk of 16kHz mono f32 PCM audio.
pub fn analyze_biomarkers(samples: &[f32], sample_rate: u32) -> VoiceBiomarkers {
    if samples.is_empty() {
        return VoiceBiomarkers {
            pitch_hz: 0.0,
            energy: 0.0,
            jitter: 0.0,
            shimmer: 0.0,
            breathiness: 0.0,
            speech_rate: 0.0,
            is_speech: false,
        };
    }

    let energy = compute_rms(samples).min(1.0);
    let normalized_energy = (energy / ENERGY_REFERENCE).min(1.0);

    let is_speech = energy > SPEECH_ENERGY_THRESHOLD;

    if !is_speech {
        return VoiceBiomarkers {
            pitch_hz: 0.0,
            energy: normalized_energy,
            jitter: 0.0,
            shimmer: 0.0,
            breathiness: 0.0,
            speech_rate: 0.0,
            is_speech: false,
        };
    }

    // Extract per-frame pitch periods and peak amplitudes
    let (pitch_periods, peak_amplitudes) = extract_frame_features(samples, sample_rate);

    let pitch_hz = if pitch_periods.is_empty() {
        0.0
    } else {
        // Median pitch for robustness against outliers
        let mut sorted = pitch_periods.iter().map(|&p| sample_rate as f32 / p).collect::<Vec<_>>();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        sorted[sorted.len() / 2]
    };

    let jitter = compute_jitter(&pitch_periods);
    let shimmer = compute_shimmer(&peak_amplitudes);
    let breathiness = compute_breathiness(samples, sample_rate, &pitch_periods);
    let speech_rate = compute_speech_rate(samples, sample_rate);

    VoiceBiomarkers {
        pitch_hz,
        energy: normalized_energy,
        jitter,
        shimmer,
        breathiness,
        speech_rate,
        is_speech,
    }
}

/// Detect breath pauses (energy dips below threshold for >200ms).
pub fn detect_breath_pauses(samples: &[f32], sample_rate: u32) -> Vec<BreathPause> {
    if samples.len() < MIN_BREATH_PAUSE_SAMPLES {
        return vec![];
    }

    // Compute mean energy of voiced regions for threshold
    let frame_energies: Vec<f32> = samples
        .chunks(HOP_SIZE)
        .map(|chunk| compute_rms(chunk))
        .collect();

    let voiced_energies: Vec<f32> = frame_energies
        .iter()
        .copied()
        .filter(|&e| e > SPEECH_ENERGY_THRESHOLD)
        .collect();

    if voiced_energies.is_empty() {
        return vec![];
    }

    let mean_voiced_energy: f32 = voiced_energies.iter().sum::<f32>() / voiced_energies.len() as f32;
    let pause_threshold = mean_voiced_energy * 0.1;

    let mut pauses = Vec::new();
    let mut pause_start: Option<usize> = None;

    for (i, &e) in frame_energies.iter().enumerate() {
        let sample_idx = i * HOP_SIZE;
        if e < pause_threshold {
            if pause_start.is_none() {
                pause_start = Some(sample_idx);
            }
        } else if let Some(start) = pause_start.take() {
            let end = sample_idx;
            let duration_samples = end - start;
            if duration_samples >= MIN_BREATH_PAUSE_SAMPLES {
                pauses.push(BreathPause {
                    start_sample: start,
                    end_sample: end,
                    duration_ms: duration_samples as f32 / sample_rate as f32 * 1000.0,
                });
            }
        }
    }

    // Handle pause extending to end of buffer
    if let Some(start) = pause_start {
        let end = samples.len();
        let duration_samples = end - start;
        if duration_samples >= MIN_BREATH_PAUSE_SAMPLES {
            pauses.push(BreathPause {
                start_sample: start,
                end_sample: end,
                duration_ms: duration_samples as f32 / sample_rate as f32 * 1000.0,
            });
        }
    }

    pauses
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Compute RMS energy of a sample buffer.
#[inline]
fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|&s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

/// Extract pitch periods (in samples) and peak amplitudes from each voiced frame.
fn extract_frame_features(samples: &[f32], sample_rate: u32) -> (Vec<f32>, Vec<f32>) {
    let mut pitch_periods = Vec::new();
    let mut peak_amplitudes = Vec::new();

    let min_lag = (sample_rate as f32 / 500.0) as usize; // 500Hz upper bound
    let max_lag = (sample_rate as f32 / 80.0) as usize;  // 80Hz lower bound

    let mut offset = 0;
    while offset + FRAME_SIZE <= samples.len() {
        let frame = &samples[offset..offset + FRAME_SIZE];
        let frame_energy = compute_rms(frame);

        if frame_energy > SPEECH_ENERGY_THRESHOLD {
            if let Some(lag) = autocorrelation_pitch(frame, min_lag, max_lag) {
                pitch_periods.push(lag as f32);
            }
            // Peak amplitude for this frame
            let peak = frame.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
            peak_amplitudes.push(peak);
        }

        offset += HOP_SIZE;
    }

    (pitch_periods, peak_amplitudes)
}

/// Find the fundamental period via autocorrelation.
/// Returns the lag (in samples) of the strongest pitch, or None if no clear pitch.
fn autocorrelation_pitch(frame: &[f32], min_lag: usize, max_lag: usize) -> Option<usize> {
    let n = frame.len();
    let max_lag = max_lag.min(n - 1);
    if min_lag >= max_lag {
        return None;
    }

    // Autocorrelation at lag 0 (normalization reference)
    let r0: f32 = frame.iter().map(|&s| s * s).sum();
    if r0 < 1e-10 {
        return None;
    }

    let mut best_lag = 0usize;
    let mut best_r = 0.0f32;

    for lag in min_lag..=max_lag {
        let mut r: f32 = 0.0;
        for i in 0..(n - lag) {
            r += frame[i] * frame[i + lag];
        }
        // Normalize
        let r_norm = r / r0;

        if r_norm > best_r {
            best_r = r_norm;
            best_lag = lag;
        }
    }

    // Only accept if normalized autocorrelation is strong enough (voiced speech)
    if best_r > 0.3 && best_lag > 0 {
        Some(best_lag)
    } else {
        None
    }
}

/// Compute jitter: mean absolute difference of consecutive pitch periods / mean period.
fn compute_jitter(periods: &[f32]) -> f32 {
    if periods.len() < 2 {
        return 0.0;
    }

    let mean_period: f32 = periods.iter().sum::<f32>() / periods.len() as f32;
    if mean_period < 1.0 {
        return 0.0;
    }

    let abs_diffs: f32 = periods
        .windows(2)
        .map(|w| (w[1] - w[0]).abs())
        .sum();

    let jitter = abs_diffs / ((periods.len() - 1) as f32 * mean_period);
    jitter.min(1.0)
}

/// Compute shimmer: mean absolute difference of consecutive peak amplitudes / mean amplitude.
fn compute_shimmer(amplitudes: &[f32]) -> f32 {
    if amplitudes.len() < 2 {
        return 0.0;
    }

    let mean_amp: f32 = amplitudes.iter().sum::<f32>() / amplitudes.len() as f32;
    if mean_amp < 1e-6 {
        return 0.0;
    }

    let abs_diffs: f32 = amplitudes
        .windows(2)
        .map(|w| (w[1] - w[0]).abs())
        .sum();

    let shimmer = abs_diffs / ((amplitudes.len() - 1) as f32 * mean_amp);
    shimmer.min(1.0)
}

/// Approximate breathiness via harmonic-to-noise ratio.
///
/// Compares autocorrelation peak to the energy — lower ratio means more noise
/// relative to harmonics, i.e. breathier voice.
fn compute_breathiness(samples: &[f32], sample_rate: u32, pitch_periods: &[f32]) -> f32 {
    if pitch_periods.is_empty() || samples.len() < FRAME_SIZE {
        return 0.0;
    }

    let mean_period = pitch_periods.iter().sum::<f32>() / pitch_periods.len() as f32;
    let lag = mean_period as usize;
    if lag == 0 || lag >= samples.len() {
        return 0.0;
    }

    let min_lag = (sample_rate as f32 / 500.0) as usize;
    let max_lag = (sample_rate as f32 / 80.0) as usize;

    // Sample a few frames and average the HNR approximation
    let mut hnr_sum = 0.0f32;
    let mut count = 0u32;

    let mut offset = 0;
    while offset + FRAME_SIZE <= samples.len() && count < 20 {
        let frame = &samples[offset..offset + FRAME_SIZE];
        let r0: f32 = frame.iter().map(|s| s * s).sum();

        if r0 > 1e-10 {
            if let Some(best_lag) = autocorrelation_pitch(frame, min_lag, max_lag) {
                let mut r_peak: f32 = 0.0;
                for i in 0..(frame.len() - best_lag) {
                    r_peak += frame[i] * frame[i + best_lag];
                }
                // HNR = r_peak / (r0 - r_peak); breathiness = 1 / (1 + HNR)
                let r_peak = r_peak.max(0.0);
                let noise_energy = (r0 - r_peak).max(0.0);
                if r_peak > 1e-10 {
                    let hnr = r_peak / noise_energy.max(1e-10);
                    // Convert to 0-1 breathiness: high HNR = low breathiness
                    hnr_sum += 1.0 / (1.0 + hnr);
                    count += 1;
                }
            }
        }
        offset += FRAME_SIZE; // non-overlapping for speed
    }

    if count == 0 {
        return 0.0;
    }

    (hnr_sum / count as f32).min(1.0)
}

/// Estimate speech rate by counting energy envelope peaks per second.
///
/// The energy envelope is smoothed, and local maxima above a threshold
/// approximate syllable nuclei.
fn compute_speech_rate(samples: &[f32], sample_rate: u32) -> f32 {
    let duration_s = samples.len() as f32 / sample_rate as f32;
    if duration_s < 0.1 {
        return 0.0;
    }

    // Compute energy envelope at ~100Hz (10ms frames)
    let env_hop = (sample_rate as usize) / 100; // 160 samples at 16kHz
    let envelope: Vec<f32> = samples
        .chunks(env_hop)
        .map(|chunk| compute_rms(chunk))
        .collect();

    if envelope.len() < 3 {
        return 0.0;
    }

    // Simple 3-point moving average for smoothing
    let smoothed: Vec<f32> = (0..envelope.len())
        .map(|i| {
            let start = i.saturating_sub(1);
            let end = (i + 2).min(envelope.len());
            let slice = &envelope[start..end];
            slice.iter().sum::<f32>() / slice.len() as f32
        })
        .collect();

    // Find threshold: 30% of max smoothed energy
    let max_energy = smoothed.iter().copied().fold(0.0f32, f32::max);
    let threshold = max_energy * 0.3;

    if threshold < SPEECH_ENERGY_THRESHOLD {
        return 0.0;
    }

    // Count local maxima above threshold
    let mut peaks = 0u32;
    for i in 1..smoothed.len() - 1 {
        if smoothed[i] > threshold && smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1]
        {
            peaks += 1;
        }
    }

    peaks as f32 / duration_s
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 16000;

    /// Generate a sine wave at the given frequency.
    fn sine_wave(freq: f32, duration_s: f32, sample_rate: u32, amplitude: f32) -> Vec<f32> {
        let n = (duration_s * sample_rate as f32) as usize;
        (0..n)
            .map(|i| amplitude * (2.0 * std::f32::consts::PI * freq * i as f32 / sample_rate as f32).sin())
            .collect()
    }

    #[test]
    fn test_silence_returns_no_speech() {
        let silence = vec![0.0f32; 16000]; // 1 second
        let bio = analyze_biomarkers(&silence, SR);
        assert!(!bio.is_speech);
        assert!(bio.energy < 0.01);
        assert_eq!(bio.pitch_hz, 0.0);
        assert_eq!(bio.jitter, 0.0);
        assert_eq!(bio.shimmer, 0.0);
    }

    #[test]
    fn test_sine_200hz_detects_pitch() {
        let samples = sine_wave(200.0, 0.5, SR, 0.5);
        let bio = analyze_biomarkers(&samples, SR);

        assert!(bio.is_speech);
        // Pitch should be approximately 200Hz (within 15% tolerance)
        assert!(
            (bio.pitch_hz - 200.0).abs() < 30.0,
            "Expected pitch ~200Hz, got {}Hz",
            bio.pitch_hz
        );
    }

    #[test]
    fn test_sine_150hz_detects_pitch() {
        let samples = sine_wave(150.0, 0.5, SR, 0.4);
        let bio = analyze_biomarkers(&samples, SR);

        assert!(bio.is_speech);
        assert!(
            (bio.pitch_hz - 150.0).abs() < 25.0,
            "Expected pitch ~150Hz, got {}Hz",
            bio.pitch_hz
        );
    }

    #[test]
    fn test_energy_proportional_to_amplitude() {
        let loud = sine_wave(200.0, 0.3, SR, 0.8);
        let quiet = sine_wave(200.0, 0.3, SR, 0.1);

        let bio_loud = analyze_biomarkers(&loud, SR);
        let bio_quiet = analyze_biomarkers(&quiet, SR);

        assert!(bio_loud.energy > bio_quiet.energy);
    }

    #[test]
    fn test_jitter_in_valid_range() {
        let samples = sine_wave(200.0, 0.5, SR, 0.5);
        let bio = analyze_biomarkers(&samples, SR);
        assert!(bio.jitter >= 0.0 && bio.jitter <= 1.0, "Jitter={}", bio.jitter);
        // Pure sine should have very low jitter
        assert!(bio.jitter < 0.1, "Pure sine jitter should be low, got {}", bio.jitter);
    }

    #[test]
    fn test_shimmer_in_valid_range() {
        let samples = sine_wave(200.0, 0.5, SR, 0.5);
        let bio = analyze_biomarkers(&samples, SR);
        assert!(bio.shimmer >= 0.0 && bio.shimmer <= 1.0, "Shimmer={}", bio.shimmer);
        // Pure sine should have very low shimmer
        assert!(bio.shimmer < 0.1, "Pure sine shimmer should be low, got {}", bio.shimmer);
    }

    #[test]
    fn test_breathiness_in_valid_range() {
        let samples = sine_wave(200.0, 0.5, SR, 0.5);
        let bio = analyze_biomarkers(&samples, SR);
        assert!(
            bio.breathiness >= 0.0 && bio.breathiness <= 1.0,
            "Breathiness={}",
            bio.breathiness
        );
    }

    #[test]
    fn test_breath_pauses_with_silence_gap() {
        // 0.3s speech, 0.3s silence, 0.3s speech
        let mut samples = sine_wave(200.0, 0.3, SR, 0.5);
        samples.extend(vec![0.0f32; (0.3 * SR as f32) as usize]); // 300ms silence
        samples.extend(sine_wave(200.0, 0.3, SR, 0.5));

        let pauses = detect_breath_pauses(&samples, SR);
        assert!(
            pauses.len() >= 1,
            "Should detect at least one breath pause, got {}",
            pauses.len()
        );
        assert!(
            pauses[0].duration_ms >= 200.0,
            "Pause should be >=200ms, got {}ms",
            pauses[0].duration_ms
        );
    }

    #[test]
    fn test_no_breath_pauses_in_continuous_speech() {
        let samples = sine_wave(200.0, 1.0, SR, 0.5);
        let pauses = detect_breath_pauses(&samples, SR);
        assert!(
            pauses.is_empty(),
            "Continuous tone should have no breath pauses, got {}",
            pauses.len()
        );
    }

    #[test]
    fn test_empty_input() {
        let bio = analyze_biomarkers(&[], SR);
        assert!(!bio.is_speech);
        assert_eq!(bio.energy, 0.0);

        let pauses = detect_breath_pauses(&[], SR);
        assert!(pauses.is_empty());
    }

    #[test]
    fn test_speech_rate_positive_for_varying_signal() {
        // Create a signal with amplitude-modulated bursts (simulating syllables)
        let mut samples = Vec::with_capacity(SR as usize * 2);
        for i in 0..(SR as usize * 2) {
            let t = i as f32 / SR as f32;
            // ~4 syllables/sec modulation
            let envelope = (2.0 * std::f32::consts::PI * 4.0 * t).sin().abs();
            let carrier = (2.0 * std::f32::consts::PI * 200.0 * t).sin();
            samples.push(0.5 * envelope * carrier);
        }
        let bio = analyze_biomarkers(&samples, SR);
        assert!(
            bio.speech_rate > 0.0,
            "Speech rate should be positive for modulated signal, got {}",
            bio.speech_rate
        );
    }
}
