/**
 * Modules that store a user's scores, write them into memory text, or send
 * them to the user never turn a missing score into 0.
 *
 * `mood ?? 0` files the worst reading there is for a check-in that had no mood
 * ("Mood 0/10, Energy 0/10" in semantic memory). A missing score stays
 * undefined/null and is left out of text and averages
 * (missing-scores-stay-missing.test.ts). Counters are fine at 0, and a
 * threshold test such as `(stress ?? 0) > 0.5` stores nothing, so neither is
 * matched. Scope is kept to the modules that persist or send scores; elsewhere
 * most `?? 0` on these names are in-call thresholds.
 *
 * Lives here, not in src/tests, so it runs on every PR.
 *
 * @module services/data-layer/__tests__/score-missing-not-zero.test
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', '..');
const GUARDED = [
  'services/data-layer',
  'services/wellbeing-tracking',
  'services/ceo-coaching',
  'services/background-agents',
  'services/outreach',
  'services/contacts',
  'services/identity',
];
const SCORE_DEFAULTS_TO_ZERO =
  /\w*(mood|energy|stress|sleep|wellbeing|worry|loneliness|hope|sentiment|satisfaction|streak|rating|score|closeness)\w*(\??\.\w+)*\s*(\?\?|\|\|)\s*0(?![.\d])(?!\s*\)?\s*([<>=!]|\+\s*1\b))/i;

/** "file: trimmed line" → why it may stay. */
const ALLOWED: Record<string, string> = {
  'services/wellbeing-tracking/persistence.ts: mood: (snapshot.dimensions.mood ?? 0) * 10, // Convert -1 to 1 to 0-10 scale':
    'fix/wellbeing-after-call-guards owns this file and is fixing these two lines; remove after it merges',
  'services/wellbeing-tracking/persistence.ts: energy: (snapshot.dimensions.energy ?? 0) * 10, // Convert 0-1 to 0-10 scale':
    'same: owned by fix/wellbeing-after-call-guards',
  'services/identity/eight-sleep-api.ts: score: interval.score || 0,':
    'SleepSummary.score is a required number in the /eight-sleep API the app reads; making it optional changes that contract and the client, so it is a separate PR',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

function scoreZeroDefaults(file: string, text: string): string[] {
  return text
    .split('\n')
    .filter((line) => SCORE_DEFAULTS_TO_ZERO.test(line))
    .map((line) => `${file}: ${line.trim()}`);
}

describe('scores in modules that persist or send them', () => {
  it('never default a missing score to 0', () => {
    const offenders = GUARDED.flatMap((dir) => sourceFiles(join(SRC, dir)))
      .flatMap((path) => scoreZeroDefaults(relative(SRC, path), readFileSync(path, 'utf8')))
      .filter((hit) => !(hit in ALLOWED));
    expect(offenders).toEqual([]);
  });

  it('every allowlisted line still exists (no stale entries)', () => {
    const hits = new Set(
      GUARDED.flatMap((dir) => sourceFiles(join(SRC, dir))).flatMap((path) =>
        scoreZeroDefaults(relative(SRC, path), readFileSync(path, 'utf8'))
      )
    );
    expect(Object.keys(ALLOWED).filter((line) => !hits.has(line))).toEqual([]);
  });

  it.each([
    'mood: (w.mood ?? 0) * 10,',
    'average: energyTrend?.weekAverage || 0,',
    'return `Your ${currentStreak || 0}-day streak`;',
    'score: interval.score || 0,',
  ])('catches %s', (line) => {
    expect(scoreZeroDefaults('x.ts', line)).toHaveLength(1);
  });

  it.each([
    'if ((voice.stressLevel ?? 0) > 0.5) return;',
    'return (worry ?? 0) > 0.5 && (sleep ?? 1) < 0.4;',
    'counts.set(e.mood, (counts.get(e.mood) ?? 0) + 1);',
    'const intensity = emotion.intensity || 0.5;',
    'messagesSent: stats.messagesSent ?? 0,',
  ])('ignores %s', (line) => {
    expect(scoreZeroDefaults('x.ts', line)).toHaveLength(0);
  });
});
