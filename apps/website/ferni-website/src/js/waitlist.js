/**
 * Waitlist Form Handler
 *
 * Handles email submission to the waitlist API with:
 * - Form validation
 * - Loading states
 * - Success/error feedback
 * - Confetti celebration on success
 */

(function () {
  'use strict';

  // Elements
  const form = document.getElementById('waitlistForm');
  const emailInput = document.getElementById('waitlistEmail');
  const errorEl = document.getElementById('emailError');
  const submitBtn = document.getElementById('waitlistSubmit');
  const contentEl = document.getElementById('waitlistContent');
  const successEl = document.getElementById('waitlistSuccess');
  const confettiCanvas = document.getElementById('confettiCanvas');

  if (!form || !emailInput) {
    console.warn('[Waitlist] Form elements not found');
    return;
  }

  // API endpoint
  const API_URL = '/api/waitlist';

  // ============================================
  // VALIDATION
  // ============================================

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return email && emailRegex.test(email.trim());
  }

  function showError(message) {
    errorEl.textContent = message;
    emailInput.classList.add('has-error');
    emailInput.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    errorEl.textContent = '';
    emailInput.classList.remove('has-error');
    emailInput.removeAttribute('aria-invalid');
  }

  // ============================================
  // LOADING STATE
  // ============================================

  function setLoading(loading) {
    if (loading) {
      submitBtn.classList.add('is-loading');
      submitBtn.disabled = true;
    } else {
      submitBtn.classList.remove('is-loading');
      submitBtn.disabled = false;
    }
  }

  // ============================================
  // CONFETTI CELEBRATION
  // ============================================

  function celebrateWithConfetti() {
    if (!confettiCanvas) return;

    const ctx = confettiCanvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;

    const colors = ['#4a6741', '#3D5A45', '#6b8f63', '#8eb886', '#c4d7c1'];
    const particles = [];

    // Create particles
    for (let i = 0; i < 100; i++) {
      particles.push({
        x: confettiCanvas.width / 2,
        y: confettiCanvas.height / 2,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.8) * 25,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        gravity: 0.3,
        friction: 0.99,
      });
    }

    let frame = 0;
    const maxFrames = 120;

    function animate() {
      if (frame >= maxFrames) {
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        return;
      }

      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

      particles.forEach((p) => {
        p.vy += p.gravity;
        p.vx *= p.friction;
        p.vy *= p.friction;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size / 2);
        ctx.restore();
      });

      frame++;
      requestAnimationFrame(animate);
    }

    animate();
  }

  // ============================================
  // SUCCESS STATE
  // ============================================

  function showSuccess() {
    contentEl.hidden = true;
    successEl.hidden = false;
    successEl.style.display = '';

    // Trigger confetti after a short delay
    setTimeout(celebrateWithConfetti, 200);

    // Track conversion (if analytics available)
    if (typeof gtag !== 'undefined') {
      gtag('event', 'waitlist_signup', {
        event_category: 'engagement',
        event_label: 'landing_page',
      });
    }
  }

  // ============================================
  // FORM SUBMISSION
  // ============================================

  async function handleSubmit(e) {
    e.preventDefault();
    clearError();

    const email = emailInput.value.trim().toLowerCase();
    const honeypot = form.querySelector('input[name="website"]');

    // Check honeypot (bot detection)
    if (honeypot && honeypot.value) {
      // Silently "succeed" to fool bots
      showSuccess();
      return;
    }

    // Validate email
    if (!email) {
      showError("Let's start with your email");
      emailInput.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showError("Let's try a valid email");
      emailInput.focus();
      return;
    }

    // Submit to API
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          source: 'landing',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        showSuccess();
      } else {
        // Handle specific errors
        if (response.status === 409 || data.error === 'already_registered') {
          // Already on the list - show friendly message
          showError("You're already on the list!");
          // Still show success after a moment since they're on the list
          setTimeout(showSuccess, 1500);
        } else if (response.status === 429) {
          showError('Too many requests. Try again later.');
        } else {
          showError("Couldn't save. Try again?");
        }
      }
    } catch (err) {
      console.error('[Waitlist] Submission error:', err);
      showError("Couldn't connect. Check your internet?");
    } finally {
      setLoading(false);
    }
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  form.addEventListener('submit', handleSubmit);

  emailInput.addEventListener('input', function () {
    if (emailInput.classList.contains('has-error')) {
      clearError();
    }
  });

  // Clear error on focus
  emailInput.addEventListener('focus', clearError);

  // ============================================
  // INIT
  // ============================================

  console.log('%c🌿 Waitlist ready', 'color: #4a6741; font-weight: bold;');
})();
