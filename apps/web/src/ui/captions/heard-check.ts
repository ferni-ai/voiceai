/**
 * The Heard check: a persona-colour disc with a tick, shown beside the caller's
 * settled line once Ferni has taken the turn (heard-turn.ts). Decorative:
 * aria-hidden, no text, so the line reads the same.
 *
 * @module ui/captions/heard-check
 */

import type { CaptionEntry } from './caption-entry.js';
import { heardTicked, type HeardTurn } from './heard-turn.js';

function checkMark(pop: boolean): HTMLSpanElement {
  const mark = document.createElement('span');
  mark.className = pop ? 'ferni-caption-check ferni-caption-check--pop' : 'ferni-caption-check';
  mark.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 12.5l4.5 4.5L19 7');
  svg.append(path);
  mark.append(svg);
  return mark;
}

/**
 * Heard: the caller's line is interim (faint) until its transcript is final, and
 * the check pops on the line Ferni has taken. `popped` remembers the lines whose
 * check has popped, so a redraw re-adds the check without the pop.
 */
export function markHeard(
  line: HTMLElement,
  entry: CaptionEntry,
  turn: HeardTurn | null,
  popped: WeakSet<CaptionEntry>
): void {
  if (!turn || entry.speaker !== 'user') return;
  line.classList.toggle('ferni-caption-line--interim', !entry.final);
  const ticked = entry === turn.user && heardTicked(turn);
  line.classList.toggle('ferni-caption-line--ticked', ticked);
  if (!ticked || line.querySelector('.ferni-caption-check')) return;
  const pop = !popped.has(entry);
  popped.add(entry);
  line.append(checkMark(pop));
}
