/**
 * React Avatar Component Stories
 * 
 * These stories showcase @ferni/react Avatar component.
 * They render React components into HTML for the html-vite Storybook.
 */

import type { Meta, StoryObj } from '@storybook/html';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Avatar, FerniProvider } from '../../../packages/ferni-react/src';
import type { AvatarProps, PersonaId } from '../../../packages/ferni-react/src';

// Render React component to HTML container
const renderReact = (element: React.ReactElement): HTMLElement => {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(
    <FerniProvider>
      {element}
    </FerniProvider>
  );
  return container;
};

const meta: Meta<AvatarProps> = {
  title: 'React/Avatar',
  tags: ['autodocs'],
  render: (args) => renderReact(<Avatar {...args} />),
  argTypes: {
    persona: {
      control: { type: 'select' },
      options: ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'],
    },
    size: {
      control: { type: 'range', min: 50, max: 400, step: 10 },
    },
    state: {
      control: { type: 'select' },
      options: ['idle', 'speaking', 'listening', 'thinking', 'celebrating', 'concerned'],
    },
    expression: {
      control: { type: 'select' },
      options: ['neutral', 'happy', 'curious', 'concerned', 'thinking', 'excited', 'sleepy', 'surprised', 'warm'],
    },
    breathing: { control: 'boolean' },
    glow: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<AvatarProps>;

export const Default: Story = {
  args: {
    persona: 'ferni',
    size: 200,
    breathing: true,
    glow: true,
  },
};

export const Speaking: Story = {
  args: {
    persona: 'ferni',
    size: 200,
    state: 'speaking',
    breathing: true,
    glow: true,
  },
};

export const Celebrating: Story = {
  args: {
    persona: 'ferni',
    size: 200,
    state: 'celebrating',
    expression: 'excited',
    breathing: true,
    glow: true,
  },
};

export const AllPersonas: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 24px; flex-wrap: wrap; align-items: center; padding: 24px;';
    
    const personas: PersonaId[] = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'];
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          {personas.map((persona) => (
            <div key={persona} style={{ textAlign: 'center' }}>
              <Avatar persona={persona} size={100} breathing glow />
              <p style={{ 
                marginTop: '8px', 
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '14px',
                textTransform: 'capitalize',
                color: '#2C2520'
              }}>
                {persona}
              </p>
            </div>
          ))}
        </div>
      </FerniProvider>
    );
    
    return container;
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    const sizes = [50, 100, 150, 200, 300];
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end', padding: '24px' }}>
          {sizes.map((size) => (
            <div key={size} style={{ textAlign: 'center' }}>
              <Avatar persona="ferni" size={size} breathing glow />
              <p style={{ 
                marginTop: '8px', 
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '12px',
                color: '#5C544A'
              }}>
                {size}px
              </p>
            </div>
          ))}
        </div>
      </FerniProvider>
    );
    
    return container;
  },
};

export const States: Story = {
  render: () => {
    const container = document.createElement('div');
    const states = ['idle', 'speaking', 'listening', 'thinking', 'celebrating'] as const;
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', padding: '24px' }}>
          {states.map((state) => (
            <div key={state} style={{ textAlign: 'center' }}>
              <Avatar persona="ferni" size={120} state={state} breathing glow />
              <p style={{ 
                marginTop: '12px', 
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '13px',
                textTransform: 'capitalize',
                color: '#2C2520'
              }}>
                {state}
              </p>
            </div>
          ))}
        </div>
      </FerniProvider>
    );
    
    return container;
  },
};

export const Expressions: Story = {
  render: () => {
    const container = document.createElement('div');
    const expressions = ['neutral', 'happy', 'curious', 'concerned', 'thinking', 'excited', 'warm'] as const;
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', padding: '24px' }}>
          {expressions.map((expression) => (
            <div key={expression} style={{ textAlign: 'center' }}>
              <Avatar persona="ferni" size={100} expression={expression} breathing glow />
              <p style={{ 
                marginTop: '8px', 
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '12px',
                textTransform: 'capitalize',
                color: '#5C544A'
              }}>
                {expression}
              </p>
            </div>
          ))}
        </div>
      </FerniProvider>
    );
    
    return container;
  },
};
