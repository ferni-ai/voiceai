/**
 * CALL_WRAP_UP after the goodbyes: no silence remark, early check-in or
 * presence sound, and a short idle window that ends the call through the same
 * wrap-up as endCall. With it and GOODBYE_ENDS_CALL off, none of it happens.
 */
import { llm, voice } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { EventEmitter } from 'node:events';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { generateReplyWithContext } = vi.hoisted(() => ({ generateReplyWithContext: vi.fn() }));
vi.mock('../safe-generate-reply.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../safe-generate-reply.js')>()),
  generateReplyWithContext,
}));

import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { createPresenceWatcher } from '../../integrations/presence-watcher.js';
import { SILENCE_THRESHOLDS } from '../constants.js';
import { silenceResponseBlocked } from '../../voice-agent/silence-response-blockers.js';
import {
  setupSessionStateHandlers,
  type SessionStateContext,
} from '../../voice-agent/session-state-handler.js';
import {
  initFrontendSignal,
  resetFrontendSignal,
} from '../../../services/communication/frontend-signal.js';
import {
  clearFarewell,
  farewellSaid,
  IDLE_AFTER_GOODBYE_MS,
  markFarewell,
  stayQuietOn,
} from '../call-farewell.js';
import { attachCallWrapUp, REMOVAL_GRACE_MS, wrapUpCall } from '../call-wrap-up.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';

const used: string[] = [];
let n = 0;
const newId = (): string => {
  const id = `quiet-${++n}`;
  used.push(id);
  return id;
};
afterEach(() => {
  used.splice(0).forEach((id) => {
    clearFarewell(id);
    clearSessionClosing(id);
  });
  resetFrontendSignal();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  generateReplyWithContext.mockReset();
});

const goodbyes = (session: EventEmitter) => {
  const say = (role: string, text: string) =>
    session.emit(voice.AgentSessionEventTypes.ConversationItemAdded, {
      item: { type: 'message', role, textContent: text },
    });
  say('user', 'okay, gotta go, bye');
  session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'speaking' });
  say('assistant', 'Go on then, take care.');
  session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'listening' });
};

