/**
 * triggerWebhook fires the owner's own automations (garage, locks, lights), so
 * it waits for the owner's spoken yes to a read-back of the webhook's name,
 * like every other outbound tool (registry/outbound-gate.ts). Issue #3992.
 *
 * Drives the tool as the live agent gets it: the webhook definitions registered
 * into a ToolRegistry (register() applies the gate) and the real confirm gate.
 * Mocked only at the edge: the webhook service (store + HTTP executor).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GARAGE = {
  id: 'wh-garage',
  name: 'Garage door',
  enabled: true,
  voiceTriggers: ['garage door'],
};
const svc = vi.hoisted(() => ({
  findWebhookByTrigger: vi.fn(),
  getWebhook: vi.fn(),
  executeWebhook: vi.fn(async (..._args: unknown[]) => ({ success: true })),
}));

vi.mock('../../../../services/webhooks/index.js', () => ({
  findWebhookByTrigger: svc.findWebhookByTrigger,
  getWebhook: svc.getWebhook,
  executeWebhook: svc.executeWebhook,
  listWebhooks: vi.fn(),
  getWebhookStats: vi.fn(),
}));

import { outreachConfirmListeners } from '../../communication/outreach/outreach-confirm.js';
import { ToolRegistry } from '../../../registry/index.js';
import { noteLiveSession } from '../../../registry/live-session.js';
import type { ToolContext } from '../../../registry/types.js';
import { definitions } from '../index.js';

function liveCall(userId: string, speakerIsOwner?: () => boolean) {
  const registry = new ToolRegistry();
  for (const def of definitions) registry.register(def);
  const ctx: ToolContext = { userId, agentId: 'ferni', agentDisplayName: 'Ferni' };
  const session = { agentState: 'listening' };
  noteLiveSession(session, `call-${Math.random()}`); // the live call's id, as a call registers it
  const listeners = outreachConfirmListeners(session, speakerIsOwner);
  return {
    trigger: async (args: Record<string, unknown>, callId: string) => {
      const tool = registry.get('triggerWebhook')!.create(ctx);
      const opts = { ctx: { session, userData: { userId } }, toolCallId: callId };
      const out = await tool.execute(args, opts);
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

describe('triggerWebhook waits for the owner yes', () => {
  beforeEach(() => {
    vi.stubEnv('OUTBOUND_CONFIRM', '');
    svc.findWebhookByTrigger.mockResolvedValue(GARAGE);
    svc.getWebhook.mockResolvedValue({ success: true, data: GARAGE });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('runs nothing on the first call: it reads back the webhook by name', async () => {
    const call = liveCall('user-1', () => true);
    const out = await call.trigger({ phrase: 'garage door' }, 'c1');
    expect(out).toContain('NOT SENT YET');
    expect(out).toContain('Garage door');
    expect(svc.executeWebhook).not.toHaveBeenCalled();
  });

  it('runs exactly the webhook read back once the owner says yes', async () => {
    const call = liveCall('user-1', () => true);
    await call.trigger({ phrase: 'garage door' }, 'c1');
    call.caller('Yes, go ahead.');
    // The store changed in between: the yes still runs the webhook that was read back.
    svc.findWebhookByTrigger.mockResolvedValue({ ...GARAGE, id: 'wh-other', name: 'Other' });
    const out = await call.trigger({ phrase: 'garage door' }, 'c2');
    expect(svc.executeWebhook).toHaveBeenCalledTimes(1);
    expect(svc.executeWebhook.mock.calls[0]?.[1]).toMatchObject({ id: 'wh-garage' });
    expect(out).toContain('Garage door');
  });

  it('a no runs nothing', async () => {
    const call = liveCall('user-1', () => true);
    await call.trigger({ phrase: 'garage door' }, 'c1');
    call.caller('No, never mind.');
    await call.trigger({ phrase: 'garage door' }, 'c2');
    expect(svc.executeWebhook).not.toHaveBeenCalled();
  });

  it('is refused when the speaker is not the verified owner (guests on the line)', async () => {
    const call = liveCall('user-1', () => false);
    const out = await call.trigger({ phrase: 'garage door' }, 'c1');
    expect(out).toContain('only the account owner can confirm');
    call.caller('Yes, go ahead.');
    await call.trigger({ phrase: 'garage door' }, 'c2');
    expect(svc.executeWebhook).not.toHaveBeenCalled();
  });

  it('no matching webhook: nothing stored, nothing run', async () => {
    svc.findWebhookByTrigger.mockResolvedValue(null);
    const call = liveCall('user-1', () => true);
    const out = await call.trigger({ phrase: 'garage door' }, 'c1');
    expect(out).not.toContain('NOT SENT YET');
    expect(out).toContain('garage door');
    expect(svc.executeWebhook).not.toHaveBeenCalled();
  });
});
