/**
 * Connection Flow Pattern Stories
 * 
 * Shows the complete flow from disconnected → connecting → connected.
 * Demonstrates avatar states and feedback patterns.
 */

import type { Meta, StoryObj } from '@storybook/html';

interface ConnectionFlowProps {
  state: 'disconnected' | 'connecting' | 'connected' | 'speaking' | 'listening';
  personaColor?: string;
  personaName?: string;
}

const createConnectionFlow = (props: ConnectionFlowProps): HTMLElement => {
  const container = document.createElement('div');
  
  const stateConfig = {
    disconnected: {
      scale: 0.95,
      opacity: 0.6,
      glow: 'none',
      statusText: 'Ready to connect',
      statusColor: 'var(--color-text-muted)',
      ringAnimation: 'none',
      breathAnimation: 'none',
    },
    connecting: {
      scale: 1,
      opacity: 0.8,
      glow: '0 0 20px var(--persona-glow)',
      statusText: 'Connecting...',
      statusColor: 'var(--color-text-secondary)',
      ringAnimation: 'connectingPulse 1.5s ease-in-out infinite',
      breathAnimation: 'none',
    },
    connected: {
      scale: 1,
      opacity: 1,
      glow: '0 0 30px var(--persona-glow)',
      statusText: 'Connected',
      statusColor: 'var(--persona-primary)',
      ringAnimation: 'connectedSettle 0.6s ease-out forwards',
      breathAnimation: 'avatarBreathe 5s ease-in-out infinite',
    },
    speaking: {
      scale: 1.02,
      opacity: 1,
      glow: '0 0 40px var(--persona-glow)',
      statusText: 'Speaking...',
      statusColor: 'var(--persona-primary)',
      ringAnimation: 'none',
      breathAnimation: 'avatarSpeaking 0.3s ease-in-out infinite',
    },
    listening: {
      scale: 1.01,
      opacity: 1,
      glow: '0 0 35px var(--persona-glow)',
      statusText: 'Listening...',
      statusColor: 'var(--color-text-secondary)',
      ringAnimation: 'listeningPulse 2s ease-in-out infinite',
      breathAnimation: 'avatarBreathe 4s ease-in-out infinite',
    },
  };
  
  const config = stateConfig[props.state];
  const personaColor = props.personaColor || '#4a6741';
  
  container.innerHTML = `
    <div class="connection-demo" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-6, 24px);
      padding: var(--space-8, 32px);
      background: var(--color-background-secondary, #f5f2ed);
      border-radius: var(--radius-2xl, 24px);
      min-width: 280px;
    " data-persona="ferni">
      <!-- Avatar Container -->
      <div class="avatar-container" style="
        position: relative;
        width: 120px;
        height: 120px;
      ">
        <!-- Outer Ring -->
        <div class="avatar-ring" style="
          position: absolute;
          inset: -8px;
          border: 2px solid var(--persona-primary, ${personaColor});
          border-radius: 50%;
          opacity: ${props.state === 'disconnected' ? 0.3 : 0.6};
          animation: ${config.ringAnimation};
        "></div>
        
        <!-- Glow Layer -->
        <div class="avatar-glow" style="
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: var(--persona-primary, ${personaColor});
          filter: blur(20px);
          opacity: ${props.state === 'disconnected' ? 0 : 0.3};
          transition: opacity 0.6s ease;
        "></div>
        
        <!-- Avatar Circle -->
        <div class="avatar-circle" style="
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--persona-primary, ${personaColor}), var(--persona-secondary, ${personaColor}dd));
          display: flex;
          align-items: center;
          justify-content: center;
          transform: scale(${config.scale});
          opacity: ${config.opacity};
          box-shadow: ${config.glow};
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          animation: ${config.breathAnimation};
        ">
          <!-- Avatar Initial -->
          <span style="
            color: white;
            font-size: 2.5rem;
            font-weight: 600;
            font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
          ">${props.personaName?.[0] || 'F'}</span>
          
          <!-- Speaking Indicator (dots) -->
          ${props.state === 'speaking' ? `
            <div class="speaking-dots" style="
              position: absolute;
              bottom: -8px;
              display: flex;
              gap: 4px;
            ">
              <span class="dot" style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: dotBounce 0.6s ease-in-out infinite;"></span>
              <span class="dot" style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: dotBounce 0.6s ease-in-out 0.1s infinite;"></span>
              <span class="dot" style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: dotBounce 0.6s ease-in-out 0.2s infinite;"></span>
            </div>
          ` : ''}
        </div>
      </div>
      
      <!-- Status Text -->
      <div class="status" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-1, 4px);
      ">
        <span style="
          font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-text-primary, #2C2520);
        ">${props.personaName || 'Ferni'}</span>
        
        <span style="
          font-size: 0.875rem;
          color: ${config.statusColor};
          display: flex;
          align-items: center;
          gap: var(--space-2, 8px);
        ">
          ${props.state === 'connecting' ? `
            <span class="spinner" style="
              width: 12px;
              height: 12px;
              border: 2px solid var(--color-border-subtle, rgba(0,0,0,0.1));
              border-top-color: var(--persona-primary, ${personaColor});
              border-radius: 50%;
              animation: spin 1s linear infinite;
            "></span>
          ` : ''}
          ${props.state === 'connected' ? `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          ` : ''}
          ${config.statusText}
        </span>
      </div>
      
      <!-- Connect Button (only when disconnected) -->
      ${props.state === 'disconnected' ? `
        <button class="connect-btn" style="
          background: var(--persona-primary, ${personaColor});
          color: white;
          border: none;
          padding: var(--space-3, 12px) var(--space-8, 32px);
          border-radius: var(--radius-full, 9999px);
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: var(--space-2, 8px);
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          Talk to ${props.personaName || 'Ferni'}
        </button>
      ` : ''}
    </div>
    
    <style>
      @keyframes connectingPulse {
        0%, 100% { transform: scale(1); opacity: 0.4; }
        50% { transform: scale(1.1); opacity: 0.8; }
      }
      
      @keyframes connectedSettle {
        0% { transform: scale(1.15); opacity: 1; }
        60% { transform: scale(0.95); }
        100% { transform: scale(1); opacity: 0.6; }
      }
      
      @keyframes listeningPulse {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        50% { transform: scale(1.05); opacity: 0.7; }
      }
      
      @keyframes avatarBreathe {
        0%, 100% { transform: scale(1) translateY(0); }
        50% { transform: scale(1.012) translateY(-1.5px); }
      }
      
      @keyframes avatarSpeaking {
        0%, 100% { transform: scale(1.02); }
        50% { transform: scale(1.025); }
      }
      
      @keyframes dotBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      .connect-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px var(--persona-glow, rgba(74, 103, 65, 0.3));
      }
    </style>
  `;
  
  return container;
};

