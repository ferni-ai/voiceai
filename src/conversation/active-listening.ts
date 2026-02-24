/**
 * Re-export shim for ESM compatibility.
 * The active-listening module was refactored into a directory.
 * This file ensures `import './active-listening.js'` resolves correctly.
 */
export * from './active-listening/index.js';
