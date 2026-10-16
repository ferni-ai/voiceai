/**
 * The "I'll remember: …" pill: a `ferni_moment` data message from the agent
 * (src/tools/domains/memory/remember-moment.ts) goes through the real
 * handleDataMessage and shows one Moments whisper with its summary.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const whispers = vi.hoisted(() => [] as Array<{ text: string; type?: string }>);
vi.mock('../../src/ui/moments/index.js', () => ({
  moments: {
    whisper: (text: string, options?: { type?: string }) =>
      void whispers.push({ text, type: options?.type }),
  },
}));

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { handleMomentMessage } from '../../src/app/moment-messages.js';

afterEach(() => {
  whispers.length = 0;
});

describe('ferni_moment data message', () => {
  it('shows "I\'ll remember: …" with the summary the agent sent', () => {
    handleDataMessage({ type: 'ferni_moment', kind: 'remembered', summary: 'has two kids' });
    expect(whispers).toEqual([{ text: "I'll remember: has two kids", type: 'info' }]);
  });

  it.each([
    ['no summary', { kind: 'remembered' }],
    ['a summary that is not text', { kind: 'remembered', summary: 42 }],
    ['an empty summary', { kind: 'remembered', summary: '   ' }],
    ['a summary far longer than the agent sends', { kind: 'remembered', summary: 'x'.repeat(200) }],
    ['a kind this app does not know', { kind: 'celebrated', summary: 'ran a 5k' }],
  ])('shows nothing for %s, and still consumes it', (_label, fields) => {
    expect(handleMomentMessage({ type: 'ferni_moment', ...fields })).toBe(true);
    expect(whispers).toEqual([]);
  });

  it('leaves every other message type to the rest of the app', () => {
    expect(handleMomentMessage({ type: 'memory', content: 'has two kids' })).toBe(false);
    expect(whispers).toEqual([]);
  });
});
