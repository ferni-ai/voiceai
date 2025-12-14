/**
 * Ferni Landing Page Animations
 * Leveraging our design system choreography to tell the "better than human" story
 *
 * Philosophy: Everything alive breathes. Motion conveys warmth.
 */

(function () {
  'use strict';

  // ============================================================================
  // CONSTANTS (from design-system/choreography)
  // ============================================================================

  const EASING = {
    // Core easings
    STANDARD: 'cubic-bezier(0.4, 0, 0.2, 1)', // Material standard
    SPRING: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Pixar-style overshoot bounce
    SPRING_GENTLE: 'cubic-bezier(0.25, 1.2, 0.5, 1)', // Subtle bounce
    GENTLE: 'cubic-bezier(0.25, 0.1, 0.25, 1)', // Organic, natural
    ANTICIPATE: 'cubic-bezier(0.38, -0.4, 0.88, 0.65)', // Wind-up
    EXPO_OUT: 'cubic-bezier(0.16, 1, 0.3, 1)', // Dramatic exit
    SMOOTH: 'cubic-bezier(0.45, 0, 0.55, 1)', // Smooth in/out
  };

  const DURATION = {
    MICRO: 50, // Immediate feedback
    FAST: 100, // Hover states
    NORMAL: 200, // Standard transitions
    SLOW: 300, // Deliberate moves
    MODERATE: 400, // Panel slides
    DELIBERATE: 500, // Emphasis
    DRAMATIC: 600, // Celebrations
    CELEBRATION: 800, // Major moments
    CINEMATIC: 1200, // Hero animations
    GLACIAL: 2000, // Ambient effects
  };

  // ============================================================================
  // SCROLL REVEAL SYSTEM
  // Staggered reveals with anticipation & follow-through (Pixar principles)
  // ============================================================================

  class ScrollRevealSystem {
    constructor() {
      this.revealed = new Set();
      this.init();
    }

    init() {
      // Check for reduced motion preference
      this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Initialize observers
      this.setupObservers();

      // Add initial styles
      this.addStyles();
    }

    addStyles() {
      // Progressive enhancement: CSS in story-brand.css handles visibility
      // This JS just adds .js-animate to enable animations and .is-visible when scrolled
      // No dynamic opacity:0 injection - content is visible by default without JS

      const style = document.createElement('style');
      style.textContent = `
      /* Stagger timing for reveal children */
      .js-animate .reveal-stagger.is-visible > *:nth-child(1) { transition-delay: 0ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(2) { transition-delay: 80ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(3) { transition-delay: 160ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(4) { transition-delay: 240ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(5) { transition-delay: 320ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(6) { transition-delay: 400ms; }
    `;
      document.head.appendChild(style);
    }

    setupObservers() {
      const options = {
        root: null,
        rootMargin: '0px 0px -80px 0px',
        threshold: 0.1,
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.revealed.has(entry.target)) {
            this.reveal(entry.target);
            this.revealed.add(entry.target);
          }
        });
      }, options);

      // Observe all reveal elements
      document.querySelectorAll('.reveal, .reveal-stagger').forEach((el) => {
        observer.observe(el);
      });

      // Observe new storytelling sections
      const storySelectors = [
        '.memory-demo__moment',
        '.story',
        '.proof-table__row',
        '.journey__stage',
        '.journey__note',
      ];

      storySelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
          observer.observe(el);
        });
      });
    }

    reveal(element) {
      if (this.prefersReducedMotion) {
        element.classList.add('is-visible');
        return;
      }

      // Add visible class with slight delay for better perception
      requestAnimationFrame(() => {
        element.classList.add('is-visible');
      });
    }
  }

  // ============================================================================
  // MEMORY DEMO ANIMATION SYSTEM
  // Cinematic reveal with staggered timing and expressive Ferni card
  // ============================================================================

  class MemoryDemoAnimation {
    constructor() {
      this.revealed = new Set();
      this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.init();
    }

    init() {
      this.addStyles();
      this.setupObservers();
    }

    addStyles() {
      const style = document.createElement('style');
      style.id = 'memory-demo-animations';
      style.textContent = `
      /* ═══════════════════════════════════════════════════════════════════════════
         MEMORY DEMO KEYFRAMES
         ═══════════════════════════════════════════════════════════════════════════ */
      
      @keyframes memory-float {
        0%, 100% {
          transform: translateY(0) rotate(0deg);
        }
        25% {
          transform: translateY(-4px) rotate(0.3deg);
        }
        50% {
          transform: translateY(-6px) rotate(-0.2deg);
        }
        75% {
          transform: translateY(-3px) rotate(0.2deg);
        }
      }
      
      @keyframes memory-glow-pulse {
        0%, 100% {
          box-shadow: 
            0 8px 32px rgba(74, 103, 65, 0.25),
            0 2px 8px rgba(74, 103, 65, 0.15),
            0 0 0 0 rgba(74, 103, 65, 0);
        }
        50% {
          box-shadow: 
            0 12px 40px rgba(74, 103, 65, 0.35),
            0 4px 12px rgba(74, 103, 65, 0.2),
            0 0 30px 5px rgba(74, 103, 65, 0.15);
        }
      }
      
      @keyframes avatar-presence-pulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.3);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 0 20px 3px rgba(255, 255, 255, 0.2);
        }
      }
      
      @keyframes timeline-line-grow {
        from {
          transform: scaleY(0);
          transform-origin: top;
        }
        to {
          transform: scaleY(1);
          transform-origin: top;
        }
      }
      
      @keyframes typewriter-cursor {
        0%, 100% { border-color: transparent; }
        50% { border-color: rgba(255, 255, 255, 0.8); }
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         FERNI CARD EXPRESSIVE STATES
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .memory-demo__card--ferni.is-visible {
        animation: memory-float 6s ${EASING.SMOOTH} infinite;
      }
      
      .memory-demo__card--ferni.is-visible.is-glowing {
        animation: memory-float 6s ${EASING.SMOOTH} infinite,
                   memory-glow-pulse 3s ${EASING.SMOOTH} infinite;
      }
      
      .memory-demo__card--ferni .memory-demo__avatar {
        transition: transform 0.3s ${EASING.SPRING}, box-shadow 0.3s ease;
      }
      
      .memory-demo__card--ferni.is-visible .memory-demo__avatar {
        animation: avatar-presence-pulse 4s ${EASING.SMOOTH} infinite;
      }
      
      /* Timeline line animation */
      .memory-demo__line.is-animating {
        animation: timeline-line-grow 1.5s ${EASING.EXPO_OUT} forwards;
      }
      
      /* Typewriter effect for Ferni's text */
      .memory-demo__text--typewriter {
        overflow: hidden;
        border-right: 2px solid transparent;
        white-space: normal;
      }
      
      .memory-demo__text--typewriter.is-typing {
        animation: typewriter-cursor 1s step-end infinite;
      }
      
      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .memory-demo__card--ferni.is-visible,
        .memory-demo__card--ferni.is-visible.is-glowing,
        .memory-demo__card--ferni.is-visible .memory-demo__avatar,
        .memory-demo__line.is-animating {
          animation: none;
        }
        
        .memory-demo__moment,
        .memory-demo__insights,
        .memory-demo__insights-list li {
          opacity: 1;
          transform: none;
          transition: none;
        }
      }
    `;
      document.head.appendChild(style);
    }

    setupObservers() {
      // Observer for memory demo section
      const sectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !this.revealed.has('section')) {
              this.revealed.add('section');
              this.animateSection();
            }
          });
        },
        { threshold: 0.2 }
      );

      const memorySection = document.querySelector('.memory-demo');
      if (memorySection) {
        sectionObserver.observe(memorySection);
      }

      // Observer for individual moments (with stagger)
      const momentObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !this.revealed.has(entry.target)) {
              this.revealed.add(entry.target);
              this.revealMoment(entry.target);
            }
          });
        },
        { threshold: 0.3, rootMargin: '0px 0px -50px 0px' }
      );

      document.querySelectorAll('.memory-demo__moment').forEach((moment, index) => {
        moment.dataset.index = index;
        momentObserver.observe(moment);
      });

      // Observer for insights panel
      const insightsObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !this.revealed.has('insights')) {
              this.revealed.add('insights');
              this.revealInsights(entry.target);
            }
          });
        },
        { threshold: 0.2 }
      );

      const insights = document.querySelector('.memory-demo__insights');
      if (insights) {
        insightsObserver.observe(insights);
      }
    }

    animateSection() {
      // Animate timeline line
      const line = document.querySelector('.memory-demo__line');
      if (line && !this.prefersReducedMotion) {
        line.classList.add('is-animating');
      }
    }

    revealMoment(element) {
      const index = parseInt(element.dataset.index || 0, 10);
      const delay = this.prefersReducedMotion ? 0 : index * 150;

      setTimeout(() => {
        element.classList.add('is-visible');

        // Special treatment for Ferni's card (the last moment)
        if (element.classList.contains('memory-demo__moment--today')) {
          this.revealFerniCard(element);
        }
      }, delay);
    }

    revealFerniCard(moment) {
      const card = moment.querySelector('.memory-demo__card--ferni');
      if (!card) return;

      // Add glow after initial reveal
      setTimeout(() => {
        if (!this.prefersReducedMotion) {
          card.classList.add('is-glowing');
        }

        // Optionally trigger typewriter effect
        const text = card.querySelector('.memory-demo__text');
        if (text && !this.prefersReducedMotion) {
          this.typewriterEffect(text);
        }
      }, 400);
    }

    typewriterEffect(textElement) {
      const fullText = textElement.textContent;
      textElement.textContent = '';
      textElement.classList.add('memory-demo__text--typewriter', 'is-typing');

      let charIndex = 0;
      const typeSpeed = 25; // ms per character

      const type = () => {
        if (charIndex < fullText.length) {
          textElement.textContent += fullText.charAt(charIndex);
          charIndex++;
          setTimeout(type, typeSpeed);
        } else {
          textElement.classList.remove('is-typing');
        }
      };

      type();
    }

    revealInsights(panel) {
      if (this.prefersReducedMotion) {
        panel.classList.add('is-visible');
        panel.querySelectorAll('li').forEach((li) => li.classList.add('is-visible'));
        return;
      }

      // Reveal panel
      panel.classList.add('is-visible');

      // Stagger reveal list items
      const items = panel.querySelectorAll('.memory-demo__insights-list li');
      items.forEach((item, index) => {
        setTimeout(
          () => {
            item.classList.add('is-visible');
          },
          200 + index * 120
        );
      });
    }
  }

  // ============================================================================
  // AVATAR BREATHING SYSTEM
  // Everything alive breathes (Pixar principle)
  // ============================================================================

  class AvatarBreathingSystem {
    constructor() {
      this.avatars = [];
      this.init();
    }

    init() {
      // Add breathing animation styles
      this.addStyles();

      // Find and animate all avatars
      document
        .querySelectorAll('.persona-avatar__orb, .team-card .persona-avatar')
        .forEach((avatar) => {
          this.startBreathing(avatar);
        });
    }

    addStyles() {
      const style = document.createElement('style');
      style.textContent = `
      @keyframes avatar-breathe {
        0%, 100% {
          transform: scale3d(1, 1, 1) translateY(0);
        }
        40% {
          transform: scale3d(0.994, 1.012, 1) translateY(-1px);
        }
        50% {
          transform: scale3d(0.994, 1.012, 1) translateY(-1px);
        }
        90% {
          transform: scale3d(1, 1, 1) translateY(0);
        }
      }
      
      .persona-avatar--breathing .persona-avatar__orb {
        animation: avatar-breathe 5s ${EASING.SMOOTH} infinite;
      }
      
      /* Glowing ring pulse */
      @keyframes ring-pulse {
        0%, 100% {
          opacity: 0.15;
          transform: scale(1);
        }
        50% {
          opacity: 0.25;
          transform: scale(1.02);
        }
      }
      
      .persona-avatar--breathing .persona-avatar__ring {
        animation: ring-pulse 4s ${EASING.SMOOTH} infinite;
      }
      
      /* Hover state - excited breathing */
      .persona-avatar:hover .persona-avatar__orb {
        animation: avatar-breathe 2s ${EASING.SPRING_GENTLE} infinite;
      }
      
      @media (prefers-reduced-motion: reduce) {
        .persona-avatar--breathing .persona-avatar__orb,
        .persona-avatar--breathing .persona-avatar__ring,
        .persona-avatar:hover .persona-avatar__orb {
          animation: none;
        }
      }
    `;
      document.head.appendChild(style);
    }

    startBreathing(avatar) {
      const parent = avatar.closest('.persona-avatar');
      if (parent) {
        parent.classList.add('persona-avatar--breathing');
      }
    }
  }

  // ============================================================================
  // NUMBER COUNT-UP ANIMATION
  // Stats that come alive (from celebration-moments.ts)
  // ============================================================================

  class NumberCountUp {
    constructor() {
      this.counted = new Set();
      this.init();
    }

    init() {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !this.counted.has(entry.target)) {
              this.countUp(entry.target);
              this.counted.add(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );

      // Find all stat values
      document.querySelectorAll('.stat__value').forEach((el) => {
        observer.observe(el);
      });
    }

    countUp(element) {
      const text = element.textContent.trim();
      const hasK = text.includes('K');
      const hasPlus = text.includes('+');
      const numMatch = text.match(/[\d.]+/);

      if (!numMatch) return;

      const endValue = parseFloat(numMatch[0]);
      const duration = DURATION.CINEMATIC;
      const startTime = performance.now();

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      const tick = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Expo out easing
        const eased = 1 - Math.pow(1 - progress, 3);

        const current = (endValue * eased).toFixed(hasK && endValue < 100 ? 0 : 0);

        let display = current;
        if (hasK) display += 'K';
        if (hasPlus) display += '+';

        // Keep special characters like ∞, <
        if (text.includes('∞')) {
          element.textContent = '∞';
          return;
        }
        if (text.includes('<')) {
          display = '<' + display;
        }

        element.textContent = display;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          element.textContent = text; // Restore original
        }
      };

      element.textContent = '0';
      requestAnimationFrame(tick);
    }
  }

  // ============================================================================
  // HERO PARALLAX & DEPTH
  // Creating depth through motion
  // ============================================================================

  class HeroParallax {
    constructor() {
      this.hero = document.querySelector('.hero');
      if (this.hero) {
        this.init();
      }
    }

    init() {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      this.addStyles();
      this.setupParallax();
    }

    addStyles() {
      const style = document.createElement('style');
      style.textContent = `
      .hero {
        --parallax-y: 0;
      }
      
      .hero__content {
        transform: translateY(calc(var(--parallax-y) * 0.3));
        transition: transform 0.1s linear;
      }
      
      .hero__bg-orbs {
        transform: translateY(calc(var(--parallax-y) * -0.1));
      }
      
      .scroll-indicator {
        opacity: calc(1 - var(--parallax-y) / 100);
      }
    `;
      document.head.appendChild(style);
    }

    setupParallax() {
      let ticking = false;

      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            const scrollY = window.scrollY;
            const heroHeight = this.hero.offsetHeight;
            const progress = Math.min(scrollY / heroHeight, 1);

            this.hero.style.setProperty('--parallax-y', scrollY * 0.15);

            ticking = false;
          });
          ticking = true;
        }
      });
    }
  }

  // ============================================================================
  // BUTTON MICRO-INTERACTIONS
  // Squash & stretch on press (Pixar principle)
  // ============================================================================

  class ButtonMicroInteractions {
    constructor() {
      this.init();
    }

    init() {
      this.addStyles();
    }

    addStyles() {
      const style = document.createElement('style');
      style.textContent = `
      /* Button hover lift */
      .btn {
        transition: transform ${DURATION.NORMAL}ms ${EASING.EXPO_OUT},
                    box-shadow ${DURATION.NORMAL}ms ${EASING.EXPO_OUT},
                    background-color ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }
      
      .btn:hover {
        transform: translateY(-2px);
      }
      
      /* Primary button glow on hover */
      .btn--primary:hover {
        box-shadow: 0 8px 30px rgba(74, 103, 65, 0.25);
      }
      
      /* Press state - squash */
      .btn:active {
        transform: scale(0.98) translateY(0);
        transition-duration: ${DURATION.FAST}ms;
      }
      
      /* Icon arrow animation */
      .btn svg {
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }
      
      .btn:hover svg {
        transform: translateX(4px);
      }
      
      @media (prefers-reduced-motion: reduce) {
        .btn,
        .btn:hover,
        .btn:active,
        .btn svg {
          transform: none;
          transition: none;
        }
      }
    `;
      document.head.appendChild(style);
    }
  }

  // ============================================================================
  // CARD HOVER EFFECTS
  // Subtle lift with persona glow
  // ============================================================================

  class CardHoverEffects {
    constructor() {
      this.init();
    }

    init() {
      this.addStyles();
    }

    addStyles() {
      const style = document.createElement('style');
      style.textContent = `
      /* Team card hover */
      .team-card {
        transition: transform ${DURATION.SLOW}ms ${EASING.EXPO_OUT},
                    box-shadow ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
      }
      
      .team-card:hover {
        transform: translateY(-8px);
        box-shadow: 0 20px 40px rgba(44, 37, 32, 0.1);
      }
      
      /* Persona glow on hover */
      .team-card:hover .persona-avatar {
        --glow-intensity: 0.3;
      }
      
      .persona-avatar::after {
        content: '';
        position: absolute;
        inset: -8px;
        border-radius: 50%;
        background: radial-gradient(circle, var(--persona-glow, rgba(74, 103, 65, 0.2)) 0%, transparent 70%);
        opacity: 0;
        transition: opacity ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
        pointer-events: none;
      }
      
      .team-card:hover .persona-avatar::after {
        opacity: 1;
      }
      
      /* Feature card hover */
      .feature:hover {
        transform: translateY(-4px);
      }
      
      /* Use case card */
      .use-case {
        transition: transform ${DURATION.SLOW}ms ${EASING.EXPO_OUT},
                    box-shadow ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
      }
      
      .use-case:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 32px rgba(44, 37, 32, 0.08);
      }
      
      @media (prefers-reduced-motion: reduce) {
        .team-card:hover,
        .feature:hover,
        .use-case:hover {
          transform: none;
        }
      }
    `;
      document.head.appendChild(style);
    }
  }

  // ============================================================================
  // FAQ ACCORDION ANIMATION
  // Smooth expand/collapse with anticipation
  // ============================================================================

  class FAQAnimation {
    constructor() {
      this.init();
    }

    init() {
      this.addStyles();
      this.setupAccordions();
    }

    addStyles() {
      const style = document.createElement('style');
      style.textContent = `
      .faq-item summary {
        transition: color ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }
      
      .faq-item[open] summary {
        color: var(--color-ferni-green);
      }
      
      .faq-item__answer {
        animation: faq-expand ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
      }
      
      @keyframes faq-expand {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      /* Chevron rotation */
      .faq-item summary::after {
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }
      
      .faq-item[open] summary::after {
        transform: rotate(180deg);
      }
    `;
      document.head.appendChild(style);
    }

    setupAccordions() {
      document.querySelectorAll('.faq-item').forEach((item) => {
        item.addEventListener('toggle', (e) => {
          if (item.open) {
            // Close other FAQs
            document.querySelectorAll('.faq-item[open]').forEach((other) => {
              if (other !== item) {
                other.removeAttribute('open');
              }
            });
          }
        });
      });
    }
  }

  // ============================================================================
  // SMOOTH SCROLL
  // Buttery smooth anchor scrolling
  // ============================================================================

  class SmoothScroll {
    constructor() {
      this.init();
    }

    init() {
      document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (e) => {
          const targetId = anchor.getAttribute('href');
          if (targetId === '#') return;

          const target = document.querySelector(targetId);
          if (target) {
            e.preventDefault();

            // Calculate offset for fixed nav
            const navHeight = document.querySelector('.nav')?.offsetHeight || 0;
            const targetPosition =
              target.getBoundingClientRect().top + window.scrollY - navHeight - 20;

            window.scrollTo({
              top: targetPosition,
              behavior: 'smooth',
            });

            // Close mobile menu if open
            document.getElementById('mobileMenu')?.classList.remove('is-open');
          }
        });
      });
    }
  }

  // ============================================================================
  // INITIALIZE ALL ANIMATIONS
  // ============================================================================

  document.addEventListener('DOMContentLoaded', () => {
    // Check for reduced motion preference globally
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      console.log('[Ferni Animations] Reduced motion preferred, animations minimized');
    }

    // Initialize animation systems (scroll reveal handled by inline script)
    new MemoryDemoAnimation(); // Apple-Bold memory demo with staggered reveals
    new AvatarBreathingSystem();
    new NumberCountUp();
    new HeroParallax();
    new ButtonMicroInteractions();
    new CardHoverEffects();
    new FAQAnimation();
    new SmoothScroll();

    console.log('[Ferni Animations] All systems initialized 🎬');
  });
})(); // End IIFE
