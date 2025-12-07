/**
 * Button Component Stories
 * 
 * Various button styles following Ferni's design system.
 */

import type { Meta, StoryObj } from '@storybook/html';
import { within, userEvent, expect } from '@storybook/test';

interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
}

const createButton = (props: ButtonProps): HTMLElement => {
  const container = document.createElement('div');
  
  const baseStyles = `
    font-family: var(--font-body, Inter, system-ui);
    font-weight: 500;
    border-radius: var(--radius-lg, 12px);
    cursor: ${props.disabled || props.loading ? 'not-allowed' : 'pointer'};
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    opacity: ${props.disabled ? '0.5' : '1'};
    ${props.loading ? 'pointer-events: none;' : ''}
  `;
  
  const sizeStyles = {
    sm: 'padding: var(--space-1, 4px) var(--space-3, 12px); font-size: 0.875rem;',
    md: 'padding: var(--space-2, 8px) var(--space-4, 16px); font-size: 1rem;',
    lg: 'padding: var(--space-3, 12px) var(--space-6, 24px); font-size: 1.125rem;',
  };
  
  const variantStyles = {
    primary: `
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
    `,
    secondary: `
      background: transparent;
      color: var(--color-text-primary, #2C2520);
      border: 1px solid var(--color-border, #e8e0d8);
    `,
    ghost: `
      background: transparent;
      color: var(--color-text-secondary, #5a4d43);
      border: none;
    `,
    destructive: `
      background: var(--color-error, #c45c5c);
      color: white;
      border: none;
    `,
  };
  
  const hoverStyles = {
    primary: "this.style.filter='brightness(1.1)'; this.style.transform='translateY(-1px)';",
    secondary: "this.style.background='var(--color-background-muted, #f5f1eb)';",
    ghost: "this.style.background='var(--color-background-muted, #f5f1eb)';",
    destructive: "this.style.filter='brightness(1.1)'; this.style.transform='translateY(-1px)';",
  };
  
  const hoverResetStyles = {
    primary: "this.style.filter='none'; this.style.transform='none';",
    secondary: "this.style.background='transparent';",
    ghost: "this.style.background='transparent';",
    destructive: "this.style.filter='none'; this.style.transform='none';",
  };
  
  const loadingSpinner = props.loading ? `
    <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
      <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
    </svg>
  ` : '';
  
  const iconHtml = props.icon && !props.loading ? props.icon : '';
  
  container.innerHTML = `
    <button
      class="ferni-button ferni-button--${props.variant || 'primary'}"
      ${props.disabled ? 'disabled' : ''}
      style="${baseStyles} ${sizeStyles[props.size || 'md']} ${variantStyles[props.variant || 'primary']}"
      ${!props.disabled && !props.loading ? `
        onmouseenter="${hoverStyles[props.variant || 'primary']}"
        onmouseleave="${hoverResetStyles[props.variant || 'primary']}"
      ` : ''}
    >
      ${loadingSpinner}
      ${iconHtml}
      ${props.label}
    </button>
    
    <style>
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  `;
  
  return container;
};

const meta: Meta<ButtonProps> = {
  title: 'Components/Button',
  tags: ['autodocs'],
  render: (args) => createButton(args),
  argTypes: {
    label: { control: 'text' },
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'ghost', 'destructive'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<ButtonProps>;

export const Primary: Story = {
  args: {
    label: 'Start conversation',
    variant: 'primary',
    size: 'md',
  },
};

export const Secondary: Story = {
  args: {
    label: 'Cancel',
    variant: 'secondary',
    size: 'md',
  },
};

export const Ghost: Story = {
  args: {
    label: 'Learn more',
    variant: 'ghost',
    size: 'md',
  },
};

export const Destructive: Story = {
  args: {
    label: 'Delete account',
    variant: 'destructive',
    size: 'md',
  },
};

export const Loading: Story = {
  args: {
    label: 'Connecting...',
    variant: 'primary',
    loading: true,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Unavailable',
    variant: 'primary',
    disabled: true,
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 16px; align-items: center;';
    
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    
    sizes.forEach(size => {
      container.appendChild(createButton({ label: size.toUpperCase(), size, variant: 'primary' }));
    });
    
    return container;
  },
};

export const AllVariants: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 16px; flex-wrap: wrap;';
    
    const variants: Array<'primary' | 'secondary' | 'ghost' | 'destructive'> = 
      ['primary', 'secondary', 'ghost', 'destructive'];
    
    variants.forEach(variant => {
      container.appendChild(createButton({ 
        label: variant.charAt(0).toUpperCase() + variant.slice(1), 
        variant 
      }));
    });
    
    return container;
  },
};

// Interaction test
export const WithInteraction: Story = {
  args: {
    label: 'Click me',
    variant: 'primary',
    size: 'md',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');
    
    // Verify button exists and is enabled
    await expect(button).toBeEnabled();
    
    // Click the button
    await userEvent.click(button);
    
    // Hover over button
    await userEvent.hover(button);
    
    // Unhover
    await userEvent.unhover(button);
  },
};
