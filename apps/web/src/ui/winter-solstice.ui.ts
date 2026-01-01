// TODO: Fix type errors - animation keyframe array indexing
/**
 * Winter Solstice Moment - "The Shortest Day, The Longest Warmth"
 *
 * A Pixar-quality cinematic experience that celebrates the year's journey
 * through dynamic SVG animation and storytelling.
 *
 * STORY ARC (inspired by Pixar's emotional beats):
 * ================================================
 * 1. DAWN - The darkest moment before light (acknowledgment)
 * 2. REFLECTION - Stars that represent memories/growth
 * 3. GATHERING - The team comes together (warmth)
 * 4. RETURN - The sun rises (hope)
 * 5. PROMISE - A commitment for the year ahead
 *
 * DESIGN PRINCIPLES:
 * - NO emojis - Pure SVG animation
 * - Warm, earthy color palette from design system
 * - Physics-based motion (GSAP)
 * - Accessibility: respects prefers-reduced-motion
 * - Personalized content based on user's journey
 *
 * @see CORE-PRINCIPLES.md - Relationship over transaction
 * @see BETTER-THAN-HUMAN.md - Superhuman emotional presence
 */

import { DURATION, prefersReducedMotion } from '../config/animation-constants.js';
import { gsap } from '../utils/gsap-setup.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { ferniExpressions } from './ferni-expressions.ui.js';
import { haptics } from '../utils/haptics.js';
import { t } from '../i18n/index.js';

const log = createLogger('WinterSolstice');

const toSeconds = (ms: number) => ms / 1000;

// ============================================================================
// TYPES
// ============================================================================

export interface SolsticeContext {
  /** User's name for personalization */
  userName?: string;
  /** Number of conversations this year */
  conversationsThisYear?: number;
  /** Days since first conversation */
  daysSinceFirstChat?: number;
  /** Relationship stage: stranger | acquaintance | friend | trusted_advisor */
  relationshipStage?: string;
  /** Top topics discussed (for star constellation) */
  topTopics?: string[];
  /** Has the user unlocked any team members? */
  unlockedTeamMembers?: string[];
}

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  label?: string;
  delay: number;
}

interface MountainLayer {
  path: string;
  color: string;
  translateY: number;
}

// ============================================================================
// DYNAMIC SVG COMPONENTS
// ============================================================================

/**
 * Generate mountain silhouette path
 * Uses Perlin-like noise for organic shapes
 */
function generateMountainPath(
  width: number,
  height: number,
  peaks: number,
  roughness: number,
  baseY: number
): string {
  const points: string[] = [`M0,${height}`];
  const peakWidth = width / peaks;

  for (let i = 0; i <= peaks; i++) {
    const x = i * peakWidth;
    const peakHeight = baseY + (Math.random() - 0.5) * roughness;
    const variation = (Math.random() - 0.5) * 30;

    if (i === 0) {
      points.push(`L${x},${peakHeight}`);
    } else {
      // Smooth curves between peaks
      const cpX = x - peakWidth / 2;
      const cpY = peakHeight + variation;
      points.push(`Q${cpX},${cpY} ${x},${peakHeight + Math.random() * 20}`);
    }
  }

  points.push(`L${width},${height} Z`);
  return points.join(' ');
}

/**
 * Create the full scene SVG with all layers
 */
