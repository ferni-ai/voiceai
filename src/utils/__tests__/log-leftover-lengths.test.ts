/**
 * Three log lines the #2689 ratchet cannot see, because their names (leakedJson, rawLLMBuffer,
 * a `summary` key) are not in its TEXT_NAME / WHOLE_KEY lists. Each one carried Ferni's reply or
 * the caller's key moment into prod logs:
 * - tts-wrapper's leakSample: the first 100 chars of leaked JSON with long words masked. Digits
 *   and short words survived. Now replyForLog: a length on prod, the sample on dev.
 * - tts-wrapper's charCodes: the reply's first 20 characters as codes, which decode straight
 *   back to the words. Now dev only.
 * - the learning engine's 'Captured key moment': the moment's summary when LOG_USER_WORDS was
 *   on. Now its length.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** The source line holding `marker`, which must occur exactly once. */
function lineWith(src: string, marker: string): string {
  const lines = src.split('\n').filter((l) => l.includes(marker));
  expect(lines, `"${marker}" occurs once`).toHaveLength(1);
  return lines[0] ?? '';
}

/** `marker`'s line and the few after it (a field whose value spans lines). */
function fieldAt(src: string, marker: string, lines = 4): string {
  lineWith(src, marker);
  const at = src.indexOf(marker);
  return src.slice(at).split('\n').slice(0, lines).join('\n');
}

describe('log lines outside the ratchet keep words off prod logs', () => {
  const tts = read('src/agents/shared/tts-wrapper.ts');
  const engine = read('src/intelligence/user-learning-engine/engine.ts');

  it('leakSample goes through replyForLog', () => {
    expect(lineWith(tts, 'leakSample:')).toMatch(/leakSample:\s*replyForLog\(/);
  });

  it('charCodes are logged on the dev database only', () => {
    expect(fieldAt(tts, 'charCodes:')).toMatch(/charCodes:\s*isKnownDevDatabase\(\)\s*\?/);
  });

  it("'Captured key moment' logs the summary's length, never the summary", () => {
    const call = lineWith(engine, "'Captured key moment'");
    expect(call).toMatch(/len:\s*summary\.length/);
    expect(call).not.toMatch(/[{,]\s*summary\s*[,}]/);
    expect(call).not.toMatch(/summary:\s*summary\b/);
  });
});
