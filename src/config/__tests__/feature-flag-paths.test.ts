/**
 * isFeatureEnabled(path) resolves a dotted path into the flag tree and treats
 * anything that is not `true` as off. A wrong path is not an error, it is a flag
 * that is silently off forever: 'contextBuilderPrewarm' (the flag lives at
 * 'experimental.contextBuilderPrewarm') kept context-builder pre-warm off, and
 * 'voiceEmotionDetection' skipped every voice-emotion context builder.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFeatureFlags } from '../feature-flags.js';

const SRC = join(__dirname, '..', '..');
const CALL = /isFeatureEnabled\('([^']+)'\)/g;
// Only callers of the path-based isFeatureEnabled in config/feature-flags
const IMPORTS_FEATURE_FLAGS = /from ['"][./]*(?:config\/)?feature-flags(?:\.js)?['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

function resolve(flags: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  }, flags);
}

describe('isFeatureEnabled paths', () => {
  it('every path used in src resolves to a boolean flag', () => {
    const flags = getFeatureFlags();
    const unresolved: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      if (!IMPORTS_FEATURE_FLAGS.test(text)) continue;
      for (const [, path] of text.matchAll(CALL)) {
        if (typeof resolve(flags, path) !== 'boolean') {
          unresolved.push(`${relative(SRC, file)}: '${path}'`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });
});
