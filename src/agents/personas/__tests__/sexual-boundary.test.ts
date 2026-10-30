/**
 * SEXUAL_TOPIC_BOUNDARY: a caller who isn't a verified account owner, or who shows any sign of
 * being under 18, gets the boundary note on every reply (the real per-turn builder), and a turn
 * the model reads as sexual holds the call's memory for every writer's existing check. Fixtures
 * are fictional and generic.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  memoryHeld,
  minorHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
  userHeld,
  writeHeld,
} from '../../../utils/minor-care.js';
import {
  holdForSexualTopic,
  resetSexualTopicHold,
  sexualReadsSettled,
} from '../../../utils/sexual-topic-hold.js';
import {
  readCallerTurn,
  resetSexualBoundary,
  SEXUAL_BOUNDARY_NOTE,
  SEXUAL_READ_PROMPT,
} from '../sexual-boundary.js';
import { withTurnReminder } from '../turn-request.js';

const ON = { SEXUAL_TOPIC_BOUNDARY: 'on' };
let n = 0;
const fresh = () => `sb-${++n}`;

/** The last message of the request the reply model gets for these caller words. */
function replyRequest(sessionId: string, ...said: string[]): string {
  const chat = llm.ChatContext.empty();
  for (const text of said) chat.addMessage({ role: 'user', content: text });
  const out = withTurnReminder(chat, { userData: { userId: 'anon:x', services: { sessionId } } });
  return (out.items.at(-1) as llm.ChatMessage).textContent ?? '';
}

const verdict = (reply: string) => vi.fn(async () => reply);

beforeEach(() => {
  resetMinorCare();
  resetSexualTopicHold();
  resetSexualBoundary();
});
afterEach(() => vi.unstubAllEnvs());

describe('the boundary note on the real reply path', () => {
  it('rides every reply for a caller who is not a verified owner, only with the flag on', () => {
    const sessionId = fresh();
    expect(replyRequest(sessionId, 'what should I cook tonight?')).not.toContain(
      SEXUAL_BOUNDARY_NOTE
    );
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
    expect(replyRequest(sessionId, 'what should I cook tonight?')).toContain(SEXUAL_BOUNDARY_NOTE);
  });

  it('leaves a verified adult owner alone, but not one who says they are under 18', () => {
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
    setVerifiedOwnerCheck(() => true);
    const sessionId = fresh();
    expect(replyRequest(sessionId, 'tell me about your weekend')).not.toContain(
      SEXUAL_BOUNDARY_NOTE
    );
    expect(replyRequest(sessionId, "I'm 15 years old.")).toContain(SEXUAL_BOUNDARY_NOTE);
    // ...for the rest of the call, even with MINOR_CARE off
    expect(replyRequest(sessionId, 'anyway, what else')).toContain(SEXUAL_BOUNDARY_NOTE);
  });

  it("counts MINOR_CARE=shadow's read as an age signal for an owner", () => {
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
    vi.stubEnv('MINOR_CARE', 'shadow');
    setVerifiedOwnerCheck(() => true);
    const sessionId = fresh();
    replyRequest(sessionId, "I'm in 9th grade.");
    expect(replyRequest(sessionId, 'ok so anyway')).toContain(SEXUAL_BOUNDARY_NOTE);
  });

  it('gets firmer once a turn was read as sexual', async () => {
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
    const sessionId = fresh();
    expect(replyRequest(sessionId, 'hey')).not.toContain('keep the boundary');
    await readCallerTurn({ sessionId, text: 'a turn' }, { understand: verdict('{"sexual":true}') });
    expect(replyRequest(sessionId, 'hey')).toContain('keep the boundary');
  });
});

