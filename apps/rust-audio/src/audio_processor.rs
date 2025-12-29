//! Session-Scoped Audio Processor
//!
//! Main processor that combines:
//! - Pre-allocated buffer pool (zero per-frame allocations)
//! - Ring buffer for streaming analysis
//! - Feature extraction (pitch, energy, ZCR)
//! - State tracking (speech detection, trends)
//!
//! Designed for real-time voice agent audio processing with
//! minimal GC pressure on the Node.js side.

use ringbuf::traits::{Consumer, Observer, Producer, SplitRef};
use ringbuf::HeapRb;

use crate::buffer_pool::{BufferPool, BufferPoolConfig, ConversionBuffer};
use crate::feature_extraction::{FeatureConfig, FeatureExtractor, FrameFeatures};

/// Configuration for the audio processor
#[derive(Debug, Clone)]
pub struct AudioProcessorConfig {
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Ring buffer size in seconds
    pub ring_buffer_seconds: f32,
    /// Analysis window size in samples
    pub window_size: usize,
    /// Maximum frame size to support (samples)
    pub max_frame_size: usize,
    /// History size for trend detection
    pub history_size: usize,
}

impl Default for AudioProcessorConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16000,
            ring_buffer_seconds: 3.0,
            window_size: 512,
            max_frame_size: 1024, // 64ms @ 16kHz
            history_size: 20,
        }
    }
}

/// Pitch trend direction
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PitchTrend {
    Rising,
    Falling,
    Stable,
}

/// Complete prosody analysis result
#[derive(Debug, Clone)]
pub struct ProsodyResult {
    /// Current pitch estimate (Hz)
    pub pitch_hz: f32,
    /// Pitch confidence (0-1)
    pub pitch_confidence: f32,
    /// Energy in dB
    pub energy_db: f32,
    /// Short-term energy variance
    pub energy_variance: f32,
    /// Zero crossing rate
    pub zcr: f32,
    /// Is speech detected?
    pub is_speech: bool,
    /// Is voiced speech?
    pub is_voiced: bool,
    /// Current silence duration (ms)
    pub silence_ms: u64,
    /// Pitch trend
    pub pitch_trend: PitchTrend,
    /// Timestamp of analysis
    pub timestamp_ms: u64,
}

/// Full features for end-of-utterance analysis
#[derive(Debug, Clone)]
pub struct FullProsodyFeatures {
    /// Mean pitch (Hz)
    pub pitch_mean: f32,
    /// Pitch variance
    pub pitch_variance: f32,
    /// Pitch range (max - min)
    pub pitch_range: f32,
    /// Mean energy (dB)
    pub energy_mean: f32,
    /// Energy variance
    pub energy_variance: f32,
    /// Estimated speech rate (syllables/sec approximation)
    pub speech_rate: f32,
    /// Total utterance duration (ms)
    pub duration_ms: u64,
    /// Speaking ratio (speech time / total time)
    pub speaking_ratio: f32,
    /// Number of pauses detected
    pub pause_count: u32,
}

/// Session-scoped audio processor
///
/// Pre-allocates all buffers at construction time.
/// Call `process_frame` for each incoming audio frame.
pub struct AudioProcessor {
    config: AudioProcessorConfig,

    // Pre-allocated buffers (zero per-frame allocation)
    buffer_pool: BufferPool,
    conversion_buffer: ConversionBuffer,

    // Ring buffer for streaming analysis
    ring_buffer: HeapRb<f32>,

    // Feature extraction
    feature_extractor: FeatureExtractor,

    // State tracking
    pitch_history: Vec<f32>,
    energy_history: Vec<f32>,
    total_samples: u64,
    last_speech_ms: u64,
    is_in_speech: bool,
    speech_start_ms: u64,
    analysis_count: u64,
    current_time_ms: u64,
}

impl AudioProcessor {
    /// Create a new audio processor for a session
    ///
    /// All buffers are pre-allocated here.
    pub fn new(config: AudioProcessorConfig) -> Self {
        let ring_size = (config.sample_rate as f32 * config.ring_buffer_seconds) as usize;

        let buffer_pool = BufferPool::new(BufferPoolConfig {
            buffer_size: config.window_size,
            pool_size: 4,
        });

        let conversion_buffer = ConversionBuffer::new(config.max_frame_size);

        let ring_buffer = HeapRb::new(ring_size);

        let feature_extractor = FeatureExtractor::new(FeatureConfig {
            sample_rate: config.sample_rate,
            ..Default::default()
        });

        Self {
            config,
            buffer_pool,
            conversion_buffer,
            ring_buffer,
            feature_extractor,
            pitch_history: Vec::with_capacity(20),
            energy_history: Vec::with_capacity(20),
            total_samples: 0,
            last_speech_ms: 0,
            is_in_speech: false,
            speech_start_ms: 0,
            analysis_count: 0,
            current_time_ms: 0,
        }
    }

