"use strict";(function(){"use strict";const c=typeof gsap<"u";function d(){const e=document.querySelectorAll("[data-parallax-layer]");if(!e.length)return;let t=!1;function a(){const r=window.scrollY,o=window.innerHeight;e.forEach(s=>{const v=parseFloat(s.dataset.parallaxLayer)||.1,b=s.dataset.parallaxDirection||"up",i=s.getBoundingClientRect();if(i.bottom<0||i.top>o)return;const l=r*v,x=b==="down"?l:-l;s.style.transform=`translate3d(0, ${x}px, 0)`})}window.addEventListener("scroll",()=>{t||(requestAnimationFrame(()=>{a(),t=!1}),t=!0)},{passive:!0})}function g(){if(!c||typeof ScrollTrigger>"u"){console.log("GSAP/ScrollTrigger not loaded, using fallback animations"),p();return}gsap.registerPlugin(ScrollTrigger),gsap.utils.toArray("[data-gsap-reveal]").forEach(e=>{const t=e.dataset.gsapReveal||"up",a=t==="up"?100:t==="down"?-100:0,r=t==="left"?-100:t==="right"?100:0;gsap.from(e,{y:a,x:r,opacity:0,duration:1.2,ease:"expo.out",scrollTrigger:{trigger:e,start:"top 80%",end:"bottom 20%",toggleActions:"play none none reverse"}})}),gsap.utils.toArray("[data-gsap-stagger]").forEach(e=>{const t=e.children,a=parseFloat(e.dataset.gsapStagger)||.1;gsap.from(t,{y:60,opacity:0,duration:.8,ease:"expo.out",stagger:a,scrollTrigger:{trigger:e,start:"top 75%"}})}),gsap.utils.toArray("[data-gsap-scale]").forEach(e=>{gsap.from(e,{scale:.8,opacity:0,duration:1,ease:"back.out(1.7)",scrollTrigger:{trigger:e,start:"top 80%"}})}),gsap.utils.toArray("[data-gsap-text]").forEach(e=>{const t=e.textContent.split("");e.innerHTML=t.map(a=>`<span class="gsap-char" style="display:inline-block">${a===" "?"&nbsp;":a}</span>`).join(""),gsap.from(e.querySelectorAll(".gsap-char"),{y:50,opacity:0,duration:.5,ease:"back.out(2)",stagger:.02,scrollTrigger:{trigger:e,start:"top 80%"}})}),gsap.utils.toArray("[data-gsap-pin]").forEach(e=>{ScrollTrigger.create({trigger:e,pin:!0,start:"top top",end:"+=100%",pinSpacing:!0})}),gsap.utils.toArray("[data-gsap-progress]").forEach(e=>{gsap.to(e,{x:"100%",ease:"none",scrollTrigger:{trigger:e.parentElement,start:"top bottom",end:"bottom top",scrub:1}})})}function p(){const e=new IntersectionObserver(a=>{a.forEach(r=>{r.isIntersecting&&(r.target.classList.add("animate-in"),e.unobserve(r.target))})},{threshold:.1,rootMargin:"0px 0px -50px 0px"});document.querySelectorAll("[data-gsap-reveal], [data-gsap-scale]").forEach(a=>{a.style.opacity="0",a.style.transform="translateY(40px)",a.style.transition="opacity 0.8s ease, transform 0.8s ease",e.observe(a)});const t=document.createElement("style");t.textContent=`
      .animate-in {
        opacity: 1 !important;
        transform: translateY(0) !important;
      }
    `,document.head.appendChild(t)}function u(){const e=document.createElement("div");e.className="page-transition-overlay",e.innerHTML=`
      <div class="transition-content">
        <div class="transition-logo"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
      </div>
    `,document.body.appendChild(e),document.querySelectorAll('a[href^="/"]').forEach(t=>{t.addEventListener("click",a=>{const r=t.getAttribute("href");r.startsWith("#")||r.startsWith("http")||(a.preventDefault(),e.classList.add("active"),setTimeout(()=>{window.location.href=r},500))})}),window.addEventListener("load",()=>{document.body.classList.add("page-loaded"),e.classList.remove("active")})}function m(){document.querySelectorAll("[data-skeleton]").forEach(e=>{const t=e.dataset.skeleton,a=f(t);e.appendChild(a);const r=new MutationObserver(o=>{o.forEach(s=>{s.addedNodes.length>0&&(a.remove(),r.disconnect())})});r.observe(e,{childList:!0})})}function f(e){const t=document.createElement("div");switch(t.className="skeleton-wrapper",e){case"card":t.innerHTML=`
          <div class="skeleton skeleton-image" style="height:200px;border-radius:1rem;margin-bottom:1rem;"></div>
          <div class="skeleton skeleton-text" style="width:60%;height:1.5rem;margin-bottom:0.5rem;"></div>
          <div class="skeleton skeleton-text" style="width:80%;height:1rem;margin-bottom:0.25rem;"></div>
          <div class="skeleton skeleton-text" style="width:70%;height:1rem;"></div>
        `;break;case"avatar":t.innerHTML=`
          <div class="skeleton" style="width:64px;height:64px;border-radius:50%;"></div>
        `;break;case"text":t.innerHTML=`
          <div class="skeleton skeleton-text" style="width:100%;height:1rem;margin-bottom:0.5rem;"></div>
          <div class="skeleton skeleton-text" style="width:80%;height:1rem;"></div>
        `;break;default:t.innerHTML='<div class="skeleton" style="width:100%;height:100%;"></div>'}return t}function y(){document.querySelectorAll('button, .btn, [role="button"]').forEach(e=>{e.addEventListener("mousedown",()=>{e.style.transform="scale(0.97)"}),e.addEventListener("mouseup",()=>{e.style.transform=""}),e.addEventListener("mouseleave",()=>{e.style.transform=""})}),document.querySelectorAll('a:not(.btn):not([class*="btn"])').forEach(e=>{if(e.querySelector("img")||e.querySelector("svg"))return;e.style.position="relative",e.style.display="inline-block";const t=document.createElement("span");t.style.cssText=`
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 1px;
        background: currentColor;
        transform: scaleX(0);
        transform-origin: right;
        transition: transform 0.3s ease;
      `,e.appendChild(t),e.addEventListener("mouseenter",()=>{t.style.transformOrigin="left",t.style.transform="scaleX(1)"}),e.addEventListener("mouseleave",()=>{t.style.transformOrigin="right",t.style.transform="scaleX(0)"})}),document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(e=>{e.addEventListener("change",()=>{e.style.transform="scale(1.2)",setTimeout(()=>{e.style.transform=""},150)})})}function h(){const e=document.createElement("style");e.textContent=`
      /* Page transition overlay */
      .page-transition-overlay {
        position: fixed;
        inset: 0;
        background: #faf8f5;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.4s ease, visibility 0.4s ease;
      }
      
      .page-transition-overlay.active {
        opacity: 1;
        visibility: visible;
      }
      
      .transition-logo {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #5a7751, #4a6741, #3d5a35);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-weight: bold;
        font-size: 1.5rem;
        animation: transitionPulse 1s ease-in-out infinite;
      }
      
      @keyframes transitionPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      
      /* Skeleton styles */
      .skeleton {
        background: linear-gradient(
          90deg,
          rgba(235, 230, 223, 1) 0%,
          rgba(245, 242, 237, 1) 50%,
          rgba(235, 230, 223, 1) 100%
        );
        background-size: 200% 100%;
        animation: skeletonShimmer 1.5s ease-in-out infinite;
        border-radius: 4px;
      }
      
      @keyframes skeletonShimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      
      /* Parallax layer will-change optimization */
      [data-parallax-layer] {
        will-change: transform;
      }
      
      /* GSAP char animation reset */
      .gsap-char {
        will-change: transform, opacity;
      }
    `,document.head.appendChild(e)}function n(){const e=window.matchMedia("(prefers-reduced-motion: reduce)").matches;h(),e||(d(),g(),u(),y()),m(),console.log("%c\u{1F3AC} Advanced motion loaded","color: #4a6741; font-weight: bold;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",n):n()})();
