/**
 * Calm idle screen: with the flag on, <body> is marked so styles/calm-idle.css
 * hides the split-heart badge, a one-person picker and the rituals count while
 * no call runs; with it off nothing is marked and the idle screen is unchanged.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CALM_IDLE_CLASS,
  RESTING_CLASS,
  disposeCalmIdleScreen,
  initCalmIdleScreen,
} from '../../src/app/calm-idle-screen.js';
import { CALM_IDLE_STORAGE_KEY } from '../../src/config/calm-idle.js';
import { appState } from '../../src/state/app.state.js';

const css = readFileSync(join(__dirname, '../../src/styles/calm-idle.css'), 'utf8');
const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');

describe('calm idle screen', () => {
  afterEach(() => {
    disposeCalmIdleScreen();
    localStorage.removeItem(CALM_IDLE_STORAGE_KEY);
    appState.set('connection', 'disconnected');
  });

  it('marks nothing with the flag off', () => {
    initCalmIdleScreen();
    expect(document.body.classList.contains(CALM_IDLE_CLASS)).toBe(false);
    expect(document.body.classList.contains(RESTING_CLASS)).toBe(false);
  });

  it('marks the page resting out of a call, and not during one', () => {
    localStorage.setItem(CALM_IDLE_STORAGE_KEY, '1');
    appState.set('connection', 'disconnected');
    initCalmIdleScreen();
    expect(document.body.classList.contains(CALM_IDLE_CLASS)).toBe(true);
    expect(document.body.classList.contains(RESTING_CLASS)).toBe(true);

    appState.set('connection', 'connected');
    expect(document.body.classList.contains(RESTING_CLASS)).toBe(false);

    appState.set('connection', 'disconnected');
    expect(document.body.classList.contains(RESTING_CLASS)).toBe(true);
  });

  it('hides the badge, a one-person picker and the rituals count only while resting', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...rules.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    expect(selectors.length).toBe(3);
    for (const selector of selectors) expect(selector.startsWith(`.${RESTING_CLASS}`)).toBe(true);
    expect(rules).toMatch(/\.unified-indicator:not\(/);
    expect(rules).toContain('#teamRoster:not(:has(> .team-member + .team-member))');
    expect(rules).toContain('#engagementBadge');
    expect(html).toContain('href="/src/styles/calm-idle.css"');
  });
});
