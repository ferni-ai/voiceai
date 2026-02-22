/**
 * Voice Indicator Components
 * 
 * Visual indicators for voice-first interactions:
 * - Turn-taking (who's speaking)
 * - Thinking/processing states
 * - Interruption handling
 * - Listening feedback
 */

// =============================================================================
// Types
// =============================================================================

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';
export type TurnOwner = 'user' | 'ai' | 'none';

export interface VoiceIndicatorOptions {
  /** Current voice state */
  state?: VoiceState;
  /** Who currently has the turn */
  turnOwner?: TurnOwner;
  /** Persona for styling */
  persona?: 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';
  /** Show waveform visualization */
  showWaveform?: boolean;
  /** Size */
  size?: 'sm' | 'md' | 'lg';
}

// =============================================================================
// Constants
// =============================================================================

const PERSONA_COLORS: Record<string, string> = {
  ferni: '#4a6741',
  peter: '#3a6b73',
  alex: '#5a6b8a',
  maya: '#a67a6a',
  jordan: '#c4856a',
  nayan: '#b8956a',
};

const SIZE_CONFIG = {
  sm: { size: 40, strokeWidth: 2, dotSize: 6 },
  md: { size: 56, strokeWidth: 3, dotSize: 8 },
  lg: { size: 72, strokeWidth: 4, dotSize: 10 },
};

// =============================================================================
// Voice Indicator Class
// =============================================================================

export class VoiceIndicator {
  private container: HTMLElement;
  private options: VoiceIndicatorOptions;
  private animationFrame: number | null = null;

  constructor(container: HTMLElement, options: VoiceIndicatorOptions = {}) {
    this.container = container;
    this.options = {
      state: 'idle',
      turnOwner: 'none',
      persona: 'ferni',
      showWaveform: true,
      size: 'md',
      ...options,
    };
    this.render();
  }

