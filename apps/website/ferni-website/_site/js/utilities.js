"use strict";(function(){"use strict";window.ferniConfetti=function(e,t=30){const a=["#4a6741","#3a6b73","#5a6b8a","#a67a6a","#c4856a","#faf8f5"],n=(e instanceof HTMLElement?e:document.body).getBoundingClientRect();for(let i=0;i<t;i++){const s=document.createElement("div");s.className="confetti-piece",s.style.cssText=`
        position: fixed;
        width: ${Math.random()*10+5}px;
        height: ${Math.random()*10+5}px;
        background: ${a[Math.floor(Math.random()*a.length)]};
        left: ${n.left+n.width/2+(Math.random()-.5)*100}px;
        top: ${n.top+n.height/2}px;
        border-radius: ${Math.random()>.5?"50%":"2px"};
        pointer-events: none;
        z-index: 9999;
        animation: confettiPop ${.8+Math.random()*.4}s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        animation-delay: ${Math.random()*.1}s;
      `,document.body.appendChild(s),setTimeout(()=>s.remove(),1500)}};const r=document.createElement("style");r.textContent=`
    @keyframes confettiPop {
      0% {
        transform: translateY(0) translateX(0) rotate(0deg) scale(1);
        opacity: 1;
      }
      100% {
        transform: translateY(${-150-Math.random()*100}px) translateX(${(Math.random()-.5)*200}px) rotate(${720+Math.random()*360}deg) scale(0);
        opacity: 0;
      }
    }
  `,document.head.appendChild(r),window.ferniTimeAwareness={init:function(){this.update(),setInterval(()=>this.update(),1800*1e3)},update:function(){const e=new Date().getHours();let t="time-noon";e>=5&&e<8?t="time-dawn":e>=8&&e<17?t="time-noon":e>=17&&e<20?t="time-dusk":t="time-night",document.documentElement.classList.remove("time-dawn","time-noon","time-dusk","time-night"),document.documentElement.classList.add(t),document.dispatchEvent(new CustomEvent("ferni:timechange",{detail:{timeClass:t,hour:e}}))},getTimeOfDay:function(){const e=new Date().getHours();return e>=5&&e<8?"dawn":e>=8&&e<17?"noon":e>=17&&e<20?"dusk":"night"}},window.ferniStickyCTA={init:function(){const e=document.querySelector("[data-hero]"),t=document.querySelector(".sticky-cta");if(!e||!t)return;new IntersectionObserver(o=>{o.forEach(n=>{n.isIntersecting?t.classList.remove("visible"):t.classList.add("visible")})},{threshold:.1}).observe(e)}},window.ferniPersonaBreathing={profiles:{ferni:{duration:4,ease:"ease-in-out",scale:1.03},peter:{duration:5,ease:"ease",scale:1.02},alex:{duration:3.5,ease:"ease-in-out",scale:1.04},maya:{duration:4.5,ease:"ease",scale:1.025},jordan:{duration:3,ease:"ease-in-out",scale:1.05},nayan:{duration:6,ease:"ease",scale:1.015}},apply:function(e,t){const a=this.profiles[t]||this.profiles.ferni;if(e.style.animation=`personaBreathe-${t} ${a.duration}s ${a.ease} infinite`,!document.querySelector(`#breathing-${t}`)){const o=document.createElement("style");o.id=`breathing-${t}`,o.textContent=`
          @keyframes personaBreathe-${t} {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(${a.scale}); }
          }
        `,document.head.appendChild(o)}}},window.ferniWaveform={create:function(e,t){const a={ferni:"#4a6741",peter:"#3a6b73",alex:"#5a6b8a",maya:"#a67a6a",jordan:"#c4856a",nayan:"#8a7a6a"},o=7;e.innerHTML="",e.style.display="flex",e.style.alignItems="center",e.style.gap="3px";for(let n=0;n<o;n++){const i=document.createElement("div");i.style.cssText=`
          width: 3px;
          height: 20px;
          background: ${a[t]||a.ferni};
          border-radius: 2px;
          animation: waveformBar 0.8s ease-in-out infinite;
          animation-delay: ${n*.1}s;
        `,e.appendChild(i)}if(!document.querySelector("#waveform-keyframe")){const n=document.createElement("style");n.id="waveform-keyframe",n.textContent=`
          @keyframes waveformBar {
            0%, 100% { transform: scaleY(0.3); }
            50% { transform: scaleY(1); }
          }
        `,document.head.appendChild(n)}}};function d(){window.ferniTimeAwareness.init(),window.ferniStickyCTA.init(),console.log("%c\u{1F6E0}\uFE0F Utilities loaded","color: #4a6741; font-weight: bold;")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",d):d()})();
