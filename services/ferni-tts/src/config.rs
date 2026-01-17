//! Configuration Module
//!
//! Service configuration with environment variable support.

use serde::{Deserialize, Serialize};
use std::env;

/// Main service configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Server configuration
    pub server: ServerConfig,

    /// Synthesis backend configuration
    pub synthesis: SynthesisConfig,

    /// Audio pipeline configuration
    pub audio: AudioConfig,

    /// Superhuman transform configuration
    pub superhuman: SuperhumanConfig,

    /// Observability configuration
    pub observability: ObservabilityConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            synthesis: SynthesisConfig::default(),
            audio: AudioConfig::default(),
            superhuman: SuperhumanConfig::default(),
            observability: ObservabilityConfig::default(),
        }
    }
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> Self {
        Self {
            server: ServerConfig::from_env(),
            synthesis: SynthesisConfig::from_env(),
            audio: AudioConfig::from_env(),
            superhuman: SuperhumanConfig::from_env(),
            observability: ObservabilityConfig::from_env(),
        }
    }
}

/// HTTP server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Host to bind to
    pub host: String,

    /// Port to listen on
    pub port: u16,

    /// Maximum concurrent requests
    pub max_concurrent_requests: usize,

    /// Request timeout in milliseconds
    pub request_timeout_ms: u64,

    /// Enable streaming responses
    pub enable_streaming: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 8080,
            max_concurrent_requests: 100,
            request_timeout_ms: 30000,
            enable_streaming: true,
        }
    }
}

