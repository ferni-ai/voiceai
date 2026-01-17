/**
 * Textarea Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';

interface TextareaProps {
  label?: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
  disabled?: boolean;
}

const SIZE_CONFIG = {
  sm: { padding: '8px 12px', fontSize: '14px' },
  md: { padding: '10px 14px', fontSize: '15px' },
  lg: { padding: '12px 16px', fontSize: '16px' },
};

const createTextarea = (props: TextareaProps): HTMLElement => {
  const container = document.createElement('div');
  const size = props.size || 'md';
  const sizeConfig = SIZE_CONFIG[size];
  
  const borderColor = props.error ? '#a05454' : 'rgba(44, 37, 32, 0.15)';
  const helperColor = props.error ? '#a05454' : '#8A847A';

  container.innerHTML = `
    <div style="width: 400px;">
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
      
      <textarea
        placeholder="${props.placeholder || ''}"
        rows="${props.rows || 4}"
        ${props.maxLength ? `maxlength="${props.maxLength}"` : ''}
        ${props.disabled ? 'disabled' : ''}
        style="
          width: 100%;
          padding: ${sizeConfig.padding};
          font-family: Inter, system-ui, sans-serif;
          font-size: ${sizeConfig.fontSize};
          line-height: 1.6;
          color: #2C2520;
          background: #FFFFFF;
          border: 1px solid ${borderColor};
          border-radius: 8px;
          outline: none;
          resize: vertical;
          min-height: 100px;
          box-sizing: border-box;
          opacity: ${props.disabled ? '0.6' : '1'};
        "
      ></textarea>
      
      <div style="
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-family: Inter, system-ui, sans-serif;
        font-size: 13px;
      ">
        <span style="color: ${helperColor}">${props.error || props.helperText || ''}</span>
        ${props.showCount ? `<span style="color: #8A847A">0${props.maxLength ? `/${props.maxLength}` : ''}</span>` : ''}
      </div>
    </div>
  `;

  return container;
};

const meta: Meta<TextareaProps> = {
  title: 'Components/Textarea',
  tags: ['autodocs'],
  render: (args) => createTextarea(args),
  argTypes: {
    size: { control: { type: 'select' }, options: ['sm', 'md', 'lg'] },
    rows: { control: { type: 'number' } },
    maxLength: { control: { type: 'number' } },
    showCount: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<TextareaProps>;

export const Default: Story = {
  args: {
    label: 'Message',
    placeholder: 'Write your message here...',
    rows: 4,
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Bio',
    placeholder: 'Tell us about yourself',
    helperText: 'Brief description for your profile',
    rows: 3,
  },
};

export const WithError: Story = {
  args: {
    label: 'Description',
    placeholder: 'Enter description',
    error: 'Description is required',
  },
};

export const WithCharacterCount: Story = {
  args: {
    label: 'Tweet',
    placeholder: "What's happening?",
    maxLength: 280,
    showCount: true,
    rows: 3,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Notes',
    placeholder: 'Cannot edit',
    disabled: true,
  },
};
