"use strict";(function(){"use strict";const a={STANDARD:"cubic-bezier(0.4, 0, 0.2, 1)",SPRING:"cubic-bezier(0.34, 1.56, 0.64, 1)",SPRING_GENTLE:"cubic-bezier(0.25, 1.2, 0.5, 1)",GENTLE:"cubic-bezier(0.25, 0.1, 0.25, 1)",ANTICIPATE:"cubic-bezier(0.38, -0.4, 0.88, 0.65)",EXPO_OUT:"cubic-bezier(0.16, 1, 0.3, 1)",SMOOTH:"cubic-bezier(0.45, 0, 0.55, 1)"},n={MICRO:50,FAST:100,NORMAL:200,SLOW:300,MODERATE:400,DELIBERATE:500,DRAMATIC:600,CELEBRATION:800,CINEMATIC:1200,GLACIAL:2e3};class E{constructor(){this.revealed=new Set,this.init()}init(){this.prefersReducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches,this.setupObservers(),this.addStyles()}addStyles(){const e=document.createElement("style");e.textContent=`
      /* Stagger timing for reveal children */
      .js-animate .reveal-stagger.is-visible > *:nth-child(1) { transition-delay: 0ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(2) { transition-delay: 80ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(3) { transition-delay: 160ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(4) { transition-delay: 240ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(5) { transition-delay: 320ms; }
      .js-animate .reveal-stagger.is-visible > *:nth-child(6) { transition-delay: 400ms; }
    `,document.head.appendChild(e)}setupObservers(){const e={root:null,rootMargin:"0px 0px -80px 0px",threshold:.1},t=new IntersectionObserver(s=>{s.forEach(o=>{o.isIntersecting&&!this.revealed.has(o.target)&&(this.reveal(o.target),this.revealed.add(o.target))})},e);document.querySelectorAll(".reveal, .reveal-stagger").forEach(s=>{t.observe(s)}),[".memory-demo__moment",".story",".proof-table__row",".journey__stage",".journey__note"].forEach(s=>{document.querySelectorAll(s).forEach(o=>{t.observe(o)})})}reveal(e){if(this.prefersReducedMotion){e.classList.add("is-visible");return}requestAnimationFrame(()=>{e.classList.add("is-visible")})}}class u{constructor(){this.revealed=new Set,this.prefersReducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches,this.init()}init(){this.addStyles(),this.setupObservers()}addStyles(){const e=document.createElement("style");e.id="memory-demo-animations",e.textContent=`
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         MEMORY DEMO KEYFRAMES
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      @keyframes memory-float {
        0%, 100% {
          transform: translateY(0) rotate(0deg);
        }
        25% {
          transform: translateY(-4px) rotate(0.3deg);
        }
        50% {
          transform: translateY(-6px) rotate(-0.2deg);
        }
        75% {
          transform: translateY(-3px) rotate(0.2deg);
        }
      }
      
      @keyframes memory-glow-pulse {
        0%, 100% {
          box-shadow: 
            0 8px 32px rgba(74, 103, 65, 0.25),
            0 2px 8px rgba(74, 103, 65, 0.15),
            0 0 0 0 rgba(74, 103, 65, 0);
        }
        50% {
          box-shadow: 
            0 12px 40px rgba(74, 103, 65, 0.35),
            0 4px 12px rgba(74, 103, 65, 0.2),
            0 0 30px 5px rgba(74, 103, 65, 0.15);
        }
      }
      
      @keyframes avatar-presence-pulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.3);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 0 20px 3px rgba(255, 255, 255, 0.2);
        }
      }
      
      @keyframes timeline-line-grow {
        from {
          transform: scaleY(0);
          transform-origin: top;
        }
        to {
          transform: scaleY(1);
          transform-origin: top;
        }
      }
      
      @keyframes typewriter-cursor {
        0%, 100% { border-color: transparent; }
        50% { border-color: rgba(255, 255, 255, 0.8); }
      }
      
      /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
         FERNI CARD EXPRESSIVE STATES
         \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
      
      .memory-demo__card--ferni.is-visible {
        animation: memory-float 6s ${a.SMOOTH} infinite;
      }
      
      .memory-demo__card--ferni.is-visible.is-glowing {
        animation: memory-float 6s ${a.SMOOTH} infinite,
                   memory-glow-pulse 3s ${a.SMOOTH} infinite;
      }
      
      .memory-demo__card--ferni .memory-demo__avatar {
        transition: transform 0.3s ${a.SPRING}, box-shadow 0.3s ease;
      }
      
      .memory-demo__card--ferni.is-visible .memory-demo__avatar {
        animation: avatar-presence-pulse 4s ${a.SMOOTH} infinite;
      }
      
      /* Timeline line animation */
      .memory-demo__line.is-animating {
        animation: timeline-line-grow 1.5s ${a.EXPO_OUT} forwards;
      }
      
      /* Typewriter effect for Ferni's text */
      .memory-demo__text--typewriter {
        overflow: hidden;
        border-right: 2px solid transparent;
        white-space: normal;
      }
      
      .memory-demo__text--typewriter.is-typing {
        animation: typewriter-cursor 1s step-end infinite;
      }
      
      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .memory-demo__card--ferni.is-visible,
        .memory-demo__card--ferni.is-visible.is-glowing,
        .memory-demo__card--ferni.is-visible .memory-demo__avatar,
        .memory-demo__line.is-animating {
          animation: none;
        }
        
        .memory-demo__moment,
        .memory-demo__insights,
        .memory-demo__insights-list li {
          opacity: 1;
          transform: none;
          transition: none;
        }
      }
    `,document.head.appendChild(e)}setupObservers(){const e=new IntersectionObserver(i=>{i.forEach(c=>{c.isIntersecting&&!this.revealed.has("section")&&(this.revealed.add("section"),this.animateSection())})},{threshold:.2}),t=document.querySelector(".memory-demo");t&&e.observe(t);const r=new IntersectionObserver(i=>{i.forEach(c=>{c.isIntersecting&&!this.revealed.has(c.target)&&(this.revealed.add(c.target),this.revealMoment(c.target))})},{threshold:.3,rootMargin:"0px 0px -50px 0px"});document.querySelectorAll(".memory-demo__moment").forEach((i,c)=>{i.dataset.index=c,r.observe(i)});const s=new IntersectionObserver(i=>{i.forEach(c=>{c.isIntersecting&&!this.revealed.has("insights")&&(this.revealed.add("insights"),this.revealInsights(c.target))})},{threshold:.2}),o=document.querySelector(".memory-demo__insights");o&&s.observe(o)}animateSection(){const e=document.querySelector(".memory-demo__line");e&&!this.prefersReducedMotion&&e.classList.add("is-animating")}revealMoment(e){const t=parseInt(e.dataset.index||0,10),r=this.prefersReducedMotion?0:t*150;setTimeout(()=>{e.classList.add("is-visible"),e.classList.contains("memory-demo__moment--today")&&this.revealFerniCard(e)},r)}revealFerniCard(e){const t=e.querySelector(".memory-demo__card--ferni");t&&setTimeout(()=>{this.prefersReducedMotion||t.classList.add("is-glowing");const r=t.querySelector(".memory-demo__text");r&&!this.prefersReducedMotion&&this.typewriterEffect(r)},400)}typewriterEffect(e){const t=e.textContent;e.textContent="",e.classList.add("memory-demo__text--typewriter","is-typing");let r=0;const s=25,o=()=>{r<t.length?(e.textContent+=t.charAt(r),r++,setTimeout(o,s)):e.classList.remove("is-typing")};o()}revealInsights(e){if(this.prefersReducedMotion){e.classList.add("is-visible"),e.querySelectorAll("li").forEach(r=>r.classList.add("is-visible"));return}e.classList.add("is-visible"),e.querySelectorAll(".memory-demo__insights-list li").forEach((r,s)=>{setTimeout(()=>{r.classList.add("is-visible")},200+s*120)})}}class f{constructor(){this.avatars=[],this.init()}init(){this.addStyles(),document.querySelectorAll(".persona-avatar__orb, .team-card .persona-avatar").forEach(e=>{this.startBreathing(e)})}addStyles(){const e=document.createElement("style");e.textContent=`
      @keyframes avatar-breathe {
        0%, 100% {
          transform: scale3d(1, 1, 1) translateY(0);
        }
        40% {
          transform: scale3d(0.994, 1.012, 1) translateY(-1px);
        }
        50% {
          transform: scale3d(0.994, 1.012, 1) translateY(-1px);
        }
        90% {
          transform: scale3d(1, 1, 1) translateY(0);
        }
      }
      
      .persona-avatar--breathing .persona-avatar__orb {
        animation: avatar-breathe 5s ${a.SMOOTH} infinite;
      }
      
      /* Glowing ring pulse */
      @keyframes ring-pulse {
        0%, 100% {
          opacity: 0.15;
          transform: scale(1);
        }
        50% {
          opacity: 0.25;
          transform: scale(1.02);
        }
      }
      
      .persona-avatar--breathing .persona-avatar__ring {
        animation: ring-pulse 4s ${a.SMOOTH} infinite;
      }
      
      /* Hover state - excited breathing */
      .persona-avatar:hover .persona-avatar__orb {
        animation: avatar-breathe 2s ${a.SPRING_GENTLE} infinite;
      }
      
      @media (prefers-reduced-motion: reduce) {
        .persona-avatar--breathing .persona-avatar__orb,
        .persona-avatar--breathing .persona-avatar__ring,
        .persona-avatar:hover .persona-avatar__orb {
          animation: none;
        }
      }
    `,document.head.appendChild(e)}startBreathing(e){const t=e.closest(".persona-avatar");t&&t.classList.add("persona-avatar--breathing")}}class p{constructor(){this.counted=new Set,this.init()}init(){const e=new IntersectionObserver(t=>{t.forEach(r=>{r.isIntersecting&&!this.counted.has(r.target)&&(this.countUp(r.target),this.counted.add(r.target))})},{threshold:.5});document.querySelectorAll(".stat__value").forEach(t=>{e.observe(t)})}countUp(e){const t=e.textContent.trim(),r=t.includes("K"),s=t.includes("+"),o=t.match(/[\d.]+/);if(!o)return;const i=parseFloat(o[0]),c=n.CINEMATIC,x=performance.now();if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const l=S=>{const w=S-x,h=Math.min(w/c,1),O=1-Math.pow(1-h,3);let m=(i*O).toFixed((r&&i<100,0));if(r&&(m+="K"),s&&(m+="+"),t.includes("\u221E")){e.textContent="\u221E";return}t.includes("<")&&(m="<"+m),e.textContent=m,h<1?requestAnimationFrame(l):e.textContent=t};e.textContent="0",requestAnimationFrame(l)}}class v{constructor(){this.hero=document.querySelector(".hero"),this.hero&&this.init()}init(){window.matchMedia("(prefers-reduced-motion: reduce)").matches||(this.addStyles(),this.setupParallax())}addStyles(){const e=document.createElement("style");e.textContent=`
      .hero {
        --parallax-y: 0;
      }
      
      .hero__content {
        transform: translateY(calc(var(--parallax-y) * 0.3));
        transition: transform 0.1s linear;
      }
      
      .hero__bg-orbs {
        transform: translateY(calc(var(--parallax-y) * -0.1));
      }
      
      .scroll-indicator {
        opacity: calc(1 - var(--parallax-y) / 100);
      }
    `,document.head.appendChild(e)}setupParallax(){let e=!1;window.addEventListener("scroll",()=>{e||(requestAnimationFrame(()=>{const t=window.scrollY,r=this.hero.offsetHeight,s=Math.min(t/r,1);this.hero.style.setProperty("--parallax-y",t*.15),e=!1}),e=!0)})}}class y{constructor(){this.init()}init(){this.addStyles()}addStyles(){const e=document.createElement("style");e.textContent=`
      /* Button hover lift */
      .btn {
        transition: transform ${n.NORMAL}ms ${a.EXPO_OUT},
                    box-shadow ${n.NORMAL}ms ${a.EXPO_OUT},
                    background-color ${n.NORMAL}ms ${a.STANDARD};
      }
      
      .btn:hover {
        transform: translateY(-2px);
      }
      
      /* Primary button glow on hover */
      .btn--primary:hover {
        box-shadow: 0 8px 30px rgba(74, 103, 65, 0.25);
      }
      
      /* Press state - squash */
      .btn:active {
        transform: scale(0.98) translateY(0);
        transition-duration: ${n.FAST}ms;
      }
      
      /* Icon arrow animation */
      .btn svg {
        transition: transform ${n.SLOW}ms ${a.SPRING};
      }
      
      .btn:hover svg {
        transform: translateX(4px);
      }
      
      @media (prefers-reduced-motion: reduce) {
        .btn,
        .btn:hover,
        .btn:active,
        .btn svg {
          transform: none;
          transition: none;
        }
      }
    `,document.head.appendChild(e)}}class g{constructor(){this.init()}init(){this.addStyles()}addStyles(){const e=document.createElement("style");e.textContent=`
      /* Team card hover */
      .team-card {
        transition: transform ${n.SLOW}ms ${a.EXPO_OUT},
                    box-shadow ${n.SLOW}ms ${a.EXPO_OUT};
      }
      
      .team-card:hover {
        transform: translateY(-8px);
        box-shadow: 0 20px 40px rgba(44, 37, 32, 0.1);
      }
      
      /* Persona glow on hover */
      .team-card:hover .persona-avatar {
        --glow-intensity: 0.3;
      }
      
      .persona-avatar::after {
        content: '';
        position: absolute;
        inset: -8px;
        border-radius: 50%;
        background: radial-gradient(circle, var(--persona-glow, rgba(74, 103, 65, 0.2)) 0%, transparent 70%);
        opacity: 0;
        transition: opacity ${n.SLOW}ms ${a.EXPO_OUT};
        pointer-events: none;
      }
      
      .team-card:hover .persona-avatar::after {
        opacity: 1;
      }
      
      /* Feature card hover */
      .feature:hover {
        transform: translateY(-4px);
      }
      
      /* Use case card */
      .use-case {
        transition: transform ${n.SLOW}ms ${a.EXPO_OUT},
                    box-shadow ${n.SLOW}ms ${a.EXPO_OUT};
      }
      
      .use-case:hover {
        transform: translateY(-4px);
        box-shadow: 0 12px 32px rgba(44, 37, 32, 0.08);
      }
      
      @media (prefers-reduced-motion: reduce) {
        .team-card:hover,
        .feature:hover,
        .use-case:hover {
          transform: none;
        }
      }
    `,document.head.appendChild(e)}}class b{constructor(){this.init()}init(){this.addStyles(),this.setupAccordions()}addStyles(){const e=document.createElement("style");e.textContent=`
      .faq-item summary {
        transition: color ${n.NORMAL}ms ${a.STANDARD};
      }
      
      .faq-item[open] summary {
        color: var(--color-ferni-green);
      }
      
      .faq-item__answer {
        animation: faq-expand ${n.MODERATE}ms ${a.EXPO_OUT};
      }
      
      @keyframes faq-expand {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      /* Chevron rotation */
      .faq-item summary::after {
        transition: transform ${n.SLOW}ms ${a.SPRING};
      }
      
      .faq-item[open] summary::after {
        transform: rotate(180deg);
      }
    `,document.head.appendChild(e)}setupAccordions(){document.querySelectorAll(".faq-item").forEach(e=>{e.addEventListener("toggle",t=>{e.open&&document.querySelectorAll(".faq-item[open]").forEach(r=>{r!==e&&r.removeAttribute("open")})})})}}class _{constructor(){this.init()}init(){document.querySelectorAll('a[href^="#"]').forEach(e=>{e.addEventListener("click",t=>{const r=e.getAttribute("href");if(r==="#")return;const s=document.querySelector(r);if(s){t.preventDefault();const o=document.querySelector(".nav")?.offsetHeight||0,i=s.getBoundingClientRect().top+window.scrollY-o-20;window.scrollTo({top:i,behavior:"smooth"}),document.getElementById("mobileMenu")?.classList.remove("is-open")}})})}}document.addEventListener("DOMContentLoaded",()=>{window.matchMedia("(prefers-reduced-motion: reduce)").matches&&console.log("[Ferni Animations] Reduced motion preferred, animations minimized"),new u,new f,new p,new v,new y,new g,new b,new _,console.log("[Ferni Animations] All systems initialized \u{1F3AC}")})})();