impl ServerConfig {
    fn from_env() -> Self {
        Self {
            host: env::var("FERNI_TTS_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("FERNI_TTS_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
            max_concurrent_requests: env::var("FERNI_TTS_MAX_CONCURRENT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(100),
            request_timeout_ms: env::var("FERNI_TTS_TIMEOUT_MS")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(30000),
            enable_streaming: env::var("FERNI_TTS_STREAMING")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
        }
    }
}

/// Synthesis backend configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynthesisConfig {
    /// Backend type (cosy_voice, azure, google, openai)
    pub backend: SynthesisBackend,

    /// gRPC endpoint for CosyVoice
    pub cosy_voice_endpoint: String,

    /// Azure TTS configuration
    pub azure: Option<AzureTtsConfig>,

    /// Google TTS configuration
    pub google: Option<GoogleTtsConfig>,

    /// OpenAI TTS configuration
    pub openai: Option<OpenAiTtsConfig>,

    /// Default voice ID
    pub default_voice: String,

    /// Connection timeout in milliseconds
    pub connect_timeout_ms: u64,

    /// Request timeout in milliseconds
    pub request_timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SynthesisBackend {
    CosyVoice,
    Azure,
    Google,
    OpenAi,
    Mock,
}

impl Default for SynthesisConfig {
    fn default() -> Self {
        Self {
            backend: SynthesisBackend::CosyVoice,
            cosy_voice_endpoint: "http://localhost:50051".to_string(),
            azure: None,
            google: None,
            openai: None,
            default_voice: "ferni".to_string(),
            connect_timeout_ms: 5000,
            request_timeout_ms: 10000,
        }
    }
}

impl SynthesisConfig {
    fn from_env() -> Self {
        let backend = match env::var("FERNI_TTS_BACKEND").as_deref() {
            Ok("azure") => SynthesisBackend::Azure,
            Ok("google") => SynthesisBackend::Google,
            Ok("openai") => SynthesisBackend::OpenAi,
            Ok("mock") => SynthesisBackend::Mock,
            _ => SynthesisBackend::CosyVoice,
        };

        Self {
            backend,
            cosy_voice_endpoint: env::var("COSY_VOICE_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:50051".to_string()),
            azure: AzureTtsConfig::from_env(),
            google: GoogleTtsConfig::from_env(),
            openai: OpenAiTtsConfig::from_env(),
            default_voice: env::var("FERNI_TTS_DEFAULT_VOICE")
                .unwrap_or_else(|_| "ferni".to_string()),
            connect_timeout_ms: env::var("FERNI_TTS_CONNECT_TIMEOUT_MS")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(5000),
            request_timeout_ms: env::var("FERNI_TTS_REQUEST_TIMEOUT_MS")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(10000),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AzureTtsConfig {
    pub subscription_key: String,
    pub region: String,
    pub endpoint: Option<String>,
}

impl AzureTtsConfig {
    fn from_env() -> Option<Self> {
        let key = env::var("AZURE_TTS_KEY").ok()?;
        let region = env::var("AZURE_TTS_REGION").ok()?;
        Some(Self {
            subscription_key: key,
            region,
            endpoint: env::var("AZURE_TTS_ENDPOINT").ok(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleTtsConfig {
    pub project_id: String,
    pub credentials_path: Option<String>,
}

impl GoogleTtsConfig {
    fn from_env() -> Option<Self> {
        let project_id = env::var("GOOGLE_CLOUD_PROJECT").ok()?;
        Some(Self {
            project_id,
            credentials_path: env::var("GOOGLE_APPLICATION_CREDENTIALS").ok(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiTtsConfig {
    pub api_key: String,
    pub model: String,
    pub voice: String,
}

impl OpenAiTtsConfig {
    fn from_env() -> Option<Self> {
        let api_key = env::var("OPENAI_API_KEY").ok()?;
        Some(Self {
            api_key,
            model: env::var("OPENAI_TTS_MODEL").unwrap_or_else(|_| "tts-1-hd".to_string()),
            voice: env::var("OPENAI_TTS_VOICE").unwrap_or_else(|_| "nova".to_string()),
        })
    }
}

/// Audio pipeline configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioConfig {
    /// Output sample rate
    pub sample_rate: u32,

    /// Bits per sample
    pub bits_per_sample: u8,

    /// Number of channels (1 = mono)
    pub channels: u8,

    /// Chunk size in bytes for streaming
    pub chunk_size: usize,

    /// Buffer capacity for stream
    pub buffer_capacity: usize,

    /// Enable volume normalization
    pub normalize: bool,

    /// Target peak level for normalization (0.0-1.0)
    pub target_peak: f32,

    /// Output format (pcm, wav, mp3, opus)
    pub output_format: AudioOutputFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AudioOutputFormat {
    Pcm,
    Wav,
    Mp3,
    Opus,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            sample_rate: 24000,
            bits_per_sample: 16,
            channels: 1,
            chunk_size: 4800, // 100ms at 24kHz/16bit/mono
            buffer_capacity: 16,
            normalize: true,
            target_peak: 0.9,
            output_format: AudioOutputFormat::Pcm,
        }
    }
}

impl AudioConfig {
    fn from_env() -> Self {
        Self {
            sample_rate: env::var("FERNI_TTS_SAMPLE_RATE")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(24000),
            bits_per_sample: env::var("FERNI_TTS_BITS_PER_SAMPLE")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(16),
            channels: env::var("FERNI_TTS_CHANNELS")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(1),
            chunk_size: env::var("FERNI_TTS_CHUNK_SIZE")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(4800),
            buffer_capacity: env::var("FERNI_TTS_BUFFER_CAPACITY")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(16),
            normalize: env::var("FERNI_TTS_NORMALIZE")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            target_peak: env::var("FERNI_TTS_TARGET_PEAK")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(0.9),
            output_format: match env::var("FERNI_TTS_OUTPUT_FORMAT").as_deref() {
                Ok("wav") => AudioOutputFormat::Wav,
                Ok("mp3") => AudioOutputFormat::Mp3,
                Ok("opus") => AudioOutputFormat::Opus,
                _ => AudioOutputFormat::Pcm,
            },
        }
    }
}

/// Superhuman transform configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuperhumanConfig {
    /// Enable all superhuman transforms
    pub enabled: bool,

    /// Enable circadian rhythm adaptation
    pub circadian_enabled: bool,

    /// Enable memory prosody
    pub memory_prosody_enabled: bool,

    /// Enable emotional anticipation
    pub emotional_enabled: bool,

    /// Enable meaningful silence
    pub silence_enabled: bool,

    /// Enable relationship prosody
    pub relationship_enabled: bool,

    /// Enable energy matching
    pub energy_enabled: bool,

    /// Enable backchannels
    pub backchannels_enabled: bool,

    /// Enable breath patterns
    pub breath_enabled: bool,

    /// Pipeline mode (full, minimal, clean)
    pub pipeline_mode: PipelineMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PipelineMode {
    Full,
    Minimal,
    Clean,
    Custom,
}

impl Default for SuperhumanConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            circadian_enabled: true,
            memory_prosody_enabled: true,
            emotional_enabled: true,
            silence_enabled: true,
            relationship_enabled: true,
            energy_enabled: true,
            backchannels_enabled: true,
            breath_enabled: true,
            pipeline_mode: PipelineMode::Full,
        }
    }
}

impl SuperhumanConfig {
    fn from_env() -> Self {
        Self {
            enabled: env::var("FERNI_TTS_SUPERHUMAN")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            circadian_enabled: env::var("FERNI_TTS_CIRCADIAN")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            memory_prosody_enabled: env::var("FERNI_TTS_MEMORY_PROSODY")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            emotional_enabled: env::var("FERNI_TTS_EMOTIONAL")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            silence_enabled: env::var("FERNI_TTS_SILENCE")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            relationship_enabled: env::var("FERNI_TTS_RELATIONSHIP")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            energy_enabled: env::var("FERNI_TTS_ENERGY")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            backchannels_enabled: env::var("FERNI_TTS_BACKCHANNELS")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            breath_enabled: env::var("FERNI_TTS_BREATH")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            pipeline_mode: match env::var("FERNI_TTS_PIPELINE_MODE").as_deref() {
                Ok("minimal") => PipelineMode::Minimal,
                Ok("clean") => PipelineMode::Clean,
                Ok("custom") => PipelineMode::Custom,
                _ => PipelineMode::Full,
            },
        }
    }
}

/// Observability configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservabilityConfig {
    /// Enable metrics collection
    pub metrics_enabled: bool,

    /// Prometheus metrics port
    pub metrics_port: u16,

    /// Enable request tracing
    pub tracing_enabled: bool,

    /// Log level (trace, debug, info, warn, error)
    pub log_level: String,

    /// Enable structured JSON logging
    pub json_logs: bool,
}

impl Default for ObservabilityConfig {
    fn default() -> Self {
        Self {
            metrics_enabled: true,
            metrics_port: 9090,
            tracing_enabled: true,
            log_level: "info".to_string(),
            json_logs: true,
        }
    }
}

impl ObservabilityConfig {
    fn from_env() -> Self {
        Self {
            metrics_enabled: env::var("FERNI_TTS_METRICS")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            metrics_port: env::var("FERNI_TTS_METRICS_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(9090),
            tracing_enabled: env::var("FERNI_TTS_TRACING")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
            log_level: env::var("FERNI_TTS_LOG_LEVEL").unwrap_or_else(|_| "info".to_string()),
            json_logs: env::var("FERNI_TTS_JSON_LOGS")
                .map(|v| v.to_lowercase() != "false")
                .unwrap_or(true),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.server.port, 8080);
        assert_eq!(config.audio.sample_rate, 24000);
        assert!(config.superhuman.enabled);
    }

    #[test]
    fn test_synthesis_backend_parsing() {
        assert_eq!(
            SynthesisBackend::CosyVoice,
            Config::default().synthesis.backend
        );
    }
}
