/**
 * Better Than Human - Ferni Landing Page Interactions
 * 
 * Design Philosophy:
 * - The site should DEMONSTRATE, not just DESCRIBE
 * - Breathing, not static - everything feels alive
 * - Ma (間) - the purposeful pause
 * - Micro-expressions in the UI
 * - Contextual warmth
 */

(function() {
  'use strict';

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
    }
    
    // Make greeting available
    window.ferniGreeting = greeting;
  }
  
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
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
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
    }, {
      threshold: 0.1,
      rootMargin: '50px 0px 0px 0px' // Trigger slightly before element enters viewport
    });
    
    // Small delay to let CSS apply first
    requestAnimationFrame(() => {
      reveals.forEach(el => observer.observe(el));
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MAGNETIC BUTTONS
  // Elements that seem aware of your presence
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initMagneticButtons() {
    const magnetics = document.querySelectorAll('.btn-magnetic, [data-magnetic]');
    
    magnetics.forEach(btn => {
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
  // CURSOR AWARENESS
  // The orb seems to notice you
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initOrbAwareness() {
    const orb = document.querySelector('[data-orb-aware]');
    if (!orb) return;
    
    let orbBounds;
    let ticking = false;
    
    const updateOrb = (mouseX, mouseY) => {
      if (!orbBounds) orbBounds = orb.getBoundingClientRect();
      
      const orbCenterX = orbBounds.left + orbBounds.width / 2;
      const orbCenterY = orbBounds.top + orbBounds.height / 2;
      
      const deltaX = mouseX - orbCenterX;
      const deltaY = mouseY - orbCenterY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // Only react if cursor is within range
      if (distance < 500) {
        const strength = Math.max(0, (500 - distance) / 500) * 0.05;
        const moveX = deltaX * strength;
        const moveY = deltaY * strength;
        
        orb.style.transform = `translate(${moveX}px, ${moveY}px)`;
      } else {
        orb.style.transform = '';
      }
    };
    
    window.addEventListener('mousemove', (e) => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateOrb(e.clientX, e.clientY);
          ticking = false;
        });
        ticking = true;
      }
    });
    
    window.addEventListener('scroll', () => {
      orbBounds = null; // Recalculate on scroll
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SMOOTH SCROLL WITH EASING
  // Natural physics, not mechanical
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (!target) return;
        
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - 100;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
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
    
    expressiveElements.forEach(el => {
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
      
      parallaxElements.forEach(el => {
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
    // Elements to animate in sequence
    const heroElements = [
      { selector: '[data-orb-aware]', delay: 0, animation: 'fade-scale' },
      { selector: '.text-eyebrow', delay: 200, animation: 'fade-up' },
      { selector: 'h1', delay: 400, animation: 'fade-up' },
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
        el.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
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
      ferni: 4000,    // Calm, grounded
      peter: 3500,    // Energetic, curious
      alex: 4200,     // Thoughtful
      maya: 3800,     // Nurturing rhythm
      jordan: 3200,   // Celebratory energy
      nayan: 5000,    // Sage-like slowness
    };
    
    personaOrbs.forEach(orb => {
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
  // INITIALIZE EVERYTHING
  // ═══════════════════════════════════════════════════════════════════════════
  
  function init() {
    initTimeAwareness();
    initVisitorMemory();
    initScrollReveal();
    initSmoothScroll();
    initNavBehavior();
    
    // Skip motion-heavy features if user prefers reduced motion
    if (!respectsReducedMotion()) {
      initBreathing();
      initMagneticButtons();
      initOrbAwareness();
      initMicroExpressions();
      initParallax();
      initScrollProgress();
      initPageLoadAnimation();
      initPersonaBreathing();
    }
    
    // Add loaded class for CSS animations
    document.documentElement.classList.add('loaded');
    
    console.log('%c🌿 Ferni', 'color: #4a6741; font-size: 24px; font-weight: bold;');
    console.log('%cBetter than human.', 'color: #5c544a; font-size: 14px;');
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();

