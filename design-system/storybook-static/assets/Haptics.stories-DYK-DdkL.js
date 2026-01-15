const I={title:"Tokens/Haptics",parameters:{layout:"padded",docs:{description:{component:`# Haptics Token Documentation

Ferni's haptic system provides meaningful touch feedback for emotional connection.
Each persona has unique haptic signatures that reflect their personality.

## Philosophy
- **Meaningful, not decorative** - every haptic should communicate something
- **Warm, not clinical** - organic patterns over mechanical buzzes  
- **Subtle by default** - reserve intensity for important moments
- **Persona-aware** - haptics reflect character personality`}}}},S={1:{name:"Whisper",description:"Barely perceptible"},2:{name:"Soft",description:"Light confirmation"},3:{name:"Medium",description:"Standard feedback"},4:{name:"Strong",description:"Important moments"},5:{name:"Emphasis",description:"Critical actions"}},o={render:()=>{const t=document.createElement("div");return t.innerHTML=`
      <div style="font-family: var(--font-body); max-width: 600px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 24px; color: var(--color-text-primary);">
          Intensity Levels
        </h2>
        <p style="color: var(--color-text-secondary); margin-bottom: 32px;">
          Standard 1-5 scale for haptic intensity, mapped to platform APIs.
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${Object.entries(S).map(([e,r])=>`
            <div style="
              display: flex;
              align-items: center;
              gap: 16px;
              padding: 16px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
              border: 1px solid var(--color-border-subtle);
            ">
              <div style="
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: linear-gradient(135deg, var(--persona-primary), var(--persona-secondary));
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 700;
                font-size: 20px;
              ">${e}</div>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--color-text-primary);">${r.name}</div>
                <div style="font-size: 14px; color: var(--color-text-muted);">${r.description}</div>
              </div>
              <div style="
                width: ${parseInt(e)*24}px;
                height: 8px;
                background: var(--persona-primary);
                border-radius: 4px;
                opacity: ${.3+parseInt(e)*.15};
              "></div>
            </div>
          `).join("")}
        </div>
      </div>
    `,t}},E=[{name:"tap",duration:10,intensity:2,useCase:"Button press, selection"},{name:"softTap",duration:8,intensity:1,useCase:"Toggle off, dismiss"},{name:"doubleTap",duration:40,intensity:2,useCase:"Selection confirmed"},{name:"bump",duration:20,intensity:3,useCase:"Toggle on, snap to position"},{name:"click",duration:15,intensity:3,useCase:"Checkbox, task complete"}],n={render:()=>{const t=document.createElement("div");return t.innerHTML=`
      <div style="font-family: var(--font-body); max-width: 800px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 24px; color: var(--color-text-primary);">
          Base Patterns
        </h2>
        <p style="color: var(--color-text-secondary); margin-bottom: 32px;">
          Fundamental haptic building blocks for UI interactions.
        </p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px;">
          ${E.map(e=>`
            <button style="
              padding: 20px;
              background: var(--color-background-elevated);
              border: 1px solid var(--color-border-subtle);
              border-radius: var(--radius-lg);
              cursor: pointer;
              text-align: left;
              transition: all 200ms ease;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)'"
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
              <div style="
                font-family: var(--font-mono);
                font-size: 14px;
                color: var(--persona-primary);
                margin-bottom: 8px;
              ">${e.name}</div>
              <div style="
                display: flex;
                gap: 12px;
                margin-bottom: 12px;
                font-size: 12px;
                color: var(--color-text-muted);
              ">
                <span>${e.duration}ms</span>
                <span>•</span>
                <span>Level ${e.intensity}</span>
              </div>
              <div style="font-size: 13px; color: var(--color-text-secondary);">
                ${e.useCase}
              </div>
            </button>
          `).join("")}
        </div>
      </div>
    `,t}},L=[{name:"ferniBreath",duration:300,description:"Core Ferni breathing pattern - warm, grounding",visualization:"◠ ◡ ◠ ◡"},{name:"warmPulse",duration:250,description:"Gentle warmth pulse - emotional acknowledgment",visualization:"○ ● ○"},{name:"heartbeat",duration:800,description:"Double-beat pulse - connection/love",visualization:"♡ ♥ · · ♡ ♥"},{name:"slowBreath",duration:500,description:"Extended breath - calm, wisdom",visualization:"◠ · · · ◡ · · ·"},{name:"quickBreath",duration:200,description:"Short energetic breath - curiosity",visualization:"◠◡◠"}],a={render:()=>{const t=document.createElement("div");return t.innerHTML=`
      <div style="font-family: var(--font-body); max-width: 700px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          Organic Patterns
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Ferni's signature haptics — organic, human, breathing
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${L.map(e=>`
            <div style="
              padding: 20px;
              background: linear-gradient(135deg, rgba(74, 103, 65, 0.08), rgba(74, 103, 65, 0.02));
              border: 1px solid var(--color-border-subtle);
              border-radius: var(--radius-xl);
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 16px;
              align-items: center;
            ">
              <div>
                <div style="
                  font-family: var(--font-mono);
                  font-weight: 600;
                  color: var(--persona-primary);
                  margin-bottom: 4px;
                ">${e.name}</div>
                <div style="font-size: 14px; color: var(--color-text-secondary);">
                  ${e.description}
                </div>
                <div style="
                  font-size: 12px;
                  color: var(--color-text-muted);
                  margin-top: 8px;
                ">${e.duration}ms duration</div>
              </div>
              <div style="
                font-size: 24px;
                letter-spacing: 4px;
                color: var(--persona-primary);
                opacity: 0.6;
              ">${e.visualization}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `,t}},T=[{id:"ferni",name:"Ferni",role:"Life Coach",color:"#4a6741",signature:"ferniBreath",description:"Warm, grounding, nurturing",traits:["Speaking: breath pulse","Acknowledgment: double tap","Insight: heartbeat"]},{id:"peter",name:"Peter",role:"Researcher",color:"#3a6b73",signature:"quickBreath",description:"Curious, energetic, quick",traits:["Speaking: quick pulses","Discovery: burst","Thinking: rhythm"]},{id:"maya",name:"Maya",role:"Habit Architect",color:"#a67a6a",signature:"steadyRhythm",description:"Steady, rhythmic, reliable",traits:["Speaking: steady rhythm","Task complete: click","Progress: ramp"]},{id:"jordan",name:"Jordan",role:"Celebration Catalyst",color:"#c4856a",signature:"bounce",description:"Joyful, bouncy, celebratory",traits:["Speaking: bouncy pulse","Excitement: sparkle","Celebration: big win"]}],i={render:()=>{const t=document.createElement("div");return t.innerHTML=`
      <div style="font-family: var(--font-body); max-width: 900px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          Persona Haptics
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Each persona has unique haptic signatures reflecting their personality
        </p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
          ${T.map(e=>`
            <div style="
              padding: 24px;
              background: var(--color-background-elevated);
              border: 1px solid var(--color-border-subtle);
              border-radius: var(--radius-xl);
              border-top: 3px solid ${e.color};
            ">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                <div style="
                  width: 40px;
                  height: 40px;
                  border-radius: 50%;
                  background: ${e.color};
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: 600;
                ">${e.name[0]}</div>
                <div>
                  <div style="font-weight: 600; color: var(--color-text-primary);">${e.name}</div>
                  <div style="font-size: 12px; color: var(--color-text-muted);">${e.role}</div>
                </div>
              </div>
              
              <div style="
                font-size: 13px;
                color: var(--color-text-secondary);
                margin-bottom: 16px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--color-border-subtle);
              ">${e.description}</div>
              
              <div style="
                font-family: var(--font-mono);
                font-size: 12px;
                color: ${e.color};
                margin-bottom: 12px;
              ">signature: ${e.signature}</div>
              
              <ul style="
                margin: 0;
                padding: 0;
                list-style: none;
                font-size: 12px;
                color: var(--color-text-muted);
                display: flex;
                flex-direction: column;
                gap: 4px;
              ">
                ${e.traits.map(r=>`<li>• ${r}</li>`).join("")}
              </ul>
            </div>
          `).join("")}
        </div>
      </div>
    `,t}},C=[{emotion:"empathy",pattern:"warmPulse",character:"Like a gentle hand on shoulder",color:"#a67a6a"},{emotion:"encouragement",pattern:"quickBreath",character:"Supportive energy",color:"#4a6741"},{emotion:"understanding",pattern:"heartbeat",character:"I get it",color:"#3a6b73"},{emotion:"concern",pattern:"slowBreath",character:"Calming presence",color:"#5a6b8a"},{emotion:"celebration",pattern:"bigWin",character:"Pure joy",color:"#c4856a"},{emotion:"curiosity",pattern:"quickBreath",character:"Tell me more",color:"#3a6b73"}],s={render:()=>{const t=document.createElement("div");return t.innerHTML=`
      <div style="font-family: var(--font-body); max-width: 700px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          Emotional Haptics
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Haptic responses to detected emotional states
        </p>
        
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          ${C.map(e=>`
            <div style="
              padding: 16px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
              border-left: 3px solid ${e.color};
            ">
              <div style="
                font-weight: 600;
                color: var(--color-text-primary);
                text-transform: capitalize;
                margin-bottom: 4px;
              ">${e.emotion}</div>
              <div style="
                font-family: var(--font-mono);
                font-size: 11px;
                color: ${e.color};
                margin-bottom: 8px;
              ">${e.pattern}</div>
              <div style="
                font-size: 13px;
                color: var(--color-text-secondary);
                font-style: italic;
              ">"${e.character}"</div>
            </div>
          `).join("")}
        </div>
      </div>
    `,t}},d={render:()=>{const t=document.createElement("div");return t.innerHTML=`
      <div style="font-family: var(--font-body); max-width: 600px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 24px; color: var(--color-text-primary);">
          Accessibility Guidelines
        </h2>
        
        <div style="
          padding: 20px;
          background: rgba(74, 103, 65, 0.1);
          border-radius: var(--radius-lg);
          margin-bottom: 24px;
        ">
          <h3 style="color: var(--persona-primary); margin-bottom: 12px; font-size: 16px;">
            ✓ Always Follow These Rules
          </h3>
          <ul style="margin: 0; padding-left: 20px; color: var(--color-text-secondary); line-height: 1.8;">
            <li>Never make haptics the only feedback channel</li>
            <li>Always pair with visual or audio feedback</li>
            <li>Provide option to disable all haptics</li>
            <li>Respect system mute/volume settings</li>
            <li>Check <code>prefers-reduced-motion</code> preference</li>
          </ul>
        </div>
        
        <div style="
          padding: 20px;
          background: var(--color-background-elevated);
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-border-subtle);
        ">
          <h3 style="color: var(--color-text-primary); margin-bottom: 12px; font-size: 16px;">
            Platform APIs
          </h3>
          <div style="display: grid; gap: 12px;">
            <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
              <div style="font-weight: 600; margin-bottom: 4px;">iOS</div>
              <code style="font-size: 12px; color: var(--color-text-muted);">UIImpactFeedbackGenerator, Core Haptics</code>
            </div>
            <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
              <div style="font-weight: 600; margin-bottom: 4px;">Android</div>
              <code style="font-size: 12px; color: var(--color-text-muted);">VibrationEffect, HapticFeedbackConstants</code>
            </div>
            <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
              <div style="font-weight: 600; margin-bottom: 4px;">Web</div>
              <code style="font-size: 12px; color: var(--color-text-muted);">Navigator.vibrate() - limited support</code>
            </div>
          </div>
        </div>
      </div>
    `,t}};var l,c,p;o.parameters={...o.parameters,docs:{...(l=o.parameters)==null?void 0:l.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = \`
      <div style="font-family: var(--font-body); max-width: 600px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 24px; color: var(--color-text-primary);">
          Intensity Levels
        </h2>
        <p style="color: var(--color-text-secondary); margin-bottom: 32px;">
          Standard 1-5 scale for haptic intensity, mapped to platform APIs.
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          \${Object.entries(intensityLevels).map(([level, info]) => \`
            <div style="
              display: flex;
              align-items: center;
              gap: 16px;
              padding: 16px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
              border: 1px solid var(--color-border-subtle);
            ">
              <div style="
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: linear-gradient(135deg, var(--persona-primary), var(--persona-secondary));
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 700;
                font-size: 20px;
              ">\${level}</div>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--color-text-primary);">\${info.name}</div>
                <div style="font-size: 14px; color: var(--color-text-muted);">\${info.description}</div>
              </div>
              <div style="
                width: \${parseInt(level) * 24}px;
                height: 8px;
                background: var(--persona-primary);
                border-radius: 4px;
                opacity: \${0.3 + parseInt(level) * 0.15};
              "></div>
            </div>
          \`).join('')}
        </div>
      </div>
    \`;
    return container;
  }
}`,...(p=(c=o.parameters)==null?void 0:c.docs)==null?void 0:p.source}}};var m,v,y;n.parameters={...n.parameters,docs:{...(m=n.parameters)==null?void 0:m.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = \`
      <div style="font-family: var(--font-body); max-width: 800px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 24px; color: var(--color-text-primary);">
          Base Patterns
        </h2>
        <p style="color: var(--color-text-secondary); margin-bottom: 32px;">
          Fundamental haptic building blocks for UI interactions.
        </p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px;">
          \${basePatterns.map(pattern => \`
            <button style="
              padding: 20px;
              background: var(--color-background-elevated);
              border: 1px solid var(--color-border-subtle);
              border-radius: var(--radius-lg);
              cursor: pointer;
              text-align: left;
              transition: all 200ms ease;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)'"
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
              <div style="
                font-family: var(--font-mono);
                font-size: 14px;
                color: var(--persona-primary);
                margin-bottom: 8px;
              ">\${pattern.name}</div>
              <div style="
                display: flex;
                gap: 12px;
                margin-bottom: 12px;
                font-size: 12px;
                color: var(--color-text-muted);
              ">
                <span>\${pattern.duration}ms</span>
                <span>•</span>
                <span>Level \${pattern.intensity}</span>
              </div>
              <div style="font-size: 13px; color: var(--color-text-secondary);">
                \${pattern.useCase}
              </div>
            </button>
          \`).join('')}
        </div>
      </div>
    \`;
    return container;
  }
}`,...(y=(v=n.parameters)==null?void 0:v.docs)==null?void 0:y.source}}};var u,x,g;a.parameters={...a.parameters,docs:{...(u=a.parameters)==null?void 0:u.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = \`
      <div style="font-family: var(--font-body); max-width: 700px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          Organic Patterns
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Ferni's signature haptics — organic, human, breathing
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          \${organicPatterns.map(pattern => \`
            <div style="
              padding: 20px;
              background: linear-gradient(135deg, rgba(74, 103, 65, 0.08), rgba(74, 103, 65, 0.02));
              border: 1px solid var(--color-border-subtle);
              border-radius: var(--radius-xl);
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 16px;
              align-items: center;
            ">
              <div>
                <div style="
                  font-family: var(--font-mono);
                  font-weight: 600;
                  color: var(--persona-primary);
                  margin-bottom: 4px;
                ">\${pattern.name}</div>
                <div style="font-size: 14px; color: var(--color-text-secondary);">
                  \${pattern.description}
                </div>
                <div style="
                  font-size: 12px;
                  color: var(--color-text-muted);
                  margin-top: 8px;
                ">\${pattern.duration}ms duration</div>
              </div>
              <div style="
                font-size: 24px;
                letter-spacing: 4px;
                color: var(--persona-primary);
                opacity: 0.6;
              ">\${pattern.visualization}</div>
            </div>
          \`).join('')}
        </div>
      </div>
    \`;
    return container;
  }
}`,...(g=(x=a.parameters)==null?void 0:x.docs)==null?void 0:g.source}}};var f,b,h;i.parameters={...i.parameters,docs:{...(f=i.parameters)==null?void 0:f.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = \`
      <div style="font-family: var(--font-body); max-width: 900px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          Persona Haptics
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Each persona has unique haptic signatures reflecting their personality
        </p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
          \${personaHaptics.map(persona => \`
            <div style="
              padding: 24px;
              background: var(--color-background-elevated);
              border: 1px solid var(--color-border-subtle);
              border-radius: var(--radius-xl);
              border-top: 3px solid \${persona.color};
            ">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                <div style="
                  width: 40px;
                  height: 40px;
                  border-radius: 50%;
                  background: \${persona.color};
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: 600;
                ">\${persona.name[0]}</div>
                <div>
                  <div style="font-weight: 600; color: var(--color-text-primary);">\${persona.name}</div>
                  <div style="font-size: 12px; color: var(--color-text-muted);">\${persona.role}</div>
                </div>
              </div>
              
              <div style="
                font-size: 13px;
                color: var(--color-text-secondary);
                margin-bottom: 16px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--color-border-subtle);
              ">\${persona.description}</div>
              
              <div style="
                font-family: var(--font-mono);
                font-size: 12px;
                color: \${persona.color};
                margin-bottom: 12px;
              ">signature: \${persona.signature}</div>
              
              <ul style="
                margin: 0;
                padding: 0;
                list-style: none;
                font-size: 12px;
                color: var(--color-text-muted);
                display: flex;
                flex-direction: column;
                gap: 4px;
              ">
                \${persona.traits.map(trait => \`<li>• \${trait}</li>\`).join('')}
              </ul>
            </div>
          \`).join('')}
        </div>
      </div>
    \`;
    return container;
  }
}`,...(h=(b=i.parameters)==null?void 0:b.docs)==null?void 0:h.source}}};var k,$,w;s.parameters={...s.parameters,docs:{...(k=s.parameters)==null?void 0:k.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = \`
      <div style="font-family: var(--font-body); max-width: 700px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 8px; color: var(--color-text-primary);">
          Emotional Haptics
        </h2>
        <p style="color: var(--color-text-muted); font-size: 14px; margin-bottom: 32px;">
          Haptic responses to detected emotional states
        </p>
        
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          \${emotionalHaptics.map(h => \`
            <div style="
              padding: 16px;
              background: var(--color-background-elevated);
              border-radius: var(--radius-lg);
              border-left: 3px solid \${h.color};
            ">
              <div style="
                font-weight: 600;
                color: var(--color-text-primary);
                text-transform: capitalize;
                margin-bottom: 4px;
              ">\${h.emotion}</div>
              <div style="
                font-family: var(--font-mono);
                font-size: 11px;
                color: \${h.color};
                margin-bottom: 8px;
              ">\${h.pattern}</div>
              <div style="
                font-size: 13px;
                color: var(--color-text-secondary);
                font-style: italic;
              ">"\${h.character}"</div>
            </div>
          \`).join('')}
        </div>
      </div>
    \`;
    return container;
  }
}`,...(w=($=s.parameters)==null?void 0:$.docs)==null?void 0:w.source}}};var z,H,P;d.parameters={...d.parameters,docs:{...(z=d.parameters)==null?void 0:z.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = \`
      <div style="font-family: var(--font-body); max-width: 600px;">
        <h2 style="font-family: var(--font-display); margin-bottom: 24px; color: var(--color-text-primary);">
          Accessibility Guidelines
        </h2>
        
        <div style="
          padding: 20px;
          background: rgba(74, 103, 65, 0.1);
          border-radius: var(--radius-lg);
          margin-bottom: 24px;
        ">
          <h3 style="color: var(--persona-primary); margin-bottom: 12px; font-size: 16px;">
            ✓ Always Follow These Rules
          </h3>
          <ul style="margin: 0; padding-left: 20px; color: var(--color-text-secondary); line-height: 1.8;">
            <li>Never make haptics the only feedback channel</li>
            <li>Always pair with visual or audio feedback</li>
            <li>Provide option to disable all haptics</li>
            <li>Respect system mute/volume settings</li>
            <li>Check <code>prefers-reduced-motion</code> preference</li>
          </ul>
        </div>
        
        <div style="
          padding: 20px;
          background: var(--color-background-elevated);
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-border-subtle);
        ">
          <h3 style="color: var(--color-text-primary); margin-bottom: 12px; font-size: 16px;">
            Platform APIs
          </h3>
          <div style="display: grid; gap: 12px;">
            <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
              <div style="font-weight: 600; margin-bottom: 4px;">iOS</div>
              <code style="font-size: 12px; color: var(--color-text-muted);">UIImpactFeedbackGenerator, Core Haptics</code>
            </div>
            <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
              <div style="font-weight: 600; margin-bottom: 4px;">Android</div>
              <code style="font-size: 12px; color: var(--color-text-muted);">VibrationEffect, HapticFeedbackConstants</code>
            </div>
            <div style="padding: 12px; background: var(--color-background-tertiary); border-radius: var(--radius-md);">
              <div style="font-weight: 600; margin-bottom: 4px;">Web</div>
              <code style="font-size: 12px; color: var(--color-text-muted);">Navigator.vibrate() - limited support</code>
            </div>
          </div>
        </div>
      </div>
    \`;
    return container;
  }
}`,...(P=(H=d.parameters)==null?void 0:H.docs)==null?void 0:P.source}}};const j=["IntensityLevels","BasePatterns","OrganicPatterns","PersonaHaptics","EmotionalHaptics","Accessibility"];export{d as Accessibility,n as BasePatterns,s as EmotionalHaptics,o as IntensityLevels,a as OrganicPatterns,i as PersonaHaptics,j as __namedExportsOrder,I as default};
