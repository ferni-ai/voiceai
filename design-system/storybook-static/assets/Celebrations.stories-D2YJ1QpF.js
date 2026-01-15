const h=["#4a6741","#c4856a","#d4a84a","#3a6b73","#a67a6a"],O=a=>{var y;const t=document.createElement("div"),e=a.personaColor||"#4a6741";if(a.type==="team-unlock")t.innerHTML=`
      <div class="celebration-modal" style="
        position: relative;
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 24px);
        padding: var(--space-8, 32px);
        max-width: 360px;
        text-align: center;
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
        overflow: hidden;
      ">
        <!-- Confetti Layer -->
        <div class="confetti-container" style="
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        ">
          ${Array.from({length:30},(r,s)=>`
            <div class="confetti-piece" style="
              position: absolute;
              width: ${6+Math.random()*6}px;
              height: ${6+Math.random()*6}px;
              background: ${h[s%h.length]};
              left: ${Math.random()*100}%;
              top: -10px;
              opacity: 0;
              animation: confettiFall ${2+Math.random()*2}s ease-out ${Math.random()*.5}s forwards;
              transform: rotate(${Math.random()*360}deg);
              border-radius: ${Math.random()>.5?"50%":"2px"};
            "></div>
          `).join("")}
        </div>
        
        <!-- Eyebrow -->
        <span style="
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: ${e};
          animation: fadeSlideUp 0.5s ease-out 0.2s both;
        ">TEAM MEMBER UNLOCKED</span>
        
        <!-- Avatar -->
        <div class="persona-avatar" style="
          width: 100px;
          height: 100px;
          margin: var(--space-4, 16px) auto;
          border-radius: 50%;
          background: linear-gradient(135deg, ${e}, ${e}cc);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 40px ${e}44;
          animation: avatarReveal 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
        ">
          <span style="color: white; font-size: 2.5rem; font-weight: 600;">
            ${((y=a.personaName)==null?void 0:y[0])||"M"}
          </span>
        </div>
        
        <!-- Name -->
        <h2 style="
          font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--color-text-primary, #2C2520);
          margin: 0 0 var(--space-1, 4px);
          animation: fadeSlideUp 0.5s ease-out 0.5s both;
        ">Meet ${a.personaName||"Maya Santos"}</h2>
        
        <!-- Title -->
        <p style="
          font-size: 1rem;
          color: ${e};
          font-weight: 500;
          margin: 0 0 var(--space-2, 8px);
          animation: fadeSlideUp 0.5s ease-out 0.6s both;
        ">${a.personaTitle||"Habit Architect"}</p>
        
        <!-- Description -->
        <p style="
          font-size: 0.9375rem;
          color: var(--color-text-secondary, #5a4d43);
          line-height: 1.5;
          margin: 0 0 var(--space-6, 24px);
          animation: fadeSlideUp 0.5s ease-out 0.7s both;
        ">
          ${a.message||"Specializes in building sustainable daily routines that stick."}
        </p>
        
        <!-- CTA -->
        <button class="say-hello-btn" style="
          background: ${e};
          color: white;
          border: none;
          padding: var(--space-3, 12px) var(--space-8, 32px);
          border-radius: var(--radius-full, 9999px);
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          animation: fadeSlideUp 0.5s ease-out 0.8s both;
          transition: all 0.2s ease;
        ">
          Say Hello
        </button>
      </div>
      
      <style>
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
        }
        
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes avatarReveal {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        
        .say-hello-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px ${e}44;
        }
      </style>
    `;else if(a.type==="streak"){const r={3:"3 days strong!",7:"A full week. Impressive.",14:"Two weeks of showing up.",30:"A month! You're building something.",60:"60 days. This is who you are now.",100:"100 days. Extraordinary.",365:"A whole year. You've changed."};t.innerHTML=`
      <div class="streak-celebration" style="
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 24px);
        padding: var(--space-8, 32px);
        text-align: center;
        max-width: 320px;
      ">
        <!-- Streak Number -->
        <div class="streak-number" style="
          font-size: 4rem;
          font-weight: 700;
          color: var(--persona-primary, #4a6741);
          line-height: 1;
          animation: streakPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        ">
          ${a.streakDays||7}
        </div>
        
        <p style="
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--color-text-muted, #9a8b7a);
          margin: var(--space-1, 4px) 0 var(--space-4, 16px);
        ">day streak</p>
        
        <p style="
          font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
          font-size: 1.25rem;
          font-weight: 500;
          color: var(--color-text-primary, #2C2520);
          margin: 0;
        ">
          ${r[a.streakDays||7]||"Keep it going!"}
        </p>
        
        <!-- Progress dots -->
        <div class="streak-dots" style="
          display: flex;
          justify-content: center;
          gap: 6px;
          margin-top: var(--space-4, 16px);
        ">
          ${Array.from({length:7},(s,o)=>`
            <div style="
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: ${o<(a.streakDays||7)%7||a.streakDays===7?"var(--persona-primary, #4a6741)":"var(--color-border-medium, rgba(0,0,0,0.1))"};
              animation: dotPop 0.3s ease-out ${.1*o}s both;
            "></div>
          `).join("")}
        </div>
      </div>
      
      <style>
        @keyframes streakPop {
          0% { transform: scale(0); }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        
        @keyframes dotPop {
          0% { transform: scale(0); }
          100% { transform: scale(1); }
        }
      </style>
    `}else{const r=a.type==="big-win",s=r?["This is huge!","I'm so proud of you.","You earned this.","Look at you go!"]:["Nice!","Well done.","You did it.","Progress!","That counts."],o=a.message||s[Math.floor(Math.random()*s.length)];t.innerHTML=`
      <div class="win-toast" style="
        background: var(--persona-primary, #4a6741);
        color: white;
        padding: var(--space-4, 16px) var(--space-6, 24px);
        border-radius: var(--radius-full, 9999px);
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        box-shadow: 0 4px 20px var(--persona-glow, rgba(74, 103, 65, 0.3));
        animation: winToastEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      ">
        ${r?`
          <span style="font-size: 1.5rem;">🎉</span>
        `:`
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        `}
        <span style="
          font-size: ${r?"1.125rem":"1rem"};
          font-weight: 500;
        ">${o}</span>
      </div>
      
      <style>
        @keyframes winToastEnter {
          0% { transform: translateY(20px) scale(0.9); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      </style>
    `}return t},_={title:"Patterns/Celebrations",tags:["autodocs"],render:a=>O(a),parameters:{layout:"centered",backgrounds:{default:"dark",values:[{name:"dark",value:"rgba(44, 37, 32, 0.4)"},{name:"light",value:"#faf8f5"}]}}},n={args:{type:"team-unlock",personaName:"Maya Santos",personaColor:"#a67a6a",personaTitle:"Habit Architect",message:"Specializes in building sustainable daily routines that stick."}},i={args:{type:"team-unlock",personaName:"Peter John",personaColor:"#3a6b73",personaTitle:"Research Specialist",message:"Curious by nature. Thorough by design. Loves diving deep."}},l={args:{type:"team-unlock",personaName:"Jordan Taylor",personaColor:"#c4856a",personaTitle:"Event Planner",message:"Turns celebrations into memorable experiences."}},c={args:{type:"small-win",message:"Nice! You did it."},parameters:{backgrounds:{default:"light"}}},p={args:{type:"big-win",message:"This is huge! I'm so proud of you."},parameters:{backgrounds:{default:"light"}}},d={args:{type:"streak",streakDays:3},parameters:{backgrounds:{default:"light"}}},m={args:{type:"streak",streakDays:7},parameters:{backgrounds:{default:"light"}}},u={args:{type:"streak",streakDays:30},parameters:{backgrounds:{default:"light"}}},g={args:{type:"streak",streakDays:100},parameters:{backgrounds:{default:"light"}}};var f,b,k;n.parameters={...n.parameters,docs:{...(f=n.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    type: 'team-unlock',
    personaName: 'Maya Santos',
    personaColor: '#a67a6a',
    personaTitle: 'Habit Architect',
    message: 'Specializes in building sustainable daily routines that stick.'
  }
}`,...(k=(b=n.parameters)==null?void 0:b.docs)==null?void 0:k.source}}};var v,x,w;i.parameters={...i.parameters,docs:{...(v=i.parameters)==null?void 0:v.docs,source:{originalSource:`{
  args: {
    type: 'team-unlock',
    personaName: 'Peter John',
    personaColor: '#3a6b73',
    personaTitle: 'Research Specialist',
    message: 'Curious by nature. Thorough by design. Loves diving deep.'
  }
}`,...(w=(x=i.parameters)==null?void 0:x.docs)==null?void 0:w.source}}};var S,T,$;l.parameters={...l.parameters,docs:{...(S=l.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    type: 'team-unlock',
    personaName: 'Jordan Taylor',
    personaColor: '#c4856a',
    personaTitle: 'Event Planner',
    message: 'Turns celebrations into memorable experiences.'
  }
}`,...($=(T=l.parameters)==null?void 0:T.docs)==null?void 0:$.source}}};var D,M,C;c.parameters={...c.parameters,docs:{...(D=c.parameters)==null?void 0:D.docs,source:{originalSource:`{
  args: {
    type: 'small-win',
    message: 'Nice! You did it.'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...(C=(M=c.parameters)==null?void 0:M.docs)==null?void 0:C.source}}};var z,N,P;p.parameters={...p.parameters,docs:{...(z=p.parameters)==null?void 0:z.docs,source:{originalSource:`{
  args: {
    type: 'big-win',
    message: 'This is huge! I\\'m so proud of you.'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...(P=(N=p.parameters)==null?void 0:N.docs)==null?void 0:P.source}}};var E,U,Y;d.parameters={...d.parameters,docs:{...(E=d.parameters)==null?void 0:E.docs,source:{originalSource:`{
  args: {
    type: 'streak',
    streakDays: 3
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...(Y=(U=d.parameters)==null?void 0:U.docs)==null?void 0:Y.source}}};var A,F,L;m.parameters={...m.parameters,docs:{...(A=m.parameters)==null?void 0:A.docs,source:{originalSource:`{
  args: {
    type: 'streak',
    streakDays: 7
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...(L=(F=m.parameters)==null?void 0:F.docs)==null?void 0:L.source}}};var J,B,H;u.parameters={...u.parameters,docs:{...(J=u.parameters)==null?void 0:J.docs,source:{originalSource:`{
  args: {
    type: 'streak',
    streakDays: 30
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...(H=(B=u.parameters)==null?void 0:B.docs)==null?void 0:H.source}}};var R,W,I;g.parameters={...g.parameters,docs:{...(R=g.parameters)==null?void 0:R.docs,source:{originalSource:`{
  args: {
    type: 'streak',
    streakDays: 100
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...(I=(W=g.parameters)==null?void 0:W.docs)==null?void 0:I.source}}};const j=["TeamUnlockMaya","TeamUnlockPeter","TeamUnlockJordan","SmallWin","BigWin","Streak3Days","Streak7Days","Streak30Days","Streak100Days"];export{p as BigWin,c as SmallWin,g as Streak100Days,u as Streak30Days,d as Streak3Days,m as Streak7Days,l as TeamUnlockJordan,n as TeamUnlockMaya,i as TeamUnlockPeter,j as __namedExportsOrder,_ as default};
