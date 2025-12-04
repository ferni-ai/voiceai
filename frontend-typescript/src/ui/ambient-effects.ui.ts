/**
 * Ambient Effects UI - Pixar-Quality Visual Atmosphere
 * 
 * Creates the living, breathing world that makes interfaces feel magical.
 * Like the dust particles in WALL-E or the ambient glow in Soul.
 * 
 * 🎬 PIXAR PRINCIPLES APPLIED:
 * - STAGING: Background supports without distracting
 * - APPEAL: Warm, inviting atmosphere
 * - SECONDARY ACTION: Subtle movement enhances presence
 * - TIMING: Slow, meditative rhythms create calm
 * 
 * Features:
 * - Aurora borealis-style flowing gradients
 * - Floating ambient particles
 * - Warm vignette effect
 * - Color bleeding from persona to UI
 * - Paper texture overlay
 */

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let prefersReducedMotion = false;
let auroraCanvas: HTMLCanvasElement | null = null;
let auroraCtx: CanvasRenderingContext2D | null = null;
let auroraAnimationId: number | null = null;
let particlesContainer: HTMLElement | null = null;
let particleAnimationId: number | null = null;
let currentPersonaColors = {
  primary: '#4a7c59',
  secondary: '#6b9b7c',
  glow: 'rgba(74, 124, 89, 0.3)',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initAmbientEffects(): void {
  if (isInitialized) return;
  
  // Check reduced motion preference
  prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
    if (prefersReducedMotion) {
      stopAllEffects();
    }
  });
  
  isInitialized = true;
}

// ============================================================================
// 🌌 AURORA BOREALIS EFFECT
// ============================================================================

/**
 * Start the aurora background effect.
 * Beautiful flowing gradients that respond to persona colors.
 */
export function startAurora(container?: HTMLElement): void {
  if (prefersReducedMotion) return;
  
  const parent = container ?? document.body;
  
  // Create canvas if not exists
  if (!auroraCanvas) {
    auroraCanvas = document.createElement('canvas');
    auroraCanvas.id = 'aurora-canvas';
    auroraCanvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: -1;
      opacity: 0.3;
    `;
    parent.appendChild(auroraCanvas);
    
    // Resize canvas to window
    resizeAuroraCanvas();
    window.addEventListener('resize', resizeAuroraCanvas);
    
    auroraCtx = auroraCanvas.getContext('2d');
  }
  
  if (!auroraCtx) return;
  
  // Start animation loop
  let time = 0;
  const animate = () => {
    if (!auroraCanvas || !auroraCtx) return;
    
    time += 0.002;
    drawAurora(auroraCtx, auroraCanvas.width, auroraCanvas.height, time);
    auroraAnimationId = requestAnimationFrame(animate);
  };
  
  auroraAnimationId = requestAnimationFrame(animate);
}

/**
 * Draw the aurora effect.
 */
function drawAurora(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number
): void {
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Create flowing gradient waves
  const waves = [
    { amplitude: 0.3, frequency: 0.5, speed: 1, color: currentPersonaColors.primary },
    { amplitude: 0.25, frequency: 0.7, speed: 1.3, color: currentPersonaColors.secondary },
    { amplitude: 0.2, frequency: 0.9, speed: 0.8, color: currentPersonaColors.glow },
  ];
  
  for (const wave of waves) {
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    // Draw wave path
    for (let x = 0; x <= width; x += 10) {
      const y = height * (0.7 + 
        wave.amplitude * Math.sin(x * 0.002 * wave.frequency + time * wave.speed) *
        Math.cos(x * 0.001 + time * wave.speed * 0.5)
      );
      ctx.lineTo(x, y);
    }
    
    ctx.lineTo(width, height);
    ctx.closePath();
    
    // Create gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.5, hexToRgba(wave.color, 0.1));
    gradient.addColorStop(1, hexToRgba(wave.color, 0.05));
    
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}

/**
 * Resize aurora canvas to match window.
 */
function resizeAuroraCanvas(): void {
  if (!auroraCanvas) return;
  auroraCanvas.width = window.innerWidth;
  auroraCanvas.height = window.innerHeight;
}

/**
 * Stop the aurora effect.
 */
export function stopAurora(): void {
  if (auroraAnimationId) {
    cancelAnimationFrame(auroraAnimationId);
    auroraAnimationId = null;
  }
  
  if (auroraCanvas?.parentNode) {
    auroraCanvas.parentNode.removeChild(auroraCanvas);
    auroraCanvas = null;
    auroraCtx = null;
  }
  
  window.removeEventListener('resize', resizeAuroraCanvas);
}

// ============================================================================
// ✨ FLOATING PARTICLES
// ============================================================================

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  element: HTMLElement;
}

const particles: Particle[] = [];
const MAX_PARTICLES = 20;

/**
 * Start floating ambient particles.
 * Like dust motes in sunlight.
 */
export function startParticles(container?: HTMLElement): void {
  if (prefersReducedMotion) return;
  
  const parent = container ?? document.body;
  
  // Create particles container
  if (!particlesContainer) {
    particlesContainer = document.createElement('div');
    particlesContainer.id = 'ambient-particles';
    particlesContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    `;
    parent.appendChild(particlesContainer);
  }
  
  // Create initial particles
  for (let i = 0; i < MAX_PARTICLES; i++) {
    createParticle();
  }
  
  // Start animation loop
  const animate = () => {
    updateParticles();
    particleAnimationId = requestAnimationFrame(animate);
  };
  
  particleAnimationId = requestAnimationFrame(animate);
}

