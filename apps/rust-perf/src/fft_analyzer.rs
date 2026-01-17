//! FFT Audio Analyzer
//!
//! SIMD-accelerated Fast Fourier Transform for real-time audio analysis.
//! Eliminates GC pressure by using pre-allocated buffers and zero-copy operations.

use num_complex::Complex;
use rustfft::{Fft, FftPlanner};
use std::sync::Arc;
use wide::f32x8;

/// Pre-allocated FFT processor for zero-allocation audio analysis.
/// Each session should create one and reuse it for all frames.
pub struct FftProcessor {
    /// FFT size (typically 1024 or 2048)
    fft_size: usize,
    /// RustFFT forward transform
    fft: Arc<dyn Fft<f32>>,
    /// Pre-allocated input buffer
    input_buffer: Vec<Complex<f32>>,
    /// Pre-allocated scratch buffer for FFT
    scratch: Vec<Complex<f32>>,
    /// Pre-allocated magnitude buffer
    magnitudes: Vec<f32>,
    /// Previous frame magnitudes for spectral flux
    prev_magnitudes: Vec<f32>,
    /// Hann window coefficients (pre-computed)
    window: Vec<f32>,
}

impl FftProcessor {
    /// Create a new FFT processor with the given size.
    /// FFT size should be a power of 2 (typically 1024 or 2048).
    pub fn new(fft_size: usize) -> Self {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(fft_size);
        let scratch_len = fft.get_inplace_scratch_len();

        // Pre-compute Hann window
        let window: Vec<f32> = (0..fft_size)
            .map(|i| {
                let x = std::f32::consts::PI * i as f32 / (fft_size - 1) as f32;
                0.5 * (1.0 - x.cos())
            })
            .collect();

        Self {
            fft_size,
            fft,
            input_buffer: vec![Complex::new(0.0, 0.0); fft_size],
            scratch: vec![Complex::new(0.0, 0.0); scratch_len],
            magnitudes: vec![0.0; fft_size / 2 + 1],
            prev_magnitudes: vec![0.0; fft_size / 2 + 1],
            window,
        }
    }

    /// Process an audio frame and compute FFT magnitudes.
    /// Input should be f32 samples (normalized to -1.0 to 1.0).
    /// Returns the magnitude spectrum (fft_size/2 + 1 bins).
    pub fn process_frame(&mut self, samples: &[f32]) -> &[f32] {
        let len = samples.len().min(self.fft_size);

        // Apply window and copy to input buffer
        for i in 0..len {
            self.input_buffer[i] = Complex::new(samples[i] * self.window[i], 0.0);
        }

        // Zero-pad if needed
        for i in len..self.fft_size {
            self.input_buffer[i] = Complex::new(0.0, 0.0);
        }

        // Perform FFT in-place
        self.fft
            .process_with_scratch(&mut self.input_buffer, &mut self.scratch);

        // Compute magnitudes using SIMD
        self.compute_magnitudes_simd();

        &self.magnitudes
    }

    /// Compute magnitude spectrum using SIMD.
    #[inline]
    fn compute_magnitudes_simd(&mut self) {
        let num_bins = self.fft_size / 2 + 1;
        let chunks = num_bins / 8;

        // Process 8 bins at a time
        for i in 0..chunks {
            let start = i * 8;

            // Load real and imaginary parts
            let mut re = [0.0f32; 8];
            let mut im = [0.0f32; 8];
            for j in 0..8 {
                re[j] = self.input_buffer[start + j].re;
                im[j] = self.input_buffer[start + j].im;
            }

            let re_vec = f32x8::from(re);
            let im_vec = f32x8::from(im);

            // magnitude = sqrt(re^2 + im^2)
            let mag_sq = re_vec * re_vec + im_vec * im_vec;
            let mag: [f32; 8] = mag_sq.into();

            // sqrt each element (no SIMD sqrt in wide, but this is still faster)
            for j in 0..8 {
                self.magnitudes[start + j] = mag[j].sqrt();
            }
        }

        // Handle remainder
        for i in (chunks * 8)..num_bins {
            let c = self.input_buffer[i];
            self.magnitudes[i] = (c.re * c.re + c.im * c.im).sqrt();
        }
    }

