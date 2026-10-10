/**
 * Buttons that ask for a conversation through an event (hub Talk, outreach
 * "let's talk", Chronicle voice switch) used to dispatch into the void. These
 * drive the real buttons and check the app's connect action runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/api.js', () => ({
  apiGet: vi.fn().mockResolvedValue({ ok: false, status: 500, data: null }),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));
vi.mock('../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

const { appState } = await import('../src/state/app.state.js');
const { createConversationStarter, START_CONVERSATION_EVENTS } = await import(
  '../src/app/conversation-starter.js'
);

const connect = vi.fn().mockResolvedValue(undefined);
const selectPersona = vi.fn();
const unbind: Array<() => void> = [];

/** What app.ts registers, using the same event lists. */
function bindLikeApp(): void {
  const starter = createConversationStarter({ connect, selectPersona });
  for (const name of START_CONVERSATION_EVENTS.window) {
    window.addEventListener(name, starter);
    unbind.push(() => window.removeEventListener(name, starter));
  }
  for (const name of START_CONVERSATION_EVENTS.document) {
    document.addEventListener(name, starter);
    unbind.push(() => document.removeEventListener(name, starter));
  }
}

beforeEach(() => {
  connect.mockClear();
  selectPersona.mockClear();
  appState.set('connection', 'disconnected');
  bindLikeApp();
});

afterEach(() => {
  unbind.splice(0).forEach((fn) => fn());
  document.body.innerHTML = '';
});

describe('createConversationStarter', () => {
  it('connects when idle', () => {
    window.dispatchEvent(new CustomEvent('ferni:start-conversation'));
    expect(connect).toHaveBeenCalledTimes(1);
    expect(selectPersona).not.toHaveBeenCalled();
  });

  it('picks the persona first, then connects', () => {
    window.dispatchEvent(
      new CustomEvent('ferni:start-conversation', { detail: { personaId: 'maya-santos' } })
    );
    expect(selectPersona).toHaveBeenCalledWith('maya-santos');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(selectPersona.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0]!);
  });

  it('ignores an unknown persona but still connects', () => {
    window.dispatchEvent(
      new CustomEvent('ferni:start-conversation', { detail: { personaId: 'not-a-persona' } })
    );
    expect(selectPersona).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it.each(['connecting', 'connected'] as const)('does not start a second call while %s', (state) => {
    appState.set('connection', state);
    window.dispatchEvent(new CustomEvent('ferni:start-conversation'));
    window.dispatchEvent(new CustomEvent('ferni:start-journal-voice'));
    expect(connect).not.toHaveBeenCalled();
  });

  it('hands off to the chosen persona when already connected', () => {
    appState.set('connection', 'connected');
    window.dispatchEvent(
      new CustomEvent('ferni:start-conversation', { detail: { personaId: 'peter-john' } })
    );
    expect(selectPersona).toHaveBeenCalledWith('peter-john');
    expect(connect).not.toHaveBeenCalled();
  });

  it('answers Chronicle voice switch', () => {
    window.dispatchEvent(new CustomEvent('ferni:start-journal-voice'));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('answers an outreach respond, which is dispatched on document and does not bubble', () => {
    document.dispatchEvent(
      new CustomEvent('ferni:outreach-respond', { detail: { outreachId: 'o1', type: 'thinking_of_you' } })
    );
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

describe('real buttons', () => {
  it('the hub Talk button starts a conversation', async () => {
    const hub = await import('../src/ui/ferni-hub.ui.js');
    await hub.show();
    const talk = document.querySelector<HTMLButtonElement>('.ferni-hub-talk-btn');
    expect(talk).not.toBeNull();

    talk!.click();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('the outreach "let\'s talk" button starts a conversation', async () => {
    const outreach = await import('../src/ui/proactive-outreach.ui.js');
    outreach.initProactiveOutreachUI();
    outreach.showOutreach({ id: 'o1', type: 'thinking_of_you', message: 'Thinking of you' });
    const respond = document.querySelector<HTMLButtonElement>('.proactive-outreach__action--respond');
    expect(respond).not.toBeNull();

    respond!.click();

    expect(connect).toHaveBeenCalledTimes(1);
    outreach.disposeProactiveOutreachUI();
  });
});
