/**
 * Every way a call ends, on the real connection service with a fake LiveKit room
 * and the real agent-drop watch (#1328):
 * - the agent may end the call only after a planned goodbye (wrap-up on): then the
 *   goodbye's hang-up runs, with the card and no reconnect prompt; on silence, a
 *   crash or anything unclear the call stays up and the reconnect prompt shows;
 * - the room closes after a planned goodbye (wrap-up on): graceful, no notice;
 *   a network drop, or a close after a non-goodbye end, keeps the reconnect notice;
 * - conversation_end: exactly one end sound (a bug fix, flag on or off), and with
 *   wrap-up on the goodbye ceremony and the card;
 * - `ferni:disconnected` on every end, including a hang-up (wrap-up on);
 * - held toasts wait out the after-call card's entrance (wrap-up on);
 * - with the flag off, everything except the sound fix and a room close after a
 *   planned goodbye (the planned end, no "dropped" notice) behaves as before.
 *
 * VoiceAIApp can't be imported in a test (app.ts builds the whole app on load), so
 * `appGlue` mirrors its few call-end lines. The last describe pins app.ts to them.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showPostCallCard = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('../../src/ui/after-call/post-call.js', () => ({ showPostCallCard }));
vi.mock('../../src/services/spotify.service.js', () => ({
  spotifyService: { initialize: vi.fn(async () => false) },
}));

import {
  afterConversationEnd,
  wrapUpOwnsAgentLeaving,
  HELD_TOAST_RELEASE_MS,
  playEndSound,
  RELEASE_HELD_TOASTS_EVENT,
  wrapUpToastSignal,
} from '../../src/app/call-end-paths.js';
import { onCallEnded, onCallStarted, POST_CALL_CARD_DELAY_MS } from '../../src/app/call-end.js';
import { CALL_WRAP_UP_STORAGE_KEY } from '../../src/config/call-wrap-up-flag.js';
import { handleConversationEnd } from '../../src/app/data-message-handlers.js';
import { t } from '../../src/i18n/index.js';
import { AGENT_DROP_PROMPT_FLAG_KEY } from '../../src/config/agent-drop-prompt-flag.js';
import { AGENT_DROP_GRACE_MS } from '../../src/services/agent-drop-watch.js';
import { connectionService } from '../../src/services/connection.service.js';
import { appState, setWrappingUp } from '../../src/state/app.state.js';
import type { ConversationEndEvent } from '../../src/types/events.js';
import {
  hideAfterCallCard,
  showAfterCallCard,
} from '../../src/ui/after-call/after-call-card.ui.js';
import { messageUI } from '../../src/ui/message.ui.js';
import { soundUI } from '../../src/ui/sound.ui.js';

type Handler = (...args: unknown[]) => void;
const AGENT = { identity: 'agent-1', isAgent: true, audioTrackPublications: new Map() };

function createRoom() {
  const handlers = new Map<string, Set<Handler>>();
  const room = {
    state: 'disconnected',
    name: 'voice-1',
    localParticipant: {
      identity: 'me',
      setMicrophoneEnabled: vi.fn(async () => undefined),
      getTrackPublications: vi.fn(() => []),
      publishData: vi.fn(),
    },
    remoteParticipants: new Map<string, unknown>([['agent-1', AGENT]]),
    connect: vi.fn(async () => {
      room.state = 'connected';
    }),
    disconnect: vi.fn(async () => {
      room.state = 'disconnected';
    }),
    on: vi.fn((event: string, cb: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(cb);
      return room;
    }),
    off: vi.fn((event: string, cb: Handler) => {
      handlers.get(event)?.delete(cb);
      return room;
    }),
    emit(event: string, ...args: unknown[]) {
      for (const cb of [...(handlers.get(event) ?? [])]) cb(...args);
    },
  };
  return room;
}

let room: ReturnType<typeof createRoom>;
const notice = vi.fn(); // the "dropped, retry" notice
const oldAgentLeft = vi.fn(); // today's "see you" path when the agent leaves
const reconnectPrompt = vi.fn(); // #1328's "Ferni dropped off the line. Reconnect?"

/** Mirrors VoiceAIApp.disconnect → performGoodbyeCeremony / performStandardDisconnect. */
async function appDisconnect(): Promise<void> {
  const ceremony = appState.get('isWrappingUp');
  if (ceremony) {
    playEndSound('goodbye');
    playEndSound('hangup');
  }
  await connectionService.disconnect();
  onCallEnded();
  if (!ceremony) playEndSound('disconnect');
  setWrappingUp(false);
}

