/**
 * The connect flow's words, per state (connect polish C1, copy Seth approved
 * 2026-10-29): "Calling Ferni…", "Still reaching Ferni…" after 4 s,
 * "Reconnecting…", "End call", "Until next time", "Call ended", and no
 * "{name} joined" toast.
 *
 * Before: "Connecting…" for a first connect and a reconnect alike,
 * "Disconnect", "Until next time...", "Ending..." and a joined toast.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appState, setConnectionState } from '../../../src/state/app.state.js';
import {
  dispose,
  initControlsUI,
  showAgentHangupState,
  showClosingState,
} from '../../../src/ui/controls.ui.js';

const WEB = resolve(__dirname, '../../..');
const indexHtml = readFileSync(resolve(WEB, 'index.html'), 'utf8');
const enUS = JSON.parse(readFileSync(resolve(WEB, 'src/i18n/locales/en-US.json'), 'utf8')) as Record<
  string,
  Record<string, unknown>
>;

/** The control row exactly as index.html ships it */
function mount(): { connect: HTMLButtonElement; end: HTMLButtonElement } {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  document.body.innerHTML = '';
  document.body.appendChild(document.importNode(doc.querySelector('.controls-row')!, true));
  initControlsUI({
    onConnect: vi.fn(),
    onCancelConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onMuteToggle: vi.fn(),
  });
  return {
    connect: document.getElementById('connectBtn') as HTMLButtonElement,
    end: document.getElementById('disconnectBtn') as HTMLButtonElement,
  };
}

/** What the pill shows: the status line while waiting, else the label */
const shown = (btn: HTMLButtonElement): string | null | undefined =>
  (btn.querySelector('.btn-status-main') ?? btn.querySelector('.btn-content'))?.textContent;
/** What a screen reader says */
const spoken = (btn: HTMLButtonElement): string | null =>
  btn.getAttribute('aria-label') ?? btn.querySelector('.btn-content')?.textContent ?? null;

const originalPersona = appState.get('activePersona');

beforeEach(() => {
  vi.useFakeTimers();
  setConnectionState('disconnected');
  appState.set('isWrappingUp', false);
});

afterEach(() => {
  setConnectionState('disconnected');
  dispose();
  appState.set('activePersona', originalPersona);
  vi.useRealTimers();
});

describe('home connect button, per connection state', () => {
  it('disconnected: "Talk to Ferni"', () => {
    const { connect } = mount();
    expect(shown(connect)).toBe('Talk to Ferni');
    expect(connect.hasAttribute('aria-label')).toBe(false);
    expect(spoken(connect)).toBe('Talk to Ferni');
  });

  it('connecting: "Calling Ferni…" over "Tap to cancel", read as one sentence', () => {
    const { connect } = mount();
    setConnectionState('connecting');
    expect(shown(connect)).toBe('Calling Ferni…');
    expect(connect.querySelector('.btn-status-hint')?.textContent).toBe('Tap to cancel');
    expect(spoken(connect)).toBe('Calling Ferni. Tap to cancel.');
    expect(connect.disabled).toBe(false);
  });

  it('connecting names the persona being called', () => {
    appState.set('activePersona', { ...originalPersona, name: 'Maya' });
    const { connect } = mount();
    setConnectionState('connecting');
    expect(shown(connect)).toBe('Calling Maya…');
    expect(spoken(connect)).toBe('Calling Maya. Tap to cancel.');
  });

  it('reconnecting: "Reconnecting…", not a new call, and not cancellable', () => {
    const { connect } = mount();
    setConnectionState('connected');
    setConnectionState('reconnecting');
    expect(shown(connect)).toBe('Reconnecting…');
    expect(spoken(connect)).toBe('Reconnecting…');
    expect(connect.querySelector('.btn-status-hint')).toBeNull();
    expect(connect.disabled).toBe(true);
  });

  it('error: back to "Talk to Ferni", no status left behind', () => {
    const { connect } = mount();
    setConnectionState('connecting');
    setConnectionState('error');
    expect(shown(connect)).toBe('Talk to Ferni');
    expect(connect.hasAttribute('aria-label')).toBe(false);
  });
});

