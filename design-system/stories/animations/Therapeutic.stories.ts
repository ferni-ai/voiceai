import type { Meta, StoryObj } from '@storybook/html';
import { 
  playTherapeuticAnimation, 
  getAnimationsByIntent,
  createBreathAnimation,
  BREATH_PATTERNS,
} from '../../animations/therapeutic';

const meta: Meta = {
  title: 'Animations/Therapeutic',
  tags: ['autodocs'],
};

export default meta;

// Helper to create demo box
function createDemoBox(label: string, color: string = '#4a6741'): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText = `
    width: 120px;
    height: 120px;
    background: ${color};
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: Inter, system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
  `;
  box.textContent = label;
  return box;
}

// Grounding Animations
export const Grounding: StoryObj = {
  render: () => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    
    const title = document.createElement('h3');
    title.textContent = 'Grounding Animations';
    title.style.fontFamily = 'Inter, system-ui, sans-serif';
    title.style.marginBottom = '8px';
    container.appendChild(title);
    
    const description = document.createElement('p');
    description.textContent = 'Downward, settling movements for anxiety relief';
    description.style.fontFamily = 'Inter, system-ui, sans-serif';
    description.style.fontSize = '14px';
    description.style.color = '#8A847A';
    description.style.marginBottom = '24px';
    container.appendChild(description);
    
    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.gap = '24px';
    container.appendChild(grid);
    
    const animations = getAnimationsByIntent('grounding');
    animations.forEach(anim => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      
      const box = createDemoBox(anim.name, '#5a6b8a');
      wrapper.appendChild(box);
      
      const button = document.createElement('button');
      button.textContent = `Play ${anim.name}`;
      button.style.cssText = `
        margin-top: 12px;
        padding: 8px 16px;
        background: #f5f5f5;
        border: none;
        border-radius: 6px;
        font-family: Inter, system-ui, sans-serif;
        font-size: 13px;
        cursor: pointer;
      `;
      button.addEventListener('click', () => {
        playTherapeuticAnimation(box, anim.name);
      });
      wrapper.appendChild(button);
      
      grid.appendChild(wrapper);
    });
    
    return container;
  },
};

// Calming Animations
export const Calming: StoryObj = {
  render: () => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    
    const title = document.createElement('h3');
    title.textContent = 'Calming Animations';
    title.style.fontFamily = 'Inter, system-ui, sans-serif';
    title.style.marginBottom = '8px';
    container.appendChild(title);
    
    const description = document.createElement('p');
    description.textContent = 'Slow, rhythmic, breath-synced movements';
    description.style.fontFamily = 'Inter, system-ui, sans-serif';
    description.style.fontSize = '14px';
    description.style.color = '#8A847A';
    description.style.marginBottom = '24px';
    container.appendChild(description);
    
    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.gap = '24px';
    container.appendChild(grid);
    
    const animations = getAnimationsByIntent('calming');
    animations.forEach(anim => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      
      const box = createDemoBox(anim.name, '#4a6741');
      wrapper.appendChild(box);
      
      const button = document.createElement('button');
      button.textContent = `Play ${anim.name}`;
      button.style.cssText = `
        margin-top: 12px;
        padding: 8px 16px;
        background: #f5f5f5;
        border: none;
        border-radius: 6px;
        font-family: Inter, system-ui, sans-serif;
        font-size: 13px;
        cursor: pointer;
      `;
      button.addEventListener('click', () => {
        playTherapeuticAnimation(box, anim.name);
      });
      wrapper.appendChild(button);
      
      grid.appendChild(wrapper);
    });
    
    return container;
  },
};

// Energizing Animations
export const Energizing: StoryObj = {
  render: () => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    
    const title = document.createElement('h3');
    title.textContent = 'Energizing Animations';
    title.style.fontFamily = 'Inter, system-ui, sans-serif';
    title.style.marginBottom = '8px';
    container.appendChild(title);
    
    const description = document.createElement('p');
    description.textContent = 'Upward, expanding movements for motivation';
    description.style.fontFamily = 'Inter, system-ui, sans-serif';
    description.style.fontSize = '14px';
    description.style.color = '#8A847A';
    description.style.marginBottom = '24px';
    container.appendChild(description);
    
    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.gap = '24px';
    container.appendChild(grid);
    
    const animations = getAnimationsByIntent('energizing');
    animations.forEach(anim => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      
      const box = createDemoBox(anim.name, '#c4856a');
      wrapper.appendChild(box);
      
      const button = document.createElement('button');
      button.textContent = `Play ${anim.name}`;
      button.style.cssText = `
        margin-top: 12px;
        padding: 8px 16px;
        background: #f5f5f5;
        border: none;
        border-radius: 6px;
        font-family: Inter, system-ui, sans-serif;
        font-size: 13px;
        cursor: pointer;
      `;
      button.addEventListener('click', () => {
        playTherapeuticAnimation(box, anim.name);
      });
      wrapper.appendChild(button);
      
      grid.appendChild(wrapper);
    });
    
    return container;
  },
};

