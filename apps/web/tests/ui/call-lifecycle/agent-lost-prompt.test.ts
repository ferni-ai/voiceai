/**
 * When Ferni drops off a live call, the caller gets one notice with Reconnect
 * (hang up this dead call, then the app's normal connect path) and End call.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  showAgentLostPrompt,
  showAudioNotStartedPrompt,
} from '../../../src/app/agent-lost-prompt.js';
import { connectFailure } from '../../../src/services/connect-failure.js';
import { clearCallNotice } from '../../../src/ui/call-status.ui.js';

const notice = () => document.querySelector<HTMLElement>('.call-status');
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.call-status button')].find(
    (b) => b.textContent === label
  );

function fakeCall() {
  const order: string[] = [];
  return {
    order,
    endCall: vi.fn(async () => {
      order.push('endCall');
    }),
    connect: vi.fn(async () => {
      order.push('connect');
    }),
  };
}

beforeEach(() => {
  clearCallNotice();
  document.body.innerHTML = '<main><div class="controls-row"></div></main>';
});

describe('showAgentLostPrompt', () => {
  it('says Ferni dropped off, as an alert, with Reconnect and End call', () => {
    showAgentLostPrompt(fakeCall());

    expect(notice()?.getAttribute('role')).toBe('alert');
    expect(notice()?.textContent).toContain('Ferni dropped off the line.');
    expect(button('Reconnect')).toBeDefined();
    expect(button('End call')).toBeDefined();
  });

  it('moves keyboard focus to Reconnect', () => {
    showAgentLostPrompt(fakeCall());
    expect(document.activeElement).toBe(button('Reconnect'));
  });

  it('Reconnect hangs up the dead call, then takes the connect path', async () => {
    const call = fakeCall();
    showAgentLostPrompt(call);

    button('Reconnect')?.click();

    await vi.waitFor(() => expect(call.connect).toHaveBeenCalledOnce());
    expect(call.order).toEqual(['endCall', 'connect']);
    expect(notice()).toBeNull();
  });

  it('End call hangs up without reconnecting', async () => {
    const call = fakeCall();
    showAgentLostPrompt(call);

    button('End call')?.click();

    await vi.waitFor(() => expect(call.endCall).toHaveBeenCalledOnce());
    expect(call.connect).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
  });

  it('has its own message, distinct from a dropped connection', () => {
    expect(connectFailure('agent_left').message).not.toBe(connectFailure('dropped').message);
  });
});

describe('showAudioNotStartedPrompt', () => {
  it('says the sound did not start, with one Try again', () => {
    showAudioNotStartedPrompt(fakeCall());

    expect(notice()?.getAttribute('role')).toBe('alert');
    expect(notice()?.dataset['kind']).toBe('audio_not_started');
    expect(notice()?.textContent).toContain("The sound didn't start. Try again in a moment.");
    const labels = [...document.querySelectorAll('.call-status button')].map((b) => b.textContent);
    expect(labels).toEqual(['Try again']);
    expect(document.activeElement).toBe(button('Try again'));
  });

  it('Try again hangs up the silent call, then takes the connect path', async () => {
    const call = fakeCall();
    showAudioNotStartedPrompt(call);

    button('Try again')?.click();

    await vi.waitFor(() => expect(call.connect).toHaveBeenCalledOnce());
    expect(call.order).toEqual(['endCall', 'connect']);
    expect(notice()).toBeNull();
  });
});