    /// Compute spectral flux (change from previous frame).
    /// Higher values indicate onset/transient.
    pub fn compute_spectral_flux(&mut self, samples: &[f32]) -> f32 {
        // Save current magnitudes
        self.prev_magnitudes.copy_from_slice(&self.magnitudes);

        // Process new frame
        self.process_frame(samples);

        // Compute half-wave rectified spectral flux
        let mut flux = 0.0f32;
        let num_bins = self.magnitudes.len();

        // SIMD-accelerated flux computation
        let chunks = num_bins / 8;
        for i in 0..chunks {
            let start = i * 8;

            let curr = f32x8::from(&self.magnitudes[start..start + 8]);
            let prev = f32x8::from(&self.prev_magnitudes[start..start + 8]);
            let diff = curr - prev;

            // Half-wave rectification (only positive changes)
            let arr: [f32; 8] = diff.into();
            for val in arr.iter() {
                if *val > 0.0 {
                    flux += val;
                }
            }
        }

        // Handle remainder
        for i in (chunks * 8)..num_bins {
            let diff = self.magnitudes[i] - self.prev_magnitudes[i];
            if diff > 0.0 {
                flux += diff;
            }
        }

        flux
    }

    /// Get spectral centroid (brightness measure).
    /// Higher values = brighter/higher frequency content.
    pub fn get_spectral_centroid(&self, sample_rate: f32) -> f32 {
        let bin_width = sample_rate / (self.fft_size as f32);

        let mut weighted_sum = 0.0f32;
        let mut magnitude_sum = 0.0f32;

        for (i, &mag) in self.magnitudes.iter().enumerate() {
            let freq = i as f32 * bin_width;
            weighted_sum += freq * mag;
            magnitude_sum += mag;
        }

        if magnitude_sum > 0.0 {
            weighted_sum / magnitude_sum
        } else {
            0.0
        }
    }

    /// Get spectral rolloff (frequency below which N% of energy is contained).
    pub fn get_spectral_rolloff(&self, threshold: f32) -> usize {
        let total_energy: f32 = self.magnitudes.iter().map(|m| m * m).sum();
        let target = total_energy * threshold;

        let mut cumulative = 0.0f32;
        for (i, &mag) in self.magnitudes.iter().enumerate() {
            cumulative += mag * mag;
            if cumulative >= target {
                return i;
            }
        }

        self.magnitudes.len() - 1
    }

    /// Get zero-crossing rate from samples.
    pub fn get_zero_crossing_rate(samples: &[f32]) -> f32 {
        if samples.len() < 2 {
            return 0.0;
        }

        let mut crossings = 0u32;
        for i in 1..samples.len() {
            if (samples[i] >= 0.0) != (samples[i - 1] >= 0.0) {
                crossings += 1;
            }
        }

        crossings as f32 / (samples.len() - 1) as f32
    }

    /// Get RMS energy of samples.
    pub fn get_rms_energy(samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }

        // SIMD-accelerated RMS
        let chunks = samples.len() / 8;
        let mut sum = f32x8::ZERO;

        for i in 0..chunks {
            let start = i * 8;
            let v = f32x8::from(&samples[start..start + 8]);
            sum += v * v;
        }

        let arr: [f32; 8] = sum.into();
        let mut total: f32 = arr.iter().sum();

        // Handle remainder
        for i in (chunks * 8)..samples.len() {
            total += samples[i] * samples[i];
        }

