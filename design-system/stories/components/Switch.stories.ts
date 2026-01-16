/**
 * Switch Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';

interface SwitchProps {
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  checked?: boolean;
  disabled?: boolean;
  persona?: string;
}

const SIZE_CONFIG = {
  sm: { track: { width: 36, height: 20 }, thumb: 16, translate: 16 },
  md: { track: { width: 44, height: 24 }, thumb: 20, translate: 20 },
  lg: { track: { width: 52, height: 28 }, thumb: 24, translate: 24 },
};

const PERSONA_COLORS: Record<string, string> = {
  ferni: '#4a6741',
  peter: '#3a6b73',
  alex: '#5a6b8a',
  maya: '#a67a6a',
  jordan: '#c4856a',
  nayan: '#b8956a',
};

const createSwitch = (props: SwitchProps): HTMLElement => {
  const container = document.createElement('div');
  const size = props.size || 'md';
  const sizeConfig = SIZE_CONFIG[size];
  const color = PERSONA_COLORS[props.persona || 'ferni'];
  const isChecked = props.checked ?? false;

  const switchId = `switch-${Math.random().toString(36).slice(2)}`;

  container.innerHTML = `
    <label style="
      display: flex;
      align-items: flex-start;
      gap: 12px;
      cursor: ${props.disabled ? 'not-allowed' : 'pointer'};
      opacity: ${props.disabled ? '0.6' : '1'};
    ">
      <input 
        type="checkbox" 
        id="${switchId}"
        ${isChecked ? 'checked' : ''}
        ${props.disabled ? 'disabled' : ''}
        style="
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        "
      />
      
      <div class="switch-track" style="
        position: relative;
        width: ${sizeConfig.track.width}px;
        height: ${sizeConfig.track.height}px;
        background: ${isChecked ? color : '#E8E4DC'};
        border-radius: ${sizeConfig.track.height}px;
        transition: background 0.2s ease;
        flex-shrink: 0;
      ">
        <div class="switch-thumb" style="
          position: absolute;
          top: ${(sizeConfig.track.height - sizeConfig.thumb) / 2}px;
          left: ${isChecked ? sizeConfig.translate : 2}px;
          width: ${sizeConfig.thumb}px;
          height: ${sizeConfig.thumb}px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          transition: left 0.2s ease;
        "></div>
      </div>
      
      ${props.label || props.description ? `
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${props.label ? `
            <span style="
              font-family: Inter, system-ui, sans-serif;
              font-size: 14px;
              font-weight: 500;
              color: #2C2520;
            ">${props.label}</span>
          ` : ''}
          ${props.description ? `
            <span style="
              font-family: Inter, system-ui, sans-serif;
              font-size: 13px;
              color: #8A847A;
            ">${props.description}</span>
          ` : ''}
        </div>
      ` : ''}
    </label>
  `;

  // Add interactivity
  const input = container.querySelector('input') as HTMLInputElement;
  const track = container.querySelector('.switch-track') as HTMLElement;
  const thumb = container.querySelector('.switch-thumb') as HTMLElement;

  if (input && track && thumb && !props.disabled) {
    input.addEventListener('change', () => {
      track.style.background = input.checked ? color : '#E8E4DC';
      thumb.style.left = `${input.checked ? sizeConfig.translate : 2}px`;
    });
  }

  return container;
};

const meta: Meta<SwitchProps> = {
  title: 'Components/Switch',
  tags: ['autodocs'],
  render: (args) => createSwitch(args),
  argTypes: {
    size: { control: { type: 'select' }, options: ['sm', 'md', 'lg'] },
    persona: { control: { type: 'select' }, options: ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'] },
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<SwitchProps>;

export const Default: Story = {
  args: {
    label: 'Notifications',
    description: 'Receive push notifications',
  },
};

export const Checked: Story = {
  args: {
    label: 'Dark Mode',
    checked: true,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Premium Feature',
    description: 'Upgrade to enable',
    disabled: true,
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
    
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    sizes.forEach((size) => {
      container.appendChild(createSwitch({
        label: `Size: ${size.toUpperCase()}`,
        size,
        checked: true,
      }));
    });
    
    return container;
  },
};

export const Personas: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
    
    const personas = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'];
    personas.forEach((persona) => {
      container.appendChild(createSwitch({
        label: persona.charAt(0).toUpperCase() + persona.slice(1),
        persona,
        checked: true,
      }));
    });
    
    return container;
  },
};

export const WithoutLabel: Story = {
  args: {
    checked: true,
  },
};