describe('home end button', () => {
  it('connected: "End call", read as "End call"', () => {
    const { end } = mount();
    setConnectionState('connected');
    expect(shown(end)).toBe('End call');
    expect(spoken(end)).toBe('End call');
  });

  it('a goodbye taken back reads "End call" again, not "End conversation"', () => {
    const { end } = mount();
    setConnectionState('connected');
    appState.set('isWrappingUp', true);
    appState.set('isWrappingUp', false);
    expect(shown(end)).toBe('End call');
    expect(end.getAttribute('aria-label')).toBe('End call');
  });

  it('you hung up: "Until next time", no dots', () => {
    const { end } = mount();
    setConnectionState('connected');
    showClosingState();
    expect(shown(end)).toBe('Until next time');
  });

  it('Ferni hung up: "Call ended"', () => {
    const { end } = mount();
    setConnectionState('connected');
    showAgentHangupState();
    expect(shown(end)).toBe('Call ended');
  });
});

describe('home slow connect (4 s)', () => {
  it('says "Still reaching Ferni…" after 4 s, and can still be cancelled', () => {
    const { connect } = mount();
    setConnectionState('connecting');
    vi.advanceTimersByTime(3999);
    expect(shown(connect)).toBe('Calling Ferni…');
    vi.advanceTimersByTime(1);
    expect(shown(connect)).toBe('Still reaching Ferni…');
    expect(spoken(connect)).toBe('Still reaching Ferni. Tap to cancel.');
    expect(connect.querySelector('.btn-status-hint')?.textContent).toBe('Tap to cancel');
    expect(connect.querySelectorAll('.btn-status')).toHaveLength(1);
    expect(connect.disabled).toBe(false);
  });

  it('is cleared when the call connects first', () => {
    const { connect } = mount();
    setConnectionState('connecting');
    vi.advanceTimersByTime(2000);
    setConnectionState('connected');
    vi.advanceTimersByTime(10_000);
    expect(connect.querySelector('.btn-status')).toBeNull();
    expect(connect.getAttribute('aria-busy')).toBe('false');
    expect(connect.hasAttribute('aria-label')).toBe(false);
  });

  it('is cleared by a cancel, so the next attempt counts from its own start', () => {
    const { connect } = mount();
    setConnectionState('connecting');
    vi.advanceTimersByTime(3000);
    setConnectionState('disconnected');
    setConnectionState('connecting');
    vi.advanceTimersByTime(3000); // 6 s since the first tap, 3 s into this one
    expect(shown(connect)).toBe('Calling Ferni…');
    vi.advanceTimersByTime(1000);
    expect(shown(connect)).toBe('Still reaching Ferni…');
  });

  it('never fires during a reconnect', () => {
    const { connect } = mount();
    setConnectionState('connected');
    setConnectionState('reconnecting');
    vi.advanceTimersByTime(10_000);
    expect(shown(connect)).toBe('Reconnecting…');
  });
});

describe('connect copy lint', () => {
  const NAMESPACES = ['connectFailure', 'entrance', 'session', 'tryFirst', 'callRoom'];

  function strings(value: unknown, path: string): [string, string][] {
    if (typeof value === 'string') return [[path, value]];
    if (value && typeof value === 'object') {
      return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
    }
    return [];
  }

  it('uses a real "…", never three dots, in the connect flow', () => {
    const lines = NAMESPACES.flatMap((ns) => strings(enUS[ns], ns));
    expect(lines.length).toBeGreaterThan(30);
    expect(lines.filter(([, text]) => text.includes('...'))).toEqual([]);
  });

  it('every way of saying "calling" is the same words', () => {
    for (const key of ['entrance.connectingNow', 'tryFirst.connecting', 'callRoom.connecting']) {
      const [ns, name] = key.split('.') as [string, string];
      expect(enUS[ns]?.[name], key).toBe('Calling {name}…');
    }
  });
});

describe('arrival', () => {
  it('has no "{name} joined" toast', () => {
    const app = readFileSync(resolve(WEB, 'src/app.ts'), 'utf8');
    const start = app.indexOf('onAgentConnected: () => {');
    const end = app.indexOf('onAgentDisconnected:', start);
    expect(start).toBeGreaterThan(0);
    const arrival = app.slice(start, end);
    expect(arrival).toContain("ferniExpressions.heldPose('happy'"); // the rest of the arrival stays (C5)
    expect(arrival).not.toMatch(/messageUI\.show|showToast|agentJoined/);
    expect(app).not.toContain('app.agentJoined');
    expect(enUS.app?.agentJoined).toBeUndefined();
  });
});
