/**
 * Toast Component Stories
 * 
 * Notification toasts following Ferni's design system.
 */

import type { Meta, StoryObj } from '@storybook/html';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  dismissible?: boolean;
  duration?: number;
}

const TOAST_CONFIGS = {
  success: {
    bgColor: 'rgba(74, 103, 65, 0.1)',
    borderColor: '#4a6741',
    iconColor: '#4a6741',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>`,
  },
  error: {
    bgColor: 'rgba(196, 92, 92, 0.1)',
    borderColor: '#c45c5c',
    iconColor: '#c45c5c',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>`,
  },
  warning: {
    bgColor: 'rgba(196, 133, 106, 0.1)',
    borderColor: '#c4856a',
    iconColor: '#c4856a',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>`,
  },
  info: {
    bgColor: 'rgba(58, 107, 115, 0.1)',
    borderColor: '#3a6b73',
    iconColor: '#3a6b73',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>`,
  },
};

const createToast = (props: ToastProps): HTMLElement => {
  const container = document.createElement('div');
  const config = TOAST_CONFIGS[props.type || 'info'];
  
  container.innerHTML = `
    <div class="ferni-toast" style="
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: ${config.bgColor};
      border-left: 3px solid ${config.borderColor};
      border-radius: var(--radius-lg, 12px);
      box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
      max-width: 400px;
      animation: toastSlideIn 0.3s ease-out;
      position: relative;
    ">
      <div style="color: ${config.iconColor}; flex-shrink: 0; margin-top: 2px;">
        ${config.icon}
      </div>
      
      <div style="flex: 1; min-width: 0;">
        ${props.title ? `
          <div style="
            font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
            font-weight: 600;
            font-size: 0.875rem;
            color: var(--color-text-primary, #2C2520);
            margin-bottom: var(--space-1, 4px);
          ">${props.title}</div>
        ` : ''}
        <div style="
          font-family: var(--font-body, Inter, system-ui);
          font-size: 0.875rem;
          color: var(--color-text-secondary, #5a4d43);
          line-height: 1.5;
        ">${props.message}</div>
      </div>
      
      ${props.dismissible ? `
        <button style="
          background: none;
          border: none;
          cursor: pointer;
          padding: var(--space-1, 4px);
          color: var(--color-text-muted, #9a8b7a);
          transition: color 0.2s;
          flex-shrink: 0;
        " aria-label="Dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      ` : ''}
      
      ${props.duration ? `
        <div style="
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: ${config.borderColor};
          border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
          animation: toastProgress ${props.duration}ms linear forwards;
        "></div>
      ` : ''}
    </div>
    
    <style>
      @keyframes toastSlideIn {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      @keyframes toastProgress {
        from { transform: scaleX(1); transform-origin: left; }
        to { transform: scaleX(0); transform-origin: left; }
      }
    </style>
  `;
  
  return container;
};

const meta: Meta<ToastProps> = {
  title: 'Components/Toast',
  tags: ['autodocs'],
  render: (args) => createToast(args),
  argTypes: {
    message: { control: 'text' },
    title: { control: 'text' },
    type: {
      control: { type: 'select' },
      options: ['success', 'error', 'warning', 'info'],
    },
    dismissible: { control: 'boolean' },
    duration: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<ToastProps>;

export const Success: Story = {
  args: {
    message: 'Your progress has been saved successfully.',
    type: 'success',
    dismissible: true,
  },
};

export const Error: Story = {
  args: {
    title: 'Connection failed',
    message: 'Unable to connect to the server. Please check your internet connection.',
    type: 'error',
    dismissible: true,
  },
};

export const Warning: Story = {
  args: {
    title: 'Session expiring',
    message: 'Your session will expire in 5 minutes. Save your work to avoid losing changes.',
    type: 'warning',
    dismissible: true,
  },
};

export const Info: Story = {
  args: {
    message: 'New team member Maya Santos is now available!',
    type: 'info',
    dismissible: true,
  },
};

export const WithDuration: Story = {
  args: {
    message: 'This notification will auto-dismiss.',
    type: 'success',
    duration: 5000,
    dismissible: false,
  },
};

export const AllTypes: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
    
    const toasts = [
      { message: 'Great job completing your ritual!', type: 'success' as const },
      { message: 'Failed to save your progress.', type: 'error' as const },
      { message: 'Your free messages are running low.', type: 'warning' as const },
      { message: 'Ferni learned something new about you.', type: 'info' as const },
    ];
    
    toasts.forEach(t => {
      container.appendChild(createToast({ ...t, dismissible: true }));
    });
    
    return container;
  },
};

