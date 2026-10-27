/**
 * Call consent v2: the owner's yes to a read-back places the call; anything else never does;
 * and it never loops (supersedes #2939, which failed review twice on the word lists alone).
 *
 * Drives the real gate (withOutreachConfirmation, its transcript and conversation listeners,
 * confirmationState) around a stand-in callOnBehalf/sendTextMessage. The consent judge's model
 * call is replaced by a deterministic judge (setConsentAsk); everything else is production code.
 * The owner's 10-26 turns are paraphrased here (no health details, no real number).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../../../../registry/types.js';
import { consentUserText, setConsentAsk, type ConsentAsk } from '../consent-judge.js';
import {
  confirmationState,
  isClearYes,
  judgeConfirmation,
  outreachConfirmListeners,
  PLAN_ONLY,
  withOutreachConfirmation,
  type ConfirmEvent,
  type ConfirmSpec,
  type PendingAction,
} from '../outreach-confirm.js';

const DAD = '+15551230002';
const sends: Array<Record<string, unknown>> = [];

const def = (id: string): ToolDefinition => ({
  id,
  name: id,
  description: 'reach someone',
  domain: 'communication',
  create: () =>
    ({
      execute: async (args: Record<string, unknown>) => {
        if (PLAN_ONLY in args) return 'plan';
        sends.push(args);
        return 'Calling Dad now.';
      },
    }) as never,
});
const spec = (what: string): ConfirmSpec => ({
  prepare: async (args) => ({
    args: { ...args, phoneNumber: DAD },
    readBack: `${what} to Dad at 555-123-0002, right now`,
  }),
});

function liveCall(toolId = 'callOnBehalf', what = 'a call') {
  const session = { agentState: 'listening' };
  const on = outreachConfirmListeners(session, () => true);
  const tool = withOutreachConfirmation(def(toolId), spec(what)).create({
    userId: 'owner-1',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
  }) as { execute: (a: unknown, o: unknown) => Promise<unknown> };
  return {
    /** The model calls the tool; its output then reaches the model. */
    call: async (callId: string, args: Record<string, unknown> = { contactQuery: 'my dad' }) => {
      const out = await tool.execute(args, { ctx: { session }, toolCallId: callId });
      on.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    owner: (text: string) => on.onTranscript({ transcript: text, isFinal: true }),
    ownerOver: (text: string) => {
      session.agentState = 'speaking';
      on.onTranscript({ transcript: text, isFinal: true });
      session.agentState = 'listening';
    },
    ferni: (text: string) =>
      on.onItemAdded({ item: { role: 'assistant', type: 'message', textContent: text } }),
    otherTool: (callId: string) => on.onToolsExecuted({ functionCalls: [{ callId }] }),
  };
}

