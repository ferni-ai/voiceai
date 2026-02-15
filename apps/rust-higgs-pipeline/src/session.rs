use std::collections::HashMap;
use std::time::{Duration, Instant};

/// 5 minutes at 16kHz — prevents unbounded buffer growth from stalled consumers.
const MAX_AUDIO_BUFFER_SAMPLES: usize = 16_000 * 300;

/// Sessions idle longer than this are reaped by the background cleanup task.
const SESSION_TTL: Duration = Duration::from_secs(3600);

/// State for a single active voice session.
pub struct SessionState {
    pub session_id: String,
    /// Accumulated PCM i16 audio from the client.
    pub audio_buffer: Vec<i16>,
    /// Number of tokens in the persistent KV cache.
    pub kv_cache_tokens: usize,
    /// Version counter for optimistic KV cache updates (prevents races between concurrent synthesis requests).
    pub kv_cache_version: u64,
    /// Active persona for this session.
    pub persona: String,
    pub created_at: Instant,
    pub last_activity: Instant,
    pub total_transcriptions: usize,
    pub total_syntheses: usize,
    /// Most recent biomarkers from user's audio (for humanization feedback loop).
    pub last_biomarkers: Option<crate::analysis::biomarkers::VoiceBiomarkers>,
}

impl SessionState {
    pub fn new(session_id: String, persona: String) -> Self {
        let now = Instant::now();
        Self {
            session_id,
            audio_buffer: Vec::new(),
            kv_cache_tokens: 0,
            kv_cache_version: 0,
            persona,
            created_at: now,
            last_activity: now,
            total_transcriptions: 0,
            total_syntheses: 0,
            last_biomarkers: None,
        }
    }

    pub fn set_kv_cache_tokens(&mut self, tokens: usize) {
        self.kv_cache_tokens = tokens;
        self.kv_cache_version += 1;
    }

    pub fn touch(&mut self) {
        self.last_activity = Instant::now();
    }
}

/// Manages active voice sessions.
pub struct SessionManager {
    sessions: HashMap<String, SessionState>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    /// Create a new session. Returns false if the session_id already exists.
    pub fn create_session(&mut self, session_id: String, persona: String) -> bool {
        if self.sessions.contains_key(&session_id) {
            return false;
        }
        let state = SessionState::new(session_id.clone(), persona);
        self.sessions.insert(session_id, state);
        true
    }

    pub fn get_session(&self, session_id: &str) -> Option<&SessionState> {
        self.sessions.get(session_id)
    }

    pub fn get_session_mut(&mut self, session_id: &str) -> Option<&mut SessionState> {
        self.sessions.get_mut(session_id)
    }

    pub fn remove_session(&mut self, session_id: &str) -> Option<SessionState> {
        self.sessions.remove(session_id)
    }

    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    /// Append raw i16 PCM samples to the session's audio buffer.
    ///
    /// Returns `None` if the session doesn't exist. Otherwise returns
    /// `Some(n)` where `n` is the number of oldest samples dropped to
    /// stay within `MAX_AUDIO_BUFFER_SAMPLES`.
    pub fn append_audio(&mut self, session_id: &str, samples: &[i16]) -> Option<usize> {
        let Some(session) = self.sessions.get_mut(session_id) else {
            return None;
        };

        session.touch();

        let new_len = session.audio_buffer.len().saturating_add(samples.len());
        if new_len > MAX_AUDIO_BUFFER_SAMPLES {
            let excess = new_len - MAX_AUDIO_BUFFER_SAMPLES;
            if excess >= session.audio_buffer.len() {
                // New chunk alone exceeds the limit — only keep the tail
                session.audio_buffer.clear();
                let start = samples.len().saturating_sub(MAX_AUDIO_BUFFER_SAMPLES);
                session.audio_buffer.extend_from_slice(&samples[start..]);
            } else {
                session.audio_buffer.drain(..excess);
                session.audio_buffer.extend_from_slice(samples);
            }
            tracing::warn!(
                session_id,
                buffer_len = session.audio_buffer.len(),
                dropped = excess,
                "Audio buffer hit limit, dropped oldest samples"
            );
            Some(excess)
        } else {
            // Warn at 80% capacity
            if new_len > MAX_AUDIO_BUFFER_SAMPLES * 4 / 5 {
                tracing::warn!(
                    session_id,
                    buffer_len = new_len,
                    max = MAX_AUDIO_BUFFER_SAMPLES,
                    "Audio buffer at >80% capacity"
                );
            }
            session.audio_buffer.extend_from_slice(samples);
            Some(0)
        }
    }

