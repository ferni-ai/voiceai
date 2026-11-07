#!/usr/bin/env npx tsx
/**
 * App design debt ratchet: how far apps/web is from reading one design system,
 * held so each number can only go down (2026-10-31 design audit, move 8).
 *
 * Measured over apps/web/src *.ts and *.css (styles live in both: many modules
 * inject a <style> string), comments stripped, skipping tests, stubs and
 * generated files. A value that reads a token (`var(--…)`, DURATION.*, EASING.*)
 * doesn't count; a literal does.
 *
 * usage:
 *   npx tsx apps/cli/src/commands/quality/app-design-debt.ts            check
 *   npx tsx apps/cli/src/commands/quality/app-design-debt.ts --update   lower the baseline to today
 *   npx tsx apps/cli/src/commands/quality/app-design-debt.ts --init     write a fresh baseline
 *
 * ratchet.ts runs the check too.
 *
 * @module quality/app-design-debt
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { colourLiterals, stripComments, type Source } from './website-theme-debt.js';

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'app-design-debt-baseline.json');
const APP_SRC = 'apps/web/src';
const SKIP_DIRS = new Set(['__tests__', 'stubs', 'node_modules']);

export interface AppDesignDebt {
  /** #hex, rgb()/rgba(), hsl()/hsla() literals */
  colourLiterals: number;
  /** distinct box-shadow values with no var() in them */
  distinctShadows: number;
  /** distinct cubic-bezier() curves */
  distinctEasings: number;
  /** ms/s literals in transition and animation declarations */
  literalDurations: number;
  /** font-size set in px or rem instead of a token */
  literalFontSizes: number;
  /** !important */
  importantTotal: number;
}

const DECL = (prop: string): RegExp => new RegExp(`(?<![\\w-])${prop}\\s*:\\s*([^;{}\`'"]+)`, 'gi');

function values(text: string, prop: string): string[] {
  return [...text.matchAll(DECL(prop))].map((m) => m[1]!.trim().replace(/\s+/g, ' '));
}

/** Measures any set of sources (exported for tests). */
export function measureAppSources(sources: Source[]): AppDesignDebt {
  const shadows = new Set<string>();
  const easings = new Set<string>();
  const debt: AppDesignDebt = {
    colourLiterals: 0,
    distinctShadows: 0,
    distinctEasings: 0,
    literalDurations: 0,
    literalFontSizes: 0,
    importantTotal: 0,
  };
  for (const { text: raw } of sources) {
    const text = stripComments(raw).replace(/(^|[^:])\/\/.*$/gm, '$1');
    debt.colourLiterals += colourLiterals(text).length;
    for (const v of values(text, 'box-shadow')) {
      if (!v.includes('var(') && !/^(none|inherit|initial|unset)$/i.test(v))
        shadows.add(v.toLowerCase().replace(/\s*([,()])\s*/g, '$1'));
    }
    for (const m of text.matchAll(/cubic-bezier\(\s*([^)]*)\)/gi)) {
      easings.add(m[1]!.replace(/\s+/g, ''));
    }
    for (const prop of ['transition', 'transition-duration', 'animation', 'animation-duration']) {
      for (const v of values(text, prop)) {
        debt.literalDurations += (v.match(/(?<![\w.$-])\d*\.?\d+m?s\b/g) ?? []).length;
      }
    }
    for (const v of values(text, 'font-size')) {
      if (/^\d*\.?\d+(px|rem)\b/i.test(v)) debt.literalFontSizes++;
    }
    debt.importantTotal += (text.match(/!important/g) ?? []).length;
  }
  debt.distinctShadows = shadows.size;
  debt.distinctEasings = easings.size;
  return debt;
}

function files(dir: string, root: string, out: Source[] = []): Source[] {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith('.')) files(path, root, out);
    } else if (
      /\.(ts|css)$/.test(name) &&
      !/\.(test|spec|d)\.ts$/.test(name) &&
      !name.includes('.generated.')
    ) {
      out.push({ path: relative(root, path), text: readFileSync(path, 'utf8') });
    }
  }
  return out;
}

export function measureAppDesignDebt(repoRoot = process.cwd()): AppDesignDebt {
  return measureAppSources(files(join(repoRoot, APP_SRC), repoRoot));
}

/** What rose above the baseline. Empty when the change may land. */
export function appDesignDebtRegressions(base: AppDesignDebt, now: AppDesignDebt): string[] {
  return (Object.keys(now) as Array<keyof AppDesignDebt>)
    .filter((k) => now[k] > (base[k] ?? 0))
    .map(
      (k) =>
        `App design debt "${k}" rose ${base[k] ?? 0} → ${now[k]}: use a design token (see app-design-debt.ts).`
    );
}

/** The baseline lowered to wherever things now stand better; never raised. */
export function loweredAppDesignDebt(base: AppDesignDebt, now: AppDesignDebt): AppDesignDebt {
  const out = { ...base };
  for (const k of Object.keys(base) as Array<keyof AppDesignDebt>)
    out[k] = Math.min(base[k], now[k]);
  return out;
}

/** The ratchet's check: measures, prints one line, and returns the regressions. */
export function checkAppDesignDebt(now = measureAppDesignDebt()): string[] {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as AppDesignDebt;
  process.stdout.write(
    `App design debt. Baseline: ${JSON.stringify(base)}\n                 Now:      ${JSON.stringify(now)}\n`
  );
  return appDesignDebtRegressions(base, now);
}

function main(): void {
  const args = process.argv.slice(2);
  const now = measureAppDesignDebt();
  if (args.includes('--init') || args.includes('--update')) {
    const base = args.includes('--init')
      ? now
      : (JSON.parse(readFileSync(BASELINE, 'utf8')) as AppDesignDebt);
    const next = loweredAppDesignDebt(base, now);
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 1)}\n`);
    process.stdout.write(`App design debt baseline: ${JSON.stringify(next)}\n`);
    return;
  }
  const worse = checkAppDesignDebt(now);
  if (worse.length > 0) {
    process.stdout.write(`\n❌ ${worse.map((w) => `  - ${w}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('\n✅ No app design debt metric rose.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
