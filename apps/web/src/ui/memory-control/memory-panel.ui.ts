/**
 * "What Ferni remembers" panel.
 *
 * One place for users to see and control everything Ferni has stored about
 * them, backed by the memory control API (`/api/memory/me/**`):
 * - Memories: learned facts by category plus people, with search, inline
 *   correction and forgetting
 * - Conversations: past conversations with full transcripts, deletable
 * - Your data: JSON/CSV export and "delete everything"
 *
 * Opened from the settings menu ("What I remember", and the older memory
 * browser / conversation history entries) and the `ferni:open-memories`
 * event. Lazy-loaded: import it with `import()` so it stays out of startup.
 *
 * @module ui/memory-control/memory-panel
 */

import { t } from '../../i18n/index.js';
import { Modal } from '../../components/base/modal.js';
import { getAuthState, linkWithGoogle } from '../../services/firebase-auth.service.js';
import { createLogger } from '../../utils/logger.js';
import { toast } from '../whisper.ui.js';
import { keepFocusInside } from './confirm-dialog.js';
import { ConversationsTab } from './conversations-tab.js';
import { DataTab } from './data-tab.js';
import { esc } from './format.js';
import { MemoriesTab } from './memories-tab.js';
import { injectMemoryPanelStyles } from './memory-panel.styles.js';

const log = createLogger('MemoryPanel');

export type MemoryPanelTab = 'memories' | 'conversations' | 'data';

const TABS: ReadonlyArray<{ id: MemoryPanelTab; label: () => string }> = [
  { id: 'memories', label: () => t('memoryControl.memoriesTab', 'Memories') },
  { id: 'conversations', label: () => t('memoryControl.conversationsTab', 'Conversations') },
  { id: 'data', label: () => t('memoryControl.dataTab', 'Your data') },
];

/** Anonymous: no account that would carry memories to another device. */
export function isAnonymousUser(): boolean {
  const auth = getAuthState();
  return !auth.isAuthenticated || (!auth.isLinked && !auth.email);
}

class MemoryPanel extends Modal {
  private active: MemoryPanelTab = 'memories';
  private returnFocus: HTMLElement | null = null;
  private memories: MemoriesTab | null = null;
  private conversations: ConversationsTab | null = null;
  private data: DataTab | null = null;

  constructor() {
    super(
      {
        id: 'memory-panel',
        title: t('memoryControl.title', 'What I remember'),
        cardClassName: 'memory-panel',
      },
      { maxWidth: '680px' }
    );
  }

  /** Own wrapper class: the base one would remove every other open modal on mount. */
  protected override getClassName(): string {
    return 'memory-panel-wrapper';
  }

  override render(): string {
    const tabs = TABS.map(
      (tab) => `
        <button type="button" role="tab" class="memory-tab" id="memory-tab-${tab.id}"
          aria-controls="memory-tabpanel-${tab.id}" data-tab="${tab.id}"
          aria-selected="${tab.id === this.active}" tabindex="${tab.id === this.active ? 0 : -1}">${esc(tab.label())}</button>`
    ).join('');
    const panels = TABS.map(
      (tab) => `
        <div role="tabpanel" class="memory-tabpanel" id="memory-tabpanel-${tab.id}"
          aria-labelledby="memory-tab-${tab.id}" tabindex="0" ${tab.id === this.active ? '' : 'hidden'}></div>`
    ).join('');

    return `
      <div class="ferni-modal" role="dialog" aria-modal="true" aria-labelledby="memory-panel-title"
        aria-describedby="memory-panel-tagline">
        <div class="ferni-modal__backdrop"></div>
        <div class="ferni-modal__card memory-panel" style="max-width: ${this.config.maxWidth}">
          <header class="ferni-modal__header">
            <h2 id="memory-panel-title" class="ferni-modal__title">${esc(this.config.title)}</h2>
            <p id="memory-panel-tagline" class="ferni-modal__tagline">${esc(
              t(
                'memoryControl.tagline',
                'Everything I keep from our conversations. You can correct or remove any of it.'
              )
            )}</p>
            <button type="button" class="ferni-modal__close" aria-label="${esc(t('panels.close', 'Close'))}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>
          <div class="ferni-modal__content memory-panel__content">
            <div class="memory-signin" hidden></div>
            <div class="memory-tabs" role="tablist" aria-label="${esc(this.config.title)}">${tabs}</div>
            ${panels}
          </div>
        </div>
      </div>`;
  }

