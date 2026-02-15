//! Voice Biomarker Extraction
//!
//! Real-time extraction of emotional signals from 16kHz mono PCM audio.
//! Pure DSP — no external signal processing crates needed.
//!
//! Biomarkers extracted:
//! - **Pitch (F0)**: Fundamental frequency via autocorrelation
//! - **Energy**: RMS energy normalized 0.0-1.0
//! - **Jitter**: Pitch period variation (anxiety indicator)
//! - **Shimmer**: Amplitude variation (suppressed emotion)
//! - **Breathiness**: Harmonic-to-noise ratio approximation
//! - **Speech rate**: Estimated syllables per second
//! - **Breath pauses**: Regions of energy dip >200ms

use serde::{Deserialize, Serialize};

/// Voice biomarker results from audio analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceBiomarkers {
    pub pitch_hz: f32,
    pub energy: f32,
    pub jitter: f32,
    pub shimmer: f32,
    pub breathiness: f32,
    pub speech_rate: f32,
    pub is_speech: bool,
}

/// A detected breath pause (energy dip >200ms).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreathPause {
    pub start_sample: usize,
    pub end_sample: usize,
    pub duration_ms: f32,
}

const SPEECH_ENERGY_THRESHOLD: f32 = 0.01;
const ENERGY_REFERENCE: f32 = 0.5;

/// Compute frame size (30ms) from sample rate.
fn frame_size(sample_rate: u32) -> usize {
    (sample_rate as usize * 30) / 1000
}

/// Compute hop size (10ms) from sample rate.
fn hop_size(sample_rate: u32) -> usize {
    (sample_rate as usize * 10) / 1000
}

/// Compute minimum breath pause duration (200ms) from sample rate.
fn min_breath_pause_samples(sample_rate: u32) -> usize {
    (sample_rate as usize * 200) / 1000
}

/// Analyze voice biomarkers from 16kHz mono f32 PCM audio.
pub fn analyze_biomarkers(samples: &[f32], sample_rate: u32) -> VoiceBiomarkers {
    if samples.is_empty() {
        return VoiceBiomarkers {
            pitch_hz: 0.0, energy: 0.0, jitter: 0.0, shimmer: 0.0,
            breathiness: 0.0, speech_rate: 0.0, is_speech: false,
        };
    }

    let energy = compute_rms(samples).min(1.0);
    let normalized_energy = (energy / ENERGY_REFERENCE).min(1.0);
    let is_speech = energy > SPEECH_ENERGY_THRESHOLD;

    if !is_speech {
        return VoiceBiomarkers {
            pitch_hz: 0.0, energy: normalized_energy, jitter: 0.0,
            shimmer: 0.0, breathiness: 0.0, speech_rate: 0.0, is_speech: false,
        };
    }

    let (pitch_periods, peak_amplitudes) = extract_frame_features(samples, sample_rate);

    let pitch_hz = if pitch_periods.is_empty() {
        0.0
    } else {
        let mut sorted = pitch_periods.iter().map(|&p| sample_rate as f32 / p).collect::<Vec<_>>();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        sorted[sorted.len() / 2]
    };

    let jitter = compute_jitter(&pitch_periods);
    let shimmer = compute_shimmer(&peak_amplitudes);
    let breathiness = compute_breathiness(samples, sample_rate, &pitch_periods);
    let speech_rate = compute_speech_rate(samples, sample_rate);

    VoiceBiomarkers {
        pitch_hz, energy: normalized_energy, jitter, shimmer,
        breathiness, speech_rate, is_speech,
    }
}

/// Detect breath pauses (energy dips below threshold for >200ms).
pub fn detect_breath_pauses(samples: &[f32], sample_rate: u32) -> Vec<BreathPause> {
    let min_pause = min_breath_pause_samples(sample_rate);
    let hs = hop_size(sample_rate);

    if samples.len() < min_pause {
        return vec![];
    }

    let frame_energies: Vec<f32> = samples.chunks(hs).map(|c| compute_rms(c)).collect();
    let voiced: Vec<f32> = frame_energies.iter().copied().filter(|&e| e > SPEECH_ENERGY_THRESHOLD).collect();
    if voiced.is_empty() { return vec![]; }

    let mean_voiced: f32 = voiced.iter().sum::<f32>() / voiced.len() as f32;
    let threshold = mean_voiced * 0.1;

    let mut pauses = Vec::new();
    let mut pause_start: Option<usize> = None;

    for (i, &e) in frame_energies.iter().enumerate() {
        let sample_idx = i * hs;
        if e < threshold {
            if pause_start.is_none() { pause_start = Some(sample_idx); }
        } else if let Some(start) = pause_start.take() {
            let dur = sample_idx - start;
            if dur >= min_pause {
                pauses.push(BreathPause {
                    start_sample: start, end_sample: sample_idx,
                    duration_ms: dur as f32 / sample_rate as f32 * 1000.0,
                });
            }
        }
    }

    if let Some(start) = pause_start {
        let dur = samples.len() - start;
        if dur >= min_pause {
            pauses.push(BreathPause {
                start_sample: start, end_sample: samples.len(),
                duration_ms: dur as f32 / sample_rate as f32 * 1000.0,
            });
        }
    }

    pauses
}

