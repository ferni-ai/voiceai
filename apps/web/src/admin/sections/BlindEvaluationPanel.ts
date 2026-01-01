/**
 * Blind Evaluation Panel
 *
 * Admin UI for conducting blind A/B evaluations comparing Ferni responses
 * to human baseline responses. Evaluators rate responses without knowing
 * which is AI vs human to eliminate bias.
 *
 * Security: All dynamic content from API responses is escaped via escapeHtml()
 * to prevent XSS attacks.
 *
 * @module BlindEvaluationPanel
 */

import { createLogger } from '../../utils/logger.js';
import { getAdminHeadersAsync } from '../admin-api.js';
import { ICON_CHECK, ICON_SEARCH, iconSm } from '../icons.js';

const log = createLogger('BlindEvaluationPanel');

// ============================================================================
// SECURITY: HTML ESCAPING
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS.
 * Used for ALL dynamic content from API responses.
 */
function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ============================================================================
// TYPES
// ============================================================================

interface EvaluationScenario {
  id: string;
  name: string;
  description: string;
  capability: string;
  userInput: string;
  responseA: string;
  responseB: string;
}

interface EvaluationRatings {
  empathy: number;
  helpfulness: number;
  memoryUsage: number;
  timeliness: number;
  superhumanFactor: number;
}

interface EvaluationSession {
  sessionId: string;
  evaluatorId: string;
  scenarios: EvaluationScenario[];
  currentIndex: number;
}

// ============================================================================
// STATE
// ============================================================================

let currentSession: EvaluationSession | null = null;
let availableScenarios: EvaluationScenario[] = [];

// ============================================================================
// API CALLS
// ============================================================================

async function fetchScenarios(): Promise<EvaluationScenario[]> {
  try {
    const headers = await getAdminHeadersAsync();
    const res = await fetch('/api/v1/admin/bth/blind-panel/scenarios', { headers });
    if (!res.ok) throw new Error('Failed to fetch scenarios');
    const data = await res.json();
    return data.scenarios || [];
  } catch (err) {
    log.error({ error: err }, 'Failed to fetch scenarios');
    return [];
  }
}

async function createSession(scenarioIds: string[], evaluatorId: string): Promise<EvaluationSession | null> {
  try {
    const headers = await getAdminHeadersAsync();
    const res = await fetch('/api/v1/admin/bth/blind-panel/session', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioIds, evaluatorId }),
    });
    if (!res.ok) throw new Error('Failed to create session');
    return await res.json();
  } catch (err) {
    log.error({ error: err }, 'Failed to create session');
    return null;
  }
}

async function submitEvaluation(
  sessionId: string,
  scenarioId: string,
  preferredResponse: 'A' | 'B' | 'none',
  ratingsA: EvaluationRatings,
  ratingsB: EvaluationRatings,
  confidence: number,
  feedback: string
): Promise<boolean> {
  try {
    const headers = await getAdminHeadersAsync();
    const res = await fetch('/api/v1/admin/bth/blind-panel/submit', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        scenarioId,
        preferredResponse,
        ratingsA,
        ratingsB,
        confidence,
        feedback,
      }),
    });
    return res.ok;
  } catch (err) {
    log.error({ error: err }, 'Failed to submit evaluation');
    return false;
  }
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderScenarioSelector(): string {
  if (availableScenarios.length === 0) {
    return `
      <div class="bep-empty">
        ${iconSm(ICON_SEARCH)}
        <p>No scenarios available. Add scenarios to the BTH validation dataset first.</p>
      </div>
    `;
  }

  const scenarioItems = availableScenarios
    .map(
      (s) => `
      <label class="bep-scenario-item">
        <input type="checkbox" name="scenario" value="${escapeHtml(s.id)}" />
        <div class="bep-scenario-info">
          <span class="bep-scenario-name">${escapeHtml(s.name)}</span>
          <span class="bep-scenario-cap">${escapeHtml(s.capability)}</span>
        </div>
      </label>
    `
    )
    .join('');

  return `
    <div class="bep-selector">
      <h3>Select Scenarios to Evaluate</h3>
      <div class="bep-scenario-grid">${scenarioItems}</div>
      <div class="bep-selector-actions">
        <input type="text" id="bep-evaluator-id" placeholder="Your evaluator ID" class="bep-input" />
        <button id="bep-start-btn" class="bep-btn bep-btn-primary">Start Evaluation</button>
      </div>
    </div>
  `;
}