function createSceneSVG(): string {
  const width = 1920;
  const height = 1080;

  // Mountain layers - back to front
  const mountains: MountainLayer[] = [
    { path: generateMountainPath(width, height, 6, 150, 450), color: 'var(--solstice-mountain-far)', translateY: 0 },
    { path: generateMountainPath(width, height, 8, 120, 500), color: 'var(--solstice-mountain-mid)', translateY: 20 },
    { path: generateMountainPath(width, height, 10, 100, 580), color: 'var(--solstice-mountain-near)', translateY: 40 },
  ];

  return `
    <svg class="solstice-scene" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice">
      <defs>
        <!-- Aurora gradient -->
        <linearGradient id="auroraGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--color-ferni)" stop-opacity="0">
            <animate attributeName="stop-opacity" values="0;0.3;0" dur="8s" repeatCount="indefinite"/>
          </stop>
          <stop offset="50%" stop-color="var(--persona-peter)" stop-opacity="0">
            <animate attributeName="stop-opacity" values="0;0.4;0" dur="8s" begin="1s" repeatCount="indefinite"/>
          </stop>
          <stop offset="100%" stop-color="var(--persona-alex)" stop-opacity="0">
            <animate attributeName="stop-opacity" values="0;0.3;0" dur="8s" begin="2s" repeatCount="indefinite"/>
          </stop>
        </linearGradient>

        <!-- Sky gradient - dawn to day -->
        <linearGradient id="skyGradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="var(--solstice-horizon)" class="sky-horizon"/>
          <stop offset="40%" stop-color="var(--solstice-sky-mid)" class="sky-mid"/>
          <stop offset="100%" stop-color="var(--solstice-sky-top)" class="sky-top"/>
        </linearGradient>

        <!-- Sun glow -->
        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="var(--solstice-sun-core)" stop-opacity="1"/>
          <stop offset="30%" stop-color="var(--solstice-sun-mid)" stop-opacity="0.8"/>
          <stop offset="70%" stop-color="var(--solstice-sun-outer)" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="var(--solstice-sun-outer)" stop-opacity="0"/>
        </radialGradient>

        <!-- Star glow filter -->
        <filter id="starGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <!-- Mountain fog -->
        <linearGradient id="fogGradient" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="var(--solstice-fog)" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="var(--solstice-fog)" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- Sky -->
      <rect class="sky-layer" width="100%" height="100%" fill="url(#skyGradient)"/>

      <!-- Aurora borealis -->
      <g class="aurora-layer" opacity="0">
        <ellipse cx="960" cy="200" rx="800" ry="150" fill="url(#auroraGradient)"/>
        <ellipse cx="700" cy="250" rx="500" ry="100" fill="url(#auroraGradient)" opacity="0.5"/>
      </g>

      <!-- Stars container -->
      <g class="stars-layer"></g>

      <!-- Constellation container (memories) -->
      <g class="constellation-layer"></g>

      <!-- Sun -->
      <g class="sun-layer" transform="translate(960, 900)">
        <circle class="sun-glow" r="200" fill="url(#sunGlow)" opacity="0.8"/>
        <circle class="sun-core" r="60" fill="var(--solstice-sun-core)"/>
      </g>

      <!-- Mountains -->
      ${mountains.map((m, i) => `
        <g class="mountain-layer mountain-${i}" transform="translate(0, ${m.translateY})">
          <path d="${m.path}" fill="${m.color}"/>
        </g>
      `).join('')}

      <!-- Fog layer -->
      <rect class="fog-layer" y="600" width="100%" height="480" fill="url(#fogGradient)" opacity="0"/>

      <!-- Snow particles -->
      <g class="snow-layer"></g>
    </svg>
  `;
}

/**
 * Create a single star element
 */
function createStar(star: Star): SVGElement {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.classList.add('solstice-star');
  g.setAttribute('transform', `translate(${star.x}, ${star.y})`);
  g.style.opacity = '0';

  // Star shape (4-point with glow)
  const starPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const s = star.size;
  starPath.setAttribute('d', `
    M0,${-s} L${s * 0.3},${-s * 0.3} L${s},0 L${s * 0.3},${s * 0.3}
    L0,${s} L${-s * 0.3},${s * 0.3} L${-s},0 L${-s * 0.3},${-s * 0.3} Z
  `);
  starPath.setAttribute('fill', 'var(--solstice-star)');
  starPath.setAttribute('filter', 'url(#starGlow)');

  g.appendChild(starPath);

  // Label for memory stars
  if (star.label) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('y', String(s + 20));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'var(--solstice-star-label)');
    text.setAttribute('font-size', '14');
    text.setAttribute('font-family', 'var(--font-body)');
    text.setAttribute('opacity', '0.8');
    text.textContent = star.label;
    g.appendChild(text);
  }

  return g;
}

/**
 * Create constellation lines connecting memory stars
 */
