import type { Meta, StoryObj } from '@storybook/html';

const meta = {
  title: 'Components/Card',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
Cards are content containers with consistent styling. They support different 
elevations and can adapt to persona colors.
        `,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => `
    <div style="
      background: var(--color-background-elevated);
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      max-width: 400px;
    ">
      <h3 style="
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0 0 0.5rem 0;
      ">Daily Check-in</h3>
      <p style="
        font-family: Inter, sans-serif;
        color: var(--color-text-secondary);
        margin: 0;
        line-height: 1.6;
      ">
        Take a moment to reflect on your day. How are you feeling right now?
      </p>
    </div>
  `,
};

export const WithPersonaAccent: Story = {
  render: () => `
    <div style="
      background: var(--color-background-elevated);
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      max-width: 400px;
      border-left: 4px solid var(--persona-primary, #4a6741);
    ">
      <span style="
        font-family: Inter, sans-serif;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--persona-primary, #4a6741);
        font-weight: 500;
      ">Insight</span>
      <h3 style="
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0.5rem 0;
      ">You've been consistent!</h3>
      <p style="
        font-family: Inter, sans-serif;
        color: var(--color-text-secondary);
        margin: 0;
        line-height: 1.6;
      ">
        You've logged in 5 days in a row. That's building a great habit!
      </p>
    </div>
  `,
};

export const TeamMemberCard: Story = {
  render: () => `
    <div style="
      background: var(--color-background-elevated);
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      max-width: 300px;
      text-align: center;
    ">
      <div style="
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
        margin: 0 auto 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
      ">🌿</div>
      <h3 style="
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0 0 0.25rem 0;
      ">Ferni</h3>
      <p style="
        font-family: Inter, sans-serif;
        font-size: 0.875rem;
        color: var(--color-text-muted);
        margin: 0 0 1rem 0;
      ">Your AI Life Coach</p>
      <button style="
        background: var(--persona-primary, #4a6741);
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        font-family: Inter, sans-serif;
        font-weight: 500;
        font-size: 0.875rem;
        border-radius: 8px;
        cursor: pointer;
        width: 100%;
      ">Start Conversation</button>
    </div>
  `,
};

export const StatsCard: Story = {
  render: () => `
    <div style="
      background: var(--color-background-elevated);
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      max-width: 200px;
    ">
      <span style="
        font-family: Inter, sans-serif;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
        font-weight: 500;
      ">Conversations</span>
      <p style="
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 2.5rem;
        font-weight: 700;
        color: var(--persona-primary, #4a6741);
        margin: 0.25rem 0;
      ">47</p>
      <p style="
        font-family: Inter, sans-serif;
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        margin: 0;
      ">+12 this week</p>
    </div>
  `,
};

export const CardGrid: Story = {
  render: () => `
    <div style="
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      max-width: 800px;
    ">
      <div style="
        background: var(--color-background-elevated);
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      ">
        <span style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;">🎯</span>
        <h4 style="font-family: 'Plus Jakarta Sans', sans-serif; margin: 0 0 0.5rem;">Goals</h4>
        <p style="font-family: Inter, sans-serif; color: var(--color-text-secondary); font-size: 0.875rem; margin: 0;">Track your progress</p>
      </div>
      <div style="
        background: var(--color-background-elevated);
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      ">
        <span style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;">💭</span>
        <h4 style="font-family: 'Plus Jakarta Sans', sans-serif; margin: 0 0 0.5rem;">Reflect</h4>
        <p style="font-family: Inter, sans-serif; color: var(--color-text-secondary); font-size: 0.875rem; margin: 0;">Journal your thoughts</p>
      </div>
      <div style="
        background: var(--color-background-elevated);
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      ">
        <span style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;">📊</span>
        <h4 style="font-family: 'Plus Jakarta Sans', sans-serif; margin: 0 0 0.5rem;">Insights</h4>
        <p style="font-family: Inter, sans-serif; color: var(--color-text-secondary); font-size: 0.875rem; margin: 0;">See your patterns</p>
      </div>
    </div>
  `,
};

