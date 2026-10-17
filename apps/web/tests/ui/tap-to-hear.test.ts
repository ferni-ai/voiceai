/**
 * "Tap to hear Ferni": shown while the browser blocks call audio (LiveKit's
 * playback status, or the service's own refused play()), tapping it calls
 * room.startAudio(), and it hides once playback works.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn, error: vi.fn() }),
}));
vi.mock('../../src/services/connection.service.js', () => ({
  connectionService: { getRoom: () => null },
}));

import { reportPlayRejected } from '../../src/services/audio-play-blocked.js';
import {
  AUDIO_PLAYBACK_CHANGED,
  disposeTapToHear,
  initTapToHear,
  tapToHear,
  type PlaybackRoom,
} from '../../src/ui/tap-to-hear.ui.js';

type Handler = (...args: unknown[]) => void;

class FakeRoom implements PlaybackRoom {
  canPlaybackAudio = true;
  handlers = new Map<string, Set<Handler>>();
  startAudio = vi.fn(async () => {
    this.setPlayback(true);
  });
  on(event: string, cb: Handler): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(cb);
    return this;
  }
  off(event: string, cb: Handler): this {
    this.handlers.get(event)?.delete(cb);
    return this;
  }
  setPlayback(canPlay: boolean): void {
    this.canPlaybackAudio = canPlay;
    this.handlers.get(AUDIO_PLAYBACK_CHANGED)?.forEach((cb) => cb(canPlay));
  }
  listeners(): number {
    return this.handlers.get(AUDIO_PLAYBACK_CHANGED)?.size ?? 0;
  }
}

const notAllowed = (): Error =>
  Object.assign(new Error('play() needs a gesture'), { name: 'NotAllowedError' });
const row = (): HTMLElement | null => document.querySelector<HTMLElement>('.tap-to-hear');
const button = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>('.tap-to-hear__button');
const shown = (): boolean => row() !== null && !row()?.hidden;

let room: FakeRoom;

beforeEach(() => {
  warn.mockClear();
  document.body.innerHTML = '<div class="controls-row"></div>';
  room = new FakeRoom();
  initTapToHear(() => room);
});
afterEach(() => disposeTapToHear());

describe('tap to hear Ferni', () => {
  it('stays hidden while audio can play', () => {
    expect(row()).not.toBeNull();
    expect(shown()).toBe(false);
  });

  it('shows the button when LiveKit reports playback blocked', () => {
    room.setPlayback(false);
    expect(shown()).toBe(true);
    expect(button()?.textContent).toBe('Tap to hear Ferni');
    expect(button()?.className).toContain('btn-primary');
  });

  it('shows the button when the service reports a refused play()', () => {
    reportPlayRejected(notAllowed(), { trackKey: 'agent-1-voice' });
    expect(shown()).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'Agent audio did not start',
      expect.objectContaining({ trackKey: 'agent-1-voice', errorName: 'NotAllowedError' })
    );
  });

  it('does not ask for a tap when play() was only interrupted (AbortError)', () => {
    reportPlayRejected(Object.assign(new Error('interrupted'), { name: 'AbortError' }), {});
    expect(shown()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('tapping calls room.startAudio() and hides the button once playback works', async () => {
    room.setPlayback(false);
    button()?.click();
    await vi.waitFor(() => expect(room.startAudio).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(shown()).toBe(false));
  });

  it('hides when the playback status flips back on by itself', () => {
    room.setPlayback(false);
    room.setPlayback(true);
    expect(shown()).toBe(false);
  });

  it('keeps the button when startAudio is still refused', async () => {
    room.startAudio.mockImplementationOnce(async () => {
      throw notAllowed();
    });
    room.setPlayback(false);
    await tapToHear();
    expect(room.startAudio).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(true);
    expect(warn).toHaveBeenCalledWith('Audio still blocked after tap to hear', expect.anything());
  });

  it('checks the status already set when the call connects', () => {
    disposeTapToHear();
    room.canPlaybackAudio = false;
    initTapToHear(() => room);
    expect(shown()).toBe(true);
  });

  it('hides and stops listening on hang-up', () => {
    room.setPlayback(false);
    document.dispatchEvent(new CustomEvent('ferni:disconnected'));
    expect(shown()).toBe(false);
    expect(room.listeners()).toBe(0);
  });

  it('sits above the call controls', () => {
    expect(row()?.nextElementSibling?.classList.contains('controls-row')).toBe(true);
  });
});
