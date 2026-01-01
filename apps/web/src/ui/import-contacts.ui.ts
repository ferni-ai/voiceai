/**
 * Contact Import UI
 *
 * Import contacts from Google, CSV, or vCard.
 * "Better Than Human" - Import your entire network with one click.
 *
 * @module ui/import-contacts.ui
 */

import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { apiFetch } from '../utils/api-helpers.js';
import { shouldUseDemoData } from '../utils/environment.js';
import { t } from '../i18n/index.js';

const log = createLogger('ImportContactsUI');

// ============================================================================
// TYPES
// ============================================================================

interface ImportState {
  isOpen: boolean;
  isImporting: boolean;
  source: 'google' | 'csv' | 'vcard' | null;
  progress: number;
  imported: number;
  total: number;
  errors: string[];
  preview: PreviewContact[];
  selectedCount: number;
}

interface PreviewContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  relationship?: string;
  selected: boolean;
}

interface ImportCallbacks {
  onSuccess?: (count: number) => void;
  onCancel?: () => void;
}

// ============================================================================
// STATE
// ============================================================================

let state: ImportState = {
  isOpen: false,
  isImporting: false,
  source: null,
  progress: 0,
  imported: 0,
  total: 0,
  errors: [],
  preview: [],
  selectedCount: 0,
};

