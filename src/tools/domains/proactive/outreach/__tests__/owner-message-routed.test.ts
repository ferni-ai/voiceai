/**
 * The semantic-router executor builds its own tool options for each routed run
 * (domain-bridge/executor.ts). The owner-message cap must still count per call,
 * keyed by the voice session id. A routed run carries no verified bit, so it is
 * always treated as unverified (fail closed), even when the voice session's
 * caller was verified: a known limitation until the router passes userData.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The registry's tools, filled below from the real scheduling domain (no import inside the mock). */
const registered = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../../../../registry/index.js', () => ({ getTool: (id: string) => registered.get(id) }));

import { executeDomainTool } from '../../../../semantic-router/domain-bridge/index.js';
import { setCallUserPort, type CallUserPort } from '../call-user-port.js';
import { definitions as schedulingDefinitions } from '../../../scheduling/index.js';
import {
  UNVERIFIED_CAP_REFUSAL,
  UNVERIFIED_FOOTER,
  UNVERIFIED_NOTHING_SENT_REFUSAL,
} from '../owner-message-policy.js';

for (const def of schedulingDefinitions) registered.set(def.id, def);

const OWNER = 'owner-uid';
const textOwner = vi.fn(async (..._a: unknown[]) => ({ sent: true }));
const port = { verifiedPhone: async () => '+15555550100', textOwner, call: vi.fn() };
/** A session id the way voice-agent-entry mints it. */
const session = (job: string) => `session-${job}-${Date.now()}`;

const routedText = (sessionId: string | undefined) =>
  executeDomainTool(
    'message_send',
    { message: 'hi', to: '+15555550199' },
    {
      userId: OWNER,
      sessionId: sessionId as string, // undefined when the voice context has none
      personaId: 'ferni',
      conversationHistory: [],
      services: null,
    }
  );
const said = () => textOwner.mock.calls.map((c) => String(c[1]));

beforeEach(() => {
  vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'on');
  setCallUserPort(port as unknown as CallUserPort);
});
afterEach(() => {
  setCallUserPort(undefined);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('routed owner messages', () => {
  it('an unverified call: two texts with the footer, the third refused', async () => {
    const id = session('AJ_unverified');
    await routedText(id);
    await routedText(id);
    const third = await routedText(id);
    expect(JSON.stringify(third)).toContain(UNVERIFIED_CAP_REFUSAL);
    expect(said()).toHaveLength(2);
    expect(said().every((s) => s.includes(`hi\n\n${UNVERIFIED_FOOTER}`))).toBe(true);
  });

  it('each call has its own count, and a routed run is never treated as verified', async () => {
    const first = session('AJ_first');
    await routedText(first);
    await routedText(first);
    await routedText(session('AJ_second'));
    expect(said()).toHaveLength(3);
    expect(said().every((s) => s.includes(UNVERIFIED_FOOTER))).toBe(true);
  });

  it('a routed run with no session id is refused (no_session), never counted afresh', async () => {
    for (let i = 0; i < 3; i++) {
      expect(JSON.stringify(await routedText(undefined))).toContain(
        UNVERIFIED_NOTHING_SENT_REFUSAL
      );
    }
    expect(said()).toHaveLength(0);
  });
});
