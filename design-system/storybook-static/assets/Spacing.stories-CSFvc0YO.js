const l={0:"0px",px:"1px","0.5":"2px",1:"4px","1.5":"6px",2:"8px","2.5":"10px",3:"12px","3.5":"14px",4:"16px",5:"20px",6:"24px",7:"28px",8:"32px",9:"36px",10:"40px",11:"44px",12:"48px",14:"56px",16:"64px",20:"80px",24:"96px",28:"112px",32:"128px"},v={breath:"4px",whisper:"8px",pause:"16px",rest:"24px",silence:"32px",meditation:"48px",vastness:"64px"},m=()=>{const e=document.createElement("div");return e.innerHTML=`
    <div style="padding: var(--space-8); max-width: 800px;">
      <h2 style="
        font-family: var(--font-display);
        font-size: 1.5rem;
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2);
      ">Spacing Scale</h2>
      <p style="
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-6);
      ">Base unit: 4px. Use var(--space-*) for consistent spacing.</p>
      
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        ${Object.entries(l).map(([r,a])=>`
          <div style="display: flex; align-items: center; gap: var(--space-4);">
            <code style="
              width: 80px;
              font-family: var(--font-mono);
              font-size: 0.75rem;
              color: var(--color-text-muted);
            ">--space-${r}</code>
            <div style="
              width: ${a};
              height: 24px;
              background: var(--persona-primary);
              border-radius: 2px;
            "></div>
            <span style="
              font-size: 0.75rem;
              color: var(--color-text-muted);
            ">${a}</span>
          </div>
        `).join("")}
      </div>
      
      <h3 style="
        font-family: var(--font-display);
        font-size: 1.25rem;
        color: var(--color-text-primary);
        margin: var(--space-10) 0 var(--space-2);
      ">Ma Spacing (Japanese Concept)</h3>
      <p style="
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-6);
      ">Semantic spacing based on the Japanese concept of "Ma" (間) - the space between things.</p>
      
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        ${Object.entries(v).map(([r,a])=>`
          <div style="display: flex; align-items: center; gap: var(--space-4);">
            <code style="
              width: 120px;
              font-family: var(--font-mono);
              font-size: 0.75rem;
              color: var(--color-text-muted);
            ">--ma-${r}</code>
            <div style="
              width: ${a};
              height: 24px;
              background: linear-gradient(90deg, var(--persona-primary), var(--persona-secondary));
              border-radius: 2px;
            "></div>
            <span style="
              font-size: 0.75rem;
              color: var(--color-text-muted);
            ">${a}</span>
            <span style="
              font-size: 0.75rem;
              color: var(--color-text-dimmed);
              font-style: italic;
            ">${r==="breath"?"Minimal separation":r==="whisper"?"Subtle separation":r==="pause"?"Clear separation":r==="rest"?"Comfortable spacing":r==="silence"?"Section spacing":r==="meditation"?"Major section spacing":"Page-level spacing"}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `,e},x={title:"Tokens/Spacing",tags:["autodocs"],parameters:{layout:"fullscreen"}},n={render:()=>m()},o={render:()=>{const e=document.createElement("div");return e.innerHTML=`
      <div style="padding: var(--space-8); max-width: 400px;">
        <div style="
          background: var(--color-background-elevated);
          border-radius: var(--radius-xl);
          padding: var(--space-6);
          box-shadow: var(--shadow-lg);
        ">
          <h3 style="
            font-family: var(--font-display);
            font-size: 1.25rem;
            color: var(--color-text-primary);
            margin: 0 0 var(--space-2);
          ">Card Title</h3>
          
          <p style="
            color: var(--color-text-secondary);
            margin: 0 0 var(--space-4);
            line-height: 1.5;
          ">This card demonstrates proper spacing hierarchy using design tokens.</p>
          
          <div style="
            display: flex;
            gap: var(--space-3);
          ">
            <button style="
              background: var(--persona-primary);
              color: white;
              border: none;
              padding: var(--space-2) var(--space-4);
              border-radius: var(--radius-md);
              cursor: pointer;
            ">Primary</button>
            <button style="
              background: transparent;
              color: var(--color-text-secondary);
              border: 1px solid var(--color-border-medium);
              padding: var(--space-2) var(--space-4);
              border-radius: var(--radius-md);
              cursor: pointer;
            ">Secondary</button>
          </div>
        </div>
      </div>
    `,e}};var t,s,i;n.parameters={...n.parameters,docs:{...(t=n.parameters)==null?void 0:t.docs,source:{originalSource:`{
  render: () => createSpacingDemo()
}`,...(i=(s=n.parameters)==null?void 0:s.docs)==null?void 0:i.source}}};var p,c,d;o.parameters={...o.parameters,docs:{...(p=o.parameters)==null?void 0:p.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.innerHTML = \`
      <div style="padding: var(--space-8); max-width: 400px;">
        <div style="
          background: var(--color-background-elevated);
          border-radius: var(--radius-xl);
          padding: var(--space-6);
          box-shadow: var(--shadow-lg);
        ">
          <h3 style="
            font-family: var(--font-display);
            font-size: 1.25rem;
            color: var(--color-text-primary);
            margin: 0 0 var(--space-2);
          ">Card Title</h3>
          
          <p style="
            color: var(--color-text-secondary);
            margin: 0 0 var(--space-4);
            line-height: 1.5;
          ">This card demonstrates proper spacing hierarchy using design tokens.</p>
          
          <div style="
            display: flex;
            gap: var(--space-3);
          ">
            <button style="
              background: var(--persona-primary);
              color: white;
              border: none;
              padding: var(--space-2) var(--space-4);
              border-radius: var(--radius-md);
              cursor: pointer;
            ">Primary</button>
            <button style="
              background: transparent;
              color: var(--color-text-secondary);
              border: 1px solid var(--color-border-medium);
              padding: var(--space-2) var(--space-4);
              border-radius: var(--radius-md);
              cursor: pointer;
            ">Secondary</button>
          </div>
        </div>
      </div>
    \`;
    return container;
  }
}`,...(d=(c=o.parameters)==null?void 0:c.docs)==null?void 0:d.source}}};const g=["SpacingScale","SpacingInContext"];export{o as SpacingInContext,n as SpacingScale,g as __namedExportsOrder,x as default};
