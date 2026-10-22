/**
 * What Ferni knows about you, as one view: people, your life now, dates,
 * what you like, how Ferni reads you and what's on his mind, each item with
 * where it came from, and Correct, That's wrong and Forget on every row
 * (data and requests: known.ts).
 *
 * Grouped inset lists, a centred dialog on desktop and a full-height sheet
 * on phones. Item text is the caller's data, so it is only ever set as text,
 * never as HTML. After every change the view re-reads the server, so it
 * shows what Ferni will actually remember.
 *
 * Hosted in a native <dialog> with the same sizes and sheet presentation as
 * the overlay dialog primitive (ui/overlay/dialog.ts, #999), so moving onto
 * it once that lands is a change to openHost only.
 *
 * @module ui/memory/known-view
 */
import { t } from '../../i18n/index.js';
import { toast } from '../whisper.ui.js';
import { injectKnownViewStyles } from './known-view.styles.js';
import {
  aboutLine,
  actionsFor,
  actOn,
  dayLabel,
  loadKnown,
  provenance,
  sectionsOf,
  type KnownAction,
  type KnownItem,
  type KnownView,
} from './known.js';

const ROOT = 'ferni-known';
const TITLE_ID = 'ferni-known-title';
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const MORE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="19" cy="12" r="1.75"/></svg>';

export interface KnownViewHandlers {
  act: (item: KnownItem, action: KnownAction, value?: string) => void;
  retry: () => void;
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

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const ACTION_LABEL: Record<KnownAction, string> = {
  correct: 'ferniKnows.correctButton',
  wrong: 'memoryView.thatsWrong',
  forget: 'memoryView.forget',
};

/** The inline correction: the item's words in a field, Save and Cancel. */
function correctionForm(item: KnownItem, row: HTMLElement, h: KnownViewHandlers): HTMLFormElement {
  const form = el('form', `${ROOT}__correct`);
  const input = el('input', `${ROOT}__input`);
  input.value = item.text;
  input.maxLength = 200;
  input.setAttribute('aria-label', t('memoryView.correctLabel'));
  const cancel = (): void => {
    form.remove();
    row.querySelector<HTMLButtonElement>(`.${ROOT}__more`)?.focus();
  };
  input.addEventListener('keydown', (e) => {
    // Escape leaves the edit, not the whole view.
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (value && value !== item.text) h.act(item, 'correct', value);
    else cancel();
  });
  const save = el('button', `${ROOT}__action ${ROOT}__action--primary`, t('common.save'));
  save.type = 'submit';
  form.append(input, save, button(`${ROOT}__action`, t('common.cancel'), cancel));
  return form;
}

function actionBar(item: KnownItem, row: HTMLElement, h: KnownViewHandlers): HTMLElement {
  const bar = el('div', `${ROOT}__actions`);
  bar.id = `${ROOT}-actions-${item.kind}-${item.id}`;
  bar.hidden = true;
  for (const action of actionsFor(item)) {
    const cls = `${ROOT}__action${action === 'correct' ? '' : ` ${ROOT}__action--quiet`}`;
    bar.append(
      button(cls, t(ACTION_LABEL[action]), () => {
        if (action !== 'correct') return h.act(item, action);
        bar.hidden = true;
        const form = correctionForm(item, row, h);
        row.append(form);
        form.querySelector('input')?.focus();
      })
    );
  }
  return bar;
}

function rowFor(item: KnownItem, h: KnownViewHandlers): HTMLLIElement {
  const row = el('li', `${ROOT}__row`);
  row.dataset.kind = item.kind;
  const main = el('div', `${ROOT}__main`);
  const about = aboutLine(item);
  if (about !== undefined) main.append(el('p', `${ROOT}__about`, about));
  const text = el('p', `${ROOT}__text`, item.text);
  if (item.earlier) text.append(' ', el('span', `${ROOT}__badge`, t('ferniKnows.earlier')));
  main.append(text);
  if (item.day !== undefined) main.append(el('p', `${ROOT}__day`, dayLabel(item.day)));
  if (item.quote !== undefined) main.append(el('blockquote', `${ROOT}__quote`, item.quote));
  main.append(el('p', `${ROOT}__meta`, provenance(item)));

  const bar = actionBar(item, row, h);
  const more = el('button', `${ROOT}__more`);
  more.type = 'button';
  more.innerHTML = MORE_ICON;
  more.setAttribute('aria-label', t('common.edit'));
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', bar.id);
  more.addEventListener('click', () => {
    bar.hidden = !bar.hidden;
    more.setAttribute('aria-expanded', String(!bar.hidden));
    row.querySelector(`.${ROOT}__correct`)?.remove();
  });
  const head = el('div', `${ROOT}__row-head`);
  head.append(main, more);
  row.append(head, bar);
  return row;
}

/** The view's content for a loaded view, a failed load (null) or a load in flight (undefined). */
export function renderKnownView(
  view: KnownView | null | undefined,
  h: KnownViewHandlers
): HTMLElement {
  const body = el('div', `${ROOT}__body`);
  body.setAttribute('aria-busy', String(view === undefined));
  if (view === undefined) {
    for (let i = 0; i < 3; i++) body.append(el('div', `${ROOT}__skeleton`));
    return body;
  }
  if (view === null) {
    const state = el('div', `${ROOT}__state`);
    state.append(
      el('p', '', t('app.couldNotLoadMemories')),
      button(`${ROOT}__action`, t('common.retry'), h.retry)
    );
    body.append(state);
    return body;
  }
  const sections = sectionsOf(view);
  if (sections.length === 0) body.append(el('p', `${ROOT}__state`, t('memoryView.empty')));
  for (const s of sections) {
    const section = el('section', `${ROOT}__section`);
    section.setAttribute('aria-labelledby', `${ROOT}-section-${s.id}`);
    const heading = el('h3', `${ROOT}__heading`, s.title);
    heading.id = `${ROOT}-section-${s.id}`;
    section.append(heading);
    if (s.note !== undefined) section.append(el('p', `${ROOT}__note`, s.note));
    const list = el('ul', `${ROOT}__list`);
    list.setAttribute('role', 'list');
    list.append(...s.items.map((item) => rowFor(item, h)));
    section.append(list);
    body.append(section);
  }
  return body;
}

function header(close: () => void): HTMLElement {
  const head = el('header', `${ROOT}__header`);
  const titles = el('div', `${ROOT}__titles`);
  const title = el('h2', `${ROOT}__title`, t('ferniKnows.panelTitle'));
  title.id = TITLE_ID;
  title.tabIndex = -1; // focus lands here after a change re-renders the list
  titles.append(title, el('p', `${ROOT}__subtitle`, t('memoryView.subtitle')));
  const x = el('button', `${ROOT}__close`);
  x.type = 'button';
  x.innerHTML = CLOSE_ICON;
  x.setAttribute('aria-label', t('common.close'));
  x.addEventListener('click', close);
  head.append(titles, x);
  return head;
}

/** A modal <dialog>: centred card on desktop, full-height sheet on phones (styles). */
function openHost(content: HTMLElement): { dialog: HTMLDialogElement; close: () => void } {
  document.querySelectorAll(`.${ROOT}`).forEach((d) => d.remove()); // HMR / double open
  const returnTo = document.activeElement as HTMLElement | null;
  const dialog = el('dialog', ROOT);
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  const close = (): void => {
    if (dialog.hasAttribute('open') && typeof dialog.close === 'function') dialog.close();
    dialog.remove();
    if (returnTo?.isConnected === true) returnTo.focus({ preventScroll: true });
  };
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close(); // the backdrop
  });
  dialog.append(header(close), content);
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return { dialog, close };
}