let modalContainer: HTMLElement | null = null;
let callbacks: ImportCallbacks = {};
let previouslyFocusedElement: HTMLElement | null = null;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  google: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2c2.85 0 5.39 1.18 7.22 3.07L16.1 8.17C14.95 7.04 13.55 6.4 12 6.4c-3.08 0-5.6 2.52-5.6 5.6s2.52 5.6 5.6 5.6c2.46 0 4.53-1.59 5.27-3.8H12v-3.6h9.52c.12.68.18 1.39.18 2.12 0 5.38-3.62 9.68-9.7 9.68z"/></svg>`,
  csv: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>`,
  vcard: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h3"/><path d="M15 12h3"/><path d="M7 16.5c0-1.25 1-2.5 2-2.5s2 1.25 2 2.5"/></svg>`,
  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  upload: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  spinner: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ic-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('import-contacts-styles')) return;

  const style = document.createElement('style');
  style.id = 'import-contacts-styles';
  style.textContent = `
    .ic-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .ic-overlay.open {
      opacity: 1;
    }
    
    .ic-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .ic-modal {
      position: relative;
      width: 90%;
      max-width: clamp(350px, 90vw, 500px);
      max-height: 80vh;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-2xl, 1rem);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }
    
    .ic-overlay.open .ic-modal {
      transform: scale(1);
    }
    
    .ic-header {
      padding: var(--space-6, 1.5rem);
      border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.1));
    }
    
    .ic-eyebrow {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 0.25rem);
    }
    
    .ic-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }
    
    .ic-subtitle {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #70605a);
      margin-top: var(--space-1, 0.25rem);
    }
    
    .ic-close {
      position: absolute;
      top: var(--space-4, 1rem);
      right: var(--space-4, 1rem);
      padding: var(--space-2, 0.5rem);
      background: none;
      border: none;
      color: var(--color-text-muted, #8a7a6a);
      cursor: pointer;
      border-radius: var(--radius-full);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .ic-close:hover {
      background: var(--color-background-hover, rgba(0,0,0,0.05));
    }
    
    .ic-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6, 1.5rem);
    }
    
    .ic-sources {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
    }
    
    .ic-source-btn {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-4, 1rem);
      background: var(--color-background, #fff);
      border: 2px solid var(--color-border, rgba(0,0,0,0.1));
      border-radius: var(--radius-lg, 0.75rem);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      text-align: left;
    }
    
    .ic-source-btn:hover {
      border-color: var(--persona-primary, #4a6741);
      background: var(--color-background-hover, #f5f1e8);
    }
    
    .ic-source-btn.selected {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
    }
    
    .ic-source-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-elevated, #faf6f0);
      border-radius: var(--radius-md);
      color: var(--color-text-primary, #2C2520);
    }
    
    .ic-source-info {
      flex: 1;
    }
    
    .ic-source-name {
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }
    
    .ic-source-desc {
      font-size: 0.75rem;
      color: var(--color-text-muted, #8a7a6a);
    }
    
    .ic-file-input {
      display: none;
    }
    
    .ic-drop-zone {
      border: 2px dashed var(--color-border, rgba(0,0,0,0.15));
      border-radius: var(--radius-lg);
      padding: var(--space-8, 2rem);
      text-align: center;
      margin-top: var(--space-4, 1rem);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .ic-drop-zone.drag-over {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
    }
    
    .ic-drop-icon {
      color: var(--color-text-muted, #8a7a6a);
      margin-bottom: var(--space-3, 0.75rem);
    }
    
    .ic-drop-text {
      color: var(--color-text-secondary, #70605a);
      font-size: 0.875rem;
    }
    
    .ic-drop-browse {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
    }
    
    .ic-progress-section {
      margin-top: var(--space-4, 1rem);
    }
    
    .ic-progress-bar {
      width: 100%;
      height: 8px;
      background: var(--color-background-hover, #e8e2da);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    
    .ic-progress-fill {
      height: 100%;
      background: var(--persona-primary, #4a6741);
      border-radius: var(--radius-full);
      transition: width ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .ic-progress-text {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #70605a);
      margin-top: var(--space-2, 0.5rem);
      text-align: center;
    }
    
    .ic-preview-section {
      margin-top: var(--space-4, 1rem);
    }
    
    .ic-preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-3, 0.75rem);
    }
    
    .ic-preview-title {
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }
    
    .ic-select-all {
      font-size: 0.75rem;
      color: var(--persona-primary, #4a6741);
      background: none;
      border: none;
      cursor: pointer;
      text-decoration: underline;
    }
    
    .ic-preview-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--color-border, rgba(0,0,0,0.1));
      border-radius: var(--radius-lg);
    }
    
    .ic-preview-item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 0.75rem);
      padding: var(--space-3, 0.75rem);
      border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.05));
      cursor: pointer;
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .ic-preview-item:last-child {
      border-bottom: none;
    }
    
    .ic-preview-item:hover {
      background: var(--color-background-hover, #f5f1e8);
    }
    
    .ic-preview-check {
      width: 20px;
      height: 20px;
      border: 2px solid var(--color-border, rgba(0,0,0,0.2));
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .ic-preview-item.selected .ic-preview-check {
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
    }
    
    .ic-preview-info {
      flex: 1;
      min-width: 0;
    }
    
    .ic-preview-name {
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .ic-preview-email {
      font-size: 0.75rem;
      color: var(--color-text-muted, #8a7a6a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .ic-footer {
      padding: var(--space-4, 1rem) var(--space-6, 1.5rem);
      border-top: 1px solid var(--color-border, rgba(0,0,0,0.1));
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3, 0.75rem);
    }
    
    .ic-btn {
      padding: var(--space-2-5, 0.625rem) var(--space-4, 1rem);
      border-radius: var(--radius-md);
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .ic-btn-secondary {
      background: var(--tonal-surface-2);
      border: none;
      color: var(--color-text-secondary, #70605a);
    }

    .ic-btn-secondary:hover {
      background: var(--tonal-surface-3);
    }

    .ic-btn-secondary:active {
      background: var(--tonal-surface-active);
    }
    
    .ic-btn-primary {
      background: var(--persona-primary, #4a6741);
      border: none;
      color: white;
    }
    
    .ic-btn-primary:hover {
      background: var(--persona-secondary, #3d5a35);
    }
    
    .ic-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    @keyframes ic-spin {
      to { transform: rotate(360deg); }
    }
    
    .ic-spin {
      animation: ic-spin 1s linear infinite;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// RENDER
// ============================================================================

function render(): void {
  if (!modalContainer) return;

  const panel = modalContainer.querySelector('.ic-modal');
  if (!panel) return;

  const content = panel.querySelector('.ic-content');
  if (!content) return;

  if (state.isImporting) {
    content.innerHTML = renderProgress();
  } else if (state.preview.length > 0) {
    content.innerHTML = renderPreview();
  } else {
    content.innerHTML = renderSourceSelection();
  }

  bindEvents();
}

function renderSourceSelection(): string {
  return `
    <div class="ic-sources">
      <button aria-label="${t('accessibility.moreInformation')}" class="ic-source-btn ${state.source === 'google' ? 'selected' : ''}" data-source="google">
        <div class="ic-source-icon">${ICONS.google}</div>
        <div class="ic-source-info">
          <div class="ic-source-name">Google Contacts</div>
          <div class="ic-source-desc">Import from your Google account</div>
        </div>
      </button>
      
      <button aria-label="${t('accessibility.moreInformation')}" class="ic-source-btn ${state.source === 'csv' ? 'selected' : ''}" data-source="csv">
        <div class="ic-source-icon">${ICONS.csv}</div>
        <div class="ic-source-info">
          <div class="ic-source-name">CSV File</div>
          <div class="ic-source-desc">Import from a spreadsheet (Outlook, LinkedIn)</div>
        </div>
      </button>
      
      <button aria-label="${t('accessibility.moreInformation')}" class="ic-source-btn ${state.source === 'vcard' ? 'selected' : ''}" data-source="vcard">
        <div class="ic-source-icon">${ICONS.vcard}</div>
        <div class="ic-source-info">
          <div class="ic-source-name">vCard File</div>
          <div class="ic-source-desc">Import .vcf files from other apps</div>
        </div>
      </button>
    </div>
    
    ${state.source === 'csv' || state.source === 'vcard' ? `
      <div class="ic-drop-zone" id="ic-drop-zone">
        <div class="ic-drop-icon">${ICONS.upload}</div>
        <p class="ic-drop-text">
          Drag and drop your file here, or <span class="ic-drop-browse" id="ic-browse">browse</span>
        </p>
      </div>
      <input type="file" class="ic-file-input" id="ic-file-input" accept="${state.source === 'csv' ? '.csv' : '.vcf'}">
    ` : ''}
  `;
}

function renderProgress(): string {
  const percent = state.total > 0 ? Math.round((state.imported / state.total) * 100) : 0;
  
  return `
    <div class="ic-progress-section">
      <div class="ic-progress-bar">
        <div class="ic-progress-fill" style="width: ${percent}%"></div>
      </div>
      <p class="ic-progress-text">
        ${state.isImporting 
          ? `Importing ${state.imported} of ${state.total} contacts...`
          : `Imported ${state.imported} contacts!`}
      </p>
    </div>
  `;
}

function renderPreview(): string {
  return `
    <div class="ic-preview-section">
      <div class="ic-preview-header">
        <span class="ic-preview-title">${state.selectedCount} of ${state.preview.length} selected</span>
        <button aria-label="${t('accessibility.selectAll')}" class="ic-select-all" id="ic-select-all">Select All</button>
      </div>
      <div class="ic-preview-list">
        ${state.preview.map(contact => `
          <div class="ic-preview-item ${contact.selected ? 'selected' : ''}" data-id="${contact.id}">
            <div class="ic-preview-check">
              ${contact.selected ? ICONS.check : ''}
            </div>
            <div class="ic-preview-info">
              <div class="ic-preview-name">${escapeHtml(contact.name)}</div>
              ${contact.email ? `<div class="ic-preview-email">${escapeHtml(contact.email)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

function bindEvents(): void {
  if (!modalContainer) return;

  // Source buttons
  modalContainer.querySelectorAll('.ic-source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const source = btn.getAttribute('data-source') as 'google' | 'csv' | 'vcard';
      state.source = source;

      if (source === 'google') {
        void startGoogleImport();
      } else {
        render();
      }
    });
  });

  // File drop zone
  const dropZone = modalContainer.querySelector('#ic-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e: Event) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = (e as DragEvent).dataTransfer?.files;
      const firstFile = files?.[0];
      if (firstFile) {
        void handleFileUpload(firstFile);
      }
    });
  }

  // Browse button
  const browseBtn = modalContainer.querySelector('#ic-browse');
  const fileInput = modalContainer.querySelector('#ic-file-input') as HTMLInputElement;
  if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const firstFile = fileInput.files?.[0];
      if (firstFile) {
        void handleFileUpload(firstFile);
      }
    });
  }

  // Select all
  const selectAllBtn = modalContainer.querySelector('#ic-select-all');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      const allSelected = state.preview.every(c => c.selected);
      state.preview.forEach(c => c.selected = !allSelected);
      state.selectedCount = state.preview.filter(c => c.selected).length;
      render();
    });
  }

  // Preview item toggle
  modalContainer.querySelectorAll('.ic-preview-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      const contact = state.preview.find(c => c.id === id);
      if (contact) {
        contact.selected = !contact.selected;
        state.selectedCount = state.preview.filter(c => c.selected).length;
        render();
      }
    });
  });

  // Footer buttons
  const cancelBtn = modalContainer.querySelector('.ic-btn-secondary');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeImportContacts);
  }

  const importBtn = modalContainer.querySelector('.ic-btn-primary');
  if (importBtn) {
    importBtn.addEventListener('click', startImport);
  }
}

