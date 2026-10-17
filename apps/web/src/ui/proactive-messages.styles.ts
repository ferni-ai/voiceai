/**
 * Styles for the in-app messages card (proactive-messages.ui.ts), moved out
 * of it unchanged so that file stays under the size ratchet.
 *
 * @module ProactiveMessagesStyles
 */

export const PROACTIVE_MESSAGES_CSS = `
    .indicator-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--color-background-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-full, 9999px);
      box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1));
      cursor: pointer;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 14px;
      color: var(--color-text-secondary, #5C544A);
      transition: all var(--duration-fast, 100ms) ease;
    }
    
    .indicator-btn:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.1));
      color: var(--persona-primary, #4a6741);
    }
    
    .indicator-dot {
      width: 10px;
      height: 10px;
      background: var(--persona-primary, #4a6741);
      border-radius: 50%;
      animation: pulse-gentle 2s infinite;
    }
    
    @keyframes pulse-gentle {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(0.9); }
    }
    
    .indicator-count {
      font-weight: 600;
    }
    
    .proactive-messages-container {
      position: fixed;
      bottom: var(--space-20, 80px);
      right: var(--space-6, 24px);
      z-index: var(--z-toast);
      max-width: 380px;
      width: calc(100vw - 48px);
      opacity: 0;
      visibility: hidden;
      transform: translateY(20px) scale(0.95);
      transition: opacity var(--duration-slow, 300ms) var(--ease-standard, ease-out),
                  transform var(--duration-slow, 300ms) var(--ease-spring, ease),
                  visibility var(--duration-slow, 300ms);
    }
    
    .proactive-messages-container.visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
    }
    
    .message-card {
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0,0,0,0.25));
      overflow: hidden;
    }
    
    .message-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
    }
    
    .message-sender {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
    }
    
    .sender-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--persona-primary, #4a6741);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .sender-avatar svg {
      width: 20px;
      height: 20px;
      fill: white;
    }
    
    .sender-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .sender-name {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-weight: 600;
      font-size: 14px;
      color: var(--color-text-primary, #2C2520);
    }
    
    .sender-reason {
      font-size: 12px;
      color: var(--color-text-muted, #756A5E);
    }
    
    .close-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: var(--color-background-secondary, #F5F1E8);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background var(--duration-fast, 100ms) ease;
    }
    
    .close-btn:hover {
      background: var(--color-border-medium, rgba(44, 37, 32, 0.1));
    }
    
    .close-btn svg {
      width: 16px;
      height: 16px;
      stroke: var(--color-text-muted, #756A5E);
    }
    
    .message-body {
      padding: var(--space-5, 20px);
    }
    
    .message-text {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 15px;
      line-height: 1.6;
      color: var(--color-text-secondary, #5C544A);
      white-space: pre-wrap;
    }
    
    .message-card-link {
      display: inline-block;
      margin-top: var(--space-sm);
      font-family: var(--font-body);
      font-size: var(--text-sm);
      color: var(--color-accent-text);
    }

    .message-card-link:hover,
    .message-card-link:focus-visible {
      color: var(--color-accent-hover);
    }

    .message-card-link:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }

    .message-actions {
      display: flex;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      padding-top: 0;
    }
    
    .action-btn {
      flex: 1;
      padding: var(--space-3, 12px);
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-border-medium, rgba(44, 37, 32, 0.1));
      background: transparent;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 14px;
      font-weight: 500;
      color: var(--color-text-secondary, #5C544A);
      cursor: pointer;
      transition: all var(--duration-fast, 100ms) ease;
    }
    
    .action-btn:hover {
      background: var(--color-background-secondary, #F5F1E8);
    }
    
    .action-btn.primary {
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
      color: white;
    }
    
    .action-btn.primary:hover {
      background: var(--persona-secondary, #3d5a35);
      border-color: var(--persona-secondary, #3d5a35);
    }
    
    .message-pagination {
      display: flex;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding-bottom: var(--space-4, 16px);
    }
    
    .pagination-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-border-medium, rgba(44, 37, 32, 0.15));
      transition: all var(--duration-fast, 100ms) ease;
    }
    
    .pagination-dot.active {
      width: 20px;
      border-radius: 3px;
      background: var(--persona-primary, #4a6741);
    }
    
    @media (max-width: 480px) {
      .proactive-messages-container {
        bottom: var(--space-16, 64px);
        right: var(--space-3, 12px);
        left: var(--space-3, 12px);
        width: auto;
        max-width: none;
      }
      
      .proactive-indicator {
        bottom: var(--space-16, 64px);
        right: var(--space-3, 12px);
      }
    }
`;
