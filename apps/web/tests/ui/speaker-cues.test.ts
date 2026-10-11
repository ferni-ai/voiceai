/**
 * Speaker cues (behind ferni:speaker-cues, off by default): the avatar shows
 * who is talking, "Tap to interrupt" appears only while Ferni talks and sends
 * the agent a real user_interrupt message, and screen readers hear one polite
 * announcement per speaker change.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/services/connection.service.js', () => ({
  connectionService: { getRoom: () => null },
}));

import {
  ANNOUNCE_SETTLE_MS,
  SPEAKER_CUES_FLAG_KEY,
  disposeSpeakerCues,
  initSpeakerCues,
} from '../../src/ui/speaker-cues.ui.js';
import type { CueRoom } from '../../src/ui/speaker-cues-signals.js';
import { SPEAKER_CUES_CSS } from '../../src/ui/speaker-cues-styles.js';

type Handler = (...args: unknown[]) => void;

class FakeRoom implements CueRoom {
  handlers = new Map<string, Set<Handler>>();
  agent = { identity: 'agent-1', attributes: {} as Record<string, string> };
  remoteParticipants = new Map<string, unknown>([['agent-1', this.agent]]);
  publishData = vi.fn(async (_data: Uint8Array, _options?: { reliable?: boolean }) => undefined);
  localParticipant = {
    identity: 'me',
    publishData: this.publishData,
  };
  on(event: string, cb: Handler): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(cb);
    return this;
  }
  off(event: string, cb: Handler): this {
    this.handlers.get(event)?.delete(cb);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((cb) => cb(...args));
  }
  setAgent(attrs: Record<string, string>): void {
    this.agent.attributes = attrs;
    this.emit('participantAttributesChanged', attrs, this.agent);
  }
  listenerCount(): number {
    let n = 0;
    this.handlers.forEach((set) => (n += set.size));
    return n;
  }
}

const SPEAKING = { 'lk.agent.state': 'speaking', 'ferni.tap_interrupt': 'on' };

function mountAvatar(): HTMLElement {
  document.body.innerHTML = `
    <div id="coach"><div class="avatar-container"><div id="coachAvatar"></div></div></div>`;
  return document.getElementById('coach') as HTMLElement;
}

const button = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>('.speaker-cues__interrupt');
const liveRegion = (): HTMLElement | null =>
  document.querySelector('[aria-live="polite"].speaker-cues__part');

describe('speaker cues', () => {
  let room: FakeRoom;
  let coach: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    room = new FakeRoom();
    coach = mountAvatar();
  });

  afterEach(() => {
    disposeSpeakerCues();
    vi.useRealTimers();
  });

  describe('flag off (default)', () => {
    it('adds nothing to the page and never listens to the room', () => {
      expect(initSpeakerCues(() => room)).toBe(false);
      document.dispatchEvent(new CustomEvent('ferni:connected'));
      room.setAgent(SPEAKING);

      expect(document.querySelector('.speaker-cues__part')).toBeNull();
      expect(room.listenerCount()).toBe(0);
      expect(coach.classList.contains('cue-ferni-speaking')).toBe(false);
    });
  });

  describe('flag on', () => {
    beforeEach(() => {
      localStorage.setItem(SPEAKER_CUES_FLAG_KEY, 'true');
    });

    it('glows the avatar while Ferni talks and stops when he listens', () => {
      expect(initSpeakerCues(() => room)).toBe(true);
      room.setAgent(SPEAKING);
      expect(coach.classList.contains('cue-ferni-speaking')).toBe(true);

      room.setAgent({ 'lk.agent.state': 'listening', 'ferni.tap_interrupt': 'on' });
      expect(coach.classList.contains('cue-ferni-speaking')).toBe(false);
    });

    it('rings the avatar while you talk', () => {
      initSpeakerCues(() => room);
      room.emit('activeSpeakersChanged', [room.localParticipant]);
      expect(coach.classList.contains('cue-user-speaking')).toBe(true);

      room.emit('activeSpeakersChanged', [room.agent]);
      expect(coach.classList.contains('cue-user-speaking')).toBe(false);
    });

    it('breathes while Ferni thinks', () => {
      initSpeakerCues(() => room);
      room.setAgent({ 'lk.agent.state': 'thinking' });
      expect(coach.classList.contains('cue-thinking')).toBe(true);
    });

    it('sizes the ring by your mic level', () => {
      initSpeakerCues(() => room);
      room.emit('activeSpeakersChanged', [{ identity: 'me', audioLevel: 0.5 }]);
      expect(coach.style.getPropertyValue('--cue-mic-level')).toBe('0.5');

      room.emit('activeSpeakersChanged', []);
      expect(coach.style.getPropertyValue('--cue-mic-level')).toBe('0');
    });

    it('shows "Tap to interrupt" only while Ferni is talking', () => {
      initSpeakerCues(() => room);
      expect(button()?.hidden).toBe(true);

      room.setAgent(SPEAKING);
      expect(button()?.hidden).toBe(false);
      expect(button()?.textContent).toBe('Tap to interrupt');

      room.setAgent({ 'lk.agent.state': 'listening', 'ferni.tap_interrupt': 'on' });
      expect(button()?.hidden).toBe(true);
    });

    it('does not offer the button when the agent cannot act on a tap', () => {
      initSpeakerCues(() => room);
      room.setAgent({ 'lk.agent.state': 'speaking' });
      expect(coach.classList.contains('cue-ferni-speaking')).toBe(true);
      expect(button()?.hidden).toBe(true);
    });

    it('tapping sends user_interrupt to the agent and hides the button', async () => {
      initSpeakerCues(() => room);
      room.setAgent(SPEAKING);
      button()?.click();
      await vi.waitFor(() => expect(room.publishData).toHaveBeenCalledOnce());

      const [data, options] = room.publishData.mock.calls[0] ?? [];
      const message = JSON.parse(new TextDecoder().decode(data)) as { type: string };
      expect(message.type).toBe('user_interrupt');
      expect(options).toEqual({ reliable: true });
      await vi.waitFor(() => expect(button()?.hidden).toBe(true));
    });

    it('keeps the button when the interrupt could not be sent', async () => {
      room.publishData.mockRejectedValueOnce(new Error('offline'));
      initSpeakerCues(() => room);
      room.setAgent(SPEAKING);
      button()?.click();
      await vi.waitFor(() => expect(room.publishData).toHaveBeenCalledOnce());
      await new Promise((r) => setTimeout(r, 0));
      expect(button()?.hidden).toBe(false);
    });

    it('announces a speaker change once it settles, not every flicker', () => {
      vi.useFakeTimers();
      initSpeakerCues(() => room);
      const live = liveRegion();
      expect(live?.getAttribute('aria-live')).toBe('polite');

      room.setAgent(SPEAKING);
      vi.advanceTimersByTime(ANNOUNCE_SETTLE_MS);
      expect(live?.textContent).toBe('Ferni is talking');

      // A brief flicker to you and back is not read out.
      room.emit('activeSpeakersChanged', [room.localParticipant]);
      room.setAgent({ 'lk.agent.state': 'listening', 'ferni.tap_interrupt': 'on' });
      vi.advanceTimersByTime(ANNOUNCE_SETTLE_MS / 2);
      room.emit('activeSpeakersChanged', []);
      room.setAgent(SPEAKING);
      vi.advanceTimersByTime(ANNOUNCE_SETTLE_MS);
      expect(live?.textContent).toBe('Ferni is talking');

      room.setAgent({ 'lk.agent.state': 'listening' });
      room.emit('activeSpeakersChanged', [room.localParticipant]);
      vi.advanceTimersByTime(ANNOUNCE_SETTLE_MS);
      expect(live?.textContent).toBe("You're talking");
    });

    it('clears every cue when the call ends', () => {
      initSpeakerCues(() => room);
      room.setAgent(SPEAKING);
      document.dispatchEvent(new CustomEvent('ferni:disconnected'));

      expect(coach.classList.contains('cue-ferni-speaking')).toBe(false);
      expect(button()?.hidden).toBe(true);
      expect(room.listenerCount()).toBe(0);
    });
  });

  it('stops every animation and the ring scaling under prefers-reduced-motion', () => {
    const [base, reduced = ''] = SPEAKER_CUES_CSS.split('@media (prefers-reduced-motion: reduce)');
    const animated = [...base.matchAll(/([^{}]+)\{[^}]*animation:/g)].map((m) => m[1]?.trim());
    expect(animated.length).toBeGreaterThan(0);
    for (const selector of animated) {
      expect(reduced).toContain(selector);
    }
    expect(reduced).toMatch(/animation: none/);
    expect(reduced).toMatch(/\.speaker-cues__mic-ring \{ transform: none; \}/);
  });
});
