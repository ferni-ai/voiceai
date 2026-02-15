//! OpenAI-compatible HTTP server for Qwen3-Omni on MLX.
//!
//! Endpoints:
//! - `POST /v1/chat/completions` — text (+ audio conditioning) → text
//! - `POST /v1/audio/transcriptions` — audio → text
//! - `POST /v1/audio/speech` — text → audio
//! - `GET /health` — health check
//!
//! Usage:
//! ```bash
//! cargo run --bin mlx-omni-server --features server -- --model /path/to/Qwen3-Omni-7B --port 8800
//! ```

use std::io::Cursor;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::{
    body::Bytes,
    extract::{Multipart, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use mlx_rs::Array;
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;
use tracing::info;

use ferni_mlx_omni::pipeline::FullOmniPipeline;

/// Server state. Pipeline is behind Mutex for &mut self on transcribe/synthesize/generate.
struct AppState {
    pipeline: Mutex<FullOmniPipeline>,
    model_name: String,
}

// ─── Types ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ChatCompletionRequest {
    model: Option<String>,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<usize>,
    stream: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionResponse {
    id: String,
    object: String,
    created: u64,
    model: String,
    choices: Vec<ChatChoice>,
    usage: Usage,
}

#[derive(Debug, Serialize)]
struct ChatChoice {
    index: usize,
    message: ChatMessage2,
    finish_reason: String,
}

#[derive(Debug, Serialize)]
struct ChatMessage2 {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct Usage {
    prompt_tokens: usize,
    completion_tokens: usize,
    total_tokens: usize,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    model: String,
    backend: String,
}

#[derive(Debug, Deserialize)]
struct AudioSpeechRequest {
    input: String,
}

#[derive(Debug, Serialize)]
struct TranscriptionResponse {
    text: String,
}

// ─── Handlers ─────────────────────────────────────────────

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        model: state.model_name.clone(),
        backend: "mlx-rs".to_string(),
    })
}

async fn chat_completions(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ChatCompletionRequest>,
) -> Result<Json<ChatCompletionResponse>, (StatusCode, String)> {
    let temperature = req.temperature.unwrap_or(0.7);
    let max_tokens = req.max_tokens.unwrap_or(256);

    // Concatenate messages into a prompt
    let prompt = req
        .messages
        .iter()
        .map(|m| format!("<|im_start|>{}\n{}<|im_end|>", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n");
    let prompt = format!("{prompt}\n<|im_start|>assistant\n");

    let mut pipeline = state
        .pipeline
        .lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (text, prompt_tokens, completion_tokens) = pipeline
        .generate_text(&prompt, max_tokens, temperature)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    Ok(Json(ChatCompletionResponse {
        id: format!("chatcmpl-mlx-{}", now),
        object: "chat.completion".to_string(),
        created: now,
        model: state.model_name.clone(),
        choices: vec![ChatChoice {
            index: 0,
            message: ChatMessage2 {
                role: "assistant".to_string(),
                content: text,
            },
            finish_reason: if completion_tokens >= max_tokens {
                "length".to_string()
            } else {
                "stop".to_string()
            },
        }],
        usage: Usage {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        },
    }))
}

/// POST /v1/audio/speech — text → WAV (OpenAI-compatible).
async fn audio_speech(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AudioSpeechRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let text = payload.input.trim();
    if text.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "input is required and must be non-empty".to_string()));
    }

    let mut pipeline = state
        .pipeline
        .lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let waveform = pipeline
        .synthesize(text)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let sample_rate = pipeline.code2wav.sample_rate();
    let samples: Vec<f32> = waveform.as_slice::<f32>().to_vec();
    let wav_bytes = encode_wav_mono_f32(&samples, sample_rate);

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "audio/wav"),
            (header::CONTENT_DISPOSITION, "attachment; filename=speech.wav"),
        ],
        wav_bytes,
    ))
}

