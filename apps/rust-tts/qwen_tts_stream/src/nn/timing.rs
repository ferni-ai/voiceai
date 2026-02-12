//! Simple timing instrumentation for performance profiling.
//!
//! Enable with `--features timing` to collect performance metrics.
//! When disabled, all timing operations compile to no-ops.

#[cfg(feature = "timing")]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(feature = "timing")]
use std::time::Instant;

/// Global timing accumulators (in microseconds)
#[cfg(feature = "timing")]
pub static ATTENTION_TIME_US: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static ATTENTION_OTHER_TIME_US: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static ATTENTION_MATMUL_TIME_US: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static ATTENTION_SOFTMAX_TIME_US: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static RMSNORM_TIME_US: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static MLP_TIME_US: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static ROPE_TIME_US: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static CODE_PREDICTOR_TIME_US: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static TALKER_FORWARD_TIME_US: AtomicU64 = AtomicU64::new(0);

/// Call counts
#[cfg(feature = "timing")]
pub static ATTENTION_CALLS: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static RMSNORM_CALLS: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static RMSNORM_CONTIGUOUS: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static RMSNORM_NONCONTIGUOUS: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static MLP_CALLS: AtomicU64 = AtomicU64::new(0);
#[cfg(feature = "timing")]
pub static ROPE_CALLS: AtomicU64 = AtomicU64::new(0);

/// Reset all timing accumulators.
#[cfg(feature = "timing")]
pub fn reset_timings() {
    ATTENTION_TIME_US.store(0, Ordering::Relaxed);
    ATTENTION_OTHER_TIME_US.store(0, Ordering::Relaxed);
    ATTENTION_MATMUL_TIME_US.store(0, Ordering::Relaxed);
    ATTENTION_SOFTMAX_TIME_US.store(0, Ordering::Relaxed);
    RMSNORM_TIME_US.store(0, Ordering::Relaxed);
    MLP_TIME_US.store(0, Ordering::Relaxed);
    ROPE_TIME_US.store(0, Ordering::Relaxed);
    CODE_PREDICTOR_TIME_US.store(0, Ordering::Relaxed);
    TALKER_FORWARD_TIME_US.store(0, Ordering::Relaxed);
    ATTENTION_CALLS.store(0, Ordering::Relaxed);
    RMSNORM_CALLS.store(0, Ordering::Relaxed);
    RMSNORM_CONTIGUOUS.store(0, Ordering::Relaxed);
    RMSNORM_NONCONTIGUOUS.store(0, Ordering::Relaxed);
    MLP_CALLS.store(0, Ordering::Relaxed);
    ROPE_CALLS.store(0, Ordering::Relaxed);
}

