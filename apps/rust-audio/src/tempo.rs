//! Per-reply tempo: change speech duration without changing pitch.
//!
//! Cartesia's Professional Voice Clone ignores `<speed>`, so pace is applied
//! here, after TTS. This is WSOLA (waveform-similarity overlap-add, Verhelst
//! & Roelands 1993), the same SOLA family as `sola.rs`, but streaming and
//! with the similarity search actually used to pick each splice.
//!
//! `sola::SolaTimeStretch` is not reused: (1) `process` returns early while
//! its smoothed factor is still 1.0, so a requested stretch never engages;
//! (2) it computes a correlation offset and then ignores it (plain OLA, which
//! smears pitch); (3) its 75%-overlap Hann OLA has a gain of 2. It is only
//! reachable through the post-TTS tempo-variation flag, which is off.
//!
//! Streaming: output depends only on the input samples, never on how they
//! were split into frames, so a reply processed frame by frame equals the
//! same reply processed whole (pinned by a test). Holds back about one
//! window plus the search range (~45 ms) until `flush`.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::f64::consts::PI;

pub const MIN_RATIO: f64 = 0.8;
pub const MAX_RATIO: f64 = 1.25;

/// Window length (and 2x the hop): 30 ms covers >2 pitch periods at 80 Hz.
const WINDOW_SEC: f64 = 0.030;
/// Splice search +/- this much: at least one period down to ~65 Hz.
const TOLERANCE_SEC: f64 = 0.0075;

/// Streaming pitch-preserving time stretcher. `ratio` is speed: 1.1 plays
/// 10% faster (output ~ input / 1.1 long).
pub struct TempoStretcher {
    ratio: f64,
    passthrough: bool,
    win_len: usize,
    hop: usize,
    tol: usize,
    window: Vec<f32>,
    /// Buffered input; `input[0]` is absolute input sample `input_base`.
    input: Vec<f32>,
    input_base: usize,
    /// Output samples [k*hop, k*hop + win_len) under construction.
    acc: Vec<f32>,
    /// Next synthesis frame index.
    k: usize,
    /// Absolute input start of the previous frame's segment.
    prev_pos: usize,
    total_in: usize,
    total_out: usize,
    flushed: bool,
}

impl TempoStretcher {
    pub fn new(sample_rate: u32, ratio: f64) -> Self {
        let sr = sample_rate.max(1) as f64;
        let ratio = if ratio.is_finite() {
            ratio.clamp(MIN_RATIO, MAX_RATIO)
        } else {
            1.0
        };
        let hop = ((WINDOW_SEC * sr / 2.0).round() as usize).max(8);
        let win_len = hop * 2;
        // Periodic Hann: w[i] + w[i + hop] == 1, so 50% overlap-add has unit gain.
        let window = (0..win_len)
            .map(|i| (0.5 - 0.5 * (2.0 * PI * i as f64 / win_len as f64).cos()) as f32)
            .collect();
        Self {
            ratio,
            passthrough: (ratio - 1.0).abs() < 1e-3,
            win_len,
            hop,
            tol: ((TOLERANCE_SEC * sr).round() as usize).max(1),
            window,
            input: Vec::new(),
            input_base: 0,
            acc: vec![0.0; win_len],
            k: 0,
            prev_pos: 0,
            total_in: 0,
            total_out: 0,
            flushed: false,
        }
    }

    pub fn ratio(&self) -> f64 {
        self.ratio
    }

    /// Feed one frame; returns whatever output is complete (may be empty).
    pub fn process(&mut self, frame: &[f32]) -> Vec<f32> {
        if self.passthrough || self.flushed {
            return frame.to_vec();
        }
        self.total_in += frame.len();
        self.input.extend_from_slice(frame);
        let mut out = Vec::with_capacity(frame.len() + self.hop);
        while self.can_run_frame() {
            self.run_frame(&mut out);
        }
        self.trim_input();
        self.total_out += out.len();
        out
    }

