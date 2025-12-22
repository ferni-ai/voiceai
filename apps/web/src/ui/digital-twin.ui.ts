/**
 * Digital Twin Experience UI
 *
 * A beautiful, on-brand onboarding and management experience for Digital Twins.
 * Digital Twins are personal voice journals that grow with you - record your thoughts,
 * talk to your past self, and build a library of your own wisdom.
 *
 * Key principles:
 *   - Warm, human tone (never robotic or technical)
 *   - Clean, minimal design following Ferni brand guidelines
 *   - No emojis - we use elegant Lucide icons
 *   - Feels like opening a personal journal, not using an app
 *
 * @module digital-twin.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import {
  type CustomAgent,
  listCustomAgents,
  createCustomAgent,
} from '../services/custom-agent.service.js';
import { openVoiceJournal } from './voice-journal/index.js';
import { openCustomAgentWizard } from './custom-agent-wizard.ui.js';
import {
  isCaptureEnabled,
  enableJournalCapture,
  disableJournalCapture,
  loadCaptureSettings,
  saveCaptureSettings,
} from '../services/journal-capture.service.js';

const log = createLogger('DigitalTwinUI');

// ============================================================================
// ICONS (Lucide-style, 1.5px stroke, rounded - NO EMOJIS)
// ============================================================================

const ICONS = {
  // Core Digital Twin icons
  journal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>',
  voice:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  time:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  sparkle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  play:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  chevronRight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
  reflection:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  memories:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
  conversation:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  flame:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  capture:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="M2 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="M12 22v-4"/><path d="m19.07 19.07-2.83-2.83"/><path d="M22 12h-4"/><path d="m19.07 4.93-2.83 2.83"/><circle cx="12" cy="12" r="4"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let twins: CustomAgent[] = [];
let isLoading = false;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
  .digital-twin-modal {
    position: fixed;
    inset: 0;
    z-index: var(--z-tooltip);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
  }

  .digital-twin-modal.open {
    opacity: 1;
    pointer-events: auto;
  }

  .digital-twin-modal__backdrop {
    position: absolute;
    inset: 0;
    background: var(--backdrop-heavy, rgba(44, 37, 32, 0.6));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .digital-twin-modal__container {
    position: relative;
    width: min(90vw, 640px);
    max-height: 90vh;
    background: var(--color-background-elevated, #fffdfb);
    border-radius: var(--radius-2xl, 24px);
    box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.95) translateY(10px);
    transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
  }

  .digital-twin-modal.open .digital-twin-modal__container {
    transform: scale(1) translateY(0);
  }

  /* Header */
  .digital-twin-modal__header {
    padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    text-align: center;
    position: relative;
  }

  .digital-twin-modal__close {
    position: absolute;
    top: var(--space-4, 16px);
    right: var(--space-4, 16px);
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--color-text-muted, #7a6f63);
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-modal__close:hover {
    background: var(--color-background-hover, rgba(44, 37, 32, 0.05));
    color: var(--color-text-primary, #2c2520);
  }

  .digital-twin-modal__close svg {
    width: 20px;
    height: 20px;
  }

  .digital-twin-modal__eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-accent, #3d5a45);
    margin-bottom: var(--space-2, 8px);
  }

  .digital-twin-modal__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: clamp(24px, 4vw, 28px);
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    line-height: 1.2;
    margin: 0;
  }

  .digital-twin-modal__subtitle {
    font-size: 15px;
    color: var(--color-text-secondary, #5a5048);
    margin-top: var(--space-2, 8px);
    line-height: 1.5;
  }

  /* Content */
  .digital-twin-modal__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4, 16px) var(--space-6, 24px) var(--space-6, 24px);
  }

  /* Onboarding state - no twins yet */
  .digital-twin-onboarding {
    text-align: center;
    padding: var(--space-8, 32px) 0;
  }

  .digital-twin-onboarding__icon {
    width: 80px;
    height: 80px;
    margin: 0 auto var(--space-6, 24px);
    background: linear-gradient(135deg, var(--color-accent, #3d5a45), var(--color-ferni, #4a6741));
    border-radius: var(--radius-2xl, 24px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .digital-twin-onboarding__icon svg {
    width: 40px;
    height: 40px;
  }

  .digital-twin-onboarding__heading {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-3, 12px);
  }

  .digital-twin-onboarding__description {
    font-size: 15px;
    color: var(--color-text-secondary, #5a5048);
    line-height: 1.6;
    max-width: min(400px, 100%);
    margin: 0 auto var(--space-6, 24px);
  }

  /* Feature list */
  .digital-twin-features {
    display: grid;
    gap: var(--space-3, 12px);
    text-align: left;
    margin: var(--space-6, 24px) 0;
  }

  .digital-twin-feature {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px);
    background: var(--color-background-subtle, rgba(44, 37, 32, 0.03));
    border-radius: var(--radius-lg, 12px);
  }

  .digital-twin-feature__icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.1));
    color: var(--color-accent, #3d5a45);
    border-radius: var(--radius-md, 8px);
  }

  .digital-twin-feature__icon svg {
    width: 18px;
    height: 18px;
  }

  .digital-twin-feature__text h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-1, 4px);
  }

  .digital-twin-feature__text p {
    font-size: 13px;
    color: var(--color-text-secondary, #5a5048);
    margin: 0;
    line-height: 1.5;
  }

  /* Twin cards */
  .digital-twin-list {
    display: grid;
    gap: var(--space-3, 12px);
  }

  .digital-twin-card {
    display: flex;
    align-items: center;
    gap: var(--space-4, 16px);
    padding: var(--space-4, 16px);
    background: var(--color-background-elevated, #fffdfb);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-lg, 12px);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-card:hover {
    border-color: var(--color-accent, #3d5a45);
    box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
    transform: translateY(-2px);
  }

  .digital-twin-card__avatar {
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    background: linear-gradient(135deg, var(--color-accent, #3d5a45), var(--color-ferni, #4a6741));
    border-radius: var(--radius-lg, 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    position: relative;
  }

  .digital-twin-card__avatar > svg:first-child {
    width: 24px;
    height: 24px;
  }

  /* Streak badge */
  .digital-twin-card__streak {
    position: absolute;
    bottom: -6px;
    right: -6px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
    background: linear-gradient(135deg, #f59e0b, #ea580c);
    color: white;
    font-size: 11px;
    font-weight: 700;
    border-radius: var(--radius-full, 9999px);
    box-shadow: 0 2px 4px rgba(234, 88, 12, 0.3);
    white-space: nowrap;
  }

  .digital-twin-card__streak svg {
    width: 12px;
    height: 12px;
  }

  .digital-twin-card__info {
    flex: 1;
    min-width: 0;
  }

  .digital-twin-card__name {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-1, 4px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .digital-twin-card__meta {
    font-size: 13px;
    color: var(--color-text-muted, #7a6f63);
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
  }

  .digital-twin-card__stat {
    display: flex;
    align-items: center;
    gap: var(--space-1, 4px);
  }

  .digital-twin-card__stat svg {
    width: 14px;
    height: 14px;
  }

  .digital-twin-card__action {
    flex-shrink: 0;
    color: var(--color-accent, #3d5a45);
  }

  .digital-twin-card__action svg {
    width: 20px;
    height: 20px;
  }

  /* Create button */
  .digital-twin-create-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    padding: var(--space-4, 16px) var(--space-6, 24px);
    background: linear-gradient(135deg, var(--color-accent, #3d5a45), var(--color-ferni, #4a6741));
    color: white;
    font-size: 15px;
    font-weight: 600;
    border: none;
    border-radius: var(--radius-lg, 12px);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-create-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px -4px var(--color-accent-glow, rgba(61, 90, 69, 0.4));
  }

  .digital-twin-create-btn svg {
    width: 18px;
    height: 18px;
  }

  /* Add new twin button (when twins exist) */
  .digital-twin-add-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px);
    background: transparent;
    color: var(--color-accent, #3d5a45);
    font-size: 14px;
    font-weight: 500;
    border: 1px dashed var(--color-accent, #3d5a45);
    border-radius: var(--radius-lg, 12px);
    cursor: pointer;
    margin-top: var(--space-3, 12px);
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-add-btn:hover {
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.1));
  }

  .digital-twin-add-btn svg {
    width: 16px;
    height: 16px;
  }

  /* Section headers */
  .digital-twin-section-header {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-text-muted, #7a6f63);
    margin-bottom: var(--space-3, 12px);
    padding-left: var(--space-1, 4px);
  }

  /* Auto-capture card */
  .digital-twin-capture-card {
    background: var(--color-background-subtle, rgba(44, 37, 32, 0.03));
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-4, 16px);
    margin-bottom: var(--space-4, 16px);
  }

  .digital-twin-capture-card--enabled {
    background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
    border-color: var(--color-accent, #3d5a45);
  }

  .digital-twin-capture-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2, 8px);
  }

  .digital-twin-capture-title {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .digital-twin-capture-title svg {
    width: 18px;
    height: 18px;
    color: var(--color-accent, #3d5a45);
  }

  .digital-twin-capture-title h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0;
  }

  .digital-twin-capture-description {
    font-size: 13px;
    color: var(--color-text-secondary, #5a5048);
    line-height: 1.5;
    margin: 0;
  }

  /* Toggle switch */
  .digital-twin-toggle {
    position: relative;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .digital-twin-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .digital-twin-toggle-track {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: var(--color-border-subtle, rgba(44, 37, 32, 0.2));
    border-radius: var(--radius-full, 9999px);
    transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-toggle-track::before {
    content: '';
    position: absolute;
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background: white;
    border-radius: 50%;
    transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .digital-twin-toggle input:checked + .digital-twin-toggle-track {
    background: var(--color-accent, #3d5a45);
  }

  .digital-twin-toggle input:checked + .digital-twin-toggle-track::before {
    transform: translateX(20px);
  }

  .digital-twin-toggle input:focus-visible + .digital-twin-toggle-track {
    outline: 2px solid var(--color-accent, #3d5a45);
    outline-offset: 2px;
  }

  /* Consent card (first-time setup) */
  .digital-twin-consent {
    background: linear-gradient(135deg, var(--color-accent-subtle, rgba(61, 90, 69, 0.1)), transparent);
    border: 1px solid var(--color-accent, #3d5a45);
    border-radius: var(--radius-lg, 12px);
    padding: var(--space-5, 20px);
    margin-bottom: var(--space-4, 16px);
    text-align: center;
  }

  .digital-twin-consent__icon {
    width: 48px;
    height: 48px;
    margin: 0 auto var(--space-3, 12px);
    background: var(--color-accent, #3d5a45);
    border-radius: var(--radius-lg, 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .digital-twin-consent__icon svg {
    width: 24px;
    height: 24px;
  }

  .digital-twin-consent h4 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary, #2c2520);
    margin: 0 0 var(--space-2, 8px);
  }

  .digital-twin-consent p {
    font-size: 14px;
    color: var(--color-text-secondary, #5a5048);
    line-height: 1.6;
    margin: 0 0 var(--space-4, 16px);
    max-width: min(320px, 100%);
    margin-left: auto;
    margin-right: auto;
  }

  .digital-twin-consent__btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px) var(--space-5, 20px);
    background: var(--color-accent, #3d5a45);
    color: white;
    font-size: 14px;
    font-weight: 600;
    border: none;
    border-radius: var(--radius-full, 9999px);
    cursor: pointer;
    transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
  }

  .digital-twin-consent__btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px var(--color-accent-glow, rgba(61, 90, 69, 0.3));
  }

  .digital-twin-consent__btn svg {
    width: 16px;
    height: 16px;
  }

  .digital-twin-consent__skip {
    display: block;
    margin-top: var(--space-3, 12px);
    font-size: 13px;
    color: var(--color-text-muted, #7a6f63);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .digital-twin-consent__skip:hover {
    color: var(--color-text-secondary, #5a5048);
  }

  /* Loading state */
  .digital-twin-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12, 48px) 0;
    gap: var(--space-3, 12px);
    color: var(--color-text-muted, #7a6f63);
  }

  .digital-twin-loading__spinner {
    width: 32px;
    height: 32px;
    border: 2px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    border-top-color: var(--color-accent, #3d5a45);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Dark theme overrides */
  [data-theme="dark"] .digital-twin-modal__container,
  [data-theme="zen"] .digital-twin-modal__container {
    background: var(--color-background-elevated, #3a3530);
  }

  [data-theme="dark"] .digital-twin-card,
  [data-theme="zen"] .digital-twin-card {
    background: var(--color-background-subtle, rgba(255, 255, 255, 0.05));
    border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.1));
  }

  [data-theme="dark"] .digital-twin-card:hover,
  [data-theme="zen"] .digital-twin-card:hover {
    border-color: var(--color-accent, #5a8a62);
  }

  [data-theme="dark"] .digital-twin-feature,
  [data-theme="zen"] .digital-twin-feature {
    background: var(--color-background-subtle, rgba(255, 255, 255, 0.05));
  }

  /* Responsive */
  @media (max-width: clamp(336px, 90vw, 480px)) {
    .digital-twin-modal__container {
      width: 100%;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }

    .digital-twin-features {
      gap: var(--space-2, 8px);
    }

    .digital-twin-feature {
      padding: var(--space-3, 12px);
    }
  }
`;

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderOnboarding(): string {
  return `
    <div class="digital-twin-onboarding">
      <div class="digital-twin-onboarding__icon">
        ${ICONS.journal}
      </div>
      <h3 class="digital-twin-onboarding__heading">Your Voice, Your Story</h3>
      <p class="digital-twin-onboarding__description">
        A Digital Twin is your personal voice journal. Record your thoughts, 
        capture your wisdom, and one day, talk to your past self.
      </p>

      <div class="digital-twin-features">
        <div class="digital-twin-feature">
          <div class="digital-twin-feature__icon">${ICONS.voice}</div>
          <div class="digital-twin-feature__text">
            <h4>Record Daily Journals</h4>
            <p>Speak your thoughts aloud. Your voice captures nuance that text never could.</p>
          </div>
        </div>
        <div class="digital-twin-feature">
          <div class="digital-twin-feature__icon">${ICONS.time}</div>
          <div class="digital-twin-feature__text">
            <h4>Talk to Your Past Self</h4>
            <p>Your entries become a conversation partner, reflecting your growth over time.</p>
          </div>
        </div>
        <div class="digital-twin-feature">
          <div class="digital-twin-feature__icon">${ICONS.sparkle}</div>
          <div class="digital-twin-feature__text">
            <h4>Discover Patterns</h4>
            <p>See trends in your moods, track streaks, and gain insights from your own wisdom.</p>
          </div>
        </div>
      </div>

      <button aria-label="Add" class="digital-twin-create-btn" data-action="create">
        ${ICONS.plus}
        Create Your Digital Twin
      </button>
    </div>
  `;
}

function renderTwinsList(): string {
  const twinCards = twins
    .map((twin) => {
      // Calculate entry count from journal entries
      const journalEntries = twin.memories?.journalEntries || [];
      const entryCount = journalEntries.length;
      
      // Calculate streak
      const streak = calculateStreak(journalEntries);
      
      // Find most recent entry date
      const lastEntryDate = journalEntries.length > 0
        ? journalEntries
            .map(e => new Date(e.createdAt))
            .sort((a, b) => b.getTime() - a.getTime())[0]
        : null;
      const lastEntry = lastEntryDate
        ? formatRelativeDate(lastEntryDate)
        : 'No entries yet';

      // Streak badge (only show if streak > 0)
      const streakBadge = streak > 0
        ? `<span class="digital-twin-card__streak" title="${streak} day streak">
             ${ICONS.flame}
             ${streak}
           </span>`
        : '';

      return `
        <button aria-label="Go forward" class="digital-twin-card" data-twin-id="${twin.id}">
          <div class="digital-twin-card__avatar">
            ${ICONS.journal}
            ${streakBadge}
          </div>
          <div class="digital-twin-card__info">
            <h4 class="digital-twin-card__name">${twin.displayName || twin.name}</h4>
            <div class="digital-twin-card__meta">
              <span class="digital-twin-card__stat">
                ${ICONS.memories}
                ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}
              </span>
              <span class="digital-twin-card__stat">
                ${ICONS.calendar}
                ${lastEntry}
              </span>
            </div>
          </div>
          <div class="digital-twin-card__action" role="button" tabindex="0">
            ${ICONS.chevronRight}
          </div>
        </button>
      `;
    })
    .join('');

  return `
    ${renderAutoCaptureCard()}
    <div class="digital-twin-section-header">Your Journals</div>
    <div class="digital-twin-list">
      ${twinCards}
    </div>
    <button aria-label="Add" class="digital-twin-add-btn" data-action="create">
      ${ICONS.plus}
      Create Another Journal
    </button>
  `;
}

/**
 * Render the auto-capture toggle card
 * Shows consent prompt if never enabled, or toggle if already set up
 */
function renderAutoCaptureCard(): string {
  const settings = loadCaptureSettings();
  const hasConsented = settings.consentDate != null;
  const isEnabled = settings.enabled;

  // First-time consent flow
  if (!hasConsented) {
    return `
      <div class="digital-twin-consent">
        <div class="digital-twin-consent__icon">
          ${ICONS.capture}
        </div>
        <h4>Capture Moments Automatically</h4>
        <p>
          I can remember the meaningful moments from our conversations - 
          breakthroughs, decisions, gratitude - and add them to your journal. 
          You're always in control.
        </p>
        <button aria-label="Confirm" class="digital-twin-consent__btn" data-action="enable-capture">
          ${ICONS.check}
          Yes, remember what matters
        </button>
        <button aria-label="Maybe later" class="digital-twin-consent__skip" data-action="skip-capture">
          Maybe later
        </button>
      </div>
    `;
  }

  // Toggle card (after consent)
  return `
    <div class="digital-twin-capture-card ${isEnabled ? 'digital-twin-capture-card--enabled' : ''}">
      <div class="digital-twin-capture-header">
        <div class="digital-twin-capture-title">
          ${ICONS.capture}
          <h4>Auto-Capture Moments</h4>
        </div>
        <label class="digital-twin-toggle">
          <input type="checkbox" ${isEnabled ? 'checked' : ''} data-action="toggle-capture" />
          <span class="digital-twin-toggle-track" role="button" tabindex="0"></span>
        </label>
      </div>
      <p class="digital-twin-capture-description">
        ${isEnabled 
          ? "I'm listening for meaningful moments in our conversations and adding them to your journal."
          : "When enabled, I'll capture breakthroughs, decisions, and insights from our chats."
        }
      </p>
    </div>
  `;
}

function renderLoading(): string {
  return `
    <div class="digital-twin-loading">
      <div class="digital-twin-loading__spinner"></div>
      <span>Loading your journals...</span>
    </div>
  `;
}

function renderContent(): string {
  if (isLoading) {
    return renderLoading();
  }

  if (twins.length === 0) {
    return renderOnboarding();
  }

  return renderTwinsList();
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Calculate journaling streak from entries
 * A streak is consecutive days with at least one entry
 */
function calculateStreak(entries: Array<{ createdAt: string }>): number {
  if (entries.length === 0) return 0;

  // Get unique dates (normalized to day start)
  const entryDates = entries
    .map((e) => {
      const d = new Date(e.createdAt);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    })
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .sort((a, b) => b - a); // newest first

  if (entryDates.length === 0) return 0;

  const today = new Date();
  const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterday = todayNormalized - 24 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Check if most recent entry is today or yesterday (streak is active)
  const mostRecent = entryDates[0];
  if (mostRecent !== todayNormalized && mostRecent !== yesterday) {
    return 0; // Streak broken
  }

  // Count consecutive days
  let streak = 1;
  let currentDate = mostRecent;

  for (let i = 1; i < entryDates.length; i++) {
    const expectedPrev = currentDate - oneDayMs;
    if (entryDates[i] === expectedPrev) {
      streak++;
      currentDate = entryDates[i];
    } else {
      break; // Gap found, streak ends
    }
  }

  return streak;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

// ============================================================================
// MODAL MANAGEMENT
// ============================================================================

function ensureModalExists(): HTMLElement {
  if (modal) return modal;

  // Inject styles
  if (!document.getElementById('digital-twin-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'digital-twin-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // Create modal
  modal = document.createElement('div');
  modal.className = 'digital-twin-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'digital-twin-title');

  modal.innerHTML = `
    <div class="digital-twin-modal__backdrop"></div>
    <div class="digital-twin-modal__container">
      <header class="digital-twin-modal__header">
        <button class="digital-twin-modal__close" aria-label="Close">
          ${ICONS.close}
        </button>
        <div class="digital-twin-modal__eyebrow">Your Journey</div>
        <h2 class="digital-twin-modal__title" id="digital-twin-title">Voice Journal</h2>
        <p class="digital-twin-modal__subtitle">Capture your thoughts, wisdom, and growth</p>
      </header>
      <div class="digital-twin-modal__content">
        ${renderContent()}
      </div>
    </div>
  `;

  // Event listeners
  const backdrop = modal.querySelector('.digital-twin-modal__backdrop');
  const closeBtn = modal.querySelector('.digital-twin-modal__close');

  backdrop?.addEventListener('click', closeDigitalTwinUI);
  closeBtn?.addEventListener('click', closeDigitalTwinUI);

  // Close on Escape
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDigitalTwinUI();
  });

  // Delegate click events
  modal.addEventListener('click', handleClick);

  document.body.appendChild(modal);
  return modal;
}

function updateContent(): void {
  if (!modal) return;

  const content = modal.querySelector('.digital-twin-modal__content');
  if (content) {
    content.innerHTML = renderContent();
  }
}

async function handleClick(e: Event): Promise<void> {
  const target = e.target as HTMLElement;

  // Create new twin
  const createBtn = target.closest('[data-action="create"]');
  if (createBtn) {
    e.preventDefault();
    closeDigitalTwinUI();
    // Open wizard pre-configured for Digital Twin
    openCustomAgentWizard({ preselectedType: 'twin' });
    return;
  }

  // Enable auto-capture (consent)
  const enableCaptureBtn = target.closest('[data-action="enable-capture"]');
  if (enableCaptureBtn) {
    e.preventDefault();
    enableJournalCapture();
    updateContent();
    soundUI.play('success');
    
    // Show confirmation toast
    const { toast } = await import('./toast.ui.js');
    toast.success("I'll remember what matters");
    return;
  }

  // Skip auto-capture consent
  const skipCaptureBtn = target.closest('[data-action="skip-capture"]');
  if (skipCaptureBtn) {
    e.preventDefault();
    // Mark as seen but not enabled (so we don't show consent again)
    const settings = loadCaptureSettings();
    settings.consentDate = new Date().toISOString();
    settings.enabled = false;
    saveCaptureSettings(settings);
    updateContent();
    return;
  }

  // Toggle auto-capture
  const toggleCapture = target.closest('[data-action="toggle-capture"]') as HTMLInputElement | null;
  if (toggleCapture) {
    const isEnabled = toggleCapture.checked;
    if (isEnabled) {
      enableJournalCapture();
    } else {
      disableJournalCapture();
    }
    updateContent();
    soundUI.play('click');
    return;
  }

  // Open existing twin's journal
  const twinCard = target.closest('[data-twin-id]') as HTMLElement | null;
  if (twinCard) {
    const twinId = twinCard.dataset.twinId;
    if (twinId) {
      e.preventDefault();
      closeDigitalTwinUI();
      await openVoiceJournal(twinId);
    }
    return;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Digital Twin experience
 * Shows existing twins or onboarding if none exist
 */
export async function openDigitalTwinUI(): Promise<void> {
  const modalEl = ensureModalExists();

  // Show loading state
  isLoading = true;
  updateContent();

  // Show modal
  modalEl.classList.add('open');
  document.body.style.overflow = 'hidden';
  soundUI.play('switch');

  try {
    // Load user's Digital Twins
    const agents = await listCustomAgents();
    twins = agents.filter((a) => a.type === 'twin');
    isLoading = false;
    updateContent();

    log.info(`Loaded ${twins.length} Digital Twins`);
  } catch (error) {
    log.error('Failed to load Digital Twins:', error);
    isLoading = false;
    twins = [];
    updateContent();

    const { toast } = await import('./toast.ui.js');
    toast.error('Could not load your journals');
  }
}

/**
 * Close the Digital Twin UI
 */
export function closeDigitalTwinUI(): void {
  if (!modal) return;

  modal.classList.remove('open');
  document.body.style.overflow = '';
  soundUI.play('switch');

  // Reset state
  twins = [];
  isLoading = false;
}

/**
 * Check if the Digital Twin UI is open
 */
export function isDigitalTwinUIOpen(): boolean {
  return modal?.classList.contains('open') ?? false;
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

let keyboardShortcutInitialized = false;

/**
 * Initialize keyboard shortcut for quick access to journaling
 * Cmd+J (Mac) / Ctrl+J (Windows/Linux) opens the journal
 */
export function initJournalingShortcut(): void {
  if (keyboardShortcutInitialized) return;
  keyboardShortcutInitialized = true;

  document.addEventListener('keydown', (e) => {
    // Cmd+J (Mac) or Ctrl+J (Windows/Linux)
    // Don't trigger if user is typing in an input field
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyJ' && !isTyping) {
      e.preventDefault();
      
      // Toggle: if open, close; if closed, open
      if (isDigitalTwinUIOpen()) {
        closeDigitalTwinUI();
      } else {
        void openDigitalTwinUI();
      }
    }
  });

  log.info('Journaling shortcut initialized (Cmd/Ctrl+J to open)');
}

// ============================================================================
// AUTO-CLEANUP ON HMR
// ============================================================================

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    modal?.remove();
    modal = null;
    keyboardShortcutInitialized = false;
    document.getElementById('digital-twin-styles')?.remove();
  });
}

