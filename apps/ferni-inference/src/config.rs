use clap::Parser;

/// Unified Ferni inference gateway.
#[derive(Parser, Debug)]
#[command(name = "ferni-inference", version, about)]
pub struct Args {
    /// Server port
    #[arg(long, default_value_t = 8600)]
    pub port: u16,

    /// Bind address
    #[arg(long, default_value = "127.0.0.1")]
    pub host: String,

    /// Omni pipeline URL (rust-perf server)
    #[arg(long, env = "OMNI_URL")]
    pub omni_url: Option<String>,

    /// Kyutai STT URL
    #[arg(long, env = "KYUTAI_STT_URL")]
    pub kyutai_url: Option<String>,

    /// Ollama LLM URL
    #[arg(long, env = "OLLAMA_URL")]
    pub ollama_url: Option<String>,

    /// TTS server URL (rust-tts)
    #[arg(long, env = "TTS_URL")]
    pub tts_url: Option<String>,

    /// LFM2 speed pipeline URL
    #[arg(long, env = "LFM2_URL")]
    pub lfm2_url: Option<String>,
}

#[derive(Clone, Debug)]
pub struct BackendConfig {
    pub omni_url: String,
    pub kyutai_stt_url: String,
    pub ollama_url: String,
    pub tts_url: String,
    pub lfm2_url: String,
}

impl BackendConfig {
    pub fn from_args(args: &Args) -> Self {
        Self {
            omni_url: args
                .omni_url
                .clone()
                .unwrap_or_else(|| "http://127.0.0.1:8505".to_string()),
            kyutai_stt_url: args
                .kyutai_url
                .clone()
                .unwrap_or_else(|| "http://127.0.0.1:8089".to_string()),
            ollama_url: args
                .ollama_url
                .clone()
                .unwrap_or_else(|| "http://127.0.0.1:11434".to_string()),
            tts_url: args
                .tts_url
                .clone()
                .unwrap_or_else(|| "http://127.0.0.1:8501".to_string()),
            lfm2_url: args
                .lfm2_url
                .clone()
                .unwrap_or_else(|| "http://127.0.0.1:8506".to_string()),
        }
    }
}
