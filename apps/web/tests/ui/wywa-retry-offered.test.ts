/**
 * #4468 (CALLBACK_MEANS_ASKED): a missed call is no longer sent as "callbackRequired" (Linda
 * never asked for a call back), so the call result carries `retryOffered` instead. While You
 * Were Away still puts it in front of the owner as something to decide (main's priority and
 * "Action needed"), and no notice says Linda wants a call back.
 *
 * Real paths: handleDataMessage -> ferni:call-complete (on_behalf_call_complete) and
 * ferni:background-complete (background_result_complete, sent for every call's record) -> the
 * While You Were Away card. The background copy's requiresCallback is now only the ask; its
 * priority is high for an ask or a retry offer (callbackFollowUp), as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shown = vi.hoisted(() => [] as string[]);
vi.mock('../../src/ui/message.ui.js', () => ({
  messageUI: { show: (text: string) => void shown.push(text), clear: vi.fn() },
}));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { whileYouWereAwayUI } from '../../src/ui/while-you-were-away.ui.js';
import type { DataMessage } from '../../src/types/events.js';

const missed = (extra: Record<string, unknown>): void =>
  handleDataMessage({
    type: 'on_behalf_call_complete',
    callId: `c-${Math.random()}`,
    contactName: 'Linda',
    status: 'no_answer',
    objectiveAchieved: false,
    outcome: "I called Linda but couldn't reach them. Want me to try again later?",
    callbackRequired: false,
    timestamp: Date.now(),
    ...extra,
  } as unknown as DataMessage);

const recorded = (extra: Record<string, unknown>): void =>
  handleDataMessage({
    type: 'background_result_complete',
    resultId: `r-${Math.random()}`,
    resultType: 'on_behalf_call',
    summary: 'Tried calling Linda - no answer',
    status: 'partial_success',
    priority: 'normal',
    contactName: 'Linda',
    requiresCallback: false,
    actionItems: [],
    timestamp: Date.now(),
    ...extra,
  } as unknown as DataMessage);

const card = (): string => document.querySelector('.wywa-content')?.textContent ?? '';

whileYouWereAwayUI.init(); // once: each call adds its listeners again

beforeEach(() => {
  shown.length = 0;
  vi.useFakeTimers();
  whileYouWereAwayUI.show([
    { id: 'seed', type: 'other', title: 'Seed', summary: 'seed', priority: 'low', timestamp: new Date() }, // prettier-ignore
  ]);
});
afterEach(() => {
  whileYouWereAwayUI.hide(); // removes the card after its 300 ms fade
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('While You Were Away: a missed call Ferni can retry', () => {
  it('needs the owner (Action needed), with no "wants you to call back" notice', () => {
    missed({ retryOffered: true });
    vi.advanceTimersByTime(2000);
    expect(card()).toContain('Call to Linda');
    expect(card()).toContain('Action needed');
    expect(shown).not.toContain('Linda wants you to call back');
  });

  it('a missed call with neither field asks nothing of the owner, as before', () => {
    missed({});
    expect(card()).toContain('Call to Linda');
    expect(card()).not.toContain('Action needed');
  });
});

describe('While You Were Away: the background_result_complete path', () => {
  it('a missed call Ferni can retry (priority high) needs the owner, with no follow-up notice', () => {
    recorded({ priority: 'high' });
    vi.advanceTimersByTime(2000);
    expect(card()).toContain('Tried calling Linda - no answer');
    expect(card()).toContain('Action needed');
    expect(shown).not.toContain('Linda wants to hear back from you');
  });

  it("Linda's own ask still needs the owner and says so", () => {
    recorded({ priority: 'high', requiresCallback: true });
    vi.advanceTimersByTime(2000);
    expect(card()).toContain('Action needed');
    expect(shown).toContain('Linda wants to hear back from you');
  });

  it('a normal-priority call, or a high one of another kind, asks nothing, as before', () => {
    recorded({});
    recorded({ resultType: 'research_complete', priority: 'high', contactName: 'Peter' });
    expect(card()).toContain('Tried calling Linda - no answer');
    expect(card()).not.toContain('Action needed');
  });
});
