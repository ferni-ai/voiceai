/**
 * Design System Section
 *
 * Animation and visual token preview for the admin portal.
 * Migrated from docs/emotion-mood-dashboard.html
 *
 * @module DesignSystemSection
 */

import { createLogger } from '../../utils/logger.js';
import { DURATION, EASING, ANIMATION_PRESET } from '../../config/animation-constants.js';

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
          <span>🎭</span> Live Avatar
        </h2>
        <div class="avatar-demo">
          <div class="demo-avatar" id="demoAvatar">
            <div class="demo-avatar-glow"></div>
            <div class="demo-avatar-ring"></div>
            <span>🌿</span>
          </div>
          <p class="avatar-state">Current: <strong id="avatarState">neutral</strong></p>
        </div>
        <div class="avatar-controls">
          <button class="demo-btn" data-emotion="happy">😊 Happy</button>
          <button class="demo-btn" data-emotion="thinking">🤔 Thinking</button>
          <button class="demo-btn" data-emotion="excited">🎉 Excited</button>
          <button class="demo-btn" data-emotion="calm">😌 Calm</button>
        </div>
        <div class="avatar-reactions">
          <button class="demo-btn demo-btn--small" data-reaction="nod">👍 Nod</button>
          <button class="demo-btn demo-btn--small" data-reaction="shake">👎 Shake</button>
          <button class="demo-btn demo-btn--small" data-reaction="bounce">🎊 Bounce</button>
          <button class="demo-btn demo-btn--small" data-reaction="pulse">💗 Pulse</button>
        </div>
      </div>

      <!-- Timing Constants -->
      <div class="admin-card design-timing">
        <h2 class="admin-section-title">
          <span>⏱️</span> Timing Constants
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
          <span>🎨</span> Persona Colors
        </h2>
        <div class="colors-grid">
          ${renderColorSwatch('Ferni', '#4a6741', '#3d5a35')}
          ${renderColorSwatch('Jack', '#9a7b5a', '#7d6348')}
          ${renderColorSwatch('Peter', '#3a6b73', '#2d5359')}
          ${renderColorSwatch('Alex', '#5a6b8a', '#4a5a73')}
          ${renderColorSwatch('Maya', '#a67a6a', '#8a635a')}
          ${renderColorSwatch('Jordan', '#c4856a', '#a86d55')}
        </div>
      </div>

      <!-- Easing Curves -->
      <div class="admin-card design-easing">
        <h2 class="admin-section-title">
          <span>📈</span> Easing Curves
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
          <span>✨</span> Animation Presets
        </h2>
        <div class="presets-grid">
          <button class="preset-demo" data-preset="buttonPress">
            <span class="preset-name">Button Press</span>
            <span class="preset-timing">${ANIMATION_PRESET.BUTTON_PRESS.duration}ms</span>
          </button>
          <button class="preset-demo" data-preset="celebration">
            <span class="preset-name">Celebration</span>
            <span class="preset-timing">${ANIMATION_PRESET.CELEBRATION.duration}ms</span>
          </button>
          <button class="preset-demo" data-preset="fadeIn">
            <span class="preset-name">Fade In</span>
            <span class="preset-timing">${ANIMATION_PRESET.FADE_IN.duration}ms</span>
          </button>
          <button class="preset-demo" data-preset="slideUp">
            <span class="preset-name">Slide Up</span>
            <span class="preset-timing">${ANIMATION_PRESET.SLIDE_UP.duration}ms</span>
          </button>
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
        font-size: 2rem;
        position: relative;
        animation: breathe 5s infinite;
        transition: background-color 500ms ease;
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

      .demo-avatar.nod { animation: nod 0.6s ease; }
      .demo-avatar.shake { animation: shake 0.5s ease; }
      .demo-avatar.bounce { animation: bounce 0.8s ${EASING.SPRING}; }
      .demo-avatar.pulse { animation: pulse 0.7s ease; }

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
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: inherit;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 150ms ease;
      }

      .demo-btn:hover {
        background: rgba(255, 255, 255, 0.1);
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
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        overflow: hidden;
      }

      .timing-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: 4px;
        transition: width 300ms ease;
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
        background: rgba(255, 255, 255, 0.03);
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
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: inherit;
        cursor: pointer;
        transition: all 150ms ease;
        text-align: center;
      }

      .preset-demo:hover {
        background: rgba(255, 255, 255, 0.08);
        transform: translateY(-2px);
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
    <div class="easing-item">
      <span class="easing-label">${label}</span>
      <span class="easing-value" title="${value}">cubic-bezier(...)</span>
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
      <span class="swatch-values">${primary} / ${secondary}</span>
    </div>
  `;
}

export default { render };

