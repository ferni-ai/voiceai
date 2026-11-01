/**
 * "Privacy & your data" before its categories arrive: the panel opens at once
 * with a loading line, then shows the categories, or says it couldn't load them
 * (with a retry) rather than listing every category with 0 items.
 */

import { t } from '../i18n/index.js';
import type { default as DataExportUI, ExportableData } from './data-export.ui.js';

type LoadState = 'loading' | 'failed';

/** Bumped on every open, so a slow earlier load can't draw over a newer one. */
let latestOpen = 0;

function statusElement(state: LoadState, close: () => void, retry: () => void): HTMLElement {
  const box = document.createElement('div');
  box.className = 'data-export__intro data-export__status';
  box.setAttribute('role', state === 'failed' ? 'alert' : 'status');
  const text = document.createElement('p');
  text.textContent = t(state === 'failed' ? 'dataExport.loadFailed' : 'common.loading');
  box.append(text);

  const button = (label: string, className: string, onClick: () => void): void => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `data-export__btn ${className}`;
    el.textContent = label;
    el.addEventListener('click', onClick);
    box.append(el);
  };
  if (state === 'failed') button(t('common.tryAgain'), 'data-export__btn--primary', retry);
  button(t('common.close'), 'data-export__status-close', close);
  return box;
}

/** Open the panel now; fill it with what `load` finds once it answers (null: it couldn't). */
export async function openDataExport(
  ui: DataExportUI,
  load: () => Promise<ExportableData[] | null>
): Promise<void> {
  const ticket = ++latestOpen;
  const show = (state: LoadState): void =>
    ui.showStatus(
      statusElement(
        state,
        () => ui.hide(),
        () => void openDataExport(ui, load)
      )
    );

  show('loading');
  const data = await load();
  if (ticket !== latestOpen || !ui.getIsVisible()) return; // closed, or opened again
  if (data) ui.show(data);
  else show('failed');
}
