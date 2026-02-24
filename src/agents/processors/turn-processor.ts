/**
 * Re-export shim for ESM compatibility.
 * The turn-processor module was refactored into a directory.
 * This file ensures `import './turn-processor.js'` resolves correctly.
 */
export * from './turn-processor/index.js';
