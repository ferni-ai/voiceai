/**
 * Static markup (index.html) can't call t(), so it names its keys instead:
 * data-i18n for text, data-i18n-aria-label / -title / -placeholder for attributes.
 * The English in the markup stays as the pre-hydration fallback.
 */

import { onLocaleChange, t } from './index.js';

const ATTRIBUTES = ['aria-label', 'title', 'placeholder'] as const;

export function translateStaticDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  for (const attribute of ATTRIBUTES) {
    root.querySelectorAll<HTMLElement>(`[data-i18n-${attribute}]`).forEach((el) => {
      const key = el.getAttribute(`data-i18n-${attribute}`);
      if (key) el.setAttribute(attribute, t(key));
    });
  }
}

/** Translate now and again whenever the locale changes without a reload. */
export function bindStaticDom(): () => void {
  translateStaticDom();
  return onLocaleChange(() => translateStaticDom());
}
