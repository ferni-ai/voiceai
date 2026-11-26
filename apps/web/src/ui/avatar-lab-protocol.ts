/**
 * The avatar lab's messages: the admin Avatar Soul page posts a LabRequest to
 * the /avatar-lab frame, and the lab answers with one LabReply of the same id.
 *
 * Both parsers check every field and build a fresh object, so a message that
 * is not exactly one of these shapes (a name the lab does not know, a face not
 * in EMOTIONAL_EXPRESSIONS, `__proto__`) is rejected and nothing from it runs.
 */
import { EMOTIONAL_EXPRESSIONS, type EmotionalExpression } from './ferni-expressions.ui.js';
import { nameLiftEffectFrom, type NameLiftEffect } from './avatar-motion/name-lift.js';
import type { Speaker } from './speaker-cues.ui.js';

export const LAB_MESSAGE_TYPE = 'ferni:avatar-lab';

const LAB_MOMENTS = [
  'warmthBloom',
  'memorySpark',
  'comfortPulseStart',
  'comfortPulseStop',
  'protectiveOn',
  'protectiveOff',
  'celebrateGrowth',
  'cameoArrival',
  'cameoReturn',
] as const;
export type LabMoment = (typeof LAB_MOMENTS)[number];

const SPEAKERS: readonly Speaker[] = ['ferni', 'user', 'thinking', 'none'];

export type LabCommand =
  | { name: 'turn'; speaker: Speaker }
  | { name: 'face'; expression: EmotionalExpression }
  | { name: 'moment'; moment: LabMoment }
  | { name: 'nameLift'; effect: NameLiftEffect }
  | { name: 'crisisHold'; on: boolean }
  | { name: 'status' };

export interface LabRequest {
  type: typeof LAB_MESSAGE_TYPE;
  id: string;
  command: LabCommand;
}

export interface LabStatus {
  ready: boolean;
  crisisHeld: boolean;
  reducedMotion: boolean;
  turn: Speaker;
}

export interface LabReply {
  type: typeof LAB_MESSAGE_TYPE;
  id: string;
  /** false: refused or unknown, and nothing ran. */
  ok: boolean;
  /** The real export that ran, e.g. 'triggerMemorySpark'. */
  ran?: string;
  /** A refusal, said for a person. */
  why?: string;
  status?: LabStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** The type and id every lab message carries, or null. */
function envelopeId(data: unknown): string | null {
  if (!isRecord(data) || data.type !== LAB_MESSAGE_TYPE) return null;
  return typeof data.id === 'string' && data.id.length > 0 ? data.id : null;
}

function parseCommand(raw: unknown): LabCommand | null {
  if (!isRecord(raw)) return null;
  switch (raw.name) {
    case 'turn':
      return oneOf(SPEAKERS, raw.speaker) ? { name: 'turn', speaker: raw.speaker } : null;
    case 'face':
      return oneOf(EMOTIONAL_EXPRESSIONS, raw.expression)
        ? { name: 'face', expression: raw.expression }
        : null;
    case 'moment':
      return oneOf(LAB_MOMENTS, raw.moment) ? { name: 'moment', moment: raw.moment } : null;
    case 'nameLift': {
      const effect = nameLiftEffectFrom(raw.effect);
      return effect ? { name: 'nameLift', effect } : null;
    }
    case 'crisisHold':
      return typeof raw.on === 'boolean' ? { name: 'crisisHold', on: raw.on } : null;
    case 'status':
      return { name: 'status' };
    default:
      return null;
  }
}

export function parseLabRequest(data: unknown): LabRequest | null {
  const id = envelopeId(data);
  if (id === null || !isRecord(data)) return null;
  const command = parseCommand(data.command);
  return command ? { type: LAB_MESSAGE_TYPE, id, command } : null;
}

/** The id of a lab request the lab cannot run (an unknown command), so it can still answer `ok: false`. */
export function unknownRequestId(data: unknown): string | null {
  return isRecord(data) && 'command' in data ? envelopeId(data) : null;
}

function parseStatus(raw: unknown): LabStatus | null {
  if (!isRecord(raw)) return null;
  const { ready, crisisHeld, reducedMotion, turn } = raw;
  if (typeof ready !== 'boolean' || typeof crisisHeld !== 'boolean') return null;
  if (typeof reducedMotion !== 'boolean' || !oneOf(SPEAKERS, turn)) return null;
  return { ready, crisisHeld, reducedMotion, turn };
}

export function parseLabReply(data: unknown): LabReply | null {
  const id = envelopeId(data);
  if (id === null || !isRecord(data) || typeof data.ok !== 'boolean') return null;
  const reply: LabReply = { type: LAB_MESSAGE_TYPE, id, ok: data.ok };
  for (const key of ['ran', 'why'] as const) {
    const value = data[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') return null;
    reply[key] = value;
  }
  if (data.status !== undefined) {
    const status = parseStatus(data.status);
    if (!status) return null;
    reply.status = status;
  }
  return reply;
}
