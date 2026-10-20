/**
 * "On Your Mind" card actions in the hub: mark a commitment done, or dismiss
 * one that no longer applies (POST /api/commitments/:id/complete | dismiss).
 *
 * Commitments only ever left 'active' when a call heard the person say it was
 * done, so 224 in prod sat open for good. A card is removed only after the
 * server says the change landed; otherwise it stays and the person is told.
 *
 * @module ui/ferni-hub-tracked
 */
import { t } from '../i18n/index.js';
import { apiPost } from '../utils/api.js';
import { escapeHtml } from './trust-dashboard-data.js';
import { toast } from './whisper.ui.js';

export type TrackedAction = 'complete' | 'dismiss';

const STYLE_ID = 'ferni-hub-tracked-style';
const STYLE = `
  .ferni-hub-tracked-actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
  .ferni-hub-tracked-action {
    font: inherit; font-size: 0.8125rem; padding: 4px 12px; cursor: pointer;
    border-radius: var(--radius-full); border: 1px solid var(--color-border);
    background: transparent; color: var(--color-text-muted);
  }
  .ferni-hub-tracked-action:hover { color: var(--color-ferni-on-surface); border-color: var(--color-ferni); }
  .ferni-hub-tracked-action:disabled { opacity: 0.5; cursor: default; }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** The Done / Dismiss buttons for one card. */
export function trackedActionsHtml(id: string): string {
  const btn = (action: TrackedAction, label: string): string =>
    `<button type="button" class="ferni-hub-tracked-action" data-tracked-action="${action}" data-item-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
  return `<div class="ferni-hub-tracked-actions">${btn('complete', t('ui.trackedDone'))}${btn('dismiss', t('ui.trackedDismiss'))}</div>`;
}

/** Close one commitment; true once the server confirmed it. */
export async function closeTracked(id: string, action: TrackedAction): Promise<boolean> {
  const res = await apiPost(`/api/commitments/${encodeURIComponent(id)}/${action}`);
  if (!res.ok) toast.error(t('ui.trackedUpdateFailed'));
  return res.ok;
}

/** Wire every card's buttons under `root`; a confirmed close removes its card. */
export function bindTrackedActions(root: ParentNode): void {
  ensureStyle();
  root.querySelectorAll<HTMLButtonElement>('[data-tracked-action]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = btn.dataset.itemId;
      const action = btn.dataset.trackedAction as TrackedAction;
      if (!id) return;
      btn.disabled = true;
      void closeTracked(id, action).then((closed) => {
        if (closed) btn.closest('.ferni-hub-tracked-card')?.remove();
        else btn.disabled = false;
      });
    });
  });
}
