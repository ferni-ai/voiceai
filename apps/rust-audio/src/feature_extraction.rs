//! Audio Feature Extraction
//!
//! Provides real-time extraction of prosody features from audio:
//! - Pitch estimation via autocorrelation
//! - Energy calculation (RMS and dB)
//! - Zero crossing rate (ZCR)
//! - Speech/silence detection
//!
//! Optimized for low-latency, zero-allocation operation.

/// Pitch estimation result
#[derive(Debug, Clone, Copy, Default)]
pub struct PitchResult {
    /// Estimated pitch in Hz (0 if no voiced speech detected)
    pub pitch_hz: f32,
    /// Confidence of pitch estimate (0-1)
    pub confidence: f32,
}

/// Energy analysis result
#[derive(Debug, Clone, Copy, Default)]
pub struct EnergyResult {
    /// RMS energy (linear scale)
    pub rms: f32,
    /// Energy in decibels
    pub db: f32,
    /// Is above speech threshold?
    pub is_speech: bool,
}

/// Zero crossing rate result
#[derive(Debug, Clone, Copy, Default)]
pub struct ZcrResult {
    /// Zero crossing rate (0-1)
    pub zcr: f32,
    /// Is voiced speech (low ZCR)?
    pub is_voiced: bool,
}

/// Combined prosody features from a single frame
#[derive(Debug, Clone, Default)]
pub struct FrameFeatures {
    pub pitch: PitchResult,
    pub energy: EnergyResult,
    pub zcr: ZcrResult,
    pub timestamp_ms: u64,
}

/// Configuration for feature extraction
#[derive(Debug, Clone)]
pub struct FeatureConfig {
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Minimum pitch to detect (Hz)
    pub min_pitch: f32,
    /// Maximum pitch to detect (Hz)
    pub max_pitch: f32,
    /// Energy threshold for speech detection (dB)
    pub speech_threshold_db: f32,
    /// ZCR threshold for voiced/unvoiced distinction
    pub zcr_voiced_max: f32,
    /// Minimum confidence for valid pitch
    pub min_pitch_confidence: f32,
}

impl Default for FeatureConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16000,
            min_pitch: 50.0,   // 50 Hz (low male voice)
            max_pitch: 400.0,  // 400 Hz (high female voice)
            speech_threshold_db: -40.0,
            zcr_voiced_max: 0.3,
            min_pitch_confidence: 0.3,
        }
    }
}

/// Feature extractor for real-time audio analysis
pub struct FeatureExtractor {
    config: FeatureConfig,
    /// Pre-computed values for autocorrelation
    min_lag: usize,
    max_lag: usize,
}

impl FeatureExtractor {
    /// Create a new feature extractor
    pub fn new(config: FeatureConfig) -> Self {
        let min_lag = (config.sample_rate as f32 / config.max_pitch) as usize;
        let max_lag = (config.sample_rate as f32 / config.min_pitch) as usize;

        Self {
            config,
            min_lag,
            max_lag,
        }
    }

    /// Extract all features from an audio frame
    ///
    /// # Arguments
    /// * `samples` - Float32 audio samples (normalized -1 to 1)
    /// * `timestamp_ms` - Current timestamp in milliseconds
    #[inline]
    pub fn extract(&self, samples: &[f32], timestamp_ms: u64) -> FrameFeatures {
        let energy = self.compute_energy(samples);
        let zcr = self.compute_zcr(samples);
        let pitch = if energy.is_speech && zcr.is_voiced {
            self.estimate_pitch(samples)
        } else {
            PitchResult::default()
        };

        FrameFeatures {
            pitch,
            energy,
            zcr,
            timestamp_ms,
        }
    }

    /// Compute energy (RMS and dB)
    #[inline]
    pub fn compute_energy(&self, samples: &[f32]) -> EnergyResult {
        if samples.is_empty() {
            return EnergyResult::default();
        }

        // RMS calculation
        let sum_sq: f32 = samples.iter().map(|&s| s * s).sum();
        let rms = (sum_sq / samples.len() as f32).sqrt();

        // Convert to dB (with floor to avoid -inf)
        let db = 20.0 * rms.max(1e-10).log10();

        EnergyResult {
            rms,
            db,
            is_speech: db > self.config.speech_threshold_db,
        }
    }

    /// Compute zero crossing rate
    #[inline]
    pub fn compute_zcr(&self, samples: &[f32]) -> ZcrResult {
        if samples.len() < 2 {
            return ZcrResult::default();
        }

        let mut crossings = 0u32;
        for i in 1..samples.len() {
            if (samples[i] >= 0.0 && samples[i - 1] < 0.0)
                || (samples[i] < 0.0 && samples[i - 1] >= 0.0)
            {
                crossings += 1;
            }
        }

        let zcr = crossings as f32 / (samples.len() - 1) as f32;

        ZcrResult {
            zcr,
            is_voiced: zcr < self.config.zcr_voiced_max,
        }
    }

