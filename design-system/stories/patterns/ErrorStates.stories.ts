/**
 * Error State Pattern Stories
 * 
 * Composite patterns for connection errors, API errors, and recovery flows.
 * Based on FERNI-EMPTY-ERROR-STATES.md brand guidelines.
 */

import type { Meta, StoryObj } from '@storybook/html';

interface ErrorStateProps {
  type: 'connection' | 'api' | 'permission' | 'offline';
  severity: 'warning' | 'error' | 'info';
  headline: string;
  body: string;
  primaryAction?: string;
  secondaryAction?: string;
  isRecovering?: boolean;
  errorCode?: string;
}

// Error state illustrations
const ERROR_ILLUSTRATIONS = {
  connection: `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="30" cy="50" r="16" fill="var(--persona-tint, rgba(74, 103, 65, 0.1))" stroke="var(--persona-primary, #4a6741)" stroke-width="2"/>
    <circle cx="70" cy="50" r="16" fill="var(--color-background-secondary, #f5f2ed)" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="2"/>
    <path d="M46 50 L54 50" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="2" stroke-dasharray="3 3" opacity="0.5"/>
    <line x1="52" y1="46" x2="62" y2="54" stroke="var(--color-semantic-error, #c45c5c)" stroke-width="2" stroke-linecap="round"/>
    <line x1="62" y1="46" x2="52" y2="54" stroke="var(--color-semantic-error, #c45c5c)" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  
  server: `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="25" y="30" width="50" height="40" rx="6" fill="var(--color-background-secondary, #f5f2ed)" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="2"/>
    <circle cx="35" cy="42" r="3" fill="var(--color-text-muted, #9a8b7a)" opacity="0.5"/>
    <circle cx="45" cy="42" r="3" fill="var(--color-text-muted, #9a8b7a)" opacity="0.5"/>
    <circle cx="55" cy="42" r="3" fill="var(--color-text-muted, #9a8b7a)" opacity="0.5"/>
    <rect x="32" y="52" width="36" height="3" rx="1.5" fill="var(--color-text-muted, #9a8b7a)" opacity="0.3"/>
    <rect x="32" y="58" width="24" height="3" rx="1.5" fill="var(--color-text-muted, #9a8b7a)" opacity="0.3"/>
    <text x="50" y="82" text-anchor="middle" fill="var(--color-text-muted, #9a8b7a)" font-size="10" opacity="0.6">zzz</text>
  </svg>`,
  
  permission: `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="35" y="42" width="30" height="26" rx="4" fill="var(--color-background-secondary, #f5f2ed)" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="2"/>
    <path d="M42 42 L42 35 Q42 28 50 28 Q58 28 58 35 L58 42" fill="none" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="2"/>
    <circle cx="50" cy="53" r="4" fill="var(--persona-primary, #4a6741)"/>
    <rect x="48" y="55" width="4" height="6" fill="var(--persona-primary, #4a6741)"/>
  </svg>`,
  
  offline: `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 55 Q50 35 70 55" fill="none" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="3" stroke-linecap="round" opacity="0.4"/>
    <path d="M38 60 Q50 45 62 60" fill="none" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
    <path d="M44 65 Q50 55 56 65" fill="none" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
    <circle cx="50" cy="72" r="4" fill="var(--color-text-muted, #9a8b7a)"/>
    <line x1="30" y1="75" x2="70" y2="35" stroke="var(--color-semantic-error, #c45c5c)" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
};

