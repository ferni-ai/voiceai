/**
 * The person Ferni called said no to "I'll pass along what you tell me to
 * Riley Test. Is that okay?". Ferni still gives them the member's message (the
 * script says so); the stored result keeps only that they said no, and the
 * member is told just that. Real buildCallOutcome; fictional people and words.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { buildCallOutcome, completeOnBehalfCall } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { callResultText } = await import('../call-result-text.js');
const { crisisCallerLine } = await import('../caller-text.js');
const { passAlongDeclined } = await import('../pass-along-declined.js');
type Analysis = import('../call-transcript-intelligence.js').SuperhumanCallResult;
type Turn = import('../call-transcript-intelligence.js').CallTranscriptTurn;

const call = buildOnBehalfDispatch({
  callId: 'c-pass',
  requester: { userId: 'u-riley', name: 'Riley Test', timezone: 'UTC', originalSessionId: 's-1' },
  contact: { name: 'Priya', phone: '+15555550123', relationship: 'friend' },
  purpose: 'tell her the picnic is on Saturday',
  objective: 'deliver_message',
  callType: 'personal',
});

const ASK =
  "Hi Priya! Just so you know, I'll pass along what you tell me to Riley Test. Is that okay?";
const SAID = 'The marmalade festival moved to the old lighthouse.';
const turns = (answer: string): Turn[] => [
  { role: 'agent', content: ASK },
  { role: 'recipient', content: answer },
  { role: 'agent', content: 'Riley wanted you to know the picnic is on Saturday.' },
  { role: 'recipient', content: SAID },
  { role: 'recipient', content: 'Thanks for letting me know, bye now.' },
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

describe('they said no to passing it along', () => {
  it.each(["No, I'd rather you didn't.", 'Um, no.', 'Please don’t.', 'Nope', "I'd prefer you not"])(
    '%j: only that they said no is kept, and the member is told',
    (answer) => {
      const o = buildCallOutcome(call, turns(answer), analysis(), undefined, 90);
      expect(o.outcome).toBe(NO_LINE);
      expect(o.transcriptSummary).toBeUndefined();
      expect(o.message).toBeUndefined();
      expect(o.actionItems).toBeUndefined();
      expect(JSON.stringify(o)).not.toMatch(/marmalade|lighthouse/i);
      expect(callResultText('Priya', o)).toBe(`It's Ferni. ${NO_LINE}`);
    }
  );

  it('a crisis said after the no still reaches the member, in Ferni’s words', () => {
    const t = turns('No.');
    t.push({ role: 'recipient', content: 'Honestly I want to die some days.' });
    const o = buildCallOutcome(call, t, analysis(), undefined, 90);
    expect(o.outcome).toBe(`${NO_LINE} ${crisisCallerLine('Priya')}`);
    expect(o.outcome).not.toMatch(/want to die/i);
  });

  it('a no and then a quick hang-up keeps only the no (decided before every other branch)', () => {
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'on');
    const quick: Turn[] = [
      { role: 'agent', content: ASK },
      { role: 'recipient', content: 'No.' },
    ];
    quick.push({ role: 'recipient', content: SAID });
    for (const a of [analysis(), null]) {
      const o = buildCallOutcome(call, quick, a, undefined, 9);
      expect(o.outcome).toBe(NO_LINE);
      expect(JSON.stringify(o)).not.toMatch(/marmalade|lighthouse/i);
    }
    quick.push({ role: 'recipient', content: "And don't call me again." });
    expect(buildCallOutcome(call, quick, null, undefined, 9).outcome).toBe(
      "I reached Priya. They asked me not to pass anything along from the call, and not to call them again, so I won't. That's all I can share."
    );
    vi.unstubAllEnvs();
  });

  it.each([
    'Actually, don’t tell him about the festival.',
    "Please don't pass that on.",
    'Keep this between us, okay?',
    "That's off the record.",
    "I'd rather you didn't share that.",
  ])('taking it back later, %j, is a no too', (withdrawn) => {
    const t = [...turns('Sure, go ahead.'), { role: 'recipient' as const, content: withdrawn }];
    expect(passAlongDeclined(t)).toBe(true);
    expect(buildCallOutcome(call, t, analysis(), undefined, 90).outcome).toBe(NO_LINE);
  });

  it('their words never reach the summary model, and the crisis read still runs', async () => {
    // The crisis is said mid-call, not last.
    const t = [...turns('No.'), { role: 'recipient' as const, content: 'I want to die.' }];
    t.push({ role: 'recipient', content: 'Anyway, talk soon.' });
    const analyze = vi.fn(async () => analysis());
    const report = vi.fn(async () => undefined);
    const ports = { readDisposition: () => undefined, readTranscript: () => t, analyze, report };
    const o = await completeOnBehalfCall('s-pass', call, 90, true, ports);
    expect(analyze).not.toHaveBeenCalled();
    expect(o?.outcome).toBe(`${NO_LINE} ${crisisCallerLine('Priya')}`);
    expect(report).toHaveBeenCalledWith('c-pass', o, expect.anything());
  });
});

describe('they said yes', () => {
  it.each([
    "Sure, that's fine.",
    'No problem!',
    'No worries at all',
    'no worries, sure',
    'Of course',
    'Don’t worry about it.',
    "Don't worry, I trust you.",
  ])('%j: the model summary is kept as before', (answer) => {
    expect(passAlongDeclined(turns(answer))).toBe(false);
    const o = buildCallOutcome(call, turns(answer), analysis(), undefined, 90);
    expect(o.outcome).not.toBe(NO_LINE);
    expect(o.transcriptSummary).toContain('marmalade');
  });

  it('a no to some other question is not a no to passing it along', () => {
    const t: Turn[] = [
      { role: 'agent', content: 'Hi Priya, is this a bad time?' },
      { role: 'recipient', content: 'No, go ahead.' },
      { role: 'recipient', content: SAID },
    ];
    expect(passAlongDeclined(t)).toBe(false);
    const message: Turn[] = [
      { role: 'agent', content: 'Riley asked me to pass along a message. Are you free Saturday?' },
      { role: 'recipient', content: "No, I'm not, sorry." },
    ];
    expect(passAlongDeclined(message)).toBe(false);
  });
});

describe('the fictional reply set (fixtures/pass-along-replies.tsv)', () => {
  const rows = readFileSync(new URL('fixtures/pass-along-replies.tsv', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t') as ['YES' | 'NO', string]);
  const declined = (reply: string) => passAlongDeclined(turns(reply));

  it('reads all 44 replies', () => expect(rows).toHaveLength(44));

  it('no yes reads as a no (false declines: 0 of 22)', () => {
    expect(rows.filter(([l, r]) => l === 'YES' && declined(r))).toEqual([]);
  });

  it('every no reads as a no (missed declines: 0 of 22)', () => {
    expect(rows.filter(([l, r]) => l === 'NO' && !declined(r))).toEqual([]);
  });

  it.each(["Don't mention it!", "Don't tell anyone I said this, but he's the best."])(
    'later in a yes call, %j is not taking it back',
    (later) => {
      const t = [...turns('Sure.'), { role: 'recipient' as const, content: later }];
      expect(passAlongDeclined(t)).toBe(false);
    }
  );
});

describe('a bare "no" is captured', () => {
  it.each(['No', 'no', 'ok'])('%j is kept as their reply, so a no still counts', async (reply) => {
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
    capture.captureRecipientTurn(sessionId, SAID);
    const captured = transcripts.getActiveTranscript(`c-short-${reply}`)?.turns ?? [];
    expect(captured.map((t) => t.content)).toEqual([ASK, reply, SAID]);
    expect(passAlongDeclined(captured)).toBe(reply !== 'ok');
    capture.cleanupOnBehalfCapture(sessionId);
    transcripts.finalizeTranscript(`c-short-${reply}`, 9);
  });
});
