/**
 * Team Observations Panel
 *
 * Shows real-time observations from cross-persona coordination.
 * This is the "Better than Human" visibility into how the team
 * coordinates care across domains.
 *
 * > "Six brilliant minds. Each seeing what the others can't."
 *
 * @module ui/team-observations-panel
 */

import { apiGet, getUserId } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { DURATION, EASING, STAGGER, prefersReducedMotion } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { PERSONA_ICONS } from './icons/hub-icons.js';

const log = createLogger('TeamObservationsPanel');

// ============================================================================
// TYPES
// ============================================================================

interface PersonaObservation {
  personaId: string;
  observationType: 'pattern' | 'concern' | 'opportunity' | 'milestone' | 'insight';
  content: string;
  confidence: number;
  detectedAt: string;
  domain: string;
  relatedTopics?: string[];
  suggestedAction?: string;
}

interface TeamSynthesis {
  generatedAt: string;
  connectionCount: number;
  recommendationCount: number;
  overallSynthesis: string;
  userState?: {
    wellbeing: number;
    concerns: string[];
    strengths: string[];
    currentTheme: string;
    trajectory: 'improving' | 'stable' | 'declining';
  };
  topConnections?: Array<{
    synthesis: string;
    confidence: number;
  }>;
  topRecommendations?: Array<{
    type: string;
    reason: string;
    priority: string;
    suggestedApproach: string;
  }>;
}

interface TeamObservationsData {
  observations: PersonaObservation[];
  byPersona: Record<string, PersonaObservation[]>;
  synthesis: TeamSynthesis | null;
  total: number;
}

// ============================================================================
// PERSONA CONFIG
// ============================================================================

// BRAND COMPLIANT: Using Lucide SVG icons, NOT emoji
interface PersonaDisplay {
  name: string;
  color: string;
  icon: string;
}

const DEFAULT_PERSONA: PersonaDisplay = {
  name: 'Ferni',
  color: 'var(--persona-ferni-primary, #4a6741)',
  icon: PERSONA_ICONS.ferni,
};

const PERSONA_CONFIG: Record<string, PersonaDisplay> = {
  ferni: DEFAULT_PERSONA,
  peter: {
    name: 'Peter',
    color: 'var(--persona-peter-primary, #3a6b73)',
    icon: PERSONA_ICONS.peter,
  },
  maya: {
    name: 'Maya',
    color: 'var(--persona-maya-primary, #a67a6a)',
    icon: PERSONA_ICONS.maya,
  },
  jordan: {
    name: 'Jordan',
    color: 'var(--persona-jordan-primary, #c4856a)',
    icon: PERSONA_ICONS.jordan,
  },
  alex: {
    name: 'Alex',
    color: 'var(--persona-alex-primary, #5a6b8a)',
    icon: PERSONA_ICONS.alex,
  },
  nayan: {
    name: 'Nayan',
    color: 'var(--persona-nayan-primary, #b8956a)',
    icon: PERSONA_ICONS.nayan,
  },
};

const DEFAULT_TYPE_STYLE = { bg: 'var(--color-text-muted, #8a7f75)', label: 'Insight' };

const OBSERVATION_TYPE_STYLES: Record<string, typeof DEFAULT_TYPE_STYLE> = {
  concern: { bg: 'var(--color-semantic-warning, #f59e0b)', label: 'Concern' },
  opportunity: { bg: 'var(--color-semantic-success, #10b981)', label: 'Opportunity' },
  pattern: { bg: 'var(--color-accent-primary, #4a6741)', label: 'Pattern' },
  milestone: { bg: 'var(--color-semantic-info, #3b82f6)', label: 'Milestone' },
  insight: DEFAULT_TYPE_STYLE,
};

// ============================================================================
// STATE
// ============================================================================

let panelElement: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isLoading = false;
let cachedData: TeamObservationsData | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute

// ============================================================================
// API
// ============================================================================

