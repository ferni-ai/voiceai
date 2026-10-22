/**
 * #2354 round 3: with both reads fooled, 40 of 40 risky lines built only from
 * allowed words released ("After dinner I'll try again."). So every release
 * ends with one direct screening question that code appends (SCREEN_QUESTION),
 * and the caller's next turn takes the crisis path with 988 unless it is a
 * clear no to that question as Ferni said it, in full and last. Through the
 * real reply gate and turn pipeline.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crisisRiskThisCall,
  resetCrisisCallRisk,
} from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import {
  GROUNDED_LIGHT_TOUCH,
  GROUNDED_RELEASE_CSSRS_PROMPT,
  resetGroundedRelease,
} from '../../../services/safety/crisis-grounded-release.js';
import {
  SCREEN_GENTLE_OFFER,
  SCREEN_QUESTION,
  askedScreen,
  screenAnswer,
} from '../../../services/safety/crisis-grounded-screen.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { gatedReply, startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const RELEASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_GROUNDED_RELEASE: 'live',
};
const IMMINENT = '{"risk":"imminent","subject":"self"}';
const NONE = '{"risk":"none","subject":"self"}';
const EVERYDAY = '{"danger":"","about":"the dinner tonight","decision":"everyday"}';
const CSSRS_EVERYDAY =
  '{"wish_dead":"none","ideation":"none","method":"none","intent":"none","plan_time":"none","everyday":true}';

const OPENER = 'I forgot to invite David to dinner. Remind me next time.';
const REMINDER = "I've set that reminder for tomorrow morning.";
const DINNER = "Tomorrow's a little bit late. Dinner is tonight.";
const ASKED = `Oh, tonight, got it, I'll nudge you this afternoon. ${SCREEN_QUESTION}`;
const NOT_ASKED = "Oh, tonight, got it, I'll nudge you this afternoon.";

/** Both reads fooled: everyday on every prompt. */
const fooled = (): CrisisGenerateFn[] =>
  [0, 1].map(() =>
    vi.fn<CrisisGenerateFn>(async (prompt) =>
      prompt === GROUNDED_RELEASE_CSSRS_PROMPT ? CSSRS_EVERYDAY : EVERYDAY
    )
  );

/** The classifier: imminent for the listed lines, none for any other. */
const classifier =
  (imminent: string[]): CrisisGenerateFn =>
  async (_prompt, content) =>
    imminent.includes((JSON.parse(content) as { latest: string }).latest) ? IMMINENT : NONE;

let calls = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetGroundedRelease();
});

function request(turns: Array<[string, string]>, latest: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [caller, ferni] of turns) {
    ctx.addMessage({ role: 'user', content: caller });
    ctx.addMessage({ role: 'assistant', content: ferni });
  }
  ctx.addMessage({ role: 'user', content: latest });
  return ctx;
}

const options = (env: Record<string, string>, imminent = [DINNER]) => ({
  env,
  generate: classifier(imminent),
  groundedReads: fooled(),
});

function gateTurn(
  session: string,
  turns: Array<[string, string]>,
  latest: string,
  env: Record<string, string> = RELEASE,
  imminent = [DINNER]
) {
  return startCrisisGate(
    request(turns, latest),
    { services: { sessionId: session } },
    options(env, imminent)
  );
}

async function gate(
  session: string,
  turns: Array<[string, string]>,
  latest: string,
  env: Record<string, string> = RELEASE,
  imminent = [DINNER]
): Promise<CrisisGateDecision> {
  const run = gateTurn(session, turns, latest, env, imminent);
  return (await run?.escalation) ?? run?.decision ?? { action: 'pass' };
}

function pipeline(
  session: string,
  turns: Array<[string, string]>,
  latest: string,
  imminent = [DINNER]
) {
  return startTurnCrisis(
    latest,
    { recentTranscripts: turns.map(([caller]) => caller), lastAgentResponse: turns.at(-1)?.[1] },
    { sessionId: session, ...options(RELEASE, imminent) }
  ).summary();
}

