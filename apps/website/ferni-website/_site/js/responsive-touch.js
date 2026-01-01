"use strict";(function(){"use strict";function v(){let e=0,t=0,i=0,o=0;const n=50;document.addEventListener("touchstart",a=>{e=a.changedTouches[0].screenX,t=a.changedTouches[0].screenY},{passive:!0}),document.addEventListener("touchend",a=>{i=a.changedTouches[0].screenX,o=a.changedTouches[0].screenY,s(a.target)},{passive:!0});function s(a){const d=i-e,c=o-t;if(Math.abs(d)>Math.abs(c)&&Math.abs(d)>n){const h=d>0?"right":"left";a.dispatchEvent(new CustomEvent("ferni:swipe",{bubbles:!0,detail:{direction:h,deltaX:d,deltaY:c}}));const l=a.closest("[data-swipe-carousel]");l&&(h==="left"?l.scrollBy({left:l.offsetWidth,behavior:"smooth"}):l.scrollBy({left:-l.offsetWidth,behavior:"smooth"}));const f=document.querySelector(".mobile-menu.open");f&&h==="right"&&(f.classList.remove("open"),document.querySelector(".mobile-menu-backdrop")?.classList.remove("open"))}}let r=0;document.addEventListener("touchend",a=>{const d=new Date().getTime(),c=d-r;c<300&&c>0&&a.target.dispatchEvent(new CustomEvent("ferni:doubletap",{bubbles:!0})),r=d},{passive:!0});let p;document.addEventListener("touchstart",a=>{p=setTimeout(()=>{a.target.dispatchEvent(new CustomEvent("ferni:longpress",{bubbles:!0}))},500)},{passive:!0}),document.addEventListener("touchend",()=>{clearTimeout(p)},{passive:!0}),document.addEventListener("touchmove",()=>{clearTimeout(p)},{passive:!0})}function g(){const e=document.querySelector("[data-pull-refresh]");if(!e)return;let t=0,i=0;const o=100,n=document.createElement("div");n.className="pull-refresh-indicator",n.innerHTML=`
      <div class="pull-spinner"></div>
      <span>Pull to refresh</span>
    `,e.insertBefore(n,e.firstChild),e.addEventListener("touchstart",s=>{window.scrollY===0&&(t=s.touches[0].pageY)},{passive:!0}),e.addEventListener("touchmove",s=>{if(t===0)return;i=s.touches[0].pageY;const r=i-t;r>0&&window.scrollY===0&&(n.style.transform=`translateY(${Math.min(r*.5,o)}px)`,n.style.opacity=Math.min(r/o,1),r>o&&(n.querySelector("span").textContent="Release to refresh"))},{passive:!0}),e.addEventListener("touchend",()=>{i-t>o?(n.querySelector("span").textContent="Refreshing...",n.classList.add("refreshing"),setTimeout(()=>{window.location.reload()},1e3)):(n.style.transform="",n.style.opacity="0"),t=0,i=0},{passive:!0})}function y(){let e=t();function t(){return window.innerWidth>window.innerHeight?"landscape":"portrait"}function i(){const o=t();o!==e&&(e=o,document.body.classList.remove("portrait","landscape"),document.body.classList.add(o),document.dispatchEvent(new CustomEvent("ferni:orientation",{detail:{orientation:o}})),document.querySelectorAll("[data-recalc-on-orientation]").forEach(n=>{n.style.height=`${window.innerHeight}px`}))}window.addEventListener("resize",u(i,100)),i()}function b(){document.documentElement.style.setProperty("--safe-area-inset-top","env(safe-area-inset-top, 0px)"),document.documentElement.style.setProperty("--safe-area-inset-bottom","env(safe-area-inset-bottom, 0px)"),document.documentElement.style.setProperty("--safe-area-inset-left","env(safe-area-inset-left, 0px)"),document.documentElement.style.setProperty("--safe-area-inset-right","env(safe-area-inset-right, 0px)");const e=document.createElement("style");e.textContent=`
      .safe-top { padding-top: var(--safe-area-inset-top); }
      .safe-bottom { padding-bottom: var(--safe-area-inset-bottom); }
      .safe-left { padding-left: var(--safe-area-inset-left); }
      .safe-right { padding-right: var(--safe-area-inset-right); }
      .safe-x { padding-left: var(--safe-area-inset-left); padding-right: var(--safe-area-inset-right); }
      .safe-y { padding-top: var(--safe-area-inset-top); padding-bottom: var(--safe-area-inset-bottom); }
      .safe-all { 
        padding: var(--safe-area-inset-top) var(--safe-area-inset-right) var(--safe-area-inset-bottom) var(--safe-area-inset-left);
      }
    `,document.head.appendChild(e)}function w(){function e(){const t=window.innerHeight*.01;document.documentElement.style.setProperty("--vh",`${t}px`)}e(),window.addEventListener("resize",u(e,100))}function E(){window.innerWidth>=768&&window.innerWidth<=1024&&(document.body.classList.add("is-tablet"),document.querySelectorAll('button, a, [role="button"]').forEach(t=>{const i=t.getBoundingClientRect();(i.height<44||i.width<44)&&(t.style.minHeight="44px",t.style.minWidth="44px")}))}function x(){if("ontouchstart"in window||navigator.maxTouchPoints>0){document.body.classList.add("touch-device");const t=document.createElement("style");t.textContent=`
        .touch-device *:hover {
          /* Reset hover styles on touch devices */
        }
        
        @media (hover: none) {
          .hover-only {
            display: none !important;
          }
        }
      `,document.head.appendChild(t)}}function T(){const e={sm:640,md:768,lg:1024,xl:1280,"2xl":1536};let t=i();function i(){const n=window.innerWidth;return n>=e["2xl"]?"2xl":n>=e.xl?"xl":n>=e.lg?"lg":n>=e.md?"md":n>=e.sm?"sm":"xs"}function o(){const n=i();if(n!==t){const s=t;t=n,document.dispatchEvent(new CustomEvent("ferni:breakpoint",{detail:{from:s,to:n,width:window.innerWidth}})),document.body.className=document.body.className.replace(/\bbp-\w+\b/g,"").trim()+` bp-${n}`}}window.addEventListener("resize",u(o,100)),o(),window.ferniBreakpoint=()=>t}function u(e,t){let i;return function(...o){clearTimeout(i),i=setTimeout(()=>e.apply(this,o),t)}}function L(){const e=document.createElement("style");e.textContent=`
      /* Full height using CSS variable */
      .h-screen-dynamic {
        height: calc(var(--vh, 1vh) * 100);
      }
      
      .min-h-screen-dynamic {
        min-height: calc(var(--vh, 1vh) * 100);
      }
      
      /* Pull to refresh indicator */
      .pull-refresh-indicator {
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%) translateY(-100%);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        opacity: 0;
        transition: transform 0.2s ease, opacity 0.2s ease;
      }
      
      .pull-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(74, 103, 65, 0.2);
        border-top-color: #4a6741;
        border-radius: 50%;
      }
      
      .pull-refresh-indicator.refreshing .pull-spinner {
        animation: spin 0.8s linear infinite;
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      /* Orientation-specific styles */
      .landscape .hide-landscape { display: none !important; }
      .portrait .hide-portrait { display: none !important; }
      
      /* Tablet optimizations */
      .is-tablet .tablet-grid-3 {
        grid-template-columns: repeat(3, 1fr);
      }
    `,document.head.appendChild(e)}function m(){L(),v(),g(),y(),b(),w(),E(),x(),T(),console.log("%c\u{1F4F1} Responsive & touch loaded","color: #4a6741; font-weight: bold;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",m):m()})();
