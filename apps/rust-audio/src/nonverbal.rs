//! Procedural nonverbal vocal sounds: a pre-speech breath and a sigh.
//!
//! Cartesia has no breath or sigh (only `[laughter]`), and the Professional
//! Voice Clone ignores emotion tags, so these are rendered here, after TTS,
//! and prepended to a reply. Everything is synthesized from filtered noise
//! and a glottal pulse train: no recorded samples, so nothing to license and
//! no audibly repeating clip (every seed gives a different breath).
//!
//! This is separate from `post_tts_processor::BreathGenerator`, which mixes a
//! 40 ms breath over the first 40 ms of speech. A real inhale is 250-600 ms
//! and happens before the voice starts, so this renders a standalone clip for
//! the caller to place before speech.
//!
//! Guarantees (each pinned by a test below):
//! - exactly `round(duration_ms * sample_rate / 1000)` samples;
//! - starts and ends at 0 with raised-cosine edges (no click at either end);
//! - peak is `peak_dbfs(kind) + 20*log10(intensity)` (below -12 dBFS);
//! - zero mean; deterministic for a seed, different across seeds.
//!
//! A sigh's voiced onset follows the speaker when their median f0 is given
//! (`render_nonverbal_at`): it starts near 1.25x f0 and falls toward 0.9x, so
//! the sigh sits in the same voice as the speech after it.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::f32::consts::PI;

/// Which nonverbal sound to render.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NonverbalKind {
    /// Nasal/oral inhale before speaking.
    Breath,
    /// Audible exhale: brief voiced onset, then breathy, darkening tail.
    Sigh,
}

impl NonverbalKind {
    pub fn parse(kind: &str) -> Option<Self> {
        match kind.trim().to_ascii_lowercase().as_str() {
            "breath" => Some(Self::Breath),
            "sigh" => Some(Self::Sigh),
            _ => None,
        }
    }

    pub fn default_duration_ms(self) -> f64 {
        match self {
            Self::Breath => 350.0,
            Self::Sigh => 800.0,
        }
    }

    /// Peak level at intensity 1. A breath sits well under speech; a sigh is
    /// louder but still below the -12 dBFS ceiling.
    pub fn peak_dbfs(self) -> f32 {
        match self {
            Self::Breath => -15.0,
            Self::Sigh => -12.5,
        }
    }
}

pub const MIN_DURATION_MS: f64 = 60.0;
pub const MAX_DURATION_MS: f64 = 3000.0;
pub const MIN_SAMPLE_RATE: u32 = 8000;
pub const MAX_SAMPLE_RATE: u32 = 192_000;
/// Speaker f0 range accepted for a sigh; anything else means "unknown".
pub const MIN_SPEAKER_F0_HZ: f32 = 50.0;
pub const MAX_SPEAKER_F0_HZ: f32 = 400.0;

/// Render a nonverbal sound. Never panics: out-of-range inputs are clamped
/// (a non-positive or non-finite duration means the kind's default).
pub fn render_nonverbal(
    kind: NonverbalKind,
    duration_ms: f64,
    intensity: f32,
    seed: u32,
    sample_rate: u32,
) -> Vec<f32> {
    render_nonverbal_at(kind, duration_ms, intensity, seed, sample_rate, None)
}

/// `render_nonverbal` with the speaker's median f0 (Hz). A sigh's pitch then
/// follows the speaker; a breath is unvoiced and ignores it. `None` or an f0
/// outside 50-400 Hz gives exactly `render_nonverbal`'s output.
pub fn render_nonverbal_at(
    kind: NonverbalKind,
    duration_ms: f64,
    intensity: f32,
    seed: u32,
    sample_rate: u32,
    speaker_f0_hz: Option<f32>,
) -> Vec<f32> {
    let sr = sample_rate.clamp(MIN_SAMPLE_RATE, MAX_SAMPLE_RATE);
    let dur = if duration_ms.is_finite() && duration_ms > 0.0 {
        duration_ms.clamp(MIN_DURATION_MS, MAX_DURATION_MS)
    } else {
        kind.default_duration_ms()
    };
    let n = (dur * sr as f64 / 1000.0).round() as usize;
    let intensity = if intensity.is_finite() {
        intensity.clamp(0.0, 1.0)
    } else {
        0.0
    };

    let (mut out, env) = match kind {
        NonverbalKind::Breath => synth_breath(n, sr as f32, seed),
        NonverbalKind::Sigh => synth_sigh(n, sr as f32, seed, speaker_f0(speaker_f0_hz)),
    };

    // Remove DC without moving the endpoints: subtract the mean in proportion
    // to the envelope, which is 0 at both ends.
    let env_sum: f32 = env.iter().sum();
    if env_sum > 0.0 {
        let k = out.iter().sum::<f32>() / env_sum;
        for (x, e) in out.iter_mut().zip(&env) {
            *x -= k * e;
        }
    }

    let peak = out.iter().fold(0.0f32, |m, x| m.max(x.abs()));
    let target = 10f32.powf(kind.peak_dbfs() / 20.0) * intensity;
    let gain = if peak > 0.0 { target / peak } else { 0.0 };
    for x in &mut out {
        *x *= gain;
    }
    out
}

