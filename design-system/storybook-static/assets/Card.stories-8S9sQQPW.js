const U={sm:"12px",md:"16px",lg:"24px"},Y={elevated:{background:"#FFFFFF",border:"none",shadow:"0 4px 6px rgba(44, 37, 32, 0.07)"},outlined:{background:"#FFFFFF",border:"1px solid rgba(44, 37, 32, 0.1)",shadow:"none"},filled:{background:"#F5F1E8",border:"none",shadow:"none"}},p=e=>{const r=document.createElement("div"),a=e.variant||"elevated",N=e.size||"md",l=Y[a],u=U[N];return r.innerHTML=`
    <div 
      class="ferni-card ${e.clickable?"clickable":""}"
      style="
        background: ${l.background};
        border: ${l.border};
        box-shadow: ${l.shadow};
        border-radius: 12px;
        overflow: hidden;
        max-width: 400px;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        ${e.clickable?"cursor: pointer;":""}
      "
    >
      ${e.header?`
        <div style="
          padding: ${u};
          border-bottom: 1px solid rgba(44, 37, 32, 0.08);
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          font-weight: 600;
          color: #2C2520;
        ">${e.header}</div>
      `:""}
      
      ${e.body?`
        <div style="
          padding: ${u};
          font-family: Inter, system-ui, sans-serif;
          color: #5C544A;
          line-height: 1.6;
        ">${e.body}</div>
      `:""}
      
      ${e.footer?`
        <div style="
          padding: ${u};
          border-top: 1px solid rgba(44, 37, 32, 0.08);
          background: #F5F1E8;
          font-family: Inter, system-ui, sans-serif;
          font-size: 14px;
          color: #8A847A;
        ">${e.footer}</div>
      `:""}
    </div>
    
    <style>
      .ferni-card.clickable:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px rgba(44, 37, 32, 0.1) !important;
      }
    </style>
  `,r},_={title:"Components/Card",tags:["autodocs"],render:e=>p(e),argTypes:{variant:{control:{type:"select"},options:["elevated","outlined","filled"]},size:{control:{type:"select"},options:["sm","md","lg"]},clickable:{control:"boolean"}}},t={args:{variant:"elevated",header:"Card Title",body:"This is an elevated card with a subtle shadow. It provides visual hierarchy and separates content from the background."}},n={args:{variant:"outlined",header:"Card Title",body:"This is an outlined card with a border instead of a shadow. Good for secondary content."}},o={args:{variant:"filled",header:"Card Title",body:"This is a filled card with a subtle background. Great for grouping related content."}},s={args:{variant:"elevated",header:"Session Summary",body:"You talked about your goals for the week and made progress on your morning routine habit.",footer:"Last updated 2 hours ago"}},d={args:{variant:"elevated",header:"Click Me",body:"This card has a hover effect and cursor pointer, indicating it's interactive.",clickable:!0}},i={render:()=>{const e=document.createElement("div");return e.style.cssText="display: flex; gap: 24px; flex-wrap: wrap;",["elevated","outlined","filled"].forEach(a=>{e.appendChild(p({variant:a,header:`${a.charAt(0).toUpperCase()+a.slice(1)} Card`,body:`This is an example of the ${a} card variant.`}))}),e}},c={render:()=>{const e=document.createElement("div");return e.style.cssText="display: flex; flex-direction: column; gap: 24px;",["sm","md","lg"].forEach(a=>{e.appendChild(p({size:a,header:`Size: ${a.toUpperCase()}`,body:"Notice the different padding for each size variant."}))}),e}};var h,m,g;t.parameters={...t.parameters,docs:{...(h=t.parameters)==null?void 0:h.docs,source:{originalSource:`{
  args: {
    variant: 'elevated',
    header: 'Card Title',
    body: 'This is an elevated card with a subtle shadow. It provides visual hierarchy and separates content from the background.'
  }
}`,...(g=(m=t.parameters)==null?void 0:m.docs)==null?void 0:g.source}}};var f,b,v;n.parameters={...n.parameters,docs:{...(f=n.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    variant: 'outlined',
    header: 'Card Title',
    body: 'This is an outlined card with a border instead of a shadow. Good for secondary content.'
  }
}`,...(v=(b=n.parameters)==null?void 0:b.docs)==null?void 0:v.source}}};var y,x,C;o.parameters={...o.parameters,docs:{...(y=o.parameters)==null?void 0:y.docs,source:{originalSource:`{
  args: {
    variant: 'filled',
    header: 'Card Title',
    body: 'This is a filled card with a subtle background. Great for grouping related content.'
  }
}`,...(C=(x=o.parameters)==null?void 0:x.docs)==null?void 0:C.source}}};var k,w,T;s.parameters={...s.parameters,docs:{...(k=s.parameters)==null?void 0:k.docs,source:{originalSource:`{
  args: {
    variant: 'elevated',
    header: 'Session Summary',
    body: 'You talked about your goals for the week and made progress on your morning routine habit.',
    footer: 'Last updated 2 hours ago'
  }
}`,...(T=(w=s.parameters)==null?void 0:w.docs)==null?void 0:T.source}}};var F,S,$;d.parameters={...d.parameters,docs:{...(F=d.parameters)==null?void 0:F.docs,source:{originalSource:`{
  args: {
    variant: 'elevated',
    header: 'Click Me',
    body: 'This card has a hover effect and cursor pointer, indicating it\\'s interactive.',
    clickable: true
  }
}`,...($=(S=d.parameters)==null?void 0:S.docs)==null?void 0:$.source}}};var z,E,A;i.parameters={...i.parameters,docs:{...(z=i.parameters)==null?void 0:z.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 24px; flex-wrap: wrap;';
    const variants: Array<'elevated' | 'outlined' | 'filled'> = ['elevated', 'outlined', 'filled'];
    variants.forEach(variant => {
      container.appendChild(createCard({
        variant,
        header: \`\${variant.charAt(0).toUpperCase() + variant.slice(1)} Card\`,
        body: \`This is an example of the \${variant} card variant.\`
      }));
    });
    return container;
  }
}`,...(A=(E=i.parameters)==null?void 0:E.docs)==null?void 0:A.source}}};var I,G,L;c.parameters={...c.parameters,docs:{...(I=c.parameters)==null?void 0:I.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 24px;';
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    sizes.forEach(size => {
      container.appendChild(createCard({
        size,
        header: \`Size: \${size.toUpperCase()}\`,
        body: 'Notice the different padding for each size variant.'
      }));
    });
    return container;
  }
}`,...(L=(G=c.parameters)==null?void 0:G.docs)==null?void 0:L.source}}};const M=["Elevated","Outlined","Filled","WithFooter","Clickable","AllVariants","Sizes"];export{i as AllVariants,d as Clickable,t as Elevated,o as Filled,n as Outlined,c as Sizes,s as WithFooter,M as __namedExportsOrder,_ as default};
