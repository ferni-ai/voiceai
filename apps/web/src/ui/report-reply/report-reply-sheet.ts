/**
 * The "Report a reply" sheet: pick the reply (unless one was chosen already),
 * pick one of four reasons, optionally add a note, send.
 *
 * A native modal <dialog> shown as a bottom sheet, like the transcript sheet:
 * focus moves in and back, Escape and the backdrop close it, the page behind is
 * inert. Radios in fieldsets with legends, so screen readers announce each
 * question. Sends to POST /api/reports, which stores the reply's text from the
 * server's own transcript; this only names the reply (its call and time).
 *
 * @module ui/report-reply/report-reply-sheet
 */

import { t } from '../../i18n/index.js';
import { apiPost } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';
import { toast } from '../whisper.ui.js';
import type { RecentReply } from './recent-replies.js';

const log = createLogger('ReportReply');

export const REPORT_REASONS = ['harmful', 'wrong', 'inappropriate', 'other'] as const;
const REASON_KEYS = {
  harmful: 'reportReply.reasonHarmful',
  wrong: 'reportReply.reasonWrong',
  inappropriate: 'reportReply.reasonInappropriate',
  other: 'reportReply.reasonOther',
} as const;
const NOTE_MAX = 500;
const STYLE_ID = 'ferni-report-sheet-styles';
const C = 'ferni-report-sheet';