const meta: Meta<ConnectionFlowProps> = {
  title: 'Patterns/Connection Flow',
  tags: ['autodocs'],
  render: (args) => createConnectionFlow(args),
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
    },
  },
};

export default meta;
type Story = StoryObj<ConnectionFlowProps>;

export const Disconnected: Story = {
  args: {
    state: 'disconnected',
    personaName: 'Ferni',
    personaColor: '#4a6741',
  },
};

export const Connecting: Story = {
  args: {
    state: 'connecting',
    personaName: 'Ferni',
    personaColor: '#4a6741',
  },
};

export const Connected: Story = {
  args: {
    state: 'connected',
    personaName: 'Ferni',
    personaColor: '#4a6741',
  },
};

export const Speaking: Story = {
  args: {
    state: 'speaking',
    personaName: 'Ferni',
    personaColor: '#4a6741',
  },
};

export const Listening: Story = {
  args: {
    state: 'listening',
    personaName: 'Ferni',
    personaColor: '#4a6741',
  },
};

// Different personas
export const PeterConnected: Story = {
  args: {
    state: 'connected',
    personaName: 'Peter',
    personaColor: '#3a6b73',
  },
};

export const MayaSpeaking: Story = {
  args: {
    state: 'speaking',
    personaName: 'Maya',
    personaColor: '#a67a6a',
  },
};

export const JordanListening: Story = {
  args: {
    state: 'listening',
    personaName: 'Jordan',
    personaColor: '#c4856a',
  },
};

