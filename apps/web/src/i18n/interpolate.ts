/**
 * Placeholder interpolation for translation strings ("Hi {name}").
 *
 * @module i18n/interpolate
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('I18n');

export type TranslationParams = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Template|placeholder pairs already reported, so a re-render doesn't flood the log. */
const reportedMissingParams = new Set<string>();

function isBlank(value: string | number | undefined | null): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Fill each {placeholder} from params. A placeholder with no param is removed,
 * never shown: users once saw "Ferni: {Summary}" in a toast because a summary
 * was undefined. It is logged once so the caller can be found;
 * tests/i18n-keys.test.ts catches the static cases. Sites that need a marker
 * back pass it as its own param (see auth.agreeTerms in sign-in-gate.ui.ts).
 */
export function interpolate(template: string, params?: TranslationParams): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = params?.[key];
    if (value !== undefined && value !== null) return String(value);
    if (!reportedMissingParams.has(`${template}|${key}`)) {
      reportedMissingParams.add(`${template}|${key}`);
      log.warn({ placeholder: key, template }, 'Translation param missing; placeholder removed');
    }
    return '';
  });
}

/** True when every placeholder in the template has a non-blank param. */
export function hasEveryParam(template: string, params: TranslationParams): boolean {
  return [...template.matchAll(PLACEHOLDER)].every((match) => !isBlank(params[match[1] as string]));
}
