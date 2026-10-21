/**
 * The call room, through the controls' real wiring: with its flag on, a call
 * hides Home's chrome, the state line follows the agent and mute, End is
 * "End", and back keeps the call. With the flag off, none of it happens.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../../src/ui/overlay/toast-region.js', () => ({ showToast }));

import { CALL_ROOM_STORAGE_KEY } from '../../../src/config/call-room-flag.js';
import { appState, setAudioState, setConnectionState } from '../../../src/state/app.state.js';
import { dispose, initControlsUI } from '../../../src/ui/controls.ui.js';

const indexHtml = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');

function mountFromIndexHtml(): void {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  document.body.innerHTML = '';
  for (const sel of ['.header', '.controls-row', '#helperText']) {
    const el = doc.querySelector(sel);
    if (el) document.body.appendChild(document.importNode(el, true));
  }
}

const inRoom = (): boolean => document.body.classList.contains('call-room');
const line = (): string | null => document.querySelector('.call-room-state')?.textContent ?? null;
const endLabel = (): string | null | undefined =>
  document.querySelector('#disconnectBtn .btn-content')?.textContent;

async function back(): Promise<void> {
  const popped = new Promise<void>((done) =>
    window.addEventListener('popstate', () => done(), { once: true })
  );
  history.back();
  await popped;
  await new Promise((done) => setTimeout(done, 0));
}

function start(flag: 'on' | 'off'): void {
  localStorage.setItem(CALL_ROOM_STORAGE_KEY, flag);
  initControlsUI({ onConnect: vi.fn(), onDisconnect: vi.fn(), onMuteToggle: vi.fn() });
}

beforeEach(() => {
  setConnectionState('disconnected');
  appState.set('isMuted', false);
  setAudioState('idle');
  history.replaceState(null, '');
  showToast.mockClear();
  mountFromIndexHtml();
});

afterEach(() => {
  setConnectionState('disconnected');
  dispose();
  localStorage.removeItem(CALL_ROOM_STORAGE_KEY);
});

describe('call room, flag on', () => {
  beforeEach(() => start('on'));

  it('adds the room class while connecting and connected, and drops it on hang-up', () => {
    expect(inRoom()).toBe(false);
    setConnectionState('connecting');
    expect(inRoom()).toBe(true);
    setConnectionState('connected');
    expect(inRoom()).toBe(true);
    setConnectionState('disconnected');
    expect(inRoom()).toBe(false);
  });

  it('the state line follows the call, the agent and mute', () => {
    setConnectionState('connecting');
    expect(line()).toBe('Connecting');
    setConnectionState('connected');
    setAudioState('listening');
    expect(line()).toBe("Ferni's listening");
    setAudioState('speaking');
    expect(line()).toBe("Ferni's talking");
    appState.set('isMuted', true);
    expect(line()).toBe("You're muted");
    expect(document.getElementById('muteBtn')?.getAttribute('aria-pressed')).toBe('true');
    appState.set('isMuted', false);
    setAudioState('idle');
    expect(line()).toBe("Ferni's listening");
  });

  it('the state line is polite and sits under the name', () => {
    const el = document.querySelector('.call-room-state');
    expect(el?.getAttribute('aria-live')).toBe('polite');
    expect(el?.previousElementSibling?.id).toBe('personaName');
  });

  it('labels the end control "End"', () => {
    setConnectionState('connected');
    expect(endLabel()).toBe('End');
    setConnectionState('disconnected');
    expect(endLabel()).toBe('End');
  });

  it('back during the call keeps it, re-pushes the entry and shows the hint', async () => {
    setConnectionState('connected');
    expect(history.state).toEqual({ ferniCall: true });
    await back();
    expect(appState.get('connection')).toBe('connected');
    expect(history.state).toEqual({ ferniCall: true });
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Tap End to hang up', priority: 'system' })
    );
  });
});

describe('call room, flag off', () => {
  beforeEach(() => start('off'));

  it('changes nothing about the call screen', () => {
    setConnectionState('connected');
    setAudioState('speaking');
    appState.set('isMuted', true);
    expect(inRoom()).toBe(false);
    expect(document.querySelector('.call-room-state')).toBeNull();
    expect(endLabel()).toBe('Disconnect');
  });

  it('pushes no history entry on connect', () => {
    const before = history.length;
    setConnectionState('connected');
    expect(history.length).toBe(before);
    expect(history.state).toBeNull();
  });
});
