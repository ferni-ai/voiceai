/**
 * The FinOps Save buttons (MRR, cash reserve, LTV:CAC) and Sync from Stripe, each with a
 * visible answer next to it. They used to do nothing on an empty or invalid input and
 * ignore the response, so a 400 or 500 looked like success. Now an empty or invalid input
 * says so and sends nothing, a failed save says "Couldn't save (HTTP n)", and a save shows
 * "Saved" and fills the inputs from the server's answer before the section refreshes.
 *
 * @module admin/sections/finops-settings-save
 */

import { createLogger } from '../../utils/logger.js';
import { adminFetch } from '../admin-fetch.js';

const log = createLogger('FinOpsSettingsSave');

type Body = Record<string, number>;
type Answer = Record<string, unknown>;

interface SaveControl {
  button: string;
  path: string;
  method: 'PUT' | 'POST';
  /** The body to send, or the message to show instead of sending. */
  read: () => Body | string;
  /** Fill the inputs from the server's answer, and say what was done. */
  done: (answer: Answer) => string;
}

const input = (id: string) => document.getElementById(id) as HTMLInputElement | null;

/** The input as a non-negative number, or a message (empty input: `empty`). */
function amountIn(id: string, empty: string): number | string {
  const raw = input(id)?.value.trim() ?? '';
  if (raw === '') return empty;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 'Enter a number of 0 or more';
}

const fill = (id: string, value: unknown, scale = 1): void => {
  const el = input(id);
  if (el && typeof value === 'number') el.value = String(Math.round(value * scale * 100) / 100);
};

const CONTROLS: SaveControl[] = [
  {
    button: 'save-mrr',
    path: '/api/finops/revenue',
    method: 'PUT',
    read: () => {
      const mrr = amountIn('config-mrr', 'Enter an amount');
      return typeof mrr === 'string' ? mrr : { mrr };
    },
    done: (a) => {
      fill('config-mrr', a.mrr);
      return 'Saved';
    },
  },
  {
    button: 'save-cash',
    path: '/api/finops/cash',
    method: 'PUT',
    read: () => {
      const amount = amountIn('config-cash', 'Enter an amount');
      return typeof amount === 'string' ? amount : { amount };
    },
    done: (a) => {
      fill('config-cash', a.amount);
      return 'Saved';
    },
  },
  {
    button: 'save-ltv-config',
    path: '/api/finops/ltv-cac',
    method: 'PUT',
    read: () => {
      const cac = amountIn('config-cac', '');
      const churn = amountIn('config-churn', '');
      if (cac === '' && churn === '') return 'Enter CAC or churn';
      if (typeof cac === 'string' && cac !== '') return cac;
      if (typeof churn === 'string' && churn !== '') return churn;
      if (typeof churn === 'number' && churn > 100) return 'Churn is a percent, 0 to 100';
      const body: Body = {};
      if (typeof cac === 'number') body.cac = cac;
      if (typeof churn === 'number') body.churnRate = churn / 100; // percent to 0..1
      return body;
    },
    done: (a) => {
      const inputs = (a.inputs ?? {}) as Answer;
      fill('config-cac', inputs.cac);
      fill('config-churn', inputs.churnRate, 100);
      return 'Saved';
    },
  },
  {
    button: 'sync-mrr',
    path: '/api/finops/sync-mrr',
    method: 'POST',
    read: () => ({}),
    done: (a) => {
      fill('config-mrr', a.mrr);
      const n = typeof a.subscriptionCount === 'number' ? a.subscriptionCount : 0;
      return `Synced from Stripe (${n} subscriptions)`;
    },
  },
];

/** The status line after `button`, created on first use (role=status, read out politely). */
function statusFor(button: HTMLElement): HTMLElement {
  const id = `${button.id}-status`;
  const existing = document.getElementById(id);
  if (existing) return existing;
  const el = document.createElement('span');
  Object.assign(el, { id, className: 'finops-save-status' });
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  button.insertAdjacentElement('afterend', el);
  return el;
}

function show(button: HTMLElement, text: string, ok: boolean): void {
  const el = statusFor(button);
  el.textContent = text;
  el.style.color = ok ? 'var(--success)' : 'var(--critical)';
}

/** Why the server refused, from its JSON answer (`reason` for 503, `error` for 400). */
function detailOf(answer: Answer): string {
  const detail = answer.reason ?? answer.error;
  return typeof detail === 'string' && detail ? `: ${detail}` : '';
}

/** The JSON answer, or {} when there is none (a proxy's HTML error page, say). */
async function answerOf(res: Response): Promise<Answer> {
  try {
    return (await res.json()) as Answer;
  } catch (error) {
    log.warn({ error, status: res.status }, 'FinOps answer was not JSON');
    return {};
  }
}

async function run(control: SaveControl, button: HTMLButtonElement, onSaved: () => Promise<void>) {
  const body = control.read();
  if (typeof body === 'string') return show(button, body, false);
  const verb = control.method === 'POST' ? "Couldn't sync" : "Couldn't save";
  button.disabled = true;
  try {
    const res = await adminFetch(control.path, { method: control.method, body: JSON.stringify(body) }); // prettier-ignore
    const answer = await answerOf(res);
    if (!res.ok) return show(button, `${verb} (HTTP ${res.status})${detailOf(answer)}`, false);
    show(button, control.done(answer), true);
    await onSaved();
  } catch (error) {
    log.error({ error, path: control.path }, 'FinOps settings request failed');
    show(button, `${verb} (network error)`, false);
  } finally {
    button.disabled = false;
  }
}

/** Wire the Save and Sync buttons; `onSaved` re-reads the section after a save. */
export function wireFinOpsSaves(onSaved: () => Promise<void>): void {
  for (const control of CONTROLS) {
    const button = document.getElementById(control.button) as HTMLButtonElement | null;
    button?.addEventListener('click', () => void run(control, button, onSaved));
  }
}
