//! Post-TTS Audio Enhancement Module
//!
//! "Better Than Human" audio processing applied AFTER Cartesia TTS output.
//!
//! Key enhancements:
//! - Breath injection at phrase boundaries
//! - Spectral warmth (formant enhancement)
//! - Micro-pitch modulation for naturalness
//! - Soft attack/release (phrase rounding)
//! - Light dynamic compression
//! - Presence EQ boost (2-4kHz)
//!
//! All processing is designed to add human-like qualities that even
//! the best TTS engines don't fully capture.
//!
//! @module post_tts

use std::f32::consts::PI;

// ============================================================================
// CONFIGURATION
// ============================================================================

/// Configuration for post-TTS enhancement
#[derive(Clone)]
pub struct PostTtsConfig {
    /// Sample rate (typically 24000 or 44100 for Cartesia)
    pub sample_rate: u32,
    /// Enable breath injection at phrase starts
    pub enable_breath: bool,
    /// Enable spectral warmth enhancement
    pub enable_warmth: bool,
    /// Enable micro-pitch modulation
    pub enable_micro_pitch: bool,
    /// Enable soft attack/release on phrases
    pub enable_soft_edges: bool,
    /// Enable light compression
    pub enable_compression: bool,
    /// Enable presence EQ boost
    pub enable_presence: bool,
    /// Breath injection probability (0.0-1.0)
    pub breath_probability: f32,
    /// Warmth amount (0.0-1.0)
    pub warmth_amount: f32,
    /// Pitch modulation depth in cents (typically 5-15)
    pub pitch_modulation_cents: f32,
    /// Soft edge duration in samples
    pub soft_edge_samples: usize,
    /// Compression ratio (1.5-3.0)
    pub compression_ratio: f32,
    /// Compression threshold in dB (-30 to -10)
    pub compression_threshold_db: f32,
    /// Presence boost in dB (1-6)
    pub presence_boost_db: f32,
}

impl Default for PostTtsConfig {
    fn default() -> Self {
        Self {
            sample_rate: 24000,
            enable_breath: true,
            enable_warmth: true,
            enable_micro_pitch: true,
            enable_soft_edges: true,
            enable_compression: true,
            enable_presence: true,
            breath_probability: 0.3,
            warmth_amount: 0.15,
            pitch_modulation_cents: 8.0,
            soft_edge_samples: 480, // 20ms at 24kHz
            compression_ratio: 2.0,
            compression_threshold_db: -20.0,
            presence_boost_db: 2.5,
        }
    }
}

// ============================================================================
// BREATH INJECTION
// ============================================================================

/// Pre-computed breath sample (soft inhale, ~50ms)
/// This is a synthesized breath-like noise burst with spectral shaping
fn generate_breath_sample(sample_rate: u32, duration_ms: f32) -> Vec<f32> {
    let num_samples = ((sample_rate as f32 * duration_ms) / 1000.0) as usize;
    let mut breath = vec![0.0f32; num_samples];

    // Use deterministic "random" for reproducibility
    let mut seed: u32 = 12345;

    for i in 0..num_samples {
        // Simple LCG for pseudo-random noise
        seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
        let noise = ((seed >> 16) as f32 / 32768.0) - 1.0;

        // Envelope: quick attack, slow decay (breath-like)
        let t = i as f32 / num_samples as f32;
        let envelope = if t < 0.1 {
            t / 0.1 // Attack
        } else {
            1.0 - ((t - 0.1) / 0.9).powf(0.5) // Decay
        };

        // Low-pass filter the noise for softer sound
        // Simulate breath spectrum (mostly low-mid frequencies)
        let freq_factor = (1.0 - t * 0.3).max(0.3);

        breath[i] = noise * envelope * 0.08 * freq_factor;
    }

    // Apply simple smoothing (moving average)
    let window = 5;
    let mut smoothed = vec![0.0f32; num_samples];
    for i in 0..num_samples {
        let start = if i >= window { i - window } else { 0 };
        let end = (i + window).min(num_samples);
        let sum: f32 = breath[start..end].iter().sum();
        smoothed[i] = sum / (end - start) as f32;
    }

    smoothed
}

