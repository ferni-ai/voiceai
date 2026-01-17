//! Embedding Cache
//!
//! High-performance caching for embeddings with SHA256 hashing and LRU eviction.
//! Eliminates per-call SHA256 overhead and provides O(1) cache operations.

use lru::LruCache;
use sha2::{Digest, Sha256};
use std::num::NonZeroUsize;
use std::sync::RwLock;

/// Cache entry with embedding and metadata
#[derive(Clone)]
pub struct CacheEntry {
    /// The embedding vector
    pub embedding: Vec<f32>,
    /// Creation timestamp (Unix ms)
    pub created_at: u64,
    /// Time-to-live in milliseconds
    pub ttl_ms: u64,
}

impl CacheEntry {
    /// Check if the entry has expired
    pub fn is_expired(&self, current_time_ms: u64) -> bool {
        current_time_ms > self.created_at + self.ttl_ms
    }
}

/// Thread-safe LRU cache for embeddings
pub struct EmbeddingCache {
    /// The actual LRU cache
    cache: RwLock<LruCache<[u8; 32], CacheEntry>>,
    /// Maximum cache size
    max_size: usize,
    /// Default TTL in milliseconds
    default_ttl_ms: u64,
}

impl EmbeddingCache {
    /// Create a new embedding cache with the specified capacity
    pub fn new(max_size: usize, default_ttl_ms: u64) -> Self {
        let cache = LruCache::new(NonZeroUsize::new(max_size).unwrap_or(NonZeroUsize::MIN));
        Self {
            cache: RwLock::new(cache),
            max_size,
            default_ttl_ms,
        }
    }

    /// Compute SHA256 hash of text (returns 32-byte array)
    #[inline]
    pub fn hash_text(text: &str) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(text.as_bytes());
        hasher.finalize().into()
    }

    /// Compute SHA256 hash and return as hex string
    pub fn hash_text_hex(text: &str) -> String {
        let hash = Self::hash_text(text);
        hex::encode(hash)
    }

    /// Get an embedding from the cache
    pub fn get(&self, text: &str, current_time_ms: u64) -> Option<Vec<f32>> {
        let key = Self::hash_text(text);
        let mut cache = self.cache.write().ok()?;

        if let Some(entry) = cache.get(&key) {
            if !entry.is_expired(current_time_ms) {
                return Some(entry.embedding.clone());
            }
            // Entry expired, remove it
            cache.pop(&key);
        }
        None
    }

    /// Put an embedding in the cache
    pub fn put(&self, text: &str, embedding: Vec<f32>, current_time_ms: u64) {
        let key = Self::hash_text(text);
        let entry = CacheEntry {
            embedding,
            created_at: current_time_ms,
            ttl_ms: self.default_ttl_ms,
        };

        if let Ok(mut cache) = self.cache.write() {
            cache.put(key, entry);
        }
    }

    /// Put an embedding with custom TTL
    pub fn put_with_ttl(&self, text: &str, embedding: Vec<f32>, current_time_ms: u64, ttl_ms: u64) {
        let key = Self::hash_text(text);
        let entry = CacheEntry {
            embedding,
            created_at: current_time_ms,
            ttl_ms,
        };

        if let Ok(mut cache) = self.cache.write() {
            cache.put(key, entry);
        }
    }

    /// Remove an entry from the cache
    pub fn remove(&self, text: &str) -> bool {
        let key = Self::hash_text(text);
        if let Ok(mut cache) = self.cache.write() {
            return cache.pop(&key).is_some();
        }
        false
    }

    /// Clear all entries from the cache
    pub fn clear(&self) {
        if let Ok(mut cache) = self.cache.write() {
            cache.clear();
        }
    }

    /// Get the current number of entries
    pub fn len(&self) -> usize {
        self.cache.read().map(|c| c.len()).unwrap_or(0)
    }

    /// Check if the cache is empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Get the maximum capacity
    pub fn capacity(&self) -> usize {
        self.max_size
    }

    /// Prune expired entries
    pub fn prune_expired(&self, current_time_ms: u64) -> usize {
        let mut pruned = 0;
        if let Ok(mut cache) = self.cache.write() {
            // Collect keys to remove (can't modify while iterating)
            let expired_keys: Vec<[u8; 32]> = cache
                .iter()
                .filter(|(_, entry)| entry.is_expired(current_time_ms))
                .map(|(k, _)| *k)
                .collect();

            for key in expired_keys {
                cache.pop(&key);
                pruned += 1;
            }
        }
        pruned
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        let len = self.len();
        CacheStats {
            size: len,
            capacity: self.max_size,
            utilization: len as f64 / self.max_size as f64,
        }
    }
}

