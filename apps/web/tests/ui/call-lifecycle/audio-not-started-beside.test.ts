/**
 * The audio-start watchdog only ever adds its own notice and only ever removes
 * its own notice. Whatever else is on screen (here another call notice standing
 * in for a crisis line) stays when it fires and stays when it stands down.
 * One message, never two: with Ferni's drop prompt up, "sound didn't start" is
 * not added, and the drop prompt takes down a "sound didn't start" already up.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  showAgentLostPrompt,
  showAudioNotStartedPrompt,
} from '../../../src/app/agent-lost-prompt.js';
import {
  AUDIO_PUBLISH_DEADLINE_MS,
  watchAudioStart,
} from '../../../src/services/audio-start-watch.js';
import { connectFailure } from '../../../src/services/connect-failure.js';
import { clearCallNotice, showCallNotice } from '../../../src/ui/call-status.ui.js';

const kinds = () =>
  [...document.querySelectorAll<HTMLElement>('.call-status')].map((n) => n.dataset['kind']);

let ferniTracks: Map<string, { track: { attachedElements: HTMLMediaElement[] } }>;

/** Ferni is in the room (he has joined), with whatever audio tracks the test gives him. */
function room() {
  return {
    state: 'connected',
    canPlaybackAudio: undefined,
    remoteParticipants: new Map([
      [
        'agent-ferni',
        { identity: 'agent-ferni', isAgent: true, audioTrackPublications: ferniTracks },
      ],
    ]),
    on: vi.fn(),
    off: vi.fn(),
  };
}

const call = { endCall: vi.fn(async () => undefined), connect: vi.fn(async () => undefined) };

function armWatch(): () => void {
  return watchAudioStart(room(), {
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
  ferniTracks = new Map();
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
    ferniTracks.set('TR_voice', { track: { attachedElements: [voice] } });
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

  it('the drop prompt is up: no "sound didn\'t start" on top of it', () => {
    showAgentLostPrompt(call);
    const stop = armWatch();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);

    expect(kinds()).toEqual(['agent_left']);
    stop();
    expect(kinds()).toEqual(['agent_left']);
  });

  it('"sound didn\'t start" is up and Ferni drops off: only the drop prompt', () => {
    const stop = armWatch();
    vi.advanceTimersByTime(AUDIO_PUBLISH_DEADLINE_MS);
    expect(kinds()).toEqual(['audio_not_started']);

    showAgentLostPrompt(call);
    expect(kinds()).toEqual(['agent_left']);
    stop(); // the call's cleanup later: the drop prompt stays
    expect(kinds()).toEqual(['agent_left']);
  });

  it('with no drop prompt up, the notice shows beside a crisis line as before', () => {
    showOtherNotice();
    expect(showAudioNotStartedPrompt(call)).toEqual(expect.any(Function));
    expect(kinds()).toHaveLength(2);
  });
});