/// POST /v1/audio/transcriptions — multipart "file" (WAV) → text (OpenAI-compatible).
async fn audio_transcriptions(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<TranscriptionResponse>, (StatusCode, String)> {
    let mut file_data: Option<Bytes> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        if field.name().map_or(false, |n| n == "file") {
            file_data = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?,
            );
            break;
        }
    }

    let data = file_data.ok_or((StatusCode::BAD_REQUEST, "multipart field 'file' required".to_string()))?;

    let samples_16k = wav_to_f32_16k(data.as_ref())
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("invalid WAV (expect 16kHz mono): {}", e)))?;

    let shape: [i32; 2] = [1, samples_16k.len() as i32];
    let array = Array::from_slice(samples_16k.as_slice(), &shape);

    let mut pipeline = state
        .pipeline
        .lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let text = pipeline
        .transcribe(&array)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(TranscriptionResponse { text }))
}

/// Encode f32 mono samples to WAV (16-bit PCM).
fn encode_wav_mono_f32(samples: &[f32], sample_rate: usize) -> Vec<u8> {
    let num_samples = samples.len();
    let data_size = num_samples * 2;
    let riff_size = 36 + data_size;

    let mut buf = Vec::with_capacity(44 + data_size);
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&(riff_size as u32).to_le_bytes());
    buf.extend_from_slice(b"WAVEfmt ");
    buf.extend_from_slice(&16u32.to_le_bytes());
    buf.extend_from_slice(&1u16.to_le_bytes()); // PCM
    buf.extend_from_slice(&1u16.to_le_bytes()); // mono
    buf.extend_from_slice(&(sample_rate as u32).to_le_bytes());
    buf.extend_from_slice(&((sample_rate * 2) as u32).to_le_bytes());
    buf.extend_from_slice(&2u16.to_le_bytes());
    buf.extend_from_slice(&16u16.to_le_bytes());
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&(data_size as u32).to_le_bytes());
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let sample_i16 = (clamped * 32767.0) as i16;
        buf.extend_from_slice(&sample_i16.to_le_bytes());
    }
    buf
}

/// Decode WAV bytes to f32 mono at 16kHz. Returns error if not 16kHz mono or unsupported format.
fn wav_to_f32_16k(data: &[u8]) -> anyhow::Result<Vec<f32>> {
    let mut cursor = Cursor::new(data);
    let reader = hound::WavReader::new(&mut cursor)
        .map_err(|e| anyhow::anyhow!("hound: {}", e))?;
    let spec = reader.spec();
    if spec.channels != 1 {
        anyhow::bail!("expected mono, got {} channels", spec.channels);
    }
    if spec.sample_rate != 16000 {
        anyhow::bail!("expected 16kHz, got {} Hz", spec.sample_rate);
    }

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            if spec.bits_per_sample == 16 {
                reader
                    .into_samples::<i16>()
                    .map(|s| s.map(|v| v as f32 / 32768.0))
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| anyhow::anyhow!("read: {}", e))?
            } else {
                reader
                    .into_samples::<i32>()
                    .map(|s| s.map(|v| v as f32 / 2147483648.0))
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| anyhow::anyhow!("read: {}", e))?
            }
        }
        hound::SampleFormat::Float => reader
            .into_samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| anyhow::anyhow!("read: {}", e))?,
    };
    Ok(samples)
}

// ─── Main ─────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    // Parse args
    let args: Vec<String> = std::env::args().collect();
    let model_dir = args
        .iter()
        .position(|a| a == "--model")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var("QWEN3_OMNI_MODEL_PATH").unwrap_or_else(|_| {
                eprintln!("Usage: mlx-omni-server --model /path/to/model [--port 8800]");
                std::process::exit(1);
            }))
        });

    let port: u16 = args
        .iter()
        .position(|a| a == "--port")
        .and_then(|i| args.get(i + 1))
        .and_then(|p| p.parse().ok())
        .unwrap_or(8800);

    info!("Loading Qwen3-Omni from {:?}...", model_dir);
    let pipeline = FullOmniPipeline::load(&model_dir)?;
    let model_name = model_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "qwen3-omni".to_string());
    info!("Model loaded: {}", model_name);

    let state = Arc::new(AppState {
        pipeline: Mutex::new(pipeline),
        model_name,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/chat/completions", post(chat_completions))
        .route("/v1/audio/speech", post(audio_speech))
        .route("/v1/audio/transcriptions", post(audio_transcriptions))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("MLX Omni server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
