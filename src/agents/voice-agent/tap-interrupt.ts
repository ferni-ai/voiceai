/**
 * Tap to interrupt: the caller taps a button in the app and Ferni stops
 * talking, the same as if they had started speaking over him.
 * TAP_INTERRUPT=on (default off).
 *
 * The web app sends `{ type: 'user_interrupt', timestamp }` on the reliable
 * data channel while Ferni is speaking. It only shows the button when the
 * agent participant carries the attribute `ferni.tap_interrupt` = "on", which
 * this module sets when the flag is on, so a client never offers a button the
 * agent would ignore.
 *
 * @module voice-agent/tap-interrupt
 */
import { ParticipantKind } from '@livekit/rtc-node';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'tap-interrupt' });

export const TAP_INTERRUPT_MESSAGE = 'user_interrupt';
export const TAP_INTERRUPT_ATTRIBUTE = 'ferni.tap_interrupt';

type Env = Record<string, string | undefined>;

export function tapInterruptEnabled(env: Env = process.env): boolean {
  return env.TAP_INTERRUPT === 'on';
}

/** The parts of the AgentSession this needs. */
export interface InterruptibleSession {
  readonly agentState: string;
  interrupt: () => { await: Promise<void> };
}

/** The parts of the LiveKit room this needs. */
export interface TapInterruptRoom {
  localParticipant?: { setAttributes: (attributes: Record<string, string>) => Promise<void> };
  remoteParticipants: Map<string, { kind?: ParticipantKind }>;
}

export type TapInterruptOutcome =
  'disabled' | 'malformed' | 'not_caller' | 'not_speaking' | 'interrupted' | 'failed';

/** Tell the web client it may show the tap-to-interrupt button. No-op when the flag is off. */
export function advertiseTapInterrupt(room: TapInterruptRoom, env: Env = process.env): void {
  if (!tapInterruptEnabled(env) || !room.localParticipant) return;
  room.localParticipant.setAttributes({ [TAP_INTERRUPT_ATTRIBUTE]: 'on' }).then(
    () => log.info('Tap to interrupt advertised to the client'),
    (err: unknown) => log.warn({ err }, 'Could not set the tap-to-interrupt attribute')
  );
}

function isWellFormed(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) return false;
  const { type, timestamp } = message as { type?: unknown; timestamp?: unknown };
  return (
    type === TAP_INTERRUPT_MESSAGE && typeof timestamp === 'number' && Number.isFinite(timestamp)
  );
}

/** Only a human in the call may stop Ferni: not another agent, not someone unknown. */
function isCaller(room: TapInterruptRoom, identity: string | undefined): boolean {
  if (!identity) return false;
  const participant = room.remoteParticipants.get(identity);
  return participant !== undefined && participant.kind !== ParticipantKind.AGENT;
}

/**
 * Handle a `user_interrupt` data message: stop Ferni's current speech if he is
 * speaking. Returns what happened, for logging and tests.
 */
export async function handleTapInterrupt(
  message: unknown,
  room: TapInterruptRoom,
  session: InterruptibleSession,
  senderIdentity: string | undefined,
  env: Env = process.env
): Promise<TapInterruptOutcome> {
  if (!tapInterruptEnabled(env)) return 'disabled';
  if (!isWellFormed(message)) {
    log.warn('Ignoring malformed user_interrupt message');
    return 'malformed';
  }
  if (!isCaller(room, senderIdentity)) {
    log.warn({ senderIdentity: senderIdentity }, 'Ignoring user_interrupt from a non-caller');
    return 'not_caller';
  }
  const state = session.agentState;
  if (state !== 'speaking') {
    log.info({ state }, 'Tap to interrupt while Ferni was not speaking; nothing to stop');
    return 'not_speaking';
  }
  try {
    await session.interrupt().await;
    log.info({ senderIdentity: senderIdentity }, 'Tap to interrupt: stopped Ferni speaking');
    return 'interrupted';
  } catch (err: unknown) {
    log.warn({ err }, 'Tap to interrupt failed');
    return 'failed';
  }
}
