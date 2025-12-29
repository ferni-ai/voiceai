//! Pre-allocated Buffer Pool
//!
//! Provides zero-allocation buffer reuse for real-time audio processing.
//! Buffers are pre-allocated at session start and recycled for each frame.
//!
//! Key design:
//! - Fixed-size buffers allocated once per session
//! - No per-frame heap allocations
//! - Thread-safe for multi-core processing

use std::sync::atomic::{AtomicUsize, Ordering};

/// Configuration for buffer pool
#[derive(Debug, Clone)]
pub struct BufferPoolConfig {
    /// Size of each buffer in samples
    pub buffer_size: usize,
    /// Number of buffers in pool
    pub pool_size: usize,
}

impl Default for BufferPoolConfig {
    fn default() -> Self {
        Self {
            // 512 samples @ 16kHz = 32ms window
            buffer_size: 512,
            // 4 buffers for double-buffering + headroom
            pool_size: 4,
        }
    }
}

/// Pre-allocated buffer pool for zero-allocation audio processing
pub struct BufferPool {
    /// Pre-allocated f32 buffers
    buffers: Vec<Vec<f32>>,
    /// Current buffer index (round-robin)
    current: AtomicUsize,
    /// Buffer size
    buffer_size: usize,
}

impl BufferPool {
    /// Create a new buffer pool with given configuration
    pub fn new(config: BufferPoolConfig) -> Self {
        let mut buffers = Vec::with_capacity(config.pool_size);
        for _ in 0..config.pool_size {
            buffers.push(vec![0.0f32; config.buffer_size]);
        }

        Self {
            buffers,
            current: AtomicUsize::new(0),
            buffer_size: config.buffer_size,
        }
    }

    /// Get the next available buffer (round-robin)
    /// Returns a mutable slice to the pre-allocated buffer
    #[inline]
    pub fn get_buffer(&mut self) -> &mut [f32] {
        let idx = self.current.fetch_add(1, Ordering::Relaxed) % self.buffers.len();
        &mut self.buffers[idx]
    }

    /// Get buffer at specific index
    #[inline]
    pub fn get_buffer_at(&mut self, idx: usize) -> &mut [f32] {
        let len = self.buffers.len();
        &mut self.buffers[idx % len]
    }

    /// Get buffer size
    #[inline]
    pub fn buffer_size(&self) -> usize {
        self.buffer_size
    }

    /// Get pool size
    #[inline]
    pub fn pool_size(&self) -> usize {
        self.buffers.len()
    }

    /// Reset all buffers to zero
    pub fn reset(&mut self) {
        for buf in &mut self.buffers {
            buf.fill(0.0);
        }
        self.current.store(0, Ordering::Relaxed);
    }
}

/// Conversion buffer for Int16 -> Float32 conversion
/// Pre-allocated to avoid per-frame allocations
pub struct ConversionBuffer {
    /// Pre-allocated f32 buffer for converted samples
    f32_buffer: Vec<f32>,
    /// Maximum size this buffer can hold
    max_size: usize,
}

impl ConversionBuffer {
    /// Create a new conversion buffer
    ///
    /// # Arguments
    /// * `max_samples` - Maximum number of samples to support
    pub fn new(max_samples: usize) -> Self {
        Self {
            f32_buffer: vec![0.0f32; max_samples],
            max_size: max_samples,
        }
    }

    /// Convert Int16 samples to Float32 in-place
    ///
    /// Returns a slice to the converted samples (zero-copy from pre-allocated buffer)
    #[inline]
    pub fn convert_i16_to_f32(&mut self, samples: &[i16]) -> &[f32] {
        let len = samples.len().min(self.max_size);

        // SIMD-friendly loop for Int16 → Float32 conversion
        // Division by 32768.0 normalizes to [-1.0, 1.0]
        for (i, &sample) in samples[..len].iter().enumerate() {
            self.f32_buffer[i] = sample as f32 / 32768.0;
        }

        &self.f32_buffer[..len]
    }

    /// Get the underlying buffer capacity
    #[inline]
    pub fn capacity(&self) -> usize {
        self.max_size
    }

    /// Reset buffer to zeros
    pub fn reset(&mut self) {
        self.f32_buffer.fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buffer_pool_creation() {
        let config = BufferPoolConfig {
            buffer_size: 256,
            pool_size: 4,
        };
        let pool = BufferPool::new(config);

        assert_eq!(pool.buffer_size(), 256);
        assert_eq!(pool.pool_size(), 4);
    }

    #[test]
    fn test_buffer_pool_round_robin() {
        let config = BufferPoolConfig {
            buffer_size: 16,
            pool_size: 2,
        };
        let mut pool = BufferPool::new(config);

        // First buffer
        let buf1 = pool.get_buffer();
        buf1[0] = 1.0;

        // Second buffer (different)
        let buf2 = pool.get_buffer();
        buf2[0] = 2.0;

        // Third buffer (wraps to first)
        let buf3 = pool.get_buffer();
        assert_eq!(buf3[0], 1.0); // Same as buf1
    }

    #[test]
    fn test_conversion_buffer() {
        let mut conv = ConversionBuffer::new(1024);

        let samples: Vec<i16> = vec![0, 16384, -16384, 32767, -32768];
        let converted = conv.convert_i16_to_f32(&samples);

        assert!((converted[0] - 0.0).abs() < 0.001);
        assert!((converted[1] - 0.5).abs() < 0.001);
        assert!((converted[2] - -0.5).abs() < 0.001);
        assert!((converted[3] - 1.0).abs() < 0.001);
        assert!((converted[4] - -1.0).abs() < 0.001);
    }

    #[test]
    fn test_buffer_reset() {
        let mut pool = BufferPool::new(BufferPoolConfig::default());

        // Write some data
        {
            let buf = pool.get_buffer();
            buf[0] = 42.0;
        }

        // Reset
        pool.reset();

        // Check it's zeroed
        let buf = pool.get_buffer_at(0);
        assert_eq!(buf[0], 0.0);
    }
}
