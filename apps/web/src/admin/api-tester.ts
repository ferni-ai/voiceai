/**
 * API Tester
 *
 * The API Docs section's request tester: a catalogue row fills it, a quick request
 * fills and sends it, and Send sends what is typed. Every request carries the admin's
 * credentials, so the tester sends only to paths on this site: anything else is refused
 * on screen, and the token never leaves the origin. The answer is drawn as text, so a
 * response body cannot add markup to the portal (#4069).
 *
 * @module ApiTester
 */

import { createLogger } from '../utils/logger.js';
import { unavailableReason } from '../utils/unavailable.js';
import { adminFetch } from './admin-fetch.js';

const log = createLogger('ApiTester');

const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const WITH_BODY = new Set(['POST', 'PUT']);

export type TesterResult =
  | { kind: 'refused'; reason: string }
  | { kind: 'answered'; status: number; body: string }
  | { kind: 'failed'; reason: string };

/**
 * `input` resolved once against this site, when it starts with "/" and stays on this
 * origin, else null. The caller fetches this exact URL, so nothing is resolved twice:
 * a relative path re-derived from it could turn "/.//host" into "//host", off-site.
 * A path that normalises to "//" or "/\\" is refused too, as a second guard.
 */
export function sameOriginUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return /^\/[/\\]/.test(url.pathname) ? null : url;
  } catch {
    return null;
  }
}

/** Send one request from the tester; refuses before any fetch when the target is not this site. */
export async function sendTesterRequest(
  method: string,
  input: string,
  body?: string
): Promise<TesterResult> {
  if (!METHODS.has(method)) return { kind: 'refused', reason: `Refused: unknown method ${method}` };
  const url = sameOriginUrl(input);
  if (!url) {
    return {
      kind: 'refused',
      reason:
        'Refused: the tester sends only to paths on this site (starting with /), so your admin sign-in never leaves it',
    };
  }
  const placeholder = /\/:([A-Za-z_]+)/.exec(url.pathname);
  if (placeholder) {
    return {
      kind: 'refused',
      reason: `Refused: replace :${placeholder[1]} with a real value first`,
    };
  }
  try {
    const response = await adminFetch(url.href, {
      method,
      body: WITH_BODY.has(method) && body ? body : undefined,
    });
    return { kind: 'answered', status: response.status, body: readable(await response.text()) };
  } catch (error) {
    log.warn({ error, method, path: url.pathname }, 'API tester request failed');
    return { kind: 'failed', reason: unavailableReason() };
  }
}

/** JSON pretty-printed; anything else as it came. */
function readable(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Draw a result into `el` as text only. */
export function renderTesterResult(el: HTMLElement, result: TesterResult): void {
  const line = document.createElement('div');
  if (result.kind === 'answered') {
    const ok = result.status >= 200 && result.status < 300;
    line.className = ok ? 'tester-success' : 'tester-error';
    line.textContent = ok
      ? `Status: ${result.status}`
      : `Status: ${result.status}, ${unavailableReason(result.status)}`;
    const pre = document.createElement('pre');
    pre.textContent = result.body;
    el.replaceChildren(line, pre);
    return;
  }
  line.className = 'tester-error';
  line.textContent = result.reason;
  el.replaceChildren(line);
}

/** Send what the tester's form holds and show the answer. */
async function runTester(): Promise<void> {
  const method = document.querySelector<HTMLSelectElement>('#testerMethod')?.value ?? 'GET';
  const url = document.querySelector<HTMLInputElement>('#testerUrl')?.value ?? '';
  const body = document.querySelector<HTMLTextAreaElement>('#testerBody')?.value;
  const out = document.getElementById('testerResponse');
  if (!out) return;
  const pending = document.createElement('p');
  pending.className = 'tester-hint';
  pending.textContent = `Sending ${method} ${url.trim()}...`;
  out.replaceChildren(pending);
  renderTesterResult(out, await sendTesterRequest(method, url, body));
}

/**
 * Handle a click in the API Docs section. A catalogue row fills the tester, a quick
 * request ([data-tester-run]) fills and sends it, Send sends it. True when the click was
 * the tester's, so the portal's other handlers leave it alone.
 */
export async function handleApiTesterClick(target: Element): Promise<boolean> {
  const row = target.closest<HTMLElement>('.api-endpoint, [data-tester-run]');
  if (row) {
    const urlInput = document.querySelector<HTMLInputElement>('#testerUrl');
    const methodSelect = document.querySelector<HTMLSelectElement>('#testerMethod');
    if (urlInput && row.dataset.path) urlInput.value = row.dataset.path;
    if (methodSelect && row.dataset.method) methodSelect.value = row.dataset.method;
    if (row.hasAttribute('data-tester-run')) await runTester();
    return true;
  }
  if (target.closest('[data-action="send-request"]')) {
    await runTester();
    return true;
  }
  return false;
}
