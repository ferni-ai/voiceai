/**
 * Tell the apps, honestly, what Ferni is doing while a tool runs: "checking
 * your calendar", "looking that up". Contract: docs/api/tool-activity.md.
 *
 * Each tool call that runs past TOOL_ACTIVITY_MIN_MS sends `tool_start
 * {callId, kind}`, then `tool_end {callId}` when it ends, fails, is
 * interrupted, the call closes, or TOOL_ACTIVITY_MAX_MS passes. A call that
 * ends sooner sends nothing, so the app never flickers. `kind` is a closed
 * enum mapped here from the tool's name; the name, its arguments and the SDK's
 * call id never leave the server (`callId` is our own counter).
 *
 * TOOL_ACTIVITY_SIGNAL=on turns it on (off until the apps read it).
 *
 * @module agents/integrations/tool-activity-signal
 */

import type { voice } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { createDataMessageSender, type DataMessageRoom } from '../shared/data-message-envelope.js';
import { getToolPatternsConfig } from '../shared/sanitizer/detectors/patterns-loader.js';
import { watchToolCalls } from './tool-call-events.js';

const log = createLogger({ module: 'ToolActivitySignal' });

export function toolActivitySignalEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.TOOL_ACTIVITY_SIGNAL === 'on';
}

/** A call this quick sends nothing. */
export const TOOL_ACTIVITY_MIN_MS = 300;
/** A start always gets its end by now, even if the SDK never says so. */
export const TOOL_ACTIVITY_MAX_MS = 60_000;

export const TOOL_ACTIVITY_KINDS = [
  'calendar',
  'memory',
  'search',
  'music',
  'messages',
  'reminders',
  'weather',
  'home',
  'other',
] as const;
export type ToolActivityKind = (typeof TOOL_ACTIVITY_KINDS)[number];

/**
 * Registry domain (intent manual, or tool-patterns.json for a name it lacks)
 * → kind. A domain not listed is `other`: a vague line beats a wrong one.
 */
const KIND_BY_DOMAIN: Readonly<Record<string, ToolActivityKind>> = {
  calendar: 'calendar',
  memory: 'memory',
  'visual-memory': 'memory',
  visualMemory: 'memory',
  information: 'search',
  'local-search': 'search',
  research: 'search',
  worldAwareness: 'search',
  entertainment: 'music',
  music: 'music',
  communication: 'messages',
  scheduling: 'messages',
  'email-intelligence': 'messages',
  telephony: 'messages',
  sms: 'messages',
  openclawMessaging: 'messages',
  home: 'home',
  'smart-home': 'home',
  smartHome: 'home',
};

/** Words in a tool's name that say what it does, whatever domain files it. */
const KIND_BY_WORD: ReadonlyArray<[ReadonlySet<string>, ToolActivityKind]> = [
  [new Set(['reminder', 'reminders', 'alarm', 'alarms', 'timer']), 'reminders'],
  [new Set(['weather', 'forecast', 'pollen', 'uv']), 'weather'],
  [new Set(['music']), 'music'],
];

const LOOKUP_VERBS = new Set(['get', 'search', 'find', 'check', 'lookup', 'define', 'compare']);
const DEVICE_WORDS = new Set(['light', 'lights', 'thermostat', 'lock', 'scene', 'vibe', 'vibes']);
const MESSAGE_WORDS = new Set([
  ...'message messages email emails inbox sms text call callback sender thread'.split(' '),
  ...'send outreach reach contact scheduled follow'.split(' '),
]);
/**
 * The same domains also hold coaching and record-keeping tools ("build
 * assertiveness", "plan a move"): a domain's kind needs its name to agree.
 */
const DOMAIN_KIND_NEEDS: Partial<Record<ToolActivityKind, (w: string[]) => boolean>> = {
  search: (w) => LOOKUP_VERBS.has(w[0] ?? ''),
  home: (w) => w.some((x) => DEVICE_WORDS.has(x)),
  messages: (w) => w.some((x) => MESSAGE_WORDS.has(x)),
};