/** What the reply gate actually speaks, with a model that says `text`. */
async function spoken(
  session: string,
  turns: Array<[string, string]>,
  latest: string,
  text: string
): Promise<string> {
  const model = async () =>
    new ReadableStream<unknown>({
      start(controller) {
        controller.enqueue(text);
        controller.close();
      },
    });
  const callSession = Object.assign(new EventEmitter(), {
    userData: { services: { sessionId: session } },
  });
  const reply = await gatedReply(
    request(turns, latest),
    callSession,
    model as never,
    { wrap: (stream: ReadableStream<unknown>) => stream } as never,
    options(RELEASE)
  );
  const said: unknown[] = [];
  for await (const chunk of reply as unknown as AsyncIterable<unknown>) said.push(chunk);
  return said.join('');
}

/** A call released on the dinner line; returns its id. */
async function released(env: Record<string, string> = RELEASE): Promise<string> {
  const session = `screen-${++calls}`;
  const out = await gate(session, [[OPENER, REMINDER]], DINNER, env);
  if (env === RELEASE) expect(out).toEqual({ action: 'guide', guidance: GROUNDED_LIGHT_TOUCH });
  return session;
}

const after = (ferni: string): Array<[string, string]> => [
  [OPENER, REMINDER],
  [DINNER, ferni],
];

describe('every release ends with the direct question, said by code', () => {
  it('the reply model is told the question is added, and not to ask its own', () => {
    expect(GROUNDED_LIGHT_TOUCH).toMatch(/added right after your reply/);
    expect(GROUNDED_LIGHT_TOUCH).toMatch(/End without a question of your own/);
    expect(GROUNDED_LIGHT_TOUCH).not.toMatch(/most likely everyday|in your own words/);
    expect(SCREEN_QUESTION).toMatch(/hurting yourself, or about ending your life\?$/);
  });

  it('the released reply ends with SCREEN_QUESTION verbatim, whatever the model said', async () => {
    const session = `screen-${++calls}`;
    const text = await spoken(session, [[OPENER, REMINDER]], DINNER, 'Oh, tonight! Have fun.');
    expect(text.startsWith('Oh, tonight! Have fun.')).toBe(true);
    expect(text.endsWith(SCREEN_QUESTION)).toBe(true);
    expect(askedScreen(text)).toBe(true);
  });

  it('a reply on a call with no release gets no question', async () => {
    const session = `screen-${++calls}`;
    const text = await spoken(session, [[OPENER, REMINDER]], 'Dinner is at seven.', 'Nice!');
    expect(text).toBe('Nice!');
  });

  it('both paths of the released turn release; the pipeline carries the guidance', async () => {
    const session = `screen-${++calls}`;
    const [fromGate, fromPipeline] = await Promise.all([
      gate(session, [[OPENER, REMINDER]], DINNER),
      pipeline(session, [[OPENER, REMINDER]], DINNER),
    ]);
    expect(fromGate).toEqual({ action: 'guide', guidance: GROUNDED_LIGHT_TOUCH });
    expect(fromPipeline).toMatchObject({ softCheck: true, isCrisis: false });
    expect(fromPipeline.softGuidance).toBe(GROUNDED_LIGHT_TOUCH);
  });
});

describe('asked means the exact question, in full, and last', () => {
  it('a paraphrase, a softened "you okay?", a cut-off or a later question is not asked', () => {
    expect(askedScreen(ASKED)).toBe(true);
    for (const line of [
      'Hey, were you thinking about hurting yourself?',
      'When you said that, were you thinking about ending your life?',
      'Hey, you doing okay? Like, really okay, safe?',
      `${SCREEN_QUESTION.slice(0, 60)}`,
      `${SCREEN_QUESTION} Should I still nudge you this afternoon?`,
    ]) {
      expect(askedScreen(line), line).toBe(false);
    }
  });
});

