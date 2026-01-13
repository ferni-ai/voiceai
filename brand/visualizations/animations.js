/**
 * FERNI VISUALIZATION ANIMATIONS
 * ==============================
 * Apple/Pixar-level animation orchestration for data storytelling.
 * Makes data come alive through perfectly timed reveals.
 *
 * Philosophy:
 * - Every animation serves the narrative
 * - Progressive disclosure builds understanding
 * - Micro-interactions create delight
 * - Performance is invisible (GPU-accelerated)
 *
 * Usage:
 *   import { initScrollReveal, animateChart, playMicroInteraction } from './animations.js';
 *   initScrollReveal();
 */

// ============================================
// ANIMATION STATE
// ============================================

let observer = null;
let animatedElements = new WeakSet();

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // IntersectionObserver settings
  rootMargin: '-50px 0px',  // Trigger 50px before fully visible
  threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],

  // Animation timing
  staggerDelay: 80,         // Delay between staggered children (ms)
  drawDuration: 1200,       // Duration for line drawing (ms)
  revealDuration: 600,      // Duration for fade reveals (ms)

  // Selectors for auto-animation
  selectors: {
    reveal: '.viz-reveal, .viz-reveal-scale',
    stagger: '.viz-stagger',
    drawPath: '.viz-draw-path',
    goldRepair: '.viz-gold-repair',
    barChart: '.viz-bar',
    pieSlice: '.viz-pie-slice',
    node: '.viz-node',
    card: '.viz-card',
  }
};

// ============================================
// INTERSECTION OBSERVER (SCROLL REVEAL)
// ============================================

/**
 * Initialize scroll-driven reveal animations
 * Elements become visible when they enter the viewport
 */
export function initScrollReveal(container = document) {
  // Skip if IntersectionObserver not supported
  if (!('IntersectionObserver' in window)) {
    revealAllImmediately(container);
    return;
  }

  // Create observer
  observer = new IntersectionObserver(handleIntersection, {
    rootMargin: CONFIG.rootMargin,
    threshold: CONFIG.threshold,
  });

  // Observe all revealable elements
  const elements = container.querySelectorAll([
    CONFIG.selectors.reveal,
    CONFIG.selectors.stagger,
    CONFIG.selectors.drawPath,
    CONFIG.selectors.goldRepair,
  ].join(', '));

  elements.forEach(el => {
    if (!animatedElements.has(el)) {
      observer.observe(el);
    }
  });

  return observer;
}

/**
 * Handle intersection changes
 */
function handleIntersection(entries) {
  entries.forEach(entry => {
    if (entry.isIntersecting && entry.intersectionRatio >= 0.1) {
      revealElement(entry.target);
      observer.unobserve(entry.target);
      animatedElements.add(entry.target);
    }
  });
}

/**
 * Reveal a single element
 */
function revealElement(element) {
  // Add visible class to trigger CSS transitions
  element.classList.add('is-visible');

  // For SVG paths, calculate and set the path length
  if (element.matches(CONFIG.selectors.drawPath) || element.matches(CONFIG.selectors.goldRepair)) {
    animateSVGPath(element);
  }

  // For staggered containers, add delays to children
  if (element.matches(CONFIG.selectors.stagger)) {
    animateStaggeredChildren(element);
  }
}

/**
 * Fallback: reveal all immediately (no animations)
 */
function revealAllImmediately(container) {
  const elements = container.querySelectorAll([
    CONFIG.selectors.reveal,
    CONFIG.selectors.stagger,
    CONFIG.selectors.drawPath,
    CONFIG.selectors.goldRepair,
  ].join(', '));

  elements.forEach(el => {
    el.classList.add('is-visible');
    el.style.transition = 'none';
  });
}

// ============================================
// SVG PATH ANIMATIONS
// ============================================

/**
 * Animate an SVG path (line drawing effect)
 */
function animateSVGPath(path) {
  // Get the actual path length
  const length = path.getTotalLength ? path.getTotalLength() : 1000;

  // Set CSS custom property for the animation
  path.style.setProperty('--path-length', length);
  path.style.strokeDasharray = length;
  path.style.strokeDashoffset = length;

  // Trigger animation via class
  requestAnimationFrame(() => {
    path.classList.add('is-visible');
  });
}

/**
 * Animate multiple paths in sequence
 */
export function animatePathSequence(paths, options = {}) {
  const {
    stagger = 200,
    onComplete = () => {},
  } = options;

  paths.forEach((path, index) => {
    setTimeout(() => {
      animateSVGPath(path);
      if (index === paths.length - 1) {
        setTimeout(onComplete, CONFIG.drawDuration);
      }
    }, index * stagger);
  });
}

// ============================================
// STAGGERED ANIMATIONS
// ============================================

/**
 * Animate children with staggered delays
 */
function animateStaggeredChildren(container) {
  const children = container.children;

  Array.from(children).forEach((child, index) => {
    child.style.transitionDelay = `${index * CONFIG.staggerDelay}ms`;
  });
}

/**
 * Manually trigger staggered animation
 */
