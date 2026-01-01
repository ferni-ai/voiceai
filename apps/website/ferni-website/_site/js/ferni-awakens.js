/**
 * Ferni Awakens - Hero Introduction Sequence
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Design Philosophy:
 * This isn't just an animation - it's Ferni introducing themselves.
 * Like when you connect to an agent in the app - you FEEL their presence.
 * Every beat has meaning. Every pause (Ma) creates anticipation.
 * 
 * The Connect Sequence (inspired by the app):
 * 1. Stillness - The visitor lands, Ferni notices
 * 2. Wake Up - Ferni's orb comes alive with a warm pulse
 * 3. "I See You" - FE appears with recognition micro-expression
 * 4. "I'm Here" - Waveform speaks: "Hey, I'm listening"
 * 5. Smile - A brief warmth pulse (the "Ferni smile")
 * 6. Team Introduction - Personas wave hello one by one
 * 7. "Let's Talk" - Text reveals, invitation to connect
 * 8. Presence - Continuous breathing, Ferni is fully present
 */

(function() {
  'use strict';

  // Timeline configuration (milliseconds) - Paced for emotional impact
  const TIMELINE = {
    STILLNESS: 400,        // Notice the visitor
    WAKE_UP: 500,          // Come alive
    I_SEE_YOU: 600,        // Recognition moment
    IM_HERE: 800,          // Waveform "hello"
    FERNI_SMILE: 400,      // Warmth pulse
    TEAM_STAGGER: 300,     // Time between each persona wave
    PERSONA_WAVE: 400,     // Each persona's wave duration
    LETS_TALK: 800,        // Text reveals with invitation
    PRESENCE: 600          // Settle into breathing
  };

  // Check if we've already played the intro (session)
  const hasPlayedIntro = sessionStorage.getItem('ferni-awakened');

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN AWAKENING SEQUENCE - THE FERNI CONNECT EXPERIENCE
  // ═══════════════════════════════════════════════════════════════════════════

  function ferniAwakens() {
    const hero = document.querySelector('[data-hero-section]');
    const orb = document.querySelector('[data-hero-orb]');
    const orbGlow = document.querySelector('.orb-glow');
    const feInitials = document.querySelector('[data-fe-initials]');
    const waveform = document.querySelector('[data-waveform]');
    const personas = document.querySelectorAll('[data-persona-orb]');
    const eyebrow = document.querySelector('[data-hero-eyebrow]');
    const headline = document.querySelector('[data-hero-headline]');
    const subhead = document.querySelector('[data-hero-subhead]');
    const ctas = document.querySelector('[data-hero-ctas]');

    // If elements missing, gracefully degrade
    if (!orb) {
      console.log('[Ferni] Hero elements not found, skipping intro');
      return;
    }

    // Skip intro for returning visitors (same session)
    if (hasPlayedIntro) {
      skipToReady();
      return;
    }

    // Mark as played for this session
    sessionStorage.setItem('ferni-awakened', 'true');

    // Start the sequence
    initializeHiddenState();
    
    let delay = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 1: STILLNESS - Ferni notices someone arrived
    // ─────────────────────────────────────────────────────────────────────────
    delay += TIMELINE.STILLNESS;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2: WAKE UP - Ferni comes alive (like connecting in the app)
    // ─────────────────────────────────────────────────────────────────────────
    setTimeout(() => {
      phaseWakeUp(orb, orbGlow);
    }, delay);
    delay += TIMELINE.WAKE_UP;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 3: "I SEE YOU" - Recognition micro-expression
    // ─────────────────────────────────────────────────────────────────────────
    setTimeout(() => {
      phaseISeeYou(feInitials, orb);
    }, delay);
    delay += TIMELINE.I_SEE_YOU;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 4: "I'M HERE" - Waveform says hello
    // ─────────────────────────────────────────────────────────────────────────
    setTimeout(() => {
      phaseImHere(waveform, orb);
    }, delay);
    delay += TIMELINE.IM_HERE;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 5: THE FERNI SMILE - Warmth pulse
    // ─────────────────────────────────────────────────────────────────────────
    setTimeout(() => {
      phaseFerniSmile(orb, orbGlow);
    }, delay);
    delay += TIMELINE.FERNI_SMILE;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 6: TEAM INTRODUCTION - Personas wave hello
    // ─────────────────────────────────────────────────────────────────────────
    setTimeout(() => {
      phaseTeamIntro(personas);
    }, delay);
    delay += personas.length * TIMELINE.TEAM_STAGGER + TIMELINE.PERSONA_WAVE;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 7: "LET'S TALK" - Text reveals with invitation
    // ─────────────────────────────────────────────────────────────────────────
    setTimeout(() => {
      phaseLetsTalk(eyebrow, headline, subhead, ctas);
    }, delay);
    delay += TIMELINE.LETS_TALK;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 8: PRESENCE - Ferni settles into breathing, fully present
    // ─────────────────────────────────────────────────────────────────────────
    setTimeout(() => {
      phasePresence(orb);
    }, delay);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE IMPLEMENTATIONS - HUMAN-LIKE CONNECT EXPERIENCE
  // ═══════════════════════════════════════════════════════════════════════════

  function initializeHiddenState() {
    const hero = document.querySelector('[data-hero-section]');
    if (hero) hero.classList.add('ferni-awakening');

    // Hide personas initially
    document.querySelectorAll('[data-persona-orb]').forEach(p => {
      p.style.opacity = '0';
      p.style.transform = 'scale(0) translateY(20px)';
    });
    
    // Start orb smaller and dimmer
    const orb = document.querySelector('[data-hero-orb]');
    if (orb) {
      orb.style.transform = 'scale(0.85)';
      orb.style.opacity = '0.7';
    }
  }

  function skipToReady() {
    const hero = document.querySelector('[data-hero-section]');
    if (hero) {
      hero.classList.add('ferni-ready');
      hero.classList.remove('ferni-awakening');
    }
    
    document.querySelectorAll('[data-persona-orb]').forEach(p => {
      p.style.opacity = '1';
      p.style.transform = '';
    });
    
    const orb = document.querySelector('[data-hero-orb]');
    if (orb) {
      orb.style.transform = '';
      orb.style.opacity = '';
      orb.classList.add('breathing');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2: WAKE UP - Like when you connect to an agent in the app
  // The orb expands and glows to life
  // ─────────────────────────────────────────────────────────────────────────
  function phaseWakeUp(orb, orbGlow) {
    if (!orb) return;
    
    // Orb "wakes up" - scales to full size with spring bounce
    orb.style.transition = 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 400ms ease-out';
    orb.style.transform = 'scale(1)';
    orb.style.opacity = '1';
    
    // The glow breathes to life
    if (orbGlow) {
      orbGlow.style.transition = 'opacity 600ms ease-out, transform 600ms ease-out';
      orbGlow.style.opacity = '0.5';
      orbGlow.style.transform = 'scale(1)';
    }
    
    // Initial "power on" pulse
    orb.animate([
      { boxShadow: '0 0 30px rgba(74, 103, 65, 0.2)' },
      { boxShadow: '0 0 80px rgba(74, 103, 65, 0.5)' },
      { boxShadow: '0 0 50px rgba(74, 103, 65, 0.3)' }
    ], {
      duration: 500,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: "I SEE YOU" - Recognition micro-expression
  // A subtle acknowledgment that Ferni notices you
  // ─────────────────────────────────────────────────────────────────────────
  function phaseISeeYou(feInitials, orb) {
    if (!feInitials) return;
    
    // FE fades in with a subtle "lift" - like raising eyebrows in recognition
    feInitials.style.transition = 'opacity 300ms ease-out, transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)';
    feInitials.style.opacity = '1';
    feInitials.style.transform = 'scale(1)';
    
    // Micro-expression: slight scale-up (the "Oh! Hello!" moment)
    if (orb) {
      orb.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.04)' },  // Slight "perk up"
        { transform: 'scale(1)' }
      ], {
        duration: 400,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4: "I'M HERE" - Waveform speaks
  // Like when the agent says their first words
  // ─────────────────────────────────────────────────────────────────────────
  function phaseImHere(waveform, orb) {
    if (!waveform) return;
    
    // Show the waveform
    waveform.classList.add('waveform-active');
    
    // The waveform "speaks" - simulating "Hey, I'm here for you"
    const speakPattern = [
      [0.3, 0.5, 0.8, 0.6, 0.4],  // "Hey"
      [0.4, 0.7, 1.0, 0.8, 0.5],  // "I'm"
      [0.5, 0.8, 0.6, 0.9, 0.4],  // "here"
      [0.4, 0.6, 0.5, 0.7, 0.3],  // "for"
      [0.3, 0.5, 0.7, 0.5, 0.3],  // "you"
      [0.2, 0.3, 0.4, 0.3, 0.2],  // settle
    ];
    
    const bars = waveform.querySelectorAll('.waveform-speaking, span');
    if (bars.length === 0) return;
    
    // Animate the speech pattern
    let wordIndex = 0;
    const speakInterval = setInterval(() => {
      if (wordIndex >= speakPattern.length) {
        clearInterval(speakInterval);
        // Fade out waveform after speaking
        setTimeout(() => {
          waveform.classList.remove('waveform-active');
        }, 200);
        return;
      }
      
      const pattern = speakPattern[wordIndex];
      bars.forEach((bar, i) => {
        const scale = pattern[i % pattern.length];
        bar.style.transform = `scaleY(${scale})`;
      });
      
      wordIndex++;
    }, 120);
    
    // Subtle "speaking" movement on orb
    if (orb) {
      orb.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.01)' },
        { transform: 'scale(1)' },
        { transform: 'scale(1.01)' },
        { transform: 'scale(1)' }
      ], {
        duration: 800,
        easing: 'ease-in-out'
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 5: THE FERNI SMILE - A warmth pulse
  // That moment when you feel genuinely welcomed
  // ─────────────────────────────────────────────────────────────────────────
  function phaseFerniSmile(orb, orbGlow) {
    if (!orb) return;
    
    // The "smile" - a warm glow that expands momentarily
    orb.animate([
      { boxShadow: '0 0 50px rgba(74, 103, 65, 0.3)' },
      { boxShadow: '0 0 100px rgba(74, 103, 65, 0.5)' },
      { boxShadow: '0 0 60px rgba(74, 103, 65, 0.35)' }
    ], {
      duration: 400,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    });
    
    if (orbGlow) {
      orbGlow.animate([
        { transform: 'scale(1)', opacity: 0.5 },
        { transform: 'scale(1.15)', opacity: 0.7 },
        { transform: 'scale(1)', opacity: 0.5 }
      ], {
        duration: 400,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 6: TEAM INTRODUCTION - Each persona waves hello
  // They each have their own personality in how they greet
  // ─────────────────────────────────────────────────────────────────────────
  function phaseTeamIntro(personas) {
    // Persona personalities for their "wave"
    const personalities = {
      peter: { bounce: 1.2, duration: 350, label: 'Research' },
      maya: { bounce: 1.15, duration: 400, label: 'Habits' },
      alex: { bounce: 1.1, duration: 380, label: 'Communications' },
      jordan: { bounce: 1.25, duration: 320, label: 'Events' }
    };
    
    personas.forEach((persona, i) => {
      const personaName = persona.dataset.personaOrb || '';
      const personality = personalities[personaName] || { bounce: 1.15, duration: 350 };
      
      setTimeout(() => {
        // Make visible
        persona.style.transition = `opacity 300ms ease-out, transform ${personality.duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
        persona.style.opacity = '1';
        persona.style.transform = 'scale(1)';
        
        // The "wave" - each persona bounces in with their personality
        persona.animate([
          { transform: 'scale(0)', opacity: 0 },
          { transform: `scale(${personality.bounce})`, opacity: 1 },
          { transform: 'scale(1)', opacity: 1 }
        ], {
          duration: personality.duration,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
        });
        
        // Little "wave" wiggle after appearing
        setTimeout(() => {
          persona.animate([
            { transform: 'scale(1) rotate(0deg)' },
            { transform: 'scale(1.05) rotate(-5deg)' },
            { transform: 'scale(1.05) rotate(5deg)' },
            { transform: 'scale(1) rotate(0deg)' }
          ], {
            duration: 300,
            easing: 'ease-in-out'
          });
        }, personality.duration);
        
      }, i * TIMELINE.TEAM_STAGGER);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 7: "LET'S TALK" - Text reveals with invitation
  // The warm invitation to start a conversation
  // ─────────────────────────────────────────────────────────────────────────
  function phaseLetsTalk(eyebrow, headline, subhead, ctas) {
    const elements = [eyebrow, headline, subhead, ctas].filter(Boolean);
    
    elements.forEach((el, i) => {
      if (!el) return;
      
      // Staggered reveal with gentle lift
      setTimeout(() => {
        el.style.transition = 'opacity 500ms ease-out, transform 500ms cubic-bezier(0.22, 1, 0.36, 1)';
        el.classList.add('greeting-visible');
        
        // Subtle "present" animation
        el.animate([
          { opacity: 0, transform: 'translateY(15px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], {
          duration: 500,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards'
        });
      }, i * 150);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 8: PRESENCE - Ferni is fully present, breathing
  // Continuous animation showing Ferni is alive and attentive
  // ─────────────────────────────────────────────────────────────────────────
  function phasePresence(orb) {
    const hero = document.querySelector('[data-hero-section]');
    if (hero) {
      hero.classList.remove('ferni-awakening');
      hero.classList.add('ferni-ready');
    }
    
    if (orb) {
      orb.classList.add('breathing');
    }
    
    // Dispatch event for other components
    document.dispatchEvent(new CustomEvent('ferni:awakened'));
    
    // Start occasional "glance" animations (subtle attention moments)
    startAttentionMicroExpressions(orb);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // MICRO-EXPRESSIONS - Subtle ongoing animations that show presence
  // ─────────────────────────────────────────────────────────────────────────
  function startAttentionMicroExpressions(orb) {
    if (!orb) return;
    
    // Occasional "glance" - very subtle movement showing attention
    setInterval(() => {
      // Only do this occasionally (30% chance)
      if (Math.random() > 0.3) return;
      
      // Subtle "attention" pulse
      orb.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.015)' },
        { transform: 'scale(1)' }
      ], {
        duration: 600,
        easing: 'ease-in-out'
      });
    }, 5000); // Check every 5 seconds
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOVER INTERACTIONS (Post-Awakening)
  // ═══════════════════════════════════════════════════════════════════════════

  function initHoverInteractions() {
    const orb = document.querySelector('[data-hero-orb]');
    if (!orb) return;

    // On hover, show waveform and enhance glow
    orb.addEventListener('mouseenter', () => {
      const waveform = orb.querySelector('[data-waveform]');
      if (waveform) {
        waveform.classList.add('waveform-active');
      }
      orb.classList.add('orb-hover');
    });

    orb.addEventListener('mouseleave', () => {
      const waveform = orb.querySelector('[data-waveform]');
      if (waveform) {
        waveform.classList.remove('waveform-active');
      }
      orb.classList.remove('orb-hover');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RETURNING VISITOR RECOGNITION
  // ═══════════════════════════════════════════════════════════════════════════

  function checkReturningVisitor() {
    const lastVisit = localStorage.getItem('ferni-last-visit');
    const now = Date.now();
    
    if (lastVisit) {
      const hoursSince = (now - parseInt(lastVisit)) / (1000 * 60 * 60);
      
      // If returning within 24 hours, show recognition
      if (hoursSince < 24) {
        const orb = document.querySelector('[data-hero-orb]');
        if (orb) {
          // Brief "I remember you" pulse
          setTimeout(() => {
            orb.animate([
              { boxShadow: '0 0 60px rgba(74, 103, 65, 0.3)' },
              { boxShadow: '0 0 100px rgba(74, 103, 65, 0.6)' },
              { boxShadow: '0 0 60px rgba(74, 103, 65, 0.3)' }
            ], {
              duration: 1000,
              easing: 'ease-in-out'
            });
          }, 2500); // After awakening sequence
        }
      }
    }
    
    localStorage.setItem('ferni-last-visit', now.toString());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        ferniAwakens();
        initHoverInteractions();
        checkReturningVisitor();
      });
    } else {
      ferniAwakens();
      initHoverInteractions();
      checkReturningVisitor();
    }
  }

  init();

})();

