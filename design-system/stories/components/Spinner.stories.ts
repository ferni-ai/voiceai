/**
 * Spinner Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  persona?: string;
  label?: string;
}

const SIZE_CONFIG = {
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

const createSpinner = (props: SpinnerProps): HTMLElement => {
  const container = document.createElement('div');
  const size = props.size || 'md';
  const sizeConfig = SIZE_CONFIG[size];
  const color = props.persona ? PERSONA_COLORS[props.persona] : '#4a6741';
  const radius = (sizeConfig.size - sizeConfig.stroke) / 2;
  const circumference = radius * 2 * Math.PI;

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      <svg
        width="${sizeConfig.size}"
        height="${sizeConfig.size}"
        viewBox="0 0 ${sizeConfig.size} ${sizeConfig.size}"
        style="animation: spin 1s linear infinite;"
      >
        <circle
          cx="${sizeConfig.size / 2}"
          cy="${sizeConfig.size / 2}"
          r="${radius}"
          fill="none"
          stroke="${color}"
          stroke-width="${sizeConfig.stroke}"
          stroke-linecap="round"
          style="
            stroke-dasharray: ${circumference};
            stroke-dashoffset: ${circumference * 0.75};
          "
        />
      </svg>
      ${props.label ? `
        <span style="
          font-family: Inter, system-ui, sans-serif;
          font-size: 14px;
          color: #5C544A;
        ">${props.label}</span>
      ` : ''}
    </div>
    
    <style>
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  `;

  return container;
};

const meta: Meta<SpinnerProps> = {
  title: 'Components/Spinner',
  tags: ['autodocs'],
  render: (args) => createSpinner(args),
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    persona: {
      control: { type: 'select' },
      options: ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'],
    },
  },
};

export default meta;
type Story = StoryObj<SpinnerProps>;

export const Default: Story = {
  args: {
    size: 'md',
  },
};

export const WithLabel: Story = {
  args: {
    size: 'lg',
    label: 'Loading...',
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 24px; align-items: flex-end;';
    
    const sizes: Array<'xs' | 'sm' | 'md' | 'lg' | 'xl'> = ['xs', 'sm', 'md', 'lg', 'xl'];
    sizes.forEach((size) => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      wrapper.appendChild(createSpinner({ size }));
      const label = document.createElement('div');
      label.style.cssText = 'font-size: 12px; color: #8A847A; margin-top: 8px;';
      label.textContent = size.toUpperCase();
      wrapper.appendChild(label);
      container.appendChild(wrapper);
    });
    
    return container;
  },
};

export const Personas: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 24px;';
    
    const personas = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'];
    personas.forEach((persona) => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      wrapper.appendChild(createSpinner({ size: 'lg', persona }));
      const label = document.createElement('div');
      label.style.cssText = 'font-size: 12px; color: #8A847A; margin-top: 8px; text-transform: capitalize;';
      label.textContent = persona;
      wrapper.appendChild(label);
      container.appendChild(wrapper);
    });
    
    return container;
  },
};
