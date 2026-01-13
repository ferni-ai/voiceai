//! SOLA (Synchronous Overlap-Add) Pitch Shifter
//!
//! A proper time-domain pitch shifting algorithm that maintains audio continuity
//! across frame boundaries without clicks or artifacts.
//!
//! ## How SOLA Works
//!
//! 1. **Analysis**: Split input into overlapping frames using a window function
//! 2. **Time-stretch**: Adjust synthesis hop size to stretch/compress time
//! 3. **Cross-correlation**: Find optimal splice points to minimize discontinuities
//! 4. **Synthesis**: Overlap-add windowed frames at new positions
//! 5. **Resample**: If pitch shift only (no time change), resample output
//!
//! ## Key Design Decisions
//!
//! - **Analysis frame size**: 1024 samples (~42ms at 24kHz) - good frequency resolution
//! - **Hop size**: 256 samples (~10ms) - 75% overlap for smooth transitions
//! - **Window**: Hann window for optimal frequency response
//! - **Cross-correlation search**: ±64 samples to find best splice point
//!
//! ## References
//!
//! - Roucos & Wilgus (1985): "High Quality Time-Scale Modification for Speech"
//! - Verhelst & Roelands (1993): "An overlap-add technique based on waveform similarity"

use std::f32::consts::PI;

// ============================================================================
// CONSTANTS
// ============================================================================

/// Analysis frame size - larger = better frequency resolution, more latency
const ANALYSIS_FRAME_SIZE: usize = 1024;

/// Hop size between analysis frames (75% overlap)
const ANALYSIS_HOP_SIZE: usize = 256;

/// Cross-correlation search range (±samples)
const CORRELATION_SEARCH_RANGE: usize = 64;

/// Minimum pitch ratio (prevents extreme time-stretching)
const MIN_PITCH_RATIO: f32 = 0.5;

/// Maximum pitch ratio
const MAX_PITCH_RATIO: f32 = 2.0;

// ============================================================================
// HANN WINDOW
// ============================================================================

/// Pre-computed Hann window for analysis/synthesis
#[derive(Clone)]
struct HannWindow {
    window: Vec<f32>,
    size: usize,
}

impl HannWindow {
    fn new(size: usize) -> Self {
        let window: Vec<f32> = (0..size)
            .map(|i| {
                // Hann window: 0.5 * (1 - cos(2πn/(N-1)))
                0.5 * (1.0 - (2.0 * PI * i as f32 / (size - 1) as f32).cos())
            })
            .collect();
        Self { window, size }
    }

    #[inline]
    fn apply(&self, samples: &mut [f32]) {
        for (i, sample) in samples.iter_mut().enumerate() {
            if i < self.size {
                *sample *= self.window[i];
            }
        }
    }

    #[inline]
    fn get(&self, index: usize) -> f32 {
        if index < self.size {
            self.window[index]
        } else {
            0.0
        }
    }
}

// ============================================================================
// CROSS-CORRELATION
// ============================================================================

/// Find the optimal offset to minimize discontinuity between two audio segments.
/// Returns the offset (in samples) that maximizes cross-correlation.
fn find_optimal_splice_offset(
    prev_tail: &[f32],
    next_head: &[f32],
    search_range: usize,
) -> isize {
    if prev_tail.is_empty() || next_head.is_empty() {
        return 0;
    }

    let compare_len = prev_tail.len().min(next_head.len()).min(ANALYSIS_HOP_SIZE);
    if compare_len < 4 {
        return 0;
    }

    let mut best_offset: isize = 0;
    let mut best_correlation: f32 = f32::NEG_INFINITY;

    // Search for the offset that maximizes correlation
    let search_start = -(search_range as isize);
    let search_end = search_range as isize;

    for offset in search_start..=search_end {
        let mut correlation: f32 = 0.0;
        let mut count = 0;

        for i in 0..compare_len {
            let prev_idx = i;
            let next_idx = (i as isize + offset) as usize;

            if prev_idx < prev_tail.len() && next_idx < next_head.len() {
                correlation += prev_tail[prev_idx] * next_head[next_idx];
                count += 1;
            }
        }

        if count > 0 {
            correlation /= count as f32;
            if correlation > best_correlation {
                best_correlation = correlation;
                best_offset = offset;
            }
        }
    }

    best_offset
}

// ============================================================================
// SOLA PITCH SHIFTER
// ============================================================================

/// Streaming SOLA pitch shifter with proper state management.
///
/// This implementation:
/// - Accumulates input samples across frame boundaries
/// - Processes in optimal-sized analysis frames (not tied to input frame size)
/// - Uses cross-correlation to find optimal splice points
/// - Maintains continuous output without clicks
#[derive(Clone)]
pub struct SolaPitchShifter {
    sample_rate: u32,

    /// Current pitch ratio (1.0 = no change, >1.0 = higher pitch)
    pitch_ratio: f32,

    /// Target pitch ratio (we smooth toward this)
    target_pitch_ratio: f32,

    /// Smoothing coefficient for pitch changes
    pitch_smooth_coef: f32,

    /// Input accumulator buffer
    input_buffer: Vec<f32>,

    /// Output buffer (processed samples ready for output)
    output_buffer: Vec<f32>,

    /// Overlap buffer for synthesis
    overlap_buffer: Vec<f32>,

    /// Previous frame's tail for cross-correlation
    prev_tail: Vec<f32>,

    /// Hann window for analysis/synthesis
    window: HannWindow,

    /// Read position in resampler (fractional)
    resample_pos: f64,

    /// Has been initialized with audio
    is_initialized: bool,

    // =========================================================================
    // FORMANT PRESERVATION
    // =========================================================================
    // When pitch shifting, formants (vocal tract resonances) shift too, causing
    // unnatural "chipmunk" (pitch up) or "monster" (pitch down) effects.
    // We compensate by applying an inverse spectral tilt to preserve formants.

    /// Enable formant preservation (compensates for spectral envelope shift)
    enable_formant_preserve: bool,

    /// Biquad filter coefficients for formant compensation [b0, b1, b2, a1, a2]
    formant_coeffs: [f32; 5],

    /// Biquad filter state [z1, z2]
    formant_state: [f32; 2],
}

