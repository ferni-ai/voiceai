//! Key-Value cache for efficient autoregressive generation.
//!
//! The KV-cache stores computed key and value tensors from previous
//! positions, avoiding redundant computation during generation.
//!
//! Reference: transformers DynamicCache (modeling.py:767-786)

use candle_core::{Result, Tensor};

/// Per-layer key-value cache entry.
#[derive(Debug, Clone)]
pub struct KVCacheEntry {
    /// Cached key tensor: (batch, num_kv_heads, seq_len, head_dim)
    pub key: Tensor,
    /// Cached value tensor: (batch, num_kv_heads, seq_len, head_dim)
    pub value: Tensor,
}

impl KVCacheEntry {
    /// Create a new cache entry from key and value tensors.
    pub fn new(key: Tensor, value: Tensor) -> Self {
        Self { key, value }
    }

    /// Get the current cached sequence length.
    pub fn seq_len(&self) -> Result<usize> {
        self.key.dim(2)
    }

    /// Update the cache by appending new key/value tensors.
    ///
    /// Args:
    ///   new_key: New key tensor to append (batch, num_kv_heads, new_len, head_dim)
    ///   new_value: New value tensor to append (batch, num_kv_heads, new_len, head_dim)
    ///
    /// Returns:
    ///   Updated (full_key, full_value) tensors
    pub fn update(&mut self, new_key: &Tensor, new_value: &Tensor) -> Result<(Tensor, Tensor)> {
        self.key = Tensor::cat(&[&self.key, new_key], 2)?;
        self.value = Tensor::cat(&[&self.value, new_value], 2)?;
        Ok((self.key.clone(), self.value.clone()))
    }
}

/// Dynamic KV-cache that grows as generation progresses.
///
/// Stores key/value tensors for each transformer layer.
#[derive(Debug, Clone, Default)]
pub struct KVCache {
    /// Per-layer cache entries (layer_idx -> cache entry)
    entries: Vec<Option<KVCacheEntry>>,
    /// Total sequence length cached
    seq_len: usize,
}

impl KVCache {
    /// Create a new empty cache.
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            seq_len: 0,
        }
    }

    /// Create a cache with pre-allocated layers.
    pub fn with_num_layers(num_layers: usize) -> Self {
        Self {
            entries: vec![None; num_layers],
            seq_len: 0,
        }
    }

    /// Get the current cached sequence length.
    pub fn seq_len(&self) -> usize {
        self.seq_len
    }

    /// Check if the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.seq_len == 0
    }

    /// Get the cache entry for a specific layer.
    pub fn get(&self, layer_idx: usize) -> Option<&KVCacheEntry> {
        self.entries.get(layer_idx).and_then(|e| e.as_ref())
    }

    /// Update the cache for a specific layer.
    ///
    /// If this is the first update for this layer, creates a new entry.
    /// Otherwise, appends to the existing entry.
    ///
    /// Args:
    ///   layer_idx: The layer index
    ///   key: Key tensor (batch, num_kv_heads, new_len, head_dim)
    ///   value: Value tensor (batch, num_kv_heads, new_len, head_dim)
    ///
    /// Returns:
    ///   The full (key, value) tensors after update
    pub fn update(
        &mut self,
        layer_idx: usize,
        key: &Tensor,
        value: &Tensor,
    ) -> Result<(Tensor, Tensor)> {
        // Ensure we have enough layers
        while self.entries.len() <= layer_idx {
            self.entries.push(None);
        }

        let new_len = key.dim(2)?;

        match &mut self.entries[layer_idx] {
            Some(entry) => {
                let result = entry.update(key, value)?;
                // Update seq_len on first layer update
                if layer_idx == 0 {
                    self.seq_len += new_len;
                }
                Ok(result)
            }
            None => {
                self.entries[layer_idx] = Some(KVCacheEntry::new(key.clone(), value.clone()));
                // Update seq_len on first layer update
                if layer_idx == 0 {
                    self.seq_len = new_len;
                }
                Ok((key.clone(), value.clone()))
            }
        }
    }

    /// Clear the cache (e.g., at the start of a new generation).
    pub fn clear(&mut self) {
        for entry in &mut self.entries {
            *entry = None;
        }
        self.seq_len = 0;
    }

    /// Get the cache position for RoPE (next position to fill).
    pub fn cache_position(&self) -> usize {
        self.seq_len
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;

    #[test]
    fn test_kv_cache_basic() -> Result<()> {
        let device = Device::Cpu;
        let mut cache = KVCache::with_num_layers(2);

        assert!(cache.is_empty());
        assert_eq!(cache.seq_len(), 0);

        // First update
        let key1 = Tensor::zeros((1, 4, 5, 64), candle_core::DType::F32, &device)?;
        let value1 = Tensor::zeros((1, 4, 5, 64), candle_core::DType::F32, &device)?;

        let (k, v) = cache.update(0, &key1, &value1)?;
        assert_eq!(k.dims(), &[1, 4, 5, 64]);
        assert_eq!(v.dims(), &[1, 4, 5, 64]);
        assert_eq!(cache.seq_len(), 5);

        // Second update (append)
        let key2 = Tensor::zeros((1, 4, 1, 64), candle_core::DType::F32, &device)?;
        let value2 = Tensor::zeros((1, 4, 1, 64), candle_core::DType::F32, &device)?;

        let (k, v) = cache.update(0, &key2, &value2)?;
        assert_eq!(k.dims(), &[1, 4, 6, 64]);
        assert_eq!(v.dims(), &[1, 4, 6, 64]);
        assert_eq!(cache.seq_len(), 6);

        Ok(())
    }

    #[test]
    fn test_kv_cache_clear() -> Result<()> {
        let device = Device::Cpu;
        let mut cache = KVCache::with_num_layers(2);

        let key = Tensor::zeros((1, 4, 5, 64), candle_core::DType::F32, &device)?;
        let value = Tensor::zeros((1, 4, 5, 64), candle_core::DType::F32, &device)?;

        cache.update(0, &key, &value)?;
        assert!(!cache.is_empty());

        cache.clear();
        assert!(cache.is_empty());
        assert_eq!(cache.seq_len(), 0);

        Ok(())
    }
}
