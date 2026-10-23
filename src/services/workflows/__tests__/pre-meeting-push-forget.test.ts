/**
 * FORGET_EVERY_READER and the pre-meeting push: "Meeting with Dana in 10 min.
 * Last time: <topic>" never names a topic the caller asked Ferni to forget,
 * and the commitments and agenda items the push carries leave it out too.
 * The real sender (calendar-trigger-worker.ts); the briefing, the push
 * service and the forget list are stubs at their edges.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushed = vi.hoisted(() => ({ sent: [] as Array<{ body: string; data: unknown }> }));
vi.mock('../../calendar/meeting-memory-service.js', () => ({
  enrichPreMeetingBriefing: async () => ({
    relationshipContext: [{ displayName: 'Dana', attendeeEmail: 'dana@example.com' }],
    pastTopics: ['the divorce papers', 'the budget review'],
    openCommitments: ['send Dana the divorce papers', 'share the Q3 numbers'],
    suggestedAgendaItems: ['Follow up: send Dana the divorce papers', 'Catch up on the budget'],
  }),
}));
vi.mock('../../push-notifications.js', () => ({
  getPushNotificationsService: () => ({
    sendNotification: async (_u: string, n: { body: string; data: unknown }) => {
      pushed.sent.push(n);
      return true;
    },
  }),
}));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => ['divorce papers'],
}));

const { sendPreMeetingPushNotification } = await import('../calendar-trigger-worker.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');

let seq = 0;
const event = () => ({ id: `ev-${++seq}`, title: 'Sync', startTime: new Date(), attendees: [] });

beforeEach(() => {
  pushed.sent = [];
  resetForgetTopicsSource();
});
afterEach(() => vi.unstubAllEnvs());

describe('the pre-meeting push and a forgotten topic', () => {
  it('on: never "Last time: <it>"; the next past topic, commitment and agenda item instead', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    await sendPreMeetingPushNotification('member-push-forget', event() as never, 10);
    expect(pushed.sent).toHaveLength(1);
    const [push] = pushed.sent;
    expect(push.body).toBe('Meeting with Dana in 10 min. Last time: the budget review');
    expect(JSON.stringify(push.data)).not.toMatch(/divorce/i);
    expect(JSON.stringify(push.data)).toContain('share the Q3 numbers');
  });

  it('off: the briefing as it was', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    await sendPreMeetingPushNotification('member-push-forget', event() as never, 10);
    expect(pushed.sent[0].body).toBe('Meeting with Dana in 10 min. Last time: the divorce papers');
  });
});
