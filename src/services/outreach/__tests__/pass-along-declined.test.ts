/**
 * The person Ferni called said no to "I'll pass along what you tell me to
 * Riley Test. Is that okay?". Only a personal call asks, and only an
 * unambiguous no counts; anything else is delivered as before. Real
 * buildCallScript and buildCallOutcome; fictional people and words.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { buildCallOutcome, completeOnBehalfCall } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { callResultText } = await import('../call-result-text.js');
const { crisisCallerLine, riskyCallerLine } = await import('../caller-text.js');
const { passAlongDeclined } = await import('../pass-along-declined.js');
const { buildCallScript } = await import('../../../tools/domains/telephony/scripts/index.js');
const { personalScript } = await import('../../../tools/domains/telephony/scripts/personal.js');
const { businessScript } = await import('../../../tools/domains/telephony/scripts/business.js');
const { restaurantScript } = await import('../../../tools/domains/telephony/scripts/restaurant.js');
const { healthcareScript } = await import('../../../tools/domains/telephony/scripts/healthcare.js');
type Analysis = import('../call-transcript-intelligence.js').SuperhumanCallResult;
type Turn = import('../call-transcript-intelligence.js').CallTranscriptTurn;
type Template = import('../../../tools/domains/telephony/types.js').CallScriptTemplate;

const scriptOf = (template: Template) =>
  buildCallScript(template, {
    agentName: 'Ferni',
    userName: 'Riley Test',
    contactName: 'Priya',
    purpose: 'tell her the picnic is on Saturday',
    objective: 'deliver_message',
  });
const dispatch = (template: Template) =>
  buildOnBehalfDispatch({
    callId: 'c-pass',
    requester: { userId: 'u-riley', name: 'Riley Test', timezone: 'UTC', originalSessionId: 's-1' },
    contact: { name: 'Priya', phone: '+15555550123', relationship: 'friend' },
    purpose: 'tell her the picnic is on Saturday',
    objective: 'deliver_message',
    callType: 'personal',
    script: scriptOf(template),
  });
const call = dispatch(personalScript);
const PERSONAL = scriptOf(personalScript);

const ASK =
  "Hi Priya! Just so you know, I'll pass along what you tell me to Riley Test. Is that okay?";
const SAID = 'The marmalade festival moved to the old lighthouse.';
const A = (content: string): Turn => ({ role: 'agent', content });
const R = (content: string): Turn => ({ role: 'recipient', content });
const turns = (answer: string): Turn[] => [
  A(ASK),
  R(answer),
  A('Riley wanted you to know the picnic is on Saturday.'),
  R(SAID),
  R('Thanks for letting me know, bye now.'),
];

/** The summary model's read of the call: it would carry what she said. */
const analysis = (): Analysis => ({
  transcript: { callId: 'c-pass', contactName: 'Priya', turns: [], duration: 90, capturedAt: '' },
  friendlyReport: 'Priya said the marmalade festival moved to the lighthouse.',
  insights: {
    summary: 'The marmalade festival moved.',
    detailedSummary: 'Priya said the marmalade festival moved to the old lighthouse.',
    keyPoints: [],
    emotionalTone: { recipientMood: 'warm', overallSentiment: 'positive', notableEmotions: [] },
    actionItems: ['Go to the marmalade festival'],
    messagesForUser: ['the marmalade festival moved to the lighthouse'],
    callbackRequested: false,
    relationshipSignals: [],
    topicsMentioned: [],
    objectiveAchieved: true,
    callQuality: 'good',
  },
});

const NO_LINE =
  "I reached Priya. They asked me not to pass anything along from the call, so that's all I can share.";
/** As main: the model's summary reaches the member. */
const delivered = (t: Turn[], c = call) => {
  expect(passAlongDeclined(c.script, t)).toBe(false);
  const o = buildCallOutcome(c, t, analysis(), undefined, 90);
  expect(o.outcome).not.toContain('asked me not to pass');
  expect(o.transcriptSummary).toContain('marmalade');
};