function createConstellationLines(stars: Star[]): SVGElement {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.classList.add('constellation-lines');

  if (stars.length < 2) return g;

  // Connect stars in order
  for (let i = 0; i < stars.length - 1; i++) {
    const starCurrent = stars[i];
    const starNext = stars[i + 1];
    if (!starCurrent || !starNext) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(starCurrent.x));
    line.setAttribute('y1', String(starCurrent.y));
    line.setAttribute('x2', String(starNext.x));
    line.setAttribute('y2', String(starNext.y));
    line.setAttribute('stroke', 'var(--solstice-constellation)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '4 4');
    line.setAttribute('opacity', '0');
    g.appendChild(line);
  }

  return g;
}

/**
 * Create snow particles
 */
function createSnowParticles(count: number): SVGElement[] {
  const particles: SVGElement[] = [];

  for (let i = 0; i < count; i++) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.classList.add('snow-particle');
    circle.setAttribute('cx', String(Math.random() * 1920));
    circle.setAttribute('cy', String(Math.random() * -200));
    circle.setAttribute('r', String(1 + Math.random() * 2));
    circle.setAttribute('fill', 'var(--solstice-snow)');
    circle.setAttribute('opacity', String(0.3 + Math.random() * 0.5));
    particles.push(circle);
  }

  return particles;
}

// ============================================================================
// PERSONALIZED CONTENT
// ============================================================================

/**
 * Generate personalized reflection text based on user's journey
 */
function generateReflection(context: SolsticeContext): {
  title: string;
  subtitle: string;
  reflection: string;
  promise: string;
} {
  const name = context.userName || 'friend';
  const conversations = context.conversationsThisYear || 0;
  const days = context.daysSinceFirstChat || 0;
  const stage = context.relationshipStage || 'stranger';

  // Title varies by relationship depth
  const titles: Record<string, string> = {
    stranger: 'The Light Returns',
    acquaintance: 'Growing Together',
    friend: `Our Year, ${name}`,
    trusted_advisor: `A Year of Depth, ${name}`,
  };

  const subtitles: Record<string, string> = {
    stranger: 'The shortest day reminds us: light always returns.',
    acquaintance: `${days} days of growing together.`,
    friend: `${conversations} conversations. Countless moments.`,
    trusted_advisor: 'Thank you for trusting me with your journey.',
  };

  // Reflection based on conversation count
  let reflection: string;
  if (conversations === 0) {
    reflection = "This is the beginning of something. The solstice marks a turning point—the moment when darkness reaches its peak, and then, slowly, light begins its return. That's what new beginnings feel like.";
  } else if (conversations < 10) {
    reflection = `We're just getting to know each other—${conversations} conversations so far. Like the winter sun, our connection is still rising. There's so much ahead.`;
  } else if (conversations < 50) {
    reflection = `${conversations} conversations this year. Each one a small light. Some were heavy, some were light—all of them mattered. I remember them.`;
  } else {
    reflection = `${conversations} conversations, ${name}. I've watched you navigate uncertainty, celebrate wins, and show up even when it was hard. That's not nothing—that's everything.`;
  }

  // Promise based on relationship stage
  const promises: Record<string, string> = {
    stranger: "I'm here when you need me. 2am or noon—same warmth, same presence.",
    acquaintance: "I'll keep showing up. Remembering. Growing alongside you.",
    friend: "Another year of being in your corner. Of noticing. Of celebrating the small things.",
    trusted_advisor: "Another year of depth. Of holding hope when you can't. Of seeing you clearly.",
  };

  const defaultTitle = "You've made it to another winter solstice";
  const defaultSubtitle = "The longest night";
  const defaultPromise = "I'm here when you need me. 2am or noon—same warmth, same presence.";
  
  return {
    title: titles[stage] ?? defaultTitle,
    subtitle: subtitles[stage] ?? defaultSubtitle,
    reflection,
    promise: promises[stage] ?? defaultPromise,
  };
}

/**
 * Generate memory stars from topics
 */