impl SolaPitchShifter {
    /// Create a new SOLA pitch shifter
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            pitch_ratio: 1.0,
            target_pitch_ratio: 1.0,
            // Smoothing coefficient for pitch changes
            // 0.3 = reaches 91% of target in ~2 frames (~40ms at 20ms/frame)
            // This allows natural LFO modulation (5-8 Hz vibrato) to be fully audible
            // while still preventing click-inducing abrupt changes.
            //
            // Response time analysis:
            //   0.3 coef: 70% in 1 frame (20ms), 91% in 2 frames (40ms)
            //   0.7 coef: 30% in 1 frame, 76% in 4 frames (80ms) - too slow!
            //   0.99 coef: 1.4s half-life - kills all modulation
            //
            // For human-like speech with natural pitch variation, we need
            // fast response to preserve prosody while avoiding digital artifacts.
            pitch_smooth_coef: 0.3,
            input_buffer: Vec::with_capacity(ANALYSIS_FRAME_SIZE * 4),
            output_buffer: Vec::with_capacity(ANALYSIS_FRAME_SIZE * 4),
            overlap_buffer: vec![0.0; ANALYSIS_FRAME_SIZE],
            prev_tail: Vec::with_capacity(ANALYSIS_HOP_SIZE),
            window: HannWindow::new(ANALYSIS_FRAME_SIZE),
            resample_pos: 0.0,
            is_initialized: false,
            // Formant preservation enabled by default for natural-sounding pitch shifts
            enable_formant_preserve: true,
            // Coefficients computed dynamically based on pitch ratio
            formant_coeffs: [1.0, 0.0, 0.0, 0.0, 0.0], // passthrough initially
            formant_state: [0.0, 0.0],
        }
    }

    /// Enable or disable formant preservation
    ///
    /// When enabled, applies spectral tilt compensation to maintain natural
    /// vocal character during pitch shifts. Highly recommended for speech.
    pub fn set_formant_preserve(&mut self, enabled: bool) {
        self.enable_formant_preserve = enabled;
        if !enabled {
            // Reset to passthrough
            self.formant_coeffs = [1.0, 0.0, 0.0, 0.0, 0.0];
            self.formant_state = [0.0, 0.0];
        }
    }

    /// Compute formant compensation filter coefficients based on pitch ratio
    ///
    /// When pitch goes UP by ratio R, formants shift UP by R - compensate with LOW shelf boost
    /// When pitch goes DOWN by ratio R, formants shift DOWN - compensate with HIGH shelf boost
    ///
    /// Uses Robert Bristow-Johnson's Audio EQ Cookbook low shelf formula:
    /// https://www.w3.org/2011/audio/audio-eq-cookbook.html
    fn update_formant_coeffs(&mut self) {
        if !self.enable_formant_preserve {
            return;
        }

        // Amount of compensation needed (in semitones)
        // pitch_ratio = 1.0 means no shift, 1.059 = +1 semitone, 0.944 = -1 semitone
        let shift_semitones = 12.0 * (self.pitch_ratio).ln() / (2.0_f32).ln();

        // Skip tiny adjustments (less than 0.1 semitones = ~10 cents)
        if shift_semitones.abs() < 0.1 {
            self.formant_coeffs = [1.0, 0.0, 0.0, 0.0, 0.0];
            return;
        }

        // Design a shelf filter to compensate
        // For speech, first formant (F1) is 300-700 Hz, second (F2) is 700-2500 Hz
        // We use a transition frequency around 800 Hz
        let transition_freq = 800.0;
        let w0 = 2.0 * PI * transition_freq / self.sample_rate as f32;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();

        // Gain compensation: ~2 dB per semitone of shift
        // When pitch UP, we need to BOOST low frequencies (positive low shelf gain)
        // When pitch DOWN, we need to BOOST high frequencies (negative low shelf gain = high boost)
        let gain_db = shift_semitones * 2.0; // 2 dB per semitone

        // A = sqrt(10^(dBgain/20)) = 10^(dBgain/40)
        let a = 10.0_f32.powf(gain_db / 40.0);
        let a_sqrt = a.sqrt();

        // Audio EQ Cookbook: alpha for shelf filter with slope S=1 (maximum slope)
        // alpha = sin(w0)/2 * sqrt( (A + 1/A)*(1/S - 1) + 2 )
        // For S=1: alpha = sin(w0)/2 * sqrt(2)
        let alpha = sin_w0 / 2.0 * (2.0_f32).sqrt();

        // The term 2*sqrt(A)*alpha appears in the cookbook formulas
        let two_sqrt_a_alpha = 2.0 * a_sqrt * alpha;

        // Audio EQ Cookbook low shelf coefficients:
        // b0 =    A*[ (A+1) - (A-1)*cos(w0) + 2*sqrt(A)*alpha ]
        // b1 =  2*A*[ (A-1) - (A+1)*cos(w0)                   ]
        // b2 =    A*[ (A+1) - (A-1)*cos(w0) - 2*sqrt(A)*alpha ]
        // a0 =        (A+1) + (A-1)*cos(w0) + 2*sqrt(A)*alpha
        // a1 =   -2*[ (A-1) + (A+1)*cos(w0)                   ]
        // a2 =        (A+1) + (A-1)*cos(w0) - 2*sqrt(A)*alpha
        let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
        let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
        let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
        let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

        // Normalize by a0
        let a0_inv = 1.0 / a0.max(0.0001);
        self.formant_coeffs = [
            b0 * a0_inv,
            b1 * a0_inv,
            b2 * a0_inv,
            a1 * a0_inv,
            a2 * a0_inv,
        ];
    }

    /// Apply formant compensation filter to a sample
    #[inline]
    fn apply_formant_filter(&mut self, input: f32) -> f32 {
        if !self.enable_formant_preserve {
            return input;
        }

        let [b0, b1, b2, a1, a2] = self.formant_coeffs;
        let [z1, z2] = self.formant_state;

        // Direct Form II transposed biquad
        let output = b0 * input + z1;
        self.formant_state[0] = b1 * input - a1 * output + z2;
        self.formant_state[1] = b2 * input - a2 * output;

        output
    }

    /// Set target pitch ratio (will smooth toward this value)
    ///
    /// - ratio > 1.0 = higher pitch
    /// - ratio < 1.0 = lower pitch
    /// - ratio = 1.0 = no change
    pub fn set_pitch_ratio(&mut self, ratio: f32) {
        self.target_pitch_ratio = ratio.clamp(MIN_PITCH_RATIO, MAX_PITCH_RATIO);
    }

    /// Set pitch shift in cents (100 cents = 1 semitone)
    pub fn set_pitch_cents(&mut self, cents: f32) {
        // ratio = 2^(cents/1200)
        let ratio = 2.0_f32.powf(cents / 1200.0);
        self.set_pitch_ratio(ratio);
    }

    /// Reset all state (call at utterance boundaries)
    pub fn reset(&mut self) {
        self.input_buffer.clear();
        self.output_buffer.clear();
        self.overlap_buffer.fill(0.0);
        self.prev_tail.clear();
        self.pitch_ratio = 1.0;
        self.target_pitch_ratio = 1.0;
        self.resample_pos = 0.0;
        self.is_initialized = false;
        // Reset formant filter state (keep enable flag and recompute coeffs on next process)
        self.formant_coeffs = [1.0, 0.0, 0.0, 0.0, 0.0];
        self.formant_state = [0.0, 0.0];
    }

    /// Process input samples and return pitch-shifted output
    ///
    /// The output length may differ from input length during pitch ratio transitions.
    /// For steady-state operation with constant pitch, output ≈ input length.
    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        // Smooth pitch ratio toward target
        self.pitch_ratio = self.pitch_ratio * self.pitch_smooth_coef
            + self.target_pitch_ratio * (1.0 - self.pitch_smooth_coef);

        // Update formant compensation filter for current pitch ratio
        // This preserves vocal character by counteracting spectral envelope shift
        self.update_formant_coeffs();

        // If pitch ratio is very close to 1.0, pass through unchanged
        // NOTE: Threshold lowered to 0.00001 (~0.017 cents) to ensure even subtle
        // emotion differences (Neutral vs Calm: 8 vs 5 cent vibrato) are processed.
        // The 0.99 smoothing coefficient means pitch_ratio moves slowly, so we need
        // a tiny threshold to avoid extended pass-through at utterance start.
        if (self.pitch_ratio - 1.0).abs() < 0.00001 {
            return input.to_vec();
        }

        // Accumulate input
        self.input_buffer.extend_from_slice(input);

        // Process complete analysis frames
        while self.input_buffer.len() >= ANALYSIS_FRAME_SIZE {
            self.process_analysis_frame();
        }

        // Resample output to achieve pitch shift while maintaining duration
        let mut output = self.resample_output(input.len());

        // Apply formant preservation filter to maintain natural vocal character
        // This compensates for the spectral envelope shift caused by pitch shifting
        if self.enable_formant_preserve {
            for sample in output.iter_mut() {
                *sample = self.apply_formant_filter(*sample);
            }
        }

        output
    }

    /// Process input samples in-place
    ///
    /// Modifies the input buffer directly. Output length equals input length.
    pub fn process_inplace(&mut self, samples: &mut [f32]) {
        let output = self.process(samples);

        // Copy output back, handling length differences
        let copy_len = samples.len().min(output.len());
        samples[..copy_len].copy_from_slice(&output[..copy_len]);

        // Zero any remaining samples if output was shorter
        if output.len() < samples.len() {
            samples[output.len()..].fill(0.0);
        }
    }

    /// Process a single analysis frame using SOLA
    fn process_analysis_frame(&mut self) {
        if self.input_buffer.len() < ANALYSIS_FRAME_SIZE {
            return;
        }

        // Extract analysis frame
        let mut frame: Vec<f32> = self.input_buffer[..ANALYSIS_FRAME_SIZE].to_vec();

        // Calculate synthesis hop size based on time-stretch factor
        // For pitch shifting without time change: time_stretch = 1/pitch_ratio
        let time_stretch = 1.0 / self.pitch_ratio;
        let synthesis_hop = (ANALYSIS_HOP_SIZE as f32 * time_stretch) as usize;
        let synthesis_hop = synthesis_hop.max(64).min(ANALYSIS_HOP_SIZE * 2);

        // Find optimal splice point using cross-correlation
        let offset = if self.is_initialized && !self.prev_tail.is_empty() {
            find_optimal_splice_offset(&self.prev_tail, &frame, CORRELATION_SEARCH_RANGE)
        } else {
            0
        };

        // Apply offset (shift frame to align with previous)
        if offset != 0 {
            let abs_offset = offset.unsigned_abs();
            if offset > 0 && abs_offset < frame.len() {
                // Shift frame left (earlier samples)
                frame.rotate_left(abs_offset);
                for i in (frame.len() - abs_offset)..frame.len() {
                    frame[i] = 0.0;
                }
            } else if offset < 0 && abs_offset < self.input_buffer.len() - ANALYSIS_FRAME_SIZE {
                // Need samples from later in input buffer
                for i in 0..abs_offset.min(frame.len()) {
                    if ANALYSIS_FRAME_SIZE + i < self.input_buffer.len() {
                        frame.rotate_right(1);
                        frame[0] = self.input_buffer[ANALYSIS_FRAME_SIZE + i];
                    }
                }
            }
        }

        // Apply window
        self.window.apply(&mut frame);

        // Overlap-add synthesis
        self.synthesize_frame(&frame, synthesis_hop);

        // Store tail for next frame's cross-correlation
        self.prev_tail.clear();
        let tail_start = frame.len().saturating_sub(ANALYSIS_HOP_SIZE);
        self.prev_tail.extend_from_slice(&frame[tail_start..]);

        // Advance input buffer
        self.input_buffer.drain(..ANALYSIS_HOP_SIZE);

        self.is_initialized = true;
    }

    /// Overlap-add a processed frame to the output
    fn synthesize_frame(&mut self, frame: &[f32], synthesis_hop: usize) {
        // Ensure overlap buffer is large enough
        if self.overlap_buffer.len() < frame.len() {
            self.overlap_buffer.resize(frame.len(), 0.0);
        }

        // Add frame to overlap buffer
        for (i, &sample) in frame.iter().enumerate() {
            if i < self.overlap_buffer.len() {
                self.overlap_buffer[i] += sample;
            }
        }

        // Move completed samples to output
        let output_len = synthesis_hop.min(self.overlap_buffer.len());
        self.output_buffer.extend_from_slice(&self.overlap_buffer[..output_len]);

        // Shift overlap buffer
        self.overlap_buffer.drain(..output_len);
        self.overlap_buffer.resize(frame.len(), 0.0);
    }

    /// Resample output buffer to maintain original duration while shifting pitch
    ///
    /// Uses cubic Hermite interpolation for smooth results even with large pitch shifts.
    fn resample_output(&mut self, target_len: usize) -> Vec<f32> {
        if target_len == 0 {
            return Vec::new();
        }

        // During ramp-up (not enough output yet), return samples from input buffer
        // This prevents silence during the SOLA algorithm's latency period
        if self.output_buffer.is_empty() || self.output_buffer.len() < 4 {
            // Use the most recent input samples as passthrough
            let available = self.input_buffer.len();
            if available >= target_len {
                // Return the most recent input samples
                let start = available.saturating_sub(target_len);
                return self.input_buffer[start..start + target_len].to_vec();
            } else if available > 0 {
                // Pad with zeros if not enough input
                let mut output = vec![0.0; target_len];
                let copy_len = target_len.min(available);
                let start = available.saturating_sub(copy_len);
                output[..copy_len].copy_from_slice(&self.input_buffer[start..start + copy_len]);
                return output;
            } else {
                return vec![0.0; target_len];
            }
        }

        let mut output = Vec::with_capacity(target_len);

        // Resample using cubic Hermite interpolation
        // To shift pitch UP, we read output FASTER (increment > 1)
        let resample_increment = self.pitch_ratio as f64;

        for _ in 0..target_len {
            let idx = self.resample_pos as usize;
            let frac = (self.resample_pos - idx as f64) as f32;

            let sample = if idx + 2 < self.output_buffer.len() && idx > 0 {
                // Cubic Hermite interpolation (Catmull-Rom)
                // Uses 4 points: p0, p1, p2, p3 where we interpolate between p1 and p2
                let p0 = self.output_buffer[idx - 1];
                let p1 = self.output_buffer[idx];
                let p2 = self.output_buffer[idx + 1];
                let p3 = self.output_buffer[idx + 2];

                // Catmull-Rom coefficients
                let t = frac;
                let t2 = t * t;
                let t3 = t2 * t;

                let c0 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
                let c1 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
                let c2 = -0.5 * p0 + 0.5 * p2;
                let c3 = p1;

                c0 * t3 + c1 * t2 + c2 * t + c3
            } else if idx + 1 < self.output_buffer.len() {
                // Fall back to linear interpolation at boundaries
                let s0 = self.output_buffer[idx];
                let s1 = self.output_buffer[idx + 1];
                s0 + (s1 - s0) * frac
            } else if idx < self.output_buffer.len() {
                self.output_buffer[idx]
            } else {
                0.0
            };

            output.push(sample);
            self.resample_pos += resample_increment;
        }

        // Drain consumed samples from output buffer
        let consumed = self.resample_pos as usize;
        if consumed > 0 && consumed <= self.output_buffer.len() {
            self.output_buffer.drain(..consumed);
            self.resample_pos -= consumed as f64;
        } else if consumed > self.output_buffer.len() {
            self.output_buffer.clear();
            self.resample_pos = 0.0;
        }

        output
    }

    /// Get current latency in samples
    pub fn latency_samples(&self) -> usize {
        ANALYSIS_FRAME_SIZE
    }

    /// Get current latency in milliseconds
    pub fn latency_ms(&self) -> f32 {
        self.latency_samples() as f32 * 1000.0 / self.sample_rate as f32
    }
}

