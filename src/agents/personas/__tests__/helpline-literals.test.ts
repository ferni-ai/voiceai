/**
 * Structural guard: every hotline the app's tools and prompts name is a house fact, so with
 * HOUSE_FACTS on Ferni can say it (#3032 final verification). Scans every source file in the
 * hotline-bearing domains for toll-free numbers (digits or vanity letters), short codes
 * next to "text", and known helpline sites, and fails on any that the house facts don't
 * cover. A new literal in a tool fails here until it joins a helpline table
 * (life-coaching-shared/helplines.ts is the place for one that is in none).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { houseFacts } from '../../../config/house-facts.js';
import { houseAddresses } from '../grounded-addresses.js';
import { collectAddresses, judgeAddresses, noAddresses } from '../spoken-addresses.js';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
const DIRS = [
  'tools/domains/crisis',
  'tools/domains/human-transfer',
  'tools/domains/caregiver',
  'tools/domains/coming-out',
  'tools/domains/new-parent',
  'tools/domains/trauma-support',
  'tools/domains/job-loss',
  'tools/domains/sobriety',
  'tools/domains/life-coaching-shared',
  'services/safety',
];
/** Phone numbers that are not hotlines, with the reason. Everything else must be covered. */
const NOT_A_HOTLINE: Record<string, string> = {
  '1-800-725-2769': 'Salvation Army (findFinancialAssistance): a charity line, not a hotline',
};
/** Sites that are helplines. A new helpline domain belongs here (resource sites do not). */
const HELPLINE_SITE =
  /\b(?:988lifeline|crisistextline|thehotline|rainn|samhsa|veteranscrisisline|thetrevorproject|nationaleatingdisorders|iasp|disasterdistress|lgbthotline|childhelp|loveisrespect|suicidepreventionlifeline)\.(?:org|gov|net|com|info)\b/gi;

const walk = (dir: string): string[] => {
  try {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : walk(path);
      return /\.ts$/u.test(name) && !/\.test\./u.test(name) ? [path] : [];
    });
  } catch {
    return [];
  }
};

const PHONE =
  /(?:1[-\s.])?\(?8(?:00|33|44|55|66|77|88)\)?[-.\s][0-9A-Za-z]{3}[-.][0-9A-Za-z]{4}\b/gu;
const SHORT_CODE = /\btext\b[^'"`\n]{0,40}?\b(\d{5,6})\b/giu;

interface Literal {
  file: string;
  kind: 'phone' | 'short code' | 'site';
  value: string;
}

/** Every hotline-shaped literal in the scanned files. */
export function helplineLiterals(root = SRC, dirs = DIRS): Literal[] {
  const found: Literal[] = [];
  for (const file of dirs.flatMap((d) => walk(join(root, d)))) {
    const text = readFileSync(file, 'utf8');
    const name = file.slice(root.length);
    for (const m of text.matchAll(PHONE)) found.push({ file: name, kind: 'phone', value: m[0] });
    for (const m of text.matchAll(SHORT_CODE))
      found.push({ file: name, kind: 'short code', value: m[1] ?? '' });
    for (const m of text.matchAll(HELPLINE_SITE))
      found.push({ file: name, kind: 'site', value: m[0].toLowerCase() });
  }
  return found;
}

const known = houseAddresses(houseFacts({}));
const covered = ({ kind, value }: Literal): boolean => {
  if (kind === 'short code') return known.numbers.has(value);
  if (kind === 'site') return known.hosts.has(value.replace(/^www\./u, ''));
  if (NOT_A_HOTLINE[value]) return true;
  return judgeAddresses(`Call ${value}.`, known) === 'ok';
};

describe('every hotline literal in the tools and prompts is a house fact', () => {
  const literals = helplineLiterals();

  it('finds the hotlines it is meant to guard', () => {
    expect(literals.filter((l) => l.kind === 'phone').length).toBeGreaterThan(30);
    expect(literals.some((l) => l.kind === 'short code')).toBe(true);
    expect(literals.some((l) => l.kind === 'site')).toBe(true);
    for (const dir of [
      'tools/domains/crisis',
      'tools/domains/human-transfer',
      'tools/domains/caregiver',
      'tools/domains/coming-out',
      'tools/domains/new-parent',
      'tools/domains/sobriety',
      'tools/domains/life-coaching-shared',
      'services/safety',
    ])
      expect(literals.some((l) => l.file.startsWith(dir))).toBe(true);
  });

  it('covers every one', () => {
    const missing = literals
      .filter((l) => !covered(l))
      .map((l) => `${l.file}: ${l.kind} ${l.value}`);
    expect(missing).toEqual([]);
  });

  it('would notice a new literal (the check can fail)', () => {
    expect(covered({ file: 'x', kind: 'phone', value: '1-800-555-0100' })).toBe(false);
    expect(covered({ file: 'x', kind: 'short code', value: '55512' })).toBe(false);
    expect(covered({ file: 'x', kind: 'site', value: 'newhotline.org' })).toBe(false);
    expect(covered({ file: 'x', kind: 'phone', value: '1-800-662-HELP' })).toBe(true);
  });

  it('collects numbers the way the guard does', () => {
    expect(collectAddresses('1-800-662-HELP', noAddresses()).numbers.size).toBe(1);
  });
});
