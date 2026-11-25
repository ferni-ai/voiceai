/**
 * The Avatar Soul section's controls: which lab command each button sends, the
 * markup for the buttons and the motion switches, and how a lab answer reads.
 *
 * @module admin/sections/avatar-lab-controls
 */
import type { LabCommand, LabMoment } from '../../avatar-lab/lab-protocol.js';
import {
  MOTION_FLAGS,
  motionFlagBuildDefault,
  motionFlagOverride,
  type MotionFlag,
} from '../../config/motion-flags.js';
import type { NameLiftEffect } from '../../ui/avatar-motion/name-lift.js';
import { EMOTIONAL_EXPRESSIONS } from '../../ui/ferni-expressions.ui.js';
import type { Speaker } from '../../ui/speaker-cues.ui.js';
import { isLabNotReady, type LabAnswer } from './avatar-lab-client.js';

export interface LabControl {
  label: string;
  command: LabCommand;
}

const TURNS: Readonly<Record<Speaker, string>> = {
  ferni: 'Ferni speaking',
  user: 'You speaking',
  thinking: 'Thinking',
  none: 'Nobody',
};

/** One button per moment the lab protocol knows: a moment added there fails to compile here. */
const MOMENTS: Readonly<Record<LabMoment, string>> = {
  warmthBloom: 'Warmth bloom',
  memorySpark: 'Memory spark',
  comfortPulseStart: 'Comfort pulse',
  comfortPulseStop: 'Stop pulse',
  protectiveOn: 'Protective on',
  protectiveOff: 'Protective off',
  celebrateGrowth: 'Celebrate growth',
  cameoArrival: 'Cameo arrival',
  cameoReturn: 'Cameo return',
};

const LIFTS: Readonly<Record<NameLiftEffect, string>> = {
  brighten: 'Brighten',
  attentive: 'Attentive',
  comfort: 'Comfort',
};

const entries = <K extends string>(table: Readonly<Record<K, string>>) =>
  Object.entries(table) as [K, string][];

const ROWS: { name: string; controls: [string, LabControl][] }[] = [
  {
    name: 'Turn',
    controls: entries(TURNS).map(([speaker, label]) => [
      `turn:${speaker}`,
      { label, command: { name: 'turn', speaker } },
    ]),
  },
  {
    name: 'Moments',
    controls: entries(MOMENTS).map(([moment, label]) => [
      `moment:${moment}`,
      { label, command: { name: 'moment', moment } },
    ]),
  },
  {
    name: 'Name lift',
    controls: entries(LIFTS).map(([effect, label]) => [
      `nameLift:${effect}`,
      { label, command: { name: 'nameLift', effect } },
    ]),
  },
  {
    name: 'Crisis hold',
    controls: [
      ['crisisHold:on', { label: 'Hold', command: { name: 'crisisHold', on: true } }],
      ['crisisHold:off', { label: 'Release', command: { name: 'crisisHold', on: false } }],
    ],
  },
];

const CONTROLS = new Map(ROWS.flatMap((row) => row.controls));

/** The control a button names; the face button sends the face its select shows. */
export function labControl(id: string, face: string | undefined): LabControl | null {
  if (id !== 'face') return CONTROLS.get(id) ?? null;
  const expression = EMOTIONAL_EXPRESSIONS.find((e) => e === face);
  return expression ? { label: `Face ${expression}`, command: { name: 'face', expression } } : null;
}

/** What the status line says for a lab answer: never "played" unless the lab ran it. */
export function describeAnswer(label: string, answer: LabAnswer): string {
  if (isLabNotReady(answer)) return 'Lab not ready';
  if (!answer.ok) return answer.why ? `Not played: ${answer.why}` : 'Not played';
  return answer.ran ? `${label} played (${answer.ran})` : `${label} played`;
}

const button = (id: string, label: string): string =>
  `<button type="button" class="admin-btn admin-btn--secondary" data-lab-control="${id}">${label}</button>`;

const row = (name: string, inner: string): string =>
  `<div class="soul-row"><span class="soul-row-name">${name}</span>${inner}</div>`;

function faceRow(): string {
  const options = EMOTIONAL_EXPRESSIONS.map((e) => `<option value="${e}">${e}</option>`).join('');
  return row(
    'Face',
    `<select class="soul-select" data-lab-face aria-label="Face">${options}</select>${button('face', 'Show face')}`
  );
}

/** The lab's buttons, row by row: Turn, Face, Moments, Name lift, Crisis hold. */
export function renderLabControls(): string {
  const [turn, ...rest] = ROWS.map((r) =>
    row(r.name, r.controls.map(([id, c]) => button(id, c.label)).join(''))
  );
  return [turn, faceRow(), ...rest].join('');
}

const OVERRIDES = ['default', 'on', 'off'] as const;
type OverrideChoice = (typeof OVERRIDES)[number];
const onOff = (on: boolean): string => (on ? 'on' : 'off');

export function overrideChoice(value: string): OverrideChoice | null {
  return OVERRIDES.find((o) => o === value) ?? null;
}

export function motionFlagFrom(value: string | undefined): MotionFlag | null {
  return MOTION_FLAGS.find((f) => f === value) ?? null;
}

function switchRow(flag: MotionFlag): string {
  const chosen = motionFlagOverride(flag) ?? 'default';
  const options = OVERRIDES.map(
    (o) => `<option value="${o}"${o === chosen ? ' selected' : ''}>${o}</option>`
  ).join('');
  return `<li class="soul-row" data-motion-row="${flag}">
    <span class="soul-row-name">${flag}</span>
    <span class="soul-muted">build: ${onOff(motionFlagBuildDefault(flag))}</span>
    <select class="soul-select" data-motion-flag="${flag}" aria-label="${flag} override">${options}</select>
  </li>`;
}

export function renderMotionSwitches(): string {
  return `<ul class="soul-switches">${MOTION_FLAGS.map(switchRow).join('')}</ul>`;
}

/** What the status line says once a switch changed and the lab reloaded. */
export function describeSwitch(flag: MotionFlag, choice: OverrideChoice): string {
  const now =
    choice === 'default' ? `the build value (${onOff(motionFlagBuildDefault(flag))})` : choice;
  return `${flag} is now ${now} in this browser; the lab reloaded`;
}

export function describeReducedMotion(on: boolean): string {
  return `Reduced motion: ${onOff(on)} (follows this device; turn ${onOff(!on)} in the OS or DevTools)`;
}
