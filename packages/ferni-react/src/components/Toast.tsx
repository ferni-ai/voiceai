import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * Toast types
 */
export type ToastType = 'default' | 'success' | 'error' | 'info' | 'warning';

/**
 * Toast data
 */
export interface ToastData {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

/**
 * Toast props
 */
export interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

/**
 * Toaster props
 */
export interface ToasterProps {
  /** Position on screen */
  position?: 'top' | 'bottom';
  /** Distance from edge in pixels */
  offset?: number;
  /** Maximum visible toasts */
  maxToasts?: number;
}

/**
 * Toast context
 */
interface ToastContextValue {
  toasts: ToastData[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Generate unique ID
 */
let toastId = 0;
const generateId = () => `toast-${++toastId}`;

/**
 * Global toast store for imperative API
 */
let globalAddToast: ToastContextValue['addToast'] | null = null;

/**
 * Imperative toast API
 * 
 * @example
 * ```tsx
 * toast('Saved!');
 * toast.success('Done!');
 * toast.error("Couldn't save that");
 * ```
 */
export const toast = Object.assign(
  (message: string, options?: { type?: ToastType; duration?: number }) => {
    globalAddToast?.(message, options?.type, options?.duration);
  },
  {
    success: (message: string) => globalAddToast?.(message, 'success'),
    error: (message: string) => globalAddToast?.(message, 'error', 4000),
    info: (message: string) => globalAddToast?.(message, 'info'),
    warning: (message: string) => globalAddToast?.(message, 'warning'),
  }
);

/**
 * Single Toast component
 */
const ToastItem: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration);
    
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div className={`ferni-toast ferni-toast--${toast.type}`} role="status">
      {toast.message}
    </div>
  );
};

/**
 * Toaster - Container for toast notifications
 * 
 * Add to your app root:
 * ```tsx
 * <Toaster />
 * ```
 */
export const Toaster: React.FC<ToasterProps> = ({
  position = 'bottom',
  offset = 80,
  maxToasts = 3,
}) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'default', duration = 2500) => {
    const newToast: ToastData = {
      id: generateId(),
      message,
      type,
      duration,
    };
    
    setToasts((prev) => {
      const updated = [...prev, newToast];
      // Keep only maxToasts
      return updated.slice(-maxToasts);
    });
  }, [maxToasts]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Set global reference for imperative API
  useEffect(() => {
    globalAddToast = addToast;
    return () => {
      globalAddToast = null;
    };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      <div 
        className="ferni-toaster"
        style={{
          [position]: offset,
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
      
      <style>{`
        .ferni-toaster {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          z-index: 9999;
          pointer-events: none;
        }
        
        .ferni-toast {
          background: #2C2520;
          color: white;
          padding: 12px 24px;
          border-radius: 9999px;
          font-size: 0.9375rem;
          font-weight: 500;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          animation: ferni-toast-in 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
          pointer-events: auto;
        }
        
        .ferni-toast--success {
          background: #4a6741;
        }
        
        .ferni-toast--error {
          background: #a05454;
        }
        
        .ferni-toast--warning {
          background: #a08054;
        }
        
        .ferni-toast--info {
          background: #546080;
        }
        
        @keyframes ferni-toast-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .ferni-toast {
            animation: none;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
};

/**
 * Hook to use toast imperatively within React tree
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a Toaster');
  }
  return context;
};

// Re-export for named export
export { ToastItem as Toast };
