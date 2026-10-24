/**
 * Ferni's presence sounds in his own voice (VOICED_PRESENCE=on), from the takes
 * Seth kept (VOICED_TAKES, rendered per voice by warmPersonaReactions): the
 * tool hum, the quiet-window hum (a yawn on a 05:00-08:59 call, once) and extra
 * live-reaction variants. With PRESENCE_SOUND_ASSETS too, the quiet window can
 * draw one of the human whistles Seth picked (presence-clips.ts) in place of a
 * hum. VOICED_QUIRKS=on adds the long-quiet slot: a recorded snore, once a
 * call, after 18-26 s of mutual quiet (LONG_QUIET), never on a heavy moment,
 * a handoff or a tool call; and every whistle, hum, yawn and snore is recorded
 * (quirk-log.ts) so his next reply can own it, the snore out loud on the
 * caller's next turn (quirk-note.ts). The surprised and sigh takes have no
 * trigger yet. All on the direct track (~56 ms to the wire, against ~640 ms
 * through the mixer), on the existing rules.
 *
 * @module agents/integrations/voiced-presence
 */

import { voice } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { VOICED_TAKES, type VoicedCategory } from '../shared/reaction-clips.js';
import { callerHour } from '../shared/time-context.js';
import { voicedPresenceEnabled } from '../shared/voiced-take-render.js';
import type { DirectClipTrack } from './direct-clip-track.js';
import {
  createPresenceWatcher,
  isHeavyMood,
  LONG_QUIET,
  presenceSnoreEnabled,
  presenceSoundsEnabled,
  type PresenceDeps,
  type PresenceTiming,
} from './presence-watcher.js';
import {
  presenceClipName,
  presenceClipPickers,
  snoreClipPicker,
  type ClipPicker,
} from './presence-clips.js';
import type { HumPlayer } from './tool-hum.js';
import { recordedWhistleId, takeTuneId, tuneAudio, tuneKind } from './presence-tune.js';
import { namedTuneFor, presenceSoundsHeld, tunePlayed } from '../../services/session/tune-state.js';
import { stayQuietOn } from '../shared/call-farewell.js';
import { presenceSilenceIsHeavy } from './presence-heavy.js';
import type { ConductedSound, SoundGate } from './sound-conductor.js';
import { flagOn } from '../../config/env-flag.js';
import { recordQuirk, type QuirkKind } from '../../services/session/quirk-log.js';
import { shouldSkipGenerateReply } from '../../handoff/unified-state.js';
import { getStateMetrics } from '../../speech/coordination/sanitizer-integration.js';

export { voicedPresenceEnabled };

const log = createLogger({ module: 'VoicedPresence' });

/** Live reactions that also draw from the takes (not the turn opener: it holds the reply for its clip's length). */
export const REACTION_VARIANTS: Readonly<Record<string, VoicedCategory>> = {
  '[laughter]': 'laugh', // LAUGH_CLIP (backchannel-policy.ts)
  Oh: 'recognition',
  'Mm-hmm': 'mmhm',
  Mhm: 'mmhm',
  Aw: 'aww',
};

/** Heard in the room, not said to them: as loud as the idle whistle. */
const IDLE_VOLUME = 0.5;
const SUNG_SHARE = 0.25;
/** Of the quiet-window sounds (one a call), how many are a recorded whistle. */
const WHISTLE_SHARE = 0.5;
const RECORDED = 'recorded-whistle:';
const SNORE = 'recorded-snore:';

export function voicedQuirksEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('VOICED_QUIRKS', env);
}

/** One VOICED_PRESENCE line per kept take that reaches the wire (direct-clip-track.ts). */
export function logVoicedTake(label: string, playToWireMs: number): void {
  if (!voicedPresenceEnabled()) return;
  const recorded = /^(recorded-(?:whistle|snore)):(.*)$/.exec(label);
  if (recorded) {
    log.info(
      { category: recorded[1], file: recorded[2], latencyMs: Math.round(playToWireMs) },
      'VOICED_PRESENCE'
    );
    return;
  }
  for (const [category, takes] of Object.entries(VOICED_TAKES)) {
    const take = takes.indexOf(label);
    if (take < 0) continue;
    log.info({ category, take, latencyMs: Math.round(playToWireMs) }, 'VOICED_PRESENCE');
    return;
  }
}