// ============================================================================
// IMPORT HANDLERS
// ============================================================================

async function startGoogleImport(): Promise<void> {
  state.isImporting = true;
  state.progress = 0;
  state.imported = 0;
  state.total = 0;
  render();

  try {
    if (shouldUseDemoData()) {
      // Mock Google import
      await simulateMockImport();
    } else {
      // Real Google import - initiate OAuth flow
      const response = await apiFetch('/api/contacts/import/google/start', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authUrl) {
          // Redirect to Google OAuth
          window.location.href = data.authUrl;
        }
      } else {
        const error = await response.json().catch(() => ({ error: 'Import failed' }));
        toast.error(error.error || 'Could not start Google import');
        state.isImporting = false;
        render();
      }
    }
  } catch (error) {
    log.error('Google import error:', error);
    toast.error(t('toasts.couldNotConnectToGoogle'));
    state.isImporting = false;
    render();
  }
}

async function handleFileUpload(file: File): Promise<void> {
  state.isImporting = true;
  render();

  try {
    if (state.source === 'csv') {
      await parseCSVFile(file);
    } else if (state.source === 'vcard') {
      await parseVCardFile(file);
    }
  } catch (error) {
    log.error('File upload error:', error);
    toast.error(t('toasts.couldNotReadFile'));
    state.isImporting = false;
    render();
  }
}

