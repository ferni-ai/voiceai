/**
 * Search functionality for the developer portal
 * Uses Pagefind for static site search
 */

(function () {
  'use strict';

  let pagefind = null;
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

    // Try to load Pagefind
    try {
      pagefind = await import('/pagefind/pagefind.js');
      await pagefind.init();
    } catch (e) {
      console.log('Pagefind not available, using fallback search');
      // Fallback: show a message that search is being indexed
    }

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
   * Perform search using Pagefind or fallback
   */
  async function performSearch(query) {
    if (!query.trim()) {
      searchResults.innerHTML = '<p class="search-hint">Start typing to search...</p>';
      return;
    }

    if (pagefind) {
      // Use Pagefind
      try {
        const search = await pagefind.search(query);
        const results = await Promise.all(search.results.slice(0, 10).map((r) => r.data()));
        renderResults(results, query);
      } catch (e) {
        renderFallbackResults(query);
      }
    } else {
      renderFallbackResults(query);
    }
  }

  /**
   * Render search results
   */
  function renderResults(results, query) {
    if (!results || results.length === 0) {
      searchResults.innerHTML = `
        <div class="search-no-results">
          <p>No results found for "<strong>${escapeHtml(query)}</strong>"</p>
          <p class="search-hint">Try searching for something else, or browse the documentation.</p>
        </div>
      `;
      return;
    }

    const html = results
      .map(
        (result) => `
      <a href="${result.url}" class="search-result-item" onclick="closeSearch()">
        <div class="search-result-title">${highlightMatch(result.meta?.title || 'Untitled', query)}</div>
        <div class="search-result-breadcrumb">${getBreadcrumb(result.url)}</div>
        ${result.excerpt ? `<div class="search-result-excerpt">${result.excerpt}</div>` : ''}
      </a>
    `
      )
      .join('');

    searchResults.innerHTML = html;
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
      { url: '/community/', title: 'Community', tags: 'discord github support' },
      { url: '/pages/api/explorer', title: 'API Explorer', tags: 'api test playground' },
    ];

    const lowerQuery = query.toLowerCase();
    const matches = pages.filter(
      (p) => p.title.toLowerCase().includes(lowerQuery) || p.tags.toLowerCase().includes(lowerQuery)
    );

    if (matches.length === 0) {
      searchResults.innerHTML = `
        <div class="search-no-results">
          <p>No results found for "<strong>${escapeHtml(query)}</strong>"</p>
          <p class="search-hint">Full-text search will be available after the next build.</p>
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
