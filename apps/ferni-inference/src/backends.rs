use std::time::Instant;

use serde::Serialize;

use crate::config::BackendConfig;

#[derive(Serialize, Clone)]
pub struct BackendStatus {
    pub name: String,
    pub mode: String,
    pub url: String,
    pub available: bool,
    pub latency_ms: Option<f64>,
    pub error: Option<String>,
}

pub async fn check_health(
    client: &reqwest::Client,
    name: &str,
    mode: &str,
    url: &str,
) -> BackendStatus {
    let health_url = format!("{}/health", url.trim_end_matches('/'));
    let start = Instant::now();

    match client.get(&health_url).send().await {
        Ok(resp) if resp.status().is_success() => BackendStatus {
            name: name.to_string(),
            mode: mode.to_string(),
            url: url.to_string(),
            available: true,
            latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            error: None,
        },
        Ok(resp) => BackendStatus {
            name: name.to_string(),
            mode: mode.to_string(),
            url: url.to_string(),
            available: false,
            latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            error: Some(format!("HTTP {}", resp.status())),
        },
        Err(e) => BackendStatus {
            name: name.to_string(),
            mode: mode.to_string(),
            url: url.to_string(),
            available: false,
            latency_ms: None,
            error: Some(e.to_string()),
        },
    }
}

pub async fn check_all_backends(
    client: &reqwest::Client,
    config: &BackendConfig,
) -> Vec<BackendStatus> {
    let (omni, kyutai, ollama, tts, lfm2) = tokio::join!(
        check_health(client, "omni-pipeline", "omni", &config.omni_url),
        check_health(client, "kyutai-stt", "quality", &config.kyutai_stt_url),
        check_health(client, "ollama", "quality", &config.ollama_url),
        check_health(client, "rust-tts", "quality", &config.tts_url),
        check_health(client, "lfm2", "speed", &config.lfm2_url),
    );

    vec![omni, kyutai, ollama, tts, lfm2]
}
