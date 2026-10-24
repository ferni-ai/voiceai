/**
 * Ferni's presence sounds in his own voice (VOICED_PRESENCE=on), from the takes
 * Seth kept (VOICED_TAKES, rendered per voice by warmPersonaReactions): the
 * tool hum, the quiet-window hum (a yawn on a 05:00-08:59 call, once) and extra
 * live-reaction variants. With PRESENCE_SOUND_ASSETS too, the quiet window can
 * draw one of the human whistles Seth picked (presence-clips.ts) in place of a
 * hum; the snore stays off here (no long-quiet slot). The surprised and sigh
 * takes have no trigger yet. All on the direct track (~56 ms
 * to the wire, against ~640 ms through the mixer), on the existing rules.
 *
 * @module agents/integrations/voiced-presence
 */

import { voice } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { VOICED_TAKES, type VoicedCategory } from '../shared/reaction-clips.js';
import { callerHour } from '../shared/time-context.js';
import { voicedPresenceEnabled } from '../shared/voiced-take-render.js';
import type { DirectClipTrack } from './direct-clip-track.js';
import { createPresenceWatcher, isHeavyMood, presenceSoundsEnabled } from './presence-watcher.js';
import { presenceClipName, presenceClipPickers, type ClipPicker } from './presence-clips.js';
import type { HumPlayer } from './tool-hum.js';
import { recordedWhistleId, takeTuneId, tuneAudio, tuneKind } from './presence-tune.js';
import { namedTuneFor, presenceSoundsHeld, tunePlayed } from '../../services/session/tune-state.js';
import { stayQuietOn } from '../shared/call-farewell.js';
import { presenceSilenceIsHeavy } from './presence-heavy.js';
import type { ConductedSound, SoundGate } from './sound-conductor.js';

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

/** One VOICED_PRESENCE line per kept take that reaches the wire (direct-clip-track.ts). */
export function logVoicedTake(label: string, playToWireMs: number): void {
  if (!voicedPresenceEnabled()) return;
  if (label.startsWith(RECORDED)) {
    const file = label.slice(RECORDED.length);
    log.info(
      { category: 'recorded-whistle', file, latencyMs: Math.round(playToWireMs) },
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
  const stopIdle = presenceSoundsEnabled(env) ? startIdle(v, now, whistles) : null;
  return {
    /** Wrap the live backchannel player so its reactions draw from the takes. */
    vary: variants(v),
    close: (): void => {
      hums.delete(session);
      stopIdle?.();
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
  return { session, direct, picker, rng, caller, play, mood, getTake, env, busy, onSound, gate };
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

/** The quiet window, on presence-watcher.ts's rules. */
function startIdle(v: Voiced, now: () => Date, whistles: ClipPicker | null): () => void {
  let yawned = false;
  let endsAt = 0;
  const sessionId = (): string | undefined => v.caller()?.services?.sessionId;
  /** A recorded whistle on the direct track; false if none is ready or a clip is playing. */
  const whistle = (): boolean => {
    const pcm = whistles?.next();
    if (!pcm) return false;
    const label = RECORDED + (presenceClipName(pcm) ?? 'unknown');
    if (!v.gate('presence', label, () => !v.busy() && v.direct.play(pcm, IDLE_VOLUME, label)))
      return false;
    endsAt = Date.now() + pcm.byteLength / 48; // 24 kHz s16le
    const id = recordedWhistleId(pcm);
    if (id) tunePlayed(sessionId(), id, 'whistle', v.env); // NAMED_TUNE
    return true;
  };
  /** NAMED_TUNE: the tune this caller named, if it can play. */
  const named = (): boolean => {
    const id = namedTuneFor(sessionId(), v.env);
    const tune = id ? tuneAudio(id, v.getTake) : null;
    if (!id || !tune) return false;
    const go = () => !v.busy() && v.direct.play(tune.pcm, IDLE_VOLUME, tune.label);
    if (!v.gate('presence', tune.label, go)) return false;
    endsAt = Date.now() + tune.pcm.byteLength / 48;
    tunePlayed(sessionId(), id, tuneKind(id), v.env);
    return true;
  };
  // Report what started (sound-signal.ts): only a yawn flips `yawned`.
  const report = (play: () => boolean) => (): boolean => {
    const before = yawned;
    const ok = play();
    if (ok) v.onSound(yawned !== before ? 'breath' : 'hum');
    return ok;
  };
  const watcher = createPresenceWatcher({
    play: report(() => {
      // NAMED_TUNE: they asked him to stop whistling and humming.
      if (presenceSoundsHeld(sessionId(), v.env)) return false;
      // Never the profile's own zone: a phone caller gets one only as its verified owner (phone-parity.ts).
      const tz = v.caller()?.callerTimezone;
      const category = idleCategory(callerHour(now(), tz), yawned, v.rng);
      if (category !== 'morning-yawn' && named()) return true;
      // The morning yawn keeps its slot; otherwise, sometimes one of Seth's whistles
      if (whistles && category !== 'morning-yawn' && v.rng() < WHISTLE_SHARE && whistle())
        return true;
      const pick = v.picker.take(category);
      const take = pick ?? v.picker.take('thinking-hum');
      if (!take || !v.play(take, IDLE_VOLUME, 'presence')) return false;
      if (take.category === 'morning-yawn') yawned = true;
      else tunePlayed(sessionId(), takeTuneId(take.category, take.index), 'hum', v.env);
      endsAt = Date.now() + take.pcm.byteLength / 48; // 24 kHz s16le
      return true;
    }),
    // Only our own sound, never a backchannel that started after it ended.
    stop: () => {
      if (Date.now() < endsAt) v.direct.stop();
      endsAt = 0;
    },
    mood: v.mood,
    // Hard news, venting or crisis risk lately, or the goodbyes said: no sound (presence-heavy.ts).
    serious: () => presenceSilenceIsHeavy(v.session),
    quiet: () => stayQuietOn(v.session),
    rng: v.rng,
  });
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
