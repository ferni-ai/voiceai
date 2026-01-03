"use strict";(function(){"use strict";const a={timing:{pageReveal:400,orbDelay:400,orbDuration:600,eyebrowDelay:1e3,eyebrowDuration:400,headlineDelay:1400,headlineWordGap:100,subheadlineDelay:2200,subheadlineDuration:400,ctaDelay:2600,ctaDuration:500,secondaryDelay:3e3},easing:{spring:"cubic-bezier(0.34, 1.56, 0.64, 1)",smooth:"cubic-bezier(0.4, 0, 0.2, 1)",dramatic:"cubic-bezier(0.16, 1, 0.3, 1)"},respectsReducedMotion:window.matchMedia("(prefers-reduced-motion: reduce)").matches,skipIfReturning:!0},n={hasPlayed:!1,elements:{}};function h(){return n.elements={hero:document.querySelector(".hero"),orb:document.querySelector(".hero-ferni, .hero__orb, [data-hero-orb]"),eyebrow:document.querySelector(".hero__eyebrow"),headline:document.querySelector(".hero__headline"),subheadline:document.querySelector(".hero__subheadline"),cta:document.querySelector(".hero__cta"),secondary:document.querySelector(".hero__secondary"),nav:document.querySelector(".nav")},Object.values(n.elements).some(e=>e!==null)}function l(e,t){e&&Object.assign(e.style,t)}function c(e,t,r){if(!e||a.respectsReducedMotion){if(e&&t.length>0){const s=t[t.length-1];Object.keys(s).forEach(i=>{e.style[i]=s[i]})}return Promise.resolve()}return new Promise(s=>{const i=e.animate(t,{duration:r.duration||500,easing:r.easing||a.easing.smooth,fill:"forwards",...r});i.onfinish=s})}function o(e){return new Promise(t=>setTimeout(t,e))}async function m(){const{hero:e}=n.elements;if(!e)return;const t=document.createElement("div");t.className="hero-sequence-overlay",t.style.cssText=`
      position: fixed;
      inset: 0;
      background: var(--color-background, #faf8f5);
      z-index: 10000;
      pointer-events: none;
    `,document.body.appendChild(t),await c(t,[{opacity:1},{opacity:0}],{duration:a.timing.pageReveal,easing:a.easing.smooth}),t.remove()}async function f(){const{orb:e}=n.elements;e&&(l(e,{opacity:"0",transform:"scale(0.8) translateY(20px)"}),await o(a.timing.orbDelay),await c(e,[{opacity:0,transform:"scale(0.8) translateY(20px)",filter:"blur(10px)"},{opacity:1,transform:"scale(1.02) translateY(-5px)",filter:"blur(0px)",offset:.7},{opacity:1,transform:"scale(1) translateY(0)",filter:"blur(0px)"}],{duration:a.timing.orbDuration,easing:a.easing.spring}),e.animate([{boxShadow:"0 0 40px rgba(74, 103, 65, 0.3)"},{boxShadow:"0 0 60px rgba(74, 103, 65, 0.5)"},{boxShadow:"0 0 40px rgba(74, 103, 65, 0.3)"}],{duration:2e3,easing:"ease-in-out",iterations:2}))}async function p(){const{eyebrow:e}=n.elements;if(!e)return;const t=e.textContent;l(e,{opacity:"0"}),await o(a.timing.eyebrowDelay),await c(e,[{opacity:0,transform:"translateY(10px)"},{opacity:1,transform:"translateY(0)"}],{duration:a.timing.eyebrowDuration,easing:a.easing.smooth})}async function g(){const{headline:e}=n.elements;if(!e)return;const r=e.textContent.split(" ");e.innerHTML=r.map(i=>`<span class="hero-word" style="opacity: 0; display: inline-block; transform: translateY(20px);">${i}</span>`).join(" "),e.style.opacity="1",await o(a.timing.headlineDelay);const s=e.querySelectorAll(".hero-word");for(let i=0;i<s.length;i++)c(s[i],[{opacity:0,transform:"translateY(20px)"},{opacity:1,transform:"translateY(0)"}],{duration:300,easing:a.easing.spring}),await o(a.timing.headlineWordGap)}async function b(){const{subheadline:e}=n.elements;e&&(l(e,{opacity:"0",transform:"translateY(15px)"}),await o(a.timing.subheadlineDelay),await c(e,[{opacity:0,transform:"translateY(15px)"},{opacity:1,transform:"translateY(0)"}],{duration:a.timing.subheadlineDuration,easing:a.easing.smooth}))}async function w(){const{cta:e}=n.elements;if(!e)return;const t=e.querySelectorAll(".btn, button, a");l(e,{opacity:"0"}),t.forEach(r=>{l(r,{opacity:"0",transform:"scale(0.9) translateY(10px)"})}),await o(a.timing.ctaDelay),e.style.opacity="1";for(let r=0;r<t.length;r++)c(t[r],[{opacity:0,transform:"scale(0.9) translateY(10px)"},{opacity:1,transform:"scale(1.02) translateY(-2px)",offset:.7},{opacity:1,transform:"scale(1) translateY(0)"}],{duration:a.timing.ctaDuration,easing:a.easing.spring}),await o(100)}async function _(){const{secondary:e,nav:t}=n.elements;e&&(l(e,{opacity:"0"}),await o(a.timing.secondaryDelay),await c(e,[{opacity:0},{opacity:1}],{duration:400,easing:a.easing.smooth})),t&&(t.style.opacity="1")}async function q(){if(!n.hasPlayed){if(a.respectsReducedMotion){d();return}if(a.skipIfReturning&&sessionStorage.getItem("ferni_hero_played")){d();return}n.hasPlayed=!0,sessionStorage.setItem("ferni_hero_played","true");try{await m(),f(),await o(200),p(),await o(200),g(),await o(400),b(),await o(200),w(),await o(200),_()}catch(e){console.error("[Hero Sequence] Animation error:",e),d()}}}function d(){const{orb:e,eyebrow:t,headline:r,subheadline:s,cta:i,secondary:S,nav:D}=n.elements;[e,t,r,s,i,S,D].forEach(u=>{u&&(u.style.opacity="1",u.style.transform="none")})}function x(){if(document.getElementById("hero-sequence-styles"))return;const e=document.createElement("style");e.id="hero-sequence-styles",e.textContent=`
      /* Hero sequence animation preparation */
      .hero-sequence-ready .hero-ferni,
      .hero-sequence-ready .hero__orb,
      .hero-sequence-ready [data-hero-orb],
      .hero-sequence-ready .hero__eyebrow,
      .hero-sequence-ready .hero__headline,
      .hero-sequence-ready .hero__subheadline,
      .hero-sequence-ready .hero__cta,
      .hero-sequence-ready .hero__secondary {
        opacity: 0;
      }
      
      /* Word-by-word headline animation */
      .hero-word {
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      
      /* Reduced motion - show everything immediately */
      @media (prefers-reduced-motion: reduce) {
        .hero-sequence-ready .hero-ferni,
        .hero-sequence-ready .hero__orb,
        .hero-sequence-ready [data-hero-orb],
        .hero-sequence-ready .hero__eyebrow,
        .hero-sequence-ready .hero__headline,
        .hero-sequence-ready .hero__subheadline,
        .hero-sequence-ready .hero__cta,
        .hero-sequence-ready .hero__secondary {
          opacity: 1 !important;
          transform: none !important;
        }
      }
    `,document.head.appendChild(e)}function y(){if(x(),!h()){console.log("[Hero Sequence] Hero elements not found, skipping");return}n.elements.hero&&n.elements.hero.classList.add("hero-sequence-ready"),requestAnimationFrame(()=>{setTimeout(q,50)}),console.log("%c\u2728 Hero Sequence loaded","color: #4a6741; font-weight: bold;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",y):y(),window.HeroSequence={replay:()=>{sessionStorage.removeItem("ferni_hero_played"),n.hasPlayed=!1,location.reload()},state:()=>({...n})}})();