/// Cache statistics
pub struct CacheStats {
    pub size: usize,
    pub capacity: usize,
    pub utilization: f64,
}

/// Batch hash computation for multiple texts
#[allow(dead_code)]
pub fn batch_hash_texts(texts: &[String]) -> Vec<[u8; 32]> {
    texts
        .iter()
        .map(|t| EmbeddingCache::hash_text(t))
        .collect()
}

/// Batch hash computation returning hex strings
pub fn batch_hash_texts_hex(texts: &[String]) -> Vec<String> {
    texts
        .iter()
        .map(|t| EmbeddingCache::hash_text_hex(t))
        .collect()
}

// Helper for hex encoding (avoid external dependency just for this)
mod hex {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

    pub fn encode(bytes: [u8; 32]) -> String {
        let mut s = String::with_capacity(64);
        for byte in bytes {
            s.push(HEX_CHARS[(byte >> 4) as usize] as char);
            s.push(HEX_CHARS[(byte & 0x0f) as usize] as char);
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_deterministic() {
        let hash1 = EmbeddingCache::hash_text("hello world");
        let hash2 = EmbeddingCache::hash_text("hello world");
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_different_inputs() {
        let hash1 = EmbeddingCache::hash_text("hello");
        let hash2 = EmbeddingCache::hash_text("world");
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_cache_put_get() {
        let cache = EmbeddingCache::new(100, 60000);
        let embedding = vec![0.1, 0.2, 0.3];

        cache.put("test", embedding.clone(), 1000);
        let result = cache.get("test", 2000);

        assert!(result.is_some());
        assert_eq!(result.unwrap(), embedding);
    }

    #[test]
    fn test_cache_expiration() {
        let cache = EmbeddingCache::new(100, 1000); // 1 second TTL
        let embedding = vec![0.1, 0.2, 0.3];

        cache.put("test", embedding, 1000);

        // Not expired
        assert!(cache.get("test", 1500).is_some());

        // Expired
        assert!(cache.get("test", 3000).is_none());
    }

    #[test]
    fn test_cache_lru_eviction() {
        let cache = EmbeddingCache::new(2, 60000); // Only 2 entries

        cache.put("first", vec![1.0], 1000);
        cache.put("second", vec![2.0], 2000);
        cache.put("third", vec![3.0], 3000); // Should evict "first"

        assert!(cache.get("first", 4000).is_none());
        assert!(cache.get("second", 4000).is_some());
        assert!(cache.get("third", 4000).is_some());
    }

    #[test]
    fn test_prune_expired() {
        let cache = EmbeddingCache::new(100, 1000);

        cache.put("a", vec![1.0], 1000);
        cache.put("b", vec![2.0], 2000);
        cache.put("c", vec![3.0], 3000);

        // At time 2500, "a" is expired
        let pruned = cache.prune_expired(2500);
        assert_eq!(pruned, 1);
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn test_batch_hash() {
        let texts = vec![
            "hello".to_string(),
            "world".to_string(),
            "test".to_string(),
        ];

        let hashes = batch_hash_texts(&texts);
        assert_eq!(hashes.len(), 3);

        // Verify each hash is correct
        for (text, hash) in texts.iter().zip(hashes.iter()) {
            assert_eq!(*hash, EmbeddingCache::hash_text(text));
        }
    }
}