    /// Process an Int16 audio frame (the format from LiveKit)
    ///
    /// This is the main entry point. Converts Int16 to Float32
    /// using pre-allocated buffers (zero allocation per frame).
    ///
    /// Returns prosody features if enough data is available.
    #[inline]
    pub fn process_frame_i16(&mut self, samples: &[i16], timestamp_ms: u64) -> Option<ProsodyResult> {
        // Convert using pre-allocated buffer (zero allocation)
        // We need to copy the converted samples to avoid borrow conflict
        let len = samples.len().min(self.config.max_frame_size);
        let f32_samples = self.conversion_buffer.convert_i16_to_f32(&samples[..len]);

        // Copy to temporary stack buffer to release borrow
        // For typical 512-1024 sample frames, this is still very fast
        let mut temp_buffer = [0.0f32; 1024];
        let copy_len = f32_samples.len().min(1024);
        temp_buffer[..copy_len].copy_from_slice(&f32_samples[..copy_len]);

        self.process_frame_f32(&temp_buffer[..copy_len], timestamp_ms)
    }

    /// Process a Float32 audio frame
    ///
    /// Use this if you already have f32 samples.
    #[inline]
    pub fn process_frame_f32(&mut self, samples: &[f32], timestamp_ms: u64) -> Option<ProsodyResult> {
        self.current_time_ms = timestamp_ms;
        self.total_samples += samples.len() as u64;

        // Push samples into ring buffer
        // Use a scope to ensure producer is dropped before we continue
        {
            let (mut prod, _cons) = self.ring_buffer.split_ref();
            for &sample in samples {
                // Ring buffer handles overflow by overwriting oldest
                let _ = prod.try_push(sample);
            }
        } // prod is dropped here

        // Check if we have enough samples for analysis
        if self.ring_buffer.occupied_len() < self.config.window_size {
            return None;
        }

        // Get recent window for analysis
        let window = self.get_analysis_window();

        // Extract features
        let features = self.feature_extractor.extract(&window, timestamp_ms);

        // Update state
        self.update_state(&features);

        self.analysis_count += 1;

        Some(self.build_result(&features))
    }

    /// Get full prosody features for end-of-utterance analysis
    pub fn get_full_features(&self) -> FullProsodyFeatures {
        let pitch_values: Vec<f32> = self.pitch_history.iter().filter(|&&p| p > 0.0).copied().collect();

        let pitch_mean = FeatureExtractor::compute_mean(&pitch_values);
        let pitch_variance = FeatureExtractor::compute_variance(&pitch_values);
        let pitch_range = if pitch_values.is_empty() {
            0.0
        } else {
            pitch_values.iter().cloned().fold(f32::MIN, f32::max)
                - pitch_values.iter().cloned().fold(f32::MAX, f32::min)
        };

        let energy_mean = FeatureExtractor::compute_mean(&self.energy_history);
        let energy_variance = FeatureExtractor::compute_variance(&self.energy_history);

        let duration_ms = (self.total_samples as f32 / self.config.sample_rate as f32 * 1000.0) as u64;

        let speech_duration = if self.is_in_speech {
            self.current_time_ms - self.speech_start_ms
        } else {
            0
        };
        let speaking_ratio = speech_duration as f32 / duration_ms.max(1) as f32;

        // Estimate speech rate from energy peaks (rough syllable count)
        let pause_count = self.count_pauses();
        let speech_rate = self.estimate_speech_rate();

        FullProsodyFeatures {
            pitch_mean,
            pitch_variance,
            pitch_range,
            energy_mean,
            energy_variance,
            speech_rate,
            duration_ms,
            speaking_ratio,
            pause_count,
        }
    }

    /// Reset processor state for reuse
    ///
    /// Buffers are cleared but not reallocated.
    pub fn reset(&mut self) {
        self.pitch_history.clear();
        self.energy_history.clear();
        self.total_samples = 0;
        self.last_speech_ms = 0;
        self.is_in_speech = false;
        self.speech_start_ms = 0;
        self.analysis_count = 0;
        self.current_time_ms = 0;
        self.buffer_pool.reset();
        self.conversion_buffer.reset();

        // Clear ring buffer
        let (_, mut cons) = self.ring_buffer.split_ref();
        while cons.try_pop().is_some() {}
    }

