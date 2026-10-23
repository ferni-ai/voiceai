/**
 * FORGET_EVERY_READER and the insight-action job: a push or text built from
 * an insight about a topic the caller asked Ferni to forget ("Remember when
 * you talked about <the forgotten dream>?") goes out as the plain check-in
 * instead. The real executeAction; the outreach orchestrator and the forget
 * list are stubs at their edges.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({ messages: [] as string[] }));
vi.mock('../../outreach/outreach-orchestrator.js', () => ({
  getOutreachOrchestrator: () => ({
    sendPushNotification: async (_u: string, message: string) => {
      sent.messages.push(message);
      return { id: 'n1' };
    },
    sendSMS: async (_u: string, message: string) => {
      sent.messages.push(message);
      return { id: 's1' };
    },
  }),
}));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => ['bakery'],
}));

const { executeAction } = await import('../insight-action-bridge.js');
const { PLAIN_CHECK_IN } = await import('../insight-messages.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');

const rule = (channel: 'push' | 'sms') =>
  ({
    id: `dream-${channel}`,
    name: 'Dream revival',
    description: '',
    insightType: 'dream_keeper',
    condition: () => true,
    action: { type: 'outreach', template: 'dream_revival', channel },
    cooldownHours: 24,
    enabled: true,
  }) as never;
const insight = (dream: string) =>
  ({
    id: 'i1',
    userId: 'member-insight-forget',
    capability: 'dream_keeper',
    timestamp: new Date().toISOString(),
    data: { dreamDescription: dream },
  }) as never;

beforeEach(() => {
  sent.messages = [];
  resetForgetTopicsSource();
});
afterEach(() => vi.unstubAllEnvs());

describe('insight-driven check-ins and a forgotten topic', () => {
  it('on: a message about it goes out as the plain check-in, by push or text', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    await executeAction('member-insight-forget', rule('push'), insight('opening a bakery'));
    await executeAction('member-insight-forget', rule('sms'), insight('opening a bakery'));
    expect(sent.messages).toEqual([PLAIN_CHECK_IN, PLAIN_CHECK_IN]);
  });

  it('on: a notification action about it is the plain check-in too', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    const notify = {
      ...(rule('push') as object),
      action: { type: 'notification', template: 'dream_revival' },
    };
    await executeAction('member-insight-forget', notify as never, insight('opening a bakery'));
    expect(sent.messages).toEqual([PLAIN_CHECK_IN]);
  });

  it('on: a message about something else is unchanged', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    await executeAction('member-insight-forget', rule('push'), insight('learning the cello'));
    expect(sent.messages[0]).toContain('learning the cello');
  });

  it('off: as before', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    await executeAction('member-insight-forget', rule('push'), insight('opening a bakery'));
    expect(sent.messages[0]).toContain('opening a bakery');
  });
});