function renderEvaluationForm(): string {
  if (!currentSession || currentSession.currentIndex >= currentSession.scenarios.length) {
    return `
      <div class="bep-complete">
        ${iconSm(ICON_CHECK)}
        <h3>Evaluation Complete</h3>
        <p>Thank you for your evaluations!</p>
        <button id="bep-restart-btn" class="bep-btn">Start New Session</button>
      </div>
    `;
  }

  const scenario = currentSession.scenarios[currentSession.currentIndex];
  if (!scenario) {
    return `<div class="bep-error">No scenario available</div>`;
  }
  const progress = currentSession.currentIndex + 1;
  const total = currentSession.scenarios.length;

  return `
    <div class="bep-evaluation">
      <div class="bep-progress">
        <span>Scenario ${escapeHtml(progress)} of ${escapeHtml(total)}</span>
        <div class="bep-progress-bar">
          <div class="bep-progress-fill" style="width: ${(progress / total) * 100}%"></div>
        </div>
      </div>

      <div class="bep-scenario-context">
        <h4>User Input</h4>
        <p class="bep-user-input">${escapeHtml(scenario.userInput)}</p>
      </div>

      <div class="bep-responses">
        <div class="bep-response bep-response-a">
          <h4>Response A</h4>
          <p>${escapeHtml(scenario.responseA)}</p>
          ${renderRatingSliders('A')}
        </div>
        <div class="bep-response bep-response-b">
          <h4>Response B</h4>
          <p>${escapeHtml(scenario.responseB)}</p>
          ${renderRatingSliders('B')}
        </div>
      </div>

      <div class="bep-preference">
        <h4>Which response is better?</h4>
        <div class="bep-pref-options">
          <label><input type="radio" name="preference" value="A" /> Response A</label>
          <label><input type="radio" name="preference" value="B" /> Response B</label>
          <label><input type="radio" name="preference" value="none" /> No preference</label>
        </div>
      </div>

      <div class="bep-confidence">
        <label>Confidence: <span id="bep-conf-val">50</span>%</label>
        <input type="range" id="bep-confidence" min="0" max="100" value="50" />
      </div>

      <div class="bep-feedback">
        <label>Additional feedback (optional)</label>
        <textarea id="bep-feedback" rows="3" placeholder="Any observations..."></textarea>
      </div>

      <div class="bep-actions">
        <button id="bep-submit-btn" class="bep-btn bep-btn-primary">Submit &amp; Next</button>
        <button id="bep-skip-btn" class="bep-btn">Skip</button>
      </div>
    </div>
  `;
}

function renderRatingSliders(prefix: string): string {
  const dimensions = [
    { key: 'empathy', label: 'Empathy' },
    { key: 'helpfulness', label: 'Helpfulness' },
    { key: 'memoryUsage', label: 'Memory Usage' },
    { key: 'timeliness', label: 'Timeliness' },
    { key: 'superhumanFactor', label: 'Superhuman Factor' },
  ];

  return dimensions
    .map(
      (d) => `
      <div class="bep-rating">
        <label>${escapeHtml(d.label)}: <span id="bep-val-${escapeHtml(prefix)}-${escapeHtml(d.key)}">3</span></label>
        <input type="range" class="bep-slider" data-prefix="${escapeHtml(prefix)}" data-key="${escapeHtml(d.key)}" min="1" max="5" value="3" />
      </div>
    `
    )
    .join('');
}

// ============================================================================
// STYLES
// ============================================================================

