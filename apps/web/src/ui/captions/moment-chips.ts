/**
 * Moment chips: the things Ferni heard and is holding on to, shown as small
 * chips under the live captions, in Ferni's voice and on one line ("I'll
 * remember: you started martial arts on Tuesdays"). This is the part a person can't do: you see that you were heard.
 *
 * Sources (all window events, all optional; nothing shows if none arrive):
 * - `ferni:backend-trust-signal` callback / growth / small_win. The trust
 *   signal cards hide during a call, so in-call this is their only surface.
 * - `ferni:inline-feedback` (the in-call toast gate): "Reminder set", etc.
 * - `ferni:moment` {text, label?, key?}: for anything else that wants a chip,
 *   e.g. a future "remembering" event when Ferni saves a memory.
 *
 * Chips show even with captions off. One at a time (the newest); each one
 * settles away after a few seconds.
 *
 * @module ui/captions/moment-chips
 */

import { DURATION } from '../../config/animation-constants.js';
import { t } from '../../i18n/index.js';

export interface Moment {
  key: string;
  text: string;
  label?: string;
}

const MAX_CHIPS = 1; // one moment at a time: the newest, never a pile
const CHIP_MS = 9000;
/** Trust signals worth a chip, labelled in Ferni's voice (i18n keys). */
const TRUST_LABELS: Record<string, string> = {
  callback: 'transcript.momentRemember', // "I'll remember:"
  growth: 'transcript.momentNoticed', // "I noticed:"
  small_win: 'transcript.momentWin', // "Nice:"
};
/** Words a shortened chip should not end on. */
const DANGLING = /^(a|an|the|and|or|but|on|in|at|to|for|of|with|from|by|my|your|our)$/i;
/** Sentence starters that read wrong capitalised after a label ("…: you"). */
const STARTERS =
  /^(You|Your|Yours|Yourself|You're|You've|You'll|You'd|My|We|We're|Our|The|That|This|It|It's)\b/;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** A chip for a backend trust signal, or null for types that stay private. */
export function momentFromTrustSignal(detail: unknown): Moment | null {
  const d = (detail ?? {}) as Record<string, unknown>;
  const type = text(d['type']);
  const message = text(d['message']);
  const label = TRUST_LABELS[type];
  if (!label || !message) return null;
  return { key: `trust:${type}`, label: t(label), text: continueAfterLabel(message) };
}

/** A chip for in-call feedback ({message, tone, key}) or a generic moment. */
export function momentFromDetail(detail: unknown, prefix: string): Moment | null {
  const d = (detail ?? {}) as Record<string, unknown>;
  const message = text(d['message']) || text(d['text']);
  if (!message) return null;
  return {
    key: `${prefix}:${text(d['key']) || message}`,
    label: text(d['label']) || undefined,
    text: message,
  };
}

/** "You started…" → "you started…" so it reads on from the label; names stay. */
export function continueAfterLabel(message: string): string {
  return message.replace(STARTERS, (word) => word.toLowerCase());
}

export function renderChip(moment: Moment): HTMLLIElement {
  const chip = document.createElement('li');
  chip.className = 'ferni-moment';
  chip.dataset.key = moment.key;
  if (moment.label) {
    const label = document.createElement('span');
    label.className = 'ferni-moment__label';
    label.textContent = moment.label;
    chip.append(label);
  }
  const body = document.createElement('span');
  body.className = 'ferni-moment__text';
  body.textContent = moment.text;
  chip.append(body);
  return chip;
}

/**
 * Keep a chip to one line (a two-line chip reads like a toast): drop whole
 * words from the end until it fits, end with "…", and keep the full moment
 * as the chip's accessible text. Skipped when the row has no width yet.
 */
export function fitOneLine(chip: HTMLElement, width: number): void {
  const body = chip.querySelector<HTMLElement>('.ferni-moment__text');
  if (!body || width <= 0 || chip.scrollWidth <= width) return;
  const label = chip.querySelector('.ferni-moment__label')?.textContent;
  const full = [label, body.textContent].filter(Boolean).join(' ');
  const words = (body.textContent ?? '').split(' ');
  while (words.length > 1 && chip.scrollWidth > width) {
    words.pop();
    // Never end on a dangling little word ("martial arts on…").
    while (words.length > 1 && DANGLING.test(words[words.length - 1] ?? '')) words.pop();
    body.textContent = `${words.join(' ').replace(/[\s,;:.]+$/, '')}…`;
  }
  chip.setAttribute('aria-label', full);
  chip.title = full;
}

export class MomentChips {
  private timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  constructor(
    readonly list: HTMLOListElement,
    private readonly onChange: () => void
  ) {}

  show(moment: Moment): void {
    for (const old of this.chips()) if (old.dataset.key === moment.key) this.drop(old, true);
    const chip = renderChip(moment);
    this.list.append(chip);
    fitOneLine(chip, this.list.clientWidth);
    const live = this.chips();
    for (const extra of live.slice(0, Math.max(0, live.length - MAX_CHIPS))) this.drop(extra, true);
    this.timers.set(
      chip,
      setTimeout(() => this.drop(chip, false), CHIP_MS)
    );
    this.onChange();
  }

  clear(): void {
    for (const chip of this.chips()) this.drop(chip, true);
  }

  count(): number {
    return this.chips().length;
  }

  private chips(): HTMLElement[] {
    return [...this.list.children].filter(
      (c): c is HTMLElement => !c.classList.contains('ferni-moment--leaving')
    ) as HTMLElement[];
  }

  /** Fade a chip out (or remove it now) and tell the region. */
  private drop(chip: HTMLElement, now: boolean): void {
    clearTimeout(this.timers.get(chip));
    this.timers.delete(chip);
    if (now) {
      chip.remove();
      this.onChange();
      return;
    }
    chip.classList.add('ferni-moment--leaving');
    setTimeout(() => {
      chip.remove();
      this.onChange();
    }, DURATION.SLOW);
  }
}