// ============================================================================
// SYNTHESIS
// ============================================================================

/// Inhale: turbulent noise through oral formants and a nasal band, with a
/// slow crescendo (air speeds up), slight brightening, and a quick stop.
fn synth_breath(n: usize, sr: f32, seed: u32) -> (Vec<f32>, Vec<f32>) {
    let mut p = Rng::new(seed ^ 0x9E37_79B9);
    let mut noise = Rng::new(seed.wrapping_mul(0x85EB_CA6B) ^ 0xC2B2_AE35);

    let nasality = p.range(0.2, 0.8);
    let f1 = p.range(480.0, 640.0);
    let f2 = p.range(1350.0, 1750.0);
    let f3 = p.range(2400.0, 2900.0);
    let fnasal = p.range(950.0, 1250.0);
    let fhiss = p.range(3200.0, 4000.0);
    let attack = p.range(0.35, 0.55);
    let release = p.range(0.15, 0.25);
    let flutter_hz = p.range(3.0, 7.0);
    let flutter_phase = p.range(0.0, 2.0 * PI);

    let mut oral = [
        Biquad::bandpass(f1, 4.0, sr),
        Biquad::bandpass(f2, 5.0, sr),
        Biquad::bandpass(f3, 5.0, sr),
    ];
    let mut nasal = [
        Biquad::bandpass(fnasal, 3.0, sr),
        Biquad::bandpass(fhiss, 2.5, sr),
    ];
    let mut hp = Biquad::highpass(300.0, 0.707, sr);
    let mut lp = Biquad::lowpass(5000.0, 0.707, sr);

    let mut out = Vec::with_capacity(n);
    let mut env = Vec::with_capacity(n);
    for i in 0..n {
        let t = i as f32 / n.max(1) as f32;
        let w = noise.bipolar();
        let o = oral[0].run(w) * 0.6 + oral[1].run(w) * 1.0 + oral[2].run(w) * 0.7;
        let s = nasal[0].run(w) * 0.8 + nasal[1].run(w) * (0.4 + 0.6 * t);
        let mixed = lp.run(hp.run((1.0 - nasality) * o + nasality * s));
        let flutter = 1.0 + 0.1 * (2.0 * PI * flutter_hz * i as f32 / sr + flutter_phase).sin();
        let e = edge_envelope(t, attack, release) * (0.75 + 0.25 * t);
        out.push(mixed * e * flutter);
        env.push(e * flutter);
    }
    (out, env)
}

