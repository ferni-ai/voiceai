/**
 * Group Conversation UI
 *
 * UI components for multi-participant conversations:
 * - Team selector for roundtables
 * - Participant grid showing who's in the room
 * - Speaking indicators
 * - Add participant modal for conference calls
 *
 * @module ui/group-conversation
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { toast } from './toast.ui.js';
import { t } from '../i18n/index.js';

const log = createLogger('GroupConversationUI');

// ============================================================================
// TYPES
// ============================================================================

interface Participant {
  id: string;
  name: string;
  type: 'human' | 'agent' | 'external';
  role: string;
  isSpeaking: boolean;
  avatarColor?: string;
}

// TeamMember interface - not currently used but available for future features
// interface TeamMember {
//   id: string;
//   name: string;
//   color: string;
//   specialty: string;
//   isUnlocked: boolean;
// }

// ============================================================================
// PERSONA COLORS (from design system)
// ============================================================================

const PERSONA_COLORS: Record<string, string> = {
  ferni: 'var(--color-ferni)',
  'peter-john': 'var(--color-peter)',
  'maya-habits': 'var(--color-maya)',
  'alex-chen': 'var(--color-alex)',
  'jordan-taylor': 'var(--color-jordan)',
  'nayan-sharma': 'var(--color-nayan)',
};

const PERSONA_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'peter-john': 'Peter',
  'maya-habits': 'Maya',
  'alex-chen': 'Alex',
  'jordan-taylor': 'Jordan',
  'nayan-sharma': 'Nayan',
};

const PERSONA_SPECIALTIES: Record<string, string> = {
  ferni: 'Life Coach',
  'peter-john': 'Research',
  'maya-habits': 'Habits',
  'alex-chen': 'Communications',
  'jordan-taylor': 'Planning',
  'nayan-sharma': 'Wisdom',
};

// ============================================================================
// GROUP CONVERSATION UI CLASS
// ============================================================================

/**
 * GroupConversationUI
 *
 * Manages the visual components for group conversations.
 */
export class GroupConversationUI {
  private container: HTMLElement | null = null;
  private participantGrid: HTMLElement | null = null;
  private teamSelectorModal: HTMLElement | null = null;
  private addParticipantModal: HTMLElement | null = null;
  private participants: Map<string, Participant> = new Map();
  private isActive = false;

  constructor() {
    this.cleanupOrphanedElements();
    log.debug('GroupConversationUI initialized');
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Show the team selector modal for starting a roundtable
   */
  showTeamSelector(options: {
    unlockedPersonas: string[];
    onSelect: (personas: string[], topic?: string) => void;
    onCancel: () => void;
  }): void {
    this.hideTeamSelector();

    const modal = this.createTeamSelectorModal(options);
    document.body.appendChild(modal);
    this.teamSelectorModal = modal;

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });

