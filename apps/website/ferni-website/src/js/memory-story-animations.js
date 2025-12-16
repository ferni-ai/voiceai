/**
 * Memory Story Animations
 * 
 * Applies Ferni's Pixar-inspired animation principles to the memory timeline.
 * Creates a cinematic, emotionally resonant storytelling experience.
 * 
 * Animation Philosophy:
 * - Staggered reveals create anticipation
 * - Organic easings feel natural, not mechanical
 * - Follow-through makes elements feel alive
 * - The user's emotional journey is the hero
 */

// ============================================================================
// ANIMATION CONSTANTS (from Ferni Design System)
// ============================================================================

const EASING = {
  // Pixar-style organic easings
  gentle: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  springGentle: 'cubic-bezier(0.34, 1.2, 0.64, 1)',
  expoOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
  organic: 'cubic-bezier(0.4, 0.2, 0.2, 1.1)',
  playful: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  anticipate: 'cubic-bezier(0.38, -0.4, 0.88, 0.65)',
};

const DURATION = {
  micro: 50,
  fast: 100,
  normal: 200,
  slow: 300,
  moderate: 400,
  deliberate: 500,
  dramatic: 600,
  celebration: 800,
  glacial: 1500,
};

const STAGGER = {
  fast: 50,
  normal: 80,
  slow: 120,
  dramatic: 180,
};

// ============================================================================
// MEMORY STORY ANIMATION CLASS
// ============================================================================

class MemoryStoryAnimation {
  constructor() {
    this.section = document.querySelector('.memory-story');
    this.chapters = [];
    this.insightPanel = null;
    this.dashboard = null;
    this.observer = null;
    this.hasAnimated = false;
    
    if (this.section) {
      this.init();
    }
  }

  init() {
    this.chapters = Array.from(this.section.querySelectorAll('.memory-story__chapter'));
    this.insightPanel = this.section.querySelector('.memory-story__insight');
    this.dashboard = this.section.querySelector('.memory-dashboard');
    
    // Inject keyframes
    this.injectKeyframes();
    
    // Set initial hidden state (CSS handles visibility)
    this.prepareElements();
    
    // Set up scroll-triggered animations
    this.setupIntersectionObserver();
    
    // Add hover effects
    this.setupHoverEffects();
    
    console.log('%c📖 Memory Story Animations loaded', 'color: #4a6741; font-weight: bold;');
  }

