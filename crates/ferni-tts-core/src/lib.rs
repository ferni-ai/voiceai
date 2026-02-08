//! # Ferni TTS Core - Synthesis engine without HTTP
//!
//! SSML parser, superhuman prosody transforms, synthesis backends, audio pipeline.
//! Use this crate for direct Rust calls (e.g. from rust-omni). For HTTP API, use the ferni-tts service.

pub mod ssml;
pub mod superhuman;
pub mod audio;
pub mod synthesis;
pub mod config;
pub mod error;

pub use config::Config;
pub use error::{Error, Result};

pub mod prelude {
    pub use crate::ssml::{SsmlDocument, SsmlElement, Prosody, Voice};
    pub use crate::superhuman::{SuperhumanContext, Transform, TransformPipeline};
    pub use crate::audio::{AudioChunk, AudioFormat, AudioPipeline};
    pub use crate::synthesis::{SynthesisRequest, SynthesisResponse, SynthesisClient, create_client};
    pub use crate::error::{Error, Result};
}
