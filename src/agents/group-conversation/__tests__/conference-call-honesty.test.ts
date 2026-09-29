/**
 * Without Twilio, adding a phone participant must fail rather than emit fake
 * "ringing" / "connected" events for a call that was never placed.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Room } from '@livekit/rtc-node';
import { createConferenceCallManager } from '../conference-call-manager.js';
import type { GroupConversationManager } from '../group-conversation-manager.js';

describe('ConferenceCallManager without Twilio', () => {
  it('reports failure and emits no call events', async () => {
    vi.useFakeTimers();
    const manager = createConferenceCallManager({
      room: {} as Room,
      sessionId: 's1',
      userId: 'u1',
      webhookBaseUrl: 'https://api.test',
      manager: {} as GroupConversationManager,
    });
    const events: string[] = [];
    manager.on('participant_calling', () => events.push('calling'));
    manager.on('participant_connected', () => events.push('connected'));

    const result = await manager.addParticipant({ phoneNumber: '+15551234567', name: 'Sarah' });
    await vi.advanceTimersByTimeAsync(5000);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/couldn't dial/);
    expect(events).toEqual([]);
    vi.useRealTimers();
  });
});