  injectKeyframes() {
    const style = document.createElement('style');
    style.id = 'memory-story-keyframes';
    style.textContent = `
      /* ========================================
         MEMORY STORY KEYFRAMES - Pixar-Inspired
         ======================================== */
      
      /* Fade up with gentle spring - main card reveal */
      @keyframes memoryCardReveal {
        0% {
          opacity: 0;
          transform: translateY(30px) scale(0.96);
        }
        60% {
          opacity: 1;
          transform: translateY(-4px) scale(1.01);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      /* Time marker fade in */
      @keyframes timeMarkerReveal {
        0% {
          opacity: 0;
          transform: scale(0.8);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }
      
      /* Emotion tag pop - bouncy spring */
      @keyframes emotionTagPop {
        0% {
          opacity: 0;
          transform: scale(0) translateY(10px);
        }
        50% {
          transform: scale(1.15) translateY(-2px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      
      /* Ferni's card - special treatment with glow */
      @keyframes ferniCardReveal {
        0% {
          opacity: 0;
          transform: translateY(40px) scale(0.94);
          box-shadow: 0 0 0 rgba(74, 103, 65, 0);
        }
        50% {
          opacity: 1;
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 12px 40px rgba(74, 103, 65, 0.15);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
          box-shadow: 0 4px 20px rgba(74, 103, 65, 0.1);
        }
      }
      
      /* Ferni's response typing cursor */
      @keyframes typingCursor {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
      
      /* Ferni avatar breathing - feels alive */
      @keyframes avatarBreathe {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 2px 8px rgba(74, 103, 65, 0.25);
        }
        50% {
          transform: scale(1.03);
          box-shadow: 0 4px 16px rgba(74, 103, 65, 0.35);
        }
      }
      
      /* Insight panel unfold */
      @keyframes insightUnfold {
        0% {
          opacity: 0;
          transform: translateY(20px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      /* Insight item stagger reveal */
      @keyframes insightItemReveal {
        0% {
          opacity: 0;
          transform: translateX(-15px);
        }
        100% {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      /* Sparkle on insight icons */
      @keyframes iconSparkle {
        0% {
          transform: scale(0.8) rotate(-10deg);
          opacity: 0.5;
        }
        50% {
          transform: scale(1.1) rotate(5deg);
          opacity: 1;
        }
        100% {
          transform: scale(1) rotate(0deg);
          opacity: 1;
        }
      }
      
      /* Connection line draw */
      @keyframes drawLine {
        0% {
          stroke-dashoffset: 100%;
        }
        100% {
          stroke-dashoffset: 0;
        }
      }
      
      /* Warmth pulse - the "magic moment" */
      @keyframes warmthPulse {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(74, 103, 65, 0.3);
        }
        50% {
          box-shadow: 0 0 30px 10px rgba(74, 103, 65, 0.15);
        }
      }
      
      /* Quote marks appear */
      @keyframes quoteReveal {
        0% {
          opacity: 0;
          transform: translateY(10px) rotate(-5deg);
        }
        100% {
          opacity: 0.15;
          transform: translateY(0) rotate(0deg);
        }
      }
      
      /* ========================================
         ANIMATION CLASSES
         ======================================== */
      
      /* Hidden state before animation */
      .memory-story__chapter.animate-ready {
        opacity: 0;
        transform: translateY(30px);
      }
      
      .memory-story__chapter.animate-in .memory-story__marker {
        animation: timeMarkerReveal ${DURATION.slow}ms ${EASING.spring} forwards;
      }
      
      .memory-story__chapter.animate-in .memory-story__card {
        animation: memoryCardReveal ${DURATION.deliberate}ms ${EASING.organic} forwards;
      }
      
      .memory-story__chapter.animate-in .memory-story__tag {
        animation: emotionTagPop ${DURATION.moderate}ms ${EASING.spring} forwards;
        animation-delay: calc(var(--tag-index, 0) * ${STAGGER.fast}ms + ${DURATION.slow}ms);
      }
      
      /* Ferni's card special animation */
      .memory-story__chapter:last-child.animate-in .memory-story__card {
        animation: ferniCardReveal ${DURATION.dramatic}ms ${EASING.organic} forwards;
      }
      
      /* Ferni avatar breathing when visible */
      .memory-story__chapter.animate-in .memory-story__avatar {
        animation: avatarBreathe 4s ${EASING.gentle} infinite;
        animation-delay: ${DURATION.dramatic}ms;
      }
      
      /* Insight panel animations */
      .memory-story__insight.animate-ready {
        opacity: 0;
        transform: translateY(20px);
      }
      
      .memory-story__insight.animate-in {
        animation: insightUnfold ${DURATION.deliberate}ms ${EASING.expoOut} forwards;
      }
      
      .memory-story__insight.animate-in .memory-story__insight-item {
        animation: insightItemReveal ${DURATION.moderate}ms ${EASING.organic} forwards;
        animation-delay: calc(var(--item-index, 0) * ${STAGGER.slow}ms);
      }
      
      .memory-story__insight.animate-in .memory-story__insight-icon {
        animation: iconSparkle ${DURATION.slow}ms ${EASING.spring} forwards;
        animation-delay: calc(var(--item-index, 0) * ${STAGGER.slow}ms + 100ms);
      }
      
      /* Hover enhancements - cards lift and glow */
      .memory-story__card {
        transition: 
          transform ${DURATION.slow}ms ${EASING.spring},
          box-shadow ${DURATION.slow}ms ${EASING.gentle};
      }
      
      .memory-story__card:hover {
        transform: translateY(-6px) scale(1.01);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
      }
      
      .memory-story__card--ferni:hover {
        box-shadow: 0 16px 40px rgba(74, 103, 65, 0.15);
      }
      
      /* Emotion tags hover bounce */
      .memory-story__tag {
        transition: transform ${DURATION.fast}ms ${EASING.spring};
        cursor: default;
      }
      
      .memory-story__tag:hover {
        transform: scale(1.08);
      }
      
      /* Insight items hover */
      .memory-story__insight-item {
        transition: 
          background ${DURATION.normal}ms ${EASING.gentle},
          transform ${DURATION.normal}ms ${EASING.springGentle};
      }
      
      .memory-story__insight-item:hover {
        transform: translateX(4px);
      }
      
      /* ========================================
         MEMORY DASHBOARD ANIMATIONS
         ======================================== */
      
      /* Dashboard container */
      .memory-dashboard.animate-ready {
        opacity: 0;
        transform: translateY(30px);
      }
      
      .memory-dashboard.animate-in {
        animation: insightUnfold ${DURATION.deliberate}ms ${EASING.expoOut} forwards;
      }
      
      /* Graph line draw animation */
      @keyframes dashboardLineReveal {
        from {
          stroke-dashoffset: 500;
        }
        to {
          stroke-dashoffset: 0;
        }
      }
      
      /* Pattern card hover effects */
      .memory-dashboard__pattern {
        transition: 
          transform ${DURATION.slow}ms ${EASING.spring},
          background ${DURATION.normal}ms ${EASING.gentle},
          border-color ${DURATION.normal}ms ${EASING.gentle},
          box-shadow ${DURATION.slow}ms ${EASING.gentle};
      }
      
      .memory-dashboard__pattern:hover {
        transform: translateY(-4px) scale(1.02);
        box-shadow: 0 8px 24px rgba(74, 103, 65, 0.1);
      }
      
      /* Graph point hover */
      .memory-dashboard__point {
        transition: 
          r ${DURATION.fast}ms ${EASING.spring},
          filter ${DURATION.normal}ms ${EASING.gentle};
        cursor: pointer;
      }
      
      /* Connection web subtle float */
      .memory-dashboard__web svg circle {
        transition: 
          fill ${DURATION.normal}ms ${EASING.gentle},
          transform ${DURATION.slow}ms ${EASING.organic};
      }
      
      /* Footer shimmer on hover */
      .memory-dashboard__footer {
        transition: 
          background ${DURATION.normal}ms ${EASING.gentle},
          transform ${DURATION.slow}ms ${EASING.spring};
      }
      
      .memory-dashboard__footer:hover {
        background: linear-gradient(135deg, rgba(184,149,106,0.1) 0%, rgba(74,103,65,0.08) 100%);
        transform: scale(1.01);
      }
      
      /* Ring animation - count up effect */
      .memory-dashboard__ring circle:last-child {
        transition: stroke-dashoffset 1.5s ${EASING.expoOut};
      }
      
      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .memory-story__chapter.animate-ready,
        .memory-story__insight.animate-ready,
        .memory-dashboard.animate-ready {
          opacity: 1;
          transform: none;
        }
        
        .memory-story__chapter.animate-in .memory-story__marker,
        .memory-story__chapter.animate-in .memory-story__card,
        .memory-story__chapter.animate-in .memory-story__tag,
        .memory-story__insight.animate-in,
        .memory-story__insight.animate-in .memory-story__insight-item,
        .memory-story__insight.animate-in .memory-story__insight-icon,
        .memory-dashboard.animate-in,
        .memory-dashboard__pattern,
        .memory-dashboard__web,
        .memory-dashboard__footer {
          animation: none;
          opacity: 1;
          transform: none;
        }
        
        .memory-story__avatar {
          animation: none !important;
        }
        
        .memory-dashboard__line,
        .memory-dashboard__area,
        .memory-dashboard__point {
          animation: none !important;
          opacity: 1;
          stroke-dashoffset: 0 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  prepareElements() {
    // Prepare chapters for animation
    this.chapters.forEach((chapter, index) => {
      chapter.classList.add('animate-ready');
      chapter.style.setProperty('--chapter-index', index);
      
      // Set tag indices for staggered animation
      const tags = chapter.querySelectorAll('.memory-story__tag');
      tags.forEach((tag, tagIndex) => {
        tag.style.setProperty('--tag-index', tagIndex);
      });
    });
    
    // Prepare insight panel
    if (this.insightPanel) {
      this.insightPanel.classList.add('animate-ready');
      
      const items = this.insightPanel.querySelectorAll('.memory-story__insight-item');
      items.forEach((item, index) => {
        item.style.setProperty('--item-index', index);
      });
    }
    
    // Prepare dashboard (new data visualization)
    if (this.dashboard) {
      this.dashboard.classList.add('animate-ready');
      
      const patterns = this.dashboard.querySelectorAll('.memory-dashboard__pattern');
      patterns.forEach((pattern, index) => {
        pattern.style.setProperty('--pattern-index', index);
      });
    }
  }

  setupIntersectionObserver() {
    // Reduced motion check
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (prefersReducedMotion) {
      // Skip animations, just show content
      this.chapters.forEach(chapter => {
        chapter.classList.remove('animate-ready');
        chapter.classList.add('animate-in');
      });
      if (this.insightPanel) {
        this.insightPanel.classList.remove('animate-ready');
        this.insightPanel.classList.add('animate-in');
      }
      if (this.dashboard) {
        this.dashboard.classList.remove('animate-ready');
        this.dashboard.classList.add('animate-in');
      }
      return;
    }
    
    // Create observer for scroll-triggered animations
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !entry.target.classList.contains('animate-in')) {
            this.animateElement(entry.target);
          }
        });
      },
      {
        threshold: 0.2,
        rootMargin: '0px 0px -50px 0px'
      }
    );
    
    // Observe chapters
    this.chapters.forEach(chapter => {
      this.observer.observe(chapter);
    });
    
    // Observe insight panel
    if (this.insightPanel) {
      this.observer.observe(this.insightPanel);
    }
    
    // Observe dashboard
    if (this.dashboard) {
      this.observer.observe(this.dashboard);
    }
  }

  animateElement(element) {
    const index = this.chapters.indexOf(element);
    const isFerniCard = index === this.chapters.length - 1;
    const isInsightPanel = element === this.insightPanel;
    const isDashboard = element === this.dashboard;
    
    // Calculate delay based on position
    let delay = 0;
    
    if (index >= 0) {
      // Stagger chapters - each one waits for the previous
      delay = STAGGER.dramatic;
    }
    
    // For Ferni's card, add a "thinking" moment
    if (isFerniCard) {
      delay += DURATION.moderate;
    }
    
    // Trigger animation
    setTimeout(() => {
      element.classList.remove('animate-ready');
      element.classList.add('animate-in');
      
      // Special "warmth pulse" for Ferni's card
      if (isFerniCard) {
        const card = element.querySelector('.memory-story__card--ferni');
        if (card) {
          setTimeout(() => {
            card.style.animation = `warmthPulse 2s ${EASING.gentle} infinite`;
          }, DURATION.dramatic);
        }
      }
      
      // Special animations for dashboard
      if (isDashboard) {
        this.animateDashboard(element);
      }
    }, delay);
  }
  
  animateDashboard(dashboard) {
    // Animate stat counters first
    this.animateStatCounters(dashboard);
    
    // Animate the graph line drawing
    const graphLine = dashboard.querySelector('.memory-dashboard__line');
    if (graphLine) {
      graphLine.style.strokeDasharray = '500';
      graphLine.style.strokeDashoffset = '500';
      graphLine.style.animation = `drawLine 1.5s ${EASING.expoOut} forwards`;
    }
    
    // Animate the area fill
    const area = dashboard.querySelector('.memory-dashboard__area');
    if (area) {
      area.style.opacity = '0';
      setTimeout(() => {
        area.style.transition = `opacity ${DURATION.deliberate}ms ${EASING.gentle}`;
        area.style.opacity = '1';
      }, DURATION.slow);
    }
    
    // Animate data points with staggered pop
    const points = dashboard.querySelectorAll('.memory-dashboard__point');
    points.forEach((point, i) => {
      point.style.opacity = '0';
      point.style.transform = 'scale(0)';
      setTimeout(() => {
        point.style.transition = `all ${DURATION.moderate}ms ${EASING.spring}`;
        point.style.opacity = '1';
        point.style.transform = 'scale(1)';
      }, DURATION.slow + (i * STAGGER.normal));
    });
    
    // Animate pattern cards with staggered reveal
    const patterns = dashboard.querySelectorAll('.memory-dashboard__pattern');
    patterns.forEach((pattern, i) => {
      setTimeout(() => {
        pattern.style.opacity = '1';
        pattern.style.transform = 'translateY(0)';
      }, DURATION.dramatic + (i * STAGGER.slow));
    });
    
    // Animate connection web
    const web = dashboard.querySelector('.memory-dashboard__web');
    if (web) {
      setTimeout(() => {
        web.style.opacity = '1';
        web.style.transform = 'translateY(0)';
      }, DURATION.dramatic + (patterns.length * STAGGER.slow));
    }
    
    // Animate footer
    const footer = dashboard.querySelector('.memory-dashboard__footer');
    if (footer) {
      setTimeout(() => {
        footer.style.opacity = '1';
        footer.style.transform = 'translateY(0)';
      }, DURATION.celebration + (patterns.length * STAGGER.slow));
    }
  }
  
  /**
   * Animate stat counters with a counting-up effect
   * Creates a smooth, organic count-up animation
   */
  animateStatCounters(dashboard) {
    const statValues = dashboard.querySelectorAll('.memory-dashboard__stat-value[data-count]');
    
    statValues.forEach((stat, index) => {
      const targetValue = parseInt(stat.dataset.count, 10);
      const startDelay = index * 150; // Stagger the starts
      const duration = 1200 + (targetValue * 10); // Longer for bigger numbers
      
      setTimeout(() => {
        this.countUp(stat, targetValue, Math.min(duration, 2000));
      }, startDelay);
    });
  }
  
  /**
   * Smooth count-up animation with easing
   */
  countUp(element, target, duration) {
    const startTime = performance.now();
    const startValue = 0;
    
    const easeOutExpo = (t) => {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    };
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);
      const currentValue = Math.floor(startValue + (target - startValue) * easedProgress);
      
      element.textContent = currentValue;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        element.textContent = target;
        // Add a subtle "pop" when complete
        element.style.transform = 'scale(1.1)';
        element.style.transition = `transform 200ms ${EASING.spring}`;
        setTimeout(() => {
          element.style.transform = 'scale(1)';
        }, 200);
      }
    };
    
    requestAnimationFrame(animate);
  }

  setupHoverEffects() {
    // Add magnetic hover effect to cards
    this.chapters.forEach(chapter => {
      const card = chapter.querySelector('.memory-story__card');
      if (card) {
        card.addEventListener('mousemove', (e) => this.handleMagneticHover(e, card));
        card.addEventListener('mouseleave', (e) => this.resetMagneticHover(card));
      }
    });
  }

  handleMagneticHover(e, card) {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    // Subtle tilt effect
    const maxTilt = 2;
    const tiltX = (y / rect.height) * maxTilt;
    const tiltY = -(x / rect.width) * maxTilt;
    
    card.style.transform = `
      translateY(-6px) 
      scale(1.01) 
      perspective(1000px) 
      rotateX(${tiltX}deg) 
      rotateY(${tiltY}deg)
    `;
  }

  resetMagneticHover(card) {
    card.style.transform = '';
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    
    const styleEl = document.getElementById('memory-story-keyframes');
    if (styleEl) {
      styleEl.remove();
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new MemoryStoryAnimation());
} else {
  new MemoryStoryAnimation();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MemoryStoryAnimation;
}

