/**
 * Conversations tab: past conversations (paginated), each opening to its
 * full transcript, and deletion of a conversation together with what Ferni
 * learned only from it.
 *
 * @module ui/memory-control/conversations-tab
 */

import { t } from '../../i18n/index.js';
import {
  deleteConversation,
  getConversation,
  listConversations,
  type ConversationDetail,
  type ConversationSummary,
} from '../../services/memory-control.service.js';
import { toast } from '../whisper.ui.js';
import { confirmAction } from './confirm-dialog.js';
import { esc, formatDateTime, formatTime, personaName } from './format.js';
import { ICONS, renderEmpty, renderError, renderLoading } from './states.js';

const PAGE_SIZE = 20;

type View = { kind: 'list' } | { kind: 'detail'; id: string };

export class ConversationsTab {
  private items: ConversationSummary[] = [];
  private nextCursor: string | undefined;
  private loaded = false;
  private loadingMore = false;
  private view: View = { kind: 'list' };
  private detail: ConversationDetail | null = null;
  private retry: (() => Promise<void>) | null = null;

  /** Called after a conversation is deleted (facts may have changed). */
  onDeleted: (() => void) | null = null;

  constructor(private readonly host: HTMLElement) {
    host.addEventListener('click', (e) => void this.onClick(e));
  }

  /** Load the first page (no-op when already loaded unless forced). */
  async load(force = false): Promise<void> {
    if (this.loaded && !force) {
      if (this.view.kind === 'list') this.renderList();
      return;
    }
    this.view = { kind: 'list' };
    this.host.innerHTML = renderLoading(
      t('memoryControl.loadingConversations', 'Finding our conversations...')
    );
    const result = await listConversations(undefined, PAGE_SIZE);
    if (!result.ok) {
      this.retry = () => this.load(true);
      this.host.innerHTML = renderError(
        t('memoryControl.loadConversationsError', "I couldn't load our conversations just now.")
      );
      return;
    }
    this.items = result.value.conversations;
    this.nextCursor = result.value.nextCursor;
    this.loaded = true;
    this.renderList();
  }

  // --------------------------------------------------------------------------
  // List
  // --------------------------------------------------------------------------

  private renderList(): void {
    if (this.items.length === 0) {
      this.host.innerHTML = renderEmpty(
        t('memoryControl.emptyConversationsTitle', 'No conversations yet'),
        t(
          'memoryControl.emptyConversationsBody',
          "Once we've talked, you'll find each conversation here to read back."
        )
      );
      return;
    }
    this.host.innerHTML = `
      <ul class="memory-list memory-conversations" aria-label="${esc(t('memoryControl.conversationsTab', 'Conversations'))}">
        ${this.items.map((c) => this.renderRow(c)).join('')}
      </ul>
      ${
        this.nextCursor
          ? `<div class="memory-more">
              <button type="button" class="memory-btn memory-btn--quiet" data-action="more" ${
                this.loadingMore ? 'disabled aria-busy="true"' : ''
              }>${esc(
                this.loadingMore
                  ? t('memoryControl.loadingMore', 'Loading...')
                  : t('memoryControl.showMore', 'Show older conversations')
              )}</button>
            </div>`
          : ''
      }`;
  }

  private renderRow(c: ConversationSummary): string {
    const when = formatDateTime(c.startedAt);
    const who = personaName(c.personaId);
    const turns =
      c.turnCount === 1
        ? t('memoryControl.oneTurn', '1 message')
        : t('memoryControl.turns', '{count} messages', { count: c.turnCount ?? 0 });
    return `
      <li class="memory-item memory-conversation" data-conversation-id="${esc(c.id)}">
        <button type="button" class="memory-conversation__open" data-action="open"
          aria-label="${esc(t('memoryControl.openConversationAria', 'Read conversation with {persona} on {date}', { persona: who, date: when }))}">
          <span class="memory-conversation__head">
            <span class="memory-conversation__persona">${esc(who)}</span>
            <span class="memory-item__meta"><span>${esc(when)}</span><span>${esc(turns)}</span></span>
          </span>
          <span class="memory-item__text">${esc(
            c.summary ||
              t('memoryControl.noSummary', "I haven't written a summary for this one yet.")
          )}</span>
        </button>
      </li>`;
  }