#[inline]
fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() { return 0.0; }
    let sum_sq: f32 = samples.iter().map(|&s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

fn extract_frame_features(samples: &[f32], sample_rate: u32) -> (Vec<f32>, Vec<f32>) {
    let mut pitch_periods = Vec::new();
    let mut peak_amplitudes = Vec::new();
    let min_lag = (sample_rate as f32 / 500.0) as usize;
    let max_lag = (sample_rate as f32 / 80.0) as usize;
    let fs = frame_size(sample_rate);
    let hs = hop_size(sample_rate);

    let mut offset = 0;
    while offset + fs <= samples.len() {
        let frame = &samples[offset..offset + fs];
        if compute_rms(frame) > SPEECH_ENERGY_THRESHOLD {
            if let Some(lag) = autocorrelation_pitch(frame, min_lag, max_lag) {
                pitch_periods.push(lag as f32);
            }
            let peak = frame.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
            peak_amplitudes.push(peak);
        }
        offset += hs;
    }

    (pitch_periods, peak_amplitudes)
}

fn autocorrelation_pitch(frame: &[f32], min_lag: usize, max_lag: usize) -> Option<usize> {
    let n = frame.len();
    let max_lag = max_lag.min(n - 1);
    if max_lag >= frame.len() { return None; }
    if min_lag >= max_lag { return None; }

    let r0: f32 = frame.iter().map(|&s| s * s).sum();
    if r0 < 1e-10 { return None; }

    let mut best_lag = 0usize;
    let mut best_r = 0.0f32;

    for lag in min_lag..=max_lag {
        let mut r: f32 = 0.0;
        for i in 0..(n - lag) {
            r += frame[i] * frame[i + lag];
        }
        let r_norm = r / r0;
        if r_norm > best_r {
            best_r = r_norm;
            best_lag = lag;
        }
    }

    if best_r > 0.3 && best_lag > 0 { Some(best_lag) } else { None }
}

fn compute_jitter(periods: &[f32]) -> f32 {
    if periods.len() <= 1 { return 0.0; }
    let mean: f32 = periods.iter().sum::<f32>() / periods.len() as f32;
    if mean < 1.0 { return 0.0; }
    let diffs: f32 = periods.windows(2).map(|w| (w[1] - w[0]).abs()).sum();
    (diffs / ((periods.len() - 1) as f32 * mean)).min(1.0)
}

fn compute_shimmer(amplitudes: &[f32]) -> f32 {
    if amplitudes.len() < 2 { return 0.0; }
    let mean: f32 = amplitudes.iter().sum::<f32>() / amplitudes.len() as f32;
    if mean < 1e-6 { return 0.0; }
    let diffs: f32 = amplitudes.windows(2).map(|w| (w[1] - w[0]).abs()).sum();
    (diffs / ((amplitudes.len() - 1) as f32 * mean)).min(1.0)
}

fn compute_breathiness(samples: &[f32], sample_rate: u32, pitch_periods: &[f32]) -> f32 {
    let fs = frame_size(sample_rate);
    if pitch_periods.is_empty() || samples.len() < fs { return 0.0; }
    let min_lag = (sample_rate as f32 / 500.0) as usize;
    let max_lag = (sample_rate as f32 / 80.0) as usize;

    let mut hnr_sum = 0.0f32;
    let mut count = 0u32;
    let mut offset = 0;

    while offset + fs <= samples.len() && count < 20 {
        let frame = &samples[offset..offset + fs];
        let r0: f32 = frame.iter().map(|s| s * s).sum();
        if r0 > 1e-10 {
            if let Some(best_lag) = autocorrelation_pitch(frame, min_lag, max_lag) {
                let mut r_peak: f32 = 0.0;
                for i in 0..(frame.len() - best_lag) {
                    r_peak += frame[i] * frame[i + best_lag];
                }
                let r_peak = r_peak.max(0.0);
                let noise = (r0 - r_peak).max(0.0);
                if r_peak > 1e-10 {
                    let hnr = r_peak / noise.max(1e-10);
                    hnr_sum += 1.0 / (1.0 + hnr);
                    count += 1;
                }
            }
        }
        offset += fs;
    }

    if count == 0 { 0.0 } else { (hnr_sum / count as f32).min(1.0) }
}

fn compute_speech_rate(samples: &[f32], sample_rate: u32) -> f32 {
    let duration_s = samples.len() as f32 / sample_rate as f32;
    if duration_s < 0.1 { return 0.0; }

    let env_hop = (sample_rate as usize) / 100;
    let envelope: Vec<f32> = samples.chunks(env_hop).map(|c| compute_rms(c)).collect();
    if envelope.len() < 3 { return 0.0; }

    let smoothed: Vec<f32> = (0..envelope.len()).map(|i| {
        let start = i.saturating_sub(1);
        let end = (i + 2).min(envelope.len());
        envelope[start..end].iter().sum::<f32>() / (end - start) as f32
    }).collect();

    let max_e = smoothed.iter().copied().fold(0.0f32, f32::max);
    let threshold = max_e * 0.3;
    if threshold < SPEECH_ENERGY_THRESHOLD { return 0.0; }

    let mut peaks = 0u32;
    for i in 1..smoothed.len() - 1 {
        if smoothed[i] > threshold && smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1] {
            peaks += 1;
        }
    }

    peaks as f32 / duration_s
}