export function animateStaggered(elements, options = {}) {
  const {
    delay = CONFIG.staggerDelay,
    animation = 'vizFadeUp',
    duration = CONFIG.revealDuration,
  } = options;

  elements.forEach((el, index) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';

    setTimeout(() => {
      el.style.transition = `opacity ${duration}ms ease-out, transform ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, index * delay);
  });
}

// ============================================
// CHART-SPECIFIC ANIMATIONS
// ============================================

/**
 * Animate bar chart bars
 * @param {HTMLElement|SVGElement} container - Chart container
 * @param {Object} options - Animation options
 */
export function animateBarChart(container, options = {}) {
  const {
    direction = 'up',     // 'up', 'down', 'left', 'right'
    stagger = 50,
    duration = 600,
    easing = 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  } = options;

  const bars = container.querySelectorAll(CONFIG.selectors.barChart);

  bars.forEach((bar, index) => {
    const transform = direction === 'up' || direction === 'down' ? 'scaleY' : 'scaleX';
    const origin = {
      up: 'bottom',
      down: 'top',
      left: 'right',
      right: 'left'
    }[direction];

    bar.style.transform = `${transform}(0)`;
    bar.style.transformOrigin = origin;

    setTimeout(() => {
      bar.style.transition = `transform ${duration}ms ${easing}`;
      bar.style.transform = `${transform}(1)`;
    }, index * stagger);
  });
}

/**
 * Animate pie chart slices
 * @param {SVGElement} container - Pie chart SVG
 * @param {Object} options - Animation options
 */
export function animatePieChart(container, options = {}) {
  const {
    stagger = 100,
    duration = 800,
  } = options;

  const slices = container.querySelectorAll(CONFIG.selectors.pieSlice);

  slices.forEach((slice, index) => {
    // Get the slice's arc length
    const circumference = parseFloat(slice.dataset.circumference) || 628;
    const percentage = parseFloat(slice.dataset.percentage) || 0;
    const targetOffset = circumference * (1 - percentage / 100);

    slice.style.strokeDasharray = circumference;
    slice.style.strokeDashoffset = circumference;

    setTimeout(() => {
      slice.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      slice.style.strokeDashoffset = targetOffset;
    }, index * stagger);
  });
}

/**
 * Animate constellation nodes
 * @param {SVGElement} container - Constellation SVG
 * @param {Object} options - Animation options
 */
export function animateConstellation(container, options = {}) {
  const {
    nodeStagger = 100,
    lineDelay = 500,
    lineDuration = 800,
  } = options;

  const nodes = container.querySelectorAll(CONFIG.selectors.node);
  const lines = container.querySelectorAll('line, path.connection');

  // First, animate nodes popping in
  nodes.forEach((node, index) => {
    node.style.opacity = '0';
    node.style.transform = 'scale(0)';

    setTimeout(() => {
      node.style.transition = 'opacity 300ms ease-out, transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)';
      node.style.opacity = '1';
      node.style.transform = 'scale(1)';
    }, index * nodeStagger);
  });

  // Then, draw connecting lines
  const totalNodeDelay = nodes.length * nodeStagger;
  lines.forEach((line, index) => {
    const length = line.getTotalLength ? line.getTotalLength() : 100;
    line.style.strokeDasharray = length;
    line.style.strokeDashoffset = length;

    setTimeout(() => {
      line.style.transition = `stroke-dashoffset ${lineDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      line.style.strokeDashoffset = '0';
    }, totalNodeDelay + lineDelay + (index * 50));
  });
}

/**
 * Animate number counting up
 * @param {HTMLElement} element - Element containing the number
 * @param {Object} options - Animation options
 */
export function animateNumber(element, options = {}) {
  const {
    from = 0,
    to = parseFloat(element.textContent) || 0,
    duration = 1000,
    decimals = 0,
    prefix = '',
    suffix = '',
    easing = easeOutQuart,
  } = options;

  const startTime = performance.now();
  const range = to - from;

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);

    const currentValue = from + (range * easedProgress);
    element.textContent = prefix + currentValue.toFixed(decimals) + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// Easing function
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

// ============================================
// MICRO-INTERACTIONS
// ============================================

/**
 * Play a micro-interaction animation
 * @param {HTMLElement} element - Element to animate
 * @param {string} type - Animation type
 */
export function playMicroInteraction(element, type) {
  // Remove any existing animation classes first
  element.classList.remove('viz-play-highlight', 'viz-play-press', 'viz-play-ripple');

  // Force reflow to reset animation
  void element.offsetWidth;

  // Add the new animation class
  switch (type) {
    case 'highlight':
      element.classList.add('viz-play-highlight');
      break;
    case 'press':
      element.classList.add('viz-play-press');
      break;
    case 'ripple':
      createRipple(element);
      break;
    case 'pulse':
      element.classList.add('viz-animate-pulse');
      setTimeout(() => element.classList.remove('viz-animate-pulse'), 2000);
      break;
    case 'shake':
      animateShake(element);
      break;
    case 'bounce':
      animateBounce(element);
      break;
  }
}

