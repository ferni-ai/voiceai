/**
 * A window CustomEvent nothing listens for is a button that does nothing.
 * These six were found dispatched with no listener; each must now be heard,
 * or not dispatched at all.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { START_CONVERSATION_EVENTS } from '../src/app/conversation-starter.js';

const SRC = join(__dirname, '../src');

function sources(dir: string = SRC): Array<{ path: string; text: string }> {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'locales' ? [] : sources(path);
    return /\.ts$/.test(name) ? [{ path: relative(SRC, path), text: readFileSync(path, 'utf8') }] : [];
  });
}

const FILES = sources();
const STARTERS: readonly string[] = [...START_CONVERSATION_EVENTS.window, ...START_CONVERSATION_EVENTS.document];

function dispatchers(event: string): string[] {
  const re = new RegExp(`CustomEvent(?:<[^>]*>)?\\(\\s*'${event}'`);
  return FILES.filter((f) => re.test(f.text)).map((f) => f.path);
}

function listeners(event: string): string[] {
  const re = new RegExp(`(?:addEventListener|addTrackedListener)\\([^;]*?'${event}'`);
  return FILES.filter((f) => re.test(f.text)).map((f) => f.path);
}

describe.each([
  'ferni:start-conversation',
  'ferni:start-journal-voice',
  'ferni:outreach-respond',
  'ferni:notification-click',
  'ferni:toast',
  'ferni:locale-changed',
])('%s', (event) => {
  it('is heard by someone if anyone dispatches it', () => {
    if (dispatchers(event).length === 0) return; // replaced by a direct call
    const heard = STARTERS.includes(event) || listeners(event).length > 0;
    expect(heard, `${event} dispatched from ${dispatchers(event).join(', ')} with no listener`).toBe(true);
  });
});

describe('the conversation starter is wired into the app', () => {
  const app = FILES.find((f) => f.path === 'app.ts')!.text;

  it('registers every start event on the target it is dispatched on', () => {
    expect(app).toContain("createConversationStarter({");
    expect(app).toMatch(/for \(const name of START_CONVERSATION_EVENTS\.window\) \{\s*this\.addTrackedListener\(window, name, startConversation\)/);
    expect(app).toMatch(/for \(const name of START_CONVERSATION_EVENTS\.document\) \{\s*this\.addTrackedListener\(document, name, startConversation\)/);
  });

  it('runs the same connect as the Connect button', () => {
    const connectButton = app.match(/onConnect: \(\) => \{\s*void (this\.connect\(\));/);
    expect(connectButton?.[1]).toBe('this.connect()');
    expect(app).toMatch(/createConversationStarter\(\{\s*connect: \(\) => this\.connect\(\)/);
  });

  it('keeps the dispatch sites on the targets the listeners use', () => {
    const outreach = FILES.find((f) => f.path === 'ui/proactive-outreach.ui.ts')!.text;
    expect(outreach).toContain("document.dispatchEvent(new CustomEvent('ferni:outreach-respond'");
    expect(START_CONVERSATION_EVENTS.document).toContain('ferni:outreach-respond');
  });
});

describe('the locale refresh and the ?panel= deep link are wired into the app', () => {
  const app = FILES.find((f) => f.path === 'app.ts')!.text;

  it('binds the locale refresh after the translations load', () => {
    expect(app.indexOf('bindLocaleRefresh();')).toBeGreaterThan(app.indexOf('await initI18n();'));
  });

  it('opens the panel a notification named in the URL', () => {
    expect(app).toContain('setTimeout(openPanelFromUrl, 500)');
  });
});
