/**
 * Avatar Soul Section
 *
 * Admin Portal section for testing "Better Than Human" emotional animations.
 * Integrates with the Avatar Soul system for real-time testing.
 *
 * @module AvatarSoulSection
 */

import { ICON_ACTIVITY, ICON_TRUST, ICON_ZAP } from '../icons.js';

// Avatar Soul integration - dynamically imported
let avatarSoul: typeof import('../../ui/avatar-soul.ui.js') | null = null;
async function getAvatarSoul() {
  if (!avatarSoul) {
    try {
      avatarSoul = await import('../../ui/avatar-soul.ui.js');
    } catch {
      // Avatar Soul not available
    }
  }
  return avatarSoul;
}

// ============================================================================
// RENDER
// ============================================================================

export async function render(): Promise<string> {
  return `
    <div class="soul-section">
      <header class="soul-header">
        <h1>Avatar Soul Lab</h1>
        <p class="soul-subtitle">Test "Better Than Human" emotional animations in real-time</p>
      </header>

      <!-- Live Avatar Preview -->
      <div class="soul-preview-panel">
        <div class="soul-preview-container" id="adminSoulPreview">
          <div class="soul-preview-glow" id="adminSoulGlow"></div>
          <div class="soul-preview-comfort" id="adminSoulComfort">
            <div class="comfort-ring"></div>
            <div class="comfort-ring" style="animation-delay: 0.8s"></div>
          </div>
          <div class="soul-preview-avatar" id="adminSoulAvatar">
            <div class="soul-preview-eye">
              <div class="soul-preview-pupil" id="adminSoulPupil"></div>
              <div class="soul-preview-shimmer"></div>
            </div>
            <span class="soul-preview-initial">F</span>
          </div>
          <div class="soul-preview-spark" id="adminSoulSpark"></div>
        </div>
        <div class="soul-preview-info">
          <h3>Preview Status</h3>
          <div class="soul-status-grid">
            <div class="soul-status-item">
              <span class="status-label">State</span>
              <span class="status-value" id="adminSoulState">Neutral</span>
            </div>
            <div class="soul-status-item">
              <span class="status-label">Pupil</span>
              <span class="status-value" id="adminSoulPupilState">12px</span>
            </div>
            <div class="soul-status-item">
              <span class="status-label">Warmth</span>
              <span class="status-value" id="adminSoulWarmth">0.3</span>
            </div>
            <div class="soul-status-item">
              <span class="status-label">Energy</span>
              <span class="status-value" id="adminSoulEnergy">0.5</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Control Categories -->
      <div class="soul-controls-grid">
        <!-- Pupil & Gaze -->
        <div class="soul-control-card">
          <div class="control-header">
            ${ICON_ACTIVITY}
            <h3>Pupil & Gaze</h3>
          </div>
          <p>Interest & connection signals through eye behavior</p>
          
          <div class="control-group">
            <label>Pupil Dilation</label>
            <div class="control-buttons">
              <button class="soul-btn" data-soul="pupil" data-value="CONTRACTED">Thinking</button>
              <button class="soul-btn" data-soul="pupil" data-value="NEUTRAL">Neutral</button>
              <button class="soul-btn" data-soul="pupil" data-value="INTERESTED">Interested</button>
              <button class="soul-btn" data-soul="pupil" data-value="DILATED">Connected</button>
            </div>
          </div>

          <div class="control-group">
            <label>Gaze Direction</label>
            <div class="control-buttons">
              <button class="soul-btn" data-soul="gaze" data-value="center">Center</button>
              <button class="soul-btn" data-soul="gaze" data-value="left">Left</button>
              <button class="soul-btn" data-soul="gaze" data-value="right">Right</button>
              <button class="soul-btn" data-soul="gaze" data-value="thinking">Think</button>
            </div>
          </div>
        </div>

        <!-- Emotional Glow -->
        <div class="soul-control-card">
          <div class="control-header">
            ${ICON_ZAP}
            <h3>Emotional Glow</h3>
          </div>
          <p>Glow bleeding for intense emotional states</p>
          
          <div class="control-group">
            <label>Glow Type</label>
            <div class="control-buttons">
              <button class="soul-btn" data-soul="glow" data-value="none">None</button>
              <button class="soul-btn soul-btn--warm" data-soul="glow" data-value="warmth">Warmth</button>
              <button class="soul-btn soul-btn--joy" data-soul="glow" data-value="joy">Joy</button>
              <button class="soul-btn soul-btn--concern" data-soul="glow" data-value="concern">Concern</button>
            </div>
          </div>

          <div class="control-group">
            <label>Protective Mode</label>
            <div class="control-buttons">
              <button class="soul-btn" data-soul="protective" data-value="mild">Mild</button>
              <button class="soul-btn" data-soul="protective" data-value="moderate">Moderate</button>
              <button class="soul-btn" data-soul="protective" data-value="significant">Full</button>
            </div>
          </div>
        </div>

        <!-- One-Shot Effects -->
        <div class="soul-control-card">
          <div class="control-header">
            ${ICON_TRUST}
            <h3>One-Shot Effects</h3>
          </div>
          <p>Momentary animations for special moments</p>
          
          <div class="control-group">
            <label>Trigger Effect</label>
            <div class="control-buttons">
              <button class="soul-btn soul-btn--effect" data-soul="effect" data-value="memorySpark">Memory Spark</button>
              <button class="soul-btn soul-btn--effect" data-soul="effect" data-value="anticipation">Anticipation</button>
              <button class="soul-btn soul-btn--effect" data-soul="effect" data-value="comfortPulse">Comfort Pulse</button>
              <button class="soul-btn soul-btn--effect" data-soul="effect" data-value="growthCelebration">Celebrate</button>
            </div>
          </div>

          <div class="control-group">
            <label>Thinking Complexity</label>
            <div class="control-buttons">
              <button class="soul-btn" data-soul="thinking" data-value="simple">Simple</button>
              <button class="soul-btn" data-soul="thinking" data-value="complex">Complex</button>
              <button class="soul-btn" data-soul="thinking" data-value="deep">Deep</button>
            </div>
          </div>
        </div>

        <!-- Continuous Controls -->
        <div class="soul-control-card soul-control-card--wide">
          <div class="control-header">
            ${ICON_ACTIVITY}
            <h3>Continuous Controls</h3>
          </div>
          <p>Adjust ongoing avatar states</p>
          
          <div class="soul-sliders">
            <div class="soul-slider">
              <label>Energy Level: <span id="adminEnergyValue">0.5</span></label>
              <input type="range" min="0" max="1" step="0.1" value="0.5" id="adminEnergySlider" data-soul-slider="energy">
            </div>
            <div class="soul-slider">
              <label>Relationship Warmth: <span id="adminWarmthValue">0.3</span></label>
              <input type="range" min="0" max="1" step="0.1" value="0.3" id="adminWarmthSlider" data-soul-slider="warmth">
            </div>
            <div class="soul-slider">
              <label>Breath Rate (BPM): <span id="adminBreathValue">15</span></label>
              <input type="range" min="8" max="24" step="1" value="15" id="adminBreathSlider" data-soul-slider="breath">
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Links -->
      <div class="soul-links">
        <a href="/design-system/preview/index.html#avatar-soul" target="_blank" class="soul-link">
          View in Design System →
        </a>
        <a href="https://docs.google.com/document/d/YOUR_DOC_ID" target="_blank" class="soul-link">
          Better Than Human Docs →
        </a>
      </div>
    </div>

    <style>
      .soul-section {
        padding: var(--space-6, 1.5rem);
      }

      .soul-header {
        margin-bottom: var(--space-6, 1.5rem);
      }

      .soul-header h1 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 0.5rem;
      }

      .soul-subtitle {
        color: var(--color-text-muted, rgba(255,255,255,0.6));
        margin: 0;
      }

      /* Preview Panel */
      .soul-preview-panel {
        display: flex;
        gap: var(--space-xl, 2rem);
        padding: var(--space-xl, 2rem);
        background: linear-gradient(135deg, var(--color-ferni-glass, rgba(74, 103, 65, 0.15)), var(--color-warmth-glass, rgba(154, 123, 90, 0.1)));
        border-radius: var(--radius-xl, 16px);
        border: 1px solid var(--color-ferni-border, rgba(74, 103, 65, 0.3));
        margin-bottom: var(--space-xl, 2rem);
      }

      .soul-preview-container {
        position: relative;
        width: 140px;
        height: 140px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .soul-preview-glow {
        position: absolute;
        inset: -30px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(196, 162, 101, 0) 0%, transparent 70%);
        filter: blur(20px);
        opacity: 0;
        transition: all 0.5s ease-out;
        pointer-events: none;
      }

      .soul-preview-glow.active {
        opacity: 1;
        background: radial-gradient(circle, var(--soul-glow-color, rgba(196, 162, 101, 0.5)) 0%, transparent 70%);
      }

      .soul-preview-comfort {
        position: absolute;
        inset: -40px;
        pointer-events: none;
        opacity: 0;
      }

      .soul-preview-comfort.active {
        opacity: 1;
      }

      .soul-preview-comfort .comfort-ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: radial-gradient(circle, transparent 30%, rgba(154, 123, 90, 0.2) 50%, transparent 70%);
        animation: adminComfortPulse 2.5s ease-out infinite;
      }

      @keyframes adminComfortPulse {
        0% { transform: scale(0.8); opacity: 0; }
        50% { transform: scale(1.5); opacity: 0.6; }
        100% { transform: scale(2); opacity: 0; }
      }

      .soul-preview-avatar {
        position: relative;
        width: 100px;
        height: 100px;
        border-radius: 50%;
        background: linear-gradient(180deg, var(--persona-primary, var(--color-ferni)), var(--persona-secondary, var(--color-ferni-dark)));
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 40px var(--color-ferni-glow, rgba(74, 103, 65, 0.5));
        transition: transform var(--duration-slow, 0.6s) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)), box-shadow var(--duration-slow, 0.5s) ease;
        z-index: var(--z-raised, 2);
      }

      .soul-preview-avatar.protective {
        transform: scale(1.1);
        box-shadow: 0 0 50px var(--color-warmth-glow, rgba(154, 123, 90, 0.7));
      }

      .soul-preview-initial {
        font-size: 2.5rem;
        font-weight: bold;
        color: white;
        z-index: 3;
      }

      .soul-preview-eye {
        position: absolute;
        top: 18%;
        left: 50%;
        transform: translateX(-50%);
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, var(--color-white-30, rgba(255,255,255,0.3)), transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .soul-preview-pupil {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: radial-gradient(circle, var(--color-bg-darkest, #1a1612), var(--color-bg-dark, #2c2520));
        transition: all var(--duration-normal, 0.4s) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
      }

      .soul-preview-pupil.contracted { width: 8px; height: 8px; }
      .soul-preview-pupil.neutral { width: 12px; height: 12px; }
      .soul-preview-pupil.interested { width: 15px; height: 15px; }
      .soul-preview-pupil.dilated { width: 18px; height: 18px; }

      .soul-preview-shimmer {
        position: absolute;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,255,255,0.8), transparent);
        top: 20%;
        left: 20%;
        animation: adminShimmer 3s linear infinite;
      }

      @keyframes adminShimmer {
        0% { top: 20%; left: 20%; }
        25% { top: 20%; left: 60%; }
        50% { top: 60%; left: 60%; }
        75% { top: 60%; left: 20%; }
        100% { top: 20%; left: 20%; }
      }

      .soul-preview-spark {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 215, 100, 0.8) 0%, rgba(196, 162, 101, 0.4) 40%, transparent 70%);
        opacity: 0;
        transform: scale(0.5);
        pointer-events: none;
        z-index: 1;
      }

      .soul-preview-spark.active {
        animation: adminSpark 0.8s ease-out forwards;
      }

      @keyframes adminSpark {
        0% { opacity: 0; transform: scale(0.5); }
        30% { opacity: 1; transform: scale(1.5); }
        100% { opacity: 0; transform: scale(2.5); }
      }

      .soul-preview-info {
        flex: 1;
      }

      .soul-preview-info h3 {
        margin: 0 0 1rem;
        font-size: 1rem;
        font-weight: 600;
      }

      .soul-status-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;
      }

      .soul-status-item {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs, 0.25rem);
        padding: var(--space-sm, 0.75rem);
        background: var(--color-bg-secondary, rgba(0,0,0,0.2));
        border-radius: var(--radius-md, 8px);
      }

      .soul-status-item .status-label {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .soul-status-item .status-value {
        font-size: 1rem;
        font-weight: 600;
        color: var(--persona-primary, var(--color-ferni));
      }

      /* Control Cards */
      .soul-controls-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: var(--space-md, 1rem);
        margin-bottom: var(--space-xl, 2rem);
      }

      .soul-control-card {
        background: var(--color-bg-glass, rgba(255,255,255,0.05));
        border: 1px solid var(--color-border-subtle, rgba(255,255,255,0.1));
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-md, 1.25rem);
      }

      .soul-control-card--wide {
        grid-column: 1 / -1;
      }

      .control-header {
        display: flex;
        align-items: center;
        gap: var(--space-sm, 0.5rem);
        margin-bottom: var(--space-sm, 0.5rem);
      }

      .control-header svg {
        width: 20px;
        height: 20px;
        color: var(--persona-primary, var(--color-ferni));
      }

      .control-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
      }

      .soul-control-card > p {
        color: var(--color-text-muted);
        font-size: 0.85rem;
        margin: 0 0 var(--space-md, 1rem);
      }

      .control-group {
        margin-bottom: var(--space-md, 1rem);
      }

      .control-group:last-child {
        margin-bottom: 0;
      }

      .control-group label {
        display: block;
        font-size: 0.8rem;
        color: var(--color-text-muted);
        margin-bottom: var(--space-sm, 0.5rem);
      }

      .control-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-sm, 0.5rem);
      }

      .soul-btn {
        padding: var(--space-sm, 0.5rem) var(--space-sm, 0.75rem);
        background: var(--color-bg-glass, rgba(255,255,255,0.1));
        border: 1px solid var(--color-border-subtle, rgba(255,255,255,0.15));
        border-radius: var(--radius-md, 6px);
        color: var(--color-text-primary);
        font-size: 0.8rem;
        cursor: pointer;
        transition: all var(--duration-fast, 0.2s);
      }

      .soul-btn:hover,
      .soul-btn:focus-visible {
        background: var(--color-bg-elevated, rgba(255,255,255,0.2));
        border-color: var(--persona-primary, var(--color-ferni));
      }

      .soul-btn:focus-visible {
        outline: 2px solid var(--color-accent-primary, var(--color-ferni));
        outline-offset: 2px;
      }

      .soul-btn--warm:hover,
      .soul-btn--warm:focus-visible { border-color: var(--color-warmth, #c4a265); }
      .soul-btn--joy:hover,
      .soul-btn--joy:focus-visible { border-color: var(--color-joy, #ffd764); }
      .soul-btn--concern:hover,
      .soul-btn--concern:focus-visible { border-color: var(--color-comfort, #9a7b5a); }
      .soul-btn--effect { background: var(--color-ferni-glass, rgba(74, 103, 65, 0.2)); }

      /* Sliders */
      .soul-sliders {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: var(--space-lg, 1.5rem);
      }

      .soul-slider label {
        display: block;
        font-size: 0.85rem;
        margin-bottom: var(--space-sm, 0.5rem);
      }

      .soul-slider input[type="range"] {
        width: 100%;
        height: 8px;
        border-radius: var(--radius-sm, 4px);
        background: var(--color-bg-glass, rgba(255,255,255,0.1));
        appearance: none;
        cursor: pointer;
      }

      .soul-slider input[type="range"]:focus-visible {
        outline: 2px solid var(--color-accent-primary, var(--color-ferni));
        outline-offset: 2px;
      }

      .soul-slider input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--persona-primary, var(--color-ferni));
        cursor: pointer;
        transition: transform var(--duration-fast, 0.2s);
      }

      .soul-slider input[type="range"]::-webkit-slider-thumb:hover {
        transform: scale(1.2);
      }

      /* Links */
      .soul-links {
        display: flex;
        gap: var(--space-md, 1rem);
        padding-top: var(--space-md, 1rem);
        border-top: 1px solid var(--color-border-subtle, rgba(255,255,255,0.1));
      }

      .soul-link {
        color: var(--persona-primary, var(--color-ferni));
        text-decoration: none;
        font-size: 0.85rem;
        transition: opacity var(--duration-fast, 0.2s);
      }

      .soul-link:hover {
        opacity: 0.8;
      }

      .soul-link:focus-visible {
        outline: 2px solid var(--color-accent-primary, var(--color-ferni));
        outline-offset: 2px;
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .soul-preview-shimmer,
        .soul-preview-spark,
        .comfort-ring {
          animation: none;
        }
        .soul-preview-avatar,
        .soul-preview-pupil,
        .soul-btn,
        .soul-slider input[type="range"]::-webkit-slider-thumb {
          transition: none;
        }
      }
    </style>
  `;
}

