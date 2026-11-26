/**
 * Unavailable State
 *
 * The one way an admin screen says a value is missing. A request that failed
 * shows "unavailable (HTTP <status>)"; a value nothing records shows "not
 * measured". Neither is ever drawn as a zero or a constant, which read as
 * real measurements (#4069).
 *
 * @module UnavailableState
 */

import { createLogger } from './logger.js';

const log = createLogger('UnavailableState');

/** Shown where no store records the value. */
export const NOT_MEASURED = 'not measured';

/** Data that could not be loaded, carrying the reason a reader should see. */
export interface Unavailable {
  unavailable: string;
}

/** "unavailable (HTTP 503)", or "unavailable (network error)" when nothing answered. */
export function unavailableReason(status?: number): string {
  return status ? `unavailable (HTTP ${status})` : 'unavailable (network error)';
}

export function isUnavailable<T>(value: T | Unavailable): value is Unavailable {
  return typeof value === 'object' && value !== null && 'unavailable' in value;
}

/** Read a JSON response; a failed status or request becomes Unavailable, never a default. */
export async function loadJson<T>(
  request: Promise<Response>,
  what: string
): Promise<T | Unavailable> {
  try {
    const response = await request;
    if (!response.ok) return { unavailable: unavailableReason(response.status) };
    return (await response.json()) as T;
  } catch (error) {
    log.warn({ error, what }, 'Admin request failed');
    return { unavailable: unavailableReason() };
  }
}

/** Muted inline text giving the reason a value is missing. */
export function renderUnavailable(reason: string): string {
  const text = reason.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<span class="admin-unavailable" role="status" style="color: var(--color-text-muted); font-size: var(--text-sm); font-style: italic;">${text}</span>`;
}

/** The formatted value, or "not measured" when the server sent none. */
export function measured<T>(value: T | null | undefined, format: (v: T) => string): string {
  return value === null || value === undefined ? renderUnavailable(NOT_MEASURED) : format(value);
}