async function parseCSVFile(file: File): Promise<void> {
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    toast.error(t('toasts.csvFileAppearsToBeEmpty'));
    state.isImporting = false;
    render();
    return;
  }

  const headerLine = lines[0];
  if (!headerLine) {
    toast.error(t('toasts.csvFileAppearsToBeEmpty'));
    state.isImporting = false;
    render();
    return;
  }
  const headers = headerLine.toLowerCase().split(',').map(h => h.trim());
  const nameIndex = headers.findIndex(h => h.includes('name'));
  const emailIndex = headers.findIndex(h => h.includes('email'));
  const phoneIndex = headers.findIndex(h => h.includes('phone'));

  if (nameIndex === -1) {
    toast.error('CSV must have a "name" column');
    state.isImporting = false;
    render();
    return;
  }

  const contacts: PreviewContact[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const name = values[nameIndex];
    if (name) {
      contacts.push({
        id: `csv-${i}`,
        name,
        email: emailIndex !== -1 ? values[emailIndex] : undefined,
        phone: phoneIndex !== -1 ? values[phoneIndex] : undefined,
        selected: true,
      });
    }
  }

  state.preview = contacts;
  state.selectedCount = contacts.length;
  state.isImporting = false;
  render();
}

async function parseVCardFile(file: File): Promise<void> {
  const text = await file.text();
  const vcards = text.split('END:VCARD').filter(v => v.includes('BEGIN:VCARD'));

  const contacts: PreviewContact[] = vcards.map((vcard, index) => {
    const name = vcard.match(/FN:(.*)/)?.[1]?.trim() || 'Unknown';
    const email = vcard.match(/EMAIL[^:]*:(.*)/)?.[1]?.trim();
    const phone = vcard.match(/TEL[^:]*:(.*)/)?.[1]?.trim();

    return {
      id: `vcard-${index}`,
      name,
      email,
      phone,
      selected: true,
    };
  });

  state.preview = contacts;
  state.selectedCount = contacts.length;
  state.isImporting = false;
  render();
}