const createErrorState = (props: ErrorStateProps): HTMLElement => {
  const container = document.createElement('div');
  const illustration = ERROR_ILLUSTRATIONS[props.type as keyof typeof ERROR_ILLUSTRATIONS] || ERROR_ILLUSTRATIONS.connection;
  
  const severityColors = {
    warning: 'var(--color-semantic-warning, #c4856a)',
    error: 'var(--color-semantic-error, #c45c5c)',
    info: 'var(--persona-primary, #4a6741)',
  };
  
  container.innerHTML = `
    <div class="ferni-error-state" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-12, 48px) var(--space-6, 24px);
      max-width: 400px;
      margin: 0 auto;
      animation: errorFadeIn 0.3s ease-out;
    ">
      <div class="illustration" style="
        margin-bottom: var(--space-6, 24px);
        ${props.isRecovering ? 'animation: recoveringPulse 2s ease-in-out infinite;' : ''}
      ">
        ${illustration}
      </div>
      
      <h2 style="
        font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 var(--space-2, 8px);
        line-height: 1.3;
      ">${props.headline}</h2>
      
      <p style="
        font-family: var(--font-body, Inter, system-ui);
        font-size: 0.9375rem;
        color: var(--color-text-secondary, #5a4d43);
        line-height: 1.6;
        margin: 0 0 var(--space-6, 24px);
        max-width: 300px;
      ">${props.body}</p>
      
      ${props.isRecovering ? `
        <div class="recovering-indicator" style="
          display: flex;
          align-items: center;
          gap: var(--space-2, 8px);
          color: var(--color-text-muted, #9a8b7a);
          font-size: 0.875rem;
          margin-bottom: var(--space-4, 16px);
        ">
          <div class="spinner" style="
            width: 16px;
            height: 16px;
            border: 2px solid var(--color-border-subtle, rgba(0,0,0,0.1));
            border-top-color: var(--persona-primary, #4a6741);
            border-radius: 50%;
            animation: spin 1s linear infinite;
          "></div>
          Reconnecting...
        </div>
      ` : ''}
      
      <div class="actions" style="display: flex; flex-direction: column; gap: var(--space-3, 12px); align-items: center;">
        ${props.primaryAction ? `
          <button class="primary-cta" style="
            background: var(--persona-primary, #4a6741);
            color: white;
            border: none;
            padding: var(--space-3, 12px) var(--space-6, 24px);
            border-radius: var(--radius-lg, 12px);
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
          ">
            ${props.primaryAction}
          </button>
        ` : ''}
        
        ${props.secondaryAction ? `
          <button class="secondary-cta" style="
            background: transparent;
            color: var(--color-text-secondary, #5a4d43);
            border: none;
            padding: var(--space-2, 8px);
            font-size: 0.875rem;
            cursor: pointer;
          ">
            ${props.secondaryAction}
          </button>
        ` : ''}
      </div>
      
      ${props.errorCode ? `
        <p class="error-code" style="
          font-size: 0.75rem;
          color: var(--color-text-muted, #9a8b7a);
          margin-top: var(--space-4, 16px);
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
        ">
          Error: ${props.errorCode}
        </p>
      ` : ''}
    </div>
    
    <style>
      @keyframes errorFadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes recoveringPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      .primary-cta:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }
      
      .secondary-cta:hover {
        color: var(--persona-primary, #4a6741);
      }
    </style>
  `;
  
  return container;
};

const meta: Meta<ErrorStateProps> = {
  title: 'Patterns/Error States',
  tags: ['autodocs'],
  render: (args) => createErrorState(args),
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Error states that stay warm and helpful. Never blame the user, always provide a path forward.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<ErrorStateProps>;

export const ConnectionLost: Story = {
  args: {
    type: 'connection',
    severity: 'warning',
    headline: 'Taking a breath.',
    body: 'We lost connection for a moment. Trying to reconnect now...',
    isRecovering: true,
  },
};

export const ConnectionFailed: Story = {
  args: {
    type: 'connection',
    severity: 'error',
    headline: 'We couldn\'t reconnect.',
    body: 'Something\'s getting in the way. Check your internet connection and try again.',
    primaryAction: 'Try Again',
    secondaryAction: 'Check Status',
  },
};

export const ServerDown: Story = {
  args: {
    type: 'api',
    severity: 'info',
    headline: 'We\'re taking a moment.',
    body: 'Our servers are catching their breath. This usually resolves quickly.',
    primaryAction: 'Refresh',
  },
};

export const GenericError: Story = {
  args: {
    type: 'api',
    severity: 'error',
    headline: 'Something unexpected happened.',
    body: 'We hit a bump, but we\'re looking into it. Your data is safe.',
    primaryAction: 'Try Again',
    secondaryAction: 'Contact Support',
    errorCode: 'ERR-500-UNKNOWN',
  },
};

export const PermissionDenied: Story = {
  args: {
    type: 'permission',
    severity: 'warning',
    headline: 'We can\'t hear you.',
    body: 'Microphone access was denied. You can change this in your browser settings.',
    primaryAction: 'Open Settings',
    secondaryAction: 'Type instead',
  },
};

export const Offline: Story = {
  args: {
    type: 'offline',
    severity: 'info',
    headline: 'You\'re offline.',
    body: 'We\'ll save your progress and sync when you\'re back.',
  },
};

