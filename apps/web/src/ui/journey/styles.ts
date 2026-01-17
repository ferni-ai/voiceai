/**
 * Journey UI Styles
 *
 * All CSS for the Your Journey modal, extracted for maintainability.
 * Follows Ferni brand guidelines: warm colors, centered modals, backdrop blur.
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

const STYLE_ID = 'journey-ui-styles';

export function injectJourneyStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = getJourneyStyles();
  document.head.appendChild(style);
}

export function removeJourneyStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function getJourneyStyles(): string {
  return `
    /* ===================================================================
       JOURNEY MODAL - Base Structure
       =================================================================== */
    .journey-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 10000);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
    }

    .journey-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .journey-content {
      position: relative;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      max-width: clamp(420px, 90vw, 600px);
      width: 100%;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ===================================================================
       HEADER
       =================================================================== */
    .journey-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
    }

    .journey-header__text {
      flex: 1;
    }

    .journey-eyebrow {
      display: block;
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 4px);
    }

    .journey-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 1.5rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
      line-height: 1.2;
    }

    .journey-subtitle {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin: var(--space-2, 8px) 0 0;
    }

    .journey-close {
      background: none;
      border: none;
      padding: var(--space-2, 8px);
      margin: calc(var(--space-2, 8px) * -1);
      cursor: pointer;
      color: var(--color-text-muted, #70605a);
      border-radius: var(--radius-full, 9999px);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .journey-close:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
      color: var(--color-text-primary, #2c2520);
    }
    
    .journey-close:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    .journey-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4, 16px) var(--space-6, 24px);
    }

    /* ===================================================================
       JOURNEY MAP - Horizontal Visual Path (Better than Apple)
       Shows all relationship stages with "You are here" indicator
       =================================================================== */
    .journey-map-section {
      padding: 0 var(--space-4, 16px) var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .journey-map {
      padding: var(--space-2, 8px) 0;
    }

    .journey-map__path {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0;
      overflow-x: auto;
      padding: var(--space-2, 8px) var(--space-1, 4px);
      scrollbar-width: none;
    }

    .journey-map__path::-webkit-scrollbar {
      display: none;
    }

    .journey-map__stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
      cursor: pointer;
      padding: var(--space-1, 4px);
      transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .journey-map__stage:hover {
      transform: translateY(-2px);
    }

    .journey-map__stage:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 4px;
      border-radius: var(--radius-sm, 4px);
    }

    /* Node - the circular indicator for each stage */
    .journey-map__node {
      position: relative;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--color-background-elevated, #fffdfb);
      border: 2px solid var(--color-border, rgba(0, 0, 0, 0.15));
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .journey-map__node-inner {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-border-subtle, rgba(0, 0, 0, 0.1));
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    /* Past stages - completed and filled */
    .journey-map__stage--past .journey-map__node {
      border-color: var(--persona-primary, #4a6741);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
    }

    .journey-map__stage--past .journey-map__node-inner {
      background: var(--persona-primary, #4a6741);
    }

    /* Current stage - active with pulsing glow */
    .journey-map__stage--current .journey-map__node {
      border-color: var(--persona-primary, #4a6741);
      border-width: 3px;
      background: var(--color-background-elevated, #fffdfb);
      box-shadow: 0 0 0 4px var(--persona-tint, rgba(74, 103, 65, 0.15));
    }

    .journey-map__stage--current .journey-map__node-inner {
      background: var(--persona-primary, #4a6741);
      animation: journeyNodePulse 2s ease-in-out infinite;
    }

    /* Future stages - muted and waiting */
    .journey-map__stage--future .journey-map__node {
      border-color: var(--color-border-subtle, rgba(0, 0, 0, 0.1));
      opacity: 0.6;
    }

    .journey-map__stage--future .journey-map__node-inner {
      background: transparent;
    }

    /* Pulse animation for current stage */
    .journey-map__pulse {
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      background: var(--persona-tint, rgba(74, 103, 65, 0.2));
      animation: journeyPulse 2s ease-in-out infinite;
    }

    @keyframes journeyPulse {
      0%, 100% {
        transform: scale(1);
        opacity: 0.4;
      }
      50% {
        transform: scale(1.2);
        opacity: 0.1;
      }
    }

    @keyframes journeyNodePulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.1);
      }
    }

    /* Stage labels */
    .journey-map__label {
      font-size: var(--text-2xs, 9px);
      font-weight: 500;
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-2, 8px);
      text-align: center;
      max-width: 60px;
      line-height: 1.2;
      transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .journey-map__stage--current .journey-map__label {
      color: var(--color-text-primary, #2c2520);
      font-weight: 600;
    }

    .journey-map__stage--future .journey-map__label {
      opacity: 0.6;
    }

    /* "You are here" indicator */
    .journey-map__here {
      font-size: var(--text-2xs, 9px);
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
      margin-top: var(--space-1, 4px);
    }

    /* Connectors between stages */
    .journey-map__connector {
      flex: 1;
      height: 2px;
      background: var(--color-border, rgba(0, 0, 0, 0.1));
      margin-top: 13px;
      position: relative;
      min-width: 20px;
      overflow: hidden;
    }

    .journey-map__connector-fill {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: var(--fill-progress, 0%);
      background: var(--persona-primary, #4a6741);
      transition: width ${DURATION.DRAMATIC}ms ${EASING.SPRING};
    }

    .journey-map__connector--filled .journey-map__connector-fill {
      width: 100%;
    }

    /* Hint text */
    .journey-map__hint {
      font-size: var(--text-xs, 11px);
      color: var(--color-text-muted, #70605a);
      text-align: center;
      margin: var(--space-3, 12px) 0 0;
      font-style: italic;
    }

    /* Mobile responsive */
    @media (max-width: 480px) {
      .journey-map__path {
        padding: var(--space-2, 8px);
        gap: 0;
      }
      
      .journey-map__label {
        font-size: 8px;
        max-width: 50px;
      }
      
      .journey-map__node {
        width: 24px;
        height: 24px;
      }
      
      .journey-map__node-inner {
        width: 10px;
        height: 10px;
      }
      
      .journey-map__connector {
        margin-top: 11px;
        min-width: 12px;
      }
    }

    /* ===================================================================
       PROGRESS OVERVIEW
       =================================================================== */
    .journey-progress-overview {
      text-align: center;
      padding-bottom: var(--space-4, 16px);
      margin-bottom: var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
    }

    .journey-progress-ring-container {
      position: relative;
      width: 100px;
      height: 100px;
      margin: 0 auto var(--space-3, 12px);
    }

    .journey-progress-ring {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .journey-progress-ring__bg {
      fill: none;
      stroke: var(--color-background-subtle, rgba(0, 0, 0, 0.08));
      stroke-width: 7;
    }

    .journey-progress-ring__fill {
      fill: none;
      stroke: var(--persona-primary, #4a6741);
      stroke-width: 7;
      stroke-linecap: round;
      transition: stroke-dashoffset ${DURATION.DRAMATIC}ms ${EASING.SPRING};
    }

    .journey-progress-ring__text {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .journey-progress-ring__percent {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      line-height: 1;
    }

    .journey-progress-ring__label {
      font-size: 11px;
      color: var(--color-text-muted, #70605a);
      margin-top: 2px;
    }

    .journey-stage-name {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 1.125rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-1, 4px);
    }

    .journey-stage-tagline {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4d47);
      margin: 0 0 var(--space-1, 4px);
    }

    .journey-stage-description {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin: 0 0 var(--space-4, 16px);
      font-style: italic;
      line-height: 1.5;
    }

    .journey-stats-row {
      display: flex;
      justify-content: center;
      gap: var(--space-5, 20px);
      margin-bottom: var(--space-3, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-lg, 12px);
    }

    .journey-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .journey-stat__icon {
      color: var(--color-text-muted, #70605a);
      margin-bottom: 2px;
    }

    .journey-stat__icon svg {
      width: 18px;
      height: 18px;
    }

    .journey-stat__value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 1rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      line-height: 1;
    }

    .journey-stat__label {
      font-size: 11px;
      color: var(--color-text-muted, #70605a);
      text-align: center;
    }
    
    /* Voice ID stat specific styles */
    .journey-stat--voice-id {
      cursor: help;
    }
    
    .journey-stat__value--loading {
      color: var(--color-text-muted, #70605a);
      font-size: var(--text-sm, 0.875rem);
    }
    
    .journey-stat__value--enrolled {
      color: var(--persona-primary, #4a6741);
    }

    .journey-next-stage {
      background: var(--persona-tint, rgba(74, 103, 65, 0.08));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      text-align: center;
    }

    .journey-next-stage__label {
      display: block;
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
    }

    .journey-next-stage__req {
      display: block;
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-1, 4px);
      line-height: 1.4;
    }

    .journey-next-stage--max {
      background: linear-gradient(135deg, 
        color-mix(in srgb, var(--persona-primary) 10%, transparent) 0%,
        color-mix(in srgb, var(--persona-primary) 4%, transparent) 100%
      );
    }

    .journey-next-stage__icon {
      display: inline-block;
      width: 14px;
      height: 14px;
      vertical-align: middle;
      margin-left: var(--space-1, 4px);
      color: var(--persona-primary, #4a6741);
    }

    .journey-next-stage__icon svg {
      width: 100%;
      height: 100%;
    }

    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .journey-next-stage--max {
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.1) 0%, rgba(74, 103, 65, 0.04) 100%);
      }
    }

    /* ===================================================================
       MILESTONES SECTION (Collapsible)
       =================================================================== */
    .journey-milestones-section {
      margin-top: var(--space-4, 16px);
    }

    .journey-milestones-header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px);
      margin: 0 calc(var(--space-3, 12px) * -1);
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .journey-milestones-header:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.03));
    }

    .journey-milestones-header:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    .journey-milestones-title {
      flex: 1;
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
    }

    .journey-milestones-count {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.05));
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-full, 9999px);
    }

    .journey-milestones-toggle {
      color: var(--color-text-muted, #70605a);
      transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .journey-milestones-header.collapsed .journey-milestones-toggle {
      transform: rotate(-90deg);
    }

    .journey-milestones-body {
      max-height: 2000px;
      overflow: hidden;
      transition: max-height ${DURATION.MODERATE}ms ${EASING.STANDARD},
                  opacity ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .journey-milestones-body.collapsed {
      max-height: 0;
      opacity: 0.5;
    }

    .journey-category {
      margin-bottom: var(--space-6, 24px);
    }

    .journey-category:last-child {
      margin-bottom: 0;
    }

    .journey-category__header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .journey-category__icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .journey-category__title {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
      flex: 1;
    }

    .journey-category__count {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.05));
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-full, 9999px);
    }

    .journey-category__items {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    /* ===================================================================
       MILESTONE ITEMS
       =================================================================== */
    .journey-milestone {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.02));
      border-radius: var(--radius-lg, 12px);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .journey-milestone--celebrated {
      background: var(--milestone-bg-celebrated, linear-gradient(135deg, 
        color-mix(in srgb, var(--persona-primary, #4a6741) 8%, transparent) 0%,
        color-mix(in srgb, var(--persona-primary, #4a6741) 2%, transparent) 100%
      ));
      border: 1px solid var(--milestone-border-celebrated, color-mix(in srgb, var(--persona-primary, #4a6741) 15%, transparent));
    }
    
    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .journey-milestone--celebrated {
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.08) 0%, rgba(74, 103, 65, 0.02) 100%);
        border-color: rgba(74, 103, 65, 0.15);
      }
    }

    .journey-milestone--locked {
      opacity: 0.7;
    }

    .journey-milestone__status {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-elevated, #fff);
      border: 2px solid var(--milestone-color, var(--persona-primary));
      color: var(--milestone-color, var(--persona-primary));
    }

    .journey-milestone--locked .journey-milestone__status {
      border-color: var(--color-text-muted, #70605a);
      color: var(--color-text-muted, #70605a);
      opacity: 0.5;
    }

    .journey-milestone__content {
      flex: 1;
      min-width: 0;
    }

    .journey-milestone__name {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
    }

    .journey-milestone--locked .journey-milestone__name {
      color: var(--color-text-muted, #70605a);
    }

    .journey-milestone__message {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4d47);
      margin: var(--space-1, 4px) 0 0;
      line-height: 1.4;
    }

    .journey-milestone--locked .journey-milestone__message {
      font-style: italic;
      color: var(--color-text-muted, #70605a);
    }

    .journey-milestone__progress {
      position: relative;
      height: 4px;
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-full, 9999px);
      margin-top: var(--space-2, 8px);
      overflow: hidden;
    }

    .journey-milestone__progress-bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: var(--milestone-color, var(--persona-primary));
      border-radius: var(--radius-full, 9999px);
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .journey-milestone__progress-text {
      position: absolute;
      right: 0;
      top: calc(100% + 4px);
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .journey-milestone__date {
      display: block;
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    /* ===================================================================
       POLAROID SCRAPBOOK - Visual Milestone Cards (Better than Google)
       Celebrates achievements with warmth, invites discovery for locked ones
       =================================================================== */
    .journey-scrapbook {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: var(--space-3, 12px);
      padding: var(--space-2, 8px);
    }

    .journey-polaroid {
      background: var(--color-background-elevated, #fffdfb);
      border-radius: var(--radius-md, 8px);
      padding: var(--space-2, 8px);
      box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.08));
      transform: rotate(var(--rotate, 0deg));
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
      cursor: pointer;
    }

    .journey-polaroid:hover {
      transform: rotate(0deg) scale(1.05);
      box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.12));
      z-index: 1;
    }

    .journey-polaroid:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    /* Polaroid image area */
    .journey-polaroid__image {
      aspect-ratio: 1;
      background: linear-gradient(135deg, 
        var(--milestone-color, var(--persona-primary, #4a6741)) 0%,
        color-mix(in srgb, var(--milestone-color, var(--persona-primary, #4a6741)) 70%, black) 100%
      );
      border-radius: var(--radius-sm, 4px);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }

    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .journey-polaroid__image {
        background: linear-gradient(135deg, var(--milestone-color, #4a6741) 0%, #3d5a35 100%);
      }
    }

    /* Mystery image for locked milestones */
    .journey-polaroid__image--mystery {
      background: linear-gradient(135deg, 
        var(--color-text-muted, #70605a) 0%,
        var(--color-background-subtle, rgba(0, 0, 0, 0.2)) 100%
      );
    }

    /* Glow effect for celebrated */
    .journey-polaroid__glow {
      position: absolute;
      inset: -20%;
      background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4) 0%, transparent 60%);
      opacity: 0.6;
    }

    .journey-polaroid__emoji {
      font-size: 28px;
      line-height: 1;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
    }

    .journey-polaroid__mystery-icon {
      font-size: 24px;
      font-weight: 700;
      color: var(--color-text-muted, #a89d90);
      opacity: 0.6;
    }

    /* Caption area */
    .journey-polaroid__caption {
      padding-top: var(--space-2, 8px);
    }

    .journey-polaroid__title {
      display: block;
      font-size: var(--text-xs, 11px);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .journey-polaroid__message {
      font-size: var(--text-2xs, 9px);
      color: var(--color-text-secondary, #5a4d47);
      margin: var(--space-1, 4px) 0 0;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .journey-polaroid__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: var(--space-1, 4px);
      gap: var(--space-1, 4px);
    }

    .journey-polaroid__date {
      font-size: var(--text-2xs, 8px);
      color: var(--color-text-muted, #70605a);
    }

    .journey-polaroid__persona {
      font-size: var(--text-2xs, 8px);
      color: var(--persona-primary, #4a6741);
    }

    .journey-polaroid__hint {
      display: block;
      font-size: var(--text-2xs, 9px);
      color: var(--color-text-muted, #70605a);
      font-style: italic;
      margin-top: var(--space-1, 4px);
    }

    .journey-polaroid__progress {
      height: 3px;
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-full, 9999px);
      overflow: hidden;
      margin-top: var(--space-1, 4px);
    }

    .journey-polaroid__progress-fill {
      height: 100%;
      background: var(--milestone-color, var(--persona-primary, #4a6741));
      border-radius: inherit;
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    /* Locked polaroid - mysterious silhouette */
    .journey-polaroid--locked {
      opacity: 0.7;
    }

    .journey-polaroid--locked:hover {
      opacity: 0.85;
    }

    .journey-polaroid--locked .journey-polaroid__title {
      color: var(--color-text-muted, #70605a);
    }

    /* Celebrated polaroid - warm glow effect */
    .journey-polaroid--celebrated {
      box-shadow: 
        var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.08)),
        0 0 12px color-mix(in srgb, var(--milestone-color, var(--persona-primary, #4a6741)) 20%, transparent);
    }

    @supports not (box-shadow: 0 0 0 color-mix(in srgb, red 50%, blue)) {
      .journey-polaroid--celebrated {
        box-shadow: 
          0 2px 8px rgba(0, 0, 0, 0.08),
          0 0 12px rgba(74, 103, 65, 0.2);
      }
    }

    .journey-polaroid--celebrated:hover {
      box-shadow: 
        var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.12)),
        0 0 20px color-mix(in srgb, var(--milestone-color, var(--persona-primary, #4a6741)) 30%, transparent);
    }

    @supports not (box-shadow: 0 0 0 color-mix(in srgb, red 50%, blue)) {
      .journey-polaroid--celebrated:hover {
        box-shadow: 
          0 4px 16px rgba(0, 0, 0, 0.12),
          0 0 20px rgba(74, 103, 65, 0.3);
      }
    }

    /* Mobile responsive */
    @media (max-width: 480px) {
      .journey-scrapbook {
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-2, 8px);
      }
      
      .journey-polaroid {
        padding: var(--space-1-5, 6px);
      }
      
      .journey-polaroid__emoji {
        font-size: 20px;
      }
      
      .journey-polaroid__title {
        font-size: 9px;
      }
      
      .journey-polaroid__message {
        display: none;
      }
      margin-top: var(--space-2, 8px);
    }

    /* ===================================================================
       FOOTER
       =================================================================== */
    .journey-footer {
      padding: var(--space-4, 16px) var(--space-6, 24px);
      border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3, 12px);
    }

    .journey-footer p {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin: 0;
    }

    .journey-share {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-4, 16px);
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
      border-radius: var(--radius-full, 9999px);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .journey-share:hover {
      background: var(--persona-secondary, #3d5a35);
      transform: scale(1.02);
    }

    .journey-share:active {
      transform: scale(0.98);
    }
    
    .journey-share:focus-visible {
      outline: 2px solid var(--color-background-elevated, #fff);
      outline-offset: 2px;
    }

    .journey-share svg {
      width: 16px;
      height: 16px;
    }

    /* ===================================================================
       CONNECTION BANNER
       =================================================================== */
    .journey-connection {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      border-radius: var(--radius-xl, 16px);
      margin-bottom: var(--space-5, 20px);
      transition: all ${DURATION.SLOW}ms ${EASING.STANDARD};
    }

    .journey-connection__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .journey-connection__icon svg {
      width: 28px;
      height: 28px;
    }

    .journey-connection__icon--spin svg {
      animation: journey-spin 1.5s linear infinite;
    }

    @keyframes journey-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .journey-connection__content {
      flex: 1;
      min-width: 0;
    }

    .journey-connection__text {
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
    }

    .journey-connection__subtext {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4d47);
      margin: var(--space-1, 4px) 0 0;
    }

    /* Connected state - green, happy */
    .journey-connection--connected {
      background: var(--connection-bg-connected, linear-gradient(135deg,
        color-mix(in srgb, var(--persona-primary, #4a6741) 12%, transparent) 0%,
        color-mix(in srgb, var(--persona-primary, #4a6741) 4%, transparent) 100%
      ));
      border: 1px solid var(--connection-border-connected, color-mix(in srgb, var(--persona-primary, #4a6741) 25%, transparent));
    }
    
    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .journey-connection--connected {
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.12) 0%, rgba(74, 103, 65, 0.04) 100%);
        border-color: rgba(74, 103, 65, 0.25);
      }
    }

    .journey-connection--connected .journey-connection__icon {
      color: var(--persona-primary, #4a6741);
    }

    .journey-connection--connected .journey-connection__text {
      color: var(--persona-primary, #4a6741);
    }

    /* Connecting state - amber/warm */
    .journey-connection--connecting {
      background: var(--connection-bg-connecting, linear-gradient(135deg,
        color-mix(in srgb, var(--color-warning, #d4a574) 12%, transparent) 0%,
        color-mix(in srgb, var(--color-warning, #d4a574) 4%, transparent) 100%
      ));
      border: 1px solid var(--connection-border-connecting, color-mix(in srgb, var(--color-warning, #d4a574) 25%, transparent));
    }
    
    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .journey-connection--connecting {
        background: linear-gradient(135deg, rgba(212, 165, 116, 0.12) 0%, rgba(212, 165, 116, 0.04) 100%);
        border-color: rgba(212, 165, 116, 0.25);
      }
    }

    .journey-connection--connecting .journey-connection__icon {
      color: var(--color-warning, #d4a574);
    }

    .journey-connection--connecting .journey-connection__text {
      color: var(--color-warning-dark, #b8864e);
    }

    /* Disconnected state - muted gray */
    .journey-connection--disconnected {
      background: var(--connection-bg-disconnected, linear-gradient(135deg,
        color-mix(in srgb, var(--color-text-muted, #70605a) 8%, transparent) 0%,
        color-mix(in srgb, var(--color-text-muted, #70605a) 2%, transparent) 100%
      ));
      border: 1px solid var(--connection-border-disconnected, color-mix(in srgb, var(--color-text-muted, #70605a) 15%, transparent));
    }
    
    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .journey-connection--disconnected {
        background: linear-gradient(135deg, rgba(112, 96, 90, 0.08) 0%, rgba(112, 96, 90, 0.02) 100%);
        border-color: rgba(112, 96, 90, 0.15);
      }
    }

    .journey-connection--disconnected .journey-connection__icon {
      color: var(--color-text-muted, #9a8a82);
    }

    /* Error state - red, but not alarming */
    .journey-connection--error {
      background: var(--connection-bg-error, linear-gradient(135deg,
        color-mix(in srgb, var(--color-error, #c44b4b) 8%, transparent) 0%,
        color-mix(in srgb, var(--color-error, #c44b4b) 2%, transparent) 100%
      ));
      border: 1px solid var(--connection-border-error, color-mix(in srgb, var(--color-error, #c44b4b) 20%, transparent));
    }
    
    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .journey-connection--error {
        background: linear-gradient(135deg, rgba(196, 75, 75, 0.08) 0%, rgba(196, 75, 75, 0.02) 100%);
        border-color: rgba(196, 75, 75, 0.2);
      }
    }

    .journey-connection--error .journey-connection__icon {
      color: var(--color-error, #c44b4b);
    }

    .journey-connection--error .journey-connection__text {
      color: var(--color-error, #c44b4b);
    }

    /* Connect button */
    .journey-connect-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px) var(--space-5, 20px);
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
      border-radius: var(--radius-full, 9999px);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      flex-shrink: 0;
    }

    .journey-connect-btn:hover {
      background: var(--persona-secondary, #3d5a35);
      transform: scale(1.03);
    }

    .journey-connect-btn:active {
      transform: scale(0.98);
    }
    
    .journey-connect-btn:focus-visible {
      outline: 2px solid var(--color-background-elevated, #fff);
      outline-offset: 2px;
    }

    .journey-connect-btn svg {
      width: 18px;
      height: 18px;
    }

    /* Retry button variant */
    .journey-connect-btn--retry {
      background: var(--color-error, #c44b4b);
    }

    .journey-connect-btn--retry:hover {
      background: var(--color-error-dark, #a33d3d);
    }

    /* ===================================================================
       TRUST INSIGHTS SECTION
       =================================================================== */
    .journey-insights-section {
      margin-bottom: var(--space-4, 16px);
    }

    .journey-insights-header {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--color-background-elevated, rgba(255, 255, 255, 0.5));
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .journey-insights-header:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.03));
    }

    .journey-insights-header:focus-visible {
      outline: 2px solid var(--persona-primary, #4a6741);
      outline-offset: 2px;
    }

    .journey-insights-title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      flex: 1;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
    }

    .journey-insights-title svg {
      color: var(--persona-primary, #4a6741);
    }

    .journey-insights-toggle {
      color: var(--color-text-muted, #70605a);
      transition: transform ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .journey-insights-header.collapsed .journey-insights-toggle {
      transform: rotate(-90deg);
    }

    .journey-insights-body {
      padding: var(--space-4, 16px) 0;
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }

    .journey-insights-body.collapsed {
      display: none;
    }

    /* Loading state */
    .journey-insights-loading {
      text-align: center;
      padding: var(--space-4, 16px);
    }

    .journey-insights-skeleton {
      height: 20px;
      background: linear-gradient(90deg, 
        var(--color-background-subtle, rgba(0,0,0,0.05)) 25%, 
        var(--color-background-hover, rgba(0,0,0,0.1)) 50%, 
        var(--color-background-subtle, rgba(0,0,0,0.05)) 75%
      );
      background-size: 200% 100%;
      border-radius: var(--radius-sm, 4px);
      animation: skeleton-shimmer 1.5s infinite;
      margin-bottom: var(--space-2, 8px);
    }

    .journey-insights-skeleton--short {
      width: 60%;
      margin: 0 auto;
    }

    @keyframes skeleton-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    .journey-insights-loading-text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-3, 12px);
    }

    /* Empty state */
    .journey-insights-empty {
      text-align: center;
      padding: var(--space-6, 24px) var(--space-4, 16px);
    }

    .journey-insights-empty__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: var(--radius-full, 9999px);
      background: color-mix(in srgb, var(--persona-primary, #4a6741) 12%, transparent);
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-3, 12px);
    }

    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .journey-insights-empty__icon {
        background: rgba(74, 103, 65, 0.12);
      }
    }

    .journey-insights-empty__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 1.125rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-2, 8px);
    }

    .journey-insights-empty__text {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      line-height: 1.5;
      max-width: min(280px, 100%);
      margin: 0 auto;
    }

    /* Trust Stats Grid */
    .journey-trust-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-5, 20px);
    }

    .journey-trust-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-3, 12px);
      background: var(--color-background-elevated, rgba(255, 255, 255, 0.5));
      border-radius: var(--radius-lg, 12px);
      text-align: center;
    }

    .journey-trust-stat__icon {
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-2, 8px);
    }

    .journey-trust-stat__icon svg {
      width: 24px;
      height: 24px;
    }

    .journey-trust-stat__value {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xl, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      line-height: 1;
    }

    .journey-trust-stat__label {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-1, 4px);
    }

    /* Trust Sections */
    .journey-trust-section {
      margin-bottom: var(--space-4, 16px);
    }

    .journey-trust-section__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-secondary, #5a4d47);
      margin: 0 0 var(--space-3, 12px);
    }

    /* Growth Patterns */
    .journey-growth-patterns {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }

    .journey-growth-tag {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: color-mix(in srgb, var(--persona-primary, #4a6741) 10%, transparent);
      color: var(--persona-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
      font-size: var(--text-sm, 0.875rem);
      font-weight: 500;
    }

    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .journey-growth-tag {
        background: rgba(74, 103, 65, 0.1);
      }
    }

    .journey-growth-tag__count {
      font-size: var(--text-xs, 0.75rem);
      opacity: 0.7;
    }

    /* Recent Wins */
    .journey-wins-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }

    .journey-win-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-background-elevated, rgba(255, 255, 255, 0.5));
      border-radius: var(--radius-lg, 12px);
    }

    .journey-win-item__icon {
      color: var(--color-warning, #d4a574);
      flex-shrink: 0;
    }

    .journey-win-item__content {
      flex: 1;
      min-width: 0;
    }

    .journey-win-item__type {
      display: block;
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
    }

    .journey-win-item__desc {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin: var(--space-1, 4px) 0 0;
      line-height: 1.4;
    }

    /* Timeline Peek */
    .journey-timeline-peek {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .journey-timeline-item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--color-background-elevated, rgba(255, 255, 255, 0.3));
      border-radius: var(--radius-md, 8px);
      border-left: 3px solid var(--persona-primary, #4a6741);
    }

    .journey-timeline-item--win { border-left-color: var(--color-warning, #d4a574); }
    .journey-timeline-item--boundary { border-left-color: var(--color-info, #3a6b73); }
    .journey-timeline-item--callback { border-left-color: var(--color-maya, #a67a6a); }
    .journey-timeline-item--outreach { border-left-color: var(--color-nayan, #b8956a); }

    .journey-timeline-item__date {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      white-space: nowrap;
      min-width: 80px;
    }

    .journey-timeline-item__title {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2c2520);
      font-weight: 500;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ===================================================================
       DARK THEME
       =================================================================== */
    [data-theme="midnight"] .journey-backdrop {
      background: var(--backdrop-heavy-dark, rgba(8, 8, 12, 0.8));
    }

    [data-theme="midnight"] .journey-content {
      background: var(--color-background-elevated, #1a1a1f);
    }

    [data-theme="midnight"] .journey-title {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-milestone--celebrated {
      background: linear-gradient(135deg, rgba(107, 143, 94, 0.15) 0%, rgba(107, 143, 94, 0.05) 100%);
      border-color: rgba(107, 143, 94, 0.25);
    }

    [data-theme="midnight"] .journey-connection--connected {
      background: linear-gradient(135deg, rgba(107, 143, 94, 0.15) 0%, rgba(107, 143, 94, 0.05) 100%);
      border-color: rgba(107, 143, 94, 0.3);
    }

    [data-theme="midnight"] .journey-connection--connected .journey-connection__icon,
    [data-theme="midnight"] .journey-connection--connected .journey-connection__text {
      color: var(--persona-primary, #6b8f5e);
    }

    [data-theme="midnight"] .journey-connection--disconnected {
      background: linear-gradient(135deg, rgba(122, 122, 122, 0.1) 0%, rgba(122, 122, 122, 0.02) 100%);
      border-color: rgba(122, 122, 122, 0.2);
    }

    [data-theme="midnight"] .journey-connection--error {
      background: linear-gradient(135deg, rgba(224, 96, 96, 0.12) 0%, rgba(224, 96, 96, 0.03) 100%);
      border-color: rgba(224, 96, 96, 0.25);
    }

    [data-theme="midnight"] .journey-connection__text {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-connection__subtext {
      color: var(--color-text-secondary, #c0b8b0);
    }

    [data-theme="midnight"] .journey-connect-btn {
      background: var(--persona-primary, #6b8f5e);
    }

    [data-theme="midnight"] .journey-connect-btn:hover {
      background: var(--persona-secondary, #5a7d4e);
    }

    /* Dark theme - Progress Overview */
    [data-theme="midnight"] .journey-progress-ring__bg {
      stroke: rgba(255, 255, 255, 0.1);
    }

    [data-theme="midnight"] .journey-progress-ring__fill {
      stroke: var(--persona-primary, #6b8f5e);
    }

    [data-theme="midnight"] .journey-progress-ring__percent,
    [data-theme="midnight"] .journey-stage-name,
    [data-theme="midnight"] .journey-stat__value {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-progress-ring__label,
    [data-theme="midnight"] .journey-stage-tagline,
    [data-theme="midnight"] .journey-stat__label,
    [data-theme="midnight"] .journey-stat__icon,
    [data-theme="midnight"] .journey-next-stage__req {
      color: var(--color-text-muted, #a09890);
    }

    [data-theme="midnight"] .journey-next-stage {
      background: rgba(255, 255, 255, 0.05);
    }

    [data-theme="midnight"] .journey-next-stage--max {
      background: linear-gradient(135deg, rgba(107, 143, 94, 0.12) 0%, rgba(107, 143, 94, 0.04) 100%);
    }

    [data-theme="midnight"] .journey-milestones-title {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-milestones-header:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    [data-theme="midnight"] .journey-progress-overview {
      border-bottom-color: rgba(255, 255, 255, 0.1);
    }

    [data-theme="midnight"] .journey-stats-row {
      background: rgba(255, 255, 255, 0.05);
    }

    /* Dark theme - Trust Insights */
    [data-theme="midnight"] .journey-insights-header {
      background: rgba(255, 255, 255, 0.05);
    }

    [data-theme="midnight"] .journey-insights-header:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    [data-theme="midnight"] .journey-insights-title {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-insights-empty__icon {
      background: rgba(107, 143, 94, 0.15);
    }

    [data-theme="midnight"] .journey-insights-empty__title {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-trust-stat {
      background: rgba(255, 255, 255, 0.05);
    }

    [data-theme="midnight"] .journey-trust-stat__value {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-trust-section__title {
      color: var(--color-text-secondary, #c0b8b0);
    }

    [data-theme="midnight"] .journey-growth-tag {
      background: rgba(107, 143, 94, 0.15);
      color: var(--persona-primary, #6b8f5e);
    }

    [data-theme="midnight"] .journey-win-item {
      background: rgba(255, 255, 255, 0.05);
    }

    [data-theme="midnight"] .journey-win-item__type {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-timeline-item {
      background: rgba(255, 255, 255, 0.03);
    }

    [data-theme="midnight"] .journey-timeline-item__title {
      color: var(--color-text-primary, #faf6f0);
    }

    /* Dark theme - Polaroid Scrapbook */
    [data-theme="midnight"] .journey-polaroid {
      background: var(--color-background-subtle, rgba(255, 255, 255, 0.05));
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    [data-theme="midnight"] .journey-polaroid:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }

    [data-theme="midnight"] .journey-polaroid__title {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-polaroid__message {
      color: var(--color-text-secondary, #c0b8b0);
    }

    [data-theme="midnight"] .journey-polaroid--celebrated {
      box-shadow: 
        0 2px 8px rgba(0, 0, 0, 0.2),
        0 0 12px rgba(107, 143, 94, 0.2);
    }

    [data-theme="midnight"] .journey-polaroid--celebrated:hover {
      box-shadow: 
        0 4px 16px rgba(0, 0, 0, 0.3),
        0 0 20px rgba(107, 143, 94, 0.3);
    }

    /* Dark theme - Journey Map */
    [data-theme="midnight"] .journey-map-section {
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }

    [data-theme="midnight"] .journey-map__node {
      background: var(--color-background-subtle, rgba(255, 255, 255, 0.1));
      border-color: rgba(255, 255, 255, 0.2);
    }

    [data-theme="midnight"] .journey-map__node-inner {
      background: rgba(255, 255, 255, 0.15);
    }

    [data-theme="midnight"] .journey-map__stage--past .journey-map__node {
      background: rgba(107, 143, 94, 0.2);
      border-color: var(--persona-primary, #6b8f5e);
    }

    [data-theme="midnight"] .journey-map__stage--past .journey-map__node-inner {
      background: var(--persona-primary, #6b8f5e);
    }

    [data-theme="midnight"] .journey-map__stage--current .journey-map__node {
      border-color: var(--persona-primary, #6b8f5e);
      box-shadow: 0 0 0 4px rgba(107, 143, 94, 0.2);
    }

    [data-theme="midnight"] .journey-map__label {
      color: var(--color-text-muted, #a09890);
    }

    [data-theme="midnight"] .journey-map__stage--current .journey-map__label {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-map__connector {
      background: rgba(255, 255, 255, 0.1);
    }

    [data-theme="midnight"] .journey-map__connector-fill {
      background: var(--persona-primary, #6b8f5e);
    }

    [data-theme="midnight"] .journey-map__hint {
      color: var(--color-text-muted, #a09890);
    }

    /* ===================================================================
       MOBILE - Sheet animation from bottom
       =================================================================== */
    @media (max-width: clamp(448px, 90vw, 640px)) {
      .journey-modal {
        padding: 0;
        align-items: flex-end;
      }

      .journey-content {
        max-height: 90vh;
        border-radius: var(--radius-2xl, 20px) var(--radius-2xl, 20px) 0 0;
      }

      .journey-header {
        padding: var(--space-4, 16px);
      }

      .journey-body {
        padding: var(--space-3, 12px) var(--space-4, 16px);
      }
    }

    /* ===================================================================
       REDUCED MOTION
       =================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .journey-milestone,
      .journey-close,
      .journey-share,
      .journey-connection,
      .journey-connect-btn,
      .journey-milestone__progress-bar,
      .journey-insights-skeleton {
        transition: none;
        animation: none;
      }
      
      .journey-connection__icon--spin svg {
        animation: none;
      }
    }
  `;
}

