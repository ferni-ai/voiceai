/**
 * /a/:id and /p/:id must never render inside a frame: the hosting config
 * sends no-framing headers, and the page itself refuses when framed anyway.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { refuseFraming } from '../src/utils/frame-guard';

function fakeWindow(top: unknown): Window {
  const body = document.createElement('body');
  body.append(document.createElement('main'));
  const win = { document: { body }, top } as unknown as Window & { self: Window };
  (win as { self: Window }).self = win;
  if (top === 'self') (win as { top: Window }).top = win;
  return win;
}

describe('refuseFraming', () => {
  it('lets a top-level page render', () => {
    const win = fakeWindow('self');
    expect(refuseFraming(win)).toBe(false);
    expect(win.document.body.children).toHaveLength(1);
  });

  it('empties the page inside a frame', () => {
    const win = fakeWindow({});
    expect(refuseFraming(win)).toBe(true);
    expect(win.document.body.children).toHaveLength(0);
  });

  it('treats an unreadable parent as a frame', () => {
    const win = fakeWindow('self');
    Object.defineProperty(win, 'top', {
      get() {
        throw new Error('cross-origin');
      },
    });
    expect(refuseFraming(win)).toBe(true);
  });
});

describe('Firebase Hosting headers', () => {
  const config = JSON.parse(readFileSync(join(__dirname, '..', 'firebase.json'), 'utf8')) as {
    hosting: Array<{
      target: string;
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    }>;
  };

  it.each(['/a/**', '/p/**'])('every target forbids framing %s', (source) => {
    for (const site of config.hosting) {
      const rule = site.headers.find((h) => h.source === source);
      const value = (key: string) => rule?.headers.find((h) => h.key === key)?.value;
      expect(value('X-Frame-Options'), site.target).toBe('DENY');
      expect(value('Content-Security-Policy'), site.target).toBe("frame-ancestors 'none'");
    }
  });
});
