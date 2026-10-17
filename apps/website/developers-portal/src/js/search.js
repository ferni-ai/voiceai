/**
 * Search functionality for the developer portal
 * Matches page titles and keywords from a fixed list. The build has never run
 * Pagefind, so loading its index only produced a 404 on every page load.
 */

(function () {
  'use strict';

  let searchModal = null;
  let searchInput = null;
  let searchResults = null;

  /**
   * Initialize search functionality
   */
  async function initSearch() {
    searchModal = document.getElementById('searchModal');
    searchInput = document.querySelector('.search-input');
    searchResults = document.querySelector('.search-results');

    if (!searchModal || !searchInput || !searchResults) return;

    // Set up search input handler
    let debounceTimer;
    searchInput.addEventListener('input', function (e) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        performSearch(e.target.value);
      }, 200);
    });

    // Focus trap in modal
    searchModal.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        // Simple focus trap
        const focusableElements = searchModal.querySelectorAll('input, button, a[href]');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    });
  }

  /**
   * Perform search over the page list
   */
  function performSearch(query) {
    if (!query.trim()) {
      searchResults.innerHTML = '<p class="search-hint">Start typing to search...</p>';
      return;
    }
    renderFallbackResults(query);
  }

  /**
   * Render fallback results (simple static search)
   */
  function renderFallbackResults(query) {
    // Simple static pages to search
    const pages = [
      { url: '/getting-started/', title: 'Getting Started', tags: 'quickstart setup install' },
      { url: '/api/', title: 'API Reference', tags: 'api endpoints rest' },
      { url: '/sdk/', title: 'SDK Overview', tags: 'sdk javascript typescript python' },
      { url: '/examples/', title: 'Examples', tags: 'examples demo sample code' },
      { url: '/blog/', title: 'Developer Blog', tags: 'blog articles posts' },
      { url: '/community/', title: 'Community', tags: 'github support help' },
      { url: '/api/explorer/', title: 'API Explorer', tags: 'api test playground openapi swagger' },
      { url: '/console/', title: 'Developer Console', tags: 'console api keys account dashboard' },
      { url: '/personas/create/', title: 'Create a Persona', tags: 'persona create wizard voice publish' },
      { url: '/personas/', title: 'Your Personas', tags: 'personas manage' },
    ];

    const lowerQuery = query.toLowerCase();
    const matches = pages.filter(
      (p) => p.title.toLowerCase().includes(lowerQuery) || p.tags.toLowerCase().includes(lowerQuery)
    );

    if (matches.length === 0) {
      searchResults.innerHTML = `
        <div class="search-no-results">
          <p>No results found for "<strong>${escapeHtml(query)}</strong>"</p>
          <p class="search-hint">Search matches page titles and topics. Try "api", "persona" or "blog".</p>
        </div>
      `;
      return;
    }

    const html = matches
      .map(
        (result) => `
      <a href="${result.url}" class="search-result-item" onclick="closeSearch()">
        <div class="search-result-title">${highlightMatch(result.title, query)}</div>
        <div class="search-result-breadcrumb">${getBreadcrumb(result.url)}</div>
      </a>
    `
      )
      .join('');

    searchResults.innerHTML = html;
  }

  /**
   * Get breadcrumb from URL
   */
  function getBreadcrumb(url) {
    const parts = url.split('/').filter(Boolean);
    if (parts.length === 0) return 'Home';
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ')).join(' › ');
  }

  /**
   * Highlight matching text
   */
  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
  }

  /**
   * Escape HTML
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Escape regex special characters
   */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Global functions for opening/closing search
  window.openSearch = function () {
    if (searchModal) {
      searchModal.classList.add('open');
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      if (searchResults) {
        searchResults.innerHTML = '<p class="search-hint">Start typing to search...</p>';
      }
      document.body.style.overflow = 'hidden';
    }
  };

  window.closeSearch = function () {
    if (searchModal) {
      searchModal.classList.remove('open');
      document.body.style.overflow = '';
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
  } else {
    initSearch();
  }
})();