describe('the read holds the call memory', () => {
  it('a sexual read holds every writer check for this session and user', async () => {
    const sessionId = fresh();
    const userId = 'phone:+15550100';
    expect(writeHeld(userId, sessionId, ON)).toBe(false);
    const understand = verdict('{"sexual": true}');
    expect(
      await readCallerTurn({ sessionId, userId, text: 'a turn' }, { understand, env: ON })
    ).toBe(true);
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
    expect(memoryHeld(sessionId)).toBe(true);
    expect(userHeld(userId)).toBe(true);
    expect(writeHeld(userId, sessionId)).toBe(true);
    expect(writeHeld(userId, sessionId, { MINOR_CARE: 'on', ...ON })).toBe(true);
    // not MINOR_CARE: no minor hold, so no shared hold or purge at call end
    expect(minorHeld(sessionId, { MINOR_CARE: 'on' })).toBe(false);
    // and the flag turned off lifts it
    expect(writeHeld(userId, sessionId, {})).toBe(false);
  });

  it('a read that says not sexual holds nothing', async () => {
    const sessionId = fresh();
    const understand = verdict('{"sexual": false}');
    expect(await readCallerTurn({ sessionId, text: 'dinner plans' }, { understand, env: ON })).toBe(
      false
    );
    expect(memoryHeld(sessionId, ON)).toBe(false);
  });

  it.each([
    ['garbage', verdict('not json')],
    ['an error', vi.fn(async () => Promise.reject(new Error('down')))],
    [
      'a hang',
      vi.fn(
        () =>
          new Promise<string>(() => {
            // never settles
          })
      ),
    ],
  ])('a failed read (%s) holds: these callers memory is the cheap side', async (_, understand) => {
    const sessionId = fresh();
    await readCallerTurn({ sessionId, text: 'a turn' }, { understand, env: ON, timeoutMs: 20 });
    expect(memoryHeld(sessionId, ON)).toBe(true);
  });

  it('never reads a verified adult owner, or anyone with the flag off', async () => {
    const understand = verdict('{"sexual": true}');
    await readCallerTurn({ sessionId: fresh(), text: 'a turn' }, { understand, env: {} });
    setVerifiedOwnerCheck(() => true);
    const sessionId = fresh();
    await readCallerTurn({ sessionId, text: 'a turn' }, { understand, env: ON });
    expect(understand).not.toHaveBeenCalled();
    expect(memoryHeld(sessionId, ON)).toBe(false);
  });

  it('reads each turn with the last few as context, under its own prompt', async () => {
    const sessionId = fresh();
    const understand = verdict('{"sexual": false}');
    for (const text of ['one', 'two', 'three', 'four', 'five'])
      await readCallerTurn({ sessionId, text }, { understand, env: ON });
    const [prompt, input] = understand.mock.calls.at(-1) as unknown as [string, string];
    expect(prompt).toBe(SEXUAL_READ_PROMPT);
    expect(JSON.parse(input)).toEqual({ EARLIER: ['two', 'three', 'four'], NOW: 'five' });
  });

  it('never binds a placeholder id, so other anonymous callers stay unheld', async () => {
    const understand = verdict('{"sexual": true}');
    await readCallerTurn(
      { sessionId: fresh(), userId: 'anonymous', text: 'a turn' },
      { understand, env: ON }
    );
    expect(userHeld('anonymous', ON)).toBe(false);
  });

  /** A read the test answers by hand: answer() settles it. */
  function heldRead() {
    let answer: (v: string) => void = () => undefined;
    const understand = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          answer = resolve;
        })
    );
    return { understand, answer: (v: string) => answer(v) };
  }

  it('holds while a read is running (fail closed), and call-end work can wait for it', async () => {
    const sessionId = fresh();
    const userId = 'phone:+15550102';
    const { understand, answer } = heldRead();
    void readCallerTurn({ sessionId, userId, text: 'a turn' }, { understand, env: ON });
    const settled = sexualReadsSettled(sessionId);
    expect(settled).not.toBeNull();
    // A writer that runs before the read returns can't tell: it is refused.
    expect(memoryHeld(sessionId, ON)).toBe(true);
    expect(userHeld(userId, ON)).toBe(true);
    expect(writeHeld(userId, sessionId, ON)).toBe(true);
    answer('{"sexual": true}');
    await settled;
    expect(memoryHeld(sessionId, ON)).toBe(true);
    expect(sexualReadsSettled(sessionId)).toBeNull();
  });

  it('a clean read lifts the running-read hold before the awaiting writer resumes', async () => {
    const sessionId = fresh();
    const { understand, answer } = heldRead();
    const read = readCallerTurn({ sessionId, text: 'dinner plans' }, { understand, env: ON });
    expect(memoryHeld(sessionId, ON)).toBe(true);
    answer('{"sexual": false, "young": false}');
    expect(await read).toBe(false);
    expect(memoryHeld(sessionId, ON)).toBe(false); // the very next check, as transcript-handler does
  });

  it('never evicts a live hold, however many calls are held', async () => {
    const yes = verdict('{"sexual": true}');
    const first = fresh();
    await readCallerTurn({ sessionId: first, text: 'a turn' }, { understand: yes, env: ON });
    for (let i = 0; i < 520; i++) holdForSexualTopic(fresh());
    expect(memoryHeld(first, ON)).toBe(true);
  });
});

describe('cues of being under 18 without a stated age', () => {
  it('keep the boundary on after the caller is verified, and hold nothing by themselves', async () => {
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
    let owner = false;
    setVerifiedOwnerCheck(() => owner);
    const [cuedId, plainId] = [fresh(), fresh()];
    await readCallerTurn(
      { sessionId: cuedId, text: 'a turn' },
      { understand: verdict('{"sexual": false, "young": true}') }
    );
    await readCallerTurn(
      { sessionId: plainId, text: 'a turn' },
      { understand: verdict('{"sexual": false, "young": false}') }
    );
    owner = true;
    expect(replyRequest(plainId, 'so anyway')).not.toContain(SEXUAL_BOUNDARY_NOTE);
    expect(replyRequest(cuedId, 'so anyway')).toContain(SEXUAL_BOUNDARY_NOTE);
    expect(memoryHeld(cuedId)).toBe(false);
  });

  it('are still read after a hold, until found', async () => {
    const sessionId = fresh();
    const sexualOnly = verdict('{"sexual": true, "young": false}');
    await readCallerTurn({ sessionId, text: 'one' }, { understand: sexualOnly, env: ON });
    await readCallerTurn({ sessionId, text: 'two' }, { understand: sexualOnly, env: ON });
    expect(sexualOnly).toHaveBeenCalledTimes(2);
    const young = verdict('{"sexual": false, "young": true}');
    expect(await readCallerTurn({ sessionId, text: 'three' }, { understand: young, env: ON })).toBe(
      true
    ); // a later clean turn never lifts the hold
    await readCallerTurn({ sessionId, text: 'four' }, { understand: young, env: ON });
    expect(young).toHaveBeenCalledTimes(1);
    expect(memoryHeld(sessionId, ON)).toBe(true);
  });
});
