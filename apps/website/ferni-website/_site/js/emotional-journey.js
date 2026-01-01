"use strict";(function(){"use strict";const v=[{time:"Week 1",emotion:"anxious",intensity:.7,message:"I've been feeling overwhelmed with everything...",response:"That sounds like a lot to carry. Let's take it one thing at a time."},{time:"Week 2",emotion:"uncertain",intensity:.5,message:"I'm not sure if I can handle this new project",response:"What if we broke it into smaller pieces? What's the first tiny step?"},{time:"Week 3",emotion:"hopeful",intensity:.6,message:"The approach you suggested is actually working",response:"That's wonderful! You've been putting in real effort. How does it feel?"},{time:"Week 4",emotion:"confident",intensity:.8,message:"I presented the project and it went great!",response:"I remember how worried you were three weeks ago. Look how far you've come."},{time:"Week 6",emotion:"reflective",intensity:.6,message:"It's interesting looking back at where I started",response:"Growth often happens when we're not watching. What did you learn about yourself?"}],a={anxious:{color:"#a67a6a",label:"Anxious"},uncertain:{color:"#8a7a6a",label:"Uncertain"},hopeful:{color:"#7a9a7a",label:"Hopeful"},confident:{color:"#4a6741",label:"Confident"},reflective:{color:"#3a6b73",label:"Reflective"},neutral:{color:"#5C544A",label:"Neutral"}},e={container:null,journey:v,initialized:!1,animationPlayed:!1};function u(){if(e.container=document.querySelector(".emotional-journey, [data-emotional-journey]"),!e.container){y("No emotional journey container found");return}m(),j(),e.initialized=!0,y("Emotional Journey initialized")}function m(){e.container.innerHTML=`
      <div class="emotional-journey__header">
        <h3 class="emotional-journey__title">The Journey</h3>
        <p class="emotional-journey__subtitle">How conversations evolve over time</p>
      </div>
      
      <div class="emotional-journey__timeline">
        ${p()}
      </div>
      
      <div class="emotional-journey__wave">
        <svg viewBox="0 0 600 100" preserveAspectRatio="none">
          ${f()}
        </svg>
      </div>
      
      <div class="emotional-journey__legend">
        ${g()}
      </div>
    `,_()}function p(){return e.journey.map((n,o)=>{const t=a[n.emotion]||a.neutral,r=o*200;return`
        <div class="emotional-journey__point" 
             data-index="${o}"
             style="--emotion-color: ${t.color}; --animation-delay: ${r}ms">
          <div class="emotional-journey__marker">
            <div class="emotional-journey__dot"></div>
            <div class="emotional-journey__pulse"></div>
          </div>
          <div class="emotional-journey__content">
            <span class="emotional-journey__time">${n.time}</span>
            <span class="emotional-journey__emotion">${t.label}</span>
            <div class="emotional-journey__preview">
              <p class="emotional-journey__message">"${n.message}"</p>
              <p class="emotional-journey__response">${n.response}</p>
            </div>
          </div>
        </div>
      `}).join("")}function f(){const r=600/(e.journey.length-1);let l=`M 0 ${100/2}`;return e.journey.forEach((d,i)=>{const s=i*r,c=100-d.intensity*100*.8-10;if(i===0)l=`M ${s} ${c}`;else{const w=(i-1)*r,$=100-e.journey[i-1].intensity*100*.8-10,h=(w+s)/2;l+=` C ${h} ${$}, ${h} ${c}, ${s} ${c}`}}),`
      <defs>
        <linearGradient id="emotion-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          ${e.journey.map((d,i)=>{const s=a[d.emotion]||a.neutral;return`<stop offset="${i/(e.journey.length-1)*100}%" stop-color="${s.color}" />`}).join("")}
        </linearGradient>
      </defs>
      <path class="emotional-journey__wave-path" 
            d="${l}" 
            fill="none" 
            stroke="url(#emotion-gradient)" 
            stroke-width="3"
            stroke-linecap="round" />
      <path class="emotional-journey__wave-fill" 
            d="${l} L 600 100 L 0 100 Z" 
            fill="url(#emotion-gradient)"
            opacity="0.1" />
    `}function g(){return[...new Set(e.journey.map(o=>o.emotion))].map(o=>{const t=a[o];return`
        <div class="emotional-journey__legend-item">
          <span class="emotional-journey__legend-dot" style="background: ${t.color}"></span>
          <span class="emotional-journey__legend-label">${t.label}</span>
        </div>
      `}).join("")}function _(){const n=e.container.querySelectorAll(".emotional-journey__point");n.forEach(o=>{o.addEventListener("mouseenter",()=>{n.forEach(t=>t.classList.remove("is-active")),o.classList.add("is-active")}),o.addEventListener("mouseleave",()=>{o.classList.remove("is-active")})})}function j(){new IntersectionObserver(o=>{o.forEach(t=>{t.isIntersecting&&!e.animationPlayed&&(e.animationPlayed=!0,e.container.classList.add("is-animating"))})},{threshold:.3}).observe(e.container)}function y(...n){console.log("[EmotionalJourney]",...n)}window.FerniEmotionalJourney={init:u,setJourney:n=>{e.journey=n,e.initialized&&m()},replay:()=>{e.animationPlayed=!1,e.container.classList.remove("is-animating"),requestAnimationFrame(()=>{e.container.classList.add("is-animating"),e.animationPlayed=!0})}},document.readyState==="loading"?document.addEventListener("DOMContentLoaded",u):u()})();
