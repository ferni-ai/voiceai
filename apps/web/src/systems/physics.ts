/**
 * Weight & Mass Physics System
 *
 * "Every object in the Pixar universe has a soul, and that soul has weight."
 * - John Lasseter (paraphrased)
 *
 * This system gives every UI element a physical presence. A button isn't just
 * a rectangle - it's a thing with mass that responds to force. When pressed,
 * it compresses. When released, it springs back with a specific elasticity
 * based on its material.
 *
 * The magic: Users can't articulate why the UI feels better, but their
 * subconscious recognizes the physics of real objects.
 */

import { DURATION, EASING } from '../config/animation-constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mass determines how an element responds to force.
 * Lighter elements move faster but feel less substantial.
 * Heavier elements move slower but feel more grounded.
 */
export type Mass = 'feather' | 'paper' | 'card' | 'glass' | 'stone';

/**
 * Material determines bounce, friction, and visual feedback.
 */
export type Material = 'air' | 'silk' | 'rubber' | 'wood' | 'metal';

/**
 * Physics properties for an element
 */
export interface PhysicsProperties {
  mass: Mass;
  material: Material;
  /** 0-1: How much energy is preserved on bounce */
  elasticity: number;
  /** 0-1: Resistance to motion */
  friction: number;
  /** Scale factor for all physics calculations */
  scale: number;
}

/**
 * Spring configuration derived from physics properties
 */
export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

/**
 * Animation result from physics calculation
 */
