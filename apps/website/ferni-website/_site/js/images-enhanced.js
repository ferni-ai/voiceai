/**
 * Enhanced Images - Ferni Landing Page
 * =====================================
 * Lazy loading, blur-up placeholders, Ken Burns, and scroll reveals
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // LAZY LOADING WITH BLUR-UP EFFECT
  // Images load with a beautiful blur-to-sharp transition
  // ═══════════════════════════════════════════════════════════════════════════

  function initLazyLoading() {
    const lazyImages = document.querySelectorAll('[data-lazy-src]');
    
    if ('loading' in HTMLImageElement.prototype) {
      // Native lazy loading supported
      lazyImages.forEach(img => {
        img.loading = 'lazy';
        setupBlurUp(img);
      });
    } else {
      // Fallback with IntersectionObserver
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            setupBlurUp(img);
            observer.unobserve(img);
          }
        });
      }, { rootMargin: '50px' });
      
      lazyImages.forEach(img => observer.observe(img));
    }
  }

  function setupBlurUp(img) {
    const actualSrc = img.dataset.lazySrc;
    const placeholder = img.dataset.placeholder;
    
    // Set placeholder or blur
    if (placeholder) {
      img.src = placeholder;
    }
    img.style.filter = 'blur(10px)';
    img.style.transition = 'filter 0.5s ease-out';
    img.style.willChange = 'filter';
    
    // Load actual image
    const tempImg = new Image();
    tempImg.onload = () => {
      img.src = actualSrc;
      img.style.filter = 'blur(0)';
      
      // Cleanup
      setTimeout(() => {
        img.style.willChange = '';
      }, 600);
    };
    tempImg.src = actualSrc;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KEN BURNS EFFECT
  // Subtle zoom and pan animation for hero images
  // ═══════════════════════════════════════════════════════════════════════════

  function initKenBurns() {
    const kenBurnsImages = document.querySelectorAll('[data-ken-burns]');
    
    kenBurnsImages.forEach(container => {
      const img = container.querySelector('img') || container;
      const duration = parseInt(container.dataset.kenBurns) || 20;
      const direction = container.dataset.kenBurnsDirection || 'random';
      
      // Ensure container clips overflow
      if (container !== img) {
        container.style.overflow = 'hidden';
      }
      
      // Set initial scale
      img.style.transform = 'scale(1.1)';
      img.style.transformOrigin = getRandomOrigin(direction);
      img.style.transition = `transform ${duration}s ease-in-out`;
      
      // Animate
      const animate = () => {
        const scale = 1 + Math.random() * 0.1;
        img.style.transform = `scale(${scale})`;
        img.style.transformOrigin = getRandomOrigin(direction);
      };
      
      // Start animation when in viewport
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animate();
            setInterval(animate, duration * 1000);
          }
        });
      });
      
      observer.observe(container);
    });
  }

  function getRandomOrigin(direction) {
    if (direction === 'center') return 'center center';
    
    const positions = ['top left', 'top center', 'top right', 'center left', 'center center', 'center right', 'bottom left', 'bottom center', 'bottom right'];
    return positions[Math.floor(Math.random() * positions.length)];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMAGE REVEAL ON SCROLL
  // Images animate in as they enter viewport
  // ═══════════════════════════════════════════════════════════════════════════

  function initImageReveal() {
    const revealImages = document.querySelectorAll('[data-image-reveal]');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const direction = el.dataset.imageReveal || 'up';
          const delay = parseInt(el.dataset.revealDelay) || 0;
          
          setTimeout(() => {
            el.classList.add('image-revealed');
          }, delay);
          
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.2 });
    
    revealImages.forEach(img => {
      const direction = img.dataset.imageReveal || 'up';
      
      // Set initial state based on direction
      const transforms = {
        up: 'translateY(40px)',
        down: 'translateY(-40px)',
        left: 'translateX(-40px)',
        right: 'translateX(40px)',
        scale: 'scale(0.9)',
        fade: 'none'
      };
      
      img.style.opacity = '0';
      img.style.transform = transforms[direction] || transforms.up;
      img.style.transition = 'opacity 0.8s ease, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
      
      observer.observe(img);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESPONSIVE IMAGES WITH SRCSET
  // Auto-generate srcset for responsive loading
  // ═══════════════════════════════════════════════════════════════════════════

  function initResponsiveImages() {
    const images = document.querySelectorAll('[data-responsive-src]');
    
    images.forEach(img => {
      const baseSrc = img.dataset.responsiveSrc;
      const sizes = img.dataset.sizes || '(max-width: 768px) 100vw, 50vw';
      
      // Extract file extension and base path
      const lastDot = baseSrc.lastIndexOf('.');
      const base = baseSrc.substring(0, lastDot);
      const ext = baseSrc.substring(lastDot);
      
      // Generate srcset
      const widths = [320, 640, 768, 1024, 1280, 1920];
      const srcset = widths.map(w => `${base}-${w}w${ext} ${w}w`).join(', ');
      
      img.srcset = srcset;
      img.sizes = sizes;
      img.src = baseSrc; // Fallback
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBP/AVIF DETECTION AND FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════

  function initModernFormats() {
    // Check for WebP support
    const webpSupport = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
    
    // Check for AVIF support (async)
    const avifSupport = new Promise(resolve => {
      const avif = new Image();
      avif.onload = avif.onerror = () => resolve(avif.height === 2);
      avif.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKBzgABc0WAAIewQB1//8AAAA+vN0JY=';
    });
    
    // Add support classes
    document.documentElement.classList.add(webpSupport ? 'webp' : 'no-webp');
    
    avifSupport.then(supported => {
      document.documentElement.classList.add(supported ? 'avif' : 'no-avif');
    });
    
    // Replace images with modern formats if supported
    const modernImages = document.querySelectorAll('[data-webp], [data-avif]');
    
    modernImages.forEach(img => {
      avifSupport.then(hasAvif => {
        if (hasAvif && img.dataset.avif) {
          img.src = img.dataset.avif;
        } else if (webpSupport && img.dataset.webp) {
          img.src = img.dataset.webp;
        }
        // Otherwise keep original src
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMAGE HOVER EFFECTS
  // Zoom and other effects on hover
  // ═══════════════════════════════════════════════════════════════════════════

  function initImageHoverEffects() {
    const hoverImages = document.querySelectorAll('[data-image-hover]');
    
    hoverImages.forEach(container => {
      const effect = container.dataset.imageHover || 'zoom';
      const img = container.querySelector('img') || container;
      
      container.style.overflow = 'hidden';
      img.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
      
      const effects = {
        zoom: () => { img.style.transform = 'scale(1.1)'; },
        'zoom-rotate': () => { img.style.transform = 'scale(1.1) rotate(2deg)'; },
        'pan-left': () => { img.style.transform = 'translateX(-5%)'; },
        'pan-right': () => { img.style.transform = 'translateX(5%)'; }
      };
      
      container.addEventListener('mouseenter', () => {
        effects[effect]?.();
      });
      
      container.addEventListener('mouseleave', () => {
        img.style.transform = '';
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INJECT STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Image reveal animation */
      .image-revealed {
        opacity: 1 !important;
        transform: none !important;
      }
      
      /* Placeholder skeleton for images */
      img[data-lazy-src]:not([src]) {
        background: linear-gradient(
          90deg,
          rgba(235, 230, 223, 1) 0%,
          rgba(245, 242, 237, 1) 50%,
          rgba(235, 230, 223, 1) 100%
        );
        background-size: 200% 100%;
        animation: imagePlaceholder 1.5s ease-in-out infinite;
      }
      
      @keyframes imagePlaceholder {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      
      /* Modern format support classes */
      .webp img[data-webp],
      .avif img[data-avif] {
        transition: opacity 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    injectStyles();
    initLazyLoading();
    initKenBurns();
    initImageReveal();
    initResponsiveImages();
    initModernFormats();
    initImageHoverEffects();
    
    console.log('%c🖼️ Enhanced images loaded', 'color: #4a6741; font-weight: bold;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

