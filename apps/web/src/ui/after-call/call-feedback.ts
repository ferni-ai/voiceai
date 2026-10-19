/**
 * One post-call tap: how did the call feel?
 *
 * Feedback prompts used to pop up mid-call ("This landed / Helpful / Too much /
 * Off track") and interrupt the conversation. Now a prompt that arrives during
 * a call is held, and the post-call card offers it as a single row of reactions.
 * The tap goes to POST /api/feedback, since the call's data channel is closed.
 *
 * @module ui/after-call/call-feedback
 */

import { t } from '../../i18n/index.js';
import { apiPost } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('CallFeedback');

/** A reaction as contextual-feedback.ui.ts defines it (REACTIONS); kept structural to avoid an import cycle. */
export interface CallFeedbackOption {
  id: string;
  icon: string;
  labelKey: string;
}

const ROW_CLASS = 'ferni-call-feedback';
const STYLE_ID = 'ferni-call-feedback-styles';

let pendingFeedbackId: string | null = null;

/** Hold a feedback prompt from the agent until the call is over. Latest wins. */
export function holdFeedbackPrompt(feedbackId: string): void {
  pendingFeedbackId = feedbackId;
}

/** A new call starts clean: an unanswered prompt belongs to the old call. */
export function clearHeldFeedbackPrompt(): void {
  pendingFeedbackId = null;
}

export function hasHeldFeedbackPrompt(): boolean {
  return pendingFeedbackId !== null;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${ROW_CLASS} { margin-top: var(--space-md, 16px); text-align: center; }
    .${ROW_CLASS}__question { font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4d47); margin: 0 0 var(--space-xs, 4px); }
    .${ROW_CLASS}__reactions { display: flex; flex-wrap: nowrap; justify-content: center; gap: var(--space-2xs, 2px); }
    .${ROW_CLASS}__btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 36px; height: 36px; padding: 0; border: none; border-radius: var(--radius-full, 9999px);
      background: transparent; color: var(--color-text-secondary, #5a4d47); cursor: pointer; }
    .${ROW_CLASS}__btn:hover, .${ROW_CLASS}__btn:focus-visible {
      background: var(--color-bg-elevated, rgba(0, 0, 0, 0.05)); color: var(--color-text-primary, #2c2520); }
    .${ROW_CLASS}__btn:focus-visible { outline: 2px solid var(--color-accent-primary, #3d5a45); outline-offset: 2px; }
    .${ROW_CLASS}__thanks { margin: 0; font-size: var(--text-sm, 0.875rem); color: var(--color-text-secondary, #5a4d47); }
  `;
  document.head.appendChild(style);
}

async function send(feedbackId: string, reaction: string): Promise<void> {
  try {
    const res = await apiPost('/api/feedback', { feedbackId, reaction });
    if (!res.ok) log.warn('Post-call feedback not recorded', { status: res.status, error: res.error });
  } catch (error) {
    log.warn('Post-call feedback failed', { error: String(error) });
  }
}

/**
 * The reaction row for the post-call card, or null when no prompt was held.
 * Consumes the held prompt: one call, one question.
 */
export function buildCallFeedbackRow(options: readonly CallFeedbackOption[]): HTMLElement | null {
  const feedbackId = pendingFeedbackId;
  if (!feedbackId) return null;
  pendingFeedbackId = null;
  injectStyles();

  const row = document.createElement('div');
  row.className = ROW_CLASS;
  row.setAttribute('role', 'group');
  const question = document.createElement('p');
  question.className = `${ROW_CLASS}__question`;
  question.textContent = t('afterCall.feedbackQuestion');
  question.id = `${ROW_CLASS}-question`;
  row.setAttribute('aria-labelledby', question.id);
  const reactions = document.createElement('div');
  reactions.className = `${ROW_CLASS}__reactions`;
  row.append(question, reactions);

  for (const option of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${ROW_CLASS}__btn`;
    btn.dataset.reaction = option.id;
    btn.innerHTML = option.icon; // static SVG markup from contextual-feedback
    btn.setAttribute('aria-label', t(option.labelKey));
    btn.title = t(option.labelKey);
    btn.addEventListener('click', () => {
      void send(feedbackId, option.id);
      const thanks = document.createElement('p');
      thanks.className = `${ROW_CLASS}__thanks`;
      thanks.setAttribute('role', 'status');
      thanks.textContent = t('afterCall.feedbackThanks');
      row.replaceChildren(thanks);
    });
    reactions.appendChild(btn);
  }
  return row;
}

window.addEventListener('ferni:conversation-start', clearHeldFeedbackPrompt);
