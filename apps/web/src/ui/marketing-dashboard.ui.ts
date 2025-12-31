/**
 * Marketing Dashboard UI
 *
 * A dashboard for managing social media content through Alex.
 * This dogfoods our own platform - Alex helps manage Ferni's marketing.
 *
 * Features:
 * - View connected social accounts (Twitter, LinkedIn)
 * - See scheduled posts
 * - View analytics
 * - Quick actions (generate content, post)
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';

const log = createLogger('MarketingDashboard');

interface SocialAccount {
  platform: 'twitter' | 'linkedin';
  connected: boolean;
  username?: string | null;
  organizationName?: string | null;
}

interface ScheduledPost {
  id: string;
  platform: 'twitter' | 'linkedin';
  content: string | string[];
  scheduledAt: Date;
  status: 'scheduled' | 'posted' | 'failed';
}

interface Analytics {
  totalPosts: number;
  twitter?: {
    posts: number;
    impressions: number;
    engagements: number;
    engagementRate: string;
  };
  linkedin?: {
    posts: number;
    impressions: number;
    reactions: number;
    comments: number;
  };
  insights: string[];
}

export class MarketingDashboard {
  private container: HTMLElement | null = null;
  private accounts: SocialAccount[] = [];
  private posts: ScheduledPost[] = [];
  private analytics: Analytics | null = null;
  private isLoading = false;

  constructor() {
    log.debug('Marketing dashboard initialized');
  }

  async show(): Promise<void> {
    // Clean up any existing dashboard
    this.cleanup();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'marketing-dashboard-overlay';
    this.container.innerHTML = this.renderDashboard();

    // Add styles
    this.addStyles();

    // Add to DOM
    document.body.appendChild(this.container);

    // Animate in
    requestAnimationFrame(() => {
      this.container?.classList.add('visible');
    });

    // Load data
    await this.loadData();

    // Add event listeners
    this.addEventListeners();
  }

  hide(): void {
    if (this.container) {
      this.container.classList.remove('visible');
      setTimeout(() => this.cleanup(), DURATION.SLOW);
    }
  }

  private cleanup(): void {
    document.querySelectorAll('.marketing-dashboard-overlay').forEach((el) => el.remove());
    document.querySelectorAll('.marketing-dashboard-styles').forEach((el) => el.remove());
    this.container = null;
  }

  private async loadData(): Promise<void> {
    this.isLoading = true;
    this.updateUI();

    try {
      // Load accounts
      const accountsRes = await fetch('/api/marketing/accounts');
      if (accountsRes.ok) {
        const data = await accountsRes.json();
        this.accounts = data.accounts;
      }

      // Load scheduled posts
      const postsRes = await fetch('/api/marketing/posts?limit=5');
      if (postsRes.ok) {
        const data = await postsRes.json();
        this.posts = data.posts.map((p: ScheduledPost) => ({
          ...p,
          scheduledAt: new Date(p.scheduledAt),
        }));
      }

      // Load analytics
      const analyticsRes = await fetch('/api/marketing/analytics?period=week');
      if (analyticsRes.ok) {
        this.analytics = await analyticsRes.json();
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to load marketing data');
    }

    this.isLoading = false;
    this.updateUI();
  }

  private updateUI(): void {
    if (!this.container) return;

    const content = this.container.querySelector('.dashboard-content');
    if (content) {
      content.innerHTML = this.renderContent();
      this.addEventListeners();
    }
  }

  private renderDashboard(): string {
    return `
      <div class="marketing-dashboard-backdrop"></div>
      <div class="marketing-dashboard-card">
        <header class="dashboard-header">
          <div class="header-text">
            <span class="eyebrow">ALEX'S TOOLKIT</span>
            <h2>Marketing Dashboard</h2>
          </div>
          <button class="close-btn" aria-label="${t('accessibility.close')}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        <div class="dashboard-content">
          ${this.renderContent()}
        </div>
      </div>
    `;
  }

  private renderContent(): string {
    if (this.isLoading) {
      return `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading marketing data...</p>
        </div>
      `;
    }

    return `
      <section class="accounts-section">
        <h3>Connected Accounts</h3>
        <div class="accounts-grid">
          ${this.renderAccount('twitter')}
          ${this.renderAccount('linkedin')}
        </div>
      </section>

      <section class="analytics-section">
        <h3>This Week's Performance</h3>
        ${this.renderAnalytics()}
      </section>

      <section class="posts-section">
        <h3>Scheduled Posts</h3>
        ${this.renderScheduledPosts()}
      </section>

      <section class="actions-section">
        <h3>Quick Actions</h3>
        <div class="action-buttons" role="button" tabindex="0">
          <button aria-label="${t('accessibility.generateContent')}" class="action-btn" data-action="generate">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Generate Content
          </button>
          <button aria-label="${t('accessibility.askAlex')}" class="action-btn" data-action="ask-alex">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Ask Alex
          </button>
        </div>
        <p class="help-text">
          Say "Hey Alex, create a Twitter thread about our latest blog" to get started.
        </p>
      </section>
    `;
  }

  private renderAccount(platform: 'twitter' | 'linkedin'): string {
    const account = this.accounts.find((a) => a.platform === platform);
    const connected = account?.connected || false;
    const name = platform === 'twitter' ? account?.username : account?.organizationName;
    const icon = platform === 'twitter' ? '𝕏' : 'in';
    const label = platform === 'twitter' ? 'Twitter/X' : 'LinkedIn';

    return `
      <div class="account-card ${connected ? 'connected' : 'disconnected'}">
        <div class="account-icon">${icon}</div>
        <div class="account-info">
          <span class="account-name">${label}</span>
          <span class="account-status">
            ${connected ? `@${name || 'Connected'}` : 'Not connected'}
          </span>
        </div>
        <button class="account-action" data-platform="${platform}" data-action="${connected ? 'disconnect' : 'connect'}">
          ${connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
    `;
  }

  private renderAnalytics(): string {
    if (!this.analytics || this.analytics.totalPosts === 0) {
      return `
        <div class="empty-analytics">
          <p>No posts yet this week. Ask Alex to create some content!</p>
        </div>
      `;
    }

    return `
      <div class="analytics-grid">
        ${
          this.analytics.twitter
            ? `
          <div class="analytics-card twitter">
            <span class="platform-icon">𝕏</span>
            <div class="analytics-metrics">
              <div class="metric">
                <span class="metric-value">${this.analytics.twitter.posts}</span>
                <span class="metric-label">posts</span>
              </div>
              <div class="metric">
                <span class="metric-value">${this.formatNumber(this.analytics.twitter.impressions)}</span>
                <span class="metric-label">impressions</span>
              </div>
              <div class="metric">
                <span class="metric-value">${this.analytics.twitter.engagementRate}%</span>
                <span class="metric-label">engagement</span>
              </div>
            </div>
          </div>
        `
            : ''
        }
        ${
          this.analytics.linkedin
            ? `
          <div class="analytics-card linkedin">
            <span class="platform-icon">in</span>
            <div class="analytics-metrics">
              <div class="metric">
                <span class="metric-value">${this.analytics.linkedin.posts}</span>
                <span class="metric-label">posts</span>
              </div>
              <div class="metric">
                <span class="metric-value">${this.formatNumber(this.analytics.linkedin.impressions)}</span>
                <span class="metric-label">impressions</span>
              </div>
              <div class="metric">
                <span class="metric-value">${this.analytics.linkedin.reactions}</span>
                <span class="metric-label">reactions</span>
              </div>
            </div>
          </div>
        `
            : ''
        }
      </div>
      ${
        this.analytics.insights.length > 0
          ? `
        <div class="insights">
          <h4>Insights</h4>
          <ul>
            ${this.analytics.insights.map((i) => `<li>${i}</li>`).join('')}
          </ul>
        </div>
      `
          : ''
      }
    `;
  }

  private renderScheduledPosts(): string {
    if (this.posts.length === 0) {
      return `
        <div class="empty-posts">
          <p>No scheduled posts. Ask Alex to schedule some content!</p>
        </div>
      `;
    }

    return `
      <div class="posts-list">
        ${this.posts
          .map(
            (post) => `
          <div class="post-item">
            <span class="post-platform">${post.platform === 'twitter' ? '𝕏' : 'in'}</span>
            <div class="post-content">
              <span class="post-preview">${this.truncate(Array.isArray(post.content) ? post.content[0] : post.content, 60)}</span>
              <span class="post-time">${this.formatDate(post.scheduledAt)}</span>
            </div>
            <span class="post-status ${post.status}">${post.status}</span>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  private addEventListeners(): void {
    if (!this.container) return;

    // Close button
    const closeBtn = this.container.querySelector('.close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    // Backdrop click
    const backdrop = this.container.querySelector('.marketing-dashboard-backdrop');
    backdrop?.addEventListener('click', () => this.hide());

    // Account actions
    this.container.querySelectorAll('.account-action').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const platform = target.dataset.platform;
        const action = target.dataset.action;
        
        if (action === 'connect') {
          window.location.href = `/api/marketing/${platform}/connect?userId=current`;
        } else {
          // Disconnect - would call DELETE endpoint
          log.info({ platform }, 'Disconnect account requested');
        }
      });
    });

    // Action buttons
    this.container.querySelectorAll('.action-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const action = target.dataset.action;
        
        if (action === 'ask-alex') {
          this.hide();
          // Trigger handoff to Alex
          document.dispatchEvent(
            new CustomEvent('ferni:switch-persona', {
              detail: { personaId: 'alex-chen', reason: 'User wants marketing help' },
            })
          );
        } else if (action === 'generate') {
          this.hide();
          // Could trigger a specific command
          log.info('Generate content action');
        }
      });
    });
  }

  private addStyles(): void {
    if (document.querySelector('.marketing-dashboard-styles')) return;

    const style = document.createElement('style');
    style.className = 'marketing-dashboard-styles';
    style.textContent = `
      .marketing-dashboard-overlay {
        position: fixed;
        inset: 0;
        z-index: var(--z-tooltip);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .marketing-dashboard-overlay.visible {
        opacity: 1;
      }

      .marketing-dashboard-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.75);
      }

      .marketing-dashboard-card {
        position: relative;
        width: 90%;
        max-width: clamp(420px, 90vw, 600px);
        max-height: 85vh;
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: scale(0.95);
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .marketing-dashboard-overlay.visible .marketing-dashboard-card {
        transform: scale(1);
      }

      .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.1));
      }

      .header-text .eyebrow {
        display: block;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        color: var(--color-alex-text);
        margin-bottom: 4px;
      }

      .header-text h2 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .close-btn {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        color: var(--color-text-muted);
        border-radius: 8px;
        transition: background ${DURATION.FAST}ms;
      }

      .close-btn:hover {
        background: rgba(0, 0, 0, 0.05);
      }

      .dashboard-content {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-6, 24px);
      }

      section {
        margin-bottom: var(--space-6, 24px);
      }

      section:last-child {
        margin-bottom: 0;
      }

      section h3 {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-4, 16px) 0;
      }

      .accounts-grid {
        display: grid;
        gap: var(--space-3, 12px);
      }

      .account-card {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px);
        background: var(--color-background);
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--color-border, rgba(0,0,0,0.08));
      }

      .account-card.connected {
        border-color: var(--color-alex-text);
        border-width: 2px;
      }

      .account-icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-text-primary);
        color: white;
        border-radius: 8px;
        font-weight: 700;
        font-size: 1.25rem;
      }

      .account-info {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .account-name {
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .account-status {
        font-size: 0.875rem;
        color: var(--color-text-muted);
      }

      .account-action {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms;
        border: 1px solid var(--color-border, rgba(0,0,0,0.1));
        background: white;
        color: var(--color-text-primary);
      }

      .account-action:hover {
        background: var(--color-alex);
        color: white;
        border-color: var(--color-alex-text);
      }

      .analytics-grid {
        display: grid;
        gap: var(--space-3, 12px);
      }

      .analytics-card {
        display: flex;
        gap: var(--space-4, 16px);
        padding: var(--space-4, 16px);
        background: var(--color-background);
        border-radius: var(--radius-lg, 12px);
      }

      .platform-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-text-primary);
        color: white;
        border-radius: 6px;
        font-weight: 700;
        font-size: 1rem;
      }

      .analytics-metrics {
        flex: 1;
        display: flex;
        gap: var(--space-4, 16px);
      }

      .metric {
        display: flex;
        flex-direction: column;
      }

      .metric-value {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .metric-label {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .insights {
        margin-top: var(--space-4, 16px);
        padding: var(--space-4, 16px);
        background: rgba(90, 107, 138, 0.1);
        border-radius: var(--radius-lg, 12px);
      }

      .insights h4 {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-alex-text);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .insights ul {
        margin: 0;
        padding-left: var(--space-4, 16px);
        color: var(--color-text-secondary);
        font-size: 0.875rem;
      }

      .posts-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .post-item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background);
        border-radius: var(--radius-md, 8px);
      }

      .post-platform {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-text-primary);
        color: white;
        border-radius: 4px;
        font-weight: 700;
        font-size: 0.75rem;
      }

      .post-content {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .post-preview {
        color: var(--color-text-primary);
        font-size: 0.875rem;
      }

      .post-time {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .post-status {
        font-size: 0.75rem;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: 4px;
      }

      .post-status.scheduled {
        background: rgba(90, 107, 138, 0.1);
        color: var(--color-alex-text);
      }

      .post-status.posted {
        background: rgba(74, 103, 65, 0.1);
        color: var(--color-ferni-text);
      }

      .post-status.failed {
        background: rgba(220, 53, 69, 0.1);
        color: #dc3545;
      }

      .action-buttons {
        display: flex;
        gap: var(--space-3, 12px);
        flex-wrap: wrap;
      }

      .action-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        background: var(--color-alex);
        color: white;
        border: none;
        border-radius: var(--radius-lg, 12px);
        font-size: 0.9375rem;
        font-weight: 500;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .action-btn:hover {
        background: var(--color-alex-dark);
        transform: translateY(-1px);
      }

      .help-text {
        margin-top: var(--space-4, 16px);
        font-size: 0.875rem;
        color: var(--color-text-muted);
        font-style: italic;
      }

      .empty-analytics,
      .empty-posts {
        padding: var(--space-6, 24px);
        text-align: center;
        color: var(--color-text-muted);
        background: var(--color-background);
        border-radius: var(--radius-lg, 12px);
      }

      .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8, 32px);
        color: var(--color-text-muted);
      }

      .loading-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border, rgba(0,0,0,0.1));
        border-top-color: var(--color-alex-text);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: var(--space-4, 16px);
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @media (max-width: clamp(336px, 90vw, 480px)) {
        .analytics-metrics {
          flex-wrap: wrap;
        }
        
        .action-buttons {
          flex-direction: column;
        }
        
        .action-btn {
          width: 100%;
          justify-content: center;
        }
      }
    `;

    document.head.appendChild(style);
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (days === 1) {
      return `Tomorrow at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  }

  private truncate(str: string, length: number): string {
    return str.length > length ? str.substring(0, length) + '...' : str;
  }
}

// Singleton instance
let dashboardInstance: MarketingDashboard | null = null;

export function showMarketingDashboard(): void {
  if (!dashboardInstance) {
    dashboardInstance = new MarketingDashboard();
  }
  void dashboardInstance.show();
}

export function hideMarketingDashboard(): void {
  dashboardInstance?.hide();
}

export default MarketingDashboard;