/** The quiet window's sound: a yawn at 05:00-08:59 caller time (once a call), else a hum. */
export function idleCategory(hour: number | null, yawned: boolean, rng: () => number) {
  if (!yawned && hour !== null && hour >= 5 && hour < 9) return 'morning-yawn';
  return rng() < SUNG_SHARE ? 'sung-hum' : 'thinking-hum';
}

export type Take = { category: VoicedCategory; index: number; text: string; pcm: ArrayBuffer };

/** Picks a rendered take, never the one last played in its category while another is ready. */
export function createTakePicker(getPcm: (text: string) => ArrayBuffer | null, rng = Math.random) {
  const last = new Map<VoicedCategory, number>();
  return {
    take: (category: VoicedCategory): Take | null => {
      const ready = VOICED_TAKES[category]
        .map((text, index) => ({ category, index, text, pcm: getPcm(text) }))
        .filter((t): t is Take => t.pcm !== null);
      const fresh = ready.length > 1 ? ready.filter((t) => t.index !== last.get(category)) : ready;
      return fresh[Math.floor(rng() * fresh.length)] ?? null;
    },
    played: (take: Take): void => void last.set(take.category, take.index),
  };
}

export type VoicedTrack = Pick<DirectClipTrack, 'play' | 'stop'>;
/** The tool hum's player under VOICED_PRESENCE: next() picks the take to play. */
export type VoicedHum = HumPlayer & { next: () => ArrayBuffer | null };

const hums = new WeakMap<object, VoicedHum>();

/** The voiced tool hum for a session, while VOICED_PRESENCE runs on it. */
export function voicedHumFor(session: object): VoicedHum | undefined {
  return hums.get(session);
}

type PlayClip = (text: string, opts?: { pauseStartedAt?: number }) => boolean;
type CallerData = {
  voiceEmotion?: { primary?: string };
  callerTimezone?: string;
  services?: { sessionId?: string };
};

export interface VoicedPresenceOptions {
  session: voice.AgentSession;
  direct: VoicedTrack | null;
  /** True while the mixer track plays a clip: one clip at a time across both. */
  mixerBusy: () => boolean;
  getClip: (text: string, personaId: string) => ArrayBuffer | null;
  personaId: () => string;
  /** A quiet-window sound started: the yawn is 'breath', a hum, whistle or tune 'hum' (sound-signal.ts). */
  onSound?: (kind: 'hum' | 'breath') => void;
  /** SOUND_CONDUCTOR: asked before each take plays (sound-conductor.ts); unset plays as before. */
  gate?: SoundGate;
  env?: Record<string, string | undefined>;
  rng?: () => number;
  now?: () => Date;
}

/** Start voiced presence for a call; null unless VOICED_PRESENCE=on and the direct track is up. */
export function startVoicedPresence(opts: VoicedPresenceOptions) {
  const { session, direct, env = process.env } = opts;
  if (!voicedPresenceEnabled(env) || !direct) return null;
  const v = shared(opts, direct);
  hums.set(session, toolHum(v));
  const now = opts.now ?? (() => new Date());
  const whistles = presenceClipPickers(env)?.whistle ?? null;
  const sounds = presenceSoundsEnabled(env);
  const stopIdle = sounds ? startIdle(v, now, whistles) : null;
  const snore = sounds && voicedQuirksEnabled(env) && presenceSnoreEnabled(env);
  const stopSnore = snore ? startSnore(v) : null;
  return {
    /** Wrap the live backchannel player so its reactions draw from the takes. */
    vary: variants(v),
    close: (): void => {
      hums.delete(session);
      stopIdle?.();
      stopSnore?.();
    },
  };
}

