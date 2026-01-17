import React, { forwardRef, useEffect, useRef, useCallback } from 'react';

/**
 * Dialog props
 */
export interface DialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog should close */
  onClose: () => void;
  /** Dialog title */
  title?: string;
  /** Dialog description */
  description?: string;
  /** Dialog content */
  children: React.ReactNode;
  /** Show close button */
  showClose?: boolean;
  /** Close on backdrop click */
  closeOnBackdrop?: boolean;
  /** Close on escape key */
  closeOnEscape?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Dialog Header props
 */
export interface DialogHeaderProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Dialog - Centered modal with backdrop blur
 * 
 * Following Ferni brand guidelines: centered, warm, not side-panel.
 * 
 * @example
 * ```tsx
 * <Dialog open={isOpen} onClose={() => setIsOpen(false)} title="Confirm">
 *   <p>Are you sure?</p>
 *   <DialogFooter>
 *     <Button onClick={() => setIsOpen(false)}>Cancel</Button>
 *     <Button variant="primary" onClick={handleConfirm}>Confirm</Button>
 *   </DialogFooter>
 * </Dialog>
 * ```
 */
export const Dialog = forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  {
    open,
    onClose,
    title,
    description,
    children,
    showClose = true,
    closeOnBackdrop = true,
    closeOnEscape = true,
    className = '',
  },
  ref
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (closeOnBackdrop && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnBackdrop, onClose]
  );

  // Focus management
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      dialogRef.current?.focus();
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      previousFocusRef.current?.focus();
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <>
      <div
        className={`ferni-dialog-overlay ${className}`}
        onClick={handleBackdropClick}
        role="presentation"
      >
        <div
          ref={ref || dialogRef}
          className="ferni-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'dialog-title' : undefined}
          aria-describedby={description ? 'dialog-description' : undefined}
          tabIndex={-1}
        >
          {(title || showClose) && (
            <header className="ferni-dialog__header">
              <div>
                {title && (
                  <h2 id="dialog-title" className="ferni-dialog__title">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id="dialog-description" className="ferni-dialog__description">
                    {description}
                  </p>
                )}
              </div>
              {showClose && (
                <button
                  className="ferni-dialog__close"
                  onClick={onClose}
                  aria-label="Close dialog"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </header>
          )}
          <div className="ferni-dialog__content">{children}</div>
        </div>
      </div>

      <style>{`
        .ferni-dialog-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 1000;
          animation: ferni-dialog-overlay-in 200ms ease-out;
        }

        .ferni-dialog-overlay::before {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(44, 37, 32, 0.4);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        @keyframes ferni-dialog-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .ferni-dialog {
          position: relative;
          background: white;
          border-radius: 24px;
          box-shadow: 0 25px 50px rgba(44, 37, 32, 0.25);
          max-width: 500px;
          width: 100%;
          max-height: calc(100vh - 48px);
          overflow: auto;
          animation: ferni-dialog-in 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes ferni-dialog-in {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .ferni-dialog__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 24px 24px 0;
        }

        .ferni-dialog__title {
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: #2C2520;
          margin: 0;
        }

        .ferni-dialog__description {
          font-size: 0.875rem;
          color: #5C544A;
          margin: 4px 0 0;
        }

        .ferni-dialog__close {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          color: #8A847A;
          transition: all 150ms ease;
        }

        .ferni-dialog__close:hover {
          background: rgba(44, 37, 32, 0.05);
          color: #2C2520;
        }

        .ferni-dialog__close:focus-visible {
          outline: 2px solid #4a6741;
          outline-offset: 2px;
        }

        .ferni-dialog__content {
          padding: 24px;
        }

        @media (prefers-reduced-motion: reduce) {
          .ferni-dialog-overlay,
          .ferni-dialog {
            animation: none;
          }
        }
      `}</style>
    </>
  );
});

/**
 * Dialog Header
 */
export const DialogHeader: React.FC<DialogHeaderProps> = ({ children, className = '' }) => (
  <header className={`ferni-dialog-header ${className}`}>{children}</header>
);

/**
 * Dialog Body
 */
export const DialogBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className = '' 
}) => (
  <div className={`ferni-dialog-body ${className}`}>{children}</div>
);

/**
 * Dialog Footer
 */
export const DialogFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ 
  children, 
  className = '' 
}) => (
  <>
    <footer className={`ferni-dialog-footer ${className}`}>{children}</footer>
    <style>{`
      .ferni-dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding-top: 16px;
        border-top: 1px solid rgba(44, 37, 32, 0.1);
        margin-top: 16px;
      }
    `}</style>
  </>
);

Dialog.displayName = 'Dialog';