async function startImport(): Promise<void> {
  const selectedContacts = state.preview.filter(c => c.selected);
  if (selectedContacts.length === 0) {
    toast.warning(t('toasts.selectAtLeastOneContact'));
    return;
  }

  state.isImporting = true;
  state.total = selectedContacts.length;
  state.imported = 0;
  render();

  try {
    for (const contact of selectedContacts) {
      const response = await apiFetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          relationship: contact.relationship || 'other',
        }),
      });

      if (response.ok) {
        state.imported++;
      } else {
        state.errors.push(`Failed to import ${contact.name}`);
      }
      render();
    }

    toast.success(t('toasts.importedStateimportedContacts'));
    callbacks.onSuccess?.(state.imported);
    
    setTimeout(() => {
      closeImportContacts();
    }, 1500);
  } catch (error) {
    log.error('Import error:', error);
    toast.error(t('toasts.importFailed'));
    state.isImporting = false;
    render();
  }
}

async function simulateMockImport(): Promise<void> {
  // Simulate importing mock contacts
  const mockContacts = [
    { id: 'g1', name: 'John Smith', email: 'john@example.com', selected: true },
    { id: 'g2', name: 'Jane Doe', email: 'jane@example.com', selected: true },
    { id: 'g3', name: 'Bob Wilson', email: 'bob@company.com', selected: true },
    { id: 'g4', name: 'Alice Brown', email: 'alice@email.com', selected: true },
    { id: 'g5', name: 'Charlie Davis', email: 'charlie@work.com', selected: true },
  ];

  await new Promise(resolve => setTimeout(resolve, 1000));

  state.preview = mockContacts;
  state.selectedCount = mockContacts.length;
  state.isImporting = false;
  render();
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && state.isOpen && !state.isImporting) {
    closeImportContacts();
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the contact import modal
 */
export function openImportContacts(options: ImportCallbacks = {}): void {
  if (state.isOpen) return;

  previouslyFocusedElement = document.activeElement as HTMLElement | null;
  callbacks = options;

  // Cleanup any existing modals
  document.querySelectorAll('.ic-overlay').forEach(el => el.remove());
  injectStyles();

  // Reset state
  state = {
    isOpen: true,
    isImporting: false,
    source: null,
    progress: 0,
    imported: 0,
    total: 0,
    errors: [],
    preview: [],
    selectedCount: 0,
  };

  // Create modal
  modalContainer = document.createElement('div');
  modalContainer.className = 'ic-overlay';
  modalContainer.innerHTML = `
    <div class="ic-backdrop"></div>
    <div class="ic-modal" role="dialog" aria-modal="true" aria-labelledby="ic-title">
      <div class="ic-header">
        <div class="ic-eyebrow">Your People</div>
        <h2 class="ic-title" id="ic-title">Import Contacts</h2>
        <p class="ic-subtitle">Bring your network into Ferni</p>
        <button class="ic-close" aria-label="${t('accessibility.close')}">${ICONS.close}</button>
      </div>
      <div class="ic-content">
        ${renderSourceSelection()}
      </div>
      <div class="ic-footer">
        <button aria-label="${t('accessibility.cancel')}" class="ic-btn ic-btn-secondary">Cancel</button>
        <button aria-label="${t('accessibility.importSelected')}" class="ic-btn ic-btn-primary" ${state.preview.length === 0 ? 'disabled' : ''}>
          Import Selected
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modalContainer);

  // Bind close button
  modalContainer.querySelector('.ic-close')?.addEventListener('click', closeImportContacts);
  modalContainer.querySelector('.ic-backdrop')?.addEventListener('click', closeImportContacts);

  // Animate in
  requestAnimationFrame(() => {
    modalContainer?.classList.add('open');
  });

  // Event listeners
  document.addEventListener('keydown', handleEscapeKey);
  bindEvents();

  log.info('Opened import contacts modal');
}

/**
 * Close the contact import modal
 */
export function closeImportContacts(): void {
  if (!state.isOpen || !modalContainer) return;

  document.removeEventListener('keydown', handleEscapeKey);
  
  modalContainer.classList.remove('open');
  
  setTimeout(() => {
    modalContainer?.remove();
    modalContainer = null;
    callbacks.onCancel?.();
    
    // Restore focus
    if (previouslyFocusedElement && document.body.contains(previouslyFocusedElement)) {
      previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
  }, DURATION.NORMAL);

  state.isOpen = false;
  log.info('Closed import contacts modal');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initImportContactsUI(): void {
  document.addEventListener('ferni:open-import-contacts', () => {
    openImportContacts();
  });

  log.debug('Import Contacts UI initialized');
}

export default { open: openImportContacts, close: closeImportContacts };

