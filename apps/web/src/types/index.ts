/**
 * Type Definitions - Central Export
 *
 * Re-exports all type definitions for easy importing:
 * import { PersonaId, HandoffEvent, TokenResponse } from '@/types';
 * import { OperationResult, success, failure } from '@/types';
 * import { Result, ok, err, isOk } from '@/types';
 * import { UserId, SessionId, createUserId } from '@/types';
 */

// Result monad (functional error handling - mirrors backend)
export * from './result.js';

// Branded types (type-safe IDs)
export * from './branded.js';

// Operation result types (for async operations)
export * from './results.js';

// Zod schemas (runtime validation)
export * from './schemas.js';

// Persona types
export * from './persona.js';

// Event types
export * from './events.js';

// LiveKit types
export * from './livekit.js';

// Color types
export * from './colors.js';
