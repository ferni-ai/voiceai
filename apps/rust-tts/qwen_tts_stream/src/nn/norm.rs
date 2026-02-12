//! RMS Normalization layer.
//!
//! Re-exports candle-nn's optimized RmsNorm which has CUDA/Metal kernels.

use candle_core::Result;
use candle_nn::VarBuilder;

#[cfg(feature = "timing")]
use crate::nn::timing::{
    RMSNORM_CALLS, RMSNORM_CONTIGUOUS, RMSNORM_NONCONTIGUOUS, RMSNORM_TIME_US,
};

/// RMSNorm using candle-nn's optimized implementation.
///
/// This wrapper provides the same construction API as the previous custom implementation
/// while using candle-nn's CUDA/Metal kernels internally.
pub struct RMSNorm(candle_nn::RmsNorm);

impl RMSNorm {
    /// Create a new RMSNorm layer, loading weights from the VarBuilder.
    pub fn new(hidden_size: usize, eps: f64, vb: VarBuilder) -> Result<Self> {
        Ok(Self(candle_nn::rms_norm(hidden_size, eps, vb)?))
    }

    /// Alias for new() to match previous API.
    pub fn load(hidden_size: usize, eps: f64, vb: VarBuilder) -> Result<Self> {
        Self::new(hidden_size, eps, vb)
    }
}

impl candle_nn::Module for RMSNorm {
    fn forward(&self, xs: &candle_core::Tensor) -> Result<candle_core::Tensor> {
        #[cfg(feature = "timing")]
        let start = std::time::Instant::now();
        #[cfg(feature = "timing")]
        RMSNORM_CALLS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        #[cfg(feature = "timing")]
        if xs.is_contiguous() {
            RMSNORM_CONTIGUOUS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        } else {
            RMSNORM_NONCONTIGUOUS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        }

        let result = self.0.forward(xs);

        #[cfg(feature = "timing")]
        RMSNORM_TIME_US.fetch_add(
            start.elapsed().as_micros() as u64,
            std::sync::atomic::Ordering::Relaxed,
        );

        result
    }
}

impl Clone for RMSNorm {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl std::fmt::Debug for RMSNorm {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RMSNorm").finish()
    }
}