function generateMemoryStars(topics: string[]): Star[] {
  if (!topics.length) return [];

  // Position stars in a pleasing arc
  const centerX = 960;
  const startY = 150;
  const arcWidth = 600;
  const arcHeight = 100;

  return topics.slice(0, 5).map((topic, i) => {
    const angle = (Math.PI / (topics.length + 1)) * (i + 1);
    return {
      x: centerX - arcWidth / 2 + Math.cos(angle) * arcWidth / 2 + arcWidth / 2,
      y: startY + Math.sin(angle) * arcHeight,
      size: 8 + Math.random() * 4,
      brightness: 0.8 + Math.random() * 0.2,
      label: topic,
      delay: i * 200,
    };
  });
}

/**
 * Generate ambient stars (no labels)
 */
function generateAmbientStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * 1920,
      y: Math.random() * 400 + 50,
      size: 1 + Math.random() * 3,
      brightness: 0.3 + Math.random() * 0.7,
      delay: Math.random() * 2000,
    });
  }
  return stars;
}

// ============================================================================
// MAIN UI CLASS
// ============================================================================

/**
 * Winter Solstice Moment - The full cinematic experience
 */
class WinterSolsticeMomentUI {
  private container: HTMLElement | null = null;
  private scene: HTMLElement | null = null;
  private masterTimeline: gsap.core.Timeline | null = null;
  private isPlaying = false;
  private context: SolsticeContext = {};

  /**
   * Play the solstice moment
   */
  async play(context: SolsticeContext = {}): Promise<void> {
    if (this.isPlaying) return;

    // Check reduced motion
    if (prefersReducedMotion()) {
      log.info('Skipping solstice animation (reduced motion)');
      this.showStaticVersion(context);
      return;
    }

    this.isPlaying = true;
    this.context = context;

    // Clean up any existing
    this.cleanup();

    // Create the scene
    this.createScene();

    // Inject styles
    this.injectStyles();

    // Get personalized content
    const content = generateReflection(context);

    // Play the full sequence
    await this.playSequence(content);
  }

