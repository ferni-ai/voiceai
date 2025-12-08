/**
 * Ferni Hero Storytelling Animation
 * Luxo Jr. inspired - emotion through MOVEMENT, not features
 * 
 * "The lamp has no face, yet you know exactly how it feels."
 * - Every emotion is expressed through tilt, bounce, squash, stretch, and timing
 * 
 * Avatar Choreography Integration:
 * - BREATHE: Continuous idle state (everything alive breathes)
 * - LISTENING: Attentive lean-in
 * - SPEAKING: Active pulse with glow
 * - THINKING: Curious tilt
 * - NOD: Agreement with squash & stretch  
 * - BOUNCE: Excited jump (Luxo Jr. style)
 * - PULSE: Warm acknowledgment
 * - SHAKE: Gentle disagreement
 */

// ============================================================================
// EASING & TIMING CONSTANTS (from design-system)
// ============================================================================

const EASING = {
  STANDARD: 'power2.out',
  SPRING: 'back.out(1.7)',
  SPRING_GENTLE: 'back.out(1.2)',
  GENTLE: 'power1.inOut',
  ANTICIPATE: 'power2.in',
  EXPO_OUT: 'expo.out',
  SMOOTH: 'sine.inOut',
  ELASTIC: 'elastic.out(1, 0.5)',
};

const DURATION = {
  MICRO: 0.05,
  FAST: 0.1,
  NORMAL: 0.2,
  SLOW: 0.3,
  MODERATE: 0.4,
  DELIBERATE: 0.5,
  DRAMATIC: 0.6,
  CELEBRATION: 0.8,
  CINEMATIC: 1.2,
};

// ============================================================================
// FERNI HERO STORYTELLING
// ============================================================================

class FerniHeroStorytelling {
  constructor() {
    this.container = document.querySelector('.hero');
    this.avatar = document.querySelector('.hero-ferni');
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (!this.container || !this.avatar || this.prefersReducedMotion) {
      this.showImmediately();
      return;
    }
    
    this.init();
  }

  showImmediately() {
    // Just show everything without animation
    const elements = document.querySelectorAll('.hero-ferni, .hero__eyebrow-wrap, .hero__headline, .hero__subhead, .hero__cta, .hero__badges');
    elements.forEach(el => {
      if (el) {
        el.style.opacity = '1';
        el.style.transform = 'none';
      }
    });
  }

  init() {
    if (typeof gsap === 'undefined') {
      console.warn('[Ferni Hero] GSAP not loaded');
      this.showImmediately();
      return;
    }

    if (typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);
    }

    // Run the storytelling sequence
    this.playStorySequence();
    
