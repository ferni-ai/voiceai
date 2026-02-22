//! Instant Response Cache
//!
//! Caches common TTS responses as pre-synthesized PCM audio.
//! Keyed by (persona, emotion, text_hash). LRU eviction, 100MB max.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::time::Instant;

use tracing::{debug, info};

/// Maximum cache size in bytes (100MB).
const MAX_CACHE_BYTES: usize = 100 * 1024 * 1024;

/// Bytes per f32 sample.
const BYTES_PER_SAMPLE: usize = 4;

/// A cache key for response lookup.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CacheKey {
    pub persona: String,
    pub emotion: String,
    pub text_hash: u64,
}

impl CacheKey {
    pub fn new(persona: &str, emotion: &str, text: &str) -> Self {
        let mut hasher = DefaultHasher::new();
        text.to_lowercase().trim().hash(&mut hasher);
        Self {
            persona: persona.to_string(),
            emotion: emotion.to_string(),
            text_hash: hasher.finish(),
        }
    }
}

/// A cached audio response.
#[derive(Debug, Clone)]
struct CacheEntry {
    audio: Vec<f32>,
    #[allow(dead_code)]
    created_at: Instant,
    last_accessed: Instant,
    access_count: u64,
}

/// LRU response cache for pre-synthesized TTS audio.
pub struct ResponseCache {
    entries: HashMap<CacheKey, CacheEntry>,
    current_bytes: usize,
    hits: u64,
    misses: u64,
}

impl ResponseCache {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
            current_bytes: 0,
            hits: 0,
            misses: 0,
        }
    }

    /// Look up cached audio. Returns None on miss.
    pub fn get(&mut self, key: &CacheKey) -> Option<Vec<f32>> {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.last_accessed = Instant::now();
            entry.access_count += 1;
            self.hits += 1;
            debug!(persona = %key.persona, emotion = %key.emotion, "Response cache HIT");
            Some(entry.audio.clone())
        } else {
            self.misses += 1;
            None
        }
    }

    /// Insert a new cached response. Evicts LRU entries if over capacity.
    pub fn insert(&mut self, key: CacheKey, audio: Vec<f32>) {
        let entry_bytes = audio.len() * BYTES_PER_SAMPLE;

        if entry_bytes > MAX_CACHE_BYTES / 10 {
            debug!(bytes = entry_bytes, "Response too large to cache");
            return;
        }

        while self.current_bytes + entry_bytes > MAX_CACHE_BYTES && !self.entries.is_empty() {
            self.evict_lru();
        }

        self.current_bytes += entry_bytes;
        self.entries.insert(
            key,
            CacheEntry {
                audio,
                created_at: Instant::now(),
                last_accessed: Instant::now(),
                access_count: 1,
            },
        );
    }

    fn evict_lru(&mut self) {
        let lru_key = self
            .entries
            .iter()
            .min_by_key(|(_, v)| v.last_accessed)
            .map(|(k, _)| k.clone());
        if let Some(lru_key) = lru_key {
            if let Some(entry) = self.entries.remove(&lru_key) {
                self.current_bytes -= entry.audio.len() * BYTES_PER_SAMPLE;
                debug!(persona = %lru_key.persona, "Evicted LRU cache entry");
            }
        }
    }

    /// Get cache statistics.
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            entries: self.entries.len(),
            bytes_used: self.current_bytes,
            max_bytes: MAX_CACHE_BYTES,
            hits: self.hits,
            misses: self.misses,
            hit_rate: if self.hits + self.misses > 0 {
                self.hits as f64 / (self.hits + self.misses) as f64
            } else {
                0.0
            },
        }
    }

    /// Clear all cached entries.
    pub fn clear(&mut self) {
        self.entries.clear();
        self.current_bytes = 0;
        info!("Response cache cleared");
    }
}

impl Default for ResponseCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Cache statistics for monitoring.
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub entries: usize,
    pub bytes_used: usize,
    pub max_bytes: usize,
    pub hits: u64,
    pub misses: u64,
    pub hit_rate: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_hit_miss() {
        let mut cache = ResponseCache::new();
        let key = CacheKey::new("ferni", "neutral", "Hello there");

        assert!(cache.get(&key).is_none());
        assert_eq!(cache.stats().misses, 1);

        cache.insert(key.clone(), vec![0.0f32; 24000]);

        let result = cache.get(&key);
        assert!(result.is_some());
        assert_eq!(result.unwrap().len(), 24000);
        assert_eq!(cache.stats().hits, 1);
    }

    #[test]
    fn test_lru_eviction() {
        let mut cache = ResponseCache::new();

        for i in 0..1000 {
            let key = CacheKey::new("ferni", "neutral", &format!("phrase_{i}"));
            cache.insert(key, vec![0.0f32; 24000 * 10]);
        }

        assert!(cache.stats().bytes_used <= MAX_CACHE_BYTES);
    }
}
