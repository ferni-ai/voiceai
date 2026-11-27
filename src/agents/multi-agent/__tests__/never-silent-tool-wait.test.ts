/**
 * NEVER_SILENT_TOOL_WAIT (never-silent-tool-wait.ts): a running tool keeps its own wait, and the
 * caller hears one honest line, never a re-ask. The real guard (createNeverSilentGuard) runs on a
 * fake session with fake timers; the real-session rows are in never-silent.sdk.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signalToolCallRequested } from '../../voice-agent/empty-response-watchdog.js';
import { createNeverSilentGuard, FALLBACK_LINES } from '../never-silent.js';
import { installNeverSilent } from '../never-silent-install.js';
import { createToolWait, toolWaitOn, withToolWait } from '../never-silent-tool-wait.js';

/** The words the caller hears, pinned here: never a re-ask. */
const STILL_WORKING_LINE = 'Still on it, one sec.';

function setup(opts: { toolWait?: boolean; mode?: 'on' | 'shadow'; quiet?: boolean } = {}) {
  const said: string[] = [];
  const logs: Array<Record<string, unknown>> = [];
  const session = {
    agentState: 'listening',
    userState: 'listening',
    output: { audio: {}, audioEnabled: true },
    interrupts: 0,
    say(text: string) {
      said.push(text);
    },
    interrupt() {
      this.interrupts += 1;
    },
  };
  // Composed as never-silent-install.ts composes it.
  const on = opts.toolWait ?? true;
  const shared = { session, mode: opts.mode ?? 'on', stayQuiet: () => opts.quiet ?? false };
  const log = (f: Record<string, unknown>) => logs.push(f);
  const wait = on ? createToolWait({ ...shared, waitMs: 5000, log }) : null;
  const guard = withToolWait(
    createNeverSilentGuard({ ...shared, hangMs: 5000, toolHoldMs: 15_000, toolWait: on, log }),
    wait
  );
  const state = (s: string) => {
    session.agentState = s;
    guard.onAgentState({ newState: s });
  };
  /** A caller turn as LiveKit runs it: speech created, message committed, thinking. */
  const turn = () => {
    guard.onSpeechCreated({ speechHandle: { interrupted: false, done: () => false } });
    guard.onItemAdded({ item: { role: 'user' } });
    state('thinking');
  };
  /** The model says a short lead-in ("Sure.") and the tool is still running after it. */
  const leadIn = () => {
    state('speaking');
    state('listening');
  };
  return { session, said, logs, guard, state, turn, leadIn };
}

const reAsks = (said: string[]) =>
  said.filter((t) => (FALLBACK_LINES as readonly string[]).includes(t));

