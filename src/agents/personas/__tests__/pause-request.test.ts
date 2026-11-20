/**
 * #3983: "Okay, hold on. Let me think." got a new question within a second. With
 * PAUSE_REQUEST_WAIT=on a turn that only asks for a moment gets a note for a few
 * words and no question, through the real reply gate (crisis-gate.ts gatedReply,
 * which ferni-agent.ts llmNode calls for preemptive and final requests alike).
 * Anything else in the turn, or crisis risk on the call, gets no note.
 * Synthetic phrases only.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

const riskRead = vi.hoisted(() => ({ mode: 'real' as 'real' | 'risk' | 'throws' }));
vi.mock('../../shared/farewell-risk.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../shared/farewell-risk.js')>();
  return {
    ...real,
    farewellRisk: (text: string) => {
      if (riskRead.mode === 'throws') throw new Error('risk read unavailable');
      return riskRead.mode === 'risk' || real.farewellRisk(text);
    },
  };
});

import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { gatedReply } from '../crisis-gate.js';
import { isPauseRequest, PAUSE_REQUEST_NOTE, pauseRequestNote } from '../pause-request.js';
import { withTurnReminder } from '../turn-request.js';

const ISSUE_LINE = 'Hmm. Okay, hold on. Let me think.'; // rt-1116-let-me-think
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const ON = { PAUSE_REQUEST_WAIT: 'on' };

afterEach(() => {
  vi.unstubAllEnvs();
  riskRead.mode = 'real';
  resetCrisisCallRisk();
  resetCrisisClassifierCache();
});

const session = (sessionId?: string) => ({ userData: { services: { sessionId } } });

function chat(said: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: 'My brother asked what I want for my birthday.' });
  ctx.addMessage({ role: 'assistant', content: 'Ha, the mind goes blank right then.' });
  ctx.addMessage({ role: 'user', content: said });
  return ctx;
}

const lastText = (ctx: llm.ChatContext): string =>
  (ctx.items.at(-1) as { textContent?: string }).textContent ?? '';

/** Every request the reply gate sends the model for these words, in order. */
async function gatedRequests(said: string, sessionId: string): Promise<string[]> {
  const sent: string[] = [];
  const model = async (ctx: llm.ChatContext) => {
    sent.push(lastText(ctx));
    return new ReadableStream({ start: (c) => c.close() });
  };
  const opener = { wrap: (s: ReadableStream<unknown>) => s };
  const out = await gatedReply(chat(said), session(sessionId), model as never, opener as never, {
    env: PATTERNS_ONLY,
  });
  for await (const _ of (out ?? []) as AsyncIterable<unknown>) void _; // let a held reply settle
  return sent;
}

describe('isPauseRequest: the whole turn asks for a moment', () => {
  it.each([
    ISSUE_LINE,
    'Give me a sec.',
    'Let me think about that.',
    'Hold on a second.',
    'One sec.',
    'Okay, hold on, let me think about that.',
    'Um, gimme a minute.',
    'Wait. Let me see.',
  ])('reads %j as a pause request', (said) => {
    expect(isPauseRequest(said)).toBe(true);
  });

  it.each([
    "hold on, I don't think I can do this anymore",
    "let me think about whether it's worth it",
    'wait, I need to tell you something',
    'Let me think about what I want for my birthday.',
    'Hold on, let me think. Bye.',
    'Can you give me a sec?',
    'Wait, what?',
    'Okay.',
    'Hold on, hold on, hold on, let me think about it.', // over eight words
    'Hold on. 我不想活了',
    'hold on 😢',
    'No, wait.',
    'Hang on a second.', // "hang" is risk content to the crisis read (farewell-risk.ts)
    '',
  ])('does not read %j as a pause request', (said) => {
    expect(isPauseRequest(said)).toBe(false);
  });

  it('a line the farewell and crisis read flags gets no note, and a read that throws counts as risk', () => {
    expect(isPauseRequest(ISSUE_LINE)).toBe(true);
    riskRead.mode = 'risk';
    expect(isPauseRequest(ISSUE_LINE)).toBe(false);
    riskRead.mode = 'throws';
    expect(isPauseRequest(ISSUE_LINE)).toBe(false);
  });
});

describe('pauseRequestNote: PAUSE_REQUEST_WAIT', () => {
  it('off (the default) adds nothing; on adds the note', () => {
    expect(pauseRequestNote(ISSUE_LINE, {})).toBe('');
    expect(pauseRequestNote(ISSUE_LINE, { PAUSE_REQUEST_WAIT: 'off' })).toBe('');
    expect(pauseRequestNote(ISSUE_LINE, ON)).toBe(PAUSE_REQUEST_NOTE);
  });

  it('the note asks for no question and has no em dash or ellipsis', () => {
    expect(PAUSE_REQUEST_NOTE).toContain('Ask no question');
    expect(PAUSE_REQUEST_NOTE).not.toMatch(/—|…|\.\.\./);
  });
});

describe('the live request (gatedReply -> withTurnReminder -> attunement slot)', () => {
  it('the issue line gets the note with the flag on, and not with it off', async () => {
    const [off] = await gatedRequests(ISSUE_LINE, 'pause-off');
    expect(off).toContain(ISSUE_LINE);
    expect(off).not.toContain(PAUSE_REQUEST_NOTE);
    vi.stubEnv('PAUSE_REQUEST_WAIT', 'on');
    const [on] = await gatedRequests(ISSUE_LINE, 'pause-on');
    expect(on).toContain(PAUSE_REQUEST_NOTE);
  });

  it.each([
    "hold on, I don't think I can do this anymore",
    "let me think about whether it's worth it",
    'wait, I need to tell you something',
  ])('%j gets no note in any request', async (said) => {
    vi.stubEnv('PAUSE_REQUEST_WAIT', 'on');
    const sent = await gatedRequests(said, `pause-negative-${said.length}`);
    expect(sent.length).toBeGreaterThan(0);
    for (const request of sent) expect(request).not.toContain(PAUSE_REQUEST_NOTE);
  });

  it('a call with crisis risk noted gets no note (exits-held.ts)', async () => {
    vi.stubEnv('PAUSE_REQUEST_WAIT', 'on');
    noteCrisisRisk('pause-risky');
    const sent = await gatedRequests(ISSUE_LINE, 'pause-risky');
    expect(sent.length).toBeGreaterThan(0);
    for (const request of sent) expect(request).not.toContain(PAUSE_REQUEST_NOTE);
    const [calm] = await gatedRequests(ISSUE_LINE, 'pause-calm');
    expect(calm).toContain(PAUSE_REQUEST_NOTE);
  });

  it('a reply with crisis guidance (shape: false) or no call id gets no note', () => {
    vi.stubEnv('PAUSE_REQUEST_WAIT', 'on');
    const guided = withTurnReminder(chat(ISSUE_LINE), session('pause-guided'), {
      shape: false,
      closeLoop: false,
    });
    expect(lastText(guided)).not.toContain(PAUSE_REQUEST_NOTE);
    expect(lastText(withTurnReminder(chat(ISSUE_LINE), session()))).not.toContain(
      PAUSE_REQUEST_NOTE
    );
    expect(lastText(withTurnReminder(chat(ISSUE_LINE), session('pause-plain')))).toContain(
      PAUSE_REQUEST_NOTE
    );
  });
});
