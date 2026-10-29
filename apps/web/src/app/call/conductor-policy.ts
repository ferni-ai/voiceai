/**
 * Conductor policy: every rule that decides whether a channel write happens, in
 * one table (CONDUCTOR_POLICY) and one gate. A write passes or is traced as
 * `policy drop <reason>`, so connect.mp3 can't restart and haptics can't stack.
 *
 * Character: warm & unhurried. Poses are slower with a hint of spring; nothing
 * grows past 1.06; tender, upset and crisis never bounce or grow; celebrations
 * are earned and budgeted; crisis is quiet (a caring face, no sound) until it passes.
 */

import type { ReducedMotionSimplification, Sequence } from '../../config/motion-sequences.js';
import type { Mood } from './call-types.js';
import type {
  CallPolicy,
  ChannelCommand,
  ConductorPolicy,
  MomentBeat,
  Priority,
  WriteContext,
} from './conductor.js';
import { clampMotion, isStillEasing } from './conductor-motion.js';
import type { ChannelId } from './conductor-trace.js';

export type SoundSetting = 'full' | 'essential' | 'off';

export const CONDUCTOR_POLICY = {
  priorities: {
    critical: ['arrival_joined', 'arrival_failed', 'connection_success', 'error_recovery'],
    high: ['handoff_out', 'handoff_in', 'celebration_big', 'team_unlock'],
    normal: ['handoff_transition', 'celebration_small', 'streak_milestone'],
    low: ['deep_moment', 'session_end'],
  },
  /** arrival_joined never replays in one attempt, whoever re-fires agent_connected. */
  moments: { maxQueue: 3, minGapMs: 500, oncePerAttempt: ['arrival_joined'] },
  character: {
    stateDurationScale: 1.15,
    /** Neutral poses keep a hint of spring (peaks ~1.02): light and a little playful. */
    poseEasing: 'springGentle',
    /** Tender, upset or crisis: heavy and slow. Any curve that leaves 0..1 becomes this one. */
    gentleEasing: 'gentle',
    remapEasings: ['spring', 'anticipate'],
    maxScale: 1.06,
    /** Tender, upset or crisis: nothing grows past its resting size. */
    softMaxScale: 1,
    minTranslateY: -8,
    /** Only an earned big celebration, in a neutral mood, may pass maxScale. */
    overshootExempt: 'celebration_big',
  },
  sound: {
    sameTrackGapMs: 2000,
    oncePerAttempt: ['system.connectionSuccess'],
    quietStates: ['speaking', 'user_speaking'],
    personaPrefix: 'persona.',
    essential: ['system.connectionSuccess', 'system.sessionEnd'],
    bargeInDuckDb: -12,
  },
  haptic: {
    minGapMs: 600,
    perBeat: 1,
    moodPattern: 'softTap',
    reducedMotionSequences: ['arrival_joined', 'arrival_failed', 'session_end'],
  },
  face: {
    minDwellMs: 1200,
    positive: ['happy', 'delighted', 'excited', 'joy'],
    /** Teasing faces: neutral moods only, never while tender, upset or in crisis. */
    playful: ['winking', 'mischievous', 'sheepish', 'amused', 'doubleTake'],
    crisis: ['holdingSpace', 'empathetic'],
  },
  delight: {
    /** What you DID, never how often you showed up: no streaks, no unlocks (Seth, 2026-10-29). */
    reasons: ['achievement', 'breakthrough', 'laughter', 'first_meeting'],
    perCall: { big: 1, small: 3 },
    minGapMs: 90_000,
    /** Celebration sequences asked for directly pass the same gate, with this size and reason. */
    asSequence: {
      celebration_small: { size: 'small' },
      celebration_big: { size: 'big' },
      streak_milestone: { size: 'small', reason: 'streak' },
      team_unlock: { size: 'small', reason: 'unlock' },
    },
  },
  /** Token step `element` → the one channel that writes it. Others stay with legacy UI. */
  elements: {
    face: ['face', 'eyes'],
    body: ['avatar', 'currentAvatar', 'newAvatar', 'newPersonaAvatar'],
    glow: ['halo', 'avatarGlow', 'ambientLight', 'connectionRing', 'sparkle'],
    colour: ['transitionGlow', 'overlay', 'backdrop'],
    caption: ['statusText', 'nameTag', 'greeting', 'farewell'],
  },
  failuresBeforeFallback: 3,
} as const;

const P = CONDUCTOR_POLICY;
/** `includes` over the literal tuples in CONDUCTOR_POLICY. */
const has = (list: readonly string[], v: string): boolean => list.includes(v);
const upsetLike = (mood: Mood): boolean => mood === 'upset' || mood === 'crisis';
/** The sequence a moment plays, or why it is dropped. */
type Verdict = { readonly play: string } | string;
/** A delight asked for: how big, and why. */
type DelightAsk = { readonly size: 'small' | 'big'; readonly reason?: string };

