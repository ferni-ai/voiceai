#!/usr/bin/env node
/**
 * Fail a Docker build when the production install left dependencies unlinked.
 *
 * On 2026-09-27 the UI image's `pnpm install --prod` hit ENOSPC mid-install. The
 * packages were in node_modules/.pnpm but no top-level links were created, the
 * shell chain's `|| true` hid the failure, and the image shipped. Cloud Run then
 * died at startup with "Cannot find package 'dotenv'". This check runs right
 * after the install and refuses the build instead.
 *
 * Usage: node verify-node-modules.cjs [appDir]   (default: cwd)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const appDir = path.resolve(process.argv[2] || process.cwd());
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});

const missing = deps.filter((name) => {
  const manifest = path.join(appDir, 'node_modules', name, 'package.json');
  // existsSync follows the pnpm symlink, so a dangling link counts as missing.
  return !fs.existsSync(manifest);
});

if (missing.length > 0) {
  console.error(
    `verify-node-modules: ${missing.length}/${deps.length} production dependencies are not installed:\n  ` +
      missing.join('\n  ')
  );
  process.exit(1);
}
console.log(`verify-node-modules: all ${deps.length} production dependencies present`);
