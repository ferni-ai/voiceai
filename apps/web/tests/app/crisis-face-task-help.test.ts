/**
 * The crisis face hold and a task-help turn (HUMANIZE_DISTRESS_CORROBORATION).
 *
 * The agent's real emotion dispatcher sends the turn through the real data-message
 * envelope; every message it publishes goes to the web's observeCrisisSignal. A turn
 * whose only distress is a request for help with a task (the server marks it
 * distressCapped, agents/processors/task-help-distress.ts) must not start the hold.
 * The same turn without the mark (flag off, or a bare cry for help) still does.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/gsap-setup.js', async () => {
  const { gsap } = await import('gsap');
  return { gsap, default: gsap };
});

import {
  createDataMessageSender,
  type DataMessageRoom,
} from '../../../../src/agents/shared/data-message-envelope.js';
import { dispatchEmotionEvents } from '../../../../src/agents/realtime/emotion-event-dispatcher.js';

import { observeCrisisSignal } from '../../src/app/crisis-face.js';
import type { DataMessage } from '../../src/types/events.js';
import { isCrisisFaceHeld, releaseCrisisFace } from '../../src/ui/face/crisis-face-hold.js';

/** Room double: each message the agent publishes reaches the web's crisis observer. */
function roomWiredToCrisisFace(seen: DataMessage[]): DataMessageRoom {
  return {
    localParticipant: {
      identity: 'agent',
      publishData: async (data: Uint8Array) => {
        const message = JSON.parse(new TextDecoder().decode(data)) as DataMessage;
        seen.push(message);
        observeCrisisSignal(message);
      },
    },
  } as DataMessageRoom;
}

async function sendHelpTurn(distressCapped: boolean): Promise<DataMessage[]> {
  const seen: DataMessage[] = [];
  await dispatchEmotionEvents(
    {
      emotionalState: {
        primary: 'neutral',
        intensity: 0,
        distressLevel: 1, // what the detector gives a lone "help"
        trajectory: 'stable',
        ...(distressCapped ? { distressCapped } : {}),
      },
      userId: 'user-sam',
      personaId: 'ferni',
    },
    createDataMessageSender(roomWiredToCrisisFace(seen))
  );
  return seen;
}

const concernLevels = (seen: DataMessage[]): unknown[] =>
  seen.filter((m) => m['signalType'] === 'concern_detected').map((m) => m['concernLevel']);

afterEach(() => {
  releaseCrisisFace();
});

describe('task-help turn and the crisis face hold', () => {
  it('without the mark, the turn is sent as crisis and starts the hold (as main)', async () => {
    expect(isCrisisFaceHeld()).toBe(false);
    const seen = await sendHelpTurn(false);
    expect(concernLevels(seen)).toEqual(['crisis']);
    expect(isCrisisFaceHeld()).toBe(true);
  });

  it('a task-help turn is sent as elevated and starts no hold', async () => {
    expect(isCrisisFaceHeld()).toBe(false);
    const seen = await sendHelpTurn(true);
    expect(concernLevels(seen)).toEqual(['elevated']);
    expect(isCrisisFaceHeld()).toBe(false);
  });
});
