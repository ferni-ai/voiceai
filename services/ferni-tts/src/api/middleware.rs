//! API Middleware
//!
//! Request processing middleware for logging, tracing, and metrics.

use axum::{
    body::Body,
    http::{Request, Response},
    middleware::Next,
};
use std::time::Instant;
use uuid::Uuid;

/// Add request ID to every request
pub async fn request_id(
    mut request: Request<Body>,
    next: Next,
) -> Response<Body> {
    let request_id = request
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    request
        .headers_mut()
        .insert("x-request-id", request_id.parse().unwrap());

    let mut response = next.run(request).await;

    response
        .headers_mut()
        .insert("x-request-id", request_id.parse().unwrap());

    response
}

/// Track request timing
pub async fn request_timing(
    request: Request<Body>,
    next: Next,
) -> Response<Body> {
    let start = Instant::now();
    let method = request.method().clone();
    let path = request.uri().path().to_string();

    let mut response = next.run(request).await;

    let duration = start.elapsed();
    let duration_ms = duration.as_millis();

    // Add timing header
    response
        .headers_mut()
        .insert("x-response-time-ms", duration_ms.to_string().parse().unwrap());

    // Log request
    tracing::info!(
        method = %method,
        path = %path,
        status = %response.status().as_u16(),
        duration_ms = %duration_ms,
        "Request completed"
    );

    response
}
