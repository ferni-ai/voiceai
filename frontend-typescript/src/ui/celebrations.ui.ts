/**
 * Celebrations UI - Confetti and achievement effects
 * 
 * Beautiful particle effects for:
 * - First connection
 * - Milestones (5 min, 10 conversations, etc.)
 * - Persona discovery
 * - Easter eggs
 */

// ============================================================================
// TYPES
// ============================================================================

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  gravity: number;
  friction: number;
  shape: 'square' | 'circle' | 'star';
}

// CelebrationType can be used for type checking celebration triggers
// type CelebrationType = 'confetti' | 'sparkles' | 'fireworks' | 'bubbles';

// ============================================================================
// STATE
// ============================================================================

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let animationId: number | null = null;
let isAnimating = false;

// Celebration colors
const COLORS = [
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#3b82f6', // Blue
];

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initCelebrationsUI(): void {
  createCanvas();
  console.log('🎉 Celebrations UI initialized');
}

function createCanvas(): void {
  canvas = document.createElement('canvas');
  canvas.id = 'celebrationCanvas';
  canvas.className = 'celebration-canvas';
  canvas.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s;
  `;
  
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  
  // Handle resize
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas(): void {
  if (!canvas) return;
  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  
  if (ctx) {
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
}

// ============================================================================
// CELEBRATION TRIGGERS
// ============================================================================

/**
 * Confetti disabled - not aligned with Zen aesthetic
 * Use fireworks() for subtle celebrations instead
 */
export function confetti(_options: { 
  count?: number; 
  origin?: { x: number; y: number };
  spread?: number;
  colors?: string[];
} = {}): void {
  // Disabled - use subtle fireworks instead for Zen aesthetic
  // fireworks(1) can be called instead if celebration is needed
}

/**
 * Trigger sparkle effect
 */
export function sparkles(options: {
  count?: number;
  origin?: { x: number; y: number };
  radius?: number;
  colors?: string[];
} = {}): void {
  const count = options.count ?? 30;
  const origin = options.origin ?? { x: 0.5, y: 0.5 };
  const radius = options.radius ?? 100;
  const colors = options.colors ?? ['#ffd700', '#fff', '#ffec8b'];
  
  const centerX = window.innerWidth * origin.x;
  const centerY = window.innerHeight * origin.y;
  
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const velocity = 2 + Math.random() * 3;
    
    particles.push({
      x: centerX + Math.cos(angle) * dist * 0.3,
      y: centerY + Math.sin(angle) * dist * 0.3,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      size: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)] ?? '#8b5cf6',
      rotation: 0,
      rotationSpeed: 0,
      opacity: 1,
      gravity: 0.02,
      friction: 0.96,
      shape: 'star',
    });
  }
  
  startAnimation();
}

/**
 * Trigger firework burst - subtle, zen-like
 */
export function firework(x: number, y: number, color?: string): void {
  const burstColor = color ?? COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#8b5cf6';
  // Small, subtle burst - Japanese aesthetic
  const count = 12;
  
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const velocity = 2 + Math.random() * 2;
    
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      size: 1 + Math.random() * 1.5,
      color: burstColor,
      rotation: 0,
      rotationSpeed: 0,
      opacity: 0.8,
      gravity: 0.05,
      friction: 0.98,
      shape: 'circle',
    });
  }
  
  startAnimation();
}

/**
 * Trigger multiple fireworks
 */
export function fireworks(count = 3): void {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const x = window.innerWidth * (0.2 + Math.random() * 0.6);
      const y = window.innerHeight * (0.2 + Math.random() * 0.4);
      firework(x, y);
    }, i * 300);
  }
}

/**
 * Rising bubbles effect
 */
export function bubbles(options: {
  count?: number;
  colors?: string[];
} = {}): void {
  const count = options.count ?? 20;
  const colors = options.colors ?? ['rgba(139, 92, 246, 0.3)', 'rgba(6, 182, 212, 0.3)', 'rgba(236, 72, 153, 0.3)'];
  
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: window.innerHeight + 20,
        vx: (Math.random() - 0.5) * 2,
        vy: -(2 + Math.random() * 3),
        size: 10 + Math.random() * 30,
        color: colors[Math.floor(Math.random() * colors.length)] ?? '#8b5cf6',
        rotation: 0,
        rotationSpeed: 0,
        opacity: 0.6,
        gravity: -0.02, // Float up
        friction: 0.995,
        shape: 'circle',
      });
    }, i * 100);
  }
  
  startAnimation();
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================

function startAnimation(): void {
  if (isAnimating) return;
  
  if (canvas) {
    canvas.style.opacity = '1';
  }
  
  isAnimating = true;
  animate();
}

function animate(): void {
  if (!ctx || !canvas) return;
  
  // Clear canvas
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  
  // Update and draw particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (!p) continue;
    
    // Update physics
    p.vy += p.gravity;
    p.vx *= p.friction;
    p.vy *= p.friction;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotationSpeed;
    p.opacity -= 0.008;
    
    // Remove dead particles
    if (p.opacity <= 0 || p.y > window.innerHeight + 50) {
      particles.splice(i, 1);
      continue;
    }
    
    // Draw particle
    drawParticle(p);
  }
  
  // Continue or stop animation
  if (particles.length > 0) {
    animationId = requestAnimationFrame(animate);
  } else {
    stopAnimation();
  }
}

function drawParticle(p: Particle): void {
  if (!ctx) return;
  
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((p.rotation * Math.PI) / 180);
  ctx.globalAlpha = p.opacity;
  
  ctx.fillStyle = p.color;
  
  switch (p.shape) {
    case 'square':
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      break;
      
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    case 'star':
      drawStar(ctx, 0, 0, 5, p.size, p.size / 2);
      break;
  }
  
  ctx.restore();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
): void {
  let rotation = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  
  for (let i = 0; i < spikes; i++) {
    const x1 = cx + Math.cos(rotation) * outerRadius;
    const y1 = cy + Math.sin(rotation) * outerRadius;
    ctx.lineTo(x1, y1);
    rotation += step;
    
    const x2 = cx + Math.cos(rotation) * innerRadius;
    const y2 = cy + Math.sin(rotation) * innerRadius;
    ctx.lineTo(x2, y2);
    rotation += step;
  }
  
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fill();
}

function stopAnimation(): void {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  isAnimating = false;
  
  if (canvas) {
    canvas.style.opacity = '0';
  }
}

// ============================================================================
// MILESTONE CELEBRATIONS
// ============================================================================

export function celebrateFirstConnection(): void {
  // Use fireworks instead of confetti (professional welcome, not gamified)
  fireworks(2);
}

export function celebrateMilestone(milestone: string): void {
  sparkles({ count: 40 });
  
  // Show milestone toast
  showMilestoneToast(milestone);
}

export function celebrateDiscovery(): void {
  sparkles({ count: 25, radius: 60 });
}

function showMilestoneToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'milestone-toast';
  toast.innerHTML = `
    <span class="milestone-icon">🎉</span>
    <span class="milestone-text">${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  
  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  stopAnimation();
  
  if (canvas) {
    canvas.remove();
    canvas = null;
  }
  
  ctx = null;
  particles = [];
  
  window.removeEventListener('resize', resizeCanvas);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const celebrationsUI = {
  init: initCelebrationsUI,
  confetti,
  sparkles,
  firework,
  fireworks,
  bubbles,
  celebrateFirstConnection,
  celebrateMilestone,
  celebrateDiscovery,
  dispose,
};