/// Parameters derived from biomarkers for tuning humanization DSP.
#[derive(Debug, Clone)]
pub struct BiomarkerHumanizationParams {
    /// Multiplier for texture jitter (0.5 = reduce by half when user is anxious).
    pub jitter_reduction: f32,
    /// Multiplier for overall intensity (0.8 = softer when user is quiet).
    pub intensity_scale: f32,
    /// Target speech rate from user's speaking pace.
    pub target_speech_rate: Option<f32>,
    /// Reference pitch from user's voice (for future mirroring).
    pub pitch_reference: Option<f32>,
}

/// Convert raw biomarkers into humanization tuning parameters.
///
/// Thresholds:
/// - Jitter > 0.5 → anxious user → reduce agent jitter by 50%
/// - Energy < 0.3 → quiet user → reduce agent intensity by 20%
pub fn biomarkers_to_humanization_params(biomarkers: &VoiceBiomarkers) -> BiomarkerHumanizationParams {
    BiomarkerHumanizationParams {
        jitter_reduction: if biomarkers.jitter > 0.5 { 0.5 } else { 1.0 },
        intensity_scale: if biomarkers.energy < 0.3 { 0.8 } else { 1.0 },
        target_speech_rate: Some(biomarkers.speech_rate),
        pitch_reference: Some(biomarkers.pitch_hz),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 16000;

    fn sine_wave(freq: f32, dur: f32, sr: u32, amp: f32) -> Vec<f32> {
        let n = (dur * sr as f32) as usize;
        (0..n).map(|i| amp * (2.0 * std::f32::consts::PI * freq * i as f32 / sr as f32).sin()).collect()
    }

    #[test]
    fn test_silence_no_speech() {
        let bio = analyze_biomarkers(&vec![0.0f32; 16000], SR);
        assert!(!bio.is_speech);
    }

    #[test]
    fn test_sine_200hz_pitch() {
        let bio = analyze_biomarkers(&sine_wave(200.0, 0.5, SR, 0.5), SR);
        assert!(bio.is_speech);
        assert!((bio.pitch_hz - 200.0).abs() < 30.0, "Got {}Hz", bio.pitch_hz);
    }

    #[test]
    fn test_jitter_low_for_sine() {
        let bio = analyze_biomarkers(&sine_wave(200.0, 0.5, SR, 0.5), SR);
        assert!(bio.jitter < 0.1);
    }

    #[test]
    fn test_breath_pause_detected() {
        let mut s = sine_wave(200.0, 0.3, SR, 0.5);
        s.extend(vec![0.0f32; (0.3 * SR as f32) as usize]);
        s.extend(sine_wave(200.0, 0.3, SR, 0.5));
        let pauses = detect_breath_pauses(&s, SR);
        assert!(!pauses.is_empty());
    }

    #[test]
    fn test_empty_input() {
        let bio = analyze_biomarkers(&[], SR);
        assert!(!bio.is_speech);
    }

    #[test]
    fn test_biomarker_params_high_jitter() {
        let bio = VoiceBiomarkers {
            pitch_hz: 180.0, energy: 0.5, jitter: 0.7, shimmer: 0.2,
            breathiness: 0.1, speech_rate: 4.0, is_speech: true,
        };
        let params = biomarkers_to_humanization_params(&bio);
        assert_eq!(params.jitter_reduction, 0.5, "High jitter should reduce by 50%");
        assert_eq!(params.intensity_scale, 1.0, "Normal energy should not scale");
    }

    #[test]
    fn test_biomarker_params_low_energy() {
        let bio = VoiceBiomarkers {
            pitch_hz: 200.0, energy: 0.2, jitter: 0.1, shimmer: 0.1,
            breathiness: 0.3, speech_rate: 3.0, is_speech: true,
        };
        let params = biomarkers_to_humanization_params(&bio);
        assert_eq!(params.intensity_scale, 0.8, "Low energy should scale to 0.8");
        assert_eq!(params.jitter_reduction, 1.0, "Low jitter should not reduce");
    }

    #[test]
    fn test_biomarker_params_both_thresholds() {
        let bio = VoiceBiomarkers {
            pitch_hz: 150.0, energy: 0.1, jitter: 0.8, shimmer: 0.5,
            breathiness: 0.4, speech_rate: 5.0, is_speech: true,
        };
        let params = biomarkers_to_humanization_params(&bio);
        assert_eq!(params.jitter_reduction, 0.5);
        assert_eq!(params.intensity_scale, 0.8);
        assert_eq!(params.target_speech_rate, Some(5.0));
        assert_eq!(params.pitch_reference, Some(150.0));
    }

    #[test]
    fn test_biomarker_params_normal_values() {
        let bio = VoiceBiomarkers {
            pitch_hz: 200.0, energy: 0.6, jitter: 0.3, shimmer: 0.2,
            breathiness: 0.1, speech_rate: 4.5, is_speech: true,
        };
        let params = biomarkers_to_humanization_params(&bio);
        assert_eq!(params.jitter_reduction, 1.0, "Normal jitter should be 1.0");
        assert_eq!(params.intensity_scale, 1.0, "Normal energy should be 1.0");
    }

    #[test]
    fn test_biomarker_params_boundary_jitter() {
        // Exactly at threshold — should NOT trigger reduction
        let bio = VoiceBiomarkers {
            pitch_hz: 200.0, energy: 0.5, jitter: 0.5, shimmer: 0.2,
            breathiness: 0.1, speech_rate: 4.0, is_speech: true,
        };
        let params = biomarkers_to_humanization_params(&bio);
        assert_eq!(params.jitter_reduction, 1.0, "Jitter at exactly 0.5 should not trigger");
    }

    #[test]
    fn test_biomarker_params_boundary_energy() {
        // Exactly at threshold — should NOT trigger reduction
        let bio = VoiceBiomarkers {
            pitch_hz: 200.0, energy: 0.3, jitter: 0.2, shimmer: 0.2,
            breathiness: 0.1, speech_rate: 4.0, is_speech: true,
        };
        let params = biomarkers_to_humanization_params(&bio);
        assert_eq!(params.intensity_scale, 1.0, "Energy at exactly 0.3 should not trigger");
    }

    #[test]
    fn test_autocorrelation_single_period_input() {
        // Frame with a single pitch period — should not panic
        let frame: Vec<f32> = (0..480)
            .map(|i| 0.5 * (200.0 * 2.0 * std::f32::consts::PI * i as f32 / SR as f32).sin())
            .collect();
        let min_lag = (SR as f32 / 500.0) as usize;
        let max_lag = (SR as f32 / 80.0) as usize;
        let result = autocorrelation_pitch(&frame, min_lag, max_lag);
        // Should not panic; result depends on signal characteristics
        assert!(result.is_none() || result.unwrap() >= min_lag);
    }

    #[test]
    fn test_jitter_single_period() {
        // A single period should return 0.0 jitter (no variation to measure)
        assert_eq!(compute_jitter(&[80.0]), 0.0);
        assert_eq!(compute_jitter(&[]), 0.0);
    }
}