    // Setup continuous behaviors
    this.setupScrollAnimations();
    this.setupInteractivity();
  }

  // ============================================================================
  // LUXO JR. STYLE MOVEMENTS
  // Each method expresses a specific emotion through movement alone
  // ============================================================================

  /**
   * ANTICIPATION - Wind up before a big action
   * Ferni crouches down, compressing before jumping
   */
  anticipate(duration = DURATION.NORMAL) {
    return gsap.to(this.avatar, {
      scaleX: 1.08,
      scaleY: 0.92,
      y: 4,
      duration,
      ease: EASING.ANTICIPATE,
    });
  }

  /**
   * BOUNCE - Excited jump (the iconic Luxo Jr. move)
   * Full squash and stretch with overshoot
   */
  bounce() {
    const tl = gsap.timeline();
    
    // Anticipation (squash down)
    tl.to(this.avatar, {
      scaleX: 1.1,
      scaleY: 0.9,
      y: 5,
      duration: DURATION.FAST,
      ease: EASING.ANTICIPATE,
    });
    
    // Launch (stretch up)
    tl.to(this.avatar, {
      scaleX: 0.9,
      scaleY: 1.15,
      y: -20,
      duration: DURATION.SLOW,
      ease: EASING.EXPO_OUT,
    });
    
    // Apex (slight pause at top)
    tl.to(this.avatar, {
      scaleY: 1.1,
      duration: DURATION.MICRO,
      ease: EASING.SMOOTH,
    });
    
    // Fall (stretch down)
    tl.to(this.avatar, {
      scaleX: 1.12,
      scaleY: 0.88,
      y: 3,
      duration: DURATION.NORMAL,
      ease: EASING.ANTICIPATE,
    });
    
    // Settle (spring back to normal)
    tl.to(this.avatar, {
      scaleX: 1,
      scaleY: 1,
      y: 0,
      duration: DURATION.DELIBERATE,
      ease: EASING.ELASTIC,
    });
    
    return tl;
  }

  /**
   * NOD - Agreement with squash & stretch
   * Like a nod, but with body compression
   */
  nod() {
    const tl = gsap.timeline();
    
    // Down with squash
    tl.to(this.avatar, {
      scaleY: 0.95,
      scaleX: 1.03,
      y: 4,
      rotation: 3,
      duration: DURATION.FAST,
      ease: EASING.STANDARD,
    });
    
    // Up with stretch + overshoot
    tl.to(this.avatar, {
      scaleY: 1.05,
      scaleX: 0.97,
      y: -6,
      rotation: -4,
      duration: DURATION.NORMAL,
      ease: EASING.SPRING,
    });
    
    // Settle
    tl.to(this.avatar, {
      scaleY: 1,
      scaleX: 1,
      y: 0,
      rotation: 0,
      duration: DURATION.SLOW,
      ease: EASING.GENTLE,
    });
    
    return tl;
  }

  /**
   * CURIOUS TILT - "What's this?" moment
   * Head cocks to one side like a curious dog/lamp
   */
  curiousTilt(direction = 1) {
    const tl = gsap.timeline();
    
    tl.to(this.avatar, {
      rotation: 8 * direction,
      x: 3 * direction,
      duration: DURATION.MODERATE,
      ease: EASING.SPRING_GENTLE,
    });
    
    tl.to(this.avatar, {
      rotation: 0,
      x: 0,
      duration: DURATION.SLOW,
      ease: EASING.GENTLE,
    }, '+=0.3');
    
    return tl;
  }

  /**
   * LEAN IN - Attentive, interested posture
   * Shows Ferni is listening intently
   */
  leanIn() {
    return gsap.to(this.avatar, {
      scaleY: 1.02,
      y: -3,
      rotation: -2,
      duration: DURATION.MODERATE,
      ease: EASING.GENTLE,
    });
  }

  /**
   * PULSE - Warm acknowledgment (like a heartbeat)
   * Gentle expansion and return
   */
  pulse() {
    const tl = gsap.timeline();
    
    tl.to(this.avatar, {
      scale: 1.08,
      duration: DURATION.NORMAL,
      ease: EASING.EXPO_OUT,
    });
    
    tl.to(this.avatar, {
      scale: 0.97,
      duration: DURATION.FAST,
      ease: EASING.SMOOTH,
    });
    
    tl.to(this.avatar, {
      scale: 1.03,
      duration: DURATION.FAST,
      ease: EASING.EXPO_OUT,
    });
    
    tl.to(this.avatar, {
      scale: 1,
      duration: DURATION.NORMAL,
      ease: EASING.GENTLE,
    });
    
    return tl;
  }

  // ============================================================================
  // STORY SEQUENCE
  // The hero animation that tells Ferni's story
  // ============================================================================

  playStorySequence() {
    const tl = gsap.timeline({ defaults: { ease: EASING.EXPO_OUT } });

    // Get elements
    const orb = this.avatar?.querySelector('.hero-ferni__orb');
    const glow = this.avatar?.querySelector('.hero-ferni__glow');
    const rings = this.avatar?.querySelectorAll('.hero-ferni__ring');
    
    const eyebrow = document.querySelector('.hero__eyebrow-wrap');
    const headline = document.querySelector('.hero__headline');
    const headlineAccent = headline?.querySelector('.hero__headline-accent');
    const subhead = document.querySelector('.hero__subhead');
    const ctas = document.querySelector('.hero__cta');
    const badges = document.querySelector('.hero__badges');
    const scrollIndicator = document.querySelector('.scroll-indicator');

    // ========== INITIAL STATE ==========
    tl.set(this.avatar, { opacity: 0, scale: 0.3, y: 40 });
    tl.set(glow, { opacity: 0, scale: 0.5 });
    tl.set(rings, { opacity: 0, scale: 0.5 });
    tl.set([eyebrow, headline, subhead, ctas, badges, scrollIndicator], { 
      opacity: 0, y: 24 
    });

    // ========== ACT 1: FERNI AWAKENS ==========
    // Luxo Jr. style entrance - starts small, pops up with bounce
    
    // Fade in while still compressed
    tl.to(this.avatar, {
      opacity: 1,
      scale: 0.85,
      y: 0,
      duration: DURATION.DRAMATIC,
    }, 0.2);

    // The iconic bounce-up (like Luxo Jr. hopping onto screen)
    tl.to(this.avatar, {
      scale: 1.15,
      duration: DURATION.SLOW,
      ease: EASING.SPRING,
    });

    tl.to(this.avatar, {
      scale: 1,
      duration: DURATION.MODERATE,
      ease: EASING.ELASTIC,
    });

    // Glow fades in warmly
    tl.to(glow, {
      opacity: 1,
      scale: 1,
      duration: DURATION.CELEBRATION,
      ease: EASING.GENTLE,
    }, '-=0.5');

    // ========== ACT 2: FERNI NOTICES YOU ==========
    // Curious tilt - "Oh! Someone's here!"
    
    tl.to(this.avatar, {
      rotation: 6,
      x: 2,
      duration: DURATION.MODERATE,
      ease: EASING.SPRING_GENTLE,
    });

    tl.to(this.avatar, {
      rotation: 0,
      x: 0,
      duration: DURATION.SLOW,
      ease: EASING.GENTLE,
    });

    // Rings expand outward (welcoming gesture)
    tl.to(rings, {
      opacity: 1,
      scale: 1,
      duration: DURATION.DRAMATIC,
      stagger: 0.15,
      ease: EASING.EXPO_OUT,
    }, '-=0.3');

    // ========== ACT 3: FERNI INTRODUCES ITSELF ==========
    
    // Eyebrow appears
    tl.to(eyebrow, {
      opacity: 1,
      y: 0,
      duration: DURATION.DELIBERATE,
    }, '-=0.2');

    // Small nod of greeting
    tl.to(this.avatar, {
      scaleY: 0.96,
      y: 3,
      duration: DURATION.FAST,
      ease: EASING.STANDARD,
    });

    tl.to(this.avatar, {
      scaleY: 1.03,
      y: -4,
      duration: DURATION.NORMAL,
      ease: EASING.SPRING_GENTLE,
    });

    tl.to(this.avatar, {
      scaleY: 1,
      y: 0,
      duration: DURATION.SLOW,
      ease: EASING.GENTLE,
    });

    // Headline reveals
    tl.to(headline, {
      opacity: 1,
      y: 0,
      duration: DURATION.DRAMATIC,
    }, '-=0.3');

    // ========== ACT 4: THE PROMISE ==========
    
    // Excited bounce when revealing "Better than human"
    tl.to(this.avatar, {
      scaleX: 1.08,
      scaleY: 0.92,
      y: 4,
      duration: DURATION.FAST,
      ease: EASING.ANTICIPATE,
    });

    tl.to(this.avatar, {
      scaleX: 0.92,
      scaleY: 1.1,
      y: -12,
      duration: DURATION.SLOW,
      ease: EASING.EXPO_OUT,
    });

    tl.to(this.avatar, {
      scaleX: 1,
      scaleY: 1,
      y: 0,
      duration: DURATION.MODERATE,
      ease: EASING.ELASTIC,
    });

    // Subhead fades in
    tl.to(subhead, {
      opacity: 1,
      y: 0,
      duration: DURATION.DELIBERATE,
    }, '-=0.2');

    // CTAs appear
    tl.to(ctas, {
      opacity: 1,
      y: 0,
      duration: DURATION.DELIBERATE,
    }, '-=0.1');

    // ========== ACT 5: TRUST ==========
    
    // Warm pulse as badges appear
    tl.to(this.avatar, {
      scale: 1.05,
      duration: DURATION.NORMAL,
      ease: EASING.EXPO_OUT,
    });

    tl.to(this.avatar, {
      scale: 1,
      duration: DURATION.SLOW,
      ease: EASING.GENTLE,
    });

    // Badges fade in
    tl.to(badges, {
      opacity: 1,
      y: 0,
      duration: DURATION.DELIBERATE,
    }, '-=0.3');

    // Scroll indicator
    tl.to(scrollIndicator, {
      opacity: 1,
      y: 0,
      duration: DURATION.DELIBERATE,
    }, '-=0.1');

    // Start continuous breathing
    tl.call(() => this.startBreathing());
  }

  // ============================================================================
  // CONTINUOUS BEHAVIORS
  // ============================================================================

  /**
   * BREATHING - The most important idle animation
   * Everything alive breathes - subtle scale change
   */
  startBreathing() {
    if (!this.avatar) return;

    const orb = this.avatar.querySelector('.hero-ferni__orb');
    const glow = this.avatar.querySelector('.hero-ferni__glow');

    // Gentle breathing - inhale/exhale cycle
    gsap.to(orb, {
      scaleY: 1.015,
      scaleX: 0.99,
      y: -1.5,
      duration: 2.5,
      ease: EASING.SMOOTH,
      repeat: -1,
      yoyo: true,
    });

    // Glow pulses gently
    gsap.to(glow, {
      opacity: 0.7,
      scale: 1.05,
      duration: 2,
      ease: EASING.SMOOTH,
      repeat: -1,
      yoyo: true,
    });
  }

  // ============================================================================
  // SCROLL BEHAVIOR
  // ============================================================================

  setupScrollAnimations() {
    if (typeof ScrollTrigger === 'undefined') return;

    // Ferni "watches" as user scrolls away (slight sad tilt)
    gsap.to(this.avatar, {
      y: 30,
      scale: 0.9,
      opacity: 0.4,
      rotation: -5, // Slight droopy tilt as user leaves
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: '60% top',
        scrub: 1,
      },
    });

    // Content parallax
    gsap.to('.hero__content', {
      y: -60,
      opacity: 0.2,
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: '70% top',
        scrub: 1,
      },
    });
  }

  // ============================================================================
  // INTERACTIVITY
  // Ferni responds to user with Luxo Jr. style movements
  // ============================================================================

  setupInteractivity() {
    if (!this.avatar) return;

    // HOVER: Ferni perks up with attention
    this.avatar.addEventListener('mouseenter', () => {
      gsap.killTweensOf(this.avatar);
      
      // Excited lean toward user
      gsap.to(this.avatar, {
        scale: 1.12,
        rotation: 5,
        y: -5,
        duration: DURATION.SLOW,
        ease: EASING.SPRING,
      });
    });

    this.avatar.addEventListener('mouseleave', () => {
      gsap.to(this.avatar, {
        scale: 1,
        rotation: 0,
        y: 0,
        duration: DURATION.MODERATE,
        ease: EASING.ELASTIC,
      });
      
      // Resume breathing
      this.startBreathing();
    });

    // CLICK: Full Luxo Jr. bounce!
    this.avatar.addEventListener('click', () => {
      gsap.killTweensOf(this.avatar);
      this.bounce();
    });

    // MOUSE MOVE: Ferni subtly follows attention
    let lastX = 0;
    this.container.addEventListener('mousemove', (e) => {
      const rect = this.container.getBoundingClientRect();
      const centerX = rect.width / 2;
      const mouseX = e.clientX - rect.left;
      
      // Only update if significant movement
      if (Math.abs(mouseX - lastX) < 20) return;
      lastX = mouseX;
      
      // Subtle tilt toward cursor (like lamp looking)
      const tilt = ((mouseX - centerX) / centerX) * 4;
      const lean = ((mouseX - centerX) / centerX) * 2;
      
      gsap.to(this.avatar, {
        rotation: tilt,
        x: lean,
        duration: DURATION.MODERATE,
        ease: EASING.GENTLE,
        overwrite: 'auto',
      });
    });
  }
}

