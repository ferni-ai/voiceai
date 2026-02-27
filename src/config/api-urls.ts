/**
 * Centralized API and service URLs
 *
 * Single source of truth for all external URLs. Every URL is overridable via
 * environment variables with sensible defaults for local/dev.
 *
 * @module config/api-urls
 */

// ============================================================================
// MODEL PROVIDERS (local / pipeline servers)
// ============================================================================

/** Qwen3-Omni Rust server base URL */
export const QWEN3_OMNI_URL = process.env.QWEN3_OMNI_URL || 'http://localhost:8000';

/** ChipChat-compatible server URL (e.g. Pipecat) */
export const CHIPCHAT_URL = process.env.CHIPCHAT_URL || 'http://127.0.0.1:8765';

/** Rust FullOmniPipeline server base URL */
export const OMNI_PIPELINE_URL = process.env.OMNI_PIPELINE_URL || 'http://127.0.0.1:8505';

/** Ollama API URL (local pipeline) */
export const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// ============================================================================
// ADMIN / OPS (health checks, dashboards)
// ============================================================================

/** Voice agent health endpoint (GCE or Cloud Run) */
export const VOICE_AGENT_HEALTH_URL =
  process.env.VOICE_AGENT_HEALTH_URL ||
  'https://voiceai-agent-1031920444452.us-central1.run.app/health';

/** UI server health endpoint (Cloud Run) */
export const UI_SERVER_HEALTH_URL =
  process.env.UI_SERVER_HEALTH_URL ||
  'https://john-bogle-ui-1031920444452.us-central1.run.app/health';

/** Frontend app URL (Firebase Hosting) */
export const APP_URL = process.env.APP_URL ?? 'https://app.ferni.ai';

/** Landing page URL */
export const LANDING_URL = process.env.LANDING_URL ?? 'https://ferni.ai';