/** What the three uses share for one call. */
function shared(opts: VoicedPresenceOptions, direct: VoicedTrack) {
  const { session, rng = Math.random } = opts;
  const caller = (): CallerData | undefined => session.userData as CallerData | undefined;
  const picker = createTakePicker((text) => opts.getClip(text, opts.personaId()), rng);
  const gate: SoundGate = opts.gate ?? ((_kind, _clip, playIt) => playIt());
  const play = (take: Take, volume: number, kind: ConductedSound): boolean => {
    const go = () => !opts.mixerBusy() && direct.play(take.pcm, volume, take.text);
    if (!gate(kind, take.text, go)) return false;
    picker.played(take);
    return true;
  };
  const mood = (): string | undefined => caller()?.voiceEmotion?.primary;
  const getTake = (text: string): ArrayBuffer | null => opts.getClip(text, opts.personaId());
  const env = opts.env ?? process.env; // NAMED_TUNE
  const onSound = opts.onSound ?? (() => {});
  const busy = opts.mixerBusy;
  const base = { session, direct, picker, rng, caller, play, mood, getTake, env, busy, onSound };
  return { ...base, gate, personaId: opts.personaId };
}
type Voiced = ReturnType<typeof shared>;

function toolHum(v: Voiced): VoicedHum {
  const picked = new WeakMap<ArrayBuffer, Take>();
  return {
    next: () => {
      const take = v.picker.take('thinking-hum');
      if (take) picked.set(take.pcm, take);
      return take?.pcm ?? null;
    },
    play: (pcm, volume = 1) => {
      const take = picked.get(pcm);
      return take !== undefined && v.play(take, volume, 'tool_hum');
    },
    stop: () => v.direct.stop(),
  };
}

const sessionIdOf = (v: Voiced): string | undefined => v.caller()?.services?.sessionId;

/** VOICED_QUIRKS: what he did out loud, so the next reply can own it (quirk-log.ts). */
function recordVoiced(v: Voiced, kind: QuirkKind, clip: string, quietMs: number): void {
  if (!voicedQuirksEnabled(v.env)) return;
  const reason = `the line went quiet for about ${Math.round(quietMs / 1000)} seconds on an easy, light call`;
  const ownIt = kind === 'snore' ? { ownIt: true } : {};
  const event = { kind, source: 'clip' as const, personaId: v.personaId(), clip, reason, ...ownIt };
  recordQuirk(sessionIdOf(v), event, v.env);
}

