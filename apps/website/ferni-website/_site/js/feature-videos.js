/**
 * Feature Video Controller
 * Autoplay videos when they scroll into view (Apple-style)
 * 
 * Features:
 * - IntersectionObserver for scroll detection
 * - Prefers-reduced-motion support
 * - Lazy loading
 * - Fallback to CSS animations
 */

(function() {
  'use strict';

  // Respect user motion preferences
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Configuration
  const CONFIG = {
    threshold: 0.5,        // Video must be 50% visible to play
    rootMargin: '0px',     // No margin around viewport
    lazyLoadMargin: '200px' // Start loading when 200px from viewport
  };

  /**
   * Initialize video autoplay on scroll
   */
  function initFeatureVideos() {
    const videos = document.querySelectorAll('.feature-video video');
    
    if (!videos.length) return;
    
    // Skip autoplay if user prefers reduced motion
    if (prefersReducedMotion) {
      videos.forEach(video => {
        video.pause();
        video.currentTime = 0;
        video.closest('.feature-video')?.classList.add('reduced-motion');
      });
      return;
    }

    // Create observer for autoplay
    const playObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target;
        const container = video.closest('.feature-video');
        
        if (entry.isIntersecting) {
          playVideo(video, container);
        } else {
          pauseVideo(video, container);
        }
      });
    }, {
      threshold: CONFIG.threshold,
      rootMargin: CONFIG.rootMargin
    });

    // Create observer for lazy loading
    const loadObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const video = entry.target;
          loadVideo(video);
          loadObserver.unobserve(video);
        }
      });
    }, {
      rootMargin: CONFIG.lazyLoadMargin
    });

    // Observe all videos
    videos.forEach(video => {
      // Set up lazy loading
      if (video.dataset.src) {
        loadObserver.observe(video);
      } else {
        // Already has source, just observe for play
        playObserver.observe(video);
      }
    });
  }

  /**
   * Load video source lazily
   */
  function loadVideo(video) {
    const src = video.dataset.src;
    if (!src) return;

    const source = document.createElement('source');
    source.src = src;
    source.type = 'video/mp4';
    video.appendChild(source);
    
    video.load();
    
    video.addEventListener('loadeddata', () => {
      const container = video.closest('.feature-video');
      container?.classList.add('video-loaded');
    }, { once: true });
  }

  /**
   * Play video with error handling
   */
  async function playVideo(video, container) {
    try {
      // Ensure video is muted (required for autoplay)
      video.muted = true;
      
      await video.play();
      container?.classList.add('is-playing');
    } catch (err) {
      // Autoplay blocked - show fallback
      console.debug('Video autoplay blocked:', err.name);
      container?.classList.add('autoplay-blocked');
    }
  }

  /**
   * Pause video
   */
  function pauseVideo(video, container) {
    video.pause();
    container?.classList.remove('is-playing');
  }

  /**
   * Toggle play/pause (for manual control)
   */
  function toggleVideo(video) {
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFeatureVideos);
  } else {
    initFeatureVideos();
  }

  // Expose for external use
  window.FeatureVideos = {
    init: initFeatureVideos,
    toggle: toggleVideo
  };
})();

