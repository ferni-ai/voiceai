const m={micro:{value:"50ms",use:"Immediate feedback"},fast:{value:"100ms",use:"Hover states, focus"},normal:{value:"200ms",use:"Standard transitions"},slow:{value:"300ms",use:"Deliberate moves"},moderate:{value:"400ms",use:"Panel slides"},deliberate:{value:"500ms",use:"Emphasis"},dramatic:{value:"600ms",use:"Celebrations"},celebration:{value:"800ms",use:"Major moments"},glacial:{value:"1500ms",use:"Ambient effects"}},u={standard:{value:"cubic-bezier(0.4, 0.0, 0.2, 1)",desc:"Material standard"},spring:{value:"cubic-bezier(0.34, 1.56, 0.64, 1)",desc:"Bounce overshoot"},"spring-gentle":{value:"cubic-bezier(0.34, 1.2, 0.64, 1)",desc:"Subtle spring"},"expo-out":{value:"cubic-bezier(0.16, 1, 0.3, 1)",desc:"Dramatic exit"},gentle:{value:"cubic-bezier(0.25, 0.1, 0.25, 1)",desc:"Organic, natural"},anticipate:{value:"cubic-bezier(0.38, -0.4, 0.88, 0.65)",desc:"Wind-up"}},v=()=>{const e=document.createElement("div");return e.innerHTML=`
    <div style="padding: var(--space-8); max-width: 900px;">
      <h2 style="
        font-family: var(--font-display);
        font-size: 1.5rem;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-6);
      ">Duration Scale</h2>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-4);">
        ${Object.entries(m).map(([t,{value:a,use:r}])=>`
          <div 
            class="duration-card"
            data-duration="${a}"
            style="
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
              padding: var(--space-4);
              cursor: pointer;
              transition: transform 0.2s;
            "
          >
            <div style="
              width: 100%;
              height: 8px;
              background: var(--color-border-subtle);
              border-radius: 4px;
              overflow: hidden;
              margin-bottom: var(--space-3);
            ">
              <div 
                class="progress-bar"
                style="
                  width: 0%;
                  height: 100%;
                  background: var(--persona-primary);
                  border-radius: 4px;
                "
              ></div>
            </div>
            <code style="
              font-family: var(--font-mono);
              font-size: 0.75rem;
              color: var(--persona-primary);
            ">${a}</code>
            <p style="
              font-size: 0.75rem;
              color: var(--color-text-muted);
              margin: var(--space-1) 0 0;
            ">DURATION.${t.toUpperCase()}</p>
            <p style="
              font-size: 0.6875rem;
              color: var(--color-text-dimmed);
              margin: var(--space-1) 0 0;
            ">${r}</p>
          </div>
        `).join("")}
      </div>
      
      <h2 style="
        font-family: var(--font-display);
        font-size: 1.5rem;
        color: var(--color-text-primary);
        margin: var(--space-10) 0 var(--space-6);
      ">Easing Functions</h2>
      
      <p style="
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-6);
      ">Click each card to see the easing in action.</p>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-4);">
        ${Object.entries(u).map(([t,{value:a,desc:r}])=>`
          <div 
            class="easing-card"
            data-easing="${a}"
            style="
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
              padding: var(--space-4);
              cursor: pointer;
            "
          >
            <div style="
              position: relative;
              width: 100%;
              height: 60px;
              background: var(--color-border-subtle);
              border-radius: var(--radius-md);
              margin-bottom: var(--space-3);
              overflow: hidden;
            ">
              <div 
                class="easing-ball"
                style="
                  position: absolute;
                  left: 8px;
                  top: 50%;
                  transform: translateY(-50%);
                  width: 24px;
                  height: 24px;
                  background: var(--persona-primary);
                  border-radius: 50%;
                "
              ></div>
            </div>
            <code style="
              font-family: var(--font-mono);
              font-size: 0.6875rem;
              color: var(--persona-primary);
              display: block;
              margin-bottom: var(--space-1);
            ">EASING.${t.toUpperCase().replace(/-/g,"_")}</code>
            <p style="
              font-size: 0.75rem;
              color: var(--color-text-muted);
              margin: 0;
            ">${r}</p>
          </div>
        `).join("")}
      </div>
    </div>
    
    <script>
      // Duration cards
      document.querySelectorAll('.duration-card').forEach(card => {
        card.addEventListener('click', () => {
          const duration = card.dataset.duration;
          const bar = card.querySelector('.progress-bar');
          bar.style.transition = 'width ' + duration + ' ease-out';
          bar.style.width = '100%';
          setTimeout(() => {
            bar.style.transition = 'none';
            bar.style.width = '0%';
          }, parseInt(duration) + 100);
        });
      });
      
      // Easing cards
      document.querySelectorAll('.easing-card').forEach(card => {
        card.addEventListener('click', () => {
          const easing = card.dataset.easing;
          const ball = card.querySelector('.easing-ball');
          ball.style.transition = 'left 0.8s ' + easing;
          ball.style.left = 'calc(100% - 32px)';
          setTimeout(() => {
            ball.style.left = '8px';
          }, 1000);
        });
      });
    <\/script>
  `,setTimeout(()=>{e.querySelectorAll("script").forEach(a=>{const r=document.createElement("script");r.textContent=a.textContent,document.body.appendChild(r)})},0),e},g={title:"Tokens/Motion",tags:["autodocs"],parameters:{layout:"fullscreen"}},s={render:()=>v()},i={render:()=>{const e=document.createElement("div");return e.innerHTML=`
      <div style="padding: var(--space-8); max-width: 600px;">
        <h2 style="
          font-family: var(--font-display);
          font-size: 1.5rem;
          color: var(--color-text-primary);
          margin: 0 0 var(--space-6);
        ">Animation Presets</h2>
        
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          <button 
            class="preset-btn"
            onclick="this.style.animation='none'; void this.offsetHeight; this.style.animation='buttonPress 0.1s cubic-bezier(0.34, 1.56, 0.64, 1)';"
            style="
              background: var(--persona-primary);
              color: white;
              border: none;
              padding: var(--space-3) var(--space-6);
              border-radius: var(--radius-lg);
              font-size: 1rem;
              cursor: pointer;
            "
          >
            Button Press (click me)
          </button>
          
          <div 
            style="
              background: var(--color-background-elevated);
              padding: var(--space-4);
              border-radius: var(--radius-lg);
              animation: cardHover 0.3s ease-out infinite alternate;
            "
          >
            Card Hover Effect
          </div>
          
          <div style="
            display: flex;
            gap: var(--space-2);
            justify-content: center;
          ">
            <span style="
              width: 12px;
              height: 12px;
              background: var(--persona-primary);
              border-radius: 50%;
              animation: thinkingDot 1.4s ease-in-out infinite;
            "></span>
            <span style="
              width: 12px;
              height: 12px;
              background: var(--persona-primary);
              border-radius: 50%;
              animation: thinkingDot 1.4s ease-in-out 0.2s infinite;
            "></span>
            <span style="
              width: 12px;
              height: 12px;
              background: var(--persona-primary);
              border-radius: 50%;
              animation: thinkingDot 1.4s ease-in-out 0.4s infinite;
            "></span>
          </div>
          <p style="text-align: center; font-size: 0.75rem; color: var(--color-text-muted);">Thinking Dots</p>
        </div>
      </div>
      
      <style>
        @keyframes buttonPress {
          0% { transform: scale(1); }
          50% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        
        @keyframes cardHover {
          from { transform: translateY(0); box-shadow: var(--shadow-md); }
          to { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
        }
        
        @keyframes thinkingDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      </style>
    `,e}};var o,n,d;s.parameters={...s.parameters,docs:{...(o=s.parameters)==null?void 0:o.docs,source:{originalSource:`{
  render: () => createMotionDemo()
}`,...(d=(n=s.parameters)==null?void 0:n.docs)==null?void 0:d.source}}};var c,l,p;i.parameters={...i.parameters,docs:{...(c=i.parameters)==null?void 0:c.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = \`
      <div style="padding: var(--space-8); max-width: 600px;">
        <h2 style="
          font-family: var(--font-display);
          font-size: 1.5rem;
          color: var(--color-text-primary);
          margin: 0 0 var(--space-6);
        ">Animation Presets</h2>
        
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          <button 
            class="preset-btn"
            onclick="this.style.animation='none'; void this.offsetHeight; this.style.animation='buttonPress 0.1s cubic-bezier(0.34, 1.56, 0.64, 1)';"
            style="
              background: var(--persona-primary);
              color: white;
              border: none;
              padding: var(--space-3) var(--space-6);
              border-radius: var(--radius-lg);
              font-size: 1rem;
              cursor: pointer;
            "
          >
            Button Press (click me)
          </button>
          
          <div 
            style="
              background: var(--color-background-elevated);
              padding: var(--space-4);
              border-radius: var(--radius-lg);
              animation: cardHover 0.3s ease-out infinite alternate;
            "
          >
            Card Hover Effect
          </div>
          
          <div style="
            display: flex;
            gap: var(--space-2);
            justify-content: center;
          ">
            <span style="
              width: 12px;
              height: 12px;
              background: var(--persona-primary);
              border-radius: 50%;
              animation: thinkingDot 1.4s ease-in-out infinite;
            "></span>
            <span style="
              width: 12px;
              height: 12px;
              background: var(--persona-primary);
              border-radius: 50%;
              animation: thinkingDot 1.4s ease-in-out 0.2s infinite;
            "></span>
            <span style="
              width: 12px;
              height: 12px;
              background: var(--persona-primary);
              border-radius: 50%;
              animation: thinkingDot 1.4s ease-in-out 0.4s infinite;
            "></span>
          </div>
          <p style="text-align: center; font-size: 0.75rem; color: var(--color-text-muted);">Thinking Dots</p>
        </div>
      </div>
      
      <style>
        @keyframes buttonPress {
          0% { transform: scale(1); }
          50% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        
        @keyframes cardHover {
          from { transform: translateY(0); box-shadow: var(--shadow-md); }
          to { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
        }
        
        @keyframes thinkingDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      </style>
    \`;
    return container;
  }
}`,...(p=(l=i.parameters)==null?void 0:l.docs)==null?void 0:p.source}}};const y=["DurationsAndEasings","AnimationPresets"];export{i as AnimationPresets,s as DurationsAndEasings,y as __namedExportsOrder,g as default};
