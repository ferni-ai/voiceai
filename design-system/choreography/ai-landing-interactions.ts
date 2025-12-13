/**
 * AI Landing Interaction Choreography
 *
 * Animation and interaction patterns for AI-powered landing page components.
 * These patterns follow Ferni's "Better than Human" emotional intelligence philosophy.
 *
 * @module choreography/ai-landing-interactions
 */

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

export const AI_LANDING_TIMING = {
  // Chat widget
  chatPanelOpen: 300, // ms - panel slide in
  chatPanelClose: 200, // ms - panel slide out
  messageAppear: 300, // ms - message animation
  typingDotCycle: 1400, // ms - typing indicator loop

  // Hover preview
  hoverDelay: 500, // ms - delay before showing tooltip
  tooltipFadeIn: 200, // ms - tooltip appear
  tooltipFadeOut: 150, // ms - tooltip disappear

  // Micro-expressions
  expressionFlash: 120, // ms - subliminal expression change
  expressionReset: 3000, // ms - reset to neutral

  // Social proof rotation
  socialProofInterval: 8000, // ms - time between snippets
  socialProofFade: 300, // ms - fade transition

  // Content personalization
  personalizedFade: 500, // ms - fade in personalized content
  sentimentCopyTransition: 500, // ms - copy change animation
};

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

export const AI_LANDING_EASINGS = {
  // Chat panel - spring for life
  panelSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',

  // Message appear - gentle ease
  messageEase: 'ease',

  // Tooltip - snappy
  tooltipEase: 'ease',

  // Expression flash - quick out
  expressionEase: 'ease-out',

  // Content fade - smooth
  contentEase: 'ease',
};

// ============================================================================
// CHAT WIDGET CHOREOGRAPHY
// ============================================================================

/**
 * Chat panel open animation sequence
 *
 * Choreography:
 * 1. Panel scales from 0.95 to 1
 * 2. Panel fades from 0 to 1
 * 3. Panel slides from translateY(20px) to translateY(0)
 * All happen simultaneously with spring easing
 */
export function animateChatPanelOpen(panel: HTMLElement): Animation {
  return panel.animate(
    [
      {
        opacity: 0,
        transform: 'translateY(20px) scale(0.95)',
      },
      {
        opacity: 1,
        transform: 'translateY(0) scale(1)',
      },
    ],
    {
      duration: AI_LANDING_TIMING.chatPanelOpen,
      easing: AI_LANDING_EASINGS.panelSpring,
      fill: 'forwards',
    }
  );
}

/**
 * Chat panel close animation sequence
 */
export function animateChatPanelClose(panel: HTMLElement): Animation {
  return panel.animate(
    [
      {
        opacity: 1,
        transform: 'translateY(0) scale(1)',
      },
      {
        opacity: 0,
        transform: 'translateY(10px) scale(0.98)',
      },
    ],
    {
      duration: AI_LANDING_TIMING.chatPanelClose,
      easing: 'ease-out',
      fill: 'forwards',
    }
  );
}

/**
 * Chat message appear animation
 *
 * Choreography:
 * 1. Message fades in
 * 2. Message slides up from translateY(10px)
 */
export function animateChatMessage(message: HTMLElement): Animation {
  return message.animate(
    [
      {
        opacity: 0,
        transform: 'translateY(10px)',
      },
      {
        opacity: 1,
        transform: 'translateY(0)',
      },
    ],
    {
      duration: AI_LANDING_TIMING.messageAppear,
      easing: AI_LANDING_EASINGS.messageEase,
      fill: 'forwards',
    }
  );
}

/**
 * Typing indicator dot animation keyframes
 */
export const typingDotKeyframes = `
@keyframes typingDot {
  0%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
`;

// ============================================================================
// HOVER PREVIEW CHOREOGRAPHY
// ============================================================================

/**
 * Tooltip appear animation
 *
 * Choreography:
 * 1. Wait for hover delay (500ms)
 * 2. Fade in with upward slide
 */