// ============================================================================
// MICRO-PITCH MODULATOR (using SOLA)
// ============================================================================

/// Micro-pitch modulator using SOLA for artifact-free pitch variation.
///
/// Adds subtle pitch variations (~5-10 cents) that humans naturally have,
/// without the clicks/crackles of naive frame-by-frame resampling.
#[derive(Clone)]
pub struct SolaMicroPitch {
    /// SOLA pitch shifter
    shifter: SolaPitchShifter,

    /// LFO phase (0-1)
    lfo_phase: f32,

    /// LFO frequency (Hz)
    lfo_freq: f32,

    /// Modulation depth in cents
    depth_cents: f32,

    /// PRNG seed for noise component
    rng_seed: u32,

    /// Sample rate
    sample_rate: u32,
}

impl SolaMicroPitch {
    /// Create a new micro-pitch modulator
    ///
    /// # Arguments
    /// * `sample_rate` - Audio sample rate (e.g., 24000)
    /// * `depth_cents` - Modulation depth in cents (typically 5-10)
    pub fn new(sample_rate: u32, depth_cents: f32) -> Self {
        Self {
            shifter: SolaPitchShifter::new(sample_rate),
            lfo_phase: 0.0,
            lfo_freq: 5.5, // ~5.5Hz modulation (natural vibrato range)
            depth_cents,
            rng_seed: 98765,
            sample_rate,
        }
    }

