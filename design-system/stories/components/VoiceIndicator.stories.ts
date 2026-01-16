import type { Meta, StoryObj } from '@storybook/html';
import { VoiceIndicator, createVoiceIndicator } from '../../components/VoiceIndicator';
import type { VoiceState } from '../../components/VoiceIndicator';

const meta: Meta = {
  title: 'Components/VoiceIndicator',
  tags: ['autodocs'],
  argTypes: {
    state: {
      control: 'select',
      options: ['idle', 'listening', 'thinking', 'speaking', 'interrupted'],
    },
    persona: {
      control: 'select',
      options: ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
};

export default meta;

// Default - Idle State
export const Idle: StoryObj = {
  args: {
    state: 'idle',
    persona: 'ferni',
    size: 'md',
  },
  render: (args) => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    createVoiceIndicator(container, args);
    return container;
  },
};

// Listening State
export const Listening: StoryObj = {
  args: {
    state: 'listening',
    persona: 'ferni',
    size: 'md',
  },
  render: (args) => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    createVoiceIndicator(container, args);
    return container;
  },
};

// Thinking State
export const Thinking: StoryObj = {
  args: {
    state: 'thinking',
    persona: 'ferni',
    size: 'md',
  },
  render: (args) => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    createVoiceIndicator(container, args);
    return container;
  },
};

// Speaking State
export const Speaking: StoryObj = {
  args: {
    state: 'speaking',
    persona: 'ferni',
    size: 'md',
  },
  render: (args) => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    createVoiceIndicator(container, args);
    return container;
  },
};

// Interrupted State
export const Interrupted: StoryObj = {
  args: {
    state: 'interrupted',
    persona: 'ferni',
    size: 'md',
  },
  render: (args) => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    createVoiceIndicator(container, args);
    return container;
  },
};

// All States Overview
export const AllStates: StoryObj = {
  render: () => {
    const states: VoiceState[] = ['idle', 'listening', 'thinking', 'speaking', 'interrupted'];
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '32px';
    container.style.padding = '24px';
    
    states.forEach(state => {
      const wrapper = document.createElement('div');
      createVoiceIndicator(wrapper, { state, persona: 'ferni', size: 'md' });
      container.appendChild(wrapper);
    });
    
    return container;
  },
};

// Different Personas
export const Personas: StoryObj = {
  render: () => {
    const personas = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'] as const;
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '32px';
    container.style.padding = '24px';
    
    personas.forEach(persona => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      
      createVoiceIndicator(wrapper, { state: 'speaking', persona, size: 'md' });
      
      const label = document.createElement('div');
      label.textContent = persona;
      label.style.marginTop = '8px';
      label.style.fontFamily = 'Inter, system-ui, sans-serif';
      label.style.fontSize = '12px';
      label.style.fontWeight = '600';
      label.style.textTransform = 'capitalize';
      wrapper.appendChild(label);
      
      container.appendChild(wrapper);
    });
    
    return container;
  },
};

// Sizes
export const Sizes: StoryObj = {
  render: () => {
    const sizes = ['sm', 'md', 'lg'] as const;
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'flex-end';
    container.style.gap = '32px';
    container.style.padding = '24px';
    
    sizes.forEach(size => {
      const wrapper = document.createElement('div');
      createVoiceIndicator(wrapper, { state: 'listening', persona: 'ferni', size });
      container.appendChild(wrapper);
    });
    
    return container;
  },
};

// Interactive Demo
export const InteractiveDemo: StoryObj = {
  render: () => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    
    const indicatorWrapper = document.createElement('div');
    indicatorWrapper.style.marginBottom = '24px';
    const indicator = createVoiceIndicator(indicatorWrapper, { state: 'idle', persona: 'ferni', size: 'lg' });
    container.appendChild(indicatorWrapper);
    
    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.gap = '8px';
    
    const states: VoiceState[] = ['idle', 'listening', 'thinking', 'speaking', 'interrupted'];
    states.forEach(state => {
      const button = document.createElement('button');
      button.textContent = state;
      button.style.cssText = `
        padding: 8px 16px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: white;
        font-family: Inter, system-ui, sans-serif;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.2s ease;
      `;
      button.addEventListener('mouseenter', () => {
        button.style.background = '#f5f5f5';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = 'white';
      });
      button.addEventListener('click', () => {
        indicator.setState(state);
      });
      buttonRow.appendChild(button);
    });
    
    container.appendChild(buttonRow);
    return container;
  },
};