/** Filed under calendar in the registry, but not calendar work. */
const NOT_CALENDAR: Readonly<Record<string, ToolActivityKind>> = {
  findBusiness: 'search',
  restaurant: 'search',
  foodDelivery: 'other',
  manageContact: 'other',
};

const words = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

let patternDomains: Map<string, string> | null = null;
function patternDomainOf(name: string): string | undefined {
  if (!patternDomains) {
    patternDomains = new Map();
    for (const [domain, spec] of Object.entries(getToolPatternsConfig().domains)) {
      for (const p of spec.patterns) if (!patternDomains.has(p)) patternDomains.set(p, domain);
    }
  }
  return patternDomains.get(name);
}

export type DomainOf = (tool: string) => string | undefined;

/** The kind the apps see for a tool. Never throws; unknown is `other`. */
export function toolActivityKind(
  name: string,
  registryDomainOf: DomainOf = () => undefined
): ToolActivityKind {
  // Own keys only: a tool named "constructor" must not read Object.prototype.
  if (Object.hasOwn(NOT_CALENDAR, name)) return NOT_CALENDAR[name];
  const w = words(name);
  for (const [set, kind] of KIND_BY_WORD) if (w.some((x) => set.has(x))) return kind;
  const domain = registryDomainOf(name) ?? patternDomainOf(name);
  const kind = domain && Object.hasOwn(KIND_BY_DOMAIN, domain) ? KIND_BY_DOMAIN[domain] : 'other';
  return DOMAIN_KIND_NEEDS[kind]?.(w) === false ? 'other' : kind;
}

export interface ToolActivityDeps {
  send: (type: 'tool_start' | 'tool_end', payload: Record<string, unknown>) => void;
  kindOf: (toolName: string) => ToolActivityKind;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ToolActivitySignal {
  started: (callId: string, toolName: string) => void;
  ended: (callId: string) => void;
  /** End every open call (the session is closing). */
  close: () => void;
}

export function createToolActivitySignal(deps: ToolActivityDeps): ToolActivitySignal {
  const setT = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const open = new Map<string, { id: string; shown: boolean; timer: unknown }>();
  let seq = 0;

  const ended = (callId: string): void => {
    const call = open.get(callId);
    if (!call) return;
    open.delete(callId);
    clearT(call.timer);
    if (call.shown) deps.send('tool_end', { callId: call.id });
  };

  return {
    started(callId: string, toolName: string): void {
      if (open.has(callId)) return;
      const call = { id: `t${++seq}`, shown: false, timer: null as unknown };
      call.timer = setT(() => {
        call.shown = true;
        deps.send('tool_start', { callId: call.id, kind: deps.kindOf(toolName) });
        call.timer = setT(() => ended(callId), TOOL_ACTIVITY_MAX_MS - TOOL_ACTIVITY_MIN_MS);
      }, TOOL_ACTIVITY_MIN_MS);
      open.set(callId, call);
    },
    ended,
    close(): void {
      [...open.keys()].forEach(ended);
    },
  };
}

let registryDomainOf: DomainOf | undefined;

/** Wire the signal to a call. Returns the cleanup; a no-op unless TOOL_ACTIVITY_SIGNAL=on. */
export function startToolActivitySignal(
  session: voice.AgentSession,
  room: DataMessageRoom | undefined,
  env: Record<string, string | undefined> = process.env
): () => void {
  if (!toolActivitySignalEnabled(env)) return () => {};
  // The intent manual (~1 MB) is read once per process, off the call's path.
  if (!registryDomainOf) {
    void import('../../tools/retrieval/dense-index.js')
      .then(({ loadIntentManual }) => {
        const { tools } = loadIntentManual();
        registryDomainOf = (name) => tools[name]?.domain;
      })
      .catch((error: unknown) => log.warn({ error: String(error) }, 'intent manual unread'));
  }
  const sender = createDataMessageSender(room);
  const signal = createToolActivitySignal({
    send: (type, payload) => void sender(type, payload),
    kindOf: (name) => toolActivityKind(name, registryDomainOf),
  });
  const stopWatching = watchToolCalls(session, signal);
  return () => {
    stopWatching();
    signal.close();
  };
}