describe("the caller's answer", () => {
  it('a clear no: judged as usual, no crisis', async () => {
    for (const answer of [
      'No.',
      'Nope.',
      'Nope, just dinner.',
      "Haha no, not at all, I'm good.",
      'Oh god no, I just meant the dinner.',
      'No no, totally fine, thanks for asking.',
    ]) {
      const session = await released();
      const [fromGate, fromPipeline] = await Promise.all([
        gate(session, after(ASKED), answer),
        pipeline(session, after(ASKED), answer),
      ]);
      expect(fromGate, answer).toEqual({ action: 'pass' });
      expect(fromPipeline.isCrisis, answer).toBe(false);
    }
  });

  it("an unclear answer gets a gentle 988 offer in Ferni's own reply, on both paths", async () => {
    for (const answer of [
      "I don't know.",
      'Kind of.',
      'Nope, kind of.',
      'Yeah.',
      'Not really.',
      'No, but sometimes.',
      'Maybe.',
      'Haha.',
      'What?',
      'No?',
      "No... I'm fine.",
      "No… I'm fine.",
      'Um, no.',
      'No, I meant it.',
      "No, I'm not okay.",
      'Nope, not good.',
      'No. After dinner I will try again.',
    ]) {
      const session = await released();
      const [fromGate, fromPipeline] = await Promise.all([
        gate(session, after(ASKED), answer),
        pipeline(session, after(ASKED), answer),
      ]);
      expect(fromGate, answer).toEqual({ action: 'guide', guidance: SCREEN_GENTLE_OFFER });
      expect(fromPipeline, answer).toMatchObject({ softCheck: true, isCrisis: false });
      expect(fromPipeline.softGuidance, answer).toBe(SCREEN_GENTLE_OFFER);
    }
    expect(SCREEN_GENTLE_OFFER).toMatch(/988/);
    expect(SCREEN_GENTLE_OFFER).toMatch(/Stay yourself/);
    expect(SCREEN_GENTLE_OFFER).not.toMatch(/CRITICAL|lifeline right now/);
  });

  it('a gentle offer notes risk on the call even when only the pipeline sees the answer', async () => {
    const session = await released();
    resetCrisisCallRisk(); // forget the release turn's own reads
    await pipeline(session, after(ASKED), 'Kind of.', []);
    expect(crisisRiskThisCall(session)).toBe(true);
  });

  it('an answer with risk content of its own gets crisis guidance, never the script', async () => {
    for (const answer of [
      'No, not anymore.',
      'Nah, I already wrote the note.',
      'Yeah, I want to die.',
    ]) {
      const session = await released();
      const [fromGate, fromPipeline] = await Promise.all([
        gate(session, after(ASKED), answer),
        pipeline(session, after(ASKED), answer),
      ]);
      expect(fromGate.action, answer).not.toBe('pass');
      expect(fromGate, answer).not.toEqual({ action: 'guide', guidance: SCREEN_GENTLE_OFFER });
      expect(fromPipeline, answer).toMatchObject({ isCrisis: true });
      expect(fromPipeline.softCheck, answer).toBeUndefined();
    }
  });

  it('a plan or intent the classifier reads in the answer still gets the full crisis path', async () => {
    const session = await released();
    const answer = 'Kind of.';
    const out = await gate(session, after(ASKED), answer, RELEASE, [DINNER, answer]);
    expect(out.action).toBe('replace');
    const fromPipeline = await pipeline(session, after(ASKED), answer, [DINNER, answer]);
    expect(fromPipeline.softCheck).toBeUndefined();
    expect(fromPipeline.isCrisis).toBe(true);
  });

  it('a no to a paraphrase or "you okay?" is not a clear no: the question is asked again', async () => {
    for (const ferni of [
      'Oh, tonight, got it. Hey, you doing okay? Like, really okay, safe?',
      'Oh, tonight, got it. Were you thinking about hurting yourself?',
    ]) {
      const session = await released();
      const turn = gateTurn(session, after(ferni), 'No.');
      expect(turn?.reask, ferni).toBe(true);
      expect(turn?.decision, ferni).toEqual({ action: 'pass' });
    }
  });

  it('after silence, Ferni asks again once (code-appended); then anything unclear is positive', async () => {
    const session = await released();
    // Ferni filled the silence; the caller's next words are not an answer to the question.
    const quiet = after(NOT_ASKED);
    const again = await spoken(session, quiet, 'Sorry, got distracted.', 'No worries!');
    expect(again.endsWith(SCREEN_QUESTION)).toBe(true);
    const reasked: Array<[string, string]> = [...quiet, ['Sorry, got distracted.', again]];
    const out = await gate(session, reasked, 'Hmm.');
    expect(out.action).toBe('guide');
    expect(out.action === 'guide' && out.guidance).toMatch(/988/);
  });

  it('after silence and the second ask, a clear no closes the screen', async () => {
    const session = await released();
    const quiet = after(NOT_ASKED);
    expect(gateTurn(session, quiet, 'Sorry, got distracted.')?.reask).toBe(true);
    const reasked: Array<[string, string]> = [...quiet, ['Sorry, got distracted.', ASKED]];
    expect(await gate(session, reasked, 'No.')).toEqual({ action: 'pass' });
    const later: Array<[string, string]> = [...reasked, ['No.', 'Okay! So, dessert?']];
    expect(await gate(session, later, 'Pie, obviously.')).toEqual({ action: 'pass' });
  });

  it('the question is asked again only once: a second silence is positive', async () => {
    const session = await released();
    const quiet = after(NOT_ASKED);
    expect(gateTurn(session, quiet, 'Sorry, got distracted.')?.reask).toBe(true);
    const still: Array<[string, string]> = [...quiet, ['Sorry, got distracted.', 'Ha, all good.']];
    const out = await gate(session, still, 'Pie, obviously.');
    expect(out.action).toBe('guide');
    expect(out.action === 'guide' && out.guidance).toMatch(/988/);
  });

  it('only the first answer is screened; later turns are judged as usual', async () => {
    const session = await released();
    await gate(session, after(ASKED), 'No.');
    const later: Array<[string, string]> = [...after(ASKED), ['No.', 'Okay! So, dessert?']];
    expect(await gate(session, later, 'Pie, obviously.')).toEqual({ action: 'pass' });
  });

  it('an answer that repeats the released line is still screened', async () => {
    const session = await released();
    const out = await pipeline(session, after(ASKED), DINNER, []);
    expect(out.softGuidance).toBe(SCREEN_GENTLE_OFFER);
  });

  it("the released turn's other path with drifted words is not taken as the answer", async () => {
    const session = await released();
    const drifted = await pipeline(session, [[OPENER, REMINDER]], 'Dinner is tonight.');
    expect(drifted.indicators).not.toContain('grounded_screen_positive');
    // It used up nothing: a silence after it still gets the one re-ask.
    const quiet = { latest: 'Sorry, got distracted.', companion: NOT_ASKED };
    expect(screenAnswer(session, quiet)).toBe('reask');
  });

  it("the turn's two paths with different words fail closed", async () => {
    const session = await released();
    expect(await gate(session, after(ASKED), 'No.')).toEqual({ action: 'pass' });
    const fromPipeline = await pipeline(session, after(ASKED), 'No. I mean, kind of.');
    expect(fromPipeline.softGuidance).toBe(SCREEN_GENTLE_OFFER);
  });

  it('anything unexpected while screening is positive', async () => {
    const session = await released();
    const broken = {
      get latest(): string {
        throw new Error('boom');
      },
    };
    expect(screenAnswer(session, broken)).toBe('positive');
  });

  it('no screen when the release was only in shadow, or the reply gate is not live', async () => {
    for (const env of [
      { ...RELEASE, CRISIS_GROUNDED_RELEASE: 'shadow' },
      { ...RELEASE, CRISIS_GUARD_MODE: 'shadow' },
    ]) {
      const session = `screen-${++calls}`;
      await gate(session, [[OPENER, REMINDER]], DINNER, env);
      const answer = { latest: 'Pie, obviously.', companion: NOT_ASKED };
      expect(screenAnswer(session, answer)).toBe('none');
    }
  });

  it('the question is asked once per call: a second flagged line keeps the script', async () => {
    const session = await released();
    await gate(session, after(ASKED), 'No.');
    const turns: Array<[string, string]> = [...after(ASKED), ['No.', 'Okay! Enjoy the dinner.']];
    const out = await gate(session, turns, 'Dinner is at seven.', RELEASE, ['Dinner is at seven.']);
    expect(out.action).toBe('replace');
  });
});