export interface PhysicsAnimation {
  duration: number;
  easing: string;
  /** CSS transform for press state */
  pressTransform: string;
  /** CSS transform for hover state */
  hoverTransform: string;
  /** CSS transition timing function */
  timing: string;
  /** Spring config for JS animations */
  spring: SpringConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants - The Soul of Physics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mass values determine inertia and response time.
 * Higher mass = slower response, more gravitas.
 */
const MASS_VALUES: Record<Mass, number> = {
  feather: 0.2,  // Tooltips, badges, micro-feedback
  paper: 0.4,    // Cards, sheets, lightweight UI
  card: 0.6,     // Buttons, inputs, interactive elements
  glass: 0.8,    // Panels, modals, substantial UI
  stone: 1.0,    // Heavy elements, anchored UI
};

/**
 * Material properties affect bounce and friction.
 */
const MATERIAL_PROPERTIES: Record<Material, { elasticity: number; friction: number }> = {
  air: { elasticity: 0.9, friction: 0.05 },    // Floaty, minimal resistance
  silk: { elasticity: 0.7, friction: 0.15 },   // Smooth, slight resistance
  rubber: { elasticity: 0.85, friction: 0.2 }, // Bouncy, responsive
  wood: { elasticity: 0.3, friction: 0.4 },    // Solid, grounded
  metal: { elasticity: 0.5, friction: 0.3 },   // Precise, mechanical
};

/**
 * Press depth based on mass - heavier objects compress less
 */
const PRESS_DEPTH: Record<Mass, number> = {
  feather: 0.92,  // Deep compression
  paper: 0.94,
  card: 0.96,
  glass: 0.97,
  stone: 0.98,    // Barely compresses
};

/**
 * Hover lift based on material - bouncy materials lift more
 */
const HOVER_LIFT: Record<Material, number> = {
  air: 6,      // Floats high
  silk: 4,
  rubber: 5,
  wood: 2,
  metal: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Physics Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get physics properties for an element
 */
export function getPhysicsProperties(
  mass: Mass = 'card',
  material: Material = 'rubber'
): PhysicsProperties {
  const materialProps = MATERIAL_PROPERTIES[material];
  return {
    mass,
    material,
    elasticity: materialProps.elasticity,
    friction: materialProps.friction,
    scale: 1,
  };
}

/**
 * Calculate spring configuration from physics properties.
 * This creates the natural motion that Pixar uses.
 */
export function calculateSpring(props: PhysicsProperties): SpringConfig {
  const massValue = MASS_VALUES[props.mass];

  // Stiffness: Higher elasticity = stiffer spring
  // But higher mass = less stiff (takes more force to move)
  const stiffness = (props.elasticity * 200) / massValue;

  // Damping: Higher friction = more damping
  // Critically damped = 2 * sqrt(stiffness * mass)
  const criticalDamping = 2 * Math.sqrt(stiffness * massValue);
  const damping = criticalDamping * (0.5 + props.friction * 0.5);

  return {
    stiffness,
    damping,
    mass: massValue,
  };
}

/**
 * Convert spring config to CSS cubic-bezier approximation.
 * This is an approximation - for true spring physics, use JS animation.
 */
export function springToCubicBezier(spring: SpringConfig): string {
  // Approximation based on spring characteristics
  // Higher stiffness = faster start
  // Higher damping = less overshoot
  const stiffnessNorm = Math.min(spring.stiffness / 300, 1);
  const dampingNorm = Math.min(spring.damping / 30, 1);

  // Control points for cubic-bezier
  const x1 = 0.2 - stiffnessNorm * 0.1;
  const y1 = 0.8 + stiffnessNorm * 0.2;
  const x2 = 0.2 + dampingNorm * 0.2;
  const y2 = 1;

  return `cubic-bezier(${x1.toFixed(3)}, ${y1.toFixed(3)}, ${x2.toFixed(3)}, ${y2.toFixed(3)})`;
}

/**
 * Calculate complete animation properties for an element.
 * This is the main API for the physics system.
 */
export function calculatePhysicsAnimation(
  mass: Mass = 'card',
  material: Material = 'rubber'
): PhysicsAnimation {
  const props = getPhysicsProperties(mass, material);
  const spring = calculateSpring(props);

  // Duration based on mass and damping
  // Heavier = slower, more damped = shorter
  const baseDuration = DURATION.NORMAL;
  const massMultiplier = 0.7 + MASS_VALUES[mass] * 0.6;
  const dampingMultiplier = 1 - (props.friction * 0.3);
  const duration = Math.round(baseDuration * massMultiplier * dampingMultiplier);

  // Press transform: scale down and slightly translate
  const pressScale = PRESS_DEPTH[mass];
  const pressY = (1 - pressScale) * 10; // Slight downward push
  const pressTransform = `scale(${pressScale}) translateY(${pressY}px)`;

  // Hover transform: lift based on material
  const hoverLift = HOVER_LIFT[material];
  const hoverScale = 1 + (props.elasticity * 0.02);
  const hoverTransform = `scale(${hoverScale}) translateY(-${hoverLift}px)`;

  // CSS timing function
  const timing = springToCubicBezier(spring);

  return {
    duration,
    easing: EASING.SPRING,
    pressTransform,
    hoverTransform,
    timing,
    spring,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Custom Properties Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate CSS custom properties for physics-based animations.
 * Apply these to elements for consistent physics behavior.
 */
export function generatePhysicsCSS(
  mass: Mass = 'card',
  material: Material = 'rubber'
): string {
  const animation = calculatePhysicsAnimation(mass, material);

  return `
    --physics-duration: ${animation.duration}ms;
    --physics-timing: ${animation.timing};
    --physics-press-transform: ${animation.pressTransform};
    --physics-hover-transform: ${animation.hoverTransform};
    --physics-spring-stiffness: ${animation.spring.stiffness};
    --physics-spring-damping: ${animation.spring.damping};
    --physics-spring-mass: ${animation.spring.mass};
  `.trim();
}

/**
 * Apply physics properties to an element via inline styles.
 */
export function applyPhysics(
  element: HTMLElement,
  mass: Mass = 'card',
  material: Material = 'rubber'
): void {
  const animation = calculatePhysicsAnimation(mass, material);

  element.style.setProperty('--physics-duration', `${animation.duration}ms`);
  element.style.setProperty('--physics-timing', animation.timing);
  element.style.setProperty('--physics-press-transform', animation.pressTransform);
  element.style.setProperty('--physics-hover-transform', animation.hoverTransform);

  // Store spring config as data attributes for JS animations
  element.dataset.springStiffness = String(animation.spring.stiffness);
  element.dataset.springDamping = String(animation.spring.damping);
  element.dataset.springMass = String(animation.spring.mass);
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets for Common Elements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Physics presets for common UI elements.
 * These represent the "soul" of each element type.
 */
export const PHYSICS_PRESETS = {
  // Interactive elements - responsive, bouncy
  button: { mass: 'card' as Mass, material: 'rubber' as Material },
  iconButton: { mass: 'paper' as Mass, material: 'rubber' as Material },
  fab: { mass: 'glass' as Mass, material: 'rubber' as Material },

  // Containers - solid, grounded
  card: { mass: 'card' as Mass, material: 'wood' as Material },
  panel: { mass: 'glass' as Mass, material: 'wood' as Material },
  modal: { mass: 'stone' as Mass, material: 'metal' as Material },

  // Lightweight elements - floaty, responsive
  tooltip: { mass: 'feather' as Mass, material: 'air' as Material },
  badge: { mass: 'feather' as Mass, material: 'silk' as Material },
  chip: { mass: 'paper' as Mass, material: 'silk' as Material },

  // Form elements - precise, reliable
  input: { mass: 'card' as Mass, material: 'metal' as Material },
  toggle: { mass: 'paper' as Mass, material: 'rubber' as Material },
  slider: { mass: 'paper' as Mass, material: 'silk' as Material },

  // Navigation - substantial but responsive
  navItem: { mass: 'paper' as Mass, material: 'rubber' as Material },
  tab: { mass: 'paper' as Mass, material: 'silk' as Material },
  menuItem: { mass: 'paper' as Mass, material: 'rubber' as Material },

  // Avatar - special physics for Ferni
  avatar: { mass: 'glass' as Mass, material: 'silk' as Material },
  avatarBreathing: { mass: 'feather' as Mass, material: 'air' as Material },
} as const;

/**
 * Get physics animation for a preset element type.
 */
export function getPresetPhysics(
  preset: keyof typeof PHYSICS_PRESETS
): PhysicsAnimation {
  const { mass, material } = PHYSICS_PRESETS[preset];
  return calculatePhysicsAnimation(mass, material);
}

// ─────────────────────────────────────────────────────────────────────────────
// Spring Animation Helper (for JS animations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Animate a value using spring physics.
 * Returns a cleanup function to cancel the animation.
 */
export function animateSpring(
  from: number,
  to: number,
  spring: SpringConfig,
  onUpdate: (value: number) => void,
  onComplete?: () => void
): () => void {
  let velocity = 0;
  let position = from;
  let animationFrame: number | null = null;
  let lastTime = performance.now();

  const animate = (currentTime: number) => {
    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.064); // Cap at ~15fps
    lastTime = currentTime;

    // Spring physics
    const displacement = position - to;
    const springForce = -spring.stiffness * displacement;
    const dampingForce = -spring.damping * velocity;
    const acceleration = (springForce + dampingForce) / spring.mass;

    velocity += acceleration * deltaTime;
    position += velocity * deltaTime;

    onUpdate(position);

    // Check if spring has settled
    const isSettled =
      Math.abs(displacement) < 0.001 &&
      Math.abs(velocity) < 0.001;

    if (isSettled) {
      onUpdate(to);
      onComplete?.();
    } else {
      animationFrame = requestAnimationFrame(animate);
    }
  };

  animationFrame = requestAnimationFrame(animate);

  return () => {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
    }
  };
}

// Types are already exported at definition above