    /// End of stream: emit the held-back tail. Further `process` calls pass through.
    pub fn flush(&mut self) -> Vec<f32> {
        if self.passthrough || self.flushed {
            return Vec::new();
        }
        self.flushed = true;
        let end = self.input_base + self.input.len();
        if self.k == 0 {
            // Shorter than one window: nothing to stretch.
            let out = std::mem::take(&mut self.input);
            self.total_out += out.len();
            return out;
        }
        // Finish the last frame's falling half with its natural continuation
        // (window + its complement == the unwindowed signal), then the rest of
        // the input, cut to the length the ratio calls for.
        let target = (self.total_in as f64 / self.ratio).round() as usize;
        let start = self.prev_pos + self.hop;
        let want = target
            .saturating_sub(self.total_out)
            .max(self.hop.min(end - start));
        let take = want.min(end.saturating_sub(start));
        let from = start - self.input_base;
        let mut out = self.input[from..from + take].to_vec();
        if take < end - start {
            // Truncated mid-signal: fade the last 5 ms so the cut can't click.
            let fade = (self.hop / 3).min(out.len());
            let len = out.len();
            for i in 0..fade {
                out[len - fade + i] *= 0.5 + 0.5 * (PI * (i + 1) as f64 / fade as f64).cos() as f32;
            }
        }
        self.input.clear();
        self.total_out += out.len();
        out
    }

    fn nominal(&self, k: usize) -> usize {
        (k as f64 * self.hop as f64 * self.ratio).round() as usize
    }

    fn can_run_frame(&self) -> bool {
        let need = self.nominal(self.k) + self.tol + self.win_len;
        need <= self.input_base + self.input.len()
    }

    fn run_frame(&mut self, out: &mut Vec<f32>) {
        let pos = if self.k == 0 { 0 } else { self.best_position() };
        let seg = pos - self.input_base;
        let hop = self.hop;
        for i in 0..self.win_len {
            let x = self.input[seg + i];
            // Frame 0 keeps its rising half unwindowed so the reply's first
            // samples come through untouched instead of fading in.
            let w = if self.k == 0 && i < hop {
                1.0
            } else {
                self.window[i]
            };
            self.acc[i] += x * w;
        }
        out.extend_from_slice(&self.acc[..hop]);
        self.acc.copy_within(hop.., 0);
        self.acc[hop..].fill(0.0);
        self.prev_pos = pos;
        self.k += 1;
    }

    /// Input position within +/-tol of nominal whose first half best matches
    /// the previous segment's natural continuation.
    fn best_position(&self) -> usize {
        let hop = self.hop;
        let nominal = self.nominal(self.k);
        let lo = nominal.saturating_sub(self.tol).max(self.input_base);
        let hi = nominal + self.tol;
        let t0 = self.prev_pos + hop - self.input_base;
        let template = &self.input[t0..t0 + hop];
        let mut best = nominal.max(lo);
        let mut best_score = f32::MIN;
        for cand in lo..=hi {
            let c0 = cand - self.input_base;
            let score: f32 = template
                .iter()
                .zip(&self.input[c0..c0 + hop])
                .map(|(a, b)| a * b)
                .sum();
            if score > best_score {
                best_score = score;
                best = cand;
            }
        }
        best
    }

    /// Drop input no future frame can read.
    fn trim_input(&mut self) {
        let keep_from =
            (self.prev_pos + self.hop).min(self.nominal(self.k).saturating_sub(self.tol));
        let drop = keep_from.saturating_sub(self.input_base);
        if drop > 4 * self.win_len {
            self.input.drain(..drop);
            self.input_base += drop;
        }
    }
}

/// Stretch a whole buffer (stateless convenience over `TempoStretcher`).
pub fn time_stretch(samples: &[f32], ratio: f64, sample_rate: u32) -> Vec<f32> {
    let mut ts = TempoStretcher::new(sample_rate, ratio);
    let mut out = ts.process(samples);
    out.extend(ts.flush());
    out
}

// ============================================================================
// NAPI
// ============================================================================

fn check_rate(sample_rate: u32) -> Result<()> {
    if (8000..=192_000).contains(&sample_rate) {
        Ok(())
    } else {
        Err(Error::new(
            Status::InvalidArg,
            format!("sample rate out of range: {sample_rate}"),
        ))
    }
}

fn check_ratio(ratio: f64) -> Result<()> {
    if ratio.is_finite() && ratio > 0.0 {
        Ok(())
    } else {
        Err(Error::new(
            Status::InvalidArg,
            format!("invalid tempo ratio: {ratio}"),
        ))
    }
}

