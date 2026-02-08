//! API Handlers
//!
//! Request handlers for TTS endpoints.

use super::AppState;
use crate::audio::{AudioFormat, AudioPipeline, AudioPipelineConfig};
use crate::ssml;
use crate::superhuman::{SuperhumanContext, TransformPipeline};
use crate::synthesis::{SynthesisRequest, SynthesisResponse};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Instant;

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct SynthesizeRequest {
    /// Text to synthesize
    pub text: String,

    /// Voice ID (default: ferni)
    #[serde(default = "default_voice")]
    pub voice_id: String,

    /// Sample rate (default: 24000)
    #[serde(default = "default_sample_rate")]
    pub sample_rate: u32,

    /// Speaking rate multiplier
    #[serde(default = "default_rate")]
    pub rate: f32,

    /// Pitch adjustment in semitones
    #[serde(default)]
    pub pitch: f32,

    /// Volume (0.0-1.0)
    #[serde(default = "default_volume")]
    pub volume: f32,

    /// Output format (pcm, wav)
    #[serde(default = "default_format")]
    pub output_format: String,

    /// Superhuman context
    #[serde(default)]
    pub superhuman: Option<SuperhumanContextRequest>,
}

fn default_voice() -> String { "ferni".to_string() }
fn default_sample_rate() -> u32 { 24000 }
fn default_rate() -> f32 { 1.0 }
fn default_volume() -> f32 { 1.0 }
fn default_format() -> String { "pcm".to_string() }

#[derive(Debug, Deserialize, Default)]
pub struct SuperhumanContextRequest {
    /// User's local hour (0-23)
    pub user_local_hour: Option<u32>,

    /// Relationship stage (0.0-1.0)
    pub relationship_stage: Option<f32>,

    /// User energy level (0.0-1.0)
    pub user_energy: Option<f32>,

    /// User emotion and intensity
    pub user_emotion: Option<(String, f32)>,

    /// Topic sensitivity (0.0-1.0)
    pub topic_sensitivity: Option<f32>,

    /// Emotional trajectory
    pub emotional_trajectory: Option<String>,

    /// Turn number
    pub turn_number: Option<u32>,

    /// User speaking rate
    pub user_speaking_rate: Option<f32>,

    /// Remembered entities
    pub remembered_entities: Option<Vec<MemoryEntityRequest>>,
}

#[derive(Debug, Deserialize)]
pub struct MemoryEntityRequest {
    pub name: String,
    pub entity_type: String,
    pub familiarity: f32,
    pub emotional_valence: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct SynthesizeResponse {
    /// Base64 encoded audio
    pub audio: String,

    /// Audio format
    pub format: String,

    /// Sample rate
    pub sample_rate: u32,

    /// Duration in milliseconds
    pub duration_ms: u64,

    /// Latency in milliseconds
    pub latency_ms: u64,

    /// Transforms applied
    pub transforms: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub uptime_secs: u64,
    pub backend: String,
    pub backend_healthy: bool,
}

#[derive(Debug, Serialize)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub language: String,
    pub gender: String,
    pub style: String,
}

#[derive(Debug, Serialize)]
pub struct MetricsResponse {
    pub requests_total: u64,
    pub requests_active: u64,
    pub latency_p50_ms: f64,
    pub latency_p99_ms: f64,
    pub errors_total: u64,
}

// ============================================================================
// Health Handlers
// ============================================================================

/// Health check endpoint
pub async fn health_check(State(state): State<AppState>) -> Json<HealthResponse> {
    let backend_healthy = state
        .synthesis_client
        .health_check()
        .await
        .unwrap_or(false);

    Json(HealthResponse {
        status: if backend_healthy { "healthy" } else { "degraded" }.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_secs: state.uptime_secs(),
        backend: state.synthesis_client.name().to_string(),
        backend_healthy,
    })
}

/// Readiness check (ready to accept traffic)
pub async fn readiness_check(State(state): State<AppState>) -> impl IntoResponse {
    let healthy = state
        .synthesis_client
        .health_check()
        .await
        .unwrap_or(false);

    if healthy {
        (StatusCode::OK, "ready")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "not ready")
    }
}

/// Liveness check (process is alive)
pub async fn liveness_check() -> impl IntoResponse {
    (StatusCode::OK, "alive")
}

// ============================================================================
// Synthesis Handlers
// ============================================================================

