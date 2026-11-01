/**
 * The person Ferni called said no to "I'll pass along what you tell me to
 * Riley Test. Is that okay?". Ferni still gives them the member's message (the
 * script says so); the stored result keeps only that they said no, and the
 * member is told just that. Real buildCallOutcome; fictional people and words.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { buildCallOutcome } =
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
});

describe('they said yes', () => {
  it.each(["Sure, that's fine.", 'No problem!', 'No worries at all', 'Of course'])(
    '%j: the model summary is kept as before',
    (answer) => {
      expect(passAlongDeclined(turns(answer))).toBe(false);
      const o = buildCallOutcome(call, turns(answer), analysis(), undefined, 90);
      expect(o.outcome).not.toBe(NO_LINE);
      expect(o.transcriptSummary).toContain('marmalade');
    }
  );

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
