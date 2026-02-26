/**
 * Identity Bounded Context
 *
 * Services related to user identification, authentication, authorization,
 * and contact management.
 *
 * Consolidates:
 * - Core identity (firebase-auth, natural-auth, user-identification)
 * - OAuth providers (google-calendar, spotify, apple-signin)
 * - Trust & identity (2FA, verification, voice-agent integration)
 * - Contact management (via contacts/ subdirectory)
 *
 * @module identity
 */

// Core authentication & identity
export * from './firebase-auth.js';
export * from './geo-detection.js';
export * from './google-calendar-oauth.js';
export * from './natural-auth.js';
export * from './sponsored-identity.js';
export * from './spotify-auth.js';
export * from './user-identification.js';

// Trust & identity (human-first 2FA, verification)
export * from '../trust-and-identity/human-first-2fa.js';
export * from '../trust-and-identity/identity-orchestrator.js';
export * from '../trust-and-identity/verification-store.js';
export * from '../trust-and-identity/voice-agent-integration.js';
