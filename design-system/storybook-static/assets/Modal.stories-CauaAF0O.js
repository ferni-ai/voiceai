const v=e=>{const s=document.createElement("div");return s.innerHTML=`
    <div class="ferni-modal-overlay" style="
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(44, 37, 32, 0.4);
      backdrop-filter: blur(20px);
      z-index: 100;
    ">
      <div class="ferni-modal-card" style="
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
        padding: var(--space-6, 24px);
        max-width: ${e.size==="sm"?"320px":e.size==="lg"?"600px":"480px"};
        width: 90vw;
        position: relative;
        animation: modalFadeIn 0.3s ease-out;
      ">
        ${e.showClose?`
          <button style="
            position: absolute;
            top: var(--space-4, 16px);
            right: var(--space-4, 16px);
            background: none;
            border: none;
            cursor: pointer;
            padding: var(--space-2, 8px);
            border-radius: var(--radius-full, 9999px);
            color: var(--color-text-muted, #9a8b7a);
            transition: all 0.2s;
          " aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        `:""}
        
        <header style="margin-bottom: var(--space-4, 16px);">
          ${e.eyebrow?`
            <span style="
              font-size: 0.75rem;
              font-weight: 600;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              color: var(--persona-primary, #4a6741);
            ">${e.eyebrow}</span>
          `:""}
          <h2 style="
            font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--color-text-primary, #2C2520);
            margin: var(--space-1, 4px) 0 0;
          ">${e.title}</h2>
        </header>
        
        <div style="
          color: var(--color-text-secondary, #5a4d43);
          font-family: var(--font-body, Inter, system-ui);
          line-height: 1.6;
        ">
          ${e.content}
        </div>
        
        <footer style="
          margin-top: var(--space-6, 24px);
          display: flex;
          gap: var(--space-3, 12px);
          justify-content: flex-end;
        ">
          <button class="ferni-button-secondary" style="
            padding: var(--space-2, 8px) var(--space-4, 16px);
            border-radius: var(--radius-lg, 12px);
            border: 1px solid var(--color-border, #e8e0d8);
            background: transparent;
            color: var(--color-text-secondary, #5a4d43);
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          ">Cancel</button>
          <button class="ferni-button-primary" style="
            padding: var(--space-2, 8px) var(--space-4, 16px);
            border-radius: var(--radius-lg, 12px);
            border: none;
            background: var(--persona-primary, #4a6741);
            color: white;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          ">Confirm</button>
        </footer>
      </div>
    </div>
    
    <style>
      @keyframes modalFadeIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      
      .ferni-button-primary:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }
      
      .ferni-button-secondary:hover {
        background: var(--color-background-muted, #f5f1eb);
      }
    </style>
  `,s},x={title:"Components/Modal",tags:["autodocs"],render:e=>v(e),argTypes:{title:{control:"text"},eyebrow:{control:"text"},content:{control:"text"},showClose:{control:"boolean"},size:{control:{type:"select"},options:["sm","md","lg"]}}},r={args:{title:"Confirm action",eyebrow:"YOUR JOURNEY",content:"Are you sure you want to proceed? This action will update your preferences.",showClose:!0,size:"md"}},t={args:{title:"Quick confirm",content:"Continue with this action?",showClose:!1,size:"sm"}},o={args:{title:"Privacy Settings",eyebrow:"YOUR DATA",content:`
      <p style="margin-bottom: 1rem;">We take your privacy seriously. Here's what we store and why:</p>
      <ul style="list-style: disc; padding-left: 1.5rem; margin-bottom: 1rem;">
        <li>Conversation history - to remember our talks</li>
        <li>Preferences - to personalize your experience</li>
        <li>Progress data - to track your growth journey</li>
      </ul>
      <p>You can export or delete your data at any time from Settings.</p>
    `,showClose:!0,size:"lg"}},a={args:{title:"Meet Maya Santos",eyebrow:"TEAM MEMBER UNLOCKED",content:`
      <div style="text-align: center; padding: 1rem 0;">
        <div style="
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--color-maya-primary, #a67a6a), var(--color-maya-secondary, #8a635a));
          margin: 0 auto 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        ">🌱</div>
        <p style="font-weight: 500; margin-bottom: 0.5rem;">Maya Santos - Habit Coach</p>
        <p style="color: var(--color-text-muted);">Specializes in building sustainable daily routines.</p>
      </div>
    `,showClose:!0,size:"md"}};var n,i,l;r.parameters={...r.parameters,docs:{...(n=r.parameters)==null?void 0:n.docs,source:{originalSource:`{
  args: {
    title: 'Confirm action',
    eyebrow: 'YOUR JOURNEY',
    content: 'Are you sure you want to proceed? This action will update your preferences.',
    showClose: true,
    size: 'md'
  }
}`,...(l=(i=r.parameters)==null?void 0:i.docs)==null?void 0:l.source}}};var c,d,p;t.parameters={...t.parameters,docs:{...(c=t.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    title: 'Quick confirm',
    content: 'Continue with this action?',
    showClose: false,
    size: 'sm'
  }
}`,...(p=(d=t.parameters)==null?void 0:d.docs)==null?void 0:p.source}}};var u,m,y;o.parameters={...o.parameters,docs:{...(u=o.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    title: 'Privacy Settings',
    eyebrow: 'YOUR DATA',
    content: \`
      <p style="margin-bottom: 1rem;">We take your privacy seriously. Here's what we store and why:</p>
      <ul style="list-style: disc; padding-left: 1.5rem; margin-bottom: 1rem;">
        <li>Conversation history - to remember our talks</li>
        <li>Preferences - to personalize your experience</li>
        <li>Progress data - to track your growth journey</li>
      </ul>
      <p>You can export or delete your data at any time from Settings.</p>
    \`,
    showClose: true,
    size: 'lg'
  }
}`,...(y=(m=o.parameters)==null?void 0:m.docs)==null?void 0:y.source}}};var g,b,f;a.parameters={...a.parameters,docs:{...(g=a.parameters)==null?void 0:g.docs,source:{originalSource:`{
  args: {
    title: 'Meet Maya Santos',
    eyebrow: 'TEAM MEMBER UNLOCKED',
    content: \`
      <div style="text-align: center; padding: 1rem 0;">
        <div style="
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--color-maya-primary, #a67a6a), var(--color-maya-secondary, #8a635a));
          margin: 0 auto 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        ">🌱</div>
        <p style="font-weight: 500; margin-bottom: 0.5rem;">Maya Santos - Habit Coach</p>
        <p style="color: var(--color-text-muted);">Specializes in building sustainable daily routines.</p>
      </div>
    \`,
    showClose: true,
    size: 'md'
  }
}`,...(f=(b=a.parameters)==null?void 0:b.docs)==null?void 0:f.source}}};const h=["Default","SmallModal","LargeModal","TeamUnlock"];export{r as Default,o as LargeModal,t as SmallModal,a as TeamUnlock,h as __namedExportsOrder,x as default};
