/**
 * Handoff presence: the agent's handoff_progress heartbeats, enveloped exactly
 * as the coordinator adapter publishes them (buildHandoffUIMessage), go through
 * the web's real data-message handler and drive the avatar indicator.
 *
 * The heartbeat data shape is the coordinator's (pinned by
 * src/tools/handoff/__tests__/handoff-progress-heartbeat.test.ts, which runs a
 * real handoff).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

import { buildHandoffUIMessage } from '../../../../src/agents/shared/data-message-envelope.js';
import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import type { DataMessage } from '../../src/types/events.js';
import {
  HANDING_OFF_CLASS,
  initHandoffPresence,
  SHOW_AFTER_MS,
} from '../../src/ui/handoff-presence.ui.js';

let seq = 1000;
const TRACE = 'hndff_presence';

/** Deliver one coordinator UI event to the web the way the agent publishes it. */
async function deliver(type: string, data: Record<string, unknown>): Promise<void> {
  seq += 1;
  const bytes = new TextEncoder().encode(
    JSON.stringify(buildHandoffUIMessage({ type, data }, seq))
  );
  handleDataMessage(JSON.parse(new TextDecoder().decode(bytes)) as DataMessage);
  // processDataMessage is async (fire-and-forget inside handleDataMessage)
  await vi.advanceTimersByTimeAsync(0);
}

function heartbeat(elapsedMs: number, phase = 'switching_voice'): Promise<void> {
  return deliver('handoff_progress', {
    traceId: TRACE,
    target: 'maya-santos',
    phase,
    progress: 0.5,
    elapsedMs,
    timeoutMs: 8000,
  });
}

function avatar(): HTMLElement {
  const el = document.querySelector('.avatar-container');
  if (!(el instanceof HTMLElement)) throw new Error('no avatar container');
  return el;
}

function caption(): HTMLElement | null {
  return avatar().querySelector<HTMLElement>('.handoff-presence-caption');
}

let cleanup: () => void = () => undefined;

beforeEach(() => {
  document.body.innerHTML = '<div id="coach"><div class="avatar-container"></div></div>';
  cleanup = initHandoffPresence();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('handoff presence indicator', () => {
  it('stays hidden for the first ~700 ms, then shows "Bringing in Maya" on the avatar', async () => {
    await heartbeat(20, 'loading_persona');
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(false);
    expect(caption()?.textContent).toBe('');

    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS - 100);
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(false);

    await vi.advanceTimersByTimeAsync(100);
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(true);
    expect(caption()?.textContent).toBe('Bringing in Maya…');
  });

  it('announces politely to screen readers through a live region that exists before it speaks', () => {
    const live = caption();
    expect(live?.getAttribute('role')).toBe('status');
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(avatar().querySelector('.handoff-presence-ring')?.getAttribute('aria-hidden')).toBe(
      'true'
    );
  });

  it('clears on the handoff_complete message', async () => {
    await heartbeat(20);
    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS);
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(true);

    await deliver('handoff_complete', {
      traceId: TRACE,
      target: 'maya-santos',
      displayName: 'Maya',
      voiceId: 'v',
      durationMs: 1200,
    });
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(false);
    expect(caption()?.textContent).toBe('');
  });

  it('never flashes for a fast handoff that completes before the delay', async () => {
    await heartbeat(20);
    await vi.advanceTimersByTimeAsync(200);
    await deliver('handoff_complete', { traceId: TRACE, target: 'maya-santos' });

    await vi.advanceTimersByTimeAsync(SHOW_AFTER_MS * 3);
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(false);
  });

  it('shows at once when the first heartbeat already reports more than the delay', async () => {
    await heartbeat(SHOW_AFTER_MS + 300, 'updating_llm');
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(true);
  });

  it('clears on handoff_failed', async () => {
    await heartbeat(SHOW_AFTER_MS);
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(true);

    await deliver('handoff_failed', {
      traceId: TRACE,
      error: 'voice switch failed',
      errorCode: 'EXECUTION_ERROR',
    });
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(false);
  });

  it("clears by itself once the agent's timeout passes with no outcome", async () => {
    await heartbeat(SHOW_AFTER_MS);
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(true);

    await vi.advanceTimersByTimeAsync(8000);
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(avatar().classList.contains(HANDING_OFF_CLASS)).toBe(false);
  });
});