  protected override afterMount(): void {
    super.afterMount();
    injectMemoryPanelStyles();

    const panel = (id: MemoryPanelTab): HTMLElement =>
      this.querySelector<HTMLElement>(`#memory-tabpanel-${id}`)!;
    this.memories = new MemoriesTab(panel('memories'));
    this.conversations = new ConversationsTab(panel('conversations'));
    this.data = new DataTab(panel('data'));

    // Deleting a conversation can remove what was learned from it
    this.conversations.onDeleted = () => this.markMemoriesStale();
    this.data.onWiped = () => {
      this.loaded.delete('memories');
      this.loaded.delete('conversations');
    };

    const tablist = this.querySelector<HTMLElement>('.memory-tabs');
    if (tablist) {
      this.addListener(tablist, 'click', ((e: MouseEvent) => {
        const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
        if (tab) this.selectTab(tab.dataset.tab as MemoryPanelTab);
      }) as EventListener);
      this.addListener(tablist, 'keydown', ((e: KeyboardEvent) =>
        this.onTabKeydown(e)) as EventListener);
    }

    const card = this.querySelector<HTMLElement>('.ferni-modal__card');
    if (card) {
      this.addListener(card, 'keydown', ((e: KeyboardEvent) =>
        keepFocusInside(card, e)) as EventListener);
    }

    const signin = this.querySelector<HTMLElement>('.memory-signin');
    if (signin) {
      this.addListener(signin, 'click', ((e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('[data-action="sign-in"]')) void this.signIn();
      }) as EventListener);
    }
  }

  /** Tabs whose data has been fetched since the panel opened. */
  private readonly loaded = new Set<MemoryPanelTab>();

  private markMemoriesStale(): void {
    this.loaded.delete('memories');
  }

  private renderSignInPrompt(): void {
    const signin = this.querySelector<HTMLElement>('.memory-signin');
    if (!signin) return;
    if (!isAnonymousUser()) {
      signin.hidden = true;
      signin.innerHTML = '';
      return;
    }
    signin.hidden = false;
    signin.innerHTML = `
      <p class="memory-signin__text">${esc(
        t(
          'memoryControl.signInPrompt',
          "You're not signed in, so these memories live only on this device. Sign in and I'll remember you everywhere."
        )
      )}</p>
      <button type="button" class="memory-btn memory-btn--quiet" data-action="sign-in">${esc(
        t('memoryControl.signIn', 'Sign in')
      )}</button>`;
  }

  private async signIn(): Promise<void> {
    try {
      await linkWithGoogle();
      this.renderSignInPrompt();
      toast.success(t('memoryControl.signedIn', "You're signed in!"));
    } catch (error) {
      log.warn({ error: String(error) }, 'Sign-in from memory panel failed');
      toast.error(t('memoryControl.signInError', "Couldn't sign you in. Try again?"));
    }
  }

  private onTabKeydown(e: KeyboardEvent): void {
    const index = TABS.findIndex((tab) => tab.id === this.active);
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    this.selectTab(TABS[next]!.id);
    this.querySelector<HTMLElement>(`#memory-tab-${TABS[next]!.id}`)?.focus();
  }

  selectTab(tab: MemoryPanelTab): void {
    this.active = tab;
    for (const { id } of TABS) {
      const button = this.querySelector<HTMLElement>(`#memory-tab-${id}`);
      const panel = this.querySelector<HTMLElement>(`#memory-tabpanel-${id}`);
      const selected = id === tab;
      button?.setAttribute('aria-selected', String(selected));
      button?.setAttribute('tabindex', selected ? '0' : '-1');
      if (panel) panel.hidden = !selected;
    }
    const fresh = !this.loaded.has(tab);
    this.loaded.add(tab);
    if (tab === 'memories') {
      if (fresh) void this.memories?.load();
    } else if (tab === 'conversations') {
      void this.conversations?.load(fresh);
    } else {
      this.data?.render();
    }
  }

  /** Open on a tab, with fresh data. */
  openOn(tab: MemoryPanelTab): void {
    if (!this.getIsOpen()) {
      this.returnFocus = document.activeElement as HTMLElement | null;
      this.loaded.clear();
    }
    this.renderSignInPrompt();
    super.open();
    this.selectTab(tab);
    this.querySelector<HTMLElement>(`#memory-tab-${tab}`)?.focus();
  }

  override close(): void {
    super.close();
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) target.focus();
  }
}

let panel: MemoryPanel | null = null;

/**
 * Open "What Ferni remembers" on the given tab.
 */
export function openMemoryPanel(tab: MemoryPanelTab = 'memories'): void {
  if (!panel) {
    panel = new MemoryPanel();
    panel.mount(document.body);
  }
  panel.openOn(tab);
}

/** Close the panel if it's open. */
export function closeMemoryPanel(): void {
  panel?.close();
}

/** Remove the panel from the page (app teardown, tests). */
export function disposeMemoryPanel(): void {
  panel?.dispose();
  panel = null;
}
