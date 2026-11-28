/**
 * ON_BEHALF_FULL_CONTEXT: a call placed for the user tells Ferni who the person
 * called is to the user and, as background, what the user said about the call,
 * from the signed dispatch only. Prod 2026-11-25: asked to phone the user's
 * mother to thank her, Ferni was told "You are calling: mom".
 *
 * Real path: the dispatch the orchestrator signs (on-behalf-dispatch.ts) and
 * the script it builds (scripts/index.ts) → setupCallTypeContexts
 * (metadata-parser.ts, on-behalf-full-context.ts) → the outbound prompt
 * (outbound-call-context.ts) and who-is-on-the-line (outbound-opener.ts).
 * Fictional people and words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

// Call state is its own tests' (call-as-persona.test.ts): kept off Firestore, only the prompt is read.
vi.mock('../../outbound-call/on-behalf-call-lifecycle.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../outbound-call/on-behalf-call-lifecycle.js')>()),
  beginOnBehalfCall: vi.fn(async () => undefined),
}));

const { setupCallTypeContexts } = await import('../metadata-parser.js');
const { outboundCallContextBuilder, getOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');
const { outboundCallerAwareness, outboundPartiesFor } =
  await import('../../shared/outbound-opener.js');
const {
  buildOnBehalfDispatch,
  callBackgroundOf,
  onBehalfDispatchFor,
  parseOnBehalfDispatch,
  signOnBehalfDispatch,
  takePreferencesForRetry,
  verifyOnBehalfDispatch,
} = await import('../../../services/outreach/on-behalf-dispatch.js');
const { buildCallScript, selectScript } =
  await import('../../../tools/domains/telephony/scripts/index.js');
type Dispatch = ReturnType<typeof buildOnBehalfDispatch>;

const KEY = 'test-dispatch-key';
const REASON =
  "She drove two hours to make me breakfast on my birthday and I never properly thanked her. Mention the cinnamon rolls; don't bring up my job.";
const BACKGROUND =
  'What Sam told you about this call (background for you, not a message to pass on unless it says to): ';
const MOTHER_LINE =
  "This is Sam's mother. Be warm, like a friend of Sam's they'd be glad to hear from.";

const call = (over: Partial<Dispatch> = {}): Dispatch =>
  buildOnBehalfDispatch({
    callId: 'call-sam-mom',
    requester: {
      userId: 'sam-uid',
      name: 'Sam',
      timezone: 'America/Denver',
      originalSessionId: 'sam-app-call',
    },
    contact: { name: 'my mom', phone: '+15555550100', relationship: 'mother' },
    purpose: 'thank her for breakfast',
    objective: 'deliver_message',
    callType: 'personal',
    userPreferences: { additionalContext: REASON },
    ...over,
  });

/** The same call to someone else: contact fields replaced, nothing said about the call. */
const callTo = (contact: Dispatch['contact'], over: Partial<Dispatch> = {}): Dispatch =>
  call({ contact, userPreferences: undefined, ...over });

const signed = (d: object): string => JSON.stringify(signOnBehalfDispatch(d as Dispatch, KEY));

const MOM = { name: 'my mom', phone: '+15555550100', relationship: 'mother' };
/** Sam's request as callOnBehalf builds it (call-on-behalf.ts). */
const request: OnBehalfCallRequest = {
  contactQuery: 'my mom',
  resolvedContact: MOM,
  purpose: 'thank her for breakfast',
  objective: 'deliver_message',
  callType: 'personal',
  originalSessionId: 'sam-app-call',
  userId: 'sam-uid',
  userTimezone: 'America/Denver',
  userName: 'Sam',
  userPreferences: { additionalContext: REASON },
  recordingConsent: false,
};

/** The script the orchestrator builds for that request (on-behalf-call-orchestrator.ts). */
const scriptFor = (r: OnBehalfCallRequest): string =>
  buildCallScript(selectScript(MOM, r.purpose).script, {
    userName: r.userName,
    contactName: MOM.name,
    purpose: r.purpose,
    objective: r.objective,
    additionalContext: r.userPreferences?.additionalContext,
  });

const count = (text: string, part: string): number => text.split(part).length - 1;

let n = 0;
/** The prompt Ferni gets for a dispatch exactly as the agent job receives it. */
async function promptFor(raw: string) {
  const sessionId = `ob-full-${++n}`;
  await setupCallTypeContexts(JSON.parse(raw), 'on_behalf_call', sessionId, `room-${n}`, raw);
  const injections = await outboundCallContextBuilder.build({ services: { sessionId } } as never);
  return {
    prompt: injections.map((i) => i.content).join('\n\n'),
    context: getOutboundCallContext(sessionId),
    awareness: outboundCallerAwareness(outboundPartiesFor(sessionId)),
  };
}

