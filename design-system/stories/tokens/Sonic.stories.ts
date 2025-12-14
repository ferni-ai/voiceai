import type { Meta, StoryObj } from '@storybook/html';

/**
 * # Sonic Identity Documentation
 * 
 * Sound is 50% of the Ferni experience. Every sound should:
 * - Feel inevitable — like it couldn't be any other way
 * - Convey warmth — even functional sounds feel human
 * - Support, not distract — audio serves the experience
 * - Create memory — sounds become associated with feelings
 */

const meta: Meta = {
  title: 'Tokens/Sonic',
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj;

// =============================================================================
// THE FERNI NOTE
// =============================================================================

export const FerniNote: Story = {
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: var(--font-body); max-width: 600px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          The Ferni Note
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          The foundational sound of Ferni's identity
        </p>
        
        <div style="
          padding: 32px;
          background: linear-gradient(135deg, rgba(74, 103, 65, 0.15), rgba(74, 103, 65, 0.05));
          border-radius: var(--radius-xl);
          text-align: center;
          border: 1px solid var(--color-border-subtle);
        ">
          <div style="
            font-size: 72px;
            font-weight: 300;
            color: var(--persona-primary);
            margin-bottom: 16px;
          ">C4</div>
          <div style="
            font-family: var(--font-mono);
            font-size: 14px;
            color: var(--color-text-muted);
            margin-bottom: 24px;
          ">261.63 Hz — Middle C</div>
          
          <div style="
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            text-align: left;
            padding-top: 24px;
            border-top: 1px solid var(--color-border-subtle);
          ">
            <div>
              <div style="font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Timbre</div>
              <div style="font-size: 14px; color: var(--color-text-primary);">Warm piano with soft felt</div>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Duration</div>
              <div style="font-size: 14px; color: var(--color-text-primary);">800ms natural decay</div>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Character</div>
              <div style="font-size: 14px; color: var(--color-text-primary);">Like a breath, not a strike</div>
            </div>
          </div>
        </div>
        
        <div style="
          margin-top: 24px;
          padding: 16px;
          background: var(--color-background-elevated);
          border-radius: var(--radius-lg);
          font-size: 14px;
          color: var(--color-text-secondary);
        ">
          <strong>The Warmth Pad:</strong> Cmaj7 (C-E-G-B) — Soft synth pad that provides 
          subconscious comfort during active connection. Volume: -24dB
        </div>
      </div>
    `;
    return container;
  },
};

// =============================================================================
// PERSONA SONIC SIGNATURES
// =============================================================================

const personaSonic = [
  { 
    id: 'ferni', 
    name: 'Ferni', 
    interval: 'Perfect 5th', 
    notes: 'C4 → G4',
    texture: 'Felt piano',
    character: 'Home base, grounding',
    color: '#4a6741',
  },
  { 
    id: 'peter', 
    name: 'Peter', 
    interval: 'Major 6th', 
    notes: 'C4 → A4',
    texture: 'Clear piano',
    character: 'Inquisitive, searching',
    color: '#3a6b73',
  },
  { 
    id: 'alex', 
    name: 'Alex', 
    interval: 'Perfect 4th', 
    notes: 'C4 → F4',
    texture: 'Bell-like',
    character: 'Pure, communicative',
    color: '#5a6b8a',
  },
  { 
    id: 'maya', 
    name: 'Maya', 
    interval: 'Octave', 
    notes: 'C3 → C4',
    texture: 'Rhythmic',
    character: 'Reliable, rhythmic',
    color: '#a67a6a',
  },
  { 
    id: 'jordan', 
    name: 'Jordan', 
    interval: 'Major 7th', 
    notes: 'C4 → B4',
    texture: 'Effervescent',
    character: 'Uplifting, bright',
    color: '#c4856a',
  },
  { 
    id: 'nayan', 
    name: 'Nayan', 
    interval: 'Full Octave', 
    notes: 'C3 → C5',
    texture: 'Resonant',
    character: 'Expansive, integrative',
    color: '#8a7a6a',
  },
];

export const PersonaSonicSignatures: Story = {
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: var(--font-body); max-width: 900px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          Persona Sonic Signatures
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Each persona has a unique sonic "color" — subtle variations on the Ferni foundation
        </p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px;">
          ${personaSonic.map(p => `
            <div style="
              padding: 20px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-xl);
              border-left: 4px solid ${p.color};
            ">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
                <div style="
                  width: 36px;
                  height: 36px;
                  border-radius: 50%;
                  background: ${p.color};
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: 600;
                ">${p.name[0]}</div>
                <div style="font-weight: 600; color: var(--color-text-primary);">${p.name}</div>
              </div>
              
              <div style="
                font-family: var(--font-mono);
                font-size: 18px;
                color: ${p.color};
                margin-bottom: 4px;
              ">${p.notes}</div>
              <div style="
                font-size: 12px;
                color: var(--color-text-muted);
                margin-bottom: 16px;
              ">${p.interval}</div>
              
              <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
                <div>
                  <span style="color: var(--color-text-muted);">Texture:</span>
                  <span style="color: var(--color-text-secondary); margin-left: 4px;">${p.texture}</span>
                </div>
                <div style="color: var(--color-text-secondary); font-style: italic;">
                  "${p.character}"
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
// SOUND EVENTS
// =============================================================================

const soundEvents = [
  { name: 'startup', duration: '2.0s', character: 'Soft piano note rising, like waking up gently', emotion: 'Hello, I\'m here' },
  { name: 'connectionSuccess', duration: '1.2s', character: 'Warm resolution, like a gentle "yes"', emotion: 'We\'re connected' },
  { name: 'connectionLost', duration: '1.5s', character: 'Gentle descent, soft "see you soon"', emotion: 'Goodbye for now' },
  { name: 'thinking', duration: '3.0s (loop)', character: 'Subtle ambient texture, contemplative', emotion: 'I\'m thinking about this' },
  { name: 'celebrationSmall', duration: '1.8s', character: 'Ascending warmth, gentle cheer', emotion: 'That\'s worth celebrating' },
  { name: 'celebrationBig', duration: '2.5s', character: 'Full celebration, triumphant but tasteful', emotion: 'This is a big deal' },
  { name: 'notification', duration: '0.8s', character: 'Single warm bell, gentle tap', emotion: 'I thought of you' },
  { name: 'error', duration: '0.6s', character: 'Soft, questioning, not alarming', emotion: 'Hmm, that didn\'t work' },
];

export const SoundEvents: Story = {
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: var(--font-body); max-width: 800px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          Sound Events Library
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Core system sounds with musical specifications
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${soundEvents.map(s => `
            <div style="
              display: grid;
              grid-template-columns: 140px 80px 1fr;
              gap: 16px;
              padding: 16px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
              align-items: center;
            ">
              <div style="
                font-family: var(--font-mono);
                font-size: 13px;
                color: var(--persona-primary);
                font-weight: 500;
              ">${s.name}</div>
              <div style="
                font-size: 12px;
                color: var(--color-text-muted);
                text-align: center;
              ">${s.duration}</div>
              <div>
                <div style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 4px;">
                  ${s.character}
                </div>
                <div style="font-size: 12px; color: var(--color-text-muted); font-style: italic;">
                  "${s.emotion}"
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
// AESTHETIC REFERENCES
// =============================================================================

export const AestheticReferences: Story = {
  render: () => {
    const references = [
      { artist: 'Ólafur Arnalds', takeaway: 'Warm piano, gentle electronics, breathing space' },
      { artist: 'Max Richter', takeaway: 'Emotional depth, cinematic restraint' },
      { artist: 'Nils Frahm', takeaway: 'Organic imperfection, felt piano hammers' },
      { artist: 'Apple', takeaway: 'Functional clarity, satisfying feedback' },
      { artist: 'Studio Ghibli', takeaway: 'Whimsy without excess, natural sounds' },
    ];
    
    const notFerni = [
      'Clinical beeps and boops',
      'Aggressive notification sounds',
      'Generic UI sounds',
      'Synthesized without humanity',
      'Loud or startling',
      'Emotionally manipulative',
    ];
    
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: var(--font-body); max-width: 700px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 24px; color: var(--color-text-primary);">
          Aesthetic References
        </h2>
        
        <div style="
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 32px;
        ">
          ${references.map(r => `
            <div style="
              padding: 16px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
            ">
              <div style="font-weight: 600; color: var(--color-text-primary); margin-bottom: 8px;">
                ${r.artist}
              </div>
              <div style="font-size: 13px; color: var(--color-text-secondary);">
                ${r.takeaway}
              </div>
            </div>
          `).join('')}
        </div>
        
        <div style="
          padding: 20px;
          background: rgba(239, 68, 68, 0.08);
          border-radius: var(--radius-lg);
          border-left: 3px solid #ef4444;
        ">
          <h3 style="color: #ef4444; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">
            ✗ What Ferni Sound is NOT
          </h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 13px; color: var(--color-text-secondary);">
            ${notFerni.map(n => `<div>• ${n}</div>`).join('')}
          </div>
        </div>
      </div>
    `;
    return container;
  },
};

