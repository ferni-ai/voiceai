/**
 * Turn understanding: one closed-set reading of each caller turn, meant to
 * replace the per-feature regexes and word lists. Shadow only for now.
 *
 * @module understanding
 */
export * from './schema.js';
export * from './reader.js';
export * from './llm-teacher.js';
export * from './compare.js';
export { clash } from './teacher-prompts.js';
