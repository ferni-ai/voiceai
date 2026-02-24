/**
 * Re-export shim for ESM compatibility.
 * The voice-agent-entry module was refactored into a directory.
 * This file ensures `import './voice-agent-entry.js'` resolves correctly.
 */
export * from './voice-agent-entry/index.js';
