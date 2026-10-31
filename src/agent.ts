/**
 * Voice AI Agent Entry Point
 *
 * Multi-persona voice agent that loads personas dynamically.
 *
 * Usage:
 *   PERSONA_ID=ferni tsx src/agent.ts dev         # Ferni (life coach, default)
 *   PERSONA_ID=peter-john tsx src/agent.ts dev    # Peter John (research)
 *
 * Default: ferni
 *
 * See src/personas/ for available personas and how to add new ones.
 *
 * ARCHITECTURE (GCE Optimized):
 * - Uses gce-voice-worker.ts with clean orchestrator pattern
 * - Single-process mode optimized for GCE (pre-warmed resources)
 * - SessionOrchestrator coordinates session lifecycle
 * - Pipeline pattern for modular, testable setup steps
 *
 * See docs/architecture/GCE-CLEAN-ARCHITECTURE.md for details.
 */

// Make this file a module for top-level await
export {};

// Mask phone numbers in everything this process logs, before anything can log.
await import('./utils/log-redaction-install.js');

// Refuse to touch production data from a non-production process (no emulator, no opt-in).
await import('./config/refuse-production-data.js'); // loads dotenv, then the guard

// BUILD_SHA from the image's .build-sha when the env has none, so Sentry and the boot line carry the commit.
(await import('./config/build-sha.js')).loadBuildSha();

// Which token key this process seals and opens with (key id only), to match the web server's.
await import('./utils/token-key-fingerprint-boot.js');
// ...and which LOG_HASH_SECRET hashes phone numbers (fingerprint only), to match the web server's.
await import('./services/outreach/phone-hash-key-boot.js');

// Error reporting (Sentry), before the worker loads; a no-op without SENTRY_DSN.
await import('./instrument.js');

// GCE-optimized worker with clean architecture
await import('./agents/gce-voice-worker.js');
