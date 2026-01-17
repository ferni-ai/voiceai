/**
 * Tool Interfaces
 *
 * Facade layer for exposing tool domain functionality to other layers
 * (context builders, services, etc.) without creating tight coupling.
 *
 * Pattern: Each facade re-exports types and functions from its domain.
 */

// CEO Coaching
export * from './ceo-coaching.facade.js';

// Communication Superhuman Tools
export * from './communication-superhuman.facade.js';

// Finance / Plaid
export * from './finance.facade.js';
