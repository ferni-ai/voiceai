import type { Meta, StoryObj } from '@storybook/html';

/**
 * # Brand Personality Documentation
 * 
 * The 5 core personality traits that define Ferni across all touchpoints.
 * Every design decision should be evaluated against these traits.
 */

const meta: Meta = {
  title: 'Tokens/Personality',
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj;

// =============================================================================
// BRAND ESSENCE
// =============================================================================

export const BrandEssence: Story = {
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: var(--font-body); max-width: 600px;">
        <div style="
          padding: 48px 32px;
          background: linear-gradient(135deg, rgba(74, 103, 65, 0.12), rgba(74, 103, 65, 0.04));
          border-radius: var(--radius-2xl);
          text-align: center;
          margin-bottom: 32px;
        ">
          <div style="
            font-family: var(--font-display);
            font-size: 48px;
            font-weight: 800;
            color: var(--color-text-primary);
            margin-bottom: 16px;
            letter-spacing: -0.02em;
          ">Better than human.</div>
          <div style="
            font-size: 18px;
            color: var(--color-text-secondary);
            font-style: italic;
          ">"Finally, someone who actually listens."</div>
        </div>
        
        <div style="
          padding: 24px;
          background: var(--color-background-elevated);
          border-radius: var(--radius-xl);
          border: 1px solid var(--color-border-subtle);
        ">
          <h3 style="color: var(--color-text-primary); margin-bottom: 16px; font-size: 16px;">Our Mission</h3>
          <p style="
            color: var(--color-text-secondary);
            font-size: 15px;
            line-height: 1.7;
            margin: 0;
          ">
            We believe in making AI human, and the decisions we make will reflect that.
            Ferni exists in the space between—the 2am worry, the commute contemplation, 
            the moment before a big decision. We're not replacing human connection; 
            we're filling the gaps when your people aren't available.
          </p>
        </div>
      </div>
    `;
    return container;
  },
};

// =============================================================================
// CORE TRAITS
// =============================================================================

const coreTraits = [
  {
    name: 'Warm',
    description: 'Like a trusted friend, not a cold machine',
    colorBias: 'amber',
    color: '#C4A265',
    animation: 'gentle',
    haptic: 'ferniBreath',
    sonic: 'felt-piano',
    voice: 'soft-spoken',
    avoids: ['cold', 'clinical', 'distant', 'transactional'],
  },
  {
    name: 'Grounded',
    description: 'Calm, stable, reliable presence',
    colorBias: 'earth',
    color: '#9a7b5a',
    animation: 'stable',
    haptic: 'slowBreath',
    sonic: 'lower-register',
    voice: 'steady',
    avoids: ['anxious', 'scattered', 'flighty', 'uncertain'],
  },
  {
    name: 'Wise',
    description: 'Thoughtful guidance without judgment',
    colorBias: 'teal',
    color: '#3a6b73',
    animation: 'deliberate',
    haptic: 'deepPulse',
    sonic: 'resonant',
    voice: 'measured',
    avoids: ['preachy', 'condescending', 'lecturing', 'all-knowing'],
  },
  {
    name: 'Present',
    description: 'Fully attentive, never distracted',
    colorBias: 'sage',
    color: '#4a6741',
    animation: 'attentive',
    haptic: 'heartbeat',
    sonic: 'clear',
    voice: 'focused',
    avoids: ['distracted', 'rushed', 'multitasking', 'elsewhere'],
  },
  {
    name: 'Human',
    description: 'Natural, organic, approachable',
    colorBias: 'natural',
    color: '#756A5E',
    animation: 'organic',
    haptic: 'warmPulse',
    sonic: 'breath-texture',
    voice: 'natural',
    avoids: ['robotic', 'artificial', 'synthetic', 'scripted'],
  },
];

export const CoreTraits: Story = {
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: var(--font-body); max-width: 900px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          The 5 Core Traits
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Every design decision should be evaluated against these personality traits
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 20px;">
          ${coreTraits.map(trait => `
            <div style="
              display: grid;
              grid-template-columns: 200px 1fr;
              gap: 24px;
              padding: 24px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-xl);
              border-left: 4px solid ${trait.color};
            ">
              <div>
                <div style="
                  font-family: var(--font-display);
                  font-size: 24px;
                  font-weight: 700;
                  color: ${trait.color};
                  margin-bottom: 8px;
                ">${trait.name}</div>
                <div style="
                  font-size: 14px;
                  color: var(--color-text-secondary);
                  line-height: 1.5;
                ">${trait.description}</div>
              </div>
              
              <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
                  <div style="font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Animation</div>
                  <div style="font-size: 13px; color: var(--color-text-primary);">${trait.animation}</div>
                </div>
                <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
                  <div style="font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Haptic</div>
                  <div style="font-size: 13px; color: var(--color-text-primary);">${trait.haptic}</div>
                </div>
                <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
                  <div style="font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Sonic</div>
                  <div style="font-size: 13px; color: var(--color-text-primary);">${trait.sonic}</div>
                </div>
                <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
                  <div style="font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Voice</div>
                  <div style="font-size: 13px; color: var(--color-text-primary);">${trait.voice}</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return container;
  },
};