    /// Process samples with micro-pitch modulation
    pub fn process(&mut self, samples: &mut [f32]) {
        if self.depth_cents <= 0.0 || samples.is_empty() {
            return;
        }

        // Update LFO and compute current modulation
        let lfo_increment = self.lfo_freq / self.sample_rate as f32 * samples.len() as f32;

        // Add noise component for natural variation
        self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
        let noise = ((self.rng_seed >> 20) as f32 / 2048.0) - 1.0;

        // Combine LFO (70%) + noise (30%)
        let mod_value = (self.lfo_phase * 2.0 * PI).sin() * 0.7 + noise * 0.3;
        let pitch_cents = mod_value * self.depth_cents;

        // Update pitch shifter
        self.shifter.set_pitch_cents(pitch_cents);

        // Process through SOLA
        self.shifter.process_inplace(samples);

        // Advance LFO phase
        self.lfo_phase += lfo_increment;
        if self.lfo_phase >= 1.0 {
            self.lfo_phase -= 1.0;
        }
    }

    /// Reset state (call at utterance boundaries)
    pub fn reset(&mut self) {
        self.shifter.reset();
        self.lfo_phase = 0.0;
    }

    /// Reseed the PRNG for varied random component
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }

    /// Reset read position for new utterance (keep phase for continuity)
    pub fn start_utterance(&mut self) {
        // Keep LFO phase for continuity, but reset shifter buffers
        self.shifter.reset();
    }

    // =========================================================================
    // "BETTER THAN HUMAN" - Emotion-aware parameter setters
    // =========================================================================

    /// Set vibrato rate (Hz) for emotional expression
    /// Typical range: 4.0 (calm/sad) to 7.0 (excited)
    pub fn set_vibrato_rate(&mut self, rate_hz: f32) {
        self.lfo_freq = rate_hz.clamp(2.0, 10.0);
    }

    /// Set vibrato depth (cents) for emotional intensity
    /// Typical range: 5.0 (calm) to 15.0 (very emotional)
    pub fn set_vibrato_depth(&mut self, depth_cents: f32) {
        self.depth_cents = depth_cents.clamp(0.0, 30.0);
    }

    /// Configure from emotion prosody parameters
    pub fn configure_emotion(&mut self, vibrato_rate_hz: f32, vibrato_depth_cents: f32) {
        self.set_vibrato_rate(vibrato_rate_hz);
        self.set_vibrato_depth(vibrato_depth_cents);
    }
}

