//! Synthesis Backend Module
//!
//! Abstraction layer for multiple TTS synthesis backends.

mod client;
mod cosy_voice;
mod mock;

pub use client::{SynthesisClient, SynthesisRequest, SynthesisResponse, SynthesisStream};
pub use cosy_voice::CosyVoiceClient;
pub use mock::MockSynthesisClient;

use crate::config::{SynthesisBackend, SynthesisConfig};
use crate::error::Result;
use std::sync::Arc;

/// Create a synthesis client based on configuration
pub async fn create_client(config: &SynthesisConfig) -> Result<Arc<dyn SynthesisClient>> {
    match config.backend {
        SynthesisBackend::CosyVoice => {
            let client = CosyVoiceClient::connect(&config.cosy_voice_endpoint).await?;
            Ok(Arc::new(client))
        }
        SynthesisBackend::Mock => {
            Ok(Arc::new(MockSynthesisClient::new()))
        }
        SynthesisBackend::Azure => {
            // TODO: Implement Azure TTS client
            unimplemented!("Azure TTS backend not yet implemented")
        }
        SynthesisBackend::Google => {
            // TODO: Implement Google TTS client
            unimplemented!("Google TTS backend not yet implemented")
        }
        SynthesisBackend::OpenAi => {
            // TODO: Implement OpenAI TTS client
            unimplemented!("OpenAI TTS backend not yet implemented")
        }
    }
}

/// Voice definition for synthesis
#[derive(Debug, Clone)]
pub struct VoiceDefinition {
    /// Voice ID
    pub id: String,

    /// Display name
    pub name: String,

    /// Voice gender
    pub gender: VoiceGender,

    /// Language code (e.g., "en-US")
    pub language: String,

    /// Voice style/personality
    pub style: Option<String>,

    /// Reference audio for voice cloning
    pub reference_audio: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum VoiceGender {
    Male,
    Female,
    Neutral,
}

impl VoiceDefinition {
    /// Create a new voice definition
    pub fn new(id: impl Into<String>, name: impl Into<String>, language: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            gender: VoiceGender::Neutral,
            language: language.into(),
            style: None,
            reference_audio: None,
        }
    }

    pub fn with_gender(mut self, gender: VoiceGender) -> Self {
        self.gender = gender;
        self
    }

    pub fn with_style(mut self, style: impl Into<String>) -> Self {
        self.style = Some(style.into());
        self
    }

    pub fn with_reference_audio(mut self, audio: Vec<u8>) -> Self {
        self.reference_audio = Some(audio);
        self
    }
}

/// Predefined Ferni persona voices
pub mod voices {
    use super::*;

    pub fn ferni() -> VoiceDefinition {
        VoiceDefinition::new("ferni", "Ferni", "en-US")
            .with_gender(VoiceGender::Neutral)
            .with_style("warm, empathetic, gentle")
    }

    pub fn maya() -> VoiceDefinition {
        VoiceDefinition::new("maya", "Maya", "en-US")
            .with_gender(VoiceGender::Female)
            .with_style("encouraging, nurturing, coach")
    }

    pub fn peter() -> VoiceDefinition {
        VoiceDefinition::new("peter", "Peter", "en-US")
            .with_gender(VoiceGender::Male)
            .with_style("analytical, calm, precise")
    }

    pub fn jordan() -> VoiceDefinition {
        VoiceDefinition::new("jordan", "Jordan", "en-US")
            .with_gender(VoiceGender::Neutral)
            .with_style("organized, efficient, friendly")
    }

    pub fn alex() -> VoiceDefinition {
        VoiceDefinition::new("alex", "Alex", "en-US")
            .with_gender(VoiceGender::Neutral)
            .with_style("professional, articulate, diplomatic")
    }

    pub fn nayan() -> VoiceDefinition {
        VoiceDefinition::new("nayan", "Nayan", "en-US")
            .with_gender(VoiceGender::Male)
            .with_style("wise, contemplative, serene")
    }
}