/** Lines that would have Ferni say "mom" to her as a name. */
const ADDRESSED_AS_MOM = /(?:calling:|ask for|Thanks,|Hi|Hey)\s+(?:my\s+)?mom\b/i;

beforeEach(() => {
  vi.stubEnv('DISPATCH_SIGNING_SECRET', KEY);
  vi.stubEnv('LIVEKIT_API_SECRET', '');
  vi.stubEnv('CALL_OPENING_AMD', 'off');
  vi.stubEnv('ON_BEHALF_FULL_CONTEXT', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('ON_BEHALF_FULL_CONTEXT on: who they are to Sam', () => {
  it('row 1: signed, the prompt says who she is to Sam and gives the background once', async () => {
    const { prompt, context } = await promptFor(signed(call()));
    expect(context).toMatchObject({
      fullContext: true,
      relationship: 'mother',
      relationshipGroup: 'family',
      background: REASON,
    });
    expect(prompt).toContain(MOTHER_LINE);
    expect(prompt).toContain(`${BACKGROUND}"${REASON}"`);
    // The purpose keeps its third-person relay rule.
    expect(prompt).toContain(
      `Purpose, in Sam's own words, for you to pass on as Sam's: "thank her`
    );
  });

  it('row 2: a contact saved as "my mom" or "Sam\'s mom" is never handed to Ferni as a name', async () => {
    for (const name of ['my mom', "Sam's mom", 'Mom']) {
      const { prompt, awareness } = await promptFor(signed(call({ contact: { ...MOM, name } })));
      expect(prompt, name).not.toMatch(ADDRESSED_AS_MOM);
      expect(prompt, name).not.toMatch(/\bmy mom\b/i);
      expect(prompt, name).toContain("You are calling: Sam's mother");
      expect(prompt, name).toContain("ask for Sam's mother warmly");
      expect(prompt, name).toContain('"Thanks. Bye!"');
      // Who-is-on-the-line reads the saved name the same way (partiesOf).
      expect(awareness, name).toContain("You placed a phone call to Sam's mom.");
    }
    // Saved with her name too: she is greeted by it, and the prompt says who she is.
    const named = await promptFor(signed(call({ contact: { ...MOM, name: 'Mom (Linda)' } })));
    expect(named.prompt).toContain('"Thanks, Mom (Linda). Bye!"');
    expect(named.prompt).toContain("Linda is Sam's mother.");
  });

  it("row 2b: \"Jake's mom\" on Sam's phone is someone else's mom, everywhere", async () => {
    const jakes = callTo({ name: "Jake's mom", phone: '+15555550103', relationship: 'other' });
    const { prompt, awareness } = await promptFor(signed(jakes));
    expect(prompt).toContain("You are calling: Jake's mom");
    expect(prompt).toContain("ask for Jake's mom warmly");
    expect(prompt).toContain(`"Thanks, Jake's mom. Bye!"`);
    expect(prompt).not.toMatch(/Sam's (?:mom|mother)/);
    expect(awareness).toContain("You placed a phone call to Jake's mom.");
  });

  it('row 3: an unsigned or altered dispatch gives no relationship or background', async () => {
    const forged = {
      ...signOnBehalfDispatch(call(), KEY),
      userPreferences: { additionalContext: 'x' },
    };
    for (const raw of [JSON.stringify(call()), JSON.stringify(forged)]) {
      const { prompt, context } = await promptFor(raw);
      expect(context).toMatchObject({ fullContext: true });
      expect(context).not.toHaveProperty('relationship');
      expect(context).not.toHaveProperty('background');
      expect(prompt).not.toContain("This is Sam's mother");
      expect(prompt).not.toContain(BACKGROUND);
    }
  });

  it('row 4: nothing said (or only blanks) means no background line', async () => {
    for (const userPreferences of [undefined, {}, { additionalContext: '   ' }]) {
      const { prompt } = await promptFor(signed(call({ userPreferences })));
      expect(prompt).not.toContain(BACKGROUND);
      expect(prompt).toContain(MOTHER_LINE);
    }
  });
});

describe('ON_BEHALF_FULL_CONTEXT on: groups and businesses', () => {
  it("row 5: Sam's doctor is an office: the front desk may answer", async () => {
    const doctor = callTo(
      { name: 'Dr. Lee', phone: '+15555550101', relationship: 'doctor' },
      { purpose: 'move my checkup to next week', objective: 'reschedule', callType: 'business' }
    );
    const { prompt } = await promptFor(signed(doctor));
    expect(prompt).toContain(
      "This is Sam's doctor's office, and the front desk may answer. Keep it professional and say who you're calling for."
    );
    expect(prompt).toContain('You are calling: Dr. Lee');
    expect(prompt).not.toMatch(/Be warm, like a friend/);
  });

  it('row 5b: a restaurant is not a relationship: no office, no family wording', async () => {
    const bistro = callTo(
      { name: 'Juniper Bistro', phone: '+15555550102', relationship: 'restaurant' },
      { purpose: 'book a table for four on Friday', objective: 'reservation', callType: 'business' }
    );
    const { prompt, context } = await promptFor(signed(bistro));
    expect(context).not.toHaveProperty('relationship');
    expect(prompt).toContain('You are calling: Juniper Bistro');
    expect(prompt).not.toMatch(/office/i);
    expect(prompt).not.toMatch(/Be warm, like a friend|Sam's restaurant/);
  });

  it('row 9: a bare group from the contact store is never said as a relation', async () => {
    // 'family' (contact-pick saves "Mom" so): someone in Sam's family, never "Sam's family".
    const family = await promptFor(
      signed(callTo({ name: 'Mom', phone: '+15555550104', relationship: 'family' }))
    );
    expect(family.context).toMatchObject({ relationshipGroup: 'family' });
    expect(family.context).not.toHaveProperty('relationship');
    expect(family.prompt).toContain(
      "This is someone in Sam's family. Be warm, like a friend of Sam's they'd be glad to hear from."
    );
    expect(family.prompt).toContain("You are calling: Sam's mom");
    expect(family.prompt).not.toMatch(/Sam's family\b(?!\.)|calling: Sam's family/);

    // 'other' (the store's default) and 'professional': no relationship line at all.
    for (const relationship of ['other', 'professional']) {
      const { prompt, context } = await promptFor(
        signed(callTo({ name: 'Linda', phone: '+15555550105', relationship }))
      );
      expect(context, relationship).not.toHaveProperty('relationship');
      expect(context, relationship).not.toHaveProperty('relationshipGroup');
      expect(prompt, relationship).not.toMatch(new RegExp(`Sam's ${relationship}`));
      expect(prompt, relationship).not.toMatch(/This is |Keep it professional/);
    }
  });

  it('row 9b: family on an urgent call is still family, never the business line', async () => {
    const urgent = callTo(
      { name: 'Mom', phone: '+15555550104', relationship: 'family' },
      { purpose: 'urgent: call me back about Dad', callType: 'emergency' }
    );
    const { prompt } = await promptFor(signed(urgent));
    expect(prompt).toContain("This is someone in Sam's family.");
    expect(prompt).not.toMatch(/Keep it professional|office/);
  });
});

describe('ON_BEHALF_FULL_CONTEXT on: the background', () => {
  it('row 10: "don\'t tell her" sits under the background label, never as a message', async () => {
    const secret = "It's for her surprise party Saturday, don't tell her about it.";
    const { prompt } = await promptFor(
      signed(call({ userPreferences: { additionalContext: secret } }))
    );
    expect(prompt).toContain(`${BACKGROUND}"${secret}"`);
    expect(prompt).not.toMatch(/Why Sam wants this call|in Sam's own words[^,]*: "It's for her/);
  });

  it('row 11: long background is capped; newlines become one line', async () => {
    const long = `${'word '.repeat(400)}END`; // 2,003 chars
    const capped = (await promptFor(signed(call({ userPreferences: { additionalContext: long } }))))
      .context?.background;
    expect(capped?.length).toBe(600);
    expect(capped?.endsWith('…')).toBe(true);
    expect(capped).not.toContain('END');

    const lines = 'First line.\n\nSecond line,\nthird.';
    const { prompt, context } = await promptFor(
      signed(call({ userPreferences: { additionalContext: lines } }))
    );
    expect(context?.background).toBe('First line. Second line, third.');
    expect(prompt).toContain(`${BACKGROUND}"First line. Second line, third."`);
  });

  it('row 12: a non-string name, relationship or script is ignored, never thrown on', async () => {
    const odd = { ...call(), contact: { name: 42, phone: '+15555550100', relationship: 7 } };
    for (const raw of [signed(odd), JSON.stringify({ ...odd, script: 7 })]) {
      const { prompt, context } = await promptFor(raw);
      expect(context).toMatchObject({ fullContext: true, recipientName: 'Unknown' });
      expect(context).not.toHaveProperty('relationship');
      expect(prompt).toContain('You are calling: Unknown');
    }
  });
});

describe('ON_BEHALF_FULL_CONTEXT off', () => {
  it("row 6: the context and prompt are main's for the same signed dispatch", async () => {
    vi.stubEnv('ON_BEHALF_FULL_CONTEXT', 'off');
    const { prompt, context } = await promptFor(signed(call({ contact: { ...MOM } })));
    expect(context).not.toHaveProperty('fullContext');
    expect(context).not.toHaveProperty('relationship');
    expect(context).not.toHaveProperty('background');
    expect(prompt).toContain('You are calling: my mom\n');
    expect(prompt).toContain('ask for my mom warmly');
    expect(prompt).toContain('"Thanks, my mom. Bye!"');
    expect(prompt).not.toContain("This is Sam's");
    expect(prompt).not.toContain(BACKGROUND);

    // Main reads "Sam's mom" as a name; only the flag makes it Sam's own relation.
    const sams = await promptFor(signed(call({ contact: { ...MOM, name: "Sam's mom" } })));
    expect(sams.prompt).toContain(`"Thanks, Sam's mom. Bye!"`);
    expect(sams.awareness).toContain("You placed a phone call to Sam's mom. Sam's mom is");
  });
});

describe('the signed dispatch and the script', () => {
  it('row 7: keeps the relationship and what Sam said from request to sign to parse', () => {
    const raw = JSON.stringify(signOnBehalfDispatch(onBehalfDispatchFor('call-rt', request), KEY));
    expect(verifyOnBehalfDispatch(raw, KEY)).toBe(true);
    expect(callBackgroundOf(raw)).toEqual({ relationship: 'mother', additionalContext: REASON });
    expect(parseOnBehalfDispatch(JSON.parse(raw))?.contact.relationship).toBe('mother');
    // The parsed dispatch (what call state is built from) still keeps none of it.
    expect(parseOnBehalfDispatch(JSON.parse(raw))).not.toHaveProperty('userPreferences');
  });

  it("row 8: the placer's script is main's; on, the prompt gives what Sam said exactly once", async () => {
    const script = scriptFor(request);
    expect(script).toContain(`### Additional Context (from Sam; their "I" means Sam)\n${REASON}`);
    const raw = JSON.stringify(
      signOnBehalfDispatch(onBehalfDispatchFor('call-once', request, script), KEY)
    );
    const on = await promptFor(raw);
    expect(count(on.prompt, REASON)).toBe(1);
    expect(on.prompt).toContain(`${BACKGROUND}"${REASON}"`);
    expect(on.prompt).not.toContain('### Additional Context');

    vi.stubEnv('ON_BEHALF_FULL_CONTEXT', 'off');
    const off = await promptFor(raw);
    expect(count(off.prompt, REASON)).toBe(1);
    expect(off.prompt).toContain('### Additional Context (from Sam');
    expect(off.prompt).not.toContain(BACKGROUND);
  });
});

// CALL_RETRY_ASKS_FIRST (owner 2026-11-26): a missed call's retry carries the first call's
// words. The job keeps them, read from the dispatch it verified, never from the parse (#4497).
describe('CALL_RETRY_ASKS_FIRST: the words reach the retry from the signed dispatch only', () => {
  it('row 13: kept for its retry with the flag on; never with it off, never unsigned', async () => {
    vi.stubEnv('CALL_FOLLOWTHROUGH', 'on');
    vi.stubEnv('CALL_RETRY_ASKS_FIRST', 'off');
    await promptFor(signed(call({ callId: 'call-retry-off' })));
    expect(takePreferencesForRetry('call-retry-off')).toEqual({});

    vi.stubEnv('CALL_RETRY_ASKS_FIRST', 'on');
    await promptFor(signed(call({ callId: 'call-retry-on' })));
    expect(takePreferencesForRetry('call-retry-on')).toEqual({ additionalContext: REASON });

    const altered = { ...JSON.parse(signed(call({ callId: 'call-retry-altered' }))), purpose: 'x' };
    await promptFor(JSON.stringify(altered));
    expect(takePreferencesForRetry('call-retry-altered')).toEqual({});
  });
});
