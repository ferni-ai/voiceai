/**
 * Vibe Controller - core styles (panel, presets, sections, controls, music, temperature)
 *
 * Concatenated with styles-flows.ts by injectStyles() into one <style> element.
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

export function getCoreStyles(): string {
  return `
    .vibe-overlay {
      position: fixed;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal-backdrop, 2000);
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.SLOW}ms ${EASING.OUT_EXPO}, visibility ${DURATION.SLOW}ms;
      padding: var(--space-md, 16px);
    }

    .vibe-overlay--visible {
      opacity: 1;
      visibility: visible;
    }

    .vibe-panel {
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      max-width: 560px;
      width: 100%;
      max-height: calc(100vh - 64px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-xl, 0 20px 60px rgba(44, 37, 32, 0.2));
      transform: scale(0.95) translateY(20px);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    .vibe-overlay--visible .vibe-panel {
      transform: scale(1) translateY(0);
    }

    /* Header */
    .vibe-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .vibe-header__left {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs, 2px);
    }

    .vibe-header__eyebrow {
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-ferni-ink);
    }

    .vibe-header__title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    }

    .vibe-close {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted, #756A5E);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
    }

    .vibe-close:hover,
    .vibe-close:focus-visible {
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.05));
      color: var(--color-text-primary, #2C2520);
    }

    .vibe-close svg {
      width: 20px;
      height: 20px;
    }

    /* Body */
    .vibe-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 24px);
    }

    /* Preset Grid */
    .vibe-presets {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-sm, 12px);
      margin-bottom: var(--space-xl, 32px);
    }

    .vibe-preset {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-md, 16px) var(--space-sm, 12px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border: 2px solid transparent;
      border-radius: var(--radius-lg, 16px);
      cursor: pointer;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .vibe-preset:hover {
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.06));
      transform: translateY(-2px);
    }

    .vibe-preset:focus-visible {
      outline: 2px solid var(--color-ferni, #3D5A45);
      outline-offset: 2px;
    }

    .vibe-preset--active {
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.1));
      border-color: var(--color-ferni, #3D5A45);
    }

    .vibe-preset__icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-secondary, #5C544A);
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-preset--active .vibe-preset__icon {
      background: var(--color-ferni, #3D5A45);
      color: white;
    }

    .vibe-preset__icon svg {
      width: 24px;
      height: 24px;
    }

    .vibe-preset__name {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
    }

    .vibe-preset__desc {
      font-size: 0.75rem;
      color: var(--color-text-muted, #756A5E);
      text-align: center;
      line-height: 1.4;
    }

    /* Section */
    .vibe-section {
      margin-bottom: var(--space-lg, 24px);
    }

    .vibe-section__header {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      margin-bottom: var(--space-md, 16px);
    }

    .vibe-section__icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.1));
      border-radius: var(--radius-md, 8px);
      color: var(--color-ferni-ink);
    }

    .vibe-section__icon svg {
      width: 18px;
      height: 18px;
    }

    .vibe-section__title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .vibe-section__status {
      margin-left: auto;
      font-size: 0.75rem;
      color: var(--color-text-muted, #756A5E);
    }

    .vibe-section__status--connected {
      color: var(--color-semantic-success-text);
    }

    /* Controls */
    .vibe-control {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-md, 12px);
    }

    .vibe-control__label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text-secondary, #5C544A);
      min-width: 80px;
    }

    .vibe-control__slider {
      flex: 1;
      height: 6px;
      background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-full, 9999px);
      appearance: none;
      cursor: pointer;
    }

    .vibe-control__slider::-webkit-slider-thumb {
      appearance: none;
      width: 20px;
      height: 20px;
      background: var(--color-ferni, #3D5A45);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      transition: transform ${DURATION.FAST}ms;
    }

    .vibe-control__slider::-webkit-slider-thumb:hover {
      transform: scale(1.15);
    }

    .vibe-control__value {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      min-width: 50px;
      text-align: right;
    }

    /* Music Player */
    .vibe-music {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 12px);
    }

    .vibe-music__now-playing {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-md, 12px);
    }

    .vibe-music__cover {
      width: 56px;
      height: 56px;
      background: var(--color-ferni-tint, rgba(61, 90, 69, 0.2));
      border-radius: var(--radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-ferni-ink);
    }

    .vibe-music__cover svg {
      width: 28px;
      height: 28px;
    }

    .vibe-music__info {
      flex: 1;
      min-width: 0;
    }

    .vibe-music__track {
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .vibe-music__artist {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #756A5E);
    }

    .vibe-music__controls {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 8px);
    }

    .vibe-music__btn {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-ferni, #3D5A45);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: white;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-music__btn:hover {
      background: var(--color-ferni-hover, #4a6d52);
      transform: scale(1.05);
    }

    .vibe-music__btn--secondary {
      background: var(--tonal-surface-2);
      color: var(--color-text-secondary, #5C544A);
    }

    .vibe-music__btn--secondary:hover {
      background: var(--tonal-surface-3);
      color: var(--color-text-primary, #2C2520);
    }

    .vibe-music__btn--secondary:active {
      background: var(--tonal-surface-active);
    }

    .vibe-music__btn svg {
      width: 18px;
      height: 18px;
    }

    /* Temperature Display */
    .vibe-temp {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-lg, 24px);
      padding: var(--space-lg, 24px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-lg, 16px);
    }

    .vibe-temp__btn {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-medium, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      font-size: 1.5rem;
      font-weight: 500;
      transition: all ${DURATION.FAST}ms;
    }

    .vibe-temp__btn:hover {
      background: var(--color-ferni, #3D5A45);
      border-color: var(--color-ferni, #3D5A45);
      color: white;
    }

    .vibe-temp__display {
      text-align: center;
    }

    .vibe-temp__value {
      font-size: 3rem;
      font-weight: 300;
      color: var(--color-text-primary, #2C2520);
      line-height: 1;
    }

    .vibe-temp__label {
      font-size: 0.8125rem;
      color: var(--color-text-muted, #756A5E);
      margin-top: var(--space-xs, 4px);
    }
`;
}