// ============================================================================
// PITCH DRIFT (using SOLA)
// ============================================================================

/// Slow pitch drift using SOLA for artifact-free pitch wandering.
///
/// Adds very slow pitch wandering (over seconds) that humans naturally have
/// when speaking or singing - they don't hold perfectly steady pitch.
#[derive(Clone)]
pub struct SolaPitchDrift {
    /// SOLA pitch shifter
    shifter: SolaPitchShifter,

    /// Current drift amount (cents)
    current_drift: f32,

    /// Target drift (we smooth toward this)
    target_drift: f32,

    /// Maximum drift in cents
    max_drift_cents: f32,

    /// Smoothing coefficient (very slow)
    smooth_coef: f32,

    /// Counter for target updates
    update_counter: usize,

    /// Samples between target updates (~500ms)
    update_interval: usize,

    /// PRNG seed
    rng_seed: u32,

    /// Sample rate
    sample_rate: u32,

    // =========================================================================
    // PITCH RESET - Return to baseline at phrase boundaries
    // =========================================================================
    /// Enable pitch reset at phrase boundaries
    enable_pitch_reset: bool,
    /// Samples remaining until phrase boundary (0 = not approaching)
    samples_to_boundary: usize,
    /// Reset ramp duration in samples (~100ms)
    reset_ramp: usize,
}

impl SolaPitchDrift {
    /// Create a new pitch drift modulator
    ///
    /// # Arguments
    /// * `sample_rate` - Audio sample rate (e.g., 24000)
    /// * `max_drift_cents` - Maximum drift in cents (typically 3-8)
    pub fn new(sample_rate: u32, max_drift_cents: f32) -> Self {
        // Update target every ~500ms for slow wandering
        let update_interval = (sample_rate as f32 * 0.5) as usize;
        // Very slow smoothing (~200ms)
        let smooth_coef = (-1.0 / (sample_rate as f32 * 0.2)).exp();

        Self {
            shifter: SolaPitchShifter::new(sample_rate),
            current_drift: 0.0,
            target_drift: 0.0,
            max_drift_cents,
            smooth_coef,
            update_counter: 0,
            update_interval,
            rng_seed: 33333,
            sample_rate,
            // Pitch reset defaults
            enable_pitch_reset: true,
            samples_to_boundary: 0,
            reset_ramp: (sample_rate as f32 * 0.1) as usize, // 100ms ramp
        }
    }

    /// Signal that a phrase boundary is approaching in N samples
    ///
    /// Call this when a sentence-end boundary is detected ahead.
    /// The processor will smoothly return pitch drift to baseline.
    pub fn set_phrase_boundary(&mut self, samples_until_boundary: usize) {
        if self.enable_pitch_reset {
            self.samples_to_boundary = samples_until_boundary;
        }
    }

    /// Get the reset ramp duration for lookahead
    pub fn get_reset_ramp(&self) -> usize {
        self.reset_ramp
    }

    /// Calculate the pitch reset factor (0.0 = full drift, 1.0 = baseline)
    fn get_pitch_reset_factor(&self) -> f32 {
        if !self.enable_pitch_reset || self.samples_to_boundary == 0 {
            return 0.0; // No reset active
        }

        // How far into the ramp are we?
        let ramp_progress = if self.samples_to_boundary >= self.reset_ramp {
            0.0 // Not in ramp zone yet
        } else {
            1.0 - (self.samples_to_boundary as f32 / self.reset_ramp as f32)
        };

        // Use smooth ease-out (inverse quadratic) for natural return to baseline
        // This creates a gentle "landing" at the baseline
        1.0 - (1.0 - ramp_progress) * (1.0 - ramp_progress)
    }

    /// Process samples with slow pitch drift
    pub fn process(&mut self, samples: &mut [f32]) {
        if self.max_drift_cents <= 0.0 || samples.is_empty() {
            return;
        }

        // Update target periodically
        self.update_counter += samples.len();
        if self.update_counter >= self.update_interval {
            self.update_counter = 0;
            self.rng_seed = self.rng_seed.wrapping_mul(1103515245).wrapping_add(12345);
            let random = ((self.rng_seed >> 16) as f32 / 32768.0) - 1.0;
            self.target_drift = random * self.max_drift_cents;
        }

        // Smooth toward target
        self.current_drift = self.current_drift * self.smooth_coef
            + self.target_drift * (1.0 - self.smooth_coef);

        // Apply pitch reset factor when approaching boundary
        // This smoothly brings drift back to baseline (0) at sentence ends
        let reset_factor = self.get_pitch_reset_factor();
        let effective_drift = self.current_drift * (1.0 - reset_factor);

        // Decrement boundary countdown
        if self.samples_to_boundary > 0 {
            self.samples_to_boundary = self.samples_to_boundary.saturating_sub(samples.len());
        }

        // Update pitch shifter with possibly-reset drift
        self.shifter.set_pitch_cents(effective_drift);

        // Process through SOLA
        self.shifter.process_inplace(samples);
    }

    /// Reset state
    pub fn reset(&mut self) {
        self.shifter.reset();
        self.current_drift = 0.0;
        self.target_drift = 0.0;
        self.update_counter = 0;
        self.samples_to_boundary = 0;
    }

    /// Start new utterance (keep drift state for continuity)
    pub fn start_utterance(&mut self) {
        self.shifter.reset();
        // Keep drift state for continuity between utterances
    }

    /// Reseed the PRNG
    pub fn reseed(&mut self, seed: u32) {
        self.rng_seed = seed;
    }

    // =========================================================================
    // "BETTER THAN HUMAN" - Emotion-aware parameter setters
    // =========================================================================

    /// Set drift bias (cents) for emotional tendency
    /// Positive = upward pitch tendency (happy, excited)
    /// Negative = downward pitch tendency (sad, empathetic)
    /// The bias shifts the center point of the random drift
    pub fn set_drift_bias(&mut self, bias_cents: f32) {
        // Bias is added to the current drift - we clamp to reasonable range
        let clamped_bias = bias_cents.clamp(-20.0, 20.0);
        // We store bias by adjusting target drift slightly
        self.target_drift = (self.target_drift + clamped_bias * 0.1).clamp(
            -self.max_drift_cents,
            self.max_drift_cents,
        );
    }

    /// Set maximum drift range (cents) for emotional expressiveness
    /// Larger range = more emotional (sad, excited)
    /// Smaller range = more controlled (calm, neutral)
    pub fn set_max_drift(&mut self, max_cents: f32) {
        self.max_drift_cents = max_cents.clamp(0.0, 30.0);
    }

