/**
 * Call failures get ONE notice with a specific message and the action that fixes it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyConnectError,
  connectFailure,
  TokenRequestError,
} from '../../../src/services/connect-failure.js';
import { clearCallNotice, showCallNotice } from '../../../src/ui/call-status.ui.js';

const notices = () => document.querySelectorAll('.call-status');
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('.call-status button')];

beforeEach(() => {
  clearCallNotice();
  document.body.innerHTML = '<main><div class="controls-row"></div></main>';
});

describe('classifyConnectError', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
  ] as const)('gives /token %i its own message', (status, kind) => {
    const failure = classifyConnectError(new TokenRequestError(status, 'x'));
    expect(failure.kind).toBe(kind);
    expect(failure.message).not.toBe(connectFailure('unknown').message);
  });

  it('recognises a blocked microphone', () => {
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    expect(classifyConnectError(err).kind).toBe('mic_denied');
  });

  it('gives every failure kind a distinct message', () => {
    const kinds = [
      'unauthorized',
      'forbidden',
      'rate_limited',
      'unavailable',
      'server_error',
      'mic_denied',
      'agent_unavailable',
      'agent_timeout',
      'timeout',
      'network',
      'dropped',
      'agent_left',
      'unknown',
    ] as const;
    const messages = kinds.map((k) => connectFailure(k).message);
    expect(new Set(messages).size).toBe(kinds.length);
  });
});

describe('showCallNotice', () => {
  it('replaces the previous notice instead of stacking', () => {
    showCallNotice(connectFailure('network'), { onRetry: vi.fn() });
    showCallNotice(connectFailure('rate_limited'), { onRetry: vi.fn() });

    expect(notices()).toHaveLength(1);
    expect(notices()[0]?.textContent).toContain(connectFailure('rate_limited').message);
  });

  it('retries from the notice and removes it', () => {
    const onRetry = vi.fn();
    showCallNotice(connectFailure('agent_timeout'), { onRetry });

    buttons()
      .find((b) => b.textContent === 'Try again')
      ?.click();

    expect(onRetry).toHaveBeenCalledOnce();
    expect(notices()).toHaveLength(0);
  });

  it('offers Reconnect after a dropped call', () => {
    showCallNotice(connectFailure('dropped'), { onRetry: vi.fn() });
    expect(buttons().map((b) => b.textContent)).toEqual(['Reconnect']);
  });

  it('explains how to allow the microphone and offers a retry when it is blocked', () => {
    const onRetry = vi.fn();
    showCallNotice(connectFailure('mic_denied'), { onRetry });
    const help = document.querySelector<HTMLElement>('.call-status__help');
    expect(help?.hidden).toBe(true);

    buttons()
      .find((b) => b.textContent === 'How to allow')
      ?.click();
    expect(help?.hidden).toBe(false);
    expect(help?.textContent).toMatch(/Microphone to Allow/);

    buttons()
      .find((b) => b.textContent === 'Try again')
      ?.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows nothing for a cancelled attempt', () => {
    showCallNotice(connectFailure('network'), { onRetry: vi.fn() });
    showCallNotice(connectFailure('cancelled'), { onRetry: vi.fn() });
    expect(notices()).toHaveLength(0);
  });

  it('sits right under the call controls in reading order', () => {
    showCallNotice(connectFailure('network'), { onRetry: vi.fn() });
    expect(document.querySelector('.controls-row')?.nextElementSibling?.id).toBe(
      'callStatusNotice'
    );
  });

  // 2026-10-18 UI audit: in the column, the notice pushed the three buttons under
  // the controls off a 1280x800 screen (the page doesn't scroll). It floats now.
  it('floats just above the controls instead of pushing the column down', () => {
    const controls = document.querySelector<HTMLElement>('.controls-row')!;
    controls.getBoundingClientRect = () => ({ top: 587, bottom: 639, height: 52, width: 400, left: 0, right: 400, x: 0, y: 587 }) as DOMRect;
    Object.assign(window, { innerHeight: 800 });
    showCallNotice(connectFailure('server_error'), { onRetry: vi.fn() });

    const notice = document.getElementById('callStatusNotice')!;
    // 800 - 587 + 16 px gap: its bottom edge sits just above Connect
    expect(notice.style.getPropertyValue('--call-card-bottom')).toBe('229px');
    const css = document.getElementById('call-status-styles')?.textContent ?? '';
    const rule = css.match(/\.call-status\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).not.toMatch(/margin-top/);
  });

  it('stops following the viewport once cleared', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    showCallNotice(connectFailure('server_error'), { onRetry: vi.fn() });
    clearCallNotice();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    remove.mockRestore();
  });
});