/** Mirrors the call-end lines of VoiceAIApp's connection callbacks and listener. */
const appGlue = {
  onAgentDisconnected: (): void => {
    if (wrapUpOwnsAgentLeaving()) return;
    oldAgentLeft();
  },
  onUnexpectedDisconnect: (): void => {
    if (afterConversationEnd()) return void appDisconnect();
    void appDisconnect().then(() => notice());
  },
  onAgentLost: reconnectPrompt,
  // The app routes data messages to their handlers; this test needs conversation_end.
  onDataMessage: (message: { type?: string }): void => {
    if (message.type === 'conversation_end') handleConversationEnd(message as ConversationEndEvent);
  },
};
const onEndDisconnect = (): void => {
  if (appState.get('connection') === 'connected') void appDisconnect();
};

function setFlag(on: boolean): void {
  localStorage.setItem(CALL_WRAP_UP_STORAGE_KEY, String(on));
}

function setReconnectPrompt(on: boolean): void {
  localStorage.setItem(AGENT_DROP_PROMPT_FLAG_KEY, String(on));
}

async function startCall(): Promise<void> {
  room = createRoom();
  (window as unknown as { LiveKit: unknown }).LiveKit = {
    Room: vi.fn(function () {
      return room;
    }),
    RoomEvent: {},
    Track: { Kind: { Audio: 'audio', Video: 'video' } },
  };
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ token: 't', url: 'wss://lk.example', room: 'voice-1', username: 'Me' }),
  })) as unknown as typeof fetch;
  connectionService.setCallbacks(appGlue);
  await expect(connectionService.connect()).resolves.toBe(true);
  onCallStarted();
  vi.useFakeTimers();
}

/** The agent's participant leaves the room (LiveKit removes it from the map first). */
function agentLeaves(): void {
  room.remoteParticipants.delete('agent-1');
  room.emit('participantDisconnected', AGENT);
}

/** The agent's `conversation_end`, on the data channel as the agent sends it. */
function conversationEnd(reason: ConversationEndEvent['reason'] | string): void {
  const message = { type: 'conversation_end', reason, timestamp: Date.now() };
  room.emit('dataReceived', new TextEncoder().encode(JSON.stringify(message)), AGENT, 'reliable');
}

async function settle(ms = HELD_TOAST_RELEASE_MS + 1): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.dynamicImportSettled();
}

beforeEach(() => {
  showPostCallCard.mockClear();
  notice.mockClear();
  oldAgentLeft.mockClear();
  reconnectPrompt.mockClear();
  window.addEventListener('ferni:conversation-end-disconnect', onEndDisconnect);
});

afterEach(async () => {
  window.removeEventListener('ferni:conversation-end-disconnect', onEndDisconnect);
  await connectionService.disconnect();
  onCallEnded();
  // Let holds and goodbyes finish inside the test that started them.
  if (vi.isFakeTimers()) await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
  setWrappingUp(false);
  localStorage.clear();
});

