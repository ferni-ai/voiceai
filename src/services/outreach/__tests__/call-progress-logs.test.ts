/**
 * CALL_LIVE_RELAY logs, through the REAL safe-logger: the call id, the kind and
 * booleans, never the contact's name or number (#3340's rule for on-behalf calls).
 * Every path that logs runs here: noted, told, dropped on crisis, a failed write
 * and a failed speaker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The global test setup mocks safe-logger; this test needs the real one.
vi.unmock('../../../utils/safe-logger.js');

const NAME = 'Priya Maplewood';
const PHONE = '+15555550142';
const UID = 'uid-riley-test';

const store = vi.hoisted(() => ({ failWrite: false, docs: new Map<string, unknown>() }));
vi.mock('../../superhuman/firestore-utils.js', () => {
  const ref = (path: string): Record<string, unknown> => ({
    path,
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    set: async (data: unknown) => {
      if (store.failWrite) throw new Error(`write refused for ${path}`);
      store.docs.set(path, data);
    },
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<boolean>) =>
      fn({ get: async () => ({ exists: false, data: () => undefined }), update: () => undefined }),
  };
  return { getFirestoreDb: () => db };
});

const { noteCallProgress, relayProgress } = await import('../call-progress.js');
const { setOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');
const { registerVoiceCallbackHandler } =
  await import('../../../tools/domains/simple-utilities/voice-callbacks.js');
const { noteCrisisRisk, resetCrisisCallRisk } = await import('../../safety/crisis-call-risk.js');

function placed(callId: string): string {
  const jobSession = `onbehalf:${callId}`;
  setOutboundCallContext(jobSession, {
    callId,
    recipientName: NAME,
    recipientPhone: PHONE,
    purpose: `call ${NAME} at ${PHONE}`,
    callType: 'personal',
    objective: 'check_in',
    script: '',
    complianceScript: '',
    mustConfirm: [],
    mustNotDo: [],
    informationToGather: [],
    userName: 'Riley Test',
    originalSessionId: 'sess-owner-logs',
    requesterUserId: UID,
    kind: 'on_behalf',
  });
  return jobSession;
}

const watched = (callId: string, sessionId: string) => ({
  session: { id: sessionId },
  sessionId,
  userId: UID,
  callId,
  contactName: NAME,
});
const noted = { progress: { answeredAt: 'now', voicemailAt: 'now' } };

describe('call progress logs never carry the contact', () => {
  let written: string[];
  beforeEach(() => {
    process.env.CALL_RESULT_LIVE_REPORT = 'on';
    process.env.CALL_LIVE_RELAY = 'on';
    store.failWrite = false;
    written = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetCrisisCallRisk();
    delete process.env.CALL_RESULT_LIVE_REPORT;
    delete process.env.CALL_LIVE_RELAY;
  });

  it('noted, told, dropped, failed: call id and kind only', async () => {
    // Noted, then a refused write.
    await noteCallProgress(placed('c-log-1'), 'answered');
    store.failWrite = true;
    await noteCallProgress(placed('c-log-2'), 'voicemail');

    // Told, through a speaker that says it, then one that throws.
    const told = watched('c-log-3', 'sess-told');
    const heard = vi.fn(async () => undefined);
    const release = registerVoiceCallbackHandler(UID, heard, told.session);
    await relayProgress(told, noted);
    await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(2));
    release();
    const broken = watched('c-log-4', 'sess-broken');
    const releaseBroken = registerVoiceCallbackHandler(
      UID,
      async () => {
        throw new Error('speaker failed');
      },
      broken.session
    );
    await relayProgress(broken, noted);
    // Dropped on crisis risk.
    noteCrisisRisk('sess-crisis');
    await relayProgress(watched('c-log-5', 'sess-crisis'), noted);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    releaseBroken();

    const lines = written.join('');
    // Non-vacuous: every path above really logged through the real logger.
    for (const msg of [
      'CALL_PROGRESS noted',
      'CALL_PROGRESS not noted',
      'CALL_PROGRESS not told',
      'CALL_PROGRESS dropped',
    ]) {
      expect(lines, msg).toContain(msg);
    }
    expect(lines).toMatch(/"handed":true/);
    for (const secret of ['Priya', 'Maplewood', '5555550142', '555-0142']) {
      expect(lines, secret).not.toContain(secret);
    }
  });
});
