import type { Meta, StoryObj } from '@storybook/html';

const meta = {
  title: 'Tokens/Colors',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
Ferni uses an earthy, warm color palette that adapts to each persona.
All colors are available as CSS variables.
        `,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

// Persona colors
const personaColors = [
  { name: 'Ferni', id: 'ferni', primary: '#4a6741', secondary: '#3d5a35' },
  { name: 'Jack', id: 'jack-bogle', primary: '#9a7b5a', secondary: '#7d6348' },
  { name: 'Peter', id: 'peter-lynch', primary: '#3a6b73', secondary: '#2d5359' },
  { name: 'Alex', id: 'alex-chen', primary: '#5a6b8a', secondary: '#4a5a73' },
  { name: 'Maya', id: 'maya-santos', primary: '#a67a6a', secondary: '#8a635a' },
  { name: 'Jordan', id: 'jordan-taylor', primary: '#c4856a', secondary: '#a86d55' },
  { name: 'Nayan', id: 'nayan-patel', primary: '#8a7a6a', secondary: '#6a5a4a' },
];

// Semantic colors
const semanticColors = [
  { name: 'Background Base', var: '--color-background-base', light: '#F5F1E8', dark: '#2C2520' },
  { name: 'Background Elevated', var: '--color-background-elevated', light: '#FFFDFB', dark: '#3a3330' },
  { name: 'Text Primary', var: '--color-text-primary', light: '#2C2520', dark: '#faf6f0' },
  { name: 'Text Secondary', var: '--color-text-secondary', light: '#5a524a', dark: '#f0ebe4' },
  { name: 'Text Muted', var: '--color-text-muted', light: '#8a8078', dark: '#e8e2da' },
  { name: 'Border', var: '--color-border', light: '#e0dcd5', dark: '#4a4440' },
];

function createColorSwatch(color: string, name: string, cssVar?: string): string {
  return `
    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
      <div style="
        width: 60px; 
        height: 60px; 
        border-radius: 8px; 
        background: ${color};
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      "></div>
      <div>
        <div style="font-weight: 600;">${name}</div>
        <div style="font-family: monospace; font-size: 0.85rem; color: var(--color-text-muted);">${color}</div>
        ${cssVar ? `<div style="font-family: monospace; font-size: 0.75rem; color: var(--color-text-muted);">var(${cssVar})</div>` : ''}
      </div>
    </div>
  `;
}

export const PersonaColors: Story = {
  render: () => {
    const html = `
      <div>
        <h2 style="margin-bottom: 1.5rem;">Persona Colors</h2>
        <p style="margin-bottom: 2rem; color: var(--color-text-secondary);">
          Each persona has a primary and secondary color that defines their visual identity.
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2rem;">
          ${personaColors.map(p => `
            <div style="padding: 1rem; background: var(--color-background-elevated); border-radius: 12px; border: 1px solid var(--color-border);">
              <h3 style="margin-bottom: 1rem;">${p.name}</h3>
              ${createColorSwatch(p.primary, 'Primary', `--persona-${p.id}-primary`)}
              ${createColorSwatch(p.secondary, 'Secondary', `--persona-${p.id}-secondary`)}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return html;
  },
};

export const SemanticColors: Story = {
  render: () => {
    const html = `
      <div>
        <h2 style="margin-bottom: 1.5rem;">Semantic Colors</h2>
        <p style="margin-bottom: 2rem; color: var(--color-text-secondary);">
          Semantic colors adapt to light and dark themes automatically.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
          <div style="padding: 1.5rem; background: #FFFDFB; border-radius: 12px;">
            <h3 style="margin-bottom: 1rem; color: #2C2520;">Light Theme</h3>
            ${semanticColors.map(c => createColorSwatch(c.light, c.name, c.var)).join('')}
          </div>
          <div style="padding: 1.5rem; background: #2C2520; border-radius: 12px;">
            <h3 style="margin-bottom: 1rem; color: #faf6f0;">Dark Theme</h3>
            ${semanticColors.map(c => createColorSwatch(c.dark, c.name, c.var)).join('')}
          </div>
        </div>
      </div>
    `;
    return html;
  },
};

export const UsageExample: Story = {
  render: () => `
    <div>
      <h2 style="margin-bottom: 1.5rem;">Usage</h2>
      <pre style="
        background: var(--color-background-elevated);
        padding: 1.5rem;
        border-radius: 8px;
        overflow-x: auto;
        font-size: 0.9rem;
      "><code>/* CSS */
.my-component {
  background: var(--persona-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

/* With fallback */
.my-component {
  background: var(--persona-primary, #4a6741);
}</code></pre>
    </div>
  `,
};