  /**
   * Create the scene DOM
   */
  private createScene(): void {
    // Full-screen container
    this.container = document.createElement('div');
    this.container.className = 'solstice-container';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-label', 'Winter Solstice Moment');

    // Inner scene wrapper
    this.scene = document.createElement('div');
    this.scene.className = 'solstice-scene-wrapper';
    this.scene.innerHTML = createSceneSVG();

    // Text overlay
    const textOverlay = document.createElement('div');
    textOverlay.className = 'solstice-text-overlay';
    textOverlay.innerHTML = `
      <div class="solstice-content">
        <h1 class="solstice-title"></h1>
        <p class="solstice-subtitle"></p>
        <div class="solstice-reflection"></div>
        <div class="solstice-promise"></div>
        <button class="solstice-close" aria-label="${t('accessibility.close')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      </div>
    `;

    // Team gathering container
    const teamGathering = document.createElement('div');
    teamGathering.className = 'solstice-team-gathering';

    this.container.appendChild(this.scene);
    this.container.appendChild(textOverlay);
    this.container.appendChild(teamGathering);

    document.body.appendChild(this.container);

    // Bind close button
    const closeBtn = this.container.querySelector('.solstice-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Escape key to close
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Play the full animation sequence
   */
  private async playSequence(content: {
    title: string;
    subtitle: string;
    reflection: string;
    promise: string;
  }): Promise<void> {
    if (!this.container || !this.scene) return;

    const svg = this.scene.querySelector('.solstice-scene') as SVGElement;
    if (!svg) return;

    // Get elements
    const auroraLayer = svg.querySelector('.aurora-layer');
    const starsLayer = svg.querySelector('.stars-layer');
    const constellationLayer = svg.querySelector('.constellation-layer');
    const sunLayer = svg.querySelector('.sun-layer');
    const sunCore = svg.querySelector('.sun-core');
    const mountainLayers = svg.querySelectorAll('.mountain-layer');
    const fogLayer = svg.querySelector('.fog-layer');
    const snowLayer = svg.querySelector('.snow-layer');

    const titleEl = this.container.querySelector('.solstice-title');
    const subtitleEl = this.container.querySelector('.solstice-subtitle');
    const reflectionEl = this.container.querySelector('.solstice-reflection');
    const promiseEl = this.container.querySelector('.solstice-promise');
    const teamGathering = this.container.querySelector('.solstice-team-gathering');

    // Create stars
    const memoryStars = generateMemoryStars(this.context.topTopics || []);
    const ambientStars = generateAmbientStars(50);

    // Add stars to SVG
    ambientStars.forEach(star => {
      starsLayer?.appendChild(createStar(star));
    });

    memoryStars.forEach(star => {
      constellationLayer?.appendChild(createStar(star));
    });

    // Add constellation lines
    if (memoryStars.length > 1) {
      constellationLayer?.insertBefore(
        createConstellationLines(memoryStars),
        constellationLayer.firstChild
      );
    }

    // Add snow
    const snowParticles = createSnowParticles(30);
    snowParticles.forEach(p => snowLayer?.appendChild(p));

    // Play sound
    soundUI.play('celebrate');
    haptics.bigWin();

    // Create master timeline
    this.masterTimeline = gsap.timeline({
      onComplete: () => log.info('Solstice sequence complete'),
    });

    // ========================================
    // ACT 1: THE DARKEST HOUR (0-3s)
    // ========================================
    this.masterTimeline
      // Fade in container
      .fromTo(this.container,
        { opacity: 0 },
        { opacity: 1, duration: toSeconds(DURATION.DELIBERATE) }
      )
      // Stars twinkle on one by one
      .to(starsLayer?.querySelectorAll('.solstice-star') || [], {
        opacity: () => 0.3 + Math.random() * 0.7,
        scale: 1,
        duration: toSeconds(DURATION.SLOW),
        stagger: { amount: 1.5, from: 'random' },
        ease: 'power2.out',
      }, '<0.5')
      // Aurora fades in subtly
      .to(auroraLayer, {
        opacity: 0.6,
        duration: toSeconds(DURATION.DRAMATIC),
        ease: 'power1.inOut',
      }, '<1');

    // ========================================
    // ACT 2: MEMORY CONSTELLATION (3-6s)
    // ========================================
    if (memoryStars.length > 0) {
      this.masterTimeline
        // Memory stars glow brighter
        .to(constellationLayer?.querySelectorAll('.solstice-star') || [], {
          opacity: 1,
          scale: 1.2,
          duration: toSeconds(DURATION.SLOW),
          stagger: 0.3,
          ease: 'elastic.out(1, 0.5)',
        })
        // Constellation lines draw
        .to(constellationLayer?.querySelectorAll('line') || [], {
          opacity: 0.6,
          strokeDashoffset: 0,
          duration: toSeconds(DURATION.MODERATE),
          stagger: 0.2,
          ease: 'power2.inOut',
        }, '<0.5')
        // Reflection text fades in
        .to(reflectionEl, {
          opacity: 1,
          y: 0,
          duration: toSeconds(DURATION.SLOW),
          ease: 'power2.out',
        }, '<');

      // Set reflection text
      if (reflectionEl) {
        reflectionEl.textContent = content.reflection;
        gsap.set(reflectionEl, { opacity: 0, y: 20 });
      }
    }

    // ========================================
    // ACT 3: THE SUN RETURNS (6-10s)
    // ========================================
    this.masterTimeline
      // Sun rises from below mountains
      .to(sunLayer, {
        y: -350,
        duration: toSeconds(2000),
        ease: 'power1.out',
      })
      // Sun glow intensifies
      .to(sunCore, {
        scale: 1.3,
        duration: toSeconds(DURATION.DRAMATIC),
        ease: 'power2.out',
      }, '<')
      // Sky warms up (we'll animate CSS variables)
      .add(() => {
        this.container?.classList.add('solstice-dawn');
        // Trigger Ferni's warmth expression
        ferniExpressions.delight();
      }, '<0.5')
      // Fog rises
      .to(fogLayer, {
        opacity: 0.4,
        y: -50,
        duration: toSeconds(DURATION.DRAMATIC),
        ease: 'power1.inOut',
      }, '<')
      // Title fades in
      .to(titleEl, {
        opacity: 1,
        y: 0,
        duration: toSeconds(DURATION.SLOW),
        ease: 'power2.out',
      }, '<0.5');

    // Set title
    if (titleEl) {
      titleEl.textContent = content.title;
      gsap.set(titleEl, { opacity: 0, y: -20 });
    }
    if (subtitleEl) {
      subtitleEl.textContent = content.subtitle;
      gsap.set(subtitleEl, { opacity: 0 });
    }

    // ========================================
    // ACT 4: THE GATHERING (10-14s)
    // ========================================
    this.masterTimeline
      // Subtitle fades in
      .to(subtitleEl, {
        opacity: 0.8,
        duration: toSeconds(DURATION.SLOW),
        ease: 'power2.out',
      })
      // Mountains shift slightly (parallax depth)
      .to(mountainLayers, {
        y: (_i, target) => -10 - Array.from(mountainLayers).indexOf(target) * 5,
        duration: toSeconds(DURATION.DRAMATIC),
        ease: 'power1.out',
        stagger: 0.1,
      }, '<');

    // Add team gathering if unlocked members
    if (this.context.unlockedTeamMembers?.length) {
      this.masterTimeline.add(() => {
        this.animateTeamGathering(teamGathering as HTMLElement);
      });
    }

    // ========================================
    // ACT 5: THE PROMISE (14-18s)
    // ========================================
    this.masterTimeline
      // Reflection fades
      .to(reflectionEl, {
        opacity: 0.3,
        duration: toSeconds(DURATION.SLOW),
      })
      // Promise appears
      .to(promiseEl, {
        opacity: 1,
        y: 0,
        duration: toSeconds(DURATION.SLOW),
        ease: 'power2.out',
      });

    // Set promise
    if (promiseEl) {
      promiseEl.textContent = content.promise;
      gsap.set(promiseEl, { opacity: 0, y: 20 });
    }

    // ========================================
    // CONTINUOUS: SNOW FALLING
    // ========================================
    snowParticles.forEach((particle, _i) => {
      const duration = 8 + Math.random() * 4;
      const delay = Math.random() * 4;

      gsap.to(particle, {
        y: `+=1200`,
        x: `+=${(Math.random() - 0.5) * 100}`,
        duration,
        delay,
        repeat: -1,
        ease: 'none',
        modifiers: {
          y: (y) => parseFloat(y) % 1200,
        },
      });
    });

    // Star twinkling
    ambientStars.forEach((_star, i) => {
      const star = starsLayer?.children[i] as SVGElement;
      if (!star) return;

      gsap.to(star, {
        opacity: 0.2 + Math.random() * 0.6,
        scale: 0.8 + Math.random() * 0.4,
        duration: 1 + Math.random() * 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: Math.random() * 3,
      });
    });
  }

  /**
   * Animate team members gathering
   */
  private animateTeamGathering(container: HTMLElement): void {
    const members = this.context.unlockedTeamMembers || [];
    if (!members.length) return;

    // Create team orbs
    const orbs = members.slice(0, 6).map((id, i) => {
      const orb = document.createElement('div');
      orb.className = `solstice-team-orb team-${id}`;
      orb.innerHTML = `
        <div class="team-orb-inner">
          <span class="team-orb-initial">${this.getPersonaInitial(id)}</span>
        </div>
      `;
      orb.style.setProperty('--orb-color', `var(--persona-${id}, var(--color-ferni))`);
      orb.style.setProperty('--orb-delay', `${i * 150}ms`);
      return orb;
    });

    orbs.forEach(orb => container.appendChild(orb));

    // Animate orbs floating in
    gsap.fromTo(orbs,
      {
        opacity: 0,
        scale: 0,
        y: 50,
      },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: toSeconds(DURATION.SLOW),
        stagger: 0.15,
        ease: 'back.out(1.7)',
      }
    );

    // Gentle floating
    orbs.forEach((orb, i) => {
      gsap.to(orb, {
        y: -10 + Math.random() * 20,
        x: -5 + Math.random() * 10,
        duration: 2 + Math.random(),
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: i * 0.3,
      });
    });
  }

  /**
   * Get persona initial for orb
   */
  private getPersonaInitial(id: string): string {
    const initials: Record<string, string> = {
      ferni: 'FE',
      'peter-lynch': 'PJ',
      'alex-chen': 'AC',
      'maya-santos': 'MS',
      'jordan-taylor': 'JT',
      'nayan-patel': 'NP',
    };
    return initials[id] || id.charAt(0).toUpperCase();
  }

  /**
   * Show static version for reduced motion
   */
  private showStaticVersion(context: SolsticeContext): void {
    const content = generateReflection(context);

    this.container = document.createElement('div');
    this.container.className = 'solstice-container solstice-static';
    this.container.innerHTML = `
      <div class="solstice-static-content">
        <h1>${content.title}</h1>
        <p class="subtitle">${content.subtitle}</p>
        <p class="reflection">${content.reflection}</p>
        <p class="promise">${content.promise}</p>
        <button aria-label="${t('accessibility.close')}" class="solstice-close-static">Close</button>
      </div>
    `;

    document.body.appendChild(this.container);

    this.container.querySelector('.solstice-close-static')?.addEventListener('click', () => {
      this.close();
    });
  }

  /**
   * Close the moment
   */
  close(): void {
    if (!this.container) return;

    // Fade out
    gsap.to(this.container, {
      opacity: 0,
      duration: toSeconds(DURATION.SLOW),
      onComplete: () => this.cleanup(),
    });
  }

  /**
   * Cleanup
   */
  private cleanup(): void {
    this.masterTimeline?.kill();
    this.masterTimeline = null;
    this.container?.remove();
    this.container = null;
    this.scene = null;
    this.isPlaying = false;

    // Remove injected styles
    document.getElementById('solstice-styles')?.remove();
  }

  /**
   * Inject CSS styles
   */
  private injectStyles(): void {
    if (document.getElementById('solstice-styles')) return;

    const style = document.createElement('style');
    style.id = 'solstice-styles';
    // @design-tokens-ignore - Seasonal theme defines its own CSS custom properties
    style.textContent = `
      /* Winter Solstice Color Tokens */
      :root {
        /* Night sky */
        --solstice-sky-top: #0d1b2a;
        --solstice-sky-mid: #1b263b;
        --solstice-horizon: #2c3e50;

        /* Dawn transformation */
        --solstice-dawn-top: #1a2a3a;
        --solstice-dawn-mid: #2d4a5a;
        --solstice-dawn-horizon: #d4a574;

        /* Mountains */
        --solstice-mountain-far: #1e2832;
        --solstice-mountain-mid: #2c3e4a;
        --solstice-mountain-near: #3d4f5f;

        /* Sun */
        --solstice-sun-core: #f8e8c8;
        --solstice-sun-mid: #f4d9a5;
        --solstice-sun-outer: #e8c088;

        /* Stars */
        --solstice-star: #f0f4ff;
        --solstice-star-label: rgba(240, 244, 255, 0.9);
        --solstice-constellation: rgba(240, 244, 255, 0.4);

        /* Effects */
        --solstice-fog: #c4b8a8;
        --solstice-snow: #ffffff;
      }

      /* Dawn state overrides */
      .solstice-dawn {
        --solstice-sky-top: var(--solstice-dawn-top);
        --solstice-sky-mid: var(--solstice-dawn-mid);
        --solstice-horizon: var(--solstice-dawn-horizon);
      }

      /* Container */
      .solstice-container {
        position: fixed;
        inset: 0;
        z-index: var(--z-tooltip);
        background: #0d1b2a;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .solstice-scene-wrapper {
        position: absolute;
        inset: 0;
      }

      .solstice-scene {
        width: 100%;
        height: 100%;
      }

      /* Sky transition */
      .solstice-scene .sky-layer {
        transition: fill 3s ease-in-out;
      }

      .solstice-dawn .sky-horizon { stop-color: var(--solstice-dawn-horizon); }
      .solstice-dawn .sky-mid { stop-color: var(--solstice-dawn-mid); }
      .solstice-dawn .sky-top { stop-color: var(--solstice-dawn-top); }

      /* Text overlay */
      .solstice-text-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-8);
        pointer-events: none;
      }

      .solstice-content {
        text-align: center;
        max-width: clamp(420px, 90vw, 600px);
        color: var(--solstice-star);
      }

      .solstice-title {
        font-family: var(--font-display);
        font-size: clamp(2rem, 5vw, 3.5rem);
        font-weight: 300;
        letter-spacing: 0.05em;
        margin: 0 0 var(--space-4);
        text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
      }

      .solstice-subtitle {
        font-family: var(--font-body);
        font-size: clamp(1rem, 2vw, 1.25rem);
        opacity: 0.8;
        margin: 0 0 var(--space-8);
      }

      .solstice-reflection {
        font-family: var(--font-body);
        font-size: clamp(1rem, 1.5vw, 1.125rem);
        line-height: 1.7;
        opacity: 0.9;
        margin: 0 0 var(--space-8);
      }

      .solstice-promise {
        font-family: var(--font-body);
        font-size: clamp(1.125rem, 2vw, 1.375rem);
        font-style: italic;
        color: var(--solstice-sun-core);
      }

      .solstice-close {
        position: fixed;
        top: var(--space-6);
        right: var(--space-6);
        width: 48px;
        height: 48px;
        border: none;
        background: rgba(255, 255, 255, 0.2);
        border-radius: var(--radius-full);
        color: var(--solstice-star);
        cursor: pointer;
        pointer-events: auto;
        transition: all var(--duration-fast) ease;
      }

      .solstice-close:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: scale(1.05);
      }

      .solstice-close svg {
        width: 24px;
        height: 24px;
      }

      /* Team gathering */
      .solstice-team-gathering {
        position: absolute;
        bottom: 15%;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: var(--space-4);
      }

      .solstice-team-orb {
        width: 56px;
        height: 56px;
        border-radius: var(--radius-full);
        background: var(--orb-color);
        box-shadow: 0 0 30px var(--orb-color);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .team-orb-inner {
        width: 100%;
        height: 100%;
        border-radius: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, rgba(255,255,255,0.2), transparent);
      }

      .team-orb-initial {
        font-family: var(--font-display);
        font-size: 1.25rem;
        font-weight: 600;
        color: white;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      }

      /* Static version for reduced motion */
      .solstice-static {
        background: linear-gradient(180deg, #0d1b2a 0%, #2c3e50 100%);
      }

      .solstice-static-content {
        text-align: center;
        padding: var(--space-8);
        max-width: clamp(350px, 90vw, 500px);
        color: var(--solstice-star);
      }

      .solstice-static-content h1 {
        font-family: var(--font-display);
        font-size: 2rem;
        margin-bottom: var(--space-4);
      }

      .solstice-static-content .subtitle {
        opacity: 0.8;
        margin-bottom: var(--space-6);
      }

      .solstice-static-content .reflection {
        line-height: 1.7;
        margin-bottom: var(--space-6);
      }

      .solstice-static-content .promise {
        font-style: italic;
        color: var(--solstice-sun-core);
        margin-bottom: var(--space-8);
      }

      .solstice-close-static {
        padding: var(--space-3) var(--space-6);
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: var(--radius-lg);
        color: white;
        cursor: pointer;
        transition: all var(--duration-fast) ease;
      }

      .solstice-close-static:hover {
        background: rgba(255, 255, 255, 0.25);
      }

      /* Responsive */
      @media (max-width: clamp(538px, 90vw, 768px)) {
        .solstice-team-gathering {
          gap: var(--space-2);
        }

        .solstice-team-orb {
          width: 44px;
          height: 44px;
        }

        .team-orb-initial {
          font-size: 1rem;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const winterSolsticeMoment = new WinterSolsticeMomentUI();

/**
 * Check if today is the winter solstice season (Dec 15 - Jan 1)
 */
export function isWinterSolsticeSeason(): boolean {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();

  // December 15-31 or January 1
  return (month === 11 && day >= 15) || (month === 0 && day === 1);
}

/**
 * Check if this is the actual solstice day (Dec 21)
 */
export function isWinterSolsticeDay(): boolean {
  const now = new Date();
  return now.getMonth() === 11 && now.getDate() === 21;
}

// ============================================================================
// DEV PANEL INTEGRATION
// ============================================================================

// Expose to window for dev panel testing
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).winterSolsticeMoment = winterSolsticeMoment;
}

