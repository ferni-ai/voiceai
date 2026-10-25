/**
 * CRISIS_EVENT_RECORD: a call whose reply the crisis script replaces gets one
 * crisis_events record with no words, through the real gate (gatedReply), the real
 * hook (signalCrisisDecision) and the real writer (recordCrisisEvent). Only the
 * Firestore handle is faked, so the stored document is the one production writes.
 * No alert: nothing reaches Slack.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

const added = vi.hoisted(() => [] as Array<{ collection: string; doc: Record<string, unknown> }>);
const addFails = vi.hoisted(() => ({ on: false }));
vi.mock('../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => ({
    collection: (collection: string) => ({
      add: vi.fn(async (doc: Record<string, unknown>) => {
        if (addFails.on)
          throw Object.assign(new Error('crisis_events/x: unavailable'), { code: 'unavailable' });
        added.push({ collection, doc });
        return { id: `e${added.length}` };
      }),
    }),
  }),
}));
const slack = vi.hoisted(() => vi.fn());
vi.mock('../../../services/integrations/slack-notifications.js', () => ({
  getSlackNotifications: () => ({ notify: slack }),
  notifyDDoSAlert: slack,
}));

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { CRISIS_EVENT_RETENTION_MS, recordCrisisEvent } from '../../../services/safety/index.js';
import { heldAfter, resetMinorCare } from '../../../utils/minor-care.js';
import { gatedReply } from '../../personas/crisis-gate.js';
import { resetCrisisEventRecords } from '../crisis-event-record.js';
import { signalCrisisDecision } from '../crisis-gate-signal.js';

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const SAID = 'I want to kill myself tonight';
const FIELDS = [
  'createdAt',
  'crisisType',
  'expireAt',
  'personaId',
  'reader',
  'resourcesProvided',
  'sessionId',
  'severity',
  'userId',
];

let n = 0;
const call = (userId = 'synthetic-user-1', personaId: unknown = 'ferni') => ({
  userData: { userId, personaId, services: { sessionId: `session-test-${++n}` } },
});

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}
const model = vi.fn(
  async () =>
    new ReadableStream<unknown>({
      start(c) {
        c.enqueue('ok');
        c.close();
      },
    })
);
const opener = { wrap: (s: ReadableStream<unknown>) => s };

async function speak(
  session: object,
  text = SAID,
  env: Record<string, string> = PATTERNS_ONLY,
  generate?: CrisisGenerateFn
): Promise<string> {
  const out = await gatedReply(request(text), session as never, model as never, opener as never, {
    env,
    generate,
  });
  let said = '';
  for await (const chunk of out as unknown as AsyncIterable<unknown>) said += String(chunk);
  return said;
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  await vi.dynamicImportSettled();
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

beforeEach(() => {
  added.length = 0;
  addFails.on = false;
  slack.mockReset();
  resetCrisisEventRecords();
  resetCrisisClassifierCache();
  resetMinorCare();
  vi.stubEnv('CRISIS_EVENT_RECORD', 'on');
  vi.stubEnv('MINOR_CARE', 'off');
});
afterEach(() => vi.unstubAllEnvs());

describe('CRISIS_EVENT_RECORD on', () => {
  it('a crisis call gives exactly one record, with no words and no alert', async () => {
    const session = call();
    const said = await speak(session);
    await speak(session, 'I mean it, I want to die');
    await speak(session);
    await settle();
    expect(said).toContain('988');
    expect(added).toHaveLength(1);
    const { collection, doc } = added[0]!;
    expect(collection).toBe('crisis_events');
    expect(Object.keys(doc).sort()).toEqual(FIELDS);
    expect(doc).toMatchObject({
      userId: 'synthetic-user-1',
      sessionId: session.userData.services.sessionId,
      personaId: 'ferni',
      crisisType: 'suicidal_ideation',
      severity: 'high',
      reader: 'pattern',
      resourcesProvided: true,
    });
    const text = JSON.stringify(doc).toLowerCase();
    for (const word of ['kill', 'myself', 'tonight', 'die', '988'])
      expect(text).not.toContain(word);
    expect(slack).not.toHaveBeenCalled();
  });

  it.each([
    ['I want to hurt myself', 'self_harm', 'high'],
    ['I took the whole bottle of pills', 'suicidal_ideation', 'critical'],
  ])('types the record from the read, never the words: %s', async (line, crisisType, severity) => {
    await speak(call(), line);
    await settle();
    expect(added).toHaveLength(1);
    expect(added[0]!.doc).toMatchObject({ crisisType, severity });
  });

  it('keeps it 90 days: expireAt is createdAt plus the retention', async () => {
    await speak(call());
    await settle();
    const { createdAt, expireAt } = added[0]!.doc as { createdAt: Date; expireAt: Date };
    expect(expireAt).toBeInstanceOf(Date);
    expect(expireAt.getTime() - createdAt.getTime()).toBe(CRISIS_EVENT_RETENTION_MS);
    expect(CRISIS_EVENT_RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('records the classifier as the reader when it escalates to the script', async () => {
    const session = call();
    const said = await speak(
      session,
      'im parked on the bridge, engine off, just sitting here deciding',
      LIVE,
      async () => '{"risk":"imminent","subject":"self"}'
    );
    await settle();
    expect(said).toContain('911');
    expect(added).toHaveLength(1);
    expect(added[0]!.doc).toMatchObject({ reader: 'classifier', severity: 'critical' });
  });

  it('never for guidance or a pass, only the script', async () => {
    const session = call();
    await speak(session, 'what should I cook tonight?');
    signalCrisisDecision(session, 'guide', { reader: 'pattern' });
    await settle();
    expect(added).toHaveLength(0);
  });

  it('is never awaited: the write starts after the gate returns', async () => {
    const session = call();
    signalCrisisDecision(session, 'replace', { reader: 'pattern' });
    expect(added).toHaveLength(0);
    await settle();
    expect(added).toHaveLength(1);
    expect(added[0]!.doc).toMatchObject({ crisisType: 'suicidal_ideation', severity: 'high' });
  });

  it('a persona id that is not an id is recorded as other', async () => {
    signalCrisisDecision(call('synthetic-user-1', 'My Buddy Sam!'), 'replace', {
      reader: 'pattern',
    });
    await settle();
    expect(added[0]!.doc.personaId).toBe('other');
  });

  it('not for a caller with no member id: nobody could delete or export it', async () => {
    for (const id of ['anonymous', 'anon:abc', 'onbehalf:call-1']) {
      signalCrisisDecision(call(id), 'replace', { reader: 'pattern' });
    }
    await settle();
    expect(added).toHaveLength(0);
  });

  it('not for a MINOR_CARE-held caller; the script is still spoken', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const session = call();
    heldAfter(session.userData.services.sessionId, "I'm 15 years old", {
      userId: 'synthetic-user-1',
    });
    const said = await speak(session);
    await settle();
    expect(said).toContain('988');
    expect(added).toHaveLength(0);
  });

  it('a failed write is logged and never thrown', async () => {
    addFails.on = true;
    await expect(
      recordCrisisEvent({
        userId: 'synthetic-user-1',
        crisisType: 'self_harm',
        severity: 'high',
        reader: 'pattern',
        resourcesProvided: true,
      })
    ).resolves.toBeUndefined();
  });

  it('stores only the named fields, whatever a caller passes', async () => {
    await recordCrisisEvent({
      userId: 'synthetic-user-1',
      crisisType: 'self_harm',
      severity: 'high',
      reader: 'pattern',
      resourcesProvided: true,
      quote: 'I cut myself',
    } as never);
    expect(Object.keys(added[0]!.doc)).not.toContain('quote');
  });
});

describe('CRISIS_EVENT_RECORD shadow and off', () => {
  it('shadow writes nothing', async () => {
    vi.stubEnv('CRISIS_EVENT_RECORD', 'shadow');
    await speak(call());
    await settle();
    expect(added).toHaveLength(0);
  });

  it('off (the default) is main: the same script, nothing written', async () => {
    vi.stubEnv('CRISIS_EVENT_RECORD', '');
    const session = call();
    const said = await speak(session);
    await settle();
    expect(said).toContain('988');
    expect(added).toHaveLength(0);
  });
});
