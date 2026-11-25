/**
 * The avatar lab's command table: each LabCommand runs one real avatar export,
 * after the same gate that export's callers use, and says which export ran.
 *
 * The exports are injected (LabDeps) so tests can spy on them. The gates are
 * not: they are the real predicates (the crisis face hold, the avatar motion
 * switch, the soul's own reduced-motion and started state). Most moments are
 * refused exactly when their export would refuse. Three follow a lab policy
 * stricter than the export: celebrateGrowth, triggerCameoArrival and
 * triggerCameoReturn do not check the crisis hold themselves, but the lab
 * refuses them during it (by the crisis affect they play), so the admin never
 * reads "played" for a moment that is mostly refused mid-way.
 */
import type { CrisisAffect } from '../config/crisis-faces.js';
import type { TurnDriver } from '../ui/avatar-motion/turn-driver.js';
import { avatarMotionAllowed } from '../ui/avatar-motion/motion-allowed.js';
import { nameLiftCovered, type NameLiftEffect } from '../ui/avatar-motion/name-lift.js';
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

/** The avatar soul's own state, as `avatarSoul.getState()` reports it: what its exports check. */
export interface LabSoulState {
  isInitialized: boolean;
  reducedMotion: boolean;
  comfortPulseActive: boolean;
  protectiveMode: boolean;
}

/** The avatar-soul.ui.ts exports the moments play, and the state they check. */
export interface LabSoul {
  triggerWarmthBloom(intensity?: number, color?: string): void;
  triggerMemorySpark(): void;
  startComfortPulse(): void;
  stopComfortPulse(): void;
  enterProtectiveMode(): void;
  exitProtectiveMode(): void;
  celebrateGrowth(): void;
  triggerCameoArrival(personaColor: string, isFirstCameo?: boolean): void;
  triggerCameoReturn(): void;
  getState(): LabSoulState;
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
}

export type LabResult = Omit<LabReply, 'type' | 'id'>;

const UNKNOWN_WHY = 'unknown command';
const FACE_HELD_WHY = 'The crisis hold allows only calm faces';
const MOMENT_HELD_WHY = 'The crisis hold allows only calm moments';
const REDUCED_WHY = 'Reduced motion is on, so this moment does not play';
const PROTECTIVE_REDUCED_WHY = 'Reduced motion is on, so protective mode does not play';
const STARTING_WHY = 'The avatar is still starting, so this moment does not play';
const NAME_LIFT_COVERED_WHY = 'Something is already showing, so the name lift does not show';

/** The refusal for a request the lab cannot run: an unknown name or argument. */
export const UNKNOWN_COMMAND: Readonly<LabResult> = Object.freeze({ ok: false, why: UNKNOWN_WHY });
/** The answer when an export throws: nothing showed. */
export const COMMAND_FAILED: Readonly<LabResult> = Object.freeze({
  ok: false,
  why: 'Something went wrong, so this did not play',
});

const quiet = { userLevel: 0, canInterrupt: false } as const;

const TURN_SIGNALS: Readonly<Record<Speaker, SpeakerSignals>> = {
  ferni: { agentState: 'speaking', userSpeaking: false, ...quiet },
  user: { agentState: 'listening', userSpeaking: true, ...quiet },
  thinking: { agentState: 'thinking', userSpeaking: false, ...quiet },
  none: { agentState: 'listening', userSpeaking: false, ...quiet },
};

/** One check a moment's export makes before it shows anything: the refusal, or null to go on. */
type Gate = (state: LabSoulState) => string | null;

/** Every soul export draws into elements initAvatarSoul creates, and does nothing before. */
const started: Gate = (s) => (s.isInitialized ? null : STARTING_WHY);
/** The soul's exports return early on its own reduced-motion state (read at init). */
const motion =
  (why = REDUCED_WHY): Gate =>
  (s) =>
    s.reducedMotion ? why : null;
/** The kind of crisis affect a moment plays, asked of the real hold. */
const affect =
  (kind: CrisisAffect): Gate =>
  () =>
    crisisAffectAllows(kind) ? null : MOMENT_HELD_WHY;
/** startComfortPulse also asks the avatar motion switch: off under reduced motion or the hold. */
const comfortPulseMotion: Gate = () => {
  if (avatarMotionAllowed('comfortPulse')) return null;
  return prefersReducedMotion() ? REDUCED_WHY : MOMENT_HELD_WHY;
};

interface MomentRow {
  ran: keyof LabSoul;
  /** Checked in order; the first refusal wins and nothing runs. */
  gates: readonly Gate[];
  play: (deps: LabDeps) => void;
}

const MOMENTS: Readonly<Record<LabMoment, MomentRow>> = {
  warmthBloom: {
    ran: 'triggerWarmthBloom',
    gates: [started, motion(), affect('warm')],
    play: (d) => d.soul.triggerWarmthBloom(1),
  },
  memorySpark: {
    ran: 'triggerMemorySpark',
    gates: [started, motion(), affect('sparkle')],
    play: (d) => d.soul.triggerMemorySpark(),
  },
  comfortPulseStart: {
    ran: 'startComfortPulse',
    gates: [started, motion(), comfortPulseMotion],
    play: (d) => d.soul.startComfortPulse(),
  },
  comfortPulseStop: { ran: 'stopComfortPulse', gates: [], play: (d) => d.soul.stopComfortPulse() },
  protectiveOn: {
    ran: 'enterProtectiveMode',
    gates: [started, motion(PROTECTIVE_REDUCED_WHY)],
    play: (d) => d.soul.enterProtectiveMode(),
  },
  protectiveOff: { ran: 'exitProtectiveMode', gates: [], play: (d) => d.soul.exitProtectiveMode() },
  celebrateGrowth: {
    ran: 'celebrateGrowth',
    gates: [started, motion(), affect('celebration')],
    play: (d) => d.soul.celebrateGrowth(),
  },
  cameoArrival: {
    ran: 'triggerCameoArrival',
    gates: [started, motion(), affect('sparkle')],
    play: (d) => d.soul.triggerCameoArrival(d.personaColor()),
  },
  cameoReturn: {
    ran: 'triggerCameoReturn',
    gates: [started, motion(), affect('sparkle')],
    play: (d) => d.soul.triggerCameoReturn(),
  },
};

function runMoment(moment: LabMoment, deps: LabDeps): LabResult {
  const row = MOMENTS[moment];
  const state = deps.soul.getState();
  for (const gate of row.gates) {
    const why = gate(state);
    if (why !== null) return { ok: false, why };
  }
  row.play(deps);
  return { ok: true, ran: row.ran };
}

function labStatus(deps: LabDeps): LabStatus {
  return {
    ready: deps.soul.getState().isInitialized,
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
      if (nameLiftCovered(deps.soul)) return { ok: false, why: NAME_LIFT_COVERED_WHY };
      deps.playNameLift({ effect: cmd.effect });
      return { ok: true, ran: 'playNameLift' };
    case 'crisisHold':
      if (cmd.on) deps.holdCrisisFace();
      else deps.releaseCrisisFace();
      return { ok: true, ran: cmd.on ? 'holdCrisisFace' : 'releaseCrisisFace' };
    case 'status':
      return { ok: true, status: labStatus(deps) };
    default:
      return UNKNOWN_COMMAND; // a command this table does not know runs nothing
  }
}
