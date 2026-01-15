import{a as s,j as n}from"./index-DZPSA8Wk.js";const h=s.forwardRef(function({children:u,variant:f="default",size:d="md",icon:o,iconRight:i,loading:t=!1,haptic:a=!0,disabled:e,onClick:r,className:b="",style:l,...c},p){const m=s.useCallback(g=>{e||t||(a&&"vibrate"in navigator&&navigator.vibrate(10),r==null||r(g))},[e,t,a,r]),x=["ferni-button",`ferni-button--${f}`,`ferni-button--${d}`,t&&"ferni-button--loading",e&&"ferni-button--disabled",b].filter(Boolean).join(" ");return n.jsxs(n.Fragment,{children:[n.jsx("button",{ref:p,className:x,disabled:e||t,onClick:m,style:l,...c,children:t?n.jsx("span",{className:"ferni-button__spinner","aria-hidden":"true"}):n.jsxs(n.Fragment,{children:[o&&n.jsx("span",{className:"ferni-button__icon",children:o}),n.jsx("span",{className:"ferni-button__text",children:u}),i&&n.jsx("span",{className:"ferni-button__icon ferni-button__icon--right",children:i})]})}),n.jsx("style",{children:`
        .ferni-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
          border-radius: 9999px;
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
          transition: all 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        
        .ferni-button:focus-visible {
          outline: 2px solid #4a6741;
          outline-offset: 2px;
        }
        
        .ferni-button:active:not(:disabled) {
          transform: scale(0.97);
        }
        
        /* Sizes */
        .ferni-button--sm {
          padding: 8px 16px;
          font-size: 0.875rem;
        }
        
        .ferni-button--md {
          padding: 12px 24px;
          font-size: 1rem;
        }
        
        .ferni-button--lg {
          padding: 16px 32px;
          font-size: 1.125rem;
        }
        
        /* Variants */
        .ferni-button--default {
          background: #f5f3f0;
          color: #2C2520;
        }
        
        .ferni-button--default:hover:not(:disabled) {
          background: #eae7e3;
        }
        
        .ferni-button--primary {
          background: #4a6741;
          color: white;
        }
        
        .ferni-button--primary:hover:not(:disabled) {
          background: #3d5a35;
        }
        
        .ferni-button--secondary {
          background: white;
          color: #2C2520;
          border: 1px solid rgba(44, 37, 32, 0.1);
        }
        
        .ferni-button--secondary:hover:not(:disabled) {
          border-color: #4a6741;
        }
        
        .ferni-button--ghost {
          background: transparent;
          color: #2C2520;
        }
        
        .ferni-button--ghost:hover:not(:disabled) {
          background: rgba(44, 37, 32, 0.05);
        }
        
        /* States */
        .ferni-button--disabled,
        .ferni-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .ferni-button--loading {
          cursor: wait;
        }
        
        /* Icon */
        .ferni-button__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1em;
          height: 1em;
        }
        
        /* Spinner */
        .ferni-button__spinner {
          width: 1em;
          height: 1em;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: ferni-spin 0.6s linear infinite;
        }
        
        @keyframes ferni-spin {
          to { transform: rotate(360deg); }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .ferni-button {
            transition: none;
          }
          .ferni-button__spinner {
            animation: none;
          }
        }
      `})]})});h.displayName="Button";export{h as B};