function getStyles(): string {
  return `
    <style>
      .bep-container {
        padding: var(--space-lg);
        max-width: 1000px;
        margin: 0 auto;
      }
      .bep-empty, .bep-complete {
        text-align: center;
        padding: var(--space-xl);
        color: var(--color-text-secondary);
      }
      .bep-empty svg, .bep-complete svg {
        width: 48px;
        height: 48px;
        margin-bottom: var(--space-md);
        opacity: 0.5;
      }
      .bep-selector h3, .bep-evaluation h4 {
        margin-bottom: var(--space-md);
        color: var(--color-text-primary);
      }
      .bep-scenario-grid {
        display: grid;
        gap: var(--space-sm);
        margin-bottom: var(--space-lg);
      }
      .bep-scenario-item {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        padding: var(--space-sm);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: background var(--duration-fast) var(--ease-out);
      }
      .bep-scenario-item:hover {
        background: var(--color-bg-elevated);
      }
      .bep-scenario-info {
        display: flex;
        flex-direction: column;
      }
      .bep-scenario-name {
        font-weight: 500;
        color: var(--color-text-primary);
      }
      .bep-scenario-cap {
        font-size: 0.85em;
        color: var(--color-text-muted);
      }
      .bep-selector-actions {
        display: flex;
        gap: var(--space-md);
        align-items: center;
      }
      .bep-input {
        flex: 1;
        padding: var(--space-sm) var(--space-md);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        background: var(--color-bg-secondary);
        color: var(--color-text-primary);
      }
      .bep-btn {
        padding: var(--space-sm) var(--space-lg);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        background: var(--color-bg-secondary);
        color: var(--color-text-primary);
        cursor: pointer;
        transition: all var(--duration-fast) var(--ease-out);
      }
      .bep-btn:hover {
        background: var(--color-bg-elevated);
      }
      .bep-btn:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
      }
      .bep-btn-primary {
        background: var(--color-accent-primary);
        border-color: var(--color-accent-primary);
        color: var(--color-text-on-accent);
      }
      .bep-btn-primary:hover {
        filter: brightness(1.1);
      }
      .bep-progress {
        margin-bottom: var(--space-lg);
      }
      .bep-progress-bar {
        height: 4px;
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-full);
        overflow: hidden;
        margin-top: var(--space-xs);
      }
      .bep-progress-fill {
        height: 100%;
        background: var(--color-accent-primary);
        transition: width var(--duration-normal) var(--ease-out);
      }
      .bep-scenario-context {
        background: var(--color-bg-secondary);
        padding: var(--space-md);
        border-radius: var(--radius-md);
        margin-bottom: var(--space-lg);
      }
      .bep-user-input {
        font-style: italic;
        color: var(--color-text-secondary);
      }
      .bep-responses {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-lg);
        margin-bottom: var(--space-lg);
      }
      .bep-response {
        background: var(--color-bg-secondary);
        padding: var(--space-md);
        border-radius: var(--radius-md);
      }
      .bep-response p {
        margin-bottom: var(--space-md);
        line-height: 1.6;
      }
      .bep-rating {
        margin-bottom: var(--space-sm);
      }
      .bep-rating label {
        display: block;
        font-size: 0.85em;
        color: var(--color-text-muted);
        margin-bottom: var(--space-2xs);
      }
      .bep-slider {
        width: 100%;
        cursor: pointer;
      }
      .bep-preference, .bep-confidence, .bep-feedback {
        margin-bottom: var(--space-lg);
      }
      .bep-pref-options {
        display: flex;
        gap: var(--space-lg);
      }
      .bep-pref-options label {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        cursor: pointer;
      }
      .bep-feedback textarea {
        width: 100%;
        padding: var(--space-sm);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md);
        background: var(--color-bg-secondary);
        color: var(--color-text-primary);
        resize: vertical;
      }
      .bep-actions {
        display: flex;
        gap: var(--space-md);
        justify-content: flex-end;
      }
      @media (prefers-reduced-motion: reduce) {
        .bep-progress-fill, .bep-btn, .bep-scenario-item {
          transition: none;
        }
      }
    </style>
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function render(): Promise<string> {
  availableScenarios = await fetchScenarios();

  return `
    ${getStyles()}
    <div class="bep-container" id="bep-root">
      <h2>Blind Evaluation Panel</h2>
      <p class="bep-desc">Evaluate AI vs human responses without knowing which is which.</p>
      <div id="bep-content">
        ${currentSession ? renderEvaluationForm() : renderScenarioSelector()}
      </div>
    </div>
  `;
}

export function setupEvents(container: HTMLElement): void {
  // Start button
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    if (target.id === 'bep-start-btn') {
      const checkboxes = container.querySelectorAll<HTMLInputElement>('input[name="scenario"]:checked');
      const evaluatorInput = container.querySelector<HTMLInputElement>('#bep-evaluator-id');
      const scenarioIds = Array.from(checkboxes).map((cb) => cb.value);
      const evaluatorId = evaluatorInput?.value.trim() || 'anonymous';

      if (scenarioIds.length === 0) {
        alert('Please select at least one scenario');
        return;
      }

      currentSession = await createSession(scenarioIds, evaluatorId);
      if (currentSession) {
        const content = container.querySelector('#bep-content');
        if (content) content.innerHTML = renderEvaluationForm();
        setupSliderListeners(container);
      }
    }

    if (target.id === 'bep-restart-btn') {
      currentSession = null;
      const content = container.querySelector('#bep-content');
      if (content) content.innerHTML = renderScenarioSelector();
    }

    if (target.id === 'bep-submit-btn' && currentSession) {
      const scenario = currentSession.scenarios[currentSession.currentIndex];
      if (!scenario) {
        alert('No scenario available');
        return;
      }
      const preference = container.querySelector<HTMLInputElement>('input[name="preference"]:checked')?.value as
        | 'A'
        | 'B'
        | 'none'
        | undefined;

      if (!preference) {
        alert('Please select a preference');
        return;
      }

      const ratingsA = collectRatings(container, 'A');
      const ratingsB = collectRatings(container, 'B');
      const confidence = parseInt(
        container.querySelector<HTMLInputElement>('#bep-confidence')?.value || '50',
        10
      );
      const feedback = container.querySelector<HTMLTextAreaElement>('#bep-feedback')?.value || '';

      const success = await submitEvaluation(
        currentSession.sessionId,
        scenario.id,
        preference,
        ratingsA,
        ratingsB,
        confidence,
        feedback
      );

      if (success) {
        currentSession.currentIndex++;
        const content = container.querySelector('#bep-content');
        if (content) content.innerHTML = renderEvaluationForm();
        setupSliderListeners(container);
      }
    }

    if (target.id === 'bep-skip-btn' && currentSession) {
      currentSession.currentIndex++;
      const content = container.querySelector('#bep-content');
      if (content) content.innerHTML = renderEvaluationForm();
      setupSliderListeners(container);
    }
  });

  setupSliderListeners(container);
}

function setupSliderListeners(container: HTMLElement): void {
  // Rating sliders
  container.querySelectorAll<HTMLInputElement>('.bep-slider').forEach((slider) => {
    slider.addEventListener('input', () => {
      const prefix = slider.dataset.prefix;
      const key = slider.dataset.key;
      const valEl = container.querySelector(`#bep-val-${prefix}-${key}`);
      if (valEl) valEl.textContent = slider.value;
    });
  });

  // Confidence slider
  const confSlider = container.querySelector<HTMLInputElement>('#bep-confidence');
  if (confSlider) {
    confSlider.addEventListener('input', () => {
      const valEl = container.querySelector('#bep-conf-val');
      if (valEl) valEl.textContent = confSlider.value;
    });
  }
}

function collectRatings(container: HTMLElement, prefix: string): EvaluationRatings {
  const getValue = (key: string): number => {
    const slider = container.querySelector<HTMLInputElement>(`.bep-slider[data-prefix="${prefix}"][data-key="${key}"]`);
    return parseInt(slider?.value || '3', 10);
  };

  return {
    empathy: getValue('empathy'),
    helpfulness: getValue('helpfulness'),
    memoryUsage: getValue('memoryUsage'),
    timeliness: getValue('timeliness'),
    superhumanFactor: getValue('superhumanFactor'),
  };
}

export function cleanup(): void {
  currentSession = null;
  availableScenarios = [];
}
