/**
 * Entry point for Jack Bogle Voice AI Agent
 * 
 * This file re-exports from src/agents/jack-bogle.ts
 * to maintain backward compatibility with existing scripts and deployments.
 */

// Re-export everything from the main agent
export * from './agents/jack-bogle.js';

// Import to trigger side effects (CLI startup)
import './agents/jack-bogle.js';
