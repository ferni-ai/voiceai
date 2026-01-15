const _={sm:{padding:"2px 8px",fontSize:"11px",dotSize:"6px"},md:{padding:"4px 10px",fontSize:"12px",dotSize:"8px"},lg:{padding:"6px 12px",fontSize:"13px",dotSize:"10px"}},k={default:{bg:"#F5F1E8",text:"#5C544A",dot:"#8A847A"},success:{bg:"rgba(74, 103, 65, 0.1)",text:"#4a6741",dot:"#4a6741"},warning:{bg:"rgba(160, 128, 84, 0.1)",text:"#a08054",dot:"#a08054"},error:{bg:"rgba(160, 84, 84, 0.1)",text:"#a05454",dot:"#a05454"},info:{bg:"rgba(84, 96, 128, 0.1)",text:"#546080",dot:"#546080"}},u=e=>{const r=document.createElement("div"),t=e.size||"md",U=e.variant||"default",a=_[t],l=k[U];return r.innerHTML=`
    <span style="
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: ${a.padding};
      font-family: Inter, system-ui, sans-serif;
      font-size: ${a.fontSize};
      font-weight: 500;
      color: ${l.text};
      background: ${l.bg};
      border-radius: 9999px;
      white-space: nowrap;
    ">
      ${e.dot?`
        <span style="
          width: ${a.dotSize};
          height: ${a.dotSize};
          border-radius: 50%;
          background: ${l.dot};
          ${e.pulse?"animation: pulse 2s ease-in-out infinite;":""}
        "></span>
      `:""}
      ${e.text}
    </span>
    
    ${e.pulse?`
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
      </style>
    `:""}
  `,r},F={title:"Components/Badge",tags:["autodocs"],render:e=>u(e),argTypes:{variant:{control:{type:"select"},options:["default","success","warning","error","info"]},size:{control:{type:"select"},options:["sm","md","lg"]},dot:{control:"boolean"},pulse:{control:"boolean"}}},n={args:{text:"Badge",variant:"default"}},s={args:{text:"Active",variant:"success",dot:!0}},o={args:{text:"Pending",variant:"warning",dot:!0}},c={args:{text:"Offline",variant:"error",dot:!0}},i={args:{text:"Live",variant:"success",dot:!0,pulse:!0}},d={render:()=>{const e=document.createElement("div");return e.style.cssText="display: flex; gap: 12px; flex-wrap: wrap;",["default","success","warning","error","info"].forEach(t=>{e.appendChild(u({text:t.charAt(0).toUpperCase()+t.slice(1),variant:t,dot:!0}))}),e}},p={render:()=>{const e=document.createElement("div");return e.style.cssText="display: flex; gap: 12px; align-items: center;",["sm","md","lg"].forEach(t=>{e.appendChild(u({text:t.toUpperCase(),variant:"success",size:t}))}),e}};var g,m,x;n.parameters={...n.parameters,docs:{...(g=n.parameters)==null?void 0:g.docs,source:{originalSource:`{
  args: {
    text: 'Badge',
    variant: 'default'
  }
}`,...(x=(m=n.parameters)==null?void 0:m.docs)==null?void 0:x.source}}};var f,v,y;s.parameters={...s.parameters,docs:{...(f=s.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    text: 'Active',
    variant: 'success',
    dot: true
  }
}`,...(y=(v=s.parameters)==null?void 0:v.docs)==null?void 0:y.source}}};var z,S,b;o.parameters={...o.parameters,docs:{...(z=o.parameters)==null?void 0:z.docs,source:{originalSource:`{
  args: {
    text: 'Pending',
    variant: 'warning',
    dot: true
  }
}`,...(b=(S=o.parameters)==null?void 0:S.docs)==null?void 0:b.source}}};var h,w,E;c.parameters={...c.parameters,docs:{...(h=c.parameters)==null?void 0:h.docs,source:{originalSource:`{
  args: {
    text: 'Offline',
    variant: 'error',
    dot: true
  }
}`,...(E=(w=c.parameters)==null?void 0:w.docs)==null?void 0:E.source}}};var A,C,$;i.parameters={...i.parameters,docs:{...(A=i.parameters)==null?void 0:A.docs,source:{originalSource:`{
  args: {
    text: 'Live',
    variant: 'success',
    dot: true,
    pulse: true
  }
}`,...($=(C=i.parameters)==null?void 0:C.docs)==null?void 0:$.source}}};var T,B,O;d.parameters={...d.parameters,docs:{...(T=d.parameters)==null?void 0:T.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap;';
    const variants: Array<'default' | 'success' | 'warning' | 'error' | 'info'> = ['default', 'success', 'warning', 'error', 'info'];
    variants.forEach(variant => {
      container.appendChild(createBadge({
        text: variant.charAt(0).toUpperCase() + variant.slice(1),
        variant,
        dot: true
      }));
    });
    return container;
  }
}`,...(O=(B=d.parameters)==null?void 0:B.docs)==null?void 0:O.source}}};var I,L,P;p.parameters={...p.parameters,docs:{...(I=p.parameters)==null?void 0:I.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 12px; align-items: center;';
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    sizes.forEach(size => {
      container.appendChild(createBadge({
        text: size.toUpperCase(),
        variant: 'success',
        size
      }));
    });
    return container;
  }
}`,...(P=(L=p.parameters)==null?void 0:L.docs)==null?void 0:P.source}}};const V=["Default","Success","Warning","Error","Pulsing","AllVariants","Sizes"];export{d as AllVariants,n as Default,c as Error,i as Pulsing,p as Sizes,s as Success,o as Warning,V as __namedExportsOrder,F as default};
