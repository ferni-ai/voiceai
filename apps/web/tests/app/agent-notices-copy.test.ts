/**
 * The notices the agent's data messages raise (language switch, goodbye, calls made
 * on the person's behalf, background results) carry no emoji and are translated.
 *
 * Every message goes through the real handleDataMessage; only the whisper host is
 * replaced so the text it was asked to show can be read back.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shown = vi.hoisted(() => [] as string[]);
vi.mock('../../src/ui/message.ui.js', () => ({
  messageUI: { show: (text: string) => void shown.push(text), clear: vi.fn() },
}));

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import type { DataMessage } from '../../src/types/events.js';

const SRC = join(__dirname, '..', '..', 'src');
const LOCALES_DIR = join(SRC, 'i18n', 'locales');
const LOCALES = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
const HANDLERS = readFileSync(join(SRC, 'app', 'data-message-handlers.ts'), 'utf8');

const EMOJI = /[\p{Extended_Pictographic}✓✔️]/u;

const deliver = (message: Record<string, unknown>): void =>
  handleDataMessage({ timestamp: Date.now(), ...message } as unknown as DataMessage);

function valueOf(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }, locale);
}

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

beforeEach(() => {
  shown.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('agent notices', () => {
  it('on-behalf call results read warmly, with no emoji', () => {
    const call = { type: 'on_behalf_call_complete', callId: 'c', contactName: 'Mom', outcome: 'She loved it' };
    deliver({ ...call, status: 'completed', objectiveAchieved: true, callbackRequired: true });
    deliver({ ...call, status: 'voicemail', objectiveAchieved: false, callbackRequired: false });
    deliver({ ...call, status: 'no_answer', objectiveAchieved: false, callbackRequired: false });
    deliver({ ...call, status: 'failed', objectiveAchieved: false, callbackRequired: false });
    vi.advanceTimersByTime(2000);

    expect(shown).toEqual([
      'She loved it',
      'Left Mom a voicemail',
      "Couldn't reach Mom. Want me to try again later?",
      "The call to Mom didn't go through",
      'Mom wants you to call back',
    ]);
    for (const text of shown) expect(text).not.toMatch(EMOJI);
  });

  it.each(['success', 'partial_success', 'requires_action', 'failed'])(
    'a %s background result shows its summary with no icon prefix',
    (status) => {
      for (const resultType of ['research_complete', 'reservation_made', 'reminder_triggered', 'task_completed']) {
        deliver({
          type: 'background_result_complete',
          resultId: 'r',
          resultType,
          summary: 'Table for two at 7',
          status,
          priority: 'normal',
          contactName: 'Sam',
          requiresCallback: true,
        });
      }
      vi.advanceTimersByTime(2000);

      expect(shown.filter((t) => t === 'Table for two at 7')).toHaveLength(4);
      expect(shown).toContain('Sam wants to hear back from you');
      for (const text of shown) expect(text).not.toMatch(EMOJI);
    }
  );

  it('the goodbye and language switch are translated, not hardcoded', () => {
    deliver({ type: 'conversation_end', reason: 'goodbye', disconnectDelay: 0 });
    deliver({ type: 'set_language', language: 'en-US' });

    expect(shown).toEqual(['See you next time!', 'Switching to English']);
  });
});

describe('agentNotices copy', () => {
  const used = [...HANDLERS.matchAll(/t\('(agentNotices\.\w+)'/g)].map((m) => m[1]!);
  const en = JSON.parse(readFileSync(join(LOCALES_DIR, 'en-US.json'), 'utf8')) as unknown;

  it('the handlers use agentNotices keys', () => {
    expect(new Set(used).size).toBeGreaterThanOrEqual(7);
  });

  it('covers all 11 locales', () => {
    expect(LOCALES).toHaveLength(11);
  });

  for (const file of LOCALES) {
    it(`${file} translates every key the handlers use, keeping placeholders and dropping emoji`, () => {
      const locale = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')) as unknown;
      for (const key of used) {
        const value = valueOf(locale, key);
        expect(typeof value === 'string' && value.trim() !== '', `${file} ${key}`).toBe(true);
        expect(placeholders(value as string), `${file} ${key}`).toEqual(placeholders(valueOf(en, key) as string));
        expect(value as string).not.toMatch(EMOJI);
        expect(value as string).not.toMatch(/please/i);
      }
    });
  }
});