// ============================================================================
// EVENT SETUP
// ============================================================================

export function setupEvents(): void {
  // Button clicks
  document.querySelectorAll('[data-soul]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-soul');
      const value = target.getAttribute('data-value');
      if (action && value) {
        await handleSoulAction(action, value);
      }
    });
  });

  // Sliders
  const energySlider = document.getElementById('adminEnergySlider') as HTMLInputElement;
  const warmthSlider = document.getElementById('adminWarmthSlider') as HTMLInputElement;
  const breathSlider = document.getElementById('adminBreathSlider') as HTMLInputElement;

  if (energySlider) {
    energySlider.addEventListener('input', async () => {
      const value = parseFloat(energySlider.value);
      const display = document.getElementById('adminEnergyValue');
      const statusDisplay = document.getElementById('adminSoulEnergy');
      if (display) display.textContent = value.toString();
      if (statusDisplay) statusDisplay.textContent = value.toString();
      await handleSoulSlider('energy', value);
    });
  }

  if (warmthSlider) {
    warmthSlider.addEventListener('input', async () => {
      const value = parseFloat(warmthSlider.value);
      const display = document.getElementById('adminWarmthValue');
      const statusDisplay = document.getElementById('adminSoulWarmth');
      if (display) display.textContent = value.toString();
      if (statusDisplay) statusDisplay.textContent = value.toString();
      await handleSoulSlider('warmth', value);
    });
  }

  if (breathSlider) {
    breathSlider.addEventListener('input', async () => {
      const value = parseInt(breathSlider.value);
      const display = document.getElementById('adminBreathValue');
      if (display) display.textContent = value.toString();
      await handleSoulSlider('breath', value);
    });
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

async function handleSoulAction(action: string, value: string): Promise<void> {
  const soul = await getAvatarSoul();
  
  // Update preview
  updateAdminSoulPreview(action, value);

  if (!soul) return;

  try {
    switch (action) {
      case 'pupil':
        soul.avatarSoul.setPupilDilation(
          value as 'CONTRACTED' | 'NEUTRAL' | 'DILATED' | 'INTERESTED' | 'CONNECTED',
          value === 'CONTRACTED' ? 'fast' : 'slow'
        );
        break;

      case 'glow':
        if (value === 'none') {
          soul.avatarSoul.setGlowBleed(0);
        } else if (value === 'warmth') {
          soul.avatarSoul.setGlowBleed(0.3, 'rgba(196, 162, 101, 0.5)');
        } else if (value === 'joy') {
          soul.avatarSoul.setGlowBleed(0.4, 'rgba(255, 215, 100, 0.6)');
        } else if (value === 'concern') {
          soul.avatarSoul.setGlowBleed(0.25, 'rgba(154, 123, 90, 0.4)');
        }
        break;

      case 'effect':
        if (value === 'memorySpark') {
          soul.avatarSoul.triggerMemorySpark();
        } else if (value === 'anticipation') {
          soul.avatarSoul.playAnticipation('curious');
        } else if (value === 'comfortPulse') {
          soul.avatarSoul.startComfortPulse();
          setTimeout(() => soul.avatarSoul.stopComfortPulse(), 5000);
        } else if (value === 'growthCelebration') {
          soul.avatarSoul.celebrateGrowth();
        }
        break;

      case 'protective':
        soul.avatarSoul.enterProtectiveMode();
        const duration = value === 'mild' ? 2000 : value === 'moderate' ? 4000 : 6000;
        setTimeout(() => soul.avatarSoul.exitProtectiveMode(), duration);
        break;

      case 'thinking':
        soul.avatarSoul.setPupilDilation('CONTRACTED', 'fast');
        soul.avatarSoul.glanceAway();
        break;

      case 'gaze':
        if (value === 'center') {
          soul.avatarSoul.gazeAt(0, 0);
        } else if (value === 'left') {
          soul.avatarSoul.gazeAt(-1, 0);
        } else if (value === 'right') {
          soul.avatarSoul.gazeAt(1, 0);
        } else if (value === 'thinking') {
          soul.avatarSoul.glanceAway();
        }
        break;
    }
  } catch (err) {
    console.error('Soul action failed:', err);
  }
}

async function handleSoulSlider(type: string, value: number): Promise<void> {
  const soul = await getAvatarSoul();
  if (!soul) return;

  try {
    switch (type) {
      case 'energy':
        soul.avatarSoul.setUserEnergy(value);
        break;
      case 'warmth':
        soul.avatarSoul.recordInteraction(value);
        break;
      case 'breath':
        const shimmerIntensity = (value - 8) / 16;
        soul.avatarSoul.flashShimmer(shimmerIntensity);
        break;
    }
  } catch (err) {
    console.error('Soul slider failed:', err);
  }
}

function updateAdminSoulPreview(action: string, value: string): void {
  const pupil = document.getElementById('adminSoulPupil');
  const glow = document.getElementById('adminSoulGlow');
  const avatar = document.getElementById('adminSoulAvatar');
  const spark = document.getElementById('adminSoulSpark');
  const comfort = document.getElementById('adminSoulComfort');
  const stateEl = document.getElementById('adminSoulState');
  const pupilStateEl = document.getElementById('adminSoulPupilState');

  switch (action) {
    case 'pupil':
      if (pupil) {
        pupil.className = 'soul-preview-pupil ' + value.toLowerCase();
        const sizes: Record<string, string> = {
          CONTRACTED: '8px',
          NEUTRAL: '12px',
          INTERESTED: '15px',
          DILATED: '18px',
          CONNECTED: '18px',
        };
        if (pupilStateEl) pupilStateEl.textContent = sizes[value] || '12px';
      }
      if (stateEl) stateEl.textContent = value.charAt(0) + value.slice(1).toLowerCase();
      break;

    case 'glow':
      if (glow) {
        if (value === 'none') {
          glow.classList.remove('active');
        } else {
          const defaultColor = 'rgba(196, 162, 101, 0.5)';
          const colors: Record<string, string> = {
            warmth: defaultColor,
            joy: 'rgba(255, 215, 100, 0.6)',
            concern: 'rgba(154, 123, 90, 0.4)',
          };
          glow.style.setProperty('--soul-glow-color', colors[value] || defaultColor);
          glow.classList.add('active');
        }
      }
      if (stateEl) stateEl.textContent = value === 'none' ? 'Neutral' : value.charAt(0).toUpperCase() + value.slice(1);
      break;

    case 'effect':
      if (value === 'memorySpark' && spark) {
        spark.classList.remove('active');
        void spark.offsetWidth;
        spark.classList.add('active');
        setTimeout(() => spark.classList.remove('active'), 800);
      } else if (value === 'comfortPulse' && comfort) {
        comfort.classList.add('active');
        setTimeout(() => comfort.classList.remove('active'), 5000);
      }
      if (stateEl) {
        const labels: Record<string, string> = {
          memorySpark: 'Memory Spark',
          anticipation: 'Anticipation',
          comfortPulse: 'Comfort',
          growthCelebration: 'Celebrate!',
        };
        stateEl.textContent = labels[value] || value;
      }
      break;

    case 'protective':
      if (avatar) {
        avatar.classList.add('protective');
        const duration = value === 'mild' ? 2000 : value === 'moderate' ? 4000 : 6000;
        setTimeout(() => avatar.classList.remove('protective'), duration);
      }
      if (glow) {
        glow.style.setProperty('--soul-glow-color', 'rgba(154, 123, 90, 0.5)');
        glow.classList.add('active');
        const duration = value === 'mild' ? 2000 : value === 'moderate' ? 4000 : 6000;
        setTimeout(() => glow.classList.remove('active'), duration);
      }
      if (stateEl) stateEl.textContent = `Protective (${value})`;
      break;

    case 'thinking':
      if (pupil) {
        pupil.className = 'soul-preview-pupil contracted';
        if (pupilStateEl) pupilStateEl.textContent = '8px';
      }
      if (stateEl) stateEl.textContent = `Thinking (${value})`;
      break;

    case 'gaze':
      if (stateEl) stateEl.textContent = `Gaze: ${value}`;
      break;
  }
}

