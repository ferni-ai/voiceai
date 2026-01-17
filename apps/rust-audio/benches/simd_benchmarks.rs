//! SIMD Performance Benchmarks for ferni-audio
//!
//! Run with: cargo bench
//! Results will be saved to target/criterion/

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use wide::f32x8;

// ============================================================================
// SIMD vs Scalar Implementations for Benchmarking
// ============================================================================

/// Scalar Int16 to Float32 conversion (baseline)
fn convert_i16_to_f32_scalar(samples: &[i16]) -> Vec<f32> {
    samples.iter().map(|&s| s as f32 / 32768.0).collect()
}

/// SIMD Int16 to Float32 conversion (8x parallel)
fn convert_i16_to_f32_simd(samples: &[i16]) -> Vec<f32> {
    let len = samples.len();
    let mut result = Vec::with_capacity(len);
    let scale = f32x8::splat(1.0 / 32768.0);
    let chunks = len / 8;

    for i in 0..chunks {
        let base = i * 8;
        let f0 = samples[base] as f32;
        let f1 = samples[base + 1] as f32;
        let f2 = samples[base + 2] as f32;
        let f3 = samples[base + 3] as f32;
        let f4 = samples[base + 4] as f32;
        let f5 = samples[base + 5] as f32;
        let f6 = samples[base + 6] as f32;
        let f7 = samples[base + 7] as f32;

        let samples_simd = f32x8::new([f0, f1, f2, f3, f4, f5, f6, f7]);
        let normalized = samples_simd * scale;
        result.extend_from_slice(&normalized.to_array());
    }

    for i in (chunks * 8)..len {
        result.push(samples[i] as f32 / 32768.0);
    }

    result
}

/// Scalar sum of squares (baseline)
fn sum_of_squares_scalar(slice: &[f32]) -> f32 {
    slice.iter().map(|&x| x * x).sum()
}

/// SIMD sum of squares (8x parallel)
fn sum_of_squares_simd(slice: &[f32]) -> f32 {
    let len = slice.len();
    let chunks = len / 8;
    let mut sum_vec = f32x8::splat(0.0);

    for i in 0..chunks {
        let base = i * 8;
        let v = f32x8::new([
            slice[base],
            slice[base + 1],
            slice[base + 2],
            slice[base + 3],
            slice[base + 4],
            slice[base + 5],
            slice[base + 6],
            slice[base + 7],
        ]);
        sum_vec = sum_vec + (v * v);
    }

    let arr = sum_vec.to_array();
    let mut sum_sq: f32 = arr.iter().sum();

    for i in (chunks * 8)..len {
        sum_sq += slice[i] * slice[i];
    }

    sum_sq
}

/// Scalar sum (baseline)
fn sum_scalar(slice: &[f32]) -> f32 {
    slice.iter().sum()
}

/// SIMD sum (8x parallel)
fn sum_simd(slice: &[f32]) -> f32 {
    let len = slice.len();
    let chunks = len / 8;
    let mut sum_vec = f32x8::splat(0.0);

    for i in 0..chunks {
        let base = i * 8;
        let v = f32x8::new([
            slice[base],
            slice[base + 1],
            slice[base + 2],
            slice[base + 3],
            slice[base + 4],
            slice[base + 5],
            slice[base + 6],
            slice[base + 7],
        ]);
        sum_vec = sum_vec + v;
    }

    let arr = sum_vec.to_array();
    let mut total: f32 = arr.iter().sum();

    for i in (chunks * 8)..len {
        total += slice[i];
    }

    total
}

/// Scalar RMS (baseline)
fn compute_rms_scalar(slice: &[f32]) -> f32 {
    if slice.is_empty() {
        return 0.0;
    }
    let sum_sq = sum_of_squares_scalar(slice);
    (sum_sq / slice.len() as f32).sqrt()
}

/// SIMD RMS
fn compute_rms_simd(slice: &[f32]) -> f32 {
    if slice.is_empty() {
        return 0.0;
    }
    let sum_sq = sum_of_squares_simd(slice);
    (sum_sq / slice.len() as f32).sqrt()
}

/// Scalar variance (baseline)
fn compute_variance_scalar(slice: &[f32]) -> f32 {
    if slice.len() < 2 {
        return 0.0;
    }
    let mean = sum_scalar(slice) / slice.len() as f32;
    slice.iter().map(|&v| (v - mean).powi(2)).sum::<f32>() / slice.len() as f32
}

/// SIMD variance
fn compute_variance_simd(slice: &[f32]) -> f32 {
    if slice.len() < 2 {
        return 0.0;
    }
    let mean = sum_simd(slice) / slice.len() as f32;

    // SIMD squared differences
    let len = slice.len();
    let chunks = len / 8;
    let mean_vec = f32x8::splat(mean);
    let mut sum_vec = f32x8::splat(0.0);

    for i in 0..chunks {
        let base = i * 8;
        let v = f32x8::new([
            slice[base],
            slice[base + 1],
            slice[base + 2],
            slice[base + 3],
            slice[base + 4],
            slice[base + 5],
            slice[base + 6],
            slice[base + 7],
        ]);
        let diff = v - mean_vec;
        sum_vec = sum_vec + (diff * diff);
    }

    let arr = sum_vec.to_array();
    let mut sum_sq: f32 = arr.iter().sum();

    for i in (chunks * 8)..len {
        let diff = slice[i] - mean;
        sum_sq += diff * diff;
    }

    sum_sq / slice.len() as f32
}

