/**
 * Tooltip Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';

interface TooltipDemoProps {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const createTooltipDemo = (props: TooltipDemoProps): HTMLElement => {
  const container = document.createElement('div');
  container.style.cssText = 'padding: 80px; display: flex; justify-content: center;';
  
  const button = document.createElement('button');
  button.textContent = 'Hover me';
  button.style.cssText = `
    padding: 12px 24px;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: white;
    background: #4a6741;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
  `;

  const tooltip = document.createElement('div');
  tooltip.textContent = props.content;
  tooltip.style.cssText = `
    position: absolute;
    padding: 8px 12px;
    font-family: Inter, system-ui, sans-serif;
    font-size: 13px;
    color: #FFFCF8;
    background: #2C2520;
    border-radius: 8px;
    box-shadow: 0 10px 15px rgba(44, 37, 32, 0.15);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease, transform 0.15s ease;
    z-index: 1000;
  `;

  // Position the tooltip
  const position = props.position || 'top';
  switch (position) {
    case 'top':
      tooltip.style.bottom = '100%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%) translateY(-8px)';
      break;
    case 'bottom':
      tooltip.style.top = '100%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%) translateY(8px)';
      break;
    case 'left':
      tooltip.style.right = '100%';
      tooltip.style.top = '50%';
      tooltip.style.transform = 'translateY(-50%) translateX(-8px)';
      break;
    case 'right':
      tooltip.style.left = '100%';
      tooltip.style.top = '50%';
      tooltip.style.transform = 'translateY(-50%) translateX(8px)';
      break;
  }

  button.appendChild(tooltip);

  button.addEventListener('mouseenter', () => {
    tooltip.style.opacity = '1';
  });
  button.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
  });

  container.appendChild(button);
  return container;
};

const meta: Meta<TooltipDemoProps> = {
  title: 'Components/Tooltip',
  tags: ['autodocs'],
  render: (args) => createTooltipDemo(args),
  argTypes: {
    position: {
      control: { type: 'select' },
      options: ['top', 'bottom', 'left', 'right'],
    },
  },
};

export default meta;
type Story = StoryObj<TooltipDemoProps>;

export const Top: Story = {
  args: {
    content: 'Tooltip on top',
    position: 'top',
  },
};

export const Bottom: Story = {
  args: {
    content: 'Tooltip on bottom',
    position: 'bottom',
  },
};

export const Left: Story = {
  args: {
    content: 'Tooltip on left',
    position: 'left',
  },
};

export const Right: Story = {
  args: {
    content: 'Tooltip on right',
    position: 'right',
  },
};

export const AllPositions: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = `
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      padding: 40px;
    `;
    
    const positions: Array<'top' | 'bottom' | 'left' | 'right'> = ['top', 'bottom', 'left', 'right'];
    positions.forEach((position) => {
      const demo = createTooltipDemo({ content: `Position: ${position}`, position });
      demo.style.padding = '60px';
      container.appendChild(demo);
    });
    
    return container;
  },
};

export const LongContent: Story = {
  args: {
    content: 'This is a longer tooltip with more content that might wrap to multiple lines',
    position: 'top',
  },
};
