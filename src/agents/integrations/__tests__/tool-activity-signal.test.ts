import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';
import {
  startToolActivitySignal,
  toolActivityKind,
  TOOL_ACTIVITY_KINDS,
  TOOL_ACTIVITY_MAX_MS,
  TOOL_ACTIVITY_MIN_MS,
} from '../tool-activity-signal.js';
import { loadIntentManual } from '../../../tools/retrieval/dense-index.js';

afterEach(() => {
  vi.useRealTimers();
});

interface Item {
  type: string;
  callId: string;
  name?: string;
  arguments?: string;
}

/** A session that announces speech handles, as the SDK does (see tool-hum.test.ts). */
function fakeSession() {
  const session = new EventEmitter() as EventEmitter & { userData: unknown };
  session.userData = {};
  const speak = () => {
    const items = new Set<(item: Item) => void>();
    const done = new Set<() => void>();
    const h = {
      _addItemAddedCallback: (cb: (item: Item) => void) => items.add(cb),
      _removeItemAddedCallback: (cb: (item: Item) => void) => items.delete(cb),
      addDoneCallback: (cb: () => void) => done.add(cb),
      call: (callId: string, name: string, args = '{}') =>
        items.forEach((cb) => cb({ type: 'function_call', callId, name, arguments: args })),
      output: (callId: string) =>
        items.forEach((cb) => cb({ type: 'function_call_output', callId })),
      finish: () => done.forEach((cb) => cb()),
    };
    session.emit(voice.AgentSessionEventTypes.SpeechCreated, { speechHandle: h });
    return h;
  };
  return { session, speak };
}

/** A room that records what the agent published. */
function fakeRoom() {
  const raw: string[] = [];
  const room = {
    localParticipant: {
      publishData: vi.fn(async (data: Uint8Array) => {
        raw.push(new TextDecoder().decode(data));
      }),
    },
  };
  const sent = () => raw.map((r) => JSON.parse(r) as Record<string, unknown>);
  return { room, raw, sent };
}

function setup(env: Record<string, string> = { TOOL_ACTIVITY_SIGNAL: 'on' }) {
  vi.useFakeTimers();
  const { session, speak } = fakeSession();
  const { room, raw, sent } = fakeRoom();
  const stop = startToolActivitySignal(session as never, room, env);
  return { session, speak, raw, sent, stop };
}