function agent(): PersonaVoiceAgent {
  const tool = llm.tool({
    name: 'getWeather',
    description: 'weather',
    parameters: z.object({}),
    execute: async () => 'ok',
  });
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: new llm.ToolContext([tool]) as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

/** An app (or phone) call wired the way persona-agent-factory wires it, with a manual clock. */
async function appCall(
  env: Record<string, string>,
  kind = ParticipantKind.STANDARD,
  onBehalf = false
) {
  const sessionId = newId();
  const session = new EventEmitter();
  const events: string[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 0;
  initFrontendSignal(sessionId, async (type, data) => {
    events.push(`${type} ${String(data?.reason)}`);
  });
  const a = agent();
  const added = await attachCallWrapUp(a, {
    sessionId,
    room: { name: `room-${sessionId}`, remoteParticipants: { size: 1 } },
    session,
    participant: { kind },
    onBehalf,
    env,
    hangUp: async (room) => void events.push(`deleted ${room}`),
    setTimer: (fn, ms) => {
      timers.set(++next, { fn, ms });
      return next;
    },
    clearTimer: (h) => void timers.delete(h as number),
  });
  const fire = async (ms: number) => {
    for (const [id, t] of [...timers]) {
      if (t.ms !== ms) continue;
      timers.delete(id);
      t.fn();
    }
    await new Promise((r) => {
      setTimeout(r, 0);
    });
  };
  return { sessionId, session, events, timers, fire, a, added };
}

describe('idle window after the goodbyes', () => {
  it('ends the call: idle_after_goodbye, closing, then the room after the grace', async () => {
    vi.stubEnv('CALL_WRAP_UP', 'on');
    const c = await appCall({ CALL_WRAP_UP: 'on' });
    goodbyes(c.session);
    expect([...c.timers.values()].map((t) => t.ms)).toEqual([IDLE_AFTER_GOODBYE_MS]);
    expect(isSessionClosing(c.sessionId)).toBe(false);

    await c.fire(IDLE_AFTER_GOODBYE_MS);
    expect(c.events).toEqual(['conversation_end idle_after_goodbye']);
    expect(isSessionClosing(c.sessionId)).toBe(true);

    await c.fire(REMOVAL_GRACE_MS);
    expect(c.events).toEqual([
      'conversation_end idle_after_goodbye',
      `deleted room-${c.sessionId}`,
    ]);
  });

  it.each([
    ['app', ParticipantKind.STANDARD],
    ['phone', ParticipantKind.SIP],
  ])(
    "default-on: a %s call placed on the user's behalf never ends on goodbyes",
    async (_, kind) => {
      const own = await appCall({}, kind);
      goodbyes(own.session);
      expect([...own.timers.values()].map((t) => t.ms)).toEqual([IDLE_AFTER_GOODBYE_MS]);

      const c = await appCall({}, kind, true);
      goodbyes(c.session);
      expect(c.timers.size).toBe(0);
      await c.fire(IDLE_AFTER_GOODBYE_MS);
      expect(c.events).toEqual([]);
      expect(isSessionClosing(c.sessionId)).toBe(false);
    }
  );

  it('both flags off: the goodbyes arm nothing and the call carries on as before', async () => {
    const c = await appCall({ GOODBYE_ENDS_CALL: 'off' });
    goodbyes(c.session);
    expect(c.timers.size).toBe(0);
    expect(c.session.listenerCount(voice.AgentSessionEventTypes.ConversationItemAdded)).toBe(0);
    expect(stayQuietOn(c.session, { CALL_WRAP_UP: 'on' })).toBe(false);
    expect(c.events).toEqual([]);
  });
});

describe('phone calls after the goodbyes', () => {
  const { SIP } = ParticipantKind;
  const blocked = (id: string) =>
    silenceResponseBlocked(id, undefined, 30, { lastUserMessage: 'bye' });

  it('CALL_WRAP_UP on: quiet after the goodbyes, then the idle end hangs up the line', async () => {
    vi.stubEnv('CALL_WRAP_UP', 'on');
    const c = await appCall({ CALL_WRAP_UP: 'on', PHONE_GOODBYE: 'on' }, SIP);
    expect(c.added).toBe(true); // PHONE_GOODBYE's endCall, kept
    expect(c.a.toolCtx.functionTools.endCall?.description).toMatch(/Hang up this phone call/);
    expect(blocked(c.sessionId)).toBe(false);

    goodbyes(c.session);
    expect(stayQuietOn(c.session)).toBe(true);
    expect(blocked(c.sessionId)).toBe(true); // no silence remark after "bye"
    expect([...c.timers.values()].map((t) => t.ms)).toEqual([IDLE_AFTER_GOODBYE_MS]);

    await c.fire(IDLE_AFTER_GOODBYE_MS);
    expect(isSessionClosing(c.sessionId)).toBe(true);
    await c.fire(0); // no app to leave on its own: the line drops at once
    expect(c.events.at(-1)).toBe(`deleted room-${c.sessionId}`);
  });

  it('CALL_WRAP_UP and GOODBYE_ENDS_CALL off: a phone call watches nothing, as before', async () => {
    const c = await appCall({ PHONE_GOODBYE: 'on', GOODBYE_ENDS_CALL: 'off' }, SIP);
    expect(c.added).toBe(true);
    goodbyes(c.session);
    // Only the caller watch, which holds PHONE_GOODBYE's hang-up while they talk (#2291)
    expect(c.session.listenerCount(voice.AgentSessionEventTypes.ConversationItemAdded)).toBe(1);
    expect(c.timers.size).toBe(0);
    expect(stayQuietOn(c.session, { CALL_WRAP_UP: 'on' })).toBe(false);
    expect(blocked(c.sessionId)).toBe(false);
  });
});

describe('GOODBYE_ENDS_CALL on, CALL_WRAP_UP off (prod today)', () => {
  it("a phone call ends after the goodbyes, but the quiet stays CALL_WRAP_UP's", async () => {
    const c = await appCall({ PHONE_GOODBYE: 'on' }, ParticipantKind.SIP);
    goodbyes(c.session);
    expect(stayQuietOn(c.session, {})).toBe(false); // silence remarks etc. unchanged
    await c.fire(IDLE_AFTER_GOODBYE_MS);
    await c.fire(0);
    expect(c.events.at(-1)).toBe(`deleted room-${c.sessionId}`);
  });
});

describe('quiet after the goodbyes', () => {
  it('endCall sets the farewell as soon as it starts', async () => {
    const id = newId();
    let saidDuringPlayout = false;
    await wrapUpCall(
      { sessionId: id, roomName: 'r', callerInRoom: () => false, setTimer: () => undefined },
      'goodbye_complete',
      async () => {
        saidDuringPlayout = farewellSaid(id);
      }
    );
    expect(saidDuringPlayout).toBe(true);
  });

  it('blocks the silence remark only once both have said goodbye, with the flag on', () => {
    vi.stubEnv('CALL_WRAP_UP', 'on');
    const id = newId();
    expect(silenceResponseBlocked(id, undefined, 30, { lastUserMessage: 'bye' })).toBe(false);
    markFarewell(id, 'goodbyes');
    expect(silenceResponseBlocked(id, undefined, 30, { lastUserMessage: 'bye' })).toBe(true);
    vi.stubEnv('CALL_WRAP_UP', 'off');
    expect(silenceResponseBlocked(id, undefined, 30, { lastUserMessage: 'bye' })).toBe(false);
  });

  it('plays no whistle or snore after the goodbyes', async () => {
    vi.stubEnv('CALL_WRAP_UP', 'on');
    const run = async (sayGoodbye: boolean) => {
      const c = await appCall({ CALL_WRAP_UP: 'on' });
      if (sayGoodbye) goodbyes(c.session);
      vi.useFakeTimers();
      const play = vi.fn(() => true);
      const w = createPresenceWatcher({
        play,
        stop: () => undefined,
        mood: () => undefined,
        rng: () => 0,
        quiet: () => stayQuietOn(c.session),
      });
      for (let i = 0; i < 3; i++) {
        w.onAgentState('speaking');
        w.onAgentState('listening');
      }
      vi.advanceTimersByTime(30_000);
      vi.useRealTimers();
      return play.mock.calls.length;
    };
    expect(await run(false)).toBe(1);
    expect(await run(true)).toBe(0);
  });
});

describe('early check-in after the goodbyes', () => {
  const prev = process.env.TURN_KEEPER;
  beforeAll(async () => {
    process.env.TURN_KEEPER = 'off';
    await import('../call-farewell.js');
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.TURN_KEEPER;
    else process.env.TURN_KEEPER = prev;
  });

  async function checkInsAfterSilence(farewell: boolean): Promise<number> {
    vi.stubEnv('CALL_WRAP_UP', 'on');
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sessionId = newId();
    if (farewell) markFarewell(sessionId, 'goodbyes');
    const session = Object.assign(new EventEmitter(), {
      agentState: 'listening',
      userState: 'listening',
      interrupt: () => undefined,
    });
    const handlers = setupSessionStateHandlers({
      session,
      sessionPersona: { id: 'ferni', name: 'Ferni' },
      conversationManager: {
        isAgentSpeaking: () => false,
        handleUserFinishedSpeaking: () => undefined,
      },
      userData: {},
      sessionId,
    } as unknown as SessionStateContext);
    const emit = (newState: string, oldState: string) => {
      for (const h of session.listeners(voice.AgentSessionEventTypes.UserStateChanged)) {
        try {
          (h as (e: unknown) => void)({ newState, oldState });
        } catch {
          // Work further down the handler may need a live session; not under test.
        }
      }
    };
    emit('listening', 'speaking');
    await vi.advanceTimersByTimeAsync(SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000 + 50);
    await vi.dynamicImportSettled();
    handlers.clearTimers();
    vi.mocked(Math.random).mockRestore();
    return generateReplyWithContext.mock.calls.filter(
      ([, o]) => (o as { logContext?: string }).logContext === 'early-dead-air-checkin'
    ).length;
  }

  it('checks in on an ordinary silence but not after the goodbyes', async () => {
    expect(await checkInsAfterSilence(false)).toBe(1);
    generateReplyWithContext.mockReset();
    expect(await checkInsAfterSilence(true)).toBe(0);
  });
});
