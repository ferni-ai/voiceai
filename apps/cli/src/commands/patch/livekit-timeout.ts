#!/usr/bin/env npx tsx
/**
 * Patch LiveKit Agents to increase initialization timeout
 *
 * The LiveKit library has a hardcoded 30s InferenceProcExecutor timeout
 * and 10s default initializeProcessTimeout. In Cloud Run, module loading
 * can take much longer due to cold CPU/disk. This script patches the
 * compiled dist files to use longer timeouts.
 *
 * Run this after npm install: npx tsx apps/cli/src/commands/patch/livekit-timeout.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Patch script is at apps/cli/src/commands/patch/, so go up 5 levels to project root
const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const WORKER_JS_PATH = join(PROJECT_ROOT, 'node_modules/@livekit/agents/dist/worker.js');

// Check if file exists
if (!existsSync(WORKER_JS_PATH)) {
  console.log('[patch-livekit-timeout] worker.js not found, skipping patch');
  process.exit(0);
}

// Read the file
let content = readFileSync(WORKER_JS_PATH, 'utf8');

// Patch 1: Increase InferenceProcExecutor timeout from 30s to 5 minutes
// Original: initializeTimeout: 3e4 (30000ms = 30s)
// Patched: initializeTimeout: 3e5 (300000ms = 5 minutes)
const patch1Before = 'initializeTimeout: 3e4';
const patch1After = 'initializeTimeout: 3e5 /* PATCHED: 5 min */';

if (content.includes(patch1Before)) {
  content = content.replace(patch1Before, patch1After);
  console.log('[patch-livekit-timeout] Patched InferenceProcExecutor timeout: 30s -> 5 min');
} else if (content.includes(patch1After)) {
  console.log('[patch-livekit-timeout] InferenceProcExecutor timeout already patched');
} else {
  console.log('[patch-livekit-timeout] WARNING: InferenceProcExecutor timeout pattern not found');
}

// Patch 2: Increase default initializeProcessTimeout from 10s to 5 minutes
// Original: initializeProcessTimeout = 10 * 1e3 (10000ms = 10s)
// Patched: initializeProcessTimeout = 300 * 1e3 (300000ms = 5 minutes)
const patch2Before = 'initializeProcessTimeout = 10 * 1e3';
const patch2After = 'initializeProcessTimeout = 300 * 1e3 /* PATCHED: 5 min */';

if (content.includes(patch2Before)) {
  content = content.replace(patch2Before, patch2After);
  console.log('[patch-livekit-timeout] Patched default initializeProcessTimeout: 10s -> 5 min');
} else if (content.includes(patch2After)) {
  console.log('[patch-livekit-timeout] Default initializeProcessTimeout already patched');
} else {
  console.log('[patch-livekit-timeout] WARNING: initializeProcessTimeout pattern not found');
}

// Write the patched file
writeFileSync(WORKER_JS_PATH, content, 'utf8');
console.log('[patch-livekit-timeout] Patch complete');
