/**
 * Input Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';

interface InputProps {
  label?: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  success?: string;
  size?: 'sm' | 'md' | 'lg';
  type?: string;
  disabled?: boolean;
  required?: boolean;
}

const SIZE_CONFIG = {
  sm: { padding: '8px 12px', fontSize: '14px', height: '36px' },
  md: { padding: '10px 14px', fontSize: '15px', height: '44px' },
  lg: { padding: '12px 16px', fontSize: '16px', height: '52px' },
};

const createInput = (props: InputProps): HTMLElement => {
  const container = document.createElement('div');
  const size = props.size || 'md';
  const sizeConfig = SIZE_CONFIG[size];
  
  let borderColor = 'rgba(44, 37, 32, 0.15)';
  let helperColor = '#8A847A';
  
  if (props.error) {
    borderColor = '#a05454';
    helperColor = '#a05454';
  } else if (props.success) {
    borderColor = '#4a6741';
    helperColor = '#4a6741';
  }

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
        ">${props.label}${props.required ? ' *' : ''}</label>
      ` : ''}
      
      <input
        type="${props.type || 'text'}"
        placeholder="${props.placeholder || ''}"
        ${props.disabled ? 'disabled' : ''}
        ${props.required ? 'required' : ''}
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
          box-sizing: border-box;
          height: ${sizeConfig.height};
          opacity: ${props.disabled ? '0.6' : '1'};
          cursor: ${props.disabled ? 'not-allowed' : 'text'};
        "
      />
      
      ${props.error || props.success || props.helperText ? `
        <span style="
          display: block;
          margin-top: 6px;
          font-family: Inter, system-ui, sans-serif;
          font-size: 13px;
          color: ${helperColor};
        ">${props.error || props.success || props.helperText}</span>
      ` : ''}
    </div>
  `;

  return container;
};

const meta: Meta<InputProps> = {
  title: 'Components/Input',
  tags: ['autodocs'],
  render: (args) => createInput(args),
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    type: {
      control: { type: 'select' },
      options: ['text', 'email', 'password', 'search', 'tel', 'url'],
    },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<InputProps>;

export const Default: Story = {
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    size: 'md',
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Password',
    type: 'password',
    placeholder: 'Enter password',
    helperText: 'Must be at least 8 characters',
  },
};

export const WithError: Story = {
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    error: 'Please enter a valid email address',
  },
};

export const WithSuccess: Story = {
  args: {
    label: 'Username',
    placeholder: 'Choose a username',
    success: 'Username is available!',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Input',
    placeholder: 'Cannot edit',
    disabled: true,
  },
};

export const Required: Story = {
  args: {
    label: 'Required Field',
    placeholder: 'This field is required',
    required: true,
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
    
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    sizes.forEach((size) => {
      container.appendChild(createInput({ 
        label: `Size: ${size.toUpperCase()}`, 
        placeholder: 'Enter text',
        size 
      }));
    });
    
    return container;
  },
};