/// Sigh: a short voiced "hh-a" onset (glottal pulses, falling pitch) that
/// fades into aspiration noise, with a lowpass that closes over time so the
/// spectrum tilts darker as the breath runs out.
fn synth_sigh(n: usize, sr: f32, seed: u32, speaker_f0: Option<f32>) -> (Vec<f32>, Vec<f32>) {
    let mut p = Rng::new(seed ^ 0x51ED_270B);
    let mut noise = Rng::new(seed.wrapping_mul(0x27D4_EB2F) ^ 0x1656_67B1);

    // Draw both pitch values either way, so every other parameter of a seed
    // is the same with and without a speaker f0.
    let drawn_start = p.range(150.0, 195.0);
    let drawn_fall = p.range(0.70, 0.80);
    let (f0_start, f0_end) = match speaker_f0 {
        // Start near 1.25x the speaker's f0, fall toward 0.9x; the draws
        // jitter both by about +/-2.6% so sighs still differ per seed.
        Some(f0) => (
            f0 * 1.25 * (1.0 + 0.2 * (drawn_start - 172.5) / 172.5),
            f0 * 0.9 * (1.0 + 0.4 * (drawn_fall - 0.75) / 0.75),
        ),
        None => (drawn_start, drawn_start * drawn_fall),
    };
    let voiced_peak = p.range(0.08, 0.14); // fraction of duration
    let voiced_end = p.range(0.38, 0.50);
    let voiced_gain = p.range(0.30, 0.45);
    let attack = p.range(0.08, 0.14);
    let tilt_start = p.range(5500.0, 6500.0);
    let tilt_end = p.range(800.0, 1100.0);
    let decay = p.range(1.3, 1.9);
    let f1 = p.range(650.0, 780.0);
    let f2 = p.range(1100.0, 1300.0);
    let f3 = p.range(2350.0, 2650.0);

    let mut formants = [
        Biquad::bandpass(f1, 3.0, sr),
        Biquad::bandpass(f2, 3.5, sr),
        Biquad::bandpass(f3, 4.0, sr),
        Biquad::bandpass(p.range(3200.0, 3900.0), 1.5, sr),
    ];
    let mut hp = Biquad::highpass(90.0, 0.707, sr);
    // Two cascaded one-pole lowpasses (12 dB/octave) whose cutoff falls.
    let mut tilt = [0.0f32; 2];
    let mut tilt_coef = 0.0f32;
    let max_harmonic_hz = (sr * 0.45).min(4500.0);
    let harmonic_weight: Vec<f32> = (0..=(max_harmonic_hz / (f0_end * 0.95)) as usize + 1)
        .map(|k| if k == 0 { 0.0 } else { (k as f32).powf(-1.5) })
        .collect();

    let mut phase = p.unit();
    // Slow random wander of F0 (+/-2.5%, value noise at a few Hz), so no two
    // sighs share a waveform even when their base pitch is close.
    let wander_step = (sr / p.range(3.0, 6.0)) as usize;
    let mut wander_from = p.range(-0.025, 0.025);
    let mut wander_to = p.range(-0.025, 0.025);
    let mut out = Vec::with_capacity(n);
    let mut env = Vec::with_capacity(n);
    for i in 0..n {
        let t = i as f32 / n.max(1) as f32;

        // Glottal source: harmonics falling at ~ -9 dB/octave.
        if i > 0 && i % wander_step == 0 {
            wander_from = wander_to;
            wander_to = p.range(-0.025, 0.025);
        }
        let u = (i % wander_step) as f32 / wander_step as f32;
        let wander = wander_from + (wander_to - wander_from) * raised_cosine(u);
        let f0 = f0_start * (f0_end / f0_start).powf(t) * (1.0 + wander);
        phase = (phase + f0 / sr).fract();
        // sin(k*theta) by the Chebyshev recurrence: one sin_cos per sample
        // instead of one sin per harmonic.
        let (s1, c1) = (2.0 * PI * phase).sin_cos();
        let (mut s_prev, mut s_k) = (0.0f32, s1);
        let mut glottal = 0.0f32;
        let mut k = 1;
        while k < harmonic_weight.len() && k as f32 * f0 < max_harmonic_hz {
            glottal += s_k * harmonic_weight[k];
            let s_next = 2.0 * c1 * s_k - s_prev;
            s_prev = s_k;
            s_k = s_next;
            k += 1;
        }
        let voicing = if t < voiced_peak {
            raised_cosine(t / voiced_peak)
        } else if t < voiced_end {
            1.0 - raised_cosine((t - voiced_peak) / (voiced_end - voiced_peak))
        } else {
            0.0
        };

        let w = noise.bipolar();
        // Open-vowel aspiration plus the bright "hh" friction that the
        // closing tilt filter takes away as the exhale weakens.
        let aspiration = formants[0].run(w) * 0.9
            + formants[1].run(w) * 0.8
            + formants[2].run(w) * 0.6
            + formants[3].run(w) * 0.6;
        let src = hp.run(aspiration + voiced_gain * voicing * glottal * 0.9);

        if i % 32 == 0 {
            let fc = tilt_start * (tilt_end / tilt_start).powf(t);
            tilt_coef = (-2.0 * PI * fc / sr).exp();
        }
        tilt[0] = (1.0 - tilt_coef) * src + tilt_coef * tilt[0];
        tilt[1] = (1.0 - tilt_coef) * tilt[0] + tilt_coef * tilt[1];

        let rise = if t < attack {
            raised_cosine(t / attack)
        } else {
            1.0
        };
        // Roughly exponential decay (~ -20 dB by 80%), forced to 0 at the end.
        let fall = if t <= attack {
            1.0
        } else {
            let x = (t - attack) / (1.0 - attack);
            (-decay * x).exp() * (1.0 - raised_cosine(x)).sqrt()
        };
        let e = rise * fall;
        out.push(tilt[1] * e);
        env.push(e);
    }
    (out, env)
}

/// A usable speaker f0, or None (unknown, or outside 50-400 Hz).
fn speaker_f0(f0: Option<f32>) -> Option<f32> {
    f0.filter(|f| f.is_finite() && (MIN_SPEAKER_F0_HZ..=MAX_SPEAKER_F0_HZ).contains(f))
}

