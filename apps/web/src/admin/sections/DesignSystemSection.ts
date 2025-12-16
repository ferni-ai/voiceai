/**
 * Design System Section
 *
 * Animation and visual token preview for the admin portal.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module DesignSystemSection
 */

import { createLogger } from '../../utils/logger.js';
import { DURATION, EASING, ANIMATION_PRESET } from '../../config/animation-constants.js';
import {
  ICON_TEAM,
  ICON_HISTORY,
  ICON_DESIGN_SYSTEM,
  ICON_CHART,
  ICON_LEAF,
  iconSm,
} from '../icons.js';

const log = createLogger('DesignSystemSection');

/**
 * Render the design system section
 */
export async function render(): Promise<string> {
  log.debug('Rendering design system section');

  return `
    <div class="design-section">
      <!-- Live Avatar Demo -->
      <div class="admin-card design-avatar">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_TEAM)}</span>
          Live Avatar
        </h2>
        <div class="avatar-demo">
          <div class="demo-avatar" id="demoAvatar">
            <div class="demo-avatar-glow"></div>
            <div class="demo-avatar-ring"></div>
            <span class="demo-avatar-icon">${iconSm(ICON_LEAF)}</span>
          </div>
          <p class="avatar-state">Current: <strong id="avatarState">neutral</strong></p>
        </div>
        <div class="avatar-controls">
          <button class="demo-btn" data-emotion="happy" aria-label="Set avatar emotion to happy">Happy</button>
          <button class="demo-btn" data-emotion="thinking" aria-label="Set avatar emotion to thinking">Thinking</button>
          <button class="demo-btn" data-emotion="excited" aria-label="Set avatar emotion to excited">Excited</button>
          <button class="demo-btn" data-emotion="calm" aria-label="Set avatar emotion to calm">Calm</button>
        </div>
        <div class="avatar-reactions">
          <button class="demo-btn demo-btn--small" data-reaction="nod" aria-label="Trigger nod reaction">Nod</button>
          <button class="demo-btn demo-btn--small" data-reaction="shake" aria-label="Trigger shake reaction">Shake</button>
          <button class="demo-btn demo-btn--small" data-reaction="bounce" aria-label="Trigger bounce reaction">Bounce</button>
          <button class="demo-btn demo-btn--small" data-reaction="pulse" aria-label="Trigger pulse reaction">Pulse</button>
        </div>
      </div>

      <!-- Timing Constants -->
      <div class="admin-card design-timing">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_HISTORY)}</span>
          Timing Constants
        </h2>
        <div class="timing-list">
          ${renderTimingItem('MICRO', DURATION.MICRO, 'Immediate feedback')}
          ${renderTimingItem('FAST', DURATION.FAST, 'Hover, focus')}
          ${renderTimingItem('NORMAL', DURATION.NORMAL, 'Standard transitions')}
          ${renderTimingItem('SLOW', DURATION.SLOW, 'Deliberate moves')}
          ${renderTimingItem('MODERATE', DURATION.MODERATE, 'Panel slides')}
          ${renderTimingItem('DELIBERATE', DURATION.DELIBERATE, 'Emphasis')}
          ${renderTimingItem('DRAMATIC', DURATION.DRAMATIC, 'Celebrations')}
          ${renderTimingItem('GLACIAL', DURATION.GLACIAL, 'Ambient effects')}
        </div>
      </div>

      <!-- Persona Colors -->
      <div class="admin-card design-colors">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_DESIGN_SYSTEM)}</span>
          Persona Colors
        </h2>
        <div class="colors-grid">
          ${renderColorSwatch('Ferni', 'var(--persona-primary, #4a6741)', 'var(--persona-secondary, #3d5a35)')}
          ${renderColorSwatch('Jack', 'var(--persona-jack, #9a7b5a)', '#7d6348')}
          ${renderColorSwatch('Peter', 'var(--persona-peter, #3a6b73)', '#2d5359')}
          ${renderColorSwatch('Alex', 'var(--persona-alex, #5a6b8a)', '#4a5a73')}
          ${renderColorSwatch('Maya', 'var(--persona-maya, #a67a6a)', '#8a635a')}
          ${renderColorSwatch('Jordan', 'var(--persona-jordan, #c4856a)', '#a86d55')}
        </div>
      </div>

      <!-- Easing Curves -->
      <div class="admin-card design-easing">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_CHART)}</span>
          Easing Curves
        </h2>
        <div class="easing-list">
          ${renderEasingItem('Standard', EASING.STANDARD, 'Material standard deceleration')}
          ${renderEasingItem('Spring', EASING.SPRING, 'Pixar-style bounce overshoot')}
          ${renderEasingItem('Spring Gentle', EASING.SPRING_GENTLE, 'Subtle bounce')}
          ${renderEasingItem('Expo Out', EASING.EXPO_OUT, 'Dramatic deceleration')}
          ${renderEasingItem('Gentle', EASING.GENTLE, 'Organic, natural')}
          ${renderEasingItem('Anticipate', EASING.ANTICIPATE, 'Wind-up before action')}
        </div>
      </div>

      <!-- Animation Presets -->
      <div class="admin-card design-presets">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_DESIGN_SYSTEM)}</span>
          Animation Presets
        </h2>
        <div class="presets-grid">
          <button class="preset-demo" data-preset="buttonPress">
            <span class="preset-name">Button Press</span>
            <span class="preset-timing">${ANIMATION_PRESET.BUTTON_PRESS.duration}ms</span>
          </button>
          <button class="preset-demo" data-preset="celebration">
            <span class="preset-name">Reaction Dramatic</span>
            <span class="preset-timing">${ANIMATION_PRESET.REACTION_DRAMATIC.duration}ms</span>
          </button>
          <button class="preset-demo" data-preset="fadeIn">
            <span class="preset-name">Fade</span>
            <span class="preset-timing">${ANIMATION_PRESET.FADE.duration}ms</span>
          </button>
          <button class="preset-demo" data-preset="slideUp">
            <span class="preset-name">Slide</span>
            <span class="preset-timing">${ANIMATION_PRESET.SLIDE.duration}ms</span>
          </button>
        </div>
      </div>

      <!-- Avatar Soul Quick Access -->
      <div class="admin-card design-soul">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_LEAF)}</span>
          Avatar Soul
          <span class="badge badge--new">Better Than Human</span>
        </h2>
        <p class="soul-desc">Superhuman emotional intelligence through visual animation</p>
        
        <div class="soul-features-grid">
          ${renderSoulFeature('Pupil Dilation', '40-150ms', 'Interest & connection through eye behavior')}
          ${renderSoulFeature('Active Listening', '180-400ms', 'Nods and leans during user speech')}
          ${renderSoulFeature('Breath Sync', 'Continuous', 'Neural mirroring for connection')}
          ${renderSoulFeature('Micro-Expressions', '60-120ms', 'Subliminal trust building')}
          ${renderSoulFeature('Protective Mode', '2-6s', 'Draws closer during distress')}
          ${renderSoulFeature('Memory Spark', '800ms', 'Acknowledges shared history')}
        </div>

        <div class="soul-actions">
          <a href="#avatar-soul" class="soul-action-btn" data-navigate="avatar-soul">
            Open Avatar Soul Lab →
          </a>
          <a href="/design-system/preview/index.html#avatar-soul" target="_blank" class="soul-action-link">
            View Full Preview
          </a>
        </div>
      </div>
    </div>

    <style>
      .design-section {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-4, 1rem);
      }

      @media (max-width: 1024px) {
        .design-section {
          grid-template-columns: 1fr;
        }
      }

      .design-avatar {
        grid-column: span 2;
      }

      @media (max-width: 1024px) {
        .design-avatar {
          grid-column: span 1;
        }
      }

      .avatar-demo {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-4, 1rem);
        padding: var(--space-6, 1.5rem);
      }

      .demo-avatar {
        width: 96px;
        height: 96px;
        border-radius: 50%;
        background: var(--persona-primary, #4a6741);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        animation: breathe 5s infinite;
        transition: background-color var(--duration-deliberate, ${DURATION.DELIBERATE}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .demo-avatar-icon {
        display: flex;
        color: white;
      }

      .demo-avatar-icon svg {
        width: 40px;
        height: 40px;
      }

      @media (prefers-reduced-motion: reduce) {
        .demo-avatar {
          animation: none;
          transition: none;
        }
      }

      .demo-avatar-ring {
        position: absolute;
        inset: -8px;
        border: 3px solid var(--persona-primary, #4a6741);
        border-radius: 50%;
        opacity: 0.5;
        animation: ringPulse 5s infinite;
      }

      .demo-avatar-glow {
        position: absolute;
        inset: -20px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(74, 103, 65, 0.3) 0%, transparent 70%);
        animation: glowPulse 5s infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .demo-avatar-ring,
        .demo-avatar-glow {
          animation: none;
        }
      }

      @keyframes breathe {
        0%, 100% { transform: scale(1); }
        35% { transform: scale(1.012) translateY(-1.5px); }
        75% { transform: scale(1); }
      }

      @keyframes ringPulse {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        35% { transform: scale(1.02); opacity: 0.7; }
      }

      @keyframes glowPulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.5; }
      }

      .demo-avatar.nod { animation: nod 0.6s var(--ease-standard, ${EASING.STANDARD}); }
      .demo-avatar.shake { animation: shake 0.5s var(--ease-standard, ${EASING.STANDARD}); }
      .demo-avatar.bounce { animation: bounce 0.8s var(--ease-spring, ${EASING.SPRING}); }
      .demo-avatar.pulse { animation: pulse 0.7s var(--ease-standard, ${EASING.STANDARD}); }

      @keyframes nod {
        0% { transform: translateY(0); }
        25% { transform: translateY(5px); }
        50% { transform: translateY(-6px); }
        100% { transform: translateY(0); }
      }

      @keyframes shake {
        0%, 100% { transform: rotate(0); }
        20% { transform: rotate(-4deg) translateX(-3px); }
        40% { transform: rotate(3deg) translateX(3px); }
        60% { transform: rotate(-2deg) translateX(-2px); }
        80% { transform: rotate(1deg); }
      }

      @keyframes bounce {
        0% { transform: scaleY(1) translateY(0); }
        15% { transform: scaleY(0.88) scaleX(1.08) translateY(3px); }
        35% { transform: scaleY(1.12) scaleX(0.92) translateY(-15px); }
        50% { transform: scaleY(0.9) scaleX(1.08) translateY(3px); }
        70% { transform: scaleY(1.04) translateY(-4px); }
        100% { transform: scaleY(1) translateY(0); }
      }

      @keyframes pulse {
        0%, 100% { transform: scale(1); filter: brightness(1); }
        30% { transform: scale(1.1); filter: brightness(1.15); }
        50% { transform: scale(0.96); }
      }

      .avatar-state {
        font-size: 0.875rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .avatar-controls,
      .avatar-reactions {
        display: flex;
        gap: var(--space-2, 0.5rem);
        flex-wrap: wrap;
        justify-content: center;
      }

      .demo-btn {
        padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: inherit;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .demo-btn:hover {
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.1));
      }

      .demo-btn:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .demo-btn {
          transition: none;
        }
      }

      .demo-btn--small {
        padding: var(--space-1, 0.25rem) var(--space-3, 0.75rem);
        font-size: 0.75rem;
      }

      .timing-list,
      .easing-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 0.75rem);
      }

      .timing-item,
      .easing-item {
        display: flex;
        align-items: center;
        gap: var(--space-4, 1rem);
      }

      .timing-label,
      .easing-label {
        min-width: 100px;
        font-weight: 600;
        font-size: 0.875rem;
      }

      .timing-bar {
        flex: 1;
        height: 8px;
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.1));
        border-radius: 4px;
        overflow: hidden;
      }

      .timing-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: 4px;
        transition: width var(--duration-slow, ${DURATION.SLOW}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      @media (prefers-reduced-motion: reduce) {
        .timing-fill {
          transition: none;
        }
      }

      .timing-value,
      .easing-value {
        min-width: 60px;
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
        text-align: right;
      }

      .timing-desc,
      .easing-desc {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
        min-width: 150px;
      }

      .easing-preview {
        flex: 1;
        height: 20px;
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border-radius: 10px;
        position: relative;
        cursor: pointer;
        overflow: hidden;
      }

      .easing-ball {
        position: absolute;
        left: 4px;
        top: 50%;
        transform: translateY(-50%);
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--persona-primary, #4a6741);
      }

      .easing-item:hover .easing-ball {
        animation: easingPreview 1s forwards;
      }

      @keyframes easingPreview {
        to { left: calc(100% - 16px); }
      }

      .easing-item[data-easing*="0.34, 1.56"]:hover .easing-ball {
        animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .easing-item[data-easing*="0.25, 0.46"]:hover .easing-ball {
        animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }
      .easing-item[data-easing*="0.19, 1"]:hover .easing-ball {
        animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
      }
      .easing-item[data-easing*="0.4, 0"]:hover .easing-ball {
        animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      }
      .easing-item[data-easing*="0.65, 0"]:hover .easing-ball {
        animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
      }
      .easing-item[data-easing*="0.68, -0.55"]:hover .easing-ball {
        animation-timing-function: cubic-bezier(0.68, -0.55, 0.265, 1.55);
      }

      @media (prefers-reduced-motion: reduce) {
        .easing-item:hover .easing-ball {
          animation: none;
          left: calc(100% - 16px);
        }
      }

      .colors-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3, 0.75rem);
      }

      @media (max-width: 600px) {
        .colors-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .color-swatch {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border-radius: var(--radius-md, 8px);
        text-align: center;
      }

      .swatch-preview {
        height: 48px;
        border-radius: var(--radius-md, 8px);
        display: flex;
      }

      .swatch-primary,
      .swatch-secondary {
        flex: 1;
      }

      .swatch-primary {
        border-radius: var(--radius-md, 8px) 0 0 var(--radius-md, 8px);
      }

      .swatch-secondary {
        border-radius: 0 var(--radius-md, 8px) var(--radius-md, 8px) 0;
      }

      .swatch-name {
        font-weight: 600;
        font-size: 0.875rem;
      }

      .swatch-values {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.6875rem;
        color: var(--color-text-muted, #756A5E);
      }

      .presets-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-3, 0.75rem);
      }

      .preset-demo {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 0.25rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--admin-border-subtle, rgba(255, 255, 255, 0.05));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: inherit;
        cursor: pointer;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
        text-align: center;
      }

      .preset-demo:hover {
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.08));
        transform: translateY(-2px);
      }

      .preset-demo:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .preset-demo {
          transition: none;
        }
        .preset-demo:hover {
          transform: none;
        }
      }

      .preset-name {
        font-weight: 600;
        font-size: 0.9375rem;
      }

      .preset-timing {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      /* Avatar Soul Section */
      .design-soul {
        grid-column: span 2;
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.15), rgba(196, 162, 101, 0.08));
        border: 1px solid rgba(74, 103, 65, 0.3);
      }

      @media (max-width: 1024px) {
        .design-soul {
          grid-column: span 1;
        }
      }

      .design-soul .admin-section-title {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
      }

      .badge--new {
        background: var(--persona-primary, #4a6741);
        color: white;
        padding: 0.125rem 0.5rem;
        border-radius: var(--radius-full, 9999px);
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-left: auto;
      }

      .soul-desc {
        color: var(--color-text-muted, #756A5E);
        font-size: 0.875rem;
        margin-bottom: var(--space-4, 1rem);
      }

      .soul-features-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3, 0.75rem);
        margin-bottom: var(--space-4, 1rem);
      }

      @media (max-width: 900px) {
        .soul-features-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .soul-feature {
        padding: var(--space-3, 0.75rem);
        background: rgba(0, 0, 0, 0.2);
        border-radius: var(--radius-md, 8px);
        border-left: 3px solid var(--persona-primary, #4a6741);
      }

      .soul-feature-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: var(--space-1, 0.25rem);
      }

      .soul-feature-name {
        font-weight: 600;
        font-size: 0.85rem;
      }

      .soul-feature-timing {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.7rem;
        color: var(--persona-primary, #4a6741);
      }

      .soul-feature-desc {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
        line-height: 1.3;
      }

      .soul-actions {
        display: flex;
        gap: var(--space-4, 1rem);
        align-items: center;
        padding-top: var(--space-3, 0.75rem);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .soul-action-btn {
        padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
        background: var(--persona-primary, #4a6741);
        border: none;
        border-radius: var(--radius-md, 8px);
        color: white;
        font-size: 0.875rem;
        font-weight: 500;
        text-decoration: none;
        cursor: pointer;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .soul-action-btn:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }

      .soul-action-link {
        color: var(--persona-primary, #4a6741);
        text-decoration: none;
        font-size: 0.85rem;
        transition: opacity 0.2s;
      }

      .soul-action-link:hover {
        opacity: 0.8;
      }
    </style>
  `;
}

