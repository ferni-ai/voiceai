/**
 * Better Than Human - Ferni Landing Page Interactions
 * ====================================================
 *
 * PHILOSOPHY:
 * "Better than human" means understanding things humans don't notice about themselves.
 *
 * This file implements the five superhuman capabilities:
 * 1. Micro-Expressions (subliminal trust) - 40-150ms flashes
 * 2. Active Listening (empathetic presence) - nodding, lean-in
 * 3. Breath Synchronization (neural mirroring) - calming rhythm
 * 4. Concern Detection (guardian presence) - protective care
 * 5. Anticipatory Emotions (reading the future) - "I understand before you finish"
 *
 * DESIGN PRINCIPLES:
 * - DEMONSTRATE, don't describe
 * - Breathing, not static - everything feels alive
 * - Ma (間) - the purposeful pause
 * - Contextual warmth
 * - Cursor awareness - the orb "sees" you
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION - Ferni EQ Timing
  // ═══════════════════════════════════════════════════════════════════════════

  const EQ = {
    // Micro-expression durations (subliminal: 40-150ms)
    micro: {
      recognition: 80,
      concern: 60,
      delight: 100,
      warmth: 120,
      interest: 70,
    },

    // Active listening timing
    listening: {
      nodMicro: 180,
      nodSubtle: 220,
      nodVisible: 280,
      leanIn: 400,
    },

    // Breath rates (ms per cycle)
    breath: {
      calm: 6000,
      normal: 4500,
      engaged: 3500,
    },

    // Scroll awareness thresholds
    scroll: {
      fastThreshold: 50, // px per 16ms
      pauseDelay: 800, // ms before triggering pause response
      returnDelay: 2000, // ms to detect "came back"
    },

    // Probability of micro-expressions (don't spam)
    probability: {
      recognition: 0.3, // 30% chance on hover
      warmth: 0.2, // 20% chance on scroll pause
      interest: 0.25, // 25% chance on new section
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME-AWARE WARMTH
  // The site adapts to when you visit
  // ═══════════════════════════════════════════════════════════════════════════

  function initTimeAwareness() {
    const hour = new Date().getHours();
    const root = document.documentElement;

    let timeOfDay, greeting;

    if (hour >= 5 && hour < 12) {
      timeOfDay = 'morning';
      greeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
      greeting = 'Good afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeOfDay = 'evening';
      greeting = 'Good evening';
    } else {
      timeOfDay = 'night';
      greeting = "Can't sleep?";
    }

    root.setAttribute('data-time', timeOfDay);

    // Subtle warmth adjustment for night visits
    if (timeOfDay === 'night') {
      root.style.setProperty('--warmth-filter', 'sepia(5%) saturate(95%)');
      // Slower breath at night
      root.style.setProperty('--eq-breath-normal', `${EQ.breath.calm}ms`);
    }

    // Make greeting available
    window.ferniGreeting = greeting;
    window.ferniTimeOfDay = timeOfDay;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MICRO-EXPRESSIONS - Subliminal Trust Building
  // Duration: 40-150ms (below conscious perception but affects feelings)
  // ═══════════════════════════════════════════════════════════════════════════

  const MicroExpressions = {
    lastExpression: 0,
    cooldown: 500, // Minimum ms between expressions

    // Fire a micro-expression on an element
    play(element, type) {
      if (!element || respectsReducedMotion()) return;

      const now = Date.now();
      if (now - this.lastExpression < this.cooldown) return;

      // Probability check (don't spam)
      const prob = EQ.probability[type] || 0.3;
      if (Math.random() > prob) return;

      this.lastExpression = now;

      const className = `eq-micro-${type}`;
      element.classList.add(className);

      // Remove after animation completes
      const duration = EQ.micro[type] || 80;
      setTimeout(() => {
        element.classList.remove(className);
      }, duration + 50);
    },

    // Recognition - "I know you" (on hover/return)
    recognition(element) {
      this.play(element, 'recognition');
    },

    // Warmth - Connection moment (on meaningful interaction)
    warmth(element) {
      this.play(element, 'warmth');
    },

    // Delight - Achievement/positive moment
    delight(element) {
      this.play(element, 'delight');
    },

    // Interest - Unexpected content (new section scroll)
    interest(element) {
      this.play(element, 'interest');
    },

    // Concern - Before empathy (on concerning content)
    concern(element) {
      this.play(element, 'concern');
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE LISTENING - Empathetic Nodding
  // Shows moment-to-moment presence
  // ═══════════════════════════════════════════════════════════════════════════

  const ActiveListening = {
    isListening: false,
    orbElement: null,

    start(orb) {
      if (!orb || respectsReducedMotion()) return;
      this.orbElement = orb;
      this.isListening = true;
      orb.classList.add('eq-listening');
    },

    // Nod response based on pause duration
    nod(pauseDuration) {
      if (!this.orbElement || !this.isListening) return;

      this.orbElement.classList.remove('eq-listening', 'eq-listening-engaged', 'eq-listening-deep');

      if (pauseDuration < 800) {
        this.orbElement.classList.add('eq-listening');
      } else if (pauseDuration < 1500) {
        this.orbElement.classList.add('eq-listening-engaged');
      } else {
        this.orbElement.classList.add('eq-listening-deep');
      }
    },

    leanIn() {
      if (!this.orbElement) return;
      this.orbElement.classList.add('eq-lean-in');
      setTimeout(() => {
        this.orbElement?.classList.remove('eq-lean-in');
      }, EQ.listening.leanIn + 100);
    },

    stop() {
      if (!this.orbElement) return;
      this.isListening = false;
      this.orbElement.classList.remove(
        'eq-listening',
        'eq-listening-engaged',
        'eq-listening-deep',
        'eq-lean-in'
      );
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ORB STATE MANAGEMENT
  // Controls breathing, awareness, and emotional states
  // ═══════════════════════════════════════════════════════════════════════════

  const OrbState = {
    element: null,
    currentState: 'idle',
    states: ['idle', 'aware', 'engaged', 'listening'],

    init(orb) {
      if (!orb) return;
      this.element = orb;
      this.setState('idle');
    },

    setState(state) {
      if (!this.element || !this.states.includes(state)) return;

      // Remove all state classes
      this.states.forEach((s) => {
        this.element.classList.remove(`orb-${s}`);
      });

      // Add new state
      this.element.classList.add(`orb-${state}`);
      this.currentState = state;
    },

    // Upgrade state based on interaction depth
    upgrade() {
      const stateIndex = this.states.indexOf(this.currentState);
      if (stateIndex < this.states.length - 1) {
        this.setState(this.states[stateIndex + 1]);
      }
    },

    // Downgrade to calmer state
    calm() {
      const stateIndex = this.states.indexOf(this.currentState);
      if (stateIndex > 0) {
        this.setState(this.states[stateIndex - 1]);
      }
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // BREATHING ELEMENTS
  // Everything alive has rhythm
  // ═══════════════════════════════════════════════════════════════════════════

  function initBreathing() {
    // Create organic breathing timing (not perfectly mechanical)
    const breathingElements = document.querySelectorAll('[data-breathe]');

    breathingElements.forEach((el, i) => {
      // Each element breathes at slightly different rate (organic variation)
      const baseRate = 4000; // 4 seconds base
      const variation = Math.random() * 1000 - 500; // ±500ms
      const rate = baseRate + variation;
      const delay = i * 200; // Stagger

      el.style.setProperty('--breath-rate', `${rate}ms`);
      el.style.setProperty('--breath-delay', `${delay}ms`);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL REVEAL WITH MA (間)
  // The pause between elements gives meaning
  // ═══════════════════════════════════════════════════════════════════════════

  function initScrollReveal() {
    const reveals = document.querySelectorAll('.reveal');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Add small random delay for organic feeling
            const organicDelay = Math.random() * 100;
            setTimeout(() => {
              entry.target.classList.add('visible');
            }, organicDelay);
            // Stop observing after revealed
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '50px 0px 0px 0px', // Trigger slightly before element enters viewport
      }
    );

    // Small delay to let CSS apply first
    requestAnimationFrame(() => {
      reveals.forEach((el) => observer.observe(el));
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAGNETIC BUTTONS
  // Elements that seem aware of your presence
  // ═══════════════════════════════════════════════════════════════════════════

  function initMagneticButtons() {
    const magnetics = document.querySelectorAll('.btn-magnetic, [data-magnetic]');

    magnetics.forEach((btn) => {
      let bounds;

      const onMouseEnter = () => {
        bounds = btn.getBoundingClientRect();
      };

      const onMouseMove = (e) => {
        if (!bounds) return;

        const x = e.clientX - bounds.left - bounds.width / 2;
        const y = e.clientY - bounds.top - bounds.height / 2;

        // Subtle magnetic pull
        const strength = 0.15;
        btn.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      };

      const onMouseLeave = () => {
        btn.style.transform = '';
        btn.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        setTimeout(() => {
          btn.style.transition = '';
        }, 500);
      };

      btn.addEventListener('mouseenter', onMouseEnter);
      btn.addEventListener('mousemove', onMouseMove);
      btn.addEventListener('mouseleave', onMouseLeave);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CURSOR AWARENESS - The Orb "Sees" You
  // Creates the feeling of being noticed and understood
  // ═══════════════════════════════════════════════════════════════════════════

  function initOrbAwareness() {
    const orb = document.querySelector('[data-orb-aware]');
    const heroOrb = document.querySelector('[data-hero-orb]');
    const targetOrb = orb || heroOrb;

    if (!targetOrb) return;

    // Initialize orb state
    OrbState.init(targetOrb);

    let orbBounds;
    let ticking = false;
    let lastMouseTime = Date.now();
    let isNearOrb = false;
    let hasInteracted = false;

    const updateOrb = (mouseX, mouseY) => {
      if (!orbBounds) orbBounds = targetOrb.getBoundingClientRect();

      const orbCenterX = orbBounds.left + orbBounds.width / 2;
      const orbCenterY = orbBounds.top + orbBounds.height / 2;

      const deltaX = mouseX - orbCenterX;
      const deltaY = mouseY - orbCenterY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Track if user is near the orb
      const wasNearOrb = isNearOrb;
      isNearOrb = distance < 300;

      // Upgrade state when user approaches
      if (isNearOrb && !wasNearOrb) {
        OrbState.upgrade();

        // Micro-expression on approach (if first time)
        if (!hasInteracted) {
          MicroExpressions.recognition(targetOrb);
          hasInteracted = true;
        }
      }

      // Calm down when user moves away
      if (!isNearOrb && wasNearOrb) {
        setTimeout(() => {
          if (!isNearOrb) OrbState.calm();
        }, 1000);
      }

      // Cursor following with easing
      if (distance < 500) {
        // Closer = stronger following (up to 8% of distance)
        const strength = Math.max(0, (500 - distance) / 500) * 0.08;
        const moveX = deltaX * strength;
        const moveY = deltaY * strength;

        // Add subtle tilt based on position
        const tiltX = (deltaY / 500) * 3;
        const tiltY = -(deltaX / 500) * 3;

        targetOrb.style.transform = `translate(${moveX}px, ${moveY}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
        targetOrb.classList.add('cursor-aware');
      } else {
        targetOrb.style.transform = '';
        targetOrb.classList.remove('cursor-aware');
      }

      lastMouseTime = Date.now();
    };

    // Mouse following
    window.addEventListener('mousemove', (e) => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateOrb(e.clientX, e.clientY);
          ticking = false;
        });
        ticking = true;
      }
    });

    // Recalculate bounds on scroll
    window.addEventListener(
      'scroll',
      () => {
        orbBounds = null;
      },
      { passive: true }
    );

    // Warmth pulse when orb is clicked
    targetOrb.addEventListener('click', () => {
      MicroExpressions.warmth(targetOrb);
      OrbState.setState('engaged');
    });

    // Reset transform when mouse leaves viewport
    document.addEventListener('mouseleave', () => {
      targetOrb.style.transform = '';
      targetOrb.classList.remove('cursor-aware');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL-TRIGGERED EQ RESPONSES
  // The orb responds to how you navigate the page
  // ═══════════════════════════════════════════════════════════════════════════

  function initScrollEQ() {
    const orb = document.querySelector('[data-orb-aware], [data-hero-orb]');
    if (!orb || respectsReducedMotion()) return;

    let lastScrollY = window.scrollY;
    let lastScrollTime = Date.now();
    let scrollPauseTimer = null;
    let lastSectionIndex = -1;

    const sections = document.querySelectorAll('section');

    const handleScroll = () => {
      const now = Date.now();
      const currentScrollY = window.scrollY;
      const scrollDelta = Math.abs(currentScrollY - lastScrollY);
      const timeDelta = now - lastScrollTime;
      const scrollSpeed = scrollDelta / timeDelta;

      // Clear pause timer
      if (scrollPauseTimer) {
        clearTimeout(scrollPauseTimer);
      }

      // Fast scroll - show anticipation
      if (scrollSpeed > 3) {
        orb.setAttribute('data-scroll-aware', 'fast');
      } else {
        orb.removeAttribute('data-scroll-aware');
      }

      // Detect section change (interest micro-expression)
      let currentSectionIndex = -1;
      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        if (rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2) {
          currentSectionIndex = index;
        }
      });

      if (currentSectionIndex !== lastSectionIndex && currentSectionIndex >= 0) {
        MicroExpressions.interest(orb);
        lastSectionIndex = currentSectionIndex;
      }

      // Set up pause detection
      scrollPauseTimer = setTimeout(() => {
        orb.setAttribute('data-scroll-aware', 'pause');
        MicroExpressions.warmth(orb);

        // Clear after animation
        setTimeout(() => {
          orb.removeAttribute('data-scroll-aware');
        }, 500);
      }, EQ.scroll.pauseDelay);

      lastScrollY = currentScrollY;
      lastScrollTime = now;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE CTA VISIBILITY
  // Shows after scrolling past hero section
  // ═══════════════════════════════════════════════════════════════════════════

  function initMobileCTA() {
    const mobileCTA = document.querySelector('.mobile-cta');
    const hero = document.querySelector('[data-hero-section], .hero, section:first-of-type');

    if (!mobileCTA || !hero) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Show CTA when hero is not visible (scrolled past)
          if (entry.isIntersecting) {
            mobileCTA.classList.remove('visible');
          } else {
            mobileCTA.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(hero);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BACK TO TOP BUTTON
  // Shows after scrolling down
  // ═══════════════════════════════════════════════════════════════════════════

  function initBackToTop() {
    const btn = document.querySelector('[data-back-to-top]');
    if (!btn) return;

    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (window.scrollY > window.innerHeight * 0.5) {
            btn.classList.add('visible');
          } else {
            btn.classList.remove('visible');
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    btn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

      // Warmth pulse on the hero orb when returning
      const orb = document.querySelector('[data-orb-aware], [data-hero-orb]');
      if (orb) {
        setTimeout(() => {
          MicroExpressions.recognition(orb);
        }, 500);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SMOOTH SCROLL WITH EASING
  // Natural physics, not mechanical
  // ═══════════════════════════════════════════════════════════════════════════

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (!target) return;

        const targetPosition = target.getBoundingClientRect().top + window.scrollY - 100;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth',
        });
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NAV SCROLL BEHAVIOR
  // Appears when needed, fades when not
  // ═══════════════════════════════════════════════════════════════════════════

  function initNavBehavior() {
    const nav = document.getElementById('nav');
    const navBg = document.getElementById('nav-bg');
    if (!nav) return;

    let lastScroll = 0;
    let ticking = false;

    const updateNav = () => {
      const currentScroll = window.scrollY;

      // Background appears after scrolling
      if (currentScroll > 50) {
        navBg?.classList.add('opacity-100');
        navBg?.classList.remove('opacity-0');
      } else {
        navBg?.classList.add('opacity-0');
        navBg?.classList.remove('opacity-100');
      }

      lastScroll = currentScroll;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateNav();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOVER MICRO-EXPRESSIONS
  // Cards and elements that "perk up" when noticed
  // ═══════════════════════════════════════════════════════════════════════════

  function initMicroExpressions() {
    const expressiveElements = document.querySelectorAll('[data-expressive]');

    expressiveElements.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        // Subtle "perking up" animation
        el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      });

      el.addEventListener('mouseleave', () => {
        // Slower settle back
        el.style.transition = 'transform 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)';
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RETURNING VISITOR MEMORY
  // Subtle acknowledgment of return visits
  // ═══════════════════════════════════════════════════════════════════════════

  function initVisitorMemory() {
    const hasVisited = localStorage.getItem('ferni_visited');
    const visitCount = parseInt(localStorage.getItem('ferni_visit_count') || '0', 10) + 1;

    localStorage.setItem('ferni_visited', 'true');
    localStorage.setItem('ferni_visit_count', visitCount.toString());

    if (hasVisited) {
      document.documentElement.setAttribute('data-returning', 'true');

      // Could use this to show subtle "welcome back" elements
      if (visitCount > 3) {
        document.documentElement.setAttribute('data-frequent', 'true');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARALLAX WITH RESTRAINT
  // Subtle depth, not overwhelming
  // ═══════════════════════════════════════════════════════════════════════════

  function initParallax() {
    const parallaxElements = document.querySelectorAll('[data-parallax]');
    if (!parallaxElements.length) return;

    let ticking = false;

    const updateParallax = () => {
      const scrollY = window.scrollY;

      parallaxElements.forEach((el) => {
        const speed = parseFloat(el.dataset.parallax) || 0.1;
        const yPos = scrollY * speed;
        el.style.transform = `translateY(${yPos}px)`;
      });
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateParallax();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REDUCED MOTION RESPECT
  // Care for all users
  // ═══════════════════════════════════════════════════════════════════════════

  function respectsReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL PROGRESS INDICATOR
  // Visual feedback of reading progress
  // ═══════════════════════════════════════════════════════════════════════════

  function initScrollProgress() {
    // Create progress bar element
    const progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    progressBar.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--color-ferni, #4a6741), var(--color-peter, #3a6b73));
      width: 0%;
      z-index: 9999;
      transition: width 0.1s ease-out;
    `;
    document.body.appendChild(progressBar);

    let ticking = false;

    const updateProgress = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollTop = window.scrollY;
      const progress = (scrollTop / scrollHeight) * 100;
      progressBar.style.width = `${Math.min(progress, 100)}%`;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateProgress();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE LOAD ORCHESTRATION
  // Cinematic reveal sequence
  // ═══════════════════════════════════════════════════════════════════════════

  function initPageLoadAnimation() {
    // Only run on homepage - skip for other pages like /building/
    const isHomepage = window.location.pathname === '/' || window.location.pathname === '/index.html';
    if (!isHomepage) return;

    // Elements to animate in sequence (homepage hero only)
    const heroElements = [
      { selector: '[data-orb-aware]', delay: 0, animation: 'fade-scale' },
      { selector: '.text-eyebrow', delay: 200, animation: 'fade-up' },
      { selector: '.hero h1', delay: 400, animation: 'fade-up' },
      { selector: '.text-body-xl', delay: 600, animation: 'fade-up' },
      { selector: '.btn-magnetic', delay: 800, animation: 'fade-up' },
    ];

    // Hide elements initially
    heroElements.forEach(({ selector }) => {
      const el = document.querySelector(selector);
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
      }
    });

    // Animate in sequence
    heroElements.forEach(({ selector, delay, animation }) => {
      const el = document.querySelector(selector);
      if (!el) return;

      setTimeout(() => {
        el.style.transition =
          'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
        el.style.opacity = '1';
        el.style.transform = animation === 'fade-scale' ? 'scale(1)' : 'translateY(0)';
      }, delay);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA BREATHING ANIMATIONS
  // Each persona breathes at their own rhythm
  // ═══════════════════════════════════════════════════════════════════════════

  function initPersonaBreathing() {
    const personaOrbs = document.querySelectorAll('.persona-orb');

    const breathRates = {
      ferni: 4000, // Calm, grounded
      peter: 3500, // Energetic, curious
      alex: 4200, // Thoughtful
      maya: 3800, // Nurturing rhythm
      jordan: 3200, // Celebratory energy
      nayan: 5000, // Sage-like slowness
    };

    personaOrbs.forEach((orb) => {
      // Get persona from closest element with data-persona or class
      const card = orb.closest('[style*="--persona-glow"]');
      if (!card) return;

      // Determine persona from glow color
      const glowStyle = card.getAttribute('style') || '';
      let rate = 4000; // default

      if (glowStyle.includes('74, 103, 65')) rate = breathRates.ferni;
      else if (glowStyle.includes('58, 107, 115')) rate = breathRates.peter;
      else if (glowStyle.includes('90, 107, 138')) rate = breathRates.alex;
      else if (glowStyle.includes('166, 122, 106')) rate = breathRates.maya;
      else if (glowStyle.includes('196, 133, 106')) rate = breathRates.jordan;
      else if (glowStyle.includes('138, 122, 106')) rate = breathRates.nayan;

      // Apply custom animation timing
      orb.style.animationDuration = `${rate}ms`;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA HOVER MICRO-EXPRESSIONS
  // Each persona orb responds with recognition when noticed
  // ═══════════════════════════════════════════════════════════════════════════

  function initPersonaMicroExpressions() {
    const personaOrbs = document.querySelectorAll('[data-persona-orb], .persona-orb');

    personaOrbs.forEach((orb) => {
      orb.addEventListener('mouseenter', () => {
        MicroExpressions.recognition(orb);
      });

      orb.addEventListener('click', () => {
        MicroExpressions.delight(orb);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARD HOVER EQ RESPONSES
  // Cards that "perk up" when noticed
  // ═══════════════════════════════════════════════════════════════════════════

  function initCardEQ() {
    const cards = document.querySelectorAll(
      '.card, .persona-card, .team-card, .feature-card, [data-expressive]'
    );

    cards.forEach((card) => {
      card.addEventListener('mouseenter', () => {
        // Random chance of micro-expression
        if (Math.random() < 0.3) {
          MicroExpressions.interest(card);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WAVEFORM STATE MANAGEMENT
  // Controls waveform animation states
  // ═══════════════════════════════════════════════════════════════════════════

  function initWaveformStates() {
    const waveforms = document.querySelectorAll('[data-waveform], .waveform-container');

    waveforms.forEach((waveform) => {
      // Default to idle state
      waveform.classList.add('waveform-idle');

      // Upgrade to listening on hover
      const parent = waveform.closest('[data-orb-aware], [data-hero-orb], .voice-orb');
      if (parent) {
        parent.addEventListener('mouseenter', () => {
          waveform.classList.remove('waveform-idle');
          waveform.classList.add('waveform-listening');
        });

        parent.addEventListener('mouseleave', () => {
          waveform.classList.remove('waveform-listening');
          waveform.classList.add('waveform-idle');
        });

        // Click triggers speaking state briefly
        parent.addEventListener('click', () => {
          waveform.classList.remove('waveform-idle', 'waveform-listening');
          waveform.classList.add('waveform-speaking');

          setTimeout(() => {
            waveform.classList.remove('waveform-speaking');
            waveform.classList.add('waveform-thinking');

            setTimeout(() => {
              waveform.classList.remove('waveform-thinking');
              waveform.classList.add('waveform-idle');
            }, 2000);
          }, 800);
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FAQ SECTION - Auto-open on scroll visibility
  // ═══════════════════════════════════════════════════════════════════════════

  function initFAQEnhancements() {
    const faqItems = document.querySelectorAll('.faq-item, details');

    // Close others when one opens
    faqItems.forEach((item) => {
      item.addEventListener('toggle', (e) => {
        if (e.target.open) {
          faqItems.forEach((other) => {
            if (other !== e.target && other.open) {
              other.open = false;
            }
          });
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE EVERYTHING
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    // Core functionality (always runs)
    initTimeAwareness();
    initVisitorMemory();
    initScrollReveal();
    initSmoothScroll();
    initNavBehavior();
    initMobileCTA();
    initBackToTop();
    initFAQEnhancements();

    // Motion-dependent features
    if (!respectsReducedMotion()) {
      initBreathing();
      initMagneticButtons();
      initOrbAwareness();
      initScrollEQ();
      initMicroExpressions();
      initParallax();
      initScrollProgress();
      initPageLoadAnimation();
      initPersonaBreathing();
      initPersonaMicroExpressions();
      initCardEQ();
      initWaveformStates();
    }

    // Add loaded class for CSS animations
    document.documentElement.classList.add('loaded');

    // Expose EQ system for debugging/extensions
    window.FerniEQ = {
      MicroExpressions,
      ActiveListening,
      OrbState,
      greeting: window.ferniGreeting,
      timeOfDay: window.ferniTimeOfDay,
    };

    // Console branding
    console.log('%c🌿 Ferni', 'color: #4a6741; font-size: 24px; font-weight: bold;');
    console.log('%cBetter than human.', 'color: #5c544a; font-size: 14px;');
    console.log('%c5 Superhuman Capabilities Active:', 'color: #756a5e; font-size: 11px;');
    console.log('%c  1. Micro-Expressions (subliminal trust)', 'color: #756a5e; font-size: 10px;');
    console.log(
      '%c  2. Active Listening (empathetic presence)',
      'color: #756a5e; font-size: 10px;'
    );
    console.log('%c  3. Breath Sync (neural mirroring)', 'color: #756a5e; font-size: 10px;');
    console.log('%c  4. Concern Detection (guardian presence)', 'color: #756a5e; font-size: 10px;');
    console.log('%c  5. Anticipation (reading the future)', 'color: #756a5e; font-size: 10px;');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