describe('a personal call: an unambiguous no is honoured', () => {
  it.each([
    'No.',
    'no',
    'Nope.',
    'Um, no.',
    'No thank you.',
    'Absolutely not.',
    'Please don’t.',
    'No, please don’t.',
    "I'd rather you didn't.",
    "No, I'm not comfortable with that.",
    "I'm not okay with that.",
    "No, that's not fine.",
    'I do not want you to.',
    "Actually, don't pass that on.",
    'No, keep it to yourself.',
  ])('%j: only that they said no is kept, and the member is told', (answer) => {
    const o = buildCallOutcome(call, turns(answer), analysis(), undefined, 90);
    expect(o.outcome).toBe(NO_LINE);
    expect(o.transcriptSummary).toBeUndefined();
    expect(o.message).toBeUndefined();
    expect(o.actionItems).toBeUndefined();
    expect(JSON.stringify(o)).not.toMatch(/marmalade|lighthouse/i);
    expect(callResultText('Priya', o)).toBe(`It's Ferni. ${NO_LINE}`);
  });

  it.each([
    'Keep that between us, okay?',
    "That's off the record.",
    "I'd rather keep it private, thanks.",
  ])('a refusal of all of it as their answer, %j, is a no', (answer) => {
    expect(buildCallOutcome(call, turns(answer), analysis(), undefined, 90).outcome).toBe(NO_LINE);
  });

  // A finished first reply is their answer; what follows before Ferni speaks is not a yes
  // (#3371 r2 security addendum, fictional).
  it.each([
    ['No.', 'Sorry, bad line.'],
    ['No.', 'Hello?'],
    ['No.', 'I mean it.'],
    ['No.', 'Not a thing, please.'],
    ['No.', 'Sorry.'],
    ['Nope.', 'Is that weird?'],
    ['No', 'Can you hear me?'],
    ["Please don't.", 'Thanks.'],
    ["I'd rather you didn't.", 'Okay?'],
    ['Keep it between us.', 'Please.'],
    ['No.', 'No.'],
    ["I'm not comfortable with that.", 'Sorry.'],
    ["Please don't.", 'Can you hear me?'],
    ['Keep it to yourself.', 'Is that weird?'],
  ])('%j then %j before Ferni speaks: a no', (first, then) => {
    const t = [A(ASK), R(first), R(then), A("Okay, I won't."), R(SAID)];
    expect(passAlongDeclined(call.script, t)).toBe(true);
    expect(buildCallOutcome(call, t, analysis(), undefined, 90).outcome).toBe(NO_LINE);
  });

  // A no holds for the rest of the call: Ferni's follow-up draws a yes to that, not to
  // passing it on (#3371 r2 verify, fictional flows).
  it.each([
    'Sure, go ahead.',
    "Actually yes, I'm free!",
    "Sorry, yes, I'm sure, don't tell her.",
    "Okay, that's fine, bye.",
  ])("a no, then Ferni's follow-up, then %j: still a no", (reply) => {
    const t = [A(ASK), R('No.'), A("Okay, I won't. Can I still give you Riley's message?"), R(reply), R(SAID)]; // prettier-ignore
    expect(passAlongDeclined(call.script, t)).toBe(true);
    const o = buildCallOutcome(call, t, analysis(), undefined, 90);
    expect(o.outcome).toBe(NO_LINE);
    expect(o.transcriptSummary).toBeUndefined();
    expect(JSON.stringify(o)).not.toMatch(/marmalade|lighthouse|free/i);
  });

  it('a no then "stop calling" keeps only that, and the promise not to call', () => {
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'on');
    const t = [...turns('No.'), R("And don't call me again.")];
    expect(buildCallOutcome(call, t, null, undefined, 9).outcome).toBe(
      "I reached Priya. They asked me not to pass anything along from the call, and not to call them again, so I won't. That's all I can share."
    );
    vi.unstubAllEnvs();
  });

  it('their words never reach the summary model', async () => {
    const analyze = vi.fn(async () => analysis());
    const report = vi.fn(async () => undefined);
    const ports = { readDisposition: () => undefined, readTranscript: () => turns('No.'), analyze, report }; // prettier-ignore
    const o = await completeOnBehalfCall('s-pass', call, 90, true, ports);
    expect(analyze).not.toHaveBeenCalled();
    expect(o?.outcome).toBe(NO_LINE);
  });
});

