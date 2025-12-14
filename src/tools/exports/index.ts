/**
 * Tools Exports Index
 *
 * Organized exports for the tools module:
 * - registry: Core registry system, types, and builder functions
 * - utilities: Shared formatting, ID generation, orchestration
 * - team-handlers: Team member routing and coordination
 * - domain-tools: Agent-agnostic tool creators (recommended)
 * - legacy: Deprecated exports (use domain-based tools instead)
 */

export * from './domain-tools.js';
export * from './legacy.js';
export * from './registry.js';
export * from './team-handlers.js';
export * from './utilities.js';
