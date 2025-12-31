/**
 * User Data Export UI
 *
 * GDPR-compliant data export functionality.
 * Allows users to download all their data.
 *
 * DESIGN PRINCIPLES:
 *   - Transparency about what data exists
 *   - Clear export options
 *   - Privacy-focused messaging
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ExportableData {
  category: string;
  description: string;
  itemCount: number;
  exportable: boolean;
}

export interface DataExportUICallbacks {
  onClose?: () => void;
  onExport?: (format: 'json' | 'csv', categories: string[]) => void;
  onDeleteData?: () => void;
}

// ============================================================================
// DATA EXPORT UI CLASS
// ============================================================================

class DataExportUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: DataExportUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private selectedCategories: Set<string> = new Set();

  initialize(): void {
    if (this.panel) return;
    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: DataExportUICallbacks): void {
    this.callbacks = callbacks;
  }

  show(data: ExportableData[]): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.selectedCategories = new Set(data.filter(d => d.exportable).map(d => d.category));
    this.renderContent(data);
    this.panel.classList.add('data-export--visible');
    this.isVisible = true;
  }

  hide(): void {
    if (!this.panel) return;
    this.panel.classList.remove('data-export--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  /** Check if the panel is currently visible */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'data-export';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Export your data');

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'data-export__wrapper';
    this.panel.appendChild(this.wrapper);

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private renderContent(data: ExportableData[]): void {
    if (!this.wrapper) return;

    const totalItems = data.reduce((sum, d) => sum + d.itemCount, 0);

    this.wrapper.innerHTML = `
      <header class="data-export__header">
        <h2>Your Data</h2>
        <button class="data-export__close" aria-label="${t('common.close')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <div class="data-export__intro">
        <p>You have ${totalItems} items across ${data.length} categories. Select what to export.</p>
      </div>

      <div class="data-export__categories">
        ${data.map(d => this.renderCategory(d)).join('')}
      </div>

      <div class="data-export__format">
        <label>Export format</label>
        <div class="data-export__format-options">
          <button aria-label="${t('accessibility.json')}" class="data-export__format-btn data-export__format-btn--active" data-format="json">JSON</button>
          <button aria-label="${t('accessibility.csv')}" class="data-export__format-btn" data-format="csv">CSV</button>
        </div>
      </div>

      <div class="data-export__actions" role="button" tabindex="0">
        <button aria-label="${t('accessibility.delete')}" class="data-export__btn data-export__btn--danger">Delete All Data</button>
        <button aria-label="${t('accessibility.exportSelected')}" class="data-export__btn data-export__btn--primary">Export Selected</button>
      </div>

      <div class="data-export__footer">
        <p>Your data belongs to you. We respect your privacy.</p>
      </div>
    `;

    this.wrapper.querySelector('.data-export__close')?.addEventListener('click', () => this.hide());

    this.wrapper.querySelectorAll('.data-export__category-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const cat = (checkbox as HTMLInputElement).dataset.category;
        if (!cat) return;
        if ((checkbox as HTMLInputElement).checked) {
          this.selectedCategories.add(cat);
        } else {
          this.selectedCategories.delete(cat);
        }
      });
    });

    let selectedFormat: 'json' | 'csv' = 'json';
    this.wrapper.querySelectorAll('.data-export__format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.wrapper?.querySelectorAll('.data-export__format-btn').forEach(b => b.classList.remove('data-export__format-btn--active'));
        btn.classList.add('data-export__format-btn--active');
        selectedFormat = (btn as HTMLElement).dataset.format as 'json' | 'csv';
      });
    });

    this.wrapper.querySelector('.data-export__btn--primary')?.addEventListener('click', () => {
      this.callbacks.onExport?.(selectedFormat, Array.from(this.selectedCategories));
    });

    this.wrapper.querySelector('.data-export__btn--danger')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all your data? This cannot be undone.')) {
        this.callbacks.onDeleteData?.();
        this.hide();
      }
    });
  }

  private renderCategory(data: ExportableData): string {
    const checked = this.selectedCategories.has(data.category);
    return `
      <label class="data-export__category">
        <input type="checkbox" class="data-export__category-checkbox" data-category="${data.category}" ${checked ? 'checked' : ''} ${!data.exportable ? 'disabled' : ''} />
        <div class="data-export__category-info">
          <span class="data-export__category-name">${data.category}</span>
          <span class="data-export__category-desc">${data.description}</span>
        </div>
        <span class="data-export__category-count">${data.itemCount}</span>
      </label>
    `;
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .data-export {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest, 21px);
        background: rgba(44, 37, 32, 0.75);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .data-export--visible { opacity: 1; visibility: visible; }

      .data-export__wrapper {
        width: 100%;
        max-width: clamp(336px, 90vw, 480px);
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        overflow: hidden;
      }

      .data-export__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .data-export__header h2 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.0625rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .data-export__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        background: var(--color-background-tertiary, #ebe6df);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .data-export__close:hover { background: var(--color-background-secondary, #f5f2ed); color: var(--color-text-primary, #2c2520); }
      .data-export__close svg { width: 16px; height: 16px; }

      .data-export__intro {
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
      }

      .data-export__intro p {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
      }

      .data-export__categories {
        padding: 0 var(--ma-silence, 34px);
        max-height: 320px;
        overflow-y: auto;
      }

      .data-export__category {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--ma-breath, 13px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        cursor: pointer;
      }

      .data-export__category:last-child { border-bottom: none; }

      .data-export__category-checkbox {
        width: 20px;
        height: 20px;
        accent-color: var(--color-accent-primary, #2d5a3d);
      }

      .data-export__category-info { flex: 1; }

      .data-export__category-name {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
      }

      .data-export__category-desc {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .data-export__category-count {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        background: var(--color-background-tertiary, #ebe6df);
        padding: 4px 10px;
        border-radius: var(--radius-full, 9999px);
      }

      .data-export__format {
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .data-export__format label {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        margin-bottom: var(--space-2, 8px);
      }

      .data-export__format-options { display: flex; gap: var(--space-2, 8px); }

      .data-export__format-btn {
        flex: 1;
        padding: var(--space-2, 8px);
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        background: var(--color-background-secondary, #f5f2ed);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md, 0.5rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .data-export__format-btn:hover { background: var(--color-background-tertiary, #ebe6df); }

      .data-export__format-btn--active {
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
        border-color: var(--color-accent-primary, #2d5a3d);
      }

      .data-export__actions {
        display: flex;
        justify-content: space-between;
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .data-export__btn {
        padding: var(--space-3, 12px) var(--space-6, 24px);
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        border: none;
        border-radius: var(--radius-lg, 0.75rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .data-export__btn--primary {
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
      }

      .data-export__btn--primary:hover { background: var(--color-accent-hover, #3a7050); }

      .data-export__btn--danger {
        background: transparent;
        color: var(--color-semantic-error, #b5453a);
      }

      .data-export__btn--danger:hover {
        background: var(--color-semantic-error-tint, rgba(181, 69, 58, 0.1));
      }

      .data-export__footer {
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
        background: var(--color-background-secondary, #f5f2ed);
        text-align: center;
      }

      .data-export__footer p {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      /* Dark theme - WCAG AA Compliant */
      [data-theme="midnight"] .data-export { background: var(--backdrop-page); }
      [data-theme="midnight"] .data-export__wrapper { background: var(--color-background-elevated, #70605a); }
      [data-theme="midnight"] .data-export__header h2,
      [data-theme="midnight"] .data-export__category-name,
      [data-theme="midnight"] .data-export__format label { color: var(--color-text-primary, #faf6f0); }
      [data-theme="midnight"] .data-export__format-btn { background: var(--color-background-secondary, #60504a); }
      [data-theme="midnight"] .data-export__footer { background: var(--color-background-secondary, #60504a); }
      [data-theme="midnight"] .data-export__close { background: var(--color-background-tertiary, #685852); color: var(--color-text-secondary, #f0ebe4); }
      [data-theme="midnight"] .data-export__category-description,
      [data-theme="midnight"] .data-export__hint { color: var(--color-text-muted, #e8e2da); }

      @media (prefers-reduced-motion: reduce) {
        .data-export { transition: opacity ${DURATION.FAST}ms linear; }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    this.hide();
    this.panel?.remove();
    this.styleElement?.remove();
    this.panel = null;
    this.wrapper = null;
    this.styleElement = null;
  }
}

let instance: DataExportUI | null = null;

export function getDataExportUI(): DataExportUI {
  if (!instance) instance = new DataExportUI();
  return instance;
}

export function initDataExportUI(): void {
  getDataExportUI().initialize();
}

export function showDataExport(data: ExportableData[]): void {
  getDataExportUI().show(data);
}

export default DataExportUI;