describe('a crisis always reaches the member, in Ferni’s words', () => {
  const CRISIS = 'Honestly I want to die some days.';
  it.each([
    ['after the no', [...turns('No.'), R(CRISIS)]],
    ['mid-call, not last', [A(ASK), R('No.'), A('Okay!'), R(CRISIS), R('Anyway, talk soon.')]],
    ['before the ask', [R('Hello?'), R(CRISIS), A(ASK), R('Nope.')]],
  ])('declined, crisis %s', async (shape, t) => {
    const c = { ...call, callId: `c-crisis-${shape}` }; // each its own call: one report per call
    const o = buildCallOutcome(c, t, analysis(), undefined, 90);
    expect(o.outcome).toBe(`${NO_LINE} ${crisisCallerLine('Priya')}`);
    expect(o.outcome).not.toMatch(/want to die/i);
    const analyze = vi.fn(async () => analysis());
    const ports = { readDisposition: () => undefined, readTranscript: () => t, analyze, report: vi.fn(async () => undefined) }; // prettier-ignore
    expect((await completeOnBehalfCall('s-c', c, 90, true, ports))?.outcome).toBe(o.outcome);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('a crisis on a line of its own reaches the member, even when the whole call reads softer', () => {
    // Joined, "I don't want to die" softens the line after it; read line by line it does not.
    const t = [A(ASK), R('No.'), A("Okay, I won't."), R("I don't want to die, I'm just tired."), R('Some days I really want to die.')]; // prettier-ignore
    const o = buildCallOutcome(call, t, analysis(), undefined, 90);
    expect(o.outcome).toBe(`${NO_LINE} ${crisisCallerLine('Priya')}`);
  });

  it('a yes, a crisis, then "keep this between us": delivered as main, crisis line and all', () => {
    const t = [A(ASK), R('Sure.'), R(CRISIS), R('Keep this between us.')];
    expect(passAlongDeclined(call.script, t)).toBe(false);
    const o = buildCallOutcome(call, t, analysis(), undefined, 90);
    expect(o.outcome).not.toContain('asked me not to pass');
    expect(o.outcome).toContain(crisisCallerLine('Priya'));
  });

  it('money, an account or a number still reaches the member on a no, in Ferni’s words', () => {
    const t = [A(ASK), R('No.'), A("Okay, I won't."), R('Tell him to Venmo me the 40 dollars.')];
    const o = buildCallOutcome(call, t, analysis(), undefined, 90);
    expect(o.outcome).toBe(`${NO_LINE} ${riskyCallerLine('Priya')}`);
    expect(o.outcome).not.toMatch(/venmo|40/i);
  });

  it('a crisis inside a no with more words is delivered as main, crisis line and all', () => {
    const o = buildCallOutcome(call, [A(ASK), R(`No. ${CRISIS}`)], null, undefined, 90);
    expect(o.outcome).not.toContain('asked me not to pass');
    expect(o.outcome).toContain(crisisCallerLine('Priya'));
  });

  it('they opt out of calls: the crisis line still goes (it was dropped before)', () => {
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'on');
    const t = [R('Hi.'), R(CRISIS), R('And stop calling me.')];
    for (const c of [call, dispatch(businessScript)]) {
      const o = buildCallOutcome(c, t, null, undefined, 120);
      expect(o.outcome).toContain('asked not to be called again');
      expect(o.outcome).toContain(crisisCallerLine('Priya'));
    }
    vi.unstubAllEnvs();
  });
});

// Held out from the reply set the rules were written against (#3355 r3 verify, fictional).
const HELD_OUT_YES = [
  'Yeah sure.', 'Of course!', "That's totally fine with me.", "No, that's cool.",
  'No, go right ahead.', 'No, you can tell him.', 'Nope, tell him whatever you want.',
  "No, that's all right.", 'Not a problem.', "Uh, no, it's cool.", 'No objection.',
  "I'm fine with that.", 'Yes, please do.', 'Please do.', "No, I don't care, tell her.",
  'Hmm, yeah, sure.', 'No, why would I mind?', 'Well, no, go on.', 'Totally.',
  "Ok that's fine but who is this?", "That's alright.", "No that's perfect.",
]; // prettier-ignore
const LATER_NOT_A_WITHDRAWAL = [
  "Don't tell anyone I said this but he's the best", "Don't mention it, happy to help",
  "It's a surprise party so don't tell her", "Don't repeat that mistake, tell him to bring a coat",
  "Tell him don't share it on Facebook", 'I told him just between us that the cake is lemon',
  "Haha don't tell them I burned the toast",
]; // prettier-ignore
// One secret mid-call withholds only that part, never the whole call (owner, 2026-11-02). That
// partial withhold is not built here, so each of these delivers as main (#3371 r1 verify).
const ONE_SECRET = [
  "It's a surprise party, so don't pass that on, but tell him to keep the 9th free.",
  "Keep this between us, but I'm bringing a plus-one. Tell Riley I said hi.",
  "I'd rather you didn't mention the job thing, but yes to Saturday.",
  'Off the record, the tart is store-bought. Anyway, the ninth works!',
  "I'd rather you didn't mention that part.",
  'Actually, don’t pass that on.',
  'Keep that between us, okay?',
  "That's off the record.",
]; // prettier-ignore
const BOOKING_REPLIES = [
  "No, sorry, we're fully booked on Friday.", 'Nope, nothing at seven, but eight works.',
  "Not really, we're closed Fridays.", 'Sure, seven works. Name?', 'Who is Sam?',
  "No, sorry, who's calling?",
]; // prettier-ignore

describe('everything else is delivered, as main does', () => {
  it('held-out yeses: 0 of 22 read as a no', () => {
    expect(HELD_OUT_YES).toHaveLength(22);
    expect(HELD_OUT_YES.filter((y) => passAlongDeclined(PERSONAL, turns(y)))).toEqual([]);
    for (const y of HELD_OUT_YES) delivered(turns(y));
  });

  it.each(LATER_NOT_A_WITHDRAWAL)('later in a yes call, %j is not taking it back', (later) => {
    delivered([...turns('Sure.'), R(later)]);
  });

  it.each(ONE_SECRET)('a secret later in a yes call, %j, does not withhold the call', (later) => {
    delivered([...turns('Sure, go ahead.'), R(later)]);
  });

  it.each(ONE_SECRET.slice(0, 5))(
    'one secret as their answer, %j, does not withhold the call',
    (a) => {
      delivered(turns(a));
    }
  );

  it('their own question is not the ask', () => {
    delivered([R("You'll pass along what I say to Riley, is that okay?"), R('Nope.'), A('Yes, I will.'), R(SAID)]); // prettier-ignore
  });

  it('a no to another question in the same turn: the ask must be the last question', () => {
    const both = `${ASK} I'd like to book a table for two on Friday at seven. Do you have availability?`;
    for (const reply of [...BOOKING_REPLIES, 'No.'])
      delivered([A(both), R(reply), A('Okay, thanks!'), R(SAID)]);
    // Ferni asked something else before they answered.
    delivered([A(ASK), A('Oh, and are you free Saturday?'), R('No.'), A('Okay!'), R(SAID)]);
  });

  it('a no to "do you mind" is a yes', () => {
    delivered([A("I'll pass along what you say to Riley Test, do you mind, is that okay?"), R('No.'), A('Great!'), R(SAID)]); // prettier-ignore
  });

  it('a lone no followed by more words before Ferni speaks is one answer, not a no', () => {
    delivered([A(ASK), R('No,'), R("that's cool."), A('Great!'), R(SAID)]);
    delivered([A(ASK), R('No -'), R('go ahead, tell him.'), A('Great!'), R(SAID)]);
    delivered([A(ASK), R('Nope...'), R("that's fine."), A('Great!'), R(SAID)]);
    // One secret as the first reply is not a refusal of all of it, whatever follows.
    delivered([A(ASK), R("Don't tell her about the surprise, but yes, go ahead."), R('Sorry.'), A('Great!'), R(SAID)]); // prettier-ignore
  });

  it.each([
    ['business', businessScript],
    ['restaurant', restaurantScript],
    ['healthcare', healthcareScript],
  ] as const)('%s calls tell, never ask: even a bare no to an improvised ask delivers', (_, t) => {
    const c = dispatch(t);
    expect(c.script).not.toMatch(/is that okay\?/i);
    for (const reply of [...BOOKING_REPLIES, 'No.'])
      delivered([A(ASK), R(reply), A('Okay, thanks!'), R(SAID)], c);
  });

  it('a call with no script (a retry) never declines', () => {
    delivered(turns('No.'), { ...call, script: undefined });
  });
});

describe('a bare "no" is captured', () => {
  it.each([
    ['No', true],
    ['no', true],
    ['ok', false],
  ])('%j is kept as their reply: %s', async (reply, kept) => {
    const { setOutboundCallContext } =
      await import('../../../intelligence/context-builders/external/outbound-call-context.js');
    const capture = await import('../../../agents/integrations/on-behalf-transcript-capture.js');
    const transcripts = await import('../call-transcript-intelligence.js');
    const sessionId = `s-short-${reply}`;
    setOutboundCallContext(sessionId, { callId: `c-short-${reply}` } as never);
    transcripts.initializeTranscriptCapture(`c-short-${reply}`, 'Priya', 'friend');
    capture.initializeOnBehalfCapture(sessionId);
    capture.captureAgentTurn(sessionId, ASK);
    capture.captureRecipientTurn(sessionId, reply);
    capture.captureAgentTurn(sessionId, 'Okay!');
    capture.captureRecipientTurn(sessionId, SAID);
    const captured = transcripts.getActiveTranscript(`c-short-${reply}`)?.turns ?? [];
    expect(captured.map((t) => t.content)).toEqual(
      kept ? [ASK, reply, 'Okay!', SAID] : [ASK, 'Okay!', SAID]
    );
    expect(passAlongDeclined(PERSONAL, captured)).toBe(kept);
    capture.cleanupOnBehalfCapture(sessionId);
    transcripts.finalizeTranscript(`c-short-${reply}`, 9);
  });
});