// ============================================================================
// CSS STYLES
// ============================================================================

function injectHeroStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ============================================
       HERO FERNI AVATAR
       Luxo Jr. style - emotion through movement
       ============================================ */
    
    .hero-ferni {
      position: relative;
      width: 120px;
      height: 120px;
      margin: 0 auto var(--space-6);
      cursor: pointer;
      z-index: 10;
      will-change: transform;
      transform-origin: center bottom; /* Pivot from bottom like Luxo */
    }
    
    /* Ambient glow - warm presence */
    .hero-ferni__glow {
      position: absolute;
      inset: -30px;
      background: radial-gradient(
        circle,
        rgba(74, 103, 65, 0.25) 0%,
        rgba(74, 103, 65, 0.08) 50%,
        transparent 70%
      );
      border-radius: 50%;
      filter: blur(15px);
      pointer-events: none;
    }
    
    /* Rings - expanding circles */
    .hero-ferni__ring {
      position: absolute;
      border-radius: 50%;
      border: 1.5px solid rgba(74, 103, 65, 0.12);
      pointer-events: none;
    }
    
    .hero-ferni__ring--outer {
      inset: -18px;
      border-color: rgba(74, 103, 65, 0.08);
    }
    
    .hero-ferni__ring--inner {
      inset: -8px;
      border-color: rgba(74, 103, 65, 0.15);
    }
    
    /* The orb - Ferni's "body" */
    .hero-ferni__orb {
      position: relative;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        145deg,
        var(--color-ferni-green-light, #5a7a51) 0%,
        var(--color-ferni-green, #4a6741) 50%,
        var(--color-ferni-green-dark, #3d5a35) 100%
      );
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 
        0 8px 24px rgba(74, 103, 65, 0.25),
        0 2px 6px rgba(0, 0, 0, 0.1),
        inset 0 -3px 8px rgba(0, 0, 0, 0.08),
        inset 0 3px 6px rgba(255, 255, 255, 0.08);
      transform-origin: center bottom;
    }
    
    /* "FN" monogram */
    .hero-ferni__text {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 36px;
      font-weight: 700;
      color: white;
      letter-spacing: -0.02em;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
      user-select: none;
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .hero-ferni,
      .hero-ferni__orb,
      .hero-ferni__glow,
      .hero-ferni__ring {
        animation: none !important;
        transition: none !important;
      }
    }
    
    /* Mobile */
    @media (max-width: 768px) {
      .hero-ferni {
        width: 90px;
        height: 90px;
        margin-bottom: var(--space-5);
      }
      
      .hero-ferni__text {
        font-size: 28px;
      }
      
      .hero-ferni__glow {
        inset: -20px;
      }
      
      .hero-ferni__ring--outer {
        inset: -12px;
      }
      
      .hero-ferni__ring--inner {
        inset: -5px;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// INITIALIZE
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  injectHeroStyles();
  
  setTimeout(() => {
    new FerniHeroStorytelling();
    console.log('[Ferni Hero] Luxo Jr. style storytelling initialized 🎬');
  }, 100);
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FerniHeroStorytelling, injectHeroStyles };
}
