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

  it('sits right under the call controls', () => {
    showCallNotice(connectFailure('network'), { onRetry: vi.fn() });
    expect(document.querySelector('.controls-row')?.nextElementSibling?.id).toBe(
      'callStatusNotice'
    );
  });
});
