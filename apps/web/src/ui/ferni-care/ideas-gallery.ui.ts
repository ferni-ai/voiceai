/**
 * Ideas Gallery UI
 *
 * "Ideas to get started" - warm, inspiring templates for routines.
 * Not "Workflow Templates" - that's enterprise software speak.
 *
 * Design: Floating centered modal with friendly categories.
 */

import {
  getLifeAutomationService,
  type TemplateCategory,
  type WorkflowTemplate,
} from '../../services/life-automation.service.js';
import { createLogger } from '../../utils/logger.js';
import { showRoutineBuilder } from './routine-builder.ui.js';

const log = createLogger('IdeasGallery');

// ============================================================================
// HUMANIZED COPY
// ============================================================================

const COPY = {
  eyebrow: 'WHAT I DO FOR YOU',
  title: 'Ideas to get started',
  subtitle: 'Pick one that feels right, or build your own',
  searchPlaceholder: 'What would help you?',

  sections: {
    featured: 'Popular with others like you',
    all: 'All ideas',
  },

  // Friendly category names
  categories: {
    morning: 'Morning routines',
    evening: 'Wind-down rituals',
    productivity: 'Focus & flow',
    wellness: 'Taking care of yourself',
    home: 'Smart home',
    communication: 'Staying connected',
    custom: 'Start from scratch',
  } as Record<string, string>,

  empty: 'No ideas match that search',
  timeToSetup: (time: string) => `Takes about ${time}`,
};

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  star: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`,
};

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .ideas-gallery-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 2100);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal, 200ms) ease-out;
  }
  
  .ideas-gallery-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  
  .ideas-gallery-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(44, 37, 32, 0.75);
    backdrop-filter: blur(8px);
  }
  
  .ideas-gallery {
    position: relative;
    width: 95%;
    max-width: 800px;
    max-height: 85vh;
    background: var(--color-bg-elevated, #FFFDFB);
    border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    border-radius: var(--radius-xl, 20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    transition: transform var(--duration-slow, 300ms) var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  }
  
  .ideas-gallery-overlay.visible .ideas-gallery {
    transform: scale(1);
  }
  
  .ideas-gallery__header {
    padding: var(--space-6, 24px);
    border-bottom: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.1));
    flex-shrink: 0;
  }
  
  .ideas-gallery__header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-4, 16px);
  }
  
  .ideas-gallery__eyebrow {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ferni-text, #4a6741);
    margin-bottom: var(--space-1, 4px);
  }
  
  .ideas-gallery__title {
    font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }
  
  .ideas-gallery__subtitle {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-top: var(--space-1, 4px);
  }
  
  .ideas-gallery__close {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.05));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .ideas-gallery__close:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.1));
    color: var(--color-text-primary);
  }
  
  .ideas-gallery__search {
    position: relative;
  }
  
  .ideas-gallery__search input {
    width: 100%;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    padding-left: 44px;
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    border-radius: var(--radius-lg, 12px);
    background: var(--color-bg-elevated, white);
    font-size: 14px;
    color: var(--color-text-primary);
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .ideas-gallery__search input::placeholder {
    color: var(--color-text-muted);
  }
  
  .ideas-gallery__search input:focus {
    outline: none;
    border-color: var(--color-ferni, #4a6741);
    box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
  }
  
  .ideas-gallery__search svg {
    position: absolute;
    left: var(--space-4, 16px);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
  }
  
  .ideas-gallery__content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6, 24px);
  }
  
  /* Category Pills */
  .ideas-categories {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 8px);
    margin-bottom: var(--space-6, 24px);
  }
  
  .ideas-category {
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.15));
    background: transparent;
    border-radius: var(--radius-full, 9999px);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }
  
  .ideas-category:hover {
    border-color: var(--color-ferni, #4a6741);
    color: var(--color-ferni, #4a6741);
  }
  
  .ideas-category.active {
    background: var(--color-ferni, #4a6741);
    border-color: var(--color-ferni, #4a6741);
    color: white;
  }
  
  /* Section Headers */
  .ideas-section {
    margin-bottom: var(--space-8, 32px);
  }
  
  .ideas-section__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--space-4, 16px);
  }
  
  /* Idea Cards */
  .ideas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-4, 16px);
  }
  
  .idea-card {
    padding: var(--space-5, 20px);
    background: var(--color-background-subtle, rgba(112, 96, 90, 0.03));
    border: 1px solid var(--color-border-subtle, rgba(112, 96, 90, 0.08));
    border-radius: var(--radius-lg, 12px);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    text-align: left;
  }
  
  .idea-card:hover {
    background: var(--color-background-hover, rgba(112, 96, 90, 0.06));
    border-color: var(--color-ferni, #4a6741);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
  
  .idea-card__header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3, 12px);
    margin-bottom: var(--space-3, 12px);
  }
  
  .idea-card__icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md, 8px);
    background: linear-gradient(135deg, var(--color-ferni, #4a6741) 0%, var(--color-ferni-dark, #3d5a35) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    flex-shrink: 0;
  }
  
  .idea-card__info {
    flex: 1;
    min-width: 0;
  }
  
  .idea-card__name {
    font-weight: 600;
    font-size: 15px;
    color: var(--color-text-primary);
    margin-bottom: 2px;
  }
  
  .idea-card__time {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  
  .idea-card__description {
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin-bottom: var(--space-3, 12px);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  .idea-card__tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1, 4px);
  }
  
  .idea-card__tag {
    padding: 2px 8px;
    background: var(--color-bg-elevated, white);
    border-radius: var(--radius-full, 9999px);
    font-size: 11px;
    color: var(--color-text-muted);
  }
  
  .idea-card__featured {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: rgba(74, 103, 65, 0.1);
    border-radius: var(--radius-full, 9999px);
    font-size: 11px;
    font-weight: 600;
    color: var(--color-ferni, #4a6741);
    margin-right: var(--space-2, 8px);
  }
  
  /* Loading */
  .ideas-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-12, 48px);
    color: var(--color-text-muted);
  }
  
  .ideas-loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border-subtle);
    border-top-color: var(--color-ferni, #4a6741);
    border-radius: 50%;
    animation: ideas-spin 0.8s linear infinite;
  }
  
  @keyframes ideas-spin {
    to { transform: rotate(360deg); }
  }
  
  .ideas-empty {
    text-align: center;
    padding: var(--space-8, 32px);
    color: var(--color-text-secondary);
  }
`;

