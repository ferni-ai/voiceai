/**
 * The first-call milestone card landed the moment a call connected, together
 * with the "Ferni joined" pill, and sat over the Disconnect and mute buttons.
 * Celebrations now hold through the call's opening and while Ferni speaks, and
 * the card is placed above the call controls.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appState } from '../../src/state/app.state.js';
import {
  OPENING_SETTLE_MS,
  SPEAKING_RETRY_MS,
  celebrationHoldMs,
  noteConnectionState,
  placeMilestoneCard,
} from '../../src/ui/milestone-placement.js';

const VIEWPORT_HEIGHT = 844;

/** Give an element a fixed bounding box (jsdom does no layout). */
function setRect(element: Element, top: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 390,
      width: 390,
      x: 0,
      y: top,
    }) as DOMRect;
}

function addElement(html: string, top: number, height: number): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html;
  const element = template.content.firstElementChild as HTMLElement;
  document.body.appendChild(element);
  setRect(element, top, height);
  return element;
}

function card(height: number): HTMLElement {
  const element = document.createElement('div');
  element.className = 'ferni-milestone';
  setRect(element, 0, height);
  return element;
}

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(window, 'innerHeight', { value: VIEWPORT_HEIGHT, configurable: true });
});

afterEach(() => {
  appState.set('connection', 'disconnected');
  appState.set('audio', 'idle');
  noteConnectionState('disconnected');
});

describe('celebrationHoldMs', () => {
  it('holds a celebration through the opening of a call that just connected', () => {
    const connectedAt = 1_000_000;
    appState.set('connection', 'connected');
    noteConnectionState('connected', connectedAt);

    expect(celebrationHoldMs(connectedAt)).toBe(OPENING_SETTLE_MS);
    expect(celebrationHoldMs(connectedAt + 5_000)).toBe(OPENING_SETTLE_MS - 5_000);
  });

  it('lets it show once the opening has settled and nobody is speaking', () => {
    const connectedAt = 1_000_000;
    appState.set('connection', 'connected');
    appState.set('audio', 'idle');
    noteConnectionState('connected', connectedAt);

    expect(celebrationHoldMs(connectedAt + OPENING_SETTLE_MS)).toBe(0);
  });

  it('waits while Ferni is speaking after the opening', () => {
    const connectedAt = 1_000_000;
    appState.set('connection', 'connected');
    appState.set('audio', 'speaking');
    noteConnectionState('connected', connectedAt);

    expect(celebrationHoldMs(connectedAt + OPENING_SETTLE_MS + 1)).toBe(SPEAKING_RETRY_MS);
  });

  it('does not hold when no call is up', () => {
    appState.set('connection', 'disconnected');

    expect(celebrationHoldMs()).toBe(0);
  });
});

describe('placeMilestoneCard', () => {
  it('sits above the waveform and controls, never over them', () => {
    addElement('<div id="waveformContainer"></div>', 480, 30);
    addElement('<div class="controls-row"></div>', 523, 52);
    const element = card(100);

    placeMilestoneCard(element);

    const bottom = parseFloat(element.style.bottom);
    const cardBottomEdge = VIEWPORT_HEIGHT - bottom;
    expect(element.isConnected).toBe(true);
    expect(cardBottomEdge).toBeLessThanOrEqual(480);
    expect(cardBottomEdge - 100).toBeGreaterThanOrEqual(0);
  });

  it('goes to the top of the screen when there is no room above the controls', () => {
    addElement('<div class="controls-row"></div>', 60, 52);
    const element = card(100);

    placeMilestoneCard(element);

    expect(element.style.top).toBe('8px');
    expect(element.style.bottom).toBe('auto');
  });

  it('keeps the stylesheet position when no controls are on screen', () => {
    const element = card(100);

    placeMilestoneCard(element);

    expect(element.isConnected).toBe(true);
    expect(element.style.bottom).toBe('');
    expect(element.style.top).toBe('');
  });
});