    log.debug({ unlockedPersonas: options.unlockedPersonas }, 'Team selector shown');
  }

  /**
   * Hide the team selector modal
   */
  hideTeamSelector(): void {
    if (this.teamSelectorModal) {
      this.teamSelectorModal.classList.remove('visible');
      setTimeout(() => {
        this.teamSelectorModal?.remove();
        this.teamSelectorModal = null;
      }, DURATION.SLOW);
    }
  }

  /**
   * Show the add participant modal for conference calls
   */
  showAddParticipant(options: {
    onAdd: (phoneNumber: string, name: string, relationship?: string) => void;
    onCancel: () => void;
  }): void {
    this.hideAddParticipant();

    const modal = this.createAddParticipantModal(options);
    document.body.appendChild(modal);
    this.addParticipantModal = modal;

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });

    log.debug('Add participant modal shown');
  }

  /**
   * Hide the add participant modal
   */
  hideAddParticipant(): void {
    if (this.addParticipantModal) {
      this.addParticipantModal.classList.remove('visible');
      setTimeout(() => {
        this.addParticipantModal?.remove();
        this.addParticipantModal = null;
      }, DURATION.SLOW);
    }
  }

  /**
   * Show the participant grid
   */
  showParticipantGrid(participants: Participant[]): void {
    this.hideParticipantGrid();

    // Clear and update participants map
    this.participants.clear();
    for (const p of participants) {
      this.participants.set(p.id, p);
    }

    const grid = this.createParticipantGrid();
    document.body.appendChild(grid);
    this.participantGrid = grid;
    this.isActive = true;

    // Animate in
    requestAnimationFrame(() => {
      grid.classList.add('visible');
    });

    log.debug({ participantCount: participants.length }, 'Participant grid shown');
  }

  /**
   * Update a participant in the grid
   */
  updateParticipant(participant: Partial<Participant> & { id: string }): void {
    const existing = this.participants.get(participant.id);
    if (existing) {
      Object.assign(existing, participant);
      this.renderParticipantGrid();
    }
  }

  /**
   * Add a participant to the grid
   */
  addParticipant(participant: Participant): void {
    this.participants.set(participant.id, participant);
    this.renderParticipantGrid();
    
    // Celebration toast
    toast.success(t('toasts.participantnameJoined'));
  }

  /**
   * Remove a participant from the grid
   */
  removeParticipant(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      toast.info(t('toasts.participantnameLeft'));
      this.participants.delete(participantId);
      this.renderParticipantGrid();
    }
  }

  /**
   * Highlight the current speaker
   */
  highlightSpeaker(participantId: string | null): void {
    // Update speaking state
    for (const [id, p] of this.participants) {
      p.isSpeaking = id === participantId;
    }
    this.renderParticipantGrid();
  }

  /**
   * Hide the participant grid
   */
  hideParticipantGrid(): void {
    if (this.participantGrid) {
      this.participantGrid.classList.remove('visible');
      setTimeout(() => {
        this.participantGrid?.remove();
        this.participantGrid = null;
      }, DURATION.SLOW);
    }
    this.isActive = false;
  }

  /**
   * Check if group UI is active
   */
  isGroupActive(): boolean {
    return this.isActive;
  }

  /**
   * Cleanup all UI elements
   */
  cleanup(): void {
    this.hideTeamSelector();
    this.hideAddParticipant();
    this.hideParticipantGrid();
    this.participants.clear();
  }

  // ==========================================================================
  // PRIVATE METHODS - TEAM SELECTOR
  // ==========================================================================

  private createTeamSelectorModal(options: {
    unlockedPersonas: string[];
    onSelect: (personas: string[], topic?: string) => void;
    onCancel: () => void;
  }): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'group-modal-overlay';
    modal.innerHTML = `
      <div class="group-modal-backdrop"></div>
      <div class="group-modal-card team-selector">
        <header>
          <span class="eyebrow">TEAM ROUNDTABLE</span>
          <h2>Who should join?</h2>
          <button class="close-btn" aria-label="${t('accessibility.close')}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>
        
        <div class="team-grid">
          ${this.renderTeamMembers(options.unlockedPersonas)}
        </div>
        
        <div class="topic-input">
          <label for="roundtable-topic">What would you like to discuss?</label>
          <input type="text" id="roundtable-topic" placeholder="Career planning, relationship advice..." />
        </div>
        
        <footer>
          <button class="secondary-btn" data-action="cancel">Cancel</button>
          <button class="primary-btn" data-action="start" disabled>Start Roundtable</button>
        </footer>
      </div>
    `;

    this.attachTeamSelectorListeners(modal, options);
    return modal;
  }

  private renderTeamMembers(unlockedPersonas: string[]): string {
    const allPersonas = ['ferni', 'peter-john', 'maya-habits', 'alex-chen', 'jordan-taylor', 'nayan-sharma'];

    return allPersonas
      .map((personaId) => {
        const isUnlocked = unlockedPersonas.includes(personaId);
        const name = PERSONA_NAMES[personaId];
        const color = PERSONA_COLORS[personaId];
        const specialty = PERSONA_SPECIALTIES[personaId];

        return `
          <div class="team-member ${isUnlocked ? '' : 'locked'}" 
               data-persona="${personaId}"
               style="--persona-color: ${color}">
            <div class="avatar">
              <span class="initial">${name[0]}</span>
              ${!isUnlocked ? '<span class="lock-icon">🔒</span>' : ''}
            </div>
            <span class="name">${name}</span>
            <span class="specialty">${specialty}</span>
            ${isUnlocked ? '<span class="checkmark">✓</span>' : ''}
          </div>
        `;
      })
      .join('');
  }

  private attachTeamSelectorListeners(
    modal: HTMLElement,
    options: {
      unlockedPersonas: string[];
      onSelect: (personas: string[], topic?: string) => void;
      onCancel: () => void;
    }
  ): void {
    const selectedPersonas = new Set<string>(['ferni']); // Ferni always included
    const startBtn = modal.querySelector('[data-action="start"]') as HTMLButtonElement;

    // Team member selection
    modal.querySelectorAll('.team-member').forEach((el) => {
      const personaId = el.getAttribute('data-persona');
      if (!personaId) return;

      // Pre-select Ferni
      if (personaId === 'ferni') {
        el.classList.add('selected');
      }

      el.addEventListener('click', () => {
        if (el.classList.contains('locked')) {
          toast.warning(t('toasts.unlockTeamMemberFirst'));
          return;
        }

        // Ferni can't be deselected
        if (personaId === 'ferni') {
          toast.info(t('toasts.ferniAlwaysJoins'));
          return;
        }

        if (selectedPersonas.has(personaId)) {
          selectedPersonas.delete(personaId);
          el.classList.remove('selected');
        } else {
          selectedPersonas.add(personaId);
          el.classList.add('selected');
        }

        // Enable start button if at least 2 selected
        startBtn.disabled = selectedPersonas.size < 2;
      });
    });

    // Close button
    modal.querySelector('.close-btn')?.addEventListener('click', () => {
      this.hideTeamSelector();
      options.onCancel();
    });

    // Cancel button
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      this.hideTeamSelector();
      options.onCancel();
    });

    // Start button
    startBtn.addEventListener('click', () => {
      const topic = (modal.querySelector('#roundtable-topic') as HTMLInputElement)?.value?.trim();
      this.hideTeamSelector();
      options.onSelect(Array.from(selectedPersonas), topic || undefined);
    });

    // Backdrop click
    modal.querySelector('.group-modal-backdrop')?.addEventListener('click', () => {
      this.hideTeamSelector();
      options.onCancel();
    });
  }

  // ==========================================================================
  // PRIVATE METHODS - ADD PARTICIPANT
  // ==========================================================================

  private createAddParticipantModal(options: {
    onAdd: (phoneNumber: string, name: string, relationship?: string) => void;
    onCancel: () => void;
  }): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'group-modal-overlay';
    modal.innerHTML = `
      <div class="group-modal-backdrop"></div>
      <div class="group-modal-card add-participant">
        <header>
          <span class="eyebrow">CONFERENCE CALL</span>
          <h2>Add someone to this conversation</h2>
          <button class="close-btn" aria-label="${t('accessibility.close')}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>
        
        <div class="form-fields">
          <div class="field">
            <label for="participant-name">Their name</label>
            <input type="text" id="participant-name" placeholder="Sarah" required />
          </div>
          
          <div class="field">
            <label for="participant-phone">Phone number</label>
            <input type="tel" id="participant-phone" placeholder="+1 (555) 123-4567" required />
          </div>
          
          <div class="field">
            <label for="participant-relationship">Relationship <span class="optional">(optional)</span></label>
            <input type="text" id="participant-relationship" placeholder="Partner, friend, therapist..." />
          </div>
        </div>
        
        <footer>
          <button class="secondary-btn" data-action="cancel">Cancel</button>
          <button class="primary-btn" data-action="add">Add to Call</button>
        </footer>
      </div>
    `;

    this.attachAddParticipantListeners(modal, options);
    return modal;
  }

  private attachAddParticipantListeners(
    modal: HTMLElement,
    options: {
      onAdd: (phoneNumber: string, name: string, relationship?: string) => void;
      onCancel: () => void;
    }
  ): void {
    const nameInput = modal.querySelector('#participant-name') as HTMLInputElement;
    const phoneInput = modal.querySelector('#participant-phone') as HTMLInputElement;
    const relationshipInput = modal.querySelector('#participant-relationship') as HTMLInputElement;
    const addBtn = modal.querySelector('[data-action="add"]') as HTMLButtonElement;

    // Phone formatting
    phoneInput.addEventListener('input', () => {
      const formatted = this.formatPhoneNumber(phoneInput.value);
      phoneInput.value = formatted;
    });

    // Validate on input
    const validate = () => {
      const nameValid = nameInput.value.trim().length > 0;
      const phoneValid = this.isValidPhoneNumber(phoneInput.value);
      addBtn.disabled = !nameValid || !phoneValid;
    };

    nameInput.addEventListener('input', validate);
    phoneInput.addEventListener('input', validate);

    // Close button
    modal.querySelector('.close-btn')?.addEventListener('click', () => {
      this.hideAddParticipant();
      options.onCancel();
    });

    // Cancel button
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      this.hideAddParticipant();
      options.onCancel();
    });

    // Add button
    addBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const phone = phoneInput.value.replace(/\D/g, '');
      const relationship = relationshipInput.value.trim() || undefined;

      if (!name || !this.isValidPhoneNumber(phoneInput.value)) {
        toast.warning(t('toasts.enterNameAndPhone'));
        return;
      }

      this.hideAddParticipant();
      options.onAdd(phone, name, relationship);
    });

    // Backdrop click
    modal.querySelector('.group-modal-backdrop')?.addEventListener('click', () => {
      this.hideAddParticipant();
      options.onCancel();
    });
  }

  // ==========================================================================
  // PRIVATE METHODS - PARTICIPANT GRID
  // ==========================================================================

  private createParticipantGrid(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'group-participant-grid';
    this.renderParticipantGridContent(container);
    return container;
  }

  private renderParticipantGrid(): void {
    if (!this.participantGrid) return;
    this.renderParticipantGridContent(this.participantGrid);
  }

  private renderParticipantGridContent(container: HTMLElement): void {
    const participants = Array.from(this.participants.values());

    container.innerHTML = `
      <div class="participant-list">
        ${participants
          .map(
            (p) => `
          <div class="participant ${p.isSpeaking ? 'speaking' : ''}" 
               data-id="${p.id}"
               style="--participant-color: ${this.getParticipantColor(p)}">
            <div class="avatar">
              <span class="initial">${p.name[0]}</span>
              ${p.isSpeaking ? '<div class="speaking-indicator"></div>' : ''}
            </div>
            <span class="name">${p.name}</span>
            <span class="role">${this.getRoleLabel(p)}</span>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  private getParticipantColor(participant: Participant): string {
    if (participant.type === 'agent') {
      const personaId = participant.id.replace('agent_', '');
      return PERSONA_COLORS[personaId] ?? 'var(--color-text-muted)';
    }
    if (participant.type === 'external') {
      return 'var(--color-coral)';
    }
    return 'var(--color-accent)';
  }

  private getRoleLabel(participant: Participant): string {
    if (participant.type === 'human') return 'You';
    if (participant.type === 'external') return 'Phone';
    return participant.role === 'moderator' ? 'Moderator' : 'Expert';
  }

  // ==========================================================================
  // PRIVATE METHODS - UTILITIES
  // ==========================================================================

  private formatPhoneNumber(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  private isValidPhoneNumber(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 10;
  }

  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.group-modal-overlay').forEach((el) => el.remove());
    document.querySelectorAll('.group-participant-grid').forEach((el) => el.remove());
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = `
/* Modal Overlay */
.group-modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  opacity: 0;
  visibility: hidden;
  transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
              visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.group-modal-overlay.visible {
  opacity: 1;
  visibility: visible;
}

/* Backdrop */
.group-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.75);
}

/* Modal Card */
.group-modal-card {
  position: relative;
  background: var(--color-background-elevated);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-2xl);
  padding: var(--space-6);
  max-width: 480px;
  width: calc(100% - var(--space-8));
  transform: scale(0.95);
  transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
}

.group-modal-overlay.visible .group-modal-card {
  transform: scale(1);
}

/* Header */
.group-modal-card header {
  margin-bottom: var(--space-6);
}

.group-modal-card .eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--color-accent);
  text-transform: uppercase;
}

.group-modal-card h2 {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: var(--space-2) 0 0;
}

.group-modal-card .close-btn {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
}

.group-modal-card .close-btn:hover {
  background: var(--color-background-subtle);
  color: var(--color-text-primary);
}

/* Team Grid */
.team-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.team-member {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-background-subtle);
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color ${DURATION.FAST}ms, transform ${DURATION.FAST}ms;
}

.team-member:hover:not(.locked) {
  border-color: var(--persona-color);
  transform: translateY(-2px);
}

.team-member.selected {
  border-color: var(--persona-color);
  background: color-mix(in srgb, var(--persona-color) 10%, transparent);
}

.team-member.locked {
  opacity: 0.5;
  cursor: not-allowed;
}

.team-member .avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: var(--persona-color);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-2);
  position: relative;
}

.team-member .initial {
  color: white;
  font-weight: 600;
  font-size: 1.25rem;
}

.team-member .lock-icon {
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 12px;
}

.team-member .name {
  font-weight: 600;
  color: var(--color-text-primary);
  font-size: 0.875rem;
}

.team-member .specialty {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.team-member .checkmark {
  display: none;
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  width: 20px;
  height: 20px;
  background: var(--persona-color);
  color: white;
  border-radius: var(--radius-full);
  font-size: 12px;
  align-items: center;
  justify-content: center;
}

.team-member.selected .checkmark {
  display: flex;
}

/* Topic Input */
.topic-input {
  margin-bottom: var(--space-6);
}

.topic-input label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2);
}

.topic-input input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-background-elevated);
  color: var(--color-text-primary);
  font-size: 1rem;
  transition: border-color ${DURATION.FAST}ms;
}

.topic-input input:focus {
  outline: none;
  border-color: var(--color-accent);
}

/* Form Fields */
.form-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.field label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2);
}

.field .optional {
  font-weight: 400;
  color: var(--color-text-muted);
}

.field input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-background-elevated);
  color: var(--color-text-primary);
  font-size: 1rem;
  transition: border-color ${DURATION.FAST}ms;
}

.field input:focus {
  outline: none;
  border-color: var(--color-accent);
}

/* Footer */
.group-modal-card footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.secondary-btn {
  padding: var(--space-3) var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text-secondary);
  font-weight: 500;
  cursor: pointer;
  transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
}

.secondary-btn:hover {
  background: var(--color-background-subtle);
  color: var(--color-text-primary);
}

.primary-btn {
  padding: var(--space-3) var(--space-5);
  border: none;
  border-radius: var(--radius-lg);
  background: var(--color-accent);
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: background ${DURATION.FAST}ms, transform ${DURATION.FAST}ms;
}

.primary-btn:hover:not(:disabled) {
  background: var(--color-accent-hover);
  transform: translateY(-1px);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Participant Grid */
.group-participant-grid {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  background: var(--color-background-elevated);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  padding: var(--space-4);
  z-index: var(--z-sticky);
  opacity: 0;
  transform: translateX(20px);
  transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
              transform ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.group-participant-grid.visible {
  opacity: 1;
  transform: translateX(0);
}

.participant-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.participant {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-lg);
  transition: background ${DURATION.FAST}ms;
}

.participant.speaking {
  background: color-mix(in srgb, var(--participant-color) 10%, transparent);
}

.participant .avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--participant-color);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.participant .initial {
  color: white;
  font-weight: 600;
  font-size: 0.875rem;
}

.participant .speaking-indicator {
  position: absolute;
  inset: -3px;
  border: 2px solid var(--participant-color);
  border-radius: var(--radius-full);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.1); }
}

.participant .name {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 0.875rem;
}

.participant .role {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-left: auto;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const groupConversationUI = new GroupConversationUI();

/**
 * Initialize the group conversation UI.
 * Called during app startup.
 */
export function initGroupConversationUI(): void {
  // GroupConversationUI is self-initializing via constructor
  // This function exists for consistency with other UI modules
  // No explicit init needed - class is instantiated at module load
}

export function showTeamSelector(options: {
  unlockedPersonas: string[];
  onSelect: (personas: string[], topic?: string) => void;
  onCancel: () => void;
}): void {
  groupConversationUI.showTeamSelector(options);
}

export function showAddParticipant(options: {
  onAdd: (phoneNumber: string, name: string, relationship?: string) => void;
  onCancel: () => void;
}): void {
  groupConversationUI.showAddParticipant(options);
}

