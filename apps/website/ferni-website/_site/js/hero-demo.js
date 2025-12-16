/**
 * Hero Interactive Demo
 * 
 * Makes the hero feel ALIVE:
 * - Avatar eyes track cursor (WALL-E style)
 * - Input triggers avatar curiosity
 * - Demo responses show AI personality
 * - Suggestions populate input
 */

'use strict';

// ============================================
// DEMO RESPONSES
// Pre-written responses that showcase personality
// ============================================

const DEMO_RESPONSES = {
  "I'm feeling overwhelmed at work": 
    "I hear you. Feeling overwhelmed is tough. Let's break this down together. What's the one thing on your plate right now that feels most urgent? Sometimes just naming it helps us see it more clearly.",
  
  "Help me build better habits": 
    "Building habits is one of my favorite topics! The key isn't willpower—it's environment design and tiny steps. What's one small habit you've been wanting to build? Let's make it so easy you can't say no.",
  
  "I have a big decision to make": 
    "Big decisions deserve space to breathe. I'm curious—what's the decision you're wrestling with? And more importantly, what's making it feel so big right now?",
  
  default: 
    "I'm here to help you navigate whatever's on your mind. What would you like to talk about today?"
};

// ============================================
// EYE TRACKING
// Avatar eyes follow the cursor
// ============================================

function initEyeTracking() {
  const avatarEyes = document.getElementById('avatarEyes');
  const heroAvatar = document.getElementById('heroAvatar');
  
  if (!avatarEyes || !heroAvatar) return;
  
  // Throttle for performance
  let lastUpdate = 0;
  const THROTTLE_MS = 16; // ~60fps
  
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastUpdate < THROTTLE_MS) return;
    lastUpdate = now;
    
    // Get avatar center position
    const rect = heroAvatar.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate direction to cursor (-1 to 1)
    const maxDistance = 300;
    const deltaX = (e.clientX - centerX) / maxDistance;
    const deltaY = (e.clientY - centerY) / maxDistance;
    
    // Clamp values
    const eyeX = Math.max(-1, Math.min(1, deltaX));
    const eyeY = Math.max(-1, Math.min(1, deltaY));
    
    // Apply to CSS variables
    avatarEyes.style.setProperty('--eye-x', eyeX.toFixed(2));
    avatarEyes.style.setProperty('--eye-y', eyeY.toFixed(2));
  });
}

// ============================================
// AVATAR STATES
// Change animation based on user interaction
// ============================================

function setAvatarState(state) {
  const avatar = document.querySelector('.hero-avatar .avatar-orb');
  if (!avatar) return;
  
  // Remove all state classes
  avatar.classList.remove(
    'animate-pixar-breathe',
    'animate-breathe-connected',
    'animate-breathe-speaking',
    'animate-curious',
    'animate-attentive',
    'is-listening',
    'is-speaking'
  );
  
  // Add new state
  switch (state) {
    case 'idle':
      avatar.classList.add('animate-pixar-breathe');
      break;
    case 'curious':
      avatar.classList.add('animate-curious');
      break;
    case 'attentive':
      avatar.classList.add('animate-attentive', 'animate-breathe-connected');
      break;
    case 'listening':
      avatar.classList.add('is-listening', 'animate-breathe-connected');
      break;
    case 'speaking':
      avatar.classList.add('is-speaking', 'animate-breathe-speaking');
      break;
  }
}

// ============================================
// DEMO INPUT HANDLING
// ============================================

function initDemoInput() {
  const input = document.getElementById('heroDemoInput');
  const suggestions = document.getElementById('demoSuggestions');
  const response = document.getElementById('heroResponse');
  const responseText = document.getElementById('heroResponseText');
  
  if (!input) return;
  
  // On focus - avatar becomes attentive
  input.addEventListener('focus', () => {
    setAvatarState('attentive');
  });
  
  // On blur - return to idle
  input.addEventListener('blur', () => {
    setTimeout(() => setAvatarState('idle'), 500);
  });
  
  // On typing - avatar becomes curious
  let typingTimeout;
  input.addEventListener('input', () => {
    setAvatarState('curious');
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (input.value.length > 0) {
        setAvatarState('attentive');
      } else {
        setAvatarState('idle');
      }
    }, 500);
  });
  
  // On Enter - show response
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      showResponse(input.value.trim());
    }
  });
  
  // Suggestion buttons
  if (suggestions) {
    suggestions.querySelectorAll('.demo-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        input.value = prompt;
        input.focus();
        showResponse(prompt);
        
        // Hide suggestions after use
        suggestions.style.display = 'none';
      });
    });
  }
}

// ============================================
// SHOW RESPONSE
// ============================================

function showResponse(userMessage) {
  const response = document.getElementById('heroResponse');
  const responseText = document.getElementById('heroResponseText');
  
  if (!response || !responseText) return;
  
  // Get response text
  const message = DEMO_RESPONSES[userMessage] || DEMO_RESPONSES.default;
  
  // Show typing indicator
  response.classList.add('is-visible');
  responseText.innerHTML = `
    <div class="typing-indicator">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  setAvatarState('listening');
  
  // After delay, show response
  setTimeout(() => {
    setAvatarState('speaking');
    
    // Type out the response
    typeWriter(responseText, message, () => {
      setAvatarState('idle');
    });
  }, 1200);
}

// ============================================
// TYPEWRITER EFFECT
// ============================================

function typeWriter(element, text, callback) {
  element.innerHTML = '';
  let i = 0;
  const speed = 20; // ms per character
  
  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      setTimeout(type, speed);
    } else if (callback) {
      setTimeout(callback, 500);
    }
  }
  
  type();
}

// ============================================
// MIC BUTTON (Visual only for demo)
// ============================================

function initMicButton() {
  const micBtn = document.getElementById('demoMicBtn');
  const input = document.getElementById('heroDemoInput');
  
  if (!micBtn) return;
  
  micBtn.addEventListener('click', () => {
    // Visual feedback
    micBtn.classList.toggle('is-listening');
    
    if (micBtn.classList.contains('is-listening')) {
      setAvatarState('listening');
      input.placeholder = 'Listening...';
      
      // Auto-stop after 3 seconds (demo)
      setTimeout(() => {
        micBtn.classList.remove('is-listening');
        input.placeholder = "What's on your mind?";
        setAvatarState('idle');
      }, 3000);
    } else {
      setAvatarState('idle');
      input.placeholder = "What's on your mind?";
    }
  });
}

// ============================================
// SCROLL REVEAL
// ============================================

function initScrollReveal() {
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.reveal').forEach(el => {
      el.classList.add('is-visible');
    });
    return;
  }
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    rootMargin: '0px 0px -80px 0px',
    threshold: 0.1
  });
  
  document.querySelectorAll('.reveal').forEach(el => {
    observer.observe(el);
  });
}

// ============================================
// COUNT UP ANIMATION
// ============================================

function initCountUp() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return; // Values are already set in HTML
  }
  
  const animateCount = (el) => {
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
        animateCount(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  
  counters.forEach(el => observer.observe(el));
}

// ============================================
// INITIALIZE
// ============================================

function initHeroDemo() {
  initEyeTracking();
  initDemoInput();
  initMicButton();
  initScrollReveal();
  initCountUp();
  
  // Start with idle animation
  setAvatarState('idle');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeroDemo);
} else {
  initHeroDemo();
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initHeroDemo, setAvatarState, showResponse };
}