/// Change duration without changing pitch. `ratio` is speed (1.1 = 10%
/// faster), clamped to 0.8-1.25.
#[napi(js_name = "timeStretch")]
pub fn time_stretch_napi(
    samples: Float32Array,
    ratio: f64,
    sample_rate: u32,
) -> Result<Float32Array> {
    check_rate(sample_rate)?;
    check_ratio(ratio)?;
    Ok(Float32Array::new(time_stretch(
        &samples,
        ratio,
        sample_rate,
    )))
}

/// Streaming tempo stretcher for one reply: `process` each frame, then
/// `flush` once at the end. Frame boundaries carry overlap state, so they
/// don't click.
#[napi(js_name = "NativeTempoStretcher")]
pub struct NativeTempoStretcher {
    inner: TempoStretcher,
}

#[napi]
impl NativeTempoStretcher {
    #[napi(constructor)]
    pub fn new(sample_rate: u32, ratio: f64) -> Result<Self> {
        check_rate(sample_rate)?;
        check_ratio(ratio)?;
        Ok(Self {
            inner: TempoStretcher::new(sample_rate, ratio),
        })
    }

    #[napi]
    pub fn process(&mut self, frame: Float32Array) -> Float32Array {
        Float32Array::new(self.inner.process(&frame))
    }

    #[napi]
    pub fn flush(&mut self) -> Float32Array {
        Float32Array::new(self.inner.flush())
    }