// =============================================================================
// ANTI-TRAITS
// =============================================================================

const antiTraits = [
  { name: 'Not Cold', description: 'Never clinical, sterile, or distant', violations: ['blue-gray palettes', 'sharp corners', 'mechanical sounds'] },
  { name: 'Not Corporate', description: 'Never enterprise, bureaucratic, or impersonal', violations: ['stock photos', 'bullet points', 'passive voice'] },
  { name: 'Not Tech', description: 'Never startup-y, bro-ey, or disruption-focused', violations: ['neon colors', 'futuristic fonts', 'gaming aesthetics'] },
  { name: 'Not Busy', description: 'Never cluttered, overwhelming, or anxiety-inducing', violations: ['notification spam', 'information overload', 'dense layouts'] },
  { name: 'Not Artificial', description: 'Never plastic, synthetic, or uncanny', violations: ['perfect symmetry', 'AI-generated faces', 'chatbot language'] },
];

export const AntiTraits: Story = {
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: var(--font-body); max-width: 800px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          What Ferni is NOT
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Guard rails for design decisions — avoid these patterns
        </p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
          ${antiTraits.map(trait => `
            <div style="
              padding: 20px;
              background: rgba(239, 68, 68, 0.05);
              border-radius: var(--radius-lg);
              border: 1px solid rgba(239, 68, 68, 0.15);
            ">
              <div style="
                font-weight: 600;
                color: #dc2626;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
              ">
                <span style="font-size: 18px;">✗</span>
                ${trait.name}
              </div>
              <div style="
                font-size: 13px;
                color: var(--color-text-secondary);
                margin-bottom: 12px;
              ">${trait.description}</div>
              <div style="
                font-size: 12px;
                color: var(--color-text-muted);
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
              ">
                ${trait.violations.map(v => `
                  <span style="
                    padding: 2px 8px;
                    background: rgba(239, 68, 68, 0.1);
                    border-radius: 4px;
                  ">${v}</span>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return container;
  },
};

// =============================================================================
// PERSONA PERSONALITIES
// =============================================================================

const personaPersonalities = [
  { name: 'Ferni', primary: 'warm', secondary: 'present', weights: { warm: 1.0, grounded: 1.0, wise: 1.0, present: 1.0, human: 1.0 } },
  { name: 'Peter', primary: 'present', secondary: 'wise', weights: { warm: 0.8, grounded: 0.7, wise: 1.2, present: 1.3, human: 1.0 } },
  { name: 'Maya', primary: 'grounded', secondary: 'present', weights: { warm: 0.9, grounded: 1.3, wise: 0.9, present: 1.2, human: 0.8 } },
  { name: 'Jordan', primary: 'warm', secondary: 'human', weights: { warm: 1.3, grounded: 0.7, wise: 0.8, present: 1.1, human: 1.2 } },
  { name: 'Nayan', primary: 'wise', secondary: 'grounded', weights: { warm: 0.9, grounded: 1.2, wise: 1.4, present: 0.8, human: 0.9 } },
];

export const PersonaPersonalities: Story = {
  render: () => {
    const traits = ['warm', 'grounded', 'wise', 'present', 'human'];
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: var(--font-body); max-width: 800px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          Persona Trait Weights
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Each persona emphasizes different traits (1.0 = baseline, higher = more prominent)
        </p>
        
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: var(--color-background-tertiary);">
                <th style="padding: 12px 16px; text-align: left; font-weight: 600;">Persona</th>
                ${traits.map(t => `
                  <th style="padding: 12px 16px; text-align: center; font-weight: 600; text-transform: capitalize;">${t}</th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${personaPersonalities.map(p => `
                <tr style="border-bottom: 1px solid var(--color-border-subtle);">
                  <td style="padding: 16px;">
                    <div style="font-weight: 600; color: var(--color-text-primary);">${p.name}</div>
                    <div style="font-size: 12px; color: var(--color-text-muted);">
                      Primary: ${p.primary} / Secondary: ${p.secondary}
                    </div>
                  </td>
                  ${traits.map(t => {
                    const weight = p.weights[t];
                    const isHigh = weight >= 1.2;
                    const isLow = weight <= 0.8;
                    return `
                      <td style="padding: 16px; text-align: center;">
                        <div style="
                          display: inline-block;
                          padding: 4px 12px;
                          border-radius: 12px;
                          font-weight: 500;
                          ${isHigh ? 'background: rgba(74, 103, 65, 0.15); color: #4a6741;' : ''}
                          ${isLow ? 'background: rgba(239, 68, 68, 0.1); color: #dc2626;' : ''}
                          ${!isHigh && !isLow ? 'color: var(--color-text-secondary);' : ''}
                        ">${weight.toFixed(1)}</div>
                      </td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    return container;
  },
};

// =============================================================================
// VOICE PRINCIPLES
// =============================================================================

export const VoicePrinciples: Story = {
  render: () => {
    const principles = [
      { principle: 'Warm, Not Saccharine', description: 'Genuine care without being cloying' },
      { principle: 'Confident, Not Arrogant', description: 'Sure without being know-it-all' },
      { principle: 'Present, Not Performative', description: 'Actually here, not acting interested' },
      { principle: 'Direct, Not Blunt', description: 'Honest without being harsh' },
      { principle: 'Human, Not Human-ish', description: 'Actually natural, not trying to seem natural' },
    ];
    
    const patterns = {
      greetings: ['Hey.', 'Hello.', 'Good to see you.'],
      acknowledgments: ['I hear that.', 'That makes sense.', 'I get it.'],
      questions: ['What\'s on your mind?', 'How are you feeling about that?', 'Tell me more?'],
      encouragements: ['You\'ve got this.', 'That took courage.', 'I\'m proud of you.'],
    };
    
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: var(--font-body); max-width: 700px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 24px; color: var(--color-text-primary);">
          Voice Principles
        </h2>
        
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px;">
          ${principles.map(p => `
            <div style="
              padding: 16px 20px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
              display: flex;
              align-items: center;
              gap: 16px;
            ">
              <div style="
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--persona-primary);
              "></div>
              <div>
                <span style="font-weight: 600; color: var(--color-text-primary);">${p.principle}</span>
                <span style="color: var(--color-text-muted);"> — ${p.description}</span>
              </div>
            </div>
          `).join('')}
        </div>
        
        <h3 style="color: var(--color-text-primary); margin-bottom: 16px;">Copy Patterns</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
          ${Object.entries(patterns).map(([category, examples]) => `
            <div style="
              padding: 16px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
            ">
              <div style="
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: var(--color-text-muted);
                margin-bottom: 12px;
              ">${category}</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${examples.map(e => `
                  <div style="
                    font-size: 14px;
                    color: var(--color-text-secondary);
                    font-style: italic;
                  ">"${e}"</div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return container;
  },
};

