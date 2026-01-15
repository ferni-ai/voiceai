/**
 * Ferni Card Component
 * 
 * Elevated content container with brand-compliant styling.
 */

// =============================================================================
// Types
// =============================================================================

export type CardVariant = 'elevated' | 'outlined' | 'filled';
export type CardSize = 'sm' | 'md' | 'lg';

export interface CardOptions {
  /** Card variant */
  variant?: CardVariant;
  /** Card size (affects padding) */
  size?: CardSize;
  /** Make card clickable */
  clickable?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Header content */
  header?: string | HTMLElement;
  /** Body content */
  body?: string | HTMLElement;
  /** Footer content */
  footer?: string | HTMLElement;
}

// =============================================================================
// Styles
// =============================================================================

const SIZE_PADDING = {
  sm: '12px',
  md: '16px',
  lg: '24px',
};

const VARIANT_STYLES: Record<CardVariant, { background: string; border: string; shadow: string }> = {
  elevated: {
    background: 'var(--color-background-elevated, #FFFFFF)',
    border: 'none',
    shadow: 'var(--shadow-md, 0 4px 6px rgba(44, 37, 32, 0.07))',
  },
  outlined: {
    background: 'var(--color-background-elevated, #FFFFFF)',
    border: '1px solid var(--color-border, rgba(44, 37, 32, 0.1))',
    shadow: 'none',
  },
  filled: {
    background: 'var(--color-background-subtle, #F5F1E8)',
    border: 'none',
    shadow: 'none',
  },
};

// =============================================================================
// Card Class
// =============================================================================

export class Card {
  private container: HTMLElement;
  private cardEl: HTMLElement;
  private options: CardOptions;

  constructor(container: HTMLElement, options: CardOptions = {}) {
    this.container = container;
    this.options = {
      variant: 'elevated',
      size: 'md',
      clickable: false,
      ...options,
    };

    this.cardEl = document.createElement('div');
    this.render();
  }

  private render(): void {
    const { variant, size, clickable, onClick, className, header, body, footer } = this.options;
    const variantStyle = VARIANT_STYLES[variant || 'elevated'];
    const padding = SIZE_PADDING[size || 'md'];

    // Clear container
    this.container.innerHTML = '';

    // Card element
    this.cardEl.className = `ferni-card ${className || ''}`.trim();
    this.cardEl.style.cssText = `
      background: ${variantStyle.background};
      border: ${variantStyle.border};
      box-shadow: ${variantStyle.shadow};
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      ${clickable ? 'cursor: pointer;' : ''}
    `;

    // Hover effect for clickable cards
    if (clickable) {
      this.cardEl.addEventListener('mouseenter', () => {
        this.cardEl.style.transform = 'translateY(-2px)';
        this.cardEl.style.boxShadow = 'var(--shadow-lg, 0 10px 15px rgba(44, 37, 32, 0.1))';
      });
      this.cardEl.addEventListener('mouseleave', () => {
        this.cardEl.style.transform = 'translateY(0)';
        this.cardEl.style.boxShadow = variantStyle.shadow;
      });
      if (onClick) {
        this.cardEl.addEventListener('click', onClick);
      }
    }

    // Header
    if (header) {
      const headerEl = document.createElement('div');
      headerEl.className = 'ferni-card-header';
      headerEl.style.cssText = `
        padding: ${padding};
        border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
        font-family: var(--font-display, 'Plus Jakarta Sans', system-ui, sans-serif);
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
      `;
      if (typeof header === 'string') {
        headerEl.textContent = header;
      } else {
        headerEl.appendChild(header);
      }
      this.cardEl.appendChild(headerEl);
    }

    // Body
    if (body) {
      const bodyEl = document.createElement('div');
      bodyEl.className = 'ferni-card-body';
      bodyEl.style.cssText = `
        padding: ${padding};
        font-family: var(--font-body, Inter, system-ui, sans-serif);
        color: var(--color-text-secondary, #5C544A);
        line-height: 1.6;
      `;
      if (typeof body === 'string') {
        bodyEl.textContent = body;
      } else {
        bodyEl.appendChild(body);
      }
      this.cardEl.appendChild(bodyEl);
    }

    // Footer
    if (footer) {
      const footerEl = document.createElement('div');
      footerEl.className = 'ferni-card-footer';
      footerEl.style.cssText = `
        padding: ${padding};
        border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
        background: var(--color-background-subtle, #F5F1E8);
      `;
      if (typeof footer === 'string') {
        footerEl.textContent = footer;
      } else {
        footerEl.appendChild(footer);
      }
      this.cardEl.appendChild(footerEl);
    }

    this.container.appendChild(this.cardEl);
  }

  // Public API
  setHeader(content: string | HTMLElement): void {
    this.options.header = content;
    this.render();
  }

  setBody(content: string | HTMLElement): void {
    this.options.body = content;
    this.render();
  }

  setFooter(content: string | HTMLElement): void {
    this.options.footer = content;
    this.render();
  }

  getElement(): HTMLElement {
    return this.cardEl;
  }
}

/**
 * Create a card (convenience function)
 */
export function createCard(container: HTMLElement, options?: CardOptions): Card {
  return new Card(container, options);
}