/// 0 -> 1 raised cosine over x in [0, 1] (zero slope at both ends).
fn raised_cosine(x: f32) -> f32 {
    let x = x.clamp(0.0, 1.0);
    0.5 * (1.0 - (PI * x).cos())
}

/// Raised-cosine attack over `attack`, flat, raised-cosine release over the
/// last `release` (both fractions of the clip). 0 at t=0 and t=1.
fn edge_envelope(t: f32, attack: f32, release: f32) -> f32 {
    let a = if t < attack {
        raised_cosine(t / attack)
    } else {
        1.0
    };
    let r = if t > 1.0 - release {
        raised_cosine((1.0 - t) / release)
    } else {
        1.0
    };
    a * r
}

/// xorshift32: tiny, deterministic, good enough for noise.
struct Rng(u32);

impl Rng {
    fn new(seed: u32) -> Self {
        // murmur3 finalizer: nearby seeds (42, 43) must not give nearby
        // xorshift states, whose first outputs would be correlated.
        let mut h = seed;
        h ^= h >> 16;
        h = h.wrapping_mul(0x85EB_CA6B);
        h ^= h >> 13;
        h = h.wrapping_mul(0xC2B2_AE35);
        h ^= h >> 16;
        Self(if h == 0 { 0x6D2B_79F5 } else { h })
    }
    fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
    fn unit(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / (1u32 << 24) as f32
    }
    fn bipolar(&mut self) -> f32 {
        self.unit() * 2.0 - 1.0
    }
    fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (hi - lo) * self.unit()
    }
}

/// RBJ biquad, transposed direct form II.
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl Biquad {
    fn from(b0: f32, b1: f32, b2: f32, a0: f32, a1: f32, a2: f32) -> Self {
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            z1: 0.0,
            z2: 0.0,
        }
    }
    /// Constant 0 dB peak gain bandpass.
    fn bandpass(f0: f32, q: f32, sr: f32) -> Self {
        let w0 = 2.0 * PI * f0.min(sr * 0.45) / sr;
        let alpha = w0.sin() / (2.0 * q);
        Self::from(
            alpha,
            0.0,
            -alpha,
            1.0 + alpha,
            -2.0 * w0.cos(),
            1.0 - alpha,
        )
    }
    fn highpass(f0: f32, q: f32, sr: f32) -> Self {
        let w0 = 2.0 * PI * f0.min(sr * 0.45) / sr;
        let (s, c) = w0.sin_cos();
        let alpha = s / (2.0 * q);
        Self::from(
            (1.0 + c) / 2.0,
            -(1.0 + c),
            (1.0 + c) / 2.0,
            1.0 + alpha,
            -2.0 * c,
            1.0 - alpha,
        )
    }
    fn lowpass(f0: f32, q: f32, sr: f32) -> Self {
        let w0 = 2.0 * PI * f0.min(sr * 0.45) / sr;
        let (s, c) = w0.sin_cos();
        let alpha = s / (2.0 * q);
        Self::from(
            (1.0 - c) / 2.0,
            1.0 - c,
            (1.0 - c) / 2.0,
            1.0 + alpha,
            -2.0 * c,
            1.0 - alpha,
        )
    }
    fn run(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}

// ============================================================================
// NAPI
// ============================================================================

/// Render a breath or sigh as mono Float32 PCM at `sampleRate`.
/// `durationMs <= 0` uses the kind's default (breath 350 ms, sigh 800 ms).
/// `f0Hz` (optional): the speaker's median f0, so a sigh's pitch follows the
/// voice; omitted or outside 50-400 Hz keeps the default pitch.
/// Unknown kinds and out-of-range sample rates are errors, never panics.
#[napi(js_name = "renderNonverbal")]
pub fn render_nonverbal_napi(
    kind: String,
    duration_ms: f64,
    intensity: f64,
    seed: u32,
    sample_rate: u32,
    f0_hz: Option<f64>,
) -> Result<Float32Array> {
    let kind = NonverbalKind::parse(&kind).ok_or_else(|| {
        Error::new(
            Status::InvalidArg,
            format!("unknown nonverbal kind: {kind:?} (expected breath|sigh)"),
        )
    })?;
    if !(MIN_SAMPLE_RATE..=MAX_SAMPLE_RATE).contains(&sample_rate) {
        return Err(Error::new(
            Status::InvalidArg,
            format!("sample rate out of range: {sample_rate}"),
        ));
    }
    Ok(Float32Array::new(render_nonverbal_at(
        kind,
        duration_ms,
        intensity as f32,
        seed,
        sample_rate,
        f0_hz.map(|f| f as f32),
    )))
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
#[path = "nonverbal_tests.rs"]
mod tests;
