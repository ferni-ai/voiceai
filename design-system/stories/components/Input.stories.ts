/**
 * Input Component Stories
 * 
 * Form inputs following Ferni's design system.
 */

import type { Meta, StoryObj } from '@storybook/html';

interface InputProps {
  label: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'number';
  helper?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

const createInput = (props: InputProps): HTMLElement => {
  const container = document.createElement('div');
  const hasError = !!props.error;
  
  container.innerHTML = `
    <div class="ferni-input-group" style="
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);
      max-width: 320px;
    ">
      <label style="
        font-family: var(--font-body, Inter, system-ui);
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-primary, #2C2520);
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
      ">
        ${props.label}
        ${props.required ? '<span style="color: var(--color-error, #c45c5c);">*</span>' : ''}
      </label>
      
      <input
        type="${props.type || 'text'}"
        placeholder="${props.placeholder || ''}"
        ${props.disabled ? 'disabled' : ''}
        ${props.required ? 'required' : ''}
        style="
          font-family: var(--font-body, Inter, system-ui);
          font-size: 1rem;
          padding: var(--space-3, 12px) var(--space-4, 16px);
          border-radius: var(--radius-lg, 12px);
          border: 1px solid ${hasError ? 'var(--color-error, #c45c5c)' : 'var(--color-border, #e8e0d8)'};
          background: var(--color-background-elevated, #FFFDFB);
          color: var(--color-text-primary, #2C2520);
          transition: all 0.2s;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          ${props.disabled ? 'opacity: 0.5; cursor: not-allowed;' : ''}
        "
        onfocus="this.style.borderColor='var(--persona-primary, #4a6741)'; this.style.boxShadow='0 0 0 3px var(--persona-glow, rgba(74, 103, 65, 0.15))';"
        onblur="this.style.borderColor='${hasError ? 'var(--color-error, #c45c5c)' : 'var(--color-border, #e8e0d8)'}'; this.style.boxShadow='none';"
      />
      
      ${props.error ? `
        <span style="
          font-size: 0.75rem;
          color: var(--color-error, #c45c5c);
          display: flex;
          align-items: center;
          gap: var(--space-1, 4px);
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          ${props.error}
        </span>
      ` : props.helper ? `
        <span style="
          font-size: 0.75rem;
          color: var(--color-text-muted, #9a8b7a);
        ">${props.helper}</span>
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
    label: { control: 'text' },
    placeholder: { control: 'text' },
    type: {
      control: { type: 'select' },
      options: ['text', 'email', 'password', 'number'],
    },
    helper: { control: 'text' },
    error: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<InputProps>;

export const Default: Story = {
  args: {
    label: 'Email address',
    placeholder: 'you@example.com',
    type: 'email',
  },
};

export const WithHelper: Story = {
  args: {
    label: 'Display name',
    placeholder: 'How should we call you?',
    helper: 'This is how Ferni will address you in conversations.',
  },
};

export const WithError: Story = {
  args: {
    label: 'Email address',
    placeholder: 'you@example.com',
    type: 'email',
    error: 'Please enter a valid email address.',
  },
};

export const Required: Story = {
  args: {
    label: 'Full name',
    placeholder: 'Enter your name',
    required: true,
    helper: 'Required for personalization.',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Email (verified)',
    placeholder: 'you@example.com',
    disabled: true,
  },
};

export const Password: Story = {
  args: {
    label: 'Password',
    placeholder: '••••••••',
    type: 'password',
    helper: 'Must be at least 8 characters.',
  },
};