    /// Drain and return the session's accumulated audio buffer.
    pub fn drain_audio(&mut self, session_id: &str) -> Option<Vec<i16>> {
        self.sessions.get_mut(session_id).map(|s| {
            s.touch();
            std::mem::take(&mut s.audio_buffer)
        })
    }

    /// Remove sessions that have been idle longer than `SESSION_TTL`.
    /// Returns the number of removed sessions.
    pub fn cleanup_expired(&mut self) -> usize {
        let now = Instant::now();
        let before = self.sessions.len();
        self.sessions
            .retain(|_, s| now.duration_since(s.last_activity) < SESSION_TTL);
        before - self.sessions.len()
    }

    /// Sum transcription and synthesis counters across all sessions.
    pub fn aggregate_stats(&self) -> (u64, u64) {
        self.sessions.values().fold((0u64, 0u64), |(t, s), sess| {
            (t + sess.total_transcriptions as u64, s + sess.total_syntheses as u64)
        })
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_expiration() {
        let mut mgr = SessionManager::new();
        mgr.create_session("old".into(), "ferni".into());
        mgr.create_session("fresh".into(), "ferni".into());

        // Backdate the "old" session's last_activity
        mgr.get_session_mut("old").unwrap().last_activity =
            Instant::now() - SESSION_TTL - Duration::from_secs(1);

        let expired = mgr.cleanup_expired();
        assert_eq!(expired, 1);
        assert!(mgr.get_session("old").is_none());
        assert!(mgr.get_session("fresh").is_some());
    }

    #[test]
    fn test_audio_buffer_limit() {
        let mut mgr = SessionManager::new();
        mgr.create_session("s1".into(), "ferni".into());

        // Fill to max
        let big_chunk = vec![0i16; MAX_AUDIO_BUFFER_SAMPLES];
        assert_eq!(mgr.append_audio("s1", &big_chunk), Some(0));
        assert_eq!(
            mgr.get_session("s1").unwrap().audio_buffer.len(),
            MAX_AUDIO_BUFFER_SAMPLES
        );

        // Appending more should drop oldest
        let extra = vec![1i16; 1000];
        assert_eq!(mgr.append_audio("s1", &extra), Some(1000));
        let buf = &mgr.get_session("s1").unwrap().audio_buffer;
        assert_eq!(buf.len(), MAX_AUDIO_BUFFER_SAMPLES);
        // Last 1000 samples should be the new data
        assert_eq!(buf[buf.len() - 1], 1);
    }

    #[test]
    fn test_aggregate_stats() {
        let mut mgr = SessionManager::new();
        mgr.create_session("a".into(), "ferni".into());
        mgr.create_session("b".into(), "ferni".into());

        mgr.get_session_mut("a").unwrap().total_transcriptions = 5;
        mgr.get_session_mut("a").unwrap().total_syntheses = 3;
        mgr.get_session_mut("b").unwrap().total_transcriptions = 10;
        mgr.get_session_mut("b").unwrap().total_syntheses = 7;

        let (trans, synth) = mgr.aggregate_stats();
        assert_eq!(trans, 15);
        assert_eq!(synth, 10);
    }

    #[test]
    fn test_append_audio_updates_activity() {
        let mut mgr = SessionManager::new();
        mgr.create_session("s1".into(), "ferni".into());

        let before = mgr.get_session("s1").unwrap().last_activity;
        // Small sleep to ensure clock moves
        std::thread::sleep(Duration::from_millis(5));
        mgr.append_audio("s1", &[1, 2, 3]);
        let after = mgr.get_session("s1").unwrap().last_activity;

        assert!(after > before);
    }

    #[test]
    fn test_append_to_nonexistent_session() {
        let mut mgr = SessionManager::new();
        assert!(mgr.append_audio("nope", &[1, 2, 3]).is_none());
    }

    #[test]
    fn test_kv_cache_version_increment() {
        let mut mgr = SessionManager::new();
        mgr.create_session("s1".into(), "ferni".into());

        let session = mgr.get_session("s1").unwrap();
        assert_eq!(session.kv_cache_version, 0);

        mgr.get_session_mut("s1").unwrap().set_kv_cache_tokens(100);
        let session = mgr.get_session("s1").unwrap();
        assert_eq!(session.kv_cache_version, 1);
        assert_eq!(session.kv_cache_tokens, 100);

        mgr.get_session_mut("s1").unwrap().set_kv_cache_tokens(200);
        let session = mgr.get_session("s1").unwrap();
        assert_eq!(session.kv_cache_version, 2);
        assert_eq!(session.kv_cache_tokens, 200);
    }
}
