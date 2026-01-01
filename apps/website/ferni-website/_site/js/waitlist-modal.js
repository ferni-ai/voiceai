/**
 * Waitlist Modal - Integrated Gate
 *
 * Intercepts all CTAs that link to app.ferni.ai and shows
 * the waitlist modal instead. Once signed up, users can
 * explore the landing page freely.
 *
 * Features:
 * - Intercepts all appUrl links
 * - Email validation with friendly messages
 * - Confetti celebration on success
 * - Accessible: focus trap, ESC to close
 * - Remembers if user is already on waitlist
 */

(function () {
  'use strict';

  // ============================================
  // ELEMENTS
  // ============================================

  const modal = document.getElementById('waitlistModal');
  const backdrop = modal?.querySelector('.waitlist-modal__backdrop');
  const closeBtn = document.getElementById('waitlistModalClose');
  const form = document.getElementById('waitlistModalForm');
  const emailInput = document.getElementById('waitlistModalEmail');
  const phoneInput = document.getElementById('waitlistModalPhone');
  const errorEl = document.getElementById('modalEmailError');
  const submitBtn = document.getElementById('waitlistModalSubmit');
  const contentEl = document.getElementById('waitlistModalContent');
  const successEl = document.getElementById('waitlistModalSuccess');
  const exploreBtn = document.getElementById('waitlistModalExplore');
  const confettiCanvas = document.getElementById('modalConfettiCanvas');

  if (!modal) {
    console.log('[Waitlist Modal] No modal found, integrated gate not active');
    return;
  }

  // API endpoint
  const API_URL = '/api/waitlist';

  // App URL pattern to intercept
  const APP_URL_PATTERN = /app\.ferni\.ai|\/app\/?$/i;

  // Storage key for remembering signup
  const STORAGE_KEY = 'ferni_waitlist_joined';

  // Track first focusable element for focus trap
  let firstFocusableEl = null;
  let lastFocusableEl = null;
  let previousActiveElement = null;

  // ============================================
  // STORAGE
  // ============================================

  function hasJoinedWaitlist() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function markAsJoined() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Storage not available
    }
  }

  // ============================================
  // MODAL OPEN/CLOSE
  // ============================================

  function openModal() {
    if (!modal) return;

    // Store current focus
    previousActiveElement = document.activeElement;

    // Show modal
    modal.hidden = false;
    // Force reflow for animation
    modal.offsetHeight;
    modal.classList.add('is-open');

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Setup focus trap
    setupFocusTrap();

    // Focus email input
    setTimeout(() => {
      emailInput?.focus();
    }, 100);

    // Track analytics
    trackEvent('waitlist_modal', 'open', 'integrated_gate');
  }

  function closeModal() {
    if (!modal) return;

    modal.classList.remove('is-open');

    // Wait for animation to complete
    setTimeout(() => {
      modal.hidden = true;
      document.body.style.overflow = '';

      // Restore focus
      if (previousActiveElement) {
        previousActiveElement.focus();
      }
    }, 300);

    // Track analytics
    trackEvent('waitlist_modal', 'close', 'integrated_gate');
  }

  function setupFocusTrap() {
    const focusableEls = modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusableEls.length) {
      firstFocusableEl = focusableEls[0];
      lastFocusableEl = focusableEls[focusableEls.length - 1];
    }
  }

  // ============================================
  // VALIDATION
  // ============================================

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return email && emailRegex.test(email.trim());
  }

  function showError(message) {
    if (errorEl) {
      errorEl.textContent = message;
    }
    emailInput?.classList.add('has-error');
    emailInput?.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    if (errorEl) {
      errorEl.textContent = '';
    }
    emailInput?.classList.remove('has-error');
    emailInput?.removeAttribute('aria-invalid');
  }

  // ============================================
  // LOADING STATE
  // ============================================

  function setLoading(loading) {
    if (!submitBtn) return;

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

    // Set canvas size to match container
    const container = modal.querySelector('.waitlist-modal__container');
    if (container) {
      confettiCanvas.width = container.offsetWidth;
      confettiCanvas.height = container.offsetHeight;
    }

    const colors = ['#4a6741', '#3D5A45', '#6b8f63', '#8eb886', '#c4d7c1', '#FFD700', '#FF6B6B'];
    const particles = [];

    // Create particles from center-top
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: confettiCanvas.width / 2,
        y: confettiCanvas.height * 0.3,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.8) * 20,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 6 + 3,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.15,
        gravity: 0.25,
        friction: 0.98,
      });
    }

    let frame = 0;
    const maxFrames = 90;

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
        ctx.globalAlpha = 1 - frame / maxFrames;
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
    if (contentEl) contentEl.hidden = true;
    if (successEl) {
      successEl.hidden = false;
      successEl.style.display = '';
    }

    // Mark as joined
    markAsJoined();

    // Trigger confetti after a short delay
    setTimeout(celebrateWithConfetti, 200);

    // Track conversion
    trackEvent('waitlist_signup', 'success', 'landing_page');
  }

  // ============================================
  // FORM SUBMISSION
  // ============================================

  async function handleSubmit(e) {
    e.preventDefault();
    clearError();

    const email = emailInput?.value.trim().toLowerCase() || '';
    const phone = phoneInput?.value.trim() || '';
    const honeypot = form?.querySelector('input[name="website"]');

    // Check honeypot (bot detection)
    if (honeypot && honeypot.value) {
      // Silently "succeed" to fool bots
      showSuccess();
      return;
    }

    // Validate email - warm, conversational
    if (!email) {
      showError("I'll need your email to save your spot");
      emailInput?.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showError("Hmm, that doesn't look quite right");
      emailInput?.focus();
      return;
    }

    // Submit to API
    setLoading(true);

    try {
      // Build payload (only include phone if provided)
      const payload = {
        email,
        source: 'landing',
      };
      if (phone) {
        payload.phone = phone;
      }

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        showSuccess();
      } else {
        // Handle specific errors - warm, human messages
        if (response.status === 409 || data.error === 'already_registered') {
          // Already on the list - show friendly message then success
          showError("You're already in! Let me show you...");
          setTimeout(showSuccess, 1200);
        } else if (response.status === 429) {
          showError('Give me a moment... try again shortly');
        } else {
          showError("Something went wrong. Try once more?");
        }
      }
    } catch (err) {
      console.error('[Waitlist Modal] Submission error:', err);
      showError("Lost connection. Are you online?");
    } finally {
      setLoading(false);
    }
  }

  // ============================================
  // LINK INTERCEPTION
  // ============================================

  function shouldInterceptLink(href) {
    if (!href) return false;
    return APP_URL_PATTERN.test(href);
  }

  function handleLinkClick(e) {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');

    // Check if this links to the app
    if (shouldInterceptLink(href)) {
      // If user already joined, let them through
      if (hasJoinedWaitlist()) {
        // Track click-through
        trackEvent('waitlist_bypass', 'click', 'already_joined');
        return; // Allow navigation
      }

      // Otherwise, intercept and show modal
      e.preventDefault();
      e.stopPropagation();
      openModal();
    }
  }

  // Also handle buttons with js-open-waitlist class (explicit trigger)
  function handleExplicitTrigger(e) {
    const trigger = e.target.closest('.js-open-waitlist');
    if (trigger) {
      e.preventDefault();
      openModal();
    }
  }

  // ============================================
  // ANALYTICS
  // ============================================

  function trackEvent(category, action, label) {
    if (typeof gtag === 'function') {
      gtag('event', action, {
        event_category: category,
        event_label: label,
      });
    }
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  // Form submission
  form?.addEventListener('submit', handleSubmit);

  // Clear error on input
  emailInput?.addEventListener('input', function () {
    if (emailInput.classList.contains('has-error')) {
      clearError();
    }
  });

  // Clear error on focus
  emailInput?.addEventListener('focus', clearError);

  // Close button
  closeBtn?.addEventListener('click', closeModal);

  // Backdrop click to close
  backdrop?.addEventListener('click', closeModal);

  // Explore button (after success)
  exploreBtn?.addEventListener('click', closeModal);

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }

    // Focus trap
    if (e.key === 'Tab' && modal.classList.contains('is-open')) {
      if (e.shiftKey && document.activeElement === firstFocusableEl) {
        e.preventDefault();
        lastFocusableEl?.focus();
      } else if (!e.shiftKey && document.activeElement === lastFocusableEl) {
        e.preventDefault();
        firstFocusableEl?.focus();
      }
    }
  });

  // Intercept all app URL links
  document.addEventListener('click', handleLinkClick, true);
  document.addEventListener('click', handleExplicitTrigger, true);

  // ============================================
  // INIT
  // ============================================

  // If user has already joined, don't intercept (they can explore freely)
  if (hasJoinedWaitlist()) {
    console.log('%c🌿 Welcome back! You\'re on the waitlist.', 'color: #4a6741; font-weight: bold;');
  } else {
    console.log('%c🌿 Waitlist gate active', 'color: #4a6741; font-weight: bold;');
  }
})();
