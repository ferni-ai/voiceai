/**
 * Answer card page (/a/:id): what Ferni found, with its sources.
 *
 * Opened from a link Ferni texts. Sign-in comes first; the server returns
 * the card only to its owner (GET /api/answer-cards/:id). The answer and
 * source titles are set as text, never HTML; source links must be http(s);
 * Google's search suggestions render in a sandboxed iframe (see
 * utils/search-suggestions.ts).
 *
 * @module AnswerCardPage
 */

import { initI18n, t } from '../i18n/index.js';
import { initializeAuth } from '../services/auth-init.service.js';
import { apiGet } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { SUGGESTIONS_SANDBOX, buildSuggestionsDocument } from '../utils/search-suggestions.js';
import { showSignInGate } from './sign-in-gate.ui.js';

const log = createLogger('AnswerCardPage');

const PAGE_CLASS = 'answer-card-page';
const STYLE_ID = 'answer-card-page-styles';

export interface AnswerCardView {
  id: string;
  kind: 'answer' | 'recommendation';
  answerText: string;
  sources: Array<{ title: string; url: string }>;
  searchSuggestionsHtml: string;
  createdAt: number;
}

/** The card id in /a/:id, or null for any other path. */
export function answerCardIdFromPath(pathname: string): string | null {
  return /^\/a\/([A-Za-z0-9_-]{43})\/?$/.exec(pathname)?.[1] ?? null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function webLink(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null;
  } catch {
    log.debug('Skipping a source with a malformed link');
    return null;
  }
}

function sourcesList(sources: AnswerCardView['sources']): HTMLElement | null {
  const items = sources.flatMap(({ title, url }) => {
    const link = webLink(url);
    if (!link) return [];
    const item = el('li', `${PAGE_CLASS}__source`);
    const anchor = el('a', `${PAGE_CLASS}__link`, title || link.hostname);
    anchor.href = link.toString();
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    item.append(anchor, el('span', `${PAGE_CLASS}__host`, link.hostname));
    return [item];
  });
  if (items.length === 0) return null;
  const section = el('section', `${PAGE_CLASS}__sources`);
  const list = el('ol', `${PAGE_CLASS}__list`);
  list.append(...items);
  section.append(el('h2', `${PAGE_CLASS}__heading`, t('answerCard.sources')), list);
  return section;
}

function suggestionsFrame(html: string): HTMLIFrameElement | null {
  const doc = buildSuggestionsDocument(html);
  if (!doc) return null;
  const frame = el('iframe', `${PAGE_CLASS}__suggestions`);
  frame.setAttribute('sandbox', SUGGESTIONS_SANDBOX);
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = t('answerCard.searchSuggestions');
  frame.srcdoc = doc;
  return frame;
}

/** The card as DOM: text set as text, links checked, suggestions sandboxed. */
export function renderAnswerCard(card: AnswerCardView): HTMLElement {
  const article = el('article', `${PAGE_CLASS}__card`);
  const eyebrow =
    card.kind === 'recommendation' ? t('answerCard.recommendation') : t('answerCard.answer');
  article.append(
    el('p', `${PAGE_CLASS}__eyebrow`, eyebrow),
    el('p', `${PAGE_CLASS}__answer`, card.answerText)
  );
  const sources = sourcesList(card.sources);
  if (sources) article.append(sources);
  const frame = suggestionsFrame(card.searchSuggestionsHtml);
  if (frame) article.append(frame);
  return article;
}

function message(text: string): HTMLElement {
  const article = el('article', `${PAGE_CLASS}__card`);
  article.setAttribute('role', 'status');
  article.append(el('p', `${PAGE_CLASS}__answer`, text));
  return article;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${PAGE_CLASS} {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: var(--ma-silence) var(--space-4);
      background: var(--color-background-primary);
      font-family: var(--font-body);
      color: var(--color-text-primary);
      box-sizing: border-box;
    }
    .${PAGE_CLASS}__card {
      width: 100%;
      max-width: min(560px, 100%);
      padding: var(--ma-rest);
      background: var(--color-background-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-md);
      align-self: flex-start;
    }
    .${PAGE_CLASS}__eyebrow {
      margin: 0 0 var(--ma-breath);
      font-size: var(--text-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-muted);
    }
    .${PAGE_CLASS}__answer {
      margin: 0;
      font-size: var(--text-base);
      line-height: var(--leading-relaxed);
      white-space: pre-line;
    }
    .${PAGE_CLASS}__heading {
      margin: var(--ma-rest) 0 var(--ma-breath);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-semibold);
    }
    .${PAGE_CLASS}__list {
      margin: 0;
      padding-left: var(--space-6);
    }
    .${PAGE_CLASS}__source {
      margin-bottom: var(--ma-breath);
    }
    .${PAGE_CLASS}__link {
      color: var(--color-accent-text);
      font-size: var(--text-sm);
    }
    .${PAGE_CLASS}__link:hover,
    .${PAGE_CLASS}__link:focus-visible {
      color: var(--color-accent-hover);
    }
    .${PAGE_CLASS}__link:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }
    .${PAGE_CLASS}__host {
      display: block;
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }
    .${PAGE_CLASS}__suggestions {
      display: block;
      width: 100%;
      height: calc(var(--ma-meditation) + var(--ma-pause));
      margin-top: var(--ma-rest);
      border: 0;
    }
  `;
  document.head.appendChild(style);
}

/** Load the card for id and show it in root (or why it can't be shown). */
export async function showAnswerCard(root: HTMLElement, id: string): Promise<void> {
  injectStyles();
  root.replaceChildren(message(t('answerCard.loading')));
  const res = await apiGet<{ card: AnswerCardView }>(`/api/answer-cards/${id}`, undefined, {
    maxRetries: 1,
  });
  if (res.ok && res.data?.card) {
    root.replaceChildren(renderAnswerCard(res.data.card));
    return;
  }
  log.warn('Answer card not shown', { status: res.status });
  root.replaceChildren(
    message(res.status === 404 ? t('answerCard.notFound') : t('answerCard.loadFailed'))
  );
}

/** Entry for /a/:id: sign in, then show the card in place of the app. */
export async function initAnswerCardPage(id: string): Promise<void> {
  await initI18n();
  const auth = await initializeAuth();
  if (!auth.isAuthenticated) await showSignInGate();
  const root = document.createElement('main');
  root.className = PAGE_CLASS;
  document.body.replaceChildren(root);
  await showAnswerCard(root, id);
}