/// Synthesize text to speech (non-streaming)
pub async fn synthesize(
    State(state): State<AppState>,
    Json(req): Json<SynthesizeRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let start = Instant::now();

    // Build superhuman context if provided
    let ctx = build_superhuman_context(req.superhuman.as_ref());

    // Apply superhuman transforms if text isn't already SSML
    let (processed_text, transforms) = apply_transforms(&req.text, &ctx)?;

    // Build synthesis request
    let format = AudioFormat {
        sample_rate: req.sample_rate,
        bits_per_sample: 16,
        channels: 1,
    };

    let synthesis_req = SynthesisRequest::ssml(processed_text)
        .with_voice(&req.voice_id)
        .with_format(format)
        .with_rate(req.rate)
        .with_pitch(req.pitch)
        .with_volume(req.volume)
        .non_streaming();

    // Synthesize
    let response = state
        .synthesis_client
        .synthesize(synthesis_req)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let latency = start.elapsed().as_millis() as u64;

    // Encode audio based on format
    let (audio_data, content_type) = encode_audio(&response.audio, &req.output_format, format)?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header("X-Latency-Ms", latency.to_string())
        .header("X-Duration-Ms", response.duration_ms.to_string())
        .body(Body::from(audio_data))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?)
}

/// Synthesize with streaming response
pub async fn synthesize_stream(
    State(state): State<AppState>,
    Json(req): Json<SynthesizeRequest>,
) -> Result<Response, (StatusCode, String)> {
    let start = Instant::now();

    // Build superhuman context
    let ctx = build_superhuman_context(req.superhuman.as_ref());

    // Apply transforms
    let (processed_text, _transforms) = apply_transforms(&req.text, &ctx)?;

    // Build synthesis request
    let format = AudioFormat {
        sample_rate: req.sample_rate,
        bits_per_sample: 16,
        channels: 1,
    };

    let synthesis_req = SynthesisRequest::ssml(processed_text)
        .with_voice(&req.voice_id)
        .with_format(format)
        .with_rate(req.rate)
        .with_pitch(req.pitch)
        .with_volume(req.volume);

    // Get streaming response
    let mut stream = state
        .synthesis_client
        .synthesize_stream(synthesis_req)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Create streaming body
    let body = Body::from_stream(async_stream::stream! {
        while let Some(result) = stream.next().await {
            match result {
                Ok(chunk) => {
                    yield Ok::<_, std::io::Error>(axum::body::Bytes::from(chunk.audio));
                }
                Err(e) => {
                    tracing::error!("Stream error: {}", e);
                    break;
                }
            }
        }
    });

    let content_type = match req.output_format.as_str() {
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "opus" => "audio/opus",
        _ => "audio/pcm",
    };

    let latency = start.elapsed().as_millis() as u64;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header("X-Latency-Ms", latency.to_string())
        .header("Transfer-Encoding", "chunked")
        .body(body)
        .unwrap())
}

/// Synthesize SSML directly (no transforms)
pub async fn synthesize_ssml(
    State(state): State<AppState>,
    body: String,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let start = Instant::now();

    // Parse and validate SSML
    let _doc = ssml::parse(&body)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid SSML: {}", e)))?;

    // Build synthesis request
    let format = AudioFormat::default();

    let synthesis_req = SynthesisRequest::ssml(body)
        .with_format(format)
        .non_streaming();

    // Synthesize
    let response = state
        .synthesis_client
        .synthesize(synthesis_req)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let latency = start.elapsed().as_millis() as u64;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "audio/pcm")
        .header("X-Latency-Ms", latency.to_string())
        .body(Body::from(response.audio))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?)
}

// ============================================================================
// Voice Handlers
// ============================================================================

/// List available voices
pub async fn list_voices(State(state): State<AppState>) -> Json<Vec<VoiceInfo>> {
    let voices = state
        .synthesis_client
        .list_voices()
        .await
        .unwrap_or_default();

    let voice_infos: Vec<VoiceInfo> = voices
        .into_iter()
        .map(|id| {
            let (name, style) = match id.as_str() {
                "ferni" => ("Ferni", "warm, empathetic, gentle"),
                "maya" => ("Maya", "encouraging, nurturing, coach"),
                "peter" => ("Peter", "analytical, calm, precise"),
                "jordan" => ("Jordan", "organized, efficient, friendly"),
                "alex" => ("Alex", "professional, articulate, diplomatic"),
                "nayan" => ("Nayan", "wise, contemplative, serene"),
                _ => (&*id, ""),
            };
            VoiceInfo {
                id: id.clone(),
                name: name.to_string(),
                language: "en-US".to_string(),
                gender: "neutral".to_string(),
                style: style.to_string(),
            }
        })
        .collect();

    Json(voice_infos)
}

