/**
 * Hero Animations - Ferni Landing Page
 * =====================================
 * Apple-level hero section with 3D orb, particles, and ambient effects
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // 3D ORB WITH MOUSE TRACKING
  // The central orb responds to cursor position with perspective tilt
  // ═══════════════════════════════════════════════════════════════════════════

  function init3DOrb() {
    const orb = document.querySelector('[data-hero-orb]');
    if (!orb) return;

    const maxRotation = 15; // degrees
    let bounds;
    let animationFrame;

    const updateOrb = (clientX, clientY) => {
      if (!bounds) bounds = orb.getBoundingClientRect();

      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;

      // Calculate distance from center
      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Only affect within a radius
      const maxDistance = Math.max(window.innerWidth, window.innerHeight) * 0.5;
      const strength = Math.max(0, 1 - distance / maxDistance);

      // Calculate rotation
      const rotateY = (deltaX / maxDistance) * maxRotation * strength;
      const rotateX = -(deltaY / maxDistance) * maxRotation * strength;

      // Apply transform with smooth transition
      orb.style.transform = `
        perspective(1000px)
        rotateX(${rotateX}deg)
        rotateY(${rotateY}deg)
        scale(${1 + strength * 0.02})
      `;
    };

    document.addEventListener('mousemove', (e) => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => updateOrb(e.clientX, e.clientY));
    });

    window.addEventListener('scroll', () => {
      bounds = null; // Recalculate on scroll
    }, { passive: true });

    // Reset on mouse leave
    document.addEventListener('mouseleave', () => {
      orb.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
      orb.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
      setTimeout(() => {
        orb.style.transition = '';
      }, 800);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTICLE SYSTEM
  // Floating particles around the orb that respond to movement
  // ═══════════════════════════════════════════════════════════════════════════

  function initParticles() {
    const container = document.querySelector('[data-particles]');
    if (!container) return;

    const particleCount = 30;
    const particles = [];

    // Create particles
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'hero-particle';
      
      const size = Math.random() * 6 + 2;
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const duration = Math.random() * 10 + 10;
      const delay = Math.random() * -20;
      const opacity = Math.random() * 0.5 + 0.1;

      particle.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: radial-gradient(circle, rgba(74, 103, 65, ${opacity}) 0%, transparent 70%);
        border-radius: 50%;
        left: ${x}%;
        top: ${y}%;
        animation: particleFloat ${duration}s ease-in-out ${delay}s infinite;
        pointer-events: none;
      `;

      container.appendChild(particle);
      particles.push({ el: particle, baseX: x, baseY: y });
    }

    // Mouse interaction - particles drift away
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * 100;
      mouseY = ((e.clientY - rect.top) / rect.height) * 100;
    });

    // Animate particles away from cursor
    function updateParticles() {
      particles.forEach(p => {
        const dx = p.baseX - mouseX;
        const dy = p.baseY - mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 30;

        if (distance < maxDistance) {
          const force = (1 - distance / maxDistance) * 15;
          const angle = Math.atan2(dy, dx);
          const offsetX = Math.cos(angle) * force;
          const offsetY = Math.sin(angle) * force;
          p.el.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        } else {
          p.el.style.transform = '';
        }
      });
      requestAnimationFrame(updateParticles);
    }
    updateParticles();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AMBIENT GLOW PULSE
  // The orb's glow pulses with a breathing rhythm
  // ═══════════════════════════════════════════════════════════════════════════

  function initAmbientGlow() {
    const glow = document.querySelector('[data-orb-glow]');
    if (!glow) return;

    // Create multiple glow layers
    const layers = 3;
    for (let i = 0; i < layers; i++) {
      const layer = document.createElement('div');
      layer.className = 'glow-layer';
      layer.style.cssText = `
        position: absolute;
        inset: ${-20 - i * 15}px;
        border-radius: 50%;
        background: radial-gradient(circle, 
          rgba(74, 103, 65, ${0.15 - i * 0.04}) 0%, 
          transparent 70%
        );
        animation: glowPulse ${4 + i * 0.5}s ease-in-out infinite;
        animation-delay: ${i * 0.3}s;
        pointer-events: none;
      `;
      glow.appendChild(layer);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA ORBIT WITH PHYSICS
  // Team member avatars orbit with subtle gravitational effects
  // ═══════════════════════════════════════════════════════════════════════════

  function initPersonaOrbit() {
    const personas = document.querySelectorAll('[data-persona-orbit]');
    if (!personas.length) return;

    personas.forEach((persona, index) => {
      const angle = (index / personas.length) * Math.PI * 2;
      const baseRadius = 120;
      let currentAngle = angle;
      let velocity = 0.0005 + Math.random() * 0.0003;

      function animate() {
        currentAngle += velocity;
        
        // Add slight wobble
        const wobble = Math.sin(currentAngle * 3) * 5;
        const radius = baseRadius + wobble;
        
        const x = Math.cos(currentAngle) * radius;
        const y = Math.sin(currentAngle) * radius;
        
        persona.style.transform = `translate(${x}px, ${y}px)`;
        
        requestAnimationFrame(animate);
      }
      animate();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WAVEFORM VISUALIZATION
  // Animated audio waveform effect
  // ═══════════════════════════════════════════════════════════════════════════

  function initWaveform() {
    const container = document.querySelector('[data-waveform]');
    if (!container) return;

    const barCount = 7;
    container.innerHTML = '';

    for (let i = 0; i < barCount; i++) {
      const bar = document.createElement('div');
      bar.className = 'waveform-bar';
      bar.style.cssText = `
        width: 3px;
        height: 20px;
        background: currentColor;
        border-radius: 2px;
        animation: waveformPulse 1s ease-in-out infinite;
        animation-delay: ${i * 0.1}s;
      `;
      container.appendChild(bar);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2AM SECTION - NIGHT SKY WITH STARS
  // ═══════════════════════════════════════════════════════════════════════════

  function initNightSky() {
    const nightSection = document.querySelector('[data-night-sky]');
    if (!nightSection) return;

    // Create star field
    const starCount = 50;
    const starContainer = document.createElement('div');
    starContainer.className = 'star-field';
    starContainer.style.cssText = `
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    `;

    for (let i = 0; i < starCount; i++) {
      const star = document.createElement('div');
      const size = Math.random() * 2 + 1;
      star.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: white;
        border-radius: 50%;
        left: ${Math.random() * 100}%;
        top: ${Math.random() * 100}%;
        opacity: ${Math.random() * 0.7 + 0.3};
        animation: twinkle ${2 + Math.random() * 3}s ease-in-out infinite;
        animation-delay: ${Math.random() * 2}s;
      `;
      starContainer.appendChild(star);
    }

    nightSection.insertBefore(starContainer, nightSection.firstChild);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2AM SECTION - TICKING CLOCK
  // ═══════════════════════════════════════════════════════════════════════════

  function initClock() {
    const clock = document.querySelector('[data-clock]');
    if (!clock) return;

    function updateClock() {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'AM' : 'PM';
      
      // For demo, always show 2:XX AM
      clock.innerHTML = `
        <span class="clock-time">2:${minutes}</span>
        <span class="clock-ampm">${ampm}</span>
      `;
    }

    updateClock();
    setInterval(updateClock, 1000);

    // Add ticking effect
    clock.classList.add('clock-ticking');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPING INDICATOR
  // The "..." typing animation
  // ═══════════════════════════════════════════════════════════════════════════

  function initTypingIndicator() {
    const indicators = document.querySelectorAll('[data-typing-indicator]');
    
    indicators.forEach(indicator => {
      indicator.innerHTML = `
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      `;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD REQUIRED CSS KEYFRAMES
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes particleFloat {
        0%, 100% { 
          transform: translateY(0) translateX(0); 
          opacity: 0.3;
        }
        25% { 
          transform: translateY(-20px) translateX(10px); 
          opacity: 0.6;
        }
        50% { 
          transform: translateY(-10px) translateX(-5px); 
          opacity: 0.4;
        }
        75% { 
          transform: translateY(-30px) translateX(15px); 
          opacity: 0.5;
        }
      }
      
      @keyframes glowPulse {
        0%, 100% { 
          transform: scale(1); 
          opacity: 0.6;
        }
        50% { 
          transform: scale(1.1); 
          opacity: 1;
        }
      }
      
      @keyframes waveformPulse {
        0%, 100% { transform: scaleY(0.3); }
        50% { transform: scaleY(1); }
      }
      
      @keyframes twinkle {
        0%, 100% { opacity: 0.3; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.2); }
      }
      
      .clock-ticking .clock-time::after {
        content: ':';
        animation: clockBlink 1s step-end infinite;
      }
      
      @keyframes clockBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
      
      .typing-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        background: currentColor;
        border-radius: 50%;
        margin: 0 2px;
        animation: typingBounce 1.4s ease-in-out infinite;
      }
      
      .typing-dot:nth-child(1) { animation-delay: 0s; }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      
      @keyframes typingBounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-10px); }
      }
      
      .hero-particle {
        will-change: transform;
        transition: transform 0.3s ease-out;
      }
      
      .glow-layer {
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
      init3DOrb();
      initParticles();
      initAmbientGlow();
      initPersonaOrbit();
      initWaveform();
      initNightSky();
      initTypingIndicator();
    }
    
    // Clock always runs
    initClock();
    
    console.log('%c🌟 Hero animations loaded', 'color: #4a6741; font-weight: bold;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

