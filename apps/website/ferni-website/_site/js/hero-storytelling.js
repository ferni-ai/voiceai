/**
 * Ferni Hero Storytelling Animation
 * Luxo Jr. inspired - emotion through MOVEMENT, not features
 * 
 * "The lamp has no face, yet you know exactly how it feels."
 * - Every emotion is expressed through tilt, bounce, squash, stretch, and timing
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
    
    // If no avatar or reduced motion, just show content
    if (!this.container || !this.avatar || this.prefersReducedMotion) {
      this.showImmediately();
      return;
    }
    
    // Check if GSAP is available
    if (typeof gsap === 'undefined') {
      console.warn('[Ferni Hero] GSAP not loaded, showing immediately');
      this.showImmediately();
      return;
    }
    
    this.init();
  }

  showImmediately() {
    // Show everything without animation
    const heroContent = document.querySelector('.hero__content');
    if (heroContent) {
      heroContent.style.opacity = '1';
    }
    
    const avatar = document.querySelector('.hero-ferni');
    if (avatar) {
      avatar.style.opacity = '1';
      avatar.style.transform = 'none';
    }
  }

  init() {
    // Register ScrollTrigger if available
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
  // ============================================================================

  /**
   * BOUNCE - Excited jump (the iconic Luxo Jr. move)
   */
  bounce() {
    if (!this.avatar) return;
    
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

  // ============================================================================
  // STORY SEQUENCE
  // ============================================================================

  playStorySequence() {
    const tl = gsap.timeline({ defaults: { ease: EASING.EXPO_OUT } });

    // Get elements - only animate what exists
    const orb = this.avatar?.querySelector('.hero-ferni__orb');
    const glow = this.avatar?.querySelector('.hero-ferni__glow');
    const rings = this.avatar?.querySelectorAll('.hero-ferni__ring');
    
    const tagline = document.querySelector('.hero__tagline');
    const headline = document.querySelector('.hero__headline');
    const subhead = document.querySelector('.hero__subhead');
    const ctas = document.querySelector('.hero__cta');
    const badges = document.querySelector('.hero__badges');

    // ========== INITIAL STATE ==========
    tl.set(this.avatar, { opacity: 0, scale: 0.3, y: 40 });
    
    if (glow) tl.set(glow, { opacity: 0, scale: 0.5 });
    if (rings && rings.length) tl.set(rings, { opacity: 0, scale: 0.5 });
    
    // Set content to hidden initially
    const contentElements = [tagline, headline, subhead, ctas, badges].filter(Boolean);
    if (contentElements.length) {
      tl.set(contentElements, { opacity: 0, y: 24 });
    }

    // ========== ACT 1: FERNI AWAKENS ==========
    // Fade in while still compressed
    tl.to(this.avatar, {
      opacity: 1,
      scale: 0.85,
      y: 0,
      duration: DURATION.DRAMATIC,
    }, 0.2);

    // The iconic bounce-up
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

    // Glow fades in
    if (glow) {
      tl.to(glow, {
        opacity: 1,
        scale: 1,
        duration: DURATION.CELEBRATION,
        ease: EASING.GENTLE,
      }, '-=0.5');
    }

    // ========== ACT 2: FERNI NOTICES YOU ==========
    // Curious tilt
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

    // Rings expand
    if (rings && rings.length) {
      tl.to(rings, {
        opacity: 1,
        scale: 1,
        duration: DURATION.DRAMATIC,
        stagger: 0.15,
        ease: EASING.EXPO_OUT,
      }, '-=0.3');
    }

    // ========== ACT 3: CONTENT REVEALS ==========
    
    // Tagline
    if (tagline) {
      tl.to(tagline, {
        opacity: 1,
        y: 0,
        duration: DURATION.DELIBERATE,
      }, '-=0.2');
    }

    // Small nod
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

    // Headline
    if (headline) {
      tl.to(headline, {
        opacity: 1,
        y: 0,
        duration: DURATION.DRAMATIC,
      }, '-=0.3');
    }

    // ========== ACT 4: THE PROMISE ==========
    
    // Excited bounce
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

    // Subhead
    if (subhead) {
      tl.to(subhead, {
        opacity: 1,
        y: 0,
        duration: DURATION.DELIBERATE,
      }, '-=0.2');
    }

    // CTAs
    if (ctas) {
      tl.to(ctas, {
        opacity: 1,
        y: 0,
        duration: DURATION.DELIBERATE,
      }, '-=0.1');
    }

    // ========== ACT 5: TRUST ==========
    
    // Warm pulse
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

    // Badges
    if (badges) {
      tl.to(badges, {
        opacity: 1,
        y: 0,
        duration: DURATION.DELIBERATE,
      }, '-=0.3');
    }

    // Start continuous breathing
    tl.call(() => this.startBreathing());
  }

  // ============================================================================
  // CONTINUOUS BEHAVIORS
  // ============================================================================

  startBreathing() {
    if (!this.avatar) return;

    const orb = this.avatar.querySelector('.hero-ferni__orb');
    const glow = this.avatar.querySelector('.hero-ferni__glow');

    if (orb) {
      gsap.to(orb, {
        scaleY: 1.015,
        scaleX: 0.99,
        y: -1.5,
        duration: 2.5,
        ease: EASING.SMOOTH,
        repeat: -1,
        yoyo: true,
      });
    }

    if (glow) {
      gsap.to(glow, {
        opacity: 0.7,
        scale: 1.05,
        duration: 2,
        ease: EASING.SMOOTH,
        repeat: -1,
        yoyo: true,
      });
    }
  }

  // ============================================================================
  // SCROLL BEHAVIOR
  // ============================================================================

  setupScrollAnimations() {
    if (typeof ScrollTrigger === 'undefined' || !this.avatar) return;

    // Ferni "watches" as user scrolls away
    gsap.to(this.avatar, {
      y: 30,
      scale: 0.9,
      opacity: 0.4,
      rotation: -5,
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: '60% top',
        scrub: 1,
      },
    });
  }

  // ============================================================================
  // INTERACTIVITY
  // ============================================================================

  setupInteractivity() {
    if (!this.avatar) return;

    // HOVER: Ferni perks up
    this.avatar.addEventListener('mouseenter', () => {
      gsap.killTweensOf(this.avatar);
      
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
      
      this.startBreathing();
    });

    // CLICK: Full bounce!
    this.avatar.addEventListener('click', () => {
      gsap.killTweensOf(this.avatar);
      this.bounce();
    });
  }
}

// ============================================================================
// INITIALIZE
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure elements are rendered
  setTimeout(() => {
    new FerniHeroStorytelling();
    console.log('[Ferni Hero] Animation initialized 🎬');
  }, 100);
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FerniHeroStorytelling };
}