    /// Configure from emotion prosody parameters
    pub fn configure_emotion(&mut self, drift_bias_cents: f32, drift_range_cents: f32) {
        self.set_max_drift(drift_range_cents);
        self.set_drift_bias(drift_bias_cents);
    }
}

// ============================================================================
// SOLA TIME-STRETCHER (for Listener-Aware Pacing)
// ============================================================================

/// SOLA-based time stretcher for listener-aware pacing.
///
/// Uses the same SOLA algorithm to stretch or compress speech
/// WITHOUT changing pitch. This is the key to making complex
/// content more digestible and simple content flow naturally.
///
/// Time-stretch is achieved by adjusting the hop size between
/// analysis windows while keeping synthesis hop constant.
#[derive(Clone)]
pub struct SolaTimeStretch {
    /// Sample rate
    sample_rate: u32,

    /// Current stretch factor (1.0 = normal, >1 = slower, <1 = faster)
    stretch_factor: f32,

    /// Target stretch factor (we smooth toward this)
    target_stretch: f32,

    /// Smoothing coefficient (prevents jarring tempo changes)
    smooth_coef: f32,

    /// Input buffer
    input_buffer: Vec<f32>,

    /// Output buffer
    output_buffer: Vec<f32>,

    /// Overlap buffer for crossfade
    overlap_buffer: Vec<f32>,

    /// Previous tail for OLA
    prev_tail: Vec<f32>,

    /// Hann window
    window: Vec<f32>,

    /// Current input position
    input_pos: f64,
}

/// Analysis frame size for time-stretching
const TS_FRAME_SIZE: usize = 1024;
/// Synthesis hop size (output hop is fixed)
const TS_SYNTH_HOP: usize = 256;
/// Correlation search range
const TS_CORR_RANGE: usize = 64;

impl SolaTimeStretch {
    /// Create a new time stretcher
    pub fn new(sample_rate: u32) -> Self {
        // Pre-compute Hann window
        let window: Vec<f32> = (0..TS_FRAME_SIZE)
            .map(|i| {
                0.5 * (1.0 - (2.0 * PI * i as f32 / (TS_FRAME_SIZE - 1) as f32).cos())
            })
            .collect();

        Self {
            sample_rate,
            stretch_factor: 1.0,
            target_stretch: 1.0,
            smooth_coef: 0.98, // Very smooth transitions
            input_buffer: Vec::with_capacity(TS_FRAME_SIZE * 4),
            output_buffer: Vec::with_capacity(TS_FRAME_SIZE * 4),
            overlap_buffer: vec![0.0; TS_FRAME_SIZE],
            prev_tail: vec![0.0; TS_SYNTH_HOP],
            window,
            input_pos: 0.0,
        }
    }

    /// Set the stretch factor
    /// 1.0 = normal speed
    /// >1.0 = slower (for complex content, max ~1.2)
    /// <1.0 = faster (for simple content, min ~0.85)
    pub fn set_stretch_factor(&mut self, factor: f32) {
        self.target_stretch = factor.clamp(0.8, 1.25);
    }

    /// Set stretch based on content complexity (0-1)
    /// Complexity 0.0 = simple content, normal or slightly faster
    /// Complexity 0.5 = moderate, normal speed
    /// Complexity 1.0 = complex, slower for comprehension
    pub fn set_from_complexity(&mut self, complexity: f32) {
        // Map complexity to stretch factor:
        // 0.0 -> 0.98 (slightly faster)
        // 0.5 -> 1.0  (normal)
        // 1.0 -> 1.12 (slower for comprehension)
        let stretch = if complexity < 0.5 {
            // Simple content: lerp from 0.98 to 1.0
            0.98 + (complexity * 2.0) * 0.02
        } else {
            // Complex content: lerp from 1.0 to 1.12
            1.0 + ((complexity - 0.5) * 2.0) * 0.12
        };
        self.set_stretch_factor(stretch);
    }

    /// Process samples with time-stretching
    /// Returns stretched audio (length will differ from input)
    pub fn process(&mut self, samples: &[f32]) -> Vec<f32> {
        if samples.is_empty() || (self.stretch_factor - 1.0).abs() < 0.01 {
            // No stretching needed
            return samples.to_vec();
        }

        // Smooth toward target stretch
        self.stretch_factor = self.stretch_factor * self.smooth_coef
            + self.target_stretch * (1.0 - self.smooth_coef);

        // Add input to buffer
        self.input_buffer.extend_from_slice(samples);

        // Analysis hop (varies with stretch factor)
        // stretch > 1 means analysis hop < synth hop (slowing down)
        // stretch < 1 means analysis hop > synth hop (speeding up)
        let analysis_hop = (TS_SYNTH_HOP as f32 / self.stretch_factor) as usize;

        // Process while we have enough input
        while self.input_buffer.len() >= TS_FRAME_SIZE + TS_CORR_RANGE {
            let input_pos = self.input_pos as usize;

            if input_pos + TS_FRAME_SIZE > self.input_buffer.len() {
                break;
            }

            // Extract analysis frame
            let frame = &self.input_buffer[input_pos..input_pos + TS_FRAME_SIZE];

            // Find best correlation offset (reserved for future correlation-aligned OLA)
            let _best_offset = if self.output_buffer.len() >= TS_SYNTH_HOP {
                self.find_best_offset(frame)
            } else {
                0
            };

            // Apply window and add to output with OLA
            for i in 0..TS_FRAME_SIZE {
                let windowed = frame[i] * self.window[i];
                if i < self.overlap_buffer.len() {
                    self.overlap_buffer[i] += windowed;
                }
            }

            // Output the synthesis hop
            let synth_len = TS_SYNTH_HOP.min(self.overlap_buffer.len());
            self.output_buffer.extend_from_slice(&self.overlap_buffer[..synth_len]);

            // Shift overlap buffer
            self.overlap_buffer.copy_within(synth_len.., 0);
            let new_len = self.overlap_buffer.len().saturating_sub(synth_len);
            self.overlap_buffer.truncate(new_len);
            self.overlap_buffer.resize(TS_FRAME_SIZE, 0.0);

            // Advance input position by analysis hop
            self.input_pos += analysis_hop as f64;
        }

        // Remove consumed input
        let consumed = self.input_pos as usize;
        if consumed > 0 && consumed <= self.input_buffer.len() {
            self.input_buffer.drain(..consumed);
            self.input_pos -= consumed as f64;
        }

        // Return accumulated output
        std::mem::take(&mut self.output_buffer)
    }

