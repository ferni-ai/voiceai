const P=e=>{const n=document.createElement("div");n.style.cssText="padding: 80px; display: flex; justify-content: center;";const o=document.createElement("button");o.textContent="Hover me",o.style.cssText=`
    padding: 12px 24px;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: white;
    background: #4a6741;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
  `;const t=document.createElement("div");switch(t.textContent=e.content,t.style.cssText=`
    position: absolute;
    padding: 8px 12px;
    font-family: Inter, system-ui, sans-serif;
    font-size: 13px;
    color: #FFFCF8;
    background: #2C2520;
    border-radius: 8px;
    box-shadow: 0 10px 15px rgba(44, 37, 32, 0.15);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease, transform 0.15s ease;
    z-index: 1000;
  `,e.position||"top"){case"top":t.style.bottom="100%",t.style.left="50%",t.style.transform="translateX(-50%) translateY(-8px)";break;case"bottom":t.style.top="100%",t.style.left="50%",t.style.transform="translateX(-50%) translateY(8px)";break;case"left":t.style.right="100%",t.style.top="50%",t.style.transform="translateY(-50%) translateX(-8px)";break;case"right":t.style.left="100%",t.style.top="50%",t.style.transform="translateY(-50%) translateX(8px)";break}return o.appendChild(t),o.addEventListener("mouseenter",()=>{t.style.opacity="1"}),o.addEventListener("mouseleave",()=>{t.style.opacity="0"}),n.appendChild(o),n},X={title:"Components/Tooltip",tags:["autodocs"],render:e=>P(e),argTypes:{position:{control:{type:"select"},options:["top","bottom","left","right"]}}},s={args:{content:"Tooltip on top",position:"top"}},r={args:{content:"Tooltip on bottom",position:"bottom"}},a={args:{content:"Tooltip on left",position:"left"}},i={args:{content:"Tooltip on right",position:"right"}},p={render:()=>{const e=document.createElement("div");return e.style.cssText=`
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      padding: 40px;
    `,["top","bottom","left","right"].forEach(o=>{const t=P({content:`Position: ${o}`,position:o});t.style.padding="60px",e.appendChild(t)}),e}},c={args:{content:"This is a longer tooltip with more content that might wrap to multiple lines",position:"top"}};var l,d,m;s.parameters={...s.parameters,docs:{...(l=s.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    content: 'Tooltip on top',
    position: 'top'
  }
}`,...(m=(d=s.parameters)==null?void 0:d.docs)==null?void 0:m.source}}};var g,u,y;r.parameters={...r.parameters,docs:{...(g=r.parameters)==null?void 0:g.docs,source:{originalSource:`{
  args: {
    content: 'Tooltip on bottom',
    position: 'bottom'
  }
}`,...(y=(u=r.parameters)==null?void 0:u.docs)==null?void 0:y.source}}};var f,x,h;a.parameters={...a.parameters,docs:{...(f=a.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    content: 'Tooltip on left',
    position: 'left'
  }
}`,...(h=(x=a.parameters)==null?void 0:x.docs)==null?void 0:h.source}}};var b,T,C;i.parameters={...i.parameters,docs:{...(b=i.parameters)==null?void 0:b.docs,source:{originalSource:`{
  args: {
    content: 'Tooltip on right',
    position: 'right'
  }
}`,...(C=(T=i.parameters)==null?void 0:T.docs)==null?void 0:C.source}}};var v,w,E;p.parameters={...p.parameters,docs:{...(v=p.parameters)==null?void 0:v.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = \`
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      padding: 40px;
    \`;
    const positions: Array<'top' | 'bottom' | 'left' | 'right'> = ['top', 'bottom', 'left', 'right'];
    positions.forEach(position => {
      const demo = createTooltipDemo({
        content: \`Position: \${position}\`,
        position
      });
      demo.style.padding = '60px';
      container.appendChild(demo);
    });
    return container;
  }
}`,...(E=(w=p.parameters)==null?void 0:w.docs)==null?void 0:E.source}}};var k,S,L;c.parameters={...c.parameters,docs:{...(k=c.parameters)==null?void 0:k.docs,source:{originalSource:`{
  args: {
    content: 'This is a longer tooltip with more content that might wrap to multiple lines',
    position: 'top'
  }
}`,...(L=(S=c.parameters)==null?void 0:S.docs)==null?void 0:L.source}}};const Y=["Top","Bottom","Left","Right","AllPositions","LongContent"];export{p as AllPositions,r as Bottom,a as Left,c as LongContent,i as Right,s as Top,Y as __namedExportsOrder,X as default};