/** Reduced motion, character and mood shaping: the shaped write, or the drop reason. */
function shapeCommand(
  cmd: ChannelCommand,
  w: WriteContext,
  reducedMotion: boolean,
  earnedBig: boolean
): ChannelCommand | string {
  const ch = cmd.channel;
  let { durationMs, easing, action, params } = cmd;
  if (reducedMotion) {
    if (ch === 'body') return 'body:reduced-motion';
    if (cmd.loop) return `${ch}:loop:reduced-motion`;
    if (ch === 'face') durationMs = 0;
    if (ch === 'glow' && params) {
      params = Object.fromEntries(Object.entries(params).filter(([k]) => !k.startsWith('scale')));
    }
  }
  if (w.layer === 'state') durationMs = Math.round(durationMs * P.character.stateDurationScale);
  // Tender, upset, crisis: nothing bounces. Neutral poses soften to a gentle spring; moments keep theirs.
  const soft = w.mood !== 'neutral';
  if (easing && soft && !isStillEasing(easing)) easing = P.character.gentleEasing;
  else if (easing && w.layer === 'state' && has(P.character.remapEasings, easing)) {
    easing = P.character.poseEasing;
  }
  const exempt = earnedBig && w.sequenceId === P.character.overshootExempt && !soft;
  if (params && !exempt) {
    const max = soft ? P.character.softMaxScale : P.character.maxScale;
    params = Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, clampMotion(k, v, max, P.character.minTranslateY)])
    );
  }
  if (ch === 'haptic' && upsetLike(w.mood)) action = P.haptic.moodPattern;
  const hold = params?.holdMs;
  if (ch === 'face' && w.mood === 'tender' && typeof hold === 'number') {
    if (has(P.face.positive, String(params?.expression))) params = { ...params, holdMs: hold / 2 };
  }
  return { ...cmd, params, durationMs, easing, action };
}

/** Per-call dedupe, cooldowns, delight budget and the crisis pin. */
class CallGate implements CallPolicy {
  private playing = new Set<string>();
  private trackAt = new Map<string, number>();
  private once = new Set<string>();
  private hapticAt = -Infinity;
  private hapticBeats = new Map<number, number>();
  private face: { name: string; at: number } | null = null;
  private lastValue = new Map<ChannelId, string>();
  private delights = { big: 0, small: 0, at: -Infinity };
  /** An earned big celebration was let through: only it may pass the scale cap. */
  private earnedBig = false;
  private pinned: string | null = null;

  constructor(
    private readonly reducedMotion: boolean,
    private readonly sound: SoundSetting
  ) {}

  write(raw: ChannelCommand, w: WriteContext): ChannelCommand | string {
    const cmd = shapeCommand(raw, w, this.reducedMotion, this.earnedBig);
    if (typeof cmd === 'string') return cmd;
    return this.admit(cmd, w) ?? cmd;
  }

  private admit(cmd: ChannelCommand, w: WriteContext): string | null {
    switch (cmd.channel) {
      case 'sound': // only starting a track is gated; duck/stop always go through
        return cmd.action === 'play' ? this.admitSound(String(cmd.params?.track), w) : null;
      case 'haptic':
        return this.admitHaptic(cmd.action, w);
      case 'face':
        return this.admitFace(cmd, w);
      case 'glow':
      case 'colour': {
        const value = `${cmd.action}:${JSON.stringify(cmd.params ?? {})}`;
        if (this.lastValue.get(cmd.channel) === value) return `${cmd.channel}:${cmd.action}:same`;
        this.lastValue.set(cmd.channel, value);
        return null;
      }
      default:
        return null; // body and caption: the latest write wins
    }
  }

  private admitSound(track: string, w: WriteContext): string | null {
    const persona = track.startsWith(P.sound.personaPrefix);
    if (this.sound === 'off') return `sound:${track}:off`;
    if (w.mood === 'crisis') return `sound:${track}:mood=crisis`;
    if (this.sound === 'essential' && !persona && !has(P.sound.essential, track)) {
      return `sound:${track}:essential`;
    }
    if (has(P.sound.quietStates, w.state) && !persona) return `sound:${track}:quiet-${w.state}`;
    if (this.playing.has(track)) return `sound:${track}:playing`;
    if (this.once.has(track)) return `sound:${track}:once`;
    if (w.now - (this.trackAt.get(track) ?? -Infinity) < P.sound.sameTrackGapMs) {
      return `sound:${track}:cooldown`;
    }
    if (has(P.sound.oncePerAttempt, track)) this.once.add(track);
    this.trackAt.set(track, w.now);
    return null;
  }

