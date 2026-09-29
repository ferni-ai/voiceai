import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/services/music-state-manager.js', () => ({
  getMusicStateManager: () => ({
    notifyUserSpeakingStart: vi.fn(),
    notifyUserSpeakingEnd: vi.fn(),
    notifyAgentSpeakingStart: vi.fn(),
    notifyAgentSpeakingEnd: vi.fn(),
  }),
}));

import {
  dispatchAgentSpeechStart,
  dispatchAgentSpeechEnd,
  initSpeechEventDispatcher,
  disposeSpeechEventDispatcher,
  updateFromAgentState,
} from '../../../src/services/speech-event-dispatcher.js';

describe('speech event dispatcher', () => {
  beforeEach(() => {
    disposeSpeechEventDispatcher();
    initSpeechEventDispatcher();
  });
  afterEach(() => {
    dispatchAgentSpeechEnd();
  });

  it('reaches listeners on window as well as document', () => {
    const onWindow = vi.fn();
    const onDocument = vi.fn();
    window.addEventListener('ferni:agent-speech-start', onWindow);
    document.addEventListener('ferni:agent-speech-start', onDocument);
    dispatchAgentSpeechStart();
    expect(onWindow).toHaveBeenCalledTimes(1);
    expect(onDocument).toHaveBeenCalledTimes(1);
    window.removeEventListener('ferni:agent-speech-start', onWindow);
    document.removeEventListener('ferni:agent-speech-start', onDocument);
  });

  it("turns LiveKit's agent state into clean thinking edges", () => {
    const seen: boolean[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail.thinking);
    document.addEventListener('ferni:thinking', listener);
    updateFromAgentState('listening');
    updateFromAgentState('thinking');
    updateFromAgentState('thinking');
    updateFromAgentState('speaking');
    updateFromAgentState('listening');
    document.removeEventListener('ferni:thinking', listener);
    expect(seen).toEqual([true, false]);
  });
});
