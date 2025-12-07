/**
 * Modal Component Stories
 * 
 * Brand-compliant modal following Ferni's centered floating pattern.
 */

import type { Meta, StoryObj } from '@storybook/html';

interface ModalProps {
  title: string;
  eyebrow?: string;
  content: string;
  showClose?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const createModal = (props: ModalProps): HTMLElement => {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="ferni-modal-overlay" style="
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(44, 37, 32, 0.4);
      backdrop-filter: blur(20px);
      z-index: 100;
    ">
      <div class="ferni-modal-card" style="
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
        padding: var(--space-6, 24px);
        max-width: ${props.size === 'sm' ? '320px' : props.size === 'lg' ? '600px' : '480px'};
        width: 90vw;
        position: relative;
        animation: modalFadeIn 0.3s ease-out;
      ">
        ${props.showClose ? `
          <button style="
            position: absolute;
            top: var(--space-4, 16px);
            right: var(--space-4, 16px);
            background: none;
            border: none;
            cursor: pointer;
            padding: var(--space-2, 8px);
            border-radius: var(--radius-full, 9999px);
            color: var(--color-text-muted, #9a8b7a);
            transition: all 0.2s;
          " aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        ` : ''}
        
        <header style="margin-bottom: var(--space-4, 16px);">
          ${props.eyebrow ? `
            <span style="
              font-size: 0.75rem;
              font-weight: 600;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              color: var(--persona-primary, #4a6741);
            ">${props.eyebrow}</span>
          ` : ''}
          <h2 style="
            font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--color-text-primary, #2C2520);
            margin: var(--space-1, 4px) 0 0;
          ">${props.title}</h2>
        </header>
        
        <div style="
          color: var(--color-text-secondary, #5a4d43);
          font-family: var(--font-body, Inter, system-ui);
          line-height: 1.6;
        ">
          ${props.content}
        </div>
        
        <footer style="
          margin-top: var(--space-6, 24px);
          display: flex;
          gap: var(--space-3, 12px);
          justify-content: flex-end;
        ">
          <button class="ferni-button-secondary" style="
            padding: var(--space-2, 8px) var(--space-4, 16px);
            border-radius: var(--radius-lg, 12px);
            border: 1px solid var(--color-border, #e8e0d8);
            background: transparent;
            color: var(--color-text-secondary, #5a4d43);
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          ">Cancel</button>
          <button class="ferni-button-primary" style="
            padding: var(--space-2, 8px) var(--space-4, 16px);
            border-radius: var(--radius-lg, 12px);
            border: none;
            background: var(--persona-primary, #4a6741);
            color: white;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          ">Confirm</button>
        </footer>
      </div>
    </div>
    
    <style>
      @keyframes modalFadeIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      
      .ferni-button-primary:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }
      
      .ferni-button-secondary:hover {
        background: var(--color-background-muted, #f5f1eb);
      }
    </style>
  `;
  
  return container;
};

const meta: Meta<ModalProps> = {
  title: 'Components/Modal',
  tags: ['autodocs'],
  render: (args) => createModal(args),
  argTypes: {
    title: { control: 'text' },
    eyebrow: { control: 'text' },
    content: { control: 'text' },
    showClose: { control: 'boolean' },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<ModalProps>;

export const Default: Story = {
  args: {
    title: 'Confirm action',
    eyebrow: 'YOUR JOURNEY',
    content: 'Are you sure you want to proceed? This action will update your preferences.',
    showClose: true,
    size: 'md',
  },
};

export const SmallModal: Story = {
  args: {
    title: 'Quick confirm',
    content: 'Continue with this action?',
    showClose: false,
    size: 'sm',
  },
};

export const LargeModal: Story = {
  args: {
    title: 'Privacy Settings',
    eyebrow: 'YOUR DATA',
    content: `
      <p style="margin-bottom: 1rem;">We take your privacy seriously. Here's what we store and why:</p>
      <ul style="list-style: disc; padding-left: 1.5rem; margin-bottom: 1rem;">
        <li>Conversation history - to remember our talks</li>
        <li>Preferences - to personalize your experience</li>
        <li>Progress data - to track your growth journey</li>
      </ul>
      <p>You can export or delete your data at any time from Settings.</p>
    `,
    showClose: true,
    size: 'lg',
  },
};

export const TeamUnlock: Story = {
  args: {
    title: 'Meet Maya Santos',
    eyebrow: 'TEAM MEMBER UNLOCKED',
    content: `
      <div style="text-align: center; padding: 1rem 0;">
        <div style="
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--color-maya-primary, #a67a6a), var(--color-maya-secondary, #8a635a));
          margin: 0 auto 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        ">🌱</div>
        <p style="font-weight: 500; margin-bottom: 0.5rem;">Maya Santos - Habit Coach</p>
        <p style="color: var(--color-text-muted);">Specializes in building sustainable daily routines.</p>
      </div>
    `,
    showClose: true,
    size: 'md',
  },
};