describe('the agent leaves', () => {
  /** Wrap-up on, with #1328's reconnect prompt on (the default for both decisions). */
  async function liveCall(): Promise<void> {
    setFlag(true);
    setReconnectPrompt(true);
    await startCall();
    expect(appState.get('connection')).toBe('connected');
  }
  /** Ferni's side ended with no goodbye: the call stays up and the prompt shows. */
  function expectReconnectPrompt(): void {
    expect(reconnectPrompt).toHaveBeenCalledTimes(1);
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(appState.get('connection')).toBe('connected');
    expect(showPostCallCard).not.toHaveBeenCalled();
  }

  it('after a planned goodbye: the goodbye ends the call, with the card and no prompt', async () => {
    await liveCall();
    const play = vi.spyOn(soundUI, 'play');

    conversationEnd('goodbye_complete');
    agentLeaves();
    await settle(2000 + AGENT_DROP_GRACE_MS + HELD_TOAST_RELEASE_MS);

    expect(room.disconnect).toHaveBeenCalledTimes(1); // LiveKit stops the local mic track
    expect(appState.get('connection')).toBe('disconnected'); // controls show Call again
    expect(showPostCallCard).toHaveBeenCalledTimes(1);
    expect(play.mock.calls).toEqual([['goodbye', 'goodbye']]);
    expect(reconnectPrompt).not.toHaveBeenCalled();
    expect(oldAgentLeft).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
  });

  it.each(['user_request', 'agent_exit', 'idle_after_goodbye'])(
    'after a planned goodbye (%s): the call ends, no prompt',
    async (reason) => {
      await liveCall();
      conversationEnd(reason);
      agentLeaves();
      await settle(2500 + AGENT_DROP_GRACE_MS + HELD_TOAST_RELEASE_MS);

      expect(room.disconnect).toHaveBeenCalledTimes(1);
      expect(reconnectPrompt).not.toHaveBeenCalled();
    }
  );

  it('with no goodbye (a crash, a timeout): the call stays up and the reconnect prompt shows', async () => {
    await liveCall();

    agentLeaves();
    await settle(AGENT_DROP_GRACE_MS + 1);

    expectReconnectPrompt();
    expect(reconnectPrompt).toHaveBeenCalledWith('agent_left');
    expect(oldAgentLeft).not.toHaveBeenCalled(); // no "See you next time!" next to the prompt
  });

  it("wrap-up turns the prompt on even with the prompt's own flag off: no dead room", async () => {
    setFlag(true);
    setReconnectPrompt(false);
    await startCall();
    const heard = vi.fn();
    document.addEventListener('ferni:disconnected', heard);

    agentLeaves();
    await settle(AGENT_DROP_GRACE_MS + 1);

    document.removeEventListener('ferni:disconnected', heard);
    expectReconnectPrompt();
    expect(oldAgentLeft).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled(); // fires once, when the call really ends
  });

  it('on silence (idle_timeout): no goodbye sound, no hang-up, the reconnect prompt shows', async () => {
    await liveCall();
    const play = vi.spyOn(soundUI, 'play');

    conversationEnd('idle_timeout');
    agentLeaves();
    await settle(AGENT_DROP_GRACE_MS + 2000);

    expectReconnectPrompt();
    expect(reconnectPrompt).toHaveBeenCalledWith('ended_without_goodbye');
    expect(play).not.toHaveBeenCalled();
    expect(appState.get('isWrappingUp')).toBe(false);
  });

  it.each(['graceful_exit_failures', 'timeout', 'something_new'])(
    'after a non-goodbye end (%s): the reconnect prompt, not a hang-up',
    async (reason) => {
      await liveCall();
      conversationEnd(reason);
      agentLeaves();
      await settle(AGENT_DROP_GRACE_MS + 3000);

      expectReconnectPrompt();
    }
  );

  it.each(['graceful_exit_failures', 'idle_timeout', 'something_new'])(
    'a non-goodbye end (%s) with the agent still in the room: the prompt shows at once',
    async (reason) => {
      // The gateway's failure exit says "let me reconnect" and never leaves the room.
      await liveCall();
      conversationEnd(reason);
      await settle(1);

      expectReconnectPrompt();
      await settle(60_000); // and nobody hangs up later
      expect(room.disconnect).not.toHaveBeenCalled();
      expect(reconnectPrompt).toHaveBeenCalledTimes(1);
    }
  );

  it('the agent session ending (agent_session_ended) shows the prompt at once', async () => {
    await liveCall();
    room.emit(
      'dataReceived',
      new TextEncoder().encode(JSON.stringify({ type: 'agent_session_ended', reason: 'error' })),
      AGENT,
      'reliable'
    );
    await settle(1);

    expectReconnectPrompt();
    expect(reconnectPrompt).toHaveBeenCalledWith('session_ended');
  });

  it("prompt's own flag off: a non-goodbye end still never hangs up, the prompt shows", async () => {
    setFlag(true);
    setReconnectPrompt(false);
    await startCall();

    conversationEnd('idle_timeout');
    await settle(2000 + HELD_TOAST_RELEASE_MS);

    expectReconnectPrompt();
  });

  it('flag off: the old path runs and the room stays open', async () => {
    setFlag(false);
    await startCall();

    agentLeaves();
    await settle();

    expect(oldAgentLeft).toHaveBeenCalledTimes(1);
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(appState.get('connection')).toBe('connected');
  });
});

