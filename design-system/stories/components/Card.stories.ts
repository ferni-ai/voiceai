/**
 * Card Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';

interface CardProps {
  variant?: 'elevated' | 'outlined' | 'filled';
  size?: 'sm' | 'md' | 'lg';
  clickable?: boolean;
  header?: string;
  body?: string;
  footer?: string;
}

const SIZE_PADDING = {
  sm: '12px',
  md: '16px',
  lg: '24px',
};

const VARIANT_STYLES = {
  elevated: {
    background: '#FFFFFF',
    border: 'none',
    shadow: '0 4px 6px rgba(44, 37, 32, 0.07)',
  },
  outlined: {
    background: '#FFFFFF',
    border: '1px solid rgba(44, 37, 32, 0.1)',
    shadow: 'none',
  },
  filled: {
    background: '#F5F1E8',
    border: 'none',
    shadow: 'none',
  },
};

const createCard = (props: CardProps): HTMLElement => {
  const container = document.createElement('div');
  const variant = props.variant || 'elevated';
  const size = props.size || 'md';
  const variantStyle = VARIANT_STYLES[variant];
  const padding = SIZE_PADDING[size];

  container.innerHTML = `
    <div 
      class="ferni-card ${props.clickable ? 'clickable' : ''}"
      style="
        background: ${variantStyle.background};
        border: ${variantStyle.border};
        box-shadow: ${variantStyle.shadow};
        border-radius: 12px;
        overflow: hidden;
        max-width: 400px;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        ${props.clickable ? 'cursor: pointer;' : ''}
      "
    >
      ${props.header ? `
        <div style="
          padding: ${padding};
          border-bottom: 1px solid rgba(44, 37, 32, 0.08);
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          font-weight: 600;
          color: #2C2520;
        ">${props.header}</div>
      ` : ''}
      
      ${props.body ? `
        <div style="
          padding: ${padding};
          font-family: Inter, system-ui, sans-serif;
          color: #5C544A;
          line-height: 1.6;
        ">${props.body}</div>
      ` : ''}
      
      ${props.footer ? `
        <div style="
          padding: ${padding};
          border-top: 1px solid rgba(44, 37, 32, 0.08);
          background: #F5F1E8;
          font-family: Inter, system-ui, sans-serif;
          font-size: 14px;
          color: #8A847A;
        ">${props.footer}</div>
      ` : ''}
    </div>
    
    <style>
      .ferni-card.clickable:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px rgba(44, 37, 32, 0.1) !important;
      }
    </style>
  `;

  return container;
};

const meta: Meta<CardProps> = {
  title: 'Components/Card',
  tags: ['autodocs'],
  render: (args) => createCard(args),
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['elevated', 'outlined', 'filled'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    clickable: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<CardProps>;

export const Elevated: Story = {
  args: {
    variant: 'elevated',
    header: 'Card Title',
    body: 'This is an elevated card with a subtle shadow. It provides visual hierarchy and separates content from the background.',
  },
};

export const Outlined: Story = {
  args: {
    variant: 'outlined',
    header: 'Card Title',
    body: 'This is an outlined card with a border instead of a shadow. Good for secondary content.',
  },
};

export const Filled: Story = {
  args: {
    variant: 'filled',
    header: 'Card Title',
    body: 'This is a filled card with a subtle background. Great for grouping related content.',
  },
};

export const WithFooter: Story = {
  args: {
    variant: 'elevated',
    header: 'Session Summary',
    body: 'You talked about your goals for the week and made progress on your morning routine habit.',
    footer: 'Last updated 2 hours ago',
  },
};

export const Clickable: Story = {
  args: {
    variant: 'elevated',
    header: 'Click Me',
    body: 'This card has a hover effect and cursor pointer, indicating it\'s interactive.',
    clickable: true,
  },
};

export const AllVariants: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 24px; flex-wrap: wrap;';
    
    const variants: Array<'elevated' | 'outlined' | 'filled'> = ['elevated', 'outlined', 'filled'];
    variants.forEach((variant) => {
      container.appendChild(createCard({
        variant,
        header: `${variant.charAt(0).toUpperCase() + variant.slice(1)} Card`,
        body: `This is an example of the ${variant} card variant.`,
      }));
    });
    
    return container;
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 24px;';
    
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    sizes.forEach((size) => {
      container.appendChild(createCard({
        size,
        header: `Size: ${size.toUpperCase()}`,
        body: 'Notice the different padding for each size variant.',
      }));
    });
    
    return container;
  },
};