    /// The clamped speed ratio in effect.
    #[napi(getter)]
    pub fn ratio(&self) -> f64 {
        self.inner.ratio()
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// 150 Hz voice-like tone: 6 harmonics, slow amplitude movement.
    fn harmonic_tone(n: usize, sr: u32, f0: f64) -> Vec<f32> {
        (0..n)
            .map(|i| {
                let t = i as f64 / sr as f64;
                let am = 0.8 + 0.2 * (2.0 * PI * 3.0 * t).sin();
                let s: f64 = (1..=6)
                    .map(|h| (2.0 * PI * f0 * h as f64 * t).sin() / h as f64)
                    .sum();
                (0.3 * am * s) as f32
            })
            .collect()
    }

    /// F0 by normalized autocorrelation with parabolic interpolation, over
    /// 100-400 Hz (so the 2T lag of a 150 Hz tone is out of range).
    fn estimate_f0(x: &[f32], sr: u32) -> f64 {
        let (lo, hi) = ((sr / 400) as usize, (sr / 100) as usize);
        let ac = |lag: usize| -> f64 {
            let n = x.len() - hi;
            let (mut s, mut e0, mut e1) = (0.0f64, 0.0f64, 0.0f64);
            for i in 0..n {
                s += x[i] as f64 * x[i + lag] as f64;
                e0 += (x[i] as f64).powi(2);
                e1 += (x[i + lag] as f64).powi(2);
            }
            s / (e0 * e1).sqrt()
        };
        let vals: Vec<f64> = (lo..=hi).map(ac).collect();
        let (bi, _) = vals
            .iter()
            .enumerate()
            .skip(1)
            .take(vals.len() - 2)
            .fold((1, f64::MIN), |b, (i, &v)| if v > b.1 { (i, v) } else { b });
        let (a, b, c) = (vals[bi - 1], vals[bi], vals[bi + 1]);
        let shift = 0.5 * (a - c) / (a - 2.0 * b + c);
        sr as f64 / ((lo + bi) as f64 + shift)
    }

    fn max_step(x: &[f32]) -> f32 {
        x.windows(2).fold(0.0f32, |m, w| m.max((w[1] - w[0]).abs()))
    }

    fn stream(x: &[f32], ratio: f64, sr: u32, frame: usize) -> (Vec<f32>, Vec<usize>) {
        let mut ts = TempoStretcher::new(sr, ratio);
        let mut out = Vec::new();
        let mut boundaries = Vec::new();
        for chunk in x.chunks(frame) {
            out.extend(ts.process(chunk));
            boundaries.push(out.len());
        }
        out.extend(ts.flush());
        (out, boundaries)
    }

    #[test]
    fn output_length_tracks_ratio() {
        for sr in [24_000u32, 48_000] {
            let x = harmonic_tone(sr as usize * 2, sr, 150.0);
            for ratio in [0.8, 0.9, 1.1, 1.25] {
                let y = time_stretch(&x, ratio, sr);
                let want = x.len() as f64 / ratio;
                let err = (y.len() as f64 - want).abs() / want;
                assert!(
                    err < 0.02,
                    "sr {sr} ratio {ratio}: {} vs {want:.0} ({:.2}%)",
                    y.len(),
                    err * 100.0
                );
            }
        }
    }

    #[test]
    fn pitch_is_preserved() {
        let sr = 24_000;
        let x = harmonic_tone(sr as usize * 2, sr, 150.0);
        let f_in = estimate_f0(&x[4800..14400], sr);
        assert!((f_in - 150.0).abs() < 1.0, "estimator sanity: {f_in}");
        for ratio in [0.8, 0.9, 1.1, 1.25] {
            let y = time_stretch(&x, ratio, sr);
            let mid = y.len() / 2;
            let f_out = estimate_f0(&y[mid - 4800..mid + 4800], sr);
            assert!(
                (f_out / f_in - 1.0).abs() < 0.02,
                "ratio {ratio}: F0 {f_in:.1} -> {f_out:.1}"
            );
        }
    }

    #[test]
    fn ratio_one_is_passthrough() {
        let x = harmonic_tone(10_000, 24_000, 150.0);
        assert_eq!(time_stretch(&x, 1.0, 24_000), x);
        let mut ts = TempoStretcher::new(24_000, 1.0004);
        assert_eq!(ts.process(&x[..480]), &x[..480]);
        assert!(ts.flush().is_empty());
    }

    #[test]
    fn ratio_is_clamped() {
        assert_eq!(TempoStretcher::new(24_000, 3.0).ratio(), MAX_RATIO);
        assert_eq!(TempoStretcher::new(24_000, 0.1).ratio(), MIN_RATIO);
        assert_eq!(TempoStretcher::new(24_000, f64::NAN).ratio(), 1.0);
    }

    #[test]
    fn framewise_equals_whole_and_boundaries_do_not_click() {
        for sr in [24_000u32, 48_000] {
            let x = harmonic_tone(sr as usize * 3, sr, 150.0);
            let own = max_step(&x);
            for ratio in [0.8, 0.9, 1.1, 1.25] {
                let whole = time_stretch(&x, ratio, sr);
                let (framed, boundaries) = stream(&x, ratio, sr, sr as usize / 50); // 20 ms frames
                assert_eq!(
                    framed, whole,
                    "sr {sr} ratio {ratio}: frame split changed output"
                );
                for &b in boundaries.iter().filter(|&&b| b > 0 && b < framed.len()) {
                    let step = (framed[b] - framed[b - 1]).abs();
                    assert!(
                        step <= 1.5 * own,
                        "sr {sr} ratio {ratio}: boundary step {step} vs {own}"
                    );
                }
                let worst = max_step(&framed);
                assert!(
                    worst <= 1.5 * own,
                    "sr {sr} ratio {ratio}: splice step {worst} vs {own}"
                );
            }
        }
    }

    #[test]
    fn odd_frame_sizes_and_tiny_inputs() {
        let sr = 24_000;
        let x = harmonic_tone(30_000, sr, 150.0);
        let whole = time_stretch(&x, 1.1, sr);
        let (framed, _) = stream(&x, 1.1, sr, 97);
        assert_eq!(framed, whole);
        // Shorter than a window: returned unchanged at flush.
        let short = &x[..300];
        assert_eq!(time_stretch(short, 1.2, sr), short);
        assert!(time_stretch(&[], 0.9, sr).is_empty());
        // Silence stays silence; output finite.
        let y = time_stretch(&vec![0.0; 20_000], 0.85, sr);
        assert!(y.iter().all(|v| *v == 0.0));
    }

    #[test]
    fn unit_gain_on_steady_signal() {
        let sr = 24_000;
        let x = harmonic_tone(48_000, sr, 150.0);
        let rms = |s: &[f32]| (s.iter().map(|v| v * v).sum::<f32>() / s.len() as f32).sqrt();
        for ratio in [0.8, 1.25] {
            let y = time_stretch(&x, ratio, sr);
            let r = rms(&y[2400..y.len() - 2400]) / rms(&x[2400..x.len() - 2400]);
            assert!(
                (r - 1.0).abs() < 0.05,
                "ratio {ratio}: level changed by {r}"
            );
        }
    }
}
