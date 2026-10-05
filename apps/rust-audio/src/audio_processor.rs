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

use ringbuf::traits::{Consumer, Observer, RingBuffer, SplitRef};
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
    /// Samples in the frame behind each energy_history entry.
    energy_history_samples: Vec<usize>,
    /// Length of the frame being analyzed.
    frame_len: usize,
    /// Speech time in finished segments (ms).
    speech_ms_done: u64,
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
    pub fn new(mut config: AudioProcessorConfig) -> Self {
        // Autocorrelation down to the lowest pitch needs two periods of it:
        // a fixed 512-sample window was shorter than that at every rate
        // (640 at 16 kHz), so pitch always came back 0.
        let min_window =
            2 * (config.sample_rate as f32 / FeatureConfig::default().min_pitch).ceil() as usize;
        config.window_size = config.window_size.max(min_window);
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
            energy_history_samples: Vec::with_capacity(20),
            frame_len: 0,
            speech_ms_done: 0,
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

        // Push samples into the ring buffer, dropping the oldest when full.
        // (try_push dropped the NEW samples once the 3 s ring filled, which
        // froze the analysis on the first 3 s of the call.)
        for &sample in samples {
            self.ring_buffer.push_overwrite(sample);
        }
        self.frame_len = samples.len();

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

        // Every speech segment so far, not just the one in progress.
        let speech_duration = self.speech_ms_done
            + if self.is_in_speech {
                self.current_time_ms.saturating_sub(self.speech_start_ms)
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
        self.energy_history_samples.clear();
        self.frame_len = 0;
        self.speech_ms_done = 0;
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
        self.energy_history_samples.push(self.frame_len);
        if self.energy_history.len() > self.config.history_size {
            self.energy_history.remove(0);
            self.energy_history_samples.remove(0);
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
                self.speech_ms_done += self.last_speech_ms.saturating_sub(self.speech_start_ms);
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

        // The peaks are from the history window, so divide by its length,
        // not the whole session's (that read 0/s a few seconds in).
        let history_samples: usize = self.energy_history_samples.iter().sum();
        let duration_sec = history_samples as f32 / self.config.sample_rate as f32;
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

    /// Feed `secs` of `f(t)` in 20 ms frames, returning the last result.
    fn feed(p: &mut AudioProcessor, sr: u32, secs: f32, t0: f32, f: impl Fn(f32) -> f32) -> Option<ProsodyResult> {
        let frame = (sr / 50) as usize;
        let frames = (secs * 50.0) as usize;
        let mut last = None;
        for k in 0..frames {
            let start = t0 + k as f32 * 0.02;
            let buf: Vec<f32> = (0..frame).map(|i| f(start + i as f32 / sr as f32)).collect();
            last = p.process_frame_f32(&buf, ((start + 0.02) * 1000.0) as u64).or(last);
        }
        last
    }

    #[test]
    fn pitch_is_tracked_at_every_sample_rate() {
        // The window was a fixed 512 samples but autocorrelation down to
        // 50 Hz needs 2 * sr / 50 (640 at 16 kHz), so pitch was always 0.
        for sr in [16_000u32, 24_000, 48_000] {
            let mut p = AudioProcessor::new(AudioProcessorConfig { sample_rate: sr, ..Default::default() });
            let r = feed(&mut p, sr, 0.5, 0.0, |t| 0.3 * (2.0 * PI * 150.0 * t).sin()).unwrap();
            assert!((r.pitch_hz - 150.0).abs() < 8.0, "{sr} Hz: pitch {}", r.pitch_hz);
        }
    }

    #[test]
    fn speech_rate_counts_syllables_per_second() {
        // 150 Hz voice whose loudness pulses 5 times a second, like syllables.
        let sr = 16_000;
        let mut p = AudioProcessor::new(AudioProcessorConfig { sample_rate: sr, ..Default::default() });
        feed(&mut p, sr, 5.0, 0.0, |t| {
            let env = 0.55 + 0.45 * (2.0 * PI * 5.0 * t).sin();
            0.3 * env * (2.0 * PI * 150.0 * t).sin()
        });
        let rate = p.get_full_features().speech_rate;
        assert!((3.0..=7.0).contains(&rate), "speech rate {rate}/s, expected about 5");
    }

    #[test]
    fn analysis_follows_the_live_audio_past_the_ring_buffer_length() {
        // try_push dropped every sample once the 3 s ring was full, so the
        // analysis froze on the first 3 s of the call.
        let sr = 16_000;
        let mut p = AudioProcessor::new(AudioProcessorConfig { sample_rate: sr, ..Default::default() });
        feed(&mut p, sr, 4.0, 0.0, |t| 0.3 * (2.0 * PI * 150.0 * t).sin());
        let r = feed(&mut p, sr, 1.0, 4.0, |_| 0.0).unwrap();
        assert!(r.energy_db < -60.0, "energy {} dB a second into silence", r.energy_db);
        assert!(!p.is_in_speech, "still in speech a second after the caller stopped");
    }

    #[test]
    fn speaking_ratio_counts_every_speech_segment() {
        // 1 s speech, 1 s silence, 1 s speech, then 1 s silence: half speech.
        let sr = 16_000;
        let mut p = AudioProcessor::new(AudioProcessorConfig { sample_rate: sr, ..Default::default() });
        let voice = |t: f32| 0.3 * (2.0 * PI * 150.0 * t).sin();
        feed(&mut p, sr, 1.0, 0.0, voice);
        feed(&mut p, sr, 1.0, 1.0, |_| 0.0);
        feed(&mut p, sr, 1.0, 2.0, voice);
        feed(&mut p, sr, 1.0, 3.0, |_| 0.0);
        let ratio = p.get_full_features().speaking_ratio;
        assert!((0.35..=0.65).contains(&ratio), "speaking ratio {ratio}, expected about 0.5");
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
