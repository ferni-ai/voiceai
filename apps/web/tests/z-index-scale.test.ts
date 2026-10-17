/**
 * Z-index scale guard
 *
 * The web app's stacking order is one scale of --z-* custom properties,
 * defined once on :root in src/styles/inline-styles.css. Before this guard,
 * call sites carried their own fallbacks (`var(--z-modal, 1400)`,
 * `var(--z-modal, 9999)`, ...) that disagreed with the scale and with each
 * other, and three call sites used names the scale never defined, so their
 * fallback was the real value. These tests keep it to one definition:
 *
 * - every --z-* name used in src/ is defined in the scale
 * - no call site carries a fallback, so the scale is the only number
 * - the overlay tiers keep their order
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MOMENT_Z_INDEX } from '../src/ui/moments/constants.js';

const WEB_ROOT = join(__dirname, '..');
const SCALE_FILE = join(WEB_ROOT, 'src', 'styles', 'inline-styles.css');

/** `--z-scale` in sleep-mode.ui.ts is a font-size multiplier, not a layer. */
const NOT_LAYERS = new Set(['scale']);

function sourceFiles(): string[] {
  const dir = join(WEB_ROOT, 'src');
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|css)$/.test(f) && !/\.test\.ts$/.test(f) && !f.includes('__tests__'))
    .map((f) => join(dir, f));
}

/** name -> value for every `--z-name: value;` declaration in the given CSS. */
function scaleDefinitions(css: string): Map<string, string> {
  const defs = new Map<string, string>();
  for (const m of css.matchAll(/^\s*--z-([a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    defs.set(m[1], m[2].trim());
  }
  return defs;
}

/** Every `var(--z-name[, fallback])` reference, as `file:line name fallback?`. */
function references(file: string): { where: string; name: string; fallback: string | null }[] {
  const out: { where: string; name: string; fallback: string | null }[] = [];
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*--z-([a-z0-9-]+)\s*(?:,\s*([^()]*?))?\)/g)) {
        out.push({
          where: `${relative(WEB_ROOT, file)}:${i + 1}`,
          name: m[1],
          fallback: m[2] ?? null,
        });
      }
    });
  return out;
}

/**
 * Numeric z-index literals at or above the first app-level tier (--z-sticky,
 * 100), as `file:line value`. Matches CSS in template literals
 * (`z-index: 10000;`) and style objects (`zIndex: '1000'`, `.zIndex = 1000`).
 * Small values (-3..30) layer inside one component and stay legal.
 */
const LITERAL_FLOOR = 100;
function largeLiterals(file: string): string[] {
  const out: string[] = [];
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(/z-?index['"]?\s*[:=]\s*['"]?(-?\d+)/gi)) {
        if (Number(m[1]) >= LITERAL_FLOOR) out.push(`${relative(WEB_ROOT, file)}:${i + 1} ${m[1]}`);
      }
    });
  return out;
}

const scale = scaleDefinitions(readFileSync(SCALE_FILE, 'utf8'));
const refs = sourceFiles()
  .flatMap(references)
  .filter((r) => !NOT_LAYERS.has(r.name));
const layer = (name: string): number => Number(scale.get(name));

describe('z-index scale', () => {
  it('scanner sees fallbacks and plain references', () => {
    const fixture = join(WEB_ROOT, 'tests', 'z-index-scale.test.ts');
    expect(references(fixture).map((r) => r.fallback)).toContain('2100');
    expect(refs.length).toBeGreaterThan(100);
  });

  it('defines the scale once, in inline-styles.css', () => {
    expect(scale.size).toBeGreaterThan(10);
    const elsewhere = sourceFiles()
      .filter((f) => f !== SCALE_FILE)
      .flatMap((f) =>
        [...scaleDefinitions(readFileSync(f, 'utf8')).keys()]
          .filter((n) => !NOT_LAYERS.has(n))
          .map((n) => `${relative(WEB_ROOT, f)}: --z-${n}`)
      );
    expect(elsewhere).toEqual([]);
  });

  it('every --z-* name used in src/ is defined by the scale', () => {
    const undefinedNames = refs
      .filter((r) => !scale.has(r.name))
      .map((r) => `${r.where} --z-${r.name}`);
    expect(undefinedNames).toEqual([]);
  });

  it('no call site carries its own fallback number', () => {
    // Example of what this rejects: z-index: var(--z-modal, 2100);
    const withFallback = refs
      .filter((r) => r.fallback !== null)
      .map((r) => `${r.where} --z-${r.name}`);
    expect(withFallback).toEqual([]);
  });

  it('scanner sees z-index literals in TS template literals and style objects', () => {
    // This file is the fixture: the lines below hold each shape the scanner must see.
    // z-index: 10000;
    // el.style.zIndex = '1000';
    const fixture = join(WEB_ROOT, 'tests', 'z-index-scale.test.ts');
    const seen = largeLiterals(fixture).map((s) => s.split(' ')[1]);
    expect(seen).toEqual(expect.arrayContaining(['10000', '1000']));
  });

  it('no src/ui TS file sets a numeric z-index at app-tier height', () => {
    // Example of what this rejects: `z-index: 10000;` in a modal's injected styles.
    // Use the scale instead: z-index: var(--z-modal);
    const uiDir = join(WEB_ROOT, 'src', 'ui');
    const literals = sourceFiles()
      .filter((f) => f.startsWith(uiDir) && f.endsWith('.ts'))
      .flatMap(largeLiterals);
    expect(literals).toEqual([]);
  });

  it('keeps the overlay tiers in order', () => {
    const tiers = [
      'base',
      'sticky',
      'dropdown',
      'banner',
      'panel',
      'popover',
      'tooltip',
      'modal-backdrop',
      'modal',
      'modal-elevated',
      'notification',
      'loading',
      'system',
    ].map(layer);
    expect(tiers.every((v) => Number.isFinite(v))).toBe(true);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    expect(layer('toast')).toBe(layer('notification'));
  });

  it('puts Moments toasts above panels and modals, on the scale', () => {
    // A literal 1000 hid every "Saved" pill behind full-width panels on phones.
    const tokenOf = (value: string | number): string =>
      String(value).match(/^var\(--z-([a-z0-9-]+)\)$/)?.[1] ?? `literal ${value}`;
    const names = Object.values(MOMENT_Z_INDEX).map(tokenOf);
    expect(names.filter((n) => !scale.has(n))).toEqual([]);
    expect(layer(tokenOf(MOMENT_Z_INDEX.whisper))).toBeGreaterThan(layer('panel'));
    expect(layer(tokenOf(MOMENT_Z_INDEX.whisper))).toBeGreaterThan(layer('modal'));
  });

  it('Moments style templates carry no literal z-index', () => {
    // The templates interpolate TS values, which the var() scan above can't see.
    const dir = join(WEB_ROOT, 'src', 'ui', 'moments');
    const literals = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) =>
        [...readFileSync(join(dir, f), 'utf8').matchAll(/z-index:\s*([^;]+);/g)]
          .map((m) => m[1].trim())
          .filter(
            (v) => !/^var\(--z-[a-z0-9-]+\)$/.test(v) && !/^\$\{MOMENT_Z_INDEX\.\w+\}$/.test(v)
          )
          .map((v) => `${f}: z-index: ${v}`)
      );
    expect(literals).toEqual([]);
  });
});
