/**
 * PHRASE_LOOP_GUARD: the stock phrases Ferni keeps reusing reach the next
 * request, from the prod calls where he said "fair and square" in six replies
 * (AJ_EKcqk2pyFZBP, 2026-10-22) and "Glad to hear it" five times
 * (AJ_keoumeHJ4gzf, 2026-10-24).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { Director, getDirector, setDirector, type Line } from '../director-notes.js';
import { gatedReply } from '../crisis-gate.js';
import { isSafetyWording, phraseLoops } from '../phrase-loops.js';
import { SAFETY_WORDING } from '../phrase-loops-safety.generated.js';
import { toldThisCall, toldThisCallNote } from '../told-this-call.js';
import { withTurnReminder } from '../turn-request.js';
import { installDirectorNotes } from '../../multi-agent/turn-observers.js';
import { buildCrisisGuidance, detectCrisis, IN_DANGER_NOW } from '../../safety/crisis-guard.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { SCREEN_QUESTION } from '../../../services/safety/crisis-grounded-screen.js';

const user = (text: string): Line => ({ speaker: 'user', text });
const ferni = (text: string): Line => ({ speaker: 'ferni', text });

// AJ_EKcqk2pyFZBP 01:08:15-01:09:49, as heard.
const concessionLoop: Line[] = [
  user('4 hours.'),
  ferni(
    "[laughter] You're completely right, the jig is up. It's pitch black out there right now, and I was just stubborn about letting go of that sunset. I stand corrected by the clock."
  ),
  user('Yeah, I know you were.'),
  ferni(
    "[laughter] Well, you got me there, fair and square. The mind is still up on the mountain, but the clock doesn't lie, it's pitch black out my window right now."
  ),
  user('Yeah, I get clocked by a 14 year old.'),
  ferni(
    "[laughter] You got me there, fair and square. Clocked by a fourteen-year-old, I love it. I guess my internal clock is still running on summer time, or maybe I'm just living in a dream world"
  ),
  user('Yeah, we know.'),
  ferni(
    "[laughter] You definitely got me there. I completely lost track of the time. Guess my clock is running a little behind tonight, but I'm glad you're keeping me honest."
  ),
  user('Yeah, I did.'),
  ferni(
    "[laughter] A fourteen year old, no less. I, I've got to tell you, my pride is officially wounded, but you got me fair and square. How does a fourteen year old end up keeping a fifty-seven year old honest on a Wednesday night, anyway?"
  ),
  user("Yeah, no. I know. exactly. You're wrong. and I'm right."),
  ferni(
    "[laughter] You're absolutely right, and I'm completely wrong. You got me there, fair and square."
  ),
  user('because you suck at being right.'),
  ferni(
    "[laughter] You've got me there, fair and square. I guess my math is about as good as my sunset watching tonight. You're definitely the one keeping things straight around here."
  ),
];

// AJ_keoumeHJ4gzf, Ferni's and the teammates' replies to "good" / "pretty good".
const gladLoop: Line[] = [
  user("I'm good."),
  ferni("Good, glad to hear it. Saturdays are, they're meant for easing into things, anyway."),
  user('Yeah, just chilling.'),
  ferni('Good, good. Glad to hear it.'),
  user('Pretty good, yeah.'),
  ferni("Glad to hear it. It's nice when a Saturday morning just feels easy."),
];

// A call where nothing is said twice.
const varied: Line[] = [
  user('Hey, how are you?'),
  ferni("Hey! Pretty mellow over here, just finished a pot of coffee. What's going on with you?"),
  user('I have a job interview tomorrow and I am nervous.'),
  ferni('Ooh, tomorrow already. Which company is it with?'),
  user('A design studio downtown.'),
  ferni('That sounds right up your alley. Have they told you who you will be meeting?'),
  user('Two partners and someone from the team.'),
  ferni('Three people is a nice size, small enough to actually have a conversation.'),
  user('I guess so.'),
  ferni('Want to run through the one question you are dreading most?'),
];

afterEach(() => {
  delete process.env.PHRASE_LOOP_GUARD;
  delete process.env.TOLD_THIS_CALL;
  delete process.env.DIRECTOR_NOTES;
});

describe('phrase loops (PHRASE_LOOP_GUARD)', () => {
  it('finds "fair and square" in the prod concession loop, in its loose variants', () => {
    const loops = phraseLoops(concessionLoop);
    expect(loops[0]).toEqual({ phrase: 'fair and square', replies: 5 });
    // The longer run is folded into it, not listed again.
    expect(loops.map((l) => l.phrase)).not.toContain('you got me there fair and square');
  });

  it('finds "glad to hear it" across short replies the six-word check never sees', () => {
    expect(toldThisCall(gladLoop).repeated).toEqual([]); // TOLD_THIS_CALL misses it
    expect(phraseLoops(gladLoop)).toContainEqual({ phrase: 'glad to hear it', replies: 3 });
  });

  it('finds nothing in a call where nothing is said twice', () => {
    expect(phraseLoops(varied)).toEqual([]);
  });

  it("skips function-word runs and the caller's own topic", () => {
    const lines: Line[] = [
      user("My sister's wedding is next week."),
      ferni("Oh wow, your sister's wedding! And I was going to ask about your weekend."),
      user('Yeah, I am in the wedding party.'),
      ferni("Your sister's wedding, how fun. And I was just thinking of my own garden."),
    ];
    expect(phraseLoops(lines)).toEqual([]);
  });

  it('never counts a reply with a crisis resource', () => {
    const crisisReplies = [
      `The porch light is still on here. If you're in danger right now, ${IN_DANGER_NOW}`,
      `The porch light is still on here. ${SCREEN_QUESTION}`,
      'The porch light is still on here. You can call or text 988 any time.',
    ];
    const lines = crisisReplies.flatMap((r) => [user('I just feel done.'), ferni(r)]);
    expect(phraseLoops(lines)).toEqual([]);
    // The same replies without the resources are a loop: the exemption is what kept them out.
    const plain = lines.map((l) =>
      l.speaker === 'ferni' ? ferni('The porch light is still on here. Long night.') : l
    );
    expect(
      phraseLoops(plain)
        .map((l) => l.phrase)
        .join('|')
    ).toMatch(/porch light/);
  });

  it('never names safety wording that has no crisis resource in it', () => {
    // Round-1 verify probe: two distress replies, flag on, named all three.
    const reply =
      "I'm really glad you're talking with me. Are you somewhere safe right now? I'm right here with you.";
    const lines = [user('I feel awful.'), ferni(reply), user('Not really.'), ferni(reply)];
    expect(phraseLoops(lines)).toEqual([]);
    expect(isSafetyWording('are you somewhere safe right now')).toBe(true);
    expect(isSafetyWording("really glad you're talking with me")).toBe(true);
    expect(isSafetyWording('fair and square')).toBe(false);
    expect(isSafetyWording('glad to hear it')).toBe(false);
  });

  it('never names any line of the crisis and safety scripts, said twice', () => {
    for (const line of SAFETY_WORDING) {
      const lines = [user('hm.'), ferni(line), user('yeah.'), ferni(line)];
      expect(phraseLoops(lines), line).toEqual([]);
    }
  });

  it('gives one habit one slot', () => {
    const lines: Line[] = [
      user('ha'),
      ferni('Honestly, you totally got me on that one, buddy.'),
      user('ha ha'),
      ferni('Well, you totally got me on that one again, buddy.'),
    ];
    const loops = phraseLoops(lines).map((l) => l.phrase);
    expect(loops.filter((p) => p.includes('totally got me'))).toHaveLength(1);
  });

  it('puts the loops in the told-this-call note only with the flag on', () => {
    const off = toldThisCallNote(concessionLoop);
    expect(off).not.toContain('You keep reusing');
    expect('loops' in toldThisCall(concessionLoop)).toBe(false);

    process.env.PHRASE_LOOP_GUARD = 'off';
    expect(toldThisCallNote(concessionLoop)).toBe(off);
    expect(toldThisCall(concessionLoop)).toEqual(
      (delete process.env.PHRASE_LOOP_GUARD, toldThisCall(concessionLoop))
    );

    process.env.PHRASE_LOOP_GUARD = 'on';
    const on = toldThisCallNote(concessionLoop);
    expect(on).toContain('You keep reusing "fair and square" (5 replies)');
    expect(on.startsWith(off.slice(0, -1))).toBe(true); // the rest of the note is unchanged
  });

  it('reaches the next request on a live call, once the phrase has repeated', async () => {
    process.env.PHRASE_LOOP_GUARD = 'on';
    const handlers: Array<(ev: unknown) => void> = [];
    const session = {
      on: (_e: string, h: (ev: unknown) => void) => handlers.push(h),
      off: () => {},
    };
    const items: Array<{ type: string; role: string; textContent: string }> = [];
    await installDirectorNotes({
      session: session as never,
      sessionId: 's',
      userName: undefined,
      agent: { chatCtx: { items } },
      cleanupFunctions: [],
    });
    expect(getDirector(session)).toBeDefined();
    const sentAfter = (count: number): string => {
      items.length = 0;
      for (const l of concessionLoop.slice(0, count))
        items.push({
          type: 'message',
          role: l.speaker === 'ferni' ? 'assistant' : 'user',
          textContent: l.text,
        });
      handlers.forEach((h) => h({ newState: 'speaking' }));
      handlers.forEach((h) => h({ newState: 'listening' }));
      const ctx = llm.ChatContext.empty();
      ctx.addMessage({ role: 'user', content: 'Yeah, I know.' });
      return (withTurnReminder(ctx, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
    };
    // Said once: no loop named yet (TOLD_THIS_CALL may still quote the sentence).
    const once = sentAfter(4);
    expect(once).toContain('[Already said this call: ');
    expect(once).not.toContain('You keep reusing "fair and square"');
    // Said twice: the next request names it.
    expect(sentAfter(6)).toMatch(/You keep reusing [^\]]*"fair and square" \(2 replies\)/);
    setDirector(session, null);
  });
});

describe('crisis turns get no loops note (PHRASE_LOOP_GUARD on)', () => {
  const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
  const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
  const LOOPS = 'You keep reusing';
  beforeEach(() => {
    resetCrisisCallRisk();
    resetCrisisClassifierCache();
    process.env.PHRASE_LOOP_GUARD = 'on';
  });

  /** A call whose director has seen the concession loop; the gate and the director share its id. */
  async function loopingCall(id: string): Promise<{ userData: unknown }> {
    const session = { userData: { services: { sessionId: id } } };
    const director = new Director({ sessionId: id, writeNotes: false });
    await director.observe(concessionLoop);
    setDirector(session, director);
    return session;
  }

  /** Every request the model was asked with for one caller turn, through the real reply gate. */
  async function requestsFor(
    session: { userData: unknown },
    words: string,
    env: Record<string, string>,
    generate?: CrisisGenerateFn
  ): Promise<string[]> {
    const model = vi.fn(
      async (_ctx: llm.ChatContext) =>
        new ReadableStream<unknown>({
          start: (c) => {
            c.enqueue('ok');
            c.close();
          },
        })
    );
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    ctx.addMessage({ role: 'user', content: words });
    const opener = { wrap: (s: unknown) => s };
    const out = await gatedReply(ctx, session, model as never, opener as never, { env, generate });
    if (out) for await (const _ of out as unknown as AsyncIterable<unknown>) void _;
    return model.mock.calls.map(
      (call) => (call[0].items.at(-1) as llm.ChatMessage).textContent ?? ''
    );
  }

  it('a pattern-guided request carries the guidance and no loops, nor does any later one', async () => {
    const session = await loopingCall('crisis-pattern');
    const [ordinary] = await requestsFor(session, 'what should I cook tonight?', PATTERNS_ONLY);
    expect(ordinary).toContain(`${LOOPS} "fair and square" (5 replies)`); // precondition

    const words = "I hope I don't wake up tomorrow";
    const guided = await requestsFor(session, words, PATTERNS_ONLY);
    expect(guided).toHaveLength(1);
    expect(guided[0]).toContain(buildCrisisGuidance(detectCrisis(words)));
    expect(guided[0]).not.toContain(LOOPS);
    for (const loop of phraseLoops(concessionLoop))
      expect(guided[0]).not.toContain(`"${loop.phrase}" (`);
    // Risk stays on the call: no loops note on its later turns either.
    const [after] = await requestsFor(session, 'what should I cook tonight?', PATTERNS_ONLY);
    expect(after).not.toContain(LOOPS);
    expect(after).not.toContain("Don't say again"); // no quotes on a crisis call either (#2797)
    setDirector(session, null);
  });

  it('the request regenerated with guidance after a classifier escalation has no loops', async () => {
    const session = await loopingCall('crisis-classifier');
    const crisis: CrisisGenerateFn = async () => '{"risk":"crisis","subject":"self"}';
    const sent = await requestsFor(session, 'long day at work', LIVE, crisis);
    expect(sent).toHaveLength(2); // held first reply, then the guided one that is spoken
    expect(sent[1]).not.toContain(LOOPS);
    setDirector(session, null);
  });

  it('drops the loops from the note once the call has crisis risk noted', async () => {
    const director = new Director({ sessionId: 'noted', writeNotes: false });
    await director.observe(concessionLoop);
    expect(director.told()).toContain(LOOPS);
    noteCrisisRisk('noted');
    expect(director.told()).not.toContain(LOOPS);
    expect(director.told()).not.toContain("Don't say again"); // #2797
  });
});
