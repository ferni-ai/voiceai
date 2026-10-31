/**
 * "Privacy & your data" before its categories arrive: the panel opens at once
 * with a loading line, then shows the categories, or says it couldn't load them
 * (with a retry) rather than listing every category with 0 items. Also the
 * line shown after a delete whose outcome couldn't be confirmed.
 */

import { t } from '../i18n/index.js';
import type { default as DataExportUI, ExportableData } from './data-export.ui.js';

type LoadState = 'loading' | 'failed';
type StatusButton = readonly [label: string, className: string, onClick: () => void];

/** Bumped on every open, so a slow earlier load can't draw over a newer one. */
let latestOpen = 0;

function statusElement(text: string, role: 'status' | 'alert', buttons: StatusButton[]): HTMLElement {
  const box = document.createElement('div');
  box.className = 'data-export__intro data-export__status';
  box.setAttribute('role', role);
  const line = document.createElement('p');
  line.textContent = text;
  box.append(line);
  for (const [label, className, onClick] of buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `data-export__btn ${className}`;
    el.textContent = label;
    el.addEventListener('click', onClick);
    box.append(el);
  }
  return box;
}

const closeButton = (ui: DataExportUI): StatusButton => [
  t('common.close'),
  'data-export__status-close',
  () => ui.hide(),
];

/**
 * A delete or check whose outcome this browser couldn't learn: say so, and offer
 * to check what's there now. Never a retry: the first request may still be running.
 */
export function showDeletionUnconfirmed(ui: DataExportUI, message: string, check: () => void): void {
  ++latestOpen; // a category load still answering mustn't draw over this
  ui.showStatus(
    statusElement(message, 'alert', [
      [t('dataExport.checkAgain'), 'data-export__btn--primary', check],
      closeButton(ui),
    ])
  );
}

/** A line in place of the categories, with a close button. */
export function showDataRightsNotice(ui: DataExportUI, message: string): void {
  ++latestOpen;
  ui.showStatus(statusElement(message, 'status', [closeButton(ui)]));
}

/** Open the panel now; fill it with what `load` finds once it answers (null: it couldn't). */
export async function openDataExport(
  ui: DataExportUI,
  load: () => Promise<ExportableData[] | null>
): Promise<void> {
  const ticket = ++latestOpen;
  const show = (state: LoadState): void => {
    const retry: StatusButton = [
      t('common.tryAgain'),
      'data-export__btn--primary',
      () => void openDataExport(ui, load),
    ];
    const failed = state === 'failed';
    ui.showStatus(
      statusElement(
        t(failed ? 'dataExport.loadFailed' : 'common.loading'),
        failed ? 'alert' : 'status',
        failed ? [retry, closeButton(ui)] : [closeButton(ui)]
      )
    );
  };

  show('loading');
  const data = await load();
  if (ticket !== latestOpen || !ui.getIsVisible()) return; // closed, or opened again
  if (data) ui.show(data);
  else show('failed');
}
