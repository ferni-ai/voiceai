"use strict";(function(){"use strict";function y(){const t=document.querySelector("[data-hero-orb]");if(!t)return;const o=15;let e,n;const c=(i,s)=>{e||(e=t.getBoundingClientRect());const a=e.left+e.width/2,d=e.top+e.height/2,r=i-a,l=s-d,m=Math.sqrt(r*r+l*l),u=Math.max(window.innerWidth,window.innerHeight)*.5,p=Math.max(0,1-m/u),f=r/u*o*p,Y=-(l/u)*o*p;t.style.transform=`
        perspective(1000px)
        rotateX(${Y}deg)
        rotateY(${f}deg)
        scale(${1+p*.02})
      `};document.addEventListener("mousemove",i=>{n&&cancelAnimationFrame(n),n=requestAnimationFrame(()=>c(i.clientX,i.clientY))}),window.addEventListener("scroll",()=>{e=null},{passive:!0}),document.addEventListener("mouseleave",()=>{t.style.transition="transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",t.style.transform="perspective(1000px) rotateX(0) rotateY(0) scale(1)",setTimeout(()=>{t.style.transition=""},800)})}function g(){const t=document.querySelector("[data-particles]");if(!t)return;const o=30,e=[];for(let s=0;s<o;s++){const a=document.createElement("div");a.className="hero-particle";const d=Math.random()*6+2,r=Math.random()*100,l=Math.random()*100,m=Math.random()*10+10,u=Math.random()*-20,p=Math.random()*.5+.1;a.style.cssText=`
        position: absolute;
        width: ${d}px;
        height: ${d}px;
        background: radial-gradient(circle, rgba(74, 103, 65, ${p}) 0%, transparent 70%);
        border-radius: 50%;
        left: ${r}%;
        top: ${l}%;
        animation: particleFloat ${m}s ease-in-out ${u}s infinite;
        pointer-events: none;
      `,t.appendChild(a),e.push({el:a,baseX:r,baseY:l})}let n=0,c=0;document.addEventListener("mousemove",s=>{const a=t.getBoundingClientRect();n=(s.clientX-a.left)/a.width*100,c=(s.clientY-a.top)/a.height*100});function i(){e.forEach(s=>{const a=s.baseX-n,d=s.baseY-c,r=Math.sqrt(a*a+d*d),l=30;if(r<l){const m=(1-r/l)*15,u=Math.atan2(d,a),p=Math.cos(u)*m,f=Math.sin(u)*m;s.el.style.transform=`translate(${p}px, ${f}px)`}else s.el.style.transform=""}),requestAnimationFrame(i)}i()}function b(){const t=document.querySelector("[data-orb-glow]");if(!t)return;const o=3;for(let e=0;e<o;e++){const n=document.createElement("div");n.className="glow-layer",n.style.cssText=`
        position: absolute;
        inset: ${-20-e*15}px;
        border-radius: 50%;
        background: radial-gradient(circle, 
          rgba(74, 103, 65, ${.15-e*.04}) 0%, 
          transparent 70%
        );
        animation: glowPulse ${4+e*.5}s ease-in-out infinite;
        animation-delay: ${e*.3}s;
        pointer-events: none;
      `,t.appendChild(n)}}function x(){const t=document.querySelectorAll("[data-persona-orbit]");t.length&&t.forEach((o,e)=>{const n=e/t.length*Math.PI*2,c=120;let i=n,s=5e-4+Math.random()*3e-4;function a(){i+=s;const d=Math.sin(i*3)*5,r=c+d,l=Math.cos(i)*r,m=Math.sin(i)*r;o.style.transform=`translate(${l}px, ${m}px)`,requestAnimationFrame(a)}a()})}function w(){const t=document.querySelector("[data-waveform]");if(!t)return;const o=7;t.innerHTML="";for(let e=0;e<o;e++){const n=document.createElement("div");n.className="waveform-bar",n.style.cssText=`
        width: 3px;
        height: 20px;
        background: currentColor;
        border-radius: 2px;
        animation: waveformPulse 1s ease-in-out infinite;
        animation-delay: ${e*.1}s;
      `,t.appendChild(n)}}function M(){const t=document.querySelector("[data-night-sky]");if(!t)return;const o=50,e=document.createElement("div");e.className="star-field",e.style.cssText=`
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    `;for(let n=0;n<o;n++){const c=document.createElement("div"),i=Math.random()*2+1;c.style.cssText=`
        position: absolute;
        width: ${i}px;
        height: ${i}px;
        background: white;
        border-radius: 50%;
        left: ${Math.random()*100}%;
        top: ${Math.random()*100}%;
        opacity: ${Math.random()*.7+.3};
        animation: twinkle ${2+Math.random()*3}s ease-in-out infinite;
        animation-delay: ${Math.random()*2}s;
      `,e.appendChild(c)}t.insertBefore(e,t.firstChild)}function k(){const t=document.querySelector("[data-clock]");if(!t)return;function o(){const e=new Date;let n=e.getHours();const c=e.getMinutes().toString().padStart(2,"0"),i=n>=12?"AM":"PM";t.innerHTML=`
        <span class="clock-time">2:${c}</span>
        <span class="clock-ampm">${i}</span>
      `}o(),setInterval(o,1e3),t.classList.add("clock-ticking")}function $(){document.querySelectorAll("[data-typing-indicator]").forEach(o=>{o.innerHTML=`
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      `})}function v(){const t=document.createElement("style");t.textContent=`
      @keyframes particleFloat {
        0%, 100% { 
          transform: translateY(0) translateX(0); 
          opacity: 0.3;
        }
        25% { 
          transform: translateY(-20px) translateX(10px); 
          opacity: 0.6;
        }
        50% { 
          transform: translateY(-10px) translateX(-5px); 
          opacity: 0.4;
        }
        75% { 
          transform: translateY(-30px) translateX(15px); 
          opacity: 0.5;
        }
      }
      
      @keyframes glowPulse {
        0%, 100% { 
          transform: scale(1); 
          opacity: 0.6;
        }
        50% { 
          transform: scale(1.1); 
          opacity: 1;
        }
      }
      
      @keyframes waveformPulse {
        0%, 100% { transform: scaleY(0.3); }
        50% { transform: scaleY(1); }
      }
      
      @keyframes twinkle {
        0%, 100% { opacity: 0.3; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.2); }
      }
      
      .clock-ticking .clock-time::after {
        content: ':';
        animation: clockBlink 1s step-end infinite;
      }
      
      @keyframes clockBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
      
      .typing-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        background: currentColor;
        border-radius: 50%;
        margin: 0 2px;
        animation: typingBounce 1.4s ease-in-out infinite;
      }
      
      .typing-dot:nth-child(1) { animation-delay: 0s; }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      
      @keyframes typingBounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-10px); }
      }
      
      .hero-particle {
        will-change: transform;
        transition: transform 0.3s ease-out;
      }
      
      .glow-layer {
        will-change: transform, opacity;
      }
    `,document.head.appendChild(t)}function h(){const t=window.matchMedia("(prefers-reduced-motion: reduce)").matches;v(),t||(y(),g(),b(),x(),w(),M(),$()),k(),console.log("%c\u{1F31F} Hero animations loaded","color: #4a6741; font-weight: bold;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",h):h()})();
