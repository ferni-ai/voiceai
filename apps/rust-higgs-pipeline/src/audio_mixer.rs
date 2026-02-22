//! Real-time audio mixer for full-duplex voice — ring-buffer mixer with multiple
//! sources, per-source gain, ducking, and cross-fade interrupt support.
//!
//! Output: mixed f32 PCM at 24 kHz.
//!
//! Requires `full-duplex` feature.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use tracing::{debug, trace};

/// Sample rate for mixer output (matches TTS).
pub const MIXER_SAMPLE_RATE: u32 = 24000;

/// Default max samples per source (≈2s at 24kHz) for TTS bursts.
const DEFAULT_RING_CAPACITY: usize = 48_000;

/// Fade state for cross-fade interrupt handling.
#[derive(Debug, Clone, Default)]
pub enum FadeState {
    #[default]
    None,
    FadingOut {
        remaining_samples: usize,
        total_samples: usize,
    },
    FadingIn {
        remaining_samples: usize,
        total_samples: usize,
    },
}

/// Per-source state in the mixer.
#[derive(Debug)]
struct SourceState {
    buffer: VecDeque<f32>,
    gain: f32,
    active: bool,
    fade: FadeState,
    /// Current duck amount (0.0 = no duck, 1.0 = fully ducked).
    duck_amount: f32,
    /// Samples remaining in duck period.
    duck_remaining: usize,
}

impl SourceState {
    fn new(gain: f32) -> Self {
        Self {
            buffer: VecDeque::with_capacity(DEFAULT_RING_CAPACITY),
            gain: gain.clamp(0.0, 2.0),
            active: true,
            fade: FadeState::None,
            duck_amount: 0.0,
            duck_remaining: 0,
        }
    }

    /// Effective gain including duck and fade.
    fn effective_gain(&self) -> f32 {
        let mut g = self.gain * (1.0 - self.duck_amount);

        match &self.fade {
            FadeState::None => {}
            FadeState::FadingOut {
                remaining_samples,
                total_samples,
            } => {
                if *total_samples > 0 {
                    g *= *remaining_samples as f32 / *total_samples as f32;
                }
            }
            FadeState::FadingIn {
                remaining_samples,
                total_samples,
            } => {
                if *total_samples > 0 {
                    g *= (*total_samples - *remaining_samples) as f32
                        / *total_samples as f32;
                }
            }
        }

        g.clamp(0.0, 2.0)
    }
}

/// Thread-safe real-time audio mixer.
///
/// Accepts multiple audio sources (main TTS, backchannel, overlay), mixes with
/// per-source gain, and supports ducking and cross-fade for interrupts.
#[derive(Debug)]
pub struct AudioMixer {
    sources: Mutex<HashMap<String, SourceState>>,
}

impl AudioMixer {
    pub fn new() -> Self {
        Self {
            sources: Mutex::new(HashMap::new()),
        }
    }

    /// Add a source with optional initial gain.
    pub fn add_source(&self, name: impl Into<String>, gain: f32) {
        let name = name.into();
        let mut guard = self.sources.lock().unwrap();
        if guard.contains_key(&name) {
            debug!(name = %name, "Mixer: source already exists, replacing gain");
        }
        guard.insert(name, SourceState::new(gain));
    }

    /// Remove a source by name.
    pub fn remove_source(&self, name: &str) {
        let mut guard = self.sources.lock().unwrap();
        guard.remove(name);
        trace!(name = %name, "Mixer: removed source");
    }

    /// Push samples to a source's ring buffer.
    ///
    /// Drops oldest samples if buffer exceeds capacity.
    pub fn push_audio(&self, name: &str, samples: &[f32]) {
        let mut guard = self.sources.lock().unwrap();
        let Some(source) = guard.get_mut(name) else {
            trace!(name = %name, "Mixer: push to unknown source, ignoring");
            return;
        };

        for &s in samples {
            if source.buffer.len() >= DEFAULT_RING_CAPACITY {
                source.buffer.pop_front();
            }
            source.buffer.push_back(s.clamp(-1.0, 1.0));
        }
    }

    /// Mix up to `num_samples` from all active sources.
    ///
    /// Returns mixed f32 PCM, clamped to [-1.0, 1.0].
    pub fn mix_output(&self, num_samples: usize) -> Vec<f32> {
        let mut guard = self.sources.lock().unwrap();
        let mut output = Vec::with_capacity(num_samples);

        for _ in 0..num_samples {
            let mut sample = 0.0f32;

            for (_, source) in guard.iter_mut() {
                if !source.active {
                    continue;
                }

                let s = source.buffer.pop_front().unwrap_or(0.0);
                let g = source.effective_gain();
                sample += s * g;

                // Update fade state
                source.fade = match std::mem::take(&mut source.fade) {
                    FadeState::FadingOut { remaining_samples, total_samples } => {
                        if remaining_samples <= 1 {
                            FadeState::None
                        } else {
                            FadeState::FadingOut {
                                remaining_samples: remaining_samples - 1,
                                total_samples,
                            }
                        }
                    }
                    FadeState::FadingIn { remaining_samples, total_samples } => {
                        if remaining_samples <= 1 {
                            FadeState::None
                        } else {
                            FadeState::FadingIn {
                                remaining_samples: remaining_samples - 1,
                                total_samples,
                            }
                        }
                    }
                    other => other,
                };

                // Update duck state
                if source.duck_remaining > 0 {
                    source.duck_remaining = source.duck_remaining.saturating_sub(1);
                    if source.duck_remaining == 0 {
                        source.duck_amount = 0.0;
                    }
                }
            }

            output.push(sample.clamp(-1.0, 1.0));
        }

        output
    }

