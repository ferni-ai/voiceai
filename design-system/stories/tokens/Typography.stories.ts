import type { Meta, StoryObj } from '@storybook/html';

const meta = {
  title: 'Tokens/Typography',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
Ferni uses a warm, readable typography system with Plus Jakarta Sans for headings 
and Inter for body text.
        `,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const FontFamilies: Story = {
  render: () => `
    <div>
      <h2 style="margin-bottom: 2rem;">Font Families</h2>
      
      <div style="margin-bottom: 2rem;">
        <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 2rem; margin-bottom: 0.5rem;">
          Plus Jakarta Sans
        </h3>
        <p style="color: var(--color-text-muted); margin-bottom: 1rem;">
          <code>var(--font-display)</code> - Used for headings and display text
        </p>
        <p style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem;">
          The quick brown fox jumps over the lazy dog.
        </p>
      </div>
      
      <div style="margin-bottom: 2rem;">
        <h3 style="font-family: Inter, sans-serif; font-size: 2rem; margin-bottom: 0.5rem;">
          Inter
        </h3>
        <p style="color: var(--color-text-muted); margin-bottom: 1rem;">
          <code>var(--font-body)</code> - Used for body text and UI elements
        </p>
        <p style="font-family: Inter, sans-serif; font-size: 1rem;">
          The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
        </p>
      </div>
      
      <div>
        <h3 style="font-family: 'JetBrains Mono', monospace; font-size: 1.5rem; margin-bottom: 0.5rem;">
          JetBrains Mono
        </h3>
        <p style="color: var(--color-text-muted); margin-bottom: 1rem;">
          <code>var(--font-mono)</code> - Used for code and technical content
        </p>
        <pre style="font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; background: var(--color-background-elevated); padding: 1rem; border-radius: 8px;">
const greeting = "Hello, Ferni!";
console.log(greeting);</pre>
      </div>
    </div>
  `,
};

export const TypeScale: Story = {
  render: () => `
    <div>
      <h2 style="margin-bottom: 2rem;">Type Scale</h2>
      
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">
            Display / 3rem
          </span>
          <p style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 3rem; font-weight: 700; line-height: 1.1; margin: 0;">
            Growing together
          </p>
        </div>
        
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">
            H1 / 2.25rem
          </span>
          <h1 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 2.25rem; font-weight: 600; margin: 0;">
            Your AI Life Coach
          </h1>
        </div>
        
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">
            H2 / 1.5rem
          </span>
          <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.5rem; font-weight: 600; margin: 0;">
            Meet the Team
          </h2>
        </div>
        
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">
            H3 / 1.25rem
          </span>
          <h3 style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.25rem; font-weight: 600; margin: 0;">
            Daily Check-in
          </h3>
        </div>
        
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">
            Body / 1rem
          </span>
          <p style="font-family: Inter, sans-serif; font-size: 1rem; line-height: 1.6; margin: 0;">
            Ferni is your AI companion for meaningful conversations about life, goals, and growth. 
            Available 24/7 to listen, support, and help you navigate challenges.
          </p>
        </div>
        
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">
            Small / 0.875rem
          </span>
          <p style="font-family: Inter, sans-serif; font-size: 0.875rem; color: var(--color-text-secondary); margin: 0;">
            Last conversation: 2 hours ago
          </p>
        </div>
        
        <div>
          <span style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">
            Eyebrow / 0.75rem
          </span>
          <p style="font-family: Inter, sans-serif; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--persona-primary, #4a6741); font-weight: 500; margin: 0;">
            Your Journey
          </p>
        </div>
      </div>
    </div>
  `,
};

export const FontWeights: Story = {
  render: () => `
    <div>
      <h2 style="margin-bottom: 2rem;">Font Weights</h2>
      
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem;">
        <div>
          <p style="font-family: Inter, sans-serif; font-size: 1.5rem; font-weight: 400;">Regular 400</p>
          <p style="font-size: 0.875rem; color: var(--color-text-muted);">Body text, descriptions</p>
        </div>
        <div>
          <p style="font-family: Inter, sans-serif; font-size: 1.5rem; font-weight: 500;">Medium 500</p>
          <p style="font-size: 0.875rem; color: var(--color-text-muted);">Buttons, labels</p>
        </div>
        <div>
          <p style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.5rem; font-weight: 600;">Semibold 600</p>
          <p style="font-size: 0.875rem; color: var(--color-text-muted);">Subheadings</p>
        </div>
        <div>
          <p style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.5rem; font-weight: 700;">Bold 700</p>
          <p style="font-size: 0.875rem; color: var(--color-text-muted);">Headlines</p>
        </div>
      </div>
    </div>
  `,
};

