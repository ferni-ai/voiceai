//! Tests for `nonverbal.rs` (kept separate so the module stays under 500 lines).

use super::*;

const SR: u32 = 24_000;

fn peak(x: &[f32]) -> f32 {
    x.iter().fold(0.0f32, |m, v| m.max(v.abs()))
}

fn max_step(x: &[f32]) -> f32 {
    x.windows(2).fold(0.0f32, |m, w| m.max((w[1] - w[0]).abs()))
}

/// Fraction of energy between lo and hi Hz.
fn band_fraction(x: &[f32], sr: u32, lo: f32, hi: f32) -> f32 {
    let (re, im) = crate::fft::fft(x);
    let n = re.len();
    let mut total = 0.0f64;
    let mut band = 0.0f64;
    for k in 1..n / 2 {
        let p = (re[k] as f64).powi(2) + (im[k] as f64).powi(2);
        let f = k as f32 * sr as f32 / n as f32;
        total += p;
        if f >= lo && f <= hi {
            band += p;
        }
    }
    (band / total) as f32
}

fn centroid(x: &[f32], sr: u32) -> f32 {
    let (re, im) = crate::fft::fft(x);
    let n = re.len();
    let (mut num, mut den) = (0.0f64, 0.0f64);
    for k in 1..n / 2 {
        let m = ((re[k] as f64).powi(2) + (im[k] as f64).powi(2)).sqrt();
        num += m * (k as f64 * sr as f64 / n as f64);
        den += m;
    }
    (num / den) as f32
}

/// Peak normalized autocorrelation in the 80-400 Hz lag range.
fn periodicity(x: &[f32], sr: u32) -> f32 {
    let e: f32 = x.iter().map(|v| v * v).sum();
    let (lo, hi) = ((sr / 400) as usize, (sr / 80) as usize);
    (lo..hi)
        .map(|lag| x.iter().zip(&x[lag..]).map(|(a, b)| a * b).sum::<f32>() / e)
        .fold(f32::MIN, f32::max)
}

#[test]
fn exact_sample_count() {
    for kind in [NonverbalKind::Breath, NonverbalKind::Sigh] {
        for (ms, sr) in [
            (350.0, 24_000u32),
            (800.0, 48_000),
            (333.3, 24_000),
            (412.0, 16_000),
        ] {
            let x = render_nonverbal(kind, ms, 1.0, 7, sr);
            assert_eq!(
                x.len(),
                (ms * sr as f64 / 1000.0).round() as usize,
                "{kind:?} {ms} {sr}"
            );
        }
        let d = render_nonverbal(kind, 0.0, 1.0, 7, SR);
        assert_eq!(
            d.len(),
            (kind.default_duration_ms() * SR as f64 / 1000.0) as usize
        );
    }
}

#[test]
fn starts_and_ends_at_zero_without_clicks() {
    for kind in [NonverbalKind::Breath, NonverbalKind::Sigh] {
        for seed in 0..20 {
            let x = render_nonverbal(kind, 0.0, 1.0, seed, SR);
            let edge = (SR / 1000) as usize * 2; // 2 ms
            assert!(
                x[0].abs() < 1e-6 && x[x.len() - 1].abs() < 1e-6,
                "{kind:?} seed {seed} endpoints"
            );
            let head = max_step(&x[..edge]);
            let tail = max_step(&x[x.len() - edge..]);
            assert!(
                head < 2e-3 && tail < 2e-3,
                "{kind:?} seed {seed}: edge steps {head} {tail}"
            );
        }
    }
}

#[test]
fn peak_is_below_minus_12_dbfs_and_scales_with_intensity() {
    let ceiling = 10f32.powf(-12.0 / 20.0);
    for kind in [NonverbalKind::Breath, NonverbalKind::Sigh] {
        let full = render_nonverbal(kind, 0.0, 1.0, 3, SR);
        let half = render_nonverbal(kind, 0.0, 0.5, 3, SR);
        let quiet = render_nonverbal(kind, 0.0, 0.1, 3, SR);
        assert!(peak(&full) <= ceiling, "{kind:?} peak {}", peak(&full));
        assert!(
            peak(&full) > 0.5 * ceiling,
            "{kind:?} too quiet: {}",
            peak(&full)
        );
        assert!((peak(&half) / peak(&full) - 0.5).abs() < 0.01);
        assert!((peak(&quiet) / peak(&full) - 0.1).abs() < 0.01);
        assert!(peak(&render_nonverbal(kind, 0.0, 0.0, 3, SR)) == 0.0);
    }
}