describe('NEVER_SILENT_TOOL_WAIT', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is off by default', () => {
    expect(toolWaitOn({})).toBe(false);
    expect(toolWaitOn({ NEVER_SILENT_TOOL_WAIT: 'on' })).toBe(true);
  });

  it('flag off: a lead-in then a tool that hangs stays silent, as on main', () => {
    const h = setup({ toolWait: false });
    h.turn();
    h.guard.onToolsRequested();
    h.leadIn();
    vi.advanceTimersByTime(60_000);
    expect(h.said).toEqual([]);
  });

  it('a lead-in then a tool that hangs: the still-working line, once', () => {
    const h = setup();
    h.turn();
    h.guard.onToolsRequested();
    h.leadIn();
    vi.advanceTimersByTime(4999);
    expect(h.said).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(h.said).toEqual([STILL_WORKING_LINE]);
    vi.advanceTimersByTime(60_000);
    expect(h.said).toEqual([STILL_WORKING_LINE]);
    expect(h.logs).toEqual([{ reason: 'tool_wait', sinceToolMs: 5000, mode: 'on' }]);
  });

  it('a tool that hangs with no lead-in: the still-working line, never a re-ask', () => {
    const h = setup();
    h.turn();
    h.guard.onToolsRequested(); // the agent stays 'thinking' while the tool runs
    vi.advanceTimersByTime(60_000);
    expect(h.said).toEqual([STILL_WORKING_LINE]);
    expect(reAsks(h.said)).toEqual([]);
    expect(h.session.interrupts).toBe(0);
  });

  it('a lead-in still playing when the wait runs out: the line waits for it to finish', () => {
    const h = setup();
    h.turn();
    h.guard.onToolsRequested();
    h.state('speaking');
    vi.advanceTimersByTime(5000);
    expect(h.said).toEqual([]);
    h.state('listening');
    vi.advanceTimersByTime(5000);
    expect(h.said).toEqual([STILL_WORKING_LINE]);
  });

  it('a tool that returns in time: no line', () => {
    const h = setup();
    h.turn();
    h.guard.onToolsRequested();
    h.leadIn();
    vi.advanceTimersByTime(3000);
    h.guard.onToolsExecuted();
    h.state('thinking');
    h.state('speaking'); // the reply with the tool's result
    h.state('listening');
    vi.advanceTimersByTime(60_000);
    expect(h.said).toEqual([]);
  });

  it('a crisis line said while a tool runs: no line, and its reply is never interrupted', () => {
    const h = setup();
    h.turn();
    h.guard.onToolsRequested();
    h.leadIn();
    vi.advanceTimersByTime(2000);
    // The caller speaks over the wait (a crisis line), and that turn's reply is generated.
    h.session.userState = 'speaking';
    h.guard.onUserState({ newState: 'speaking' });
    h.session.userState = 'listening';
    h.guard.onUserState({ newState: 'listening' });
    h.turn();
    vi.advanceTimersByTime(4999); // past the tool's wait, before that turn's own deadline
    expect(h.said).toEqual([]);
    expect(h.session.interrupts).toBe(0);
    h.state('speaking'); // the crisis reply plays
    h.state('listening');
    vi.advanceTimersByTime(60_000);
    expect(h.said).not.toContain(STILL_WORKING_LINE);
  });

  it('the caller speaks over the wait with no turn committed: no line', () => {
    const h = setup();
    h.turn();
    h.guard.onToolsRequested();
    h.leadIn();
    h.session.userState = 'speaking';
    h.guard.onUserState({ newState: 'speaking' });
    h.session.userState = 'listening';
    h.guard.onUserState({ newState: 'listening' });
    vi.advanceTimersByTime(60_000);
    expect(h.said).toEqual([]);
  });

  it('a new caller turn committed while the tool runs (typed, no speech event): no line', () => {
    const h = setup();
    h.turn();
    h.guard.onToolsRequested();
    h.leadIn();
    h.guard.onItemAdded({ item: { role: 'user' } });
    h.leadIn(); // that turn's reply plays
    vi.advanceTimersByTime(60_000);
    expect(h.said).toEqual([]);
  });

  it('installNeverSilent with the flag on: a tool that hangs gets the line, never the re-ask', () => {
    const handlers = new Map<string, Array<(ev: unknown) => void>>();
    const emit = (event: string, ev: unknown) => handlers.get(event)?.forEach((h) => h(ev));
    const said: string[] = [];
    const session = {
      agentState: 'listening',
      userState: 'listening',
      output: { audio: {}, audioEnabled: true },
      say: (text: string) => said.push(text),
      interrupt: () => undefined,
    };
    const cleanupFunctions: Array<() => void> = [];
    installNeverSilent(
      {
        session: session as never,
        sessionWithEvents: {
          on: (event, h) => handlers.set(event, [...(handlers.get(event) ?? []), h as never]),
        },
        sessionEventHandlers: [],
        cleanupFunctions,
        sessionId: 'ns-tool-wait-install',
        userId: undefined,
      },
      { NEVER_SILENT: 'on', NEVER_SILENT_TOOL_WAIT: 'on' },
      async () => ({ failure: 'no_voice' })
    );
    emit('speech_created', { speechHandle: { interrupted: false, done: () => false } });
    emit('conversation_item_added', { item: { role: 'user' } });
    session.agentState = 'thinking';
    emit('agent_state_changed', { newState: 'thinking' });
    signalToolCallRequested(session, ['slowLookup']);
    vi.advanceTimersByTime(60_000);
    expect(said).toEqual([STILL_WORKING_LINE]);
    cleanupFunctions.forEach((fn) => fn());
  });

  it('shadow logs the wait without speaking; stay-quiet skips it', () => {
    const shadow = setup({ mode: 'shadow' });
    shadow.turn();
    shadow.guard.onToolsRequested();
    vi.advanceTimersByTime(5000);
    expect(shadow.said).toEqual([]);
    expect(shadow.logs).toEqual([{ reason: 'tool_wait', sinceToolMs: 5000, mode: 'shadow' }]);

    const quiet = setup({ quiet: true });
    quiet.turn();
    quiet.guard.onToolsRequested();
    vi.advanceTimersByTime(5000);
    expect(quiet.said).toEqual([]);
    expect(quiet.logs[0]).toMatchObject({ reason: 'tool_wait', skipped: 'stay_quiet' });
  });
});
