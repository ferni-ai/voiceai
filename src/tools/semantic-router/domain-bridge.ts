/**
 * Re-export shim for ESM compatibility.
 * The domain-bridge module was refactored into a directory.
 * This file ensures `import './domain-bridge.js'` resolves correctly.
 */
export * from './domain-bridge/index.js';
