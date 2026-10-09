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

/** PRESENCE_HUM=on: in an easy silence he hums as often as he whistles. */
export function presenceHumEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PRESENCE_HUM === 'on';
}

/** PRESENCE_SNORE=on: a mock snore, once, in a long quiet on a light call. */
export function presenceSnoreEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.PRESENCE_SNORE === 'on';
}

export interface PresenceTiming {
  /** Exchanges before the sound could feel natural. */
  minTurns: number;
  /** Quiet before the sound, randomized in this range. */
  quietMs: [number, number];
  /** Of the silences that qualify, how often it actually plays. */
  chance: number;
}

/** A few bars whistled or hummed in a short easy silence. */
export const IDLE_TUNE: PresenceTiming = { minTurns: 3, quietMs: [4500, 7500], chance: 0.5 };
/**
 * A snore in a long quiet: well past the whistle, before the 30 s inactivity
 * check-in, so a "you still there?" after it lands as the punchline.
 */
export const LONG_QUIET: PresenceTiming = { minTurns: 3, quietMs: [18000, 26000], chance: 0.6 };

const HEAVY = /^(sad|hurt|anxious|fearful|scared|angry|grief|distressed)$/i;

export interface PresenceDeps {
  play: () => boolean;
  stop: () => void;
  /** The caller's voice this turn (userData.voiceEmotion), if read. */
  mood: () => string | undefined;
  rng?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createPresenceWatcher(deps: PresenceDeps, timing: PresenceTiming = IDLE_TUNE) {
  const { minTurns, quietMs, chance } = timing;
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
    if (whistled || turns < minTurns || agent !== 'listening' || user === 'speaking') return;
    const wait = quietMs[0] + rng() * (quietMs[1] - quietMs[0]);
    timer = setT(() => {
      timer = null;
      if (whistled || agent !== 'listening' || user === 'speaking') return;
      if (HEAVY.test(deps.mood() ?? '')) return;
      if (rng() >= chance) return;
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