async function fetchObservations(): Promise<TeamObservationsData | null> {
  const userId = getUserId();
  if (!userId) {
    log.debug('Cannot fetch observations: no user ID');
    return null;
  }

  try {
    const response = await apiGet<TeamObservationsData>(
      `/api/semantic-intelligence/team-observations?userId=${userId}`
    );

    if (!response.ok || !response.data) {
      log.warn('Failed to fetch team observations:', response.error);
      return null;
    }

    return response.data;
  } catch (error) {
    log.error('Error fetching team observations:', error);
    return null;
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderObservationCard(obs: PersonaObservation, index: number): string {
  const persona = PERSONA_CONFIG[obs.personaId] ?? DEFAULT_PERSONA;
  const typeStyle = OBSERVATION_TYPE_STYLES[obs.observationType] ?? DEFAULT_TYPE_STYLE;
  const delay = index * STAGGER.TIGHT;
  const confidencePercent = Math.round(obs.confidence * 100);
  const timeAgo = getTimeAgo(new Date(obs.detectedAt));

  return `
    <div class="team-obs-card" style="--card-delay: ${delay}ms; --persona-color: ${persona.color}">
      <div class="team-obs-card__header">
        <div class="team-obs-card__persona">
          <span class="team-obs-card__persona-icon">${persona.icon}</span>
          <span class="team-obs-card__persona-name">${persona.name}</span>
        </div>
        <span class="team-obs-card__type" style="--type-bg: ${typeStyle.bg}">
          ${typeStyle.label}
        </span>
      </div>
      <p class="team-obs-card__content">${escapeHtml(obs.content)}</p>
      <div class="team-obs-card__meta">
        <span class="team-obs-card__domain">${obs.domain.replace(/_/g, ' ')}</span>
        <span class="team-obs-card__confidence" title="Confidence: ${confidencePercent}%">
          ${confidencePercent}%
        </span>
        <span class="team-obs-card__time">${timeAgo}</span>
      </div>
      ${obs.suggestedAction ? `
        <div class="team-obs-card__action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
          ${escapeHtml(obs.suggestedAction)}
        </div>
      ` : ''}
      ${obs.relatedTopics && obs.relatedTopics.length > 0 ? `
        <div class="team-obs-card__topics">
          ${obs.relatedTopics.slice(0, 3).map(t => `<span class="team-obs-card__topic">${escapeHtml(t)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderSynthesis(synthesis: TeamSynthesis): string {
  const userState = synthesis.userState;
  const wellbeingClass = userState
    ? userState.wellbeing > 0.6 ? 'positive' : userState.wellbeing < 0.4 ? 'negative' : 'neutral'
    : 'neutral';

  return `
    <div class="team-obs-synthesis">
      <div class="team-obs-synthesis__header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <span>Team Synthesis</span>
      </div>
      <p class="team-obs-synthesis__text">${escapeHtml(synthesis.overallSynthesis)}</p>
      
      ${userState ? `
        <div class="team-obs-synthesis__state team-obs-synthesis__state--${wellbeingClass}">
          <div class="team-obs-synthesis__state-header">
            <span>Overall Assessment</span>
            <span class="team-obs-synthesis__trajectory">
              ${userState.trajectory === 'improving' ? '↗️ Improving' : 
                userState.trajectory === 'declining' ? '↘️ Declining' : '→ Stable'}
            </span>
          </div>
          <div class="team-obs-synthesis__wellbeing">
            <div class="team-obs-synthesis__wellbeing-bar">
              <div class="team-obs-synthesis__wellbeing-fill" style="width: ${userState.wellbeing * 100}%"></div>
            </div>
            <span>${Math.round(userState.wellbeing * 100)}%</span>
          </div>
          ${userState.currentTheme ? `
            <div class="team-obs-synthesis__theme">
              Theme: <strong>${escapeHtml(userState.currentTheme)}</strong>
            </div>
          ` : ''}
        </div>
      ` : ''}
      
      ${synthesis.topConnections && synthesis.topConnections.length > 0 ? `
        <div class="team-obs-synthesis__connections">
          <h4>Cross-Domain Connections</h4>
          ${synthesis.topConnections.map(c => `
            <div class="team-obs-synthesis__connection">
              <span class="team-obs-synthesis__connection-confidence">${Math.round(c.confidence * 100)}%</span>
              <span>${escapeHtml(c.synthesis)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${synthesis.topRecommendations && synthesis.topRecommendations.length > 0 ? `
        <div class="team-obs-synthesis__recommendations">
          <h4>Team Recommendations</h4>
          ${synthesis.topRecommendations.map(r => `
            <div class="team-obs-synthesis__recommendation team-obs-synthesis__recommendation--${r.priority}">
              <div class="team-obs-synthesis__recommendation-header">
                <span class="team-obs-synthesis__recommendation-type">${r.type.replace(/_/g, ' ')}</span>
                <span class="team-obs-synthesis__recommendation-priority">${r.priority}</span>
              </div>
              <p>${escapeHtml(r.reason)}</p>
              <p class="team-obs-synthesis__recommendation-approach">${escapeHtml(r.suggestedApproach)}</p>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderContent(): string {
  if (isLoading) {
    return `
      <div class="team-obs-loading">
        <div class="team-obs-loading__spinner"></div>
        <p>Loading team observations...</p>
      </div>
    `;
  }

  if (!cachedData || cachedData.total === 0) {
    return `
      <div class="team-obs-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
        <p>No team observations yet</p>
        <span>As you talk with the team, they'll share insights with each other.</span>
      </div>
    `;
  }

  // Sort observations by time (most recent first)
  const sortedObs = [...cachedData.observations].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );

  return `
    ${cachedData.synthesis ? renderSynthesis(cachedData.synthesis) : ''}
    
    <div class="team-obs-list">
      <div class="team-obs-list__header">
        <span>Recent Observations</span>
        <span class="team-obs-list__count">${cachedData.total}</span>
      </div>
      ${sortedObs.map((obs, i) => renderObservationCard(obs, i)).join('')}
    </div>
  `;
}

// ============================================================================
// PANEL MANAGEMENT
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.textContent = `
    /* ========================================================================
       TEAM OBSERVATIONS PANEL
       ======================================================================== */
    .team-obs-panel {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-lg, 26px);
      background: var(--backdrop-page, rgba(44, 37, 32, 0.75));
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
    }

    .team-obs-panel--visible {
      opacity: 1;
      visibility: visible;
    }

    .team-obs-panel__content {
      width: 100%;
      max-width: 600px;
      max-height: 85vh;
      overflow-y: auto;
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--shadow-2xl, 0 24px 48px rgba(0, 0, 0, 0.2));
      transform: scale(0.95);
      transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
    }

    .team-obs-panel--visible .team-obs-panel__content {
      transform: scale(1);
    }

    .team-obs-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-lg, 26px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .team-obs-panel__title {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 1.125rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2c2520);
    }

    .team-obs-panel__title svg {
      width: 24px;
      height: 24px;
      color: var(--color-accent-primary, #4a6741);
    }

    .team-obs-panel__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      background: var(--color-bg-tertiary, #ebe6df);
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-secondary, #5c544a);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .team-obs-panel__close:hover {
      background: var(--color-bg-secondary, #f5f2ed);
      color: var(--color-text-primary, #2c2520);
    }

    .team-obs-panel__close svg {
      width: 18px;
      height: 18px;
    }

    .team-obs-panel__body {
      padding: var(--space-lg, 26px);
    }

    /* ========================================================================
       LOADING STATE
       ======================================================================== */
    .team-obs-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-md, 16px);
      padding: var(--space-xl, 42px);
      color: var(--color-text-secondary, #5c544a);
    }

    .team-obs-loading__spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      border-top-color: var(--color-accent-primary, #4a6741);
      border-radius: 50%;
      animation: team-obs-spin 1s linear infinite;
    }

    @keyframes team-obs-spin {
      to { transform: rotate(360deg); }
    }

    /* ========================================================================
       EMPTY STATE
       ======================================================================== */
    .team-obs-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-xl, 42px);
      text-align: center;
    }

    .team-obs-empty svg {
      width: 48px;
      height: 48px;
      color: var(--color-text-muted, #8a7f75);
      margin-bottom: var(--space-sm, 8px);
    }

    .team-obs-empty p {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 1rem);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-primary, #2c2520);
      margin: 0;
    }

    .team-obs-empty span {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5c544a);
    }

    /* ========================================================================
       OBSERVATION LIST
       ======================================================================== */
    .team-obs-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 16px);
    }

    .team-obs-list__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 0.875rem);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #5c544a);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .team-obs-list__count {
      background: var(--color-bg-tertiary, #ebe6df);
      padding: var(--space-2xs, 2px) var(--space-sm, 8px);
      border-radius: var(--radius-full, 9999px);
    }

    /* ========================================================================
       OBSERVATION CARD
       ======================================================================== */
    .team-obs-card {
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary, #f5f2ed);
      border-radius: var(--radius-lg, 12px);
      border-left: 3px solid var(--persona-color, var(--color-accent-primary));
      opacity: 0;
      transform: translateY(10px);
      animation: team-obs-card-in ${DURATION.SLOW}ms ${EASING.EXPO_OUT} forwards;
      animation-delay: var(--card-delay, 0ms);
    }

    @keyframes team-obs-card-in {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .team-obs-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-sm, 8px);
    }

    .team-obs-card__persona {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 0.875rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2c2520);
    }

    .team-obs-card__persona-icon {
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--persona-color);
    }

    .team-obs-card__persona-icon svg {
      width: 100%;
      height: 100%;
    }

    .team-obs-card__type {
      font-size: var(--text-xs, 0.75rem);
      font-weight: var(--font-weight-medium, 500);
      padding: var(--space-2xs, 2px) var(--space-sm, 8px);
      border-radius: var(--radius-full, 9999px);
      background: var(--type-bg, var(--color-text-muted));
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .team-obs-card__content {
      font-size: var(--text-sm, 0.875rem);
      line-height: 1.5;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-sm, 8px) 0;
    }

    .team-obs-card__meta {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #8a7f75);
    }

    .team-obs-card__domain {
      text-transform: capitalize;
    }

    .team-obs-card__confidence {
      background: var(--color-bg-tertiary, #ebe6df);
      padding: 0 var(--space-xs, 4px);
      border-radius: var(--radius-sm, 4px);
    }

    .team-obs-card__action {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      margin-top: var(--space-sm, 8px);
      padding-top: var(--space-sm, 8px);
      border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-accent-primary, #4a6741);
      font-style: italic;
    }

    .team-obs-card__action svg {
      width: 14px;
      height: 14px;
    }

    .team-obs-card__topics {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs, 4px);
      margin-top: var(--space-sm, 8px);
    }

    .team-obs-card__topic {
      font-size: var(--text-xs, 0.75rem);
      padding: var(--space-2xs, 2px) var(--space-xs, 4px);
      background: var(--color-bg-tertiary, #ebe6df);
      border-radius: var(--radius-sm, 4px);
      color: var(--color-text-secondary, #5c544a);
    }

    /* ========================================================================
       SYNTHESIS
       ======================================================================== */
    .team-obs-synthesis {
      margin-bottom: var(--space-lg, 26px);
      padding: var(--space-md, 16px);
      background: linear-gradient(135deg, var(--color-bg-secondary, #f5f2ed), var(--color-bg-tertiary, #ebe6df));
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .team-obs-synthesis__header {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 0.875rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-accent-primary, #4a6741);
      margin-bottom: var(--space-sm, 8px);
    }

    .team-obs-synthesis__header svg {
      width: 18px;
      height: 18px;
    }

    .team-obs-synthesis__text {
      font-size: var(--text-sm, 0.875rem);
      line-height: 1.6;
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-md, 16px) 0;
    }

    .team-obs-synthesis__state {
      padding: var(--space-sm, 8px);
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-md, 8px);
      margin-bottom: var(--space-md, 16px);
    }

    .team-obs-synthesis__state-header {
      display: flex;
      justify-content: space-between;
      font-size: var(--text-sm, 0.875rem);
      margin-bottom: var(--space-xs, 4px);
    }

    .team-obs-synthesis__trajectory {
      font-weight: var(--font-weight-medium, 500);
    }

    .team-obs-synthesis__wellbeing {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
    }

    .team-obs-synthesis__wellbeing-bar {
      flex: 1;
      height: 6px;
      background: var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-full, 9999px);
      overflow: hidden;
    }

    .team-obs-synthesis__wellbeing-fill {
      height: 100%;
      background: var(--color-accent-primary, #4a6741);
      border-radius: var(--radius-full, 9999px);
      transition: width ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
    }

    .team-obs-synthesis__state--positive .team-obs-synthesis__wellbeing-fill {
      background: var(--color-semantic-success, #10b981);
    }

    .team-obs-synthesis__state--negative .team-obs-synthesis__wellbeing-fill {
      background: var(--color-semantic-warning, #f59e0b);
    }

    .team-obs-synthesis__theme {
      margin-top: var(--space-sm, 8px);
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5c544a);
    }

    .team-obs-synthesis__connections,
    .team-obs-synthesis__recommendations {
      margin-top: var(--space-md, 16px);
    }

    .team-obs-synthesis__connections h4,
    .team-obs-synthesis__recommendations h4 {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 0.875rem);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2c2520);
      margin: 0 0 var(--space-sm, 8px) 0;
    }

    .team-obs-synthesis__connection {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm, 8px);
      padding: var(--space-xs, 4px) 0;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5c544a);
    }

    .team-obs-synthesis__connection-confidence {
      flex-shrink: 0;
      font-size: var(--text-xs, 0.75rem);
      background: var(--color-bg-tertiary, #ebe6df);
      padding: 0 var(--space-xs, 4px);
      border-radius: var(--radius-sm, 4px);
    }

    .team-obs-synthesis__recommendation {
      padding: var(--space-sm, 8px);
      background: var(--color-bg-elevated, #FFFDFB);
      border-radius: var(--radius-md, 8px);
      margin-bottom: var(--space-sm, 8px);
    }

    .team-obs-synthesis__recommendation--high {
      border-left: 3px solid var(--color-semantic-warning, #f59e0b);
    }

    .team-obs-synthesis__recommendation--urgent {
      border-left: 3px solid var(--color-semantic-error, #ef4444);
    }

    .team-obs-synthesis__recommendation-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: var(--space-xs, 4px);
    }

    .team-obs-synthesis__recommendation-type {
      font-size: var(--text-xs, 0.75rem);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary, #5c544a);
      text-transform: capitalize;
    }

    .team-obs-synthesis__recommendation-priority {
      font-size: var(--text-xs, 0.75rem);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .team-obs-synthesis__recommendation p {
      margin: 0 0 var(--space-xs, 4px) 0;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-primary, #2c2520);
    }

    .team-obs-synthesis__recommendation-approach {
      font-style: italic;
      color: var(--color-accent-primary, #4a6741) !important;
    }

    /* ========================================================================
       DARK THEME
       ======================================================================== */
    [data-theme="midnight"] .team-obs-panel__content {
      background: var(--color-bg-elevated, #70605a);
    }

    [data-theme="midnight"] .team-obs-card {
      background: var(--color-bg-secondary, #60504a);
    }

    [data-theme="midnight"] .team-obs-synthesis {
      background: linear-gradient(135deg, var(--color-bg-secondary, #60504a), var(--color-bg-tertiary, #685852));
    }

    [data-theme="midnight"] .team-obs-synthesis__state,
    [data-theme="midnight"] .team-obs-synthesis__recommendation {
      background: var(--color-bg-tertiary, #685852);
    }

    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .team-obs-panel,
      .team-obs-panel__content,
      .team-obs-card {
        transition: opacity ${DURATION.FAST}ms linear;
        animation: none;
      }

      .team-obs-card {
        opacity: 1;
        transform: none;
      }
    }
  `;
  document.head.appendChild(styleElement);
}

function createPanel(): void {
  if (panelElement) return;

  // HMR cleanup
  document.querySelectorAll('.team-obs-panel').forEach(el => el.remove());

  injectStyles();

  panelElement = document.createElement('div');
  panelElement.className = 'team-obs-panel';
  panelElement.setAttribute('role', 'dialog');
  panelElement.setAttribute('aria-label', 'Team Observations');
  panelElement.setAttribute('aria-modal', 'true');

  panelElement.innerHTML = `
    <div class="team-obs-panel__content">
      <div class="team-obs-panel__header">
        <div class="team-obs-panel__title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Team Observations
        </div>
        <button class="team-obs-panel__close" aria-label="${t('accessibility.close')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="team-obs-panel__body">
        ${renderContent()}
      </div>
    </div>
  `;

  // Bind events
  panelElement.querySelector('.team-obs-panel__close')?.addEventListener('click', hide);
  panelElement.addEventListener('click', (e) => {
    if (e.target === panelElement) hide();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelElement?.classList.contains('team-obs-panel--visible')) {
      hide();
    }
  });

  document.body.appendChild(panelElement);
}

function updateContent(): void {
  const body = panelElement?.querySelector('.team-obs-panel__body');
  if (body) {
    body.innerHTML = renderContent();
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function show(): Promise<void> {
  createPanel();
  if (!panelElement) return;

  // Show with loading state
  isLoading = true;
  updateContent();
  panelElement.classList.add('team-obs-panel--visible');

  // Check cache
  const now = Date.now();
  if (cachedData && now - cacheTime < CACHE_TTL_MS) {
    isLoading = false;
    updateContent();
    return;
  }

  // Fetch fresh data
  const data = await fetchObservations();
  if (data) {
    cachedData = data;
    cacheTime = now;
  }

  isLoading = false;
  updateContent();

  // Animate cards in
  if (!prefersReducedMotion()) {
    const cards = panelElement.querySelectorAll('.team-obs-card');
    cards.forEach((card, i) => {
      (card as HTMLElement).style.animationDelay = `${i * STAGGER.TIGHT}ms`;
    });
  }
}

export function hide(): void {
  panelElement?.classList.remove('team-obs-panel--visible');
}

export function refresh(): Promise<void> {
  cachedData = null;
  cacheTime = 0;
  return show();
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  show,
  hide,
  refresh,
};