describe('startToolActivitySignal', () => {
  it('with the flag off, listens to nothing and sends nothing', () => {
    const { session, speak, sent } = setup({});
    expect(session.eventNames()).toEqual([]);
    const h = speak();
    h.call('c1', 'createCalendarEvent');
    vi.advanceTimersByTime(5000);
    h.output('c1');
    expect(sent()).toEqual([]);
  });

  it('a call over 300 ms sends tool_start with a mapped kind, then tool_end', () => {
    const { session, speak, sent, stop } = setup();
    const h = speak();
    h.call('c1', 'createCalendarEvent');
    vi.advanceTimersByTime(TOOL_ACTIVITY_MIN_MS - 1);
    expect(sent()).toEqual([]); // buffered
    vi.advanceTimersByTime(1);
    expect(sent()).toEqual([{ type: 'tool_start', callId: 't1', kind: 'calendar' }]);
    vi.advanceTimersByTime(900);
    h.output('c1');
    expect(sent()).toEqual([
      { type: 'tool_start', callId: 't1', kind: 'calendar' },
      { type: 'tool_end', callId: 't1' },
    ]);
    stop();
    expect(session.eventNames()).toEqual([]);
  });

  it('a call under 300 ms sends nothing, start or end', () => {
    const { speak, sent } = setup();
    const h = speak();
    h.call('c1', 'getWeather');
    vi.advanceTimersByTime(TOOL_ACTIVITY_MIN_MS - 50);
    h.output('c1');
    vi.advanceTimersByTime(TOOL_ACTIVITY_MAX_MS * 2);
    expect(sent()).toEqual([]);
  });

  it('a failed call gets its end (the SDK still adds an error output)', () => {
    const { speak, sent } = setup();
    const h = speak();
    h.call('c1', 'getWeather');
    vi.advanceTimersByTime(1000);
    h.output('c1'); // FunctionCallOutput with isError: same item type
    expect(sent().map((m) => m.type)).toEqual(['tool_start', 'tool_end']);
  });

  it('an interrupted reply ends its open calls, once each', () => {
    const { session, speak, sent } = setup();
    const h = speak();
    h.call('c1', 'getWeather');
    vi.advanceTimersByTime(1000);
    h.finish(); // interrupted: no output ever arrives
    expect(sent().map((m) => m.type)).toEqual(['tool_start', 'tool_end']);
    session.emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, {
      functionCalls: [{ callId: 'c1' }],
    });
    expect(sent()).toEqual([
      { type: 'tool_start', callId: 't1', kind: 'weather' },
      { type: 'tool_end', callId: 't1' },
    ]);
  });

  it('a call the SDK never ends still gets its end, by the cap or when the call closes', () => {
    const a = setup();
    a.speak().call('c1', 'getWeather');
    vi.advanceTimersByTime(TOOL_ACTIVITY_MAX_MS);
    expect(a.sent().map((m) => m.type)).toEqual(['tool_start', 'tool_end']);
    vi.useRealTimers();

    const b = setup();
    b.speak().call('c1', 'getWeather');
    vi.advanceTimersByTime(1000);
    b.stop();
    expect(b.sent().map((m) => m.type)).toEqual(['tool_start', 'tool_end']);
  });

  it('parallel calls stay paired by their own callId', () => {
    const { speak, sent } = setup();
    const h = speak();
    h.call('c1', 'getWeather');
    h.call('c2', 'createCalendarEvent');
    vi.advanceTimersByTime(500);
    h.output('c2');
    vi.advanceTimersByTime(500);
    h.output('c1');
    const msgs = sent();
    const startOf = (kind: string) => msgs.find((m) => m.type === 'tool_start' && m.kind === kind);
    const weather = startOf('weather')?.callId;
    const calendar = startOf('calendar')?.callId;
    expect(weather).toBeTruthy();
    expect(calendar).toBeTruthy();
    expect(weather).not.toBe(calendar);
    expect(msgs.slice(2)).toEqual([
      { type: 'tool_end', callId: calendar },
      { type: 'tool_end', callId: weather },
    ]);
  });

  it('never sends the tool name, its arguments, or the model call id', () => {
    const { speak, raw } = setup();
    const h = speak();
    h.call('call_send_message_to_dana_1', 'send_message_to_dana', '{"to":"Dana","body":"hi"}');
    vi.advanceTimersByTime(1000);
    h.output('call_send_message_to_dana_1');
    expect(raw).toHaveLength(2);
    for (const r of raw) {
      expect(r.toLowerCase()).not.toContain('dana');
      expect(Object.keys(JSON.parse(r) as object).sort()).toEqual(
        JSON.parse(r).type === 'tool_start' ? ['callId', 'kind', 'type'] : ['callId', 'type']
      );
    }
  });
});

describe('toolActivityKind', () => {
  const registry: Record<string, string> = {
    recallFromMemory: 'memory',
    searchWeb: 'information',
    addRelationship: 'information',
    controlLight: 'home',
    playMusic: 'entertainment',
    getUnreadEmails: 'communication',
    findBusiness: 'calendar',
    addTask: 'productivity',
    coachDecluttering: 'home',
    buildAssertiveness: 'communication',
  };
  const domainOf = (t: string) => registry[t];

  it.each([
    ['recallFromMemory', 'memory'],
    ['searchWeb', 'search'],
    ['addRelationship', 'other'], // information, but not a lookup
    ['controlLight', 'home'],
    ['playMusic', 'music'],
    ['getUnreadEmails', 'messages'],
    ['findBusiness', 'search'], // filed under calendar
    ['addTask', 'other'],
    ['coachDecluttering', 'other'], // home domain, but no device
    ['buildAssertiveness', 'other'], // communication domain, but coaching
    ['setReminder', 'reminders'],
    ['quickTimer', 'reminders'],
    ['getWeatherForecast', 'weather'],
    ['sendMessage', 'messages'], // not in the registry: tool-patterns.json
  ])('%s → %s', (tool, kind) => {
    expect(toolActivityKind(tool, domainOf)).toBe(kind);
  });

  it('an unknown tool is other', () => {
    expect(toolActivityKind('frobnicateWidget', domainOf)).toBe('other');
    expect(toolActivityKind('', domainOf)).toBe('other');
    // lookup verbs, so the search gate can't hide a wrong default
    expect(toolActivityKind('getFrobnicator', domainOf)).toBe('other');
    expect(toolActivityKind('searchFrobs')).toBe('other');
    expect(toolActivityKind('constructor', () => 'toString')).toBe('other');
    expect(toolActivityKind('getThing', () => 'constructor')).toBe('other');
  });

  it('every tool in the real registry maps inside the closed set', () => {
    const { tools } = loadIntentManual();
    const real = (t: string) => tools[t]?.domain;
    const kinds = new Set(Object.keys(tools).map((t) => toolActivityKind(t, real)));
    for (const k of kinds) expect(TOOL_ACTIVITY_KINDS).toContain(k);
    expect(toolActivityKind('getCalendarToday', real)).toBe('calendar');
  });
});