  private admitHaptic(pattern: string, w: WriteContext): string | null {
    if (this.reducedMotion && !has(P.haptic.reducedMotionSequences, w.sequenceId)) {
      return `haptic:${pattern}:reduced-motion`;
    }
    const inBeat = this.hapticBeats.get(w.runId) ?? 0;
    if (inBeat >= P.haptic.perBeat) return `haptic:${pattern}:per-beat`;
    if (w.now - this.hapticAt < P.haptic.minGapMs) return `haptic:${pattern}:gap`;
    this.hapticBeats.set(w.runId, inBeat + 1);
    this.hapticAt = w.now;
    return null;
  }

  private admitFace(cmd: ChannelCommand, w: WriteContext): string | null {
    const name = String(cmd.params?.expression ?? cmd.action);
    if (this.pinned && !has(P.face.crisis, name)) return `face:${name}:crisis-pinned`;
    if (upsetLike(w.mood) && has(P.face.positive, name)) return `face:${name}:mood=${w.mood}`;
    if (w.mood !== 'neutral' && has(P.face.playful, name)) return `face:${name}:mood=${w.mood}`;
    if (this.face?.name === name) return `face:${name}:showing`;
    if (cmd.origin === 'beat' && this.face && w.now - this.face.at < P.face.minDwellMs) {
      return `face:${name}:dwell`;
    }
    this.face = { name, at: w.now };
    return null;
  }

  moment(beat: MomentBeat, mood: Mood, now: number): Verdict {
    if (beat.kind === 'delight') return this.delight(beat, mood, now);
    const id = beat.id;
    const asDelight = (P.delight.asSequence as Readonly<Record<string, DelightAsk>>)[id];
    if (asDelight) return this.delight(asDelight, mood, now);
    if (has(P.moments.oncePerAttempt, id)) {
      if (this.once.has(id)) return `moment:${id}:once`;
      this.once.add(id);
    }
    return { play: id };
  }

  /** Delight is earned: a listed reason, never while upset, within the budget and gap. */
  private delight({ size: asked, reason }: DelightAsk, mood: Mood, now: number): Verdict {
    if (upsetLike(mood)) return `delight:mood=${mood}`;
    if (!reason || !has(P.delight.reasons, reason)) return `delight:reason=${reason ?? 'none'}`;
    const size = mood === 'tender' ? 'small' : asked;
    if (this.delights[size] >= P.delight.perCall[size]) return `delight:${size}:budget`;
    if (now - this.delights.at < P.delight.minGapMs) return `delight:${size}:gap`;
    this.delights[size] += 1;
    this.delights.at = now;
    if (size === 'big') this.earnedBig = true;
    return { play: `celebration_${size}` };
  }

  onMood(mood: Mood): ChannelCommand | null {
    if (mood !== 'crisis') {
      this.pinned = null; // the crisis has passed: faces are free again
      return null;
    }
    if (this.pinned) return null;
    this.pinned = P.face.crisis[0];
    const params = { expression: this.pinned, source: 'choreography' };
    return { channel: 'face', action: 'expression', params, durationMs: 0, origin: 'mood' };
  }

  soundStarted(track: string): void {
    this.playing.add(track);
  }
  soundEnded(track: string): void {
    this.playing.delete(track);
  }
}

/** The warm & unhurried policy, for one viewer's reduced-motion and sound settings. */
export function createCharacterPolicy(settings: {
  readonly reducedMotion: boolean;
  readonly sound: SoundSetting;
  readonly reducedMotionTable?: Readonly<Record<string, ReducedMotionSimplification | undefined>>;
}): ConductorPolicy {
  const levels = Object.entries(P.priorities) as [Priority, readonly string[]][];
  const owners = Object.entries(P.elements) as [ChannelId, readonly string[]][];
  return {
    maxQueue: P.moments.maxQueue,
    minGapMs: P.moments.minGapMs,
    failuresBeforeFallback: P.failuresBeforeFallback,
    bargeInDuckDb: P.sound.bargeInDuckDb,
    priorityOf: (id) => levels.find(([, ids]) => has(ids, id))?.[0] ?? 'normal',
    channelFor: (el) => owners.find(([, els]) => has(els, el))?.[0] ?? null,
    steps(id: string, seq: Sequence) {
      const rm = settings.reducedMotion ? settings.reducedMotionTable?.[id] : undefined;
      if (!rm) return seq.steps;
      return seq.steps
        .filter((s) => !rm.removeSteps?.includes(s.element))
        .map((s) => ({ ...s, ...rm.modifySteps?.[s.element] }));
    },
    forCall: () => new CallGate(settings.reducedMotion, settings.sound),
  };
}
