//! Voice Conversion Post-Processor
//!
//! Lightweight voice conversion applied after TTS, before humanization.
//! Uses pitch shifting + formant preservation + spectral envelope transfer.
//! Operates on 200ms chunks for low latency.

use tracing::debug;

/// Voice conversion target parameters.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VoiceTarget {
    /// Target pitch shift in semitones (-12 to +12).
    pub pitch_shift_semitones: f32,
    /// Formant shift factor (0.8 = deeper, 1.2 = higher).
    pub formant_shift: f32,
    /// Spectral tilt adjustment (-1.0 to 1.0, negative = warmer).
    pub spectral_tilt: f32,
    /// Breathiness injection (0.0-1.0).
    pub breathiness: f32,
    /// Voice conversion strength (0.0 = bypass, 1.0 = full).
    pub strength: f32,
}

impl Default for VoiceTarget {
    fn default() -> Self {
        Self {
            pitch_shift_semitones: 0.0,
            formant_shift: 1.0,
            spectral_tilt: 0.0,
            breathiness: 0.0,
            strength: 0.0,
        }
    }
}

/// Apply voice conversion to TTS output audio.
///
/// Processes in 200ms chunks for low latency.
/// Returns the converted audio at the same sample rate.
pub fn apply_voice_conversion(
    audio: &[f32],
    target: &VoiceTarget,
    sample_rate: u32,
) -> Vec<f32> {
    if target.strength < 0.01 {
        return audio.to_vec();
    }

    debug!(
        samples = audio.len(),
        pitch_shift = target.pitch_shift_semitones,
        formant_shift = target.formant_shift,
        strength = target.strength,
        "Applying voice conversion"
    );

    let mut output = Vec::with_capacity(audio.len());
    let chunk_size = (sample_rate as usize) / 5; // 200ms chunks

    for chunk in audio.chunks(chunk_size) {
        let converted = process_chunk(chunk, target, sample_rate);
        output.extend_from_slice(&converted);
    }

    output
}

/// Process a single chunk of audio with voice conversion.
fn process_chunk(chunk: &[f32], target: &VoiceTarget, sample_rate: u32) -> Vec<f32> {
    let mut output = chunk.to_vec();
    let strength = target.strength;

    // Stage 1: Pitch shifting via resampling (PSOLA-like)
    if target.pitch_shift_semitones.abs() > 0.1 {
        output = pitch_shift(
            &output,
            target.pitch_shift_semitones * strength,
            sample_rate,
        );
    }

    // Stage 2: Formant adjustment via spectral envelope manipulation
    if (target.formant_shift - 1.0).abs() > 0.01 {
        let shift = 1.0 + (target.formant_shift - 1.0) * strength;
        output = formant_shift(&output, shift, sample_rate);
    }

    // Stage 3: Spectral tilt (warmth/brightness)
    if target.spectral_tilt.abs() > 0.01 {
        apply_spectral_tilt(&mut output, target.spectral_tilt * strength);
    }

    // Stage 4: Breathiness injection
    if target.breathiness > 0.01 {
        inject_breathiness(&mut output, target.breathiness * strength);
    }

    output
}

/// Simple pitch shifting via linear interpolation resampling.
/// Positive semitones = higher pitch, negative = lower.
fn pitch_shift(samples: &[f32], semitones: f32, _sample_rate: u32) -> Vec<f32> {
    if samples.is_empty() || semitones.abs() < 0.01 {
        return samples.to_vec();
    }

    let ratio = 2.0f32.powf(semitones / 12.0);
    let new_len = (samples.len() as f32 / ratio) as usize;
    let mut output = Vec::with_capacity(new_len);

    for i in 0..new_len {
        let src_pos = i as f32 * ratio;
        let src_idx = src_pos as usize;
        let frac = src_pos - src_idx as f32;

        if src_idx + 1 < samples.len() {
            let sample =
                samples[src_idx] * (1.0 - frac) + samples[src_idx + 1] * frac;
            output.push(sample);
        } else if src_idx < samples.len() {
            output.push(samples[src_idx]);
        }
    }

    // Resample back to original length to maintain duration
    resample_to_length(&output, samples.len())
}

