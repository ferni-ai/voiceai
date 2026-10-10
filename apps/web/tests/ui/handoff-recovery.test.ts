/**
 * Handoff and cameo timeouts say something.
 *
 * handoff.service dispatches ferni:handoff-timeout (a soft-open whose handoff_started never
 * came) and cameo.service dispatches ferni:cameo-timeout (a cameo past its safety limit)
 * "for the UI to show a recovery message". Nothing listened. These tests drive the real
 * services into their timeouts and watch the toast the person would see.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), success: vi.fn(), show: vi.fn() }));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

const { t } = await import('../../src/i18n/index.js');
const { initHandoffPresence, HANDING_OFF_CLASS } = await import(
  '../../src/ui/handoff-presence.ui.js'
);
const { handoffService } = await import('../../src/services/handoff.service.js');
const { cameoService } = await import('../../src/services/cameo.service.js');

describe('handoff / cameo recovery', () => {
  let cleanup: () => void;

  beforeEach(() => {
    toast.info.mockClear();
    document.body.innerHTML = '<div class="avatar-container"></div>';
    cleanup = initHandoffPresence();
  });

  afterEach(() => {
    cleanup();
  });

  it('says so when a handoff soft-open never gets its start (real handoff.service timeout)', async () => {
    // soft_open_complete arrives with no handoff_started before it: the service queues it,
    // waits 5s, then gives up and announces the timeout.
    await handoffService.processDataMessage({
      type: 'soft_open_complete',
      newAgent: 'maya-santos',
      previousAgent: 'ferni',
    } as never);
    expect(toast.info).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6000);

    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(t('teamRoster.handoffTimeout'));
  });

  it('clears a lingering "bringing in" indicator on the handoff timeout', () => {
    const avatar = document.querySelector('.avatar-container') as HTMLElement;
    avatar.classList.add(HANDING_OFF_CLASS);

    document.dispatchEvent(
      new CustomEvent('ferni:handoff-timeout', { detail: { type: 'soft_open_timeout' } })
    );

    expect(avatar.classList.contains(HANDING_OFF_CLASS)).toBe(false);
  });

  it('says so when a cameo is cleaned up after its safety limit (real cameo.service timeout)', async () => {
    // cameo_start with no cameo_complete: the service force-cleans after 30s.
    cameoService.processDataMessage({
      type: 'cameo_start',
      personaId: 'maya-santos',
      personaName: 'Maya',
      cameoId: 'c1',
    } as never);
    const ended = vi.fn();
    cameoService.onCameoEnd(ended);
    expect(document.body.getAttribute('data-cameo-active')).toBe('true');
    expect(toast.info).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(31_000);

    expect(document.body.hasAttribute('data-cameo-active')).toBe(false);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(t('teamRoster.cameoTimeout'));
  });

  it('stops listening after cleanup', () => {
    cleanup();
    document.dispatchEvent(new CustomEvent('ferni:cameo-timeout', { detail: {} }));
    document.dispatchEvent(new CustomEvent('ferni:handoff-timeout', { detail: {} }));

    expect(toast.info).not.toHaveBeenCalled();
    cleanup = initHandoffPresence();
  });

  it('the recovery messages are real translations, not raw keys', () => {
    expect(t('teamRoster.handoffTimeout')).not.toBe('teamRoster.handoffTimeout');
    expect(t('teamRoster.cameoTimeout')).not.toBe('teamRoster.cameoTimeout');
  });
});
