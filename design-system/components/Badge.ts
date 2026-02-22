/**
 * Ferni Badge Component
 * 
 * Status indicator with brand-compliant styling.
 */

// =============================================================================
// Types
// =============================================================================

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'persona';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeOptions {
  /** Badge text */
  text: string;
  /** Badge variant */
  variant?: BadgeVariant;
  /** Badge size */
  size?: BadgeSize;
  /** Persona for persona variant */
  persona?: 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';
  /** Show dot indicator */
  dot?: boolean;
  /** Pulsing animation */
  pulse?: boolean;
  /** Click handler */
  onClick?: () => void;
}

// =============================================================================
// Styles
// =============================================================================

const SIZE_CONFIG: Record<BadgeSize, { padding: string; fontSize: string; dotSize: string }> = {
  sm: { padding: '2px 8px', fontSize: '11px', dotSize: '6px' },
  md: { padding: '4px 10px', fontSize: '12px', dotSize: '8px' },
  lg: { padding: '6px 12px', fontSize: '13px', dotSize: '10px' },
};

const VARIANT_COLORS: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  default: {
    bg: 'var(--color-background-subtle, #F5F1E8)',
    text: 'var(--color-text-secondary, #5C544A)',
    dot: 'var(--color-text-muted, #8A847A)',
  },
  success: {
    bg: 'rgba(74, 103, 65, 0.1)',
    text: 'var(--color-success, #4a6741)',
    dot: 'var(--color-success, #4a6741)',
  },
  warning: {
    bg: 'rgba(160, 128, 84, 0.1)',
    text: 'var(--color-warning, #a08054)',
    dot: 'var(--color-warning, #a08054)',
  },
  error: {
    bg: 'rgba(160, 84, 84, 0.1)',
    text: 'var(--color-error, #a05454)',
    dot: 'var(--color-error, #a05454)',
  },
  info: {
    bg: 'rgba(84, 96, 128, 0.1)',
    text: 'var(--color-info, #546080)',
    dot: 'var(--color-info, #546080)',
  },
  persona: {
    bg: 'rgba(74, 103, 65, 0.1)',
    text: '#4a6741',
    dot: '#4a6741',
  },
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
// Badge Class
// =============================================================================

export class Badge {
  private container: HTMLElement;
  private badgeEl: HTMLElement;
  private options: BadgeOptions;

  constructor(container: HTMLElement, options: BadgeOptions) {
    this.container = container;
    this.options = {
      variant: 'default',
      size: 'md',
      dot: false,
      pulse: false,
      ...options,
    };

    this.badgeEl = document.createElement('span');
    this.render();
  }

  private render(): void {
    const { text, variant, size, persona, dot, pulse, onClick } = this.options;
    const sizeConfig = SIZE_CONFIG[size || 'md'];
    
    // Get colors (handle persona variant)
    let colors = VARIANT_COLORS[variant || 'default'];
    if (variant === 'persona' && persona) {
      const personaColor = PERSONA_COLORS[persona] ?? '#4a6741';
      colors = {
        bg: `${personaColor}15`,
        text: personaColor,
        dot: personaColor,
      };
    }

    // Clear container
    this.container.innerHTML = '';

    // Badge element
    this.badgeEl.className = 'ferni-badge';
    this.badgeEl.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: ${sizeConfig.padding};
      font-family: var(--font-body, Inter, system-ui, sans-serif);
      font-size: ${sizeConfig.fontSize};
      font-weight: 500;
      color: ${colors.text};
      background: ${colors.bg};
      border-radius: var(--radius-full, 9999px);
      white-space: nowrap;
      ${onClick ? 'cursor: pointer;' : ''}
      transition: transform 0.15s ease, opacity 0.15s ease;
    `;

    // Hover effect if clickable
    if (onClick) {
      this.badgeEl.addEventListener('mouseenter', () => {
        this.badgeEl.style.transform = 'scale(1.02)';
      });
      this.badgeEl.addEventListener('mouseleave', () => {
        this.badgeEl.style.transform = 'scale(1)';
      });
      this.badgeEl.addEventListener('click', onClick);
    }

    // Dot indicator
    if (dot) {
      const dotEl = document.createElement('span');
      dotEl.className = 'ferni-badge-dot';
      dotEl.style.cssText = `
        width: ${sizeConfig.dotSize};
        height: ${sizeConfig.dotSize};
        border-radius: 50%;
        background: ${colors.dot};
        ${pulse ? 'animation: ferni-badge-pulse 2s ease-in-out infinite;' : ''}
      `;
      this.badgeEl.appendChild(dotEl);
    }

    // Text
    const textEl = document.createElement('span');
    textEl.textContent = text;
    this.badgeEl.appendChild(textEl);

    // Inject animation if needed
    if (pulse) {
      this.injectStyles();
    }

    this.container.appendChild(this.badgeEl);
  }

  private injectStyles(): void {
    const styleId = 'ferni-badge-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ferni-badge-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(1.1); }
      }
      
      @media (prefers-reduced-motion: reduce) {
        .ferni-badge-dot {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Public API
  setText(text: string): void {
    this.options.text = text;
    this.render();
  }

  setVariant(variant: BadgeVariant): void {
    this.options.variant = variant;
    this.render();
  }

  getElement(): HTMLElement {
    return this.badgeEl;
  }
}

/**
 * Create a badge (convenience function)
 */
export function createBadge(container: HTMLElement, options: BadgeOptions): Badge {
  return new Badge(container, options);
}
