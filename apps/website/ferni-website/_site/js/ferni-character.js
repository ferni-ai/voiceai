/**
 * Ferni Character & Polish
 * ========================
 * Adds personality, depth, and magic moments to the landing page.
 *
 * Features:
 * 1. Time-aware content - Different greetings based on time of day
 * 2. Rotating 2am scenarios - Emotional variety in the dark moments
 * 3. Ferni personality quirks - Thinking pauses, gentle humor
 * 4. Interactive micro-moments - Alive hover states
 * 5. Relief moment - Shows the exhale after talking
 * 6. Easter eggs - Konami code, scroll love, idle messages
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. TIME-AWARE CONTENT
  // Different hero messaging based on when you visit
  // ═══════════════════════════════════════════════════════════════════════════

  const TimeAwareContent = {
    init() {
      const hour = new Date().getHours();
      const heroTagline = document.querySelector('.hero__tagline');
      const heroSubhead = document.querySelector('.hero__subhead');

      if (!heroTagline) return;

      // Set time-appropriate content
      const content = this.getContentForHour(hour);

      // Add subtle data attribute for styling
      document.body.dataset.timeOfDay = content.period;

      // Update tagline with time-aware greeting
      if (content.tagline) {
        heroTagline.innerHTML = content.tagline;
        heroTagline.classList.add('time-aware');
      }
    },

    getContentForHour(hour) {
      // Late night (11pm - 5am)
      if (hour >= 23 || hour < 5) {
        return {
          period: 'late-night',
          tagline: 'Still up? <span class="tagline-soft">Me too.</span>',
        };
      }
      // Early morning (5am - 8am)
      if (hour >= 5 && hour < 8) {
        return {
          period: 'early-morning',
          tagline: 'Early start? <span class="tagline-soft">I\'m already here.</span>',
        };
      }
      // Morning (8am - 12pm)
      if (hour >= 8 && hour < 12) {
        return {
          period: 'morning',
          tagline: 'Better than human.',
        };
      }
      // Afternoon (12pm - 5pm)
      if (hour >= 12 && hour < 17) {
        return {
          period: 'afternoon',
          tagline: 'Need a moment? <span class="tagline-soft">I\'m here.</span>',
        };
      }
      // Evening (5pm - 8pm)
      if (hour >= 17 && hour < 20) {
        return {
          period: 'evening',
          tagline: 'Long day? <span class="tagline-soft">Tell me about it.</span>',
        };
      }
      // Night (8pm - 11pm)
      return {
        period: 'night',
        tagline: 'Better than human.',
      };
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ROTATING 2AM SCENARIOS
  // Different late-night thoughts that cycle through
  // ═══════════════════════════════════════════════════════════════════════════

  const TwoAmScenarios = {
    scenarios: [
      {
        quote: "I can't stop thinking about what I said to her...",
        context: "The words keep replaying. Did I mess everything up?",
      },
      {
        quote: "Why did I say I was fine when I wasn't?",
        context: "And now it's too late to bring it up again.",
      },
      {
        quote: "I keep checking my phone hoping they'll text first...",
        context: "This silence is saying something. I just don't want to hear it.",
      },
      {
        quote: "Everyone at dinner was laughing. I was just pretending.",
        context: "Nobody noticed. I'm not sure if that's better or worse.",
      },
      {
        quote: "I should be over this by now. Why am I still stuck?",
        context: "It's been months. What's wrong with me?",
      },
      {
        quote: "I don't know who to talk to about this...",
        context: "It's not urgent enough for a crisis line. But it's too heavy for a friend.",
      },
      {
        quote: "I keep making the same mistake. Again.",
        context: "I know what I should do. I just don't do it.",
      },
      {
        quote: "What if I'm not actually good at this?",
        context: "What if everyone else sees what I'm afraid of?",
      },
    ],

    currentIndex: 0,
    isAnimating: false,

    init() {
      const quoteEl = document.querySelector('.two-am__quote');
      const section = document.querySelector('.two-am');

      if (!quoteEl || !section) return;

      // Pick a random starting scenario
      this.currentIndex = Math.floor(Math.random() * this.scenarios.length);

      // Cycle scenarios when section is visible
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.startCycling(quoteEl);
          } else {
            this.stopCycling();
          }
        });
      }, { threshold: 0.3 });

      observer.observe(section);
    },

    cycleInterval: null,

    startCycling(quoteEl) {
      if (this.cycleInterval) return;

      // Cycle every 8 seconds
      this.cycleInterval = setInterval(() => {
        this.nextScenario(quoteEl);
      }, 8000);
    },

    stopCycling() {
      if (this.cycleInterval) {
        clearInterval(this.cycleInterval);
        this.cycleInterval = null;
      }
    },

    async nextScenario(quoteEl) {
      if (this.isAnimating) return;
      this.isAnimating = true;

      // Fade out
      quoteEl.style.opacity = '0';
      quoteEl.style.transform = 'translateY(-10px)';

      await this.wait(300);

      // Update content
      this.currentIndex = (this.currentIndex + 1) % this.scenarios.length;
      const scenario = this.scenarios[this.currentIndex];
      quoteEl.textContent = `"${scenario.quote}"`;

      // Fade in
      quoteEl.style.opacity = '1';
      quoteEl.style.transform = 'translateY(0)';

      this.isAnimating = false;
    },

    wait(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. FERNI PERSONALITY QUIRKS
  // Little moments that show personality
  // ═══════════════════════════════════════════════════════════════════════════

  const FerniPersonality = {
    // Thinking phrases Ferni might say
    thinkingPhrases: [
      "Hmm, let me sit with that for a moment...",
      "That's interesting... go on.",
      "I'm listening.",
      "Tell me more about that.",
      "That sounds like it matters to you.",
    ],

    // Gentle humor / self-aware moments
    selfAwareMoments: [
      "I know I'm an AI, but that doesn't mean I don't care.",
      "No judgment here. Seriously.",
      "Even at 3am, I'm fully present. That's my superpower.",
    ],

    init() {
      this.addThinkingIndicator();
      this.addPersonalityTooltips();
    },

    // Add a subtle "..." thinking indicator to Ferni's responses
    addThinkingIndicator() {
      const ferniBubbles = document.querySelectorAll('.two-am__ferni-says, .showcase__app-bubble--ai');

      ferniBubbles.forEach(bubble => {
        bubble.addEventListener('mouseenter', () => {
          // Subtle pulse on hover showing "thinking"
          bubble.classList.add('ferni-thinking');
        });
        bubble.addEventListener('mouseleave', () => {
          bubble.classList.remove('ferni-thinking');
        });
      });
    },

    // Add personality-revealing tooltips to certain elements
    addPersonalityTooltips() {
      const ferniAvatar = document.querySelector('.two-am__avatar-orb');
      if (ferniAvatar) {
        ferniAvatar.setAttribute('title', "I'm here. No rush.");
        ferniAvatar.style.cursor = 'default';
      }
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. INTERACTIVE MICRO-MOMENTS
  // Hover states that feel alive
  // ═══════════════════════════════════════════════════════════════════════════

  const MicroMoments = {
    init() {
      this.addOrbBreathing();
      this.addCursorAwareness();
      this.addTeamCardLife();
    },

    // Make orbs appear to "notice" your cursor
    addCursorAwareness() {
      const orbs = document.querySelectorAll(
        '.hero-ferni__orb, .two-am__avatar-orb, .final-cta__avatar-orb'
      );

      orbs.forEach(orb => {
        orb.addEventListener('mousemove', (e) => {
          const rect = orb.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          // Calculate distance from center
          const deltaX = (e.clientX - centerX) / rect.width;
          const deltaY = (e.clientY - centerY) / rect.height;

          // Subtle shift toward cursor (like eye tracking)
          const moveX = deltaX * 4; // pixels
          const moveY = deltaY * 4;

          orb.style.transform = `translate(${moveX}px, ${moveY}px)`;
        });

        orb.addEventListener('mouseleave', () => {
          orb.style.transform = '';
        });
      });
    },

    // Subtle breathing effect on the main orb
    addOrbBreathing() {
      const heroOrb = document.querySelector('.hero-ferni');
      if (heroOrb && !heroOrb.classList.contains('hero-ferni--breathing')) {
        heroOrb.classList.add('hero-ferni--breathing');
      }
    },

    // Team cards get subtle life on hover
    addTeamCardLife() {
      const teamCards = document.querySelectorAll('.team-card');

      teamCards.forEach(card => {
        const avatar = card.querySelector('.persona-avatar__orb');

        card.addEventListener('mouseenter', () => {
          if (avatar) {
            avatar.style.transform = 'scale(1.05)';
          }
        });

        card.addEventListener('mouseleave', () => {
          if (avatar) {
            avatar.style.transform = '';
          }
        });
      });
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. RELIEF MOMENT (Dynamic Section Enhancement)
  // Shows the exhale feeling after connecting
  // ═══════════════════════════════════════════════════════════════════════════

  const ReliefMoment = {
    init() {
      // Add relief indicator to the 2am section response
      const ferniResponse = document.querySelector('.two-am__response');
      if (!ferniResponse) return;

      // Add a subtle "relief" effect when you scroll to Ferni's response
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              entry.target.classList.add('relief-moment');
            }, 500);
          }
        });
      }, { threshold: 0.5 });

      observer.observe(ferniResponse);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. EASTER EGGS
  // Hidden delights for curious explorers
  // ═══════════════════════════════════════════════════════════════════════════

  const EasterEggs = {
    konamiCode: ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'],
    konamiIndex: 0,

    scrollLoveMessages: [
      "I see you exploring. Take your time.",
      "Still here. Still listening.",
      "Curiosity is beautiful.",
      "You're doing great.",
    ],

    idleMessages: [
      "I'll be here when you're ready.",
      "No rush. I'm not going anywhere.",
      "Take all the time you need.",
    ],

    lastScrollTime: Date.now(),
    scrollMessageShown: false,
    idleTimeout: null,
    hasShownIdleMessage: false,

    init() {
      this.setupKonamiCode();
      this.setupScrollLove();
      this.setupIdleDetection();
      this.setupConsoleEasterEgg();
    },

    // Konami code - shows a hidden message
    setupKonamiCode() {
      document.addEventListener('keydown', (e) => {
        if (e.key === this.konamiCode[this.konamiIndex]) {
          this.konamiIndex++;
          if (this.konamiIndex === this.konamiCode.length) {
            this.triggerKonamiReward();
            this.konamiIndex = 0;
          }
        } else {
          this.konamiIndex = 0;
        }
      });
    },

    triggerKonamiReward() {
      // Create a floating message
      const reward = document.createElement('div');
      reward.className = 'konami-reward';
      reward.innerHTML = `
        <div class="konami-reward__inner">
          <div class="konami-reward__orb">FE</div>
          <p class="konami-reward__message">You found me! Here's a secret: I really am listening, even when you're just scrolling.</p>
        </div>
      `;
      document.body.appendChild(reward);

      // Animate in
      setTimeout(() => {
        reward.classList.add('visible');
      }, 100);

      // Remove after 5 seconds
      setTimeout(() => {
        reward.classList.remove('visible');
        setTimeout(() => reward.remove(), 500);
      }, 5000);
    },

    // Show a gentle message after lots of scrolling
    setupScrollLove() {
      let scrollCount = 0;
      let lastScrollY = window.scrollY;

      window.addEventListener('scroll', () => {
        const delta = Math.abs(window.scrollY - lastScrollY);
        lastScrollY = window.scrollY;
        scrollCount += delta;
        this.lastScrollTime = Date.now();

        // After scrolling through ~3 pages worth
        if (scrollCount > window.innerHeight * 3 && !this.scrollMessageShown) {
          this.scrollMessageShown = true;
          this.showFloatingMessage(
            this.scrollLoveMessages[Math.floor(Math.random() * this.scrollLoveMessages.length)]
          );
        }
      }, { passive: true });
    },

    // Show idle message after inactivity
    setupIdleDetection() {
      const resetIdle = () => {
        this.lastScrollTime = Date.now();

        if (this.idleTimeout) {
          clearTimeout(this.idleTimeout);
        }

        // Show idle message after 45 seconds of no interaction
        if (!this.hasShownIdleMessage) {
          this.idleTimeout = setTimeout(() => {
            this.hasShownIdleMessage = true;
            this.showFloatingMessage(
              this.idleMessages[Math.floor(Math.random() * this.idleMessages.length)]
            );
          }, 45000);
        }
      };

      window.addEventListener('scroll', resetIdle, { passive: true });
      window.addEventListener('mousemove', resetIdle, { passive: true });
      window.addEventListener('keydown', resetIdle);

      resetIdle();
    },

    // Console easter egg for developers
    setupConsoleEasterEgg() {
      console.log(
        '%c Ferni ',
        'background: linear-gradient(135deg, #8AA678 0%, #5D7A4B 100%); color: white; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: bold;'
      );
      console.log(
        '%cHey there, curious one. 👋',
        'color: #8AA678; font-size: 12px;'
      );
      console.log(
        '%cWant to work with us? hello@ferni.ai',
        'color: #666; font-size: 11px;'
      );
    },

    showFloatingMessage(message) {
      const toast = document.createElement('div');
      toast.className = 'ferni-toast';
      toast.innerHTML = `
        <div class="ferni-toast__inner">
          <span class="ferni-toast__orb">FE</span>
          <span class="ferni-toast__message">${message}</span>
        </div>
      `;
      document.body.appendChild(toast);

      // Animate in
      setTimeout(() => {
        toast.classList.add('visible');
      }, 100);

      // Remove after 4 seconds
      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 500);
      }, 4000);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE ALL CHARACTER FEATURES
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    TimeAwareContent.init();

    // Only animate if motion is allowed
    if (!prefersReducedMotion) {
      TwoAmScenarios.init();
      MicroMoments.init();
      ReliefMoment.init();
    }

    FerniPersonality.init();
    EasterEggs.init();

    // Add character-ready class
    document.body.classList.add('ferni-character-ready');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.FerniCharacter = {
    TimeAwareContent,
    TwoAmScenarios,
    FerniPersonality,
    MicroMoments,
    ReliefMoment,
    EasterEggs,
  };
})();