export function animateTooltipAppear(tooltip: HTMLElement): Animation {
  return tooltip.animate(
    [
      {
        opacity: 0,
        transform: 'translateX(-50%) translateY(0)',
      },
      {
        opacity: 1,
        transform: 'translateX(-50%) translateY(-5px)',
      },
    ],
    {
      duration: AI_LANDING_TIMING.tooltipFadeIn,
      easing: AI_LANDING_EASINGS.tooltipEase,
      fill: 'forwards',
    }
  );
}

/**
 * Tooltip disappear animation
 */
export function animateTooltipDisappear(tooltip: HTMLElement): Animation {
  return tooltip.animate(
    [
      {
        opacity: 1,
        transform: 'translateX(-50%) translateY(-5px)',
      },
      {
        opacity: 0,
        transform: 'translateX(-50%) translateY(0)',
      },
    ],
    {
      duration: AI_LANDING_TIMING.tooltipFadeOut,
      easing: 'ease-out',
      fill: 'forwards',
    }
  );
}

// ============================================================================
// MICRO-EXPRESSION CHOREOGRAPHY
// ============================================================================

/**
 * Expression flash animation
 *
 * This is a subliminal effect (120ms) that creates
 * the "reading between the lines" feeling.
 *
 * Choreography:
 * 1. Flash brightness up to 1.15
 * 2. Return to normal
 * Total duration: 120ms (below conscious perception threshold)
 */
export function animateExpressionFlash(orb: HTMLElement): Animation {
  return orb.animate(
    [
      { filter: 'brightness(1)' },
      { filter: 'brightness(1.15)' },
      { filter: 'brightness(1)' },
    ],
    {
      duration: AI_LANDING_TIMING.expressionFlash,
      easing: AI_LANDING_EASINGS.expressionEase,
    }
  );
}

/**
 * Expression color shift
 *
 * Changes the orb's gradient to reflect the detected expression.
 */
export const EXPRESSION_COLORS = {
  present: { primary: '#5a7751', secondary: '#4a6741' },
  curious: { primary: '#5a8060', secondary: '#4a7050' },
  interested: { primary: '#6a9070', secondary: '#5a8060' },
  helpful: { primary: '#5a7751', secondary: '#4a6741' },
  concerned: { primary: '#5a7050', secondary: '#4a6040' },
  warm: { primary: '#7aa080', secondary: '#6a9070' },
};

export function setExpressionColor(
  orb: HTMLElement,
  expression: keyof typeof EXPRESSION_COLORS
): void {
  const colors = EXPRESSION_COLORS[expression];
  orb.style.background = `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`;
}

// ============================================================================
// SOCIAL PROOF CHOREOGRAPHY
// ============================================================================

/**
 * Social proof snippet transition
 *
 * Choreography:
 * 1. Current snippet fades out + slides up
 * 2. Wait 300ms
 * 3. New snippet fades in + slides up from below
 */
export function animateSocialProofTransition(
  container: HTMLElement,
  newContent: string
): Promise<void> {
  return new Promise((resolve) => {
    const textEl = container.querySelector('.social-proof-dynamic__text') as HTMLElement;
    if (!textEl) {
      resolve();
      return;
    }

    // Fade out
    textEl.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-10px)' },
      ],
      {
        duration: AI_LANDING_TIMING.socialProofFade,
        easing: 'ease-out',
        fill: 'forwards',
      }
    ).onfinish = () => {
      // Update content
      textEl.textContent = newContent;

      // Fade in
      textEl.animate(
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: AI_LANDING_TIMING.socialProofFade,
          easing: 'ease-out',
          fill: 'forwards',
        }
      ).onfinish = () => resolve();
    };
  });
}

// ============================================================================
// PERSONALIZED CONTENT CHOREOGRAPHY
// ============================================================================

/**
 * Personalized content fade in
 *
 * Applied to hero headlines, subheads, and CTAs when AI-generated
 * content replaces defaults.
 */
export function animatePersonalizedContent(element: HTMLElement): Animation {
  return element.animate(
    [
      { opacity: 0.5 },
      { opacity: 1 },
    ],
    {
      duration: AI_LANDING_TIMING.personalizedFade,
      easing: AI_LANDING_EASINGS.contentEase,
      fill: 'forwards',
    }
  );
}

/**
 * Sentiment-reactive copy transition
 *
 * Smoother transition when copy changes based on detected sentiment.
 */