/// Resample audio to a target length using linear interpolation.
fn resample_to_length(samples: &[f32], target_len: usize) -> Vec<f32> {
    if samples.is_empty() || target_len == 0 {
        return vec![0.0; target_len];
    }
    if samples.len() == target_len {
        return samples.to_vec();
    }

    let ratio = samples.len() as f32 / target_len as f32;
    let mut output = Vec::with_capacity(target_len);

    for i in 0..target_len {
        let src_pos = i as f32 * ratio;
        let src_idx = src_pos as usize;
        let frac = src_pos - src_idx as f32;

        if src_idx + 1 < samples.len() {
            output.push(
                samples[src_idx] * (1.0 - frac) + samples[src_idx + 1] * frac,
            );
        } else if src_idx < samples.len() {
            output.push(samples[src_idx]);
        } else {
            output.push(0.0);
        }
    }

    output
}

/// Simple formant shift via spectral warping approximation.
/// Factor > 1.0 = higher formants (younger), < 1.0 = lower (deeper).
fn formant_shift(samples: &[f32], factor: f32, _sample_rate: u32) -> Vec<f32> {
    if samples.is_empty() || (factor - 1.0).abs() < 0.01 {
        return samples.to_vec();
    }
    // Simplified: use resampling as a coarse formant shift approximation
    // A proper implementation would use LPC analysis + pole shifting
    let resampled_len = (samples.len() as f32 / factor) as usize;
    let resampled = resample_to_length(samples, resampled_len);
    resample_to_length(&resampled, samples.len())
}

/// Apply spectral tilt (simple first-order filter).
/// Negative tilt = warmer (attenuate highs), positive = brighter.
fn apply_spectral_tilt(samples: &mut [f32], tilt: f32) {
    if samples.is_empty() || tilt.abs() < 0.01 {
        return;
    }
    // Pre-emphasis/de-emphasis coefficient
    let alpha = tilt.clamp(-0.97, 0.97);
    let mut prev = 0.0f32;
    for sample in samples.iter_mut() {
        let current = *sample;
        *sample = current - alpha * prev;
        prev = current;
    }
}

/// Inject breathiness by adding filtered noise.
fn inject_breathiness(samples: &mut [f32], amount: f32) {
    if amount < 0.01 {
        return;
    }
    let noise_level = amount * 0.05; // Keep subtle
    let mut rng_state: u32 = 42;
    for sample in samples.iter_mut() {
        // Simple LCG noise
        rng_state = rng_state
            .wrapping_mul(1664525)
            .wrapping_add(1013904223);
        let noise = (rng_state as f32 / u32::MAX as f32) * 2.0 - 1.0;
        *sample += noise * noise_level;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bypass() {
        let audio = vec![0.5f32; 4800];
        let target = VoiceTarget::default(); // strength=0.0
        let result = apply_voice_conversion(&audio, &target, 24000);
        assert_eq!(result, audio);
    }

    #[test]
    fn test_pitch_shift() {
        let audio: Vec<f32> = (0..4800).map(|i| (i as f32 * 0.01).sin()).collect();
        let target = VoiceTarget {
            pitch_shift_semitones: 2.0,
            strength: 1.0,
            ..Default::default()
        };
        let result = apply_voice_conversion(&audio, &target, 24000);
        assert_eq!(result.len(), audio.len());
    }

    #[test]
    fn test_formant_shift() {
        let audio: Vec<f32> = (0..4800).map(|i| (i as f32 * 0.01).sin()).collect();
        let target = VoiceTarget {
            formant_shift: 1.2,
            strength: 1.0,
            ..Default::default()
        };
        let result = apply_voice_conversion(&audio, &target, 24000);
        assert_eq!(result.len(), audio.len());
    }
}