describe('the room closes under us', () => {
  it('after conversation_end (room deleted) it is graceful: no notice, card', async () => {
    setFlag(true);
    await startCall();

    conversationEnd('goodbye_complete');
    room.emit('disconnected', 'ROOM_DELETED');
    await settle();

    expect(notice).not.toHaveBeenCalled();
    expect(showPostCallCard).toHaveBeenCalledTimes(1);
    expect(appState.get('connection')).toBe('disconnected');
  });

  it('after a non-goodbye end (silence), the room closing keeps the reconnect notice', async () => {
    setFlag(true);
    setReconnectPrompt(true);
    await startCall();

    conversationEnd('idle_timeout');
    room.emit('disconnected', 'ROOM_DELETED');
    await settle();

    expect(notice).toHaveBeenCalledTimes(1);
  });

  it('a network drop with no conversation_end keeps the reconnect notice', async () => {
    setFlag(true);
    await startCall();

    room.emit('disconnected', 'SIGNAL_CLOSE');
    await settle();

    expect(notice).toHaveBeenCalledTimes(1);
  });

  it.each(['goodbye_complete', 'idle_after_goodbye'])(
    'flag off: the room closing after a goodbye (%s) is the planned end, not a dropped call',
    async (reason) => {
      // The agent ends calls after a goodbye for everyone now (GOODBYE_ENDS_CALL), and
      // prod web builds never had VITE_CALL_WRAP_UP: a "dropped" notice would greet every goodbye.
      setFlag(false);
      await startCall();

      conversationEnd(reason);
      room.emit('disconnected', 'ROOM_DELETED');
      await settle();

      expect(notice).not.toHaveBeenCalled();
      expect(appState.get('connection')).toBe('disconnected');
    }
  );

  it('flag off: a room close after a non-goodbye end still shows the notice', async () => {
    setFlag(false);
    await startCall();

    conversationEnd('idle_timeout');
    room.emit('disconnected', 'ROOM_DELETED');
    await settle();

    expect(notice).toHaveBeenCalledTimes(1);
  });

  it('a new call attempt forgets the last conversation_end', async () => {
    setFlag(true);
    await startCall();
    conversationEnd('goodbye_complete');
    await settle();
    vi.useRealTimers();

    await startCall();
    expect(afterConversationEnd()).toBe(false);
  });
});

describe('conversation_end', () => {
  it('one goodbye sound, the goodbye ceremony and the card (wrap-up on)', async () => {
    setFlag(true);
    await startCall();
    const play = vi.spyOn(soundUI, 'play');
    let ceremony = false;
    appState.subscribe('isWrappingUp', (on) => (ceremony ||= on));

    conversationEnd('goodbye_complete');
    await settle(2000 + HELD_TOAST_RELEASE_MS);

    expect(play.mock.calls).toEqual([['goodbye', 'goodbye']]);
    expect(ceremony).toBe(true);
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(appState.get('connection')).toBe('disconnected');
    expect(showPostCallCard).toHaveBeenCalledTimes(1);
  });

  it('flag off: the agent ending the call after a goodbye hangs up the app (call shows ended)', async () => {
    setFlag(false);
    await startCall();

    conversationEnd('idle_after_goodbye');
    await settle(2000 + HELD_TOAST_RELEASE_MS);

    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(appState.get('connection')).toBe('disconnected');
    expect(notice).not.toHaveBeenCalled();
  });

  it('flag off: still exactly one sound (bug fix), and no wrap-up', async () => {
    setFlag(false);
    await startCall();
    const play = vi.spyOn(soundUI, 'play');

    conversationEnd('goodbye_complete');
    expect(appState.get('isWrappingUp')).toBe(false);
    await settle(2000 + HELD_TOAST_RELEASE_MS);

    expect(play.mock.calls).toEqual([['goodbye', 'goodbye']]);
  });

  it("the agent's hang-up: the phone click is the only sound", async () => {
    setFlag(false);
    await startCall();
    setWrappingUp(true); // even after a wrap-up, no second ceremony sound
    const play = vi.spyOn(soundUI, 'play');

    conversationEnd('agent_exit');
    await settle(1500 + HELD_TOAST_RELEASE_MS);

    expect(play.mock.calls).toEqual([['phoneClick', 'goodbye']]);
  });

  it('says goodbye with the translated string, not hardcoded English', async () => {
    setFlag(false);
    await startCall();
    const show = vi.spyOn(messageUI, 'show');

    conversationEnd('goodbye_complete');

    expect(show).toHaveBeenCalledWith(t('agentNotices.seeYou'), 'info', 2000);
    const source = readFileSync(join(__dirname, '../../src/app/data-message-handlers.ts'), 'utf8');
    expect(source).not.toContain("'See you next time!'");
  });

  it('a hang-up with no conversation_end keeps its own sound', async () => {
    setFlag(false);
    await startCall();
    const play = vi.spyOn(soundUI, 'play');

    await appDisconnect();

    expect(play.mock.calls).toEqual([['disconnect', 'goodbye']]);
  });
});

