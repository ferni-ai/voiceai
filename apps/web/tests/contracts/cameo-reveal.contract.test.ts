/**
 * Ferni's introduction of a teammate reaches the app: agent → web.
 *
 * The voice agent's REAL forwarder (src/agents/voice-agent/cameo-reveal.ts) turns the
 * introduceMember tool's reveal into a data message; it's JSON round-tripped as LiveKit
 * delivers it and handed to the web's REAL data-message handler, which adds the
 * teammate and announces `ferni:team-member-unlocked`. Before, nothing forwarded the
 * reveal, so this never happened.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { forwardCameoReveals } from '../../../../src/agents/voice-agent/cameo-reveal.js';
import { cameoUnlockEvents } from '../../../../src/tools/handoff/state.js';

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import type { DataMessage } from '../../src/types/events.js';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

describe("Ferni's introduction of a teammate", () => {
  it('shows in the app of the call it happened in', async () => {
    const delivered: DataMessage[] = [];
    const room = {
      localParticipant: {
        publishData: async (bytes: Uint8Array) =>
          void delivered.push(JSON.parse(new TextDecoder().decode(bytes)) as DataMessage),
      },
    };
    cleanups.push(forwardCameoReveals(room, 'call-1'));

    const joined: string[] = [];
    const onJoined = (e: Event) =>
      joined.push((e as CustomEvent<{ memberId: string }>).detail.memberId);
    window.addEventListener('ferni:team-member-unlocked', onJoined);
    cleanups.push(() => window.removeEventListener('ferni:team-member-unlocked', onJoined));

    cameoUnlockEvents.emit('memberUnlocked', {
      memberId: 'maya-santos',
      displayName: 'Maya Santos',
      role: 'Habits & Routines',
      spokenIntro: "I'd love you to meet Maya.",
      sessionId: 'call-1',
    });
    await Promise.resolve();

    expect(delivered).toHaveLength(1);
    delivered.forEach((message) => handleDataMessage(message));
    expect(joined).toEqual(['maya-santos']);
  });
});
