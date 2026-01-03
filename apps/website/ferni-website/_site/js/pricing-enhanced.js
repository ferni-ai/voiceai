"use strict";(function(){"use strict";function d(){const t=document.querySelector("[data-pricing-toggle]");if(!t)return;const n=document.querySelectorAll("[data-price-monthly]"),a=document.querySelectorAll("[data-price-yearly]"),e=document.querySelectorAll("[data-savings]");let o=!1;t.addEventListener("click",()=>{o=!o,t.classList.toggle("yearly",o),n.forEach(r=>{p(r,o)}),a.forEach(r=>{r.style.display=o?"":"none"}),e.forEach(r=>{r.style.opacity=o?"1":"0",r.style.transform=o?"scale(1)":"scale(0.8)"}),window.ferniAnnounce&&window.ferniAnnounce(o?"Showing yearly prices with savings":"Showing monthly prices")})}function p(t,n){const a=parseFloat(t.dataset.priceMonthly),e=a*10,o=n?a:e/12,r=n?e/12:a;t.style.transform="scale(0.9)",t.style.opacity="0.5",setTimeout(()=>{u(t,o,r,300),t.style.transform="scale(1)",t.style.opacity="1"},150)}function u(t,n,a,e){const o=performance.now(),r=t.dataset.pricePrefix||"$";function i(s){const x=s-o,c=Math.min(x/e,1),w=1-Math.pow(1-c,3),v=n+(a-n)*w;t.textContent=r+v.toFixed(2),c<1&&requestAnimationFrame(i)}requestAnimationFrame(i)}function g(){const t=document.querySelector("[data-pricing-recommended]");if(!t)return;const n=document.createElement("div");n.className="pricing-glow",n.style.cssText=`
      position: absolute;
      inset: -2px;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(74, 103, 65, 0.3),
        transparent
      );
      border-radius: inherit;
      z-index: -1;
      animation: glowMove 3s ease-in-out infinite;
    `,t.style.position="relative",t.appendChild(n),t.addEventListener("mousemove",a=>{const e=t.getBoundingClientRect(),o=a.clientX-e.left,r=a.clientY-e.top;n.style.background=`
        radial-gradient(
          circle at ${o}px ${r}px,
          rgba(74, 103, 65, 0.4) 0%,
          transparent 50%
        )
      `}),t.addEventListener("mouseleave",()=>{n.style.background=`
        linear-gradient(
          90deg,
          transparent,
          rgba(74, 103, 65, 0.3),
          transparent
        )
      `})}function m(){document.querySelectorAll("[data-feature-list]").forEach(n=>{const a=n.querySelectorAll("li"),e=parseInt(n.dataset.featureList)||4;if(a.length<=e)return;a.forEach((i,s)=>{s>=e&&(i.style.display="none",i.dataset.hidden="true")});const o=document.createElement("button");o.className="feature-toggle",o.innerHTML=`
        <span>Show ${a.length-e} more</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      `,o.style.cssText=`
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: none;
        border: none;
        color: #4a6741;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        padding: 0.5rem 0;
        margin-top: 0.5rem;
        transition: color 0.3s ease;
      `;let r=!1;o.addEventListener("click",()=>{r=!r,a.forEach((i,s)=>{s>=e&&(r?(i.style.display="",i.style.animation="featureSlideIn 0.3s ease forwards",i.style.animationDelay=`${(s-e)*.05}s`):(i.style.animation="featureSlideOut 0.2s ease forwards",setTimeout(()=>{i.style.display="none"},200)))}),o.innerHTML=r?'<span>Show less</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;transform:rotate(180deg);"><path d="M6 9l6 6 6-6"/></svg>':`<span>Show ${a.length-e} more</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M6 9l6 6 6-6"/></svg>`}),n.parentNode.appendChild(o)})}function f(){document.querySelectorAll("[data-pricing-card]").forEach(n=>{const a=n.querySelectorAll("[data-feature]");n.addEventListener("mouseenter",()=>{a.forEach(e=>{e.dataset.unique==="true"&&(e.style.background="rgba(74, 103, 65, 0.1)",e.style.borderRadius="0.5rem",e.style.padding="0.25rem 0.5rem",e.style.margin="-0.25rem -0.5rem")})}),n.addEventListener("mouseleave",()=>{a.forEach(e=>{e.style.background="",e.style.padding="",e.style.margin=""})})})}function y(){document.querySelectorAll("[data-upgrade-btn]").forEach(n=>{n.addEventListener("click",a=>{if(window.ferniConfetti){const e=n.getBoundingClientRect(),o=document.createElement("div");o.style.cssText=`
            position: fixed;
            left: ${e.left+e.width/2}px;
            top: ${e.top}px;
            pointer-events: none;
            z-index: 9999;
          `,document.body.appendChild(o),window.ferniConfetti(o,25),setTimeout(()=>o.remove(),2e3)}n.style.transform="scale(1.05)",setTimeout(()=>{n.style.transform=""},200)})})}function h(){const t=document.createElement("style");t.textContent=`
      /* Pricing toggle */
      [data-pricing-toggle] {
        position: relative;
        width: 200px;
        height: 44px;
        background: rgba(74, 103, 65, 0.1);
        border-radius: 22px;
        cursor: pointer;
        border: none;
        padding: 4px;
      }
      
      [data-pricing-toggle]::before {
        content: '';
        position: absolute;
        left: 4px;
        top: 4px;
        width: calc(50% - 4px);
        height: calc(100% - 8px);
        background: #4a6741;
        border-radius: 18px;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      [data-pricing-toggle].yearly::before {
        transform: translateX(100%);
      }
      
      /* Glow animation */
      @keyframes glowMove {
        0%, 100% { opacity: 0.5; transform: translateX(-100%); }
        50% { opacity: 1; transform: translateX(100%); }
      }
      
      /* Feature animations */
      @keyframes featureSlideIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes featureSlideOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-10px); }
      }
      
      /* Savings badge */
      [data-savings] {
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
    `,document.head.appendChild(t)}function l(){h(),d(),g(),m(),f(),y(),console.log("%c\u{1F4B0} Enhanced pricing loaded","color: #4a6741; font-weight: bold;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",l):l()})();