describe('ferni:disconnected', () => {
  it('fires once when the person hangs up (wrap-up on)', async () => {
    setFlag(true);
    await startCall();
    const heard = vi.fn();
    document.addEventListener('ferni:disconnected', heard);

    await appDisconnect();
    await appDisconnect(); // a second report of the same end

    document.removeEventListener('ferni:disconnected', heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('flag off: a hang-up does not fire it (unchanged)', async () => {
    setFlag(false);
    await startCall();
    const heard = vi.fn();
    document.addEventListener('ferni:disconnected', heard);

    await appDisconnect();

    document.removeEventListener('ferni:disconnected', heard);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('held toasts', () => {
  it('wait until after the card has arrived, then go once', async () => {
    setFlag(true);
    await startCall();
    const released = vi.fn();
    const stop = wrapUpToastSignal.onCallEnd(released);

    await appDisconnect();
    expect(wrapUpToastSignal.isLive()).toBe(true); // still held

    await settle(POST_CALL_CARD_DELAY_MS + 1);
    expect(showPostCallCard).toHaveBeenCalledTimes(1);
    expect(released).not.toHaveBeenCalled(); // not on top of the card's entrance

    await settle(HELD_TOAST_RELEASE_MS - POST_CALL_CARD_DELAY_MS);
    expect(released).toHaveBeenCalledTimes(1);
    expect(wrapUpToastSignal.isLive()).toBe(false);
    stop();
  });

  it('go as soon as the person closes the after-call card', async () => {
    setFlag(true);
    await startCall();
    const released = vi.fn();
    window.addEventListener(RELEASE_HELD_TOASTS_EVENT, released);

    await appDisconnect();
    await settle(POST_CALL_CARD_DELAY_MS + 1);
    showAfterCallCard(
      { remembered: [], nextStep: null } as unknown as Parameters<typeof showAfterCallCard>[0],
      { personaName: 'Ferni', onSupport: vi.fn() }
    );
    hideAfterCallCard(true);

    window.removeEventListener(RELEASE_HELD_TOASTS_EVENT, released);
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('flag off: no release signal (the gate keeps its connection-based release)', async () => {
    setFlag(false);
    await startCall();
    const released = vi.fn();
    window.addEventListener(RELEASE_HELD_TOASTS_EVENT, released);

    await appDisconnect();
    await settle();

    window.removeEventListener(RELEASE_HELD_TOASTS_EVENT, released);
    expect(released).not.toHaveBeenCalled();
  });
});

describe('translations', () => {
  const dir = join(__dirname, '../../src/i18n/locales');
  const locales = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('covers all 11 locales', () => {
    expect(locales).toHaveLength(11);
  });

  it.each(locales)('%s has app.seeYouNextTime', (file) => {
    const locale = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
      app?: { seeYouNextTime?: unknown };
    };
    const value = locale.app?.seeYouNextTime;
    expect(typeof value).toBe('string');
    expect((value as string).trim()).not.toBe('');
  });
});

describe('app.ts runs these paths (what appGlue mirrors)', () => {
  const app = readFileSync(join(__dirname, '../../src/app.ts'), 'utf8');

  it('the agent leaving and the room closing go through the wrap-up checks', () => {
    expect(app).toMatch(
      /onAgentDisconnected: \(\) => \{\s*if \(wrapUpOwnsAgentLeaving\(\)\) return presenceUI\.setSpeaking\(false\);/
    );
    expect(app).toMatch(/onAgentLost: \(\) => \{\s*noteCallDropped\(\);\s*showAgentLostPrompt\(/);
    expect(app).toMatch(
      /onUnexpectedDisconnect: \(reason\) => \{\s*if \(afterConversationEnd\(\)\) return void this\.disconnect\(\);/
    );
  });

  it('every hang-up sound goes through playEndSound', () => {
    for (const sound of ['goodbye', 'hangup', 'disconnect']) {
      expect(app).toContain(`playEndSound('${sound}')`);
      expect(app).not.toContain(`soundUI.play('${sound}')`);
    }
  });
});
