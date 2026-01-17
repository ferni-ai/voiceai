/**
 * Ferni Spinner Component
 * 
 * Loading indicator with brand-compliant styling.
 */

// =============================================================================
// Types
// =============================================================================

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerVariant = 'default' | 'persona';

export interface SpinnerOptions {
  /** Spinner size */
  size?: SpinnerSize;
  /** Use persona color */
  variant?: SpinnerVariant;
  /** Persona ID for coloring */
  persona?: 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';
  /** Custom color */
  color?: string;
  /** Label text */
  label?: string;
  /** Centered in container */
  centered?: boolean;
}

// =============================================================================
// Styles
// =============================================================================

const SIZE_CONFIG: Record<SpinnerSize, { size: number; stroke: number }> = {
  xs: { size: 16, stroke: 2 },
  sm: { size: 24, stroke: 2.5 },
  md: { size: 32, stroke: 3 },
  lg: { size: 48, stroke: 3.5 },
  xl: { size: 64, stroke: 4 },
};

const PERSONA_COLORS: Record<string, string> = {
  ferni: '#4a6741',
  peter: '#3a6b73',
  alex: '#5a6b8a',
  maya: '#a67a6a',
  jordan: '#c4856a',
  nayan: '#b8956a',
};

// =============================================================================
// Spinner Class
// =============================================================================

export class Spinner {
  private container: HTMLElement;
  private wrapper: HTMLElement;
  private options: SpinnerOptions;

  constructor(container: HTMLElement, options: SpinnerOptions = {}) {
    this.container = container;
    this.options = {
      size: 'md',
      variant: 'default',
      persona: 'ferni',
      centered: true,
      ...options,
    };

    this.wrapper = document.createElement('div');
    this.render();
  }

  private render(): void {
    const { size, variant, persona, color, label, centered } = this.options;
    const sizeConfig = SIZE_CONFIG[size || 'md'];
    
    // Determine color
    let spinnerColor = 'var(--color-ferni, #4a6741)';
    if (color) {
      spinnerColor = color;
    } else if (variant === 'persona' && persona) {
      spinnerColor = PERSONA_COLORS[persona] || spinnerColor;
    }

    // Clear container
    this.container.innerHTML = '';

    // Wrapper
    this.wrapper.className = 'ferni-spinner-wrapper';
    this.wrapper.style.cssText = `
      display: ${centered ? 'flex' : 'inline-flex'};
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      ${centered ? 'width: 100%; height: 100%;' : ''}
    `;

    // SVG Spinner
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(sizeConfig.size));
    svg.setAttribute('height', String(sizeConfig.size));
    svg.setAttribute('viewBox', `0 0 ${sizeConfig.size} ${sizeConfig.size}`);
    svg.setAttribute('class', 'ferni-spinner');
    svg.style.cssText = `
      animation: ferni-spin 1s linear infinite;
    `;

    // Circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const radius = (sizeConfig.size - sizeConfig.stroke) / 2;
    const circumference = radius * 2 * Math.PI;
    
    circle.setAttribute('cx', String(sizeConfig.size / 2));
    circle.setAttribute('cy', String(sizeConfig.size / 2));
    circle.setAttribute('r', String(radius));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', spinnerColor);
    circle.setAttribute('stroke-width', String(sizeConfig.stroke));
    circle.setAttribute('stroke-linecap', 'round');
    circle.style.cssText = `
      stroke-dasharray: ${circumference};
      stroke-dashoffset: ${circumference * 0.75};
    `;

    svg.appendChild(circle);
    this.wrapper.appendChild(svg);

    // Label
    if (label) {
      const labelEl = document.createElement('span');
      labelEl.className = 'ferni-spinner-label';
      labelEl.textContent = label;
      labelEl.style.cssText = `
        font-family: var(--font-body, Inter, system-ui, sans-serif);
        font-size: 14px;
        color: var(--color-text-secondary, #5C544A);
      `;
      this.wrapper.appendChild(labelEl);
    }

    // Inject animation keyframes
    this.injectStyles();

    this.container.appendChild(this.wrapper);
  }

  private injectStyles(): void {
    const styleId = 'ferni-spinner-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ferni-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      @media (prefers-reduced-motion: reduce) {
        .ferni-spinner {
          animation: none;
          opacity: 0.7;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Public API
  setLabel(label: string): void {
    this.options.label = label;
    this.render();
  }

  hide(): void {
    this.wrapper.style.display = 'none';
  }

  show(): void {
    this.wrapper.style.display = this.options.centered ? 'flex' : 'inline-flex';
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}

/**
 * Create a spinner (convenience function)
 */
export function createSpinner(container: HTMLElement, options?: SpinnerOptions): Spinner {
  return new Spinner(container, options);
}

/**
 * Show a full-screen loading overlay
 */
export function showLoadingOverlay(label?: string): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'ferni-loading-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(255, 252, 248, 0.9);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: ferni-fade-in 0.2s ease;
  `;

  const spinnerContainer = document.createElement('div');
  new Spinner(spinnerContainer, { size: 'lg', label: label || 'Loading...' });
  overlay.appendChild(spinnerContainer);

  document.body.appendChild(overlay);

  // Return cleanup function
  return () => {
    overlay.style.animation = 'ferni-fade-out 0.2s ease';
    setTimeout(() => overlay.remove(), 200);
  };
}