const DONE_TOAST: Record<KnownAction, string> = {
  correct: 'app.memoryCorrected',
  wrong: 'memoryView.wrongDone',
  forget: 'app.memoryRemoved',
};

/** Open the view and load it; every change re-reads what the server has. */
export async function openMemoryView(): Promise<void> {
  injectKnownViewStyles();
  let slot = renderKnownView(undefined, { act: () => undefined, retry: () => undefined });
  const { dialog } = openHost(slot);
  const show = (view: KnownView | null | undefined): void => {
    const next = renderKnownView(view, handlers);
    slot.replaceWith(next);
    slot = next;
  };
  const reload = async (skeleton: boolean): Promise<void> => {
    if (skeleton) show(undefined);
    show(await loadKnown());
  };
  const handlers: KnownViewHandlers = {
    retry: () => void reload(true),
    act: (item, action, value) =>
      void actOn(item, action, value).then(async (outcome) => {
        if (outcome === 'done') toast.success(t(DONE_TOAST[action]));
        else if (outcome === 'not-kept') toast.success(t('app.credentialNotKept'));
        else toast.error(t(outcome === 'gone' ? 'app.memoryNotFound' : 'app.couldNotRemoveMemory'));
        if (!dialog.isConnected) return;
        // The row is gone or changed: keep the current list until the server's answer replaces it.
        await reload(false);
        dialog.querySelector<HTMLElement>(`#${TITLE_ID}`)?.focus({ preventScroll: true });
      }),
  };
  show(await loadKnown());
}
