/**
 * Code Copy Button Functionality
 * Adds copy-to-clipboard buttons to all code blocks
 */

(function () {
  'use strict';

  // Icons
  const copyIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
  const checkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  /**
   * Initialize copy buttons on all code blocks
   */
  function initCodeCopy() {
    const codeBlocks = document.querySelectorAll('pre[class*="language-"], pre > code');

    codeBlocks.forEach(function (block) {
      // Get the pre element
      const pre = block.tagName === 'PRE' ? block : block.parentElement;

      // Skip if already has a copy button
      if (pre.querySelector('.code-copy-btn')) return;

      // Make pre position relative for absolute positioning of button
      pre.style.position = 'relative';

      // Create copy button
      const button = document.createElement('button');
      button.className = 'code-copy-btn';
      button.setAttribute('aria-label', 'Copy code');
      button.setAttribute('title', 'Copy to clipboard');
      button.innerHTML = copyIcon;

      // Add click handler
      button.addEventListener('click', function () {
        copyToClipboard(pre, button);
      });

      // Insert button into pre element
      pre.appendChild(button);
    });
  }

  /**
   * Copy code content to clipboard
   */
  function copyToClipboard(pre, button) {
    // Get the code element
    const code = pre.querySelector('code') || pre;

    // Get text content
    let text = code.textContent || code.innerText;

    // Remove leading/trailing whitespace
    text = text.trim();

    // Use clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          showCopiedState(button);
        })
        .catch(function (err) {
          console.error('Failed to copy:', err);
          fallbackCopy(text, button);
        });
    } else {
      fallbackCopy(text, button);
    }
  }

  /**
   * Fallback copy using textarea
   */
  function fallbackCopy(text, button) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand('copy');
      showCopiedState(button);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textarea);
  }

  /**
   * Show copied state on button
   */
  function showCopiedState(button) {
    button.innerHTML = checkIcon;
    button.classList.add('copied');

    // Reset after 2 seconds
    setTimeout(function () {
      button.innerHTML = copyIcon;
      button.classList.remove('copied');
    }, 2000);
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCodeCopy);
  } else {
    initCodeCopy();
  }

  // Re-initialize on dynamic content changes (for SPA-like behavior)
  const observer = new MutationObserver(function (mutations) {
    let shouldInit = false;
    mutations.forEach(function (mutation) {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && (node.matches('pre') || node.querySelector('pre'))) {
            shouldInit = true;
          }
        });
      }
    });
    if (shouldInit) {
      initCodeCopy();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
