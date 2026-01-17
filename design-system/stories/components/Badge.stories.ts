/**
 * Badge Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';

interface BadgeProps {
  text: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  pulse?: boolean;
}

const SIZE_CONFIG = {
  sm: { padding: '2px 8px', fontSize: '11px', dotSize: '6px' },
  md: { padding: '4px 10px', fontSize: '12px', dotSize: '8px' },
  lg: { padding: '6px 12px', fontSize: '13px', dotSize: '10px' },
};

const VARIANT_COLORS = {
  default: { bg: '#F5F1E8', text: '#5C544A', dot: '#8A847A' },
  success: { bg: 'rgba(74, 103, 65, 0.1)', text: '#4a6741', dot: '#4a6741' },
  warning: { bg: 'rgba(160, 128, 84, 0.1)', text: '#a08054', dot: '#a08054' },
  error: { bg: 'rgba(160, 84, 84, 0.1)', text: '#a05454', dot: '#a05454' },
  info: { bg: 'rgba(84, 96, 128, 0.1)', text: '#546080', dot: '#546080' },
};

const createBadge = (props: BadgeProps): HTMLElement => {
  const container = document.createElement('div');
  const size = props.size || 'md';
  const variant = props.variant || 'default';
  const sizeConfig = SIZE_CONFIG[size];
  const colors = VARIANT_COLORS[variant];

  container.innerHTML = `
    <span style="
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: ${sizeConfig.padding};
      font-family: Inter, system-ui, sans-serif;
      font-size: ${sizeConfig.fontSize};
      font-weight: 500;
      color: ${colors.text};
      background: ${colors.bg};
      border-radius: 9999px;
      white-space: nowrap;
    ">
      ${props.dot ? `
        <span style="
          width: ${sizeConfig.dotSize};
          height: ${sizeConfig.dotSize};
          border-radius: 50%;
          background: ${colors.dot};
          ${props.pulse ? 'animation: pulse 2s ease-in-out infinite;' : ''}
        "></span>
      ` : ''}
      ${props.text}
    </span>
    
    ${props.pulse ? `
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
      </style>
    ` : ''}
  `;

  return container;
};

const meta: Meta<BadgeProps> = {
  title: 'Components/Badge',
  tags: ['autodocs'],
  render: (args) => createBadge(args),
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'success', 'warning', 'error', 'info'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    dot: { control: 'boolean' },
    pulse: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<BadgeProps>;

export const Default: Story = {
  args: {
    text: 'Badge',
    variant: 'default',
  },
};

export const Success: Story = {
  args: {
    text: 'Active',
    variant: 'success',
    dot: true,
  },
};

export const Warning: Story = {
  args: {
    text: 'Pending',
    variant: 'warning',
    dot: true,
  },
};

export const Error: Story = {
  args: {
    text: 'Offline',
    variant: 'error',
    dot: true,
  },
};

export const Pulsing: Story = {
  args: {
    text: 'Live',
    variant: 'success',
    dot: true,
    pulse: true,
  },
};

export const AllVariants: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap;';
    
    const variants: Array<'default' | 'success' | 'warning' | 'error' | 'info'> = [
      'default', 'success', 'warning', 'error', 'info'
    ];
    
    variants.forEach((variant) => {
      container.appendChild(createBadge({ 
        text: variant.charAt(0).toUpperCase() + variant.slice(1), 
        variant,
        dot: true
      }));
    });
    
    return container;
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 12px; align-items: center;';
    
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    sizes.forEach((size) => {
      container.appendChild(createBadge({ 
        text: size.toUpperCase(), 
        variant: 'success',
        size
      }));
    });
    
    return container;
  },
};
