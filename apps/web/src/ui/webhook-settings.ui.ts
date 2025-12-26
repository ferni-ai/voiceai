/**
 * Webhook Settings UI
 *
 * Manage webhook automations for IFTTT, Zapier, Home Assistant,
 * and Siri Shortcuts integration.
 *
 * DESIGN PRINCIPLES:
 *   - Clear list of webhooks with status indicators
 *   - Easy add/edit/delete flows
 *   - Siri token management with one-time display
 *   - Test webhook button for validation
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api.js';
import { toast } from './toast.ui.js';

// ============================================================================
// TYPES
// ============================================================================

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  voiceTriggers: string[];
  platform?: string;
  cooldownSeconds?: number;
  enabled: boolean;
  successCount: number;
  failureCount: number;
  lastTriggeredAt?: string;
}

interface SiriToken {
  id: string;
  name: string;
  tokenPreview: string;
  scopes: string[];
  enabled: boolean;
  usageCount: number;
  lastUsedAt?: string;
}

interface WebhookSettingsCallbacks {
  onClose?: () => void;
  onWebhookCreated?: (webhook: WebhookConfig) => void;
  onWebhookDeleted?: (webhookId: string) => void;
}

// ============================================================================
// SAFE DOM HELPERS
// ============================================================================

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = value;
      } else {
        el.setAttribute(key, value);
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}

function createSvgIcon(pathD: string, viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const paths = pathD.split('|');
  for (const d of paths) {
    if (d.startsWith('L:')) {
      // Line element: L:x1,y1,x2,y2
      const [, coords] = d.split(':');
      const [x1, y1, x2, y2] = coords.split(',');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      svg.appendChild(line);
    } else if (d.startsWith('P:')) {
      // Polyline: P:points
      const [, points] = d.split(':');
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', points);
      svg.appendChild(polyline);
    } else if (d.startsWith('R:')) {
      // Rect: R:x,y,w,h,rx,ry
      const [, coords] = d.split(':');
      const [x, y, w, h, rx, ry] = coords.split(',');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      if (rx) rect.setAttribute('rx', rx);
      if (ry) rect.setAttribute('ry', ry);
      svg.appendChild(rect);
    } else if (d.startsWith('C:')) {
      // Circle: C:cx,cy,r
      const [, coords] = d.split(':');
      const [cx, cy, r] = coords.split(',');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', r);
      svg.appendChild(circle);
    } else {
      // Path element
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
  }
  return svg;
}

// Icon definitions using our safe format
const ICON_PATHS = {
  close: 'L:18,6,6,18|L:6,6,18,18',
  check: 'P:20 6 9 17 4 12',
  plus: 'L:12,5,12,19|L:5,12,19,12',
  trash: 'P:3 6 5 6 21 6|M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  play: 'M5 3l14 9-14 9V3z',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  copy: 'R:9,9,13,13,2,2|M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
};

// ============================================================================
// WEBHOOK SETTINGS UI CLASS
// ============================================================================

class WebhookSettingsUI {
  private panel: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private callbacks: WebhookSettingsCallbacks = {};
  private webhooks: WebhookConfig[] = [];
  private siriTokens: SiriToken[] = [];
  private activeTab: 'webhooks' | 'siri' = 'webhooks';
  private isLoading = false;
  private newTokenValue: string | null = null;

  initialize(): void {
    if (this.panel) return;
    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: WebhookSettingsCallbacks): void {
    this.callbacks = callbacks;
  }

  async show(): Promise<void> {
    this.initialize();
    if (!this.panel) return;

    await this.fetchData();
    this.renderContent();
    this.panel.classList.add('webhook-settings--visible');
    this.isVisible = true;
  }

  hide(): void {
    if (!this.panel) return;
    this.panel.classList.remove('webhook-settings--visible');
    this.isVisible = false;
    this.newTokenValue = null;
    this.callbacks.onClose?.();
  }

  private async fetchData(): Promise<void> {
    this.isLoading = true;

    try {
      const [webhooksRes, tokensRes] = await Promise.all([
        apiGet<{ webhooks: WebhookConfig[] }>('/api/webhooks'),
        apiGet<{ tokens: SiriToken[] }>('/api/webhooks/siri-tokens'),
      ]);

      if (webhooksRes.ok && webhooksRes.data) {
        this.webhooks = webhooksRes.data.webhooks;
      }
      if (tokensRes.ok && tokensRes.data) {
        this.siriTokens = tokensRes.data.tokens;
      }
    } catch (error) {
      if (import.meta.env?.DEV) console.debug('Failed to fetch webhook data:', error);
    }

    this.isLoading = false;
  }

  private createPanel(): void {
    this.panel = createElement('div', { className: 'webhook-settings' });
    const content = createElement('div', { className: 'webhook-settings__content' });
    this.panel.appendChild(content);

    // Close on backdrop click
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) this.hide();
    });

    document.body.appendChild(this.panel);
  }

  private renderContent(): void {
    const content = this.panel?.querySelector('.webhook-settings__content');
    if (!content) return;

    // Clear existing content
    content.textContent = '';

    // Header
    const header = createElement('div', { className: 'webhook-settings__header' });
    const title = createElement('h2', { className: 'webhook-settings__title' }, ['Automations']);
    const closeBtn = createElement('button', { className: 'webhook-settings__close', 'aria-label': 'Close' });
    closeBtn.appendChild(createSvgIcon(ICON_PATHS.close));
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(title);
    header.appendChild(closeBtn);
    content.appendChild(header);

    // Tabs
    const tabs = createElement('div', { className: 'webhook-settings__tabs' });

    const webhooksTab = createElement('button', {
      className: `webhook-settings__tab ${this.activeTab === 'webhooks' ? 'active' : ''}`,
      'data-tab': 'webhooks'
    });
    webhooksTab.appendChild(createSvgIcon(ICON_PATHS.link));
    webhooksTab.appendChild(createElement('span', {}, ['Webhooks']));
    webhooksTab.addEventListener('click', () => {
      this.activeTab = 'webhooks';
      this.renderContent();
    });

    const siriTab = createElement('button', {
      className: `webhook-settings__tab ${this.activeTab === 'siri' ? 'active' : ''}`,
      'data-tab': 'siri'
    });
    siriTab.appendChild(createSvgIcon(ICON_PATHS.key));
    siriTab.appendChild(createElement('span', {}, ['Siri Tokens']));
    siriTab.addEventListener('click', () => {
      this.activeTab = 'siri';
      this.renderContent();
    });

    tabs.appendChild(webhooksTab);
    tabs.appendChild(siriTab);
    content.appendChild(tabs);

    // Body
    const body = createElement('div', { className: 'webhook-settings__body' });
    if (this.activeTab === 'webhooks') {
      this.renderWebhooksTab(body);
    } else {
      this.renderSiriTab(body);
    }
    content.appendChild(body);
  }

  private renderWebhooksTab(container: HTMLElement): void {
    if (this.isLoading) {
      container.appendChild(createElement('div', { className: 'webhook-settings__loading' }, ['Loading...']));
      return;
    }

    // Section header
    const sectionHeader = createElement('div', { className: 'webhook-settings__section-header' });
    sectionHeader.appendChild(createElement('h3', {}, ['Your Webhooks']));

    const addBtn = createElement('button', { className: 'webhook-settings__add-btn' });
    addBtn.appendChild(createSvgIcon(ICON_PATHS.plus));
    addBtn.appendChild(createElement('span', {}, ['Add']));
    addBtn.addEventListener('click', () => this.showAddWebhookForm());
    sectionHeader.appendChild(addBtn);

    const section = createElement('div', { className: 'webhook-settings__section' });
    section.appendChild(sectionHeader);

    // Webhooks list
    const list = createElement('div', { className: 'webhook-settings__list' });

    if (this.webhooks.length === 0) {
      list.appendChild(createElement('div', { className: 'webhook-settings__empty' },
        ['No webhooks yet. Add one to automate with your voice!']));
    } else {
      for (const webhook of this.webhooks) {
        list.appendChild(this.createWebhookCard(webhook));
      }
    }

    section.appendChild(list);
    container.appendChild(section);

    // Help section
    const help = createElement('div', { className: 'webhook-settings__help' });
    help.appendChild(createElement('h4', {}, ['How to use webhooks']));
    help.appendChild(createElement('p', {},
      ['Webhooks let you trigger external automations with your voice. Say "run my bedtime routine" and Ferni will call your IFTTT/Zapier/Home Assistant webhook.']));
    container.appendChild(help);
  }

  private createWebhookCard(webhook: WebhookConfig): HTMLElement {
    const card = createElement('div', {
      className: `webhook-card ${webhook.enabled ? '' : 'webhook-card--disabled'}`,
      'data-webhook-id': webhook.id
    });

    // Header
    const header = createElement('div', { className: 'webhook-card__header' });

    const icon = createElement('div', { className: 'webhook-card__icon' });
    icon.appendChild(createSvgIcon(ICON_PATHS.zap));
    header.appendChild(icon);

    const info = createElement('div', { className: 'webhook-card__info' });
    const nameSpan = createElement('span', { className: 'webhook-card__name' });
    nameSpan.textContent = webhook.name;
    info.appendChild(nameSpan);

    const triggersSpan = createElement('span', { className: 'webhook-card__triggers' });
    triggersSpan.textContent = `Say: "${webhook.voiceTriggers.slice(0, 2).join(', ')}"`;
    info.appendChild(triggersSpan);
    header.appendChild(info);

    // Toggle
    const toggle = createElement('label', { className: 'webhook-card__toggle' });
    const checkbox = createElement('input', { type: 'checkbox' });
    checkbox.checked = webhook.enabled;
    checkbox.addEventListener('change', () => { void this.toggleWebhook(webhook.id, checkbox.checked); });
    toggle.appendChild(checkbox);
    toggle.appendChild(createElement('span', { className: 'webhook-card__toggle-slider' }));
    header.appendChild(toggle);

    card.appendChild(header);

    // Footer
    const footer = createElement('div', { className: 'webhook-card__footer' });

    const stats = webhook.successCount + webhook.failureCount;
    const successRate = stats > 0 ? Math.round((webhook.successCount / stats) * 100) : 0;
    const statsSpan = createElement('span', { className: 'webhook-card__stats' });
    statsSpan.textContent = `${stats} runs (${successRate}% success)`;
    footer.appendChild(statsSpan);

    const actions = createElement('div', { className: 'webhook-card__actions' });

    const testBtn = createElement('button', { className: 'webhook-card__btn', title: 'Test' });
    testBtn.appendChild(createSvgIcon(ICON_PATHS.play));
    testBtn.addEventListener('click', () => { void this.testWebhook(webhook.id); });
    actions.appendChild(testBtn);

    const editBtn = createElement('button', { className: 'webhook-card__btn', title: 'Edit' });
    editBtn.appendChild(createSvgIcon(ICON_PATHS.edit));
    actions.appendChild(editBtn);

    const deleteBtn = createElement('button', { className: 'webhook-card__btn webhook-card__btn--danger', title: 'Delete' });
    deleteBtn.appendChild(createSvgIcon(ICON_PATHS.trash));
    deleteBtn.addEventListener('click', () => { void this.deleteWebhook(webhook.id); });
    actions.appendChild(deleteBtn);

    footer.appendChild(actions);
    card.appendChild(footer);

    return card;
  }

  private renderSiriTab(container: HTMLElement): void {
    if (this.isLoading) {
      container.appendChild(createElement('div', { className: 'webhook-settings__loading' }, ['Loading...']));
      return;
    }

    // Section header
    const sectionHeader = createElement('div', { className: 'webhook-settings__section-header' });
    sectionHeader.appendChild(createElement('h3', {}, ['Siri Tokens']));

    const addBtn = createElement('button', { className: 'webhook-settings__add-btn' });
    addBtn.appendChild(createSvgIcon(ICON_PATHS.plus));
    addBtn.appendChild(createElement('span', {}, ['Create Token']));
    addBtn.addEventListener('click', () => this.createSiriToken());
    sectionHeader.appendChild(addBtn);

    const section = createElement('div', { className: 'webhook-settings__section' });
    section.appendChild(sectionHeader);

    // New token display
    if (this.newTokenValue) {
      const newTokenSection = createElement('div', { className: 'webhook-settings__new-token' });
      newTokenSection.appendChild(createElement('p', {}, ["Your new token (copy it now - it won't be shown again!):"]));

      const tokenDisplay = createElement('div', { className: 'webhook-settings__token-display' });
      const codeEl = createElement('code');
      codeEl.textContent = this.newTokenValue;
      tokenDisplay.appendChild(codeEl);

      const copyBtn = createElement('button', { className: 'webhook-settings__copy-btn' });
      copyBtn.appendChild(createSvgIcon(ICON_PATHS.copy));
      copyBtn.addEventListener('click', async () => {
        if (this.newTokenValue) {
          await navigator.clipboard.writeText(this.newTokenValue);
          toast.success('Token copied!');
        }
      });
      tokenDisplay.appendChild(copyBtn);

      newTokenSection.appendChild(tokenDisplay);
      section.appendChild(newTokenSection);
    }

    // Tokens list
    const list = createElement('div', { className: 'webhook-settings__list' });

    if (this.siriTokens.length === 0) {
      list.appendChild(createElement('div', { className: 'webhook-settings__empty' },
        ['No Siri tokens yet. Create one to trigger webhooks from Shortcuts.']));
    } else {
      for (const token of this.siriTokens) {
        list.appendChild(this.createTokenCard(token));
      }
    }

    section.appendChild(list);
    container.appendChild(section);

    // Help section
    const help = createElement('div', { className: 'webhook-settings__help' });
    help.appendChild(createElement('h4', {}, ['Using with Siri Shortcuts']));
    help.appendChild(createElement('p', {},
      ['Create a Shortcut that calls: POST https://app.ferni.ai/api/webhooks/incoming/trigger with headers X-User-ID and X-Siri-Token, and body {"webhookName": "your webhook name"}.']));
    container.appendChild(help);
  }

  private createTokenCard(token: SiriToken): HTMLElement {
    const card = createElement('div', { className: 'token-card', 'data-token-id': token.id });

    // Header
    const header = createElement('div', { className: 'token-card__header' });

    const icon = createElement('div', { className: 'token-card__icon' });
    icon.appendChild(createSvgIcon(ICON_PATHS.key));
    header.appendChild(icon);

    const info = createElement('div', { className: 'token-card__info' });
    const nameSpan = createElement('span', { className: 'token-card__name' });
    nameSpan.textContent = token.name;
    info.appendChild(nameSpan);

    const previewSpan = createElement('span', { className: 'token-card__preview' });
    previewSpan.textContent = token.tokenPreview;
    info.appendChild(previewSpan);
    header.appendChild(info);

    card.appendChild(header);

    // Footer
    const footer = createElement('div', { className: 'token-card__footer' });

    const statsSpan = createElement('span', { className: 'token-card__stats' });
    statsSpan.textContent = `${token.usageCount} uses`;
    footer.appendChild(statsSpan);

    const deleteBtn = createElement('button', { className: 'token-card__btn token-card__btn--danger', title: 'Delete' });
    deleteBtn.appendChild(createSvgIcon(ICON_PATHS.trash));
    deleteBtn.addEventListener('click', () => this.deleteSiriToken(token.id));
    footer.appendChild(deleteBtn);

    card.appendChild(footer);

    return card;
  }

  private showAddWebhookForm(): void {
    const name = prompt('Webhook name (e.g., "Bedtime routine"):');
    if (!name) return;

    const url = prompt('Webhook URL:');
    if (!url) return;

    const triggers = prompt('Voice triggers (comma-separated, e.g., "bedtime, goodnight"):');
    if (!triggers) return;

    this.createWebhook({
      name,
      url,
      voiceTriggers: triggers.split(',').map((t) => t.trim()),
      method: 'POST',
    });
  }

  private async createWebhook(data: { name: string; url: string; voiceTriggers: string[]; method: 'POST' | 'GET' | 'PUT' }): Promise<void> {
    try {
      const res = await apiPost<WebhookConfig>('/api/webhooks', data);
      if (res.ok && res.data) {
        this.webhooks.push(res.data);
        toast.success('Webhook created!');
        this.callbacks.onWebhookCreated?.(res.data);
        this.renderContent();
      } else {
        toast.error(res.error || "Couldn't create webhook");
      }
    } catch (error) {
      toast.error("Couldn't create webhook");
    }
  }

  private async toggleWebhook(webhookId: string, enabled: boolean): Promise<void> {
    try {
      const res = await apiPut(`/api/webhooks/${webhookId}`, { enabled });
      if (res.ok) {
        const webhook = this.webhooks.find((w) => w.id === webhookId);
        if (webhook) webhook.enabled = enabled;
        toast.success(enabled ? 'Webhook enabled' : 'Webhook disabled');
      }
    } catch (error) {
      toast.error("Couldn't update webhook");
    }
  }

  private async testWebhook(webhookId: string): Promise<void> {
    toast.info('Testing...');
    try {
      const res = await apiPost<{ success: boolean; error?: string }>(`/api/webhooks/${webhookId}/test`, {});
      if (res.ok && res.data?.success) {
        toast.success('Webhook works!');
      } else {
        toast.error(res.data?.error || "Webhook test failed");
      }
    } catch (error) {
      toast.error("Couldn't test webhook");
    }
  }

  private async deleteWebhook(webhookId: string): Promise<void> {
    if (!confirm('Delete this webhook?')) return;

    try {
      const res = await apiDelete(`/api/webhooks/${webhookId}`);
      if (res.ok) {
        this.webhooks = this.webhooks.filter((w) => w.id !== webhookId);
        toast.success('Webhook deleted');
        this.callbacks.onWebhookDeleted?.(webhookId);
        this.renderContent();
      }
    } catch (error) {
      toast.error("Couldn't delete webhook");
    }
  }

  private async createSiriToken(): Promise<void> {
    const name = prompt('Token name (e.g., "iPhone Shortcuts"):');
    if (!name) return;

    try {
      const res = await apiPost<{ id: string; name: string; token: string }>('/api/webhooks/siri-tokens', {
        name,
        scopes: ['trigger_webhook'],
      });

      if (res.ok && res.data) {
        this.newTokenValue = res.data.token;
        await this.fetchData();
        toast.success('Token created! Copy it now.');
        this.renderContent();
      } else {
        toast.error(res.error || "Couldn't create token");
      }
    } catch (error) {
      toast.error("Couldn't create token");
    }
  }

  private async deleteSiriToken(tokenId: string): Promise<void> {
    if (!confirm('Delete this token? Any Shortcuts using it will stop working.')) return;

    try {
      const res = await apiDelete(`/api/webhooks/siri-tokens/${tokenId}`);
      if (res.ok) {
        this.siriTokens = this.siriTokens.filter((t) => t.id !== tokenId);
        toast.success('Token deleted');
        this.renderContent();
      }
    } catch (error) {
      toast.error("Couldn't delete token");
    }
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .webhook-settings {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal-backdrop);
        background: var(--backdrop-heavy);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.OUT_EXPO}, visibility ${DURATION.SLOW}ms;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-md);
      }

      .webhook-settings--visible {
        opacity: 1;
        visibility: visible;
      }

      .webhook-settings__content {
        background: var(--color-bg-primary);
        border-radius: var(--radius-lg);
        width: 100%;
        max-width: 500px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: scale(0.95) translateY(20px);
        transition: transform ${DURATION.SLOW}ms ${EASING.OUT_EXPO};
      }

      .webhook-settings--visible .webhook-settings__content {
        transform: scale(1) translateY(0);
      }

      .webhook-settings__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-md);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .webhook-settings__title {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0;
      }

      .webhook-settings__close {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        border-radius: var(--radius-full);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      }

      .webhook-settings__close:hover,
      .webhook-settings__close:focus-visible {
        background: var(--color-bg-elevated);
        color: var(--color-text-primary);
      }

      .webhook-settings__close svg {
        width: 20px;
        height: 20px;
      }

      .webhook-settings__tabs {
        display: flex;
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .webhook-settings__tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-xs);
        padding: var(--space-sm) var(--space-md);
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--color-text-secondary);
        font-size: 0.875rem;
        cursor: pointer;
        transition: color ${DURATION.FAST}ms, border-color ${DURATION.FAST}ms;
      }

      .webhook-settings__tab:hover,
      .webhook-settings__tab:focus-visible {
        color: var(--color-text-primary);
      }

      .webhook-settings__tab.active {
        color: var(--color-accent-primary);
        border-bottom-color: var(--color-accent-primary);
      }

      .webhook-settings__tab svg {
        width: 16px;
        height: 16px;
      }

      .webhook-settings__body {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-md);
      }

      .webhook-settings__section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-md);
      }

      .webhook-settings__section-header h3 {
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0;
      }

      .webhook-settings__add-btn {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        padding: var(--space-xs) var(--space-sm);
        background: var(--color-accent-primary);
        border: none;
        border-radius: var(--radius-md);
        color: white;
        font-size: 0.875rem;
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms, opacity ${DURATION.FAST}ms;
      }

      .webhook-settings__add-btn:hover,
      .webhook-settings__add-btn:focus-visible {
        opacity: 0.9;
      }

      .webhook-settings__add-btn:active {
        transform: scale(0.98);
      }

      .webhook-settings__add-btn svg {
        width: 16px;
        height: 16px;
      }

      .webhook-settings__list {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
      }

      .webhook-settings__empty {
        text-align: center;
        padding: var(--space-lg);
        color: var(--color-text-muted);
        font-size: 0.875rem;
      }

      .webhook-settings__loading {
        text-align: center;
        padding: var(--space-lg);
        color: var(--color-text-secondary);
      }

      .webhook-settings__help {
        margin-top: var(--space-lg);
        padding: var(--space-md);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
      }

      .webhook-settings__help h4 {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-xs);
      }

      .webhook-settings__help p {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        margin: 0;
        line-height: 1.5;
      }

      .webhook-settings__new-token {
        margin-bottom: var(--space-md);
        padding: var(--space-md);
        background: rgba(52, 199, 89, 0.1);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-semantic-success);
      }

      .webhook-settings__new-token p {
        font-size: 0.875rem;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-sm);
      }

      .webhook-settings__token-display {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        padding: var(--space-sm);
        background: var(--color-bg-primary);
        border-radius: var(--radius-sm);
      }

      .webhook-settings__token-display code {
        flex: 1;
        font-family: var(--font-mono);
        font-size: 0.75rem;
        word-break: break-all;
        color: var(--color-text-primary);
      }

      .webhook-settings__copy-btn {
        padding: var(--space-xs);
        background: none;
        border: none;
        border-radius: var(--radius-sm);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: color ${DURATION.FAST}ms;
      }

      .webhook-settings__copy-btn:hover,
      .webhook-settings__copy-btn:focus-visible {
        color: var(--color-text-primary);
      }

      .webhook-settings__copy-btn svg {
        width: 18px;
        height: 18px;
      }

      .webhook-card {
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
        padding: var(--space-md);
        transition: opacity ${DURATION.FAST}ms;
      }

      .webhook-card--disabled {
        opacity: 0.6;
      }

      .webhook-card__header {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        margin-bottom: var(--space-sm);
      }

      .webhook-card__icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-bg-primary);
        border-radius: var(--radius-md);
        color: var(--color-accent-primary);
      }

      .webhook-card__icon svg {
        width: 20px;
        height: 20px;
      }

      .webhook-card__info {
        flex: 1;
        min-width: 0;
      }

      .webhook-card__name {
        display: block;
        font-weight: 500;
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .webhook-card__triggers {
        display: block;
        font-size: 0.75rem;
        color: var(--color-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .webhook-card__toggle {
        position: relative;
        width: 44px;
        height: 24px;
        cursor: pointer;
      }

      .webhook-card__toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .webhook-card__toggle-slider {
        position: absolute;
        inset: 0;
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-full);
        transition: background ${DURATION.FAST}ms;
      }

      .webhook-card__toggle-slider::before {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: var(--radius-full);
        transition: transform ${DURATION.FAST}ms;
      }

      .webhook-card__toggle input:checked + .webhook-card__toggle-slider {
        background: var(--color-accent-primary);
      }

      .webhook-card__toggle input:checked + .webhook-card__toggle-slider::before {
        transform: translateX(20px);
      }

      .webhook-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .webhook-card__stats {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .webhook-card__actions {
        display: flex;
        gap: var(--space-xs);
      }

      .webhook-card__btn {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        border-radius: var(--radius-sm);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      }

      .webhook-card__btn:hover,
      .webhook-card__btn:focus-visible {
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
      }

      .webhook-card__btn--danger:hover,
      .webhook-card__btn--danger:focus-visible {
        color: var(--color-semantic-error);
      }

      .webhook-card__btn svg {
        width: 16px;
        height: 16px;
      }

      .token-card {
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
        padding: var(--space-md);
      }

      .token-card__header {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        margin-bottom: var(--space-sm);
      }

      .token-card__icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-bg-primary);
        border-radius: var(--radius-md);
        color: var(--color-text-secondary);
      }

      .token-card__icon svg {
        width: 20px;
        height: 20px;
      }

      .token-card__info {
        flex: 1;
        min-width: 0;
      }

      .token-card__name {
        display: block;
        font-weight: 500;
        color: var(--color-text-primary);
      }

      .token-card__preview {
        display: block;
        font-size: 0.75rem;
        font-family: var(--font-mono);
        color: var(--color-text-muted);
      }

      .token-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .token-card__stats {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .token-card__btn {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        border-radius: var(--radius-sm);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
      }

      .token-card__btn:hover,
      .token-card__btn:focus-visible {
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
      }

      .token-card__btn--danger:hover,
      .token-card__btn--danger:focus-visible {
        color: var(--color-semantic-error);
      }

      .token-card__btn svg {
        width: 16px;
        height: 16px;
      }

      @media (prefers-reduced-motion: reduce) {
        .webhook-settings,
        .webhook-settings__content,
        .webhook-card,
        .webhook-card__toggle-slider,
        .webhook-card__toggle-slider::before {
          transition: none;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const webhookSettingsUI = new WebhookSettingsUI();

/**
 * Show webhook settings panel
 */
export function showWebhookSettings(): void {
  webhookSettingsUI.show();
}

/**
 * Hide webhook settings panel
 */
export function hideWebhookSettings(): void {
  webhookSettingsUI.hide();
}

/**
 * Set callbacks for webhook settings events
 */
export function setWebhookSettingsCallbacks(callbacks: WebhookSettingsCallbacks): void {
  webhookSettingsUI.setCallbacks(callbacks);
}
