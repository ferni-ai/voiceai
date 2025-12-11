/**
 * Ferni Sentience - Next-Generation AI Interactions
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PHILOSOPHY: Make visitors FEEL understood before they even speak.
 *
 * This module adds five new "superhuman" capabilities:
 *
 * 1. SENTIMENT COLOR SHIFTS - Page warmth adapts to user engagement
 * 2. TYPING CADENCE MIRRORING - Ferni breathes with your typing rhythm
 * 3. EMOTIONAL CONTAGION - Ferni's mood influenced by detected sentiment
 * 4. ATTENTION AWARENESS - Subtle feedback where you've spent time
 * 5. PREDICTIVE PRESENCE - Anticipate and surface relevant content
 *
 * @module ferni-sentience
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  const CONFIG = {
    // Sentiment thresholds
    sentiment: {
      positive: 0.7, // Above this = warm colors
      negative: 0.3, // Below this = calming colors
      neutral: 0.5,
    },

    // Color shift ranges (HSL adjustments)
    colors: {
      warmShift: 10, // Degrees toward warm (positive sentiment)
      coolShift: -5, // Degrees toward cool (calming)
      saturationBoost: 5, // % increase for positive
      lightnessBoost: 3, // % increase for warmth
    },

    // Typing cadence settings
    typing: {
      sampleWindow: 5000, // ms to sample typing rhythm
      minKeystrokes: 3, // Minimum keystrokes before adapting
      breathMultiplier: 1.5, // How breath rate maps to typing rate
    },

    // Attention tracking
    attention: {
      minDuration: 2000, // ms before section counts as "attended"
      fadeDelay: 30000, // ms before attention fades
      maxSections: 5, // Max sections to track
    },

    // Reduced motion respect
    respectsReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const state = {
    sentiment: 0.5, // 0 = negative, 1 = positive
    engagementLevel: 0, // 0 = browsing, 1 = engaged, 2 = invested
    typingRhythm: null, // ms between keystrokes
    lastKeyTime: 0,
    keystrokeTimes: [],
    attentionMap: new Map(), // section -> { duration, lastSeen }
    scrollVelocity: 0,
    mouseMovement: 0,
    interactionCount: 0,
    ferniMood: 'present', // present, curious, warm, concerned, delighted
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SENTIMENT COLOR SHIFTS
  // The page subtly warms up as users engage positively
  // ═══════════════════════════════════════════════════════════════════════════

  const SentimentColors = {
    root: document.documentElement,

    // Behavioral signals that indicate sentiment
    signals: {
      fastScroll: -0.05, // Scanning, not reading
      slowScroll: 0.02, // Careful reading
      scrollPause: 0.03, // Thinking about content
      ctaHover: 0.05, // Interest in action
      teamClick: 0.08, // Engagement with personas
      faqOpen: 0.04, // Seeking information
      timeSpent30s: 0.05, // Invested time
      timeSpent60s: 0.08, // Very invested
      returnVisitor: 0.1, // They came back!
      demoOpen: 0.15, // Strong intent
    },

    init() {
      // Check returning visitor
      if (localStorage.getItem('ferni_visited')) {
        this.adjustSentiment('returnVisitor');
      }

      // Apply initial CSS custom properties
      this.applyColors();
    },

    adjustSentiment(signal) {
      const delta = this.signals[signal] || 0;
      state.sentiment = Math.max(0, Math.min(1, state.sentiment + delta));
      this.applyColors();

      // Update Ferni's mood based on sentiment
      EmotionalContagion.updateMood();
    },

    applyColors() {
      if (CONFIG.respectsReducedMotion) return;

      // Calculate color adjustments based on sentiment
      const sentimentDelta = state.sentiment - CONFIG.sentiment.neutral;

      // Hue shift (warmer for positive, cooler for calming)
      const hueShift =
        sentimentDelta > 0
          ? sentimentDelta * CONFIG.colors.warmShift
          : sentimentDelta * CONFIG.colors.coolShift;

      // Saturation boost for positive engagement
      const satBoost = sentimentDelta > 0 ? sentimentDelta * CONFIG.colors.saturationBoost : 0;

      // Lightness adjustment
      const lightBoost = sentimentDelta * CONFIG.colors.lightnessBoost;

      // Apply as CSS custom properties for use in animations
      this.root.style.setProperty('--sentiment-hue-shift', `${hueShift}deg`);
      this.root.style.setProperty('--sentiment-saturation-boost', `${satBoost}%`);
      this.root.style.setProperty('--sentiment-lightness-boost', `${lightBoost}%`);
      this.root.style.setProperty('--sentiment-level', state.sentiment);

      // Subtle filter adjustment on hero background
      const warmth = 0.9 + state.sentiment * 0.2;
      this.root.style.setProperty(
        '--warmth-filter',
        `sepia(${(state.sentiment - 0.5) * 10}%) saturate(${warmth * 100}%)`
      );
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. TYPING CADENCE MIRRORING
  // Ferni's breathing syncs with your typing rhythm
  // ═══════════════════════════════════════════════════════════════════════════

  const TypingMirror = {
    inputs: null,
    orb: null,

    init() {
      this.inputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea');
      this.orb = document.querySelector('[data-hero-orb], [data-orb-aware], .hero-ferni');

      this.inputs.forEach((input) => {
        input.addEventListener('keydown', this.handleKeydown.bind(this));
        input.addEventListener('focus', this.handleFocus.bind(this));
        input.addEventListener('blur', this.handleBlur.bind(this));
      });
    },

    handleKeydown(e) {
      const now = Date.now();

      // Track keystroke timing
      if (state.lastKeyTime > 0) {
        const gap = now - state.lastKeyTime;
        state.keystrokeTimes.push(gap);

        // Keep only recent keystrokes
        if (state.keystrokeTimes.length > 20) {
          state.keystrokeTimes.shift();
        }

        // Calculate rhythm after minimum keystrokes
        if (state.keystrokeTimes.length >= CONFIG.typing.minKeystrokes) {
          this.calculateRhythm();
        }
      }

      state.lastKeyTime = now;

      // Positive sentiment signal for typing engagement
      if (state.keystrokeTimes.length > 5) {
        SentimentColors.adjustSentiment('slowScroll'); // Repurpose as "engaged typing"
      }
    },

    handleFocus() {
      // Ferni "leans in" when you start typing
      if (this.orb && !CONFIG.respectsReducedMotion) {
        this.orb.classList.add('ferni-listening-to-typing');
      }
    },

    handleBlur() {
      // Reset when done typing
      if (this.orb) {
        this.orb.classList.remove('ferni-listening-to-typing');
      }
      state.keystrokeTimes = [];
      state.typingRhythm = null;
      this.resetBreath();
    },

    calculateRhythm() {
      const avg = state.keystrokeTimes.reduce((a, b) => a + b, 0) / state.keystrokeTimes.length;
      state.typingRhythm = avg;

      // Map typing rhythm to breath rate
      // Fast typing (100ms gaps) = faster breathing
      // Slow typing (500ms gaps) = slower, contemplative breathing
      const breathRate = Math.max(2000, Math.min(6000, avg * CONFIG.typing.breathMultiplier * 10));

      this.syncBreath(breathRate);
    },

    syncBreath(rate) {
      if (!this.orb || CONFIG.respectsReducedMotion) return;

      // Apply synced breathing animation
      this.orb.style.setProperty('--typing-breath-rate', `${rate}ms`);
      this.orb.classList.add('ferni-typing-sync');
    },

    resetBreath() {
      if (!this.orb) return;
      this.orb.classList.remove('ferni-typing-sync');
      this.orb.style.removeProperty('--typing-breath-rate');
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. EMOTIONAL CONTAGION
  // Ferni's mood is influenced by detected user sentiment
  // ═══════════════════════════════════════════════════════════════════════════

  const EmotionalContagion = {
    orb: null,
    moodIndicator: null,
    currentMood: 'present',

    moods: {
      present: {
        breathRate: 4000,
        glowIntensity: 0.3,
        pulseChance: 0.1,
        description: 'Calm, attentive presence',
      },
      curious: {
        breathRate: 3500,
        glowIntensity: 0.4,
        pulseChance: 0.2,
        description: 'Engaged and interested',
      },
      warm: {
        breathRate: 4500,
        glowIntensity: 0.5,
        pulseChance: 0.3,
        description: 'Connected and welcoming',
      },
      delighted: {
        breathRate: 3000,
        glowIntensity: 0.6,
        pulseChance: 0.4,
        description: 'Excited and encouraging',
      },
      concerned: {
        breathRate: 5000,
        glowIntensity: 0.35,
        pulseChance: 0.15,
        description: 'Attentive and supportive',
      },
    },

    init() {
      this.orb = document.querySelector('[data-hero-orb], [data-orb-aware], .hero-ferni');
      this.updateMood();
    },

    updateMood() {
      const sentiment = state.sentiment;
      const engagement = state.engagementLevel;

      // Determine mood based on sentiment and engagement
      let newMood = 'present';

      if (sentiment > 0.8 && engagement >= 1) {
        newMood = 'delighted';
      } else if (sentiment > 0.65) {
        newMood = 'warm';
      } else if (sentiment > 0.55 && engagement >= 1) {
        newMood = 'curious';
      } else if (sentiment < 0.35) {
        newMood = 'concerned';
      }

      if (newMood !== this.currentMood) {
        this.transitionToMood(newMood);
      }
    },

    transitionToMood(mood) {
      if (!this.orb || CONFIG.respectsReducedMotion) return;

      const moodConfig = this.moods[mood];
      if (!moodConfig) return;

      // Remove old mood class
      Object.keys(this.moods).forEach((m) => {
        this.orb.classList.remove(`ferni-mood-${m}`);
      });

      // Add new mood class
      this.orb.classList.add(`ferni-mood-${mood}`);

      // Apply mood-specific CSS properties
      this.orb.style.setProperty('--mood-breath-rate', `${moodConfig.breathRate}ms`);
      this.orb.style.setProperty('--mood-glow-intensity', moodConfig.glowIntensity);

      this.currentMood = mood;
      state.ferniMood = mood;

      // Occasional mood pulse
      if (Math.random() < moodConfig.pulseChance) {
        this.moodPulse();
      }
    },

    moodPulse() {
      if (!this.orb || CONFIG.respectsReducedMotion) return;

      this.orb.animate(
        [
          { transform: 'scale(1)', filter: 'brightness(1)' },
          { transform: 'scale(1.03)', filter: 'brightness(1.1)' },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ],
        {
          duration: 600,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        }
      );
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ATTENTION AWARENESS
  // Subtle visual feedback showing where user has spent time
  // ═══════════════════════════════════════════════════════════════════════════

  const AttentionAwareness = {
    sections: null,
    observer: null,
    visibilityTimers: new Map(),

    init() {
      this.sections = document.querySelectorAll('section[id], .section');
      this.setupObserver();
    },

    setupObserver() {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const section = entry.target;
            const sectionId = section.id || section.className;

            if (entry.isIntersecting) {
              this.startTracking(section, sectionId);
            } else {
              this.stopTracking(sectionId);
            }
          });
        },
        { threshold: 0.5 }
      );

      this.sections.forEach((section) => this.observer.observe(section));
    },

    startTracking(section, sectionId) {
      const startTime = Date.now();

      const timer = setInterval(() => {
        const duration = Date.now() - startTime;

        // Update attention map
        state.attentionMap.set(sectionId, {
          duration,
          lastSeen: Date.now(),
          element: section,
        });

        // Mark section as "attended" after threshold
        if (duration >= CONFIG.attention.minDuration) {
          this.markAttended(section, duration);
        }

        // Positive sentiment signal for attention
        if (duration === CONFIG.attention.minDuration) {
          SentimentColors.adjustSentiment('scrollPause');
        }
      }, 500);

      this.visibilityTimers.set(sectionId, timer);
    },

    stopTracking(sectionId) {
      const timer = this.visibilityTimers.get(sectionId);
      if (timer) {
        clearInterval(timer);
        this.visibilityTimers.delete(sectionId);
      }
    },

    markAttended(section, duration) {
      if (CONFIG.respectsReducedMotion) return;

      // Add subtle "attended" indicator
      if (!section.classList.contains('ferni-attended')) {
        section.classList.add('ferni-attended');

        // Intensity based on duration
        const intensity = Math.min(1, duration / 10000);
        section.style.setProperty('--attention-intensity', intensity);
      }
    },

    // Get most attended sections (for predictive content)
    getMostAttended(count = 3) {
      const sorted = Array.from(state.attentionMap.entries())
        .sort((a, b) => b[1].duration - a[1].duration)
        .slice(0, count);

      return sorted.map(([id, data]) => ({ id, ...data }));
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PREDICTIVE PRESENCE
  // Anticipate and surface relevant content based on behavior patterns
  // ═══════════════════════════════════════════════════════════════════════════

  const PredictivePresence = {
    patterns: {
      // Pattern: User spent time on team section
      teamInterest: {
        trigger: () => {
          const teamAttention = state.attentionMap.get('team');
          return teamAttention && teamAttention.duration > 5000;
        },
        action: () => this.highlightCTA('Meet the team →', '#team'),
      },

      // Pattern: User read pricing carefully
      pricingIntent: {
        trigger: () => {
          const pricingAttention = state.attentionMap.get('pricing');
          return pricingAttention && pricingAttention.duration > 8000;
        },
        action: () => this.showSoftNudge('Ready to start? Your first 5 conversations are free.'),
      },

      // Pattern: User scrolled past CTA multiple times
      ctaHesitation: {
        trigger: () => state.interactionCount > 10 && !state.hasClickedCTA,
        action: () => this.showSoftNudge('No pressure. Just try talking to Ferni.'),
      },

      // Pattern: High engagement, not converted
      highEngagementNoConversion: {
        trigger: () => state.sentiment > 0.7 && state.engagementLevel >= 2 && !state.hasConverted,
        action: () => this.pulseDemo(),
      },
    },

    triggeredPatterns: new Set(),

    init() {
      // Check patterns periodically
      setInterval(() => this.checkPatterns(), 5000);
    },

    checkPatterns() {
      Object.entries(this.patterns).forEach(([name, pattern]) => {
        if (!this.triggeredPatterns.has(name) && pattern.trigger()) {
          this.triggeredPatterns.add(name);
          pattern.action();
        }
      });
    },

    highlightCTA(text, href) {
      // Subtle highlight on relevant CTA
      const cta = document.querySelector(`a[href="${href}"]`);
      if (cta && !CONFIG.respectsReducedMotion) {
        cta.classList.add('ferni-suggested');

        // Remove after 5 seconds
        setTimeout(() => cta.classList.remove('ferni-suggested'), 5000);
      }
    },

    showSoftNudge(message) {
      // Non-intrusive nudge (not a popup)
      const existing = document.querySelector('.ferni-soft-nudge');
      if (existing) return;

      const nudge = document.createElement('div');
      nudge.className = 'ferni-soft-nudge';
      nudge.innerHTML = `
        <div class="ferni-soft-nudge__avatar">FE</div>
        <p class="ferni-soft-nudge__message">${message}</p>
      `;

      document.body.appendChild(nudge);

      // Animate in
      requestAnimationFrame(() => {
        nudge.classList.add('is-visible');
      });

      // Remove after 8 seconds
      setTimeout(() => {
        nudge.classList.remove('is-visible');
        setTimeout(() => nudge.remove(), 500);
      }, 8000);
    },

    pulseDemo() {
      const demoTrigger = document.querySelector('.ferni-demo-trigger');
      if (demoTrigger && !CONFIG.respectsReducedMotion) {
        demoTrigger.classList.add('ferni-pulse-attention');
        setTimeout(() => demoTrigger.classList.remove('ferni-pulse-attention'), 3000);
      }
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL VELOCITY TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  const ScrollTracker = {
    lastScrollY: 0,
    lastScrollTime: 0,
    velocitySamples: [],

    init() {
      window.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
    },

    handleScroll() {
      const now = Date.now();
      const currentY = window.scrollY;

      if (this.lastScrollTime > 0) {
        const deltaY = Math.abs(currentY - this.lastScrollY);
        const deltaT = now - this.lastScrollTime;
        const velocity = deltaY / deltaT;

        this.velocitySamples.push(velocity);
        if (this.velocitySamples.length > 10) this.velocitySamples.shift();

        state.scrollVelocity =
          this.velocitySamples.reduce((a, b) => a + b, 0) / this.velocitySamples.length;

        // Sentiment signals based on scroll behavior
        if (velocity > 3) {
          SentimentColors.adjustSentiment('fastScroll');
        } else if (velocity < 0.5 && velocity > 0) {
          SentimentColors.adjustSentiment('slowScroll');
        }
      }

      this.lastScrollY = currentY;
      this.lastScrollTime = now;
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACTION TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  const InteractionTracker = {
    init() {
      // Track CTA hovers
      document.querySelectorAll('.btn--primary, .btn--secondary').forEach((btn) => {
        btn.addEventListener('mouseenter', () => {
          SentimentColors.adjustSentiment('ctaHover');
          state.interactionCount++;
        });

        btn.addEventListener('click', () => {
          state.hasClickedCTA = true;
          SentimentColors.adjustSentiment('demoOpen');
        });
      });

      // Track team card clicks
      document.querySelectorAll('.team-card, .persona-card').forEach((card) => {
        card.addEventListener('click', () => {
          SentimentColors.adjustSentiment('teamClick');
          state.engagementLevel = Math.min(2, state.engagementLevel + 1);
        });
      });

      // Track FAQ opens
      document.querySelectorAll('.faq-item, details').forEach((item) => {
        item.addEventListener('toggle', () => {
          SentimentColors.adjustSentiment('faqOpen');
        });
      });

      // Time-based engagement
      setTimeout(() => {
        SentimentColors.adjustSentiment('timeSpent30s');
        state.engagementLevel = Math.min(2, state.engagementLevel + 1);
      }, 30000);

      setTimeout(() => {
        SentimentColors.adjustSentiment('timeSpent60s');
        state.engagementLevel = 2;
      }, 60000);

      // Demo modal tracking
      document.addEventListener('click', (e) => {
        if (e.target.closest('.ferni-demo-trigger')) {
          SentimentColors.adjustSentiment('demoOpen');
          state.engagementLevel = 2;
        }
      });
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CSS INJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById('ferni-sentience-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'ferni-sentience-styles';
    styles.textContent = `
      /* Sentiment color shifts */
      :root {
        --sentiment-hue-shift: 0deg;
        --sentiment-saturation-boost: 0%;
        --sentiment-lightness-boost: 0%;
        --sentiment-level: 0.5;
        --warmth-filter: none;
      }
      
      .hero__bg {
        filter: var(--warmth-filter);
        transition: filter 2s ease;
      }
      
      /* Typing sync breathing */
      .ferni-typing-sync {
        animation: ferni-typing-breath var(--typing-breath-rate, 4000ms) ease-in-out infinite !important;
      }
      
      @keyframes ferni-typing-breath {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
      }
      
      .ferni-listening-to-typing {
        transform: translateY(-2px);
        transition: transform 0.3s ease;
      }
      
      /* Mood states */
      .ferni-mood-present { --mood-color: var(--color-ferni, #4a6741); }
      .ferni-mood-curious { --mood-color: #5a8060; }
      .ferni-mood-warm { --mood-color: #6a9070; }
      .ferni-mood-delighted { --mood-color: #7aa080; }
      .ferni-mood-concerned { --mood-color: #5a7050; }
      
      [class*="ferni-mood-"] {
        animation: mood-breath var(--mood-breath-rate, 4000ms) ease-in-out infinite;
      }
      
      @keyframes mood-breath {
        0%, 100% { 
          box-shadow: 0 0 40px rgba(74, 103, 65, calc(var(--mood-glow-intensity, 0.3)));
        }
        50% { 
          box-shadow: 0 0 60px rgba(74, 103, 65, calc(var(--mood-glow-intensity, 0.3) + 0.1));
        }
      }
      
      /* Attention awareness */
      .ferni-attended {
        position: relative;
      }
      
      .ferni-attended::after {
        content: '';
        position: absolute;
        left: -20px;
        top: 50%;
        transform: translateY(-50%);
        width: 4px;
        height: calc(var(--attention-intensity, 0.5) * 60%);
        background: linear-gradient(180deg, transparent, var(--color-ferni, #4a6741), transparent);
        border-radius: 2px;
        opacity: 0.3;
        transition: height 0.5s ease, opacity 0.5s ease;
      }
      
      /* Suggested CTA highlight */
      .ferni-suggested {
        animation: ferni-suggest 2s ease infinite;
      }
      
      @keyframes ferni-suggest {
        0%, 100% { box-shadow: 0 0 0 0 rgba(74, 103, 65, 0); }
        50% { box-shadow: 0 0 20px 5px rgba(74, 103, 65, 0.3); }
      }
      
      /* Soft nudge */
      .ferni-soft-nudge {
        position: fixed;
        bottom: 100px;
        right: 24px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        background: var(--color-background-elevated, #faf8f5);
        border-radius: 24px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 9997;
        max-width: 300px;
      }
      
      .ferni-soft-nudge.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      
      .ferni-soft-nudge__avatar {
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #5a7751, #4a6741);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 10px;
        font-weight: 700;
        flex-shrink: 0;
      }
      
      .ferni-soft-nudge__message {
        font-size: 14px;
        color: var(--color-text-primary, #2c2520);
        margin: 0;
        line-height: 1.4;
      }
      
      /* Demo pulse attention */
      .ferni-pulse-attention {
        animation: ferni-pulse-attention 1s ease infinite;
      }
      
      @keyframes ferni-pulse-attention {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .ferni-typing-sync,
        [class*="ferni-mood-"],
        .ferni-suggested,
        .ferni-pulse-attention {
          animation: none !important;
        }
        
        .ferni-soft-nudge {
          transition: opacity 0.3s ease;
          transform: none;
        }
      }
    `;

    document.head.appendChild(styles);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    injectStyles();

    SentimentColors.init();
    TypingMirror.init();
    EmotionalContagion.init();
    AttentionAwareness.init();
    PredictivePresence.init();
    ScrollTracker.init();
    InteractionTracker.init();

    // Expose for debugging
    window.FerniSentience = {
      state: () => ({ ...state }),
      sentiment: () => state.sentiment,
      mood: () => state.ferniMood,
      attention: () => AttentionAwareness.getMostAttended(),
      adjustSentiment: (signal) => SentimentColors.adjustSentiment(signal),
    };

    console.log('%c🧠 Ferni Sentience loaded', 'color: #4a6741; font-weight: bold;');
    console.log('%c5 New Capabilities Active:', 'color: #756a5e; font-size: 11px;');
    console.log('%c  1. Sentiment Color Shifts', 'color: #756a5e; font-size: 10px;');
    console.log('%c  2. Typing Cadence Mirroring', 'color: #756a5e; font-size: 10px;');
    console.log('%c  3. Emotional Contagion', 'color: #756a5e; font-size: 10px;');
    console.log('%c  4. Attention Awareness', 'color: #756a5e; font-size: 10px;');
    console.log('%c  5. Predictive Presence', 'color: #756a5e; font-size: 10px;');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
