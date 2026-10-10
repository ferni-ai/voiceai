/**
 * The agent job that talks on the phone for an on-behalf call registers
 * follow-through when it parses the dispatch, and the session's cleanup
 * registry runs it with the call's turns when the session ends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../../services/scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
const captureBackgroundResult = vi.fn(async () => ({}));
let turns: Array<{ role: string; content: string }> = [];

vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../../../services/data-layer/hooks/misc-hooks.js', () => ({
  onCallResultChange: vi.fn(),
  onFollowUpActionChange: vi.fn(),
}));
vi.mock('../../../services/background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult,
}));
vi.mock('../../../services/session/session-manager.js', () => ({
  getSessionServices: () => ({
    historyTracker: { getSimpleTurns: () => turns, getDurationSeconds: () => 30 },
  }),
}));

const { setupCallTypeContexts } = await import('../../voice-agent-entry/metadata-parser.js');
const { runSessionCleanup } = await import('../../session/event-cleanup-registry.js');

const metadata = {
  type: 'on_behalf_call',
  callId: 'call-1',
  requester: {
    userId: 'seth',
    name: 'Seth',
    timezone: 'America/Los_Angeles',
    originalSessionId: 's0',
  },
  contact: { name: 'Mindy', phone: '+18015550199', relationship: 'sister' },
  purpose: 'check in',
};

beforeEach(() => {
  rows = [];
  turns = [];
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.CALL_FOLLOWTHROUGH;
});

describe('call follow-through at the end of an on-behalf call session', () => {
  it('records the outcome for the requester when the session is cleaned up', async () => {
    process.env.CALL_FOLLOWTHROUGH = 'on';
    await setupCallTypeContexts({ ...metadata }, 'on_behalf_call', 'session-1', 'onbehalf-call-1');
    expect(rows).toHaveLength(0);

    await runSessionCleanup('session-1');

    const stored = rows.find((r) => r.collection === 'on_behalf_calls');
    expect(stored).toMatchObject({ id: 'call-1', userId: 'seth' });
    expect(stored?.data.outcome).toMatchObject({ status: 'no_answer' });
    expect(rows.some((r) => r.id === 'retry_call-1' && r.collection === 'scheduled_outreach')).toBe(
      true
    );
    expect(captureBackgroundResult).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'seth', contactName: 'Mindy' })
    );
  });

  it('does nothing with the flag off', async () => {
    await setupCallTypeContexts({ ...metadata }, 'on_behalf_call', 'session-2', 'onbehalf-call-1');
    await runSessionCleanup('session-2');
    expect(rows).toHaveLength(0);
    expect(captureBackgroundResult).not.toHaveBeenCalled();
  });
});
