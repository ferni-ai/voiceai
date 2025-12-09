/**
 * Enhanced Pricing - Ferni Landing Page
 * ======================================
 * Monthly/yearly toggle, glow effects, and celebration animations
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // MONTHLY/YEARLY TOGGLE
  // Animated price comparison toggle
  // ═══════════════════════════════════════════════════════════════════════════

  function initPricingToggle() {
    const toggle = document.querySelector('[data-pricing-toggle]');
    if (!toggle) return;

    const monthlyPrices = document.querySelectorAll('[data-price-monthly]');
    const yearlyPrices = document.querySelectorAll('[data-price-yearly]');
    const savingsBadges = document.querySelectorAll('[data-savings]');

    let isYearly = false;

    toggle.addEventListener('click', () => {
      isYearly = !isYearly;
      toggle.classList.toggle('yearly', isYearly);

      // Animate price change
      monthlyPrices.forEach(el => {
        animatePrice(el, isYearly);
      });

      yearlyPrices.forEach(el => {
        el.style.display = isYearly ? '' : 'none';
      });

      // Show/hide savings badges
      savingsBadges.forEach(badge => {
        badge.style.opacity = isYearly ? '1' : '0';
        badge.style.transform = isYearly ? 'scale(1)' : 'scale(0.8)';
      });

      // Announce change
      if (window.ferniAnnounce) {
        window.ferniAnnounce(isYearly ? 'Showing yearly prices with savings' : 'Showing monthly prices');
      }
    });
  }

  function animatePrice(el, toYearly) {
    const monthlyValue = parseFloat(el.dataset.priceMonthly);
    const yearlyValue = monthlyValue * 10; // 2 months free

    const startValue = toYearly ? monthlyValue : yearlyValue / 12;
    const endValue = toYearly ? yearlyValue / 12 : monthlyValue;

    el.style.transform = 'scale(0.9)';
    el.style.opacity = '0.5';

    setTimeout(() => {
      // Animate number
      animateNumber(el, startValue, endValue, 300);
      el.style.transform = 'scale(1)';
      el.style.opacity = '1';
    }, 150);
  }

  function animateNumber(el, start, end, duration) {
    const startTime = performance.now();
    const prefix = el.dataset.pricePrefix || '$';

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out
      const current = start + (end - start) * eased;

      el.textContent = prefix + current.toFixed(2);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDED PLAN GLOW
  // Animated glow effect on the recommended pricing card
  // ═══════════════════════════════════════════════════════════════════════════

  function initRecommendedGlow() {
    const recommendedCard = document.querySelector('[data-pricing-recommended]');
    if (!recommendedCard) return;

    // Create glow element
    const glow = document.createElement('div');
    glow.className = 'pricing-glow';
    glow.style.cssText = `
      position: absolute;
      inset: -2px;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(74, 103, 65, 0.3),
        transparent
      );
      border-radius: inherit;
      z-index: -1;
      animation: glowMove 3s ease-in-out infinite;
    `;

    recommendedCard.style.position = 'relative';
    recommendedCard.appendChild(glow);

    // Mouse tracking glow
    recommendedCard.addEventListener('mousemove', (e) => {
      const rect = recommendedCard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      glow.style.background = `
        radial-gradient(
          circle at ${x}px ${y}px,
          rgba(74, 103, 65, 0.4) 0%,
          transparent 50%
        )
      `;
    });

    recommendedCard.addEventListener('mouseleave', () => {
      glow.style.background = `
        linear-gradient(
          90deg,
          transparent,
          rgba(74, 103, 65, 0.3),
          transparent
        )
      `;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE LIST EXPAND/COLLAPSE
  // Animated feature list with "Show more"
  // ═══════════════════════════════════════════════════════════════════════════

  function initFeatureExpand() {
    const featureLists = document.querySelectorAll('[data-feature-list]');

    featureLists.forEach(list => {
      const items = list.querySelectorAll('li');
      const visibleCount = parseInt(list.dataset.featureList) || 4;

      if (items.length <= visibleCount) return;

      // Hide extra items
      items.forEach((item, index) => {
        if (index >= visibleCount) {
          item.style.display = 'none';
          item.dataset.hidden = 'true';
        }
      });

      // Create toggle button
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'feature-toggle';
      toggleBtn.innerHTML = `
        <span>Show ${items.length - visibleCount} more</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      `;
      toggleBtn.style.cssText = `
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: none;
        border: none;
        color: #4a6741;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        padding: 0.5rem 0;
        margin-top: 0.5rem;
        transition: color 0.3s ease;
      `;

      let isExpanded = false;

      toggleBtn.addEventListener('click', () => {
        isExpanded = !isExpanded;

        items.forEach((item, index) => {
          if (index >= visibleCount) {
            if (isExpanded) {
              item.style.display = '';
              item.style.animation = 'featureSlideIn 0.3s ease forwards';
              item.style.animationDelay = `${(index - visibleCount) * 0.05}s`;
            } else {
              item.style.animation = 'featureSlideOut 0.2s ease forwards';
              setTimeout(() => {
                item.style.display = 'none';
              }, 200);
            }
          }
        });

        toggleBtn.innerHTML = isExpanded 
          ? `<span>Show less</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;transform:rotate(180deg);"><path d="M6 9l6 6 6-6"/></svg>`
          : `<span>Show ${items.length - visibleCount} more</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M6 9l6 6 6-6"/></svg>`;
      });

      list.parentNode.appendChild(toggleBtn);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOVER HIGHLIGHT DIFFERENCES
  // Shows what's different between plans on hover
  // ═══════════════════════════════════════════════════════════════════════════

  function initPlanComparison() {
    const cards = document.querySelectorAll('[data-pricing-card]');

    cards.forEach(card => {
      const features = card.querySelectorAll('[data-feature]');

      card.addEventListener('mouseenter', () => {
        // Highlight unique features
        features.forEach(feature => {
          if (feature.dataset.unique === 'true') {
            feature.style.background = 'rgba(74, 103, 65, 0.1)';
            feature.style.borderRadius = '0.5rem';
            feature.style.padding = '0.25rem 0.5rem';
            feature.style.margin = '-0.25rem -0.5rem';
          }
        });
      });

      card.addEventListener('mouseleave', () => {
        features.forEach(feature => {
          feature.style.background = '';
          feature.style.padding = '';
          feature.style.margin = '';
        });
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPGRADE BUTTON CONFETTI
  // Celebration when clicking upgrade
  // ═══════════════════════════════════════════════════════════════════════════

  function initUpgradeConfetti() {
    const upgradeButtons = document.querySelectorAll('[data-upgrade-btn]');

    upgradeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Create confetti burst at button position
        if (window.ferniConfetti) {
          const rect = btn.getBoundingClientRect();
          const container = document.createElement('div');
          container.style.cssText = `
            position: fixed;
            left: ${rect.left + rect.width / 2}px;
            top: ${rect.top}px;
            pointer-events: none;
            z-index: 9999;
          `;
          document.body.appendChild(container);
          
          window.ferniConfetti(container, 25);
          
          setTimeout(() => container.remove(), 2000);
        }

        // Button animation
        btn.style.transform = 'scale(1.05)';
        setTimeout(() => {
          btn.style.transform = '';
        }, 200);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INJECT STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Pricing toggle */
      [data-pricing-toggle] {
        position: relative;
        width: 200px;
        height: 44px;
        background: rgba(74, 103, 65, 0.1);
        border-radius: 22px;
        cursor: pointer;
        border: none;
        padding: 4px;
      }
      
      [data-pricing-toggle]::before {
        content: '';
        position: absolute;
        left: 4px;
        top: 4px;
        width: calc(50% - 4px);
        height: calc(100% - 8px);
        background: #4a6741;
        border-radius: 18px;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      [data-pricing-toggle].yearly::before {
        transform: translateX(100%);
      }
      
      /* Glow animation */
      @keyframes glowMove {
        0%, 100% { opacity: 0.5; transform: translateX(-100%); }
        50% { opacity: 1; transform: translateX(100%); }
      }
      
      /* Feature animations */
      @keyframes featureSlideIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes featureSlideOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-10px); }
      }
      
      /* Savings badge */
      [data-savings] {
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    injectStyles();
    initPricingToggle();
    initRecommendedGlow();
    initFeatureExpand();
    initPlanComparison();
    initUpgradeConfetti();
    
    console.log('%c💰 Enhanced pricing loaded', 'color: #4a6741; font-weight: bold;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

