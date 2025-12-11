/**
 * Hero Story Experience
 * =====================
 * A cinematic, interactive story that demonstrates Ferni's magic.
 *
 * The hero becomes a mini-movie that:
 * 1. Opens with a relatable human moment
 * 2. Shows Ferni responding with genuine understanding
 * 3. Lets the user choose to dive deeper or watch more
 *
 * Philosophy: SHOW the magic, don't describe it.
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // STORY CONTENT - Real human moments
  // ═══════════════════════════════════════════════════════════════════════════

  const STORIES = {
    // Late night anxiety
    lateNight: {
      id: 'late-night',
      time: '3:47 AM',
      mood: 'anxious',
      userThought: "I can't stop replaying what I said to her...",
      userContext: 'The words keep echoing. Did I mess everything up?',
      ferniResponse:
        "That's a heavy thing to carry at this hour. What did you say that's weighing on you?",
      ferniTone: 'gentle',
      followUp: "I'm here. No judgment. Just tell me what happened.",
    },

    // Big decision paralysis
    bigDecision: {
      id: 'big-decision',
      time: '2:15 PM',
      mood: 'overwhelmed',
      userThought: 'I have to decide by tomorrow and I have no idea what to do.',
      userContext: 'Job offer. New city. Leave everything behind?',
      ferniResponse:
        "That's not a small thing. Let's not rush—what's the part that scares you most?",
      ferniTone: 'grounded',
      followUp: 'Sometimes the fear tells us what matters.',
    },

    // Feeling stuck
    feelingStuck: {
      id: 'feeling-stuck',
      time: '10:30 AM',
      mood: 'lost',
      userThought: 'Everyone else seems to have it figured out except me.',
      userContext: 'Same job. Same routine. Same emptiness.',
      ferniResponse:
        "That comparison trap is brutal. But here's the truth—nobody has it figured out. What would 'figured out' even look like for you?",
      ferniTone: 'honest',
      followUp: "Let's start there.",
    },

    // Relationship doubt
    relationship: {
      id: 'relationship',
      time: '11:52 PM',
      mood: 'confused',
      userThought: 'I love them but something feels... off.',
      userContext: "Can't put my finger on it. Is this normal?",
      ferniResponse:
        "That 'something's off' feeling—your gut is trying to tell you something. What does 'off' feel like?",
      ferniTone: 'curious',
      followUp: "I'm listening.",
    },

    // Small win
    smallWin: {
      id: 'small-win',
      time: '6:45 PM',
      mood: 'hopeful',
      userThought: 'I actually did it. I spoke up in the meeting.',
      userContext: 'My voice shook but I said what I needed to say.',
      ferniResponse:
        "Wait—that's huge. Your voice shook but you kept going anyway? That's not small. That's brave.",
      ferniTone: 'warm',
      followUp: 'Tell me how it felt.',
    },
  };

  // Story sequence for auto-play
  const STORY_SEQUENCE = ['lateNight', 'bigDecision', 'feelingStuck', 'relationship', 'smallWin'];

  // ═══════════════════════════════════════════════════════════════════════════
  // HERO STORY CONTROLLER
  // ═══════════════════════════════════════════════════════════════════════════

  const HeroStory = {
    container: null,
    currentStory: null,
    currentStoryIndex: 0,
    isPlaying: false,
    isPaused: false,
    hasInteracted: false,
    typewriterTimeout: null,

    // Initialize the story experience
    init() {
      this.container = document.querySelector('[data-hero-story]');
      if (!this.container) return;

      this.bindEvents();
      this.selectInitialStory();

      // Start auto-play after a moment
      setTimeout(() => {
        if (!this.hasInteracted) {
          this.play();
        }
      }, 1500);
    },

    // Select initial story based on time of day
    selectInitialStory() {
      const hour = new Date().getHours();

      if (hour >= 0 && hour < 6) {
        // Late night - show anxiety story
        this.currentStory = STORIES.lateNight;
      } else if (hour >= 6 && hour < 12) {
        // Morning - show stuck/routine story
        this.currentStory = STORIES.feelingStuck;
      } else if (hour >= 12 && hour < 18) {
        // Afternoon - show decision story
        this.currentStory = STORIES.bigDecision;
      } else {
        // Evening - show relationship or win story
        this.currentStory = Math.random() > 0.5 ? STORIES.relationship : STORIES.smallWin;
      }

      this.currentStoryIndex = STORY_SEQUENCE.indexOf(
        Object.keys(STORIES).find((key) => STORIES[key] === this.currentStory)
      );
    },

    // Bind event listeners
    bindEvents() {
      // Story selector buttons
      this.container.querySelectorAll('[data-story-select]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const storyId = e.currentTarget.dataset.storySelect;
          this.hasInteracted = true;
          this.selectStory(storyId);
        });
      });

      // Pause/play on click
      const storyArea = this.container.querySelector('[data-story-area]');
      if (storyArea) {
        storyArea.addEventListener('click', () => {
          this.hasInteracted = true;
          if (this.isPlaying) {
            this.pause();
          } else {
            this.resume();
          }
        });
      }

      // Next story button
      const nextBtn = this.container.querySelector('[data-story-next]');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          this.hasInteracted = true;
          this.nextStory();
        });
      }

      // CTA interruption
      const ctaBtn = this.container.querySelector('[data-story-cta]');
      if (ctaBtn) {
        ctaBtn.addEventListener('click', () => {
          this.pause();
          // Track engagement
          if (window.gtag) {
            window.gtag('event', 'hero_story_cta_click', {
              story_id: this.currentStory?.id,
            });
          }
        });
      }
    },

    // Select a specific story
    selectStory(storyId) {
      const story = Object.values(STORIES).find((s) => s.id === storyId);
      if (!story) return;

      this.currentStory = story;
      this.reset();
      this.play();
    },

    // Play the current story
    async play() {
      if (!this.currentStory || this.isPlaying) return;

      this.isPlaying = true;
      this.isPaused = false;

      const story = this.currentStory;

      // Phase 1: Set the scene (darkness, time)
      await this.setScene(story);
      if (this.isPaused) return;

      // Phase 2: Show user's thought (the human moment)
      await this.showUserThought(story);
      if (this.isPaused) return;

      // Phase 3: Context appears
      await this.showContext(story);
      if (this.isPaused) return;

      // Phase 4: Orb awakens (Ferni notices)
      await this.awakenOrb(story);
      if (this.isPaused) return;

      // Phase 5: Ferni responds
      await this.showFerniResponse(story);
      if (this.isPaused) return;

      // Phase 6: Follow-up + CTA
      await this.showFollowUp(story);

      this.isPlaying = false;

      // Auto-advance after delay (if not interacted)
      if (!this.hasInteracted) {
        setTimeout(() => {
          if (!this.hasInteracted && !this.isPaused) {
            this.nextStory();
          }
        }, 8000);
      }
    },

    // Phase 1: Set the scene
    async setScene(story) {
      const sceneEl = this.container.querySelector('[data-scene]');
      const timeEl = this.container.querySelector('[data-time]');

      // Set mood class on container
      this.container.dataset.mood = story.mood;

      // Fade in time
      if (timeEl) {
        timeEl.textContent = story.time;
        timeEl.classList.add('visible');
      }

      await this.wait(800);
    },

    // Phase 2: Show user's thought
    async showUserThought(story) {
      const thoughtEl = this.container.querySelector('[data-user-thought]');
      if (!thoughtEl) return;

      thoughtEl.classList.add('visible');
      await this.typewrite(thoughtEl, story.userThought, 40);
      await this.wait(1200);
    },

    // Phase 3: Show context
    async showContext(story) {
      const contextEl = this.container.querySelector('[data-user-context]');
      if (!contextEl) return;

      contextEl.classList.add('visible');
      await this.typewrite(contextEl, story.userContext, 30);
      await this.wait(1500);
    },

    // Phase 4: Awaken the orb
    async awakenOrb(story) {
      const orb = this.container.querySelector('[data-hero-orb]');
      const orbContainer = this.container.querySelector('[data-orb-container]');

      if (orbContainer) {
        orbContainer.classList.add('awakening');
      }

      if (orb) {
        orb.classList.add('orb-aware');
        orb.classList.remove('orb-idle');

        // Trigger micro-expression
        if (window.FerniEQ?.MicroExpressions) {
          window.FerniEQ.MicroExpressions.recognition(orb);
        }
      }

      await this.wait(600);
    },

    // Phase 5: Ferni responds
    async showFerniResponse(story) {
      const responseEl = this.container.querySelector('[data-ferni-response]');
      const responseCard = this.container.querySelector('[data-response-card]');

      if (responseCard) {
        responseCard.classList.add('visible');
      }

      if (responseEl) {
        responseEl.dataset.tone = story.ferniTone;
        await this.typewrite(responseEl, story.ferniResponse, 25);
      }

      await this.wait(1000);
    },

    // Phase 6: Follow-up
    async showFollowUp(story) {
      const followUpEl = this.container.querySelector('[data-ferni-followup]');
      const ctaEl = this.container.querySelector('[data-story-cta]');

      if (followUpEl) {
        followUpEl.classList.add('visible');
        await this.typewrite(followUpEl, story.followUp, 35);
      }

      if (ctaEl) {
        await this.wait(500);
        ctaEl.classList.add('visible');
      }
    },

    // Typewriter effect
    async typewrite(element, text, speed = 30) {
      return new Promise((resolve) => {
        element.textContent = '';
        let i = 0;

        const type = () => {
          if (this.isPaused) {
            // If paused, complete immediately
            element.textContent = text;
            resolve();
            return;
          }

          if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;

            // Variable speed for natural feel
            const char = text.charAt(i - 1);
            let delay = speed;
            if (char === '.' || char === '?' || char === '!') delay = speed * 4;
            else if (char === ',') delay = speed * 2;
            else if (char === '—') delay = speed * 3;

            this.typewriterTimeout = setTimeout(type, delay);
          } else {
            resolve();
          }
        };

        type();
      });
    },

    // Pause playback
    pause() {
      this.isPaused = true;
      if (this.typewriterTimeout) {
        clearTimeout(this.typewriterTimeout);
      }
      this.container?.classList.add('paused');
    },

    // Resume playback
    resume() {
      if (!this.isPaused) return;
      this.isPaused = false;
      this.container?.classList.remove('paused');

      // Continue from where we were or restart
      if (!this.isPlaying) {
        this.play();
      }
    },

    // Go to next story
    nextStory() {
      this.currentStoryIndex = (this.currentStoryIndex + 1) % STORY_SEQUENCE.length;
      this.currentStory = STORIES[STORY_SEQUENCE[this.currentStoryIndex]];
      this.reset();
      this.play();
    },

    // Reset the display
    reset() {
      this.isPlaying = false;
      this.isPaused = false;

      if (this.typewriterTimeout) {
        clearTimeout(this.typewriterTimeout);
      }

      // Hide all story elements
      const elements = this.container?.querySelectorAll(
        '[data-time], [data-user-thought], [data-user-context], [data-ferni-response], [data-ferni-followup], [data-response-card], [data-story-cta]'
      );
      elements?.forEach((el) => {
        el.classList.remove('visible');
        if (
          el.dataset.userThought !== undefined ||
          el.dataset.userContext !== undefined ||
          el.dataset.ferniResponse !== undefined ||
          el.dataset.ferniFollowup !== undefined
        ) {
          el.textContent = '';
        }
      });

      // Reset orb state
      const orb = this.container?.querySelector('[data-hero-orb]');
      const orbContainer = this.container?.querySelector('[data-orb-container]');
      if (orb) {
        orb.classList.remove('orb-aware', 'orb-engaged');
        orb.classList.add('orb-idle');
      }
      if (orbContainer) {
        orbContainer.classList.remove('awakening');
      }
    },

    // Helper: wait
    wait(ms) {
      return new Promise((resolve) => {
        if (this.isPaused) {
          resolve();
          return;
        }
        setTimeout(resolve, ms);
      });
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STORY SELECTOR UI
  // Let users pick their moment
  // ═══════════════════════════════════════════════════════════════════════════

  const StorySelector = {
    container: null,

    init() {
      this.container = document.querySelector('[data-story-selector]');
      if (!this.container) return;

      this.render();
    },

    render() {
      const moments = [
        { id: 'late-night', label: "Can't sleep", time: '3am' },
        { id: 'big-decision', label: 'Big decision', time: 'afternoon' },
        { id: 'feeling-stuck', label: 'Feeling stuck', time: 'morning' },
        { id: 'relationship', label: 'Relationship', time: 'evening' },
        { id: 'small-win', label: 'Small win', time: 'evening' },
      ];

      this.container.innerHTML = `
        <div class="story-selector-label">Pick a moment:</div>
        <div class="story-selector-buttons">
          ${moments
            .map(
              (m) => `
            <button
              data-story-select="${m.id}"
              class="story-select-btn"
              aria-label="${m.label}"
            >
              <span class="story-select-label">${m.label}</span>
            </button>
          `
            )
            .join('')}
        </div>
      `;
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    HeroStory.init();
    StorySelector.init();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for external access
  window.HeroStory = HeroStory;
})();