/// Detect phrase boundaries (low energy regions)
fn detect_phrase_boundaries(samples: &[f32], window_size: usize, threshold: f32) -> Vec<usize> {
    let mut boundaries = Vec::new();
    let mut in_silence = false;

    for i in (0..samples.len()).step_by(window_size / 2) {
        let end = (i + window_size).min(samples.len());
        let window = &samples[i..end];

        // Compute RMS energy
        let rms: f32 = (window.iter().map(|s| s * s).sum::<f32>() / window.len() as f32).sqrt();

        if rms < threshold {
            if !in_silence && i > 0 {
                boundaries.push(i);
            }
            in_silence = true;
        } else {
            in_silence = false;
        }
    }

    boundaries
}

/// Inject breath sounds at phrase boundaries
pub fn inject_breaths(
    samples: &mut [f32],
    sample_rate: u32,
    probability: f32,
) -> usize {
    let window_size = (sample_rate as usize * 30) / 1000; // 30ms windows
    let threshold = 0.01; // Low energy threshold

    let boundaries = detect_phrase_boundaries(samples, window_size, threshold);
    let breath = generate_breath_sample(sample_rate, 40.0); // 40ms breath

    let mut injected_count = 0;

    // Use deterministic selection based on position
    for (idx, &boundary) in boundaries.iter().enumerate() {
        // Pseudo-random selection based on boundary position
        let should_inject = ((boundary * 7 + idx * 13) % 100) as f32 / 100.0 < probability;

        if should_inject && boundary + breath.len() < samples.len() {
            // Mix breath into the audio (don't replace)
            for (j, &b) in breath.iter().enumerate() {
                if boundary + j < samples.len() {
                    samples[boundary + j] = samples[boundary + j] * 0.7 + b;
                }
            }
            injected_count += 1;
        }
    }

    injected_count
}

// ============================================================================
// SPECTRAL WARMTH (Formant Enhancement)
// ============================================================================

/// Apply spectral warmth using a gentle low-shelf boost
/// This enhances the "body" of the voice without muddiness
pub fn apply_spectral_warmth(samples: &mut [f32], sample_rate: u32, amount: f32) {
    if amount <= 0.0 || samples.is_empty() {
        return;
    }

    // Biquad low-shelf filter coefficients
    // Boost frequencies below ~300Hz by `amount` (0.0-1.0 = 0-6dB)
    let boost_db = amount * 6.0;
    let gain = 10.0_f32.powf(boost_db / 20.0);
    let freq = 300.0;
    let q = 0.707;

    let omega = 2.0 * PI * freq / sample_rate as f32;
    let sin_omega = omega.sin();
    let cos_omega = omega.cos();
    let alpha = sin_omega / (2.0 * q);
    let a_gain = gain.sqrt();

    // Low-shelf coefficients
    let b0 = a_gain * ((a_gain + 1.0) - (a_gain - 1.0) * cos_omega + 2.0 * a_gain.sqrt() * alpha);
    let b1 = 2.0 * a_gain * ((a_gain - 1.0) - (a_gain + 1.0) * cos_omega);
    let b2 = a_gain * ((a_gain + 1.0) - (a_gain - 1.0) * cos_omega - 2.0 * a_gain.sqrt() * alpha);
    let a0 = (a_gain + 1.0) + (a_gain - 1.0) * cos_omega + 2.0 * a_gain.sqrt() * alpha;
    let a1 = -2.0 * ((a_gain - 1.0) + (a_gain + 1.0) * cos_omega);
    let a2 = (a_gain + 1.0) + (a_gain - 1.0) * cos_omega - 2.0 * a_gain.sqrt() * alpha;

    // Normalize coefficients
    let b0 = b0 / a0;
    let b1 = b1 / a0;
    let b2 = b2 / a0;
    let a1 = a1 / a0;
    let a2 = a2 / a0;

    // Apply biquad filter
    let mut x1 = 0.0f32;
    let mut x2 = 0.0f32;
    let mut y1 = 0.0f32;
    let mut y2 = 0.0f32;

    for sample in samples.iter_mut() {
        let x0 = *sample;
        let y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;

        *sample = y0;
    }
}

