/**
 * The Heard check: a persona-colour disc with a tick, shown beside the caller's
 * settled line once Ferni has taken the turn (heard-turn.ts). Decorative:
 * aria-hidden, no text, so the line reads the same.
 *
 * @module ui/captions/heard-check
 */

export function checkMark(): HTMLSpanElement {
  const mark = document.createElement('span');
  mark.className = 'ferni-caption-check';
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
