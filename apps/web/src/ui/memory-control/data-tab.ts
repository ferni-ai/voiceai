/**
 * "Your data" tab: download everything Ferni remembers (JSON or CSV) and
 * the danger zone for deleting all of it.
 *
 * @module ui/memory-control/data-tab
 */

import { t } from '../../i18n/index.js';
import {
  deleteAllMemories,
  downloadFile,
  exportMemories,
  type ExportFormat,
} from '../../services/memory-control.service.js';
import { toast } from '../whisper.ui.js';
import { confirmAction } from './confirm-dialog.js';
import { esc } from './format.js';

export class DataTab {
  private busy: ExportFormat | 'delete' | null = null;

  /** Called after everything has been deleted. */
  onWiped: (() => void) | null = null;

  constructor(private readonly host: HTMLElement) {
    host.addEventListener('click', (e) => void this.onClick(e));
  }

  render(): void {
    const exportButton = (format: ExportFormat, label: string): string => `
      <button type="button" class="memory-btn memory-btn--primary" data-action="export" data-format="${format}"
        ${this.busy ? 'disabled' : ''} ${this.busy === format ? 'aria-busy="true"' : ''}>${esc(
          this.busy === format ? t('memoryControl.preparing', 'Preparing...') : label
        )}</button>`;

    this.host.innerHTML = `
      <section class="memory-card" aria-labelledby="memory-export-title">
        <h3 class="memory-card__title" id="memory-export-title">${esc(t('memoryControl.exportTitle', 'Take a copy with you'))}</h3>
        <p class="memory-card__text">${esc(
          t(
            'memoryControl.exportBody',
            'Download everything I remember: what I have learned, the people you have mentioned and every conversation transcript.'
          )
        )}</p>
        <div class="memory-card__actions">
          ${exportButton('json', t('memoryControl.exportJson', 'Download JSON'))}
          ${exportButton('csv', t('memoryControl.exportCsv', 'Download CSV'))}
        </div>
      </section>
      <section class="memory-card memory-card--danger" aria-labelledby="memory-danger-title">
        <h3 class="memory-card__title" id="memory-danger-title">${esc(t('memoryControl.dangerTitle', 'Start fresh'))}</h3>
        <p class="memory-card__text">${esc(
          t(
            'memoryControl.dangerBody',
            'Delete every memory and conversation I have kept. Your account stays, but I will not remember anything we talked about. This cannot be undone.'
          )
        )}</p>
        <div class="memory-card__actions">
          <button type="button" class="memory-btn memory-btn--danger" data-action="delete-all" ${
            this.busy ? 'disabled' : ''
          } ${this.busy === 'delete' ? 'aria-busy="true"' : ''}>${esc(
            this.busy === 'delete'
              ? t('memoryControl.deleting', 'Deleting...')
              : t('memoryControl.deleteEverything', 'Delete everything')
          )}</button>
        </div>
      </section>`;
  }

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button || !this.host.contains(button) || this.busy) return;
    if (button.dataset.action === 'export') {
      const format = button.dataset.format === 'csv' ? 'csv' : 'json';
      await this.runExport(format);
    } else if (button.dataset.action === 'delete-all') {
      await this.deleteEverything();
    }
  }

  private restoreFocus(selector: string): void {
    this.host.querySelector<HTMLElement>(selector)?.focus();
  }

  private async runExport(format: ExportFormat): Promise<void> {
    this.busy = format;
    this.render();
    const result = await exportMemories(format);
    this.busy = null;
    this.render();
    this.restoreFocus(`[data-format="${format}"]`);
    if (!result.ok) {
      toast.error(t('memoryControl.exportError', "Couldn't export. Try again?"));
      return;
    }
    downloadFile(result.value);
    toast.success(t('memoryControl.exportStarted', 'Download started!'));
  }

  private async deleteEverything(): Promise<void> {
    const confirmed = await confirmAction({
      title: t('memoryControl.deleteAllTitle', 'Delete everything I remember?'),
      message: t(
        'memoryControl.deleteAllBody',
        'Every memory, person and conversation will be permanently deleted. Your account stays.'
      ),
      confirmLabel: t('memoryControl.deleteEverything', 'Delete everything'),
      typedConfirmation: 'DELETE',
    });
    if (!confirmed) return;

    this.busy = 'delete';
    this.render();
    const result = await deleteAllMemories();
    this.busy = null;
    this.render();
    if (!result.ok) {
      this.restoreFocus('[data-action="delete-all"]');
      toast.error(t('memoryControl.deleteAllError', "Couldn't delete that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.deleteAllDone', "Done. We're starting fresh."));
    this.onWiped?.();
  }
}
