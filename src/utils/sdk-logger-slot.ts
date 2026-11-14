/**
 * The LiveKit SDK keeps its pino logger in one global slot that every copy of the SDK
 * (ESM, CJS, plugins) reads, and replaces it on every initializeLogger and per-job
 * setLoggerState. onSdkLogger runs a hook on the logger in the slot now and on every
 * logger set there later, so a redaction installed on the slot survives a re-init.
 *
 * All hooks share one accessor on the slot, so they compose in whatever order they are
 * added (the phone redaction and the lk.pii redaction both install here), and adding
 * the same hook twice is a no-op. An accessor that was there first (none today) is
 * chained, not replaced.
 *
 * @module utils/sdk-logger-slot
 */

type Hook = (logger: unknown) => void;

const SDK_LOGGER = Symbol.for('@livekit/agents:logger');
const STATE = Symbol.for('ferni:sdk-logger-slot');

interface SlotState {
  hooks: Set<Hook>;
}

function slotState(): SlotState {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[STATE] as SlotState | undefined;
  if (existing) return existing;
  const state: SlotState = { hooks: new Set() };
  const prior = Object.getOwnPropertyDescriptor(g, SDK_LOGGER);
  let value: unknown = prior?.value;
  const read = (): unknown => (prior?.get ? prior.get.call(g) : value);
  Object.defineProperty(g, SDK_LOGGER, {
    configurable: true,
    enumerable: false,
    get: read,
    set: (logger: unknown) => {
      if (prior?.set) prior.set.call(g, logger);
      else value = logger;
      const current = read();
      for (const hook of state.hooks) hook(current);
    },
  });
  g[STATE] = state;
  return state;
}

/** Runs `hook` on the SDK's logger now (if there is one) and on every logger set later. */
export function onSdkLogger(hook: Hook): void {
  const state = slotState();
  if (state.hooks.has(hook)) return;
  state.hooks.add(hook);
  const g = globalThis as Record<symbol, unknown>;
  hook(g[SDK_LOGGER]);
}