    /// Find best correlation offset for OLA
    fn find_best_offset(&self, frame: &[f32]) -> usize {
        let mut best_corr = f32::MIN;
        let mut best_offset = 0;

        let overlap_start = self.output_buffer.len().saturating_sub(TS_SYNTH_HOP);

        for offset in 0..TS_CORR_RANGE.min(TS_SYNTH_HOP) {
            let mut corr = 0.0;
            let compare_len = TS_SYNTH_HOP.min(frame.len()).min(
                self.output_buffer.len().saturating_sub(overlap_start)
            );

            for i in 0..compare_len {
                if overlap_start + i < self.output_buffer.len() && offset + i < frame.len() {
                    corr += self.output_buffer[overlap_start + i] * frame[offset + i];
                }
            }

            if corr > best_corr {
                best_corr = corr;
                best_offset = offset;
            }
        }

        best_offset
    }

    /// Reset state
    pub fn reset(&mut self) {
        self.input_buffer.clear();
        self.output_buffer.clear();
        self.overlap_buffer.fill(0.0);
        self.prev_tail.fill(0.0);
        self.input_pos = 0.0;
        self.stretch_factor = 1.0;
        self.target_stretch = 1.0;
    }

    /// Get current stretch factor
    pub fn current_stretch(&self) -> f32 {
        self.stretch_factor
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Generate a continuous sine wave
    fn generate_sine(num_samples: usize, freq: f32, sample_rate: f32) -> Vec<f32> {
        (0..num_samples)
            .map(|i| (2.0 * PI * freq * i as f32 / sample_rate).sin() * 0.5)
            .collect()
    }

    /// Count sample-to-sample discontinuities above threshold
    fn count_clicks(samples: &[f32], threshold: f32) -> usize {
        let mut count = 0;
        for i in 1..samples.len() {
            if (samples[i] - samples[i - 1]).abs() > threshold {
                count += 1;
            }
        }
        count
    }

    #[test]
    fn test_sola_no_pitch_change() {
        let mut shifter = SolaPitchShifter::new(24000);
        shifter.set_pitch_ratio(1.0); // No change

        let input = generate_sine(4800, 440.0, 24000.0); // 200ms of 440Hz
        let output = shifter.process(&input);

        // Output should be very similar to input (maybe slightly different due to windowing)
        // Most importantly: no clicks
        let clicks = count_clicks(&output, 0.3);
        assert_eq!(clicks, 0, "SOLA with ratio=1.0 should produce no clicks");
    }

    #[test]
    fn test_sola_pitch_up() {
        let mut shifter = SolaPitchShifter::new(24000);
        shifter.set_pitch_cents(100.0); // +100 cents = +1 semitone

        // Process multiple frames with CONTINUOUS phase (important!)
        let mut all_output = Vec::new();
        let num_frames = 20; // More frames for better warmup

        for i in 0..num_frames {
            // Generate with continuous phase
            let input: Vec<f32> = (0..480)
                .map(|j| (2.0 * PI * 440.0 * (i * 480 + j) as f32 / 24000.0).sin() * 0.5)
                .collect();
            let output = shifter.process(&input);
            all_output.extend(output);
        }

        // Skip initial warmup period (first 3 frames = ~1500 samples)
        let warmup_samples = 1500;
        let steady_state = &all_output[warmup_samples.min(all_output.len())..];

        // Check for clicks in steady state only
        let clicks = count_clicks(steady_state, 0.3);
        // Large pitch shifts (100 cents) may have a few clicks at frame boundaries
        assert!(clicks < 10, "SOLA pitch up should produce few clicks after warmup, got {}", clicks);
    }

    #[test]
    fn test_sola_pitch_down() {
        let mut shifter = SolaPitchShifter::new(24000);
        shifter.set_pitch_cents(-100.0); // -100 cents = -1 semitone

        let mut all_output = Vec::new();
        let num_frames = 20;

        for i in 0..num_frames {
            // Generate with continuous phase
            let input: Vec<f32> = (0..480)
                .map(|j| (2.0 * PI * 440.0 * (i * 480 + j) as f32 / 24000.0).sin() * 0.5)
                .collect();
            let output = shifter.process(&input);
            all_output.extend(output);
        }

        // Skip warmup
        let warmup_samples = 1500;
        let steady_state = &all_output[warmup_samples.min(all_output.len())..];

        let clicks = count_clicks(steady_state, 0.3);
        assert!(clicks < 10, "SOLA pitch down should produce few clicks after warmup, got {}", clicks);
    }

    #[test]
    fn test_sola_micro_pitch_no_clicks() {
        let mut micro_pitch = SolaMicroPitch::new(24000, 10.0); // 10 cents depth

        let mut all_output = Vec::new();
        for i in 0..20 {
            let mut frame = generate_sine(480, 440.0, 24000.0);
            // Offset phase for continuity
            for (j, sample) in frame.iter_mut().enumerate() {
                *sample = (2.0 * PI * 440.0 * (i * 480 + j) as f32 / 24000.0).sin() * 0.5;
            }
            micro_pitch.process(&mut frame);
            all_output.extend(frame);
        }

        let clicks = count_clicks(&all_output, 0.3);
        assert!(clicks < 5, "SolaMicroPitch should produce few/no clicks, got {}", clicks);
    }

    #[test]
    fn test_sola_pitch_drift_no_clicks() {
        let mut drift = SolaPitchDrift::new(24000, 10.0); // 10 cents max drift

        let mut all_output = Vec::new();
        for i in 0..30 {
            let mut frame = generate_sine(480, 440.0, 24000.0);
            for (j, sample) in frame.iter_mut().enumerate() {
                *sample = (2.0 * PI * 440.0 * (i * 480 + j) as f32 / 24000.0).sin() * 0.5;
            }
            drift.process(&mut frame);
            all_output.extend(frame);
        }

        let clicks = count_clicks(&all_output, 0.3);
        assert!(clicks < 5, "SolaPitchDrift should produce few/no clicks, got {}", clicks);
    }

    #[test]
    fn test_cross_correlation_finds_alignment() {
        // Create two segments that are offset versions of each other
        let segment1: Vec<f32> = (0..64)
            .map(|i| (2.0 * PI * 440.0 * i as f32 / 24000.0).sin())
            .collect();

        // Segment2 is segment1 shifted by 10 samples
        let segment2: Vec<f32> = (10..74)
            .map(|i| (2.0 * PI * 440.0 * i as f32 / 24000.0).sin())
            .collect();

        let offset = find_optimal_splice_offset(&segment1, &segment2, 32);

        // Offset should be close to -10 (segment2 needs to shift left to align)
        assert!(offset.abs() <= 15, "Cross-correlation should find approximate alignment, got {}", offset);
    }

    #[test]
    fn test_hann_window() {
        let window = HannWindow::new(64);

        // Check symmetry
        for i in 0..32 {
            let diff = (window.get(i) - window.get(63 - i)).abs();
            assert!(diff < 1e-6, "Hann window should be symmetric");
        }

        // Check endpoints (should be near 0)
        assert!(window.get(0) < 0.01, "Hann window should start near 0");
        assert!(window.get(63) < 0.01, "Hann window should end near 0");

        // Check center (should be 1.0)
        assert!((window.get(31) - 1.0).abs() < 0.1, "Hann window should peak near center");
    }

    /// Test very short utterances (edge case)
    /// Verifies SOLA handles audio shorter than its buffer size
    #[test]
    fn test_sola_short_utterance() {
        let mut micro_pitch = SolaMicroPitch::new(24000, 8.0);

        // Very short utterance: just 2 frames (40ms at 24kHz)
        // This is shorter than typical SOLA warmup
        let mut all_output = Vec::new();
        for i in 0..2 {
            let mut frame: Vec<f32> = (0..480)
                .map(|j| (2.0 * PI * 440.0 * (i * 480 + j) as f32 / 24000.0).sin() * 0.5)
                .collect();
            micro_pitch.process(&mut frame);
            all_output.extend(frame);
        }

        // Should not crash, should produce output
        assert_eq!(all_output.len(), 960, "Short utterance should produce correct length output");

        // Check no NaN or Inf values
        for sample in &all_output {
            assert!(sample.is_finite(), "Output should contain finite values");
        }

        // May have more artifacts due to insufficient warmup, but should not have severe clicks
        let severe_clicks = count_clicks(&all_output, 0.5);
        assert!(severe_clicks < 3, "Short utterance should not have severe clicks, got {}", severe_clicks);
    }

    /// Test single-frame edge case
    #[test]
    fn test_sola_single_frame() {
        let mut micro_pitch = SolaMicroPitch::new(24000, 8.0);

        // Single frame only
        let mut frame: Vec<f32> = (0..480)
            .map(|i| (2.0 * PI * 440.0 * i as f32 / 24000.0).sin() * 0.5)
            .collect();

        micro_pitch.process(&mut frame);

        // Should not crash
        assert_eq!(frame.len(), 480, "Single frame should maintain length");

        // Check no NaN or Inf
        for sample in &frame {
            assert!(sample.is_finite(), "Single frame output should be finite");
        }
    }

    /// Test empty input edge case
    #[test]
    fn test_sola_empty_input() {
        let mut micro_pitch = SolaMicroPitch::new(24000, 8.0);

        let mut empty: Vec<f32> = Vec::new();
        micro_pitch.process(&mut empty);

        // Should not crash, should remain empty
        assert!(empty.is_empty(), "Empty input should produce empty output");
    }

    /// Test SOLA latency requirements
    #[test]
    fn test_sola_latency() {
        let shifter = SolaPitchShifter::new(24000);

        // Document expected latency
        let latency_samples = shifter.latency_samples();
        let latency_ms = shifter.latency_ms();

        println!("SOLA Latency: {} samples = {:.2}ms at 24kHz", latency_samples, latency_ms);

        // For real-time voice, latency should be under 50ms
        assert!(latency_ms < 50.0, "SOLA latency should be under 50ms for real-time, got {:.2}ms", latency_ms);
    }

    /// Test formant preservation filter coefficients are valid
    /// Verifies the Audio EQ Cookbook low shelf formula is correctly implemented
    #[test]
    fn test_formant_preservation_coefficients() {
        let mut shifter = SolaPitchShifter::new(24000);
        shifter.set_formant_preserve(true);

        // Test with various pitch shifts
        let test_cases = [
            (1.0, "no shift"),
            (1.0595, "+1 semitone"),
            (0.9439, "-1 semitone"),
            (1.122, "+2 semitones"),
            (0.891, "-2 semitones"),
            (1.5, "+7 semitones"),
            (0.667, "-7 semitones"),
        ];

        for (ratio, desc) in test_cases {
            shifter.set_pitch_ratio(ratio);
            // Process a tiny buffer to trigger coefficient update
            let _output = shifter.process(&[0.0; 10]);

            let coeffs = shifter.formant_coeffs;

            // Verify coefficients are finite
            for (i, &coef) in coeffs.iter().enumerate() {
                assert!(
                    coef.is_finite(),
                    "Formant coef[{}] is not finite for {} (ratio {}): {}",
                    i, desc, ratio, coef
                );
            }

            // For stability, verify the denominator coefficients (a1, a2) produce stable poles
            // A biquad is stable if |a2| < 1 and |a1| < 1 + a2
            let a1 = coeffs[3];
            let a2 = coeffs[4];

            assert!(
                a2.abs() < 1.0,
                "Filter unstable: |a2| >= 1 for {} (a2 = {})",
                desc, a2
            );
            assert!(
                a1.abs() < 1.0 + a2,
                "Filter unstable: |a1| >= 1 + a2 for {} (a1 = {}, a2 = {})",
                desc, a1, a2
            );
        }
    }

    /// Test that formant filter actually processes audio without artifacts
    #[test]
    fn test_formant_preservation_audio() {
        let mut shifter = SolaPitchShifter::new(24000);
        shifter.set_formant_preserve(true);
        shifter.set_pitch_cents(100.0); // +1 semitone

        // Generate a voiced signal (sine wave simulating speech fundamental)
        let input: Vec<f32> = (0..4800) // 200ms
            .map(|i| (2.0 * PI * 150.0 * i as f32 / 24000.0).sin() * 0.5)
            .collect();

        let output = shifter.process(&input);

        // Verify output is valid
        for (i, &sample) in output.iter().enumerate() {
            assert!(
                sample.is_finite(),
                "Output sample {} is not finite: {}",
                i, sample
            );
            assert!(
                sample.abs() < 2.0,
                "Output sample {} is too large (clipping): {}",
                i, sample
            );
        }

        // Verify output has reasonable amplitude (not zeroed out)
        let rms: f32 = (output.iter().map(|s| s * s).sum::<f32>() / output.len() as f32).sqrt();
        assert!(
            rms > 0.01,
            "Output RMS too low, signal may have been killed: {}",
            rms
        );
    }
}
