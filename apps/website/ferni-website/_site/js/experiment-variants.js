/**
 * Experiment Variants
 *
 * Applies A/B test variants to the landing page DOM.
 * Works with the FerniExperiments system to dynamically
 * update content based on variant assignments.
 *
 * Usage: Include after experiments.js
 *
 * @module experiment-variants
 */

(function () {
  'use strict';

  // ============================================================================
  // VARIANT DEFINITIONS (must match backend variant-library.ts)
  // ============================================================================

  const HERO_HEADLINE_VARIANTS = {
    control: {
      tagline: 'Better than human.',
      headline: 'Finally, someone who <span class="hero__headline-accent">gets it.</span>',
      subhead:
        "Someone who remembers your whole story, hears what you're not saying, and shows up at 2am with the same presence as noon.",
    },
    emotional_question: {
      tagline: 'Your AI life coach.',
      headline: 'What if someone actually <span class="hero__headline-accent">understood?</span>',
      subhead:
        'Six AI specialists who listen without judgment, remember everything, and help you grow. Available whenever you need them.',
    },
    team_focus: {
      tagline: 'Better than human.',
      headline: 'Six brilliant minds. <span class="hero__headline-accent">One conversation.</span>',
      subhead:
        'A life coach, mentor, researcher, strategist, habit expert, and planner—all working together for you.',
    },
    memory_focus: {
      tagline: 'Beyond human limitations.',
      headline: 'Someone who never <span class="hero__headline-accent">forgets.</span>',
      subhead:
        'That thing you mentioned six months ago? We remember. Every detail, every context, every nuance of your story.',
    },
    presence_focus: {
      tagline: 'Always here for you.',
      headline: 'Never too busy. <span class="hero__headline-accent">Never too tired.</span>',
      subhead:
        "Your best friend has their own problems. Your therapist has other patients. We're fully present, every time.",
    },
  };

  const HERO_CTA_VARIANTS = {
    control: {
      text: 'Start Free',
      style: 'primary',
      icon: true,
    },
    meet_ferni: {
      text: 'Meet Ferni',
      style: 'primary',
      icon: true,
    },
    begin_conversation: {
      text: 'Begin a Real Conversation',
      style: 'primary',
      icon: true,
    },
    try_now: {
      text: 'Try Ferni Now',
      style: 'primary',
      icon: true,
    },
    no_icon: {
      text: 'Start Free',
      style: 'primary',
      icon: false,
    },
  };

  const TRUST_BADGE_VARIANTS = {
    control: {
      position: 'below-cta',
      style: 'minimal',
    },
    above_cta: {
      position: 'above-cta',
      style: 'minimal',
    },
    prominent: {
      position: 'below-cta',
      style: 'prominent',
    },
    hidden: {
      position: 'below-cta',
      style: 'hidden',
    },
  };

  // ============================================================================
  // DOM MANIPULATION
  // ============================================================================

  const ARROW_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  /**
   * Apply hero headline variant
   */
  function applyHeroHeadline(variantId) {
    const variant = HERO_HEADLINE_VARIANTS[variantId];
    if (!variant) {
      console.warn('[Variants] Unknown headline variant:', variantId);
      return;
    }

    const tagline = document.querySelector('.hero__tagline');
    const headline = document.querySelector('.hero__headline');
    const subhead = document.querySelector('.hero__subhead');

    if (tagline) {
      tagline.textContent = variant.tagline;
    }

    if (headline) {
      headline.innerHTML = variant.headline;
    }

    if (subhead) {
      subhead.textContent = variant.subhead;
    }

    console.log('[Variants] Applied headline variant:', variantId);
  }

  /**
   * Apply hero CTA variant
   */
  function applyHeroCTA(variantId) {
    const variant = HERO_CTA_VARIANTS[variantId];
    if (!variant) {
      console.warn('[Variants] Unknown CTA variant:', variantId);
      return;
    }

    const ctaButton = document.querySelector('.hero__cta .btn--primary');
    if (!ctaButton) return;

    // Update text and icon
    if (variant.icon) {
      ctaButton.innerHTML = variant.text + ' ' + ARROW_ICON;
    } else {
      ctaButton.textContent = variant.text;
    }

    // Update style
    ctaButton.classList.remove('btn--primary', 'btn--secondary', 'btn--ghost');
    ctaButton.classList.add('btn--' + variant.style);

    console.log('[Variants] Applied CTA variant:', variantId);
  }

  /**
   * Apply trust badge variant
   */
  function applyTrustBadges(variantId) {
    const variant = TRUST_BADGE_VARIANTS[variantId];
    if (!variant) {
      console.warn('[Variants] Unknown trust badge variant:', variantId);
      return;
    }

    const badges = document.querySelector('.hero__badges');
    const cta = document.querySelector('.hero__cta');

    if (!badges || !cta) return;

    // Handle position
    if (variant.position === 'above-cta') {
      cta.parentNode.insertBefore(badges, cta);
    } else if (variant.position === 'below-cta') {
      cta.parentNode.insertBefore(badges, cta.nextSibling);
    }

    // Handle style
    if (variant.style === 'hidden') {
      badges.style.display = 'none';
    } else if (variant.style === 'prominent') {
      badges.classList.add('hero__badges--prominent');
    } else {
      badges.classList.remove('hero__badges--prominent');
      badges.style.display = '';
    }

    console.log('[Variants] Applied trust badge variant:', variantId);
  }

  // ============================================================================
  // EXPERIMENT INITIALIZATION
  // ============================================================================

  const ACTIVE_EXPERIMENTS = ['hero-headline', 'hero-cta', 'trust-badges'];

  /**
   * Apply a variant to the page
   */
  function applyVariant(experimentId, variantId) {
    if (!variantId) return;

    switch (experimentId) {
      case 'hero-headline':
        applyHeroHeadline(variantId);
        break;
      case 'hero-cta':
        applyHeroCTA(variantId);
        break;
      case 'trust-badges':
        applyTrustBadges(variantId);
        break;
      default:
        console.warn('[Variants] Unknown experiment:', experimentId);
    }
  }

  /**
   * Initialize all experiments
   */
  async function initExperiments() {
    // Check if FerniExperiments is available
    if (typeof window.FerniExperiments === 'undefined') {
      console.warn('[Variants] FerniExperiments not loaded, using control variants');
      return;
    }

    // Apply variants for each active experiment
    for (const experimentId of ACTIVE_EXPERIMENTS) {
      try {
        const variantId = await window.FerniExperiments.getVariant(experimentId);
        if (variantId) {
          applyVariant(experimentId, variantId);
        }
      } catch (error) {
        console.warn('[Variants] Failed to get variant for', experimentId, error);
      }
    }
  }

  /**
   * Preview a specific variant (for testing)
   */
  function previewVariant(experimentId, variantId) {
    applyVariant(experimentId, variantId);
    console.log('[Variants] Preview applied:', experimentId, '->', variantId);
  }

  /**
   * Get all available variants for an experiment
   */
  function getAvailableVariants(experimentId) {
    switch (experimentId) {
      case 'hero-headline':
        return Object.keys(HERO_HEADLINE_VARIANTS);
      case 'hero-cta':
        return Object.keys(HERO_CTA_VARIANTS);
      case 'trust-badges':
        return Object.keys(TRUST_BADGE_VARIANTS);
      default:
        return [];
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExperiments);
  } else {
    // Small delay to ensure FerniExperiments is loaded
    setTimeout(initExperiments, 10);
  }

  // Export for testing and debugging
  window.FerniVariants = {
    applyVariant: applyVariant,
    previewVariant: previewVariant,
    getAvailableVariants: getAvailableVariants,
    variants: {
      'hero-headline': HERO_HEADLINE_VARIANTS,
      'hero-cta': HERO_CTA_VARIANTS,
      'trust-badges': TRUST_BADGE_VARIANTS,
    },
  };

  console.log('%c🎨 Ferni Variants loaded', 'color: #4a6741; font-weight: bold;');
})();
