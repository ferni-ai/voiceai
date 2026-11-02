/**
 * The owner call notes its room with the sid LiveKit gave its job (live-call-behaviors.ts
 * jobRoom): the call result's data message is later sent only to a room with that sid
 * (services/outreach/owner-room.ts). Fictional data only.
 */
import { describe, expect, it, vi } from 'vitest';

const job = vi.hoisted(() => ({ ctx: undefined as unknown }));
vi.mock('@livekit/agents', async (actual) => ({
  ...(await actual<typeof import('@livekit/agents')>()),
  getJobContext: () => {
    if (!job.ctx) throw new Error('no job');
    return job.ctx;
  },
}));

const { jobRoom } = await import('../live-call-behaviors.js');

describe("the owner call's room", () => {
  it('its name and the sid of the job LiveKit assigned', () => {
    job.ctx = { room: { name: 'voice-1730000000000' }, job: { room: { sid: 'RM_riley_1' } } };
    expect(jobRoom()).toEqual({ name: 'voice-1730000000000', sid: 'RM_riley_1' });
  });

  it('no sid known: the name alone; no room or no job: none', () => {
    job.ctx = { room: { name: 'voice-1730000000000' }, job: {} };
    expect(jobRoom()).toEqual({ name: 'voice-1730000000000', sid: undefined });
    job.ctx = { room: { name: '' }, job: { room: { sid: 'RM_riley_1' } } };
    expect(jobRoom()).toBeUndefined();
    job.ctx = undefined;
    expect(jobRoom()).toBeUndefined();
  });
});
