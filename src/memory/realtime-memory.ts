/**
 * Real-Time Memory - Re-export Module
 *
 * This module re-exports from the services layer for architecture compliance.
 * The actual implementation lives in src/services/memory/realtime-memory.ts.
 *
 * Memory layer (Level 30) can be imported by agents (Level 100).
 * This allows cleanup-handler.ts to import from the memory layer.
 *
 * @module memory/realtime-memory
 */

export * from '../services/memory/realtime-memory.js';