// ============================================================================
// MICRO-PITCH MODULATION
// ============================================================================

/// Apply subtle pitch modulation for naturalness
/// Humans never speak at a perfectly constant pitch - there are micro-variations
pub fn apply_micro_pitch_modulation(samples: &mut [f32], sample_rate: u32, cents: f32) {
    if cents <= 0.0 || samples.len() < 2 {
        return;
    }

    // Convert cents to frequency ratio
    let max_ratio = 2.0_f32.powf(cents / 1200.0);

    // Modulation frequency (~3-7 Hz for natural variation)
    let mod_freq = 5.0;
    let samples_per_cycle = sample_rate as f32 / mod_freq;

    // Process using variable-rate resampling (simplified linear interpolation)
    let original = samples.to_vec();
    let mut read_pos = 0.0f32;

    // Deterministic "random" phase offset
    let mut phase_seed: u32 = 54321;

    for (i, sample) in samples.iter_mut().enumerate() {
        // Slow-varying pitch modulation
        let t = i as f32 / samples_per_cycle;

        // Add some randomness to the modulation
        phase_seed = phase_seed.wrapping_mul(1103515245).wrapping_add(12345);
        let noise = ((phase_seed >> 20) as f32 / 2048.0) - 1.0;

        let mod_value = (t * 2.0 * PI).sin() * 0.7 + noise * 0.3;
        let current_ratio = 1.0 + (max_ratio - 1.0) * mod_value;

        // Read from original with interpolation
        let read_idx = read_pos as usize;
        let frac = read_pos - read_idx as f32;

        if read_idx + 1 < original.len() {
            *sample = original[read_idx] * (1.0 - frac) + original[read_idx + 1] * frac;
        }

        read_pos += current_ratio;

        // Wrap around if we've read past the end
        if read_pos >= original.len() as f32 - 1.0 {
            read_pos = original.len() as f32 - 2.0;
        }
    }
}

// ============================================================================
// SOFT ATTACK/RELEASE (Phrase Rounding)
// ============================================================================

/// Apply soft attack at the beginning of audio
pub fn apply_soft_attack(samples: &mut [f32], attack_samples: usize) {
    let attack_len = attack_samples.min(samples.len());

    for i in 0..attack_len {
        // Smooth fade-in curve (raised cosine)
        // At t=0: cos(π) = -1, envelope = 0.5 * (1 - (-1)) = 1... wait, we want 0
        // Fixed: use (1 - cos(πt))/2 which gives 0 at t=0, 1 at t=1
        let t = i as f32 / attack_len as f32;
        let envelope = 0.5 * (1.0 - (PI * t).cos());
        samples[i] *= envelope;
    }
}

/// Apply soft release at the end of audio
pub fn apply_soft_release(samples: &mut [f32], release_samples: usize) {
    let len = samples.len();
    let release_len = release_samples.min(len);
    let start = len - release_len;

    for i in 0..release_len {
        // Smooth fade-out curve (raised cosine)
        let t = i as f32 / release_len as f32;
        let envelope = 0.5 * (1.0 + (PI * t).cos());
        samples[start + i] *= envelope;
    }
}

/// Apply soft edges to phrase boundaries within the audio
pub fn apply_soft_phrase_edges(
    samples: &mut [f32],
    sample_rate: u32,
    edge_samples: usize,
) -> usize {
    let window_size = (sample_rate as usize * 50) / 1000; // 50ms windows
    let threshold = 0.02;

    let boundaries = detect_phrase_boundaries(samples, window_size, threshold);
    let mut edges_applied = 0;

    for &boundary in &boundaries {
        // Apply soft release before boundary
        if boundary > edge_samples {
            let start = boundary - edge_samples;
            for i in 0..edge_samples {
                let t = i as f32 / edge_samples as f32;
                let envelope = 0.5 * (1.0 + (PI * t).cos());
                samples[start + i] *= envelope;
            }
        }

        // Apply soft attack after boundary
        if boundary + edge_samples < samples.len() {
            for i in 0..edge_samples {
                let t = i as f32 / edge_samples as f32;
                let envelope = 0.5 * (1.0 - (PI * (1.0 - t)).cos());
                samples[boundary + i] *= envelope;
            }
        }

        edges_applied += 1;
    }

    edges_applied
}