function renderTimingItem(label: string, value: number, desc: string): string {
  const maxValue = 1500;
  const percentage = (value / maxValue) * 100;

  return `
    <div class="timing-item">
      <span class="timing-label">${label}</span>
      <div class="timing-bar">
        <div class="timing-fill" style="width: ${percentage}%;"></div>
      </div>
      <span class="timing-value">${value}ms</span>
      <span class="timing-desc">${desc}</span>
    </div>
  `;
}

function renderEasingItem(label: string, value: string, desc: string): string {
  return `
    <div class="easing-item" data-easing="${value}">
      <span class="easing-label">${label}</span>
      <div class="easing-preview">
        <div class="easing-ball"></div>
      </div>
      <span class="easing-desc">${desc}</span>
    </div>
  `;
}

function renderColorSwatch(name: string, primary: string, secondary: string): string {
  return `
    <div class="color-swatch">
      <div class="swatch-preview">
        <div class="swatch-primary" style="background: ${primary};"></div>
        <div class="swatch-secondary" style="background: ${secondary};"></div>
      </div>
      <span class="swatch-name">${name}</span>
      <span class="swatch-values">${primary.includes('var(') ? 'CSS var' : primary}</span>
    </div>
  `;
}

function renderSoulFeature(name: string, timing: string, desc: string): string {
  return `
    <div class="soul-feature">
      <div class="soul-feature-header">
        <span class="soul-feature-name">${name}</span>
        <span class="soul-feature-timing">${timing}</span>
      </div>
      <div class="soul-feature-desc">${desc}</div>
    </div>
  `;
}

export default { render };
