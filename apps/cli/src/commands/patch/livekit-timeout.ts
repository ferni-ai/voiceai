#!/usr/bin/env npx tsx
/**
 * Patch LiveKit Agents to increase ALL initialization timeouts
 *
 * The LiveKit library has multiple hardcoded timeouts that are too aggressive:
 * - initializeTimeout: 30s (parent waiting for child init)
 * - initializeProcessTimeout: 10s (process startup)
 * - ASSIGNMENT_TIMEOUT: 7.5s (job dispatch response)
 * - ORPHANED_TIMEOUT: 15s (parent ping timeout)
 *
 * These timeouts cause SIGTERM when:
 * - Cold starts take longer than expected
 * - Module loading is slow
 * - System is under load
 *
 * Run automatically via postinstall, or manually:
 *   npx tsx apps/cli/src/commands/patch/livekit-timeout.ts
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Patch script is at apps/cli/src/commands/patch/, so go up 5 levels to project root
const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const AGENTS_DIST = join(PROJECT_ROOT, 'node_modules/@livekit/agents/dist');

interface PatchResult {
  file: string;
  patches: string[];
  alreadyPatched: string[];
  notFound: string[];
}

function patchFile(filePath: string, patches: Array<{ before: string; after: string; name: string }>): PatchResult {
  const result: PatchResult = { file: filePath, patches: [], alreadyPatched: [], notFound: [] };

  if (!existsSync(filePath)) {
    return result;
  }

  let content = readFileSync(filePath, 'utf8');
  let modified = false;

  for (const { before, after, name } of patches) {
    if (content.includes(before)) {
      content = content.replace(before, after);
      result.patches.push(name);
      modified = true;
    } else if (content.includes(after) || content.includes('PATCHED')) {
      result.alreadyPatched.push(name);
    } else {
      result.notFound.push(name);
    }
  }

  if (modified) {
    writeFileSync(filePath, content, 'utf8');
  }

  return result;
}

function patchWorkerFiles(): void {
  console.log('\n=== Patching LiveKit SDK Timeouts ===\n');

  // Worker patches (worker.js, worker.cjs)
  const workerPatches = [
    {
      before: 'initializeTimeout: 3e4',
      after: 'initializeTimeout: 3e5 /* PATCHED: 5 min */',
      name: 'initializeTimeout (30s → 5 min)',
    },
    {
      before: 'initializeProcessTimeout = 10 * 1e3',
      after: 'initializeProcessTimeout = 300 * 1e3 /* PATCHED: 5 min */',
      name: 'initializeProcessTimeout (10s → 5 min)',
    },
    {
      before: 'ASSIGNMENT_TIMEOUT = 7.5 * 1e3',
      after: 'ASSIGNMENT_TIMEOUT = 60 * 1e3 /* PATCHED: 60s */',
      name: 'ASSIGNMENT_TIMEOUT (7.5s → 60s)',
    },
  ];

  // ORPHANED_TIMEOUT patches (job_proc_lazy_main.js, inference_proc_lazy_main.js)
  const orphanedPatches = [
    {
      before: 'ORPHANED_TIMEOUT = 15 * 1e3',
      after: 'ORPHANED_TIMEOUT = 300 * 1e3 /* PATCHED: 5 min */',
      name: 'ORPHANED_TIMEOUT (15s → 5 min)',
    },
  ];

  // Files to patch
  const workerFiles = ['worker.js', 'worker.cjs'].map((f) => join(AGENTS_DIST, f));
  const orphanedFiles = [
    join(AGENTS_DIST, 'ipc', 'job_proc_lazy_main.js'),
    join(AGENTS_DIST, 'ipc', 'job_proc_lazy_main.cjs'),
    join(AGENTS_DIST, 'ipc', 'inference_proc_lazy_main.js'),
    join(AGENTS_DIST, 'ipc', 'inference_proc_lazy_main.cjs'),
  ];

  let totalPatched = 0;
  let totalAlreadyPatched = 0;

  // Patch worker files
  console.log('--- Worker files (initializeTimeout, ASSIGNMENT_TIMEOUT) ---');
  for (const file of workerFiles) {
    const result = patchFile(file, workerPatches);
    if (result.patches.length > 0) {
      console.log(`  ✅ ${file.replace(PROJECT_ROOT + '/', '')}:`);
      result.patches.forEach((p) => console.log(`     - ${p}`));
      totalPatched += result.patches.length;
    }
    if (result.alreadyPatched.length > 0) {
      console.log(`  ⏭️  ${file.replace(PROJECT_ROOT + '/', '')}: already patched`);
      totalAlreadyPatched += result.alreadyPatched.length;
    }
  }

  // Patch orphaned timeout files
  console.log('\n--- IPC files (ORPHANED_TIMEOUT) ---');
  for (const file of orphanedFiles) {
    const result = patchFile(file, orphanedPatches);
    if (result.patches.length > 0) {
      console.log(`  ✅ ${file.replace(PROJECT_ROOT + '/', '')}:`);
      result.patches.forEach((p) => console.log(`     - ${p}`));
      totalPatched += result.patches.length;
    }
    if (result.alreadyPatched.length > 0) {
      console.log(`  ⏭️  ${file.replace(PROJECT_ROOT + '/', '')}: already patched`);
      totalAlreadyPatched += result.alreadyPatched.length;
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  if (totalPatched > 0) {
    console.log(`✅ Applied ${totalPatched} patches`);
  }
  if (totalAlreadyPatched > 0) {
    console.log(`⏭️  ${totalAlreadyPatched} patches already applied`);
  }
  if (totalPatched === 0 && totalAlreadyPatched === 0) {
    console.log('⚠️  No patches applied - files may have changed');
  }
  console.log('');
}

// Main
if (!existsSync(AGENTS_DIST)) {
  console.log('[patch-livekit-timeout] @livekit/agents not found, skipping patch');
  process.exit(0);
}

patchWorkerFiles();