// ============================================================================
// DYNAMIC COMPRESSION
// ============================================================================

/// Apply light dynamic compression to even out volume
pub fn apply_compression(
    samples: &mut [f32],
    threshold_db: f32,
    ratio: f32,
    attack_ms: f32,
    release_ms: f32,
    sample_rate: u32,
) {
    if samples.is_empty() || ratio <= 1.0 {
        return;
    }

    let threshold = 10.0_f32.powf(threshold_db / 20.0);
    let attack_coef = (-1.0 / (attack_ms * sample_rate as f32 / 1000.0)).exp();
    let release_coef = (-1.0 / (release_ms * sample_rate as f32 / 1000.0)).exp();

    let mut envelope = 0.0f32;

    for sample in samples.iter_mut() {
        let input_abs = sample.abs();

        // Envelope follower
        if input_abs > envelope {
            envelope = attack_coef * envelope + (1.0 - attack_coef) * input_abs;
        } else {
            envelope = release_coef * envelope + (1.0 - release_coef) * input_abs;
        }

        // Compute gain reduction
        let gain = if envelope > threshold {
            let over_db = 20.0 * (envelope / threshold).log10();
            let reduced_db = over_db / ratio;
            let target_db = 20.0 * threshold.log10() + reduced_db;
            let target_linear = 10.0_f32.powf(target_db / 20.0);
            target_linear / envelope.max(1e-10)
        } else {
            1.0
        };

        *sample *= gain;
    }
}

// ============================================================================
// PRESENCE EQ BOOST
// ============================================================================

/// Apply presence boost (2-4kHz) for clarity
pub fn apply_presence_boost(samples: &mut [f32], sample_rate: u32, boost_db: f32) {
    if boost_db <= 0.0 || samples.is_empty() {
        return;
    }

    // Peak EQ at 3kHz
    let gain = 10.0_f32.powf(boost_db / 20.0);
    let freq = 3000.0;
    let q = 1.5; // Moderate Q for natural sound

    let omega = 2.0 * PI * freq / sample_rate as f32;
    let sin_omega = omega.sin();
    let cos_omega = omega.cos();
    let alpha = sin_omega / (2.0 * q);

    // Peak EQ coefficients
    let a_gain = gain.sqrt();
    let b0 = 1.0 + alpha * a_gain;
    let b1 = -2.0 * cos_omega;
    let b2 = 1.0 - alpha * a_gain;
    let a0 = 1.0 + alpha / a_gain;
    let a1 = -2.0 * cos_omega;
    let a2 = 1.0 - alpha / a_gain;

    // Normalize
    let b0 = b0 / a0;
    let b1 = b1 / a0;
    let b2 = b2 / a0;
    let a1 = a1 / a0;
    let a2 = a2 / a0;

    // Apply biquad
    let mut x1 = 0.0f32;
    let mut x2 = 0.0f32;
    let mut y1 = 0.0f32;
    let mut y2 = 0.0f32;

    for sample in samples.iter_mut() {
        let x0 = *sample;
        let y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;

        *sample = y0;
    }
}

// ============================================================================
// FULL ENHANCEMENT PIPELINE
// ============================================================================

/// Result of post-TTS enhancement
pub struct EnhancementResult {
    /// Number of breaths injected
    pub breaths_injected: usize,
    /// Number of phrase edges softened
    pub edges_softened: usize,
    /// Was warmth applied
    pub warmth_applied: bool,
    /// Was pitch modulation applied
    pub pitch_mod_applied: bool,
    /// Was compression applied
    pub compression_applied: bool,
    /// Was presence boost applied
    pub presence_applied: bool,
}

