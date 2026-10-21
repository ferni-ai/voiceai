/**
 * The brand has no emoji in UI and doesn't count streaks ("Growth Through
 * Gentleness", CORE-PRINCIPLES.md). The Apple Watch app, its complications and
 * the iPhone mood widgets drew mood emoji and showed "N day streak" with a
 * flame. We can't render SwiftUI in CI, so this reads the Swift sources and
 * fails if an emoji or a streak display comes back.
 *
 * `streakDays` / `checkInStreak` may still be READ (old App Group data must
 * load without crashing); they just must not reach a view.
 *
 * The iPhone app's watch app and widgets were deleted in the native rebuild
 * (never shipped: the watch app wasn't embedded). The watch complication in the
 * shared Swift package remains, so it stays checked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const COMPLICATION = 'apps/shared/Sources/FerniShared/WatchOS/FerniComplication.swift';
const SURFACES: Array<{ rel: string; emoji: boolean }> = [{ rel: COMPLICATION, emoji: true }];

// Mood faces, thought bubble, flame, hearts: anything with emoji presentation.
const EMOJI = /\p{Extended_Pictographic}/u;

// A streak shown to the person: the label, the flame, or a gauge over streakDays.
const STREAK_DISPLAY: Array<{ name: string; pattern: RegExp }> = [
  { name: 'streak label', pattern: /day streak/i },
  { name: 'flame symbol', pattern: /"flame(?:\.fill)?"/ },
  { name: 'streak in a view', pattern: /(?:Text|Gauge)\([^)\n]*streakDays/ },
];

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/** Only lines that can render: skip `//` comments. */
const codeLines = (src: string): Array<{ n: number; line: string }> =>
  src
    .split('\n')
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => !/^\s*\/\//.test(line));

function offenders(rel: string, src: string, checkEmoji = true): string[] {
  return codeLines(src).flatMap(({ n, line }) => {
    const hits: string[] = [];
    if (checkEmoji && EMOJI.test(line)) hits.push('emoji');
    for (const { name, pattern } of STREAK_DISPLAY) if (pattern.test(line)) hits.push(name);
    return hits.map((h) => `${rel}:${n} [${h}] ${line.trim()}`);
  });
}

describe('Apple watch and widget surfaces: no emoji, no streak display', () => {
  it('flags the old lines and passes the new ones', () => {
    expect(offenders('x', '            case .great: return "😊"\n')).toHaveLength(1);
    expect(offenders('x', '                Text("🔥 \\(entry.streakDays)")\n')).toHaveLength(2);
    expect(offenders('x', '        Text("\\(connectivity.streakDays) day streak")\n')).toHaveLength(
      2
    );
    expect(offenders('x', '            Image(systemName: "flame.fill")\n')).toEqual([
      'x:1 [flame symbol] Image(systemName: "flame.fill")',
    ]);
    expect(
      offenders('x', '        let streak = defaults?.integer(forKey: "checkInStreak")\n')
    ).toEqual([]);
    expect(offenders('x', '            Image(systemName: entry.mood.symbolName)\n')).toEqual([]);
  });

  it.each(SURFACES)('$rel shows no streak (and no emoji on the watch)', ({ rel, emoji }) => {
    expect(offenders(rel, read(rel), emoji)).toEqual([]);
  });

  it('watch moods are SF Symbols, not emoji faces', () => {
    const src = read(COMPLICATION);
    for (const symbol of [
      'sun.max.fill',
      'sun.min.fill',
      'cloud.sun.fill',
      'cloud.fill',
      'cloud.rain.fill',
    ]) {
      expect(src).toContain(`"${symbol}"`);
    }
  });
});
