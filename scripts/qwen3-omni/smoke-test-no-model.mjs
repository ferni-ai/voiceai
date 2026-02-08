#!/usr/bin/env node
/**
 * Smoke test for Qwen3-Omni NAPI wiring — no 30B checkpoint required.
 * 1. Load rust-omni native binding (must be built first).
 * 2. OmniEngine with use_full_omni + bad paths → constructor must throw (load fails).
 * 3. OmniEngine without use_full_omni + bad paths → constructor must throw (Thinker load fails).
 * Run from repo root: node scripts/qwen3-omni/smoke-test-no-model.mjs
 */

import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
// Load platform .node directly (avoids duplicate getLibraryInfo in generated index.js)
const packagePath = path.join(repoRoot, 'apps/rust-omni');
const nodeName = `ferni-omni.${process.platform}-${process.arch}.node`;
const nodePath = path.join(packagePath, nodeName);
let binding;
if (fs.existsSync(nodePath)) {
  binding = require(nodePath);
} else {
  const debugPath = path.join(packagePath, 'target/debug/ferni_omni.node');
  const releasePath = path.join(packagePath, 'target/release/ferni_omni.node');
  if (fs.existsSync(debugPath)) {
    binding = require(debugPath);
  } else if (fs.existsSync(releasePath)) {
    binding = require(releasePath);
  } else {
    console.error('Build rust-omni first: cd apps/rust-omni && npx napi build --platform');
    process.exit(1);
  }
}

const OmniEngine = binding.OmniEngine;
const BAD_PATH = '/nonexistent/omni/model';
const BAD_TOKENIZER = '/nonexistent/tokenizer.json';

// NAPI-RS expects camelCase for config (thinkerModelPath, useFullOmni, etc.)
// Test 1: useFullOmni true with bad paths → constructor should throw (load_from_dir fails)
console.log('[1/2] OmniEngine(useFullOmni: true, bad paths) → expect throw...');
try {
  new OmniEngine({
    thinkerModelPath: BAD_PATH,
    thinkerTokenizerPath: BAD_TOKENIZER,
    useFullOmni: true,
  });
  console.error('FAIL: Expected constructor to throw');
  process.exit(1);
} catch (e) {
  console.log('OK: constructor threw:', e.message?.slice(0, 80) || String(e).slice(0, 80));
}

// Test 2: useFullOmni false with bad paths (Thinker-only mode) → constructor should throw
console.log('[2/2] OmniEngine(useFullOmni: false, bad paths) → expect throw...');
try {
  new OmniEngine({
    thinkerModelPath: BAD_PATH,
    thinkerTokenizerPath: BAD_TOKENIZER,
    useFullOmni: false,
  });
  console.error('FAIL: Expected constructor to throw');
  process.exit(1);
} catch (e) {
  console.log('OK: constructor threw:', e.message?.slice(0, 80) || String(e).slice(0, 80));
}

console.log('Smoke test passed (NAPI wired; load fails as expected without checkpoint).');
