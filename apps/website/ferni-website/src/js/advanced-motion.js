/**
 * Advanced Motion - Ferni Landing Page
 * =====================================
 * GSAP-powered animations and parallax effects
 */

(function() {
  'use strict';

  // Check for GSAP
  const hasGSAP = typeof gsap !== 'undefined';

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL-LINKED PARALLAX
  // Multiple depth layers that move at different speeds
  // ═══════════════════════════════════════════════════════════════════════════

  function initParallaxLayers() {
    const layers = document.querySelectorAll('[data-parallax-layer]');
    if (!layers.length) return;

    let ticking = false;

    function updateLayers() {
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;

      layers.forEach(layer => {
        const speed = parseFloat(layer.dataset.parallaxLayer) || 0.1;
        const direction = layer.dataset.parallaxDirection || 'up';
        const rect = layer.getBoundingClientRect();
        
        // Only animate when in viewport
        if (rect.bottom < 0 || rect.top > viewportHeight) return;

        const offset = scrollY * speed;
        const y = direction === 'down' ? offset : -offset;
        
        layer.style.transform = `translate3d(0, ${y}px, 0)`;
      });
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateLayers();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GSAP SCROLL TRIGGER ANIMATIONS
  // Section reveals, pin effects, and timeline animations
  // ═══════════════════════════════════════════════════════════════════════════

  function initGSAPAnimations() {
    if (!hasGSAP || typeof ScrollTrigger === 'undefined') {
      console.log('GSAP/ScrollTrigger not loaded, using fallback animations');
      initFallbackAnimations();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    // Section reveal animations
    gsap.utils.toArray('[data-gsap-reveal]').forEach(section => {
      const direction = section.dataset.gsapReveal || 'up';
      const fromY = direction === 'up' ? 100 : direction === 'down' ? -100 : 0;
      const fromX = direction === 'left' ? -100 : direction === 'right' ? 100 : 0;

      gsap.from(section, {
        y: fromY,
        x: fromX,
        opacity: 0,
        duration: 1.2,
        ease: 'expo.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 80%',
          end: 'bottom 20%',
          toggleActions: 'play none none reverse'
        }
      });
    });

    // Staggered children animations
    gsap.utils.toArray('[data-gsap-stagger]').forEach(container => {
      const children = container.children;
      const stagger = parseFloat(container.dataset.gsapStagger) || 0.1;

      gsap.from(children, {
        y: 60,
        opacity: 0,
        duration: 0.8,
        ease: 'expo.out',
        stagger: stagger,
        scrollTrigger: {
          trigger: container,
          start: 'top 75%'
        }
      });
    });

    // Scale-in animations
    gsap.utils.toArray('[data-gsap-scale]').forEach(el => {
      gsap.from(el, {
        scale: 0.8,
        opacity: 0,
        duration: 1,
        ease: 'back.out(1.7)',
        scrollTrigger: {
          trigger: el,
          start: 'top 80%'
        }
      });
    });

    // Text split animations
    gsap.utils.toArray('[data-gsap-text]').forEach(text => {
      const chars = text.textContent.split('');
      text.innerHTML = chars.map(char => 
        `<span class="gsap-char" style="display:inline-block">${char === ' ' ? '&nbsp;' : char}</span>`
      ).join('');

      gsap.from(text.querySelectorAll('.gsap-char'), {
        y: 50,
        opacity: 0,
        duration: 0.5,
        ease: 'back.out(2)',
        stagger: 0.02,
        scrollTrigger: {
          trigger: text,
          start: 'top 80%'
        }
      });
    });

    // Pin sections (sticky scroll)
    gsap.utils.toArray('[data-gsap-pin]').forEach(section => {
      ScrollTrigger.create({
        trigger: section,
        pin: true,
        start: 'top top',
        end: '+=100%',
        pinSpacing: true
      });
    });

    // Progress-linked animations
    gsap.utils.toArray('[data-gsap-progress]').forEach(el => {
      gsap.to(el, {
        x: '100%',
        ease: 'none',
        scrollTrigger: {
          trigger: el.parentElement,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1
        }
      });
    });
  }

  // Fallback for when GSAP isn't available
  function initFallbackAnimations() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('[data-gsap-reveal], [data-gsap-scale]').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(40px)';
      el.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      observer.observe(el);
    });

    // Add CSS for animation
    const style = document.createElement('style');
    style.textContent = `
      .animate-in {
        opacity: 1 !important;
        transform: translateY(0) !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE TRANSITION ANIMATIONS
  // Smooth transitions between pages
  // ═══════════════════════════════════════════════════════════════════════════

  function initPageTransitions() {
    // Add transition overlay
    const overlay = document.createElement('div');
    overlay.className = 'page-transition-overlay';
    overlay.innerHTML = `
      <div class="transition-content">
        <div class="transition-logo"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Intercept internal links
    document.querySelectorAll('a[href^="/"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        
        // Skip for anchors and external links
        if (href.startsWith('#') || href.startsWith('http')) return;
        
        e.preventDefault();
        
        // Animate out
        overlay.classList.add('active');
        
        setTimeout(() => {
          window.location.href = href;
        }, 500);
      });
    });

    // Animate in on page load
    window.addEventListener('load', () => {
      document.body.classList.add('page-loaded');
      overlay.classList.remove('active');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SKELETON LOADING STATES
  // Branded loading placeholders
  // ═══════════════════════════════════════════════════════════════════════════

  function initSkeletonLoading() {
    // Replace loading elements with skeleton
    document.querySelectorAll('[data-skeleton]').forEach(el => {
      const type = el.dataset.skeleton;
      const skeleton = createSkeleton(type);
      el.appendChild(skeleton);
      
      // Remove skeleton when content loads
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          if (mutation.addedNodes.length > 0) {
            skeleton.remove();
            observer.disconnect();
          }
        });
      });
      observer.observe(el, { childList: true });
    });
  }

  function createSkeleton(type) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-wrapper';
    
    switch(type) {
      case 'card':
        skeleton.innerHTML = `
          <div class="skeleton skeleton-image" style="height:200px;border-radius:1rem;margin-bottom:1rem;"></div>
          <div class="skeleton skeleton-text" style="width:60%;height:1.5rem;margin-bottom:0.5rem;"></div>
          <div class="skeleton skeleton-text" style="width:80%;height:1rem;margin-bottom:0.25rem;"></div>
          <div class="skeleton skeleton-text" style="width:70%;height:1rem;"></div>
        `;
        break;
      case 'avatar':
        skeleton.innerHTML = `
          <div class="skeleton" style="width:64px;height:64px;border-radius:50%;"></div>
        `;
        break;
      case 'text':
        skeleton.innerHTML = `
          <div class="skeleton skeleton-text" style="width:100%;height:1rem;margin-bottom:0.5rem;"></div>
          <div class="skeleton skeleton-text" style="width:80%;height:1rem;"></div>
        `;
        break;
      default:
        skeleton.innerHTML = `<div class="skeleton" style="width:100%;height:100%;"></div>`;
    }
    
    return skeleton;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MICRO-INTERACTIONS
  // Small delightful animations on interactive elements
  // ═══════════════════════════════════════════════════════════════════════════

  function initMicroInteractions() {
    // Button press effect
    document.querySelectorAll('button, .btn, [role="button"]').forEach(btn => {
      btn.addEventListener('mousedown', () => {
        btn.style.transform = 'scale(0.97)';
      });
      btn.addEventListener('mouseup', () => {
        btn.style.transform = '';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });

    // Link hover underline animation
    document.querySelectorAll('a:not(.btn):not([class*="btn"])').forEach(link => {
      if (link.querySelector('img') || link.querySelector('svg')) return;
      
      link.style.position = 'relative';
      link.style.display = 'inline-block';
      
      const underline = document.createElement('span');
      underline.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 1px;
        background: currentColor;
        transform: scaleX(0);
        transform-origin: right;
        transition: transform 0.3s ease;
      `;
      link.appendChild(underline);
      
      link.addEventListener('mouseenter', () => {
        underline.style.transformOrigin = 'left';
        underline.style.transform = 'scaleX(1)';
      });
      link.addEventListener('mouseleave', () => {
        underline.style.transformOrigin = 'right';
        underline.style.transform = 'scaleX(0)';
      });
    });

    // Checkbox/radio animations
    document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
      input.addEventListener('change', () => {
        input.style.transform = 'scale(1.2)';
        setTimeout(() => {
          input.style.transform = '';
        }, 150);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INJECT STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Page transition overlay */
      .page-transition-overlay {
        position: fixed;
        inset: 0;
        background: #faf8f5;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.4s ease, visibility 0.4s ease;
      }
      
      .page-transition-overlay.active {
        opacity: 1;
        visibility: visible;
      }
      
      .transition-logo {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #5a7751, #4a6741, #3d5a35);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-weight: bold;
        font-size: 1.5rem;
        animation: transitionPulse 1s ease-in-out infinite;
      }
      
      @keyframes transitionPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      
      /* Skeleton styles */
      .skeleton {
        background: linear-gradient(
          90deg,
          rgba(235, 230, 223, 1) 0%,
          rgba(245, 242, 237, 1) 50%,
          rgba(235, 230, 223, 1) 100%
        );
        background-size: 200% 100%;
        animation: skeletonShimmer 1.5s ease-in-out infinite;
        border-radius: 4px;
      }
      
      @keyframes skeletonShimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      
      /* Parallax layer will-change optimization */
      [data-parallax-layer] {
        will-change: transform;
      }
      
      /* GSAP char animation reset */
      .gsap-char {
        will-change: transform, opacity;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    injectStyles();
    
    if (!prefersReducedMotion) {
      initParallaxLayers();
      initGSAPAnimations();
      initPageTransitions();
      initMicroInteractions();
    }
    
    initSkeletonLoading();
    
    console.log('%c🎬 Advanced motion loaded', 'color: #4a6741; font-weight: bold;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

