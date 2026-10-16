/**
 * The role label under the speaker's name: "Life coach" for Ferni,
 * "Habits coach" for Maya, and so on.
 *
 * The i18n key comes from the persona's manifest (identity.role_label,
 * generated into personas.generated.json); a persona without one shows "Friend".
 *
 * On a handoff the words crossfade (opacity only) and the pill eases to its new
 * width. The pill sits alone in its row, so nothing around it moves.
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { getCoach } from '../config/personas.js';
import { t } from '../i18n/index.js';
import type { PersonaConfig } from '../types/persona.js';

export const FALLBACK_ROLE_LABEL_KEY = 'aiLabel.role.friend';

const FADE_OUT_MS = DURATION.FAST;
const FADE_IN_MS = DURATION.STANDARD;

/** The i18n key to show for a persona; the generic one when it has none or it is untranslated. */
export function aiRoleLabelKey(persona?: Pick<PersonaConfig, 'roleLabel'> | null): string {
  const key = persona?.roleLabel;
  return key && t(key) !== key ? key : FALLBACK_ROLE_LABEL_KEY;
}

/** The label text for a persona, in the current locale. */
export function aiRoleLabel(persona?: Pick<PersonaConfig, 'roleLabel'> | null): string {
  return t(aiRoleLabelKey(persona));
}

/**
 * A label row for screens with no speaker yet (the sign-in gate): Ferni's role.
 * Styles in ai-companion-label.css; `extraClass` places the row.
 */
export function createAiRoleLabelRow(extraClass: string): HTMLElement {
  const row = document.createElement('div');
  row.className = `ai-companion-label-row ${extraClass}`;
  const pill = document.createElement('span');
  pill.className = 'ai-companion-label';
  const text = document.createElement('span');
  text.className = 'ai-companion-label-text';
  text.dataset.i18n = aiRoleLabelKey(getCoach());
  text.textContent = t(text.dataset.i18n);
  pill.appendChild(text);
  row.appendChild(pill);
  return row;
}

/** Animations in flight per pill, so a quick second handoff replaces the first. */
const running = new WeakMap<HTMLElement, Animation[]>();

/**
 * Show a persona's label in a pill (`.ai-companion-label` holding a
 * `[data-i18n]` text span). The span's data-i18n follows the persona, so a
 * later locale change re-translates the right label.
 */
export function showAiRoleLabel(
  pill: HTMLElement | null,
  persona: Pick<PersonaConfig, 'roleLabel'> | null | undefined
): void {
  if (!pill) return;
  const text = pill.querySelector<HTMLElement>('[data-i18n]') ?? pill;
  const key = aiRoleLabelKey(persona);
  if (text.dataset.i18n === key && text.textContent === t(key)) return;

  for (const animation of running.get(pill) ?? []) animation.cancel();
  running.delete(pill);
  text.dataset.i18n = key;

  const from = pill.getBoundingClientRect().width;
  if (typeof text.animate !== 'function' || from === 0) {
    text.textContent = t(key);
    return;
  }

  const fadeOut = text.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: FADE_OUT_MS,
    easing: EASING.ACCELERATE,
    fill: 'forwards',
  });
  running.set(pill, [fadeOut]);
  fadeOut.finished.then(
    () => {
      text.textContent = t(text.dataset.i18n ?? key);
      const to = pill.getBoundingClientRect().width;
      const fadeIn = text.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_IN_MS,
        easing: EASING.DECELERATE,
      });
      fadeOut.cancel();
      const animations = [fadeIn];
      // Width is motion: under reduced motion the pill takes its new size at once.
      if (!prefersReducedMotion() && Math.abs(to - from) > 0.5) {
        animations.push(
          pill.animate([{ width: `${from}px` }, { width: `${to}px` }], {
            duration: FADE_IN_MS,
            easing: EASING.STANDARD,
          })
        );
      }
      running.set(pill, animations);
    },
    () => undefined // cancelled by a newer handoff, which owns the pill now
  );
}
