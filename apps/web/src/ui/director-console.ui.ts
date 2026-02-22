/**
 * Director Console UI
 *
 * A floating panel that enables the Director to control an ensemble
 * conversation in real-time. Features:
 *
 * - Cast Panel: See who's on stage, swap lead, bring on/send off
 * - Scene Controls: Set mood, pace, hold/release
 * - Whisper Box: Send private instructions to specific personas
 * - Emotion Arc: Set and track planned emotional trajectories
 * - Auto-Director: Toggle AI suggestions, accept/dismiss
 * - Live Transcript: See user + persona speech in real-time
 *
 * Communicates with the backend via WebSocket (/ws/director).
 *
 * @module ui/director-console
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('DirectorConsole');

// =============================================================================
// TYPES (mirrored from backend director/types.ts for frontend use)
// =============================================================================

interface DirectorStateSnapshot {
  cast: {
    activePersonas: string[];
    leadPersona: string;
    onDeck: string[];
    offStage: string[];
  };
  scene: {
    mood: string;
    moodIntensity: number;
    pace: string;
    isHeld: boolean;
    turnCount: number;
    directorNotes: string;
  };
  actors: Array<{
    personaId: string;
    stagePosition: string;
    currentMood: string;
    emotionIntensity: number;
    directorWhisper: string | null;
  }>;
  autoDirectorMode: string;
  pendingSuggestions: Array<{
    id: string;
    command: { type: string };
    reason: string;
    confidence: number;
    priority: string;
  }>;
  isDirectorAudioActive: boolean;
}

interface DirectorEvent {
  type: string;
  [key: string]: unknown;
}

// =============================================================================
// PERSONA METADATA
// =============================================================================

const PERSONA_META: Record<string, { name: string; color: string; emoji: string }> = {
  ferni: { name: 'Ferni', color: 'var(--color-ferni, #4a6741)', emoji: '🌿' },
  'peter-john': { name: 'Peter', color: 'var(--color-peter, #3a6b73)', emoji: '📈' },
  'alex-chen': { name: 'Alex', color: 'var(--color-alex, #5a6b8a)', emoji: '📧' },
  'maya-santos': { name: 'Maya', color: 'var(--color-maya, #a67a6a)', emoji: '💪' },
  'jordan-taylor': { name: 'Jordan', color: 'var(--color-jordan, #c4856a)', emoji: '🎉' },
  'nayan-patel': { name: 'Nayan', color: 'var(--color-nayan, #b8956a)', emoji: '🧘' },
};

const MOODS = [
  'warm',
  'serious',
  'playful',
  'contemplative',
  'celebratory',
  'supportive',
  'challenging',
  'vulnerable',
  'empowering',
  'urgent',
  'intimate',
  'energized',
];

const PACES = ['contemplative', 'natural', 'energized', 'urgent'];

// =============================================================================
// DIRECTOR CONSOLE CLASS
// =============================================================================

export class DirectorConsole {
  private container: HTMLElement | null = null;
  private ws: WebSocket | null = null;
  private state: DirectorStateSnapshot | null = null;
  private isOpen = false;
  private sessionId: string;
  private userId: string;
  private transcriptLog: Array<{ role: string; text: string; time: number }> = [];

  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: { sessionId: string; userId: string }) {
    this.sessionId = config.sessionId;
    this.userId = config.userId;

    this.cleanupOrphanedElements();
  }

  /** Expose sessionId for instance comparison (avoids private property cast) */
  getSessionId(): string {
    return this.sessionId;
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  open(): void {
    if (this.isOpen) return;

    this.createPanel();
    this.connectWebSocket();
    this.isOpen = true;

    log.info('Director Console opened');
  }

  close(): void {
    if (!this.isOpen) return;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    if (this.container) {
      this.container.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.95)' },
        ],
        { duration: DURATION.NORMAL, easing: EASING.STANDARD }
      ).onfinish = () => {
        this.container?.remove();
        this.container = null;
      };
    }

    this.isOpen = false;
    log.info('Director Console closed');
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.director-console-container').forEach((el) => el.remove());
    document.querySelectorAll('.director-console-trigger').forEach((el) => el.remove());
  }

  // ===========================================================================
  // WEBSOCKET CONNECTION
  // ===========================================================================

  private connectWebSocket(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/director?sessionId=${this.sessionId}&userId=${this.userId}`;

    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type: string;
          snapshot?: DirectorStateSnapshot;
          event?: DirectorEvent;
          message?: string;
        };

        if (message.type === 'state' && message.snapshot) {
          this.state = message.snapshot;
          this.renderState();
        }

        if (message.type === 'event' && message.event) {
          this.handleEvent(message.event);
        }

        if (message.type === 'error' && message.message) {
          log.warn({ error: message.message }, 'Director WebSocket error');
        }
      } catch (error) {
        log.warn({ error: String(error) }, 'Director WebSocket: malformed message ignored');
      }
    };

    this.ws.onclose = () => {
      log.info('Director WebSocket disconnected');
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };
  }

  private scheduleReconnect(): void {
    if (!this.isOpen) return;
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      log.warn('Max reconnect attempts reached for director console');
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    log.debug({ attempt: this.reconnectAttempts, delay }, 'Scheduling director console reconnect');
    this.reconnectTimeout = setTimeout(() => this.connectWebSocket(), delay);
  }

  private sendCommand(command: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'command', command }));
    }
  }

  private sendMessage(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // ===========================================================================
  // EVENT HANDLING
  // ===========================================================================

  private handleEvent(event: DirectorEvent): void {
    switch (event.type) {
      case 'cast_changed':
      case 'scene_changed':
        // Request full state refresh
        this.sendMessage({ type: 'query', query: 'state' });
        break;

      case 'persona_speaking':
        this.addTranscript(event.personaId as string, event.text as string);
        break;

      case 'user_transcript':
        this.addTranscript('user', event.text as string);
        break;

      case 'director_transcript':
        this.addTranscript('director', event.text as string);
        break;

      case 'suggestion':
        this.renderSuggestions();
        break;

      case 'command_executed':
        // State will be refreshed via cast_changed/scene_changed events
        break;
    }
  }

  private addTranscript(role: string, text: string): void {
    this.transcriptLog.push({ role, text, time: Date.now() });
    if (this.transcriptLog.length > 50) {
      this.transcriptLog.shift();
    }
    this.renderTranscript();
  }

  // ===========================================================================
  // UI CREATION
  // ===========================================================================

  private createPanel(): void {
    this.container = document.createElement('div');
    this.container.className = 'director-console-container';

    this.container.innerHTML = `
      <div class="dc-header">
        <span class="dc-eyebrow">DIRECTOR MODE</span>
        <h3 class="dc-title">Ensemble Control</h3>
        <button class="dc-close" aria-label="Close Director Console">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="dc-body">
        <div class="dc-section" id="dc-cast">
          <div class="dc-section-label">CAST</div>
          <div class="dc-cast-grid" id="dc-cast-grid"></div>
        </div>

        <div class="dc-section" id="dc-scene">
          <div class="dc-section-label">SCENE</div>
          <div class="dc-scene-controls">
            <div class="dc-control-row">
              <label>Mood</label>
              <select id="dc-mood-select"></select>
            </div>
            <div class="dc-control-row">
              <label>Intensity</label>
              <input type="range" id="dc-intensity" min="0" max="100" value="60">
            </div>
            <div class="dc-control-row">
              <label>Pace</label>
              <select id="dc-pace-select"></select>
            </div>
            <div class="dc-control-row">
              <button id="dc-hold-btn" class="dc-btn" aria-label="Hold scene">Hold</button>
              <button id="dc-release-btn" class="dc-btn" aria-label="Release scene">Release</button>
              <button id="dc-cut-btn" class="dc-btn dc-btn-danger" aria-label="Cut to silence">Cut</button>
            </div>
          </div>
        </div>

        <div class="dc-section" id="dc-whisper">
          <div class="dc-section-label">WHISPER</div>
          <div class="dc-whisper-box">
            <select id="dc-whisper-target"></select>
            <input type="text" id="dc-whisper-input" placeholder="Private instruction...">
            <button id="dc-whisper-send" class="dc-btn" aria-label="Send whisper">Send</button>
          </div>
        </div>

        <div class="dc-section" id="dc-suggestions">
          <div class="dc-section-label">AI SUGGESTIONS</div>
          <div id="dc-suggestions-list"></div>
          <div class="dc-control-row">
            <label>Auto-Director</label>
            <select id="dc-auto-mode">
              <option value="off">Off</option>
              <option value="suggest">Suggest</option>
              <option value="autopilot">Autopilot</option>
            </select>
          </div>
        </div>

        <div class="dc-section" id="dc-transcript">
          <div class="dc-section-label">LIVE</div>
          <div class="dc-transcript-log" id="dc-transcript-log"></div>
        </div>
      </div>
    `;

    this.applyStyles();
    this.attachEventListeners();
    this.populateSelects();

    document.body.appendChild(this.container);

    // Animate in
    this.container.animate(
      [
        { opacity: 0, transform: 'scale(0.95)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: DURATION.SLOW, easing: EASING.SPRING }
    );
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  private renderState(): void {
    if (!this.state || !this.container) return;

    this.renderCast();
    this.renderSceneControls();
    this.renderSuggestions();
  }

  private renderCast(): void {
    const grid = this.container?.querySelector('#dc-cast-grid');
    if (!grid || !this.state) return;

    const allPersonas = [
      ...this.state.cast.activePersonas,
      ...this.state.cast.onDeck,
      ...this.state.cast.offStage,
    ];

    grid.innerHTML = allPersonas
      .map((id) => {
        const meta = PERSONA_META[id] ?? { name: id, color: 'var(--color-text-muted)', emoji: '?' };
        const isLead = id === this.state!.cast.leadPersona;
        const isActive = this.state!.cast.activePersonas.includes(id);
        const statusClass = isLead ? 'dc-lead' : isActive ? 'dc-active' : 'dc-inactive';

        return `
        <div class="dc-persona-chip ${statusClass}" data-persona="${id}" style="--persona-color: ${meta.color}">
          <span class="dc-persona-name">${meta.name}</span>
          <span class="dc-persona-status">${isLead ? 'Lead' : isActive ? 'On' : 'Off'}</span>
        </div>
      `;
      })
      .join('');

    // Add click and keyboard handlers for persona chips
    grid.querySelectorAll('.dc-persona-chip').forEach((chip) => {
      const handleActivate = () => {
        const personaId = (chip as HTMLElement).dataset.persona;
        if (!personaId) return;

        const isActive = this.state?.cast.activePersonas.includes(personaId);
        const isLead = personaId === this.state?.cast.leadPersona;

        if (!isActive) {
          this.sendCommand({ type: 'BRING_ON', personaId, entrance: 'chime-in' });
        } else if (!isLead) {
          this.sendCommand({ type: 'SET_LEAD', personaId, transition: 'smooth' });
        }
      };
      chip.addEventListener('click', handleActivate);
      chip.addEventListener('keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault();
          handleActivate();
        }
      });
    });
  }

  private renderSceneControls(): void {
    if (!this.state || !this.container) return;

    const moodSelect = this.container.querySelector('#dc-mood-select') as HTMLSelectElement | null;
    const intensitySlider = this.container.querySelector(
      '#dc-intensity'
    ) as HTMLInputElement | null;
    const paceSelect = this.container.querySelector('#dc-pace-select') as HTMLSelectElement | null;

    if (moodSelect) moodSelect.value = this.state.scene.mood;
    if (intensitySlider)
      intensitySlider.value = String(Math.round(this.state.scene.moodIntensity * 100));
    if (paceSelect) paceSelect.value = this.state.scene.pace;
  }

  private renderSuggestions(): void {
    const list = this.container?.querySelector('#dc-suggestions-list');
    if (!list || !this.state) return;

    if (this.state.pendingSuggestions.length === 0) {
      list.innerHTML = '<div class="dc-empty">No suggestions</div>';
      return;
    }

    list.innerHTML = this.state.pendingSuggestions
      .map(
        (s) => `
      <div class="dc-suggestion" data-id="${s.id}">
        <div class="dc-suggestion-text">${s.reason}</div>
        <div class="dc-suggestion-meta">
          <span class="dc-confidence">${Math.round(s.confidence * 100)}%</span>
          <button class="dc-btn dc-btn-small dc-accept" data-id="${s.id}">Accept</button>
          <button class="dc-btn dc-btn-small dc-dismiss" data-id="${s.id}">Dismiss</button>
        </div>
      </div>
    `
      )
      .join('');

    list.querySelectorAll('.dc-accept').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sendMessage({
          type: 'accept_suggestion',
          suggestionId: (btn as HTMLElement).dataset.id,
        });
      });
    });

    list.querySelectorAll('.dc-dismiss').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sendMessage({
          type: 'dismiss_suggestion',
          suggestionId: (btn as HTMLElement).dataset.id,
        });
      });
    });
  }

  private renderTranscript(): void {
    const logEl = this.container?.querySelector('#dc-transcript-log');
    if (!logEl) return;

    const recent = this.transcriptLog.slice(-15);
    logEl.innerHTML = recent
      .map((entry) => {
        const meta =
          entry.role === 'user'
            ? { name: 'User', color: 'var(--color-text-secondary)' }
            : entry.role === 'director'
              ? { name: 'Director', color: 'var(--color-accent)' }
              : (PERSONA_META[entry.role] ?? {
                  name: entry.role,
                  color: 'var(--color-text-muted)',
                });

        return `
        <div class="dc-transcript-entry">
          <span class="dc-transcript-name" style="color: ${meta.color}">${meta.name}:</span>
          <span class="dc-transcript-text">${entry.text.slice(0, 120)}${entry.text.length > 120 ? '...' : ''}</span>
        </div>
      `;
      })
      .join('');

    logEl.scrollTop = logEl.scrollHeight;
  }

  // ===========================================================================
  // EVENT LISTENERS
  // ===========================================================================

  private attachEventListeners(): void {
    if (!this.container) return;

    // Close button
    this.container.querySelector('.dc-close')?.addEventListener('click', () => this.close());

    // Mood select
    this.container.querySelector('#dc-mood-select')?.addEventListener('change', (e) => {
      const mood = (e.target as HTMLSelectElement).value;
      const intensity =
        Number((this.container?.querySelector('#dc-intensity') as HTMLInputElement)?.value ?? 60) /
        100;
      this.sendCommand({ type: 'SET_MOOD', mood, intensity, transition: 'fade' });
    });

    // Intensity slider
    this.container.querySelector('#dc-intensity')?.addEventListener('input', (e) => {
      const intensity = Number((e.target as HTMLInputElement).value) / 100;
      const mood =
        (this.container?.querySelector('#dc-mood-select') as HTMLSelectElement)?.value ?? 'warm';
      this.sendCommand({ type: 'SET_MOOD', mood, intensity, transition: 'fade' });
    });

    // Pace select
    this.container.querySelector('#dc-pace-select')?.addEventListener('change', (e) => {
      this.sendCommand({ type: 'SET_PACE', pace: (e.target as HTMLSelectElement).value });
    });

    // Hold / Release / Cut
    this.container.querySelector('#dc-hold-btn')?.addEventListener('click', () => {
      this.sendCommand({ type: 'HOLD' });
    });
    this.container.querySelector('#dc-release-btn')?.addEventListener('click', () => {
      this.sendCommand({ type: 'RELEASE' });
    });
    this.container.querySelector('#dc-cut-btn')?.addEventListener('click', () => {
      this.sendCommand({ type: 'CUT' });
    });

    // Whisper send
    this.container.querySelector('#dc-whisper-send')?.addEventListener('click', () => {
      const target = (this.container?.querySelector('#dc-whisper-target') as HTMLSelectElement)
        ?.value;
      const input = this.container?.querySelector('#dc-whisper-input') as HTMLInputElement;
      const instruction = input?.value?.trim();
      if (target && instruction) {
        this.sendCommand({ type: 'WHISPER', personaId: target, instruction });
        input.value = '';
      }
    });

    // Auto-director mode
    this.container.querySelector('#dc-auto-mode')?.addEventListener('change', (e) => {
      this.sendMessage({ type: 'set_auto_director', mode: (e.target as HTMLSelectElement).value });
    });
  }

  private populateSelects(): void {
    if (!this.container) return;

    // Mood select
    const moodSelect = this.container.querySelector('#dc-mood-select') as HTMLSelectElement;
    if (moodSelect) {
      moodSelect.innerHTML = MOODS.map((m) => `<option value="${m}">${m}</option>`).join('');
    }

    // Pace select
    const paceSelect = this.container.querySelector('#dc-pace-select') as HTMLSelectElement;
    if (paceSelect) {
      paceSelect.innerHTML = PACES.map((p) => `<option value="${p}">${p}</option>`).join('');
    }

    // Whisper target
    const whisperTarget = this.container.querySelector('#dc-whisper-target') as HTMLSelectElement;
    if (whisperTarget) {
      whisperTarget.innerHTML = Object.entries(PERSONA_META)
        .map(([id, meta]) => `<option value="${id}">${meta.name}</option>`)
        .join('');
    }
  }

  // ===========================================================================
  // STYLES
  // ===========================================================================

  private applyStyles(): void {
    if (!this.container) return;

    // Check if styles already injected
    if (document.querySelector('#dc-styles')) return;

    const style = document.createElement('style');
    style.id = 'dc-styles';
    style.textContent = `
      .director-console-container {
        position: fixed;
        top: var(--space-4, 16px);
        right: var(--space-4, 16px);
        width: 360px;
        max-height: 90vh;
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 16px);
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0,0,0,0.25));
        z-index: 10000;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: var(--font-body, 'Inter', sans-serif);
      }

      .dc-header {
        padding: var(--space-4, 16px);
        border-bottom: 1px solid var(--color-border, rgba(44,37,32,0.1));
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        flex-wrap: wrap;
      }

      .dc-eyebrow {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.1em;
        color: var(--color-accent, #3D5A45);
        width: 100%;
      }

      .dc-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0;
        flex: 1;
      }

      .dc-close {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-text-muted, #999999);
        padding: var(--space-1, 4px);
        border-radius: var(--radius-sm, 4px);
      }
      .dc-close:hover { color: var(--color-text-primary, #2C2520); }

      .dc-body {
        overflow-y: auto;
        padding: var(--space-3, 12px);
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .dc-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .dc-section-label {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.08em;
        color: var(--color-text-muted, #999999);
      }

      .dc-cast-grid {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2, 8px);
      }

      .dc-persona-chip {
        padding: var(--space-1, 4px) var(--space-3, 12px);
        border-radius: var(--radius-full, 999px);
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s;
        border: 2px solid transparent;
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
      }

      .dc-persona-chip.dc-lead {
        background: var(--persona-color);
        color: white;
        font-weight: 600;
      }

      .dc-persona-chip.dc-active {
        background: color-mix(in srgb, var(--persona-color) 15%, transparent);
        border-color: var(--persona-color);
        color: var(--persona-color);
      }

      .dc-persona-chip.dc-inactive {
        background: var(--color-background-subtle, #f5f0eb);
        color: var(--color-text-muted, #999999);
      }

      .dc-persona-chip:hover {
        transform: scale(1.05);
      }

      .dc-persona-status {
        font-size: 10px;
        opacity: 0.7;
      }

      .dc-control-row {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }

      .dc-control-row label {
        font-size: 12px;
        color: var(--color-text-secondary, #666666);
        min-width: 60px;
      }

      .dc-control-row select,
      .dc-control-row input[type="range"] {
        flex: 1;
        font-size: 12px;
      }

      .dc-btn {
        padding: var(--space-1, 4px) var(--space-3, 12px);
        border: 1px solid var(--color-border, rgba(44,37,32,0.2));
        border-radius: var(--radius-md, 8px);
        background: var(--color-background-elevated, white);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.1s;
      }
      .dc-btn:hover { background: var(--color-background-subtle, #f5f0eb); }

      .dc-btn-danger { color: var(--color-error, #cc4444); border-color: var(--color-error, #cc4444); }
      .dc-btn-danger:hover { background: var(--color-error-bg, #ffeeee); }

      .dc-btn-small { padding: 2px 8px; font-size: 11px; }

      .dc-whisper-box {
        display: flex;
        gap: var(--space-2, 8px);
      }

      .dc-whisper-box select { width: 80px; font-size: 12px; }

      .dc-whisper-box input {
        flex: 1;
        padding: var(--space-1, 4px) var(--space-2, 8px);
        border: 1px solid var(--color-border, rgba(44,37,32,0.2));
        border-radius: var(--radius-md, 8px);
        font-size: 12px;
      }

      .dc-suggestion {
        padding: var(--space-2, 8px);
        background: var(--color-background-subtle, #f5f0eb);
        border-radius: var(--radius-md, 8px);
        margin-bottom: var(--space-1, 4px);
      }

      .dc-suggestion-text { font-size: 12px; margin-bottom: var(--space-1, 4px); }
      .dc-suggestion-meta { display: flex; align-items: center; gap: var(--space-2, 8px); }
      .dc-confidence { font-size: 11px; color: var(--color-text-muted); }

      .dc-transcript-log {
        max-height: 120px;
        overflow-y: auto;
        font-size: 12px;
        line-height: 1.4;
      }

      .dc-transcript-entry { margin-bottom: 2px; }
      .dc-transcript-name { font-weight: 600; font-size: 11px; }
      .dc-transcript-text { color: var(--color-text-secondary, #666666); }

      .dc-empty { font-size: 12px; color: var(--color-text-muted); font-style: italic; }

      .dc-scene-controls { display: flex; flex-direction: column; gap: var(--space-2, 8px); }

      @media (prefers-color-scheme: dark) {
        .director-console-container {
          background: var(--color-background-elevated, #3d352f);
        }
      }
    `;

    document.head.appendChild(style);
  }
}

// =============================================================================
// SINGLETON / FACTORY
// =============================================================================

let _instance: DirectorConsole | null = null;

/**
 * Get or create the Director Console instance.
 */
export function getDirectorConsole(config?: {
  sessionId: string;
  userId: string;
}): DirectorConsole | null {
  if (!config && !_instance) return null;

  if (
    config &&
    (!_instance || config.sessionId !== _instance.getSessionId())
  ) {
    _instance = new DirectorConsole(config);
  }

  return _instance;
}

/**
 * Toggle the Director Console from a keyboard shortcut or button.
 */
export function toggleDirectorConsole(): void {
  _instance?.toggle();
}
