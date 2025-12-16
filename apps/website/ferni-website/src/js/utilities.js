/**
 * Utilities - Ferni Landing Page
 * ===============================
 * Shared utility functions used across all scripts
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFETTI CELEBRATION
  // Creates a burst of confetti at a target element
  // ═══════════════════════════════════════════════════════════════════════════

  window.ferniConfetti = function(target, count = 30) {
    const colors = ['#4a6741', '#3a6b73', '#5a6b8a', '#a67a6a', '#c4856a', '#faf8f5'];
    const container = target instanceof HTMLElement ? target : document.body;
    const rect = container.getBoundingClientRect();

    for (let i = 0; i < count; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti-piece';
      confetti.style.cssText = `
        position: fixed;
        width: ${Math.random() * 10 + 5}px;
        height: ${Math.random() * 10 + 5}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        left: ${rect.left + rect.width / 2 + (Math.random() - 0.5) * 100}px;
        top: ${rect.top + rect.height / 2}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        pointer-events: none;
        z-index: 9999;
        animation: confettiPop ${0.8 + Math.random() * 0.4}s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        animation-delay: ${Math.random() * 0.1}s;
      `;
      document.body.appendChild(confetti);

      // Cleanup after animation
      setTimeout(() => confetti.remove(), 1500);
    }
  };

  // Add confetti keyframe animation
  const confettiStyle = document.createElement('style');
  confettiStyle.textContent = `
    @keyframes confettiPop {
      0% {
        transform: translateY(0) translateX(0) rotate(0deg) scale(1);
        opacity: 1;
      }
      100% {
        transform: translateY(${-150 - Math.random() * 100}px) translateX(${(Math.random() - 0.5) * 200}px) rotate(${720 + Math.random() * 360}deg) scale(0);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(confettiStyle);

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME-AWARENESS
  // Adjusts ambient colors based on time of day
  // ═══════════════════════════════════════════════════════════════════════════

  window.ferniTimeAwareness = {
    init: function() {
      this.update();
      // Update every 30 minutes
      setInterval(() => this.update(), 30 * 60 * 1000);
    },

    update: function() {
      const hour = new Date().getHours();
      let timeClass = 'time-noon';

      if (hour >= 5 && hour < 8) {
        timeClass = 'time-dawn';
      } else if (hour >= 8 && hour < 17) {
        timeClass = 'time-noon';
      } else if (hour >= 17 && hour < 20) {
        timeClass = 'time-dusk';
      } else {
        timeClass = 'time-night';
      }

      document.documentElement.classList.remove('time-dawn', 'time-noon', 'time-dusk', 'time-night');
      document.documentElement.classList.add(timeClass);

      // Dispatch event for listeners
      document.dispatchEvent(new CustomEvent('ferni:timechange', {
        detail: { timeClass, hour }
      }));
    },

    getTimeOfDay: function() {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 8) return 'dawn';
      if (hour >= 8 && hour < 17) return 'noon';
      if (hour >= 17 && hour < 20) return 'dusk';
      return 'night';
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STICKY CTA AFTER HERO
  // Shows a sticky CTA bar after scrolling past the hero
  // ═══════════════════════════════════════════════════════════════════════════

  window.ferniStickyCTA = {
    init: function() {
      const hero = document.querySelector('[data-hero]');
      const stickyCTA = document.querySelector('.sticky-cta');
      
      if (!hero || !stickyCTA) return;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            stickyCTA.classList.remove('visible');
          } else {
            stickyCTA.classList.add('visible');
          }
        });
      }, { threshold: 0.1 });

      observer.observe(hero);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA BREATHING ANIMATIONS
  // Each persona has a unique breathing rhythm
  // ═══════════════════════════════════════════════════════════════════════════

  window.ferniPersonaBreathing = {
    profiles: {
      ferni: { duration: 4, ease: 'ease-in-out', scale: 1.03 },
      peter: { duration: 5, ease: 'ease', scale: 1.02 },
      alex: { duration: 3.5, ease: 'ease-in-out', scale: 1.04 },
      maya: { duration: 4.5, ease: 'ease', scale: 1.025 },
      jordan: { duration: 3, ease: 'ease-in-out', scale: 1.05 },
      nayan: { duration: 6, ease: 'ease', scale: 1.015 }
    },

    apply: function(element, persona) {
      const profile = this.profiles[persona] || this.profiles.ferni;
      
      element.style.animation = `personaBreathe-${persona} ${profile.duration}s ${profile.ease} infinite`;
      
      // Create keyframe if doesn't exist
      if (!document.querySelector(`#breathing-${persona}`)) {
        const style = document.createElement('style');
        style.id = `breathing-${persona}`;
        style.textContent = `
          @keyframes personaBreathe-${persona} {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(${profile.scale}); }
          }
        `;
        document.head.appendChild(style);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA WAVEFORM
  // Generates a unique waveform for each persona
  // ═══════════════════════════════════════════════════════════════════════════

  window.ferniWaveform = {
    create: function(container, persona) {
      const colors = {
        ferni: '#4a6741',
        peter: '#3a6b73',
        alex: '#5a6b8a',
        maya: '#a67a6a',
        jordan: '#c4856a',
        nayan: '#8a7a6a'
      };

      const barCount = 7;
      container.innerHTML = '';
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.gap = '3px';

      for (let i = 0; i < barCount; i++) {
        const bar = document.createElement('div');
        bar.style.cssText = `
          width: 3px;
          height: 20px;
          background: ${colors[persona] || colors.ferni};
          border-radius: 2px;
          animation: waveformBar 0.8s ease-in-out infinite;
          animation-delay: ${i * 0.1}s;
        `;
        container.appendChild(bar);
      }

      // Add keyframe if doesn't exist
      if (!document.querySelector('#waveform-keyframe')) {
        const style = document.createElement('style');
        style.id = 'waveform-keyframe';
        style.textContent = `
          @keyframes waveformBar {
            0%, 100% { transform: scaleY(0.3); }
            50% { transform: scaleY(1); }
          }
        `;
        document.head.appendChild(style);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE GLOBAL UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    window.ferniTimeAwareness.init();
    window.ferniStickyCTA.init();
    
    console.log('%c🛠️ Utilities loaded', 'color: #4a6741; font-weight: bold;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