#[test]
fn no_dc_offset_and_not_silent() {
    for kind in [NonverbalKind::Breath, NonverbalKind::Sigh] {
        for seed in [1, 99, 12345] {
            let x = render_nonverbal(kind, 0.0, 1.0, seed, SR);
            let mean = x.iter().sum::<f32>() / x.len() as f32;
            let rms = (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt();
            assert!(mean.abs() < 1e-5, "{kind:?} mean {mean}");
            assert!(rms > 0.01, "{kind:?} rms {rms}");
        }
    }
}

/// Lag (in Hz) of the strongest 80-400 Hz autocorrelation peak.
fn f0_estimate(x: &[f32], sr: u32) -> f32 {
    let (lo, hi) = ((sr / 400) as usize, (sr / 80) as usize);
    let best = (lo..hi)
        .map(|lag| {
            (
                lag,
                x.iter().zip(&x[lag..]).map(|(a, b)| a * b).sum::<f32>(),
            )
        })
        .fold((lo, f32::MIN), |b, c| if c.1 > b.1 { c } else { b });
    sr as f32 / best.0 as f32
}

/// Fraction of the clip at which the 10 ms RMS envelope peaks.
fn envelope_peak(x: &[f32], sr: u32) -> f32 {
    let w = (sr / 100) as usize;
    let (i, _) = x
        .chunks(w)
        .map(|c| c.iter().map(|v| v * v).sum::<f32>())
        .enumerate()
        .fold((0, f32::MIN), |b, c| if c.1 > b.1 { c } else { b });
    (i * w) as f32 / x.len() as f32
}

fn spread(v: &[f32]) -> f32 {
    v.iter().cloned().fold(f32::MIN, f32::max) - v.iter().cloned().fold(f32::MAX, f32::min)
}

#[test]
fn deterministic_per_seed_and_varies_across_seeds() {
    for kind in [NonverbalKind::Breath, NonverbalKind::Sigh] {
        assert_eq!(
            render_nonverbal(kind, 0.0, 1.0, 42, SR),
            render_nonverbal(kind, 0.0, 1.0, 42, SR)
        );
        let clips: Vec<Vec<f32>> = (0..20u32)
            .map(|s| render_nonverbal(kind, 0.0, 1.0, s, SR))
            .collect();
        // Adjacent seeds (what a per-reply counter produces) are never the same clip.
        for (s, pair) in clips.windows(2).enumerate() {
            let (a, b) = (&pair[0], &pair[1]);
            let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
            let ea: f32 = a.iter().map(|v| v * v).sum();
            let eb: f32 = b.iter().map(|v| v * v).sum();
            let corr = dot / (ea * eb).sqrt();
            assert!(
                corr.abs() < 0.7,
                "{kind:?} seeds {s}/{} correlate {corr}",
                s + 1
            );
        }
        // And the variation is in things a listener hears: timing and color.
        let peaks: Vec<f32> = clips.iter().map(|c| envelope_peak(c, SR)).collect();
        let cents: Vec<f32> = clips.iter().map(|c| centroid(c, SR)).collect();
        assert!(
            spread(&peaks) > 0.05,
            "{kind:?} envelope peak spread {:?}",
            peaks
        );
        assert!(
            spread(&cents) > 150.0,
            "{kind:?} centroid spread {:?}",
            cents
        );
        if kind == NonverbalKind::Sigh {
            let f0s: Vec<f32> = clips
                .iter()
                .map(|c| f0_estimate(&c[c.len() / 16..c.len() / 4], SR))
                .collect();
            assert!(spread(&f0s) > 20.0, "sigh onset F0 spread {:?}", f0s);
        }
    }
}

#[test]
fn breath_energy_is_in_the_breath_band() {
    for seed in 0..10 {
        let x = render_nonverbal(NonverbalKind::Breath, 0.0, 1.0, seed, SR);
        let frac = band_fraction(&x, SR, 300.0, 5000.0);
        assert!(
            frac > 0.9,
            "seed {seed}: only {frac} of energy in 300 Hz-5 kHz"
        );
        let c = centroid(&x, SR);
        assert!((800.0..3500.0).contains(&c), "seed {seed}: centroid {c} Hz");
    }
}

#[test]
fn sigh_has_voiced_onset_and_darkens() {
    for seed in 0..10 {
        let x = render_nonverbal(NonverbalKind::Sigh, 0.0, 1.0, seed, SR);
        assert!(band_fraction(&x, SR, 100.0, 5000.0) > 0.9, "seed {seed}");
        let q = x.len() / 4;
        let (head, tail) = (&x[q / 4..q + q / 4], &x[x.len() - 2 * q..x.len() - q]);
        let (ph, pt) = (periodicity(head, SR), periodicity(tail, SR));
        assert!(
            ph > 0.4 && ph > pt + 0.2,
            "seed {seed}: periodicity head {ph} tail {pt}"
        );
        // Darkening, measured after voicing has ended (>= 50%): the share
        // of energy above 2 kHz falls from the middle to the end.
        let n = x.len();
        let mid = &x[n / 2..n * 7 / 10];
        let end = &x[n * 8 / 10..];
        let (hm, he) = (
            band_fraction(mid, SR, 2000.0, 12000.0),
            band_fraction(end, SR, 2000.0, 12000.0),
        );
        assert!(
            he < 0.7 * hm,
            "seed {seed}: >2 kHz share {hm} -> {he} (should fall)"
        );
    }
}

#[test]
fn works_at_48k_and_clamps_garbage_inputs() {
    let x = render_nonverbal(NonverbalKind::Breath, 350.0, 1.0, 5, 48_000);
    assert_eq!(x.len(), 16_800);
    assert!(band_fraction(&x, 48_000, 300.0, 5000.0) > 0.9);
    for (ms, inten) in [(f64::NAN, f32::NAN), (-5.0, 7.0), (1e9, -1.0)] {
        let y = render_nonverbal(NonverbalKind::Sigh, ms, inten, 1, SR);
        assert!(y.iter().all(|v| v.is_finite()));
        assert!(peak(&y) <= 10f32.powf(-12.0 / 20.0));
    }
    assert_eq!(NonverbalKind::parse(" Sigh "), Some(NonverbalKind::Sigh));
    assert_eq!(NonverbalKind::parse("laugh"), None);
}

/// f0 of the voiced onset (4-16% of the clip, where voicing is strong):
/// normalized autocorrelation over 90-400 Hz, taking the shortest lag within
/// 85% of the best peak so a subharmonic (octave-down) peak never wins.
fn onset_f0(x: &[f32], sr: u32) -> f32 {
    let n = x.len();
    let seg = &x[n * 4 / 100..n * 16 / 100];
    let (lo, hi) = ((sr / 400) as usize, (sr / 90) as usize);
    let acf: Vec<(usize, f32)> = (lo..hi)
        .map(|lag| {
            let (a, b) = (&seg[..seg.len() - lag], &seg[lag..]);
            let dot: f32 = a.iter().zip(b).map(|(p, q)| p * q).sum();
            let e = (a.iter().map(|v| v * v).sum::<f32>() * b.iter().map(|v| v * v).sum::<f32>())
                .sqrt();
            (lag, if e > 0.0 { dot / e } else { 0.0 })
        })
        .collect();
    let best = acf.iter().map(|c| c.1).fold(f32::MIN, f32::max);
    // Local maxima only, so the lag-`lo` edge of a peak isn't taken.
    let lag = (1..acf.len() - 1)
        .find(|&i| acf[i].1 >= 0.85 * best && acf[i].1 >= acf[i - 1].1 && acf[i].1 >= acf[i + 1].1)
        .map_or(acf[0].0, |i| acf[i].0);
    sr as f32 / lag as f32
}

#[test]
fn sigh_pitch_follows_the_speakers_f0() {
    // Lester (Ferni's voice) has a median f0 of ~111 Hz: the sigh's voiced
    // onset starts near 1.25x that (~139 Hz) and falls toward 0.9x, instead
    // of the speaker-agnostic 150-195 Hz start.
    for seed in 0..10 {
        let low = render_nonverbal_at(NonverbalKind::Sigh, 0.0, 1.0, seed, SR, Some(111.0));
        let default = render_nonverbal(NonverbalKind::Sigh, 0.0, 1.0, seed, SR);
        let (fl, fd) = (onset_f0(&low, SR), onset_f0(&default, SR));
        assert!((118.0..=152.0).contains(&fl), "seed {seed}: onset f0 {fl}");
        assert!(fl < 0.9 * fd, "seed {seed}: {fl} vs default {fd}");
        let high = render_nonverbal_at(NonverbalKind::Sigh, 0.0, 1.0, seed, SR, Some(220.0));
        assert!(
            onset_f0(&high, SR) > 1.5 * fl,
            "seed {seed}: pitch must track f0"
        );
    }
}

#[test]
fn sigh_f0_is_optional_and_garbage_means_default() {
    for seed in [1, 2, 3] {
        let default = render_nonverbal(NonverbalKind::Sigh, 0.0, 1.0, seed, SR);
        for f0 in [None, Some(f32::NAN), Some(0.0), Some(-111.0), Some(5000.0)] {
            assert_eq!(
                render_nonverbal_at(NonverbalKind::Sigh, 0.0, 1.0, seed, SR, f0),
                default,
                "seed {seed} f0 {f0:?}"
            );
        }
        // A breath is unvoiced: f0 does not change it.
        assert_eq!(
            render_nonverbal_at(NonverbalKind::Breath, 0.0, 1.0, seed, SR, Some(111.0)),
            render_nonverbal(NonverbalKind::Breath, 0.0, 1.0, seed, SR)
        );
        // Still every guarantee: length, edges at 0, peak under -12 dBFS.
        let x = render_nonverbal_at(NonverbalKind::Sigh, 0.0, 1.0, seed, SR, Some(111.0));
        assert_eq!(x.len(), default.len());
        assert!(x[0].abs() < 1e-6 && x[x.len() - 1].abs() < 1e-6);
        assert!(peak(&x) <= 10f32.powf(-12.0 / 20.0));
    }
}