/**
 * Create a single particle.
 */
function createParticle(): void {
  if (!particlesContainer) return;
  
  const element = document.createElement('div');
  const size = 2 + Math.random() * 4;
  
  element.style.cssText = `
    position: absolute;
    width: ${size}px;
    height: ${size}px;
    background: ${currentPersonaColors.primary};
    border-radius: 50%;
    opacity: 0;
    transition: opacity 2s ease-out;
  `;
  
  particlesContainer.appendChild(element);
  
  const particle: Particle = {
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    size,
    speedX: (Math.random() - 0.5) * 0.3,
    speedY: -0.2 - Math.random() * 0.3, // Drift upward
    opacity: 0,
    element,
  };
  
  particles.push(particle);
  
  // Fade in
  requestAnimationFrame(() => {
    element.style.opacity = String(0.3 + Math.random() * 0.4);
    particle.opacity = parseFloat(element.style.opacity);
  });
}

/**
 * Update particle positions.
 */
function updateParticles(): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (!p) continue;
    
    // Update position
    p.x += p.speedX;
    p.y += p.speedY;
    
    // Add subtle wave motion
    p.x += Math.sin(Date.now() * 0.001 + i) * 0.1;
    
    // Update element position
    p.element.style.transform = `translate(${p.x}px, ${p.y}px)`;
    
    // Remove if off-screen
    if (p.y < -20 || p.x < -20 || p.x > window.innerWidth + 20) {
      p.element.remove();
      particles.splice(i, 1);
      
      // Create replacement
      if (particles.length < MAX_PARTICLES) {
        createParticle();
      }
    }
  }
}

/**
 * Stop floating particles.
 */
export function stopParticles(): void {
  if (particleAnimationId) {
    cancelAnimationFrame(particleAnimationId);
    particleAnimationId = null;
  }
  
  particles.forEach(p => p.element.remove());
  particles.length = 0;
  
  if (particlesContainer?.parentNode) {
    particlesContainer.parentNode.removeChild(particlesContainer);
    particlesContainer = null;
  }
}

// ============================================================================
// 🌈 COLOR BLEEDING
// ============================================================================

/**
 * Update ambient colors based on persona.
 * Creates cohesive atmosphere that matches the character.
 */
export function setPersonaColors(colors: {
  primary: string;
  secondary: string;
  glow: string;
}): void {
  currentPersonaColors = colors;
  
  // Update particle colors
  particles.forEach(p => {
    p.element.style.background = colors.primary;
  });
  
  // Update vignette if active
  updateVignette();
}

// ============================================================================
// 🎭 VIGNETTE EFFECT
// ============================================================================

let vignetteElement: HTMLElement | null = null;

/**
 * Add warm vignette effect around edges.
 * Creates intimate, focused atmosphere.
 */
export function addVignette(container?: HTMLElement): void {
  const parent = container ?? document.body;
  
  if (vignetteElement) return;
  
  vignetteElement = document.createElement('div');
  vignetteElement.id = 'vignette-overlay';
  vignetteElement.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9998;
    background: radial-gradient(
      ellipse at center,
      transparent 50%,
      ${hexToRgba(currentPersonaColors.glow, 0.15)} 100%
    );
  `;
  
  parent.appendChild(vignetteElement);
}

/**
 * Update vignette color.
 */
function updateVignette(): void {
  if (!vignetteElement) return;
  
  vignetteElement.style.background = `radial-gradient(
    ellipse at center,
    transparent 50%,
    ${hexToRgba(currentPersonaColors.glow, 0.15)} 100%
  )`;
}

/**
 * Remove vignette effect.
 */
export function removeVignette(): void {
  if (vignetteElement?.parentNode) {
    vignetteElement.parentNode.removeChild(vignetteElement);
    vignetteElement = null;
  }
}

// ============================================================================
// 📜 PAPER TEXTURE
// ============================================================================

let textureElement: HTMLElement | null = null;

/**
 * Add subtle paper texture overlay.
 * Adds warmth and tactile quality.
 */
export function addPaperTexture(container?: HTMLElement): void {
  const parent = container ?? document.body;
  
  if (textureElement) return;
  
  textureElement = document.createElement('div');
  textureElement.id = 'paper-texture';
  textureElement.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9997;
    opacity: 0.02;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 200px 200px;
  `;
  
  parent.appendChild(textureElement);
}

/**
 * Remove paper texture.
 */
export function removePaperTexture(): void {
  if (textureElement?.parentNode) {
    textureElement.parentNode.removeChild(textureElement);
    textureElement = null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert hex color to rgba.
 */
function hexToRgba(hex: string, alpha: number): string {
  // Handle rgba input
  if (hex.startsWith('rgba')) {
    return hex;
  }
  
  // Handle rgb input
  if (hex.startsWith('rgb(')) {
    const match = hex.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    }
  }
  
  // Handle hex input
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Stop all ambient effects.
 */
export function stopAllEffects(): void {
  stopAurora();
  stopParticles();
  removeVignette();
  removePaperTexture();
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  stopAllEffects();
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ambientEffectsUI = {
  init: initAmbientEffects,
  startAurora,
  stopAurora,
  startParticles,
  stopParticles,
  setPersonaColors,
  addVignette,
  removeVignette,
  addPaperTexture,
  removePaperTexture,
  stopAll: stopAllEffects,
  dispose,
};

