/**
 * The audio-start watchdog only ever adds its own notice and only ever removes
 * its own notice. Whatever else is on screen (here another call notice standing
 * in for a crisis line) stays when it fires and stays when it stands down.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showAudioNotStartedPrompt } from '../../../src/app/agent-lost-prompt.js';
import {
  AUDIO_PUBLISH_DEADLINE_MS,
  watchAudioStart,
} from '../../../src/services/audio-start-watch.js';
import { connectFailure } from '../../../src/services/connect-failure.js';
import { clearCallNotice, showCallNotice } from '../../../src/ui/call-status.ui.js';

const kinds = () =>
  [...document.querySelectorAll<HTMLElement>('.call-status')].map((n) => n.dataset['kind']);

function room() {
  return { state: 'connected', canPlaybackAudio: undefined, on: vi.fn(), off: vi.fn() };
}

const call = { endCall: vi.fn(async () => undefined), connect: vi.fn(async () => undefined) };
let agentAudio: HTMLAudioElement[];

function armWatch(): () => void {
  return watchAudioStart(room(), {
    agentAudio: () => agentAudio,
    userHangingUp: () => false,
    onAudioNotStarted: () => showAudioNotStartedPrompt(call),
  });
}

function showOtherNotice(): void {
  showCallNotice(connectFailure('rate_limited'), { onRetry: vi.fn() });
}

beforeEach(() => {
  vi.useFakeTimers();
  clearCallNotice();
  document.body.innerHTML = '<main><div class="controls-row"></div></main>';
  agentAudio = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the audio-start notice beside other UI', () => {
  it('fires beside another notice, and hang-up removes only its own', () => {
    showOtherNotice();
    const stop = armWatch();

    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(kinds()).toEqual(expect.arrayContaining(['rate_limited', 'audio_not_started']));
    expect(kinds()).toHaveLength(2);

    stop();
    expect(kinds()).toEqual(['rate_limited']);
  });

  it('his audio starting late removes only its own notice', () => {
    showOtherNotice();
    armWatch();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(kinds()).toHaveLength(2);

    const voice = document.createElement('audio');
    document.body.appendChild(voice);
    agentAudio.push(voice);
    voice.dispatchEvent(new Event('playing'));

    expect(kinds()).toEqual(['rate_limited']);
  });

  it('a notice that shows after it does not remove it, and it does not remove that one', () => {
    const stop = armWatch();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    showOtherNotice();
    expect(kinds()).toHaveLength(2);

    stop();
    expect(kinds()).toEqual(['rate_limited']);
  });

  it('sits a layer below the other notices, so it never covers one', () => {
    armWatch();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    const ours = document.querySelector('[data-kind="audio_not_started"]');
    expect(ours?.classList.contains('call-status--beside')).toBe(true);
    const css = document.getElementById('call-status-styles')?.textContent ?? '';
    expect(css).toContain('.call-status--beside { z-index: calc(var(--z-banner) - 1); }');
  });

  it('does not take focus from something else that holds it', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    armWatch();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);

    expect(document.activeElement).toBe(other);
  });
});