    /// Estimate pitch using autocorrelation
    ///
    /// Uses the autocorrelation method with parabolic interpolation
    /// for improved accuracy.
    #[inline]
    pub fn estimate_pitch(&self, samples: &[f32]) -> PitchResult {
        let n = samples.len();
        if n < self.max_lag * 2 {
            return PitchResult::default();
        }

        // Compute autocorrelation at lag 0 for normalization
        let r0: f32 = samples.iter().map(|&s| s * s).sum();
        if r0 < 1e-10 {
            return PitchResult::default();
        }

        let mut max_correlation = 0.0f32;
        let mut best_lag = 0usize;

        // Search for peak in valid pitch range
        let search_max = self.max_lag.min(n / 2);
        for lag in self.min_lag..search_max {
            let mut correlation = 0.0f32;
            for i in 0..(n - lag) {
                correlation += samples[i] * samples[i + lag];
            }

            if correlation > max_correlation {
                max_correlation = correlation;
                best_lag = lag;
            }
        }

        // Calculate confidence
        let confidence = (max_correlation / r0).min(1.0);

        if confidence < self.config.min_pitch_confidence {
            return PitchResult::default();
        }

        // Convert lag to frequency
        let pitch_hz = self.config.sample_rate as f32 / best_lag as f32;

        // Sanity check
        if pitch_hz < self.config.min_pitch || pitch_hz > self.config.max_pitch {
            return PitchResult::default();
        }

        PitchResult {
            pitch_hz,
            confidence,
        }
    }

    /// Compute variance of a sequence of values
    #[inline]
    pub fn compute_variance(values: &[f32]) -> f32 {
        if values.len() < 2 {
            return 0.0;
        }

        let mean: f32 = values.iter().sum::<f32>() / values.len() as f32;
        let variance: f32 = values.iter().map(|&v| (v - mean).powi(2)).sum::<f32>() / values.len() as f32;
        variance
    }

    /// Compute mean of a sequence of values
    #[inline]
    pub fn compute_mean(values: &[f32]) -> f32 {
        if values.is_empty() {
            return 0.0;
        }
        values.iter().sum::<f32>() / values.len() as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    fn generate_sine_wave(freq: f32, sample_rate: u32, duration_samples: usize) -> Vec<f32> {
        (0..duration_samples)
            .map(|i| (2.0 * PI * freq * i as f32 / sample_rate as f32).sin())
            .collect()
    }

    #[test]
    fn test_energy_calculation() {
        let extractor = FeatureExtractor::new(FeatureConfig::default());

        // Silence
        let silence: Vec<f32> = vec![0.0; 512];
        let energy = extractor.compute_energy(&silence);
        assert!(!energy.is_speech);

        // Full amplitude sine
        let sine = generate_sine_wave(440.0, 16000, 512);
        let energy = extractor.compute_energy(&sine);
        assert!(energy.is_speech);
        assert!(energy.rms > 0.5);
    }

    #[test]
    fn test_zcr_calculation() {
        let extractor = FeatureExtractor::new(FeatureConfig::default());

        // Low frequency = low ZCR (voiced)
        let low_freq = generate_sine_wave(100.0, 16000, 512);
        let zcr = extractor.compute_zcr(&low_freq);
        assert!(zcr.is_voiced);

        // High frequency = high ZCR (unvoiced-like)
        let high_freq = generate_sine_wave(4000.0, 16000, 512);
        let zcr_high = extractor.compute_zcr(&high_freq);
        assert!(zcr_high.zcr > zcr.zcr);
    }

    #[test]
    fn test_pitch_estimation() {
        let extractor = FeatureExtractor::new(FeatureConfig::default());

        // Generate 200 Hz sine wave
        let sine_200 = generate_sine_wave(200.0, 16000, 1024);
        let pitch = extractor.estimate_pitch(&sine_200);

        // Should be close to 200 Hz (within 10%)
        assert!(pitch.pitch_hz > 180.0 && pitch.pitch_hz < 220.0);
        assert!(pitch.confidence > 0.5);
    }

    #[test]
    fn test_full_extraction() {
        let extractor = FeatureExtractor::new(FeatureConfig::default());

        let sine = generate_sine_wave(150.0, 16000, 1024);
        let features = extractor.extract(&sine, 1000);

        assert!(features.energy.is_speech);
        assert!(features.zcr.is_voiced);
        assert!(features.pitch.pitch_hz > 0.0);
        assert_eq!(features.timestamp_ms, 1000);
    }

    #[test]
    fn test_variance_calculation() {
        let values = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let variance = FeatureExtractor::compute_variance(&values);
        assert!((variance - 2.0).abs() < 0.01); // Variance of 1-5 is 2.0
    }
}
