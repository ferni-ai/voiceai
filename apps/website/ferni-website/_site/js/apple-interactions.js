/**
 * Apple-Level Interactions - Ferni
 * =================================
 * World-class micro-interactions that make users fall in love.
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // 3D CARD TILT EFFECT
  // Cards that respond to mouse position with perspective
  // ═══════════════════════════════════════════════════════════════════════════

  function init3DCards() {
    const cards = document.querySelectorAll('[data-tilt]');
    
    cards.forEach(card => {
      const maxTilt = parseFloat(card.dataset.tiltMax) || 8;
      const scale = parseFloat(card.dataset.tiltScale) || 1.02;
      const perspective = parseFloat(card.dataset.tiltPerspective) || 1000;
      
      card.style.transformStyle = 'preserve-3d';
      card.style.transition = 'transform 0.15s ease-out';
      
      card.addEventListener('mouseenter', () => {
        card.style.transition = 'transform 0.15s ease-out';
      });
      
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const percentX = (e.clientX - centerX) / (rect.width / 2);
        const percentY = (e.clientY - centerY) / (rect.height / 2);
        
        const rotateY = percentX * maxTilt;
        const rotateX = -percentY * maxTilt;
        
        card.style.transform = `
          perspective(${perspective}px) 
          rotateX(${rotateX}deg) 
          rotateY(${rotateY}deg) 
          scale3d(${scale}, ${scale}, ${scale})
        `;
      });
      
      card.addEventListener('mouseleave', () => {
        card.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAGNETIC BUTTONS
  // Buttons that subtly follow cursor movement
  // ═══════════════════════════════════════════════════════════════════════════

  function initMagneticElements() {
    const magnetics = document.querySelectorAll('[data-magnetic]');
    
    magnetics.forEach(el => {
      const strength = parseFloat(el.dataset.magneticStrength) || 0.3;
      let bounds;
      
      el.style.transition = 'transform 0.2s ease-out';
      
      el.addEventListener('mouseenter', () => {
        bounds = el.getBoundingClientRect();
        el.style.transition = 'transform 0.1s ease-out';
      });
      
      el.addEventListener('mousemove', (e) => {
        if (!bounds) return;
        
        const x = e.clientX - bounds.left - bounds.width / 2;
        const y = e.clientY - bounds.top - bounds.height / 2;
        
        el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      
      el.addEventListener('mouseleave', () => {
        el.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        el.style.transform = 'translate(0, 0)';
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUTTON RIPPLE EFFECT
  // Material Design-inspired ripple on click
  // ═══════════════════════════════════════════════════════════════════════════

  function initRippleEffect() {
    const buttons = document.querySelectorAll('[data-ripple]');
    
    buttons.forEach(btn => {
      btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      
      btn.addEventListener('click', function(e) {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const ripple = document.createElement('span');
        ripple.style.cssText = `
          position: absolute;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.4);
          transform: translate(-50%, -50%);
          pointer-events: none;
          left: ${x}px;
          top: ${y}px;
        `;
        
        btn.appendChild(ripple);
        
        // Animate
        requestAnimationFrame(() => {
          ripple.style.transition = 'width 0.6s ease-out, height 0.6s ease-out, opacity 0.6s ease-out';
          ripple.style.width = '400px';
          ripple.style.height = '400px';
          ripple.style.opacity = '0';
        });
        
        // Cleanup
        setTimeout(() => ripple.remove(), 600);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL-LINKED PARALLAX
  // Smooth parallax effects tied to scroll position
  // ═══════════════════════════════════════════════════════════════════════════

  function initParallax() {
    const parallaxElements = document.querySelectorAll('[data-parallax]');
    if (!parallaxElements.length) return;
    
    let ticking = false;
    
    const updateParallax = () => {
      parallaxElements.forEach(el => {
        const speed = parseFloat(el.dataset.parallax) || 0.1;
        const rect = el.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const viewportCenter = window.innerHeight / 2;
        const offset = (centerY - viewportCenter) * speed;
        
        el.style.transform = `translateY(${offset}px)`;
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
    }, { passive: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SMART HEADER (Hide on Scroll Down, Show on Scroll Up)
  // ═══════════════════════════════════════════════════════════════════════════

  function initSmartHeader() {
    const header = document.querySelector('[data-smart-header]');
    if (!header) return;
    
    let lastScroll = 0;
    let ticking = false;
    
    const updateHeader = () => {
      const currentScroll = window.scrollY;
      const headerHeight = header.offsetHeight;
      
      if (currentScroll <= 0) {
        // At top
        header.style.transform = 'translateY(0)';
        header.classList.remove('scrolled');
      } else if (currentScroll > lastScroll && currentScroll > headerHeight) {
        // Scrolling down
        header.style.transform = 'translateY(-100%)';
      } else {
        // Scrolling up
        header.style.transform = 'translateY(0)';
        header.classList.add('scrolled');
      }
      
      lastScroll = currentScroll;
    };
    
    header.style.transition = 'transform 0.3s ease-out';
    
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateHeader();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE SECTION HIGHLIGHTING
  // Highlights nav links based on scroll position
  // ═══════════════════════════════════════════════════════════════════════════

  function initActiveSectionHighlight() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('[data-nav-link]');
    
    if (!sections.length || !navLinks.length) return;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          
          navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${id}`) {
              link.classList.add('active');
            }
          });
        }
      });
    }, {
      threshold: 0.3,
      rootMargin: '-20% 0px -60% 0px'
    });
    
    sections.forEach(section => observer.observe(section));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL REVEAL WITH STAGGER
  // Elements fade in as they enter viewport with stagger
  // ═══════════════════════════════════════════════════════════════════════════

  function initScrollReveal() {
    const reveals = document.querySelectorAll('[data-reveal]');
    if (!reveals.length) return;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const delay = parseInt(el.dataset.revealDelay) || 0;
          
          setTimeout(() => {
            el.classList.add('revealed');
          }, delay);
          
          observer.unobserve(el);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });
    
    reveals.forEach(el => observer.observe(el));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFETTI CELEBRATION
  // Particle burst on success actions
  // ═══════════════════════════════════════════════════════════════════════════

  function createConfetti(container, count = 50) {
    const colors = ['#4a6741', '#3a6b73', '#a67a6a', '#c4856a', '#5a6b8a'];
    
    for (let i = 0; i < count; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti-piece';
      confetti.style.cssText = `
        position: absolute;
        width: ${Math.random() * 10 + 5}px;
        height: ${Math.random() * 10 + 5}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        left: ${50 + (Math.random() - 0.5) * 40}%;
        top: 50%;
        border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
        animation: confettiFall ${0.8 + Math.random() * 0.4}s ease-out forwards;
        animation-delay: ${Math.random() * 0.2}s;
        transform: rotate(${Math.random() * 360}deg);
      `;
      
      // Random horizontal drift
      confetti.style.setProperty('--drift', `${(Math.random() - 0.5) * 200}px`);
      
      container.appendChild(confetti);
      
      // Cleanup
      setTimeout(() => confetti.remove(), 1500);
    }
  }

  // Export for use
  window.ferniConfetti = createConfetti;

  // ═══════════════════════════════════════════════════════════════════════════
  // LAZY LOADING WITH BLUR-UP
  // Images load with blur placeholder effect
  // ═══════════════════════════════════════════════════════════════════════════

  function initLazyImages() {
    const images = document.querySelectorAll('[data-lazy-src]');
    
    images.forEach(img => {
      // Add blur while loading
      img.style.filter = 'blur(10px)';
      img.style.transition = 'filter 0.5s ease-out';
      
      const actualSrc = img.dataset.lazySrc;
      
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Load the real image
            const tempImg = new Image();
            tempImg.onload = () => {
              img.src = actualSrc;
              img.style.filter = 'blur(0)';
            };
            tempImg.src = actualSrc;
            
            observer.unobserve(img);
          }
        });
      }, { rootMargin: '50px' });
      
      observer.observe(img);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT TYPING ANIMATION
  // Typewriter effect for hero text
  // ═══════════════════════════════════════════════════════════════════════════

  function initTypingEffect() {
    const typingElements = document.querySelectorAll('[data-typing]');
    
    typingElements.forEach(el => {
      const text = el.textContent;
      const speed = parseInt(el.dataset.typingSpeed) || 50;
      const delay = parseInt(el.dataset.typingDelay) || 0;
      
      el.textContent = '';
      el.style.borderRight = '2px solid currentColor';
      
      setTimeout(() => {
        let i = 0;
        const typeChar = () => {
          if (i < text.length) {
            el.textContent += text.charAt(i);
            i++;
            setTimeout(typeChar, speed);
          } else {
            // Remove cursor after typing
            setTimeout(() => {
              el.style.borderRight = 'none';
            }, 1000);
          }
        };
        typeChar();
      }, delay);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SMOOTH SCROLL WITH OFFSET
  // Scroll to sections accounting for fixed header
  // ═══════════════════════════════════════════════════════════════════════════

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        const target = document.querySelector(href);
        if (!target) return;
        
        e.preventDefault();
        
        const header = document.querySelector('[data-smart-header]');
        const headerHeight = header ? header.offsetHeight : 0;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BACK TO TOP BUTTON
  // Smooth scroll back to top
  // ═══════════════════════════════════════════════════════════════════════════

  function initBackToTop() {
    const btn = document.querySelector('[data-back-to-top]');
    if (!btn) return;
    
    btn.style.opacity = '0';
    btn.style.transform = 'translateY(20px)';
    btn.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    
    window.addEventListener('scroll', () => {
      if (window.scrollY > 500) {
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(0)';
      } else {
        btn.style.opacity = '0';
        btn.style.transform = 'translateY(20px)';
      }
    }, { passive: true });
    
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EASTER EGG: Konami Code
  // Secret reward for power users
  // ═══════════════════════════════════════════════════════════════════════════

  function initEasterEggs() {
    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    let konamiIndex = 0;
    
    document.addEventListener('keydown', (e) => {
      if (e.code === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
          // Easter egg activated!
          document.body.style.transition = 'filter 1s ease';
          document.body.style.filter = 'hue-rotate(180deg)';
          
          setTimeout(() => {
            document.body.style.filter = 'none';
          }, 3000);
          
          // Create confetti
          if (window.ferniConfetti) {
            window.ferniConfetti(document.body, 100);
          }
          
          console.log('%c🌿 You found the secret! You\'re part of the Ferni family now.', 
            'color: #4a6741; font-size: 16px; font-weight: bold;');
          
          konamiIndex = 0;
        }
      } else {
        konamiIndex = 0;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE ALL INTERACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    // Skip heavy animations if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (!prefersReducedMotion) {
      init3DCards();
      initMagneticElements();
      initRippleEffect();
      initParallax();
      initScrollReveal();
      initLazyImages();
      initTypingEffect();
    }
    
    // These work regardless of motion preference
    initSmartHeader();
    initActiveSectionHighlight();
    initSmoothScroll();
    initBackToTop();
    initEasterEggs();
    
    console.log('%c✨ Apple-level interactions loaded', 'color: #4a6741; font-weight: bold;');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

