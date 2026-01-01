"use strict";(function(){"use strict";const u={ferni:{id:"ferni",name:"Ferni",initials:"FE",role:"Life Coach",color:"#4a6741",match:"You need someone who listens deeply and asks the questions that unlock insight.",traits:["emotional-support","clarity","presence"]},nayan:{id:"nayan",name:"Nayan",initials:"NP",role:"Sage & Mentor",color:"#9a7b5a",match:"You value long-term wisdom and perspective that comes from seeing the bigger picture.",traits:["wisdom","perspective","patience"]},peter:{id:"peter",name:"Peter",initials:"PL",role:"Research & Discovery",color:"#3a6b73",match:"You want data-driven insights that reveal patterns you can't see yourself.",traits:["analytical","patterns","data"]},alex:{id:"alex",name:"Alex",initials:"AX",role:"Communication",color:"#5a6b8a",match:"You need help navigating difficult conversations with confidence.",traits:["communication","negotiation","confidence"]},maya:{id:"maya",name:"Maya",initials:"MY",role:"Habits & Routines",color:"#a67a6a",match:"You want to build lasting habits through small, sustainable changes.",traits:["habits","consistency","systems"]},jordan:{id:"jordan",name:"Jordan",initials:"JD",role:"Planning & Events",color:"#c4856a",match:"You need help turning dreams into actionable plans and memorable experiences.",traits:["planning","creativity","execution"]}},o=[{question:"When you're facing a challenge, what do you need most?",answers:[{text:"Someone to really listen and understand",personas:["ferni","nayan"]},{text:"Clear data and patterns to make sense of it",personas:["peter"]},{text:"Help with what to say or do next",personas:["alex","jordan"]},{text:"Small, practical steps I can start today",personas:["maya"]}]},{question:"What's keeping you up at 2am?",answers:[{text:"Big life decisions I can't figure out",personas:["ferni","nayan"]},{text:"Worrying if I'm spending time on the right things",personas:["peter","maya"]},{text:"A conversation I'm dreading having",personas:["alex"]},{text:"Dreams I haven't turned into reality",personas:["jordan","nayan"]}]},{question:"What would feel like a win right now?",answers:[{text:"Feeling heard and understood",personas:["ferni"]},{text:"Gaining clarity on my next 10 years",personas:["nayan"]},{text:"Understanding where my time and energy really goes",personas:["peter"]},{text:"Nailing that difficult conversation",personas:["alex"]},{text:"Finally sticking to a routine",personas:["maya"]},{text:"Making that trip or event actually happen",personas:["jordan"]}]},{question:"How do you prefer to solve problems?",answers:[{text:"Talk through my feelings first",personas:["ferni"]},{text:"Zoom out and see the bigger picture",personas:["nayan"]},{text:"Look at the numbers and patterns",personas:["peter"]},{text:"Practice and prepare",personas:["alex"]},{text:"Break it into tiny daily actions",personas:["maya"]},{text:"Plan it out step by step",personas:["jordan"]}]}];let i=0,r={};function l(){const e=document.querySelector("[data-persona-quiz]");e&&(r={},Object.keys(u).forEach(s=>r[s]=0),i=0,d(e),console.log("%c\u{1F9ED} Persona quiz loaded","color: #4a6741; font-weight: bold;"))}function d(e){const s=o[i],a=i/o.length*100;e.innerHTML=`
      <div class="quiz__progress">
        <div class="quiz__progress-bar" style="width: ${a}%"></div>
      </div>
      <div class="quiz__content">
        <p class="quiz__step">Question ${i+1} of ${o.length}</p>
        <h3 class="quiz__question">${s.question}</h3>
        <div class="quiz__answers">
          ${s.answers.map((n,c)=>`
            <button class="quiz__answer" data-answer="${c}" data-personas="${n.personas.join(",")}">
              ${n.text}
            </button>
          `).join("")}
        </div>
      </div>
    `,e.querySelectorAll(".quiz__answer").forEach(n=>{n.addEventListener("click",()=>p(e,n))});const t=e.querySelector(".quiz__content");t.style.opacity="0",t.style.transform="translateY(20px)",requestAnimationFrame(()=>{t.style.transition="opacity 0.4s ease, transform 0.4s ease",t.style.opacity="1",t.style.transform="translateY(0)"})}function p(e,s){s.classList.add("quiz__answer--selected"),s.dataset.personas.split(",").forEach(t=>{r[t]=(r[t]||0)+1}),setTimeout(()=>{i++,i<o.length?d(e):h(e)},300)}function h(e){const s=Object.entries(r).sort(([,c],[,y])=>y-c)[0][0],a=u[s];e.innerHTML=`
      <div class="quiz__result">
        <div class="quiz__result-avatar" style="--persona-color: ${a.color}">
          <div class="quiz__result-avatar-orb">
            <span>${a.initials}</span>
          </div>
          <div class="quiz__result-avatar-glow"></div>
        </div>
        <p class="quiz__result-label">Your ideal guide is</p>
        <h3 class="quiz__result-name">${a.name}</h3>
        <p class="quiz__result-role">${a.role}</p>
        <p class="quiz__result-match">${a.match}</p>
        <div class="quiz__result-actions">
          <a href="https://app.ferni.ai?persona=${a.id}" class="btn btn--primary">
            Meet ${a.name}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </a>
          <button class="btn btn--ghost" data-quiz-restart>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Retake Quiz
          </button>
        </div>
        <p class="quiz__result-note">
          All six specialists work together. Start with ${a.name}, and they'll bring in the right help when you need it.
        </p>
      </div>
    `;const t=e.querySelector(".quiz__result");t.style.opacity="0",t.style.transform="translateY(20px)",requestAnimationFrame(()=>{t.style.transition="opacity 0.6s ease, transform 0.6s ease",t.style.opacity="1",t.style.transform="translateY(0)"});const n=e.querySelector(".quiz__result-avatar");n.style.animation="quizAvatarPulse 2s ease-in-out infinite",e.querySelector("[data-quiz-restart]")?.addEventListener("click",()=>{l()})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",l):l()})();
