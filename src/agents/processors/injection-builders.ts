/**
 * Re-export shim for ESM compatibility.
 * The injection-builders module was refactored into a directory.
 * This file ensures `import './injection-builders.js'` resolves correctly.
 */
export * from './injection-builders/index.js';
