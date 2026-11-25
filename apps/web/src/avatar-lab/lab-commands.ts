/**
 * The avatar lab's command table: each LabCommand runs one real avatar export,
 * after the same gate that export's callers use, and says which export ran.
 *
 * The exports are injected (LabDeps) so tests can spy on them. The gates are
 * not: they are the real predicates (the crisis face hold, the avatar motion
 * switch, the viewer's reduced motion), so the lab refuses exactly what a call
 * would refuse.
 */
import type { CrisisAffect } from '../config/crisis-faces.js';
import type { TurnDriver } from '../ui/avatar-motion/turn-driver.js';
import { avatarMotionAllowed } from '../ui/avatar-motion/motion-allowed.js';
import type { NameLiftEffect } from '../ui/avatar-motion/name-lift.js';
import {
  crisisAffectAllows,
  crisisFaceAllows,
  isCrisisFaceHeld,
} from '../ui/face/crisis-face-hold.js';
import type { EmotionalExpression } from '../ui/ferni-expressions.ui.js';
import type { SpeakerSignals } from '../ui/speaker-cues-signals.js';
import type { Speaker } from '../ui/speaker-cues.ui.js';
import { prefersReducedMotion } from '../utils/accessibility.js';
import type { LabCommand, LabMoment, LabReply, LabStatus } from './lab-protocol.js';

/** The avatar-soul.ui.ts exports the moments play. */
export interface LabSoul {
  triggerWarmthBloom(intensity?: number, color?: string): void;
  triggerMemorySpark(): void;
  startComfortPulse(): void;
  stopComfortPulse(): void;
  enterProtectiveMode(): void;
  exitProtectiveMode(): void;
  celebrateGrowth(): void;
  flashShimmer(intensity?: number): void;
  triggerCameoArrival(personaColor: string, isFirstCameo?: boolean): void;
  triggerCameoReturn(): void;
}

export interface LabDeps {
  driver: Pick<TurnDriver, 'update' | 'shown'>;
  soul: LabSoul;
  setExpression(expression: EmotionalExpression): void;
  playNameLift(signal: { effect: NameLiftEffect }): void;
  holdCrisisFace(): void;
  releaseCrisisFace(): void;
  /** Ferni's persona colour, for the cameo arrival's bloom. */
  personaColor(): string;
  /** Whether the avatar soul has finished booting. */
  ready(): boolean;
}

export type LabResult = Omit<LabReply, 'type' | 'id'>;

const FACE_HELD_WHY = 'The crisis hold allows only calm faces';
const PROTECTIVE_REDUCED_WHY = 'Reduced motion is on, so protective mode does not play';

const quiet = { userLevel: 0, canInterrupt: false } as const;

const TURN_SIGNALS: Readonly<Record<Speaker, SpeakerSignals>> = {
  ferni: { agentState: 'speaking', userSpeaking: false, ...quiet },
  user: { agentState: 'listening', userSpeaking: true, ...quiet },
  thinking: { agentState: 'thinking', userSpeaking: false, ...quiet },
  none: { agentState: 'listening', userSpeaking: false, ...quiet },
};

/** The kind of crisis affect a moment plays, asked of the real hold. */
const affect = (kind: CrisisAffect) => (): boolean => crisisAffectAllows(kind);
const always = (): boolean => true;

interface MomentRow {
  ran: keyof LabSoul;
  allowed: () => boolean;
  /** Said when `allowed` refuses; only where the reason is known for a person. */
  why?: string;
  play: (deps: LabDeps) => void;
}

const MOMENTS: Readonly<Record<LabMoment, MomentRow>> = {
  warmthBloom: {
    ran: 'triggerWarmthBloom',
    allowed: affect('warm'),
    play: (d) => d.soul.triggerWarmthBloom(1),
  },
  memorySpark: {
    ran: 'triggerMemorySpark',
    allowed: affect('sparkle'),
    play: (d) => d.soul.triggerMemorySpark(),
  },
  comfortPulseStart: {
    ran: 'startComfortPulse',
    allowed: () => avatarMotionAllowed('comfortPulse'),
    play: (d) => d.soul.startComfortPulse(),
  },
  comfortPulseStop: {
    ran: 'stopComfortPulse',
    allowed: always,
    play: (d) => d.soul.stopComfortPulse(),
  },
  protectiveOn: {
    ran: 'enterProtectiveMode',
    allowed: () => !prefersReducedMotion(),
    why: PROTECTIVE_REDUCED_WHY,
    play: (d) => d.soul.enterProtectiveMode(),
  },
  protectiveOff: {
    ran: 'exitProtectiveMode',
    allowed: always,
    play: (d) => d.soul.exitProtectiveMode(),
  },
  celebrateGrowth: {
    ran: 'celebrateGrowth',
    allowed: affect('celebration'),
    play: (d) => d.soul.celebrateGrowth(),
  },
  shimmer: { ran: 'flashShimmer', allowed: affect('sparkle'), play: (d) => d.soul.flashShimmer(1) },
  cameoArrival: {
    ran: 'triggerCameoArrival',
    allowed: affect('sparkle'),
    play: (d) => d.soul.triggerCameoArrival(d.personaColor()),
  },
  cameoReturn: {
    ran: 'triggerCameoReturn',
    allowed: affect('sparkle'),
    play: (d) => d.soul.triggerCameoReturn(),
  },
};

function runMoment(moment: LabMoment, deps: LabDeps): LabResult {
  const row = MOMENTS[moment];
  if (!row.allowed()) return row.why ? { ok: false, why: row.why } : { ok: false };
  row.play(deps);
  return { ok: true, ran: row.ran };
}

function labStatus(deps: LabDeps): LabStatus {
  return {
    ready: deps.ready(),
    crisisHeld: isCrisisFaceHeld(),
    reducedMotion: prefersReducedMotion(),
    turn: deps.driver.shown(),
  };
}

export function runLabCommand(cmd: LabCommand, deps: LabDeps): LabResult {
  switch (cmd.name) {
    case 'turn':
      deps.driver.update(TURN_SIGNALS[cmd.speaker]);
      return { ok: true, ran: 'update' };
    case 'face':
      if (!crisisFaceAllows(cmd.expression)) return { ok: false, why: FACE_HELD_WHY };
      deps.setExpression(cmd.expression);
      return { ok: true, ran: 'setExpression' };
    case 'moment':
      return runMoment(cmd.moment, deps);
    case 'nameLift':
      deps.playNameLift({ effect: cmd.effect });
      return { ok: true, ran: 'playNameLift' };
    case 'crisisHold':
      if (cmd.on) deps.holdCrisisFace();
      else deps.releaseCrisisFace();
      return { ok: true, ran: cmd.on ? 'holdCrisisFace' : 'releaseCrisisFace' };
    case 'status':
      return { ok: true, status: labStatus(deps) };
    default:
      return { ok: false }; // a command this table does not know runs nothing
  }
}
