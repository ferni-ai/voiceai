/**
 * Digital Twin Profile UI
 *
 * A comprehensive setup experience for capturing the user's authentic self.
 * Captures background, mannerisms, values, and communication patterns
 * to make the Digital Twin feel genuinely like them.
 *
 * Features:
 * - Background story capture (life chapters, key events)
 * - Mannerisms & phrases ("things I always say")
 * - Communication style preferences
 * - Values and beliefs
 * - Interests and passions
 * - Voice pattern learning from journal entries
 *
 * @module digital-twin-profile.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { updateCustomAgent, getCustomAgent, type CustomAgent } from '../services/custom-agent.service.js';

const log = createLogger('DigitalTwinProfileUI');

// ============================================================================
// TYPES
// ============================================================================

type ProfileSection =
  | 'intro'
  | 'background'
  | 'mannerisms'
  | 'communication'
  | 'values'
  | 'interests'
  | 'review';

interface LifeChapter {
  id: string;
  title: string;
  years: string;
  description: string;
  keyMoments: string[];
}

interface Mannerism {
  id: string;
  phrase: string;
  context: string; // When do you say this?
  emotion?: string; // What emotion does it express?
}

interface TwinProfile {
  // Background
  lifeChapters: LifeChapter[];
  keyRelationships: Array<{
    name: string;
    relationship: string;
    importance: string;
  }>;
  formativeExperiences: string[];

  // Mannerisms
  signaturePhrases: Mannerism[];
  greetingStyle: string;
  farewellStyle: string;
  expressionsWhenHappy: string[];
  expressionsWhenSad: string[];
  expressionsWhenExcited: string[];
  expressionsWhenFrustrated: string[];

  // Communication Style
  communicationStyle: {
    formality: 'very_casual' | 'casual' | 'balanced' | 'formal' | 'very_formal';
    pace: 'very_fast' | 'fast' | 'moderate' | 'slow' | 'very_slow';
    verbosity: 'concise' | 'moderate' | 'detailed' | 'verbose';
    storytelling: boolean;
    usesMetaphors: boolean;
    askingQuestions: boolean;
    givingAdvice: boolean;
  };

  // Values & Beliefs
  coreValues: string[];
  lifePhilosophy: string;
  whatMatters: string[];
  beliefs: string[];

  // Interests
  passions: string[];
  hobbies: string[];
  favoriteTopics: string[];
  thingsToAvoid: string[];
}

// ============================================================================
// STATE
// ============================================================================

let profileModal: HTMLElement | null = null;
let currentAgent: CustomAgent | null = null;
let currentSection: ProfileSection = 'intro';
let profile: TwinProfile = createEmptyProfile();

function createEmptyProfile(): TwinProfile {
  return {
    lifeChapters: [],
    keyRelationships: [],
    formativeExperiences: [],
    signaturePhrases: [],
    greetingStyle: '',
    farewellStyle: '',
    expressionsWhenHappy: [],
    expressionsWhenSad: [],
    expressionsWhenExcited: [],
    expressionsWhenFrustrated: [],
    communicationStyle: {
      formality: 'balanced',
      pace: 'moderate',
      verbosity: 'moderate',
      storytelling: false,
      usesMetaphors: false,
      askingQuestions: false,
      givingAdvice: false,
    },
    coreValues: [],
    lifePhilosophy: '',
    whatMatters: [],
    beliefs: [],
    passions: [],
    hobbies: [],
    favoriteTopics: [],
    thingsToAvoid: [],
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function ensureModalExists(): HTMLElement {
  if (profileModal) return profileModal;

  // Clean up orphaned elements (HMR protection)
  document.querySelectorAll('.twin-profile-overlay').forEach((el) => el.remove());

  profileModal = document.createElement('div');
  profileModal.className = 'twin-profile-overlay';
  profileModal.innerHTML = `
    <div class="profile-backdrop" data-action="close" role="button" tabindex="0"></div>
    <div class="profile-container" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <header class="profile-header">
        <div class="profile-header-content">
          <h2 class="profile-title" id="profile-title">Build Your Digital Twin</h2>
          <p class="profile-subtitle">Help me understand who you are</p>
        </div>
        <button class="profile-close" data-action="close" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <!-- Progress Bar -->
      <div class="profile-progress">
        <div class="progress-bar">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
        <div class="progress-steps" id="progress-steps">
          <!-- Rendered dynamically -->
        </div>
      </div>

      <main class="profile-content" id="profile-content">
        <!-- Section content rendered dynamically -->
      </main>

      <footer class="profile-footer">
        <button aria-label="Back" class="profile-btn profile-btn--secondary" id="btn-back" data-action="back">
          Back
        </button>
        <button aria-label="Continue" class="profile-btn profile-btn--primary" id="btn-next" data-action="next">
          Continue
        </button>
      </footer>
    </div>
  `;

  profileModal.addEventListener('click', handleModalClick);
  profileModal.addEventListener('keydown', handleModalKeydown);

  // Add styles
  if (!document.getElementById('twin-profile-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'twin-profile-styles';
    styleSheet.textContent = getProfileStyles();
    document.head.appendChild(styleSheet);
  }

  document.body.appendChild(profileModal);
  return profileModal;
}

// ============================================================================
// MODAL CONTROLS
// ============================================================================

export async function openTwinProfile(agentId: string): Promise<void> {
  const modal = ensureModalExists();

  try {
    const agent = await getCustomAgent(agentId);
    if (!agent) {
      log.error('Agent not found:', agentId);
      const { toast } = await import('./toast.ui.js');
      toast.error('Agent not found');
      return;
    }

    if (agent.type !== 'twin') {
      const { toast } = await import('./toast.ui.js');
      toast.warning('Profile setup is only for Digital Twin agents');
      return;
    }

    currentAgent = agent;

    // Load existing profile data if any
    loadExistingProfile(agent);

    // Start at intro
    currentSection = 'intro';
    renderSection();
    updateProgress();

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    soundUI.play('switch');
  } catch (error) {
    log.error('Failed to open twin profile:', error);
    const { toast } = await import('./toast.ui.js');
    toast.error('Could not open profile setup');
  }
}

export function closeTwinProfile(): void {
  if (!profileModal) return;

  profileModal.classList.remove('open');
  document.body.style.overflow = '';

  currentAgent = null;
  profile = createEmptyProfile();
  currentSection = 'intro';

  soundUI.play('switch');
}

function loadExistingProfile(agent: CustomAgent): void {
  // Load from agent's personality and behaviors if they exist
  profile = createEmptyProfile();

  if (agent.personality) {
    const p = agent.personality as unknown as Record<string, unknown>;
    if (p.values && Array.isArray(p.values)) {
      profile.coreValues = p.values as string[];
    }
    if (p.passions && Array.isArray(p.passions)) {
      profile.passions = p.passions as string[];
    }
    if (p.worldview) {
      profile.lifePhilosophy = p.worldview as string;
    }
  }

  if (agent.behaviors) {
    const b = agent.behaviors as unknown as Record<string, unknown>;
    if (b.catchphrases && Array.isArray(b.catchphrases)) {
      profile.signaturePhrases = (b.catchphrases as string[]).map((phrase, i) => ({
        id: `phrase-${i}`,
        phrase,
        context: '',
      }));
    }
    if (b.greetings && Array.isArray(b.greetings) && b.greetings.length > 0) {
      profile.greetingStyle = (b.greetings as string[])[0];
    }
    if (b.farewells && Array.isArray(b.farewells) && b.farewells.length > 0) {
      profile.farewellStyle = (b.farewells as string[])[0];
    }
  }
}

// ============================================================================
// SECTION RENDERING
// ============================================================================

const SECTIONS: ProfileSection[] = [
  'intro',
  'background',
  'mannerisms',
  'communication',
  'values',
  'interests',
  'review',
];

function renderSection(): void {
  const content = profileModal?.querySelector('#profile-content');
  if (!content) return;

  const btnBack = profileModal?.querySelector('#btn-back') as HTMLButtonElement;
  const btnNext = profileModal?.querySelector('#btn-next') as HTMLButtonElement;

  // Update button visibility
  if (btnBack) {
    btnBack.style.visibility = currentSection === 'intro' ? 'hidden' : 'visible';
  }
  if (btnNext) {
    btnNext.textContent = currentSection === 'review' ? 'Save Profile' : 'Continue';
  }

  switch (currentSection) {
    case 'intro':
      content.innerHTML = renderIntroSection();
      break;
    case 'background':
      content.innerHTML = renderBackgroundSection();
      break;
    case 'mannerisms':
      content.innerHTML = renderMannerismsSection();
      break;
    case 'communication':
      content.innerHTML = renderCommunicationSection();
      break;
    case 'values':
      content.innerHTML = renderValuesSection();
      break;
    case 'interests':
      content.innerHTML = renderInterestsSection();
      break;
    case 'review':
      content.innerHTML = renderReviewSection();
      break;
  }

  // Add event listeners for form inputs
  attachSectionListeners();
}

function renderIntroSection(): string {
  return `
    <div class="section section--intro">
      <div class="intro-hero">
        <div class="intro-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="5"/>
            <path d="M20 21a8 8 0 0 0-16 0"/>
          </svg>
        </div>
        <h3 class="intro-title">Let's capture the real you</h3>
        <p class="intro-description">
          The more I know about you—your story, your expressions, 
          how you talk—the more authentic our conversations will feel.
        </p>
      </div>
      
      <div class="intro-features">
        <div class="feature">
          <span class="feature-icon">📖</span>
          <span class="feature-text">Your story and background</span>
        </div>
        <div class="feature">
          <span class="feature-icon">💬</span>
          <span class="feature-text">How you express yourself</span>
        </div>
        <div class="feature">
          <span class="feature-icon">💝</span>
          <span class="feature-text">What matters to you</span>
        </div>
        <div class="feature">
          <span class="feature-icon">✨</span>
          <span class="feature-text">Your unique mannerisms</span>
        </div>
      </div>

      <p class="intro-note">
        This takes about 5-10 minutes. You can always come back and add more later.
      </p>
    </div>
  `;
}

function renderBackgroundSection(): string {
  return `
    <div class="section section--background">
      <h3 class="section-title">Your Story</h3>
      <p class="section-description">
        Help me understand the chapters of your life and the people who matter.
      </p>

      <div class="form-group">
        <label class="form-label">Life Chapters</label>
        <p class="form-hint">Think of your life in chapters—childhood, school, career milestones, etc.</p>
        
        <div class="chapters-list" id="chapters-list">
          ${profile.lifeChapters
            .map(
              (chapter, i) => `
            <div class="chapter-card" data-index="${i}">
              <input type="text" class="chapter-title" placeholder="Chapter title (e.g., 'College Years')" 
                     value="${chapter.title}" data-field="title">
              <input type="text" class="chapter-years" placeholder="Years (e.g., '2015-2019')" 
                     value="${chapter.years}" data-field="years">
              <textarea class="chapter-desc" placeholder="What defined this chapter?" 
                        data-field="description">${chapter.description}</textarea>
              <button aria-label="Remove" class="chapter-remove" data-action="remove-chapter" data-index="${i}">Remove</button>
            </div>
          `
            )
            .join('')}
        </div>
        <button aria-label="Add a life chapter" class="add-btn" data-action="add-chapter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add a life chapter
        </button>
      </div>

      <div class="form-group">
        <label class="form-label">Key Relationships</label>
        <p class="form-hint">Who are the important people in your life?</p>
        
        <div class="relationships-list" id="relationships-list">
          ${profile.keyRelationships
            .map(
              (rel, i) => `
            <div class="relationship-row" data-index="${i}">
              <input type="text" placeholder="Name" value="${rel.name}" data-field="name">
              <input type="text" placeholder="Relationship" value="${rel.relationship}" data-field="relationship">
              <button aria-label="Close" class="remove-btn" data-action="remove-relationship" data-index="${i}">×</button>
            </div>
          `
            )
            .join('')}
        </div>
        <button aria-label="Add a relationship" class="add-btn" data-action="add-relationship">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add a relationship
        </button>
      </div>

      <div class="form-group">
        <label class="form-label">Formative Experiences</label>
        <p class="form-hint">What experiences shaped who you are today?</p>
        <textarea class="form-textarea" id="formative-experiences" 
                  placeholder="e.g., 'Moving to a new country at 12', 'Starting my own business', 'Becoming a parent'..."
        >${profile.formativeExperiences.join('\n')}</textarea>
        <span class="form-hint">Enter each experience on a new line</span>
      </div>
    </div>
  `;
}

function renderMannerismsSection(): string {
  return `
    <div class="section section--mannerisms">
      <h3 class="section-title">Your Expressions</h3>
      <p class="section-description">
        What are the phrases and expressions that are uniquely you?
      </p>

      <div class="form-group">
        <label class="form-label">Signature Phrases</label>
        <p class="form-hint">Things you always say, catchphrases, expressions you're known for</p>
        
        <div class="phrases-list" id="phrases-list">
          ${profile.signaturePhrases
            .map(
              (phrase, i) => `
            <div class="phrase-row" data-index="${i}">
              <input type="text" class="phrase-text" placeholder="The phrase" 
                     value="${phrase.phrase}" data-field="phrase">
              <input type="text" class="phrase-context" placeholder="When do you say this?" 
                     value="${phrase.context}" data-field="context">
              <button aria-label="Close" class="remove-btn" data-action="remove-phrase" data-index="${i}">×</button>
            </div>
          `
            )
            .join('')}
        </div>
        <button aria-label="Add a phrase" class="add-btn" data-action="add-phrase">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add a phrase
        </button>
      </div>

      <div class="form-row">
        <div class="form-group form-group--half">
          <label class="form-label">How do you greet people?</label>
          <input type="text" class="form-input" id="greeting-style" 
                 placeholder="e.g., 'Hey!', 'What's up?', 'Good to see you!'"
                 value="${profile.greetingStyle}">
        </div>
        <div class="form-group form-group--half">
          <label class="form-label">How do you say goodbye?</label>
          <input type="text" class="form-input" id="farewell-style" 
                 placeholder="e.g., 'Later!', 'Take care', 'Catch you soon'"
                 value="${profile.farewellStyle}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">How do you express emotions?</label>
        <div class="emotion-grid">
          <div class="emotion-input">
            <span class="emotion-label">😊 When happy:</span>
            <input type="text" id="expr-happy" placeholder="e.g., 'Awesome!', 'That's amazing!'"
                   value="${profile.expressionsWhenHappy.join(', ')}">
          </div>
          <div class="emotion-input">
            <span class="emotion-label">😢 When sad:</span>
            <input type="text" id="expr-sad" placeholder="e.g., 'That's rough', 'I feel that'"
                   value="${profile.expressionsWhenSad.join(', ')}">
          </div>
          <div class="emotion-input">
            <span class="emotion-label">🎉 When excited:</span>
            <input type="text" id="expr-excited" placeholder="e.g., 'No way!', 'Let's go!'"
                   value="${profile.expressionsWhenExcited.join(', ')}">
          </div>
          <div class="emotion-input">
            <span class="emotion-label">😤 When frustrated:</span>
            <input type="text" id="expr-frustrated" placeholder="e.g., 'Ugh', 'Come on...'"
                   value="${profile.expressionsWhenFrustrated.join(', ')}">
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCommunicationSection(): string {
  const style = profile.communicationStyle;
  return `
    <div class="section section--communication">
      <h3 class="section-title">How You Communicate</h3>
      <p class="section-description">
        Help me understand your natural communication style.
      </p>

      <div class="form-group">
        <label class="form-label">Formality Level</label>
        <p class="form-hint">How formal or casual is your natural way of speaking?</p>
        <div class="slider-container">
          <span class="slider-label">Very Casual</span>
          <input type="range" min="1" max="5" value="${
            style.formality === 'very_casual'
              ? 1
              : style.formality === 'casual'
                ? 2
                : style.formality === 'balanced'
                  ? 3
                  : style.formality === 'formal'
                    ? 4
                    : 5
          }" 
                 class="form-slider" id="formality-slider">
          <span class="slider-label">Very Formal</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Speaking Pace</label>
        <p class="form-hint">How fast or slow do you typically talk?</p>
        <div class="slider-container">
          <span class="slider-label">Very Slow</span>
          <input type="range" min="1" max="5" value="${
            style.pace === 'very_slow'
              ? 1
              : style.pace === 'slow'
                ? 2
                : style.pace === 'moderate'
                  ? 3
                  : style.pace === 'fast'
                    ? 4
                    : 5
          }" 
                 class="form-slider" id="pace-slider">
          <span class="slider-label">Very Fast</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Detail Level</label>
        <p class="form-hint">Are you concise or do you like to elaborate?</p>
        <div class="slider-container">
          <span class="slider-label">Concise</span>
          <input type="range" min="1" max="4" value="${
            style.verbosity === 'concise'
              ? 1
              : style.verbosity === 'moderate'
                ? 2
                : style.verbosity === 'detailed'
                  ? 3
                  : 4
          }" 
                 class="form-slider" id="verbosity-slider">
          <span class="slider-label">Verbose</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Communication Tendencies</label>
        <div class="toggle-grid" role="button" tabindex="0">
          <label class="toggle-option">
            <input type="checkbox" id="toggle-storytelling" ${style.storytelling ? 'checked' : ''}>
            <span class="toggle-text" role="button" tabindex="0">I often tell stories to make a point</span>
          </label>
          <label class="toggle-option">
            <input type="checkbox" id="toggle-metaphors" ${style.usesMetaphors ? 'checked' : ''}>
            <span class="toggle-text" role="button" tabindex="0">I use metaphors and analogies</span>
          </label>
          <label class="toggle-option">
            <input type="checkbox" id="toggle-questions" ${style.askingQuestions ? 'checked' : ''}>
            <span class="toggle-text" role="button" tabindex="0">I ask a lot of questions</span>
          </label>
          <label class="toggle-option">
            <input type="checkbox" id="toggle-advice" ${style.givingAdvice ? 'checked' : ''}>
            <span class="toggle-text" role="button" tabindex="0">I naturally give advice</span>
          </label>
        </div>
      </div>
    </div>
  `;
}

function renderValuesSection(): string {
  return `
    <div class="section section--values">
      <h3 class="section-title">What Matters to You</h3>
      <p class="section-description">
        Understanding your values helps me respond in ways that feel authentic to you.
      </p>

      <div class="form-group">
        <label class="form-label">Core Values</label>
        <p class="form-hint">Select or add the values that define who you are</p>
        <div class="values-chips" id="values-chips">
          ${renderValueChips()}
        </div>
        <div class="custom-value-input">
          <input type="text" id="custom-value" placeholder="Add a custom value...">
          <button aria-label="Add" class="add-btn add-btn--small" data-action="add-custom-value">Add</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Your Life Philosophy</label>
        <p class="form-hint">In a sentence or two, what's your philosophy on life?</p>
        <textarea class="form-textarea" id="life-philosophy" 
                  placeholder="e.g., 'Life's too short to not pursue what makes you happy', 'Always be learning and growing'..."
        >${profile.lifePhilosophy}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">What Matters Most</label>
        <p class="form-hint">What are the things you care deeply about?</p>
        <textarea class="form-textarea" id="what-matters" 
                  placeholder="e.g., 'Family time', 'Personal growth', 'Making a difference'..."
        >${profile.whatMatters.join('\n')}</textarea>
        <span class="form-hint">Enter each item on a new line</span>
      </div>
    </div>
  `;
}

function renderValueChips(): string {
  const commonValues = [
    'Family',
    'Honesty',
    'Growth',
    'Creativity',
    'Adventure',
    'Kindness',
    'Independence',
    'Community',
    'Health',
    'Success',
    'Balance',
    'Authenticity',
    'Learning',
    'Connection',
    'Freedom',
    'Gratitude',
  ];

  return commonValues
    .map(
      (value) => `
    <button class="value-chip ${profile.coreValues.includes(value) ? 'value-chip--selected' : ''}" 
            data-value="${value}">
      ${value}
    </button>
  `
    )
    .join('');
}

function renderInterestsSection(): string {
  return `
    <div class="section section--interests">
      <h3 class="section-title">Your Interests</h3>
      <p class="section-description">
        What are you passionate about? What do you love to talk about?
      </p>

      <div class="form-group">
        <label class="form-label">Passions</label>
        <p class="form-hint">What lights you up? What could you talk about for hours?</p>
        <textarea class="form-textarea" id="passions" 
                  placeholder="e.g., 'Photography', 'Cooking for friends', 'Technology', 'Music'..."
        >${profile.passions.join('\n')}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Hobbies</label>
        <p class="form-hint">What do you do in your free time?</p>
        <textarea class="form-textarea" id="hobbies" 
                  placeholder="e.g., 'Hiking', 'Reading', 'Gaming', 'Gardening'..."
        >${profile.hobbies.join('\n')}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Favorite Topics</label>
        <p class="form-hint">What subjects do you enjoy discussing?</p>
        <textarea class="form-textarea" id="favorite-topics" 
                  placeholder="e.g., 'Philosophy', 'Current events', 'Sports', 'Movies'..."
        >${profile.favoriteTopics.join('\n')}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Topics to Avoid</label>
        <p class="form-hint">Are there any topics you'd rather not discuss?</p>
        <textarea class="form-textarea" id="avoid-topics" 
                  placeholder="e.g., 'Politics', 'Work stress'..."
        >${profile.thingsToAvoid.join('\n')}</textarea>
      </div>
    </div>
  `;
}

function renderReviewSection(): string {
  const phraseCount = profile.signaturePhrases.length;
  const chapterCount = profile.lifeChapters.length;
  const valueCount = profile.coreValues.length;
  const interestCount = profile.passions.length + profile.hobbies.length;

  return `
    <div class="section section--review">
      <h3 class="section-title">Your Digital Twin Profile</h3>
      <p class="section-description">
        Here's what I've learned about you. You can always come back to add more!
      </p>

      <div class="review-grid">
        <div class="review-card">
          <span class="review-icon">📖</span>
          <span class="review-stat">${chapterCount}</span>
          <span class="review-label">Life Chapters</span>
        </div>
        <div class="review-card">
          <span class="review-icon">💬</span>
          <span class="review-stat">${phraseCount}</span>
          <span class="review-label">Signature Phrases</span>
        </div>
        <div class="review-card">
          <span class="review-icon">💝</span>
          <span class="review-stat">${valueCount}</span>
          <span class="review-label">Core Values</span>
        </div>
        <div class="review-card">
          <span class="review-icon">✨</span>
          <span class="review-stat">${interestCount}</span>
          <span class="review-label">Interests</span>
        </div>
      </div>

      ${
        profile.lifePhilosophy
          ? `
        <div class="review-philosophy">
          <h4>Your Philosophy</h4>
          <p>"${profile.lifePhilosophy}"</p>
        </div>
      `
          : ''
      }

      ${
        profile.signaturePhrases.length > 0
          ? `
        <div class="review-phrases">
          <h4>Things You Say</h4>
          <div class="phrase-tags">
            ${profile.signaturePhrases.map((p) => `<span class="phrase-tag">"${p.phrase}"</span>`).join('')}
          </div>
        </div>
      `
          : ''
      }

      <div class="review-note">
        <p>
          The more you journal, the better I'll understand your unique voice. 
          Your expressions, patterns, and perspectives will help make our conversations feel genuinely like you.
        </p>
      </div>
    </div>
  `;
}

// ============================================================================
// PROGRESS
// ============================================================================

function updateProgress(): void {
  const progressFill = profileModal?.querySelector('#progress-fill') as HTMLElement;
  const progressSteps = profileModal?.querySelector('#progress-steps');

  if (!progressFill || !progressSteps) return;

  const currentIndex = SECTIONS.indexOf(currentSection);
  const progress = ((currentIndex + 1) / SECTIONS.length) * 100;

  progressFill.style.width = `${progress}%`;

  progressSteps.innerHTML = SECTIONS.map(
    (section, i) => `
    <div class="progress-step ${i <= currentIndex ? 'progress-step--complete' : ''} ${
      i === currentIndex ? 'progress-step--current' : ''
    }">
      ${i + 1}
    </div>
  `
  ).join('');
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function handleModalClick(e: Event): void {
  const target = e.target as HTMLElement;

  if (target.closest('[data-action="close"]')) {
    closeTwinProfile();
    return;
  }

  if (target.closest('[data-action="next"]')) {
    saveCurrentSection();
    goToNextSection();
    return;
  }

  if (target.closest('[data-action="back"]')) {
    saveCurrentSection();
    goToPreviousSection();
    return;
  }

  // Add actions
  if (target.closest('[data-action="add-chapter"]')) {
    addLifeChapter();
    return;
  }
  if (target.closest('[data-action="add-relationship"]')) {
    addRelationship();
    return;
  }
  if (target.closest('[data-action="add-phrase"]')) {
    addPhrase();
    return;
  }
  if (target.closest('[data-action="add-custom-value"]')) {
    addCustomValue();
    return;
  }

  // Remove actions
  const removeChapter = target.closest('[data-action="remove-chapter"]') as HTMLElement;
  if (removeChapter) {
    removeLifeChapter(parseInt(removeChapter.dataset.index || '0'));
    return;
  }
  const removeRelationship = target.closest('[data-action="remove-relationship"]') as HTMLElement;
  if (removeRelationship) {
    removeRelationshipItem(parseInt(removeRelationship.dataset.index || '0'));
    return;
  }
  const removePhrase = target.closest('[data-action="remove-phrase"]') as HTMLElement;
  if (removePhrase) {
    removePhraseItem(parseInt(removePhrase.dataset.index || '0'));
    return;
  }

  // Value chips
  const valueChip = target.closest('.value-chip') as HTMLElement;
  if (valueChip) {
    toggleValue(valueChip.dataset.value || '');
    return;
  }
}

function handleModalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeTwinProfile();
  }
}

function attachSectionListeners(): void {
  // This is called after rendering each section
  // Most inputs use change/input events captured at save time
}

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

function saveCurrentSection(): void {
  switch (currentSection) {
    case 'background':
      saveBackgroundData();
      break;
    case 'mannerisms':
      saveMannerismsData();
      break;
    case 'communication':
      saveCommunicationData();
      break;
    case 'values':
      saveValuesData();
      break;
    case 'interests':
      saveInterestsData();
      break;
  }
}

function saveBackgroundData(): void {
  // Save formative experiences
  const formativeTextarea = profileModal?.querySelector('#formative-experiences') as HTMLTextAreaElement;
  if (formativeTextarea) {
    profile.formativeExperiences = formativeTextarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s);
  }

  // Life chapters and relationships are saved on add/remove
}

function saveMannerismsData(): void {
  const greetingInput = profileModal?.querySelector('#greeting-style') as HTMLInputElement;
  const farewellInput = profileModal?.querySelector('#farewell-style') as HTMLInputElement;

  if (greetingInput) profile.greetingStyle = greetingInput.value;
  if (farewellInput) profile.farewellStyle = farewellInput.value;

  // Emotion expressions
  const exprHappy = profileModal?.querySelector('#expr-happy') as HTMLInputElement;
  const exprSad = profileModal?.querySelector('#expr-sad') as HTMLInputElement;
  const exprExcited = profileModal?.querySelector('#expr-excited') as HTMLInputElement;
  const exprFrustrated = profileModal?.querySelector('#expr-frustrated') as HTMLInputElement;

  if (exprHappy)
    profile.expressionsWhenHappy = exprHappy.value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);
  if (exprSad)
    profile.expressionsWhenSad = exprSad.value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);
  if (exprExcited)
    profile.expressionsWhenExcited = exprExcited.value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);
  if (exprFrustrated)
    profile.expressionsWhenFrustrated = exprFrustrated.value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);
}

function saveCommunicationData(): void {
  const formalitySlider = profileModal?.querySelector('#formality-slider') as HTMLInputElement;
  const paceSlider = profileModal?.querySelector('#pace-slider') as HTMLInputElement;
  const verbositySlider = profileModal?.querySelector('#verbosity-slider') as HTMLInputElement;

  if (formalitySlider) {
    const val = parseInt(formalitySlider.value);
    profile.communicationStyle.formality =
      val === 1
        ? 'very_casual'
        : val === 2
          ? 'casual'
          : val === 3
            ? 'balanced'
            : val === 4
              ? 'formal'
              : 'very_formal';
  }

  if (paceSlider) {
    const val = parseInt(paceSlider.value);
    profile.communicationStyle.pace =
      val === 1
        ? 'very_slow'
        : val === 2
          ? 'slow'
          : val === 3
            ? 'moderate'
            : val === 4
              ? 'fast'
              : 'very_fast';
  }

  if (verbositySlider) {
    const val = parseInt(verbositySlider.value);
    profile.communicationStyle.verbosity =
      val === 1 ? 'concise' : val === 2 ? 'moderate' : val === 3 ? 'detailed' : 'verbose';
  }

  // Toggles
  const storytelling = profileModal?.querySelector('#toggle-storytelling') as HTMLInputElement;
  const metaphors = profileModal?.querySelector('#toggle-metaphors') as HTMLInputElement;
  const questions = profileModal?.querySelector('#toggle-questions') as HTMLInputElement;
  const advice = profileModal?.querySelector('#toggle-advice') as HTMLInputElement;

  if (storytelling) profile.communicationStyle.storytelling = storytelling.checked;
  if (metaphors) profile.communicationStyle.usesMetaphors = metaphors.checked;
  if (questions) profile.communicationStyle.askingQuestions = questions.checked;
  if (advice) profile.communicationStyle.givingAdvice = advice.checked;
}

function saveValuesData(): void {
  const philosophyTextarea = profileModal?.querySelector('#life-philosophy') as HTMLTextAreaElement;
  const whatMattersTextarea = profileModal?.querySelector('#what-matters') as HTMLTextAreaElement;

  if (philosophyTextarea) profile.lifePhilosophy = philosophyTextarea.value;
  if (whatMattersTextarea) {
    profile.whatMatters = whatMattersTextarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s);
  }
}

function saveInterestsData(): void {
  const passionsTextarea = profileModal?.querySelector('#passions') as HTMLTextAreaElement;
  const hobbiesTextarea = profileModal?.querySelector('#hobbies') as HTMLTextAreaElement;
  const topicsTextarea = profileModal?.querySelector('#favorite-topics') as HTMLTextAreaElement;
  const avoidTextarea = profileModal?.querySelector('#avoid-topics') as HTMLTextAreaElement;

  if (passionsTextarea) {
    profile.passions = passionsTextarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s);
  }
  if (hobbiesTextarea) {
    profile.hobbies = hobbiesTextarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s);
  }
  if (topicsTextarea) {
    profile.favoriteTopics = topicsTextarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s);
  }
  if (avoidTextarea) {
    profile.thingsToAvoid = avoidTextarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s);
  }
}

// ============================================================================
// ADD/REMOVE HELPERS
// ============================================================================

function addLifeChapter(): void {
  profile.lifeChapters.push({
    id: `chapter-${Date.now()}`,
    title: '',
    years: '',
    description: '',
    keyMoments: [],
  });
  renderSection();
  soundUI.play('click');
}

function removeLifeChapter(index: number): void {
  profile.lifeChapters.splice(index, 1);
  renderSection();
  soundUI.play('click');
}

function addRelationship(): void {
  profile.keyRelationships.push({ name: '', relationship: '', importance: '' });
  renderSection();
  soundUI.play('click');
}

function removeRelationshipItem(index: number): void {
  profile.keyRelationships.splice(index, 1);
  renderSection();
  soundUI.play('click');
}

function addPhrase(): void {
  profile.signaturePhrases.push({
    id: `phrase-${Date.now()}`,
    phrase: '',
    context: '',
  });
  renderSection();
  soundUI.play('click');
}

function removePhraseItem(index: number): void {
  profile.signaturePhrases.splice(index, 1);
  renderSection();
  soundUI.play('click');
}

function toggleValue(value: string): void {
  const index = profile.coreValues.indexOf(value);
  if (index >= 0) {
    profile.coreValues.splice(index, 1);
  } else {
    profile.coreValues.push(value);
  }
  renderSection();
  soundUI.play('click');
}

function addCustomValue(): void {
  const input = profileModal?.querySelector('#custom-value') as HTMLInputElement;
  if (input && input.value.trim()) {
    profile.coreValues.push(input.value.trim());
    input.value = '';
    renderSection();
    soundUI.play('click');
  }
}

// ============================================================================
// NAVIGATION
// ============================================================================

function goToNextSection(): void {
  const currentIndex = SECTIONS.indexOf(currentSection);

  if (currentSection === 'review') {
    // Save the profile
    void saveProfileToAgent();
    return;
  }

  if (currentIndex < SECTIONS.length - 1) {
    currentSection = SECTIONS[currentIndex + 1];
    renderSection();
    updateProgress();
    soundUI.play('click');
  }
}

function goToPreviousSection(): void {
  const currentIndex = SECTIONS.indexOf(currentSection);
  if (currentIndex > 0) {
    currentSection = SECTIONS[currentIndex - 1];
    renderSection();
    updateProgress();
    soundUI.play('click');
  }
}

async function saveProfileToAgent(): Promise<void> {
  if (!currentAgent) return;

  const { toast } = await import('./toast.ui.js');

  // Show loading state on button
  const btnNext = profileModal?.querySelector('#btn-next') as HTMLButtonElement;
  const originalText = btnNext?.textContent || 'Save Profile';
  if (btnNext) {
    btnNext.disabled = true;
    btnNext.innerHTML = `
      <span class="loading-spinner"></span>
      Saving...
    `;
  }

  try {
    // Convert profile to agent format
    const updates = {
      personality: {
        ...((currentAgent.personality as unknown as Record<string, unknown>) || {}),
        values: profile.coreValues,
        passions: profile.passions,
        worldview: profile.lifePhilosophy,
        joySources: profile.whatMatters,
        communicationStyle: {
          speaksSlowly:
            profile.communicationStyle.pace === 'slow' ||
            profile.communicationStyle.pace === 'very_slow',
          usesPauses: profile.communicationStyle.pace === 'slow',
          asksQuestions: profile.communicationStyle.askingQuestions,
          givesAdvice: profile.communicationStyle.givingAdvice,
          tellsStories: profile.communicationStyle.storytelling,
          usesMetaphors: profile.communicationStyle.usesMetaphors,
          usesEndearments: false,
        },
        traits: {
          warmth: 0.7,
          directness: profile.communicationStyle.formality === 'formal' ? 0.7 : 0.4,
          humor: 0.5,
          formality:
            profile.communicationStyle.formality === 'formal'
              ? 0.8
              : profile.communicationStyle.formality === 'casual'
                ? 0.3
                : 0.5,
          energy: profile.communicationStyle.pace === 'fast' ? 0.8 : 0.5,
          patience: 0.7,
          wisdom: 0.5,
          playfulness: 0.5,
        },
      },
      behaviors: {
        ...((currentAgent.behaviors as unknown as Record<string, unknown>) || {}),
        catchphrases: profile.signaturePhrases.map((p) => p.phrase),
        greetings: profile.greetingStyle ? [profile.greetingStyle] : [],
        farewells: profile.farewellStyle ? [profile.farewellStyle] : [],
        comfortPhrases: profile.expressionsWhenSad,
        celebrationPhrases: [
          ...profile.expressionsWhenHappy,
          ...profile.expressionsWhenExcited,
        ],
        conversationPatterns: {
          frequentTopics: profile.favoriteTopics,
          avoidTopics: profile.thingsToAvoid,
        },
      },
      memories: {
        ...((currentAgent.memories as Record<string, unknown>) || {}),
        lifeEvents: profile.lifeChapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          date: chapter.years,
          description: chapter.description,
          impact: '',
        })),
        relationships: profile.keyRelationships.map((rel, i) => ({
          id: `rel-${i}`,
          personName: rel.name,
          relationship: rel.relationship,
          description: rel.importance,
        })),
      },
    };

    await updateCustomAgent(currentAgent.id, updates as unknown as Parameters<typeof updateCustomAgent>[1]);

    toast.success('Profile saved!');
    closeTwinProfile();
  } catch (error) {
    log.error('Failed to save profile:', error);
    toast.error('Could not save profile');
  } finally {
    // Restore button state
    if (btnNext) {
      btnNext.disabled = false;
      btnNext.textContent = originalText;
    }
  }
}

// ============================================================================
// STYLES
// ============================================================================

function getProfileStyles(): string {
  return `
    /* Overlay */
    .twin-profile-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .twin-profile-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    
    .profile-backdrop {
      position: absolute;
      inset: 0;
      background: var(--glass-backdrop-bg, rgba(44, 37, 32, 0.4));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
    }

    @supports not (backdrop-filter: blur(1px)) {
      .profile-backdrop {
        background: rgba(44, 37, 32, 0.85);
      }
    }
    
    /* Container */
    .profile-container {
      position: relative;
      width: 90vw;
      max-width: clamp(448px, 90vw, 640px);
      max-height: 90vh;
      background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    @supports not (backdrop-filter: blur(1px)) {
      .profile-container {
        background: var(--color-bg-elevated, #1a1a2e);
        border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      }
    }
    
    .twin-profile-overlay.open .profile-container {
      transform: scale(1);
    }
    
    /* Header */
    .profile-header {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .profile-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    
    .profile-subtitle {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      color: var(--color-text-muted);
      margin: 2px 0 0;
    }
    
    .profile-close {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-sm, 8px);
      border-radius: var(--radius-md, 8px);
      transition: all ${DURATION.FAST}ms;
    }
    
    .profile-close:hover,
    .profile-close:focus-visible {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    /* Progress */
    .profile-progress {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
    }
    
    .progress-bar {
      height: 4px;
      background: var(--color-bg-secondary);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: var(--space-sm, 8px);
    }
    
    .progress-fill {
      height: 100%;
      background: var(--color-accent, #4a6741);
      border-radius: 2px;
      transition: width ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .progress-steps {
      display: flex;
      justify-content: space-between;
    }
    
    .progress-step {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--color-bg-secondary);
      color: var(--color-text-muted);
      font-size: 0.7rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms;
    }
    
    .progress-step--complete {
      background: var(--color-accent, #4a6741);
      color: white;
    }
    
    .progress-step--current {
      box-shadow: 0 0 0 3px var(--color-utility-focus-ring);
    }
    
    /* Content */
    .profile-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 24px);
    }
    
    /* Footer */
    .profile-footer {
      padding: var(--space-md, 16px) var(--space-lg, 24px);
      border-top: 1px solid var(--color-border-subtle);
      display: flex;
      justify-content: space-between;
      gap: var(--space-md, 16px);
    }
    
    .profile-btn {
      padding: var(--space-sm, 10px) var(--space-lg, 24px);
      border-radius: var(--radius-full, 999px);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .profile-btn--primary {
      background: var(--color-accent, #4a6741);
      color: white;
      border: none;
    }
    
    .profile-btn--primary:hover,
    .profile-btn--primary:focus-visible {
      filter: brightness(1.1);
    }
    
    .profile-btn--primary:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    
    .loading-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 6px;
      vertical-align: middle;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .profile-btn--secondary {
      background: none;
      color: var(--color-text-muted);
      border: 1px solid var(--color-border-subtle);
    }
    
    .profile-btn--secondary:hover,
    .profile-btn--secondary:focus-visible {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
    }
    
    /* Section Styles */
    .section {
      animation: fadeIn ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .section-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.3rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs, 4px);
    }
    
    .section-description {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-lg, 24px);
    }
    
    /* Intro Section */
    .section--intro {
      text-align: center;
    }
    
    .intro-hero {
      margin-bottom: var(--space-xl, 32px);
    }
    
    .intro-icon {
      color: var(--color-accent, #4a6741);
      margin-bottom: var(--space-md, 16px);
    }
    
    .intro-title {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.4rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-sm, 8px);
    }
    
    .intro-description {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.95rem;
      color: var(--color-text-secondary);
      max-width: min(380px, 100%);
      margin: 0 auto;
      line-height: 1.6;
    }
    
    .intro-features {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-md, 16px);
      margin-bottom: var(--space-lg, 24px);
    }
    
    .feature {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
    }
    
    .feature-icon {
      font-size: 1.2rem;
    }
    
    .feature-text {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    
    .intro-note {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }
    
    /* Form Styles */
    .form-group {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .form-group--half {
      flex: 1;
    }
    
    .form-row {
      display: flex;
      gap: var(--space-md, 16px);
    }
    
    .form-label {
      display: block;
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: var(--space-xs, 4px);
    }
    
    .form-hint {
      display: block;
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin-bottom: var(--space-sm, 8px);
    }
    
    .form-input,
    .form-textarea {
      width: 100%;
      padding: var(--space-sm, 10px) var(--space-md, 14px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      transition: border-color ${DURATION.FAST}ms;
    }
    
    .form-input:focus,
    .form-textarea:focus {
      outline: none;
      border-color: var(--color-accent, #4a6741);
    }
    
    .form-textarea {
      min-height: 80px;
      resize: vertical;
    }
    
    /* Add Button */
    .add-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 6px);
      padding: var(--space-xs, 8px) var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: 1px dashed var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-muted);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .add-btn:hover,
    .add-btn:focus-visible {
      background: var(--color-bg-tertiary);
      border-color: var(--color-accent, #4a6741);
      color: var(--color-text-primary);
    }
    
    .add-btn--small {
      padding: var(--space-xs, 6px) var(--space-sm, 10px);
      font-size: 0.8rem;
    }
    
    /* Chapters */
    .chapters-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 12px);
      margin-bottom: var(--space-sm, 12px);
    }
    
    .chapter-card {
      padding: var(--space-md, 14px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 8px);
    }
    
    .chapter-title,
    .chapter-years,
    .chapter-desc {
      width: 100%;
      padding: var(--space-xs, 8px) var(--space-sm, 12px);
      background: var(--color-bg-tertiary);
      border: 1px solid transparent;
      border-radius: var(--radius-sm, 6px);
      color: var(--color-text-primary);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
    }
    
    .chapter-title:focus,
    .chapter-years:focus,
    .chapter-desc:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    
    .chapter-desc {
      min-height: 60px;
      resize: none;
    }
    
    .chapter-remove,
    .remove-btn {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: 0.8rem;
      padding: var(--space-xs, 4px) var(--space-sm, 8px);
      align-self: flex-end;
    }
    
    .chapter-remove:hover,
    .remove-btn:hover {
      color: #ef4444;
    }
    
    /* Relationships */
    .relationships-list,
    .phrases-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 8px);
      margin-bottom: var(--space-sm, 12px);
    }
    
    .relationship-row,
    .phrase-row {
      display: flex;
      gap: var(--space-sm, 8px);
      align-items: center;
    }
    
    .relationship-row input,
    .phrase-row input {
      flex: 1;
      padding: var(--space-xs, 8px) var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
    }
    
    .relationship-row input:focus,
    .phrase-row input:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    
    /* Emotion Grid */
    .emotion-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 10px);
    }
    
    .emotion-input {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 10px);
    }
    
    .emotion-label {
      min-width: min(120px, 100%);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    
    .emotion-input input {
      flex: 1;
      padding: var(--space-xs, 8px) var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
    }
    
    /* Sliders */
    .slider-container {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 12px);
    }
    
    .slider-label {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.75rem;
      color: var(--color-text-muted);
      min-width: 70px;
    }
    
    .slider-label:last-child {
      text-align: right;
    }
    
    .form-slider {
      flex: 1;
      height: 6px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--color-bg-secondary);
      border-radius: 3px;
      outline: none;
    }
    
    .form-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      background: var(--color-accent, #4a6741);
      border-radius: 50%;
      cursor: pointer;
    }
    
    .form-slider::-moz-range-thumb {
      width: 18px;
      height: 18px;
      background: var(--color-accent, #4a6741);
      border-radius: 50%;
      cursor: pointer;
      border: none;
    }
    
    /* Toggle Grid */
    .toggle-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 10px);
    }
    
    .toggle-option {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 10px);
      cursor: pointer;
    }
    
    .toggle-option input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--color-accent, #4a6741);
    }
    
    .toggle-text {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.9rem;
      color: var(--color-text-secondary);
    }
    
    /* Value Chips */
    .values-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs, 8px);
      margin-bottom: var(--space-sm, 12px);
    }
    
    .value-chip {
      padding: var(--space-xs, 6px) var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-secondary);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }
    
    .value-chip:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    .value-chip--selected {
      background: rgba(74, 103, 65, 0.2);
      border-color: var(--color-accent, #4a6741);
      color: var(--color-accent, #4a6741);
    }
    
    .custom-value-input {
      display: flex;
      gap: var(--space-sm, 8px);
      align-items: center;
    }
    
    .custom-value-input input {
      flex: 1;
      padding: var(--space-xs, 8px) var(--space-sm, 12px);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
    }
    
    /* Review Section */
    .review-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--space-sm, 12px);
      margin-bottom: var(--space-lg, 24px);
    }
    
    .review-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-md, 16px);
      text-align: center;
    }
    
    .review-icon {
      font-size: 1.5rem;
      display: block;
      margin-bottom: var(--space-xs, 4px);
    }
    
    .review-stat {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    
    .review-label {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.7rem;
      color: var(--color-text-muted);
      display: block;
    }
    
    .review-philosophy {
      background: linear-gradient(135deg, rgba(74, 103, 65, 0.15), rgba(74, 103, 65, 0.05));
      border: 1px solid rgba(74, 103, 65, 0.3);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-md, 16px);
      margin-bottom: var(--space-md, 16px);
    }
    
    .review-philosophy h4 {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-accent, #4a6741);
      margin: 0 0 var(--space-xs, 4px);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .review-philosophy p {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.95rem;
      font-style: italic;
      color: var(--color-text-primary);
      margin: 0;
    }
    
    .review-phrases {
      margin-bottom: var(--space-lg, 24px);
    }
    
    .review-phrases h4 {
      font-family: 'Plus Jakarta Sans', var(--font-display, sans-serif);
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-text-muted);
      margin: 0 0 var(--space-sm, 8px);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .phrase-tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs, 6px);
    }
    
    .phrase-tag {
      padding: var(--space-xs, 4px) var(--space-sm, 10px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-full, 999px);
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.8rem;
      color: var(--color-text-secondary);
    }
    
    .review-note {
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 12px);
    }
    
    .review-note p {
      font-family: 'Inter', var(--font-body, sans-serif);
      font-size: 0.85rem;
      color: var(--color-text-muted);
      margin: 0;
      line-height: 1.6;
    }
    
    /* Responsive */
    @media (max-width: clamp(448px, 90vw, 640px)) {
      .profile-container {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
      }
      
      .intro-features {
        grid-template-columns: 1fr;
      }
      
      .form-row {
        flex-direction: column;
      }
      
      .review-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    
    @media (prefers-reduced-motion: reduce) {
      .section,
      .profile-container,
      .progress-fill {
        animation: none;
        transition: none;
      }
    }
  `;
}

// Functions are already exported with 'export function' declarations above

