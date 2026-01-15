const c={connection:`<svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="25" cy="40" r="20" fill="var(--persona-tint, rgba(74, 103, 65, 0.1))" stroke="var(--persona-primary, #4a6741)" stroke-width="2"/>
    <circle cx="95" cy="40" r="20" fill="var(--persona-tint, rgba(74, 103, 65, 0.1))" stroke="var(--persona-primary, #4a6741)" stroke-width="2" stroke-dasharray="4 4"/>
    <path d="M45 40 L75 40" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="2" stroke-dasharray="4 4"/>
    <circle cx="48" cy="40" r="2" fill="var(--persona-primary, #4a6741)"/>
    <circle cx="56" cy="40" r="2" fill="var(--persona-primary, #4a6741)" opacity="0.7"/>
    <circle cx="64" cy="40" r="2" fill="var(--persona-primary, #4a6741)" opacity="0.4"/>
    <circle cx="72" cy="40" r="2" fill="var(--persona-primary, #4a6741)" opacity="0.2"/>
  </svg>`,team:`<svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="60" cy="40" r="24" fill="var(--persona-primary, #4a6741)" opacity="0.9"/>
    <circle cx="28" cy="40" r="16" fill="var(--color-text-muted, #9a8b7a)" opacity="0.2" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="1" stroke-dasharray="4 4"/>
    <circle cx="92" cy="40" r="16" fill="var(--color-text-muted, #9a8b7a)" opacity="0.2" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="1" stroke-dasharray="4 4"/>
    <circle cx="44" cy="20" r="12" fill="var(--color-text-muted, #9a8b7a)" opacity="0.15" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="1" stroke-dasharray="4 4"/>
    <circle cx="76" cy="20" r="12" fill="var(--color-text-muted, #9a8b7a)" opacity="0.15" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="60" y="45" text-anchor="middle" fill="white" font-size="14" font-weight="600">F</text>
  </svg>`,path:`<svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 70 Q40 50 60 50 Q80 50 110 30" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="2" stroke-dasharray="6 4" fill="none"/>
    <circle cx="10" cy="70" r="6" fill="var(--persona-primary, #4a6741)"/>
    <circle cx="60" cy="50" r="4" fill="var(--color-text-muted, #9a8b7a)" opacity="0.5"/>
    <circle cx="110" cy="30" r="4" fill="var(--color-text-muted, #9a8b7a)" opacity="0.3" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="1" stroke-dasharray="2 2"/>
  </svg>`,star:`<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M40 10 L46 30 L68 30 L50 44 L56 65 L40 52 L24 65 L30 44 L12 30 L34 30 Z" fill="var(--color-text-muted, #9a8b7a)" opacity="0.15" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="2" stroke-dasharray="4 4"/>
  </svg>`,search:`<svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="35" cy="35" r="20" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="3" fill="none"/>
    <line x1="50" y1="50" x2="65" y2="65" stroke="var(--color-text-muted, #9a8b7a)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="35" cy="35" r="8" fill="var(--persona-tint, rgba(74, 103, 65, 0.1))"/>
    <path d="M30 32 Q35 28 40 32" stroke="var(--persona-primary, #4a6741)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <circle cx="31" cy="33" r="1.5" fill="var(--persona-primary, #4a6741)"/>
    <circle cx="39" cy="33" r="1.5" fill="var(--persona-primary, #4a6741)"/>
  </svg>`},R=e=>{const n=document.createElement("div"),L=c[e.illustration]||c.connection;return n.innerHTML=`
    <div class="ferni-empty-state" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-12, 48px) var(--space-6, 24px);
      max-width: 400px;
      margin: 0 auto;
      animation: emptyStateFadeIn 0.5s ease-out;
    ">
      <div class="illustration" style="
        margin-bottom: var(--space-6, 24px);
        animation: illustrationFloat 4s ease-in-out infinite;
      ">
        ${L}
      </div>
      
      ${e.eyebrow?`
        <span class="eyebrow" style="
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--persona-primary, #4a6741);
          margin-bottom: var(--space-2, 8px);
        ">${e.eyebrow}</span>
      `:""}
      
      <h2 style="
        font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 var(--space-3, 12px);
        line-height: 1.3;
      ">${e.headline}</h2>
      
      <p style="
        font-family: var(--font-body, Inter, system-ui);
        font-size: 1rem;
        color: var(--color-text-secondary, #5a4d43);
        line-height: 1.6;
        margin: 0 0 var(--space-6, 24px);
        max-width: 320px;
      ">${e.body}</p>
      
      <div class="actions" style="display: flex; flex-direction: column; gap: var(--space-3, 12px); align-items: center;">
        ${e.primaryAction?`
          <button class="primary-cta" style="
            background: var(--persona-primary, #4a6741);
            color: white;
            border: none;
            padding: var(--space-3, 12px) var(--space-6, 24px);
            border-radius: var(--radius-lg, 12px);
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: var(--space-2, 8px);
          ">
            ${e.primaryAction}
          </button>
        `:""}
        
        ${e.secondaryAction?`
          <button class="secondary-cta" style="
            background: transparent;
            color: var(--color-text-secondary, #5a4d43);
            border: none;
            padding: var(--space-2, 8px);
            font-size: 0.875rem;
            cursor: pointer;
            transition: color 0.2s ease;
            display: flex;
            align-items: center;
            gap: var(--space-1, 4px);
          ">
            ${e.secondaryAction}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        `:""}
      </div>
    </div>
    
    <style>
      @keyframes emptyStateFadeIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @keyframes illustrationFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }
      
      .primary-cta:hover {
        filter: brightness(1.1);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px var(--persona-glow, rgba(74, 103, 65, 0.3));
      }
      
      .secondary-cta:hover {
        color: var(--persona-primary, #4a6741);
      }
    </style>
  `,n},T={title:"Patterns/Empty States",tags:["autodocs"],render:e=>R(e),parameters:{layout:"centered",docs:{description:{component:"Empty states for first-time users and empty collections. Based on Ferni's brand voice: warm, inviting, never blaming."}}}},t={args:{type:"first-time",illustration:"connection",eyebrow:"YOUR JOURNEY",headline:"Every great friendship starts somewhere.",body:"We're here whenever you're ready to talk. No pressure, no judgment—just a voice that listens.",primaryAction:"Start a Conversation"}},r={args:{type:"first-time",illustration:"team",eyebrow:"YOUR TEAM",headline:"Meet Ferni first.",body:"As we get to know each other, more specialists will join your team. It's not about gatekeeping—it's about building a relationship that matters.",primaryAction:"Talk to Ferni",secondaryAction:"Learn about the team"}},a={args:{type:"first-time",illustration:"path",eyebrow:"YOUR PROGRESS",headline:"The path is waiting.",body:"After a few conversations, we'll start to see patterns—the growth, the wins, the moments that matter. For now, just talk.",primaryAction:"Start Your Journey"}},o={args:{type:"collection",illustration:"star",headline:"We're watching for wins.",body:"Every time you follow through, show courage, or take care of yourself, we'll celebrate. The first win is just a conversation away."}},s={args:{type:"search",illustration:"search",headline:"Nothing quite matched that.",body:"Try different words, or browse instead.",primaryAction:"Clear Search",secondaryAction:"Browse All"}},i={args:{type:"collection",headline:"All caught up.",body:"When something matters, we'll let you know."}};var l,p,d;t.parameters={...t.parameters,docs:{...(l=t.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    type: 'first-time',
    illustration: 'connection',
    eyebrow: 'YOUR JOURNEY',
    headline: 'Every great friendship starts somewhere.',
    body: 'We\\'re here whenever you\\'re ready to talk. No pressure, no judgment—just a voice that listens.',
    primaryAction: 'Start a Conversation'
  }
}`,...(d=(p=t.parameters)==null?void 0:p.docs)==null?void 0:d.source}}};var y,m,h;r.parameters={...r.parameters,docs:{...(y=r.parameters)==null?void 0:y.docs,source:{originalSource:`{
  args: {
    type: 'first-time',
    illustration: 'team',
    eyebrow: 'YOUR TEAM',
    headline: 'Meet Ferni first.',
    body: 'As we get to know each other, more specialists will join your team. It\\'s not about gatekeeping—it\\'s about building a relationship that matters.',
    primaryAction: 'Talk to Ferni',
    secondaryAction: 'Learn about the team'
  }
}`,...(h=(m=r.parameters)==null?void 0:m.docs)==null?void 0:h.source}}};var u,g,w;a.parameters={...a.parameters,docs:{...(u=a.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    type: 'first-time',
    illustration: 'path',
    eyebrow: 'YOUR PROGRESS',
    headline: 'The path is waiting.',
    body: 'After a few conversations, we\\'ll start to see patterns—the growth, the wins, the moments that matter. For now, just talk.',
    primaryAction: 'Start Your Journey'
  }
}`,...(w=(g=a.parameters)==null?void 0:g.docs)==null?void 0:w.source}}};var v,f,x;o.parameters={...o.parameters,docs:{...(v=o.parameters)==null?void 0:v.docs,source:{originalSource:`{
  args: {
    type: 'collection',
    illustration: 'star',
    headline: 'We\\'re watching for wins.',
    body: 'Every time you follow through, show courage, or take care of yourself, we\\'ll celebrate. The first win is just a conversation away.'
  }
}`,...(x=(f=o.parameters)==null?void 0:f.docs)==null?void 0:x.source}}};var b,k,A;s.parameters={...s.parameters,docs:{...(b=s.parameters)==null?void 0:b.docs,source:{originalSource:`{
  args: {
    type: 'search',
    illustration: 'search',
    headline: 'Nothing quite matched that.',
    body: 'Try different words, or browse instead.',
    primaryAction: 'Clear Search',
    secondaryAction: 'Browse All'
  }
}`,...(A=(k=s.parameters)==null?void 0:k.docs)==null?void 0:A.source}}};var S,Y,E;i.parameters={...i.parameters,docs:{...(S=i.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    type: 'collection',
    headline: 'All caught up.',
    body: 'When something matters, we\\'ll let you know.'
  }
}`,...(E=(Y=i.parameters)==null?void 0:Y.docs)==null?void 0:E.source}}};const F=["FirstConversation","MeetTeam","YourProgress","NoWinsYet","NoSearchResults","AllCaughtUp"];export{i as AllCaughtUp,t as FirstConversation,r as MeetTeam,s as NoSearchResults,o as NoWinsYet,a as YourProgress,F as __namedExportsOrder,T as default};