        (total / samples.len() as f32).sqrt()
    }

    /// Get the FFT size.
    pub fn fft_size(&self) -> usize {
        self.fft_size
    }

    /// Get the number of frequency bins.
    pub fn num_bins(&self) -> usize {
        self.fft_size / 2 + 1
    }

    /// Reset the processor (clear previous frame data).
    pub fn reset(&mut self) {
        for m in self.prev_magnitudes.iter_mut() {
            *m = 0.0;
        }
    }
}

/// Audio feature extraction result.
#[derive(Clone)]
pub struct AudioFeatures {
    /// RMS energy level
    pub rms_energy: f32,
    /// Zero-crossing rate
    pub zero_crossing_rate: f32,
    /// Spectral centroid (brightness)
    pub spectral_centroid: f32,
    /// Spectral flux (onset detection)
    pub spectral_flux: f32,
    /// Spectral rolloff (95% energy)
    pub spectral_rolloff: usize,
    /// Dominant frequency bin
    pub dominant_bin: usize,
    /// Dominant frequency magnitude
    pub dominant_magnitude: f32,
}

impl FftProcessor {
    /// Extract all audio features from a frame.
    pub fn extract_features(&mut self, samples: &[f32], sample_rate: f32) -> AudioFeatures {
        let rms_energy = Self::get_rms_energy(samples);
        let zero_crossing_rate = Self::get_zero_crossing_rate(samples);
        let spectral_flux = self.compute_spectral_flux(samples);
        let spectral_centroid = self.get_spectral_centroid(sample_rate);
        let spectral_rolloff = self.get_spectral_rolloff(0.95);

        // Find dominant frequency
        let (dominant_bin, dominant_magnitude) = self
            .magnitudes
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .map(|(i, &m)| (i, m))
            .unwrap_or((0, 0.0));

        AudioFeatures {
            rms_energy,
            zero_crossing_rate,
            spectral_centroid,
            spectral_flux,
            spectral_rolloff,
            dominant_bin,
            dominant_magnitude,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fft_processor_creation() {
        let processor = FftProcessor::new(1024);
        assert_eq!(processor.fft_size(), 1024);
        assert_eq!(processor.num_bins(), 513);
    }

    #[test]
    fn test_process_sine_wave() {
        let mut processor = FftProcessor::new(1024);
        let sample_rate = 16000.0;
        let freq = 440.0; // A4

        // Generate sine wave
        let samples: Vec<f32> = (0..1024)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sample_rate).sin())
            .collect();

        let magnitudes = processor.process_frame(&samples);
        assert_eq!(magnitudes.len(), 513);

        // Find peak (should be near 440Hz bin)
        let expected_bin = (freq / (sample_rate / 1024.0)) as usize;
        let (peak_bin, _) = magnitudes
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap();

        // Allow some tolerance due to windowing
        assert!((peak_bin as i32 - expected_bin as i32).abs() <= 2);
    }

    #[test]
    fn test_spectral_flux() {
        let mut processor = FftProcessor::new(512);

        // Silent frame
        let silence = vec![0.0f32; 512];
        let flux1 = processor.compute_spectral_flux(&silence);

        // Loud frame (onset)
        let noise: Vec<f32> = (0..512).map(|i| (i as f32 * 0.1).sin()).collect();
        let flux2 = processor.compute_spectral_flux(&noise);

        // Flux should be higher for onset
        assert!(flux2 > flux1);
    }

    #[test]
    fn test_rms_energy() {
        let samples = vec![0.5f32; 100];
        let rms = FftProcessor::get_rms_energy(&samples);
        assert!((rms - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_zero_crossing_rate() {
        // High frequency = many crossings
        let high_freq: Vec<f32> = (0..100)
            .map(|i| if i % 2 == 0 { 1.0 } else { -1.0 })
            .collect();
        let zcr = FftProcessor::get_zero_crossing_rate(&high_freq);
        assert!(zcr > 0.9);

        // Constant = no crossings
        let constant = vec![1.0f32; 100];
        let zcr2 = FftProcessor::get_zero_crossing_rate(&constant);
        assert_eq!(zcr2, 0.0);
    }
}