/** One quiet-window sound on presence-watcher.ts's rules; returns the cleanup. */
function watchQuiet(
  v: Voiced,
  sound: Pick<PresenceDeps, 'play' | 'stop'>,
  timing?: PresenceTiming
): () => void {
  const watcher = createPresenceWatcher(
    {
      ...sound,
      mood: v.mood,
      // Hard news, venting or crisis risk lately, or the goodbyes said: no sound (presence-heavy.ts).
      serious: () => presenceSilenceIsHeavy(v.session),
      quiet: () => stayQuietOn(v.session),
      rng: v.rng,
    },
    timing
  );
  const onAgent = (ev: { newState?: string }): void => watcher.onAgentState(ev.newState ?? '');
  const onUser = (ev: { newState?: string }): void => watcher.onUserState(ev.newState ?? '');
  v.session.on(voice.AgentSessionEventTypes.AgentStateChanged, onAgent);
  v.session.on(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  return () => {
    watcher.close();
    v.session.off(voice.AgentSessionEventTypes.AgentStateChanged, onAgent);
    v.session.off(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  };
}

/** The quiet window, on presence-watcher.ts's rules. */
function startIdle(v: Voiced, now: () => Date, whistles: ClipPicker | null): () => void {
  let yawned = false;
  let endsAt = 0;
  const sessionId = (): string | undefined => sessionIdOf(v);
  /** A recorded whistle on the direct track; false if none is ready or a clip is playing. */
  const whistle = (quietMs: number): boolean => {
    const pcm = whistles?.next();
    if (!pcm) return false;
    const label = RECORDED + (presenceClipName(pcm) ?? 'unknown');
    if (!v.gate('presence', label, () => !v.busy() && v.direct.play(pcm, IDLE_VOLUME, label)))
      return false;
    endsAt = Date.now() + pcm.byteLength / 48; // 24 kHz s16le
    const id = recordedWhistleId(pcm);
    if (id) tunePlayed(sessionId(), id, 'whistle', v.env); // NAMED_TUNE
    recordVoiced(v, 'whistle', id ?? label, quietMs);
    return true;
  };
  /** NAMED_TUNE: the tune this caller named, if it can play. */
  const named = (quietMs: number): boolean => {
    const id = namedTuneFor(sessionId(), v.env);
    const tune = id ? tuneAudio(id, v.getTake) : null;
    if (!id || !tune) return false;
    const go = () => !v.busy() && v.direct.play(tune.pcm, IDLE_VOLUME, tune.label);
    if (!v.gate('presence', tune.label, go)) return false;
    endsAt = Date.now() + tune.pcm.byteLength / 48;
    tunePlayed(sessionId(), id, tuneKind(id), v.env);
    recordVoiced(v, tuneKind(id), id, quietMs);
    return true;
  };
  // Report what started (sound-signal.ts): only a yawn flips `yawned`.
  const report =
    (play: (quietMs: number) => boolean) =>
    (quietMs: number): boolean => {
      const before = yawned;
      const ok = play(quietMs);
      if (ok) v.onSound(yawned !== before ? 'breath' : 'hum');
      return ok;
    };
  return watchQuiet(v, {
    play: report((quietMs) => {
      // NAMED_TUNE: they asked him to stop whistling and humming.
      if (presenceSoundsHeld(sessionId(), v.env)) return false;
      // Never the profile's own zone: a phone caller gets one only as its verified owner (phone-parity.ts).
      const tz = v.caller()?.callerTimezone;
      const category = idleCategory(callerHour(now(), tz), yawned, v.rng);
      if (category !== 'morning-yawn' && named(quietMs)) return true;
      // The morning yawn keeps its slot; otherwise, sometimes one of Seth's whistles
      if (whistles && category !== 'morning-yawn' && v.rng() < WHISTLE_SHARE && whistle(quietMs))
        return true;
      const pick = v.picker.take(category);
      const take = pick ?? v.picker.take('thinking-hum');
      if (!take || !v.play(take, IDLE_VOLUME, 'presence')) return false;
      const tune = takeTuneId(take.category, take.index);
      if (take.category === 'morning-yawn') yawned = true;
      else tunePlayed(sessionId(), tune, 'hum', v.env);
      recordVoiced(v, take.category === 'morning-yawn' ? 'yawn' : 'hum', tune, quietMs);
      endsAt = Date.now() + take.pcm.byteLength / 48; // 24 kHz s16le
      return true;
    }),
    // Only our own sound, never a backchannel that started after it ended.
    stop: () => {
      if (Date.now() < endsAt) v.direct.stop();
      endsAt = 0;
    },
  });
}

/**
 * VOICED_QUIRKS: one recorded snore a call in a long quiet (LONG_QUIET), on the
 * quiet window's rules, and never during a handoff or while a tool runs.
 */
function startSnore(v: Voiced): () => void {
  const snores = snoreClipPicker(v.rng);
  let endsAt = 0;
  const play = (quietMs: number): boolean => {
    const sid = sessionIdOf(v);
    if (presenceSoundsHeld(sid, v.env)) return false; // NAMED_TUNE: "stop that"
    if (sid && (shouldSkipGenerateReply(sid) || (getStateMetrics(sid)?.activeToolCount ?? 0) > 0))
      return false;
    const pcm = snores.next();
    if (!pcm) return false;
    const label = SNORE + (presenceClipName(pcm) ?? 'unknown');
    if (!v.gate('presence', label, () => !v.busy() && v.direct.play(pcm, IDLE_VOLUME, label)))
      return false;
    endsAt = Date.now() + pcm.byteLength / 48; // 24 kHz s16le
    v.onSound('breath'); // a snore reads as a breath (sound-signal.ts)
    recordVoiced(v, 'snore', label, quietMs);
    return true;
  };
  const stop = (): void => {
    if (Date.now() < endsAt) v.direct.stop();
    endsAt = 0;
  };
  return watchQuiet(v, { play, stop }, LONG_QUIET);
}

/** Live reactions: the plain clip or one of its takes, not the one just played. */
function variants(v: Voiced): (play: PlayClip) => PlayClip {
  const last = new Map<VoicedCategory, string>();
  return (playClip) => (text, clipOpts) => {
    const category = REACTION_VARIANTS[text];
    if (category === undefined || isHeavyMood(v.mood())) return playClip(text, clipOpts);
    const pool = [text, ...VOICED_TAKES[category]].filter((t) => t !== last.get(category));
    const choice = pool[Math.floor(v.rng() * pool.length)] ?? text;
    const variant = choice !== text && playClip(choice, clipOpts);
    const played = variant || playClip(text, clipOpts);
    if (played) last.set(category, variant ? choice : text);
    return played;
  };
}
