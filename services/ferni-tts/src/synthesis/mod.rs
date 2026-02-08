//! Synthesis Backend Module
//!
//! Re-exports from ferni-tts-core and adds CosyVoice backend + create_client.

pub use ferni_tts_core::synthesis::{
    SynthesisClient, SynthesisRequest, SynthesisResponse, SynthesisStream,
    MockSynthesisClient, VoiceDefinition, VoiceGender, voices,
};

mod cosy_voice;
pub use cosy_voice::CosyVoiceClient;

use crate::config::{SynthesisBackend, SynthesisConfig};
use crate::error::Result;
use std::sync::Arc;

/// Create a synthesis client (CosyVoice, Mock; core only has Mock)
pub async fn create_client(config: &SynthesisConfig) -> Result<Arc<dyn SynthesisClient>> {
    match config.backend {
        SynthesisBackend::CosyVoice => {
            let client = CosyVoiceClient::connect(&config.cosy_voice_endpoint).await?;
            Ok(Arc::new(client))
        }
        SynthesisBackend::Mock => Ok(Arc::new(MockSynthesisClient::new())),
        SynthesisBackend::Azure | SynthesisBackend::Google | SynthesisBackend::OpenAi => {
            Err(crate::error::Error::BackendUnavailable {
                backend: format!("{:?}", config.backend),
            })
        }
    }
}