/**
 * Create a ripple effect at click position
 */
function createRipple(element, event) {
  const ripple = document.createElement('span');
  ripple.className = 'viz-ripple';

  // Position ripple at click location or center
  const rect = element.getBoundingClientRect();
  const x = event ? event.clientX - rect.left : rect.width / 2;
  const y = event ? event.clientY - rect.top : rect.height / 2;

  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  element.style.position = 'relative';
  element.style.overflow = 'hidden';
  element.appendChild(ripple);

  // Clean up after animation
  setTimeout(() => ripple.remove(), 600);
}

/**
 * Shake animation for errors/attention
 */
function animateShake(element) {
  const keyframes = [
    { transform: 'translateX(0)' },
    { transform: 'translateX(-8px)' },
    { transform: 'translateX(8px)' },
    { transform: 'translateX(-6px)' },
    { transform: 'translateX(6px)' },
    { transform: 'translateX(-3px)' },
    { transform: 'translateX(3px)' },
    { transform: 'translateX(0)' },
  ];

  element.animate(keyframes, {
    duration: 500,
    easing: 'ease-out',
  });
}

/**
 * Bounce animation for success/celebration
 */
function animateBounce(element) {
  const keyframes = [
    { transform: 'scale(1)' },
    { transform: 'scale(1.15)' },
    { transform: 'scale(0.95)' },
    { transform: 'scale(1.05)' },
    { transform: 'scale(1)' },
  ];

  element.animate(keyframes, {
    duration: 400,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  });
}

// ============================================
// SPRING PHYSICS
// ============================================

/**
 * Create a spring-animated value
 * @param {Object} options - Spring configuration
 * @returns {Object} Spring controller
 */
export function createSpring(options = {}) {
  const {
    stiffness = 170,
    damping = 26,
    mass = 1,
    initialValue = 0,
    onUpdate = () => {},
  } = options;

  let value = initialValue;
  let velocity = 0;
  let targetValue = initialValue;
  let animationId = null;

  function tick() {
    const springForce = (targetValue - value) * stiffness;
    const dampingForce = -velocity * damping;
    const acceleration = (springForce + dampingForce) / mass;

    velocity += acceleration * (1 / 60); // Assuming 60fps
    value += velocity * (1 / 60);

    onUpdate(value);

    // Check if animation should continue
    const isMoving = Math.abs(velocity) > 0.01;
    const isNotSettled = Math.abs(targetValue - value) > 0.01;

    if (isMoving || isNotSettled) {
      animationId = requestAnimationFrame(tick);
    } else {
      value = targetValue;
      velocity = 0;
      onUpdate(value);
    }
  }

  return {
    set(newTarget) {
      targetValue = newTarget;
      if (animationId === null) {
        animationId = requestAnimationFrame(tick);
      }
    },
    get() {
      return value;
    },
    stop() {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    },
  };
}

// ============================================
// ORCHESTRATION
// ============================================

/**
 * Orchestrate a sequence of animations
 * @param {Array} steps - Array of animation steps
 */
export async function animateSequence(steps) {
  for (const step of steps) {
    if (typeof step === 'function') {
      await step();
    } else if (typeof step === 'number') {
      await delay(step);
    } else if (step.element && step.animation) {
      await animateElement(step.element, step.animation, step.options);
    }
  }
}

/**
 * Delay helper for sequences
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Animate a single element with a named animation
 */
function animateElement(element, animation, options = {}) {
  return new Promise(resolve => {
    const duration = options.duration || CONFIG.revealDuration;

    switch (animation) {
      case 'fadeIn':
        element.style.opacity = '0';
        setTimeout(() => {
          element.style.transition = `opacity ${duration}ms ease-out`;
          element.style.opacity = '1';
          setTimeout(resolve, duration);
        }, 10);
        break;

      case 'slideUp':
        element.style.opacity = '0';
        element.style.transform = 'translateY(30px)';
        setTimeout(() => {
          element.style.transition = `opacity ${duration}ms ease-out, transform ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
          element.style.opacity = '1';
          element.style.transform = 'translateY(0)';
          setTimeout(resolve, duration);
        }, 10);
        break;

      case 'scaleIn':
        element.style.opacity = '0';
        element.style.transform = 'scale(0.8)';
        setTimeout(() => {
          element.style.transition = `opacity ${duration}ms ease-out, transform ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
          element.style.opacity = '1';
          element.style.transform = 'scale(1)';
          setTimeout(resolve, duration);
        }, 10);
        break;

      default:
        resolve();
    }
  });
}

// ============================================
// CLEANUP
// ============================================

/**
 * Cleanup and disconnect observer
 */
export function cleanup() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  animatedElements = new WeakSet();
}

// ============================================
// EXPORT DEFAULT
// ============================================

export default {
  initScrollReveal,
  animatePathSequence,
  animateStaggered,
  animateBarChart,
  animatePieChart,
  animateConstellation,
  animateNumber,
  playMicroInteraction,
  createSpring,
  animateSequence,
  cleanup,
};
