"use strict";(function(){"use strict";function c(){const e=document.querySelector("[data-skip-link]");e&&e.addEventListener("click",t=>{t.preventDefault();const n=e.getAttribute("href").substring(1),o=document.getElementById(n);o&&(o.setAttribute("tabindex","-1"),o.focus(),o.scrollIntoView({behavior:"smooth",block:"start"}))})}function s(e){const t=e.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),n=t[0],o=t[t.length-1];function i(r){r.key==="Tab"&&(r.shiftKey?document.activeElement===n&&(r.preventDefault(),o.focus()):document.activeElement===o&&(r.preventDefault(),n.focus()))}return e.addEventListener("keydown",i),{activate:()=>n?.focus(),deactivate:()=>e.removeEventListener("keydown",i)}}window.ferniFocusTrap=s;function d(){document.querySelectorAll("[data-card-group]").forEach(t=>{const n=t.querySelectorAll("[data-card]");let o=0;t.addEventListener("keydown",i=>{["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(i.key)&&(i.preventDefault(),i.key==="ArrowRight"||i.key==="ArrowDown"?o=(o+1)%n.length:o=(o-1+n.length)%n.length,n[o].focus())})}),document.addEventListener("keydown",t=>{if(t.key==="Escape"){const n=document.querySelector("[data-mobile-menu].open");n&&(n.classList.remove("open"),document.querySelector("[data-mobile-menu-btn]")?.focus());const o=document.querySelector("[data-modal].open");o&&o.classList.remove("open")}})}function u(){const e=document.createElement("div");return e.setAttribute("role","status"),e.setAttribute("aria-live","polite"),e.setAttribute("aria-atomic","true"),e.className="sr-only",e.id="ferni-announcer",document.body.appendChild(e),{announce:t=>{e.textContent="",setTimeout(()=>{e.textContent=t},100)}}}const l=u();window.ferniAnnounce=l.announce;function m(){const e=document.querySelector("[data-contrast-toggle]");if(!e)return;localStorage.getItem("ferni-high-contrast")==="true"&&document.documentElement.classList.add("high-contrast"),e.addEventListener("click",()=>{const n=document.documentElement.classList.toggle("high-contrast");localStorage.setItem("ferni-high-contrast",n),window.ferniAnnounce?.(n?"High contrast mode enabled":"High contrast mode disabled")})}function f(){const e=window.matchMedia("(prefers-reduced-motion: reduce)");function t(n){document.documentElement.classList.toggle("reduce-motion",n.matches)}t(e),e.addEventListener("change",t)}function g(){let e=!1;document.addEventListener("keydown",t=>{t.key==="Tab"&&(e=!0,document.body.classList.add("using-keyboard"))}),document.addEventListener("mousedown",()=>{e=!1,document.body.classList.remove("using-keyboard")})}function h(){const e=document.createElement("style");e.textContent=`
      /* Screen reader only */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      
      /* Focus visible when using keyboard */
      .using-keyboard *:focus {
        outline: 3px solid #4a6741;
        outline-offset: 3px;
      }
      
      /* High contrast mode */
      .high-contrast {
        --color-paper: #ffffff;
        --color-ink: #000000;
        --color-ferni: #2d5a25;
      }
      
      .high-contrast a,
      .high-contrast button {
        text-decoration: underline;
      }
      
      .high-contrast .glass,
      .high-contrast .glass-subtle {
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid #000000;
      }
      
      /* Reduced motion */
      .reduce-motion * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
      
      /* Skip link */
      [data-skip-link] {
        position: absolute;
        top: -100%;
        left: 50%;
        transform: translateX(-50%);
        padding: 1rem 2rem;
        background: #4a6741;
        color: white;
        border-radius: 0 0 0.5rem 0.5rem;
        z-index: 9999;
        transition: top 0.3s ease;
      }
      
      [data-skip-link]:focus {
        top: 0;
      }
    `,document.head.appendChild(e)}function a(){h(),c(),d(),m(),f(),g(),console.log("%c\u267F Accessibility features loaded","color: #4a6741; font-weight: bold;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",a):a()})();
