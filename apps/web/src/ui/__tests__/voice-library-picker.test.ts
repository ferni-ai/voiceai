/**
 * The voice picker loads the library once, can't retry in a tight loop after a failure,
 * and plays one preview at a time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lib = vi.hoisted(() => ({
  state: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  failedAt: 0,
  voices: [] as unknown[],
  load: vi.fn(async () => []),
}));
vi.mock('../../services/voice-library.service.js', () => ({
  getVoiceLibrary: () => lib.voices,
  getVoiceLibraryState: () => lib.state,
  getVoiceLibraryFailedAt: () => lib.failedAt,
  loadVoiceLibrary: lib.load,
}));

const {
  ensureVoiceLibrary,
  toggleVoicePreview,
  stopVoicePreview,
  voiceLibraryStatusHtml,
  VOICE_LIBRARY_RETRY_MS,
} = await import('../voice-library-picker.js');

const plays: string[] = [];
const pauses: string[] = [];
class FakeAudio {
  onended: (() => void) | null = null;
  constructor(public src: string) {}
  play() {
    plays.push(this.src);
    return Promise.resolve();
  }
  pause() {
    pauses.push(this.src);
  }
}

beforeEach(() => {
  lib.state = 'idle';
  lib.failedAt = 0;
  lib.voices = [];
  lib.load.mockClear();
  plays.length = 0;
  pauses.length = 0;
  stopVoicePreview();
  vi.stubGlobal('Audio', FakeAudio);
});

describe('loading the library', () => {
  it('loads when idle and redraws when it settles', async () => {
    const redraw = vi.fn();
    ensureVoiceLibrary(redraw);
    expect(lib.load).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(redraw).toHaveBeenCalledTimes(1);
  });

  it("doesn't load again while loading or once ready", () => {
    lib.state = 'loading';
    ensureVoiceLibrary(vi.fn());
    lib.state = 'ready';
    ensureVoiceLibrary(vi.fn());
    expect(lib.load).not.toHaveBeenCalled();
  });

  it("doesn't retry right after a failure, so a redraw can't loop", () => {
    lib.state = 'failed';
    lib.failedAt = 1_000_000;
    ensureVoiceLibrary(vi.fn(), 1_000_000 + VOICE_LIBRARY_RETRY_MS - 1);
    expect(lib.load).not.toHaveBeenCalled();
    ensureVoiceLibrary(vi.fn(), 1_000_000 + VOICE_LIBRARY_RETRY_MS);
    expect(lib.load).toHaveBeenCalledTimes(1);
  });

  it('shows loading, then the failure, then nothing once there are voices', () => {
    lib.state = 'loading';
    expect(voiceLibraryStatusHtml()).toContain('Loading voices');
    lib.state = 'failed';
    expect(voiceLibraryStatusHtml()).toContain("Couldn't load the voices");
    lib.state = 'ready';
    lib.voices = [{ id: 'v1' }];
    expect(voiceLibraryStatusHtml()).toBeNull();
  });
});

describe('previews', () => {
  const button = (url: string) => {
    const b = document.createElement('button');
    b.dataset.preview = url;
    return b;
  };

  it('plays one at a time and a second tap stops it', () => {
    const a = button('/sounds/voice-library/a.mp3');
    const b = button('/sounds/voice-library/b.mp3');
    toggleVoicePreview(a);
    expect(a.getAttribute('aria-pressed')).toBe('true');
    toggleVoicePreview(b);
    expect(plays).toEqual(['/sounds/voice-library/a.mp3', '/sounds/voice-library/b.mp3']);
    expect(pauses).toEqual(['/sounds/voice-library/a.mp3']);
    expect(a.getAttribute('aria-pressed')).toBe('false');
    toggleVoicePreview(b);
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(pauses).toEqual(['/sounds/voice-library/a.mp3', '/sounds/voice-library/b.mp3']);
  });
});
