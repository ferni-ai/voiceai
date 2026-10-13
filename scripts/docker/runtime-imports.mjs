#!/usr/bin/env node
/**
 * Fail the image build when a package the agent imports lazily can't load.
 *
 * On 2026-10-11 the agent image's node_modules prune deleted suffix-thumb's
 * src/test/ (runtime code, not tests). compromise loads it, and the agent only
 * imports compromise with import() during a call, so every build since #886
 * started cleanly and then never replied (#989). A static import fails at
 * startup; a dynamic one fails in the call.
 *
 * This lists every bare `import('pkg')` in src/ whose package is a production
 * dependency and imports each one from the pruned node_modules. A module that
 * can't be resolved fails the build; any other error at import (a missing env
 * var, a native init) is reported and allowed, since the call would get the
 * same error with or without the prune.
 *
 * Usage: node runtime-imports.mjs <srcDir> <appDir>   (appDir holds package.json + node_modules)
 *        node runtime-imports.mjs <srcDir> <appDir> --list
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, resolve } from 'node:path';

const DYNAMIC_IMPORT = /\bimport\(\s*(['"])([^'"\s]+)\1\s*\)/g;
const BUILTINS = new Set(builtinModules);
/** Errors that mean the module or a file it needs is not in node_modules. */
const NOT_FOUND =
  /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED|Cannot find (module|package)/;

/** The bare specifiers passed to import() in one file's text. */
export function bareSpecifiers(text) {
  const out = [];
  for (const m of text.matchAll(DYNAMIC_IMPORT)) {
    const spec = m[2];
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
    if (BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0])) continue;
    out.push(spec);
  }
  return out;
}

/** 'pkg/sub' -> 'pkg', '@scope/pkg/sub' -> '@scope/pkg'. */
export function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') sourceFiles(path, out);
    } else if (
      /\.(ts|mts|js|mjs)$/.test(entry.name) &&
      !/\.(test|spec|d)\.[mc]?[jt]s$/.test(entry.name)
    ) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Specifiers imported with import() anywhere in srcDir whose package is a
 * production dependency (optional, dev and undeclared packages are skipped:
 * the code must already cope with them missing).
 */
export function runtimeImports(srcDir, dependencies) {
  const found = new Set();
  const skipped = new Set();
  for (const file of sourceFiles(srcDir)) {
    for (const spec of bareSpecifiers(readFileSync(file, 'utf8'))) {
      (Object.hasOwn(dependencies, packageName(spec)) ? found : skipped).add(spec);
    }
  }
  return { specifiers: [...found].sort(), skipped: [...skipped].sort() };
}

/**
 * Import each specifier as the agent would, resolved from appDir, in a child
 * process (so nothing it starts keeps this one alive). Returns
 * { ok: [], notFound: [{ spec, error }], failed: [{ spec, error }] }.
 */
export function checkLoads(specifiers, appDir, timeoutMs = 20_000) {
  const script = `
    const specs = ${JSON.stringify(specifiers)};
    const result = { ok: [], notFound: [], failed: [] };
    const NOT_FOUND = ${NOT_FOUND};
    for (const spec of specs) {
      try {
        await Promise.race([
          import(spec),
          new Promise((_, reject) => setTimeout(() => reject(new Error('import timed out')), ${timeoutMs})),
        ]);
        result.ok.push(spec);
      } catch (error) {
        const text = String(error?.code ?? '') + ' ' + String(error?.message ?? error);
        (NOT_FOUND.test(text) ? result.notFound : result.failed).push({ spec, error: text.slice(0, 300) });
      }
    }
    process.stdout.write('\\n@@RESULT@@' + JSON.stringify(result));
    process.exit(0);
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: appDir,
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, NODE_ENV: 'production' },
  });
  return JSON.parse(out.slice(out.lastIndexOf('@@RESULT@@') + '@@RESULT@@'.length));
}

function main() {
  const [srcArg, appArg, flag] = process.argv.slice(2);
  if (!srcArg || !appArg) {
    console.error('usage: runtime-imports.mjs <srcDir> <appDir> [--list]');
    process.exit(2);
  }
  const appDir = resolve(appArg);
  const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
  const { specifiers, skipped } = runtimeImports(resolve(srcArg), pkg.dependencies ?? {});
  if (flag === '--list') {
    console.log(specifiers.join('\n'));
    return;
  }
  const result = checkLoads(specifiers, appDir);
  for (const { spec, error } of result.failed)
    console.log(`runtime-imports: ${spec} loads with an error (allowed): ${error}`);
  if (skipped.length)
    console.log(`runtime-imports: not production dependencies, skipped: ${skipped.join(', ')}`);
  if (result.notFound.length) {
    console.error(
      `runtime-imports: ${result.notFound.length} lazily imported module(s) can't load:`
    );
    for (const { spec, error } of result.notFound) console.error(`  ${spec}: ${error}`);
    process.exit(1);
  }
  console.log(`runtime-imports: all ${specifiers.length} lazily imported packages load`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