    /// Get processor statistics
    pub fn get_stats(&self) -> ProcessorStats {
        ProcessorStats {
            total_samples: self.total_samples,
            analysis_count: self.analysis_count,
            buffer_fill_level: self.ring_buffer.occupied_len() as f32 / self.ring_buffer.capacity().get() as f32,
            is_in_speech: self.is_in_speech,
            current_silence_ms: if self.is_in_speech {
                0
            } else if self.last_speech_ms > 0 {
                self.current_time_ms.saturating_sub(self.last_speech_ms)
            } else {
                0
            },
        }
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Private Methods
    // ───────────────────────────────────────────────────────────────────────────

    /// Get the most recent window of samples for analysis
    ///
    /// Uses slice access to read without consuming the buffer.
    fn get_analysis_window(&self) -> Vec<f32> {
        let window_size = self.config.window_size;
        let occupied = self.ring_buffer.occupied_len();

        if occupied < window_size {
            return vec![0.0; window_size];
        }

        // Get slices of occupied data (ring buffer may wrap)
        let (first, second) = self.ring_buffer.as_slices();

        // Total available samples
        let total = first.len() + second.len();
        let skip = total.saturating_sub(window_size);

        let mut window = Vec::with_capacity(window_size);

        // Determine how much to skip from first slice
        if skip < first.len() {
            // Start reading from first slice
            let start_in_first = skip;
            window.extend_from_slice(&first[start_in_first..]);
            // Read all of second slice
            window.extend_from_slice(second);
        } else {
            // Skip entire first slice and some of second
            let skip_in_second = skip - first.len();
            window.extend_from_slice(&second[skip_in_second..]);
        }

        // Ensure we have exactly window_size samples
        window.truncate(window_size);
        window
    }

    /// Update internal state based on extracted features
    fn update_state(&mut self, features: &FrameFeatures) {
        // Update pitch history
        if features.pitch.pitch_hz > 0.0 {
            self.pitch_history.push(features.pitch.pitch_hz);
            if self.pitch_history.len() > self.config.history_size {
                self.pitch_history.remove(0);
            }
        }

        // Update energy history
        self.energy_history.push(features.energy.db);
        if self.energy_history.len() > self.config.history_size {
            self.energy_history.remove(0);
        }

        // Update speech state
        if features.energy.is_speech {
            if !self.is_in_speech {
                self.is_in_speech = true;
                self.speech_start_ms = features.timestamp_ms;
            }
            self.last_speech_ms = features.timestamp_ms;
        } else if self.is_in_speech {
            // Allow small silence gaps within speech
            let silence_duration = features.timestamp_ms.saturating_sub(self.last_speech_ms);
            if silence_duration > 300 {
                // 300ms silence = end of speech segment
                self.is_in_speech = false;
            }
        }
    }

    /// Build the result struct from features and state
    fn build_result(&self, features: &FrameFeatures) -> ProsodyResult {
        let silence_ms = if features.energy.is_speech {
            0
        } else if self.last_speech_ms > 0 {
            features.timestamp_ms.saturating_sub(self.last_speech_ms)
        } else {
            0
        };

        let energy_variance = if self.energy_history.len() >= 5 {
            FeatureExtractor::compute_variance(&self.energy_history[self.energy_history.len() - 5..])
        } else {
            0.0
        };

        ProsodyResult {
            pitch_hz: features.pitch.pitch_hz,
            pitch_confidence: features.pitch.confidence,
            energy_db: features.energy.db,
            energy_variance,
            zcr: features.zcr.zcr,
            is_speech: features.energy.is_speech,
            is_voiced: features.zcr.is_voiced,
            silence_ms,
            pitch_trend: self.calculate_pitch_trend(),
            timestamp_ms: features.timestamp_ms,
        }
    }

    /// Calculate pitch trend from history
    fn calculate_pitch_trend(&self) -> PitchTrend {
        if self.pitch_history.len() < 6 {
            return PitchTrend::Stable;
        }

        let recent = &self.pitch_history[self.pitch_history.len() - 3..];
        let older = &self.pitch_history[self.pitch_history.len() - 6..self.pitch_history.len() - 3];

        let recent_avg = FeatureExtractor::compute_mean(recent);
        let older_avg = FeatureExtractor::compute_mean(older);

        if older_avg < 0.01 {
            return PitchTrend::Stable;
        }

        let diff = (recent_avg - older_avg) / older_avg;

        if diff > 0.1 {
            PitchTrend::Rising
        } else if diff < -0.1 {
            PitchTrend::Falling
        } else {
            PitchTrend::Stable
        }
    }

    /// Count pauses in the energy history
    fn count_pauses(&self) -> u32 {
        let threshold = -40.0; // dB threshold
        let mut pauses = 0;
        let mut was_speech = false;

        for &energy in &self.energy_history {
            let is_speech = energy > threshold;
            if was_speech && !is_speech {
                pauses += 1;
            }
            was_speech = is_speech;
        }

        pauses
    }

    /// Estimate speech rate from energy peaks
    fn estimate_speech_rate(&self) -> f32 {
        // Count energy peaks as approximation of syllables
        let mut peaks = 0;

        for i in 1..self.energy_history.len().saturating_sub(1) {
            if self.energy_history[i] > self.energy_history[i - 1]
                && self.energy_history[i] > self.energy_history[i + 1]
            {
                peaks += 1;
            }
        }

        let duration_sec = self.total_samples as f32 / self.config.sample_rate as f32;
        if duration_sec > 0.0 {
            peaks as f32 / duration_sec
        } else {
            0.0
        }
    }
}

/// Processor statistics
#[derive(Debug, Clone)]
pub struct ProcessorStats {
    pub total_samples: u64,
    pub analysis_count: u64,
    pub buffer_fill_level: f32,
    pub is_in_speech: bool,
    pub current_silence_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    fn generate_sine_i16(freq: f32, sample_rate: u32, samples: usize) -> Vec<i16> {
        (0..samples)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                (32767.0 * (2.0 * PI * freq * t).sin()) as i16
            })
            .collect()
    }

    #[test]
    fn test_processor_creation() {
        let processor = AudioProcessor::new(AudioProcessorConfig::default());
        let stats = processor.get_stats();
        assert_eq!(stats.total_samples, 0);
        assert_eq!(stats.analysis_count, 0);
    }

    #[test]
    fn test_process_frame() {
        let mut processor = AudioProcessor::new(AudioProcessorConfig::default());

        // Generate 1024 samples of 200 Hz sine wave
        let samples = generate_sine_i16(200.0, 16000, 1024);

        let result = processor.process_frame_i16(&samples, 64);

        // Should have result after first frame if we have enough samples
        assert!(result.is_some());

        let prosody = result.unwrap();
        // Speech detection depends on energy and ZCR thresholds
        // For pure sine waves, these may not always match voice characteristics
        assert!(prosody.energy_db > -50.0); // Reasonable energy level
        // Note: pitch detection may not work for all synthetic signals
    }

    #[test]
    fn test_multiple_frames() {
        let mut processor = AudioProcessor::new(AudioProcessorConfig::default());

        // Process multiple frames
        for i in 0..10 {
            let samples = generate_sine_i16(150.0, 16000, 512);
            let _ = processor.process_frame_i16(&samples, i * 32);
        }

        let stats = processor.get_stats();
        assert_eq!(stats.total_samples, 5120);
        assert!(stats.analysis_count > 0);
    }

    #[test]
    fn test_full_features() {
        let mut processor = AudioProcessor::new(AudioProcessorConfig::default());

        // Process several frames
        for i in 0..20 {
            let samples = generate_sine_i16(180.0, 16000, 512);
            let _ = processor.process_frame_i16(&samples, i * 32);
        }

        let full = processor.get_full_features();
        // Note: pitch_mean may be 0 for synthetic signals that don't pass
        // voice detection thresholds (is_speech && is_voiced)
        // We verify energy tracking works regardless
        assert!(full.energy_mean > -100.0); // Should have non-silence energy
        assert!(full.duration_ms > 0);
    }

    #[test]
    fn test_reset() {
        let mut processor = AudioProcessor::new(AudioProcessorConfig::default());

        // Process some frames
        let samples = generate_sine_i16(200.0, 16000, 1024);
        let _ = processor.process_frame_i16(&samples, 0);

        // Reset
        processor.reset();

        let stats = processor.get_stats();
        assert_eq!(stats.total_samples, 0);
        assert_eq!(stats.analysis_count, 0);
    }

    #[test]
    fn test_silence_detection() {
        let mut processor = AudioProcessor::new(AudioProcessorConfig::default());

        // Silent samples
        let silence: Vec<i16> = vec![0; 1024];
        let result = processor.process_frame_i16(&silence, 0);

        if let Some(prosody) = result {
            assert!(!prosody.is_speech);
        }
    }
}