    /// Set gain for a source.
    pub fn set_gain(&self, name: &str, gain: f32) {
        let mut guard = self.sources.lock().unwrap();
        if let Some(source) = guard.get_mut(name) {
            source.gain = gain.clamp(0.0, 2.0);
        }
    }

    /// Temporarily reduce a source's gain (ducking).
    ///
    /// `amount`: 0.0 = no duck, 1.0 = fully muted.
    /// `duration_ms`: how long the duck lasts.
    pub fn duck(&self, target: &str, amount: f32, duration_ms: u32) {
        let mut guard = self.sources.lock().unwrap();
        if let Some(source) = guard.get_mut(target) {
            source.duck_amount = amount.clamp(0.0, 1.0);
            source.duck_remaining =
                (MIXER_SAMPLE_RATE as f64 * duration_ms as f64 / 1000.0) as usize;
            trace!(
                target = %target,
                amount = source.duck_amount,
                duration_ms,
                "Mixer: ducking"
            );
        }
    }

    /// Linear fade-out over duration.
    pub fn fade_out(&self, source_name: &str, duration_ms: u32) {
        let total_samples =
            (MIXER_SAMPLE_RATE as f64 * duration_ms as f64 / 1000.0) as usize;
        let mut guard = self.sources.lock().unwrap();
        if let Some(source) = guard.get_mut(source_name) {
            source.fade = FadeState::FadingOut {
                remaining_samples: total_samples,
                total_samples,
            };
            trace!(
                source = %source_name,
                duration_ms,
                total_samples,
                "Mixer: fade out"
            );
        }
    }

    /// Linear fade-in over duration.
    pub fn fade_in(&self, source_name: &str, duration_ms: u32) {
        let total_samples =
            (MIXER_SAMPLE_RATE as f64 * duration_ms as f64 / 1000.0) as usize;
        let mut guard = self.sources.lock().unwrap();
        if let Some(source) = guard.get_mut(source_name) {
            source.fade = FadeState::FadingIn {
                remaining_samples: total_samples,
                total_samples,
            };
            trace!(
                source = %source_name,
                duration_ms,
                total_samples,
                "Mixer: fade in"
            );
        }
    }

    /// Apply interrupt cross-fade: 80ms fade-out of agent TTS, 120ms fade-in of new speech.
    pub fn fade_interrupt(&self, agent_source: &str, new_source: &str, fade_ms: Option<u32>) {
        let (fade_out_ms, fade_in_ms) = fade_ms
            .map(|ms| (ms / 2, ms - ms / 2))
            .unwrap_or((80, 120));
        self.fade_out(agent_source, fade_out_ms);
        self.fade_in(new_source, fade_in_ms);
    }

    /// Set source active/inactive without removing it.
    pub fn set_active(&self, name: &str, active: bool) {
        let mut guard = self.sources.lock().unwrap();
        if let Some(source) = guard.get_mut(name) {
            source.active = active;
        }
    }

    /// Drain all currently buffered mixed audio (non-blocking).
    /// Returns mixed f32 PCM for the number of samples available in the shortest source buffer.
    /// Used by the full-duplex drain loop to send mixed output to the client.
    pub fn drain_available(&self) -> Vec<f32> {
        let available = {
            let guard = self.sources.lock().unwrap();
            guard
                .iter()
                .filter(|(_, s)| s.active && !s.buffer.is_empty())
                .map(|(_, s)| s.buffer.len())
                .min()
                .unwrap_or(0)
        };
        if available == 0 {
            return Vec::new();
        }
        self.mix_output(available)
    }
}

impl Default for AudioMixer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mixer_add_remove_source() {
        let mixer = AudioMixer::new();
        mixer.add_source("tts", 1.0);
        mixer.add_source("backchannel", 0.5);
        mixer.remove_source("backchannel");
        mixer.push_audio("tts", &[0.5, 0.5, 0.5]);
        let out = mixer.mix_output(3);
        assert_eq!(out.len(), 3);
        assert!((out[0] - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_mixer_gain_and_duck() {
        let mixer = AudioMixer::new();
        mixer.add_source("main", 1.0);
        mixer.push_audio("main", &[1.0; 100]);
        mixer.duck("main", 0.5, 100);
        let out = mixer.mix_output(10);
        assert!(!out.is_empty());
        // Duck reduces gain by 50%
        assert!(out[0] < 0.6);
    }

    #[test]
    fn test_mixer_clamp_output() {
        let mixer = AudioMixer::new();
        mixer.add_source("a", 1.0);
        mixer.add_source("b", 1.0);
        mixer.push_audio("a", &[0.8; 10]);
        mixer.push_audio("b", &[0.8; 10]);
        let out = mixer.mix_output(10);
        for &s in &out {
            assert!(s <= 1.0 && s >= -1.0);
        }
    }
}
