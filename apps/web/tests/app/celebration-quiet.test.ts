/**
 * Mid-call celebrations are seen and felt, not heard. The agent sends an
 * aha_moment or good_news celebration while Ferni is answering (the server's
 * aha patterns include "i see", "wow" and "really?"), so a chime here plays
 * over Ferni's voice; on phones it was one of the "lots of chimes" (2026-10-17).
 * The glow, bounce, expression and haptic stay.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { delightService } from '../../src/services/delight.service.js';
import { celebrationsUI } from '../../src/ui/celebrations.ui.js';
import { soundUI } from '../../src/ui/sound.ui.js';
import type { DataMessage } from '../../src/types/events.js';

const send = (celebrationType: string): void =>
  handleDataMessage({
    type: 'celebration',
    celebrationType,
    timestamp: 1,
  } as unknown as DataMessage);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mid-call celebrations', () => {
  it.each(['aha_moment', 'good_news'])('%s plays no chime but still glows and taps', (kind) => {
    const play = vi.spyOn(soundUI, 'play').mockImplementation(() => undefined);
    const haptic = vi.spyOn(delightService, 'haptic').mockImplementation(() => undefined);
    const glow = vi.spyOn(celebrationsUI, 'warmthGlow').mockImplementation(() => undefined);

    send(kind);

    expect(glow).toHaveBeenCalled();
    expect(haptic).toHaveBeenCalledWith('light');
    expect(play).not.toHaveBeenCalled();
  });
});