// ============================================================================
// STATE
// ============================================================================

let galleryInstance: IdeasGallery | null = null;

// ============================================================================
// CLASS
// ============================================================================

export class IdeasGallery {
  private overlay: HTMLDivElement | null = null;
  private templates: WorkflowTemplate[] = [];
  private categories: TemplateCategory[] = [];
  private featured: WorkflowTemplate[] = [];
  private selectedCategory: string | null = null;
  private searchQuery = '';

  constructor() {
    this.injectStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('ideas-gallery-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'ideas-gallery-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  async open(): Promise<void> {
    this.close();

    this.overlay = document.createElement('div');
    this.overlay.className = 'ideas-gallery-overlay';
    this.overlay.innerHTML = this.render();
    document.body.appendChild(this.overlay);

    this.attachEventListeners();

    requestAnimationFrame(() => {
      this.overlay?.classList.add('visible');
    });

    await this.loadTemplates();
  }

  close(): void {
    if (this.overlay) {
      this.overlay.classList.remove('visible');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 300);
    }
  }

  private render(): string {
    return `
      <div class="ideas-gallery-backdrop" data-action="close"></div>
      <div class="ideas-gallery" role="dialog" aria-modal="true">
        <div class="ideas-gallery__header">
          <div class="ideas-gallery__header-top">
            <div>
              <div class="ideas-gallery__eyebrow">${COPY.eyebrow}</div>
              <h2 class="ideas-gallery__title">${COPY.title}</h2>
              <p class="ideas-gallery__subtitle">${COPY.subtitle}</p>
            </div>
            <button class="ideas-gallery__close" data-action="close" aria-label="Close">
              ${ICONS.close}
            </button>
          </div>
          <div class="ideas-gallery__search">
            ${ICONS.search}
            <input type="text" placeholder="${COPY.searchPlaceholder}" id="ideas-search">
          </div>
        </div>
        <div class="ideas-gallery__content" id="ideas-content">
          <div class="ideas-loading">
            <div class="ideas-loading-spinner"></div>
          </div>
        </div>
      </div>
    `;
  }

  private renderContent(): string {
    const filtered = this.getFilteredTemplates();

    if (filtered.length === 0 && this.searchQuery) {
      return `<div class="ideas-empty">${COPY.empty}</div>`;
    }

    return `
      <div class="ideas-categories">
        <button class="ideas-category ${!this.selectedCategory ? 'active' : ''}" data-category="">
          All
        </button>
        ${this.categories
          .map(
            (cat) => `
          <button class="ideas-category ${this.selectedCategory === cat.category ? 'active' : ''}" data-category="${cat.category}">
            ${COPY.categories[cat.category] || cat.label}
          </button>
        `
          )
          .join('')}
      </div>
      
      ${
        !this.selectedCategory && !this.searchQuery && this.featured.length > 0
          ? `
        <div class="ideas-section">
          <h3 class="ideas-section__title">${COPY.sections.featured}</h3>
          <div class="ideas-grid">
            ${this.featured.map((t) => this.renderIdeaCard(t, true)).join('')}
          </div>
        </div>
      `
          : ''
      }
      
      <div class="ideas-section">
        <h3 class="ideas-section__title">${this.selectedCategory ? COPY.categories[this.selectedCategory] || this.getCategoryLabel(this.selectedCategory) : COPY.sections.all}</h3>
        <div class="ideas-grid">
          ${filtered.map((t) => this.renderIdeaCard(t)).join('')}
        </div>
      </div>
    `;
  }

  private renderIdeaCard(template: WorkflowTemplate, showFeatured = false): string {
    return `
      <button class="idea-card" data-template-id="${template.id}">
        <div class="idea-card__header">
          <div class="idea-card__icon">${template.icon}</div>
          <div class="idea-card__info">
            <div class="idea-card__name">${this.escapeHtml(template.name)}</div>
            <div class="idea-card__time">${COPY.timeToSetup(template.estimatedTimeToSetup)}</div>
          </div>
        </div>
        <p class="idea-card__description">${this.escapeHtml(template.description)}</p>
        <div class="idea-card__tags">
          ${showFeatured ? `<span class="idea-card__featured">${ICONS.star} Popular</span>` : ''}
          ${template.tags
            .slice(0, 2)
            .map((tag) => `<span class="idea-card__tag">${tag}</span>`)
            .join('')}
        </div>
      </button>
    `;
  }

  private async loadTemplates(): Promise<void> {
    const content = this.overlay?.querySelector('#ideas-content');
    if (!content) return;

    try {
      const service = getLifeAutomationService();
      const data = await service.listTemplates();
      this.templates = data.templates;
      this.categories = data.categories;
      this.featured = data.featured;

      content.innerHTML = this.renderContent();
    } catch (error) {
      log.error('Failed to load templates', error);
      content.innerHTML = '<div class="ideas-loading"><p>Couldn\'t load ideas</p></div>';
    }
  }

  private getFilteredTemplates(): WorkflowTemplate[] {
    let filtered = this.templates;

    if (this.selectedCategory) {
      filtered = filtered.filter((t) => t.category === this.selectedCategory);
    }

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return filtered;
  }

  private getCategoryLabel(category: string): string {
    const cat = this.categories.find((c) => c.category === category);
    return cat?.label || category;
  }

  private attachEventListeners(): void {
    if (!this.overlay) return;

    this.overlay.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest('[data-action]')?.getAttribute('data-action');
      const templateId = target.closest('[data-template-id]')?.getAttribute('data-template-id');
      const category = target.closest('[data-category]')?.getAttribute('data-category');

      if (action === 'close') {
        this.close();
      } else if (templateId) {
        await this.selectTemplate(templateId);
      } else if (category !== undefined) {
        this.selectedCategory = category || null;
        const content = this.overlay?.querySelector('#ideas-content');
        if (content) {
          content.innerHTML = this.renderContent();
        }
      }
    });

    const searchInput = this.overlay.querySelector('#ideas-search') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      const content = this.overlay?.querySelector('#ideas-content');
      if (content) {
        content.innerHTML = this.renderContent();
      }
    });

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }

  private async selectTemplate(templateId: string): Promise<void> {
    const template = this.templates.find((t) => t.id === templateId);
    if (!template) return;

    this.close();
    showRoutineBuilder(template);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function showIdeasGallery(): void {
  if (!galleryInstance) {
    galleryInstance = new IdeasGallery();
  }
  galleryInstance.open();
}
