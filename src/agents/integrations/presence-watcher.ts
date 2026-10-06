/**
 * When Ferni whistles to himself: only in an easy silence.
 *
 * He has finished, the caller hasn't spoken for a few seconds, the call is
 * past its first exchanges and nothing heavy is going on (their voice didn't
 * read sad, anxious, scared or angry this turn). At most once a call, and not
 * every time it could: a friend whistles now and then, not on cue. The moment
 * the caller speaks, the whistle stops.
 *
 * PRESENCE_SOUNDS=on turns it on (off until it has been listened to on dev).
 *
 * @module agents/integrations/presence-watcher
 */

export function presenceSoundsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.PRESENCE_SOUNDS === 'on';
}

const HEAVY = /^(sad|hurt|anxious|fearful|scared|angry|grief|distressed)$/i;
/** Exchanges before a whistle could feel natural. */
const MIN_TURNS = 3;
/** Quiet before whistling, randomized in this range. */
const QUIET_MS: [number, number] = [4500, 7500];
/** Of the silences that qualify, how often he actually whistles. */
const CHANCE = 0.5;

export interface PresenceDeps {
  play: () => boolean;
  stop: () => void;
  /** The caller's voice this turn (userData.voiceEmotion), if read. */
  mood: () => string | undefined;
  rng?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createPresenceWatcher(deps: PresenceDeps) {
  const rng = deps.rng ?? Math.random;
  const setT = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let agent = 'initializing';
  let user = 'listening';
  let turns = 0;
  let whistled = false;
  let playing = false;
  let timer: unknown = null;

  const cancel = () => {
    if (timer !== null) clearT(timer);
    timer = null;
  };
  const arm = () => {
    cancel();
    if (whistled || turns < MIN_TURNS || agent !== 'listening' || user === 'speaking') return;
    const wait = QUIET_MS[0] + rng() * (QUIET_MS[1] - QUIET_MS[0]);
    timer = setT(() => {
      timer = null;
      if (whistled || agent !== 'listening' || user === 'speaking') return;
      if (HEAVY.test(deps.mood() ?? '')) return;
      if (rng() >= CHANCE) return;
      if (deps.play()) {
        whistled = true;
        playing = true;
      }
    }, wait);
  };

  return {
    onAgentState(state: string): void {
      if (agent === 'speaking' && state !== 'speaking') turns++;
      agent = state;
      arm();
    },
    onUserState(state: string): void {
      user = state;
      if (state === 'speaking') {
        cancel();
        if (playing) deps.stop();
        playing = false;
      } else arm();
    },
    get whistled(): boolean {
      return whistled;
    },
    close: cancel,
  };
}
