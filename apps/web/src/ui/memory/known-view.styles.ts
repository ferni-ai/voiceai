/**
 * Memory view styles: grouped inset lists on the 8-pt grid (rem, so they
 * scale with text size), a 40rem card on desktop and a full-height sheet on
 * phones, matching the overlay dialog primitive's sizes and radius. Tokens
 * only, so light and dark follow the theme.
 *
 * @module ui/memory/known-view.styles
 */
import { DURATION, EASING } from '../../config/animation-constants.js';

const STYLE_ID = 'ferni-known-styles';
const T = `${DURATION.NORMAL}ms ${EASING.DECELERATE}`;

const CSS = `
.ferni-known {
  display: flex; flex-direction: column; width: 40rem; max-width: calc(100% - 2rem);
  max-height: min(90dvh, 50rem); margin: auto; padding: 0; border: 0; overflow: hidden;
  border-radius: 1.5rem; background: var(--color-background-primary); color: var(--color-text-primary);
  box-shadow: var(--shadow-xl); font-family: var(--font-body);
  transition: opacity ${T}, transform ${T};
}
.ferni-known:not([open]) { display: none; }
.ferni-known::backdrop { background: var(--backdrop-medium); }
@starting-style { .ferni-known[open] { opacity: 0; transform: translateY(0.5rem) scale(0.98); } }
.ferni-known__header {
  display: flex; align-items: flex-start; gap: 1rem; padding: 1.5rem 1.5rem 1rem;
  border-bottom: 1px solid var(--color-border-subtle);
}
.ferni-known__titles { flex: 1; min-width: 0; }
.ferni-known__title {
  margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 600; line-height: 1.2;
}
.ferni-known__title:focus { outline: none; }
.ferni-known__subtitle { margin: 0.25rem 0 0; color: var(--color-text-secondary); font-size: 0.9375rem; line-height: 1.4; }
.ferni-known__close, .ferni-known__more {
  flex: none; display: grid; place-items: center; width: 2.75rem; height: 2.75rem; padding: 0;
  border: 0; border-radius: var(--radius-full); background: transparent; color: var(--color-text-secondary);
  cursor: pointer;
}
.ferni-known__close { background: var(--color-background-secondary); }
.ferni-known__body {
  flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;
  padding: 0.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom));
}
.ferni-known__section { margin-top: 1.5rem; }
.ferni-known__heading {
  margin: 0 0 0.5rem 1rem; color: var(--color-text-secondary);
  font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase;
}
.ferni-known__note { margin: -0.25rem 1rem 0.5rem; color: var(--color-text-muted); font-size: 0.8125rem; line-height: 1.4; }
.ferni-known__list {
  margin: 0; padding: 0; list-style: none; overflow: hidden;
  border-radius: 1rem; background: var(--color-background-elevated); box-shadow: var(--shadow-xs);
}
.ferni-known__row { padding: 0.75rem 0.5rem 0.75rem 1rem; }
.ferni-known__row + .ferni-known__row { border-top: 1px solid var(--color-border-subtle); }
.ferni-known__row-head { display: flex; align-items: flex-start; gap: 0.5rem; }
.ferni-known__main { flex: 1; min-width: 0; }
.ferni-known__about { margin: 0 0 0.125rem; font-size: 0.8125rem; font-weight: 600; color: var(--color-text-secondary); }
.ferni-known__text { margin: 0; font-size: 1rem; line-height: 1.4; overflow-wrap: anywhere; }
.ferni-known__badge {
  display: inline-block; padding: 0 0.5rem; border-radius: var(--radius-full);
  background: var(--color-background-secondary); color: var(--color-text-muted);
  font-size: 0.75rem; font-weight: 500; vertical-align: 0.0625rem;
}
.ferni-known__day { margin: 0.25rem 0 0; color: var(--color-accent-text); font-size: 0.875rem; font-weight: 600; }
.ferni-known__quote {
  margin: 0.375rem 0 0; padding-inline-start: 0.625rem; border-inline-start: 2px solid var(--color-border-medium);
  color: var(--color-text-secondary); font-size: 0.875rem; font-style: italic; line-height: 1.4;
}
.ferni-known__quote::before { content: open-quote; }
.ferni-known__quote::after { content: close-quote; }
.ferni-known__meta { margin: 0.375rem 0 0; color: var(--color-text-muted); font-size: 0.8125rem; }
.ferni-known__actions, .ferni-known__correct {
  display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.75rem 0.5rem 0.25rem 0;
}
.ferni-known__actions[hidden] { display: none; }
.ferni-known__action {
  min-height: 2.75rem; padding: 0 1rem; border: 1px solid var(--color-border-medium); border-radius: var(--radius-full);
  background: transparent; color: var(--color-text-primary); font: inherit; font-size: 0.9375rem; font-weight: 600;
  cursor: pointer;
}
.ferni-known__action--primary { border-color: transparent; background: var(--color-accent-primary); color: var(--color-text-inverse); }
.ferni-known__action--quiet { color: var(--color-text-secondary); }
.ferni-known__input {
  flex: 1 1 14rem; min-height: 2.75rem; padding: 0 0.875rem; border: 1px solid var(--color-border-medium);
  border-radius: 0.75rem; background: var(--color-background-primary); color: var(--color-text-primary); font: inherit;
}
.ferni-known__close:hover, .ferni-known__close:focus-visible,
.ferni-known__more:hover, .ferni-known__more:focus-visible,
.ferni-known__action:hover, .ferni-known__action:focus-visible { background: var(--color-background-secondary); }
.ferni-known__action--primary:hover, .ferni-known__action--primary:focus-visible { background: var(--color-accent-hover); }
.ferni-known__close:focus-visible, .ferni-known__more:focus-visible,
.ferni-known__action:focus-visible, .ferni-known__input:focus-visible {
  outline: 2px solid var(--color-accent-primary); outline-offset: 2px;
}
.ferni-known__state { margin: 3rem 1rem; color: var(--color-text-secondary); text-align: center; line-height: 1.5; }
.ferni-known__state p { margin: 0 0 1rem; }
.ferni-known__skeleton {
  height: 4.5rem; margin-top: 1rem; border-radius: 1rem; background: var(--color-background-secondary);
  animation: ferni-known-pulse ${DURATION.DELIBERATE * 2}ms ${EASING.STANDARD} infinite alternate;
}
@keyframes ferni-known-pulse { to { opacity: 0.5; } }

/* Phones: a full-height sheet. */
@media (max-width: 768px) {
  .ferni-known {
    width: 100%; max-width: 100%; height: calc(100dvh - max(env(safe-area-inset-top), 0.5rem) - 0.5rem);
    max-height: none; margin: auto 0 0; border-radius: 1.5rem 1.5rem 0 0;
  }
  @starting-style { .ferni-known[open] { transform: translateY(100%); } }
  .ferni-known__header { padding: 1.25rem 1rem 0.75rem; }
  .ferni-known__body { padding-inline: 1rem; }
}
@media (prefers-reduced-motion: reduce) {
  .ferni-known { transition: opacity ${T}; }
  @starting-style { .ferni-known[open] { transform: none; } }
  .ferni-known__skeleton { animation: none; }
}
`;

export function injectKnownViewStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
