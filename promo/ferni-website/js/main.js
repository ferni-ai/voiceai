/**
 * Ferni Landing Page - Interactive JavaScript
 * Built with performance and accessibility in mind
 */

(function() {
  'use strict';

  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Throttle function for scroll events
  function throttle(fn, wait) {
    let time = Date.now();
    return function(...args) {
      if ((time + wait - Date.now()) < 0) {
        fn.apply(this, args);
        time = Date.now();
      }
    };
  }

  // ============================================================================
  // PAGE LOADER
  // ============================================================================
  
  function initPageLoader() {
    const loader = $('#pageLoader');
    if (!loader) return;
    
    // Hide loader when page is ready
    const hideLoader = () => {
      loader.classList.add('loaded');
      document.body.style.overflow = '';
    };
    
    // Prevent scroll while loading
    document.body.style.overflow = 'hidden';
    
    // Hide after a short delay or when everything is loaded
    if (document.readyState === 'complete') {
      setTimeout(hideLoader, 300);
    } else {
      window.addEventListener('load', () => setTimeout(hideLoader, 300));
    }
    
    // Fallback: hide after 3 seconds max
    setTimeout(hideLoader, 3000);
  }

  // ============================================================================
  // MOBILE MENU
  // ============================================================================
  
  function initMobileMenu() {
    const hamburger = $('#hamburger');
    const mobileMenu = $('#mobileMenu');
    const mobileLinks = $$('.mobile-link');
    
    if (!hamburger || !mobileMenu) return;
    
    const toggleMenu = () => {
      const isOpen = mobileMenu.classList.contains('open');
      
      hamburger.classList.toggle('active');
      mobileMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', !isOpen);
      
      // Prevent body scroll when menu is open
      document.body.style.overflow = isOpen ? '' : 'hidden';
    };
    
    hamburger.addEventListener('click', toggleMenu);
    
    // Close menu when clicking a link
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        toggleMenu();
      }
    });
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================
  
  function initNavigation() {
    const nav = $('#nav');
    if (!nav) return;
    
    let lastScroll = 0;
    
    const handleScroll = throttle(() => {
      const currentScroll = window.scrollY;
      
      // Add scrolled class after 50px
      if (currentScroll > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
      
      // Hide nav on scroll down, show on scroll up (mobile behavior)
      if (window.innerWidth < 768) {
        if (currentScroll > lastScroll && currentScroll > 100) {
          nav.style.transform = 'translateY(-100%)';
        } else {
          nav.style.transform = 'translateY(0)';
        }
      }
      
      lastScroll = currentScroll;
    }, 16);
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Smooth scroll for anchor links
    $$('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        const target = $(href);
        if (target) {
          e.preventDefault();
          const offset = nav.offsetHeight + 20;
          const targetPosition = target.getBoundingClientRect().top + window.scrollY - offset;
          
          window.scrollTo({
            top: targetPosition,
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
          });
        }
      });
    });
  }

  // ============================================================================
  // REVEAL ANIMATIONS (Intersection Observer)
  // ============================================================================
  
  function initRevealAnimations() {
    if (prefersReducedMotion) {
      // Show all elements immediately if user prefers reduced motion
      $$('.reveal').forEach(el => el.classList.add('visible'));
      $$('.privacy-dark__header').forEach(el => el.classList.add('visible'));
      $$('.privacy-dark__card').forEach(el => el.classList.add('visible'));
      return;
    }
    
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -80px 0px',
      threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          // Unobserve after animation to save resources
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);
    
    // Observe standard reveal elements
    $$('.reveal').forEach(el => observer.observe(el));
    
    // Observe privacy dark section (Apple-style stagger)
    $$('.privacy-dark__header').forEach(el => observer.observe(el));
    $$('.privacy-dark__card').forEach(el => observer.observe(el));
  }

  // ============================================================================
  // COUNTER ANIMATION
  // ============================================================================
  
  function initCounters() {
    if (prefersReducedMotion) return;
    
    const counters = $$('[data-count]');
    if (counters.length === 0) return;
    
    const animateCounter = (el) => {
      const target = parseInt(el.dataset.count, 10);
      const duration = 2000;
      const start = performance.now();
      
      const update = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(eased * target);
        
        el.textContent = current.toLocaleString() + '+';
        
        if (progress < 1) {
          requestAnimationFrame(update);
        }
      };
      
      requestAnimationFrame(update);
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    
    counters.forEach(el => observer.observe(el));
  }

  // ============================================================================
  // PARALLAX EFFECTS
  // ============================================================================
  
  function initParallax() {
    if (prefersReducedMotion) return;
    
    const heroOrbs = $$('.hero-orb');
    const orbContainer = $('.orb-container');
    
    if (heroOrbs.length === 0) return;
    
    const handleScroll = throttle(() => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      
      // Parallax for background orbs
      heroOrbs.forEach((orb, index) => {
        const speed = 0.3 + (index * 0.1);
        const yPos = scrollY * speed;
        orb.style.transform = `translateY(${yPos}px)`;
      });
      
      // Fade out hero orb on scroll
      if (orbContainer) {
        const fadeStart = windowHeight * 0.3;
        const fadeEnd = windowHeight * 0.7;
        const opacity = 1 - Math.min(Math.max((scrollY - fadeStart) / (fadeEnd - fadeStart), 0), 1);
        orbContainer.style.opacity = opacity;
      }
    }, 16);
    
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  // ============================================================================
  // INTERACTIVE DEMO
  // ============================================================================
  
  function initDemo() {
    const demoOrb = $('#demoOrb');
    const demoMessages = $('#demoMessages');
    const suggestions = $$('.demo-suggestion');
    
    if (!demoOrb || !demoMessages) return;
    
    const responses = {
      "I'm feeling overwhelmed with work": "I hear you. Feeling overwhelmed is tough. Let's break this down together. What's the one thing on your plate right now that feels most urgent? Sometimes just naming it helps us see it more clearly.",
      "Help me build better habits": "Building habits is one of my favorite topics! The key isn't willpower—it's environment design and tiny steps. What's one small habit you've been wanting to build? Let's make it so easy you can't say no.",
      "Help with a big decision": "Big decisions deserve space to breathe. I'm curious—what's the decision you're wrestling with? And more importantly, what's making it feel so big right now?"
    };
    
    const defaultResponse = "I'm here to help you navigate whatever's on your mind. What would you like to talk about today?";
    
    function addMessage(text, isUser = false) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `demo-message ${isUser ? 'user' : 'assistant'}`;
      
      if (isUser) {
        messageDiv.innerHTML = `<div class="demo-bubble">${text}</div>`;
      } else {
        messageDiv.innerHTML = `
          <div class="demo-avatar">FN</div>
          <div class="demo-bubble">${text}</div>
        `;
      }
      
      // Add with animation
      messageDiv.style.opacity = '0';
      messageDiv.style.transform = 'translateY(10px)';
      demoMessages.appendChild(messageDiv);
      
      // Trigger animation
      requestAnimationFrame(() => {
        messageDiv.style.transition = 'all 0.3s ease-out';
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateY(0)';
      });
      
      // Scroll to bottom
      demoMessages.scrollTop = demoMessages.scrollHeight;
    }
    
    function handlePrompt(prompt) {
      // Add user message
      addMessage(prompt, true);
      
      // Simulate typing delay
      setTimeout(() => {
        const response = responses[prompt] || defaultResponse;
        addMessage(response, false);
      }, 800);
    }
    
    // Suggestion clicks
    suggestions.forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        handlePrompt(prompt);
        
        // Hide suggestions after use
        btn.parentElement.style.display = 'none';
      });
    });
    
    // Orb click - redirect to app
    demoOrb.addEventListener('click', () => {
      window.open('https://app.ferni.ai', '_blank');
    });
  }

  // ============================================================================
  // PERSONA HOVER EFFECTS
  // ============================================================================
  
  function initPersonaEffects() {
    const personas = $$('.persona');
    
    personas.forEach(persona => {
      persona.addEventListener('mouseenter', () => {
        // Pause orbit animation on hover
        const orbit = persona.closest('.persona-orbit');
        if (orbit) {
          orbit.style.animationPlayState = 'paused';
        }
      });
      
      persona.addEventListener('mouseleave', () => {
        const orbit = persona.closest('.persona-orbit');
        if (orbit) {
          orbit.style.animationPlayState = 'running';
        }
      });
    });
  }

  // ============================================================================
  // TOUCH INTERACTIONS
  // ============================================================================
  
  function initTouchInteractions() {
    // Add touch feedback to buttons
    $$('.btn, .demo-suggestion, .team-card').forEach(el => {
      el.addEventListener('touchstart', () => {
        el.style.transform = 'scale(0.98)';
      }, { passive: true });
      
      el.addEventListener('touchend', () => {
        el.style.transform = '';
      }, { passive: true });
    });
  }

  // ============================================================================
  // MAGNETIC BUTTON EFFECT (Desktop only)
  // ============================================================================
  
  function initMagneticButtons() {
    if (prefersReducedMotion || 'ontouchstart' in window) return;
    
    $$('.btn-primary').forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        
        btn.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px)`;
      });
      
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  // ============================================================================
  // FAQ ACCORDION
  // ============================================================================
  
  function initFAQ() {
    const faqItems = $$('.faq-item');
    
    if (faqItems.length === 0) return;
    
    faqItems.forEach(item => {
      const question = item.querySelector('.faq-question');
      
      question.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        
        // Close all other items
        faqItems.forEach(otherItem => {
          if (otherItem !== item) {
            otherItem.classList.remove('open');
            otherItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
          }
        });
        
        // Toggle current item
        item.classList.toggle('open');
        question.setAttribute('aria-expanded', !isOpen);
      });
    });
  }

  // ============================================================================
  // NEWSLETTER FORM (Mailchimp)
  // ============================================================================
  
  function initNewsletter() {
    const form = $('#newsletterForm');
    const successMessage = $('#newsletterSuccess');
    
    if (!form) return;
    
    // Mailchimp forms submit natively (opens in new tab)
    // We just add tracking and visual feedback
    form.addEventListener('submit', (e) => {
      const emailInput = form.querySelector('input[type="email"]');
      const email = emailInput.value;
      const submitBtn = form.querySelector('button[type="submit"]');
      
      // Track event
      if (window.trackEvent) {
        window.trackEvent('Newsletter', 'subscribe', 'homepage');
      }
      
      // Store email in localStorage
      localStorage.setItem('ferni_newsletter', email);
      
      // Add loading state briefly
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Subscribing...</span>';
      
      // Show success after brief delay (form submits to new tab)
      setTimeout(() => {
        form.classList.add('success');
        form.style.display = 'none';
        successMessage.classList.add('visible');
      }, 500);
      
      // Let the form submit naturally to Mailchimp
    });
    
    // Check if already subscribed
    if (localStorage.getItem('ferni_newsletter')) {
      form.style.display = 'none';
      successMessage.classList.add('visible');
    }
  }
  
  // ============================================================================
  // DEVELOPER WAITLIST FORM
  // ============================================================================
  
  function initDeveloperForm() {
    const form = $('#developerForm');
    const noteEl = $('#developerNote');
    const successEl = $('#developerSuccess');
    
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const emailInput = form.querySelector('input[type="email"]');
      const email = emailInput.value;
      const submitBtn = form.querySelector('button[type="submit"]');
      
      // Add loading state
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Submitting...';
      
      // Track event
      if (window.trackEvent) {
        window.trackEvent('Form', 'submit', 'developer-waitlist');
      }
      
      // Submit to Formspree (replace YOUR_FORM_ID with actual ID)
      try {
        const response = await fetch('https://formspree.io/f/YOUR_DEVELOPER_FORM_ID', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            email: email,
            _subject: 'New Developer Early Access Request'
          })
        });
        
        if (response.ok) {
          // Success
          form.style.display = 'none';
          if (noteEl) noteEl.style.display = 'none';
          if (successEl) successEl.style.display = 'block';
          
          // Store in localStorage
          localStorage.setItem('ferni_developer_waitlist', email);
          
          // Track success
          if (window.trackEvent) {
            window.trackEvent('Form', 'success', 'developer-waitlist');
          }
        } else {
          throw new Error('Form submission failed');
        }
        
      } catch (error) {
        console.error('Developer form submission error:', error);
        // Reset button on error
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Request Access <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
        
        // Track error
        if (window.trackEvent) {
          window.trackEvent('Form', 'error', 'developer-waitlist');
        }
      }
    });
    
    // Check if already submitted
    if (localStorage.getItem('ferni_developer_waitlist')) {
      form.style.display = 'none';
      if (noteEl) noteEl.style.display = 'none';
      if (successEl) successEl.style.display = 'block';
    }
  }

  // ============================================================================
  // PERFORMANCE OPTIMIZATIONS
  // ============================================================================
  
  function initPerformanceOptimizations() {
    // Lazy load images when we add them
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
            }
            imageObserver.unobserve(img);
          }
        });
      });
      
      $$('img[data-src]').forEach(img => imageObserver.observe(img));
    }
    
    // Pause animations when tab is not visible
    document.addEventListener('visibilitychange', () => {
      const animations = $$('.persona-orbit, .wave-bar, .voice-orb');
      animations.forEach(el => {
        el.style.animationPlayState = document.hidden ? 'paused' : 'running';
      });
    });
  }

  // ============================================================================
  // KEYBOARD NAVIGATION
  // ============================================================================
  
  function initKeyboardNavigation() {
    // Skip link for accessibility
    const skipLink = document.createElement('a');
    skipLink.href = '#features';
    skipLink.className = 'skip-link';
    skipLink.textContent = 'Skip to main content';
    skipLink.style.cssText = `
      position: fixed;
      top: -100px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: var(--color-accent);
      color: white;
      border-radius: 8px;
      z-index: 9999;
      transition: top 0.3s;
    `;
    
    skipLink.addEventListener('focus', () => {
      skipLink.style.top = '20px';
    });
    
    skipLink.addEventListener('blur', () => {
      skipLink.style.top = '-100px';
    });
    
    document.body.insertBefore(skipLink, document.body.firstChild);
    
    // Focus visible styles are in CSS
  }

  // ============================================================================
  // GSAP SCROLL ANIMATION - Zen Garden Zoom Effect (Adaline-style)
  // ============================================================================
  
  function initScrollAnimation() {
    const container = $('#heroScrollContainer');
    const canvas = $('#scrollCanvas');
    const heroContent = $('#heroContentWrapper');
    const loadingEl = $('#canvasLoading');
    
    if (!container || !canvas) {
      console.warn('Scroll animation container not found');
      return;
    }
    
    if (prefersReducedMotion) {
      // Show static fallback image if reduced motion
      canvas.style.backgroundImage = 'url(images/sequence/frame-001.jpg)';
      canvas.style.backgroundSize = 'cover';
      canvas.style.backgroundPosition = 'center';
      if (loadingEl) loadingEl.classList.add('hidden');
      return;
    }
    
    // Check if GSAP is loaded
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      console.warn('GSAP or ScrollTrigger not loaded, skipping scroll animation');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    const images = [];
    const frameCount = 70; // We have 70 frames (every 4th image from 1-280)
    let loadedCount = 0;
    
    // Generate frame numbers (1, 5, 9, 13... up to 277)
    const frameNumbers = [];
    for (let i = 1; i <= 280; i += 4) {
      frameNumbers.push(String(i).padStart(3, '0'));
    }
    
    // Current frame object for GSAP to animate
    const frameObj = { frame: 0 };
    
    // Resize canvas to fit viewport
    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(dpr, dpr);
    }
    
    // Draw a specific frame to the canvas
    function drawFrame(index) {
      if (!images[index]) return;
      
      const img = images[index];
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Clear canvas
      ctx.clearRect(0, 0, width, height);
      
      // Draw image covering the canvas (like background-size: cover)
      const imgRatio = img.width / img.height;
      const canvasRatio = width / height;
      
      let drawWidth, drawHeight, drawX, drawY;
      
      if (canvasRatio > imgRatio) {
        drawWidth = width;
        drawHeight = width / imgRatio;
        drawX = 0;
        drawY = (height - drawHeight) / 2;
      } else {
        drawHeight = height;
        drawWidth = height * imgRatio;
        drawX = (width - drawWidth) / 2;
        drawY = 0;
      }
      
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    }
    
    // Load all images
    function loadImages() {
      frameNumbers.forEach((num, index) => {
        const img = new Image();
        img.onload = () => {
          images[index] = img;
          loadedCount++;
          
          // Update loading progress
          if (loadingEl) {
            const progress = Math.round((loadedCount / frameCount) * 100);
            loadingEl.textContent = `Loading zen garden... ${progress}%`;
          }
          
          // When all images loaded, start animation
          if (loadedCount === frameCount) {
            if (loadingEl) loadingEl.classList.add('hidden');
            container.classList.add('canvas-loaded');
            initGSAPAnimation();
          }
          
          // Draw first frame immediately when available
          if (index === 0) {
            resizeCanvas();
            drawFrame(0);
          }
        };
        img.onerror = () => {
          console.warn(`Failed to load frame ${num}`);
          loadedCount++;
          if (loadedCount === frameCount) {
            if (loadingEl) loadingEl.classList.add('hidden');
            initGSAPAnimation();
          }
        };
        // Use local images
        img.src = `images/sequence/frame-${num}.jpg`;
      });
    }
    
    // Initialize GSAP ScrollTrigger animation
    function initGSAPAnimation() {
      gsap.registerPlugin(ScrollTrigger);
      
      // Create the scroll-triggered frame animation
      gsap.to(frameObj, {
        frame: frameCount - 1,
        ease: 'none',
        scrollTrigger: {
          trigger: container,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.5, // Smoother scrubbing
          onUpdate: (self) => {
            const currentFrame = Math.round(frameObj.frame);
            drawFrame(currentFrame);
          }
        }
      });
      
      // Fade out hero content as user scrolls
      if (heroContent) {
        gsap.to(heroContent, {
          opacity: 0,
          y: -100,
          ease: 'none',
          scrollTrigger: {
            trigger: container,
            start: 'top top',
            end: '20% top', // Fade out quickly
            scrub: true,
            onLeave: () => {
              heroContent.style.pointerEvents = 'none';
            },
            onEnterBack: () => {
              heroContent.style.pointerEvents = 'auto';
            }
          }
        });
      }
      
      // Unpin canvas when hero section ends
      ScrollTrigger.create({
        trigger: container,
        start: 'top top',
        end: 'bottom bottom',
        onLeave: () => {
          canvas.style.position = 'absolute';
          canvas.style.top = 'auto';
          canvas.style.bottom = '0';
        },
        onEnterBack: () => {
          canvas.style.position = 'fixed';
          canvas.style.top = '0';
          canvas.style.bottom = 'auto';
        }
      });
      
      // Handle window resize
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          resizeCanvas();
          drawFrame(Math.round(frameObj.frame));
          ScrollTrigger.refresh();
        }, 100);
      });
    }
    
    // Start loading images
    resizeCanvas();
    loadImages();
  }

  // ============================================================================
  // COOKIE CONSENT
  // ============================================================================
  
  function initCookieConsent() {
    const banner = $('#cookieBanner');
    const acceptBtn = $('#cookieAccept');
    const settingsBtn = $('#cookieSettings');
    const settingsModal = $('#cookieSettingsModal');
    const settingsCancel = $('#cookieSettingsCancel');
    const settingsSave = $('#cookieSettingsSave');
    const analyticsToggle = $('#analyticsCookies');
    const functionalToggle = $('#functionalCookies');
    
    if (!banner) return;
    
    // Check if user already consented
    const consent = localStorage.getItem('ferni_cookie_consent');
    
    if (!consent) {
      // Show banner after a short delay
      setTimeout(() => {
        banner.classList.add('visible');
      }, 1500);
    } else {
      banner.classList.add('hidden');
      // Apply saved preferences
      applyConsent(JSON.parse(consent));
    }
    
    function hideBanner() {
      banner.classList.remove('visible');
      setTimeout(() => banner.classList.add('hidden'), 400);
    }
    
    function applyConsent(prefs) {
      // Disable Google Analytics if not consented
      if (!prefs.analytics && window.gtag) {
        window['ga-disable-G-2JXL8SQPF2'] = true;
      }
    }
    
    // Accept all cookies
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        const prefs = { essential: true, analytics: true, functional: true };
        localStorage.setItem('ferni_cookie_consent', JSON.stringify(prefs));
        applyConsent(prefs);
        hideBanner();
        if (window.trackEvent) {
          trackEvent('Cookie', 'consent', 'accept_all');
        }
      });
    }
    
    // Open settings modal
    if (settingsBtn && settingsModal) {
      settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('visible');
      });
    }
    
    // Close settings modal
    if (settingsCancel && settingsModal) {
      settingsCancel.addEventListener('click', () => {
        settingsModal.classList.remove('visible');
      });
    }
    
    // Save settings
    if (settingsSave && settingsModal) {
      settingsSave.addEventListener('click', () => {
        const prefs = {
          essential: true, // Always true
          analytics: analyticsToggle?.checked ?? false,
          functional: functionalToggle?.checked ?? true
        };
        localStorage.setItem('ferni_cookie_consent', JSON.stringify(prefs));
        applyConsent(prefs);
        settingsModal.classList.remove('visible');
        hideBanner();
        if (window.trackEvent && prefs.analytics) {
          trackEvent('Cookie', 'consent', 'custom');
        }
      });
    }
    
    // Close modal on backdrop click
    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
          settingsModal.classList.remove('visible');
        }
      });
    }
  }

  // ============================================================================
  // INITIALIZE
  // ============================================================================
  
  function init() {
    initPageLoader();
    initNavigation();
    initMobileMenu();
    initRevealAnimations();
    initCounters();
    initParallax();
    initDemo();
    initPersonaEffects();
    initTouchInteractions();
    initMagneticButtons();
    initPerformanceOptimizations();
    initKeyboardNavigation();
    initFAQ();
    initNewsletter();
    initDeveloperForm();
    initCookieConsent();
    initScrollAnimation(); // GSAP Zen Garden scroll effect
    
    // Log init complete
    console.log('Ferni website initialized');
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration.scope);
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}