  private render(): void {
    const { state, persona, size } = this.options;
    const color = PERSONA_COLORS[persona ?? 'ferni'] ?? '#4a6741';
    const sizeConfig = SIZE_CONFIG[size ?? 'md'];

    this.container.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'ferni-voice-indicator';
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    `;

    // Main indicator ring
    const ring = document.createElement('div');
    ring.className = 'voice-ring';
    ring.style.cssText = `
      width: ${sizeConfig.size}px;
      height: ${sizeConfig.size}px;
      border-radius: 50%;
      border: ${sizeConfig.strokeWidth}px solid ${this.getRingColor(state!, color)};
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
      ${this.getRingAnimation(state!)}
    `;

    // Inner content based on state
    const inner = this.createInnerContent(state!, color, sizeConfig);
    ring.appendChild(inner);

    wrapper.appendChild(ring);

    // State label
    const label = document.createElement('span');
    label.className = 'voice-label';
    label.textContent = this.getStateLabel(state!);
    label.style.cssText = `
      font-family: var(--font-body, Inter, system-ui, sans-serif);
      font-size: 12px;
      font-weight: 500;
      color: var(--color-text-muted, #8A847A);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    `;
    wrapper.appendChild(label);

    this.injectStyles();
    this.container.appendChild(wrapper);
  }

  private getRingColor(state: VoiceState, baseColor: string): string {
    switch (state) {
      case 'listening': return baseColor;
      case 'thinking': return `${baseColor}80`;
      case 'speaking': return baseColor;
      case 'interrupted': return 'var(--color-warning, #a08054)';
      default: return 'var(--color-border, rgba(44, 37, 32, 0.15))';
    }
  }

  private getRingAnimation(state: VoiceState): string {
    switch (state) {
      case 'listening':
        return 'animation: voice-pulse 2s ease-in-out infinite;';
      case 'thinking':
        return 'animation: voice-rotate 2s linear infinite;';
      case 'speaking':
        return `box-shadow: 0 0 20px ${PERSONA_COLORS[this.options.persona || 'ferni']}40;`;
      default:
        return '';
    }
  }

  private createInnerContent(state: VoiceState, color: string, sizeConfig: typeof SIZE_CONFIG['md']): HTMLElement {
    const inner = document.createElement('div');
    inner.className = 'voice-inner';

    switch (state) {
      case 'listening':
        // Waveform bars
        inner.style.cssText = 'display: flex; align-items: center; gap: 3px;';
        for (let i = 0; i < 4; i++) {
          const bar = document.createElement('div');
          bar.style.cssText = `
            width: 3px;
            height: ${8 + Math.random() * 8}px;
            background: ${color};
            border-radius: 2px;
            animation: voice-bar ${0.4 + i * 0.1}s ease-in-out infinite alternate;
            animation-delay: ${i * 0.1}s;
          `;
          inner.appendChild(bar);
        }
        break;

      case 'thinking':
        // Rotating dots
        inner.style.cssText = `
          width: ${sizeConfig.size * 0.5}px;
          height: ${sizeConfig.size * 0.5}px;
          position: relative;
        `;
        for (let i = 0; i < 3; i++) {
          const dot = document.createElement('div');
          const angle = (i * 120) * (Math.PI / 180);
          const radius = sizeConfig.size * 0.2;
          dot.style.cssText = `
            position: absolute;
            width: ${sizeConfig.dotSize}px;
            height: ${sizeConfig.dotSize}px;
            background: ${color};
            border-radius: 50%;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%) translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px);
            animation: voice-dot-pulse 1s ease-in-out infinite;
            animation-delay: ${i * 0.33}s;
          `;
          inner.appendChild(dot);
        }
        break;

      case 'speaking':
        // Expanding rings
        inner.style.cssText = 'position: relative;';
        for (let i = 0; i < 3; i++) {
          const ring = document.createElement('div');
          ring.style.cssText = `
            position: absolute;
            width: ${sizeConfig.size * 0.4}px;
            height: ${sizeConfig.size * 0.4}px;
            border: 2px solid ${color};
            border-radius: 50%;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            animation: voice-speak-ring 1.5s ease-out infinite;
            animation-delay: ${i * 0.5}s;
            opacity: 0;
          `;
          inner.appendChild(ring);
        }
        // Center dot
        const center = document.createElement('div');
        center.style.cssText = `
          width: ${sizeConfig.dotSize * 2}px;
          height: ${sizeConfig.dotSize * 2}px;
          background: ${color};
          border-radius: 50%;
        `;
        inner.appendChild(center);
        break;

      case 'interrupted':
        // Pause icon
        inner.innerHTML = `
          <svg width="${sizeConfig.size * 0.3}" height="${sizeConfig.size * 0.3}" viewBox="0 0 24 24" fill="${color}">
            <rect x="6" y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
        `;
        break;

      default:
        // Idle - simple dot
        const idleDot = document.createElement('div');
        idleDot.style.cssText = `
          width: ${sizeConfig.dotSize}px;
          height: ${sizeConfig.dotSize}px;
          background: var(--color-text-muted, #8A847A);
          border-radius: 50%;
        `;
        inner.appendChild(idleDot);
    }

    return inner;
  }

  private getStateLabel(state: VoiceState): string {
    const labels: Record<VoiceState, string> = {
      idle: 'Ready',
      listening: 'Listening',
      thinking: 'Thinking',
      speaking: 'Speaking',
      interrupted: 'Paused',
    };
    return labels[state];
  }

  private injectStyles(): void {
    const styleId = 'ferni-voice-indicator-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes voice-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      @keyframes voice-rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      @keyframes voice-bar {
        0% { height: 8px; }
        100% { height: 20px; }
      }
      
      @keyframes voice-dot-pulse {
        0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(0.8); }
        50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      
      @keyframes voice-speak-ring {
        0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
      }
      
      @media (prefers-reduced-motion: reduce) {
        .ferni-voice-indicator * {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Public API
  setState(state: VoiceState): void {
    this.options.state = state;
    this.render();
  }

  setTurnOwner(owner: TurnOwner): void {
    this.options.turnOwner = owner;
    this.render();
  }

  destroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.container.innerHTML = '';
  }
}

export function createVoiceIndicator(container: HTMLElement, options?: VoiceIndicatorOptions): VoiceIndicator {
  return new VoiceIndicator(container, options);
}
