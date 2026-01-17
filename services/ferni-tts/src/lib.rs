//! # Ferni TTS - Superhuman Text-to-Speech
//!
//! A high-performance TTS service with:
//! - Full W3C SSML spec support
//! - Sub-50ms first-byte latency
//! - "Better than Human" prosody transformations
//!
//! ## Architecture
//!
//! ```text
//! Text Input → SSML Parser → Superhuman Transforms → Synthesis Backend → Audio Pipeline → Stream
//! ```
//!
//! ## Superhuman Capabilities
//!
//! 1. **Circadian Tempo** - Slower at night, energetic in morning
//! 2. **Memory Prosody** - Emphasize remembered entities ("Your *sister* Sarah")
//! 3. **Emotional Anticipation** - Express emotion before content lands
//! 4. **Meaningful Silence** - Strategic pauses for impact
//! 5. **Relationship Prosody** - Warmer tone with closer relationships
//! 6. **Energy Matching** - Match user's detected energy level
//! 7. **Backchannels** - Natural "hmm", "uh-huh" timing
//! 8. **Breath Patterns** - Natural breathing rhythm

pub mod ssml;
pub mod superhuman;
pub mod audio;
pub mod synthesis;
pub mod api;
pub mod config;
pub mod error;

pub use config::Config;
pub use error::{Error, Result};

/// Re-export key types for convenience
pub mod prelude {
    pub use crate::ssml::{SsmlDocument, SsmlElement, Prosody, Voice};
    pub use crate::superhuman::{SuperhumanContext, Transform, TransformPipeline};
    pub use crate::audio::{AudioChunk, AudioFormat, AudioPipeline};
    pub use crate::synthesis::{SynthesisRequest, SynthesisResponse};
    pub use crate::error::{Error, Result};
}
