/**
 * FAQ Accordion - Ferni Landing Page
 * ===================================
 * Smooth accordion animations with Apple-level polish
 */

(function() {
  'use strict';

  function initAccordion() {
    const faqItems = document.querySelectorAll('[data-faq-item]');
    if (!faqItems.length) return;

    faqItems.forEach((item, index) => {
      const trigger = item.querySelector('[data-faq-trigger]');
      const content = item.querySelector('[data-faq-content]');
      const icon = item.querySelector('[data-faq-icon]');

      if (!trigger || !content) return;

      // Set initial state
      content.style.display = 'grid';
      content.style.gridTemplateRows = '0fr';
      content.style.transition = 'grid-template-rows 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
      
      const inner = content.querySelector('[data-faq-inner]');
      if (inner) {
        inner.style.overflow = 'hidden';
      }

      // Stagger entrance animation
      item.style.opacity = '0';
      item.style.transform = 'translateY(20px)';
      setTimeout(() => {
        item.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';
      }, index * 100);

      trigger.addEventListener('click', () => {
        const isOpen = trigger.getAttribute('aria-expanded') === 'true';

        // Close all others
        faqItems.forEach(otherItem => {
          if (otherItem !== item) {
            const otherTrigger = otherItem.querySelector('[data-faq-trigger]');
            const otherContent = otherItem.querySelector('[data-faq-content]');
            const otherIcon = otherItem.querySelector('[data-faq-icon]');
            
            if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
            if (otherContent) otherContent.style.gridTemplateRows = '0fr';
            if (otherIcon) otherIcon.style.transform = 'rotate(0deg)';
          }
        });

        // Toggle current
        if (isOpen) {
          trigger.setAttribute('aria-expanded', 'false');
          content.style.gridTemplateRows = '0fr';
          if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
          trigger.setAttribute('aria-expanded', 'true');
          content.style.gridTemplateRows = '1fr';
          if (icon) icon.style.transform = 'rotate(45deg)';
        }
      });

      // Icon transition
      if (icon) {
        icon.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FAQ SEARCH WITH LIVE FILTERING
  // ═══════════════════════════════════════════════════════════════════════════

  function initFAQSearch() {
    const searchInput = document.querySelector('[data-faq-search]');
    const faqItems = document.querySelectorAll('[data-faq-item]');

    if (!searchInput || !faqItems.length) return;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();

      faqItems.forEach(item => {
        const question = item.querySelector('[data-faq-trigger]')?.textContent.toLowerCase() || '';
        const answer = item.querySelector('[data-faq-content]')?.textContent.toLowerCase() || '';

        const matches = question.includes(query) || answer.includes(query) || query === '';

        if (matches) {
          item.style.display = '';
          item.style.opacity = '1';
          item.style.transform = 'translateY(0)';
        } else {
          item.style.opacity = '0';
          item.style.transform = 'translateY(-10px)';
          setTimeout(() => {
            if (!query || !question.includes(query) && !answer.includes(query)) {
              item.style.display = 'none';
            }
          }, 300);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPFUL/NOT HELPFUL FEEDBACK
  // ═══════════════════════════════════════════════════════════════════════════

  function initFeedback() {
    const feedbackButtons = document.querySelectorAll('[data-faq-feedback]');

    feedbackButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const type = this.dataset.faqFeedback;
        const parent = this.closest('[data-faq-item]');
        const feedbackContainer = parent?.querySelector('[data-feedback-container]');

        // Animate button
        this.style.transform = 'scale(0.9)';
        setTimeout(() => {
          this.style.transform = 'scale(1)';
        }, 150);

        // Show thank you message
        if (feedbackContainer) {
          feedbackContainer.innerHTML = `
            <span class="text-sm text-ferni animate-fade-in">
              Thanks for your feedback!
            </span>
          `;
        }

        // Track feedback (could send to analytics)
        console.log(`FAQ feedback: ${type}`);
      });
    });
  }

  // Initialize
  function init() {
    initAccordion();
    initFAQSearch();
    initFeedback();
    console.log('%c❓ FAQ accordion loaded', 'color: #4a6741; font-weight: bold;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

