//! HTTP API Module
//!
//! REST API for TTS synthesis with streaming support.

mod routes;
mod handlers;
mod middleware;

pub use routes::create_router;

use crate::config::Config;
use crate::synthesis::SynthesisClient;
use std::sync::Arc;

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    /// Service configuration
    pub config: Arc<Config>,

    /// Synthesis client
    pub synthesis_client: Arc<dyn SynthesisClient>,

    /// Service start time
    pub start_time: std::time::Instant,
}

impl AppState {
    /// Create new application state
    pub fn new(config: Config, synthesis_client: Arc<dyn SynthesisClient>) -> Self {
        Self {
            config: Arc::new(config),
            synthesis_client,
            start_time: std::time::Instant::now(),
        }
    }

    /// Get uptime in seconds
    pub fn uptime_secs(&self) -> u64 {
        self.start_time.elapsed().as_secs()
    }
}