export function animateSentimentCopyChange(element: HTMLElement): Animation {
  return element.animate(
    [
      { opacity: 0.7 },
      { opacity: 1 },
    ],
    {
      duration: AI_LANDING_TIMING.sentimentCopyTransition,
      easing: AI_LANDING_EASINGS.contentEase,
      fill: 'forwards',
    }
  );
}

// ============================================================================
// VOICE SAMPLE CHOREOGRAPHY
// ============================================================================

/**
 * Waveform bar animation keyframes
 */
export const waveformBarKeyframes = `
@keyframes waveBar {
  0%, 100% {
    height: 8px;
  }
  50% {
    height: 24px;
  }
}
`;

/**
 * Apply waveform animation when playing
 */
export function startWaveformAnimation(container: HTMLElement): void {
  const bars = container.querySelectorAll('.voice-sample__bar');
  bars.forEach((bar, index) => {
    (bar as HTMLElement).style.animation = `waveBar 0.6s ease-in-out infinite`;
    (bar as HTMLElement).style.animationDelay = `${index * 0.05}s`;
  });
}

/**
 * Stop waveform animation
 */
export function stopWaveformAnimation(container: HTMLElement): void {
  const bars = container.querySelectorAll('.voice-sample__bar');
  bars.forEach((bar) => {
    (bar as HTMLElement).style.animation = 'none';
    (bar as HTMLElement).style.height = '8px';
  });
}

// ============================================================================
// MEMORY DEMO CHOREOGRAPHY
// ============================================================================

/**
 * Memory visualization reveal animation
 *
 * Choreography:
 * 1. Today card slides in from left
 * 2. Connection line draws
 * 3. Future card slides in from right
 * All with staggered timing
 */
export function animateMemoryReveal(container: HTMLElement): void {
  const todayCard = container.querySelector('.memory-demo__today');
  const futureCard = container.querySelector('.memory-demo__future');
  const connection = container.querySelector('.memory-demo__connection');

  if (todayCard) {
    (todayCard as HTMLElement).animate(
      [
        { opacity: 0, transform: 'translateX(-20px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      {
        duration: 400,
        easing: 'ease-out',
        fill: 'forwards',
      }
    );
  }

  if (connection) {
    setTimeout(() => {
      (connection as HTMLElement).animate(
        [{ opacity: 0 }, { opacity: 1 }],
        {
          duration: 300,
          easing: 'ease',
          fill: 'forwards',
        }
      );
    }, 200);
  }

  if (futureCard) {
    setTimeout(() => {
      (futureCard as HTMLElement).animate(
        [
          { opacity: 0, transform: 'translateX(20px)' },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        {
          duration: 400,
          easing: 'ease-out',
          fill: 'forwards',
        }
      );
    }, 300);
  }
}

// ============================================================================
// REDUCED MOTION SUPPORT
// ============================================================================

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get timing with reduced motion support
 */
export function getTiming(normalMs: number): number {
  return prefersReducedMotion() ? Math.min(normalMs, 100) : normalMs;
}

// ============================================================================
// CSS KEYFRAMES INJECTION
// ============================================================================

/**
 * Inject all AI landing animation keyframes into the document
 */
export function injectAILandingKeyframes(): void {
  if (document.getElementById('ai-landing-keyframes')) return;

  const style = document.createElement('style');
  style.id = 'ai-landing-keyframes';
  style.textContent = `
    ${typingDotKeyframes}
    ${waveformBarKeyframes}

    @keyframes chatMessageIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes personalizedFadeIn {
      from {
        opacity: 0.5;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes expressionFlash {
      0%, 100% {
        filter: brightness(1);
      }
      50% {
        filter: brightness(1.15);
      }
    }

    /* Reduced motion variants */
    @media (prefers-reduced-motion: reduce) {
      .ferni-chat-panel,
      .ferni-chat-message,
      .ferni-hover-preview,
      .is-personalized {
        animation: none !important;
        transition: opacity 0.1s !important;
      }

      .ferni-chat-typing__dot,
      .voice-sample__bar {
        animation: none !important;
      }
    }
  `;

  document.head.appendChild(style);
}

