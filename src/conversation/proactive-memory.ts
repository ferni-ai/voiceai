/**
 * Re-export shim for ESM compatibility.
 * The proactive-memory module was refactored into a directory.
 * This file ensures `import './proactive-memory.js'` resolves correctly.
 */
export * from './proactive-memory/index.js';