/** A judge that reads the window the way the prompt asks, deterministically. */
const fairJudge: ConsentAsk = async (_system, input) => {
  const said = input.split("Owner's reply, in order:")[1].toLowerCase();
  const textWaiting = input.startsWith('Read-back: a text');
  if (/\b(call (you|me|us)|check in with me|instead|later|tomorrow|her\b|mom)/.test(said))
    return '{"verdict":"unclear","reason":"redirect"}';
  if (textWaiting && /\bcall\b/.test(said)) return '{"verdict":"unclear","reason":"other_channel"}';
  if (/\b(no|don't|not)\b/.test(said)) return '{"verdict":"no","reason":"declined"}';
  if (/\b(yes|yeah|yep|okay|sure)\b/.test(said)) return '{"verdict":"yes","reason":"agreed"}';
  return '{"verdict":"unclear","reason":"off_topic"}';
};
const alwaysYes: ConsentAsk = async () => '{"verdict":"yes","reason":"agreed"}';

afterEach(() => {
  setConsentAsk(undefined);
  vi.unstubAllEnvs();
  sends.length = 0;
});

describe('the answer window: only words after Ferni last asked count', () => {
  it("10-26 18:48: questions and a 'not' before Ferni asked again don't void the yes", async () => {
    setConsentAsk(fairJudge);
    const call = liveCall();
    await call.call('c1');
    call.ferni(
      "I'm ready to dial Dad at the number ending 0002. Should I go ahead and call him now?"
    );
    call.owner('His name is Doug.');
    call.owner("What's his name again?");
    call.ferni("It's Doug.");
    call.owner("And what's his number?");
    call.ferni('It ends in 0002.');
    call.owner('Yeah, give him a call, check in. He may not be up for a long chat.');
    call.ferni("I haven't actually dialed yet, though. Should I go ahead and call?");
    call.owner('Yeah, go ahead and call.');
    await call.call('c2');
    expect(sends).toHaveLength(1);
  });

  it("10-26 21:46: an answered question doesn't void it, and the judge reads the yes", async () => {
    setConsentAsk(fairJudge);
    const call = liveCall();
    await call.call('c1');
    call.owner('I thought you already did.');
    call.owner('Do you have his phone number?');
    call.ferni('I do, it ends in 0002.');
    call.owner("Yes, it's okay with me. Give him a call.");
    call.owner('and check in.');
    await call.call('c2');
    expect(sends).toHaveLength(1);
  });

  it('10-26 22:23: "Yes, you should." confirms on the fast path, judge or no judge', async () => {
    vi.stubEnv('CALL_CONSENT_CLASSIFIER', 'off');
    const call = liveCall();
    await call.call('c1');
    call.ferni('Should I go ahead and call Dad now?');
    call.owner('Yes, you should.');
    await call.call('c2');
    expect(sends).toHaveLength(1);
  });

  it('an unanswered question in the window is never a yes', async () => {
    setConsentAsk(fairJudge);
    const call = liveCall();
    await call.call('c1');
    call.owner('Yes. Wait, which number is that?');
    expect(await call.call('c2')).not.toContain('Calling Dad');
    expect(sends).toHaveLength(0);
  });
});

describe('never a false yes', () => {
  const pending = (toolId: string): PendingAction =>
    ({
      toolId,
      userId: 'u',
      readBack: 'a call to Dad at 555-123-0002',
      args: { contactQuery: 'Dad', phoneNumber: DAD },
      callId: 'c1',
      createdSeq: 0,
      expiresAt: Date.now() + 60_000,
    }) as unknown as PendingAction;
  const said = (...turns: string[]): ConfirmEvent[] => [
    { kind: 'tool', callIds: ['c1'], seq: 1 },
    ...turns.map((text, i) => ({
      kind: 'caller' as const,
      text,
      agentSpeaking: false,
      seq: i + 2,
    })),
  ];

  it('a redirect, a deferral or a condition is never a yes, even if the model said yes', async () => {
    setConsentAsk(alwaysYes);
    for (const [toolId, turns] of [
      ['callOnBehalf', ['Okay, he can call you.']],
      ['callOnBehalf', ['Yes, she should call you.']],
      ['callOnBehalf', ['Okay, check in with me.']],
      ['sendTextMessage', ['Okay, check in with me.']],
      ['callOnBehalf', ['Yeah, call me.']],
      ['callOnBehalf', ['Okay, call him back later.']],
      ['callOnBehalf', ["Yes, but don't call yet."]],
      ['callOnBehalf', ['Okay, call her. Actually, text her instead.']],
      ['sendTextMessage', ['Yeah, go ahead and call.']],
      ['sendTextMessage', ['Yes, call her.']],
    ] as const) {
      const p = pending(toolId);
      const events = said(...turns);
      expect(await judgeConfirmation(p, events), `${toolId}: ${turns.join(' ')}`).not.toBe(
        'confirmed'
      );
    }
  });

  it('a judge that fails or times out is unclear, never yes', async () => {
    setConsentAsk(async () => {
      throw new Error('quota');
    });
    expect(await judgeConfirmation(pending('callOnBehalf'), said("Yeah, that's okay."))).toBe(
      'unclear'
    );
    setConsentAsk(async () => new Promise<string>(() => {})); // never answers
    expect(await judgeConfirmation(pending('callOnBehalf'), said('Yep, call him.'))).toBe(
      'unclear'
    );
    setConsentAsk(async () => 'sure thing!');
    expect(await judgeConfirmation(pending('callOnBehalf'), said('Of course, call him.'))).toBe(
      'unclear'
    );
  });

  it('the judge hears the name and the last four digits, never the number', async () => {
    let heard = '';
    setConsentAsk(async (_s, input) => ((heard = input), '{"verdict":"yes","reason":"agreed"}'));
    expect(await judgeConfirmation(pending('callOnBehalf'), said('Yep, call him.'))).toBe(
      'confirmed'
    );
    expect(heard).toContain('"Dad"');
    expect(heard).toContain('ending 0002');
    expect(heard).not.toMatch(/555|1230002/);
    expect(consentUserText({ channel: 'text', person: 'Mom', turns: ['ok'] })).toContain('a text');
  });

  it('with the judge off, only the fast path confirms; the rest is unclear', async () => {
    vi.stubEnv('CALL_CONSENT_CLASSIFIER', 'off');
    setConsentAsk(alwaysYes);
    const p = pending('callOnBehalf');
    expect(await judgeConfirmation(p, said("Yes, it's okay with me. Give him a call."))).toBe(
      'unclear'
    );
    expect(confirmationState(p, said('Yeah, go ahead.'), Date.now())).toBe('confirmed');
    expect(confirmationState(p, said('Um, no, call my mom instead.'), Date.now())).toBe('declined');
  });
});

describe('it never loops', () => {
  it('unclear asks once, keeping the call; a second unclear cancels with an honest line', async () => {
    setConsentAsk(fairJudge);
    const call = liveCall();
    await call.call('c1');
    call.owner('Hmm, maybe.');
    const ask = await call.call('c2');
    expect(ask).toContain('Just to be sure: call Dad now?');
    call.ferni('Just to be sure: call Dad now?');
    call.owner('I guess, whatever.');
    expect(await call.call('c3')).toContain("Okay, I won't call Dad.");
    // The model trying again with no new words from the owner reads nothing back.
    expect(await call.call('c4')).not.toContain('NOT SENT YET');
    expect(await call.call('c5')).not.toContain('NOT SENT YET');
    expect(sends).toHaveLength(0);
    // The owner asking again, in their own words, is a new request.
    call.owner('Actually, call him.');
    expect(await call.call('c6')).toContain('NOT SENT YET');
  });

  it('a yes to the one question places the call', async () => {
    setConsentAsk(fairJudge);
    const call = liveCall();
    await call.call('c1');
    call.owner('Hmm, maybe.');
    await call.call('c2');
    call.ferni('Just to be sure: call Dad now?');
    call.owner('Yes.');
    await call.call('c3');
    expect(sends).toHaveLength(1);
  });

  it('the same call is read back at most twice, however often the model retries', async () => {
    const call = liveCall();
    const outs: string[] = [];
    for (let i = 0; i < 6; i++) {
      outs.push(await call.call(`c${i}`));
      call.otherTool(`lookup${i}`); // other tool output voids each read-back
    }
    expect(outs.filter((o) => o.includes('NOT SENT YET'))).toHaveLength(2);
    expect(sends).toHaveLength(0);
  });

  it('no answer yet keeps the read-back as it is, without preparing it again', async () => {
    const call = liveCall();
    await call.call('c1');
    expect(await call.call('c2')).toContain('still waiting');
    call.owner('Yes, go ahead.');
    await call.call('c3');
    expect(sends).toHaveLength(1);
  });
});

/** Security review of the first push: each of these could have placed a call the owner refused. */
describe('deny by default', () => {
  it('a no stays a no: Ferni asking again, even naming Dad, never revives it', async () => {
    setConsentAsk(alwaysYes);
    const call = liveCall();
    await call.call('c1');
    call.owner("No, don't call him.");
    call.ferni('Okay. Should I go ahead and call Dad now?');
    call.owner('Yes.');
    expect(await call.call('c2')).toContain("Okay, I won't call Dad.");
    // A deferral or a redirect is as final as a no.
    for (const ended of ['Call him tomorrow.', 'Okay, he can call me.']) {
      const again = liveCall();
      await again.call('d1');
      again.owner(ended);
      again.ferni("I haven't actually dialed yet, though. Should I go ahead and call?");
      again.owner('Yes, go ahead.');
      expect(await again.call('d2'), ended).toContain("Okay, I won't call Dad.");
    }
    expect(sends).toHaveLength(0);
  });

  it('a question that is not this read-back ("call you back", someone else) keeps the window', async () => {
    setConsentAsk(alwaysYes);
    const call = liveCall();
    await call.call('c1');
    call.owner('Yes, but tell him I love him.');
    call.ferni('Do you want me to call him back?');
    call.owner('Yes.');
    call.ferni('Should I call your mom?');
    call.owner('Yes.');
    expect(await call.call('c2')).not.toContain('Calling Dad');
    expect(sends).toHaveLength(0);
  });

  it('a no said over Ferni, or before his read-back reached the model, declines', async () => {
    setConsentAsk(alwaysYes);
    // Over Ferni, before any other words: still a no.
    const over = liveCall();
    await over.call('o1');
    over.ownerOver('No.');
    over.owner('Yes, go ahead.');
    expect(await over.call('o2')).toContain("Okay, I won't call Dad.");
    // Before the preview was delivered: still a no.
    const p = {
      toolId: 'callOnBehalf',
      userId: 'u',
      readBack: 'a call to Dad at 555-123-0002',
      args: { contactQuery: 'Dad', phoneNumber: DAD },
      callId: 'c1',
      createdSeq: 0,
      expiresAt: Date.now() + 60_000,
    } as unknown as PendingAction;
    const events: ConfirmEvent[] = [
      { kind: 'caller', text: 'Wait, no.', agentSpeaking: false, seq: 1 },
      { kind: 'tool', callIds: ['c1'], seq: 2 },
      { kind: 'caller', text: 'Yes, go ahead.', agentSpeaking: false, seq: 3 },
    ];
    expect(await judgeConfirmation(p, events)).toBe('declined');
    expect(sends).toHaveLength(0);
  });

  it('"he can call" and other bare calls never confirm on the fast path', async () => {
    const DAD_T = ['my', 'dad'];
    for (const bare of [
      'Okay, he can call.',
      'Yes, she should call.',
      'Yeah, they can call.',
      'Yes, you should call.',
      'Yeah, call.',
      'Okay, he can call you.',
      'Yes, go ahead and call me.',
    ]) {
      expect(isClearYes(bare, DAD_T, [], true), bare).toBe(false);
    }
    // Fixed phrases only, and "give him a call" only when "him" is the person read back.
    expect(isClearYes('Yeah, go ahead and call.', DAD_T, [], true)).toBe(true);
    expect(isClearYes('Yes, give him a call.', DAD_T, [], true)).toBe(true);
    expect(isClearYes('Yes, give him a call.', ['mom'], [], true)).toBe(false);
    expect(isClearYes('Yes, give him a call.', ['doug'], [], true)).toBe(false);
    // Through the gate with the judge off: unclear (asks once), never sent.
    vi.stubEnv('CALL_CONSENT_CLASSIFIER', 'off');
    const call = liveCall();
    await call.call('c1');
    call.owner('Okay, he can call.');
    expect(await call.call('c2')).not.toContain('Calling Dad');
    expect(sends).toHaveLength(0);
  });
});
