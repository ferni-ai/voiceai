/**
 * Handoff progress heartbeats carry what the web handoff indicator reads:
 * target, elapsedMs and timeoutMs (apps/web/src/types/events.ts isHandoffProgress).
 */

import { describe, expect, it } from 'vitest';
import { createHandoffCoordinator } from '../handoff-coordinator.js';
import type { SequencedEvent } from '../event-sequencer.js';
import { AgentDirectory } from '../../../personas/agent-directory.js';

describe('handoff progress heartbeat', () => {
  it('every handoff_progress event names the target and reports elapsed and timeout ms', async () => {
    // The state manager resolves ids from the agent directory's alias table; load it
    // first (otherwise every id falls back to 'ferni' and the handoff is refused).
    await AgentDirectory.getEntry('maya-santos');

    const events: SequencedEvent[] = [];
    const coordinator = createHandoffCoordinator({
      sessionId: `progress-${Date.now()}`,
      handoffTimeoutMs: 8000,
      skipBanter: true,
      onVoiceSwitch: async () => undefined,
      onLLMUpdate: async () => undefined,
      onUINotify: (event) => {
        events.push(event as SequencedEvent);
      },
    });

    try {
      const result = await coordinator.execute({
        targetAgent: 'maya-santos',
        reason: 'test',
        source: 'user',
        skipValidation: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    } finally {
      coordinator.dispose();
    }

    const progress = events.filter((e) => e.type === 'handoff_progress');
    expect(progress.length).toBeGreaterThan(0);
    for (const event of progress) {
      expect(event.data['target']).toBe('maya-santos');
      expect(typeof event.data['elapsedMs']).toBe('number');
      expect(event.data['elapsedMs']).toBeGreaterThanOrEqual(0);
      expect(event.data['timeoutMs']).toBe(8000);
    }
  });
});