// Centering Animations
export const Centering: StoryObj = {
  render: () => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    
    const title = document.createElement('h3');
    title.textContent = 'Centering Animations';
    title.style.fontFamily = 'Inter, system-ui, sans-serif';
    title.style.marginBottom = '8px';
    container.appendChild(title);
    
    const description = document.createElement('p');
    description.textContent = 'Circular, gathering movements for focus';
    description.style.fontFamily = 'Inter, system-ui, sans-serif';
    description.style.fontSize = '14px';
    description.style.color = '#8A847A';
    description.style.marginBottom = '24px';
    container.appendChild(description);
    
    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.gap = '24px';
    container.appendChild(grid);
    
    const animations = getAnimationsByIntent('centering');
    animations.forEach(anim => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      
      const box = createDemoBox(anim.name, '#b8956a');
      wrapper.appendChild(box);
      
      const button = document.createElement('button');
      button.textContent = `Play ${anim.name}`;
      button.style.cssText = `
        margin-top: 12px;
        padding: 8px 16px;
        background: #f5f5f5;
        border: none;
        border-radius: 6px;
        font-family: Inter, system-ui, sans-serif;
        font-size: 13px;
        cursor: pointer;
      `;
      button.addEventListener('click', () => {
        playTherapeuticAnimation(box, anim.name);
      });
      wrapper.appendChild(button);
      
      grid.appendChild(wrapper);
    });
    
    return container;
  },
};

// Breath Patterns
export const BreathPatterns: StoryObj = {
  render: () => {
    const container = document.createElement('div');
    container.style.padding = '24px';
    
    const title = document.createElement('h3');
    title.textContent = 'Breath-Synced Animations';
    title.style.fontFamily = 'Inter, system-ui, sans-serif';
    title.style.marginBottom = '8px';
    container.appendChild(title);
    
    const description = document.createElement('p');
    description.textContent = 'Animations synced to different breathing patterns';
    description.style.fontFamily = 'Inter, system-ui, sans-serif';
    description.style.fontSize = '14px';
    description.style.color = '#8A847A';
    description.style.marginBottom = '24px';
    container.appendChild(description);
    
    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.gap = '24px';
    container.appendChild(grid);
    
    const patterns = Object.keys(BREATH_PATTERNS) as (keyof typeof BREATH_PATTERNS)[];
    let cleanupFunctions: (() => void)[] = [];
    
    patterns.forEach(pattern => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      
      const box = createDemoBox(pattern, '#4a6741');
      wrapper.appendChild(box);
      
      const info = document.createElement('div');
      const cycle = BREATH_PATTERNS[pattern];
      info.innerHTML = `
        <div style="font-size: 11px; color: #8A847A; margin-top: 8px;">
          In: ${cycle.inhale / 1000}s | 
          Hold: ${cycle.hold / 1000}s | 
          Out: ${cycle.exhale / 1000}s
        </div>
      `;
      info.style.fontFamily = 'Inter, system-ui, sans-serif';
      wrapper.appendChild(info);
      
      const buttonRow = document.createElement('div');
      buttonRow.style.display = 'flex';
      buttonRow.style.gap = '4px';
      buttonRow.style.justifyContent = 'center';
      buttonRow.style.marginTop = '8px';
      
      const startBtn = document.createElement('button');
      startBtn.textContent = 'Start';
      startBtn.style.cssText = `
        padding: 6px 12px;
        background: #4a6741;
        color: white;
        border: none;
        border-radius: 4px;
        font-family: Inter, system-ui, sans-serif;
        font-size: 12px;
        cursor: pointer;
      `;
      
      const stopBtn = document.createElement('button');
      stopBtn.textContent = 'Stop';
      stopBtn.style.cssText = `
        padding: 6px 12px;
        background: #f5f5f5;
        border: none;
        border-radius: 4px;
        font-family: Inter, system-ui, sans-serif;
        font-size: 12px;
        cursor: pointer;
      `;
      
      startBtn.addEventListener('click', () => {
        const cleanup = createBreathAnimation(box, pattern);
        cleanupFunctions.push(cleanup);
      });
      
      stopBtn.addEventListener('click', () => {
        cleanupFunctions.forEach(fn => fn());
        cleanupFunctions = [];
        box.style.transform = 'scale(1)';
      });
      
      buttonRow.appendChild(startBtn);
      buttonRow.appendChild(stopBtn);
      wrapper.appendChild(buttonRow);
      
      grid.appendChild(wrapper);
    });
    
    return container;
  },
};