/// Apply full enhancement pipeline to TTS output
pub fn enhance_tts_output(samples: &mut [f32], config: &PostTtsConfig) -> EnhancementResult {
    let mut result = EnhancementResult {
        breaths_injected: 0,
        edges_softened: 0,
        warmth_applied: false,
        pitch_mod_applied: false,
        compression_applied: false,
        presence_applied: false,
    };

    if samples.is_empty() {
        return result;
    }

    // NOTE: Soft attack/release are NOW controlled by enable_soft_edges flag.
    // Previously they were always applied, which caused choppy audio when
    // processing streaming frames (every 20ms frame was faded in/out!).
    //
    // The TypeScript wrapper handles soft edges at utterance boundaries:
    // - First frame of utterance: soft attack applied
    // - Last frame of utterance: soft release applied
    // - Middle frames: NO soft edges (config.enable_soft_edges = false)

    // 1. Breath injection at phrase boundaries
    if config.enable_breath {
        result.breaths_injected = inject_breaths(
            samples,
            config.sample_rate,
            config.breath_probability,
        );
    }

    // 4. Soft edges at internal phrase boundaries
    if config.enable_soft_edges {
        result.edges_softened = apply_soft_phrase_edges(
            samples,
            config.sample_rate,
            config.soft_edge_samples,
        );
    }

    // 5. Spectral warmth
    if config.enable_warmth {
        apply_spectral_warmth(samples, config.sample_rate, config.warmth_amount);
        result.warmth_applied = true;
    }

    // 6. Micro-pitch modulation
    if config.enable_micro_pitch {
        apply_micro_pitch_modulation(samples, config.sample_rate, config.pitch_modulation_cents);
        result.pitch_mod_applied = true;
    }

    // 7. Light compression
    if config.enable_compression {
        apply_compression(
            samples,
            config.compression_threshold_db,
            config.compression_ratio,
            5.0,  // 5ms attack
            50.0, // 50ms release
            config.sample_rate,
        );
        result.compression_applied = true;
    }

    // 8. Presence boost
    if config.enable_presence {
        apply_presence_boost(samples, config.sample_rate, config.presence_boost_db);
        result.presence_applied = true;
    }

    result
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_breath_generation() {
        let breath = generate_breath_sample(24000, 50.0);
        assert!(!breath.is_empty());
        assert!(breath.len() == 1200); // 50ms at 24kHz

        // Check that breath is quiet (max should be < 0.1)
        let max = breath.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!(max < 0.15);
    }

    #[test]
    fn test_soft_attack_release() {
        let mut samples = vec![1.0f32; 1000];
        apply_soft_attack(&mut samples, 100);

        // First sample should be near zero
        assert!(samples[0] < 0.01);
        // Last attack sample should be near 1.0
        assert!((samples[99] - 1.0).abs() < 0.1);

        apply_soft_release(&mut samples, 100);
        // Last sample should be near zero
        assert!(samples[999] < 0.01);
    }

    #[test]
    fn test_compression() {
        let mut samples: Vec<f32> = (0..1000).map(|i| (i as f32 * 0.01).sin()).collect();
        let original_max = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);

        apply_compression(&mut samples, -20.0, 2.0, 5.0, 50.0, 24000);

        let compressed_max = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);

        // Compression should reduce peaks
        assert!(compressed_max <= original_max);
    }

    #[test]
    fn test_full_pipeline() {
        let mut samples: Vec<f32> = (0..24000).map(|i| ((i as f32 * 0.01).sin() * 0.5)).collect();

        // Add some silence to create phrase boundaries
        for i in 10000..11000 {
            samples[i] = 0.0;
        }

        let config = PostTtsConfig::default();
        let result = enhance_tts_output(&mut samples, &config);

        assert!(result.warmth_applied);
        assert!(result.compression_applied);
        assert!(result.presence_applied);
    }
}