// ============================================================================
// Benchmark Groups
// ============================================================================

fn bench_i16_to_f32_conversion(c: &mut Criterion) {
    let mut group = c.benchmark_group("i16_to_f32_conversion");

    // Test with various frame sizes (typical LiveKit audio frames)
    for size in [160, 320, 480, 960, 1920].iter() {
        // Generate test data (simulated audio)
        let samples: Vec<i16> = (0..*size)
            .map(|i| ((i as f32 * 0.1).sin() * 16000.0) as i16)
            .collect();

        group.throughput(Throughput::Elements(*size as u64));

        group.bench_with_input(BenchmarkId::new("scalar", size), &samples, |b, samples| {
            b.iter(|| convert_i16_to_f32_scalar(black_box(samples)))
        });

        group.bench_with_input(BenchmarkId::new("simd", size), &samples, |b, samples| {
            b.iter(|| convert_i16_to_f32_simd(black_box(samples)))
        });
    }

    group.finish();
}

fn bench_sum_of_squares(c: &mut Criterion) {
    let mut group = c.benchmark_group("sum_of_squares");

    for size in [160, 320, 480, 960, 1920, 4096].iter() {
        let samples: Vec<f32> = (0..*size)
            .map(|i| (i as f32 * 0.001).sin())
            .collect();

        group.throughput(Throughput::Elements(*size as u64));

        group.bench_with_input(BenchmarkId::new("scalar", size), &samples, |b, samples| {
            b.iter(|| sum_of_squares_scalar(black_box(samples)))
        });

        group.bench_with_input(BenchmarkId::new("simd", size), &samples, |b, samples| {
            b.iter(|| sum_of_squares_simd(black_box(samples)))
        });
    }

    group.finish();
}

fn bench_rms(c: &mut Criterion) {
    let mut group = c.benchmark_group("rms_calculation");

    for size in [160, 320, 480, 960, 1920].iter() {
        let samples: Vec<f32> = (0..*size)
            .map(|i| (i as f32 * 0.001).sin())
            .collect();

        group.throughput(Throughput::Elements(*size as u64));

        group.bench_with_input(BenchmarkId::new("scalar", size), &samples, |b, samples| {
            b.iter(|| compute_rms_scalar(black_box(samples)))
        });

        group.bench_with_input(BenchmarkId::new("simd", size), &samples, |b, samples| {
            b.iter(|| compute_rms_simd(black_box(samples)))
        });
    }

    group.finish();
}

fn bench_variance(c: &mut Criterion) {
    let mut group = c.benchmark_group("variance_calculation");

    for size in [160, 320, 480, 960, 1920].iter() {
        let samples: Vec<f32> = (0..*size)
            .map(|i| (i as f32 * 0.001).sin())
            .collect();

        group.throughput(Throughput::Elements(*size as u64));

        group.bench_with_input(BenchmarkId::new("scalar", size), &samples, |b, samples| {
            b.iter(|| compute_variance_scalar(black_box(samples)))
        });

        group.bench_with_input(BenchmarkId::new("simd", size), &samples, |b, samples| {
            b.iter(|| compute_variance_simd(black_box(samples)))
        });
    }

    group.finish();
}

fn bench_realistic_audio_frame(c: &mut Criterion) {
    let mut group = c.benchmark_group("realistic_audio_frame");

    // 20ms frame at 16kHz = 320 samples (typical LiveKit frame)
    let frame_size = 320;
    let i16_samples: Vec<i16> = (0..frame_size)
        .map(|i| ((i as f32 * 0.05).sin() * 16000.0) as i16)
        .collect();

    group.throughput(Throughput::Elements(frame_size as u64));

    // Full pipeline: convert + compute RMS + compute variance
    group.bench_function("scalar_pipeline", |b| {
        b.iter(|| {
            let f32_samples = convert_i16_to_f32_scalar(black_box(&i16_samples));
            let _rms = compute_rms_scalar(&f32_samples);
            let _variance = compute_variance_scalar(&f32_samples);
        })
    });

    group.bench_function("simd_pipeline", |b| {
        b.iter(|| {
            let f32_samples = convert_i16_to_f32_simd(black_box(&i16_samples));
            let _rms = compute_rms_simd(&f32_samples);
            let _variance = compute_variance_simd(&f32_samples);
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_i16_to_f32_conversion,
    bench_sum_of_squares,
    bench_rms,
    bench_variance,
    bench_realistic_audio_frame,
);

criterion_main!(benches);