  private async loadMore(): Promise<void> {
    if (!this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    this.renderList();
    const result = await listConversations(this.nextCursor, PAGE_SIZE);
    this.loadingMore = false;
    if (!result.ok) {
      this.renderList();
      toast.error(t('memoryControl.loadMoreError', "Couldn't load more. Try again?"));
      return;
    }
    const firstNew = result.value.conversations[0]?.id;
    this.items = [...this.items, ...result.value.conversations];
    this.nextCursor = result.value.nextCursor;
    this.renderList();
    if (firstNew) {
      this.host
        .querySelector<HTMLElement>(
          `[data-conversation-id="${CSS.escape(firstNew)}"] [data-action="open"]`
        )
        ?.focus();
    }
  }

  // --------------------------------------------------------------------------
  // Detail
  // --------------------------------------------------------------------------

  private async openConversation(id: string): Promise<void> {
    this.view = { kind: 'detail', id };
    this.host.innerHTML = renderLoading(
      t('memoryControl.loadingTranscript', 'Opening our conversation...')
    );
    const result = await getConversation(id);
    if (this.view.kind !== 'detail' || this.view.id !== id) return;
    if (!result.ok) {
      this.retry = () => this.openConversation(id);
      this.host.innerHTML = `${this.renderBack()}${renderError(
        t('memoryControl.loadTranscriptError', "I couldn't open that conversation just now.")
      )}`;
      return;
    }
    this.detail = result.value;
    this.renderDetail();
    this.host.querySelector<HTMLElement>('.memory-transcript__title')?.focus();
  }

  private renderBack(): string {
    return `<button type="button" class="memory-btn memory-btn--quiet memory-back" data-action="back">${ICONS.back}<span>${esc(
      t('memoryControl.backToConversations', 'All conversations')
    )}</span></button>`;
  }

  private renderDetail(): void {
    const detail = this.detail;
    if (!detail) return;
    const c = detail.conversation;
    const who = personaName(c.personaId);
    const you = t('memoryControl.you', 'You');
    const turns = detail.turns.length
      ? detail.turns
          .map((turn) => {
            const isUser = turn.role === 'user';
            const speaker = isUser ? you : who;
            return `
              <li class="memory-turn memory-turn--${isUser ? 'user' : 'assistant'}">
                <p class="memory-turn__speaker">${esc(speaker)}${
                  turn.timestamp
                    ? ` <time datetime="${esc(turn.timestamp)}">${esc(formatTime(turn.timestamp))}</time>`
                    : ''
                }</p>
                <p class="memory-turn__text">${esc(turn.text)}</p>
              </li>`;
          })
          .join('')
      : `<li class="memory-muted">${esc(t('memoryControl.noTurns', 'There are no saved messages in this conversation.'))}</li>`;

    this.host.innerHTML = `
      <article class="memory-transcript" data-conversation-id="${esc(c.id)}">
        <div class="memory-transcript__bar">
          ${this.renderBack()}
          <button type="button" class="memory-btn memory-btn--danger-quiet" data-action="delete-conversation">${ICONS.trash}<span>${esc(
            t('memoryControl.deleteConversation', 'Delete conversation')
          )}</span></button>
        </div>
        <h3 class="memory-transcript__title" tabindex="-1">${esc(
          t('memoryControl.conversationWith', 'With {persona}', { persona: who })
        )}</h3>
        <p class="memory-item__meta"><span>${esc(formatDateTime(c.startedAt))}</span></p>
        ${c.summary ? `<p class="memory-transcript__summary">${esc(c.summary)}</p>` : ''}
        <ol class="memory-turns" aria-label="${esc(t('memoryControl.transcript', 'Transcript'))}">${turns}</ol>
      </article>`;
  }

  private backToList(focusId?: string): void {
    this.view = { kind: 'list' };
    this.detail = null;
    this.renderList();
    const target = focusId
      ? this.host.querySelector<HTMLElement>(
          `[data-conversation-id="${CSS.escape(focusId)}"] [data-action="open"]`
        )
      : null;
    (target ?? this.host.querySelector<HTMLElement>('[data-action="open"]'))?.focus();
  }

  private async removeConversation(): Promise<void> {
    const detail = this.detail;
    if (!detail) return;
    const id = detail.conversation.id;
    const confirmed = await confirmAction({
      title: t('memoryControl.deleteConversationTitle', 'Delete this conversation?'),
      message: t(
        'memoryControl.deleteConversationBody',
        "This removes the whole transcript. Anything I learned only from this conversation will be forgotten too. Things you've corrected yourself stay."
      ),
      confirmLabel: t('memoryControl.delete', 'Delete'),
    });
    if (!confirmed) return;

    const result = await deleteConversation(id);
    if (!result.ok) {
      toast.error(t('memoryControl.deleteConversationError', "Couldn't delete that. Try again?"));
      return;
    }
    this.items = this.items.filter((c) => c.id !== id);
    this.backToList();
    toast.success(t('memoryControl.conversationDeleted', 'Conversation deleted.'));
    this.onDeleted?.();
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button || !this.host.contains(button)) return;
    switch (button.dataset.action) {
      case 'open': {
        const id = button.closest<HTMLElement>('[data-conversation-id]')?.dataset.conversationId;
        if (id) await this.openConversation(id);
        break;
      }
      case 'back':
        this.backToList(this.view.kind === 'detail' ? this.view.id : undefined);
        break;
      case 'more':
        await this.loadMore();
        break;
      case 'delete-conversation':
        await this.removeConversation();
        break;
      case 'retry':
        await this.retry?.();
        break;
    }
  }
}