/// Get voice details
pub async fn get_voice(
    State(state): State<AppState>,
    Path(voice_id): Path<String>,
) -> Result<Json<VoiceInfo>, StatusCode> {
    let has_voice = state
        .synthesis_client
        .has_voice(&voice_id)
        .await
        .unwrap_or(false);

    if !has_voice {
        return Err(StatusCode::NOT_FOUND);
    }

    let (name, style) = match voice_id.as_str() {
        "ferni" => ("Ferni", "warm, empathetic, gentle"),
        "maya" => ("Maya", "encouraging, nurturing, coach"),
        "peter" => ("Peter", "analytical, calm, precise"),
        "jordan" => ("Jordan", "organized, efficient, friendly"),
        "alex" => ("Alex", "professional, articulate, diplomatic"),
        "nayan" => ("Nayan", "wise, contemplative, serene"),
        _ => (&*voice_id, ""),
    };

    Ok(Json(VoiceInfo {
        id: voice_id.clone(),
        name: name.to_string(),
        language: "en-US".to_string(),
        gender: "neutral".to_string(),
        style: style.to_string(),
    }))
}

/// Metrics endpoint
pub async fn metrics() -> impl IntoResponse {
    // Placeholder - would integrate with prometheus metrics
    let response = MetricsResponse {
        requests_total: 0,
        requests_active: 0,
        latency_p50_ms: 0.0,
        latency_p99_ms: 0.0,
        errors_total: 0,
    };
    Json(response)
}

// ============================================================================
// Helper Functions
// ============================================================================

fn build_superhuman_context(req: Option<&SuperhumanContextRequest>) -> SuperhumanContext {
    let mut ctx = SuperhumanContext::new();

    if let Some(r) = req {
        if let Some(hour) = r.user_local_hour {
            ctx = ctx.with_user_local_hour(hour.clamp(0, 23) as u8);
        }
        if let Some(stage) = r.relationship_stage {
            ctx = ctx.with_relationship_stage(stage);
        }
        if let Some(energy) = r.user_energy {
            ctx = ctx.with_user_energy(energy);
        }
        if let Some((emotion, intensity)) = &r.user_emotion {
            ctx = ctx.with_user_emotion(emotion, *intensity);
        }
        if let Some(sensitivity) = r.topic_sensitivity {
            ctx = ctx.with_topic_sensitivity(sensitivity);
        }
        if let Some(trajectory) = &r.emotional_trajectory {
            ctx = ctx.with_emotional_trajectory(trajectory);
        }
        if let Some(turn) = r.turn_number {
            ctx = ctx.with_turn_number(turn);
        }
        if let Some(rate) = r.user_speaking_rate {
            ctx = ctx.with_user_speaking_rate(rate);
        }
        if let Some(entities) = &r.remembered_entities {
            for e in entities {
                ctx = ctx.with_remembered_entity(
                    e.name.clone(),
                    e.entity_type.clone(),
                    e.familiarity,
                    e.emotional_valence,
                );
            }
        }
    }

    ctx
}

fn apply_transforms(
    text: &str,
    ctx: &SuperhumanContext,
) -> Result<(String, Vec<String>), (StatusCode, String)> {
    // Parse as SSML (or wrap plain text)
    let ssml_text = if text.trim().starts_with("<speak") {
        text.to_string()
    } else {
        format!("<speak>{}</speak>", text)
    };

    let mut doc = ssml::parse(&ssml_text)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid input: {}", e)))?;

    // Apply superhuman transforms
    let pipeline = TransformPipeline::new();
    let stats = pipeline
        .apply(&mut doc, ctx)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Transform error: {}", e)))?;

    let transforms: Vec<String> = stats.applied.iter().map(|(n, _)| n.clone()).collect();

    // Serialize document back to SSML (plain text wrapped for now; full XML serializer in core later)
    let ssml_string = format!("<speak>{}</speak>", doc.plain_text());

    Ok((ssml_string, transforms))
}

fn encode_audio(
    pcm: &[u8],
    format: &str,
    audio_format: AudioFormat,
) -> Result<(Vec<u8>, &'static str), (StatusCode, String)> {
    match format {
        "wav" => {
            use crate::audio::encode_wav_header;
            let header = encode_wav_header(&audio_format, pcm.len() as u32);
            let mut wav = Vec::with_capacity(44 + pcm.len());
            wav.extend_from_slice(&header);
            wav.extend_from_slice(pcm);
            Ok((wav, "audio/wav"))
        }
        "pcm" | _ => Ok((pcm.to_vec(), "audio/pcm")),
    }
}
