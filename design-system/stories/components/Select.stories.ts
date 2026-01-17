/**
 * Select Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';

interface SelectProps {
  label?: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  options?: Array<{ value: string; label: string }>;
}

const SIZE_CONFIG = {
  sm: { padding: '8px 32px 8px 12px', fontSize: '14px', height: '36px' },
  md: { padding: '10px 36px 10px 14px', fontSize: '15px', height: '44px' },
  lg: { padding: '12px 40px 12px 16px', fontSize: '16px', height: '52px' },
};

const createSelect = (props: SelectProps): HTMLElement => {
  const container = document.createElement('div');
  const size = props.size || 'md';
  const sizeConfig = SIZE_CONFIG[size];
  
  const borderColor = props.error ? '#a05454' : 'rgba(44, 37, 32, 0.15)';
  const helperColor = props.error ? '#a05454' : '#8A847A';
  
  const options = props.options || [
    { value: 'ferni', label: 'Ferni - Life Coach' },
    { value: 'maya', label: 'Maya - Habits & Routines' },
    { value: 'peter', label: 'Peter - Research' },
    { value: 'alex', label: 'Alex - Communications' },
    { value: 'jordan', label: 'Jordan - Events' },
    { value: 'nayan', label: 'Nayan - Wisdom' },
  ];

  container.innerHTML = `
    <div style="width: 300px;">
      ${props.label ? `
        <label style="
          display: block;
          margin-bottom: 6px;
          font-family: Inter, system-ui, sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #2C2520;
        ">${props.label}</label>
      ` : ''}
      
      <div style="position: relative;">
        <select
          ${props.disabled ? 'disabled' : ''}
          style="
            width: 100%;
            padding: ${sizeConfig.padding};
            font-family: Inter, system-ui, sans-serif;
            font-size: ${sizeConfig.fontSize};
            color: #2C2520;
            background: #FFFFFF;
            border: 1px solid ${borderColor};
            border-radius: 8px;
            outline: none;
            cursor: ${props.disabled ? 'not-allowed' : 'pointer'};
            appearance: none;
            -webkit-appearance: none;
            height: ${sizeConfig.height};
            opacity: ${props.disabled ? '0.6' : '1'};
          "
        >
          ${props.placeholder ? `<option value="" disabled selected>${props.placeholder}</option>` : ''}
          ${options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
        </select>
        
        <div style="
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          color: #8A847A;
        ">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      
      ${props.error || props.helperText ? `
        <span style="
          display: block;
          margin-top: 6px;
          font-family: Inter, system-ui, sans-serif;
          font-size: 13px;
          color: ${helperColor};
        ">${props.error || props.helperText}</span>
      ` : ''}
    </div>
  `;

  return container;
};

const meta: Meta<SelectProps> = {
  title: 'Components/Select',
  tags: ['autodocs'],
  render: (args) => createSelect(args),
  argTypes: {
    size: { control: { type: 'select' }, options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<SelectProps>;

export const Default: Story = {
  args: {
    label: 'Team Member',
    placeholder: 'Choose a team member',
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Primary Persona',
    placeholder: 'Select persona',
    helperText: 'This will be your default coach',
  },
};

export const WithError: Story = {
  args: {
    label: 'Country',
    placeholder: 'Select country',
    error: 'Please select a country',
    options: [
      { value: 'us', label: 'United States' },
      { value: 'ca', label: 'Canada' },
      { value: 'uk', label: 'United Kingdom' },
    ],
  },
};

export const Disabled: Story = {
  args: {
    label: 'Role',
    placeholder: 'Select role',
    disabled: true,
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
    
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    sizes.forEach((size) => {
      container.appendChild(createSelect({
        label: `Size: ${size.toUpperCase()}`,
        placeholder: 'Select option',
        size,
        options: [
          { value: '1', label: 'Option 1' },
          { value: '2', label: 'Option 2' },
        ],
      }));
    });
    
    return container;
  },
};