const CSS = `
.${C} { position: fixed; inset: auto 0 0; margin: 0 auto; padding: 0; border: 0;
  width: min(32rem, 100%); max-width: 100%; max-height: 90dvh; overflow-y: auto;
  border-radius: var(--radius-2xl) var(--radius-2xl) 0 0; box-shadow: var(--shadow-lg);
  background: var(--color-bg-elevated); color: var(--color-text-primary); }
.${C}::backdrop { background: var(--color-bg-glass); }
.${C} form { display: flex; flex-direction: column; gap: var(--space-md);
  padding: var(--space-lg) var(--space-lg) calc(var(--space-lg) + env(safe-area-inset-bottom, 0px)); }
.${C} h2 { margin: 0; font-size: var(--text-lg); font-weight: var(--font-weight-semibold); }
.${C} fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2xs); }
.${C} legend { margin-bottom: var(--space-xs); font-size: var(--text-sm); color: var(--color-text-secondary); }
.${C} label.${C}__option { display: flex; align-items: flex-start; gap: var(--space-sm); min-height: 2.75rem;
  padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-lg); cursor: pointer; }
.${C} label.${C}__option:hover { background: var(--color-bg-secondary); }
.${C} input[type=radio] { margin-top: 0.2em; accent-color: var(--color-accent-primary); }
.${C}__quote { margin: 0; padding-left: var(--space-sm); border-left: 2px solid var(--color-border-subtle);
  color: var(--color-text-secondary); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.${C} textarea { width: 100%; min-height: 4.5rem; resize: vertical; box-sizing: border-box; font: inherit;
  padding: var(--space-sm); border-radius: var(--radius-lg); border: 1px solid var(--color-border-subtle);
  background: var(--color-bg-primary); color: var(--color-text-primary); }
.${C} :focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
.${C}__actions { display: flex; justify-content: flex-end; gap: var(--space-sm); }
.${C}__actions button { min-height: 2.75rem; padding: 0 var(--space-lg); border-radius: var(--radius-full);
  border: 1px solid var(--color-border-subtle); background: transparent; color: var(--color-text-primary); font: inherit; cursor: pointer; }
.${C}__actions button[type=submit] { background: var(--color-accent-primary); border-color: transparent; color: var(--color-text-inverse); }
.${C}__actions button:disabled { opacity: 0.5; cursor: default; }
.${C}__error { margin: 0; color: var(--color-error); font-size: var(--text-sm); }
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Ferni's words keep their own direction inside a right-to-left sheet. */
function withAutoDir<T extends HTMLElement>(node: T): T {
  node.dir = 'auto';
  return node;
}

function radioGroup(
  name: string,
  legend: string,
  options: Array<[string, HTMLElement]>
): HTMLFieldSetElement {
  const fieldset = el('fieldset');
  fieldset.append(el('legend', undefined, legend));
  for (const [value, content] of options) {
    const label = el('label', `${C}__option`);
    const input = el('input');
    Object.assign(input, { type: 'radio', name, value });
    label.append(input, content);
    fieldset.append(label);
  }
  return fieldset;
}

/** Close a dialog, also where <dialog> has no close() (older WebViews, jsdom). */
function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close();
  else {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  }
}

/** The app's version, set at build time (vite.config.ts); 'dev' elsewhere. */
function appVersion(): string {
  return typeof __FERNI_APP_VERSION__ === 'string' ? __FERNI_APP_VERSION__ : 'dev';
}

/** The Android app is the web app in a TWA: standalone display on Android. */
function platform(): 'android' | 'web' {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true;
  return standalone && /Android/i.test(navigator.userAgent) ? 'android' : 'web';
}

async function send(reply: RecentReply, reason: string, note: string): Promise<number> {
  const res = await apiPost(
    '/api/reports',
    {
      sessionId: reply.sessionId,
      messageAt: reply.at,
      textHint: reply.text.slice(0, 400),
      reason,
      ...(note ? { note } : {}),
      appVersion: appVersion(),
      platform: platform(),
    },
    { maxRetries: 0 } // a retried report would be filed twice
  );
  return res.ok ? 201 : res.status;
}

/**
 * Open the sheet for `chosen`, or with a choice of `replies` (newest first).
 * Resolves when the sheet closes.
 */
export function openReportSheet(
  replies: readonly RecentReply[],
  chosen?: RecentReply
): Promise<void> {
  injectStyles();
  document.querySelectorAll(`dialog.${C}`).forEach((d) => d.remove());
  const dialog = el('dialog', C);
  dialog.setAttribute('aria-labelledby', `${C}-title`);
  const form = el('form');
  form.method = 'dialog';
  const title = el('h2', undefined, t('reportReply.title'));
  title.id = `${C}-title`;
  form.append(title);

  const pick = chosen ? [chosen] : replies.slice(0, 10);
  const only = pick.length === 1 ? pick[0] : undefined;
  if (only) {
    form.append(withAutoDir(el('blockquote', `${C}__quote`, only.text)));
  } else {
    form.append(
      radioGroup(
        'reply',
        t('reportReply.whichReply'),
        pick.map((r, i) => [String(i), withAutoDir(el('span', `${C}__quote`, r.text))])
      )
    );
    (form.querySelector('input[name=reply]') as HTMLInputElement).checked = true;
  }
  form.append(
    radioGroup(
      'reason',
      t('reportReply.whatsWrong'),
      REPORT_REASONS.map((r) => [r, el('span', undefined, t(REASON_KEYS[r]))])
    )
  );

  const noteLabel = el('label', undefined, t('reportReply.note'));
  const note = el('textarea');
  note.maxLength = NOTE_MAX;
  note.rows = 3;
  note.dir = 'auto';
  noteLabel.append(note);
  const error = el('p', `${C}__error`);
  error.setAttribute('role', 'alert');
  const actions = el('div', `${C}__actions`);
  const close = el('button', undefined, t('afterCall.close'));
  close.type = 'button';
  close.addEventListener('click', () => closeDialog(dialog));
  const submit = el('button', undefined, t('reportReply.send'));
  submit.type = 'submit';
  submit.disabled = true;
  actions.append(close, submit);
  form.append(noteLabel, error, actions);
  dialog.append(form);

  const selected = (name: string): string | undefined =>
    (form.querySelector(`input[name=${name}]:checked`) as HTMLInputElement | null)?.value;
  form.addEventListener('change', () => {
    submit.disabled = selected('reason') === undefined;
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const reason = selected('reason');
    const reply = pick[Number(selected('reply') ?? 0)];
    if (!reason || !reply) return;
    submit.disabled = true;
    error.textContent = '';
    void send(reply, reason, note.value.trim()).then((status) => {
      if (status === 201) {
        closeDialog(dialog);
        toast.success(t('reportReply.thanks'));
        return;
      }
      log.warn('Report not sent', { status });
      error.textContent = t(status === 429 ? 'reportReply.tooMany' : 'reportReply.failed');
      submit.disabled = false;
    });
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog(dialog); // the backdrop
  });

  const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (returnTo?.isConnected) returnTo.focus();
      resolve();
    });
  });
}
