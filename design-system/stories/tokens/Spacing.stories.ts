/**
 * Spacing Token Stories
 * 
 * Visual documentation of the spacing scale and semantic spacing.
 */

import type { Meta, StoryObj } from '@storybook/html';

const SPACING_SCALE = {
  '0': '0px',
  'px': '1px',
  '0.5': '2px',
  '1': '4px',
  '1.5': '6px',
  '2': '8px',
  '2.5': '10px',
  '3': '12px',
  '3.5': '14px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '7': '28px',
  '8': '32px',
  '9': '36px',
  '10': '40px',
  '11': '44px',
  '12': '48px',
  '14': '56px',
  '16': '64px',
  '20': '80px',
  '24': '96px',
  '28': '112px',
  '32': '128px',
};

const MA_SPACING = {
  'breath': '4px',
  'whisper': '8px',
  'pause': '16px',
  'rest': '24px',
  'silence': '32px',
  'meditation': '48px',
  'vastness': '64px',
};

const createSpacingDemo = (): HTMLElement => {
  const container = document.createElement('div');
  
  container.innerHTML = `
    <div style="padding: var(--space-8); max-width: 800px;">
      <h2 style="
        font-family: var(--font-display);
        font-size: 1.5rem;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2);
      ">Spacing Scale</h2>
      <p style="
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-6);
      ">Base unit: 4px. Use var(--space-*) for consistent spacing.</p>
      
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        ${Object.entries(SPACING_SCALE).map(([key, value]) => `
          <div style="display: flex; align-items: center; gap: var(--space-4);">
            <code style="
              width: 80px;
              font-family: var(--font-mono);
              font-size: 0.75rem;
              color: var(--color-text-muted);
            ">--space-${key}</code>
            <div style="
              width: ${value};
              height: 24px;
              background: var(--persona-primary);
              border-radius: 2px;
            "></div>
            <span style="
              font-size: 0.75rem;
              color: var(--color-text-muted);
            ">${value}</span>
          </div>
        `).join('')}
      </div>
      
      <h3 style="
        font-family: var(--font-display);
        font-size: 1.25rem;
        color: var(--color-text-primary);
        margin: var(--space-10) 0 var(--space-2);
      ">Ma Spacing (Japanese Concept)</h3>
      <p style="
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-6);
      ">Semantic spacing based on the Japanese concept of "Ma" (間) - the space between things.</p>
      
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        ${Object.entries(MA_SPACING).map(([key, value]) => `
          <div style="display: flex; align-items: center; gap: var(--space-4);">
            <code style="
              width: 120px;
              font-family: var(--font-mono);
              font-size: 0.75rem;
              color: var(--color-text-muted);
            ">--ma-${key}</code>
            <div style="
              width: ${value};
              height: 24px;
              background: linear-gradient(90deg, var(--persona-primary), var(--persona-secondary));
              border-radius: 2px;
            "></div>
            <span style="
              font-size: 0.75rem;
              color: var(--color-text-muted);
            ">${value}</span>
            <span style="
              font-size: 0.75rem;
              color: var(--color-text-dimmed);
              font-style: italic;
            ">${key === 'breath' ? 'Minimal separation' :
                key === 'whisper' ? 'Subtle separation' :
                key === 'pause' ? 'Clear separation' :
                key === 'rest' ? 'Comfortable spacing' :
                key === 'silence' ? 'Section spacing' :
                key === 'meditation' ? 'Major section spacing' :
                'Page-level spacing'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  return container;
};

const meta: Meta = {
  title: 'Tokens/Spacing',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj;

export const SpacingScale: Story = {
  render: () => createSpacingDemo(),
};

export const SpacingInContext: Story = {
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="padding: var(--space-8); max-width: 400px;">
        <div style="
          background: var(--color-background-elevated);
          border-radius: var(--radius-xl);
          padding: var(--space-6);
          box-shadow: var(--shadow-lg);
        ">
          <h3 style="
            font-family: var(--font-display);
            font-size: 1.25rem;
            color: var(--color-text-primary);
            margin: 0 0 var(--space-2);
          ">Card Title</h3>
          
          <p style="
            color: var(--color-text-secondary);
            margin: 0 0 var(--space-4);
            line-height: 1.5;
          ">This card demonstrates proper spacing hierarchy using design tokens.</p>
          
          <div style="
            display: flex;
            gap: var(--space-3);
          ">
            <button style="
              background: var(--persona-primary);
              color: white;
              border: none;
              padding: var(--space-2) var(--space-4);
              border-radius: var(--radius-md);
              cursor: pointer;
            ">Primary</button>
            <button style="
              background: transparent;
              color: var(--color-text-secondary);
              border: 1px solid var(--color-border-medium);
              padding: var(--space-2) var(--space-4);
              border-radius: var(--radius-md);
              cursor: pointer;
            ">Secondary</button>
          </div>
        </div>
      </div>
    `;
    return container;
  },
};

