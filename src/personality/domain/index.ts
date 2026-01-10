/**
 * Domain Layer Index
 *
 * The domain layer contains all business logic for personality intelligence.
 * It has NO external dependencies - pure TypeScript only.
 *
 * Structure:
 * - model/ - Entities and value objects
 * - services/ - Domain services (pure business logic)
 * - interfaces/ - Ports (abstractions for infrastructure)
 *
 * @module personality/domain
 */

// ============================================================================
// MODEL - Entities and Value Objects
// ============================================================================

export * from './model/index.js';

// ============================================================================
// SERVICES - Domain Services
// ============================================================================

export * from './services/index.js';

// ============================================================================
// INTERFACES - Ports
// ============================================================================

export * from './interfaces/index.js';
