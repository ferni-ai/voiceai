/**
 * Bring a Friend: the message is the sharer's own draft.
 *
 * The share text used to be written for them ("it's genuinely changed how I
 * approach my day", "You should try Ferni") and sent as is. Now a short, plain
 * starting point sits in an editable field, and whatever they leave there is
 * what gets sent, with their link added once at the end.
 */

import { t } from '../i18n/index.js';

const STYLE_ID = 'referral-draft-styles';

export function defaultDraft(): string {
  return t('referral.draft.text');
}

/** The editable field the modal shows in place of a written-for-you quote. */
export function renderDraftField(): string {
  return `
    <label class="referral-draft">
      <span class="referral-draft-label">${t('referral.draft.label')}</span>
      <textarea class="referral-draft-text" rows="3" maxlength="500">${defaultDraft()}</textarea>
      <span class="referral-draft-hint">${t('referral.draft.hint')}</span>
    </label>
  `;
}

/** What the person has written (the default draft if the field is missing). */
export function readDraft(root: ParentNode | null): string {
  const field = root?.querySelector<HTMLTextAreaElement>('.referral-draft-text');
  return (field ? field.value : defaultDraft()).trim();
}

/** The draft with the link added once, unless the person already pasted it in. */
export function withLink(draft: string, url: string): string {
  if (!draft) return url;
  return draft.includes(url) ? draft : `${draft}\n\n${url}`;
}

export function injectDraftStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .referral-draft {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
      margin-bottom: var(--space-md);
      text-align: left;
    }
    .referral-draft-label {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .referral-draft-text {
      width: 100%;
      min-height: 88px;
      padding: var(--space-sm);
      font: inherit;
      color: var(--color-text-primary);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-medium);
      border-radius: var(--radius-lg, 12px);
      resize: vertical;
      box-sizing: border-box;
    }
    .referral-draft-text:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }
    .referral-draft-hint {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-secondary);
    }
  `;
  document.head.appendChild(style);
}