/// Print timing summary.
#[cfg(feature = "timing")]
pub fn print_timings() {
    let attn = ATTENTION_TIME_US.load(Ordering::Relaxed);
    let attn_other = ATTENTION_OTHER_TIME_US.load(Ordering::Relaxed);
    let attn_matmul = ATTENTION_MATMUL_TIME_US.load(Ordering::Relaxed);
    let attn_softmax = ATTENTION_SOFTMAX_TIME_US.load(Ordering::Relaxed);
    let norm = RMSNORM_TIME_US.load(Ordering::Relaxed);
    let mlp = MLP_TIME_US.load(Ordering::Relaxed);
    let rope = ROPE_TIME_US.load(Ordering::Relaxed);
    let code_pred = CODE_PREDICTOR_TIME_US.load(Ordering::Relaxed);
    let talker = TALKER_FORWARD_TIME_US.load(Ordering::Relaxed);

    let attn_calls = ATTENTION_CALLS.load(Ordering::Relaxed);
    let norm_calls = RMSNORM_CALLS.load(Ordering::Relaxed);
    let norm_contiguous = RMSNORM_CONTIGUOUS.load(Ordering::Relaxed);
    let norm_noncontiguous = RMSNORM_NONCONTIGUOUS.load(Ordering::Relaxed);
    let mlp_calls = MLP_CALLS.load(Ordering::Relaxed);
    let rope_calls = ROPE_CALLS.load(Ordering::Relaxed);

    println!("\n=== Timing Summary ===");
    println!(
        "Attention:      {:>8.2}ms ({} calls, {:.2}ms avg)",
        attn as f64 / 1000.0,
        attn_calls,
        if attn_calls > 0 {
            attn as f64 / attn_calls as f64 / 1000.0
        } else {
            0.0
        }
    );
    println!(
        "  - other:      {:>8.2}ms ({:.1}%) [repeat_kv, transpose, etc]",
        attn_other as f64 / 1000.0,
        if attn > 0 {
            attn_other as f64 / attn as f64 * 100.0
        } else {
            0.0
        }
    );
    println!(
        "  - matmul:     {:>8.2}ms ({:.1}%)",
        attn_matmul as f64 / 1000.0,
        if attn > 0 {
            attn_matmul as f64 / attn as f64 * 100.0
        } else {
            0.0
        }
    );
    println!(
        "  - softmax:    {:>8.2}ms ({:.1}%)",
        attn_softmax as f64 / 1000.0,
        if attn > 0 {
            attn_softmax as f64 / attn as f64 * 100.0
        } else {
            0.0
        }
    );
    println!(
        "RMSNorm: {:>8.2}ms ({} calls, {} contiguous, {} non-contiguous)",
        norm as f64 / 1000.0,
        norm_calls,
        norm_contiguous,
        norm_noncontiguous
    );
    println!(
        "MLP:            {:>8.2}ms ({} calls)",
        mlp as f64 / 1000.0,
        mlp_calls
    );
    println!(
        "RoPE:           {:>8.2}ms ({} calls)",
        rope as f64 / 1000.0,
        rope_calls
    );
    println!("Code Predictor: {:>8.2}ms", code_pred as f64 / 1000.0);
    println!("Talker Forward: {:>8.2}ms", talker as f64 / 1000.0);
    println!("======================\n");
}

/// RAII timer that adds elapsed time to an atomic counter.
#[cfg(feature = "timing")]
pub struct Timer {
    start: Instant,
    counter: &'static AtomicU64,
}

#[cfg(feature = "timing")]
impl Timer {
    #[inline]
    pub fn new(counter: &'static AtomicU64) -> Self {
        Self {
            start: Instant::now(),
            counter,
        }
    }
}

#[cfg(feature = "timing")]
impl Drop for Timer {
    fn drop(&mut self) {
        let elapsed = self.start.elapsed().as_micros() as u64;
        self.counter.fetch_add(elapsed, Ordering::Relaxed);
    }
}

/// Record elapsed time to a counter.
#[cfg(feature = "timing")]
#[inline]
pub fn record_time(counter: &'static AtomicU64, micros: u64) {
    counter.fetch_add(micros, Ordering::Relaxed);
}

/// Increment a call counter.
#[cfg(feature = "timing")]
#[inline]
pub fn increment_calls(counter: &'static AtomicU64) {
    counter.fetch_add(1, Ordering::Relaxed);
}

/// Macro for timing a code block. Compiles to no-op when timing feature is disabled.
#[macro_export]
macro_rules! timed {
    ($counter:expr, $block:expr) => {{
        #[cfg(feature = "timing")]
        {
            let _timer = $crate::nn::timing::Timer::new($counter);
            $block
        }
        #[cfg(not(feature = "timing"))]
        {
            $block
        }
    }};
}

/// Macro for recording elapsed time. Compiles to no-op when timing feature is disabled.
#[macro_export]
macro_rules! record_elapsed {
    ($counter:expr, $start:expr) => {
        #[cfg(feature = "timing")]
        {
            $crate::nn::timing::record_time($counter, $start.elapsed().as_micros() as u64);
        }
    };
}

/// Macro for incrementing call count. Compiles to no-op when timing feature is disabled.
#[macro_export]
macro_rules! increment_counter {
    ($counter:expr) => {
        #[cfg(feature = "timing")]
        {
            $crate::nn::timing::increment_calls($counter);
        }
    };
}

/// Get current time. Returns Instant when timing enabled, () otherwise.
#[cfg(feature = "timing")]
#[inline]
pub fn now() -> std::time::Instant {
    std::time::Instant::now()
}

#[cfg(not(feature = "timing"))]
#[inline]
pub fn now() {}
