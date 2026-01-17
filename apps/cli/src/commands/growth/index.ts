/**
 * Growth Automation Module
 *
 * Autonomous growth marketing for ferni.ai across all channels.
 *
 * Components:
 * - growth.ts: CLI commands
 * - growth-storage.ts: State persistence
 * - content-engine.ts: AI content generation
 * - scheduler.ts: Autonomous task execution
 * - platform-clients.ts: Platform API integrations (Reddit, TikTok, Email)
 * - growth-validation.ts: Zod validation schemas
 */

export { registerGrowthCommand } from './growth.js';
export * from './growth-storage.js';
export * from './content-engine.js';
export * from './scheduler.js';
export * from './platform-clients.js';
export * from './growth-validation.js';
export * from './growth-metrics.js';
export * from './growth-intelligence.js';
