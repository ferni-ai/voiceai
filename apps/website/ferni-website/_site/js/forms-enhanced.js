/**
 * Enhanced Forms - Ferni Landing Page
 * ====================================
 * Floating labels, validation, and celebration animations
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOATING LABELS
  // Labels that animate up when input is focused or has value
  // ═══════════════════════════════════════════════════════════════════════════

  function initFloatingLabels() {
    const formGroups = document.querySelectorAll('[data-floating-label]');
    
    formGroups.forEach(group => {
      const input = group.querySelector('input, textarea, select');
      const label = group.querySelector('label');
      
      if (!input || !label) return;
      
      // Style the container
      group.style.position = 'relative';
      
      // Style the label
      label.style.cssText = `
        position: absolute;
        left: 1rem;
        top: 50%;
        transform: translateY(-50%);
        color: rgba(92, 84, 74, 0.6);
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        transform-origin: left center;
        background: transparent;
        padding: 0 0.25rem;
      `;
      
      // For textarea, position differently
      if (input.tagName === 'TEXTAREA') {
        label.style.top = '1rem';
        label.style.transform = 'none';
      }
      
      const activateLabel = () => {
        label.style.top = '-0.5rem';
        label.style.transform = 'scale(0.85)';
        label.style.color = '#4a6741';
        label.style.background = '#faf8f5';
      };
      
      const deactivateLabel = () => {
        if (input.value) return; // Keep active if has value
        label.style.top = input.tagName === 'TEXTAREA' ? '1rem' : '50%';
        label.style.transform = input.tagName === 'TEXTAREA' ? 'none' : 'translateY(-50%)';
        label.style.color = 'rgba(92, 84, 74, 0.6)';
        label.style.background = 'transparent';
      };
      
      input.addEventListener('focus', activateLabel);
      input.addEventListener('blur', deactivateLabel);
      
      // Check initial value
      if (input.value) activateLabel();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INLINE VALIDATION
  // Real-time validation with smooth feedback
  // ═══════════════════════════════════════════════════════════════════════════

  function initInlineValidation() {
    const validatedInputs = document.querySelectorAll('[data-validate]');
    
    validatedInputs.forEach(input => {
      const validationType = input.dataset.validate;
      const errorMessage = input.dataset.errorMessage || 'Invalid input';
      
      // Create error element
      const errorEl = document.createElement('span');
      errorEl.className = 'validation-error';
      errorEl.style.cssText = `
        display: block;
        color: #b5453a;
        font-size: 0.75rem;
        margin-top: 0.25rem;
        opacity: 0;
        transform: translateY(-5px);
        transition: all 0.3s ease;
      `;
      errorEl.textContent = errorMessage;
      input.parentNode.appendChild(errorEl);
      
      const validators = {
        email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        phone: (value) => /^[\d\s\-\+\(\)]{10,}$/.test(value),
        required: (value) => value.trim().length > 0,
        minlength: (value) => value.length >= parseInt(input.dataset.minlength || 1),
        maxlength: (value) => value.length <= parseInt(input.dataset.maxlength || 1000),
        number: (value) => !isNaN(parseFloat(value)),
        url: (value) => /^https?:\/\/.+/.test(value)
      };
      
      const validate = () => {
        const isValid = validators[validationType]?.(input.value) ?? true;
        
        if (!isValid && input.value) {
          input.style.borderColor = '#b5453a';
          errorEl.style.opacity = '1';
          errorEl.style.transform = 'translateY(0)';
        } else {
          input.style.borderColor = input.value ? '#3d7a52' : '';
          errorEl.style.opacity = '0';
          errorEl.style.transform = 'translateY(-5px)';
        }
        
        return isValid;
      };
      
      input.addEventListener('blur', validate);
      input.addEventListener('input', () => {
        if (input.dataset.validated) validate();
      });
      
      // Mark as validated after first blur
      input.addEventListener('blur', () => {
        input.dataset.validated = 'true';
      }, { once: true });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOCUS GLOW EFFECT
  // Animated border glow on focus
  // ═══════════════════════════════════════════════════════════════════════════

  function initFocusGlow() {
    const inputs = document.querySelectorAll('input, textarea, select');
    
    inputs.forEach(input => {
      input.style.transition = 'border-color 0.3s ease, box-shadow 0.3s ease';
      
      input.addEventListener('focus', () => {
        input.style.borderColor = '#4a6741';
        input.style.boxShadow = '0 0 0 3px rgba(74, 103, 65, 0.15), 0 0 20px rgba(74, 103, 65, 0.1)';
        input.style.outline = 'none';
      });
      
      input.addEventListener('blur', () => {
        input.style.boxShadow = '';
        if (!input.value) {
          input.style.borderColor = '';
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORM SUBMISSION WITH CONFETTI
  // Celebration animation on successful form submission
  // ═══════════════════════════════════════════════════════════════════════════

  function initFormCelebration() {
    const forms = document.querySelectorAll('[data-celebrate-submit]');
    
    forms.forEach(form => {
      form.addEventListener('submit', (e) => {
        // Check if form is valid
        if (!form.checkValidity()) return;
        
        // Trigger confetti
        if (window.ferniConfetti) {
          window.ferniConfetti(form, 30);
        }
        
        // Show success state on button
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = '✓ Sent!';
          btn.style.background = '#3d7a52';
          
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
          }, 3000);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUCCESS/ERROR BUTTON STATES
  // Animated feedback for form actions
  // ═══════════════════════════════════════════════════════════════════════════

  function initButtonStates() {
    // Success state
    window.ferniButtonSuccess = (btn) => {
      const original = btn.innerHTML;
      btn.innerHTML = `
        <svg class="btn-success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:20px;height:20px;">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        Success!
      `;
      btn.style.background = '#3d7a52';
      btn.classList.add('btn-success-animate');
      
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.background = '';
        btn.classList.remove('btn-success-animate');
      }, 2500);
    };
    
    // Error state
    window.ferniButtonError = (btn, message = 'Error') => {
      const original = btn.innerHTML;
      btn.innerHTML = `
        <svg class="btn-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        ${message}
      `;
      btn.style.background = '#b5453a';
      btn.classList.add('btn-shake');
      
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.background = '';
        btn.classList.remove('btn-shake');
      }, 2500);
    };
    
    // Loading state
    window.ferniButtonLoading = (btn) => {
      const original = btn.innerHTML;
      btn.dataset.originalContent = original;
      btn.innerHTML = `
        <span class="btn-spinner"></span>
        Loading...
      `;
      btn.disabled = true;
      btn.style.pointerEvents = 'none';
    };
    
    window.ferniButtonReset = (btn) => {
      btn.innerHTML = btn.dataset.originalContent || btn.innerHTML;
      btn.disabled = false;
      btn.style.pointerEvents = '';
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INJECT STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Button success animation */
      .btn-success-animate {
        animation: successPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      @keyframes successPop {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      
      /* Button shake animation */
      .btn-shake {
        animation: shake 0.5s ease;
      }
      
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-5px); }
        40%, 80% { transform: translateX(5px); }
      }
      
      /* Button spinner */
      .btn-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-right: 8px;
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      /* Autofill styling */
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,
      textarea:-webkit-autofill {
        -webkit-box-shadow: 0 0 0 1000px #faf8f5 inset !important;
        -webkit-text-fill-color: #2c2520 !important;
        caret-color: #2c2520;
        transition: background-color 5000s ease-in-out 0s;
      }
      
      /* Validation icons */
      input:valid:not(:placeholder-shown) {
        border-color: #3d7a52;
      }
      
      input:invalid:not(:placeholder-shown):not(:focus) {
        border-color: #b5453a;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    injectStyles();
    initFloatingLabels();
    initInlineValidation();
    initFocusGlow();
    initFormCelebration();
    initButtonStates();
    
    console.log('%c📝 Enhanced forms loaded', 'color: #4a6741; font-weight: bold;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

