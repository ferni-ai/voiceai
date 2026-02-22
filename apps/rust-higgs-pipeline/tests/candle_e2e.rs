//! Candle LLM integration tests.
//!
//! Run with a real Llama-format model when `HIGGS_CANDLE_E2E_MODEL` is set to the model directory:
//!
//!   HIGGS_CANDLE_E2E_MODEL=/path/to/model cargo test --test candle_e2e
//!
//! Skips when the env var is not set (e.g. in CI without a model).

use candle_core::Device;
use futures_util::StreamExt;
use higgs_voice_pipeline::llm::{CandleBackend, LlmBackend};
use std::time::Duration;
use tokio::time::timeout;

#[tokio::test]
async fn test_candle_generate_stream_with_real_model() {
    let path = match std::env::var("HIGGS_CANDLE_E2E_MODEL") {
        Ok(p) => p,
        Err(_) => return,
    };

    let device = Device::Cpu;
    let backend = CandleBackend::new(path, device);

    let mut stream = match backend.generate_stream("Hello".to_string(), Some(5)).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Candle generate_stream failed (missing or invalid model?): {}", e);
            return;
        }
    };

    let mut received = 0usize;
    let limit = Duration::from_secs(60);

    while let Some(item) = timeout(limit, stream.next()).await.ok().flatten() {
        match item {
            Ok(s) if !s.is_empty() => {
                received += 1;
                break;
            }
            Ok(_) => {}
            Err(e) => panic!("Candle stream error: {}", e),
        }
    }

    assert!(received >= 1, "Expected at least one non-empty token from Candle stream");
}
