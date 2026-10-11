/**
 * Moment chips: the things Ferni heard and is holding on to, shown as small
 * chips under the live captions ("Remember when · the martial arts class on
 * Tuesday"). This is the part a person can't do: you see that you were heard.
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

export interface Moment {
  key: string;
  text: string;
  label?: string;
}

const MAX_CHIPS = 1; // one moment at a time: the newest, never a pile
const CHIP_MS = 9000;
/** Trust signals worth a chip: memory callbacks, growth, small wins. */
const TRUST_TYPES = new Set(['callback', 'growth', 'small_win']);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** A chip for a backend trust signal, or null for types that stay private. */
export function momentFromTrustSignal(detail: unknown): Moment | null {
  const d = (detail ?? {}) as Record<string, unknown>;
  const type = text(d['type']);
  const message = text(d['message']);
  if (!TRUST_TYPES.has(type) || !message) return null;
  return { key: `trust:${type}`, label: text(d['title']) || undefined, text: message };
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
